import type { Profile } from '../lib/types'
import './Avatar.css'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// Fast farge per person, så samme fjes har samme tone hver gang.
const TONES = ['tone-lavender', 'tone-forest', 'tone-stone']
function tone(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export function Avatar({ profile, size = 34, dim = false }: { profile: Pick<Profile, 'name' | 'avatar_url'>; size?: number; dim?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  return (
    <span className={`avatar ${dim ? 'avatar-dim' : tone(profile.name)}`} style={style} title={profile.name} aria-label={profile.name} role="img">
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        : initials(profile.name)}
    </span>
  )
}

/** Fri rekke: de med plass først, ventelista dempet bakerst. */
export function AvatarStack({ people, waitlisted = [], size = 34 }: { people: Profile[]; waitlisted?: Profile[]; size?: number }) {
  if (people.length + waitlisted.length === 0) return null
  return (
    <span className="avatar-stack">
      {people.map(p => <Avatar key={p.id} profile={p} size={size} />)}
      {waitlisted.map(p => <Avatar key={p.id} profile={p} size={size} dim />)}
    </span>
  )
}
