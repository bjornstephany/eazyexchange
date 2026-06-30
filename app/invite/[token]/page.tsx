import { getInvitation } from '@/actions/applications'
import { InviteResponseForm } from '@/components/InviteResponseForm'

// Reads live invitation state (accepted / already-answered) via the cookie-less
// admin client — force dynamic so the response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) {
    return <main className="max-w-lg mx-auto px-4 py-12"><p className="text-slate-600">This invitation link is not valid.</p></main>
  }
  const closed = !['accepted', 'maybe'].includes(invite.status)
  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-2">You&apos;re invited to {invite.exchangeName}!</h1>
      {closed ? (
        <p className="text-slate-600">This invitation has already been answered.</p>
      ) : (
        <>
          <p className="text-slate-600 mb-6">{invite.applicantName ? `Hi ${invite.applicantName}, ` : ''}you&apos;ve been accepted. Will you join the exchange?</p>
          <InviteResponseForm token={token} />
        </>
      )}
    </main>
  )
}
