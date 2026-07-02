'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppRow, DossierRollup, Pill } from '@/lib/dashboard/rollup'
import { timelineFor, frShortDate, p1StatusPill } from '@/lib/dashboard/rollup'
import { applicantName } from '@/lib/application-form'
import { acceptApplication, rejectApplication } from '@/actions/applications'
import { StatusPill } from '@/components/dashboard/StatusPill'

export type DrawerSubject =
  | { kind: 'application'; app: AppRow }
  | { kind: 'student'; rollup: DossierRollup; items: { label: string; group: 'form' | 'doc'; pill: Pill }[] }

const DOT_CLASSES: Record<Pill['kind'], string> = {
  ok: 'bg-success-text',
  warn: 'bg-warn-text',
  bad: 'bg-danger-text',
  neutral: 'bg-placeholder',
  info: 'bg-brand',
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

export function StudentDrawer({ subject, onClose }: { subject: DrawerSubject | null; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [sendEmail, setSendEmail] = useState(true)

  useEffect(() => {
    // Reset per-subject transient UI state whenever a new subject is shown.
    setBusy(false)
    setError(null)
    setRejecting(false)
    setNote('')
    setSendEmail(true)
  }, [subject])

  useEffect(() => {
    if (!subject) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [subject, onClose])

  if (!subject) return null
  const drawerSubject = subject

  const name = drawerSubject.kind === 'application' ? applicantName(drawerSubject.app.data) || drawerSubject.app.email : drawerSubject.rollup.name
  const statusPill = drawerSubject.kind === 'application' ? p1StatusPill(drawerSubject.app.status) : drawerSubject.rollup.overall

  async function handleAccept() {
    if (drawerSubject.kind !== 'application') return
    setBusy(true)
    setError(null)
    try {
      await acceptApplication(drawerSubject.app.id)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  async function handleConfirmReject() {
    if (drawerSubject.kind !== 'application') return
    setBusy(true)
    setError(null)
    try {
      await rejectApplication(drawerSubject.app.id, note, sendEmail)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-rail/30"
      />
      <div className="absolute right-0 top-0 h-full w-[420px] bg-card shadow-modal p-7 overflow-auto animate-[drwIn_.25s_ease-out]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-tint text-tint-text font-mono text-[13px] font-semibold">
            {initials(name)}
          </span>
          <span className="font-display text-lg font-bold text-navy">{name}</span>
          <StatusPill pill={statusPill} />
          <button type="button" onClick={onClose} className="ml-auto text-placeholder hover:text-navy">
            ✕
          </button>
        </div>

        {subject.kind === 'application' && (
          <>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary mt-6 mb-3">
              Parcours
            </div>
            <div>
              {timelineFor(subject.app).map((entry, i, arr) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`h-[10px] w-[10px] rounded-full mt-1 ${DOT_CLASSES[entry.dot]}`} />
                    {i < arr.length - 1 && <span className="w-[2px] flex-1 bg-border" />}
                  </div>
                  <div className="pb-4">
                    <div className="text-sm font-medium text-navy">{entry.title}</div>
                    {entry.sub && <div className="text-[12.5px] text-muted-foreground">{entry.sub}</div>}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-danger-text mt-3">{error}</p>}

            {subject.app.status === 'submitted' && (
              <div className="flex gap-2.5 mt-7">
                {!rejecting ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleAccept}
                      className="flex-1 rounded-[9px] bg-brand text-white py-[11px] text-[13px] font-semibold hover:bg-brand-hover disabled:opacity-60"
                    >
                      {busy ? 'Envoi…' : 'Accepter & inviter'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                      className="flex-1 rounded-[9px] border border-frame-dashed bg-card text-navy disabled:opacity-60"
                    >
                      {busy ? 'Envoi…' : 'Refuser'}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2.5 w-full">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note pour l'élève (facultatif)"
                      className="w-full h-[60px] rounded-[9px] border p-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                      />
                      Prévenir par e-mail
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleConfirmReject}
                      className="rounded-[9px] bg-danger text-danger-text py-[11px] text-[13px] font-semibold disabled:opacity-60"
                    >
                      {busy ? 'Envoi…' : 'Confirmer le refus'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {subject.kind === 'student' && (
          <>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary mt-6 mb-3">
              Formulaires &amp; documents{subject.rollup.due ? ` · échéance ${frShortDate(subject.rollup.due)}` : ''}
            </div>
            <div>
              {subject.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm text-navy">{item.label}</span>
                  <StatusPill pill={item.pill} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-start mt-4 text-[12.5px] text-muted-foreground">
              <span className="text-brand">&#8635;</span>
              <span>Relances automatiques quotidiennes en période d&apos;échéance.</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
