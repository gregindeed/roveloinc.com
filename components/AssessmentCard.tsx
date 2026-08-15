'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateAssessment, updateOverseerContext } from '@/app/admin/clients/[slug]/assess-actions'

type Assessment = { content: string; model: string | null; created_at: string } | null

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

const PLACEHOLDER =
  "Tell the Overseer how this business actually operates — what it does, its structure, and how it files — so it can interpret the data correctly. e.g. \"Sole proprietor renting a lot to commercial truckers. Files on Schedule C under his own name. No LLC/corp and no formation docs by design.\""

export default function AssessmentCard({
  slug,
  scope,
  assessment,
  context,
}: {
  slug: string
  scope: string
  assessment: Assessment
  context?: string | null
}) {
  const router = useRouter()
  const storageKey = `overseer-collapsed:${slug}:${scope}`
  const [open, setOpen] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Briefing editor state
  const [ctx, setCtx] = useState<string>(context ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedHint, setSavedHint] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      if (localStorage.getItem(storageKey) === '1') setOpen(false)
    } catch {}
  }, [storageKey])

  function toggle() {
    setOpen((v) => {
      const next = !v
      try {
        localStorage.setItem(storageKey, next ? '0' : '1')
      } catch {}
      return next
    })
  }

  function startEdit() {
    setDraft(ctx)
    setEditing(true)
    setSavedHint(false)
  }

  async function saveContext() {
    setSaving(true)
    try {
      await updateOverseerContext(slug, draft)
      setCtx(draft.trim())
      setEditing(false)
      setSavedHint(true)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-violet-700 hover:text-violet-900"
        >
          <Chevron open={open} />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Overseer · AI read</span>
        </button>
        <form action={generateAssessment.bind(null, slug, scope)}>
          <button className="text-xs font-medium text-violet-700 hover:text-violet-900">
            {assessment ? 'Refresh' : 'Generate'}
          </button>
        </form>
      </div>

      {open && (
        <div className="mt-1.5">
          {assessment ? (
            <>
              <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{assessment.content}</p>
              <p className="text-[10px] text-gray-400 mt-2" suppressHydrationWarning>
                {assessment.model ?? 'ai'} · {mounted ? new Date(assessment.created_at).toLocaleString() : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              No read yet — click <span className="font-medium">Generate</span> for the Overseer&apos;s take.
            </p>
          )}

          {/* Briefing you feed to the Overseer */}
          <div className="mt-3 pt-3 border-t border-violet-200/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                Context for the Overseer
              </span>
              {!editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-xs font-medium text-violet-700 hover:text-violet-900"
                >
                  {ctx ? 'Edit' : '+ Add context'}
                </button>
              )}
            </div>

            {editing ? (
              <div className="mt-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder={PLACEHOLDER}
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveContext}
                    disabled={saving}
                    className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save context'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <span className="text-[11px] text-gray-500">Used on every read — hit Refresh to re-read with it.</span>
                </div>
              </div>
            ) : ctx ? (
              <>
                <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-line leading-relaxed">{ctx}</p>
                {savedHint && (
                  <p className="mt-1.5 text-[11px] text-violet-700">
                    Saved. Hit <span className="font-medium">Refresh</span> above to re-read with this context.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                No briefing yet — add context so the Overseer understands how this entity actually operates and stops
                flagging expected gaps.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
