import { Cat, Bird, Rocket, Ghost, Gem, Flame, Leaf, Zap, type LucideIcon } from 'lucide-react'
import type { User } from '../types'

/** Debe coincidir exactamente con AVATAR_PRESET_KEYS en backend/app/services/avatar.py. */
export const AVATAR_PRESETS: { key: string; icon: LucideIcon; bg: string }[] = [
  { key: 'violet', icon: Gem,    bg: '#7C3AED' },
  { key: 'blue',   icon: Bird,   bg: '#2563EB' },
  { key: 'cyan',   icon: Zap,    bg: '#0891B2' },
  { key: 'green',  icon: Leaf,   bg: '#16A34A' },
  { key: 'amber',  icon: Flame,  bg: '#D97706' },
  { key: 'orange', icon: Rocket, bg: '#EA580C' },
  { key: 'rose',   icon: Ghost,  bg: '#E11D48' },
  { key: 'slate',  icon: Cat,    bg: '#475569' },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

interface AvatarProps {
  user: Pick<User, 'id' | 'full_name' | 'avatar' | 'updated_at'> | null | undefined
  size?: number
  className?: string
}

export function Avatar({ user, size = 32, className = '' }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) }
  const base = `rounded-full flex items-center justify-center shrink-0 overflow-hidden ${className}`

  if (!user) {
    return (
      <div className={`${base} bg-surface-2 border border-border text-text-muted`} style={style}>
        ?
      </div>
    )
  }

  if (user.avatar === 'custom') {
    const v = user.updated_at ? encodeURIComponent(user.updated_at) : ''
    return (
      <img
        src={`/api/v1/users/${user.id}/avatar${v ? `?v=${v}` : ''}`}
        alt={user.full_name}
        className={base}
        style={style}
      />
    )
  }

  if (user.avatar?.startsWith('preset:')) {
    const key = user.avatar.slice('preset:'.length)
    const preset = AVATAR_PRESETS.find(p => p.key === key)
    if (preset) {
      const Icon = preset.icon
      return (
        <div className={base} style={{ ...style, background: preset.bg }}>
          <Icon size={size * 0.55} color="white" strokeWidth={2} />
        </div>
      )
    }
  }

  return (
    <div className={`${base} bg-primary/20 text-primary font-semibold`} style={style}>
      {initials(user.full_name)}
    </div>
  )
}
