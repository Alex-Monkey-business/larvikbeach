-- Vinter 2026/27 i Grenland Folkehøgskole. Mandager 19–21, 620 kr, maks 6, minst 4.
-- Kilde: skolens utleierute 2026-27. Alle uker fra 37 (2026) til 17 (2027),
-- også feriene (gjengen spiller da). Uke 18 er stengt for utleie.
-- Kjøres én gang: `npx supabase db query --linked -f supabase/scripts/vinter-2026-27.sql`.
-- Idempotent: gjør ingenting hvis sesongen finnes.
do $$
declare
  sid uuid;
begin
  if exists (select 1 from public.seasons where name = 'Vinter 2026/27') then
    raise notice 'Vinter 2026/27 finnes alt, ingenting gjort';
    return;
  end if;

  insert into public.seasons (name, kind, starts_on, ends_on, default_cost, default_location, default_capacity, default_min_players)
  values ('Vinter 2026/27', 'indoor', '2026-09-07', '2027-05-02', 62000, 'Grenland Folkehøgskole, sandvolleyhallen', 6, 4)
  returning id into sid;

  insert into public.sessions (season_id, starts_at, duration_min, location, cost, capacity, min_players, note)
  select sid, t::timestamptz, 120, 'Grenland Folkehøgskole, sandvolleyhallen', 62000, 6, 4, n
    from (values
    ('2026-09-07 19:00 Europe/Oslo', null),
    ('2026-09-14 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2026-09-21 19:00 Europe/Oslo', null),
    ('2026-09-28 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2026-10-05 19:00 Europe/Oslo', 'Høstferie: hallen er åpen etter avtale.'),
    ('2026-10-12 19:00 Europe/Oslo', null),
    ('2026-10-19 19:00 Europe/Oslo', null),
    ('2026-10-26 19:00 Europe/Oslo', null),
    ('2026-11-02 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2026-11-09 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2026-11-16 19:00 Europe/Oslo', null),
    ('2026-11-23 19:00 Europe/Oslo', null),
    ('2026-11-30 19:00 Europe/Oslo', null),
    ('2026-12-07 19:00 Europe/Oslo', null),
    ('2026-12-14 19:00 Europe/Oslo', null),
    ('2026-12-21 19:00 Europe/Oslo', 'Juleferie: hallen er åpen etter avtale.'),
    ('2026-12-28 19:00 Europe/Oslo', 'Juleferie: hallen er åpen etter avtale.'),
    ('2027-01-04 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2027-01-11 19:00 Europe/Oslo', null),
    ('2027-01-18 19:00 Europe/Oslo', null),
    ('2027-01-25 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2027-02-01 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2027-02-08 19:00 Europe/Oslo', null),
    ('2027-02-15 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2027-02-22 19:00 Europe/Oslo', 'Vinterferie: hallen er åpen etter avtale.'),
    ('2027-03-01 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2027-03-08 19:00 Europe/Oslo', null),
    ('2027-03-15 19:00 Europe/Oslo', null),
    ('2027-03-22 19:00 Europe/Oslo', 'Påskeferie: hallen er åpen etter avtale.'),
    ('2027-03-29 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.'),
    ('2027-04-05 19:00 Europe/Oslo', null),
    ('2027-04-12 19:00 Europe/Oslo', null),
    ('2027-04-19 19:00 Europe/Oslo', null),
    ('2027-04-26 19:00 Europe/Oslo', 'Nøkkelboks: ingen ansatte på skolen, hent nøkkelen i boksen.')
    ) as v(t, n);

  raise notice '% økter lagt inn', (select count(*) from public.sessions where season_id = sid);
end $$;
