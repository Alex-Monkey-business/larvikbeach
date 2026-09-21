/**
 * Sola på ute-øktene. Samme strek og farger som ballen i navnetrekket, så
 * den leses som del av familien og ikke som et lånt ikon.
 */
export function Sun({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg className={`sun ${className ?? ''}`} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="13" fill="var(--color-ember)" />
      <g stroke="var(--color-forest)" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="32" cy="32" r="13" />
        <path d="M32 4v9M32 51v9M4 32h9M51 32h9M12.2 12.2l6.4 6.4M45.4 45.4l6.4 6.4M12.2 51.8l6.4-6.4M45.4 18.6l6.4-6.4" />
      </g>
    </svg>
  )
}
