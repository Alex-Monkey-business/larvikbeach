import { Link } from 'react-router'

// Kreves av Google for å publisere innloggingen, og av personopplysnings-
// loven fordi vi lagrer navn, e-post, telefon og hvem som skylder hva.
export function Privacy() {
  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <header className="stack">
        <h1 className="h1">Personvern</h1>
        <p className="lede">Vi er en vennegjeng, ikke en bedrift. Vi lagrer det som trengs for å få folk på banen og dele hall-leia, og ingenting mer.</p>
      </header>

      <section className="stack">
        <h2 className="h3">Hva vi lagrer</h2>
        <ul className="list">
          <li>Navn og e-postadresse. E-posten er innloggingen din.</li>
          <li>Telefonnummer, hvis du legger det inn. Det er valgfritt.</li>
          <li>Profilbildet ditt, hvis du velger å logge inn med Google.</li>
          <li>Hvilke økter du har meldt deg på, og om du fikk plass.</li>
          <li>Din andel av hall-leia, og om den er betalt.</li>
          <li>Kampoppsett og resultater fra øktene.</li>
        </ul>
      </section>

      <section className="stack">
        <h2 className="h3">Hvorfor</h2>
        <p>For å vite hvem som kommer, hvor mange plasser som er igjen, og hva hver av oss skal betale for hallen. Uten disse opplysningene virker ikke appen.</p>
      </section>

      <section className="stack">
        <h2 className="h3">Hvem ser hva</h2>
        <p>De andre i gjengen ser navnet ditt, bildet ditt, hvilke økter du er med på og resultatene fra kampene. Det er hele poenget med påmeldingen.</p>
        <p>E-post, telefonnummer og beløp ser bare du og den som administrerer gjengen.</p>
        <p>Vi selger ingenting videre og deler ingenting med andre. Vi har ingen sporing, ingen analyseverktøy og ingen annonser.</p>
      </section>

      <section className="stack">
        <h2 className="h3">Hvem hjelper oss med driften</h2>
        <p>Appen kjører hos noen få leverandører som behandler opplysningene på våre vilkår:</p>
        <ul className="list">
          <li>Supabase lagrer databasen og håndterer innloggingen. Serverne står i EU.</li>
          <li>Netlify leverer selve nettsiden.</li>
          <li>Resend sender e-postene våre, som innloggingskoder og månedsregningen.</li>
          <li>Google, men bare hvis du selv velger å logge inn med Google-kontoen din.</li>
        </ul>
      </section>

      <section className="stack">
        <h2 className="h3">I nettleseren din</h2>
        <p>Når du logger inn, lagres et innloggingsbevis lokalt i nettleseren din, slik at du ikke må logge inn på nytt hver gang. Det er alt. Vi setter ingen sporingsinformasjonskapsler.</p>
      </section>

      <section className="stack">
        <h2 className="h3">Hvor lenge</h2>
        <p>Så lenge du er med i gjengen. Slutter du, kan du få kontoen og opplysningene dine slettet. Regnskapet for økter som er betalt beholder vi til sesongen er gjort opp, så ingen betaler dobbelt.</p>
      </section>

      <section className="stack">
        <h2 className="h3">Rettighetene dine</h2>
        <p>Du kan se, rette og slette opplysningene om deg. Navn og telefon endrer du selv under Meg. For resten, si til den som administrerer gjengen.</p>
        <p>Mener du vi behandler opplysninger feil, kan du klage til Datatilsynet.</p>
      </section>

      <section className="stack">
        <h2 className="h3">Kontakt</h2>
        <p>Alexander Samnøy, <a href="mailto:alexander.samnoy@gmail.com">alexander.samnoy@gmail.com</a></p>
        <p className="caption">Sist oppdatert 7. september 2026.</p>
      </section>

      <Link to="/" className="btn">Til forsiden</Link>
    </div>
  )
}
