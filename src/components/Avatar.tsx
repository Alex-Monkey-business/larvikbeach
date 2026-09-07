import type { Profile } from '../lib/types'
import './Avatar.css'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function Avatar({ profile, size = 32, dim = false }: { profile: Pick<Profile, 'name' | 'avatar_url'>; size?: number; dim?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  return (
    <span className={`avatar ${dim ? 'avatar-dim' : ''}`} style={style} title={profile.name} aria-label={profile.name} role="img">
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        : initials(profile.name)}
    </span>
  )
}

/** Overlappende rekke. Ventelista tegnes dempet. */
export function AvatarStack({ people, waitlisted = [], size = 32 }: { people: Profile[]; waitlisted?: Profile[]; size?: number }) {
  if (people.length + waitlisted.length === 0) return null
  return (
    <span className="avatar-stack">
      {people.map(p => <Avatar key={p.id} profile={p} size={size} />)}
      {waitlisted.map(p => <Avatar key={p.id} profile={p} size={size} dim />)}
    </span>
  )
}
