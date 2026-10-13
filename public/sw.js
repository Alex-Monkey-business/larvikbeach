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

// Push. Sendefunksjonen (supabase/functions/send-push) sender { title, body, url }.
// iOS krever at hvert push faktisk viser et varsel, ellers trekkes tillatelsen.
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: e.data?.text() ?? '' } }
  e.waitUntil(self.registration.showNotification(data.title || 'Larvik Beach Volley', {
    body: data.body || '',
    icon: '/brand/lbv-192.png',
    badge: '/brand/lbv-192.png',
    data: { url: data.url || '/spill' },
  }))
})

// Trykk på varselet: bruk en åpen app hvis den finnes, ellers åpne en ny.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/spill', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(vinduer => {
    const apen = vinduer.find(v => v.url.startsWith(self.location.origin))
    if (apen) return apen.focus().then(v => v.navigate ? v.navigate(url) : v)
    return self.clients.openWindow(url)
  }))
})
