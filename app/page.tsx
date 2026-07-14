import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

const title = "Eazyexchange — Gérez les dossiers d'échanges scolaires"
const description =
  'Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: baseUrl,
    siteName: 'EazyExchange',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

// No auth calls here — the logged-in redirect happens in middleware.ts. Keeping
// this component synchronous and dependency-free is what lets Next prerender the
// landing page so anonymous visitors never pay a function cold start.
export default function RootPage() {
  return <LandingPage />
}
