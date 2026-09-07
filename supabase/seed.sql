-- Lokal testdata. Kjøres av `supabase db reset`. ALDRI mot prod.
-- Alex er admin, 12 spillere, vintersesong, seks økter med ulikt oppmøte.

create or replace function pg_temp.mk_user(p_email text, p_name text, p_role text default 'player')
returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email, '', now(),
    '{"provider":"email","providers":["email"],"invited":true}', jsonb_build_object('name', p_name, 'role', p_role), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p_email), 'email', now(), now(), now());
  return uid;
end $$;

do $$
declare
  alex uuid; s_winter uuid; s_summer uuid; sid uuid;
  names text[] := array['Ola Nordmann','Kari Hansen','Per Berg','Ingrid Solheim','Jonas Lie','Mari Aas','Sindre Dahl','Thea Moen','Erik Strand','Nora Bakke','Lars Vik','Emma Holm'];
  ids uuid[] := '{}';
  i int; n int;
  base timestamptz := (date_trunc('week', now() at time zone 'Europe/Oslo') + interval '19 hours') at time zone 'Europe/Oslo'; -- mandag 19:00 Oslo denne uka
begin
  alex := pg_temp.mk_user('alexander.samnoy@gmail.com', 'Alex Samnøy', 'admin');
  for i in 1..array_length(names, 1) loop
    ids := ids || pg_temp.mk_user(lower(replace(split_part(names[i], ' ', 1), 'ø', 'o')) || i || '@example.com', names[i]);
  end loop;

  update public.settings set vipps_number = '900 00 000', vipps_display_name = 'Alex Samnøy',
    admin_email = 'alexander.samnoy@gmail.com';

  insert into public.seasons (name, kind, starts_on, ends_on, default_cost, default_location, default_capacity, default_min_players)
  values ('Vinter 2026/27', 'indoor', '2026-09-01', '2027-04-30', 62000, 'Grenland Folkehøgskole', 6, 4)
  returning id into s_winter;
  insert into public.seasons (name, kind, starts_on, ends_on, default_cost, default_location)
  values ('Sommer 2026', 'outdoor', '2026-05-01', '2026-08-31', 0, 'Batteristranda')
  returning id into s_summer;

  -- Fire holdte økter bakover (én i forrige måned), to planlagte framover.
  for i in -4..1 loop
    insert into public.sessions (season_id, starts_at, duration_min, location, cost, status, capacity, min_players)
    values (s_winter, base + (i * interval '1 week'), 120, 'Grenland Folkehøgskole', 62000,
            case when i < 0 then 'held' else 'planned' end, 6, 4)
    returning id into sid;
    -- Varierende oppmøte: 5, 7, 8, 11 på de holdte; 6 og 4 påmeldt framover
    n := case i when -4 then 3 when -3 then 5 when -2 then 6 when -1 then 9 when 0 then 6 else 3 end; -- pluss Alex
    insert into public.attendance (session_id, profile_id, going, source, updated_at)
    select sid, ids[k], true, 'self', now() - interval '1 day' + (k * interval '1 minute') from generate_series(1, n) k;
    insert into public.attendance (session_id, profile_id, going, source)
    values (sid, alex, i <> -3, 'self');
    if i < 0 then perform public.settle_session(sid); end if;
  end loop;
end $$;

-- Forrige måneds regninger, så betalingsflyten har noe å vise.
select public.create_invoices(to_char((now() at time zone 'Europe/Oslo') - interval '1 month', 'YYYY-MM'));
