// ── Monogram avatar helpers (pure — safe in server and client) ───────────────
// Deterministic initials + a muted color per person, so the same user always
// reads as the same soft chip. No LLM, no storage — just a stable hash.

export function avatarInitials(nameOrEmail: string): string {
  const raw = (nameOrEmail || '').trim()
  if (!raw) return '?'
  // For an email, use the local part with separators as word breaks.
  const base = raw.includes('@') ? raw.split('@')[0].replace(/[._+-]+/g, ' ') : raw
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Muted, low-saturation palette — reads as tidy, never loud on the clean UI.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: '#e2e8f0', fg: '#334155' }, // slate
  { bg: '#e7e5e4', fg: '#44403c' }, // stone
  { bg: '#e5e7eb', fg: '#374151' }, // gray
  { bg: '#dbeafe', fg: '#1e3a5f' }, // muted blue
  { bg: '#dcfce7', fg: '#14532d' }, // muted green
  { bg: '#fef3c7', fg: '#713f12' }, // muted amber
  { bg: '#ede9fe', fg: '#4c1d95' }, // muted violet
  { bg: '#ffe4e6', fg: '#881337' }, // muted rose
  { bg: '#cffafe', fg: '#155e63' }, // muted teal
]

export function avatarColor(seed: string): { bg: string; fg: string } {
  const s = (seed || 'x').toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// A stable @handle for a user, without the leading @. Prefers the handle they
// set; otherwise derives a clean default from their display name, then their
// email local part. Always returns something usable so the UI never falls back
// to a raw email address. Pure — safe in server and client.
export function defaultHandle(opts: {
  handle?: string | null
  displayName?: string | null
  email?: string | null
}): string {
  const set = (opts.handle || '').trim().replace(/^@+/, '')
  if (set) return set
  const source =
    (opts.displayName && opts.displayName.trim()) ||
    (opts.email ? opts.email.split('@')[0] : '') ||
    'user'
  const slug = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
  return slug || 'user'
}
