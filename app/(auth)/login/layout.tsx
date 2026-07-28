import type { Metadata } from 'next'

// page.tsx is a client component and cannot export metadata itself.
//
// `index: false` is the point of this file. /login is linked from the landing
// header and footer, is not disallowed in robots.txt, and inherited the exact
// same title and description as /signup — two thin, duplicate URLs competing
// for the one query that matters ("eazyexchange"). It stays crawlable
// (`follow: true`, no robots.txt entry) precisely so the noindex is read.
export const metadata: Metadata = {
  title: 'Connexion — Eazyexchange',
  description: 'Connectez-vous à votre espace Eazyexchange.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
