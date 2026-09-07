-- Kamper per økt. Trekkes av en med plass (eller admin) på øktdagen.
-- 4: ett lagoppsett 2 mot 2. 5: king of the beach, fem runder der alle spiller
-- med alle én gang og sitter én runde. 6: tre faste lag, alle møter alle.

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  round int not null,
  team_a uuid[] not null,
  team_b uuid[] not null,
  resting uuid[] not null default '{}',
  winner text check (winner in ('a', 'b')),
  created_at timestamptz not null default now(),
  unique (session_id, round)
);
alter table public.matches enable row level security;
create policy "matches: medlemmer leser" on public.matches for select to authenticated using (public.is_member());

-- De som har plass, i kørekkefølge.
create or replace function public.session_players(p_session uuid)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(profile_id order by updated_at), '{}')
    from (
      select a.profile_id, a.updated_at
        from public.attendance a
        join public.sessions s on s.id = a.session_id
       where a.session_id = p_session and a.going
       order by a.updated_at
       limit (select coalesce(capacity, 1000) from public.sessions where id = p_session)
    ) q
$$;

create or replace function public.draw_matches(p_session uuid)
returns setof public.matches
language plpgsql security definer
set search_path = public
as $$
declare
  players uuid[];
  p uuid[];
  n int;
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
  if exists (select 1 from public.matches where session_id = p_session and winner is not null) and not public.is_admin() then
    raise exception 'Resultater er alt registrert. Admin kan trekke på nytt.';
  end if;

  delete from public.matches where session_id = p_session;

  -- Tilfeldig rekkefølge.
  select array_agg(x order by random()) into p from unnest(players) x;

  if n = 4 then
    insert into public.matches (session_id, round, team_a, team_b) values
      (p_session, 1, array[p[1], p[2]], array[p[3], p[4]]);
  elsif n = 5 then
    -- Hvert par nøyaktig én gang, hver spiller sitter én runde.
    insert into public.matches (session_id, round, team_a, team_b, resting) values
      (p_session, 1, array[p[1], p[2]], array[p[3], p[4]], array[p[5]]),
      (p_session, 2, array[p[1], p[3]], array[p[2], p[5]], array[p[4]]),
      (p_session, 3, array[p[1], p[5]], array[p[2], p[4]], array[p[3]]),
      (p_session, 4, array[p[1], p[4]], array[p[3], p[5]], array[p[2]]),
      (p_session, 5, array[p[2], p[3]], array[p[4], p[5]], array[p[1]]);
  else
    -- Tre faste lag, alle møter alle.
    insert into public.matches (session_id, round, team_a, team_b, resting) values
      (p_session, 1, array[p[1], p[2]], array[p[3], p[4]], array[p[5], p[6]]),
      (p_session, 2, array[p[1], p[2]], array[p[5], p[6]], array[p[3], p[4]]),
      (p_session, 3, array[p[3], p[4]], array[p[5], p[6]], array[p[1], p[2]]);
  end if;

  return query select * from public.matches where session_id = p_session order by round;
end
$$;

-- Trykk på laget som vant. Samme lag igjen nullstiller.
create or replace function public.set_match_winner(p_match uuid, p_winner text)
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
  if p_winner is not null and p_winner not in ('a', 'b') then
    raise exception 'Ugyldig vinner';
  end if;
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Fant ikke kampen'; end if;
  players := public.session_players(m.session_id);
  if not (auth.uid() = any(players) or public.is_admin()) then
    raise exception 'Bare de som spilte kan registrere resultat' using errcode = '42501';
  end if;
  update public.matches set winner = p_winner where id = p_match returning * into m;
  return m;
end
$$;

-- Statistikk per sesong: oppmøte (fikk plass på holdt økt) og seire.
create or replace view public.season_stats
with (security_invoker = true) as
  with played as (
    select s.season_id, s.id as session_id, unnest(public.session_players(s.id)) as profile_id
      from public.sessions s where s.status = 'held'
  ),
  wins as (
    select s.season_id, unnest(case m.winner when 'a' then m.team_a when 'b' then m.team_b end) as profile_id
      from public.matches m join public.sessions s on s.id = m.session_id
     where m.winner is not null
  ),
  games as (
    select s.season_id, unnest(m.team_a || m.team_b) as profile_id
      from public.matches m join public.sessions s on s.id = m.session_id
     where m.winner is not null
  )
  select p.season_id, p.profile_id,
         count(distinct p.session_id) as sessions,
         (select count(*) from wins w where w.season_id = p.season_id and w.profile_id = p.profile_id) as wins,
         (select count(*) from games g where g.season_id = p.season_id and g.profile_id = p.profile_id) as games
    from played p
   group by p.season_id, p.profile_id;
grant select on public.season_stats to authenticated;
