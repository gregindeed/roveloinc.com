// ── Presence helpers (pure) ──────────────────────────────────────────────────
// The heartbeat pings once a minute; the online window is wider than the ping
// interval so the dot never flickers off in the second before the next ping.

export const ONLINE_WINDOW_MS = 150_000 // ~2.5 minutes

export function isOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false
  const t = Date.parse(lastSeenAt)
  return Number.isFinite(t) && Date.now() - t < ONLINE_WINDOW_MS
}
