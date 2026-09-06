export function Notice({ kind = 'error', children }: { kind?: 'error' | 'ok'; children: React.ReactNode }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`badge ${kind === 'error' ? 'badge-ember' : 'badge-forest'}`} style={{ whiteSpace: 'normal', textAlign: 'left' }}>
      {children}
    </p>
  )
}
