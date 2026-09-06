import { kr } from '../lib/money'

export function Money({ ore, size = 'md' }: { ore: number; size?: 'md' | 'lg' }) {
  return <span className={size === 'lg' ? 'num' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>{kr(ore)}</span>
}
