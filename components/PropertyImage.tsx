'use client'

import { useState } from 'react'
import { streetViewUrl, staticMapUrl } from '@/lib/property'

// A property photo from Google: Street View where it exists, falling back to a
// satellite map on load error. Uses coordinates when available, otherwise the
// address string. Renders nothing when there's no location or no Maps key (the
// caller shows a placeholder instead).
export default function PropertyImage({
  lat,
  lng,
  address,
  name,
  className,
  size,
}: {
  lat: number | null
  lng: number | null
  address?: string | null
  name: string
  className?: string
  size?: string
}) {
  const sv = streetViewUrl(lat, lng, address, size)
  const sm = staticMapUrl(lat, lng, address, size)
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
