'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { sendApplicationInvitations } from '@/actions/applications-review'
import { Button } from '@/components/ui/button'

// Shared by InviteByEmailDialog (its own modal, reached from the invitation
// panel) and OpenApplicationsDialog (section ② of the open-applications
// screen). Owns the paste box, the send call and the result/error rendering;
// consumers own only the surrounding layout and may slot their own buttons to
// the left of Send via `children`.
export function InviteByEmailForm({
  exchangeId,
  disabled = false,
  resetKey,
  children,
}: {
  exchangeId: string
  disabled?: boolean
  resetKey?: unknown
  children?: ReactNode
}) {
  const t = useTranslations('organizer.applications.invite')
  const [emails, setEmails] = useState('')
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Consumers pass a changing resetKey (their `open` flag) to clear the box
  // between uses, so a stale summary never greets the next opening.
  useEffect(() => {
    setEmails('')
    setSending(false)
    setSummary(null)
    setError(null)
  }, [resetKey])

  async function submit() {
    if (!emails.trim() || sending) return
    setSending(true); setError(null); setSummary(null)
    try {
      const res = await sendApplicationInvitations(exchangeId, emails)
      if (!res.ok) {
        // This function has no catch: the rate limit used to throw, so hitting
        // it reached the error boundary and the send appeared to do nothing.
        setError(
          'notOpen' in res ? t('notOpenError')
            : 'rateLimited' in res ? t('rateLimitedError')
              : t('tooManyError'),
        )
        return
      }
      setSummary(t('result', {
        sent: res.sent, skipped: res.skippedExchange + res.skippedElsewhere, invalid: res.invalid,
      }))
      setEmails('')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <textarea
        value={emails}
        disabled={disabled}
        onChange={(e) => setEmails(e.target.value)}
        placeholder={t('placeholder')}
        rows={6}
        className="w-full rounded-[10px] border px-3 py-2 text-sm disabled:bg-subtle disabled:text-muted-foreground"
      />
      {error && (
        <div className="rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">{error}</div>
      )}
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <div className="mt-1.5 flex items-center justify-end gap-3">
        {children}
        <Button type="button" disabled={disabled || !emails.trim() || sending} onClick={submit}>
          {sending ? t('sending') : t('sendCta')}
        </Button>
      </div>
    </>
  )
}
