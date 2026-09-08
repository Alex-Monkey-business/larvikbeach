/**
 * Chrome fyrer `beforeinstallprompt` ÉN gang, rett etter at sida er lastet.
 * Appen er en SPA: åpner du Hjem og går til Meg etterpå, er hendelsen for
 * lengst borte når kortet der mounter. Derfor fanges den her, utenfor React,
 * i det modulen lastes — og kortet leser den når som helst senere.
 */
export type InstallEvent = Event & { prompt: () => Promise<void> }

export type InstallStatus = { event: InstallEvent | null; installert: boolean }

const standalone = () => typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true)

// Samme objekt så lenge ingenting har skjedd: useSyncExternalStore krever at
// snapshotet er stabilt, ellers rendrer den i evig løkke.
let status: InstallStatus = { event: null, installert: standalone() }
const lyttere = new Set<() => void>()
const sett = (neste: InstallStatus) => { status = neste; for (const f of lyttere) f() }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // Uten preventDefault viser Chrome sin egen bunnlinje-boble i tillegg.
    e.preventDefault()
    sett({ ...status, event: e as InstallEvent })
  })
  window.addEventListener('appinstalled', () => sett({ event: null, installert: true }))
}

export const lesInstall = () => status
export function abonner(f: () => void) {
  lyttere.add(f)
  return () => { lyttere.delete(f) }
}

/** iOS gir ingen installasjonsknapp, bare Del-menyen. Da må vi si hvor den er. */
export const erIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
