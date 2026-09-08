import 'server-only'
import { translate } from '@/lib/ai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Locale } from '@/lib/i18n'

type AssessmentRow = {
  client_id: string
  scope: string
  content: string | null
  source_lang?: string | null
  translations?: Record<string, string> | null
} | null

// Return the Overseer read in the viewer's language. If the stored read is in a
// different language, translate it once and cache the result on the row so every
// later view is instant. Best-effort: never throws, falls back to the original.
export async function localizedAssessment(row: AssessmentRow, locale: Locale): Promise<string | null> {
  if (!row?.content) return row?.content ?? null
  const src = (row.source_lang || 'en').toLowerCase()
  if (locale === src) return row.content

  const cached = row.translations?.[locale]
  if (cached) return cached

  const translated = await translate(row.content, locale === 'es' ? 'es' : 'en')
  try {
    const admin = createAdminClient()
    const next = { ...(row.translations ?? {}), [locale]: translated }
    await admin
      .from('ai_assessments')
      .update({ translations: next })
      .eq('client_id', row.client_id)
      .eq('scope', row.scope)
  } catch {
    // Caching is best-effort; still return the translation for this view.
  }
  return translated
}
