'use client'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'

export type InvitationControls = {
  open: boolean
  deadline: string
  saving: boolean
  onToggleOpen: () => void
  onDeadlineChange: (next: string) => void
}

// The invitation controls, parked under the tracking grid so they stop
// competing with it. Native <details>/<summary>: the disclosure is keyboard-
// and screen-reader-correct without a line of state. The open/deadline state
// itself stays with CandidaturesView, which needs it for the empty-state gate.
export function InvitationPanel({
  applyUrl, controls, onInviteByEmail,
}: {
  applyUrl: string
  controls: InvitationControls
  onInviteByEmail: () => void
}) {
  const t = useTranslations('organizer.applications')
  const locale = useLocale() as Locale
  const { open, deadline, saving, onToggleOpen, onDeadlineChange } = controls
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* best-effort: field is selectable for manual copy */
    }
  }

  return (
    <details className="mt-5 rounded-[11px] border bg-card px-4 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-tint-text' : 'bg-muted-foreground'}`} />
        <span className="font-medium text-navy">
          {open ? t('panel.summaryOpen') : t('panel.summaryClosed')}
        </span>
        {deadline && <span>{t('panel.deadlineSuffix', { date: shortDate(deadline, locale) })}</span>}
        <span className="ml-auto text-tertiary">⌄</span>
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3">
        <button
          type="button"
          disabled={saving}
          onClick={onToggleOpen}
          className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${
            open ? 'bg-tint text-tint-text' : 'bg-subtle text-muted-foreground'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-tint-text' : 'bg-muted-foreground'}`} />
          {open ? t('stateOpen') : t('stateClosed')}
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span id="candidatures-deadline-label">{t('deadlineLabel')}</span>
          <DateField
            ariaLabelledBy="candidatures-deadline-label"
            value={deadline}
            disabled={saving}
            onChange={onDeadlineChange}
            className="h-[34px] w-auto min-w-[150px] rounded-[8px] text-[13px]"
          />
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          <label htmlFor="candidatures-invite-link" className="text-[12.5px] text-muted-foreground whitespace-nowrap">
            {t('linkLabel')}
          </label>
          <input
            id="candidatures-invite-link"
            type="text"
            readOnly
            value={applyUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-[34px] w-[220px] max-w-full rounded-[8px] border bg-subtle px-2.5 text-[13px] text-muted-foreground"
          />
          <button
            type="button"
            onClick={copyLink}
            className="h-[34px] whitespace-nowrap rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white"
          >
            {copied ? t('copiedCta') : t('copyCta')}
          </button>
          <Button type="button" variant="outline" onClick={onInviteByEmail} className="h-[34px] whitespace-nowrap text-[12.5px]">
            {t('invite.openCta')}
          </Button>
        </div>
      </div>
    </details>
  )
}
