// Genererer hjemskjerm-ikonene fra merkevaremerket. Playwright er alt en
// devDependency for QA, så dette er ingen ny avhengighet — og en nettleser
// rendrer SVG-en likt hver gang, i motsetning til `sips` og `qlmanage`.
//
// Paths LESES ut av lbv-mark.svg og skrives ikke inn her. Første utgave hadde
// dem avskrevet, og ett kontrollpunkt i B-en ble feil (667 260 → 667 198).
//
// Kjør: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const kilde = readFileSync('public/brand/lbv-mark.svg', 'utf8')
const MERKE = kilde.match(/<g fill="#f0d7ff">([\s\S]*?)<\/g>/)?.[1]
if (!MERKE) throw new Error('fant ikke merket i lbv-mark.svg')

/**
 * Merket tar 66 % av bredden. Grunnen er `maskable`: Android kan klippe ikonet
 * til en sirkel med diameter 80 %, og et merke som fyller 80 % i bredden mister
 * L-en og V-en i den klippen. Ved 66 % ligger ytterste hjørne 411 px fra midten,
 * trygt innenfor radiusen på 480.
 */
function kvadrat(andel = 0.66) {
  const s = (1200 * andel) / 1203
  const x = (1200 - 1203 * s) / 2
  const y = (1200 - 337 * s) / 2
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">'
    + '<rect width="1200" height="1200" fill="#034f46"/>'
    + `<g fill="#f0d7ff" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(4)})">${MERKE}</g></svg>`
}

const filer = [
  ['public/brand/lbv-192.png', 192],
  ['public/brand/lbv-512.png', 512],
  ['public/brand/lbv-apple-180.png', 180],
]

const nettleser = await chromium.launch()
const side = await nettleser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
for (const [sti, px] of filer) {
  await side.setViewportSize({ width: px, height: px })
  await side.setContent(`<style>html,body{margin:0;background:#034f46}svg{display:block;width:100vw;height:100vw}</style>${kvadrat()}`)
  writeFileSync(sti, await side.screenshot({ type: 'png' }))
  console.log(`${sti}  ${px}x${px}`)
}
await nettleser.close()
