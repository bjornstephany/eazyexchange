import { getInvitation } from '@/actions/applications'
import { InviteResponseForm } from '@/components/InviteResponseForm'
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
