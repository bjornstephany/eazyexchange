'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { TOUR_STEPS, type TourStepId } from '@/lib/tour/steps'
import { useTour } from './TourProvider'

// How far the lit ring sits outside the anchor.
const PAD = 5

type Box = { top: number; left: number; width: number; height: number }

/**
 * Tracks the anchor's viewport box. Returns null while there is no anchor, or
 * when the element has gone missing — in which case the caller degrades to the
 * unanchored, centered layout rather than pinning a bubble to nothing.
 */
function useAnchorBox(anchor: string | null): Box | null {
  const pathname = usePathname()
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    if (!anchor) {
      setBox(null)
      return
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
    if (!el) {
      setBox(null)
      return
    }
    const measure = () => {
      const r = el.getBoundingClientRect()
      setBox({
        top: r.top - PAD, left: r.left - PAD,
        width: r.width + PAD * 2, height: r.height + PAD * 2,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    // Capture phase: the sidebar and <main> scroll independently of the window.
    window.addEventListener('scroll', measure, true)
    // Collapsing the sidebar animates its width, which moves every anchor in it.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    const nav = el.closest('nav')
    if (nav) ro?.observe(nav)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      ro?.disconnect()
    }
    // pathname: the step that changed route may also have changed the layout
    // around the anchor, so re-measure once the new page is in.
  }, [anchor, pathname])

  return box
}

/** Keeps Tab inside the bubble. Radix does not trap focus when modal={false}. */
function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return
  const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )
  if (focusable.length === 0) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  }
}

function Bubble({
  stepId, position, total, onSkip, onPrev, onNext, isFirst, isLast,
}: {
  stepId: TourStepId
  position: number
  total: number
  onSkip: () => void
  onPrev: () => void
  onNext: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const t = useTranslations('organizer.shell.tour')
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = `tour-title-${stepId}`
  const bodyId = `tour-body-${stepId}`

  // Move focus to the bubble on every step so the tour is keyboard-navigable.
  useEffect(() => {
    cardRef.current?.focus()
  }, [stepId])

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      onKeyDown={trapTab}
      className="w-[320px] rounded-[13px] border bg-card p-4 shadow-float outline-none"
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('controls.progress', { current: position, total })}
      </p>
      <h2 id={titleId} className="mt-1.5 font-display text-[15px] font-semibold text-navy">
        {t(`steps.${stepId}.title`)}
      </h2>
      <p id={bodyId} className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {t(`steps.${stepId}.body`)}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t('controls.skip')}
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={onPrev}
              className="flex h-[34px] items-center rounded-[8px] border px-3 text-[12.5px] font-medium text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              {t('controls.prev')}
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="flex h-[34px] items-center rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
          >
            {isLast ? t('controls.finish') : t('controls.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TourSpotlight() {
  const { plan, cursor, next, prev, skip, finish } = useTour()
  const running = plan.length > 0
  const step = running ? TOUR_STEPS[plan[cursor]!]! : null
  const box = useAnchorBox(step?.anchor ?? null)

  if (!step) return null

  const isLast = cursor === plan.length - 1
  const shared = {
    stepId: step.id,
    position: cursor + 1,
    total: plan.length,
    onSkip: skip,
    onPrev: prev,
    onNext: isLast ? finish : next,
    isFirst: cursor === 0,
    isLast,
  }

  // The dim wash doubles as the click swallower: during the tour a stray click
  // on the app behind must not navigate. Sits under the lit ring and the bubble.
  // Deliberately inert rather than dismiss-on-outside-click — a mis-click should
  // not end the tour. Passer and Escape are the exits, and both are advertised.
  const swallow = (
    <div
      data-testid="tour-swallow"
      aria-hidden
      className={cn(
        'fixed inset-0 z-[60]',
        // Without an anchor there is no ring to cast the wash, so this layer
        // carries it instead.
        box ? 'bg-transparent' : 'bg-navy/55',
      )}
    />
  )

  // No anchor (welcome / finish), or the anchor vanished: centered card.
  if (!box) {
    return (
      <>
        {swallow}
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center p-4">
          <div className="pointer-events-auto">
            <Bubble {...shared} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {swallow}
      <Popover.Root open modal={false}>
        <Popover.Anchor asChild>
          {/* One element is both the spotlight and the popover anchor, so there
              is no invisible duplicate to keep in sync. The giant spread casts
              the dim wash over everything except this hole. */}
          <div
            data-testid="tour-ring"
            className="pointer-events-none fixed z-[70] rounded-[12px] ring-2 ring-brand motion-safe:transition-all motion-safe:duration-200"
            style={{
              top: box.top, left: box.left, width: box.width, height: box.height,
              boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.55)',
            }}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="right"
            align="start"
            sideOffset={14}
            collisionPadding={16}
            className="z-[80]"
            // Radix labels its content role="dialog"; the Bubble inside is the
            // real dialog (it carries the labelling and the focus), so this
            // wrapper must not claim the role a second time.
            role="presentation"
            // Ours is the only dismissal path: Passer, Terminer or Escape.
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              e.preventDefault()
              skip()
            }}
            // Bubble handles its own focus, per step.
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Bubble {...shared} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
