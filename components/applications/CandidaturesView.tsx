'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { AppRow } from '@/lib/dashboard/rollup'
import { applicantStatusPill } from '@/lib/dashboard/rollup'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import { applicantName } from '@/lib/application-form'
import { TAB_KEYS, matchesTab, type TabKey } from '@/lib/applications/tabs'
import { acceptApplications, rejectApplications, type AcceptBlock } from '@/actions/applications-review'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'
import { ApplicationDeadlineLine } from '@/components/applications/ApplicationDeadlineLine'
import { GoodNewsBlockNotice } from '@/components/applications/GoodNewsBlockNotice'
import { InviteStudentsDialog } from '@/components/applications/InviteStudentsDialog'
import { Button } from '@/components/ui/button'

// Invited/started rows are organizer-sent invitations still in the funnel; they
// are shown for tracking but never bulk-selectable for accept/reject.
const SELECTABLE = (a: AppRow) => a.status !== 'invited' && a.status !== 'draft'

// The tracking list plus the two controls that outlive setup: one editable
// deadline and « Inviter les élèves ». There is no template line and no
// open/closed toggle — everything that CONFIGURES an application lives in
// ApplicationSetup, which this file never renders and which never renders this
// one (the page branches server-side).
//
// Inviting has to be here and not only in ApplicationSetup, because sending
// invitations is what ENDS the setup state: sendApplicationInvitations writes
// an `invited` row per address, that row counts in applicationCount, and
// applicationState() therefore returns 'running'. Left in setup alone, the
// invite button destroyed itself on first use and no second wave — nor even
// the /apply link — was reachable again.
export function CandidaturesView({
  apps,
  exchangeName,
  exchangeId,
  applySlug,
  applicationDeadline,
  initialTab,
}: {
  apps: AppRow[]
  exchangeName: string
  exchangeId: string
  applySlug: string
  applicationDeadline: string | null
  initialTab?: TabKey
}) {
  const router = useRouter()
  const tr = useTranslations()
  const locale = useLocale() as Locale
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'all')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  // A whole batch refused because the acceptance email is incomplete — one
  // cause, one fix, so it is reported once rather than per candidate.
  const [bulkBlock, setBulkBlock] = useState<AcceptBlock | null>(null)

  // data.sex holds the radio token from lib/application-form.ts. Legacy
  // applications predate the choice list and hold free text — render those
  // verbatim rather than blanking them (same rule as ApplicationReadView).
  // Lives inside the component so it closes over `tr`: taking the translator
  // as a parameter widens its key type past what TypeScript can represent.
  function genderLabel(raw: string | undefined): string {
    const v = (raw ?? '').trim()
    switch (v) {
      case '': return '—'
      case 'male': return tr('organizer.applications.gender.male')
      case 'female': return tr('organizer.applications.gender.female')
      case 'other': return tr('organizer.applications.gender.other')
      default: return v
    }
  }

  function tabLabel(key: TabKey): string {
    switch (key) {
      case 'all': return tr('organizer.applications.tabs.all')
      case 'invited': return tr('organizer.applications.tabs.invited')
      case 'toreview': return tr('organizer.applications.tabs.toReview')
      case 'awaiting': return tr('organizer.applications.tabs.awaiting')
      case 'accepted': return tr('organizer.applications.tabs.accepted')
      case 'rejected': return tr('organizer.applications.tabs.rejected')
      case 'declined': return tr('organizer.applications.tabs.declined')
    }
  }

  const filtered = apps.filter(a => matchesTab(a, tab))

  function toggleOne(id: string) {
    setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]))
  }

  function toggleAll() {
    const selectable = filtered.filter(SELECTABLE)
    const allSelected = selectable.length > 0 && selectable.every(a => selected.includes(a.id))
    setSelected(allSelected ? [] : selectable.map(a => a.id))
  }

  function resetBulkUi() {
    setSelected([])
    setRejecting(false)
    setNote('')
    setSendEmail(true)
  }

  async function handleAccept() {
    setBusy(true)
    try {
      const result = await acceptApplications(selected)
      resetBulkUi()
      setBulkBlock(result.blocked)
      // A block already explains every failure in the batch; showing the tally
      // as well would just repeat it in vaguer words.
      setBulkResult(result.failed > 0 && !result.blocked ? result : null)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmReject() {
    setBusy(true)
    try {
      const result = await rejectApplications(selected, note, sendEmail)
      resetBulkUi()
      setBulkBlock(null)
      setBulkResult(result.failed > 0 ? result : null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-navy">{tr('organizer.applications.heading')}</h1>
        {/* Gated on the deadline, because the deadline is what makes
            /apply/<slug> live (the funnel honours today <= deadline). Two
            states reach En cours without one: a legacy exchange carrying
            applications but no deadline, and the fail-closed count-query blip
            that forces 'running' with zero applications. Offering to invite
            into a dead funnel would email families a link that refuses them.
            Setting the deadline in the line just below brings the button back. */}
        {applicationDeadline != null && (
          <Button type="button" onClick={() => setInviteOpen(true)} className="h-[36px] shrink-0 text-[12.5px]">
            {tr('organizer.applications.inviteCta')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {apps.length === 0
          ? tr('organizer.applications.emptyState')
          : tr('organizer.applications.countSummary', { n: apps.length, exchangeName })}
      </p>

      <ApplicationDeadlineLine exchangeId={exchangeId} deadline={applicationDeadline ?? ''} />

      <div className="flex gap-1.5 bg-subtle rounded-[11px] p-1 w-fit mb-4">
        {TAB_KEYS.map(key => {
          const count = apps.filter(a => matchesTab(a, key)).length
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium flex gap-1.5 items-center ${
                active ? 'bg-card text-navy shadow-sm font-semibold' : 'text-muted-foreground'
              }`}
            >
              {tabLabel(key)}
              <span className="font-mono text-[11px] text-tertiary">{count}</span>
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-2.5 bg-tint border border-tint-border rounded-[11px] px-4 py-2.5 mb-3">
          <span className="text-[13px] font-semibold text-tint-text">
            {tr('organizer.applications.selectedCount', { n: selected.length })}
          </span>
          {!rejecting ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleAccept}
                className="bg-brand text-white rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              >
                {busy ? tr('organizer.applications.sending') : tr('organizer.applications.acceptCta')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className="bg-danger text-danger-text rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              >
                {busy ? tr('organizer.applications.sending') : tr('organizer.applications.rejectCta')}
              </button>
              <button
                type="button"
                onClick={resetBulkUi}
                className="text-muted-foreground rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold"
              >
                {tr('common.actions.cancel')}
              </button>
            </>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={tr('organizer.applications.notePlaceholder')}
                className="flex-1 min-w-[180px] rounded-[8px] border p-2 text-sm"
              />
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground whitespace-nowrap">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                {tr('organizer.applications.notifyByEmail')}
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmReject}
                className="bg-danger text-danger-text rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              >
                {busy ? tr('organizer.applications.sending') : tr('organizer.applications.confirmRejectCta')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(false)}
                className="text-muted-foreground rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold"
              >
                {tr('common.actions.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {bulkBlock && (
        <div className="mb-3">
          <GoodNewsBlockNotice block={bulkBlock} />
        </div>
      )}

      {bulkResult && bulkResult.failed > 0 && (
        <p className="text-sm text-danger-text mb-3">
          {tr('organizer.applications.bulkResult', { s: bulkResult.succeeded, f: bulkResult.failed })}
        </p>
      )}

      <div className="bg-card border rounded-[14px] overflow-hidden">
        <div className="grid grid-cols-[28px_1.7fr_1fr_1fr_.9fr_1.1fr_22px] gap-2 items-center px-4 py-2 font-mono text-[10px] uppercase text-tertiary border-b">
          <input
            type="checkbox"
            checked={filtered.filter(SELECTABLE).length > 0 && filtered.filter(SELECTABLE).every(a => selected.includes(a.id))}
            onChange={toggleAll}
          />
          <span>{tr('organizer.applications.tableHeader.student')}</span>
          <span>{tr('organizer.applications.tableHeader.level')}</span>
          <span>{tr('organizer.applications.tableHeader.gender')}</span>
          <span>{tr('organizer.applications.tableHeader.receivedDate')}</span>
          <span>{tr('organizer.applications.tableHeader.status')}</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{tr('organizer.applications.emptyTab')}</p>
        ) : (
          filtered.map(a => (
            <div
              key={a.id}
              onClick={() => router.push(`/applications?id=${a.id}`)}
              className="grid grid-cols-[28px_1.7fr_1fr_1fr_.9fr_1.1fr_22px] gap-2 items-center px-4 py-2.5 border-b last:border-0 cursor-pointer hover:bg-hoverrow"
            >
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                disabled={!SELECTABLE(a)}
                onChange={() => toggleOne(a.id)}
                onClick={e => e.stopPropagation()}
              />
              <span className="flex min-w-0 items-center gap-2.5">
                <ApplicantAvatar photoUrl={a.photoUrl ?? null} data={a.data} email={a.email} />
                <span className="truncate text-sm text-navy">{applicantName(a.data) || a.email}</span>
              </span>
              <span className="text-sm text-navy">{a.data.grade ?? '—'}</span>
              <span className="text-sm text-navy">{genderLabel(a.data.sex)}</span>
              <span className="text-sm text-navy">{shortDate(a.submitted_at, locale)}</span>
              <StatusPill pill={applicantStatusPill(a.status, tr)} />
              <span className="text-muted-foreground">›</span>
            </div>
          ))
        )}
      </div>

      <InviteStudentsDialog
        exchangeId={exchangeId}
        applySlug={applySlug}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  )
}
