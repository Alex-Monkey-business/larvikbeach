-- QA-runde 7. sep: to logikkfeil.
--
-- 1) En som admin har satt inaktiv ble aktiv igjen ved neste Google-innlogging:
--    invitasjonsraden blir liggende (accepted_at satt), og triggeren leste
--    «finnes i invites» som «invitert». Nå teller bare en ubrukt invitasjon.
--    app_metadata.invited er dødt (invite-member lager ikke brukere lenger).
-- 2) Poengene slettet på begge lag skal nullstille vinneren, slik kommentaren sa.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  invited boolean;
  wanted_role text;
  wanted_name text;
  wanted_phone text;
  avatar text := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
begin
  select * into inv from public.invites where email = lower(new.email);
  invited := found and inv.accepted_at is null;
  wanted_role  := coalesce(inv.role, 'player');
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

  if invited then
    update public.invites set accepted_at = now() where email = inv.email;
  end if;
  return new;
end
$$;

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
         winner = case when p_a is null and p_b is null then null
                       when p_a is null or p_b is null then winner
                       when p_a > p_b then 'a' when p_b > p_a then 'b' else null end
   where id = p_match
  returning * into m;
  return m;
end
$$;
