import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { createClient } from '@/lib/supabase/server'
import { mustOnboard } from '@/lib/onboarding/gate'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { OnboardingForm } from './OnboardingForm'

// Dedicated first-login setup: capture the school name (step 1) and force the
// school's first exchange with at least one Info card (step 2). The organizer
// layout gate bounces here while the school has no name or no exchange; once
// both exist this page redirects to the dashboard.
export default async function OnboardingPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const schoolName = profile.schools?.name ?? ''

  const supabase = await createClient()
  const { count } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  const ownedCount = count ?? 0

  if (!mustOnboard(schoolName, ownedCount)) redirect('/dashboard')

  // Blank name → start at the school-name step; named but no exchange → jump
  // straight to the first-exchange step.
  const initialStep = schoolName === '' ? 1 : 2

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Bienvenue sur Eazyexchange</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">Configurons votre programme en quelques étapes.</p>
        </div>
        <OnboardingForm initialStep={initialStep} initialSchoolName={schoolName} />
      </AuthCard>
    </div>
  )
}
