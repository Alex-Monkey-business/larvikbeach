-- «Ny runde» gjentar forrige runde også når appen ikke sier hva den vil.
--
-- 23. nov ble det trukket tre runder med nye par, selv om «Ny runde» i appen
-- ber om samme oppsett. Enten ble «Nye par» trykket, eller en telefon kjørte
-- gammel app fra cache. Gammel app sender ikke p_same, og standarden var
-- false. Nå er standarden true: bare et uttrykkelig p_same = false trekker nye
-- par. Første trekning (p_append = false) er tilfeldig som før.
--
-- Endret standardverdi krever drop og create.

drop function if exists public.draw_matches(uuid, boolean, boolean);

create or replace function public.draw_matches(p_session uuid, p_append boolean default false, p_same boolean default true)
returns setof public.matches
language plpgsql security definer
set search_path = public
as $$
declare
  players uuid[];
  p uuid[];
  o uuid[];
  n int;
  r int := 0;
  size int;
  s public.sessions%rowtype;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  select * into s from public.sessions where id = p_session;
  if not found then raise exception 'Fant ikke økta'; end if;

  players := public.session_players(p_session);
  n := coalesce(array_length(players, 1), 0);
  if not (auth.uid() = any(players) or public.is_admin()) then
    raise exception 'Bare de som har plass kan trekke lag' using errcode = '42501';
  end if;
  if n not between 4 and 6 then
    raise exception 'Kamper trenger 4, 5 eller 6 spillere, dere er %', n;
  end if;

  if p_append then
    select coalesce(max(round), 0) into r from public.matches where session_id = p_session;
    -- Seks med lag satt for hånd: lagene gjelder til noen endrer dem.
    if p_same and n = 6 and public.session_teams_ok(p_session) then
      perform public.matches_from_teams(p_session, r);
      return query select * from public.matches where session_id = p_session order by round;
      return;
    end if;
  else
    if exists (select 1 from public.matches where session_id = p_session and winner is not null) and not public.is_admin() then
      raise exception 'Resultater er alt registrert. Bruk «Ny runde», eller la admin trekke på nytt.';
    end if;
    delete from public.matches where session_id = p_session;
  end if;

  if p_append and p_same then
    -- Første kamp i forrige runde er alltid p1+p2 mot p3+p4, og den eller de
    -- som sitter er p5 (og p6). Les rekkefølgen tilbake derfra.
    size := case when n = 5 then 5 else 3 end;
    select team_a || team_b || resting into o
      from public.matches where session_id = p_session and round = r - size + 1;
    if o is null
       or (select array_agg(x order by x) from unnest(o) x) is distinct from (select array_agg(x order by x) from unnest(players) x)
    then
      raise exception 'Det er ikke de samme spillerne som forrige runde. Trekk nye par.';
    end if;
    p := o;
  else
    -- Tilfeldig betyr tilfeldig: et oppsett satt for hånd gjelder ikke lenger.
    delete from public.session_teams where session_id = p_session;
    select array_agg(x order by random()) into p from unnest(players) x;

    -- Ny runde med fem: den som satt sist skal ikke sitte først igjen.
    if n = 5 and r > 0 then
      declare last_rest uuid;
      begin
        select resting[1] into last_rest from public.matches where session_id = p_session order by round desc limit 1;
        if p[5] = last_rest then
          p := array[p[5], p[2], p[3], p[4], p[1]];
        end if;
      end;
    end if;
  end if;

  if n = 4 then
    insert into public.matches (session_id, round, team_a, team_b) values
      (p_session, r + 1, array[p[1], p[2]], array[p[3], p[4]]),
      (p_session, r + 2, array[p[1], p[4]], array[p[3], p[2]]),
      (p_session, r + 3, array[p[1], p[3]], array[p[2], p[4]]);
  elsif n = 5 then
    insert into public.matches (session_id, round, team_a, team_b, resting) values
      (p_session, r + 1, array[p[1], p[2]], array[p[3], p[4]], array[p[5]]),
      (p_session, r + 2, array[p[1], p[3]], array[p[2], p[5]], array[p[4]]),
      (p_session, r + 3, array[p[1], p[5]], array[p[2], p[4]], array[p[3]]),
      (p_session, r + 4, array[p[1], p[4]], array[p[3], p[5]], array[p[2]]),
      (p_session, r + 5, array[p[2], p[3]], array[p[4], p[5]], array[p[1]]);
  else
    insert into public.matches (session_id, round, team_a, team_b, resting) values
      (p_session, r + 1, array[p[1], p[2]], array[p[3], p[4]], array[p[5], p[6]]),
      (p_session, r + 2, array[p[1], p[2]], array[p[5], p[6]], array[p[3], p[4]]),
      (p_session, r + 3, array[p[3], p[4]], array[p[5], p[6]], array[p[1], p[2]]);
  end if;

  return query select * from public.matches where session_id = p_session order by round;
end
$$;
