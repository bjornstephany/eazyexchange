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
  open,
  onOpenChange,
}: {
  groups: NotificationGroup[]
  badge: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const ref = useDismissable<HTMLDivElement>(open, () => onOpenChange(false))

  // Which badge value the organizer has already looked at. Comparing values
  // rather than holding a boolean means a NEW badge from the next navigation
  // shows again without an effect to reset it.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const shown = dismissedAt === badge ? 0 : badge

  useEffect(() => {
    if (!open) return
    setDismissedAt(badge)
    // Fire-and-forget: a failed stamp only means the badge reappears on the
    // next navigation, which is not worth surfacing to the organizer.
    void markNotificationsSeen()
    // Deliberately keyed on `open` alone — re-stamping because `badge` changed
    // while the panel is open would be a second pointless write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[300px] overflow-y-auto rounded-[11px] border bg-card p-1 shadow-float"
        >
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
                    role="menuitem"
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
                      {t(KIND_LABEL_KEY[item.kind] as never, { n: item.total })}
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
