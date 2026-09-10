-- Hvem bruker Larvik Beach som installert app, og ikke i nettleseren.
--
-- Samme form som i BenchBoss, med vilje: dashbordet leser begge og skal ikke
-- trenge å kunne to varianter.
--
-- Andelen kan telemetrien svare på uten å vite hvem noen er. «Hvem» hører
-- hjemme her, i basen der auth.uid() verifiserer identiteten.
alter table public.profiles
  add column if not exists pwa_sist_sett timestamptz;

comment on column public.profiles.pwa_sist_sett is
  'Sist gang brukeren åpnet appen installert (display-mode standalone, eller navigator.standalone på iOS). Null = alltid i nettleser.';

-- Ingen ny UPDATE-policy. RLS kan ikke begrense hvilke kolonner en policy
-- slipper til, og profiles her har både `role` og `active` — en policy som
-- lot brukeren skrive til egen rad ville latt henne gjøre seg selv til admin.
-- Derfor en security definer-funksjon som rører én kolonne på egen rad.
create or replace function public.meld_pwa()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set pwa_sist_sett = now()
   where id = auth.uid();
$$;

revoke all on function public.meld_pwa() from public, anon;
grant execute on function public.meld_pwa() to authenticated;

comment on function public.meld_pwa() is
  'Stempler egen profil som «åpnet som app». Security definer fordi profiles bare har admin-UPDATE — og det skal den fortsette å ha.';
