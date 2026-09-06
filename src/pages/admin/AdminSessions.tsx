import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { longDate, time, fromLocalInput, toLocalInput } from '../../lib/format'
import { kr } from '../../lib/money'
import { Notice } from '../../components/Notice'
import type { Season } from '../../lib/types'
import { goingCount, useSessions } from '../play/useSessions'

export function AdminSessions() {
  const seasons = useQuery(() => api.seasons(), [])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const active = seasons.data?.find(s => s.id === seasonId) ?? seasons.data?.find(s => s.ends_on >= today()) ?? seasons.data?.[0]
  const s = useSessions({ seasonId: active?.id }, [active?.id])
  const [showSeason, setShowSeason] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(id: string, status: 'planned' | 'held' | 'cancelled') {
    setError(null)
    try { await api.setSessionStatus(id, status); await s.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
  }

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1 className="h2">Økter</h1>
        <div className="row">
          {seasons.data && seasons.data.length > 1 && (
            <select className="select" style={{ width: 'auto' }} value={active?.id ?? ''} onChange={e => setSeasonId(e.target.value)}>
              {seasons.data.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setShowSeason(v => !v)}>{active ? 'Sesong' : 'Ny sesong'}</button>
        </div>
      </div>

      {(showSeason || (seasons.data && seasons.data.length === 0)) && (
        <SeasonForm season={showSeason ? active : undefined} onSaved={async () => { setShowSeason(false); await seasons.reload() }} />
      )}

      {active && <NewSessionForm season={active} onSaved={s.reload} />}
      {error && <Notice>{error}</Notice>}

      <ul className="stack">
        {(s.data?.sessions ?? []).slice().reverse().map(x => (
          <li key={x.id} className="card row between">
            <Link to={`/admin/okter/${x.id}`} className="stack" style={{ textDecoration: 'none', gap: 4 }}>
              <span style={{ fontWeight: 500 }}>{longDate(x.starts_at)} {time(x.starts_at)}</span>
              <span className="muted">{goingCount(s.data!.attendance, x.id)} {x.status === 'held' ? 'var med' : 'påmeldt'}{x.cost > 0 ? ` · ${kr(x.cost)}` : ''}{x.location ? ` · ${x.location}` : ''}</span>
            </Link>
            <div className="row">
              {x.status === 'planned' && <span className="badge badge-stone">Planlagt</span>}
              {x.status === 'held' && <span className="badge badge-forest">Gjennomført</span>}
              {x.status === 'cancelled' && <span className="badge badge-ember">Avlyst</span>}
              {x.status === 'planned' && <button type="button" className="btn btn-sm" onClick={() => void setStatus(x.id, 'held')}>Gjennomført</button>}
              {x.status === 'planned' && <button type="button" className="btn btn-sm" onClick={() => void setStatus(x.id, 'cancelled')}>Avlys</button>}
              {x.status !== 'planned' && <button type="button" className="btn btn-sm" onClick={() => void setStatus(x.id, 'planned')}>Angre</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function today() { return new Date().toISOString().slice(0, 10) }

function SeasonForm({ season, onSaved }: { season?: Season; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    name: season?.name ?? '', kind: season?.kind ?? 'indoor',
    starts_on: season?.starts_on ?? today(), ends_on: season?.ends_on ?? today(),
    cost: season ? String(season.default_cost / 100) : '1200', location: season?.default_location ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try {
      await api.saveSeason({ id: season?.id, name: f.name, kind: f.kind as Season['kind'], starts_on: f.starts_on, ends_on: f.ends_on,
        default_cost: Math.round(Number(f.cost) * 100), default_location: f.location || null })
      await onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="h3">{season ? 'Rediger sesong' : 'Ny sesong'}</h2>
      <div className="grid-2">
        <label className="field"><span className="label">Navn</span><input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Vinter 2026/27" /></label>
        <label className="field"><span className="label">Type</span>
          <select className="select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as Season['kind'] })}>
            <option value="indoor">Inne (hall, spleis)</option><option value="outdoor">Ute (gratis)</option>
          </select></label>
        <label className="field"><span className="label">Fra</span><input className="input" type="date" required value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} /></label>
        <label className="field"><span className="label">Til</span><input className="input" type="date" required value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></label>
        <label className="field"><span className="label">Hallpris per økt (kr)</span><input className="input" type="number" min={0} step={1} value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></label>
        <label className="field"><span className="label">Sted</span><input className="input" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></label>
      </div>
      {error && <Notice>{error}</Notice>}
      <button className="btn btn-primary">Lagre sesong</button>
    </form>
  )
}

function NewSessionForm({ season, onSaved }: { season: Season; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const next = new Date(); next.setDate(next.getDate() + 1); next.setHours(20, 0, 0, 0)
  const [f, setF] = useState({ when: toLocalInput(next.toISOString()), duration: '90', location: season.default_location ?? '', cost: String(season.default_cost / 100), note: '', repeat: '1' })
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try {
      const n = Math.max(1, Math.min(30, Number(f.repeat)))
      for (let i = 0; i < n; i++) {
        const d = new Date(fromLocalInput(f.when)); d.setDate(d.getDate() + 7 * i)
        await api.saveSession({ season_id: season.id, starts_at: d.toISOString(), duration_min: Number(f.duration),
          location: f.location || null, cost: Math.round(Number(f.cost) * 100), note: f.note || null })
      }
      setOpen(false); await onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
  }
  if (!open) return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Ny økt</button>
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="h3">Ny økt i {season.name}</h2>
      <div className="grid-2">
        <label className="field"><span className="label">Når</span><input className="input" type="datetime-local" required value={f.when} onChange={e => setF({ ...f, when: e.target.value })} /></label>
        <label className="field"><span className="label">Varighet (min)</span><input className="input" type="number" min={15} step={15} value={f.duration} onChange={e => setF({ ...f, duration: e.target.value })} /></label>
        <label className="field"><span className="label">Sted</span><input className="input" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></label>
        <label className="field"><span className="label">Hallpris (kr)</span><input className="input" type="number" min={0} value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></label>
        <label className="field"><span className="label">Gjenta ukentlig, antall uker</span><input className="input" type="number" min={1} max={30} value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })} /></label>
        <label className="field"><span className="label">Notat</span><input className="input" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="row">
        <button className="btn btn-primary">Lagre</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Avbryt</button>
      </div>
    </form>
  )
}
