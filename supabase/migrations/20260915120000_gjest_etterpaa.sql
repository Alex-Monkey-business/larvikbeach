-- Gjest lagt til på en spilt økt: admin sier «hen var med». Da skal gjesten
-- ha plass, ikke stå bakerst i en kø som ikke finnes lenger. Køplassen
-- settes foran alle andre, så andelen regnes med gjesten.
create or replace function public.add_guest(p_session uuid, p_phone text, p_name text default null)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  key text := public.norm_phone(p_phone);
  admin boolean := public.is_admin();
  s public.sessions%rowtype;
  g public.profiles%rowtype;
  window_days int;
  plass timestamptz := now();
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  if key is null or length(key) < 8 then
    raise exception 'Telefonnummeret mangler';
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
    select signup_window_days into window_days from public.settings;
    if s.starts_at > now() + make_interval(days => window_days) then
      raise exception 'Påmeldingen åpner %', to_char((s.starts_at - make_interval(days => window_days)) at time zone 'Europe/Oslo', 'DD.MM.');
    end if;
  end if;
  if s.status = 'held' then
    select coalesce(min(updated_at), now()) - interval '1 second' into plass
      from public.attendance where session_id = p_session and going;
  end if;

  select * into g from public.profiles where phone_key = key;
  if found and g.role <> 'guest' then
    raise exception '% er medlem og melder seg på selv', g.name;
  end if;
  if not found then
    if length(trim(coalesce(p_name, ''))) < 2 then
      raise exception 'Navnet mangler';
    end if;
    insert into public.profiles (name, phone, role, active)
    values (trim(p_name), trim(p_phone), 'guest', true)
    returning * into g;
  end if;

  insert into public.attendance (session_id, profile_id, going, source, added_by, updated_at)
  values (p_session, g.id, true, 'host', auth.uid(), plass)
  on conflict (session_id, profile_id) do update
    set going = true,
        source = 'host',
        added_by = coalesce(public.attendance.added_by, excluded.added_by),
        updated_at = case when public.attendance.going then public.attendance.updated_at else excluded.updated_at end;

  if s.status = 'held' then
    perform public.settle_session(p_session);
  end if;
  return g;
end
$$;

-- Oppgjøret uten temp-tabell. `delete from payers` uten where stoppes av
-- safeupdate når kallet kommer fra appen (add_guest → settle_session som
-- authenticated), med «DELETE requires a WHERE clause». Cron og admin-status
-- traff det aldri; gjest lagt til etterpå gjorde det.
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
  if exists (
    select 1 from public.charges c
    join public.invoices i on i.id = c.invoice_id
    join public.profiles p on p.id = c.profile_id
    where c.session_id = p_session and (p.role <> 'guest' or i.status <> 'open')
  ) then
    raise exception 'Økta er allerede med på en regning og kan ikke regnes om';
  end if;
  delete from public.charges where session_id = p_session;
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
    ) payers;

  insert into public.invoices (profile_id, period, amount, session_id)
  select c.profile_id, to_char(s.starts_at at time zone 'Europe/Oslo', 'YYYY-MM'), c.amount, p_session
    from public.charges c
    join public.profiles p on p.id = c.profile_id
   where c.session_id = p_session and p.role = 'guest';
  update public.charges c
     set invoice_id = i.id
    from public.invoices i
   where i.session_id = p_session and i.profile_id = c.profile_id and c.session_id = p_session;
end
$$;
