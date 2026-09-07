-- Påmeldingsvindu: spillerne skal ikke kunne ta plasser måneder fram i tid.
-- Vinduet er dager før økta, satt i innstillingene. Admin står utenfor og kan
-- korrigere hvilken økt som helst.

alter table public.settings
  add column signup_window_days int not null default 14
    check (signup_window_days between 1 and 365);

create or replace function public.set_attendance(p_session uuid, p_going boolean, p_profile uuid default null)
returns public.attendance
language plpgsql security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_profile, auth.uid());
  admin boolean := public.is_admin();
  s public.sessions%rowtype;
  window_days int;
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
    select signup_window_days into window_days from public.settings;
    if s.starts_at > now() + make_interval(days => window_days) then
      raise exception 'Påmeldingen åpner %', to_char((s.starts_at - make_interval(days => window_days)) at time zone 'Europe/Oslo', 'DD.MM.');
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
