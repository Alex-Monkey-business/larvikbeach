import type { InvoiceStatus } from '../lib/types'

const LABEL: Record<InvoiceStatus, [string, string]> = {
  open: ['Ikke sendt', 'badge-stone'],
  notified: ['Sendt', 'badge-lavender'],
  claimed: ['Meldt betalt', 'badge-ember'],
  confirmed: ['Betalt', 'badge-forest'],
  waived: ['Frafalt', 'badge-outline'],
}

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  const [text, cls] = LABEL[status]
  return <span className={`badge ${cls}`}>{text}</span>
}
