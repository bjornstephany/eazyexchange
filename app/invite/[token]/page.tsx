import { getInvitation } from '@/actions/applications'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { CenteredCard } from '@/components/auth/CenteredCard'

// Reads live invitation state (accepted / already-answered) via the cookie-less
// admin client — force dynamic so the response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) return (
    <CenteredCard maxWidth={520}><p className="m-0 text-[15px] text-[#5B6B8C]">Ce lien d’invitation n’est pas valide.</p></CenteredCard>
  )
  if (invite.expired) return (
    <CenteredCard maxWidth={520}><p className="m-0 text-[15px] text-[#5B6B8C]">Cette invitation a expiré. Contacte ton organisateur pour en recevoir une nouvelle.</p></CenteredCard>
  )
  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <CenteredCard maxWidth={520}><p className="m-0 text-[15px] text-[#5B6B8C]">Cette invitation a déjà reçu une réponse.</p></CenteredCard>
  )
  const firstName = (invite.applicantName ?? '').trim().split(/\s+/)[0] ?? ''
  return (
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} firstName={firstName} exchangeName={invite.exchangeName} />
    </CenteredCard>
  )
}
