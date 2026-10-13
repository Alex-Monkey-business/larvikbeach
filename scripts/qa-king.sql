-- King of the beach i basen: rotasjon, «Ny runde» og at spilte kamper står.
-- Kjøres av scripts/qa-king.mjs i én transaksjon som rulles tilbake.
begin;
create temp table t_ctx as
  select (select id from public.sessions order by starts_at limit 1) as s,
         (select id from public.profiles where role = 'admin' and active order by created_at limit 1) as admin;
select set_config('request.jwt.claims', json_build_object('sub', (select admin from t_ctx), 'role', 'authenticated')::text, true);

create or replace function pg_temp.lag(n int) returns void language plpgsql as $$
declare s uuid := (select t.s from t_ctx t);
begin
  delete from public.matches where session_id = s;
  delete from public.session_teams where session_id = s;
  update public.sessions set capacity = 6 where id = s;
  delete from public.attendance where session_id = s;
  insert into public.attendance (session_id, profile_id, going, updated_at)
  select s, id, true, now() - make_interval(mins => row_number() over (order by name)::int)
    from (select id, name from public.profiles where active and role <> 'guest' order by name limit n) p;
end $$;

-- Hver runde: tre kamper, alle fire i hver kamp, hvert par nøyaktig én gang.
create or replace function pg_temp.sjekk_runde(fra int) returns void language plpgsql as $$
declare s uuid := (select t.s from t_ctx t); bad int;
begin
  if (select count(*) from public.matches where session_id = s and round between fra and fra + 2) <> 3 then
    raise exception 'runde fra %: ikke tre kamper', fra; end if;
  select count(*) into bad from public.matches where session_id = s and round between fra and fra + 2
     and (cardinality(team_a) <> 2 or cardinality(team_b) <> 2 or cardinality(resting) <> 0
          or (select count(distinct x) from unnest(team_a || team_b) x) <> 4);
  if bad > 0 then raise exception 'runde fra %: noen spiller to ganger eller sitter over', fra; end if;
  select count(*) into bad from (
    select least(t[1], t[2]) a, greatest(t[1], t[2]) b
      from public.matches m, lateral (values (m.team_a), (m.team_b)) v(t)
     where m.session_id = s and m.round between fra and fra + 2
     group by 1, 2) par;
  if bad <> 6 then raise exception 'runde fra %: % ulike par, ventet 6', fra, bad; end if;
end $$;

do $$
declare s uuid := (select t.s from t_ctx t); r1 text; r2 text; foer text; etter text;
begin
  -- Fire: tre kamper med alle par.
  perform pg_temp.lag(4);
  perform public.draw_matches(s);
  perform pg_temp.sjekk_runde(1);

  -- Resultater på to kamper, så to nye runder.
  update public.matches set score_a = 21, score_b = 11, winner = 'a' where session_id = s and round = 1;
  update public.matches set score_a = 15, score_b = 21, winner = 'b' where session_id = s and round = 2;
  select string_agg(format('%s|%s|%s|%s|%s', round, team_a, team_b, score_a, score_b), ';' order by round) into foer
    from public.matches where session_id = s;
  perform public.draw_matches(s, true);
  perform public.draw_matches(s, true);
  if (select count(*) from public.matches where session_id = s) <> 9 then raise exception 'ny runde: ventet 9 kamper'; end if;
  perform pg_temp.sjekk_runde(4); perform pg_temp.sjekk_runde(7);

  -- Samme rotasjon i samme rekkefølge.
  select string_agg(format('%s v %s', team_a, team_b), ',' order by round) into r1 from public.matches where session_id = s and round <= 3;
  select string_agg(format('%s v %s', team_a, team_b), ',' order by round) into r2 from public.matches where session_id = s and round between 7 and 9;
  if r1 <> r2 then raise exception 'ny runde: ny rotasjon (% / %)', r1, r2; end if;

  -- Spilte kamper urørt.
  select string_agg(format('%s|%s|%s|%s|%s', round, team_a, team_b, score_a, score_b), ';' order by round) into etter
    from public.matches where session_id = s and round <= 3;
  if foer <> etter then raise exception 'ny runde endret spilte kamper'; end if;

  -- Rett et resultat: bare den kampen endres.
  perform public.set_match_score((select id from public.matches where session_id = s and round = 1), 11, 21);
  if (select winner from public.matches where session_id = s and round = 1) <> 'b' then raise exception 'rettet resultat: vinner ikke byttet'; end if;

  -- Fire kan ikke settes opp som faste lag lenger.
  begin
    perform public.set_session_teams(s, '[["a","b"],["c","d"]]'::jsonb);
    raise exception 'fire: faste lag ble godtatt';
  exception when others then
    if sqlerrm not like 'Med 4 spilles%' then raise; end if;
  end;

  -- Fem: uendret, fem kamper, én sitter per kamp, hvert par én gang.
  perform pg_temp.lag(5);
  perform public.draw_matches(s);
  if (select count(*) from public.matches where session_id = s and cardinality(resting) = 1) <> 5 then raise exception 'fem: ventet fem kamper med én som sitter'; end if;
  if (select count(*) from (select least(t[1], t[2]), greatest(t[1], t[2]) from public.matches m, lateral (values (m.team_a), (m.team_b)) v(t) where m.session_id = s group by 1, 2) x) <> 10 then
    raise exception 'fem: ikke alle ti par'; end if;
  perform public.draw_matches(s, true);
  if (select count(*) from public.matches where session_id = s) <> 10 then raise exception 'fem: ny runde ga ikke fem til'; end if;

  -- Seks: tre faste lag, satt opp for hånd, og «Ny runde» bruker dem igjen.
  perform pg_temp.lag(6);
  perform public.draw_matches(s);
  if (select count(*) from public.matches where session_id = s) <> 3 then raise exception 'seks: ventet tre kamper'; end if;
  perform public.set_session_teams(s, (select jsonb_build_array(jsonb_build_array(p[1], p[2]), jsonb_build_array(p[3], p[4]), jsonb_build_array(p[5], p[6])) from (select public.session_players(s) p) x));
  perform public.draw_matches(s, true);
  if (select count(*) from (select distinct least(t[1], t[2]), greatest(t[1], t[2]) from public.matches m, lateral (values (m.team_a), (m.team_b)) v(t) where m.session_id = s) x) <> 3 then
    raise exception 'seks: lagene byttet seg i ny runde'; end if;
  raise notice 'qa-king: alt grønt';
end $$;
rollback;
