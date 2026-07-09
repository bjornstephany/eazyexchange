import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: "Eazyexchange — La plateforme des organisateurs d’échanges scolaires",
  description:
    "Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.",
}

// No auth calls here — the logged-in redirect happens in middleware.ts. Keeping
// this component synchronous and dependency-free is what lets Next prerender the
// landing page so anonymous visitors never pay a function cold start.
export default function RootPage() {
  return <LandingPage />
}
