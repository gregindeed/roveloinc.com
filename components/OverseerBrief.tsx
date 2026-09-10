'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { generateAssessment, updateOverseerContext } from '@/app/admin/clients/[slug]/assess-actions'
import { useT } from '@/components/I18nProvider'

// A calm, compact Overseer card for the entity Overview: a one-glance business
// brief with a quiet refresh, and a "Full read" that opens a slide-over holding
// the detailed reading and the Overseer-context editor. The heavier readiness
// gauges have moved out; this stays intentionally small.
export default function OverseerBrief({
  slug,
  brief,
  read,
  context,
  createdAt,
}: {
  slug: string
  brief: string | null
  read: string | null
  context?: string | null
  createdAt?: string | null
}) {
  const t = useT()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // Two-stage open/close so the drawer can animate on the way OUT too:
  //  render = is it in the DOM;  shown = is it in its visible (slid-in) position.
  const [render, setRender] = useState(false)
  const [shown, setShown] = useState(false)

  const [ctx, setCtx] = useState(context ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => setMounted(true), [])

  const openDrawer = () => setRender(true)
  const closeDrawer = useCallback(() => {
    setShown(false)
    window.setTimeout(() => setRender(false), 300) // matches the transition duration
  }, [])

  // Once mounted, flip to the shown state on the next frame so the transition runs.
  useEffect(() => {
    if (!render) return
    let f2 = 0
    const f1 = requestAnimationFrame(() => {
      f2 = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(f1)
      cancelAnimationFrame(f2)
    }
  }, [render])

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!render) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [render, closeDrawer])

  async function saveContext() {
    setSaving(true)
    try {
      await updateOverseerContext(slug, draft)
      setCtx(draft.trim())
      setEditing(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const has = !!(brief || read)
  // Prefer the dedicated brief; fall back to a clamped read for assessments
  // generated before briefs existed.
  const summary = brief || read

  return (
    <>
      <div className="rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Glyph />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t('admin.overseer')}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            {has && (
              <button onClick={openDrawer} className="font-medium text-gray-700 hover:text-gray-900">
                {t('admin.fullRead')} →
              </button>
            )}
            <form action={generateAssessment.bind(null, slug, 'overview')}>
              <button className="text-gray-400 hover:text-gray-700">{read ? t('admin.refresh') : t('admin.generate')}</button>
            </form>
          </div>
        </div>

        {summary ? (
          <p className={`mt-2 text-sm text-gray-800 leading-relaxed ${brief ? '' : 'line-clamp-3'}`}>{summary}</p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">{t('admin.overseerEmpty')}</p>
        )}
      </div>

      {mounted &&
        render &&
        createPortal(
          <div className="fixed inset-0 z-[100]">
            <div
              className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ease-out ${shown ? 'opacity-100' : 'opacity-0'}`}
              onClick={closeDrawer}
            />
            <div
              className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto transition-transform duration-300 ease-out will-change-transform ${
                shown ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
                <div className="flex items-center gap-1.5">
                  <Glyph />
                  <span className="text-sm font-semibold text-gray-900">{t('admin.overseerRead')}</span>
                  {createdAt && (
                    <span className="text-[10px] text-gray-300" suppressHydrationWarning>
                      · {new Date(createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <button
                  onClick={closeDrawer}
                  aria-label="Close"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-4 space-y-5">
                <div>
                  {read ? (
                    <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{read}</p>
                  ) : (
                    <p className="text-sm text-gray-500">{t('admin.noReadYet')}</p>
                  )}
                  <form action={generateAssessment.bind(null, slug, 'overview')} className="mt-3">
                    <button className="text-xs font-medium text-gray-700 hover:text-gray-900">
                      {read ? t('admin.refreshRead') : t('admin.generateRead')}
                    </button>
                  </form>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t('admin.contextForOverseer')}</span>
                    {!editing && (
                      <button
                        onClick={() => {
                          setDraft(ctx)
                          setEditing(true)
                        }}
                        className="text-[11px] font-medium text-gray-500 hover:text-gray-900"
                      >
                        {ctx ? t('admin.edit') : t('admin.add')}
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
                        placeholder={t('admin.contextPlaceholder')}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={saveContext}
                          disabled={saving}
                          className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
                        >
                          {saving ? t('admin.saving') : t('admin.save')}
                        </button>
                        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-700">
                          {t('admin.cancel')}
                        </button>
                        <span className="text-[11px] text-gray-400">{t('admin.usedOnEveryRead')}</span>
                      </div>
                    </div>
                  ) : ctx ? (
                    <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-line leading-relaxed">{ctx}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-400">{t('admin.noBriefing')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

// The Overseer's "eyes" — a pair, because one all-seeing eye was lonely.
function Glyph() {
  return (
    <span className="inline-flex items-center gap-[3px] text-gray-400">
      <Eye />
      <Eye />
    </span>
  )
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
