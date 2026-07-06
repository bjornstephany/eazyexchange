'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppRow } from '@/lib/dashboard/rollup'
import { p1StatusPill, frShortDate, p } from '@/lib/dashboard/rollup'
import { applicantName } from '@/lib/application-form'
import { acceptApplications, rejectApplications } from '@/actions/applications'
import { setApplicationOpen } from '@/actions/exchanges'
import { StatusPill } from '@/components/dashboard/StatusPill'

type TabKey = 'all' | 'toreview' | 'accepted' | 'rejected'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'toreview', label: 'À examiner' },
  { key: 'accepted', label: 'Acceptées' },
  { key: 'rejected', label: 'Refusées' },
]

const ACCEPTED_STATUSES = ['accepted', 'maybe', 'enrolling', 'enrolled']
const REJECTED_STATUSES = ['rejected', 'declined']

function matchesTab(a: AppRow, key: TabKey): boolean {
  switch (key) {
    case 'all': return true
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
  const [tab, setTab] = useState<TabKey>('all')
  const [open, setOpen] = useState(applicationOpen)
  const [deadline, setDeadline] = useState(applicationDeadline ?? '')
  const [savingState, setSavingState] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null)

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
    const allSelected = filtered.length > 0 && filtered.every(a => selected.includes(a.id))
    setSelected(allSelected ? [] : filtered.map(a => a.id))
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
      <h1 className="font-display text-2xl font-bold text-navy">Candidatures</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {apps.length === 0
          ? 'Aucune candidature reçue pour le moment — partagez le lien de candidature avec vos élèves.'
          : `${apps.length} candidature${p(apps.length)} reçue${p(apps.length)} pour ${exchangeName}.`}
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
          {open ? 'Ouvert' : 'Fermé'}
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span id="candidatures-deadline-label">Échéance</span>
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
            Lien de candidature
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
            {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 bg-subtle rounded-[11px] p-1 w-fit mb-4">
        {TABS.map(t => {
          const count = apps.filter(a => matchesTab(a, t.key)).length
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium flex gap-1.5 items-center ${
                active ? 'bg-card text-navy shadow-sm font-semibold' : 'text-muted-foreground'
              }`}
            >
              {t.label}
              <span className="font-mono text-[11px] text-tertiary">{count}</span>
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-2.5 bg-tint border border-tint-border rounded-[11px] px-4 py-2.5 mb-3">
          <span className="text-[13px] font-semibold text-tint-text">
            {selected.length} sélectionnée{p(selected.length)}
          </span>
          {!rejecting ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleAccept}
                className="bg-brand text-white rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              >
                {busy ? 'Envoi…' : 'Accepter & inviter'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className="bg-danger text-danger-text rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              >
                {busy ? 'Envoi…' : 'Refuser'}
              </button>
              <button
                type="button"
                onClick={resetBulkUi}
                className="text-muted-foreground rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold"
              >
                Annuler
              </button>
            </>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Note pour l'élève (facultatif)"
                className="flex-1 min-w-[180px] rounded-[8px] border p-2 text-sm"
              />
              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground whitespace-nowrap">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                Prévenir par e-mail
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmReject}
                className="bg-danger text-danger-text rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
              >
                {busy ? 'Envoi…' : 'Confirmer le refus'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(false)}
                className="text-muted-foreground rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      )}

      {bulkResult && bulkResult.failed > 0 && (
        <p className="text-sm text-danger-text mb-3">
          {bulkResult.succeeded} traitée{p(bulkResult.succeeded)} · {bulkResult.failed} en échec
        </p>
      )}

      <div className="bg-card border rounded-[14px] overflow-hidden">
        <div className="grid grid-cols-[28px_1.7fr_1fr_1fr_.9fr_1.1fr_22px] gap-2 items-center px-4 py-2 font-mono text-[10px] uppercase text-tertiary border-b">
          <input
            type="checkbox"
            checked={filtered.length > 0 && filtered.every(a => selected.includes(a.id))}
            onChange={toggleAll}
          />
          <span>Élève</span>
          <span>Niveau 26-27</span>
          <span>Langue mat.</span>
          <span>Reçue le</span>
          <span>Statut</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Aucune candidature dans cet onglet.</p>
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
                onChange={() => toggleOne(a.id)}
                onClick={e => e.stopPropagation()}
              />
              <span className="text-sm text-navy">{applicantName(a.data) || a.email}</span>
              <span className="text-sm text-muted-foreground">{a.data.grade ?? '—'}</span>
              <span className="text-sm text-muted-foreground">{a.data.native_language ?? '—'}</span>
              <span className="text-sm text-muted-foreground">{frShortDate(a.submitted_at)}</span>
              <StatusPill pill={p1StatusPill(a.status)} />
              <span className="text-muted-foreground">›</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
