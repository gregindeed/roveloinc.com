'use client'

import { useEffect } from 'react'
import { ping } from '@/app/presence/actions'

// Mounted once in the app header. Pings on mount, once a minute after that, and
// whenever the tab becomes visible again — and stays quiet while the tab is
// hidden, so a backgrounded tab isn't writing at all.
export default function PresenceHeartbeat({ clientId = null }: { clientId?: string | null }) {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') void ping(clientId)
    }
    beat()
    const timer = setInterval(beat, 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [clientId])

  return null
}
