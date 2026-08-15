'use client'

import { usePathname } from 'next/navigation'

// Hides the entity tab-chrome when viewing an entity's settings page,
// so Settings reads as its own full-page view.
export default function HideOnSettings({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  if (path?.endsWith('/account')) return null
  return <>{children}</>
}
