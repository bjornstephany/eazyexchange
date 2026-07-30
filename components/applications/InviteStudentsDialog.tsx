'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InviteByEmailForm } from '@/components/applications/InviteByEmailForm'

// Step ② of the setup: both invitation methods in one dialog — the copyable
// /apply/<slug> link and the paste-addresses form. Supersedes both
// InviteByEmailDialog (a 33-line wrapper around the form) and the second half
// of OpenApplicationsDialog.
//
// Nothing here is gated on a "not yet open" state the way OpenApplicationsDialog
// was: this dialog only exists once the application has been created, so
// /apply/<slug> is already live and sendApplicationInvitations already accepts.
export function InviteStudentsDialog({
  exchangeId, applySlug, open, onOpenChange,
}: {
  exchangeId: string
  applySlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer.applications.invite')
  const ta = useTranslations('organizer.applications')
  const [copied, setCopied] = useState(false)

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
          <Label htmlFor="invite-students-link">{t('linkHeading')}</Label>
          <div className="flex gap-2">
            <Input
              id="invite-students-link"
              readOnly
              value={applyUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-12"
            />
            <Button type="button" variant="outline" onClick={copy} className="h-12 whitespace-nowrap">
              {copied ? ta('copiedCta') : ta('copyCta')}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-navy">{t('emailHeading')}</span>
          {/* resetKey = the dialog's own open flag, so a stale send summary
              never greets the next opening. */}
          <InviteByEmailForm exchangeId={exchangeId} resetKey={open}>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              {t('close')}
            </Button>
          </InviteByEmailForm>
        </div>
      </DialogContent>
    </Dialog>
  )
}
