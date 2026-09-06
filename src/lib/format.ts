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

/** «2026-09» → «September 2026» */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
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
