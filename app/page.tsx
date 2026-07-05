import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { LandingPage } from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: "Eazyexchange — La plateforme des organisateurs d’échanges scolaires",
  description:
    "Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.",
}

export default async function RootPage() {
  const user = await getAuthUser()

  if (user) {
    const profile = await getProfile()
    redirect(profile?.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  return <LandingPage />
}
