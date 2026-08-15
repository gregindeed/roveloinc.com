'use client'

import { useEffect, useRef, useState } from 'react'

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

// Load the Google Maps JS API once (with the Places library).
let mapsPromise: Promise<void> | null = null
function loadMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as unknown as { google?: { maps?: { places?: unknown } }; __gmapsInit?: () => void }
  if (w.google?.maps?.places) return Promise.resolve()
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise<void>((resolve, reject) => {
    w.__gmapsInit = () => resolve()
    const s = document.createElement('script')
    s.async = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=__gmapsInit`
    s.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(s)
  })
  return mapsPromise
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white'

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Business name + URL slug, where the slug auto-fills from the name until the
// user edits it by hand.
export function NameSlugFields() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  return (
    <>
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
          Business name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Acme Auto LLC"
          value={name}
          onChange={(e) => {
            const v = e.target.value
            setName(v)
            if (!slugTouched) setSlug(slugify(v))
          }}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-xs font-medium text-gray-700 mb-1">
          URL slug
        </label>
        <input
          id="slug"
          name="slug"
          placeholder="acme-auto"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value)
            setSlugTouched(true)
          }}
          className={inputCls}
        />
        <p className="text-xs text-gray-500 mt-1">
          Auto-fills from the business name — edit it if you want a different address.
        </p>
      </div>
    </>
  )
}

type Owner = { name: string; pct: string }

// One or more owners, each with an optional ownership %. Leave blank to add later.
export function OwnersField() {
  const [owners, setOwners] = useState<Owner[]>([{ name: '', pct: '' }])

  const update = (i: number, patch: Partial<Owner>) =>
    setOwners((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  const add = () => setOwners((prev) => [...prev, { name: '', pct: '' }])
  const remove = (i: number) => setOwners((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))

  const total = owners.reduce((a, o) => a + (parseFloat(o.pct) || 0), 0)

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Owners</label>
      <div className="space-y-2">
        {owners.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              name="owner_name"
              placeholder="Owner name"
              value={o.name}
              onChange={(e) => update(i, { name: e.target.value })}
              className={`${inputCls} flex-1`}
            />
            <div className="relative w-24 shrink-0">
              <input
                name="owner_pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="%"
                value={o.pct}
                onChange={(e) => update(i, { pct: e.target.value })}
                className={`${inputCls} pr-6`}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={owners.length === 1}
              className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-30 px-1"
              aria-label="Remove owner"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={add} className="text-xs font-medium text-gray-700 hover:text-gray-900">
          + Add owner
        </button>
        {total > 0 && (
          <span className={`text-xs ${Math.abs(total - 100) < 0.01 ? 'text-gray-400' : 'text-amber-600'}`}>
            {total}% assigned
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Percentages are optional — leave blank if you don&apos;t have the split yet. You can edit owners later in
        settings.
      </p>
    </div>
  )
}

// Address field backed by Google Places autocomplete when a Maps key is set;
// falls back to a plain text input otherwise.
export function AddressAutocomplete() {
  const boxRef = useRef<HTMLDivElement>(null)
  const [addr, setAddr] = useState('')
  const [widgetOk, setWidgetOk] = useState(false)

  useEffect(() => {
    if (!GMAPS_KEY) return
    let canceled = false
    loadMaps(GMAPS_KEY)
      .then(async () => {
        const g = (window as unknown as { google?: any }).google
        try {
          await g?.maps?.importLibrary?.('places')
        } catch {}
        const Ctor = g?.maps?.places?.PlaceAutocompleteElement
        if (canceled || !boxRef.current || !Ctor) return
        let el: any
        try {
          el = new Ctor({ includedRegionCodes: ['us'] })
        } catch {
          try {
            el = new Ctor()
          } catch {
            return
          }
        }
        el.style.width = '100%'
        boxRef.current.innerHTML = ''
        boxRef.current.appendChild(el)
        setWidgetOk(true)
        el.addEventListener('gmp-select', async (ev: any) => {
          try {
            const place = ev.placePrediction.toPlace()
            await place.fetchFields({ fields: ['formattedAddress'] })
            setAddr(place.formattedAddress ?? '')
          } catch {}
        })
      })
      .catch(() => {})
    return () => {
      canceled = true
    }
  }, [])

  // No key configured → plain input.
  if (!GMAPS_KEY) {
    return (
      <div>
        <label htmlFor="address" className="block text-xs font-medium text-gray-700 mb-1">
          Address
        </label>
        <input id="address" name="address" placeholder="123 Main St, San Diego, CA" className={inputCls} />
      </div>
    )
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
      <div ref={boxRef} />
      {/* Until the widget mounts (or if it fails), keep a usable plain field. */}
      {!widgetOk && (
        <input name="address" placeholder="123 Main St, San Diego, CA" className={inputCls} defaultValue={addr} />
      )}
      {widgetOk && <input type="hidden" name="address" value={addr} />}
      <p className="text-xs text-gray-500 mt-1">Start typing and pick the verified address.</p>
    </div>
  )
}
