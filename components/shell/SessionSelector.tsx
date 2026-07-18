'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setActiveExchange } from '@/actions/session'
import { getExchangeProgressSummaries } from '@/actions/exchanges'
import type { ExchangeProgressSummary } from '@/lib/dashboard/rollup'
import type { ExchangeOption } from './OrganizerShell'
import { cn } from '@/lib/utils'

export function SessionSelector({
  exchanges,
  active,
  onNewExchange,
}: {
  exchanges: ExchangeOption[]
  active: ExchangeOption
  onNewExchange: () => void
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [summaries, setSummaries] = useState<Record<string, ExchangeProgressSummary>>({})
  const summariesRequested = useRef(false)

  useEffect(() => {
    if (!open || summariesRequested.current) return
    summariesRequested.current = true
    // Lazy one-shot fetch on first open; cached for the mount lifetime.
    // Fail quiet — rows must render (and switch) without second lines.
    getExchangeProgressSummaries().then(setSummaries).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleOutside(e: Event) {
      if (wrapperRef.current && e.target instanceof Node && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  async function select(id: string) {
    setOpen(false)
    if (id !== active.id) {
      // setActiveExchange revalidates the whole tree; the action response
      // already re-renders the current page, so only navigate if needed.
      await setActiveExchange(id)
      if (pathname !== '/dashboard') router.push('/dashboard')
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="font-display text-base font-semibold text-navy">{active.name}</span>
        <span className="text-xs text-placeholder">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-[260px] rounded-[14px] border bg-card p-2 shadow-float">
          {exchanges.map((ex) => {
            const summary = summaries[ex.id]
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => select(ex.id)}
                className={cn(
                  'w-full rounded-[9px] px-3 py-2 text-left text-sm hover:bg-hoverrow',
                  ex.id === active.id && 'bg-subtle font-semibold'
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {ex.name}
                    {ex.archived && (
                      <span className="rounded-pill bg-subtle px-2 py-px text-[10px] font-semibold text-muted-foreground">{t('shell.archivedBadge')}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{ex.year}</span>
                </span>
                {summary && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {summary.kind === 'dossiers'
                      ? t('dashboard.progressDossiers', { done: summary.done, total: summary.total })
                      : t('dashboard.progressCandidatures', { done: summary.done, total: summary.total })}
                  </span>
                )}
              </button>
            )
          })}
          <div className="my-1 border-t" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewExchange()
            }}
            className="w-full rounded-[9px] px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-hoverrow"
          >
            {c('actions.newExchange')}
          </button>
        </div>
      )}
    </div>
  )
}
