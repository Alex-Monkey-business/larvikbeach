-- Resultater fra mandag 23. nov, ført på papir: king of the beach med fire,
-- to runder. R = Roy, M = Mathias, U = Ulrik, B = den fjerde med plass.
-- Kjøres én gang: `npx supabase db query --linked -f supabase/scripts/resultater-2026-11-23.sql`.
--
-- Kamper uten resultat på økta slettes. Har økta alt kamper med resultat,
-- stopper skriptet uten å endre noe.
--
-- Lagt inn i samme form som draw_matches lager dem (p = R, B, U, M), så
-- «Ny runde» gjentar rekkefølgen de spilte:
--   R+B mot U+M, R+M mot U+B, R+U mot B+M
do $$
declare
  sid uuid;
  players uuid[];
  r uuid; b uuid; m uuid; u uuid;
  hit int;
begin
  select id into sid from public.sessions
   where (starts_at at time zone 'Europe/Oslo')::date = date '2026-11-23';
  if sid is null then raise exception 'Fant ingen økt 23. nov'; end if;
  if (select count(*) from public.sessions where (starts_at at time zone 'Europe/Oslo')::date = date '2026-11-23') > 1 then
    raise exception 'Flere økter 23. nov, velg for hånd';
  end if;

  players := public.session_players(sid);
  if coalesce(array_length(players, 1), 0) <> 4 then
    raise exception 'Økta har % med plass, ventet 4', coalesce(array_length(players, 1), 0);
  end if;

  -- Fornavn blant de fire med plass. Nøyaktig én treff, ellers stopp.
  select count(*), min(p.id::text)::uuid into hit, r from public.profiles p
   where p.id = any(players) and split_part(p.name, ' ', 1) ilike 'Roy';
  if hit <> 1 then raise exception 'Roy: % treff blant de med plass', hit; end if;
  select count(*), min(p.id::text)::uuid into hit, m from public.profiles p
   where p.id = any(players) and split_part(p.name, ' ', 1) ilike 'Mathias';
  if hit <> 1 then raise exception 'Mathias: % treff blant de med plass', hit; end if;
  select count(*), min(p.id::text)::uuid into hit, u from public.profiles p
   where p.id = any(players) and split_part(p.name, ' ', 1) ilike 'Ulrik';
  if hit <> 1 then raise exception 'Ulrik: % treff blant de med plass', hit; end if;
  select x into b from unnest(players) x where x not in (r, m, u);

  if exists (select 1 from public.matches where session_id = sid
              and (winner is not null or score_a is not null or score_b is not null)) then
    raise exception 'Økta har alt kamper med resultat. Ingenting endret.';
  end if;
  delete from public.matches where session_id = sid;

  insert into public.matches (session_id, round, team_a, team_b, score_a, score_b, winner) values
    (sid, 1, array[r, b], array[u, m], 17, 21, 'b'),
    (sid, 2, array[r, m], array[u, b], 21, 19, 'a'),
    (sid, 3, array[r, u], array[b, m], 21, 17, 'a'),
    (sid, 4, array[r, b], array[u, m], 14, 21, 'b'),
    (sid, 5, array[r, m], array[u, b], 21, 19, 'a'),
    (sid, 6, array[r, u], array[b, m], 21, 18, 'a');

  raise notice 'Lagt inn seks kamper. B = %', (select name from public.profiles where id = b);
end $$;
