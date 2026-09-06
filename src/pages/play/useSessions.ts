import { useState } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import type { Attendance, Session } from '../../lib/types'

export interface SessionsWithAttendance {
  sessions: Session[]
  attendance: Attendance[]
}

/** Økter i et tidsvindu med all påmelding, og en toggler som oppdaterer optimistisk. */
export function useSessions(opts: { from?: string; to?: string; seasonId?: string }, deps: unknown[] = []) {
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

  return { ...q, toggle, busyId, error }
}

export function goingCount(att: Attendance[], sessionId: string) {
  return att.filter(a => a.session_id === sessionId && a.going).length
}

export function mineFor(att: Attendance[], sessionId: string, profileId: string | undefined): boolean | null {
  const a = att.find(x => x.session_id === sessionId && x.profile_id === profileId)
  return a ? a.going : null
}
