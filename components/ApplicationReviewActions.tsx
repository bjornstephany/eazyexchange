'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { acceptApplication, rejectApplication } from '@/actions/applications-review'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props { applicationId: string; exchangeId: string; status: string; response: string | null; note: string | null }

// Rendered for EVERY application status — the component, not the caller,
// decides what an organizer may do. Each branch mirrors a server-side guard in
// actions/applications-review.ts (ACCEPTABLE_STATUSES / REJECTABLE_STATUSES);
// the UI never offers an action the action layer would refuse.
export function ApplicationReviewActions({ applicationId, status, response, note }: Props) {
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [reinviting, setReinviting] = useState(false)
  const [personalNote, setPersonalNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useTranslations()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.push('/applications') }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  function readOnly(label: string, hint?: string) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {response && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.responseLabel')} <strong>{response}</strong></p>}
        {note && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.noteLabel')} {note}</p>}
      </div>
    )
  }

  // The student said no. Terminal: acceptApplication would throw anyway
  // (`declined` is not in ACCEPTABLE_STATUSES), so offer no control at all.
  if (status === 'declined') {
    return readOnly(
      t('organizer.applications.review.statusDeclined'),
      t('organizer.applications.review.declinedLocked'),
    )
  }
  if (status === 'accepted') return readOnly(t('organizer.applications.review.statusAccepted'))
  if (status === 'maybe') return readOnly(t('organizer.applications.review.statusMaybe'))
  if (status === 'enrolling' || status === 'enrolled') {
    return readOnly(t('organizer.applications.review.statusEnrolled'))
  }

  // The organizer said no and may change their mind — optionally explaining
  // themselves in a message that rides along with the invitation email.
  if (status === 'rejected') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{t('organizer.applications.review.currentlyRejected')}</p>
        {note && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.noteLabel')} {note}</p>}
        {!reinviting ? (
          <Button variant="outline" disabled={busy} onClick={() => setReinviting(true)}>
            {t('organizer.applications.review.changeMind')}
          </Button>
        ) : (
          <div className="space-y-2">
            <label htmlFor="reinvite-note" className="block text-sm text-muted-foreground">
              {t('organizer.applications.review.personalNoteLabel')}
            </label>
            <Textarea
              id="reinvite-note"
              placeholder={t('organizer.applications.review.personalNotePlaceholder')}
              value={personalNote}
              onChange={e => setPersonalNote(e.target.value)}
            />
            <div className="flex gap-3">
              <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId, { personalNote }))}>
                {t('organizer.applications.review.confirmInvite')}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setReinviting(false)}>
                {t('common.actions.cancel')}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  // invited / draft — nothing to review yet.
  if (status !== 'submitted') return readOnly(t('organizer.applications.review.statusNotSubmitted'))

  return (
    <div className="space-y-3">
      {!rejecting ? (
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId))}>{t('organizer.applications.review.accept')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>{t('organizer.applications.rejectCta')}</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder={t('organizer.applications.review.notePlaceholder')} value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
            {t('organizer.applications.review.sendRejectionEmail')}
          </label>
          <div className="flex gap-3">
            <Button variant="destructive" disabled={busy} onClick={() => run(() => rejectApplication(applicationId, rejectNote, sendEmail))}>{t('organizer.applications.confirmRejectCta')}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>{t('common.actions.cancel')}</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
