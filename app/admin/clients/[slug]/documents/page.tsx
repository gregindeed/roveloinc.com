import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DocumentsPanel from '@/components/DocumentsPanel'
import type { DocumentRow } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function DocumentsPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: client } = await supabase.from('clients').select('id').eq('slug', params.slug).single()
  if (!client) notFound()

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  return (
    <DocumentsPanel
      clientId={client.id}
      currentUserId={user!.id}
      isAdmin={true}
      initialDocs={(documents ?? []) as DocumentRow[]}
    />
  )
}
