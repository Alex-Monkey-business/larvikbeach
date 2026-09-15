-- Gjestespillere: en profil trenger ikke lenger en innlogging.
--
-- Til nå var en profil låst til en auth-bruker (profiles.id pekte på
-- auth.users). Alt annet i basen — påmelding, kø, andeler, regninger, kamper,
-- statistikk — kjenner bare profil-id. Så i stedet for en egen gjestetabell og
-- to slags mennesker i fem funksjoner, kuttes den ene koblingen: profilen er
-- personregisteret, innlogging er én måte en person kan ha.
--
-- En gjest har rolle 'guest', telefon og ingen e-post. Telefonnummeret er
-- nøkkelen: samme nummer kan bare finnes én gang, så samme gjest lages aldri
-- to ganger. Blir gjesten fast, tar innloggingen over profilen (og
-- historikken) når invitasjonen har samme nummer.
--
-- Gjesten skylder selv. Andelen går rett på en egen regning per økt når økta
-- gjøres opp, ikke på månedsregningen, så admin kan kreve inn samme kveld.

-- 1. Profilen står på egne bein --------------------------------------------

alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles alter column email drop not null;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'player', 'guest'));

-- Slettes brukeren i Auth, forsvinner profilen fortsatt — det var det den
-- gamle fremmednøkkelen gjorde, og QA-oppsettet lener seg på det.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- 2. Telefonnummeret er nøkkelen -------------------------------------------

-- «917 12 345», «+47 917 12 345» og «0047 91712345» er samme nummer.
create or replace function public.norm_phone(p text)
returns text
language sql immutable
as $$
  select case
    when p is null or d = '' then null
    when d ~ '^0047' and length(d) = 12 then '+47' || substr(d, 5)
    when d ~ '^47' and length(d) = 10 then '+' || d
    when length(d) = 8 then '+47' || d
    when p ~ '^\s*\+' then '+' || d
    else d
  end
  from (select regexp_replace(p, '\D', '', 'g') as d) x
$$;

alter table public.profiles
  add column phone_key text generated always as (public.norm_phone(phone)) stored;

create unique index profiles_phone_key_idx on public.profiles (phone_key) where phone_key is not null;

-- Et nummer noen andre har skal gi en setning, ikke en feilkode.
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
exception when unique_violation then
  raise exception 'Nummeret er registrert på noen andre';
end
$$;

-- 3. Hvem tok med gjesten ----------------------------------------------------

alter table public.attendance drop constraint attendance_source_check;
alter table public.attendance add constraint attendance_source_check
  check (source in ('self', 'admin', 'host'));
alter table public.attendance
  add column added_by uuid references public.profiles(id) on delete set null;

-- Et medlem tar med en gjest. Nummeret først: finnes det, er det samme gjest.
-- Samme påmeldingsregler som for alle andre; gjesten stiller seg i køen fra nå.
create or replace function public.add_guest(p_session uuid, p_phone text, p_name text default null)
returns public.profiles
language plpgsql security definer
set search_path = public
as $$
declare
  key text := public.norm_phone(p_phone);
  admin boolean := public.is_admin();
  s public.sessions%rowtype;
  g public.profiles%rowtype;
  window_days int;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  if key is null or length(key) < 8 then
    raise exception 'Telefonnummeret mangler';
  end if;

  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  if not admin then
    if s.status <> 'planned' then
      raise exception 'Økta er avsluttet';
    end if;
    if s.starts_at <= now() then
      raise exception 'Påmeldingen er stengt, økta har startet';
    end if;
    select signup_window_days into window_days from public.settings;
    if s.starts_at > now() + make_interval(days => window_days) then
      raise exception 'Påmeldingen åpner %', to_char((s.starts_at - make_interval(days => window_days)) at time zone 'Europe/Oslo', 'DD.MM.');
    end if;
  end if;

  select * into g from public.profiles where phone_key = key;
  if found and g.role <> 'guest' then
    raise exception '% er medlem og melder seg på selv', g.name;
  end if;
  if not found then
    if length(trim(coalesce(p_name, ''))) < 2 then
      raise exception 'Navnet mangler';
    end if;
    insert into public.profiles (name, phone, role, active)
    values (trim(p_name), trim(p_phone), 'guest', true)
    returning * into g;
  end if;

  insert into public.attendance (session_id, profile_id, going, source, added_by)
  values (p_session, g.id, true, 'host', auth.uid())
  on conflict (session_id, profile_id) do update
    set going = true,
        source = 'host',
        added_by = coalesce(public.attendance.added_by, excluded.added_by),
        updated_at = case when public.attendance.going then public.attendance.updated_at else now() end;

  if s.status = 'held' then
    perform public.settle_session(p_session);
  end if;
  return g;
end
$$;

-- Den som tok med gjesten kan også melde gjesten av. Ellers som før.
create or replace function public.set_attendance(p_session uuid, p_going boolean, p_profile uuid default null)
returns public.attendance
language plpgsql security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_profile, auth.uid());
  admin boolean := public.is_admin();
  s public.sessions%rowtype;
  window_days int;
  result public.attendance;
begin
  if not public.is_member() then
    raise exception 'Ikke medlem' using errcode = '42501';
  end if;
  if target <> auth.uid() and not admin then
    if not exists (
      select 1 from public.attendance a
      join public.profiles p on p.id = a.profile_id
      where a.session_id = p_session and a.profile_id = target
        and p.role = 'guest' and a.added_by = auth.uid()
    ) then
      raise exception 'Du kan bare melde på deg selv' using errcode = '42501';
    end if;
  end if;

  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  if not admin then
    if s.status <> 'planned' then
      raise exception 'Økta er avsluttet';
    end if;
    if s.starts_at <= now() then
      raise exception 'Påmeldingen er stengt, økta har startet';
    end if;
    select signup_window_days into window_days from public.settings;
    if s.starts_at > now() + make_interval(days => window_days) then
      raise exception 'Påmeldingen åpner %', to_char((s.starts_at - make_interval(days => window_days)) at time zone 'Europe/Oslo', 'DD.MM.');
    end if;
  end if;

  insert into public.attendance (session_id, profile_id, going, source)
  values (p_session, target, p_going,
          case when target = auth.uid() then 'self' when admin then 'admin' else 'host' end)
  on conflict (session_id, profile_id) do update
    set going = excluded.going,
        source = excluded.source,
        updated_at = case when public.attendance.going = excluded.going then public.attendance.updated_at else now() end
  returning * into result;

  if s.status = 'held' then
    perform public.settle_session(p_session);
  end if;
  return result;
end
$$;

-- 4. Gjesten får regningen med én gang -------------------------------------

-- En gjesteregning gjelder én økt (session_id satt). Medlemmenes gjelder en
-- måned (session_id null). Den gamle unike regelen per (person, måned)
-- deles derfor i to.
alter table public.invoices
  add column session_id uuid references public.sessions(id) on delete cascade;
alter table public.invoices drop constraint invoices_profile_id_period_key;
create unique index invoices_member_period_idx on public.invoices (profile_id, period) where session_id is null;
create unique index invoices_guest_session_idx on public.invoices (profile_id, session_id) where session_id is not null;
create index invoices_session_idx on public.invoices (session_id);

create or replace function public.settle_session(p_session uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  n int;
  share int;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then
    raise exception 'Fant ikke økta';
  end if;
  -- Låst når et medlems andel står på en regning, eller en gjesteregning er
  -- sendt. En gjesteregning som ennå ikke er sendt regnes om sammen med økta.
  if exists (
    select 1 from public.charges c
    join public.invoices i on i.id = c.invoice_id
    join public.profiles p on p.id = c.profile_id
    where c.session_id = p_session and (p.role <> 'guest' or i.status <> 'open')
  ) then
    raise exception 'Økta er allerede med på en regning og kan ikke regnes om';
  end if;
  delete from public.charges where session_id = p_session;
  delete from public.invoices where session_id = p_session and status = 'open';
  if s.status <> 'held' or s.cost = 0 then
    return;
  end if;

  create temp table if not exists payers (profile_id uuid) on commit drop;
  delete from payers;
  insert into payers
    select profile_id from public.attendance
     where session_id = p_session and going
     order by updated_at
     limit coalesce(s.capacity, 1000000);
  select count(*) into n from payers;
  if n = 0 then
    return;
  end if;
  share := ceil(s.cost::numeric / n / 100) * 100;
  insert into public.charges (session_id, profile_id, amount)
  select p_session, profile_id, share from payers;

  -- Gjestene: én regning per økt, klar til å kreves inn samme kveld.
  insert into public.invoices (profile_id, period, amount, session_id)
  select c.profile_id, to_char(s.starts_at at time zone 'Europe/Oslo', 'YYYY-MM'), c.amount, p_session
    from public.charges c
    join public.profiles p on p.id = c.profile_id
   where c.session_id = p_session and p.role = 'guest';
  update public.charges c
     set invoice_id = i.id
    from public.invoices i
   where i.session_id = p_session and i.profile_id = c.profile_id and c.session_id = p_session;
end
$$;

-- Månedsregningen er medlemmenes. Gjestenes andeler er alt fakturert, og
-- regningen som slås opp må være en månedsregning, ikke en gjesteregning.
create or replace function public.create_invoices(p_period text default null)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_period text := coalesce(p_period, to_char((now() at time zone 'Europe/Oslo') - interval '1 month', 'YYYY-MM'));
  v_period_end timestamptz;
  r record;
  inv_id uuid;
  n int := 0;
begin
  v_period_end := (to_date(v_period, 'YYYY-MM') + interval '1 month') at time zone 'Europe/Oslo';
  for r in
    select c.profile_id, sum(c.amount) as total, array_agg(c.id) as charge_ids
      from public.charges c
      join public.sessions s on s.id = c.session_id
      join public.profiles p on p.id = c.profile_id
     where c.invoice_id is null
       and p.role <> 'guest'
       and s.status = 'held'
       and s.starts_at < v_period_end
     group by c.profile_id
  loop
    select id into inv_id from public.invoices
     where profile_id = r.profile_id and period = v_period and session_id is null;
    if found then
      if (select status from public.invoices where id = inv_id) <> 'open' then
        continue;  -- alt varslet; disse andelene blir med neste måned
      end if;
      update public.invoices set amount = amount + r.total where id = inv_id;
    else
      insert into public.invoices (profile_id, period, amount)
      values (r.profile_id, v_period, r.total)
      returning id into inv_id;
    end if;
    update public.charges set invoice_id = inv_id where id = any(r.charge_ids);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- 5. Gjesten blir fast -------------------------------------------------------

-- Alt som peker på den ene profilen pekes over på den andre, så slettes den.
create or replace function public.merge_profiles(p_from uuid, p_to uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_from = p_to then return; end if;
  -- Samme person to ganger på samme økt: den gamle raden ryker.
  delete from public.attendance a where a.profile_id = p_from
     and exists (select 1 from public.attendance b where b.session_id = a.session_id and b.profile_id = p_to);
  update public.attendance set profile_id = p_to where profile_id = p_from;
  update public.attendance set added_by = p_to where added_by = p_from;
  delete from public.charges c where c.profile_id = p_from
     and exists (select 1 from public.charges d where d.session_id = c.session_id and d.profile_id = p_to);
  update public.charges set profile_id = p_to where profile_id = p_from;
  update public.invoices set profile_id = p_to where profile_id = p_from;
  update public.matches
     set team_a = array_replace(team_a, p_from, p_to),
         team_b = array_replace(team_b, p_from, p_to),
         resting = array_replace(resting, p_from, p_to)
   where p_from = any(team_a) or p_from = any(team_b) or p_from = any(resting);
  update public.session_teams set members = array_replace(members, p_from, p_to) where p_from = any(members);
  update public.session_teams set set_by = p_to where set_by = p_from;
  update public.join_requests set handled_by = p_to where handled_by = p_from;
  update public.invites set invited_by = p_to where invited_by = p_from;
  delete from public.profiles where id = p_from;
end
$$;

-- Første innlogging: har invitasjonen samme nummer som en gjest, arver den nye
-- brukeren gjestens historikk. Nummeret settes til slutt, etter at gjesten er
-- borte, ellers stopper unik-regelen på nummer innsettingen.
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
  guest_id uuid;
  avatar text := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
begin
  select * into inv from public.invites where email = lower(new.email);
  invited := found and inv.accepted_at is null;
  wanted_role  := coalesce(inv.role, 'player');
  wanted_name  := coalesce(inv.name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  wanted_phone := coalesce(inv.phone, new.raw_user_meta_data->>'phone');

  if invited then
    select id into guest_id from public.profiles
     where role = 'guest' and phone_key = public.norm_phone(wanted_phone);
  end if;

  insert into public.profiles (id, name, email, phone, role, active, avatar_url)
  values (new.id, wanted_name, lower(new.email), case when guest_id is null then wanted_phone end,
          case when invited then wanted_role else 'player' end, invited, avatar)
  on conflict (id) do update
    set active = public.profiles.active or invited,
        role   = case when invited and not public.profiles.active then wanted_role else public.profiles.role end,
        name   = case when public.profiles.active then public.profiles.name else wanted_name end,
        phone  = coalesce(public.profiles.phone, case when guest_id is null then wanted_phone end),
        avatar_url = coalesce(avatar, public.profiles.avatar_url);

  if guest_id is not null then
    perform public.merge_profiles(guest_id, new.id);
    update public.profiles set phone = wanted_phone where id = new.id and phone is null;
  end if;

  if invited then
    update public.invites set accepted_at = now() where email = inv.email;
  end if;
  return new;
end
$$;
