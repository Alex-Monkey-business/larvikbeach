-- Push-varsler: én rad per telefon som har sagt ja.
--
-- Et abonnement er en adresse hos Apple/Google (endpoint) pluss to nøkler som
-- krypterer innholdet. Bare sendefunksjonen (service-nøkkel) leser dem. Appen
-- skriver gjennom to funksjoner som stempler auth.uid(), samme grep som
-- meld_pwa: ingen direkte skrivetilgang til tabellen.
create table public.push_abonnement (
  endpoint   text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index push_abonnement_profile on public.push_abonnement(profile_id);

alter table public.push_abonnement enable row level security;
revoke all on public.push_abonnement from anon, authenticated;

-- Samme telefon kan bytte eier (ny innlogging på samme mobil). Da følger
-- abonnementet den som er logget inn nå.
create or replace function public.lagre_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_abonnement (endpoint, profile_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;

create or replace function public.fjern_push(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_abonnement where endpoint = p_endpoint and profile_id = auth.uid();
$$;

revoke all on function public.lagre_push(text, text, text) from public, anon;
revoke all on function public.fjern_push(text) from public, anon;
grant execute on function public.lagre_push(text, text, text) to authenticated;
grant execute on function public.fjern_push(text) to authenticated;
