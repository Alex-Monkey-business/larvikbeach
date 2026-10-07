-- Én løpende saldo per person. Alt som er spilt og ikke betalt, skylder du.
-- «Betalt» nuller saldoen, og den teller fra null igjen ved neste økt.
--
-- Rundene styrer ikke lenger noe. Tabellen billing_runs og run_id blir stående
-- så historikken ikke forsvinner, men ingenting leser eller skriver dem.

-- Andelene som ikke er på noen regning ennå, samlet på én ny regning.
-- Intern: kalles bare av funksjonene under.
create or replace function public.bundle_charges(p_profile uuid, p_status text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  total int;
  inv_id uuid;
begin
  if not exists (select 1 from public.charges where profile_id = p_profile and invoice_id is null) then
    return 0;
  end if;
  select sum(amount) into total
    from public.charges where profile_id = p_profile and invoice_id is null;
  insert into public.invoices (profile_id, period, amount, status, claimed_at, confirmed_at)
  values (p_profile, to_char(now() at time zone 'Europe/Oslo', 'YYYY-MM'), total, p_status,
          case when p_status = 'claimed' then now() end,
          case when p_status = 'confirmed' then now() end)
  returning id into inv_id;
  update public.charges set invoice_id = inv_id where profile_id = p_profile and invoice_id is null;
  return total;
end
$$;
revoke execute on function public.bundle_charges(uuid, text) from public, anon, authenticated;

-- Admin: personen har betalt alt fram til nå.
create or replace function public.mark_paid(p_profile uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  total int;
begin
  if not public.is_admin() then
    raise exception 'Kun admin' using errcode = '42501';
  end if;
  select coalesce(sum(amount), 0) into total
    from public.invoices where profile_id = p_profile and status in ('open', 'notified', 'claimed');
  update public.invoices set status = 'confirmed', confirmed_at = now()
   where profile_id = p_profile and status in ('open', 'notified', 'claimed');
  return total + public.bundle_charges(p_profile, 'confirmed');
end
$$;

-- Spilleren: «Jeg har vippset» gjelder hele saldoen.
create or replace function public.claim_balance()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  total int;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  select coalesce(sum(amount), 0) into total
    from public.invoices where profile_id = me and status in ('open', 'notified');
  update public.invoices set status = 'claimed', claimed_at = now()
   where profile_id = me and status in ('open', 'notified');
  total := total + public.bundle_charges(me, 'claimed');
  if total = 0 then
    raise exception 'Du skylder ingenting';
  end if;
  return total;
end
$$;

-- Med løpende saldo kan noen ha betalt for økta samme kveld. Da skal den
-- fortsatt kunne regnes om når oppmøtet rettes eller en gjest legges til
-- etterpå. Betalte og meldte andeler står fast; resten regnes om, og nye får
-- vanlig andel. Det som blir til overs, er gjengens.
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

  -- Låst: andeler på en regning, unntatt en gjests åpne regning for økta.
  delete from public.charges c
   where c.session_id = p_session
     and not exists (
       select 1 from public.invoices i join public.profiles p on p.id = c.profile_id
        where i.id = c.invoice_id and (p.role <> 'guest' or i.status <> 'open'));
  delete from public.invoices where session_id = p_session and status = 'open';
  if s.status <> 'held' or s.cost = 0 then
    return;
  end if;

  -- De som fikk plass: først i køen, opp til plassgrensa.
  select count(*) into n from (
    select 1 from public.attendance
     where session_id = p_session and going
     order by updated_at
     limit coalesce(s.capacity, 1000000)
  ) q;
  if n = 0 then
    return;
  end if;
  share := ceil(s.cost::numeric / n / 100) * 100;
  insert into public.charges (session_id, profile_id, amount)
  select p_session, profile_id, share
    from (
      select profile_id from public.attendance
       where session_id = p_session and going
       order by updated_at
       limit coalesce(s.capacity, 1000000)
    ) payers
  on conflict (session_id, profile_id) do nothing;

  insert into public.invoices (profile_id, period, amount, session_id)
  select c.profile_id, to_char(s.starts_at at time zone 'Europe/Oslo', 'YYYY-MM'), c.amount, p_session
    from public.charges c
    join public.profiles p on p.id = c.profile_id
   where c.session_id = p_session and p.role = 'guest' and c.invoice_id is null;
  update public.charges c
     set invoice_id = i.id
    from public.invoices i
   where i.session_id = p_session and i.profile_id = c.profile_id and c.session_id = p_session
     and c.invoice_id is null;
end
$$;
