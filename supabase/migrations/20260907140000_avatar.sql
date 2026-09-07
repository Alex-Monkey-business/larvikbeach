-- Profilbilde fra Google (user_metadata.avatar_url/picture). Andre får initialer i appen.
alter table public.profiles add column avatar_url text;

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
  avatar text := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
begin
  select * into inv from public.invites where email = lower(new.email);
  invited := via_meta or found;
  wanted_role  := coalesce(inv.role, new.raw_user_meta_data->>'role', 'player');
  wanted_name  := coalesce(inv.name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  wanted_phone := coalesce(inv.phone, new.raw_user_meta_data->>'phone');

  insert into public.profiles (id, name, email, phone, role, active, avatar_url)
  values (new.id, wanted_name, lower(new.email), wanted_phone,
          case when invited then wanted_role else 'player' end, invited, avatar)
  on conflict (id) do update
    set active = public.profiles.active or invited,
        role   = case when invited and not public.profiles.active then wanted_role else public.profiles.role end,
        name   = case when public.profiles.active then public.profiles.name else wanted_name end,
        phone  = coalesce(public.profiles.phone, wanted_phone),
        avatar_url = coalesce(avatar, public.profiles.avatar_url);

  if inv.email is not null and inv.accepted_at is null then
    update public.invites set accepted_at = now() where email = inv.email;
  end if;
  return new;
end
$$;

-- Brukere som alt finnes: hent bildet de har.
update public.profiles p
   set avatar_url = coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
  from auth.users u
 where u.id = p.id and p.avatar_url is null;
