export type Role = 'admin' | 'player'

export interface Profile {
  id: string
  name: string
  email: string
  phone: string | null
  role: Role
  active: boolean
  avatar_url: string | null
  created_at: string
}

export interface Settings {
  id: true
  group_name: string
  vipps_number: string | null
  vipps_display_name: string | null
  billing_day: number
  settle_after_hours: number
  signup_window_days: number
  admin_email: string | null
}

export interface JoinRequest {
  id: string
  name: string
  email: string
  phone: string | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  handled_at: string | null
}

export type SeasonKind = 'indoor' | 'outdoor'

export interface Season {
  id: string
  name: string
  kind: SeasonKind
  starts_on: string
  ends_on: string
  default_cost: number
  default_location: string | null
  default_capacity: number | null
  default_min_players: number | null
  notice: string | null
}

export type SessionStatus = 'planned' | 'held' | 'cancelled'

export interface Session {
  id: string
  season_id: string
  starts_at: string
  duration_min: number
  location: string | null
  cost: number
  status: SessionStatus
  note: string | null
  capacity: number | null
  min_players: number | null
}

export interface Attendance {
  session_id: string
  profile_id: string
  going: boolean
  source: 'self' | 'admin'
  updated_at: string
}

export interface Charge {
  id: string
  session_id: string
  profile_id: string
  amount: number
  invoice_id: string | null
}

export type InvoiceStatus = 'open' | 'notified' | 'claimed' | 'confirmed' | 'waived'

export interface Invoice {
  id: string
  profile_id: string
  period: string
  amount: number
  status: InvoiceStatus
  notified_at: string | null
  claimed_at: string | null
  confirmed_at: string | null
  external_ref: string | null
  created_at: string
}

export interface Balance {
  profile_id: string
  invoiced_open: number
  claimed: number
  uninvoiced: number
}

export interface Invite {
  email: string
  name: string
  phone: string | null
  role: Role
  invited_by: string | null
  created_at: string
  accepted_at: string | null
}

export interface Match {
  id: string
  session_id: string
  round: number
  team_a: string[]
  team_b: string[]
  resting: string[]
  winner: 'a' | 'b' | null
  score_a: number | null
  score_b: number | null
}

export interface SeasonStat {
  season_id: string
  profile_id: string
  sessions: number
  wins: number
  games: number
}
