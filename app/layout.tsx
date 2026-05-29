import type { Metadata } from 'next'
import { Space_Grotesk, Vollkorn } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space',
})

const vollkorn = Vollkorn({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-vollkorn',
})

export const metadata: Metadata = {
  title: 'Rovelo Inc — Financial Services',
  description: 'Bookkeeping, financial reporting, and advisory services for small businesses.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${vollkorn.variable} font-sans bg-white text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  )
}
