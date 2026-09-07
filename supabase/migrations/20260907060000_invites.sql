-- Invitasjon = godkjent e-postadresse, ikke en forhåndsopprettet bruker.
--
-- Første innlogging (e-postkode, Google eller Microsoft) oppretter auth-brukeren.
-- Triggeren slår opp e-posten her og gjør profilen aktiv med riktig rolle.
-- Da trenger ikke Supabase å «koble» en Google-identitet til en eksisterende
-- bruker, som er skjørt (Microsoft merker sjelden e-posten som verifisert).
create table public.invites (
  email text primary key,
  name text not null,
  phone text,
  role text not null default 'player' check (role in ('admin', 'player')),
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.invites enable row level security;
create policy "invites: admin" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  via_meta boolean := coalesce((new.raw_app_meta_data->>'invited')::boolean, false);
  invited boolean;
  wanted_role text;
  wanted_name text;
  wanted_phone text;
begin
  select * into inv from public.invites where email = lower(new.email);
  invited := via_meta or found;
  wanted_role  := coalesce(inv.role, new.raw_user_meta_data->>'role', 'player');
  wanted_name  := coalesce(inv.name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  wanted_phone := coalesce(inv.phone, new.raw_user_meta_data->>'phone');

  insert into public.profiles (id, name, email, phone, role, active)
  values (new.id, wanted_name, lower(new.email), wanted_phone,
          case when invited then wanted_role else 'player' end, invited)
  on conflict (id) do update
    set active = public.profiles.active or invited,
        role   = case when invited and not public.profiles.active then wanted_role else public.profiles.role end,
        name   = case when public.profiles.active then public.profiles.name else wanted_name end,
        phone  = coalesce(public.profiles.phone, wanted_phone);

  if inv.email is not null and inv.accepted_at is null then
    update public.invites set accepted_at = now() where email = inv.email;
  end if;
  return new;
end
$$;

-- Admin inviterer. Finnes personen alt som bruker, aktiveres profilen direkte.
create or replace function public.invite(p_email text, p_name text, p_phone text default null, p_role text default 'player')
returns public.invites
language plpgsql security definer
set search_path = public
as $$
declare
  e text := lower(trim(p_email));
  result public.invites;
begin
  if not public.is_admin() then
    raise exception 'Kun admin' using errcode = '42501';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ugyldig e-post';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'Navn mangler';
  end if;
  if p_role not in ('admin', 'player') then
    raise exception 'Ugyldig rolle';
  end if;

  insert into public.invites (email, name, phone, role, invited_by)
  values (e, trim(p_name), nullif(trim(p_phone), ''), p_role, auth.uid())
  on conflict (email) do update
    set name = excluded.name, phone = coalesce(excluded.phone, public.invites.phone),
        role = excluded.role, invited_by = excluded.invited_by, created_at = now()
  returning * into result;

  -- Har hen alt logget inn (og blitt inaktiv), slipp hen inn nå.
  update public.profiles
     set active = true, role = p_role, name = case when active then name else trim(p_name) end
   where email = e;
  if found then
    update public.invites set accepted_at = now() where email = e returning * into result;
  end if;
  return result;
end
$$;
