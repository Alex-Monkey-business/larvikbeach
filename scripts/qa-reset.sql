-- Nullstiller det QA-kjøringen endrer, så `npm run qa` kan kjøres igjen uten db reset.
-- Kjøres av scripts/qa.mjs via docker exec. Rører ikke Alex' innlogging.
delete from public.matches;
delete from public.session_teams;
delete from public.session_teams;
update public.invoices set status = 'open', claimed_at = null, confirmed_at = null where status in ('claimed', 'confirmed');
delete from public.join_requests where email like 'test%@example.com' or name = 'Test Testesen';
delete from public.invites where email like 'test%@example.com';
delete from auth.users where email like 'test%@example.com' or email = 'sniker@example.com';
-- Øktene ankres til nå. Ellers råtner testen i det klokka passerer 19:00 på
-- den datoen seed-fila tilfeldigvis valgte.
-- `at time zone` begge veier: uten den siste blir 19 timer tolket som UTC, og
-- økta havner 21:00 norsk tid. Mandag, som i virkeligheten.
with p as (
  select id, row_number() over (order by starts_at) as rn
    from public.sessions
   where status = 'planned' and starts_at < now() + interval '30 days'
)
update public.sessions s
   set starts_at = (date_trunc('week', (now() at time zone 'Europe/Oslo') + interval '7 days')
                 + (case p.rn when 1 then interval '0 days' else interval '7 days' end)
                 + interval '19 hours') at time zone 'Europe/Oslo'
  from p where s.id = p.id;

-- Siste spilte økt flyttes til i dag, så resultatvisningen på forsiden prøves.
-- Kveldens økt, alltid 19:00 og alltid under et døgn gammel: i dag hvis 19:00
-- har passert, ellers i går. Da prøves «Dagens vinner» og konfettien.
with h as (select s.id from public.sessions s where s.status = 'held' order by s.starts_at desc limit 1),
     k as (select (date_trunc('day', now() at time zone 'Europe/Oslo') + interval '19 hours') at time zone 'Europe/Oslo' as i_dag)
update public.sessions s
   set starts_at = case when now() >= k.i_dag then k.i_dag else k.i_dag - interval '1 day' end
  from h, k where s.id = h.id;

-- Alex får plass på den spilte økta, ellers kan han aldri vinne noe å feire.
with h as (select s.id from public.sessions s where s.status = 'held' order by s.starts_at desc limit 1),
     me as (select id from public.profiles where email = 'alexander.samnoy@gmail.com')
insert into public.attendance (session_id, profile_id, going, source, updated_at)
select h.id, me.id, true, 'self',
       coalesce((select min(a.updated_at) from public.attendance a where a.session_id = h.id), now()) - interval '1 minute'
  from h, me
on conflict (session_id, profile_id) do update
  set going = true,
      updated_at = (select coalesce(min(a.updated_at), now()) - interval '1 minute'
                      from public.attendance a where a.session_id = public.attendance.session_id and a.profile_id <> public.attendance.profile_id);

-- Alex bakerst i køen på første planlagte økt (7 påmeldt, 6 plasser → venteliste nr. 1)
with s as (select id from public.sessions where status = 'planned' and starts_at > now() - interval '3 hours' order by starts_at limit 1),
     me as (select id from public.profiles where email = 'alexander.samnoy@gmail.com')
insert into public.attendance (session_id, profile_id, going, source, updated_at)
select s.id, me.id, true, 'self', now() from s, me
on conflict (session_id, profile_id) do update set going = true, updated_at = now();

-- En økt godt utenfor påmeldingsvinduet, så kalenderen og sperren kan testes.
insert into public.sessions (season_id, starts_at, duration_min, location, cost, capacity, min_players, note)
select se.id, (date_trunc('week', (now() at time zone 'Europe/Oslo') + interval '35 days') + interval '19 hours') at time zone 'Europe/Oslo', 120, se.default_location, se.default_cost, se.default_capacity, se.default_min_players, 'Nøkkelboks: hent nøkkelen i boksen.'
  from public.seasons se
 where se.name = 'Vinter 2026/27'
   and not exists (select 1 from public.sessions x where x.season_id = se.id and x.starts_at > now() + interval '30 days');

-- Prod deler påminnelsen i Messenger og sender ingen regnings-e-post. Testen
-- skal kjøre på den oppsettet som faktisk er i bruk.
update public.settings set email_invoices = false;
