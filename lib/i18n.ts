// ── Lightweight i18n (pure, server + client safe) ────────────────────────────
// A tiny dictionary lookup — no framework, no locale routing — which fits the
// Workers stack and keeps us in control. Add keys as surfaces are translated;
// a missing key falls back to English, then to the key itself, so nothing ever
// renders blank while translation is in progress.

export type Locale = 'en' | 'es'
export const LOCALES: Locale[] = ['en', 'es']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_LABELS: Record<Locale, string> = { en: 'English', es: 'Español' }

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'es'
}

type Dict = Record<string, string>

const en: Dict = {
  'nav.settings': 'Settings',
  'nav.profile': 'Your profile',
  'nav.signOut': 'Sign out',
  'common.back': 'Back',
  'common.save': 'Save',
  'profile.title': 'Your profile',
  'profile.subtitle': 'Set how your name and avatar appear to your team.',
  'profile.displayName': 'Display name',
  'profile.namePlaceholder': 'e.g. Greg Rovelo',
  'profile.email': 'Email',
  'profile.language': 'Language',
  'profile.appearHint': "This is how you'll appear across Rovelo Inc.",
  'profile.saved': 'Profile saved.',
  'profile.you': 'You',
}

const es: Dict = {
  'nav.settings': 'Configuración',
  'nav.profile': 'Tu perfil',
  'nav.signOut': 'Cerrar sesión',
  'common.back': 'Volver',
  'common.save': 'Guardar',
  'profile.title': 'Tu perfil',
  'profile.subtitle': 'Configura cómo aparecen tu nombre y tu avatar ante tu equipo.',
  'profile.displayName': 'Nombre visible',
  'profile.namePlaceholder': 'p. ej. Greg Rovelo',
  'profile.email': 'Correo electrónico',
  'profile.language': 'Idioma',
  'profile.appearHint': 'Así es como aparecerás en Rovelo Inc.',
  'profile.saved': 'Perfil guardado.',
  'profile.you': 'Tú',
}

const DICTS: Record<Locale, Dict> = { en, es }

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const d = DICTS[locale] ?? en
  let s = d[key] ?? en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  return s
}
