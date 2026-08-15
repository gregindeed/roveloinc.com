'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CHART_TEMPLATES, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from '@/lib/coa'
import type { AccountType } from '@/lib/coa'
import { seedChartOfAccounts, renameAccount, setAccountActive, addAccount } from '@/app/admin/clients/[slug]/ledger-actions'
import type { Account } from '@/lib/types'

export default function ChartOfAccounts({
  slug,
  accounts,
  suggestedTemplate,
}: {
  slug: string
  accounts: Account[]
  suggestedTemplate: string
}) {
  const router = useRouter()
  const [tpl, setTpl] = useState(suggestedTemplate)
  const [seeding, setSeeding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  async function seed() {
    setSeeding(true)
    try {
      await seedChartOfAccounts(slug, tpl)
      router.refresh()
    } finally {
      setSeeding(false)
    }
  }

  async function saveName(id: string) {
    const name = draft.trim()
    setEditId(null)
    if (name) {
      await renameAccount(slug, id, name)
      router.refresh()
    }
  }

  async function toggle(id: string, active: boolean) {
    await setAccountActive(slug, id, active)
    router.refresh()
  }

  // ── Empty state: seed from a template ──────────────────────────────────────
  if (accounts.length === 0) {
    const preview = CHART_TEMPLATES[tpl] ?? CHART_TEMPLATES.general
    return (
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Chart of accounts</h2>
        <p className="text-xs text-gray-500 mb-4">
          This entity has no chart yet. Seed one from a template — every transaction will sort into these accounts, and
          the P&amp;L is built from them. You can rename, add, or hide accounts anytime after.
        </p>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <label className="text-xs text-gray-600">
            Template
            <select
              value={tpl}
              onChange={(e) => setTpl(e.target.value)}
              className="block mt-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              {Object.values(CHART_TEMPLATES).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={seed}
            disabled={seeding}
            className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
          >
            {seeding ? 'Seeding…' : 'Seed chart'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-2">{preview.description}</p>
        <AccountPreview accounts={preview.accounts} />
      </div>
    )
  }

  // ── Seeded: grouped, editable list ─────────────────────────────────────────
  const byType = (t: AccountType) => accounts.filter((a) => a.type === t).sort((a, b) => a.code.localeCompare(b.code))

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Chart of accounts</h2>
          <p className="text-xs text-gray-500">{accounts.filter((a) => a.active).length} active accounts</p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
        >
          {adding ? 'Close' : '+ Add account'}
        </button>
      </div>

      {adding && (
        <form
          action={addAccount.bind(null, slug)}
          className="flex flex-wrap items-end gap-2 mb-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3"
        >
          <input name="code" required placeholder="Code" className="w-20 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <input name="name" required placeholder="Account name" className="w-52 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <select name="type" required className="border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            {ACCOUNT_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">Add</button>
        </form>
      )}

      <div className="space-y-5">
        {ACCOUNT_TYPE_ORDER.map((t) => {
          const rows = byType(t)
          if (rows.length === 0) return null
          return (
            <div key={t}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                {ACCOUNT_TYPE_LABELS[t]}
              </div>
              <div className="divide-y divide-gray-100">
                {rows.map((a) => (
                  <div key={a.id} className={`flex items-center gap-3 py-1.5 ${a.active ? '' : 'opacity-45'}`}>
                    <span className="text-xs text-gray-400 w-10 shrink-0 tabular-nums">{a.code}</span>
                    {editId === a.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          autoFocus
                          className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        <button onClick={() => saveName(a.id)} className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors">
                          Save
                        </button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-700">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-gray-900">{a.name}</span>
                        {a.tax_line && <span className="text-[11px] text-gray-400 hidden sm:inline">{a.tax_line}</span>}
                        <button
                          onClick={() => {
                            setEditId(a.id)
                            setDraft(a.name)
                          }}
                          className="text-xs text-gray-400 hover:text-gray-900"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => toggle(a.id, !a.active)}
                          className="text-xs text-gray-400 hover:text-gray-900 w-12 text-right"
                        >
                          {a.active ? 'Hide' : 'Unhide'}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AccountPreview({ accounts }: { accounts: { code: string; name: string; type: AccountType }[] }) {
  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
      {ACCOUNT_TYPE_ORDER.map((t) => {
        const rows = accounts.filter((a) => a.type === t)
        if (rows.length === 0) return null
        return (
          <div key={t} className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              {ACCOUNT_TYPE_LABELS[t]}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {rows.map((a) => (
                <span key={a.code} className="text-xs text-gray-700">
                  <span className="text-gray-400 tabular-nums mr-1">{a.code}</span>
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
