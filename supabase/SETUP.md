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
6. Første admin: legg e-posten i `invites` med rolle admin før første innlogging:
   ```sql
   insert into invites (email, name, role) values ('<din e-post>', 'Navn', 'admin');
   ```
7. Innstillinger i appen: Vipps-nummer, visningsnavn, regningsdag, admin-e-post.

## Google- og Microsoft-innlogging

Begge er OAuth-leverandører i Supabase Auth. Redirect-URL hos leverandøren er alltid
`https://pcaibrrpmervwjfzcont.supabase.co/auth/v1/callback`.

**Google:** console.cloud.google.com → nytt prosjekt → APIs & Services → OAuth consent
screen (External, legg til deg selv som testbruker til appen er publisert) → Credentials →
Create OAuth client ID, Web application, redirect-URL over. Ta vare på Client ID og secret.

**Microsoft:** portal.azure.com → Microsoft Entra ID → App registrations → New registration.
Supported account types: **«Accounts in any organizational directory and personal Microsoft
accounts»** (ellers virker ikke Hotmail/Outlook). Redirect URI: Web, URL over.
Certificates & secrets → New client secret (noter verdien, ikke ID-en).
Token configuration → Add optional claim → ID → `email` og `xms_edov` (så e-posten regnes
som verifisert). API permissions: `email`, `openid`, `profile`, `User.Read`.

Legg inn i Supabase (Management API eller dashbordet, Authentication → Providers):
`external_google_enabled/client_id/secret`, `external_azure_enabled/client_id/secret`,
`external_azure_url = https://login.microsoftonline.com/common`.

Invitasjonsmodellen gjør at ingen identitetskobling trengs: `invites` er en godkjent
e-postliste, første innlogging (uansett metode) oppretter brukeren, og triggeren aktiverer
profilen hvis e-posten står der.

## Netlify

Site fra GitHub-repoet, build `npm run build`, publish `dist` (ligger i `netlify.toml`).
Miljøvariabler: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` fra prod-prosjektet.

## Sikkerhetsmodell, kort

- Hvem som helst kan opprette en bruker (kode, Google, Microsoft). Triggeren
  `handle_new_user` gjør profilen **inaktiv** med mindre e-posten står i `invites`
  (eller `app_metadata.invited`, som seed bruker). Alle lesepolicyer krever
  `is_member()` (aktiv profil), så en uinvitert bruker ser null rader.
- `service_role` finnes bare i Edge Functions. Rollen leses alltid fra `profiles`.
- Alle skriv fra klienten som RLS kan filtrere bort har `.select()`; `npm run check:writes`
  håndhever det i build.
