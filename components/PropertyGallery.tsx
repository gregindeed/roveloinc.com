'use client'

import { useCallback, useEffect, useState } from 'react'

export type GalleryPhoto = { id: string; url: string; name: string }

/**
 * Airbnb-style property gallery: one large hero + a grid of thumbnails, with a
 * click-to-open lightbox (keyboard arrows / Esc) and a "Show all photos" grid.
 * Layouts stay gap-free for 1–5+ photos.
 */
export default function PropertyGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState(false)
  const [grid, setGrid] = useState(false)
  const [idx, setIdx] = useState(0)

  const count = photos.length
  const prev = useCallback(() => setIdx((i) => (i - 1 + count) % count), [count])
  const next = useCallback(() => setIdx((i) => (i + 1) % count), [count])

  const openAt = (i: number) => {
    setIdx(i)
    setGrid(false)
    setOpen(true)
  }
  const openGrid = () => {
    setGrid(true)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      else if (!grid && e.key === 'ArrowLeft') prev()
      else if (!grid && e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, grid, prev, next])

  // lock scroll while the lightbox is open
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (count === 0) return null

  const tileBtn =
    'group relative block h-full w-full overflow-hidden bg-gray-100 focus:outline-none'
  const imgCls =
    'h-full w-full object-cover transition duration-200 group-hover:brightness-95'

  // Mosaic geometry, gap-free for each count.
  let gridStyle: React.CSSProperties
  let heroSpan: React.CSSProperties
  let thumbCount: number
  if (count === 1) {
    gridStyle = { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
    heroSpan = { gridColumn: '1 / -1', gridRow: '1 / -1' }
    thumbCount = 0
  } else if (count === 2) {
    gridStyle = { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' }
    heroSpan = { gridColumn: '1', gridRow: '1' }
    thumbCount = 1
  } else if (count === 3) {
    gridStyle = { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
    heroSpan = { gridColumn: '1 / 3', gridRow: '1 / 3' }
    thumbCount = 2
  } else if (count === 4) {
    gridStyle = { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
    heroSpan = { gridColumn: '1', gridRow: '1' }
    thumbCount = 3
  } else {
    gridStyle = { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
    heroSpan = { gridColumn: '1 / 3', gridRow: '1 / 3' }
    thumbCount = 4
  }
  const thumbs = photos.slice(1, 1 + thumbCount)

  return (
    <>
      <div className="relative mt-4">
        <div
          className="grid h-64 gap-[3px] overflow-hidden rounded-2xl border border-gray-100 sm:h-[380px]"
          style={gridStyle}
        >
          <button type="button" onClick={() => openAt(0)} className={tileBtn} style={heroSpan} aria-label={`Open ${photos[0].name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[0].url} alt={photos[0].name} className={imgCls} />
          </button>
          {thumbs.map((p, i) => (
            <button key={p.id} type="button" onClick={() => openAt(i + 1)} className={tileBtn} aria-label={`Open ${p.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} loading="lazy" className={imgCls} />
            </button>
          ))}
        </div>

        {count > 1 && (
          <button
            type="button"
            onClick={openGrid}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-800/20 bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-900 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span aria-hidden className="grid grid-cols-2 gap-0.5">
              <span className="h-1.5 w-1.5 rounded-[1px] bg-gray-900" />
              <span className="h-1.5 w-1.5 rounded-[1px] bg-gray-900" />
              <span className="h-1.5 w-1.5 rounded-[1px] bg-gray-900" />
              <span className="h-1.5 w-1.5 rounded-[1px] bg-gray-900" />
            </span>
            Show all {count} photos
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/92" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-sm text-white/90 hover:bg-white/10">
              ✕ Close
            </button>
            {!grid && <span className="text-sm tabular-nums text-white/80">{idx + 1} / {count}</span>}
            <button type="button" onClick={() => setGrid((g) => !g)} className="rounded-md px-2 py-1 text-sm text-white/90 hover:bg-white/10">
              {grid ? 'Single view' : 'All photos'}
            </button>
          </div>

          {grid ? (
            <div className="flex-1 overflow-y-auto px-4 pb-8">
              <div className="mx-auto grid max-w-4xl grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => { setIdx(i); setGrid(false) }} className="block overflow-hidden rounded-lg bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.name} loading="lazy" className="h-40 w-full object-cover transition hover:brightness-110" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
              {count > 1 && (
                <button type="button" onClick={prev} aria-label="Previous" className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20">
                  ‹
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[idx].url} alt={photos[idx].name} className="max-h-full max-w-full rounded-lg object-contain" />
              {count > 1 && (
                <button type="button" onClick={next} aria-label="Next" className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20">
                  ›
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
