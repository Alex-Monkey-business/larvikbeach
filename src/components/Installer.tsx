import { useSyncExternalStore } from 'react'
import { abonner, erIos, lesInstall } from '../lib/install'
import './Installer.css'

/**
 * Står på Meg, ved siden av «Logg ut». Ikke et hint som maser, men en
 * innstilling som ligger der til den er gjort: ingen lukkeknapp, ingenting
 * lagret. Ligger appen alt på hjemskjermen, er kortet borte av seg selv.
 *
 * Ikonet er den ekte PNG-en som havner på telefonen. Kortere enn å beskrive den.
 */
export function Installer() {
  const { event, installert } = useSyncExternalStore(abonner, lesInstall)
  const ios = erIos()

  // Ingen knapp og ingen iOS-oppskrift = ingenting nyttig å si. Det er derfor
  // kortet ikke dukker opp på en PC med Firefox.
  if (installert || (!event && !ios)) return null

  return (
    <section className="card stack installer">
      <h2 className="h3">Appen på mobilen</h2>
      <div className="installer-rad">
        <img className="installer-ikon" src="/brand/lbv-192.png" alt="" width="44" height="44" />
        <p>Legg den på hjemskjermen, så åpner den som en app — uten adresselinje.</p>
      </div>
      {event
        ? <button type="button" className="btn btn-forest btn-sm installer-knapp" onClick={() => void event.prompt()}>Legg til</button>
        : <p className="caption">Trykk Del-knappen nederst i Safari, og velg «Legg til på Hjem-skjerm».</p>}
    </section>
  )
}
