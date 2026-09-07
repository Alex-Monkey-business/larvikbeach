import { useState } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import type { Attendance, Profile, Session } from '../../lib/types'

export interface SessionsWithAttendance {
  sessions: Session[]
  attendance: Attendance[]
}

/** Økter i et tidsvindu med all påmelding, og en toggler som oppdaterer optimistisk. */
export function useSessions(opts: { from?: string; to?: string; seasonId?: string; id?: string }, deps: unknown[] = []) {
  const q = useQuery<SessionsWithAttendance>(async () => {
    const sessions = await api.sessions(opts)
    const attendance = await api.attendance(sessions.map(s => s.id))
    return { sessions, attendance }
  }, deps)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(sessionId: string, going: boolean, profileId?: string) {
    setBusyId(sessionId); setError(null)
    try {
      await api.setAttendance(sessionId, going, profileId)
      await q.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noe gikk galt')
    } finally {
      setBusyId(null)
    }
  }

  return { ...q, toggle, busyId, actionError: error }
}

/** Påmeldte i kørekkefølge (først trykket, først plass). */
export function goingQueue(att: Attendance[], sessionId: string): Attendance[] {
  return att.filter(a => a.session_id === sessionId && a.going)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
}

export function goingCount(att: Attendance[], sessionId: string) {
  return goingQueue(att, sessionId).length
}

export type MyState = { going: false } | { going: null } | { going: true; spot: number; waitlisted: boolean }

/** Mitt svar for en økt: ikke svart, kan ikke, har plass, eller på venteliste (spot = plass i køen, 1-basert). */
export function mineFor(att: Attendance[], session: Session, profileId: string | undefined): MyState {
  const a = att.find(x => x.session_id === session.id && x.profile_id === profileId)
  if (!a) return { going: null }
  if (!a.going) return { going: false }
  const spot = goingQueue(att, session.id).findIndex(x => x.profile_id === profileId) + 1
  return { going: true, spot, waitlisted: session.capacity != null && spot > session.capacity }
}

/** Én setning om status. Kortet viser bare denne. */
export function statusLine(session: Session, going: number): string {
  const cap = session.capacity
  const min = session.min_players
  if (min && going < min) return `${going} påmeldt, trenger ${min}`
  if (cap && going >= cap) return going > cap ? `Fullt · ${going - cap} på venteliste` : 'Fullt'
  if (cap) return `${going} påmeldt · ${cap - going} ${cap - going === 1 ? 'plass' : 'plasser'} igjen`
  return `${going} påmeldt`
}

/** Antall som deler regningen: de med plass. */
export function payerCount(session: Session, going: number): number {
  return session.capacity ? Math.min(going, session.capacity) : going
}

/** Påmeldte som profiler, delt i de med plass og ventelista. */
export function splitQueue(att: Attendance[], session: Session, byId: Map<string, Profile>) {
  const queue = goingQueue(att, session.id).map(a => byId.get(a.profile_id)).filter(Boolean) as Profile[]
  const cap = session.capacity ?? queue.length
  return { withSpot: queue.slice(0, cap), waitlist: queue.slice(cap) }
}
