'use client'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTour } from './TourProvider'

/**
 * The one-time, dismissible offer to take the tour.
 *
 * Shown only on /applications — where onboarding drops a new organizer — so the
 * offer appears once, in the one place it is contextual, instead of following
 * them around the app. Dismissing records 'dismissed' and never asks again;
 * the account menu keeps the tour reachable forever either way.
 */
export function TourInviteCard() {
  const { tourState, plan, start, dismissInvite } = useTour()
  const pathname = usePathname()
  const t = useTranslations('organizer.shell.tour.invite')

  if (tourState !== 'pending') return null
  if (plan.length > 0) return null // already running
  if (pathname !== '/applications') return null

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[13px] border border-brand/25 bg-brand-soft px-4 py-3.5">
      <div className="min-w-0">
        <p className="font-display text-[14px] font-semibold text-navy">{t('title')}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{t('body')}</p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button
          type="button"
          onClick={dismissInvite}
          className="flex h-[36px] items-center rounded-[8px] px-3 text-[12.5px] font-medium text-muted-foreground hover:bg-hoverrow hover:text-foreground"
        >
          {t('later')}
        </button>
        <button
          type="button"
          onClick={start}
          className="flex h-[36px] items-center rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
        >
          {t('start')}
        </button>
      </div>
    </div>
  )
}
