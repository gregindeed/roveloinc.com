import 'server-only'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, type Locale } from './i18n'

// The rendering locale for server components. The cookie is set on login and on
// every switch, so it's authoritative here; the durable per-user value lives on
// the profile and is what seeds the cookie.
export function getLocale(): Locale {
  const c = cookies().get('locale')?.value
  return isLocale(c) ? c : DEFAULT_LOCALE
}
