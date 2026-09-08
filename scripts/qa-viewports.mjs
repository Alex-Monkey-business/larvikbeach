// Bredde-sveip: alle ruter på 8 mobilbredder. Fasit er window.scrollX etter
// faktisk scroll, ikke scrollWidth. Måler også elementer som stikker ut til
// høyre og minste venstremarg for tekst. `npm run qa:widths`.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const MAIL = process.env.MAIL_URL ?? 'http://127.0.0.1:55324'
const ADMIN = 'alexander.samnoy@gmail.com'
const WIDTHS = [320, 360, 375, 390, 393, 412, 414, 430]
mkdirSync('qa/widths', { recursive: true })

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

const measure = () => {
  window.scrollTo(9999, 0); const sx = window.scrollX; window.scrollTo(0, 0)
  const w = document.documentElement.clientWidth
  const inScroller = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true } return false }
  const over = []
  let minLeft = Infinity
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right > w + 1 && !inScroller(el)) over.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}[${Math.round(r.right - w)}px]`)
    // Venstremarg måles på selve teksten (Range), ikke boksen; fanelinja er unntatt.
    if (el.children.length === 0 && el.textContent.trim() && !['SCRIPT', 'STYLE'].includes(el.tagName) && !el.closest('.tabbar')) {
      const rg = document.createRange(); rg.selectNodeContents(el); const tr = rg.getBoundingClientRect()
      if (tr.width > 0) minLeft = Math.min(minLeft, tr.left)
    }
  }
  return { sx, over: over.slice(0, 5), minLeft: Math.round(minLeft) }
}

const fails = []
const browser = await chromium.launch()
try {
  // Én innlogging, gjenbrukt storage per bredde.
  const boot = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const bp = await boot.newPage()
  await bp.goto(`${APP}/logg-inn`)
  await bp.locator('button:has-text("Annen e-post")').click()
  await bp.waitForSelector('input[type=email]')
  await bp.fill('input[type=email]', ADMIN); await bp.click('button:has-text("Send kode")')
  await bp.waitForSelector('input[autocomplete=one-time-code]')
  // Seks siffer sender seg selv; det er ingen knapp å trykke etterpå.
  await bp.fill('input[autocomplete=one-time-code]', await latestCode(ADMIN))
  await bp.waitForURL(/\/spill/)
  await bp.waitForSelector('article.session-card')
  const state = await boot.storageState()
  // Økter å teste: første planlagte (full) og en gjennomført med 6 (kamper)
  await bp.locator('article.session-card a.session-card-title').first().click(); await bp.waitForURL(/okter\//)
  const fullSession = bp.url()
  await bp.goto(`${APP}/spill/statistikk`); await bp.locator('h2:has-text("Historikk")').waitFor()
  await bp.locator('li:has-text("6 spilte")').first().locator('a').click(); await bp.waitForURL(/okter\//)
  const heldSession = bp.url()
  const heldId = heldSession.split('/').pop()
  await boot.close()

  const routes = [
    ['hjem', '/', false], ['om-oss', '/om-oss', false], ['bli-med', '/bli-med', false], ['logg-inn', '/logg-inn', false],
    ['personvern', '/personvern', false], ['spill', '/spill', true], ['okt-full', fullSession, true], ['okt-holdt', heldSession, true],
    ['lagvelger', heldSession, true, async pg => {
      const knapp = pg.locator('button:has-text("Sett opp lag"), button:has-text("Endre lag")').first()
      if (await knapp.count()) { await knapp.click(); await pg.locator('.pick, .pick-pool').first().waitFor({ timeout: 3000 }).catch(() => {}) }
    }],
    ['kalender', '/spill/kalender', true], ['statistikk', '/spill/statistikk', true], ['betaling', '/spill/betaling', true], ['meg', '/spill/meg', true, async pg => { await pg.click('button[aria-label="Endre navn og telefon"]') }],
    ['admin', '/admin', true, async pg => { await pg.click('button:has-text("Ny økt")'); await pg.click('button:has-text("Sesong")') }],
    ['admin-okt', `/admin/okter/${heldId}`, true],
    ['admin-medlemmer', '/admin/medlemmer', true, async pg => { await pg.click('button:has-text("Inviter en spiller")') }],
    ['admin-betaling', '/admin/betaling', true], ['admin-innstillinger', '/admin/innstillinger', true],
  ]

  for (const width of WIDTHS) {
    const anon = await browser.newContext({ viewport: { width, height: 800 } })
    const auth = await browser.newContext({ viewport: { width, height: 800 }, storageState: state })
    for (const [name, path, needsAuth, prep] of routes) {
      const pg = await (needsAuth ? auth : anon).newPage()
      const errs = []; pg.on('pageerror', e => errs.push(e.message))
      await pg.goto(path.startsWith('http') ? path : `${APP}${path}`)
      await pg.waitForLoadState('networkidle'); await pg.waitForTimeout(250)
      if (prep) { await prep(pg); await pg.waitForTimeout(150) }
      // Strekktest: lange navn i alt som har ellipsis
      await pg.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.children.length === 0 && getComputedStyle(el).textOverflow === 'ellipsis') el.textContent = 'Et Veldig Langt Navn Som Aldri Tar Slutt Overhodet' })
      const m = await pg.evaluate(measure)
      const bad = m.sx > 0 || m.over.length > 0 || m.minLeft < 12 || errs.length > 0
      if (bad) { fails.push(`${width}px ${name}: scrollX=${m.sx} over=${m.over.join(',')} minLeft=${m.minLeft} ${errs.join(';')}`); await pg.screenshot({ path: `qa/widths/${width}-${name}.png`, fullPage: true }) }
      console.log(`${bad ? 'FEIL' : 'ok  '} ${width} ${name} scrollX=${m.sx} minLeft=${m.minLeft}${m.over.length ? ' over=' + m.over.join(',') : ''}`)
      await pg.close()
    }
    await anon.close(); await auth.close()
  }
} finally { await browser.close() }
console.log(fails.length ? `\n${fails.length} feil:\n- ${fails.join('\n- ')}` : '\nAlle bredder grønne.')
process.exit(fails.length ? 1 : 0)
