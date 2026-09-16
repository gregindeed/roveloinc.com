import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer } from '@/lib/auth'
import { acceptCollaboration } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Accept invitation — Rovelo Inc',
  robots: { index: false, follow: false },
}

function Shell({
  title,
  body,
  cta,
  children,
}: {
  title: string
  body: string
  cta?: { href: string; label: string }
  children?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Rovelo Inc · Property management</p>
        <h1 className="mt-3 text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          {title}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        {children}
        {cta && (
          <Link href={cta.href} className="mt-5 inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  )
}

export default async function CollabAccept({ params }: { params: { token: string } }) {
  const admin = createAdminClient()
  const { data: invRow } = await admin
    .from('property_access')
    .select('id, property_id, status, email, role')
    .eq('token', params.token)
    .maybeSingle()
  const inv = invRow as { id: string; property_id: string; status: string; email: string; role: string } | null

  if (!inv || inv.status === 'removed') {
    return <Shell title="Invitation not found" body="This invite link is invalid or was revoked. Ask whoever invited you to send a new one." />
  }

  const { data: prop } = await admin.from('properties').select('name, client_id').eq('id', inv.property_id).maybeSingle()
  const propertyName = (prop?.name as string) ?? 'a property'
  const { data: client } = prop
    ? await admin.from('clients').select('name').eq('id', prop.client_id as string).maybeSingle()
    : { data: null }
  const ownerName = (client?.name as string) ?? ''
  const roleWord = inv.role === 'viewer' ? 'view' : 'help manage'

  if (inv.status === 'active') {
    return (
      <Shell
        title="Already accepted"
        body={`You already have access to ${propertyName}.`}
        cta={{ href: `/admin/properties/${inv.property_id}`, label: 'Open property' }}
      />
    )
  }

  const viewer = await getViewer()
  if (!viewer) {
    return (
      <Shell
        title={`Manage ${propertyName}`}
        body={`You've been invited${ownerName ? ` by ${ownerName}` : ''} to ${roleWord} ${propertyName}. Sign in with ${inv.email} to accept.`}
        cta={{ href: `/login?next=/collab/${params.token}`, label: 'Sign in to accept' }}
      />
    )
  }

  return (
    <Shell
      title={`Manage ${propertyName}`}
      body={`You've been invited${ownerName ? ` by ${ownerName}` : ''} to ${roleWord} ${propertyName}. Accepting adds it to your dashboard.`}
    >
      <form action={acceptCollaboration.bind(null, params.token)} className="mt-5">
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
          Accept &amp; open property
        </button>
      </form>
    </Shell>
  )
}
