'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { markNotificationsSeen, setActiveExchange } from '@/actions/session'
import type { NotificationGroup, NotificationKind } from '@/lib/shell/notifications'
import { IconBell } from './RailIcons'
import { useDismissable } from './useDismissable'

// The row labels are the dashboard's action-card titles, reused verbatim so the
// bell and the dashboard cannot say the same words about different numbers.
const KIND_LABEL_KEY: Record<NotificationKind, string> = {
  applications_to_review: 'dashboard.actionCards.toReviewTitle',
  submissions_to_review: 'dashboard.actionCards.reviewTitle',
  late: 'dashboard.actionCards.lateTitle',
}

// The dashboard's filter is component state, not a URL parameter, so the two
// dossier kinds land there unfiltered rather than dragging a ?filter= param
// into an organizer page. See the spec's non-goals.
const KIND_HREF: Record<NotificationKind, string> = {
  applications_to_review: '/applications?tab=toreview',
  submissions_to_review: '/dashboard',
  late: '/dashboard',
}

export function NotificationsMenu({
  groups,
  badge,
  newestAt,
  open,
  onOpenChange,
}: {
  groups: NotificationGroup[]
  badge: number
  /** Newest item time across the rows, epoch ms (`newestNotificationAt`). */
  newestAt: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const ref = useDismissable<HTMLDivElement>(open, () => onOpenChange(false))

  // How new the newest item was the last time the organizer looked, epoch ms.
  //
  // A TIMESTAMP, never the badge count. Counting was the original design and it
  // hid real work: a stamp drops the count to 0 and it climbs back through the
  // small integers, so `dismissed === badge` silenced the badge whenever the
  // count returned to a value already seen — and n = 1 is the value this
  // counter takes most often.
  const [seenAt, setSeenAt] = useState<number | null>(null)
  // Fail OPEN: hide the badge only when we positively know the newest item is
  // no newer than what was dismissed. A missing timestamp shows the badge.
  const shown = seenAt !== null && newestAt !== null && newestAt <= seenAt ? 0 : badge

  useEffect(() => {
    if (!open) return
    // The counts behind this badge are computed server-side in the ORGANIZER
    // LAYOUT, and nothing in the organizer's own session revalidates it: App
    // Router does not re-render a shared layout on sibling navigation, and
    // next.config.mjs sets experimental.staleTimes.dynamic = 180. The work
    // itself arrives from other actors (a student submits, an applicant
    // applies). So re-read on open — the moment the organizer actually looks.
    // Between two openings the badge still lags; that is accepted.
    router.refresh()
    // Only stamp when there is something to mark seen. Opening a zero badge
    // used to fire a write with nothing to record.
    if (badge > 0) {
      // Fire-and-forget: a failed stamp only means the badge reappears on the
      // next full load, which is not worth surfacing to the organizer.
      void markNotificationsSeen()
    }
    // Deliberately keyed on `open` alone — re-stamping because `badge` changed
    // while the panel is open would be a second pointless write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Dismissal is keyed on `newestAt` too, not just the open transition: the
  // refresh above can land items mid-view, and anything visible in an open
  // panel has been looked at. `max` so a stale re-render cannot un-dismiss.
  useEffect(() => {
    if (!open || newestAt === null) return
    setSeenAt((prev) => (prev === null || newestAt > prev ? newestAt : prev))
  }, [open, newestAt])

  async function handleRow(exchangeId: string, kind: NotificationKind) {
    onOpenChange(false)
    await setActiveExchange(exchangeId)
    router.push(KIND_HREF[kind])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={
          shown > 0
            ? `${t('shell.notifications.trigger')} — ${t('shell.notifications.badgeLabel', { n: shown })}`
            : t('shell.notifications.trigger')
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border text-muted-foreground hover:bg-hoverrow hover:text-foreground"
      >
        <IconBell />
        {shown > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-pill bg-brand px-1 font-mono text-[10px] font-semibold text-white"
          >
            {shown > 9 ? '9+' : shown}
          </span>
        )}
      </button>

      {open && (
        // No role="menu": its children would have to be menuitems (these are a
        // heading and per-exchange labels) and it implies arrow-key roving
        // tabindex, which this panel does not implement. The account menu in
        // OrganizerShell has the same shape without the roles.
        <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[300px] overflow-y-auto rounded-[11px] border bg-card p-1 shadow-float">
          <p className="px-3 pb-1 pt-2 font-display text-[13px] font-semibold text-navy">
            {t('shell.notifications.title')}
          </p>

          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              {t('shell.notifications.empty')}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.exchangeId} className="pb-1.5">
                <p className="truncate px-3 pb-0.5 pt-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.exchangeName}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => handleRow(group.exchangeId, item.kind)}
                    className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[13px] hover:bg-hoverrow"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-[7px] w-[7px] flex-none rounded-full',
                        item.isNew ? 'bg-brand' : 'bg-border',
                      )}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        item.isNew ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {t(KIND_LABEL_KEY[item.kind] as Parameters<typeof t>[0], { n: item.total })}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
