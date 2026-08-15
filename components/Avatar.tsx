import { avatarInitials, avatarColor } from '@/lib/avatar'

// A mini monogram avatar. Server- and client-safe (no hooks). Shows an uploaded
// photo when present, otherwise initials on a muted, deterministic color.
export default function Avatar({
  name,
  email,
  url,
  size = 28,
  ring = false,
  title,
  online,
}: {
  name?: string | null
  email?: string | null
  url?: string | null
  size?: number
  ring?: boolean
  title?: string
  // undefined = don't show a status dot at all; true/false = show green/gray.
  online?: boolean
}) {
  const seed = (email || name || 'x').toLowerCase()
  const label = title ?? name ?? email ?? 'User'
  const dim = `${size}px`
  const ringCls = ring ? 'ring-2 ring-white' : ''

  const face = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label}
      title={label}
      width={size}
      height={size}
      className={`rounded-full object-cover ${ringCls}`}
      style={{ width: dim, height: dim }}
    />
  ) : (
    (() => {
      const { bg, fg } = avatarColor(seed)
      return (
        <span
          title={label}
          aria-label={label}
          className={`inline-flex items-center justify-center rounded-full font-medium select-none ${ringCls}`}
          style={{ width: dim, height: dim, background: bg, color: fg, fontSize: Math.round(size * 0.4), lineHeight: 1 }}
        >
          {avatarInitials(name || email || '')}
        </span>
      )
    })()
  )

  if (online === undefined) return face

  const dot = Math.max(8, Math.round(size * 0.3))
  return (
    <span className="relative inline-flex" style={{ width: dim, height: dim }}>
      {face}
      <span
        title={online ? 'Online' : 'Offline'}
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-white"
        style={{ width: dot, height: dot, background: online ? '#22c55e' : '#d1d5db' }}
      />
    </span>
  )
}
