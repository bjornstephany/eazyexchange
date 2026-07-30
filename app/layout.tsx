import type { Metadata } from 'next'
import { IBM_Plex_Sans, Schibsted_Grotesk, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const display = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'),
  title: 'EazyExchange',
  description:
    'Turn pre-trip exchange paperwork into a live boarding manifest. Personal checklists and automatic reminders for students; one dashboard for organizers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-scroll-behavior="smooth"` is required from Next 16: the router no
    // longer overrides `scroll-behavior` during navigation unless asked. Without
    // it, globals.css's `html { scroll-behavior: smooth }` (under
    // prefers-reduced-motion: no-preference, for in-page anchors) would make
    // every route change animate its scroll to top instead of jumping.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="font-sans">{children}</body>
    </html>
  )
}
