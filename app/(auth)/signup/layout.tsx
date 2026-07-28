import type { Metadata } from 'next'

// page.tsx is a client component, so it cannot export metadata itself. Without
// this the route inherited the root layout's generic `EazyExchange` title and
// the landing description verbatim — identical to /login and near-identical to
// /, which is what a crawler scores as a duplicate and declines to index.
// /signup is the only non-marketing URL in sitemap.ts, so it has to stand alone.
const title = 'Créer un compte organisateur — Eazyexchange'
const description =
  'Créez votre compte organisateur Eazyexchange : candidatures, formulaires et dossiers élèves au même endroit, pour les deux établissements. Essai gratuit, un échange, sans carte bancaire.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/signup' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/signup',
    siteName: 'EazyExchange',
    title,
    description,
  },
  twitter: { card: 'summary_large_image', title, description },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
