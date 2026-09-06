-- Sesonger, økter og påmelding.

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('indoor', 'outdoor')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  default_cost int not null default 0 check (default_cost >= 0),
  default_location text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 90 check (duration_min > 0),
  location text,
  cost int not null check (cost >= 0),
  status text not null default 'planned' check (status in ('planned', 'held', 'cancelled')),
  note text,
  created_at timestamptz not null default now()
);
create index sessions_starts_at_idx on public.sessions (starts_at);

create table public.attendance (
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  going boolean not null,
  source text not null default 'self' check (source in ('self', 'admin')),
  updated_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

alter table public.seasons enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

create policy "seasons: medlemmer leser" on public.seasons for select to authenticated using (public.is_member());
create policy "seasons: admin skriver" on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "sessions: medlemmer leser" on public.sessions for select to authenticated using (public.is_member());
create policy "sessions: admin skriver" on public.sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Hvem som kommer er poenget med appen: alle medlemmer ser alle.
create policy "attendance: medlemmer leser" on public.attendance for select to authenticated using (public.is_member());
-- Skriving kun via set_attendance.

-- Anon får se kommende økter uten navn (forsiden). Egen visning, ikke policy.
create or replace view public.public_upcoming_sessions
with (security_invoker = false) as
  select s.id, s.starts_at, s.duration_min, s.location, se.kind,
         (select count(*) from public.attendance a where a.session_id = s.id and a.going) as going_count
    from public.sessions s
    join public.seasons se on se.id = s.season_id
   where s.status = 'planned' and s.starts_at > now()
   order by s.starts_at
   limit 3;
grant select on public.public_upcoming_sessions to anon, authenticated;
