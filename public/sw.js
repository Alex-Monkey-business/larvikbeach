// Tjenestearbeider for Larvik Beach Volley.
//
// Hvorfor den finnes: Chrome installerer ikke en app på hjemskjermen uten en
// arbeider som svarer når nettet er borte. Uten den får Android-folk en
// bokmerke-snarvei som åpner seg i Chrome med adresselinje og alt — ikke en app.
// Den er IKKE her for å cache aggressivt.
const CACHE = 'lbv-v1'
const SKALL = '/index.html'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.add(new Request(SKALL, { cache: 'reload' })))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(navn => Promise.all(navn.filter(n => n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Supabase, Google og alt annet utenfor domenet: rør det ikke.
  if (url.origin !== self.location.origin) return

  // Dokumentet hentes ALLTID fra nett når nett finnes. Den cachede index.html
  // er bare en nødutgang — cachet den først, ville en deploy aldri nådd fram
  // og folk satt fast på gammel versjon uten noen måte å komme videre.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(SKALL).then(r => r ?? Response.error())))
    return
  }

  // Resten har innholdshash i navnet (/assets) eller endrer seg aldri (fonter,
  // merkevare). Cache først er riktig for dem, og det er de samme filene
  // netlify.toml alt merker som immutable.
  if (/^\/(assets|fonts|brand)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(treff => treff ?? fetch(req).then(res => {
      if (res.ok) {
        const kopi = res.clone()
        void caches.open(CACHE).then(c => c.put(req, kopi))
      }
      return res
    })))
  }
})

// Push. Sendefunksjonen (supabase/functions/send-push) sender
// { title, body, url, svar?: { billett, url } }.
// Ikke `icon`: Android viser det som et stort bilde til høyre, i tillegg til
// merket til venstre. Én gang holder.
// iOS krever at hvert push faktisk viser et varsel, ellers trekkes tillatelsen.
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: e.data?.text() ?? '' } }
  e.waitUntil(self.registration.showNotification(data.title || 'Larvik Beach Volley', {
    body: data.body || '',
    badge: '/brand/lbv-192.png',
    // Knapper under teksten på Android og desktop. iPhone viser dem ikke, så
    // trykk på selve varselet åpner økta, der valget kan tas.
    actions: data.svar ? [{ action: 'kommer', title: 'Kommer' }, { action: 'kommer-ikke', title: 'Kommer ikke' }] : [],
    data: { url: data.url || '/spill', svar: data.svar || null },
  }))
})

self.addEventListener('notificationclick', e => {
  const n = e.notification
  n.close()
  const { url = '/spill', svar } = n.data || {}
  if (svar && (e.action === 'kommer' || e.action === 'kommer-ikke')) {
    e.waitUntil(svarPa(svar, e.action === 'kommer', n.title, url))
    return
  }
  e.waitUntil(apne(url))
})

// Lagrer svaret og bytter varselet med en kvittering. Går det ikke (vinduet
// stengt, økta startet), åpnes økta så valget kan tas der.
async function svarPa(svar, going, tittel, url) {
  try {
    const res = await fetch(svar.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billett: svar.billett, going }),
    })
    if (!res.ok) throw new Error(String(res.status))
    await self.registration.showNotification(tittel, {
      body: going ? 'Du er påmeldt.' : 'Du er meldt av.',
      badge: '/brand/lbv-192.png',
      tag: 'svar',
      data: { url },
    })
  } catch {
    await apne(url)
  }
}

// Bruk en åpen app hvis den finnes, ellers åpne en ny.
async function apne(sti) {
  const url = new URL(sti, self.location.origin).href
  const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const apen = vinduer.find(v => v.url.startsWith(self.location.origin))
  if (apen) { await apen.focus(); return apen.navigate ? apen.navigate(url) : apen }
  return self.clients.openWindow(url)
}
