'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Account } from '@/lib/types'
import { postBankActivity } from '@/app/admin/clients/[slug]/ledger/actions'

type PostWindow = { key: string; label: string; since: string | null; ready: number }

export default function PostBankActivity({
  slug,
  accounts,
  bankAccountId,
  cardAccountId,
  suggestedBank,
  suggestedCard,
  windows,
  uncategorized,
}: {
  slug: string
  accounts: Account[]
  bankAccountId: string | null
  cardAccountId: string | null
  suggestedBank: string | null
  suggestedCard: string | null
  windows: PostWindow[]
  uncategorized: number
}) {
  const router = useRouter()
  const [bankId, setBankId] = useState(bankAccountId ?? suggestedBank ?? '')
  const [cardId, setCardId] = useState(cardAccountId ?? suggestedCard ?? '')
  const [windowKey, setWindowKey] = useState(() => (windows.find((w) => w.ready > 0) ?? windows[0])?.key ?? 'all')
  const [result, setResult] = useState<{ posted: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const assets = accounts.filter((a) => a.active && a.type === 'asset')
  const liabilities = accounts.filter((a) => a.active && a.type === 'liability')

  const selected = windows.find((w) => w.key === windowKey) ?? windows[windows.length - 1]
  const ready = selected?.ready ?? 0
  const totalReady = windows.find((w) => w.since === null)?.ready ?? Math.max(...windows.map((w) => w.ready), 0)

  function post() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await postBankActivity(slug, bankId, cardId || null, selected?.since ?? null)
      if (!res.ok) {
        setError(res.error ?? 'Could not post.')
        return
      }
      setResult({ posted: res.posted, skipped: res.skipped })
      router.refresh()
    })
  }

  const Opt = ({ list }: { list: Account[] }) =>
    list
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name}
        </option>
      ))

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Post bank activity</h2>
        {totalReady > 0 && (
          <span className="text-[11px] font-medium text-white bg-gray-900 rounded-full px-1.5 py-0.5 tabular-nums">{totalReady}</span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Turn categorized deposits, checking, and card activity into balanced ledger entries — the bank on one side, the
        account you categorized to on the other. Post a window at a time; it runs only on categorized rows, skips anything
        already posted, and is safe to run again.
      </p>

      {assets.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No asset accounts in the chart yet — add a bank account (e.g. “Operating Bank”) in Entity settings → Chart of
          accounts first.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">
              Bank account
              <select
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className="block mt-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white min-w-[200px]"
              >
                <option value="">Select…</option>
                <Opt list={assets} />
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Credit-card payable <span className="text-gray-400">(for card charges)</span>
              <select
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                className="block mt-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white min-w-[200px]"
              >
                <option value="">None</option>
                <Opt list={liabilities} />
              </select>
            </label>
            <label className="text-xs text-gray-600">
              Window
              <select
                value={windowKey}
                onChange={(e) => setWindowKey(e.target.value)}
                className="block mt-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white min-w-[160px]"
              >
                {windows.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label} ({w.ready})
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={post}
              disabled={!bankId || ready === 0 || pending}
              className="rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800 disabled:opacity-40"
            >
              {pending ? 'Posting…' : ready > 0 ? `Post ${ready} to ledger` : 'Nothing in window'}
            </button>
          </div>

          {ready > 200 && (
            <p className="text-[11px] text-amber-700 mt-2">
              Large window — posting {ready} entries writes them one at a time and may take a minute. On the deployed site
              this can exceed the platform’s per-request limit; post a narrower window (a single year) there. Safe to
              re-run — it resumes where it left off.
            </p>
          )}

          {totalReady === 0 && !result && (
            <p className="text-xs text-gray-500 mt-3">
              All caught up — no categorized bank activity is waiting to post.
              {uncategorized > 0 && (
                <>
                  {' '}
                  <span className="text-amber-700">{uncategorized}</span> transaction{uncategorized === 1 ? '' : 's'} still
                  need a category (Transactions tab) before {uncategorized === 1 ? 'it' : 'they'} can post.
                </>
              )}
            </p>
          )}

          {result && (
            <p className="text-xs mt-3">
              <span className="text-green-700 font-medium">Posted {result.posted}</span>
              {result.skipped > 0 && <span className="text-gray-500"> · skipped {result.skipped}</span>} — see them in the
              ledger below.
            </p>
          )}
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        </>
      )}
    </div>
  )
}
