import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { Notice } from '../../components/Notice'
import type { Invite, JoinRequest, Profile } from '../../lib/types'

export function AdminMembers() {
  const { profile: me } = useAuth()
  const people = useQuery(() => api.profiles(), [])
  const reqs = useQuery(() => api.joinRequests(), [])
  const invites = useQuery(() => api.invites(), [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null)
    try { await fn(); await Promise.all([people.reload(), reqs.reload(), invites.reload()]) }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  const pending = (reqs.data ?? []).filter(r => r.status === 'pending')

  return (
    <div className="stack-lg" style={{ maxWidth: 800 }}>
      <h1 className="h2">Medlemmer</h1>
      {error && <Notice>{error}</Notice>}

      {pending.length > 0 && (
        <section className="stack">
          <h2 className="h3">Vil bli med <span className="muted">{pending.length}</span></h2>
          {pending.map(r => <RequestCard key={r.id} r={r} busy={busy === r.id}
            onApprove={() => void run(r.id, async () => {
              await api.inviteMember({ name: r.name, email: r.email, phone: r.phone ?? undefined, join_request_id: r.id })
            })}
            onReject={() => void run(r.id, () => api.setJoinRequestStatus(r.id, 'rejected', me!.id))} />)}
        </section>
      )}

      <InviteForm onDone={() => run('invite', async () => {})} />

      {(invites.data?.length ?? 0) > 0 && (
        <section className="card stack">
          <h2 className="h3">Invitert, ikke logget inn ennå <span className="muted">{invites.data!.length}</span></h2>
          <ul className="list">
            {invites.data!.map((i: Invite) => (
              <li key={i.email} className="row between">
                <div>
                  <p style={{ fontWeight: 500 }}>{i.name}{i.role === 'admin' && <span className="badge badge-forest" style={{ marginLeft: 8 }}>Admin</span>}</p>
                  <p className="caption">{i.email} · invitert {new Date(i.created_at).toLocaleDateString('nb-NO')}</p>
                </div>
                <div className="row">
                  <button type="button" className="btn btn-sm" disabled={busy === i.email} onClick={() => void run(i.email, async () => {
                    const r = await api.inviteMember({ name: i.name, email: i.email, phone: i.phone ?? undefined, role: i.role })
                    if (!r.mail.sent) throw new Error(`E-posten til ${i.email} ble ikke sendt: ${r.mail.error ?? 'ukjent feil'}`)
                  })}>Send igjen</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy === i.email} onClick={() => void run(i.email, () => api.deleteInvite(i.email))}>Trekk tilbake</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2 className="h3">Alle <span className="muted">{people.data?.length ?? ''}</span></h2>
        <ul className="list">
          {(people.data ?? []).map(p => (
            <li key={p.id} className="row between">
              <div>
                <p style={{ fontWeight: 500, opacity: p.active ? 1 : 0.5 }}>{p.name}{p.role === 'admin' && <span className="badge badge-forest" style={{ marginLeft: 8 }}>Admin</span>}{!p.active && <span className="badge badge-stone" style={{ marginLeft: 8 }}>Inaktiv</span>}</p>
                <p className="caption">{p.email}{p.phone ? ` · ${p.phone}` : ''}</p>
              </div>
              {p.id !== me?.id && (
                <div className="row">
                  <button type="button" className="btn btn-sm" disabled={busy === p.id} onClick={() => void run(p.id, () => api.updateProfile(p.id, { role: p.role === 'admin' ? 'player' : 'admin' }))}>
                    {p.role === 'admin' ? 'Fjern admin' : 'Gjør til admin'}
                  </button>
                  <button type="button" className="btn btn-sm" disabled={busy === p.id} onClick={() => void run(p.id, () => api.updateProfile(p.id, { active: !p.active }))}>
                    {p.active ? 'Sett inaktiv' : 'Aktiver'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function RequestCard({ r, busy, onApprove, onReject }: { r: JoinRequest; busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="card card-lavender stack">
      <div>
        <p style={{ fontWeight: 500 }}>{r.name}</p>
        <p className="caption" style={{ color: 'var(--color-ink)' }}>{r.email}{r.phone ? ` · ${r.phone}` : ''} · {new Date(r.created_at).toLocaleDateString('nb-NO')}</p>
      </div>
      {r.message && <p>{r.message}</p>}
      <div className="row">
        <button type="button" className="btn btn-dark" disabled={busy} onClick={onApprove}>Godkjenn og inviter</button>
        <button type="button" className="btn" disabled={busy} onClick={onReject}>Avslå</button>
      </div>
    </div>
  )
}

function InviteForm({ onDone }: { onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'player' as Profile['role'] })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setBusy(true)
    try {
      const r = await api.inviteMember({ ...f, phone: f.phone || undefined })
      // Invitasjonen er lagret uansett, men e-posten kan ha feilet. Da må det
      // stå her: en invitasjon som ikke kom fram, så tidligere helt lik ut.
      if (!r.mail.sent) { setError(`Invitasjonen er lagret, men e-posten til ${r.email} ble ikke sendt: ${r.mail.error ?? 'ukjent feil'}. Sjekk adressen og prøv «Send igjen».`); await onDone(); return }
      setF({ name: '', email: '', phone: '', role: 'player' }); setOpen(false); await onDone()
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }
  if (!open) return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Inviter en spiller</button>
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="h3">Inviter</h2>
      <p className="muted">Personen får en e-post og logger inn med den adressen: Google, Microsoft eller kode.</p>
      <div className="grid-2">
        <label className="field"><span className="label">Navn</span><input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span className="label">E-post</span><input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label className="field"><span className="label">Telefon</span><input className="input" type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
        <label className="field"><span className="label">Rolle</span>
          <select className="select" value={f.role} onChange={e => setF({ ...f, role: e.target.value as Profile['role'] })}><option value="player">Spiller</option><option value="admin">Admin</option></select></label>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="row"><button className="btn btn-primary" disabled={busy}>{busy ? 'Sender…' : 'Send invitasjon'}</button><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Avbryt</button></div>
    </form>
  )
}
