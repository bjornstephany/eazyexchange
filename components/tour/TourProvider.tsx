'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TOUR_STEPS, visibleStepIndices } from '@/lib/tour/steps'
import { canAdvanceTourState } from '@/lib/tour/state'
import { setTourState } from '@/actions/tour'
import type { TourState } from '@/types/db'
import { TourSpotlight } from './TourSpotlight'

export type TourContextValue = {
  /** Latest known state, updated optimistically. */
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
  suppressAutoStart = false,
  children,
}: {
  initialState: TourState
  /**
   * True when the host page has nothing worth touring yet (an organizer with
   * zero exchanges: only nav-dashboard and nav-settings are on screen, so the
   * plan collapses to welcome + dashboard + settings + finish — coherent
   * enough to clear the `<= 2` guard below, but still a tour introducing tabs
   * that don't exist, on top of the empty dashboard's only CTA). Only the
   * AUTO-START effect reads this — `start()` itself is unaffected, so the
   * account menu's manual replay still works with no exchange.
   */
  suppressAutoStart?: boolean
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

  const next = useCallback(() => {
    setCursor((c) => (c + 1 < plan.length ? c + 1 : c))
  }, [plan.length])

  const prev = useCallback(() => {
    setCursor((c) => (c > 0 ? c - 1 : c))
  }, [])

  // The tour opens by itself for an organizer who has never seen it. There is
  // no invitation to accept any more, so this is the only way most of them will
  // ever meet it.
  //
  // An effect rather than render-time work: start() performs the tour's only DOM
  // read, which is meaningless before mount and unsafe during SSR. The ref keeps
  // it to a single firing — including under StrictMode's double-invoke, where
  // the ref object survives.
  //
  // It reads initialState, never tourState: tourState is what start() will move,
  // so watching it would arm this effect against its own result.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current) return
    if (initialState !== 'pending') return
    // Deliberately does NOT persist anything: tour_state stays 'pending', so
    // the first visit after the organizer creates their first exchange (this
    // prop flipping to false, on a rerender or a fresh mount) still gets the
    // real tour auto-offered. A manual replay from the account menu bypasses
    // this effect entirely and works regardless.
    if (suppressAutoStart) return
    // Belt-and-suspenders: a TourProvider mounted without the shell (a future
    // host page, or a test) where every anchored step filters out — welcome +
    // finish alone is worse than no tour at all. leave the state pending and
    // let a later visit spend it.
    if (visibleStepIndices(anchorPresent).length <= 2) return
    autoStarted.current = true
    start()
    // start() is re-created when the pathname changes, which is exactly when a
    // shell that had no tabs might have grown some. Re-running then is the point.
  }, [initialState, suppressAutoStart, start])

  // Drive the router from the step, after the cursor has committed. Every anchor
  // lives in the layout, so this only changes the scenery behind the dim layer —
  // the anchor itself never unmounts and there is nothing to wait for.
  const activeStep = plan.length > 0 ? TOUR_STEPS[plan[cursor]!] : null
  useEffect(() => {
    if (!activeStep?.route) return
    if (activeStep.route !== pathname) router.push(activeStep.route)
  }, [activeStep, pathname, router])

  const value = useMemo<TourContextValue>(() => ({
    tourState, plan, cursor, start, next, prev, skip, finish,
  }), [tourState, plan, cursor, start, next, prev, skip, finish])

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourSpotlight />
    </TourContext.Provider>
  )
}
