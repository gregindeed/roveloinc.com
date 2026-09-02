'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { entityBase } from '@/lib/entityYear'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

export async function createDocYear(slug: string, formData: FormData) {
  const supabase = await admin()
  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!client) redirect(`${entityBase(slug)}/documents?warn=Client not found`)

  const raw = String(formData.get('year') ?? '').trim()
  const year = parseInt(raw, 10)
  const nowY = new Date().getFullYear()
  if (!Number.isFinite(year) || year < 2000 || year > nowY + 1) {
    redirect(`${entityBase(slug)}/documents?warn=${encodeURIComponent('Enter a valid year (2000–' + (nowY + 1) + ').')}`)
  }

  const { error } = await supabase
    .from('document_years')
    .upsert({ client_id: client.id, year }, { onConflict: 'client_id,year' })
  if (error) {
    redirect(`${entityBase(slug)}/documents?warn=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`${entityBase(slug)}/documents`)
  redirect(`${entityBase(slug)}/documents?year=${year}`)
}
