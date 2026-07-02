'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setExchangePhase } from '@/actions/exchanges'

const STEPS: { n: 1 | 2; title: string; kicker: string }[] = [
  { n: 1, title: 'Recrutement & sélection', kicker: 'Phase 1' },
  { n: 2, title: 'Préparation des dossiers', kicker: 'Phase 2' },
]

export function PhaseStepper({
  exchangeId,
  phase,
  progress,
}: {
  exchangeId: string
  phase: 1 | 2
  progress: { done: number; total: number; label: string }
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  async function handleClick(n: 1 | 2) {
    if (pending || n === phase) return
    setPending(true)
    setError(null)
    try {
      await setExchangePhase(exchangeId, n)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-card border rounded-[14px] p-[18px]">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        Progression de l&apos;échange
      </div>
      <div className="mt-3">
        <div className="h-[10px] rounded-pill bg-track">
          <div className="h-full bg-brand rounded-pill" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[12.5px] text-muted-foreground mt-1.5">{progress.label}</div>
      </div>
      <div className="mt-2">
        {STEPS.map((step) => {
          const isActive = step.n === phase
          const isDone = step.n === 1 && phase === 2
          const squareClass = isActive
            ? 'bg-brand text-white'
            : isDone
              ? 'bg-rail text-white'
              : 'bg-background text-tertiary'
          return (
            <button
              key={step.n}
              type="button"
              disabled={pending}
              onClick={() => handleClick(step.n)}
              className="flex w-full items-start gap-3 py-2.5 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] text-xs font-semibold ${squareClass}`}
              >
                {step.n}
              </span>
              <span>
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="block font-mono text-[10px] uppercase text-tertiary">{step.kicker}</span>
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="mt-1 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
