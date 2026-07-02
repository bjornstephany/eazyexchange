'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setActiveExchange } from '@/actions/session'
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
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const wrapperRef = useRef<HTMLDivElement>(null)

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
      await setActiveExchange(id)
      if (pathname === '/dashboard') router.refresh()
      else router.push('/dashboard')
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
          {exchanges.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => select(ex.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-sm hover:bg-hoverrow',
                ex.id === active.id && 'bg-subtle font-semibold'
              )}
            >
              <span>{ex.name}</span>
              <span className="text-muted-foreground">{ex.year}</span>
            </button>
          ))}
          <div className="my-1 border-t" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewExchange()
            }}
            className="w-full rounded-[9px] px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-hoverrow"
          >
            + Nouvel échange
          </button>
        </div>
      )}
    </div>
  )
}
