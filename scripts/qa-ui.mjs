// Isolated UI QA: all backend requests are intercepted; no real account or data writes.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const env = readFileSync('.env.local', 'utf8')
const backend = new URL(env.match(/^VITE_SUPABASE_URL=["']?([^\s"']+)/m)[1])
const storageKey = `sb-${backend.hostname.split('.')[0]}-auth-token`
const app = 'http://127.0.0.1:5173'
const out = 'qa/ui-review'
mkdirSync(out, { recursive: true })
const people = ['Alexander Samnøy', 'Ola Nordmann', 'Kari Hansen', 'Per Berg', 'Ingrid Solheim', 'Jonas Lie', 'Maria Aas'].map((name, i) => ({ id: `p${i}`, name, email: `spiller${i}@example.com`, role: i ? 'player' : 'admin', active: true, avatar_url: null, phone: null }))
const season = { id: 'season1', name: 'Høsten 2026', starts_on: '2026-01-01', ends_on: '2027-12-31', kind: 'indoor', default_location: 'Grenland Folkehøgskole', default_capacity: 6, default_min_players: 4, default_cost: 600, notice: null }
const sessions = [process.env.QA_UI_RECENT ? -.5 : -7, 3, 10].map((days, i) => ({ id: `s${i}`, season_id: season.id, starts_at: new Date(Date.now() + days * 86400000).toISOString(), duration_min: 120, location: 'Grenland Folkehøgskole', cost: 600, status: i ? 'planned' : 'held', capacity: 6, min_players: 4, note: null }))
let attendance = people.slice(0, 6).flatMap((p, i) => [0, 1].map(n => ({ session_id: `s${n}`, profile_id: p.id, going: true, updated_at: new Date(Date.now() - (20 - i) * 60000).toISOString() })))
let fail = '', empty = false
const data = {
  settings: { id: true, signup_window_days: 14, billing_day: 1, vipps_number: '12345678', vipps_display_name: 'Testgjengen', group_name: 'Larvik Beach Volley' },
  profiles: people, seasons: [season], sessions,
  season_stats: people.map((p, i) => ({ profile_id: p.id, season_id: season.id, sessions: 7-i, games: 12, wins: 8-i, points_for: 130, points_against: 100, points_diff: 30 })),
  balances: [{ profile_id: 'p0', invoiced_open: 100, uninvoiced: 50, claimed: 0 }],
  invoices: [{ id: 'invoice1', profile_id: 'p0', amount: 100, period: '2026-08-01', status: 'open' }],
  public_upcoming_sessions: [{ ...sessions[1], kind: 'indoor', going_count: 6 }],
}
const browser = await chromium.launch()
const errors = [], results = []
async function context(auth, width) {
  const c = await browser.newContext({ viewport: { width, height: 844 } })
  await c.route(`${backend.origin}/**`, async route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').pop()
    if (fail === table) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Kunne ikke hente data. Prøv igjen.' }) })
    if (table === 'set_attendance') {
      const b = route.request().postDataJSON()
      attendance = attendance.filter(a => !(a.profile_id === 'p0' && a.session_id === b.p_session))
      attendance.push({ session_id: b.p_session, profile_id: 'p0', going: b.p_going, updated_at: new Date().toISOString() })
      return route.fulfill({ json: attendance.at(-1) })
    }
    let value = table === 'attendance' ? attendance : table === 'user' ? people[0] : data[table] ?? []
    if (empty && table === 'seasons') value = []
    if (Array.isArray(value)) {
      for (const [key, condition] of url.searchParams) {
        if (condition.startsWith('eq.')) value = value.filter(v => String(v[key]) === condition.slice(3))
        if (condition.startsWith('lt.')) value = value.filter(v => String(v[key]) < condition.slice(3))
        if (condition.startsWith('gte.')) value = value.filter(v => String(v[key]) >= condition.slice(4))
      }
      if (route.request().headers().accept?.includes('vnd.pgrst.object')) value = value[0] ?? null
    }
    return route.fulfill({ json: value })
  })
  if (auth) await c.addInitScript(({storageKey}) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: 'qa-fixture-token', refresh_token: 'qa-fixture-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'p0', email: 'spiller0@example.com', aud: 'authenticated', role: 'authenticated' } }))
  }, {storageKey})
  return c
}
try {
  for (const width of (process.env.QA_UI_WIDTHS?.split(',').map(Number) ?? [320, 390, 768, 1440])) {
    for (const auth of [false, true]) {
      const c = await context(auth, width), p = await c.newPage()
      p.on('pageerror', e => errors.push(e.message))
      for (const route of auth ? ['/spill','/spill/statistikk','/spill/kalender','/spill/betaling','/spill/meg','/spill/okter/s1','/admin','/admin/medlemmer','/admin/betaling','/admin/innstillinger'] : ['/','/om-oss','/bli-med','/logg-inn','/personvern','/ukjent']) {
        await p.goto(app+route); await p.waitForTimeout(450)
        await p.locator('h1').first().waitFor()
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
        assert.equal(overflow, false, `overflow ${width} ${route}`)
        results.push(`${width} ${route}: OK`); console.log(results.at(-1))
        if ([390,1440].includes(width)) { await p.waitForTimeout(1400); await p.screenshot({ path: `${out}/${width}-${route.replaceAll('/','_')||'home'}.png`, fullPage: true }) }
      }
      await c.close()
    }
  }
  const c = await context(true, 390), p = await c.newPage()
  const fixedNow = Date.now()
  await p.clock.setFixedTime(new Date(fixedNow))
  for (const age of [24 * 3600000 - 1000, 24 * 3600000, 24 * 3600000 + 1000]) {
    sessions[0].starts_at = new Date(fixedNow - age).toISOString()
    await p.goto(app+'/spill')
    await p.locator('article.session-card').first().waitFor()
    assert.equal(await p.locator('.play-home section > .caption').first().textContent(), age < 24 * 3600000 ? 'Forrige økt' : 'Neste økt')
  }
  await p.goto(app+'/spill')
  await p.getByRole('button', { name: 'Meld meg av', exact: true }).waitFor()
  assert.equal(await p.getByRole('button', { name: 'Du har plass', exact: true }).count(), 0)
  p.once('dialog', d => d.dismiss())
  await p.getByRole('button', {name:'Meld meg av',exact:true}).click()
  assert.equal(await p.getByRole('button', {name:'Meld meg av',exact:true}).count(),1)
  p.once('dialog', d => d.accept())
  await p.getByRole('button', {name:'Meld meg av',exact:true}).click()
  await p.getByRole('button', {name:'Jeg kommer',exact:true}).waitFor()
  await p.getByRole('button', {name:'Jeg kommer',exact:true}).click()
  await p.getByRole('button', {name:'Meld meg av',exact:true}).waitFor()
  fail = 'season_stats'
  await p.goto(app+'/spill/statistikk'); await p.getByRole('alert').waitFor()
  fail = ''; await p.getByRole('button',{name:'Prøv igjen'}).click(); await p.getByRole('heading',{name:'Oppmøte'}).waitFor()
  empty = true; await p.goto(app+'/spill/kalender'); await p.getByText('Ingen sesong er lagt inn ennå.').waitFor(); empty = false
  fail = 'balances'; await p.goto(app+'/spill/betaling'); await p.getByRole('alert').waitFor(); assert.equal(await p.getByText('Utestående', {exact:true}).count(),0); fail = ''
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.goto(app+'/spill')
  assert.equal(await p.locator('.beach-ball').evaluate(el => getComputedStyle(el).animationName), 'none')
  people[0].name = 'Alexander Et Veldig Langt Mellomnavn Samnøy'
  people[0].email = 'alexander.et.veldig.langt.navn@example.com'
  await p.setViewportSize({ width: 320, height: 844 })
  for (const path of ['/spill', '/spill/statistikk', '/spill/meg']) {
    await p.goto(app + path); await p.waitForTimeout(400)
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Long name: ${path}`)
  }
  await c.close()
  assert.deepEqual(errors, [])
  console.log(`PASS: ${results.length} viewport/route combinations; RSVP cancel/confirm/rejoin; error/retry; empty; billing failure; reduced motion; long names/email; 24-hour ordering boundary; no runtime errors.`)
} finally { await browser.close() }
