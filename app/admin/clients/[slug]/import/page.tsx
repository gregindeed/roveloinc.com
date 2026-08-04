import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BulkImport from '@/components/BulkImport'
import type { ImportTarget } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { target?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const target: ImportTarget =
    searchParams.target === 'checking' || searchParams.target === 'cc' ? searchParams.target : 'deposits'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Import data</h1>
        <Link href={`/admin/clients/${client.slug}`} className="text-xs text-gray-500 hover:text-gray-900">
          ← Back to entity
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        Paste rows from a statement or upload a CSV, map the columns, review, and commit the batch.
      </p>
      <BulkImport slug={client.slug} initialTarget={target} />
    </div>
  )
}
