'use client'
import { useState } from 'react'
import { archiveExchange, restoreExchange, type ProgramInfo } from '@/actions/settings'
import { frShortDate, p } from '@/lib/dashboard/rollup'

export function ProgramCard({ program }: { program: ProgramInfo }) {
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn() }
    catch (err) { setError(err instanceof Error ? err.message : 'Une erreur est survenue.') }
    setBusy(false)
  }

  const stats = [
    `${program.enrolled} élève${p(program.enrolled)} confirmé${p(program.enrolled)}`,
    `${program.applications} candidature${p(program.applications)}`,
    ...(program.earliestDeadline ? [`échéance dossiers ${frShortDate(program.earliestDeadline)}`] : []),
  ].join(' · ')

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-4 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Programme</div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-subtle px-[18px] py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-display text-[15px] font-semibold text-foreground">{program.name} · {program.year}</span>
            {program.archived ? (
              <span className="rounded-pill bg-subtle px-2.5 py-[3px] text-[11px] font-semibold text-muted-foreground">Archivé</span>
            ) : (
              <span className="rounded-pill bg-tint px-2.5 py-[3px] text-[11px] font-semibold text-tint-text">
                {program.phase === 1 ? 'Phase 1 · Recrutement' : 'Phase 2 · Préparation'}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] text-tertiary">{stats}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-danger bg-danger/40 px-[18px] py-4">
        <div>
          <div className="text-[13.5px] font-semibold text-danger-text">Archiver le programme</div>
          <div className="mt-0.5 text-[12.5px] leading-normal text-danger-text/70">
            Le programme passe en lecture seule. Les dossiers restent consultables, plus aucune modification possible.
          </div>
        </div>
        {program.archived ? (
          <button
            type="button" disabled={busy} onClick={() => run(() => restoreExchange(program.id))}
            className="flex-none rounded-[9px] border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow disabled:opacity-50"
          >
            Restaurer
          </button>
        ) : (
          <button
            type="button" onClick={() => setModal(true)}
            className="flex-none rounded-[9px] border border-danger bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
          >
            Archiver le programme…
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rail/50" role="dialog" aria-modal="true">
          <div className="w-[460px] max-w-[calc(100vw-32px)] rounded-[18px] bg-card p-[30px] shadow-modal">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-danger font-display text-xl font-bold text-danger-text">!</div>
            <div className="mb-2 font-display text-[19px] font-bold tracking-[-.01em] text-foreground">Archiver ce programme ?</div>
            <p className="mb-[22px] text-[13.5px] leading-[1.55] text-muted-foreground">
              « {program.name} · {program.year} » passera en lecture seule : élèves, candidatures et documents resteront
              consultables, mais plus aucune modification ne sera possible. Vous pourrez le restaurer à tout moment.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button" onClick={() => setModal(false)}
                className="rounded-[9px] border px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-hoverrow"
              >
                Annuler
              </button>
              <button
                type="button" disabled={busy}
                onClick={() => { setModal(false); void run(() => archiveExchange(program.id)) }}
                className="rounded-[9px] bg-danger-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Archiver le programme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
