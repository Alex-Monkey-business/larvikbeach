import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { Avatar } from '../../components/Avatar'
import { Notice } from '../../components/Notice'

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : '0'
}

// Leseflate. Redigering er et valg man tar, ikke tilstanden man lander i.
export function Me() {
  const { profile, signOut } = useAuth()
  const [editing, setEditing] = useState(false)

  const q = useQuery(async () => {
    const seasons = await api.seasons()
    const today = new Date().toISOString().slice(0, 10)
    const season = seasons.find(s => s.starts_on <= today && s.ends_on >= today) ?? seasons[0]
    if (!season) return null
    const stats = await api.seasonStats(season.id)
    return { season, stats }
  }, [])

  const rows = (q.data?.stats ?? []).slice().sort((a, b) => b.sessions - a.sessions || b.wins - a.wins)
  const mine = rows.find(r => r.profile_id === profile?.id)
  const rank = mine ? rows.findIndex(r => r.profile_id === mine.profile_id) + 1 : null

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 560 }}>
      <header className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
        {profile && <Avatar profile={profile} size={56} />}
        <h1 className="h1" style={{ minWidth: 0 }}>{profile?.name}</h1>
      </header>

      {q.data && (
        <section className="card stack">
          <div className="row between">
            <h2 className="h3">{q.data.season.name}</h2>
            {rank && <span className="caption">nr. {rank} av {rows.length} på oppmøte</span>}
          </div>
          <div className="me-numbers">
            <div><p className="num">{mine?.sessions ?? 0}</p><p className="caption">økter</p></div>
            <div><p className="num">{mine?.wins ?? 0}</p><p className="caption">seire</p></div>
            <div><p className="num">{signed(mine?.points_diff ?? 0)}</p><p className="caption">poengdiff</p></div>
          </div>
          {(mine?.games ?? 0) > 0 && (
            <p className="caption">{mine!.games} {mine!.games === 1 ? 'kamp' : 'kamper'} · {mine!.points_for} scoret · {mine!.points_against} sluppet inn</p>
          )}
          <Link to="/spill/statistikk" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start', paddingLeft: 0 }}>Se hele statistikken →</Link>
        </section>
      )}

      {editing
        ? <EditForm onDone={() => setEditing(false)} />
        : (
          <section className="card stack">
            <ul className="list">
              <li className="row between"><span className="caption">E-post</span><span>{profile?.email}</span></li>
              <li className="row between"><span className="caption">Telefon</span><span>{profile?.phone || <span className="muted">Ikke lagt inn</span>}</span></li>
            </ul>
            <button type="button" className="btn" onClick={() => setEditing(true)}>Endre navn og telefon</button>
            <p className="caption">E-posten er innloggingen din og endres av admin.</p>
          </section>
        )}

      <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => void signOut()}>Logg ut</button>

      <p className="caption">
        <a href="https://alexmonkeybusiness.com" target="_blank" rel="noreferrer">Laget av alexmonkeybusiness.com</a>
        {' · '}
        <Link to="/personvern">Personvern</Link>
      </p>
    </div>
  )
}

function EditForm({ onDone }: { onDone: () => void }) {
  const { profile, reloadProfile } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await api.updateMyProfile(name, phone); await reloadProfile(); onDone() }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt'); setBusy(false) }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2 className="h3">Endre</h2>
      <label className="field"><span className="label">Navn</span>
        <input className="input" value={name} onChange={e => setName(e.target.value)} required /></label>
      <label className="field"><span className="label">Telefon</span>
        <input className="input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      {error && <Notice>{error}</Notice>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Lagrer…' : 'Lagre'}</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Avbryt</button>
      </div>
    </form>
  )
}
