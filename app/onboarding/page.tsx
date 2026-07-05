import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { OnboardingForm } from './OnboardingForm'

// Dedicated first-login step: capture the organizer's school name. The
// organizer layout gate bounces here while schools.name === ''. Once set,
// this page redirects completed organizers straight to the dashboard.
export default async function OnboardingPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')
  if ((profile.schools?.name ?? '') !== '') redirect('/dashboard')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Bienvenue sur Eazyexchange</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">Dernière étape : indiquez le nom de votre établissement.</p>
        </div>
        <OnboardingForm />
      </AuthCard>
    </div>
  )
}
