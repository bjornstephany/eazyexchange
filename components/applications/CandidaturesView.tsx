'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { AppRow } from '@/lib/dashboard/rollup'
import { applicantStatusPill, frShortDate } from '@/lib/dashboard/rollup'
import { applicantName } from '@/lib/application-form'
import { acceptApplications, rejectApplications } from '@/actions/applications-review'
import { setApplicationOpen } from '@/actions/exchanges'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'
import { InviteByEmailDialog } from '@/components/applications/InviteByEmailDialog'
import { Button } from '@/components/ui/button'

type TabKey = 'all' | 'invited' | 'toreview' | 'accepted' | 'rejected'

const TAB_KEYS: TabKey[] = ['all', 'invited', 'toreview', 'accepted', 'rejected']

const ACCEPTED_STATUSES = ['accepted', 'maybe', 'enrolling', 'enrolled']
const REJECTED_STATUSES = ['rejected', 'declined']

// Invited/started rows are organizer-sent invitations still in the funnel; they
// are shown for tracking but never bulk-selectable for accept/reject.
const SELECTABLE = (a: AppRow) => a.status !== 'invited' && a.status !== 'draft'

function matchesTab(a: AppRow, key: TabKey): boolean {
  switch (key) {
    case 'all': return true
    case 'invited': return a.status === 'invited' || a.status === 'draft'
    case 'toreview': return a.status === 'submitted'
    case 'accepted': return ACCEPTED_STATUSES.includes(a.status)
    case 'rejected': return REJECTED_STATUSES.includes(a.status)
  }
}

export function CandidaturesView({
  apps,
  exchangeName,
  exchangeId,
  applicationOpen,
  applicationDeadline,
  applySlug,
}: {
  apps: AppRow[]
  exchangeName: string
  exchangeId: string
  applicationOpen: boolean
  applicationDeadline: string | null
  applySlug: string
}) {
  const router = useRouter()
  const tr = useTranslations()
  const [tab, setTab] = useState<TabKey>('all')
  const [open, setOpen] = useState(applicationOpen)
  const [deadline, setDeadline] = useState(applicationDeadline ?? '')
  const [savingState, setSavingState] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null)

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
      case 'accepted': return tr('organizer.applications.tabs.accepted')
      case 'rejected': return tr('organizer.applications.tabs.rejected')
    }
  }

  const filtered = apps.filter(a => matchesTab(a, tab))

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* best-effort: field is selectable for manual copy */
    }
  }

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
      setBulkResult(result.failed > 0 ? result : null)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmReject() {
    setBusy(true)
    try {
      const result = await rejectApplications(selected, note, sendEmail)
      resetBulkUi()
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

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">{tr('organizer.applications.heading')}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {apps.length === 0
          ? tr('organizer.applications.emptyState')
          : tr('organizer.applications.countSummary', { n: apps.length, exchangeName })}
      </p>

      <div className="flex flex-wrap items-center gap-4 bg-card border rounded-[11px] px-4 py-2.5 mb-5">
        <button
          type="button"
          disabled={savingState}
          onClick={toggleOpen}
          className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${
            open ? 'bg-tint text-tint-text' : 'bg-subtle text-muted-foreground'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-tint-text' : 'bg-muted-foreground'}`} />
          {open ? tr('organizer.applications.stateOpen') : tr('organizer.applications.stateClosed')}
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span id="candidatures-deadline-label">{tr('organizer.applications.deadlineLabel')}</span>
          <input
            aria-labelledby="candidatures-deadline-label"
            type="date"
            value={deadline}
            disabled={savingState}
            onChange={(e) => changeDeadline(e.target.value)}
            className="h-[34px] rounded-[8px] border px-2.5 text-[13px]"
          />
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          <label htmlFor="candidatures-invite-link" className="text-[12.5px] text-muted-foreground whitespace-nowrap">
            {tr('organizer.applications.linkLabel')}
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
            {copied ? tr('organizer.applications.copiedCta') : tr('organizer.applications.copyCta')}
          </button>
          <Button type="button" variant="outline" onClick={() => setInviteOpen(true)} className="h-[34px] whitespace-nowrap text-[12.5px]">
            {tr('organizer.applications.invite.openCta')}
          </Button>
        </div>
      </div>

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
              <span className="text-sm text-navy">{frShortDate(a.submitted_at)}</span>
              <StatusPill pill={applicantStatusPill(a.status, tr)} />
              <span className="text-muted-foreground">›</span>
            </div>
          ))
        )}
      </div>

      <InviteByEmailDialog exchangeId={exchangeId} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
