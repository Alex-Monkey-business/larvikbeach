-- Gjesten dukker opp på hallen, ikke i admin-panelet. Før denne kunne ingen
-- legge til en gjest fra økta startet til cron markerte den som holdt – flere
-- timer der knappen var borte for alle. Nå kan den som er der gjøre det selv
-- så lenge økta står som planlagt.
--
-- Etter at økta er holdt er det fortsatt bare admin: da regnes andelene om,
-- og det er penger.
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
    -- Ingen sperre på at økta har startet: står den som planlagt, spilles den.
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

-- Samme vei ut som inn: den som tok med gjesten kan fjerne hen igjen mens
-- økta pågår. Seg selv kan man fortsatt ikke melde av etter at økta har
-- startet – andelen er låst da.
create or replace function public.set_attendance(p_session uuid, p_going boolean, p_profile uuid default null)
returns public.attendance
language plpgsql security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_profile, auth.uid());
  admin boolean := public.is_admin();
  own_guest boolean := false;
  s public.sessions%rowtype;
  window_days int;
  result public.attendance;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  if target <> auth.uid() and not admin then
    own_guest := exists (
      select 1 from public.attendance a
      join public.profiles p on p.id = a.profile_id
      where a.session_id = p_session and a.profile_id = target
        and p.role = 'guest' and a.added_by = auth.uid()
    );
    if not own_guest then
      raise exception 'Du kan bare melde på deg selv' using errcode = '42501';
    end if;
  end if;

  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  if not admin then
    if s.status <> 'planned' then
      raise exception 'Økta er avsluttet';
    end if;
    if s.starts_at <= now() and not own_guest then
      raise exception 'Påmeldingen er stengt, økta har startet';
    end if;
    select signup_window_days into window_days from public.settings;
    if s.starts_at > now() + make_interval(days => window_days) then
      raise exception 'Påmeldingen åpner %', to_char((s.starts_at - make_interval(days => window_days)) at time zone 'Europe/Oslo', 'DD.MM.');
    end if;
  end if;

  insert into public.attendance (session_id, profile_id, going, source)
  values (p_session, target, p_going,
          case when target = auth.uid() then 'self' when admin then 'admin' else 'host' end)
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
