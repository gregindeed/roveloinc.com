import Avatar from './Avatar'
import type { PresenceUser } from '@/lib/presenceServer'

// Overlapping cluster of the people currently in an entity. Renders nothing when
// no one's around, so an idle screen stays clean.
export default function AvatarStack({
  users,
  size = 24,
  max = 4,
}: {
  users: PresenceUser[]
  size?: number
  max?: number
}) {
  if (!users.length) return null
  const shown = users.slice(0, max)
  const extra = users.length - shown.length

  return (
    <div className="flex -space-x-1.5 items-center" title={users.map((u) => u.name || u.email || 'Someone').join(', ')}>
      {shown.map((u) => (
        <Avatar key={u.id} name={u.name || u.email} email={u.email} url={u.avatarUrl} size={size} ring />
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-500 font-medium ring-2 ring-white"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
