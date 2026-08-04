'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/portal')
  return supabase
}

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v === '' ? null : v
}

export async function updateEntity(slug: string, formData: FormData) {
  const supabase = await requireAdmin()

  const name = str(formData, 'name')
  if (!name) redirect(`/admin/clients/${slug}/edit?error=${encodeURIComponent('Business name is required.')}`)

  const fields = {
    name,
    legal_name: str(formData, 'legal_name'),
    owner_name: str(formData, 'owner_name'),
    address: str(formData, 'address'),
    phone: str(formData, 'phone'),
    email: str(formData, 'email'),
    entity_type: str(formData, 'entity_type'),
    ein: str(formData, 'ein'),
    ca_sos_number: str(formData, 'ca_sos_number'),
    cdtfa_account: str(formData, 'cdtfa_account'),
    edd_account: str(formData, 'edd_account'),
    ftb_id: str(formData, 'ftb_id'),
    formation_date: str(formData, 'formation_date'),
    fiscal_year_end: str(formData, 'fiscal_year_end'),
    naics_code: str(formData, 'naics_code'),
    status: str(formData, 'status') ?? 'active',
    notes: str(formData, 'notes'),
  }

  const { error } = await supabase.from('clients').update(fields).eq('slug', slug)
  if (error) {
    redirect(`/admin/clients/${slug}/edit?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/clients/${slug}`)
  redirect(`/admin/clients/${slug}?ok=${encodeURIComponent('Entity profile updated.')}`)
}
