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
import { setApplicationOpen } from '@/actions/exchanges'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'
import { InviteByEmailDialog } from '@/components/applications/InviteByEmailDialog'
import { InvitationPanel, type InvitationControls } from '@/components/applications/InvitationPanel'
import { OpenApplicationsDialog } from '@/components/applications/OpenApplicationsDialog'
import { GoodNewsBlockNotice } from '@/components/applications/GoodNewsBlockNotice'

// Invited/started rows are organizer-sent invitations still in the funnel; they
// are shown for tracking but never bulk-selectable for accept/reject.
const SELECTABLE = (a: AppRow) => a.status !== 'invited' && a.status !== 'draft'

export function CandidaturesView({
  apps,
  exchangeName,
  exchangeId,
  applicationOpen,
  applicationDeadline,
  applySlug,
  initialTab,
}: {
  apps: AppRow[]
  exchangeName: string
  exchangeId: string
  applicationOpen: boolean
  applicationDeadline: string | null
  applySlug: string
  initialTab?: TabKey
}) {
  const router = useRouter()
  const tr = useTranslations()
  const locale = useLocale() as Locale
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'all')
  const [open, setOpen] = useState(applicationOpen)
  const [deadline, setDeadline] = useState(applicationDeadline ?? '')
  const [savingState, setSavingState] = useState(false)
  const [openDialog, setOpenDialog] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null)
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

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

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

  async function toggleOpen() {
    const next = !open
    setSavingState(true)
    try {
      await setApplicationOpen(exchangeId, next, deadline || null)
      setOpen(next)
    } finally {
      setSavingState(false)
    }
  }

  async function changeDeadline(next: string) {
    if (!next) return
    setDeadline(next)
    setSavingState(true)
    try {
      await setApplicationOpen(exchangeId, open, next || null)
    } finally {
      setSavingState(false)
    }
  }

  // An organizer who has opened applications must keep seeing the link and the
  // deadline even before anyone applies — hence all three conditions, not just
  // an empty list. `deadline` is '' exactly when applicationDeadline was null.
  const neverOpened = apps.length === 0 && !open && !deadline

  function handleOpened(next: string) {
    setOpen(true)
    setDeadline(next)
  }

  const controls: InvitationControls = {
    open,
    deadline,
    saving: savingState,
    onToggleOpen: toggleOpen,
    onDeadlineChange: changeDeadline,
  }

  return (
    <>
      {neverOpened ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">
            {tr('organizer.applications.empty.title')}
          </h1>
          <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">
            {tr('organizer.applications.empty.body')}
          </p>
          <button
            type="button"
            onClick={() => setOpenDialog(true)}
            className="mt-6 flex h-[42px] items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            {tr('organizer.applications.empty.cta')}
          </button>
        </div>
      ) : (
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">{tr('organizer.applications.heading')}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {apps.length === 0
              ? tr('organizer.applications.emptyState')
              : tr('organizer.applications.countSummary', { n: apps.length, exchangeName })}
          </p>

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

          <InvitationPanel applyUrl={applyUrl} controls={controls} onInviteByEmail={() => setInviteOpen(true)} />
        </div>
      )}
      <OpenApplicationsDialog
        exchangeId={exchangeId}
        applySlug={applySlug}
        open={openDialog}
        onOpenChange={setOpenDialog}
        onOpened={handleOpened}
      />
      <InviteByEmailDialog exchangeId={exchangeId} open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}
