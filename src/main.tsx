import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/tokens.css'
import './styles/base.css'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { startSporing } from './lib/sporing'

// Sidevisninger og klientfeil til den felles telemetri-tabellen. Larvik Beach
// har ingen egen client_errors, så feilene går dit også.
startSporing({ prosjekt: 'larvikbeach', feil: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Tjenestearbeideren finnes bare for at appen skal kunne installeres på
// hjemskjermen (se public/sw.js). Ikke i dev: der ville den lagt seg mellom
// Vite og nettleseren og servert gamle moduler.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // .catch, ikke `void`: void kaster promiset, men ikke avvisningen, og da
  // ender en mislykket registrering som unhandledrejection i feilloggen.
  // Registreringen kan feile helt legitimt — privat modus, blokkert lagring —
  // og appen virker uansett. Bare installasjon på hjemskjerm faller bort.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
