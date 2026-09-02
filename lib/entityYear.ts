import 'server-only'
import { headers } from 'next/headers'

// The workspace lives under /admin/clients/<slug>/<year>/…. Server actions can
// recover the active year from the submitting page's URL (the referer), so their
// redirects/revalidations stay inside the right year without threading it
// through every signature. Falls back to null (→ the entity's year picker).
export function refererYear(): string | null {
  const ref = headers().get('referer') || ''
  const m = ref.match(/\/admin\/clients\/[^/]+\/(\d{4})(?:[/?#]|$)/)
  return m ? m[1] : null
}

// Base path for the current year's workspace; year-less (picker) if unknown.
export function entityBase(slug: string): string {
  const y = refererYear()
  return y ? `/admin/clients/${slug}/${y}` : `/admin/clients/${slug}`
}
