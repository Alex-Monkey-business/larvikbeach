-- Lag satt opp for hånd i stedet for trukket. Med 4 eller 6 med plass er hele
-- økta bestemt av parene: to lag møter hverandre, tre lag møter alle. Derfor er
-- det nok å lagre parene – «Ny runde» bruker de samme lagene igjen. Med 5
-- spilles hvert par nøyaktig én gang uansett (king of the beach), så der
-- finnes ingenting å velge.

create table public.session_teams (
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_no int not null,
  members uuid[] not null,
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (session_id, team_no)
);
alter table public.session_teams enable row level security;
create policy "session_teams: medlemmer leser" on public.session_teams
  for select to authenticated using (public.is_member());

-- Stemmer lagene fortsatt med de som har plass? Melder noen seg av etter at
-- lagene er satt opp, skal de ikke brukes videre.
create or replace function public.session_teams_ok(p_session uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  with t as (select * from public.session_teams where session_id = p_session),
       flat as (select unnest(members) as id from t),
       pl as (select unnest(public.session_players(p_session)) as id)
  select (select count(*) from t) in (2, 3)
     and not exists (select 1 from t where array_length(members, 1) <> 2)
     and (select count(*) from flat) = (select count(*) from pl)
     and not exists (select id from flat except select id from pl)
     and not exists (select id from pl except select id from flat)
$$;

-- Runder fra lagene som ligger lagret, lagt inn etter runde p_after.
create or replace function public.matches_from_teams(p_session uuid, p_after int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a uuid[]; b uuid[]; c uuid[];
  cnt int;
begin
  select count(*) into cnt from public.session_teams where session_id = p_session;
  select members into a from public.session_teams where session_id = p_session and team_no = 1;
  select members into b from public.session_teams where session_id = p_session and team_no = 2;
  if cnt = 3 then
    select members into c from public.session_teams where session_id = p_session and team_no = 3;
    insert into public.matches (session_id, round, team_a, team_b, resting) values
      (p_session, p_after + 1, a, b, c),
      (p_session, p_after + 2, a, c, b),
      (p_session, p_after + 3, b, c, a);
  else
    insert into public.matches (session_id, round, team_a, team_b) values
      (p_session, p_after + 1, a, b);
  end if;
end
$$;

-- Sett opp lagene selv. p_teams er par av profil-id-er: [[a,b],[c,d],[e,f]].
-- Er det alt registrert resultater, blir de stående og de nye lagene får nye
-- runder under. Ellers erstattes rundene som ikke er spilt.
create or replace function public.set_session_teams(p_session uuid, p_teams jsonb)
returns setof public.matches
language plpgsql security definer
set search_path = public
as $$
declare
  players uuid[];
  flat uuid[];
  n int;
  r int := 0;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sessions where id = p_session) then
    raise exception 'Fant ikke økta';
  end if;

  players := public.session_players(p_session);
  n := coalesce(array_length(players, 1), 0);
  if not (auth.uid() = any(players) or public.is_admin()) then
    raise exception 'Bare de som har plass kan sette opp lag' using errcode = '42501';
  end if;
  if n = 5 then
    raise exception 'Med fem spilles hvert par én gang uansett. Trekk lag i stedet.';
  end if;
  if n not in (4, 6) then
    raise exception 'Lag trenger 4 eller 6 spillere, dere er %', n;
  end if;

  if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) <> n / 2 then
    raise exception 'Det skal være % lag', n / 2;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_teams) e
     where jsonb_typeof(e.value) <> 'array' or jsonb_array_length(e.value) <> 2
  ) then
    raise exception 'Hvert lag skal ha to spillere';
  end if;

  select array_agg(m.id::uuid) into flat
    from jsonb_array_elements(p_teams) e,
         jsonb_array_elements_text(e.value) as m(id);
  if coalesce(array_length(flat, 1), 0) <> n
     or exists (select 1 from unnest(flat) as t(id) group by t.id having count(*) > 1)
     or exists (select t.id from unnest(flat) as t(id) except select u.id from unnest(players) as u(id))
     or exists (select u.id from unnest(players) as u(id) except select t.id from unnest(flat) as t(id))
  then
    raise exception 'Lagene må ha hver av de % med plass én gang', n;
  end if;

  delete from public.session_teams where session_id = p_session;
  insert into public.session_teams (session_id, team_no, members, set_by)
  select p_session, e.ord::int,
         (select array_agg(m.id::uuid order by m.ord)
            from jsonb_array_elements_text(e.value) with ordinality as m(id, ord)),
         auth.uid()
    from jsonb_array_elements(p_teams) with ordinality as e(value, ord);

  -- Kamper som er spilt blir stående. Runder ingen har rørt hører til det
  -- gamle oppsettet og byttes ut.
  delete from public.matches
   where session_id = p_session and winner is null and score_a is null and score_b is null;

  -- Hull i rundetallene ser rart ut i lista, så de som står igjen nummereres
  -- om. Innom negative tall, ellers kolliderer de med unique (session, round).
  with nytt as (
    select id, row_number() over (order by round) as nr
      from public.matches where session_id = p_session
  )
  update public.matches m set round = -nytt.nr from nytt where m.id = nytt.id;
  update public.matches set round = -round where session_id = p_session and round < 0;

  select coalesce(max(round), 0) into r from public.matches where session_id = p_session;
  perform public.matches_from_teams(p_session, r);

  return query select * from public.matches where session_id = p_session order by round;
end
$$;

-- «Ny runde» bruker lagene dere har satt opp, hvis de fortsatt stemmer med de
-- som har plass. «Trekk lag» betyr tilfeldig, og glemmer oppsettet.
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
    if public.session_teams_ok(p_session) then
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
