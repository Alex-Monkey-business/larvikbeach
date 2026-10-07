-- Lokal testdata. Kjøres av `supabase db reset`. ALDRI mot prod.
-- Alex er admin, 12 spillere, vintersesong, seks økter med ulikt oppmøte.

create or replace function pg_temp.mk_user(p_email text, p_name text, p_role text default 'player', p_phone text default null)
returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  -- Samme vei som i virkeligheten: invitasjonen først, så aktiverer triggeren.
  -- (app_metadata.invited leses ikke lenger, siden 7. sep.)
  insert into public.invites (email, name, role, phone) values (p_email, p_name, p_role, p_phone);
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
    ids := ids || pg_temp.mk_user(lower(replace(split_part(names[i], ' ', 1), 'ø', 'o')) || i || '@example.com', names[i], 'player', '48 00 00 ' || lpad(i::text, 2, '0'));
  end loop;

  update public.settings set vipps_number = '900 00 000', vipps_display_name = 'Alex Samnøy',
    admin_email = 'alexander.samnoy@gmail.com';

  insert into public.seasons (name, kind, starts_on, ends_on, default_cost, default_location, default_capacity, default_min_players, notice)
  values ('Vinter 2026/27', 'indoor', '2026-09-01', '2027-04-30', 62000, 'Grenland Folkehøgskole', 6, 4, 'Oppmøte Kiwi Farriseidet kl. 18 for felles transport.')
  returning id into s_winter;
  insert into public.seasons (name, kind, starts_on, ends_on, default_cost, default_location)
  values ('Sommer 2026', 'outdoor', '2026-05-01', '2026-08-31', 0, 'Batteristranda')
  returning id into s_summer;

  -- Fire økter bakover, to planlagte framover. Den ferskeste spilte står som
  -- planlagt til oppgjøret under er lukket, så den havner i neste runde.
  for i in -4..1 loop
    insert into public.sessions (season_id, starts_at, duration_min, location, cost, status, capacity, min_players)
    values (s_winter, base + (i * interval '1 week'), 120, 'Grenland Folkehøgskole', 62000,
            case when i < -1 then 'held' else 'planned' end, 6, 4)
    returning id into sid;
    -- Varierende oppmøte: 5, 7, 8, 11 på de holdte; 6 og 4 påmeldt framover
    n := case i when -4 then 3 when -3 then 5 when -2 then 6 when -1 then 9 when 0 then 6 else 3 end; -- pluss Alex
    insert into public.attendance (session_id, profile_id, going, source, updated_at)
    select sid, ids[k], true, 'self', now() - interval '1 day' + (k * interval '1 minute') from generate_series(1, n) k;
    insert into public.attendance (session_id, profile_id, going, source)
    values (sid, alex, i <> -3, 'self');
    if i < -1 then perform public.settle_session(sid); end if;
  end loop;
end $$;

-- Ett lukket oppgjør, så betalingsflyten har noe å vise. Runden lukkes av
-- admin, så seeden later som den er Alex.
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = 'alexander.samnoy@gmail.com'))::text, true);
select public.close_billing_run(186000, 'Faktura fra skolen');
-- To har betalt, én sier hen har vippset.
update public.invoices set status = 'confirmed', confirmed_at = now()
 where id in (select i.id from public.invoices i join public.profiles p on p.id = i.profile_id order by p.name limit 2);
update public.invoices set status = 'claimed'
 where id = (select i.id from public.invoices i join public.profiles p on p.id = i.profile_id where i.status = 'open' order by p.name limit 1);

-- Den siste økta er spilt etter oppgjøret.
update public.sessions set status = 'held'
 where status = 'planned'
   and starts_at = (select max(starts_at) + interval '1 week' from public.sessions where status = 'held');

-- En gjest: Ola tok med Simen på den ferskeste spilte økta. Han fikk plass
-- (køplass før de andre), så han har en andel og en gjesteregning.
do $$
declare
  ola uuid; simen uuid; sid uuid;
begin
  select id into ola from public.profiles where email = 'ola1@example.com';
  select id into sid from public.sessions where status = 'held' order by starts_at desc limit 1;
  insert into public.profiles (name, phone, role) values ('Simen Gjest', '911 11 111', 'guest') returning id into simen;
  insert into public.attendance (session_id, profile_id, going, source, added_by, updated_at)
  values (sid, simen, true, 'host', ola, now() - interval '2 days');
  perform public.settle_session(sid);
end $$;
