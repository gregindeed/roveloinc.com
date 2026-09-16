'use client'

import { useEffect, useState } from 'react'
import PhotoUploadModal from '@/components/PhotoUploadModal'

export type GalleryPhoto = { id: string; url: string; name: string }
type TabKey = 'overview' | 'gallery' | 'documents' | 'applications' | 'payments' | 'finances' | 'settings'

// Tabbed property view: Overview (photo mosaic + stats + units), Gallery (all
// photos), Documents, Applications, Settings. Overview / Documents / Applications
// / Settings are server-rendered and passed in as slots so their forms keep
// working; the mosaic + gallery grid + lightbox are rendered here from the photos.
export default function PropertyTabs({
  propertyId,
  breadcrumb,
  header,
  notice,
  photos,
  fallback,
  overview,
  documents,
  applications,
  payments,
  finances,
  settings,
  uploadPhoto,
  documentsCount,
  applicationsCount,
  canManagePhotos,
  arrangePhoto,
  deletePhoto,
}: {
  propertyId: string
  breadcrumb?: React.ReactNode
  header?: React.ReactNode
  notice?: React.ReactNode
  photos: GalleryPhoto[]
  fallback?: React.ReactNode
  overview: React.ReactNode
  documents: React.ReactNode
  applications: React.ReactNode
  payments?: React.ReactNode
  finances?: React.ReactNode
  settings?: React.ReactNode
  uploadPhoto?: (formData: FormData) => void | Promise<void>
  documentsCount: number
  applicationsCount: number
  canManagePhotos?: boolean
  arrangePhoto?: (propertyId: string, docId: string, op: 'cover' | 'left' | 'right') => Promise<void>
  deletePhoto?: (propertyId: string, docId: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [returnTab, setReturnTab] = useState<TabKey>('overview')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [appsOpen, setAppsOpen] = useState(false)

  // Remember the active tab across server-action reloads (record payment, etc.).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`propTab:${propertyId}`) as TabKey | null
      if (saved) setTab(saved)
    } catch {
      /* ignore */
    }
  }, [propertyId])

  const go = (t: TabKey) => {
    // Entering the standalone photo view: remember where to return.
    if (t === 'gallery' && tab !== 'gallery') setReturnTab(tab)
    setTab(t)
    try {
      localStorage.setItem(`propTab:${propertyId}`, t)
    } catch {
      /* ignore */
    }
  }

  // Lightbox: keyboard nav + scroll lock while open.
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length))
      else if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % photos.length))
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [lightbox, photos.length])

  // Applications modal: ESC to close + scroll lock while open.
  useEffect(() => {
    if (!appsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAppsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [appsOpen])

  const hasPhotos = photos.length > 0
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'documents', label: 'Documents', count: documentsCount },
    ...(payments ? [{ key: 'payments' as TabKey, label: 'Payments' }] : []),
    ...(finances ? [{ key: 'finances' as TabKey, label: 'P&L' }] : []),
  ]
  let active: TabKey = tab === 'gallery' && !hasPhotos ? 'overview' : tab
  if (active === 'settings' && !settings) active = 'overview'
  if (active === 'payments' && !payments) active = 'overview'
  if (active === 'finances' && !finances) active = 'overview'
  // Applications is now an action (modal), not a tab — never a resting view.
  if (active === 'applications') active = 'overview'

  // The photo view is a standalone surface reached from the mosaic's "View all"
  // pill — no banner, no property header, no tab bar; just a back link and the
  // photos, like Airbnb's full-photo page.
  if (active === 'gallery') {
    return (
      <>
        <button
          type="button"
          onClick={() => go(returnTab)}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Close
        </button>
        <div className="mt-4">
          <GalleryGrid
            photos={photos}
            onOpen={setLightbox}
            propertyId={propertyId}
            canManage={!!canManagePhotos}
            arrangePhoto={arrangePhoto}
            deletePhoto={deletePhoto}
            uploadPhoto={uploadPhoto}
          />
        </div>

        {lightbox !== null && photos[lightbox] && (
          <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
        )}
      </>
    )
  }

  return (
    <>
      {breadcrumb}
      {notice}
      {active !== 'settings' && header}
      <div className="mt-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex items-center gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => go(t.key)}
              className={`whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                active === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.label}
              {t.count != null && <span className="ml-1.5 text-xs text-gray-400">{t.count}</span>}
            </button>
          ))}

          {applications && (
            <button
              type="button"
              onClick={() => setAppsOpen(true)}
              className="ml-auto flex shrink-0 items-center gap-1.5 pb-2.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              <PeopleIcon />
              Applications
              {applicationsCount > 0 && (
                <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{applicationsCount}</span>
              )}
            </button>
          )}

          {settings && (
            <button
              type="button"
              onClick={() => go('settings')}
              aria-label="Settings"
              title="Settings"
              className={`${applications ? 'ml-1' : 'ml-auto'} shrink-0 border-b-2 pb-2 transition-colors ${
                active === 'settings' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
              }`}
            >
              <CogIcon />
            </button>
          )}
        </nav>
      </div>

      <div className="pt-5">
        {active === 'overview' && (
          <>
            <div className="mb-6">
              {hasPhotos ? (
                <Mosaic photos={photos} onOpen={setLightbox} onViewAll={photos.length > 3 ? () => go('gallery') : undefined} />
              ) : (
                fallback
              )}
            </div>
            {overview}
          </>
        )}
        {active === 'documents' && documents}
        {active === 'payments' && payments}
        {active === 'finances' && finances}
        {active === 'settings' && settings}
      </div>

      {lightbox !== null && photos[lightbox] && (
        <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
      )}
      </div>

      {appsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10" onClick={() => setAppsOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Applications</h3>
              <button type="button" onClick={() => setAppsOpen(false)} aria-label="Close" className="text-gray-400 transition-colors hover:text-gray-900">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-1">{applications}</div>
          </div>
        </div>
      )}
    </>
  )
}

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function CogIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// Compact hero mosaic — up to 3 photos. Clicking a tile opens the lightbox at it.
// When there are more photos than the mosaic shows, an Airbnb-style "View all"
// pill sits in the bottom-right corner and jumps to the full Gallery.
function Mosaic({ photos, onOpen, onViewAll }: { photos: GalleryPhoto[]; onOpen: (i: number) => void; onViewAll?: () => void }) {
  const shown = photos.slice(0, 3)
  const n = shown.length
  const tile = 'group relative block h-full w-full overflow-hidden bg-gray-100 focus:outline-none'
  const img = 'h-full w-full object-cover transition duration-200 group-hover:brightness-95'

  let gridStyle: React.CSSProperties
  let heroStyle: React.CSSProperties
  if (n === 1) {
    gridStyle = { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
    heroStyle = { gridColumn: '1 / -1', gridRow: '1 / -1' }
  } else if (n === 2) {
    gridStyle = { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' }
    heroStyle = { gridColumn: '1', gridRow: '1' }
  } else {
    gridStyle = { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
    heroStyle = { gridColumn: '1 / 3', gridRow: '1 / 3' }
  }
  const thumbs = shown.slice(1)

  return (
    <div className="relative grid h-64 gap-[3px] overflow-hidden rounded-2xl border border-gray-100 sm:h-[340px]" style={gridStyle}>
      <button type="button" onClick={() => onOpen(0)} className={tile} style={heroStyle} aria-label={`Open ${shown[0].name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown[0].url} alt={shown[0].name} className={img} />
      </button>
      {thumbs.map((p, i) => (
        <button key={p.id} type="button" onClick={() => onOpen(i + 1)} className={tile} aria-label={`Open ${p.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.name} loading="lazy" className={img} />
        </button>
      ))}
      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-gray-300 bg-white/95 px-2 py-1 text-[11px] font-medium text-gray-900 shadow-sm backdrop-blur transition hover:bg-white"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          View all {photos.length} photos
        </button>
      )}
    </div>
  )
}

// Full gallery grid — a subtle "+ Upload photos" link, an Edit toggle that
// reveals the arrange controls (Set as cover / move), and a lightbox on click.
function GalleryGrid({
  photos,
  onOpen,
  propertyId,
  canManage,
  arrangePhoto,
  deletePhoto,
  uploadPhoto,
}: {
  photos: GalleryPhoto[]
  onOpen: (i: number) => void
  propertyId: string
  canManage: boolean
  arrangePhoto?: (propertyId: string, docId: string, op: 'cover' | 'left' | 'right') => Promise<void>
  deletePhoto?: (propertyId: string, docId: string) => void | Promise<void>
  uploadPhoto?: (formData: FormData) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const canArrange = canManage && !!arrangePhoto && photos.length > 1
  const canEdit = canManage && (canArrange || !!deletePhoto) && photos.length > 0
  const toolBtn = 'rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-gray-800 shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40'

  return (
    <div>
      {(uploadPhoto || canEdit) && (
        <div className="mb-3 flex items-center justify-between">
          {canManage && uploadPhoto ? <PhotoUploadModal action={uploadPhoto} /> : <span />}
          {canEdit && (
            <button type="button" onClick={() => setEditing((e) => !e)} className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900">
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
              <button type="button" onClick={() => onOpen(i)} className="block w-full focus:outline-none" aria-label={`Open ${p.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} loading="lazy" className="h-44 w-full object-cover transition duration-200 group-hover:brightness-95" />
              </button>

              {i === 0 && (
                <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-gray-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Cover
                </span>
              )}

              {editing && deletePhoto && (
                <form action={deletePhoto.bind(null, propertyId, p.id)} className="absolute right-2 top-2">
                  <button
                    type="submit"
                    aria-label={`Delete ${p.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-gray-600 shadow-sm transition hover:bg-red-600 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </form>
              )}

              {canArrange && editing && (
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                  <form action={arrangePhoto!.bind(null, propertyId, p.id, 'cover')}>
                    <button type="submit" disabled={i === 0} className={toolBtn}>Set as cover</button>
                  </form>
                  <div className="flex gap-1">
                    <form action={arrangePhoto!.bind(null, propertyId, p.id, 'left')}>
                      <button type="submit" disabled={i === 0} aria-label="Move earlier" className={toolBtn}>◀</button>
                    </form>
                    <form action={arrangePhoto!.bind(null, propertyId, p.id, 'right')}>
                      <button type="submit" disabled={i === photos.length - 1} aria-label="Move later" className={toolBtn}>▶</button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Full-screen lightbox with prev/next, keyboard nav, and click-out to close.
function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: GalleryPhoto[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const many = photos.length > 1
  const prev = () => onIndex((index - 1 + photos.length) % photos.length)
  const next = () => onIndex((index + 1) % photos.length)
  const photo = photos[index]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm tabular-nums text-white/70">
          {index + 1} / {photos.length}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-sm text-white/90 hover:bg-white/10">
          ✕ Close
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
        {many && (
          <button
            type="button"
            onClick={prev}
            aria-label="Previous photo"
            className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white hover:bg-white/20"
          >
            ‹
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.name} className="max-h-full max-w-full rounded-lg object-contain" />
        {many && (
          <button
            type="button"
            onClick={next}
            aria-label="Next photo"
            className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-white hover:bg-white/20"
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}
