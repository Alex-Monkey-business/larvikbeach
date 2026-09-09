// Typer for sporing.js. Fila er ren JS med vilje — den kopieres uendret
// mellom fire prosjekter med ulike stacker, og skal ikke trenge et byggsteg.
export function startSporing(valg?: { prosjekt: string; feil?: boolean }): void
export function meldEvent(navn: string, props?: unknown): void
