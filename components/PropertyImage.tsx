'use client'

import { useState } from 'react'
import { streetViewUrl, staticMapUrl } from '@/lib/property'

// A property photo from Google: Street View where it exists, falling back to a
// satellite map on load error. Renders nothing when there are no coordinates or
// no Maps key (the caller shows a placeholder instead).
export default function PropertyImage({
  lat,
  lng,
  name,
  className,
  size,
}: {
  lat: number | null
  lng: number | null
  name: string
  className?: string
  size?: string
}) {
  const sv = streetViewUrl(lat, lng, size)
  const sm = staticMapUrl(lat, lng, size)
  const [src, setSrc] = useState<string | null>(sv ?? sm)
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={className}
      onError={() => {
        if (sm && src !== sm) setSrc(sm)
      }}
    />
  )
}
