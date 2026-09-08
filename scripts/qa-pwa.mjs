// Sjekker at appen faktisk kan legges på en hjemskjerm. Dette er den slags
// ting som råtner i stillhet: ingen skjerm ser feil ut, men Android slutter å
// tilby installasjon fordi tjenestearbeideren ikke svarer offline lenger.
//
// Kjører mot BYGGET (dist/), for arbeideren registreres bare i prod.
// Kjør: npm run build && node scripts/qa-pwa.mjs
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { chromium } from 'playwright'

const fails = []
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log(`${cond ? 'ok  ' : 'FEIL'} ${msg}`) }

const TYPER = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
}

// Speiler netlify.toml: alt som ikke er en fil faller til index.html (SPA).
// `nyUtgave` lar testen simulere en deploy uten å bygge på nytt.
let nyUtgave = false
const tjener = createServer((req, res) => {
  const sti = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  let fil = join('dist', sti)
  if (!existsSync(fil) || statSync(fil).isDirectory()) fil = 'dist/index.html'
  res.writeHead(200, { 'Content-Type': TYPER[extname(fil)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
  let kropp = readFileSync(fil)
  if (nyUtgave && fil === 'dist/index.html') kropp = kropp.toString().replace('</head>', '<meta name="utgave" content="2"></head>')
  res.end(kropp)
})
await new Promise(r => tjener.listen(0, '127.0.0.1', r))
const APP = `http://127.0.0.1:${tjener.address().port}`

const browser = await chromium.launch()
const kontekst = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await kontekst.newPage()

try {
  await p.goto(`${APP}/`)

  // 1. Manifestet.
  const man = await p.evaluate(async () => {
    const lenke = document.querySelector('link[rel=manifest]')
    if (!lenke) return null
    const r = await fetch(lenke.href)
    return { status: r.status, type: r.headers.get('content-type'), json: await r.json() }
  })
  ok(man?.status === 200, `manifest: svarer 200 (${man?.status ?? 'ingen lenke i <head>'})`)
  const j = man?.json ?? {}
  ok(j.name === 'Larvik Beach Volley' && j.short_name === 'LBV',
    `manifest: fullt navn, og LBV under ikonet (${j.short_name})`)
  ok(j.display === 'standalone', `manifest: standalone, altså ingen Safari-ramme (${j.display})`)
  ok(j.start_url === '/spill', `manifest: ikonet åpner appen, ikke forsiden (${j.start_url})`)
  ok(j.background_color === '#ffffeb' && j.theme_color === '#ffffeb',
    'manifest: oppstartsflata er kremfarget som appen, ingen hvitblink')
  const st = (n) => j.icons?.some(i => i.sizes === `${n}x${n}`)
  ok(st(192) && st(512), 'manifest: 192 og 512 finnes (Chrome krever begge)')
  ok(j.icons?.some(i => i.purpose?.includes('maskable')), 'manifest: maskable-ikon for Android')

  // 2. Ikonfilene — at de svarer OG har de pikselmålene de påstår.
  const ikoner = [...(j.icons ?? []).map(i => [i.src, +i.sizes.split('x')[0]]),
    ['/brand/lbv-apple-180.png', 180]]
  for (const [src, px] of new Map(ikoner)) {
    const mal = await p.evaluate(s => new Promise(r => {
      const i = new Image()
      i.onload = () => r([i.naturalWidth, i.naturalHeight])
      i.onerror = () => r(null)
      i.src = s
    }), src)
    ok(mal?.[0] === px && mal?.[1] === px, `ikon ${src}: ${px}×${px} (fikk ${mal?.join('×') ?? 'ingenting'})`)
  }

  // 3. iOS-taggene. Uten dem får iPhone et generisk ikon og Safari-rammen.
  const head = await p.evaluate(() => ({
    apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
    std: document.querySelector('meta[name="mobile-web-app-capable"]')?.content,
    tittel: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
  }))
  ok(head.apple === '/brand/lbv-apple-180.png', `head: apple-touch-icon (${head.apple})`)
  ok(head.capable === 'yes' && head.std === 'yes', 'head: web-app-capable, både standard og apple-varianten')
  ok(head.tittel === 'LBV', `head: navnet under ikonet (${head.tittel})`)

  // 4. Arbeideren tar over.
  const styrer = await p.evaluate(() => navigator.serviceWorker.ready
    .then(() => new Promise(r => {
      if (navigator.serviceWorker.controller) return r(true)
      navigator.serviceWorker.addEventListener('controllerchange', () => r(true))
      setTimeout(() => r(!!navigator.serviceWorker.controller), 3000)
    })))
  ok(styrer === true, 'arbeider: registrert og styrer sida')

  // 5. Offline. Dette er kravet Chrome måler installerbarhet på, og samtidig
  //    forskjellen mellom «appen åpner» og en dinosaur i hallen uten dekning.
  await p.goto(`${APP}/spill`)
  await kontekst.setOffline(true)
  const svar = await p.reload().then(r => r?.status() ?? 0).catch(() => 0)
  ok(svar === 200, `offline: skallet lastes fra arbeideren (status ${svar})`)
  ok(await p.locator('#root').count() === 1, 'offline: appen rendres, ikke nettleserens feilside')
  await kontekst.setOffline(false)

  // 6. Og motsatt: en ny utgave MÅ komme fram. Cachet man dokumentet, ville
  //    en deploy aldri nådd noen — de satt fast på gammel versjon uten vei ut.
  //    Her legges det ut en ny index.html mens arbeideren styrer sida.
  nyUtgave = true
  await p.reload()
  const fikkNy = await p.evaluate(() => !!document.querySelector('meta[name=utgave]'))
  ok(fikkNy, 'oppdatering: ny utgave når fram selv med arbeideren aktiv')

} finally {
  await browser.close()
  tjener.close()
}

console.log(fails.length ? `\n${fails.length} FEIL:\n- ${fails.join('\n- ')}` : '\nAlt grønt.')
process.exit(fails.length ? 1 : 0)
