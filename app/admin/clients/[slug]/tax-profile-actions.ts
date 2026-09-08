'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const back = (slug: string, key: 'ok' | 'warn', msg: string): never =>
  redirect(`/admin/clients/${slug}/account?${key}=${encodeURIComponent(msg)}`)

// Set the individual tax profile — residency basis, ID type, and (for a
// nonresident) the treaty country + reduced dividend rate.
export async function setTaxProfile(slug: string, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()

  const residency = String(formData.get('residency') || '').trim()
  const taxIdType = String(formData.get('tax_id_type') || '').trim()
  const treatyCountry = String(formData.get('treaty_country') || '').trim().toUpperCase()

  // Rate entered as a percent (e.g. "10" or "10%") → fraction 0.10.
  const rateRaw = String(formData.get('treaty_dividend_rate') || '').replace(/[%\s]/g, '').trim()
  let treatyRate: number | null = null
  if (rateRaw) {
    const n = Number(rateRaw)
    if (Number.isFinite(n) && n >= 0) treatyRate = n > 1 ? n / 100 : n
  }

  const isNonresident = residency === 'nonresident'

  const { error } = await supabase
    .from('clients')
    .update({
      residency: residency === 'resident' || residency === 'nonresident' ? residency : null,
      tax_id_type: taxIdType === 'ssn' || taxIdType === 'itin' ? taxIdType : null,
      treaty_country: isNonresident && treatyCountry ? treatyCountry : null,
      treaty_dividend_rate: isNonresident ? treatyRate : null,
    })
    .eq('slug', slug)

  if (error) back(slug, 'warn', `Could not save tax profile: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', 'Tax profile saved.')
}
