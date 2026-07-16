import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import { organizationJsonLd } from '@/lib/seo/structured-data'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

const title = "Eazyexchange — Gérez les dossiers d'échanges scolaires"
const description =
  'Eazyexchange — candidatures, formulaires et relances automatiques pour les organisateurs d’échanges scolaires. Premier échange gratuit.'

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
// landing page so anonymous visitors never pay a function cold start. The
// JSON-LD below is static markup, not a data fetch.
export default function RootPage() {
  const jsonLd = organizationJsonLd(baseUrl)
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  )
}
