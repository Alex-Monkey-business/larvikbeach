-- Kjerne: medlemmer, innstillinger, søknader.
-- Alle beløp i hele prosjektet er øre som integer.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  role text not null default 'player' check (role in ('admin', 'player')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Én rad. Primærnøkkelen kan bare være true, så en andre rad er umulig.
create table public.settings (
  id boolean primary key default true check (id),
  group_name text not null default 'Larvik Beach Volley',
  vipps_number text,
  vipps_display_name text,
  billing_day int not null default 1 check (billing_day between 1 and 28),
  settle_after_hours int not null default 3,
  admin_email text
);
insert into public.settings default values;

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles(id)
);

-- Rollen leses fra profiles, aldri fra klienten.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  )
$$;

-- Medlem = aktiv profil. Brukes i alle lesepolicyer, så en bruker som har
-- sneket seg inn via /otp uten invitasjon ser ingenting.
create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

-- Ny auth-bruker får profil. Bare brukere invite-member har opprettet er
-- aktive: funksjonen setter app_metadata.invited, som klienten ikke kan
-- sette selv (user_metadata kan den). E-postinnlogging må stå på i GoTrue
-- for at koder skal virke, så «signup» kan ikke skrus av der.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    case when coalesce((new.raw_app_meta_data->>'invited')::boolean, false)
         then coalesce(new.raw_user_meta_data->>'role', 'player') else 'player' end,
    coalesce((new.raw_app_meta_data->>'invited')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Spilleren redigerer bare navn og telefon, og bare sitt eget.
create or replace function public.update_my_profile(p_name text, p_phone text)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'Navnet må ha minst to tegn';
  end if;
  update public.profiles
     set name = trim(p_name), phone = nullif(trim(p_phone), '')
   where id = auth.uid()
  returning * into result;
  return result;
end
$$;

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.join_requests enable row level security;

create policy "profiles: medlemmer leser alle"
  on public.profiles for select to authenticated using (public.is_member());
create policy "profiles: admin skriver"
  on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "settings: medlemmer leser"
  on public.settings for select to authenticated using (public.is_member());
create policy "settings: admin skriver"
  on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Skjemaet på forsiden er det eneste anon får gjøre i hele basen.
create policy "join_requests: hvem som helst kan søke"
  on public.join_requests for insert to anon, authenticated
  with check (status = 'pending' and handled_at is null and handled_by is null);
create policy "join_requests: admin leser"
  on public.join_requests for select to authenticated using (public.is_admin());
create policy "join_requests: admin behandler"
  on public.join_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "join_requests: admin sletter"
  on public.join_requests for delete to authenticated using (public.is_admin());
