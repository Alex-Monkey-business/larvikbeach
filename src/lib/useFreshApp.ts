import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/**
 * Laster appen inn på nytt når det ligger en nyere versjon på serveren.
 *
 * Appen er én side: koden som lastet da fanen eller hjemskjerm-appen ble
 * åpnet, kjører til noen laster inn igjen. Her sjekkes /version.json (aldri
 * cachet, se netlify.toml) ved hvert sidebytte og når appen kommer tilbake
 * i forgrunnen. Er id-en en annen enn den som er bakt inn, lastes siden på
 * nytt — men aldri mens noen står i et felt.
 */
export function useFreshApp() {
  const { pathname } = useLocation()
  const last = useRef(0)

  useEffect(() => {
    async function check() {
      if (Date.now() - last.current < 30_000) return
      last.current = Date.now()
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        if (!r.ok) return
        const { id } = await r.json() as { id?: string }
        if (!id || id === __BUILD_ID__) return
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
        window.location.reload()
      } catch { /* uten nett: ingenting å oppdatere til */ }
    }
    void check()
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [pathname])
}
