# Overlevering til Claude Code

## Oppdrag og godkjent resultat

Brukeren har godkjent den nye statistikksiden, inkludert poengdifferansen: «det ble supernice». Behold design, hierarki og animasjoner. Neste steg er teknisk gjennomgang og klargjøring for commit, ikke en ny redesign.

Leaderboardet er hovedinnholdet. Lederne løftes frem med avatar, krone, navn, resultat og forsprang. Egen plass er markert. Seire vises først når det finnes kamper, ellers oppmøte; brukeren kan bytte mellom begge. Dette standardvalget ble gjort av Codex, ikke eksplisitt valgt av brukeren.

Seire-tabellen har en egen +/−-kolonne med fortegn og forklaring. Poengdifferansen er informasjon, ikke tiebreaker: like seiertall gir delt rang (1, 1, 3), og navn brukes bare for stabil rekkefølge. Alle med delt førsteplass vises i lederseksjonen. Null resultater utroper ingen leder.

Animasjoner: lederseksjon med innfading og lysstrøk, krone som lander, resultatteller, forskjøvet innkomst av rader og animerte plassbytter ved kategoribytte. Replay-knappen spiller presentasjonen igjen. Redusert bevegelse støttes. Ingen nye pakker.

Kamptabell, oppmøterutenett og økthistorikk er beholdt under den sammenleggbare «Mer fra sesongen». Ingen backend-, database- eller rangeringsregelendringer i databasen.

## Filer i arbeidsmappen

- `src/components/Leaderboard.tsx` — ny komponent, kategorier, rangering, lederseksjon, radanimasjoner og poengdifferanse.
- `src/components/Leaderboard.css` — nytt visuelt uttrykk og mobiltilpasning.
- `src/pages/play/Stats.tsx` — integrasjon; gammel plakat og oppmøteløp fjernet, detaljer samlet.
- `src/pages/play/Stats.css` — ryddet styling, detaljseksjon og beholdt rutenett.
- `src/pages/public/Login.tsx` — separat lokal innloggingsretting, se nedenfor.
- `scripts/qa-leaderboard.mjs` — nettlesersjekk med isolerte API-svar og syntetisk innlogging.

Logo/ball-animasjonen fra tidligere i samtalen er allerede i eksisterende git-tilstand og er ikke del av disse ucommittede endringene.

## Lokal innlogging

Forhåndsvisningen kjører på `http://127.0.0.1:5174`, lokal Supabase på port 55321. Google OAuth svarte 400: «Unsupported provider: provider is not enabled».

Login bruker derfor e-postkode direkte når `import.meta.env.DEV` er sann og Supabase-verten er lokal. Google skjules bare i denne situasjonen. Produksjonsbygg beholder Google-flyten. Lokal innlogging viser lenke til Mailpit på `http://127.0.0.1:55324`.

Den seedede lokale adminkontoen er `alexander.samnoy@gmail.com`. Be om en ny kode og hent den i Mailpit; ingen ekstern e-post sendes. Ekte lokal kodeinnlogging og lasting av leaderboardet er verifisert. Google OAuth i produksjon ble ikke testet eller endret.

## Verifisering

- Siste `npm run build`: bestått, inkludert check:writes og TypeScript.
- `npm run lint`: ingen feil; advarsler i eksisterende komponenter utenfor det nye leaderboardet.
- `node scripts/qa-leaderboard.mjs`: bestått etter at +/−-kolonnen ble lagt inn.
- Nettlesersjekken dekker 320/390/768/1440 px, sortering, kategoribytte og faktiske radanimasjoner, detaljseksjon, redusert bevegelse, delte plasseringer, lange navn, nullresultater, tomme data, feil/prøv igjen, tastatur/replay og kjøretidsfeil.
- Skjermbilder med testdata: `qa/leaderboard/390.png` og `qa/leaderboard/1440.png`.
- Testen bruker port 5174 som standard; overstyr med `QA_APP` ved behov. Ingen reelle påmeldinger, kamper eller betalinger endres av denne testen.

## Til teknisk gjennomgang

1. Gjennomgå diffen og behold det godkjente uttrykket. Bekreft at delt plassering basert på antall seire fortsatt er ønsket; ikke innfør poengdifferanse som tiebreaker uten brukeravklaring.
2. Den eldre `scripts/qa.mjs` antar fortsatt at lokal innlogging først viser Google og «Annen e-post». Oppdater disse forventningene og det ubetingede klikket på «Annen e-post» dersom den testen skal kjøres med den nye lokale kodeflyten. Hele denne gamle testen er ikke kjørt i denne runden; den kan resette/modifisere lokale testdata.
3. `scripts/qa-ui.mjs` har gamle forventninger om en «Oppmøte»-overskrift i statistikkens feilgjenoppretting. Tilpass ved kjøring mot den nye siden. Ikke hev at hele gamle UI-suiten er kjørt.
4. Foreta eventuell avsluttende kontroll i Safari/iOS og med skjermleser; det er ikke verifisert her.

Endringene er ikke committet eller publisert. Ikke deploy uten at brukeren ber om det.
