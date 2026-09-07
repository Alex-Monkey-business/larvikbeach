-- Nullstiller det QA-kjøringen endrer, så `npm run qa` kan kjøres igjen uten db reset.
-- Kjøres av scripts/qa.mjs via docker exec. Rører ikke Alex' innlogging.
delete from public.matches;
update public.invoices set status = 'open', claimed_at = null, confirmed_at = null where status in ('claimed', 'confirmed');
delete from public.join_requests where email like 'test%@example.com' or name = 'Test Testesen';
delete from public.invites where email like 'test%@example.com';
delete from auth.users where email like 'test%@example.com' or email = 'sniker@example.com';
-- Alex bakerst i køen på første planlagte økt (7 påmeldt, 6 plasser → venteliste nr. 1)
with s as (select id from public.sessions where status = 'planned' and starts_at > now() - interval '3 hours' order by starts_at limit 1),
     me as (select id from public.profiles where email = 'alexander.samnoy@gmail.com')
insert into public.attendance (session_id, profile_id, going, source, updated_at)
select s.id, me.id, true, 'self', now() from s, me
on conflict (session_id, profile_id) do update set going = true, updated_at = now();
