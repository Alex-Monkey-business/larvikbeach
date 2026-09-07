-- Oppgjøret ble målt i hele timer, så en økt som slutter 21:00 kunne tidligst
-- gjøres opp 22:00. Minutter i stedet, og cron hvert kvarter, så «ferdig
-- 21:30» faktisk skjer 21:30.

alter table public.settings
  add column settle_after_minutes int not null default 30
    check (settle_after_minutes between 0 and 1440);

update public.settings set settle_after_minutes = greatest(settle_after_hours, 0) * 60
 where settle_after_hours is not null and settle_after_hours <> 3;

-- settle_after_hours blir stående: adminskjemaet sender hele innstillingsraden
-- tilbake ved lagring, så en kolonne som forsvinner ville brutt lagringen for
-- alle som hadde appen åpen. Den leses ikke lenger.
comment on column public.settings.settle_after_hours is 'Utgått. Erstattet av settle_after_minutes.';

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
  select settle_after_minutes into grace from public.settings;
  for r in
    select id from public.sessions
     where status = 'planned'
       and starts_at + make_interval(mins => duration_min) + make_interval(mins => grace) <= now()
  loop
    update public.sessions set status = 'held' where id = r.id;
    perform public.settle_session(r.id);
    n := n + 1;
  end loop;
  return n;
end
$$;

do $$
begin
  perform cron.unschedule('settle-due-sessions');
exception when others then null;
end $$;
select cron.schedule('settle-due-sessions', '*/15 * * * *', $$select public.settle_due_sessions()$$);
