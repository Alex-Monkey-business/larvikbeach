import { supabase } from './supabase'
import { unwrap } from './useQuery'
import type { Attendance, Balance, Charge, Invite, Invoice, JoinRequest, Match, Profile, Season, SeasonStat, Session, Settings } from './types'

// Alle skriv som kan filtreres bort av RLS har .select(): en update som
// treffer null rader gir ellers «ok» uten feil.

export const api = {
  settings: async () => unwrap<Settings>(await supabase.from('settings').select('*').single()),
  saveSettings: async (patch: Partial<Settings>) =>
    unwrap<Settings>(await supabase.from('settings').update(patch).eq('id', true).select().single()),

  profiles: async () => unwrap<Profile[]>(await supabase.from('profiles').select('*').order('name')),
  updateProfile: async (id: string, patch: Partial<Profile>) =>
    unwrap<Profile>(await supabase.from('profiles').update(patch).eq('id', id).select().single()),
  updateMyProfile: async (name: string, phone: string) =>
    unwrap<Profile>(await supabase.rpc('update_my_profile', { p_name: name, p_phone: phone })),

  seasons: async () => unwrap<Season[]>(await supabase.from('seasons').select('*').order('starts_on', { ascending: false })),
  saveSeason: async (s: Partial<Season> & { id?: string }) => {
    const { id, ...rest } = s
    if (id) return unwrap<Season>(await supabase.from('seasons').update(rest).eq('id', id).select().single())
    return unwrap<Season>(await supabase.from('seasons').insert(rest).select().single())
  },

  sessions: async (opts: { from?: string; to?: string; seasonId?: string } = {}) => {
    let q = supabase.from('sessions').select('*').order('starts_at')
    if (opts.from) q = q.gte('starts_at', opts.from)
    if (opts.to) q = q.lt('starts_at', opts.to)
    if (opts.seasonId) q = q.eq('season_id', opts.seasonId)
    return unwrap<Session[]>(await q)
  },
  session: async (id: string) => unwrap<Session>(await supabase.from('sessions').select('*').eq('id', id).single()),
  saveSession: async (s: Partial<Session> & { id?: string }) => {
    const { id, ...rest } = s
    if (id) return unwrap<Session>(await supabase.from('sessions').update(rest).eq('id', id).select().single())
    return unwrap<Session>(await supabase.from('sessions').insert(rest).select().single())
  },
  deleteSession: async (id: string) =>
    unwrap<Session[]>(await supabase.from('sessions').delete().eq('id', id).select()),
  setSessionStatus: async (id: string, status: Session['status']) =>
    unwrap<Session>(await supabase.rpc('set_session_status', { p_session: id, p_status: status })),

  attendance: async (sessionIds: string[]) =>
    sessionIds.length
      ? unwrap<Attendance[]>(await supabase.from('attendance').select('*').in('session_id', sessionIds))
      : [],
  setAttendance: async (sessionId: string, going: boolean, profileId?: string) =>
    unwrap<Attendance>(await supabase.rpc('set_attendance', {
      p_session: sessionId, p_going: going, ...(profileId ? { p_profile: profileId } : {}),
    })),

  charges: async (filter: { sessionId?: string; profileId?: string } = {}) => {
    let q = supabase.from('charges').select('*')
    if (filter.sessionId) q = q.eq('session_id', filter.sessionId)
    if (filter.profileId) q = q.eq('profile_id', filter.profileId)
    return unwrap<Charge[]>(await q)
  },

  invoices: async (filter: { profileId?: string } = {}) => {
    let q = supabase.from('invoices').select('*').order('period', { ascending: false })
    if (filter.profileId) q = q.eq('profile_id', filter.profileId)
    return unwrap<Invoice[]>(await q)
  },
  claimInvoice: async (id: string) => unwrap<Invoice>(await supabase.rpc('claim_invoice', { p_invoice: id })),
  setInvoiceStatus: async (id: string, status: 'notified' | 'confirmed' | 'waived', ref?: string) =>
    unwrap<Invoice>(await supabase.rpc('set_invoice_status', { p_invoice: id, p_status: status, ...(ref ? { p_ref: ref } : {}) })),
  createInvoices: async (period?: string) =>
    unwrap<number>(await supabase.rpc('create_invoices', period ? { p_period: period } : {})),

  balances: async () => unwrap<Balance[]>(await supabase.from('balances').select('*')),
  myBalance: async (profileId: string) =>
    unwrap<Balance>(await supabase.from('balances').select('*').eq('profile_id', profileId).single()),

  joinRequests: async () =>
    unwrap<JoinRequest[]>(await supabase.from('join_requests').select('*').order('created_at', { ascending: false })),
  // Anon har bare INSERT, ingen SELECT: raden kan ikke leses tilbake. En
  // insert som RLS nekter feiler høyt uansett (42501), så ingen .select() her.
  submitJoinRequest: async (r: { name: string; email: string; phone: string; message: string }) => {
    const { error } = await supabase.from('join_requests').insert({
      name: r.name.trim(), email: r.email.trim().toLowerCase(), phone: r.phone.trim() || null, message: r.message.trim() || null,
    })
    if (error) throw new Error(error.message)
  },
  setJoinRequestStatus: async (id: string, status: 'approved' | 'rejected', by: string) =>
    unwrap<JoinRequest>(await supabase.from('join_requests').update({ status, handled_at: new Date().toISOString(), handled_by: by }).eq('id', id).select().single()),

  matches: async (sessionId: string) =>
    unwrap<Match[]>(await supabase.from('matches').select('*').eq('session_id', sessionId).order('round')),
  drawMatches: async (sessionId: string, append = false) =>
    unwrap<Match[]>(await supabase.rpc('draw_matches', { p_session: sessionId, p_append: append })),
  setMatchScore: async (matchId: string, a: number | null, b: number | null) =>
    unwrap<Match>(await supabase.rpc('set_match_score', { p_match: matchId, p_a: a, p_b: b })),
  setMatchWinner: async (matchId: string, winner: 'a' | 'b' | null) =>
    unwrap<Match>(await supabase.rpc('set_match_winner', { p_match: matchId, p_winner: winner })),

  seasonStats: async (seasonId: string) =>
    unwrap<SeasonStat[]>(await supabase.from('season_stats').select('*').eq('season_id', seasonId)),

  invites: async () => unwrap<Invite[]>(await supabase.from('invites').select('*').is('accepted_at', null).order('created_at', { ascending: false })),
  deleteInvite: async (email: string) => unwrap<Invite[]>(await supabase.from('invites').delete().eq('email', email).select()),

  // Edge Functions. service_role bor der, aldri i klienten.
  inviteMember: async (body: { name: string; email: string; phone?: string; role?: 'admin' | 'player'; join_request_id?: string }) => {
    const { data, error } = await supabase.functions.invoke('invite-member', { body })
    if (error) throw new Error(await edgeError(error))
    return data as { email: string; activated: boolean }
  },
  sendInvoices: async (body: { period?: string; dry_run?: boolean } = {}) => {
    const { data, error } = await supabase.functions.invoke('send-invoices', { body })
    if (error) throw new Error(await edgeError(error))
    return data as { created: number; sent: number; admin_summary: string }
  },
}

async function edgeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try { const j = await ctx.json(); if (j?.error) return j.error } catch { /* fall gjennom */ }
  }
  return error instanceof Error ? error.message : 'Noe gikk galt'
}
