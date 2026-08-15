'use client'

import { useEffect } from 'react'

// Adds a body class while the entity settings page is mounted so the
// print stylesheet can isolate #entity-sheet without affecting other pages.
export default function PrintSheetMode() {
  useEffect(() => {
    document.body.classList.add('printing-sheet')
    return () => document.body.classList.remove('printing-sheet')
  }, [])
  return null
}
