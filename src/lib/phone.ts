/**
 * Telefonnummeret er nøkkelen for gjester. Speiler `norm_phone` i basen:
 * «917 12 345», «+47 917 12 345» og «0047 91712345» er samme nummer.
 * Basen er fasit; dette brukes bare til å kjenne igjen en gjest mens man skriver.
 */
export function normPhone(p: string | null | undefined): string | null {
  if (!p) return null
  const d = p.replace(/\D/g, '')
  if (d === '') return null
  if (d.startsWith('0047') && d.length === 12) return `+47${d.slice(4)}`
  if (d.startsWith('47') && d.length === 10) return `+${d}`
  if (d.length === 8) return `+47${d}`
  if (/^\s*\+/.test(p)) return `+${d}`
  return d
}

/** «+4791712345» → «917 12 345». Andre land vises som de er. */
export function prettyPhone(p: string | null | undefined): string {
  const k = normPhone(p)
  if (!k) return ''
  if (k.startsWith('+47') && k.length === 11) return `${k.slice(3, 6)} ${k.slice(6, 8)} ${k.slice(8)}`
  return k
}

/** Nummeret slik Vipps' søkefelt vil ha det: åtte siffer for norske, ellers hele. */
export function vippsSearchNumber(p: string): string {
  const k = normPhone(p) ?? p
  return k.startsWith('+47') && k.length === 11 ? k.slice(3) : k
}

/**
 * Samme grep som i BenchBoss: nummeret legges på utklippstavla og Vipps
 * åpnes, så «Be om penger» er lim inn + beløp. Vipps har ingen vei inn for
 * privatpersoner, så dette er så nært ett trykk det går.
 */
export async function openVipps(phone: string): Promise<boolean> {
  let copied = false
  try { await navigator.clipboard.writeText(vippsSearchNumber(phone)); copied = true }
  catch { /* eldre nettlesere, usikker kontekst */ }
  window.location.href = 'vipps://'
  return copied
}
