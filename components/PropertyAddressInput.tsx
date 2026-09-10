'use client'

import { useEffect, useRef, useState } from 'react'
import { mapsKey } from '@/lib/property'

// Loads the Google Maps JS (Places) once per page, shared across instances.
let mapsPromise: Promise<void> | null = null
function loadMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.maps?.places) return Promise.resolve()
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(s)
  })
  return mapsPromise
}

// Address field with Google Places autocomplete. Selecting a suggestion fills
// the visible address and captures lat/lng/place_id into hidden inputs the
// server action stores. Typing by hand clears the coordinates (they no longer
// match). Degrades to a plain text input when no Maps key is configured.
export default function PropertyAddressInput({
  labelClassName,
  inputClassName,
  defaultValue = '',
}: {
  labelClassName: string
  inputClassName: string
  defaultValue?: string
}) {
  const key = mapsKey()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [placeId, setPlaceId] = useState('')

  useEffect(() => {
    if (!key || !inputRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ac: any
    let cancelled = false
    loadMaps(key)
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google
        if (cancelled || !g?.maps?.places || !inputRef.current) return
        ac = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry', 'place_id'],
          types: ['address'],
        })
        ac.addListener('place_changed', () => {
          const p = ac.getPlace()
          if (p.formatted_address && inputRef.current) inputRef.current.value = p.formatted_address
          setPlaceId(p.place_id ?? '')
          const loc = p.geometry?.location
          if (loc) {
            setLat(String(loc.lat()))
            setLng(String(loc.lng()))
          }
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google
      if (ac && g?.maps?.event) g.maps.event.clearInstanceListeners(ac)
    }
  }, [key])

  return (
    <div>
      <label className={labelClassName} htmlFor="address">Address</label>
      <input
        ref={inputRef}
        id="address"
        name="address"
        defaultValue={defaultValue}
        onInput={() => {
          // Hand-edited after selecting → the captured coordinates no longer apply.
          if (lat || lng || placeId) {
            setLat('')
            setLng('')
            setPlaceId('')
          }
        }}
        placeholder={key ? 'Start typing an address…' : '123 Maple St, San Diego, CA 92101'}
        autoComplete="off"
        className={inputClassName}
      />
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <input type="hidden" name="place_id" value={placeId} />
      {!key && <p className="text-[11px] text-gray-400 mt-1">Set NEXT_PUBLIC_GOOGLE_MAPS_KEY to enable address lookup + auto imagery.</p>}
    </div>
  )
}
