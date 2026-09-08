// Isolated UI QA: all backend requests are intercepted; no real account or data writes.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const env = readFileSync('.env.local', 'utf8')
const backend = new URL(env.match(/^VITE_SUPABASE_URL=["']?([^\s"']+)/m)[1])
const storageKey = `sb-${backend.hostname.split('.')[0]}-auth-token`
const app = process.env.QA_APP ?? 'http://127.0.0.1:5174'
const out = 'qa/leaderboard'
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
  sessions.splice(0, sessions.length, ...Array.from({length: 7}, (_, i) => ({id: `s${i}`, season_id: season.id, starts_at: new Date(Date.now() - (7-i) * 86400000).toISOString(), duration_min: 120, location: 'Grenland Folkehøgskole', cost: 600, status: 'held', capacity: 10, min_players: 4, note: null})))
  attendance = people.flatMap((p, i) => sessions.slice(0, 7-i).map(s => ({session_id: s.id, profile_id: p.id, going: true, updated_at: new Date(Date.now()-864000000).toISOString()})))
  data.season_stats.forEach((r, i) => { r.wins = [5, 9, 7, 3, 6, 2, 1][i] })
  for (const width of [320, 390, 768, 1440]) {
    const c = await context(true, width), p = await c.newPage()
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(app + '/spill/statistikk')
    await p.locator('.leader-list').waitFor()
    assert.equal(await p.locator('.leader-row').first().getAttribute('data-player'), 'p1')
    assert.equal(await p.locator('.stats-details').getAttribute('open'), null)
    await p.waitForTimeout(1600)
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    if ([390, 1440].includes(width)) await p.screenshot({path: `${out}/${width}.png`, fullPage: true})
    await p.getByRole('button', {name:'Oppmøte',exact:true}).click()
    assert.equal(await p.locator('.leader-row').first().getAttribute('data-player'), 'p0')
    assert.ok(await p.locator('.leader-row').evaluateAll(rows => rows.some(row => row.getAnimations().length > 0)), 'Rank changes animate')
    await p.waitForTimeout(800)
    await p.locator('.stats-details summary').click()
    await p.getByRole('heading', {name:'Historikk'}).waitFor()
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await p.emulateMedia({reducedMotion:'reduce'})
    await p.getByRole('button', {name:'Seire',exact:true}).click()
    assert.equal(await p.locator('.leader-spotlight').evaluate(el => getComputedStyle(el).animationName), 'none')
    assert.equal(await p.locator('.leader-total strong').textContent(), '9')
    await c.close()
  }
  const c = await context(true, 320), p = await c.newPage()
  p.on('pageerror', e => errors.push(e.message))
  data.season_stats[0].wins = 9
  people[0].name = 'Alexander Et Veldig Langt Mellomnavn Samnøy'
  await p.goto(app + '/spill/statistikk'); await p.locator('.leader-list').waitFor()
  assert.equal(await p.locator('.leader-winner').count(), 2)
  // Sifferet er dekor og plasseringen står som skjult tekst ved siden av, så
  // teksten leses fra det synlige sifferet.
  assert.equal(await p.locator('.leader-row .leader-rank [aria-hidden="true"]').allTextContents().then(x=>x.slice(0,3).join(',')), '01,01,03')
  assert.equal(await p.locator('.leader-row .leader-rank .visually-hidden').first().textContent(), '1. plass')
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await p.getByRole('button',{name:'Spill lederanimasjonen på nytt'}).focus(); await p.keyboard.press('Enter')
  data.season_stats.forEach(r => { r.wins = 0 })
  await p.reload(); await p.locator('.leader-empty').waitFor()
  assert.equal(await p.locator('.leader-winner').count(), 0)
  fail = 'season_stats'; await p.reload(); await p.getByRole('alert').waitFor()
  fail = ''; await p.getByRole('button',{name:'Prøv igjen'}).click(); await p.locator('.leader-list').waitFor()
  data.season_stats = []; await p.reload(); await p.getByText('Ingen økter er gjennomført ennå.').waitFor()
  await c.close(); assert.deepEqual(errors, [])
  console.log('PASS: leaderboard order, metric switching, 4 widths, details, reduced motion, ties, long names, zero scores, empty, error/retry, keyboard replay, no runtime errors.')
} finally { await browser.close() }
