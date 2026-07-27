'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TOUR_STEPS, visibleStepIndices } from '@/lib/tour/steps'
import { canAdvanceTourState } from '@/lib/tour/state'
import { setTourState } from '@/actions/tour'
import type { TourState } from '@/types/db'
import { TourSpotlight } from './TourSpotlight'

export type TourContextValue = {
  /** Latest known state, updated optimistically — drives the invitation card. */
  tourState: TourState
  /** Indices into TOUR_STEPS, resolved when the tour started. Empty = idle. */
  plan: number[]
  /** Position within `plan`. */
  cursor: number
  start: () => void
  next: () => void
  prev: () => void
  /** Passer / Escape — closes and records 'dismissed'. */
  skip: () => void
  /** Terminer on the last step — closes and records 'completed'. */
  finish: () => void
  /** « Plus tard » on the invitation, without ever opening the tour. */
  dismissInvite: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside TourProvider')
  return ctx
}

function anchorPresent(anchor: string) {
  return document.querySelector(`[data-tour="${anchor}"]`) !== null
}

export function TourProvider({
  initialState,
  children,
}: {
  initialState: TourState
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [tourState, setLocalState] = useState<TourState>(initialState)
  const [plan, setPlan] = useState<number[]>([])
  const [cursor, setCursor] = useState(0)
  // Where the organizer was when they opened the tour, so ending it puts them
  // back there instead of abandoning them on /settings.
  const returnTo = useRef<string>(pathname)

  // Optimistic locally, persisted in the background. The action refuses
  // downgrades server-side too, so a stale client cannot un-complete anything.
  const persist = useCallback((next: TourState) => {
    setLocalState((current) => (canAdvanceTourState(current, next) ? next : current))
    void setTourState(next)
  }, [])

  const close = useCallback((next: TourState) => {
    setPlan([])
    setCursor(0)
    if (returnTo.current !== pathname) router.push(returnTo.current)
    persist(next)
  }, [pathname, router, persist])

  const start = useCallback(() => {
    // The tour's only DOM read, in a click handler: every later render is pure.
    const next = visibleStepIndices(anchorPresent)
    returnTo.current = pathname
    setCursor(0)
    setPlan(next)
  }, [pathname])

  const finish = useCallback(() => close('completed'), [close])
  const skip = useCallback(() => close('dismissed'), [close])
  const dismissInvite = useCallback(() => persist('dismissed'), [persist])

  const next = useCallback(() => {
    setCursor((c) => (c + 1 < plan.length ? c + 1 : c))
  }, [plan.length])

  const prev = useCallback(() => {
    setCursor((c) => (c > 0 ? c - 1 : c))
  }, [])

  // Drive the router from the step, after the cursor has committed. Every anchor
  // lives in the layout, so this only changes the scenery behind the dim layer —
  // the anchor itself never unmounts and there is nothing to wait for.
  const activeStep = plan.length > 0 ? TOUR_STEPS[plan[cursor]!] : null
  useEffect(() => {
    if (!activeStep?.route) return
    if (activeStep.route !== pathname) router.push(activeStep.route)
  }, [activeStep, pathname, router])

  const value = useMemo<TourContextValue>(() => ({
    tourState, plan, cursor, start, next, prev, skip, finish, dismissInvite,
  }), [tourState, plan, cursor, start, next, prev, skip, finish, dismissInvite])

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourSpotlight />
    </TourContext.Provider>
  )
}
