'use client'

import Script from 'next/script'

// Google Analytics (GA4).
//
// Deliberately rendered ONLY on the public marketing homepage (app/page.tsx) —
// NEVER in the root layout. The /admin and /portal areas carry client financial
// data and authenticated URLs, and those pages must not ship any page data to a
// third-party analytics tag. All we want here is a signal of who's landing on
// the front door, so the tag lives on the front door and nowhere else.
const GA_ID = 'G-MR444RW9RP'

export default function Analytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  )
}
