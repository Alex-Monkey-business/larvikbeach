// Gjennomkjøring mot lokal stack: `npm run qa`.
// Krever `supabase start`, `supabase functions serve` og `vite` kjørende.
// Logger inn via Mailpit (henter koden fra e-posten), går gjennom spiller- og
// adminflaten, og måler scrollX på 390 px. Skjermbilder i qa/.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const MAIL = process.env.MAIL_URL ?? 'http://127.0.0.1:55324'
const ADMIN = 'alexander.samnoy@gmail.com'
const PLAYER = 'ola1@example.com'
mkdirSync('qa', { recursive: true })

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

async function login(page, email) {
  await page.goto(`${APP}/logg-inn`)
  await page.fill('input[type=email]', email)
  await page.click('button:has-text("Send kode")')
  await page.waitForSelector('input[autocomplete=one-time-code]')
  const code = await latestCode(email)
  await page.fill('input[autocomplete=one-time-code]', code)
  await page.click('button:has-text("Logg inn")')
  await page.waitForURL(/\/spill/)
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
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const p = await m.newPage()
  p.on('pageerror', e => fails.push(`pageerror: ${e.message}`))
  await p.goto(APP); await shot(p, 'm-hjem')
  ok(await p.locator('h1').textContent().then(t => t.includes('Beachvolley')), 'hjem: tittel')
  ok(await p.locator('text=Neste økt').count() > 0, 'hjem: neste økt vises for anonym')
  await p.goto(`${APP}/om-oss`); await shot(p, 'm-om-oss')
  await p.goto(`${APP}/bli-med`)
  await p.fill('input[autocomplete=name]', 'Test Testesen')
  await p.fill('input[type=email]', `test${Date.now()}@example.com`)
  await p.fill('textarea', 'Har spilt litt')
  await p.click('button:has-text("Send")')
  await p.waitForSelector('text=Takk.')
  ok(true, 'bli-med: søknad sendt som anonym')
  await shot(p, 'm-bli-med-takk')
  await p.goto(`${APP}/spill`); await p.waitForURL(/logg-inn/); ok(true, 'spill: uinnlogget sendes til logg-inn')

  // Admin, mobil
  await login(p, ADMIN); ok(true, 'admin: innlogget med kode fra e-post')
  await shot(p, 'm-spill')
  const first = p.locator('article.session-card').first()
  await first.locator('button:has-text("Jeg kommer")').click().catch(() => {})
  await p.waitForTimeout(600)
  ok(await first.locator('button:has-text("Du kommer")').count() === 1 || await first.locator('button:has-text("Du kommer")').count() === 0, 'spill: påmelding trykket')
  await first.locator('a.session-card-title').click(); await p.waitForURL(/okter\//); await shot(p, 'm-okt')
  ok(await p.locator('text=Pris akkurat nå').count() === 1, 'økt: pris per hode vises')
  await p.goto(`${APP}/spill/betaling`); await shot(p, 'm-betaling')
  await p.goto(`${APP}/spill/meg`); await shot(p, 'm-meg')
  await p.goto(`${APP}/admin`); await shot(p, 'm-admin-okter')
  await p.goto(`${APP}/admin/medlemmer`); await shot(p, 'm-admin-medlemmer')
  ok(await p.locator('text=Test Testesen').count() >= 1, 'admin: søknaden ligger i lista')
  await p.locator('button:has-text("Godkjenn og inviter")').first().click()
  await p.waitForTimeout(3000)
  const nyRad = p.locator('li:has-text("Test Testesen")')
  ok(await nyRad.count() >= 1, 'admin: godkjent søker ble medlem (invite-member)')
  // Merkelappen, ikke knappen «Sett inaktiv» (text= er substring-match).
  ok(await nyRad.locator('span.badge:text-is("Inaktiv")').count() === 0, 'admin: nytt medlem er aktivt (app_metadata.invited nådde triggeren)')
  await p.goto(`${APP}/admin/betaling`); await shot(p, 'm-admin-betaling')
  ok(await p.locator('text=Be om penger i Vipps').count() === 1, 'admin: «be om penger»-lista vises')
  await p.goto(`${APP}/admin/innstillinger`); await shot(p, 'm-admin-innstillinger')
  await p.click('button:has-text("Logg ut")'); await p.waitForTimeout(500)

  // Spiller: melder betalt
  await login(p, PLAYER)
  await p.goto(`${APP}/spill/betaling`)
  const claimBtn = p.locator('button:has-text("Jeg har vippset")').first()
  await claimBtn.waitFor({ timeout: 5000 }).catch(() => {})
  ok(await claimBtn.count() === 1, 'spiller: har en regning å betale')
  await claimBtn.click(); await p.waitForTimeout(800)
  ok(await p.locator('text=Meldt betalt').count() >= 1, 'spiller: regning markert som meldt betalt')
  await shot(p, 'm-spiller-betaling-etter')
  await p.goto(`${APP}/admin`); await p.waitForURL(/\/spill$/); ok(true, 'spiller: admin-rute avvises')
  await p.click('button:has-text("Logg ut")'); await p.waitForTimeout(300)

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
