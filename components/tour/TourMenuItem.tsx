'use client'
import { useTranslations } from 'next-intl'
import { useTour } from './TourProvider'

/**
 * « Visite guidée » in the account menu — the permanent way back into the tour,
 * whatever the organizer answered the first time.
 *
 * A separate component rather than inline JSX because OrganizerShell RENDERS
 * TourProvider, and a component cannot consume a context it creates itself.
 */
export function TourMenuItem({ onStarted }: { onStarted: () => void }) {
  const { start } = useTour()
  const t = useTranslations('organizer.shell.tour')

  return (
    <button
      type="button"
      onClick={() => {
        onStarted()
        start()
      }}
      className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
    >
      {t('menuItem')}
    </button>
  )
}
