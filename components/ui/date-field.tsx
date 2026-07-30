'use client'
import { useId, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/config'
import { longDate, monthLabel, weekdayLabels } from '@/lib/dates'
import { monthGrid, parseISODate, shiftMonth, todayISO } from '@/lib/calendar'

// A calendar the app owns, replacing <input type="date">.
//
// The native picker is browser chrome: we cannot observe it, cannot test it,
// and cannot stop it closing itself — which it did on every month change,
// turning "pick a date nine months out" into nine re-opens. Here the month
// arrows move a piece of local state and nothing else, so there is no longer
// anything that *can* close the calendar while the organizer is looking for a
// month.
//
// The value is a 'YYYY-MM-DD' string in and out, never a Date. onChange is only
// ever called with a real day, so a caller cannot receive '' the way a cleared
// native input used to emit it.
export function DateField({
  value, onChange, disabled, id, ariaLabelledBy, className,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
  ariaLabelledBy?: string
  className?: string
}) {
  const locale = useLocale() as Locale
  const t = useTranslations('common.dateField')
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => viewFor(value))
  const textId = useId()

  // The month to show: the one the value is in, or the current one when empty.
  function viewFor(v: string) {
    const parsed = parseISODate(v)
    if (parsed) return { year: parsed.year, month: parsed.month }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }

  // Re-seed on every open rather than once on mount: an organizer who pages to
  // 2027, closes without picking, and re-opens expects to be back at their
  // deadline, not wherever they wandered off to.
  function handleOpenChange(next: boolean) {
    if (next) setView(viewFor(value))
    setOpen(next)
  }

  const weeks = monthGrid(locale, view.year, view.month)
  const today = todayISO()

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          // The button's own text is suppressed from the accessible name
          // whenever a caller pairs it via <Label htmlFor> or an explicit
          // ariaLabelledBy (both a labelable <button>'s own label wins over
          // subtree content) — so without this, a screen-reader user hears
          // the label and never the selected date, which the <input
          // type="date"> this replaced always announced. Appending textId
          // keeps the external label (when there is one) AND the date in the
          // computed name.
          aria-labelledby={[ariaLabelledBy, textId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-left text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span id={textId}>
            {parseISODate(value) ? longDate(value, locale) : t('placeholder')}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // Radix stamps role="dialog" on this element; without aria-label it
          // is an unnamed dialog (an axe violation on its own), and a screen
          // reader has no way to tell which month it landed on after paging.
          aria-label={monthLabel(locale, view.year, view.month)}
          // Above the dialog this field is sometimes used inside (z-50), below
          // the guided tour's dim layer (z-60 and up) — a tour in progress
          // swallows clicks anyway, and nothing should float over its wash.
          className="z-[55] w-[272px] rounded-[13px] border bg-card p-3 shadow-float"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={t('prevMonth')}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              ‹
            </button>
            <span className="font-display text-[13.5px] font-semibold capitalize text-navy">
              {monthLabel(locale, view.year, view.month)}
            </span>
            <button
              type="button"
              aria-label={t('nextMonth')}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {weekdayLabels(locale).map((label) => (
              <span
                key={label}
                aria-hidden
                className="flex h-7 items-center justify-center font-mono text-[10.5px] uppercase tracking-wide text-tertiary"
              >
                {label.slice(0, 2)}
              </span>
            ))}
            {weeks.flat().map((iso, i) =>
              iso === null ? (
                <span key={`blank-${i}`} className="h-8" />
              ) : (
                <button
                  key={iso}
                  type="button"
                  aria-label={longDate(iso, locale)}
                  // aria-pressed conveys selected-vs-unselected here — the
                  // toggle-button pattern rather than the APG date-picker
                  // role="grid"/gridcell + aria-selected pattern, which needs
                  // a grid/gridcell ancestry this plain button doesn't have
                  // (asserting aria-selected on a bare button trades one ARIA
                  // violation for another — jsx-a11y's
                  // role-supports-aria-props catches it). Deferred alongside
                  // the keyboard roving-focus item in BACKLOG.md.
                  aria-pressed={iso === value}
                  // aria-current="date" is the ARIA state for TODAY's date on
                  // the calendar — distinct from selection, and not mutually
                  // exclusive with it: a cell can be both today and selected.
                  aria-current={iso === today ? 'date' : undefined}
                  onClick={() => {
                    onChange(iso)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-[8px] text-[13px] tabular-nums',
                    iso === value
                      ? 'bg-brand font-semibold text-white'
                      : 'text-foreground hover:bg-hoverrow',
                    iso === today && iso !== value && 'font-semibold text-brand',
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              ),
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
