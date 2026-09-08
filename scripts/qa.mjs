// Gjennomkjøring mot lokal stack: `npm run qa`.
// Krever `supabase start`, `supabase functions serve` og `vite` kjørende.
// Logger inn via Mailpit (henter koden fra e-posten), går gjennom spiller- og
// adminflaten, og måler scrollX på 390 px. Skjermbilder i qa/.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const MAIL = process.env.MAIL_URL ?? 'http://127.0.0.1:55324'
const ADMIN = 'alexander.samnoy@gmail.com'
const PLAYER = 'ola1@example.com'
const INVITEE = `test${Date.now()}@example.com`
mkdirSync('qa', { recursive: true })

// Gjentakbar: rydd det forrige kjøring endret (kamper, regningsstatus, testbrukere).
if (!process.env.QA_NO_RESET) {
  execSync('docker exec -i supabase_db_larvikbeach psql -U postgres -v ON_ERROR_STOP=1 -q', { input: readFileSync('scripts/qa-reset.sql') })
}

const sql = (text) => execSync('docker exec -i supabase_db_larvikbeach psql -U postgres -v ON_ERROR_STOP=1 -q', { input: text })

const fails = []
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log(`${cond ? 'ok  ' : 'FEIL'} ${msg}`) }

async function latestCode(to) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json()
    const m = list.messages?.[0]
    if (m) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()
      const code = (full.Text ?? full.HTML ?? '').match(/\b(\d{6})\b/)?.[1]
      if (code) { await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [m.ID] }) }); return code }
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Ingen kode til ${to}`)
}

async function login(page, email, gransk = false) {
  await page.goto(`${APP}/logg-inn`)
  if (gransk) {
    // Skjermen har én handling. Alt annet — meny, bunntekst, ingress — er borte,
    // og koden ligger bak en lenke til noen ber om den.
    ok(await page.locator('.nav-wrap').count() === 0, 'logg-inn: ingen meny')
    ok(await page.locator('footer').count() === 0, 'logg-inn: ingen bunntekst')
    ok(await page.locator('input[type=email]').count() === 0, 'logg-inn: e-postfeltet ligger bak «Annen e-post»')
    const valg = (await page.locator('.login-copy button:visible').allInnerTexts()).map(t => t.trim())
    ok(valg.join(' | ') === 'Fortsett med Google | Annen e-post', `logg-inn: to valg, Google og koden bak en lenke (${valg.join(' | ')})`)
    const fin = await page.locator('.hero-fin a').allInnerTexts()
    ok(fin.join(', ') === 'Bli med, Personvern', `logg-inn: bunnlinja er to stille lenker (${fin.join(', ')})`)
  }
  // Koden er reserven: feltet må hentes fram.
  await page.locator('button:has-text("Annen e-post")').click()
  await page.waitForSelector('input[type=email]')
  if (gransk) {
    const google = await page.locator('button:has-text("Fortsett med Google")').boundingBox()
    const kode = await page.locator('button:has-text("Send kode")').boundingBox()
    ok(google.height > kode.height, `logg-inn: Google-knappen er størst (${Math.round(google.height)} mot ${Math.round(kode.height)} px)`)
  }
  await page.fill('input[type=email]', email)
  await page.click('button:has-text("Send kode")')
  await page.waitForSelector('input[autocomplete=one-time-code]')
  if (gransk) {
    // Fem siffer, ikke seks: seks ville sendt seg selv midt i granskingen.
    const felt = page.locator('input[autocomplete=one-time-code]')
    await felt.fill('1a2b3c4d5')
    ok(await felt.inputValue() === '12345', `kode: bokstaver og mellomrom siles bort ved liming (${await felt.inputValue()})`)
    ok(await page.locator('button:has-text("Send ny kode"):not([disabled])').count() === 1, 'kode: «Send ny kode» står klar der feilen ber om den')
    await felt.fill('')
  }
  const code = await latestCode(email)
  // Seks siffer inne sender selv. Knappen er reserven for utfylling som
  // ikke utløser input-hendelsen.
  await page.fill('input[autocomplete=one-time-code]', code)
  let selv = true
  await page.waitForURL(/\/spill/, { timeout: 8000 }).catch(async () => {
    selv = false
    await page.click('button:has-text("Logg inn")')
    await page.waitForURL(/\/spill/)
  })
  if (gransk) ok(selv, 'kode: seks siffer sender seg selv, uten å trykke «Logg inn»')
}

// «Logg ut» bor på Meg nå, ikke i toppen.
async function loggUt(page) {
  await page.goto(`${APP}/spill/meg`)
  await page.locator('main button:has-text("Logg ut")').click()
  await page.waitForURL(/logg-inn|^http[^/]*\/\/[^/]*\/$/, { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(300)
}

async function shot(page, name) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: `qa/${name}.png`, fullPage: true })
  const sx = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, 0))
  ok(sx === 0, `${name}: ingen horisontal scroll (overskudd ${sx}px)`)
}

const browser = await chromium.launch()
try {
  // Offentlig, mobil
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] })
  const p = await m.newPage()
  p.on('pageerror', e => fails.push(`pageerror: ${e.message}`))
  // Avmelding spør først. Playwright avviser dialoger som standard, så uten
  // dette blir hvert avmeldingstrykk stille annullert.
  const dialoger = []
  p.on('dialog', d => { dialoger.push(d.message()); void d.accept() })
  await p.goto(APP); await shot(p, 'm-hjem')
  ok(await p.locator('h1').textContent().then(t => t.includes('Larvik Beach Volley')), 'hjem: tittel')
  const forsideLenker = await p.locator('main a').evaluateAll(a => a.map(x => x.getAttribute('href')))
  ok(forsideLenker.join() === '/bli-med,/logg-inn,/personvern', `hjem: bare Bli med, Logg inn og Personvern (${forsideLenker.join(', ')})`)
  ok(await p.locator('main .logo-volley').count() === 1, 'hjem: ballen ligger i navnetrekket')
  await p.waitForTimeout(2000)
  ok(await p.locator('.logo-volley-tip').count() === 1, 'hjem: hintet kommer etter et par sekunder')
  // Pynten skal ikke stå foran hovedhandlingen i tabrekkefølgen.
  await p.goto(`${APP}/logg-inn`)
  // Ballen er pynt her og skal ikke ligge i tastaturveien til Google.
  const tab = []
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); tab.push(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')) }
  ok(!tab.some(t => t.includes('volleyball')), `logg-inn: ballen ligger ikke i tabrekkefølgen (${tab.filter(Boolean).join(' → ') || 'ingen aria-label truffet'})`)
  ok(await p.locator('.logo-volley[aria-hidden="true"][tabindex="-1"]').count() === 1, 'logg-inn: ballen er pynt, ikke en kontroll')
  await p.goto(`${APP}/om-oss`); await shot(p, 'm-om-oss')
  await p.goto(`${APP}/bli-med`)
  await p.fill('input[autocomplete=name]', 'Test Testesen')
  await p.fill('input[type=email]', INVITEE)
  await p.fill('textarea', 'Har spilt litt')
  await p.click('button:has-text("Send")')
  await p.waitForSelector('text=Takk.')
  ok(true, 'bli-med: søknad sendt som anonym')
  await shot(p, 'm-bli-med-takk')
  await p.goto(`${APP}/spill`); await p.waitForURL(/logg-inn/); ok(true, 'spill: uinnlogget sendes til logg-inn')

  // Admin, mobil. Innloggingsskjermen granskes på veien inn, med den samme
  // koden: GoTrue ratelimiterer, så testen kan ikke sløse med engangskoder.
  await login(p, ADMIN, true); ok(true, 'admin: innlogget med kode fra e-post')
  await p.goto(APP); await p.waitForURL(/\/spill$/); ok(true, 'innlogget: forsiden sender rett til øktene')
  await p.waitForTimeout(300)
  ok(await p.locator('.nav-wrap').isVisible().catch(() => false) === false, 'spill: toppmenyen er borte i appen på mobil')
  ok(await p.locator('.tabbar').isVisible(), 'spill: fanelinja er navigasjonen')
  ok(await p.locator('main svg[class*="beach"]').count() === 0, 'spill: ingen pynt i oppgaveflata')
  await shot(p, 'm-spill')
  // Forrige økt står øverst det første døgnet.
  const spilt = p.locator('article.session-card').first()
  ok(await spilt.locator('span.badge:text-is("6 spilte")').count() === 1, 'spill: spilt økt står igjen med «6 spilte»')
  ok(await spilt.locator('button').count() === 0, 'spill: spilt økt har ingen påmeldingsknapp')
  const first = p.locator('article.session-card').nth(1)
  // Seed: 7 påmeldt, 6 plasser, Alex meldte seg på sist → venteliste nr. 1.
  ok(await first.locator('text=Fullt · 1 på venteliste').count() === 1, 'spill: første økt viser «Fullt · 1 på venteliste»')
  ok(await first.locator('[role="status"]:has-text("Venteliste nr. 1")').count() === 1, 'spill: Alex (sist i køen) står på venteliste nr. 1')
  ok(await first.locator('.avatar').count() === 7 && await first.locator('.avatar-dim').count() === 1, 'spill: 7 avatarer på kortet, 1 dempet (venteliste)')
  ok(await first.locator('button').count() === 1, 'spill: én knapp på kortet')
  await first.getByRole('button', { name: 'Meld meg av', exact: true }).click()
  await first.locator('span.badge:text-is("Fullt")').waitFor({ timeout: 5000 })
  ok(true, 'spill: avmeldingsknappen melder av, fullt uten venteliste')
  ok(dialoger.some(t => t.includes('Melde deg av')), `avmelding: knappen spør først (${dialoger.join(' | ') || 'ingen dialog'})`)
  await first.locator('button:has-text("Sett meg på venteliste")').click()
  await first.locator('[role="status"]:has-text("Venteliste nr. 1")').waitFor({ timeout: 5000 })
  ok(true, 'spill: påmelding igjen gir venteliste nr. 1 (bakerst i køen)')
  // Én med plass melder seg av → Alex rykker opp. Gjøres som admin på øktsiden senere; her holder køen.
  await first.locator('a.session-card-title').click(); await p.waitForURL(/okter\//); await shot(p, 'm-okt')
  ok(await p.locator('text=Pris per person').count() === 0, 'økt: prisen står ikke på økta, bare under Betaling')
  ok(await p.locator('h2:has-text("Venteliste")').count() === 1, 'økt: ventelista vises når det er fullt (7 påmeldt, 6 plasser)')
  // Kamper på en gjennomført økt med 6 spillere (admin kan trekke)
  // Påmeldingsvinduet: forsiden viser bare øktene som er åpne, resten i kalenderen
  await p.goto(`${APP}/spill`); await p.waitForSelector('article.session-card')
  const kort = await p.locator('article.session-card').count()
  ok(kort === 2, `spill: forrige og neste økt, ikke flere (${kort} kort, ventet 2)`)
  const merkelapper = await p.locator('section .caption').allInnerTexts()
  ok(merkelapper[0] === 'Forrige økt' && merkelapper[1] === 'Neste økt', `spill: forrige økt står øverst det første døgnet (${merkelapper.slice(0,2).join(', ')})`)
  // Oppmøtemeldinga gjelder neste økt og må stå på det kortet, ikke på toppen
  // av sida der forrige økt ligger det første døgnet.
  const seksjoner = await p.locator('main section.stack').all()
  const iForrige = await seksjoner[0].locator('text=Kiwi').count()
  const iNeste = await seksjoner[1].locator('text=Kiwi').count()
  ok(iForrige === 0 && iNeste === 1, `spill: oppmøtemeldinga står på neste økt, ikke på forrige (forrige ${iForrige}, neste ${iNeste})`)
  ok(await p.locator('main >> text=Du skylder').count() === 0, 'spill: ingen betalingsinfo på hjem')
  await p.locator('a:has-text("Hele terminlisten")').click(); await p.waitForURL(/kalender/)
  // Vent på kalenderens egen tekst: h1 finnes også på forrige side.
  await p.locator('main >> text=dager før hver økt').waitFor({ timeout: 5000 })
  const rader = await p.locator('li a[href*="/spill/okter/"]').count()
  ok(rader >= 7, `kalender: hele sesongen listes (${rader} rader)`)
  ok(await p.locator('main >> text=Åpner').count() > 0, 'kalender: økter utenfor vinduet sier når påmeldingen åpner')
  ok(await p.locator('main button').count() === 0, 'kalender: ingen påmeldingsknapper')
  // Kveldens økt hadde 10 påmeldte og 6 plasser. Terminlista sa «10 spilte»:
  // ingen rad kan vise mer enn plassene økta hadde.
  const antall = (await p.locator('main li:has-text("spilte")').allInnerTexts()).map(t => Number(t.match(/(\d+) spilte/)[1]))
  ok(antall.length > 0 && Math.max(...antall) <= 6, `kalender: teller bare de som fikk plass (${antall.join(', ')} mot 6 plasser)`)
  await shot(p, 'm-kalender')
  // En økt langt fram: ingen knapp, men beskjed om når den åpner
  const langt = await p.locator('li a[href*="/spill/okter/"]').last().getAttribute('href')
  await p.goto(`${APP}${langt}`)
  await p.locator('main >> text=Påmeldingen åpner').first().waitFor({ timeout: 5000 })
  ok(await p.locator('text=Påmeldingen åpner').count() >= 1, 'økt langt fram: sier når påmeldingen åpner')
  ok(await p.locator('button:has-text("Jeg kommer")').count() === 0, 'økt langt fram: ingen påmeldingsknapp')
  await p.goto(`${APP}/spill/statistikk`); await shot(p, 'm-statistikk')
  ok(await p.locator('.leader-list .leader-row').count() > 0, 'statistikk: leaderboardet vises')
  // Kamper, rutenett og historikk ligger bak «Mer fra sesongen» nå.
  await p.locator('.stats-details > summary').click()
  await p.locator('h2:has-text("Historikk")').waitFor({ timeout: 5000 })
  const seksSpilte = p.locator('li:has-text("6 spilte")').first()
  await seksSpilte.locator('a').click(); await p.waitForURL(/okter\//)
  // Lag satt opp for hånd: tapp to og to som skal spille sammen.
  await p.locator('button:has-text("Sett opp lag")').click()
  const par = []
  for (let i = 0; i < 3; i++) {
    const a = p.locator('.pick').nth(0), b = p.locator('.pick').nth(1)
    par.push([(await a.innerText()).trim(), (await b.innerText()).trim()])
    await a.click(); await b.click()
  }
  ok(await p.locator('.pick').count() === 0, 'lag: alle seks er satt opp')
  await p.locator('button:has-text("Lagre lag")').click()
  await p.locator('.match').first().waitFor({ timeout: 5000 })
  ok(await p.locator('.match').count() === 3, 'lag: tre lag gir tre kamper')
  const lagTekst = await p.locator('.team-names').allInnerTexts()
  ok(par.every(([a, b]) => lagTekst.some(t => t.includes(a) && t.includes(b))), 'lag: parene som ble tappet står som lag')
  await shot(p, 'm-lag')
  await p.locator('button:has-text("Ny runde")').click()
  await p.waitForFunction(() => document.querySelectorAll('.match').length === 6, null, { timeout: 5000 })
  const etter = await p.locator('.team-names').allInnerTexts()
  ok(etter.slice(0, 6).join('|') === etter.slice(6).join('|'), 'lag: «Ny runde» bruker de samme lagene')
  // Tilfeldig igjen: oppsettet glemmes, så knappen sier «Sett opp lag» på nytt.
  await p.locator('button:has-text("Trekk på nytt")').click()
  await p.waitForFunction(() => document.querySelectorAll('.match').length === 3, null, { timeout: 5000 })
  ok(await p.locator('button:has-text("Sett opp lag")').count() === 1, 'lag: «Trekk på nytt» glemmer oppsettet')
  ok(await p.locator('.match').count() === 3, 'kamper: 6 spillere gir tre kamper')
  await p.locator('.match').first().locator('.team').first().click()
  await p.locator('.team-won').waitFor({ timeout: 5000 })
  ok(await p.locator('.team-won').count() === 1, 'kamper: vinner registrert')
  const r2 = p.locator('.match').nth(1)
  await r2.locator('input.score').nth(0).fill('11'); await r2.locator('input.score').nth(1).fill('15'); await r2.locator('input.score').nth(1).blur()
  await r2.locator('.team-won').waitFor({ timeout: 5000 })
  ok(await r2.locator('.team').nth(1).evaluate(el => el.classList.contains('team-won')), 'kamper: poeng 11–15 gir lag 2 som vinner')
  await p.locator('button:has-text("Ny runde")').click()
  await p.waitForFunction(() => document.querySelectorAll('.match').length === 6, null, { timeout: 5000 })
  ok(await p.locator('.match').count() === 6, 'kamper: «Ny runde» la til tre nye kamper')
  ok(await p.locator('button:has-text("Trekk på nytt")').count() === 0, 'kamper: «Trekk på nytt» skjult når resultater finnes')
  await shot(p, 'm-kamper')
  // Et tydelig resultat, satt i basen så det ikke avhenger av tilfeldige lag:
  // tre runder der lag 1 vinner to og lag 2 én. Da er toppen to spillere.
  // Alex vinner alt han spiller: da er toppen to spillere, og han er en av dem.
  sql(`with h as (select id from public.sessions where status='held' order by starts_at desc limit 1)
       delete from public.matches m using h where m.session_id = h.id and m.round > 3;
       with h as (select id from public.sessions where status='held' order by starts_at desc limit 1),
            me as (select id from public.profiles where email = '${ADMIN}')
       update public.matches m
          set winner  = case when me.id = any(m.team_a) then 'a' else 'b' end,
              score_a = case when me.id = any(m.team_a) then 15 else 9 end,
              score_b = case when me.id = any(m.team_a) then 9 else 15 end
         from h, me where m.session_id = h.id;`)
  await p.goto(`${APP}/spill`); await p.waitForSelector('article.session-card')
  await p.locator('main >> text=Dagens vinner').first().waitFor({ timeout: 5000 })
  const linje = await p.locator('main >> text=Dagens vinner').first().innerText()
  ok(!/ og .* og /.test(linje), `spill: vinnerlinja er lesbar (${linje})`)
  // Konfetti: bare for den som vant, og bare én gang.
  ok(linje.includes('Alex'), `spill: vinneren er med i linja (${linje})`)
  ok(await p.locator('.konfetti span').count() > 20, 'spill: konfetti når du vant sist')
  await p.reload(); await p.waitForSelector('article.session-card'); await p.waitForTimeout(800)
  ok(await p.locator('.konfetti').count() === 0, 'spill: konfettien kommer ikke igjen ved neste åpning')
  ok(await p.locator('article.session-card').first().locator('.avatar-dim').count() === 0, 'spill: spilt økt viser ikke ventelista')
  ok(await p.locator('article.session-card').first().locator('text=kr hver').count() === 0, 'spill: kortet nevner ikke pris')
  await shot(p, 'm-spill-resultat')
  await p.goto(`${APP}/spill/statistikk`)
  await p.locator('.leader-spotlight').waitFor({ timeout: 5000 })

  // Standardvalget er seire så snart det finnes kamper. Det valget tok Codex,
  // ikke Alex — testen fester det så en endring blir synlig.
  ok(await p.locator('.leader-switch button[aria-pressed="true"]').innerText() === 'Seire',
    'statistikk: seire er valgt når det finnes kamper')

  // Delt plassering er konkurranserangering: 1, 1, 3 — ikke 1, 2, 3. To med
  // like mange seire skal ha samme nummer, og neste skal hoppe over plassen.
  const plasser = await p.locator('.leader-list .leader-rank [aria-hidden="true"]').allInnerTexts()
  ok(plasser[0] === '01' && plasser[1] === '01' && plasser[2] === '03',
    `statistikk: like tall gir delt plassering (${plasser.slice(0, 4).join(' ')})`)
  ok(await p.locator('.leader-winners .leader-winner').count() === 2,
    'statistikk: begge lederne står i lederseksjonen')
  // textContent, ikke innerText: øyenbrynet har text-transform: uppercase, og
  // innerText gir den rendrede teksten («DELT FØRSTEPLASS»).
  ok(await p.locator('.leader-eyebrow').textContent() === 'Delt førsteplass',
    `statistikk: delt førsteplass sies med ord (${await p.locator('.leader-eyebrow').textContent()})`)

  // Opptellingen er rAF og stoppes ikke av CSS-regelen for redusert bevegelse.
  // Den må LANDE på øverste rads tall; stopper den på 7 av 8 ser det ut som
  // en designfeil og er en logisk feil.
  const toppScore = () => p.locator('.leader-list .leader-score').first().innerText()
  await p.waitForTimeout(1600)
  const tavle = (await p.locator('.leader-total strong').innerText()).trim()
  ok(tavle === (await toppScore()).trim() && Number(tavle) > 0,
    `statistikk: opptellingen lander på lederens tall (${tavle} mot ${await toppScore()})`)

  // Radene animeres inn forskjøvet. Blir de stående på opacity 0, er lista
  // borte uten at noe feiler.
  const synlige = await p.locator('.leader-list .leader-row-content')
    .evaluateAll(els => els.filter(e => Number(getComputedStyle(e).opacity) > .9).length)
  ok(synlige === await p.locator('.leader-list .leader-row').count(),
    `statistikk: alle radene blir stående synlige (${synlige})`)

  // Kategoribytte: rangeringen skal regnes om, ikke bare merkes om.
  const seireSum = () => p.locator('.leader-list .leader-score').evaluateAll(els => els.map(e => e.textContent).join(','))
  const forSeire = await seireSum()
  await p.locator('.leader-switch button:has-text("Oppmøte")').click()
  await p.waitForTimeout(900)
  ok(await seireSum() !== forSeire, 'statistikk: bytte til oppmøte regner om rangeringen')
  ok(await p.locator('.leader-list .leader-diff').count() === 0
    && await p.locator('.leader-list-heading').count() === 0,
    'statistikk: +/− og kolonnetittelen hører bare til seire')

  // Fasit for oppmøtet er databasens egen telling. Rutene og leaderboardet må
  // ende på samme sum, ellers regner klienten oppmøte etter en annen regel
  // enn season_stats og tallene spriker uten at noen ser hvorfor.
  const sumOppmote = await p.locator('.leader-list .leader-score')
    .evaluateAll(els => els.reduce((n, e) => n + Number(e.textContent), 0))
  await p.locator('.stats-details > summary').click()
  await p.locator('h2:has-text("Økt for økt")').waitFor({ timeout: 5000 })
  const ruter = await p.locator('.rute-med').count()
  ok(ruter === sumOppmote, `statistikk: rutenettet og leaderboardet ender på samme sum (${ruter} mot ${sumOppmote})`)
  const kolonner = await p.locator('.stats-table thead th').allInnerTexts()
  ok(kolonner.join(' · ') === 'Spiller · Kamper · Seire · +/−', `statistikk: kamptabellen har egne kolonner (${kolonner.join(' · ')})`)
  await shot(p, 'm-statistikk-leaderboard')

  await p.locator('.leader-switch button:has-text("Seire")').click()
  await p.locator('.leader-replay').click()
  ok(Number((await p.locator('.leader-total strong').innerText()).trim()) < Number(tavle),
    'statistikk: replay starter opptellingen på nytt')

  await p.emulateMedia({ reducedMotion: 'reduce' })
  await p.reload(); await p.locator('.leader-total strong').waitFor({ timeout: 5000 })
  ok((await p.locator('.leader-total strong').innerText()).trim() === tavle,
    'statistikk: redusert bevegelse viser tallet med en gang')
  const roligSynlige = await p.locator('.leader-list .leader-row-content')
    .evaluateAll(els => els.filter(e => Number(getComputedStyle(e).opacity) > .9).length)
  ok(roligSynlige === await p.locator('.leader-list .leader-row').count(),
    `statistikk: radene står uten animasjon også (${roligSynlige})`)
  await p.emulateMedia({ reducedMotion: 'no-preference' })
  await p.goto(`${APP}/spill/meg`)
  await p.locator('.me-numbers').waitFor({ timeout: 5000 })
  ok(await p.locator('.me-numbers .num').count() === 3, 'meg: tre tall, økter, seire og poeng')

  await p.goto(`${APP}/spill/okter/00000000-0000-0000-0000-000000000000`)
  await p.waitForSelector('text=Fant ikke økta', { timeout: 5000 })
  ok(true, 'økt: ukjent id gir «Fant ikke økta»')
  await p.goto(`${APP}/spill/betaling`); await shot(p, 'm-betaling')
  await p.goto(`${APP}/spill/meg`)
  await p.locator('main >> text=nr.').first().waitFor({ timeout: 5000 }).catch(() => {})
  ok(await p.locator('input').count() === 0, 'meg: leser først, ingen skjemafelt før man velger å endre')
  ok(await p.locator('.me-numbers .num').count() === 3, 'meg: tre tall, økter, seire og poeng')
  ok(await p.locator('main button:has-text("Logg ut")').count() === 1, 'meg: «Logg ut» bor her')
  await p.locator('button[aria-label="Endre navn og telefon"]').click()
  await p.locator('input[type=tel]').waitFor({ timeout: 5000 })
  ok(true, 'meg: pennen åpner skjemaet')
  await p.fill('input[type=tel]', '90000001')
  await p.click('button:has-text("Lagre")')
  await p.locator('text=90000001').waitFor({ timeout: 5000 })
  ok(await p.locator('input').count() === 0, 'meg: lagring lukker skjemaet og viser verdien')
  await shot(p, 'm-meg')
  await p.goto(`${APP}/admin`); await shot(p, 'm-admin-okter')
  // Lista deles i to, og rekkefølgen inni betyr noe: den nærmeste økta er den
  // du gjør noe med, og den ferskeste spilte er den du eventuelt må rette.
  const bolker = await p.locator('main section h2').allInnerTexts()
  ok(/^Kommende/.test(bolker[0] ?? '') && /^Spilte/.test(bolker[1] ?? ''), `admin: Kommende over Spilte (${bolker.join(', ')})`)
  const dato = t => { const [, d, m] = t.match(/(\d+)\.\s*(\w+)/); return `${'jan feb mar apr mai jun jul aug sep okt nov des'.split(' ').findIndex(x => m.startsWith(x))}-${d.padStart(2, '0')}` }
  const komm = (await p.locator('main section').nth(0).locator('a span').filter({ hasText: /\d{2}:\d{2}/ }).allInnerTexts()).map(dato)
  const spilteRader = (await p.locator('main section').nth(1).locator('a span').filter({ hasText: /\d{2}:\d{2}/ }).allInnerTexts()).map(dato)
  ok(komm.length > 1 && komm.join() === [...komm].sort().join(), `admin: kommende stiger, nærmeste først (${komm.join(', ')})`)
  ok(spilteRader.length > 1 && spilteRader.join() === [...spilteRader].sort().reverse().join(), `admin: spilte synker, ferskeste først (${spilteRader.join(', ')})`)

  // Én handling per rad: to knapper brøt datoen i tre linjer på 390 px.
  const adminRad = p.locator('li.admin-session-row').first()
  ok(await adminRad.locator('button').count() === 1, `admin: én handling per øktrad (${await adminRad.locator('button').count()})`)
  ok(await p.locator('li.admin-session-row span.badge').count() === 0, 'admin: tilstanden står i teksten, ikke som en pille ved knappene')
  const radHøyde = (await adminRad.boundingBox()).height
  ok(radHøyde < 110, `admin: øktrada er to linjer, ikke fire (${Math.round(radHøyde)} px)`)

  // Låst økt: lista skal leses. Knapper med opacity 0.5 gjorde skoggrønn til
  // salvie og blekk til grumsebrunt, og fjorten av dem så ut som en feil.
  const holdt = await p.locator('li.admin-session-row a').filter({ hasText: 'var med' }).first().getAttribute('href')
  await p.goto(`${APP}${holdt}`); await p.waitForSelector('h2:has-text("Oppmøte")')
  const låst = await p.locator('text=Oppmøtet er låst').count() === 1
  if (låst) {
    ok(await p.locator('section:has(h2:has-text("Oppmøte")) button').count() === 0, 'admin: låst økt viser oppmøtet som merkelapper, ikke sperrede knapper')
    const bg = await p.locator('input:disabled').first().evaluate(el => getComputedStyle(el).backgroundColor)
    ok(bg !== 'rgb(255, 255, 255)', `admin: sperret felt ser sperret ut (${bg})`)
  }
  ok(await p.locator('.farlig button:has-text("Slett økta")').count() === 1, 'admin: sletting står for seg selv under en strek')
  await shot(p, 'm-admin-okt')

  await p.goto(`${APP}/admin/medlemmer`); await shot(p, 'm-admin-medlemmer')
  // Begge rollehandlingene spør: ett feiltrykk låser noen ut av appen.
  const før = dialoger.length
  await p.locator('li.medlem-rad button:has-text("Sett inaktiv")').first().click()
  await p.waitForTimeout(800)
  ok(dialoger.length > før && /inaktiv/i.test(dialoger.at(-1)), `medlemmer: «Sett inaktiv» spør først (${dialoger.at(-1) ?? 'ingen dialog'})`)
  await p.locator('li.medlem-rad button:has-text("Aktiver")').first().click()
  await p.waitForTimeout(800)
  ok(await p.locator('text=Test Testesen').count() >= 1, 'admin: søknaden ligger i lista')
  await p.locator('button:has-text("Godkjenn og inviter")').first().click()
  await p.waitForTimeout(3000)
  await p.locator('text=Invitert, ikke logget inn ennå').waitFor({ timeout: 5000 }).catch(() => {})
  ok(await p.locator('li:has-text("Test Testesen")').count() >= 1, 'admin: godkjent søker ligger som invitasjon (invite-member)')
  await p.goto(`${APP}/admin/betaling`); await shot(p, 'm-admin-betaling')
  ok(await p.locator('text=Be om penger i Vipps').count() === 1, 'admin: «be om penger»-lista vises')
  // E-postbryteren er av i prod: da må teksten slutte å love e-post, og
  // «Bare lag, ikke send» er meningsløs når ingenting sendes.
  ok(await p.locator('text=du deler påminnelsen selv').count() === 1, 'admin: teksten lover ikke e-post når bryteren er av')
  ok(await p.locator('button:has-text("Bare lag, ikke send")').count() === 0, 'admin: ingen «ikke send»-knapp når ingenting sendes')
  ok(await p.locator('button:has-text("Lag og send")').count() === 0, 'admin: knappen sier bare «Lag regninger»')
  // Påminnelsen: teksten skal inneholde navn, beløp, Vipps-nummer og lenke
  await p.locator('button:has-text("Del påminnelse")').click()
  await p.locator('text=Kopiert').waitFor({ timeout: 5000 })
  const delt = await p.evaluate(() => navigator.clipboard.readText())
  ok(/kr/.test(delt) && delt.includes('/spill/betaling'), 'påminnelse: beløp og lenke er med')
  ok(delt.includes('900 00 000') || /\d{6,}/.test(delt), 'påminnelse: Vipps-nummeret er med')
  await p.locator('span.badge:text-is("Sendt")').first().waitFor({ timeout: 5000 })
  ok(true, 'påminnelse: regningene merkes som varslet etter deling')
  await p.goto(`${APP}/admin/innstillinger`); await shot(p, 'm-admin-innstillinger')
  await loggUt(p)

  // Spiller: melder betalt
  await login(p, PLAYER)
  await p.goto(`${APP}/spill/meg`)
  await p.locator('.me-numbers').waitFor({ timeout: 5000 })
  ok(await p.locator('main >> text=sluppet inn').count() === 1, 'spiller: Meg viser kamper, scoret og sluppet inn')
  await p.goto(`${APP}/spill/betaling`)
  await p.locator('main >> text=Du skylder').waitFor({ timeout: 5000 })
  const skylder = await p.locator('main .num').first().innerText()
  ok(skylder !== '0 kr', `betaling: totalen tar med økter som ikke er fakturert (${skylder})`)
  await p.goto(`${APP}/spill/betaling`)
  const claimBtn = p.locator('button:has-text("Jeg har vippset")').first()
  await claimBtn.waitFor({ timeout: 5000 }).catch(() => {})
  ok(await claimBtn.count() === 1, 'spiller: har en regning å betale')
  await claimBtn.click(); await p.waitForTimeout(800)
  ok(await p.locator('text=Meldt betalt').count() >= 1, 'spiller: regning markert som meldt betalt')
  await shot(p, 'm-spiller-betaling-etter')
  await p.goto(`${APP}/admin`); await p.waitForURL(/\/spill$/); ok(true, 'spiller: admin-rute avvises')
  await loggUt(p)

  // Den inviterte logger inn første gang med kode: bruker opprettes, invitasjonen aktiverer profilen
  await login(p, INVITEE)
  ok(p.url().includes('/spill'), 'invitert: første innlogging gir aktiv profil og /spill')
  await loggUt(p)

  // Uinvitert logger inn med kode: bruker opprettes, men ingen tilgang
  await p.goto(`${APP}/logg-inn`)
  await p.locator('button:has-text("Annen e-post")').click()
  await p.waitForSelector('input[type=email]')
  await p.fill('input[type=email]', 'sniker@example.com')
  await p.click('button:has-text("Send kode")')
  await p.waitForSelector('input[autocomplete=one-time-code]')
  await p.fill('input[autocomplete=one-time-code]', await latestCode('sniker@example.com'))
  await p.waitForSelector('text=Ikke tilgang ennå', { timeout: 10000 })
  ok(true, 'uinvitert: kommer inn, men ser «Ikke tilgang ennå»')
  await p.click('button:has-text("Logg ut")')
  await p.waitForSelector('button:has-text("Send kode")', { timeout: 5000 })
  ok(await p.locator('text=Ikke tilgang ennå').count() === 0, 'uinvitert: «Logg ut» lander på innloggingsskjemaet')

  // Admin ser og bekrefter
  await login(p, ADMIN)
  await p.goto(`${APP}/admin/betaling`)
  await p.locator('text=Meldt betalt, venter på deg').waitFor({ timeout: 5000 }).catch(() => {})
  ok(await p.locator('text=Meldt betalt, venter på deg').count() === 1, 'admin: ser regningen som venter')
  await p.locator('button:has-text("Bekreft")').first().click(); await p.waitForTimeout(800)
  ok(await p.locator('text=Meldt betalt, venter på deg').count() === 0, 'admin: bekreftet, køen er tom')
  await m.close()

  // Desktop
  const d = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const q = await d.newPage()
  await q.goto(APP); await shot(q, 'd-hjem')
  await login(q, ADMIN); await shot(q, 'd-spill')
  await q.goto(`${APP}/admin/betaling`); await shot(q, 'd-admin-betaling')
  await d.close()
} finally {
  await browser.close()
}
console.log(fails.length ? `\n${fails.length} feil:\n- ${fails.join('\n- ')}` : '\nAlt grønt.')
process.exit(fails.length ? 1 : 0)
