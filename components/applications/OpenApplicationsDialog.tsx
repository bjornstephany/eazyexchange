'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { setApplicationOpen } from '@/actions/exchanges'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { Label } from '@/components/ui/label'
import { InviteByEmailForm } from '@/components/applications/InviteByEmailForm'

// One screen: pick a deadline — which opens applications on the spot — then
// invite by copying the link or by pasting addresses. Both methods stay inert
// until that first call resolves: before it, /apply/<slug> 404s and
// sendApplicationInvitations refuses with { ok: false, notOpen: true }.
//
// There is deliberately no "copy the link before closing" warning here. The old
// InviteModal needed one because it showed the link exactly once; this link
// lives permanently in the invitation panel under the grid.
export function OpenApplicationsDialog({
  exchangeId, applySlug, open, onOpenChange, onOpened,
}: {
  exchangeId: string
  applySlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpened: (deadline: string) => void
}) {
  const t = useTranslations('organizer.applications.openDialog')
  const ta = useTranslations('organizer.applications')
  const c = useTranslations('common')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [opened, setOpened] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset transient state each time the dialog is opened.
  useEffect(() => {
    if (open) { setDeadline(''); setSaving(false); setOpened(false); setCopied(false); setError(null) }
  }, [open])

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function chooseDeadline(next: string) {
    // Clearing a date input fires onChange with ''. Persisting that would close
    // the funnel behind the organizer's back — ignore it, same rule as the panel.
    if (!next) return
    setDeadline(next)
    setSaving(true)
    setError(null)
    try {
      await setApplicationOpen(exchangeId, true, next)
      setOpened(true)
      onOpened(next)
    } catch {
      // Roll the optimistic value back so re-picking the SAME date still fires a
      // change event — otherwise the only way to retry is to pick a different one.
      setDeadline('')
      setError(t('openError'))
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
    } catch {
      /* best-effort: the field is selectable for manual copy */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">{t('title')}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="open-applications-deadline">{t('deadlineLabel')}</Label>
          <DateField
            id="open-applications-deadline"
            value={deadline}
            disabled={saving}
            onChange={chooseDeadline}
            className="h-12"
          />
        </div>

        {error && (
          <div className="rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">{error}</div>
        )}

        <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('methodHeading')}
        </p>
        {!opened && (
          <p className="text-[13px] text-muted-foreground">{saving ? t('saving') : t('lockedHint')}</p>
        )}

        <div className={opened ? 'flex flex-col gap-4' : 'flex flex-col gap-4 opacity-50'}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="open-applications-link">{t('linkHeading')}</Label>
            <div className="flex gap-2">
              <Input
                id="open-applications-link"
                readOnly
                disabled={!opened}
                value={applyUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-12"
              />
              <Button type="button" variant="outline" disabled={!opened} onClick={copy} className="h-12 whitespace-nowrap">
                {copied ? ta('copiedCta') : ta('copyCta')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy">{t('emailHeading')}</span>
            <InviteByEmailForm exchangeId={exchangeId} disabled={!opened} resetKey={open} />
          </div>
        </div>

        <div className="mt-1.5 flex justify-end">
          {opened ? (
            <Button type="button" onClick={() => onOpenChange(false)}>{t('done')}</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              {c('actions.cancel')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
