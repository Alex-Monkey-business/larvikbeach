# Oppsett

## Lokalt

```
npm install
npx supabase start          # egne porter 553xx, kolliderer ikke med BenchBoss
npx supabase functions serve --no-verify-jwt   # egen terminal, holder Edge Functions oppe
npm run dev                 # http://localhost:5173
```

`.env.local` peker på lokal stack (se `.env.example`, nøkkelen fra `npx supabase status`).
E-post lokalt havner i Mailpit: http://127.0.0.1:55324. Innloggingskoden leses der.

Testdata (`supabase/seed.sql`): Alex er admin (`alexander.samnoy@gmail.com`), 12 spillere
(`ola1@example.com` osv.), vintersesong med fire holdte økter og august-regninger.
`npx supabase db reset` nullstiller. `npm run qa` kjører hele flyten i Playwright.

## Produksjon, første gang

1. `npx supabase login`, så `npx supabase projects create larvikbeach --org-id <org> --region eu-north-1 --db-password <passord>`.
2. `npx supabase link --project-ref <ref>` og `npx supabase db push`.
3. Auth i dashbordet: Email provider på, «Confirm email» av, OTP-lengde 6, utløp 600 s.
   SMTP: Resend (host smtp.resend.com, port 465, bruker `resend`, passord = API-nøkkel).
   E-postmal «Magic Link»: lim inn `supabase/templates/magic_link.html`.
   Site URL og Redirect URLs: prod-domenet.
4. Secrets til Edge Functions:
   ```
   npx supabase secrets set RESEND_API_KEY=re_... SITE_URL=https://<domene> MAIL_FROM="Larvik Beach Volley <ikke-svar@<domene>>"
   npx supabase functions deploy invite-member
   npx supabase functions deploy send-invoices
   ```
   Resend-domenet må være verifisert (DNS hos Cloudflare, samme oppskrift som BenchBoss).
5. Cron-nøkler i vault (SQL-editor i dashbordet):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_url');
   select vault.create_secret('<service_role key>', 'service_role_key');
   ```
6. Første admin: kjør i SQL-editor etter at du har logget inn én gang med koden
   (brukeren finnes da, men profilen er inaktiv):
   ```sql
   update profiles set role = 'admin', active = true where email = '<din e-post>';
   ```
   Alternativ: lag brukeren med invitasjon fra en annen admin.
7. Innstillinger i appen: Vipps-nummer, visningsnavn, regningsdag, admin-e-post.

## Netlify

Site fra GitHub-repoet, build `npm run build`, publish `dist` (ligger i `netlify.toml`).
Miljøvariabler: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` fra prod-prosjektet.

## Sikkerhetsmodell, kort

- E-postinnlogging må stå på i GoTrue for at koder skal virke. Derfor kan hvem som
  helst opprette en bruker via /otp. Triggeren `handle_new_user` gjør profilen
  **inaktiv** med mindre `app_metadata.invited = true`, som bare `invite-member`
  setter. Alle lesepolicyer krever `is_member()` (aktiv profil).
- `service_role` finnes bare i Edge Functions. Rollen leses alltid fra `profiles`.
- Alle skriv fra klienten som RLS kan filtrere bort har `.select()`; `npm run check:writes`
  håndhever det i build.
