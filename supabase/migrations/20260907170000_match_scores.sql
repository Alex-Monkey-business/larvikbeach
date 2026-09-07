-- Poeng per kamp (ett sett, typisk til 15) og «Ny runde»: nye lag, nye kamper
-- lagt til under de forrige. Vinner utledes av poengene når de finnes.

alter table public.matches
  add column score_a int check (score_a >= 0),
  add column score_b int check (score_b >= 0);

create or replace function public.draw_matches(p_session uuid, p_append boolean default false)
returns setof public.matches
language plpgsql security definer
set search_path = public
as $$
declare
  players uuid[];
  p uuid[];
  n int;
  r int := 0;
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
  else
    if exists (select 1 from public.matches where session_id = p_session and winner is not null) and not public.is_admin() then
      raise exception 'Resultater er alt registrert. Bruk «Ny runde», eller la admin trekke på nytt.';
    end if;
    delete from public.matches where session_id = p_session;
  end if;

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

  if n = 4 then
    insert into public.matches (session_id, round, team_a, team_b) values
      (p_session, r + 1, array[p[1], p[2]], array[p[3], p[4]]);
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

-- Poeng inn, vinner ut. Null på begge nullstiller kampen.
create or replace function public.set_match_score(p_match uuid, p_a int, p_b int)
returns public.matches
language plpgsql security definer
set search_path = public
as $$
declare
  m public.matches;
  players uuid[];
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Fant ikke kampen'; end if;
  players := public.session_players(m.session_id);
  if not (auth.uid() = any(players) or public.is_admin()) then
    raise exception 'Bare de som spilte kan registrere resultat' using errcode = '42501';
  end if;
  update public.matches
     set score_a = p_a, score_b = p_b,
         winner = case when p_a is null or p_b is null then winner
                       when p_a > p_b then 'a' when p_b > p_a then 'b' else null end
   where id = p_match
  returning * into m;
  return m;
end
$$;
