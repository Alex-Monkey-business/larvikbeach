-- Oppgjør i runder, ikke kalendermåneder.
--
-- Fakturaen fra skolen er det som faktisk starter jobben, og den kommer når
-- den kommer. Før denne lå perioden fast som en måned (`YYYY-MM` fra øktas
-- dato), og en cron lagde regningene den `billing_day`. Økter som falt mellom
-- to skolefakturaer måtte presses inn i en måned de ikke hørte hjemme i.
--
-- Nå samler alt usendt seg til admin lukker en runde. Da havner hver spilte
-- økt som ikke er gjort opp før i den runden, hvert medlem får én regning, og
-- beløpet fra skolen skrives inn så det kan avstemmes mot det som kreves inn.

create table public.billing_runs (
  id uuid primary key default gen_random_uuid(),
  closed_at timestamptz not null default now(),
  from_date date,                                  -- første økt i runden
  to_date date,                                    -- siste økt i runden
  school_amount int check (school_amount >= 0),    -- hva skolen fakturerte, i øre
  note text,                                       -- fakturanummer, eller hva du vil
  closed_by uuid references public.profiles(id) on delete set null
);
alter table public.billing_runs enable row level security;
-- Alle ser rundene: spilleren trenger datoene for å kjenne igjen regningen sin.
create policy "billing_runs: medlemmer leser" on public.billing_runs
  for select to authenticated using (public.is_member());

alter table public.sessions add column run_id uuid references public.billing_runs(id) on delete set null;
alter table public.invoices add column run_id uuid references public.billing_runs(id) on delete set null;
create index sessions_run_idx on public.sessions (run_id);
create index invoices_run_idx on public.invoices (run_id);

-- Gamle regninger: én runde per måned som alt er fakturert, så historikken
-- får samme form som det nye. Datoene hentes fra øktene som faktisk er med.
do $$
declare
  p text;
  v_run uuid;
begin
  for p in select distinct period from public.invoices where session_id is null order by period loop
    insert into public.billing_runs (closed_at)
    values ((to_date(p, 'YYYY-MM') + interval '1 month')::timestamptz)
    returning id into v_run;

    update public.invoices set run_id = v_run where period = p and session_id is null;

    update public.sessions s set run_id = v_run
     where s.run_id is null
       and exists (
         select 1 from public.charges c
          join public.invoices i on i.id = c.invoice_id
         where c.session_id = s.id and i.run_id = v_run
       );

    update public.billing_runs b set from_date = q.f, to_date = q.t
      from (select min((starts_at at time zone 'Europe/Oslo')::date) as f,
                   max((starts_at at time zone 'Europe/Oslo')::date) as t
              from public.sessions where run_id = v_run) q
     where b.id = v_run;

    -- Gjesteregningene for de samme øktene hører til samme runde.
    update public.invoices i set run_id = v_run
      from public.sessions s
     where s.id = i.session_id and s.run_id = v_run;
  end loop;
end $$;

-- To runder kan lukkes i samme måned, så «én regning per person per måned»
-- gjelder ikke lenger. Per runde gjør den det.
drop index if exists public.invoices_member_period_idx;
create unique index invoices_member_run_idx on public.invoices (profile_id, run_id)
  where session_id is null and run_id is not null;

-- period blir stående: den gamle appen leser den, og en kolonne som forsvinner
-- ville brutt betalingssida for alle som ikke har lastet inn på nytt. Den
-- fylles med måneden runden ble lukket, og leses ikke lenger.
comment on column public.invoices.period is 'Utgått. Erstattet av run_id. Fylles med måneden runden ble lukket.';
alter table public.invoices drop constraint if exists invoices_period_check;

-- Lukk runden: alt som er spilt og ikke gjort opp før havner her.
create or replace function public.close_billing_run(p_school_amount int default null, p_note text default null)
returns public.billing_runs
language plpgsql security definer
set search_path = public
as $$
declare
  run public.billing_runs;
  r record;
  inv_id uuid;
  v_from date;
  v_to date;
  n int;
begin
  if not public.is_admin() then
    raise exception 'Kun admin' using errcode = '42501';
  end if;
  if p_school_amount is not null and p_school_amount < 0 then
    raise exception 'Beløpet fra skolen kan ikke være negativt';
  end if;

  select count(*),
         min((starts_at at time zone 'Europe/Oslo')::date),
         max((starts_at at time zone 'Europe/Oslo')::date)
    into n, v_from, v_to
    from public.sessions where status = 'held' and run_id is null and cost > 0;
  if n = 0 then
    raise exception 'Ingen spilte økter å gjøre opp';
  end if;

  insert into public.billing_runs (from_date, to_date, school_amount, note, closed_by)
  values (v_from, v_to, p_school_amount, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning * into run;

  -- Ute er gratis og hører ikke til et oppgjør: tas de med, stemmer verken
  -- antall økter eller datoene i runden.
  update public.sessions set run_id = run.id where status = 'held' and run_id is null and cost > 0;

  -- Medlemmene: én regning hver, summen av andelene i runden.
  for r in
    select c.profile_id, sum(c.amount) as total, array_agg(c.id) as ids
      from public.charges c
      join public.sessions s on s.id = c.session_id
      join public.profiles p on p.id = c.profile_id
     where s.run_id = run.id and c.invoice_id is null and p.role <> 'guest'
     group by c.profile_id
  loop
    insert into public.invoices (profile_id, period, amount, run_id)
    values (r.profile_id, to_char(run.closed_at at time zone 'Europe/Oslo', 'YYYY-MM'), r.total, run.id)
    returning id into inv_id;
    update public.charges set invoice_id = inv_id where id = any(r.ids);
  end loop;

  -- Gjestene har alt fått sin regning per økt. De hører til runden for
  -- avstemmingen, men kreves inn én og én som før.
  update public.invoices i set run_id = run.id
    from public.sessions s
   where s.id = i.session_id and s.run_id = run.id;

  return run;
end
$$;

-- Fakturaen fra skolen kan komme etter at runden er lukket, og beløpet kan
-- være feil skrevet inn. Begge deler skal kunne rettes.
create or replace function public.update_billing_run(p_run uuid, p_school_amount int default null, p_note text default null)
returns public.billing_runs
language plpgsql security definer
set search_path = public
as $$
declare
  run public.billing_runs;
begin
  if not public.is_admin() then
    raise exception 'Kun admin' using errcode = '42501';
  end if;
  if p_school_amount is not null and p_school_amount < 0 then
    raise exception 'Beløpet fra skolen kan ikke være negativt';
  end if;
  update public.billing_runs
     set school_amount = p_school_amount,
         note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_run
  returning * into run;
  if not found then
    raise exception 'Fant ikke runden';
  end if;
  return run;
end
$$;

-- Månedsregningene og e-posten med dem er borte. Admin krever inn selv, med
-- påminnelse i Messenger og Vipps. Edge-funksjonen send-invoices er slettet,
-- og det eneste som kalte create_invoices var den og den gamle knappen.
drop function if exists public.create_invoices(text);
drop function if exists public.call_send_invoices();

-- Regningene lages ikke lenger på en fast dag. Runden lukkes når fakturaen
-- fra skolen kommer.
do $$
begin
  perform cron.unschedule('send-invoices-daily');
exception when others then
  null;
end $$;
