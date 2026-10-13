-- Svar rett fra varselet: «Kommer» / «Kommer ikke» uten å åpne appen.
--
-- Tjenestearbeideren har ingen innlogging. Funksjonen `svar` sjekker en signert
-- billett (person + økt) og kaller denne med service-nøkkelen. Den later som
-- personen er innlogget i denne ene transaksjonen og kaller set_attendance, så
-- alle reglene (vindu, stengt økt, venteliste, oppgjør) er nøyaktig de samme
-- som i appen. Ingen kopi å holde i takt.
create or replace function public.svar_fra_varsel(p_session uuid, p_profile uuid, p_going boolean)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_profile::text, true);
  return public.set_attendance(p_session, p_going);
end;
$$;

revoke all on function public.svar_fra_varsel(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.svar_fra_varsel(uuid, uuid, boolean) to service_role;
