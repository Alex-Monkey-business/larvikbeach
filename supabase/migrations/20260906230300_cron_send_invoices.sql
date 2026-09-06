-- Daglig kall til Edge Function send-invoices med { from_cron: true }.
-- Funksjonen gjør bare noe på settings.billing_day. Nøklene ligger i vault
-- (se supabase/SETUP.md); mangler de, gjør jobben ingenting og logger det.
create extension if not exists pg_net with schema extensions;

create or replace function public.call_send_invoices()
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  functions_url text;
  service_key text;
begin
  select decrypted_secret into functions_url from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'service_role_key';
  if functions_url is null or service_key is null then
    raise notice 'send-invoices: vault mangler functions_url/service_role_key, hopper over';
    return;
  end if;
  perform net.http_post(
    url := functions_url || '/send-invoices',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := '{"from_cron": true}'::jsonb,
    timeout_milliseconds := 120000
  );
end
$$;

-- 06:05 UTC = 07:05/08:05 Oslo. Etter settle-jobben kl. :15 natta før.
select cron.schedule('send-invoices-daily', '5 6 * * *', $$select public.call_send_invoices()$$);
