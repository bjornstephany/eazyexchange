'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { remindStudent } from '@/actions/students'
import { reminderNote, type StudentVM } from '@/lib/students/directory'

export function StudentDetail({ vm, exchangeId }: { vm: StudentVM; exchangeId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRemind() {
    setBusy(true); setFlash(null); setError(null)
    try {
      const res = await remindStudent(exchangeId, vm.id)
      setFlash(res.reminded ? 'Relance envoyée.' : 'Déjà relancé récemment — réessayez plus tard.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  const complete = vm.statusKey === 'complet'

  return (
    <div>
      {/* header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-[15px]">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ background: vm.avatarBg }}
          >
            {vm.initials}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-[22px] font-bold tracking-[-.02em] text-foreground">{vm.name}</span>
              <StatusPill pill={vm.overall} />
            </div>
            {vm.sub && <div className="mt-1 text-[13px] text-tertiary">{vm.sub}</div>}
          </div>
        </div>
        <div className="flex flex-none gap-[9px]">
          <button
            type="button" onClick={handleRemind} disabled={busy || complete}
            className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Relancer'}
          </button>
          {vm.applicationId && (
            <Link
              href={`/applications?id=${vm.applicationId}`}
              className="rounded-[9px] border bg-card px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-hoverrow"
            >
              Candidature
            </Link>
          )}
        </div>
      </div>
      {(flash || error) && (
        <p className={`mb-4 text-[12.5px] font-medium ${error ? 'text-danger-text' : 'text-success-text'}`}>
          {error ?? flash}
        </p>
      )}

      <div className="grid grid-cols-1 gap-[30px] lg:grid-cols-[1fr_1.1fr]">
        {/* identity + parents */}
        <div>
          <div className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Identité</div>
          {!vm.applicationId && (
            <p className="mb-2 text-[12.5px] text-tertiary">Candidature introuvable pour cet élève.</p>
          )}
          <div className="mb-[22px]">
            {vm.identity.map(f => (
              <div key={f.l} className="flex justify-between gap-4 border-b border-subtle py-[8.5px]">
                <span className="text-[13px] text-tertiary">{f.l}</span>
                <span className="text-right text-[13px] font-medium text-foreground">{f.v}</span>
              </div>
            ))}
          </div>
          {vm.parents.length > 0 && (
            <>
              <div className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Parents</div>
              <div className="flex flex-col gap-2.5">
                {vm.parents.map(par => (
                  <div key={par.role} className="flex justify-between gap-3 rounded-[11px] border border-subtle px-[15px] py-[13px]">
                    <div>
                      <div className="mb-1 font-mono text-[10.5px] font-medium text-placeholder">{par.role}</div>
                      <div className="text-[13.5px] font-semibold text-foreground">{par.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12.5px] text-muted-foreground">{par.tel}</div>
                      <div className="mt-0.5 text-xs text-tertiary">{par.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* dossier */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">Dossier</div>
            {vm.dueLabel && <span className="font-mono text-[11px] font-medium text-tertiary">{vm.dueLabel}</span>}
          </div>
          <div className="mb-1 h-1.5 overflow-hidden rounded-pill bg-background">
            <BarFill kind={vm.overall.kind} pct={vm.pct} />
          </div>
          <div className="mb-[11px] font-mono text-[11px] font-medium text-tertiary">
            {vm.provided}/{vm.total} pièces fournies
          </div>
          <div className="overflow-hidden rounded-xl border border-subtle">
            {vm.checklist.map(item => {
              const inner = (
                <>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground">{item.label}</span>
                    <span className="mt-px block font-mono text-[10px] text-placeholder">{item.group}</span>
                  </span>
                  <StatusPill pill={item.pill} />
                </>
              )
              const cls = 'flex items-center justify-between gap-2.5 border-b border-subtle px-3.5 py-[11px] last:border-b-0'
              return item.reviewable ? (
                <Link key={item.assignmentId} href={`/exchanges/${exchangeId}/submissions/${item.assignmentId}`}
                  className={`${cls} hover:bg-hoverrow`}>
                  {inner}
                </Link>
              ) : (
                <div key={item.assignmentId} className={cls}>{inner}</div>
              )
            })}
            {vm.checklist.length === 0 && (
              <p className="px-3.5 py-6 text-center text-[12.5px] text-tertiary">Aucune pièce demandée pour l’instant.</p>
            )}
          </div>
          <div className="mt-3.5 flex items-center gap-[9px] rounded-[11px] bg-hoverrow px-[15px] py-[13px]">
            <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-brand text-[13px] text-white">↻</span>
            <span className="text-[12.5px] leading-[1.45] text-muted-foreground">{reminderNote(vm)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const BAR: Record<string, string> = {
  ok: 'bg-success-text', info: 'bg-tint-text', warn: 'bg-warn-text', bad: 'bg-danger-text', neutral: 'bg-placeholder',
}
function BarFill({ kind, pct }: { kind: string; pct: number }) {
  return <div className={`h-full rounded-pill ${BAR[kind] ?? BAR.neutral}`} style={{ width: `${pct}%` }} />
}
