-- Penger: andeler per økt, månedsregninger.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount int not null check (amount >= 0),
  status text not null default 'open'
    check (status in ('open', 'notified', 'claimed', 'confirmed', 'waived')),
  notified_at timestamptz,
  claimed_at timestamptz,
  confirmed_at timestamptz,
  external_ref text,               -- plass til Vipps-referanse når det kommer
  created_at timestamptz not null default now(),
  unique (profile_id, period)
);

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount >= 0),
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, profile_id)
);
create index charges_invoice_idx on public.charges (invoice_id);
create index charges_profile_idx on public.charges (profile_id);

alter table public.invoices enable row level security;
alter table public.charges enable row level security;

create policy "invoices: egne eller admin"
  on public.invoices for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy "charges: egne eller admin"
  on public.charges for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
-- All skriving via funksjonene under.

-- Andelsregning for én økt. Idempotent: sletter og skriver om, så lenge ingen
-- av andelene er fakturert. Rundes OPP til hel krone; resten er gruppas.
create or replace function public.settle_session(p_session uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  n int;
  share int;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  if exists (select 1 from public.charges where session_id = p_session and invoice_id is not null) then
    raise exception 'Økta er allerede med på en regning og kan ikke regnes om';
  end if;

  delete from public.charges where session_id = p_session;

  if s.status <> 'held' or s.cost = 0 then
    return;
  end if;

  select count(*) into n from public.attendance where session_id = p_session and going;
  if n = 0 then
    return;
  end if;

  share := ceil(s.cost::numeric / n / 100) * 100;
  insert into public.charges (session_id, profile_id, amount)
  select p_session, profile_id, share
    from public.attendance
   where session_id = p_session and going;
end
$$;

-- Påmelding. Spilleren styrer bare seg selv, og bare før start. Admin styrer
-- alle, når som helst, og en holdt økt regnes om på stedet.
create or replace function public.set_attendance(p_session uuid, p_going boolean, p_profile uuid default null)
returns public.attendance
language plpgsql security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_profile, auth.uid());
  admin boolean := public.is_admin();
  s public.sessions%rowtype;
  result public.attendance;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  if target <> auth.uid() and not admin then
    raise exception 'Du kan bare melde på deg selv' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  if not admin then
    if s.status <> 'planned' then
      raise exception 'Økta er avsluttet';
    end if;
    if s.starts_at <= now() then
      raise exception 'Påmeldingen er stengt, økta har startet';
    end if;
  end if;

  insert into public.attendance (session_id, profile_id, going, source)
  values (p_session, target, p_going, case when admin and target <> auth.uid() then 'admin' else 'self' end)
  on conflict (session_id, profile_id) do update
    set going = excluded.going, source = excluded.source, updated_at = now()
  returning * into result;

  if s.status = 'held' then
    perform public.settle_session(p_session);
  end if;
  return result;
end
$$;

-- Admin setter status. Holdt → regn ut. Avlyst/planlagt → fjern ufakturerte andeler.
create or replace function public.set_session_status(p_session uuid, p_status text)
returns public.sessions
language plpgsql security definer
set search_path = public
as $$
declare
  result public.sessions;
begin
  if not public.is_admin() then
    raise exception 'Kun admin' using errcode = '42501';
  end if;
  update public.sessions set status = p_status where id = p_session returning * into result;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  perform public.settle_session(p_session);
  return result;
end
$$;

-- Cron: økter som er ferdige for settle_after_hours timer siden regnes som holdt.
create or replace function public.settle_due_sessions()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  grace int;
  r record;
  n int := 0;
begin
  select settle_after_hours into grace from public.settings;
  for r in
    select id from public.sessions
     where status = 'planned'
       and starts_at + make_interval(mins => duration_min) + make_interval(hours => grace) < now()
  loop
    update public.sessions set status = 'held' where id = r.id;
    perform public.settle_session(r.id);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Månedsregning. Tar alle ufakturerte andeler fra holdte økter til og med
-- perioden. En regning som alt er varslet rører vi ikke; nye andeler venter
-- til neste periode. Kan kjøres flere ganger uten dobbeltfakturering.
create or replace function public.create_invoices(p_period text default null)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_period text := coalesce(p_period, to_char((now() at time zone 'Europe/Oslo') - interval '1 month', 'YYYY-MM'));
  v_period_end timestamptz;
  r record;
  inv_id uuid;
  n int := 0;
begin
  v_period_end := (to_date(v_period, 'YYYY-MM') + interval '1 month') at time zone 'Europe/Oslo';
  for r in
    select c.profile_id, sum(c.amount) as total, array_agg(c.id) as charge_ids
      from public.charges c
      join public.sessions s on s.id = c.session_id
     where c.invoice_id is null
       and s.status = 'held'
       and s.starts_at < v_period_end
     group by c.profile_id
  loop
    select id into inv_id from public.invoices
     where profile_id = r.profile_id and period = v_period;
    if found then
      if (select status from public.invoices where id = inv_id) <> 'open' then
        continue;  -- alt varslet; disse andelene blir med neste måned
      end if;
      update public.invoices set amount = amount + r.total where id = inv_id;
    else
      insert into public.invoices (profile_id, period, amount)
      values (r.profile_id, v_period, r.total)
      returning id into inv_id;
    end if;
    update public.charges set invoice_id = inv_id where id = any(r.charge_ids);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Spilleren: «Jeg har vippset».
create or replace function public.claim_invoice(p_invoice uuid)
returns public.invoices
language plpgsql security definer
set search_path = public
as $$
declare
  result public.invoices;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  update public.invoices
     set status = 'claimed', claimed_at = now()
   where id = p_invoice
     and profile_id = auth.uid()
     and status in ('open', 'notified')
  returning * into result;
  if not found then
    raise exception 'Regningen kan ikke markeres som betalt';
  end if;
  return result;
end
$$;

-- Admin: bekreft, frafall, eller send tilbake til varslet.
create or replace function public.set_invoice_status(p_invoice uuid, p_status text, p_ref text default null)
returns public.invoices
language plpgsql security definer
set search_path = public
as $$
declare
  result public.invoices;
begin
  if not public.is_admin() then
    raise exception 'Kun admin' using errcode = '42501';
  end if;
  if p_status not in ('notified', 'confirmed', 'waived') then
    raise exception 'Ugyldig status';
  end if;
  update public.invoices
     set status = p_status,
         confirmed_at = case when p_status = 'confirmed' then now() else null end,
         external_ref = coalesce(p_ref, external_ref)
   where id = p_invoice
  returning * into result;
  if not found then
    raise exception 'Fant ikke regningen';
  end if;
  return result;
end
$$;

-- Saldo per spiller: åpne regninger + ufakturerte andeler.
create or replace view public.balances
with (security_invoker = true) as
  select p.id as profile_id,
         coalesce((select sum(amount) from public.invoices i
                    where i.profile_id = p.id and i.status in ('open', 'notified')), 0) as invoiced_open,
         coalesce((select sum(amount) from public.invoices i
                    where i.profile_id = p.id and i.status = 'claimed'), 0) as claimed,
         coalesce((select sum(c.amount) from public.charges c
                    where c.profile_id = p.id and c.invoice_id is null), 0) as uninvoiced
    from public.profiles p;
grant select on public.balances to authenticated;

-- Cron. pg_cron finnes i Supabase (lokalt og i prod). Timevis settle; sending
-- av regninger gjøres av Edge Function send-invoices, som cron kaller via
-- pg_net når vault har nøklene (settes opp i prod, se supabase/SETUP.md).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('settle-due-sessions', '15 * * * *', $$select public.settle_due_sessions()$$);
