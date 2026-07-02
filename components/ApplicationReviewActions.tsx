'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptApplication, rejectApplication } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props { applicationId: string; exchangeId: string; status: string; response: string | null; note: string | null }

export function ApplicationReviewActions({ applicationId, status, response, note }: Props) {
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.push('/applications') }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  if (status === 'accepted' || status === 'declined' || status === 'maybe' || status === 'enrolled') {
    const labels: Record<string, string> = {
      accepted: 'Accepted — awaiting response', enrolled: 'Enrolled (said Yes)',
      declined: 'Declined the invitation', maybe: 'Responded Maybe',
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{labels[status]}</p>
        {response && <p className="text-sm text-muted-foreground">Response: <strong>{response}</strong></p>}
        {note && <p className="text-sm text-muted-foreground">Note: {note}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {status === 'rejected' && <p className="text-sm text-red-600">Currently rejected. You can still accept.</p>}
      {!rejecting ? (
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId))}>Accept</Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder="Optional note to the applicant" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
            Send a rejection email to the applicant
          </label>
          <div className="flex gap-3">
            <Button variant="destructive" disabled={busy} onClick={() => run(() => rejectApplication(applicationId, rejectNote, sendEmail))}>Confirm reject</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
