# UI-gjennomgang · 8. september 2026

Appen har allerede et særpreg med kremfarge, serifoverskrifter og lavendel. Behold dette. De største gevinstene ligger i tydelige handlinger, forutsigbar navigasjon og lesbar informasjon, fremfor flere farger og effekter.

## Gjennomført

| Funn | Forbedring |
| --- | --- |
| «Du har plass» / «Venteliste nr. 1» var knapper som avmeldte spilleren. | Status vises separat fra «Meld meg av». Bekreftelsen beholdes, og venting vises som «Lagrer…». |
| Øktkortene viste kjent klokkeslett og hallnavn. | Etter brukeravklaring: tid og hallnavn fjernes fra hjemmekortene. Sesongens oppmøtemelding beholdes; standard for innesesong er oppmøte 18:15 på Kiwi Farriseidet for felles transport. |
| Rekkefølge på hjemskjermen. | Etter brukeravklaring: forrige økt står øverst i 24 timer fra start, deretter neste. Grensen testes før, ved og etter 24 timer. |
| Stats og kalender kunne bli blanke; betaling kunne vise 0 kroner før data var hentet, også ved feil. | Lastetilstander, tomtilstander og feil med «Prøv igjen». Øktdetaljer håndterer også feil ved henting av spillere. |
| «Stats» i menyen og sesongnavn som eneste sidetittel ga svak orientering. | «Statistikk» brukes i meny og tittel. Kalenderen heter «Terminliste», med sesong som kontekst. Hjem markeres også på underliggende øktsider og terminliste. |
| Statistikktall lå i fleksible rader uten tydelig kolonnetilknytning. | Semantisk tabell med overskrifter, stabile kolonner og forklaring av poengforskjell. Egen rad fremheves diskret. |
| Svak grå tekst og diskret tastaturfokus. | Mørkere sekundærtekst, tydelig fokus på lenker og kontroller, snarvei til innhold og minst 44 px høyde på små knapper. |
| Adminmenyen så ut som en gruppe handlingsknapper. | Roligere navigasjonsfaner med tydelig valgt side. |
| Startsiden hadde for mye tekst. | Kun «Larvik Beach Volley», «Bli med» og «Logg inn», med en liten dekorativ SVG-bane. Navigasjon, bunntekst og informasjonsseksjoner er fjernet fra selve forsiden. Kort serveanimasjon som stopper og respekterer redusert bevegelse. |
| Lange e-postadresser kunne gi horisontal scrolling på Meg. | Profilsiden bryter lange navn og e-postadresser innenfor tilgjengelig bredde. |
| Enkelte tekster og avslutninger var uklare. | «Send forespørsel», mer direkte introduksjon og vei tilbake fra ukjent side. |

## Forslag til neste runde

1. **Fire faste faner for alle:** Flytt «Admin» til Meg, slik at Hjem, Statistikk, Betaling og Meg får samme plass uansett rolle. Dette gir mer luft på små telefoner, men legger til ett trykk for administratoren.
2. **Gjør betaling enda mer konkret:** Skill visuelt mellom «Betal nå» og «Kommer på neste regning». Samlet utestående inkluderer i dag begge deler; teksten forklarer dette, men hovedtallet kan fortsatt tolkes som beløpet som skal vippses nå.
3. **Avmelding i appen:** Erstatt nettleserens bekreftelsesdialog med en liten tilgjengelig dialog med «Behold plassen» og «Meld meg av». Nåværende bekreftelse er funksjonell, men skiller seg visuelt fra appen.
4. **Lik feilbehandling overalt:** Meg, enkelte adminvisninger og deler av kampoppsettet bør få samme last/feil/prøv-igjen-mønster. Denne runden dekker de viktigste spillerflatene, ikke alle API-kall.
5. **Test kampoppsettet med en ny spiller:** Forklaringen på King of the Beach finnes allerede. Kontroller at «Sett opp lag», «Trekk på nytt» og «Ny runde» forstås uten hjelp; disse handlingene konkurrerer om oppmerksomheten på kampkortet.
6. **Hold bevegelse konsentrert:** Bruk animasjon i velkomsten og ved en faktisk seier. Unngå kontinuerlig bevegelse i lister, betalingsoversikt og påmelding. Dekorasjonen skal aldri forskyve en knapp mens man trykker.

## Verifisering og begrensning

Den lokale databasen var ikke startet. Nettlesertestene bruker isolerte svar på backend-kall og en syntetisk innlogget bruker. Ingen ekte påmeldinger, betalinger, invitasjoner eller meldinger ble sendt.

`node scripts/qa-ui.mjs` sjekker offentlige sider, spillerflater og adminmenyer på 320, 390, 768 og 1440 px. I tillegg kontrolleres avbryt/bekreft avmelding, ny påmelding, statistikkfeil med nytt forsøk, tom kalender, betalingsfeil, redusert bevegelse og lange navn. Skjermbilder ligger lokalt i `qa/ui-review/`.

Ekte e-post-/OAuth-innlogging, samtidige påmeldinger, fakturering, skjermleser og Safari/iOS må fortsatt sjekkes mot en kjørende testbackend og aktuelle enheter. Den eksisterende ende-til-ende-testen er oppdatert til den separate avmeldingsknappen og den gjenopprettede 24-timersregelen, men er ikke kjørt mot ekte backend i denne runden.

Resultat: 64 side-/breddekombinasjoner passerte. Stresstesten avdekket deretter en feil med lange e-postadresser på Meg; den er rettet og verifisert med en ny runde på 32 mobilkombinasjoner samt alle interaksjons- og feiltestene. Ingen JavaScript-kjøretidsfeil i skjermrunden. Produksjonsbygg og kontroll av databaseskriv passerer. Lint kjører uten feil, med 17 advarsler om eksisterende mønstre som effektoppdateringer og klokke/tilfeldighet i rendering.
