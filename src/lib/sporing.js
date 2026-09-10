// Sporing — sidevisninger, eventer og klientfeil.
//
// KANONISK KOPI: ~/dev/Private-projects/dashboard/sporing.js
// Endrer du noe her, kopier til alle fire prosjektene. Endrer du i ett
// prosjekt, har du laget en avvikende kopi — ikke gjør det.
//
// Fire regler den ikke kan bryte, arvet fra errorReporter.js i BenchBoss:
//   1. Aldri kaste. En sporing som krasjer appen er verre enn ingen sporing.
//   2. Aldri blokkere. Ingen `await` i noen håndterer.
//   3. Én rad per fingeravtrykk per økt, med tak.
//   4. Ikke innhold. Rute uten query, vertsnavn uten sti, ingen skjermtekst.
//
// Ingen cookies, ingen tredjepart, ingen identifikator lagret. `session_hash`
// er bevisst grov — dagsdato + user agent + språk + skjermbredde rundet til
// nærmeste 100 — så mange mennesker deler samme verdi, og den skifter hver
// natt. Derfor trengs ingen samtykkebanner.

const BASE = 'https://pcaibrrpmervwjfzcont.supabase.co/rest/v1'
const NØKKEL = 'sb_publishable_EPZbK91ryQtw6rigobdqiA_KwOuvLKS'

// Utvikling skal ikke telles. Uten denne blir hver `npm run dev`-økt
// sidevisninger i statistikken, og tallene måler deg selv i stedet for
// brukerne. Verifiseringsskriptet setter window.__sporingLokalt for å
// omgå den med vilje.
function erLokalt() {
  try {
    const h = location.hostname
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h === '[::1]' ||
      h.endsWith('.local') ||
      location.protocol === 'file:'
    )
  } catch {
    return false
  }
}

const MAKS_FEIL_PER_ØKT = 20
const sette = new Set()
let prosjekt = null
let sporFeil = false
let øktHash = null

// ── Hjelpere ─────────────────────────────────────────────────────────────────
// djb2, samme som errorReporter.js i BenchBoss — så samme feil får samme
// avtrykk uansett hvilket prosjekt den kommer fra.
function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function grovtØktpreg() {
  try {
    const dag = new Date().toISOString().slice(0, 10)
    const bredde = Math.round((window.screen?.width || 0) / 100) * 100
    return hash([dag, navigator.userAgent, navigator.language, bredde].join('|'))
  } catch {
    return 'ukjent'
  }
}

// Kjører siden som installert app eller i nettleser? Android og desktop
// svarer på display-mode; iOS Safari gjør ikke det, og bruker sin egen
// navigator.standalone. Begge må sjekkes, ellers ser iOS-brukere ut som
// nettleserbrukere.
function visningsmodus() {
  try {
    const somApp =
      window.navigator.standalone === true ||
      ['standalone', 'fullscreen', 'minimal-ui'].some(
        (m) => window.matchMedia(`(display-mode: ${m})`).matches
      )
    return somApp ? 'app' : 'nettleser'
  } catch {
    return null
  }
}

function enhet() {
  try {
    const b = window.innerWidth
    return b < 600 ? 'mobil' : b < 1024 ? 'nettbrett' : 'desktop'
  } catch {
    return null
  }
}

// Vertsnavn, ikke hele henvisningen. En URL kan bære søkeord og id-er.
function henviser() {
  try {
    if (!document.referrer) return null
    const h = new URL(document.referrer).hostname
    return h === location.hostname ? null : h
  } catch {
    return null
  }
}

// Rute uten query. Query-strengen er innhold.
const rute = () => {
  try {
    return location.pathname || '/'
  } catch {
    return '/'
  }
}

// Regel 2: ingen await noe sted i kallkjeden. keepalive gjør at raden kommer
// fram selv om siden lukkes i samme øyeblikk.
function send(tabell, rad) {
  try {
    fetch(`${BASE}/${tabell}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: NØKKEL,
        Authorization: `Bearer ${NØKKEL}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ project: prosjekt, ...rad }),
    }).catch(() => {})
  } catch {}
}

// ── Sidevisninger ────────────────────────────────────────────────────────────
let forrigeRute = null

function visning() {
  try {
    const r = rute()
    // SPA-rutere fyrer av og til to ganger på samme rute.
    if (r === forrigeRute) return
    forrigeRute = r
    send('page_views', {
      path: r,
      referrer_host: henviser(),
      session_hash: øktHash,
      device: enhet(),
      visning: visningsmodus(),
    })
  } catch {}
}

// Rammeverksuavhengig: alle fire prosjektene bruker samme lytting, enten de
// har Vue Router, React Router eller ingen ruter i det hele tatt.
function lyttPåNavigasjon() {
  try {
    for (const navn of ['pushState', 'replaceState']) {
      const original = history[navn]
      if (typeof original !== 'function') continue
      history[navn] = function (...args) {
        const svar = original.apply(this, args)
        try {
          visning()
        } catch {}
        return svar
      }
    }
    window.addEventListener('popstate', () => visning())
  } catch {}
}

// ── Eventer ──────────────────────────────────────────────────────────────────
export function meldEvent(navn, props) {
  try {
    if (!prosjekt || !navn) return
    send('events', {
      name: String(navn).slice(0, 80),
      props: props ?? null,
      session_hash: øktHash,
    })
  } catch {}
}

// ── Klientfeil ───────────────────────────────────────────────────────────────
// Bare for prosjektene som ikke har egen client_errors-tabell. BenchBoss
// beholder sin egen rapportør og sin egen base.
function meldFeil(kind, feil) {
  try {
    if (!sporFeil) return
    const message = String(feil?.message || feil || 'ukjent').slice(0, 2000)
    const stack = feil?.stack ? String(feil.stack).slice(0, 8000) : null
    const førsteRamme =
      String(stack || '')
        .split('\n')
        .find((l) => /:\d+:\d+/.test(l)) || ''
    const fingerprint = hash(`${message}|${førsteRamme.trim().replace(/:\d+:\d+/g, '')}`)

    // Regel 3: samme feil hundre ganger er én rad.
    if (sette.has(fingerprint)) return
    if (sette.size >= MAKS_FEIL_PER_ØKT) return
    sette.add(fingerprint)

    send('client_errors', {
      kind,
      message,
      stack,
      route: rute(),
      release: typeof __BUILD_VERSION__ !== 'undefined' ? String(__BUILD_VERSION__) : null,
      fingerprint,
      user_agent: String(navigator.userAgent || '').slice(0, 400),
    })
  } catch {}
}

// ── Start ────────────────────────────────────────────────────────────────────
export function startSporing(valg = {}) {
  try {
    if (prosjekt) return // dobbel montering skal ikke gi doble rader
    if (erLokalt() && !window.__sporingLokalt) return
    prosjekt = valg.prosjekt
    sporFeil = valg.feil === true
    if (!prosjekt) return
    øktHash = grovtØktpreg()

    visning()
    lyttPåNavigasjon()

    if (sporFeil) {
      window.addEventListener('error', (e) => {
        // Ressursfeil (bilde som ikke lastet) er ikke en krasj.
        if (!e?.error) return
        meldFeil('error', e.error)
      })
      window.addEventListener('unhandledrejection', (e) => {
        meldFeil('unhandledrejection', e?.reason)
      })
    }
  } catch {}
}
