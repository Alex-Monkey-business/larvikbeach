-- Ute-økter. Gjengen spiller ute når været tillater det: økta, påmeldingen,
-- lagene og statistikken er som før, men ingen leier noe, så det koster
-- ingenting. Flagget er egen kolonne, ikke «pris 0», fordi 0 kr i hallen ser
-- ut som en feil mens «ute» er et valg. Sperren holder de to i takt: en
-- ute-økt kan ikke ha pris, så settle_session (som alt hopper over cost = 0)
-- lager aldri andeler for den.

alter table public.sessions
  add column outdoor boolean not null default false,
  add constraint sessions_outdoor_free check (not outdoor or cost = 0);

-- Forsiden får vite det også (anon-visningen).
create or replace view public.public_upcoming_sessions
with (security_invoker = false) as
  select s.id, s.starts_at, s.duration_min, s.location, se.kind,
         (select count(*) from public.attendance a where a.session_id = s.id and a.going) as going_count,
         s.outdoor
    from public.sessions s
    join public.seasons se on se.id = s.season_id
   where s.status = 'planned' and s.starts_at > now()
   order by s.starts_at
   limit 3;
