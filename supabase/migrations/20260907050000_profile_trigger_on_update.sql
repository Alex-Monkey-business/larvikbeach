-- GoTrue skriver app_metadata i en UPDATE etter at raden er satt inn, så en
-- trigger som bare ser INSERT rekker ikke å se `invited`. Vi lytter på begge og
-- lar en senere `invited` aktivere profilen (og gi rollen fra metadataene).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  invited boolean := coalesce((new.raw_app_meta_data->>'invited')::boolean, false);
  wanted_role text := coalesce(new.raw_user_meta_data->>'role', 'player');
begin
  insert into public.profiles (id, name, email, phone, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    case when invited then wanted_role else 'player' end,
    invited
  )
  on conflict (id) do update
    set active = public.profiles.active or invited,
        role   = case when invited and public.profiles.role = 'player' and not public.profiles.active
                      then wanted_role else public.profiles.role end,
        name   = case when public.profiles.active then public.profiles.name
                      else coalesce(new.raw_user_meta_data->>'name', public.profiles.name) end,
        phone  = coalesce(public.profiles.phone, new.raw_user_meta_data->>'phone');
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of raw_app_meta_data, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- Brukere som alt er invitert men ble inaktive før denne fiksen.
update public.profiles p
   set active = true,
       role = coalesce(u.raw_user_meta_data->>'role', p.role)
  from auth.users u
 where u.id = p.id
   and not p.active
   and coalesce((u.raw_app_meta_data->>'invited')::boolean, false);
