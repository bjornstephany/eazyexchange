import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/request'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { SignOutLink } from '@/components/auth/SignOutLink'

const SUPPORT_EMAIL = 'contact@eazyexchange.com'

// Terminal page for an account that is not approved. Deliberately NOT in
// middleware's isAuthRoute list: that branch redirects a non-approved user to
// /pending, so including this route would redirect /pending to itself — an
// infinite loop and a blank tab, the failure shell-destination.ts documents.
// An approved visitor is sent onward from here instead.
export default async function PendingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.status === 'approved') {
    redirect(profile.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  const rejected = profile.status === 'rejected'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          {rejected ? 'Accès non ouvert' : 'Votre demande est en cours d’examen'}
        </h3>
        {rejected ? (
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Nous ne pouvons pas ouvrir l’accès à votre compte pour le moment. Si vous
            pensez qu’il s’agit d’une erreur, écrivez-nous à{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        ) : (
          <>
            <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
              Merci d’avoir créé votre compte. Eazyexchange n’est pas encore ouvert à
              tous : nous examinons chaque demande une par une et nous revenons vers
              vous très vite.
            </p>
            <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
              Une question d’ici là ?{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </>
        )}
        <SignOutLink />
      </AuthCard>
    </div>
  )
}
