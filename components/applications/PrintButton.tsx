'use client'
import { useTranslations } from 'next-intl'

export function PrintButton() {
  const t = useTranslations()
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm text-muted-foreground hover:text-navy"
    >
      {t('organizer.applications.printCta')}
    </button>
  )
}
