import Link from 'next/link'
import { getInvitation } from '@/actions/invitations'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { InviteResumeCard } from '@/components/InviteResumeCard'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads live invitation state (accepted / already-answered) via the cookie-less
// admin client — force dynamic so the response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) return (
    <InvalidLinkState
      title="Ce lien n’est plus valide"
      body="Il a peut-être expiré — c’est normal, les liens expirent pour protéger ton dossier. Vérifie l’adresse dans ton e-mail, ou demande à ton organisateur de t’en renvoyer un nouveau."
    />
  )
  if (invite.expired) return (
    <InvalidLinkState
      title="Cette invitation a expiré"
      body="Contacte ton organisateur pour recevoir une nouvelle invitation."
    />
  )

  // Already said « Oui » with a still-valid token: recovery states instead of a
  // dead-end — resume setup if the account isn't configured, else point to login.
  if (invite.status === 'enrolling' || invite.status === 'enrolled') {
    if (invite.setupComplete) return (
      <CenteredCard maxWidth={520}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">Ton compte est déjà actif</h3>
            <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Ton inscription à l’échange {invite.exchangeName} est terminée. Connecte-toi pour accéder à ton espace élève.</p>
          </div>
          <Link href="/login" className="inline-flex h-[50px] w-full items-center justify-center rounded-[11px] bg-[#2456E6] text-base font-semibold text-white hover:bg-[#1D48C7]">Se connecter</Link>
        </div>
      </CenteredCard>
    )
    return (
      <CenteredCard maxWidth={520}>
        <InviteResumeCard token={token} exchangeName={invite.exchangeName} />
      </CenteredCard>
    )
  }

  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <InvalidLinkState
      title="Cette invitation a déjà reçu une réponse"
      body="Tu as déjà répondu à cette invitation. Si c’est une erreur, contacte ton organisateur."
    />
  )
  const firstName = (invite.applicantName ?? '').trim().split(/\s+/)[0] ?? ''
  return (
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} firstName={firstName} exchangeName={invite.exchangeName} />
    </CenteredCard>
  )
}
