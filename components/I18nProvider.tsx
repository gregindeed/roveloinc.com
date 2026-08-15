'use client'

import { createContext, useContext } from 'react'
import { t as translate, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

const LocaleCtx = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleCtx)
}

// t() bound to the current locale, for client components.
export function useT() {
  const locale = useContext(LocaleCtx)
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
}
