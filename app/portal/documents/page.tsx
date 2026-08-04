import { createClient } from '@/lib/supabase/server'
import DocumentsPanel from '@/components/DocumentsPanel'
import type { DocumentRow } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function PortalDocuments() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user!.id)
    .single()
  if (!profile?.client_id) return null

  // RLS returns only this client's own documents.
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <DocumentsPanel
      clientId={profile.client_id}
      currentUserId={user!.id}
      isAdmin={false}
      initialDocs={(documents ?? []) as DocumentRow[]}
    />
  )
}
