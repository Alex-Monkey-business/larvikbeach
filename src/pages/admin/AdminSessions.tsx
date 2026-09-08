import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { compactDate, time, fromLocalInput, toLocalInput } from '../../lib/format'
import { kr } from '../../lib/money'
import { Notice } from '../../components/Notice'
import type { Season, Session } from '../../lib/types'
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

  // Kommende stiger: den nærmeste økta er den du gjør noe med. Spilte synker:
  // den ferskeste er den du eventuelt må rette. Motsatt av begge var feil.
  const flere = (seasons.data?.length ?? 0) > 1
  const alle = s.data?.sessions ?? []
  const na = Date.now()
  const kommende = alle.filter(x => x.status !== 'held' && new Date(x.starts_at).getTime() >= na)
  const spilte = alle.filter(x => !kommende.includes(x)).slice().reverse()
  const bolker: [string, typeof alle][] = [['Kommende', kommende], ['Spilte', spilte]]

  return (
    <div className="stack-lg">
      {/* Sesongen ER siden: fanelinja over sier alt «Økter», så en h1 med samme
          ord til svarte ikke på hva man ser på. Én lilla knapp, én stille
          lenke, og en setning som sier hva lista er til. */}
      <header className="stack">
        {/* Tittelen ER velgeren: en nedtrekksliste ved siden av som gjentar
            samme sesongnavn er bare det samme ordet to ganger. Med flere
            sesonger ligger et gjennomsiktig select over tittelen. */}
        <div className={`sesongvelger ${flere ? 'kan-byttes' : ''}`}>
          <h1 className="h2">{active?.name ?? 'Økter'}</h1>
          {flere && (
            <select aria-label="Velg sesong" value={active?.id ?? ''} onChange={e => setSeasonId(e.target.value)}>
              {seasons.data!.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
        </div>
        <p className="caption">
          Trykk en økt for å rette oppmøte, tid eller pris.{' '}
          <button type="button" className="lenke" onClick={() => setShowSeason(v => !v)}>{active ? 'Rediger sesongen' : 'Ny sesong'}</button>
        </p>
      </header>

      {(showSeason || (seasons.data && seasons.data.length === 0)) && (
        <SeasonForm season={showSeason ? active : undefined} onSaved={async () => { setShowSeason(false); await seasons.reload() }} />
      )}

      {active && <NewSessionForm season={active} onSaved={s.reload} />}
      {error && <Notice>{error}</Notice>}

      {bolker.map(([tittel, rader]) => rader.length > 0 && (
        <section key={tittel} className="stack">
          <h2 className="h3">{tittel} <span className="muted">{rader.length}</span></h2>
          <ul className="stack">
            {rader.map(x => (
              <li key={x.id} className="card admin-session-row">
                {/* `stack` er marginer på barn, og de biter ikke på et inline
                    element: lenka må være grid selv, ellers klistrer datoen og
                    undertittelen seg sammen på samme linje. */}
                <Link to={`/admin/okter/${x.id}`} style={{ textDecoration: 'none', display: 'grid', gap: 4, minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{compactDate(x.starts_at)} {time(x.starts_at)}</span>
                  <span className="muted">{x.status === 'cancelled' ? 'Avlyst · ' : ''}{goingCount(s.data!.attendance, x.id)} {x.status === 'held' ? 'var med' : 'påmeldt'}{avvik(x, active)}</span>
                </Link>
                {/* Én handling per rad. «Avlys» er sjelden og bor på øktsiden:
                    to knapper her brøt datoen i tre linjer på 390 px. */}
                {x.status === 'planned'
                  ? <button type="button" className="btn btn-sm" onClick={() => void setStatus(x.id, 'held')}>Gjennomført</button>
                  : <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setStatus(x.id, 'planned')}>Angre</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function today() { return new Date().toISOString().slice(0, 10) }

/** Pris og sted står bare når økta avviker fra sesongen. Ellers er det samme
 *  setningen 34 ganger nedover. */
function avvik(x: Session, season: Season | undefined): string {
  const deler: string[] = []
  if (season && x.cost !== season.default_cost) deler.push(kr(x.cost))
  if (x.location && x.location !== season?.default_location) deler.push(x.location)
  return deler.length ? ` · ${deler.join(' · ')}` : ''
}

function SeasonForm({ season, onSaved }: { season?: Season; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    name: season?.name ?? '', kind: season?.kind ?? 'indoor',
    starts_on: season?.starts_on ?? today(), ends_on: season?.ends_on ?? today(),
    cost: season ? String(season.default_cost / 100) : '620', location: season?.default_location ?? '',
    capacity: season?.default_capacity ? String(season.default_capacity) : '', min: season?.default_min_players ? String(season.default_min_players) : '',
    notice: season?.notice ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try {
      await api.saveSeason({ id: season?.id, name: f.name, kind: f.kind as Season['kind'], starts_on: f.starts_on, ends_on: f.ends_on,
        default_cost: Math.round(Number(f.cost) * 100), default_location: f.location || null,
        default_capacity: f.capacity ? Number(f.capacity) : null, default_min_players: f.min ? Number(f.min) : null, notice: f.notice.trim() || null })
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
        <label className="field"><span className="label">Maks antall (tomt = ingen grense)</span><input className="input" type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value })} /></label>
        <label className="field"><span className="label">Minst antall for å spille</span><input className="input" type="number" min={1} value={f.min} onChange={e => setF({ ...f, min: e.target.value })} /></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span className="label">Melding over øktene (én linje)</span><input className="input" value={f.notice} onChange={e => setF({ ...f, notice: e.target.value })} placeholder="Oppmøte 18:15 på Kiwi Farriseidet for felles transport." /></label>
      </div>
      {error && <Notice>{error}</Notice>}
      <button className="btn btn-primary">Lagre sesong</button>
    </form>
  )
}

function NewSessionForm({ season, onSaved }: { season: Season; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const next = new Date(); next.setDate(next.getDate() + 1); next.setHours(20, 0, 0, 0)
  const [f, setF] = useState({ when: toLocalInput(next.toISOString()), duration: '120', location: season.default_location ?? '', cost: String(season.default_cost / 100), note: '', repeat: '1',
    capacity: season.default_capacity ? String(season.default_capacity) : '', min: season.default_min_players ? String(season.default_min_players) : '' })
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try {
      const n = Math.max(1, Math.min(30, Number(f.repeat)))
      for (let i = 0; i < n; i++) {
        const d = new Date(fromLocalInput(f.when)); d.setDate(d.getDate() + 7 * i)
        await api.saveSession({ season_id: season.id, starts_at: d.toISOString(), duration_min: Number(f.duration),
          location: f.location || null, cost: Math.round(Number(f.cost) * 100), note: f.note || null,
          capacity: f.capacity ? Number(f.capacity) : null, min_players: f.min ? Number(f.min) : null })
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
        <label className="field"><span className="label">Maks antall</span><input className="input" type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value })} /></label>
        <label className="field"><span className="label">Minst antall</span><input className="input" type="number" min={1} value={f.min} onChange={e => setF({ ...f, min: e.target.value })} /></label>
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
