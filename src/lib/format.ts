const OSLO = 'Europe/Oslo'

export function weekday(iso: string): string {
  const s = new Date(iso).toLocaleDateString('nb-NO', { weekday: 'long', timeZone: OSLO })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', timeZone: OSLO })
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: OSLO })
}

export function endTime(iso: string, durationMin: number): string {
  return time(new Date(new Date(iso).getTime() + durationMin * 60_000).toISOString())
}

/** «Tirsdag 8. september» */
export function longDate(iso: string): string {
  return `${weekday(iso)} ${dayMonth(iso)}`
}

/** «7. sep.» */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', timeZone: OSLO })
}

/** «Man 7. sep» til lister med mange rader. */
export function compactDate(iso: string): string {
  const d = new Date(iso)
  const wd = d.toLocaleDateString('nb-NO', { weekday: 'short', timeZone: OSLO }).replace('.', '')
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${shortDate(iso)}`
}

/** «2026-09» → «September 2026» */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Påmeldingen åpner så mange dager før økta. */
export function signupOpensAt(iso: string, windowDays: number): Date {
  return new Date(new Date(iso).getTime() - windowDays * 86_400_000)
}

export function signupOpen(iso: string, windowDays: number): boolean {
  const now = Date.now()
  return now >= signupOpensAt(iso, windowDays).getTime() && now < new Date(iso).getTime()
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

/** Lokal tid → ISO for datetime-local-input, og tilbake. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}
