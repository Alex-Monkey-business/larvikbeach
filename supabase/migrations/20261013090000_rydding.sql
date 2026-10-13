-- Rydding: første utgave av draw_matches og innstillinger ingen leser.
--
-- draw_matches(uuid) er fra 7. sep. Den nye har et valgfritt andre argument,
-- og med begge liggende er et kall med ett argument tvetydig.
-- billing_day, admin_email og email_invoices hørte til e-postregningene (ute
-- 7. okt), settle_after_hours er erstattet av settle_after_minutes. Appen
-- sender dem ikke lenger (84ebdc6).
--
-- Rundene (billing_runs, invoices.run_id) blir stående med vilje: Alex
-- bruker dem til å holde styr på betalingen.

drop function if exists public.draw_matches(uuid);

alter table public.settings
  drop column if exists billing_day,
  drop column if exists admin_email,
  drop column if exists email_invoices,
  drop column if exists settle_after_hours;
