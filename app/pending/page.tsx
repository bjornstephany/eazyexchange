import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/request'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { SignOutLink } from '@/components/auth/SignOutLink'

const SUPPORT_EMAIL = 'contact@eazyexchange.com'

// Terminal page for an account that is not approved. Since the 2026-07-30
// waitlist change no NEW account can land here — the gate moved to
// signup_allowlist, checked before an account exists — so this serves the
// legacy rows that predate it, and any account someone sets to 'rejected' by
// hand. Deliberately NOT in proxy.ts's isAuthRoute list: that branch redirects
// non-approved users to /pending, so including this route would redirect
// /pending to itself — an infinite loop and a blank tab.
export default async function PendingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.status === 'approved') {
    redirect(profile.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          Accès pas encore ouvert
        </h3>
        <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
          Eazyexchange n’est pas encore ouvert à tous. Votre adresse est enregistrée
          et nous vous écrirons dès que l’accès sera disponible.
        </p>
        <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
          Une question d’ici là ?{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <SignOutLink />
      </AuthCard>
    </div>
  )
}
