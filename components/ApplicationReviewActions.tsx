'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { acceptApplication, rejectApplication } from '@/actions/applications-review'
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
  const t = useTranslations()

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn(); router.push('/applications') }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  if (status === 'accepted' || status === 'declined' || status === 'maybe' || status === 'enrolled') {
    const labels: Record<string, string> = {
      accepted: t('organizer.applications.review.statusAccepted'),
      enrolled: t('organizer.applications.review.statusEnrolled'),
      declined: t('organizer.applications.review.statusDeclined'),
      maybe: t('organizer.applications.review.statusMaybe'),
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{labels[status]}</p>
        {response && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.responseLabel')} <strong>{response}</strong></p>}
        {note && <p className="text-sm text-muted-foreground">{t('organizer.applications.review.noteLabel')} {note}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {status === 'rejected' && <p className="text-sm text-red-600">{t('organizer.applications.review.currentlyRejected')}</p>}
      {!rejecting ? (
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => run(() => acceptApplication(applicationId))}>{t('organizer.applications.review.accept')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>{t('organizer.applications.rejectCta')}</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder={t('organizer.applications.notePlaceholder')} value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
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
