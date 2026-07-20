'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { sendApplicationInvitations } from '@/actions/applications-review'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function InviteByEmailDialog({
  exchangeId, open, onOpenChange,
}: {
  exchangeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer.applications.invite')
  const [emails, setEmails] = useState('')
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setEmails(''); setSending(false); setSummary(null); setError(null) }
  }, [open])

  async function submit() {
    if (!emails.trim() || sending) return
    setSending(true); setError(null); setSummary(null)
    try {
      const res = await sendApplicationInvitations(exchangeId, emails)
      if (!res.ok) {
        setError('notOpen' in res ? t('notOpenError') : t('tooManyError'))
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">{t('title')}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">{t('description')}</DialogDescription>
        </DialogHeader>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={t('placeholder')}
          rows={6}
          className="w-full rounded-[10px] border px-3 py-2 text-sm"
        />
        {error && (
          <div className="rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">{error}</div>
        )}
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <div className="mt-1.5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
            {t('close')}
          </Button>
          <Button type="button" disabled={!emails.trim() || sending} onClick={submit}>
            {sending ? t('sending') : t('sendCta')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
