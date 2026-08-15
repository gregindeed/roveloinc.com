import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Archivo, Fraunces } from 'next/font/google'
import './globals.css'
import { I18nProvider } from '@/components/I18nProvider'
import { getViewer } from '@/lib/auth'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n'

// Clean grotesque for body / UI
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
})

// Editorial serif for the Rovelo wordmark
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-fraunces',
})

const SITE_URL = 'https://roveloinc.com'
const TITLE = 'Rovelo Inc — Business Advisory & Solutions'
const DESCRIPTION =
  'Bookkeeping, financial reporting, tax preparation, and payroll for small businesses. Based in San Diego, California.'

// Site-wide metadata defaults. `metadataBase` lets Next resolve the relative
// OpenGraph/canonical URLs below to absolute ones. Child routes (e.g. the
// authenticated portal) override individual fields — the portal sets
// robots.index=false so it never gets indexed.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · Rovelo Inc',
  },
  description: DESCRIPTION,
  applicationName: 'Rovelo Inc',
  keywords: [
    'bookkeeping',
    'financial reporting',
    'tax preparation',
    'payroll',
    'business advisory',
    'small business accounting',
    'San Diego bookkeeping',
  ],
  authors: [{ name: 'Rovelo Inc' }],
  icons: { icon: '/rovelo_icon.png', apple: '/rovelo_icon.png' },
  robots: { index: true, follow: true },
  // Search Console ownership is verified via Cloudflare DNS on the domain
  // property (sc-domain:roveloinc.com), so no HTML-tag verification is needed here.
  openGraph: {
    type: 'website',
    siteName: 'Rovelo Inc',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: '/rovelo_icon.png', width: 1024, height: 1024, alt: 'Rovelo Inc' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/rovelo_icon.png'],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Cookie is authoritative (set on login / switch); fall back to the profile for
  // a fresh device before a cookie exists, then to English.
  const cookieLocale = cookies().get('locale')?.value
  let locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  if (!isLocale(cookieLocale)) {
    const viewer = await getViewer()
    if (viewer) locale = viewer.locale
  }

  return (
    <html lang={locale}>
      <body className={`${archivo.variable} ${fraunces.variable} font-sans bg-white text-gray-900 antialiased`}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  )
}
