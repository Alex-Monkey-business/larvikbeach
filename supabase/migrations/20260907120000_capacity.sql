-- Plassgrense og minimum. 15 spillere om 6 plasser: de første som melder seg
-- får plass, resten står på venteliste og rykker opp automatisk når noen
-- melder seg av. Rekkefølgen er attendance.updated_at, som bare endres når
-- svaret faktisk endres.

alter table public.seasons
  add column default_capacity int check (default_capacity > 0),
  add column default_min_players int check (default_min_players > 0);

alter table public.sessions
  add column capacity int check (capacity > 0),
  add column min_players int check (min_players > 0);

-- updated_at bare når svaret endres, ellers mister man køplassen ved å trykke to ganger.
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
    set going = excluded.going,
        source = excluded.source,
        updated_at = case when public.attendance.going = excluded.going then public.attendance.updated_at else now() end
  returning * into result;

  if s.status = 'held' then
    perform public.settle_session(p_session);
  end if;
  return result;
end
$$;

-- Bare de som fikk plass betaler.
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

  create temp table if not exists payers (profile_id uuid) on commit drop;
  delete from payers;
  insert into payers
    select profile_id from public.attendance
     where session_id = p_session and going
     order by updated_at
     limit coalesce(s.capacity, 1000000);

  select count(*) into n from payers;
  if n = 0 then
    return;
  end if;

  share := ceil(s.cost::numeric / n / 100) * 100;
  insert into public.charges (session_id, profile_id, amount)
  select p_session, profile_id, share from payers;
end
$$;
