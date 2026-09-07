-- Poengregnskap: scoret, sluppet inn, og differansen. Bare kamper der noen
-- har lagt inn poeng teller; en vinner satt med et trykk gir ingen poeng.
create or replace view public.season_stats
with (security_invoker = true) as
  with played as (
    select s.season_id, s.id as session_id, unnest(public.session_players(s.id)) as profile_id
      from public.sessions s where s.status = 'held'
  ),
  scored as (
    select m.session_id, unnest(m.team_a) as profile_id, m.score_a as f, m.score_b as a
      from public.matches m where m.score_a is not null and m.score_b is not null
    union all
    select m.session_id, unnest(m.team_b), m.score_b, m.score_a
      from public.matches m where m.score_a is not null and m.score_b is not null
  ),
  points as (
    select s.season_id, x.profile_id, sum(x.f)::int as pf, sum(x.a)::int as pa
      from scored x join public.sessions s on s.id = x.session_id
     group by s.season_id, x.profile_id
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
         (select count(*) from games g where g.season_id = p.season_id and g.profile_id = p.profile_id) as games,
         coalesce((select pf from points x where x.season_id = p.season_id and x.profile_id = p.profile_id), 0) as points_for,
         coalesce((select pa from points x where x.season_id = p.season_id and x.profile_id = p.profile_id), 0) as points_against,
         coalesce((select pf - pa from points x where x.season_id = p.season_id and x.profile_id = p.profile_id), 0) as points_diff
    from played p
   group by p.season_id, p.profile_id;
grant select on public.season_stats to authenticated;
