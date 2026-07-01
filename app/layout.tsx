import type { Metadata } from 'next'
import { Instrument_Sans, Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EazyExchange — Every student, cleared for departure',
  description:
    'Turn pre-trip exchange paperwork into a live boarding manifest. Personal checklists and automatic reminders for students; one dashboard for organizers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
