'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createLinkTokenAction, exchangeToken, syncNow, disconnectBank } from '@/app/admin/clients/[slug]/plaid-actions'

export type BankConnection = {
  id: string
  institution_name: string | null
  last_synced_at: string | null
  status: string
}

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { Plaid?: any } }

export default function BankFeed({
  slug,
  connections,
  configured,
}: {
  slug: string
  connections: BankConnection[]
  configured: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (document.getElementById('plaid-link-script')) return
    const s = document.createElement('script')
    s.id = 'plaid-link-script'
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    document.body.appendChild(s)
  }, [])

  async function connect() {
    setError(null)
    if (!window.Plaid) {
      setError('Plaid is still loading — try again in a moment.')
      return
    }
    setBusy(true)
    const t = await createLinkTokenAction(slug)
    if (!t.ok) {
      setError(t.error)
      setBusy(false)
      return
    }
    const handler = window.Plaid.create({
      token: t.token,
      onSuccess: async (public_token: string) => {
        const r = await exchangeToken(slug, public_token)
        if (!r.ok) setError(r.error ?? 'Could not finish connecting.')
        setBusy(false)
        router.refresh()
      },
      onExit: () => setBusy(false),
    })
    handler.open()
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900">Bank feed</h2>
        <p className="text-xs text-gray-500 mt-1">
          Connect a bank to sync transactions automatically. Not configured yet — add your Plaid keys to enable it.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Bank feed</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Connect a bank and transactions flow in on their own — no more manual statement uploads.
          </p>
        </div>
        <button
          onClick={connect}
          disabled={busy}
          className="shrink-0 text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
        >
          {busy ? 'Connecting…' : 'Connect a bank'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {connections.length > 0 && (
        <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-gray-900 truncate">{c.institution_name ?? 'Connected bank'}</div>
                <div className="text-[11px] text-gray-400">Last synced {fmt(c.last_synced_at)}</div>
              </div>
              <div className="shrink-0 flex items-center gap-3 text-[11px]">
                <form action={syncNow.bind(null, slug)}>
                  <button className="font-medium text-gray-700 hover:text-gray-900">Sync now</button>
                </form>
                <form action={disconnectBank.bind(null, slug, c.id)}>
                  <button className="text-gray-400 hover:text-red-600">Disconnect</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
