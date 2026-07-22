import { getInvitation } from '@/actions/invitations'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads live invitation state via the cookie-less admin client — force dynamic
// so the parent response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ r?: string }>
}) {
  const { token } = await params
  const { r } = await searchParams
  const preselect = r === 'yes' || r === 'no' || r === 'maybe' ? r : null
  const invite = await getInvitation(token)

  if (!invite) return (
    <InvalidLinkState
      title="Ce lien n’est plus valide"
      body="Il a peut-être expiré — c’est normal, les liens expirent pour protéger le dossier. Vérifiez l’adresse dans votre e-mail, ou demandez à l’organisateur de vous en renvoyer un nouveau."
    />
  )
  if (invite.expired) return (
    <InvalidLinkState
      title="Cette invitation a expiré"
      body="Contactez l’organisateur pour recevoir une nouvelle invitation."
    />
  )

  // Already confirmed (by a prior click or the other parent): parent-facing
  // success — the student has (or will shortly) receive their own setup link.
  // No session is minted here (this page is parent-facing).
  if (invite.status === 'enrolling' || invite.status === 'enrolled') return (
    <CenteredCard maxWidth={520}>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">Participation déjà confirmée</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Merci — la participation à l’échange {invite.exchangeName} est confirmée. Votre enfant reçoit un lien par e-mail pour créer son accès.</p>
      </div>
    </CenteredCard>
  )

  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <InvalidLinkState
      title="Cette invitation a déjà reçu une réponse"
      body="Une réponse a déjà été enregistrée. Si c’est une erreur, contactez l’organisateur."
    />
  )
  return (
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} studentName={(invite.applicantName ?? '').trim()} exchangeName={invite.exchangeName} preselect={preselect} />
    </CenteredCard>
  )
}
