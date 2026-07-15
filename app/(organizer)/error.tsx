'use client'
import { useTranslations } from 'next-intl'
import { ErrorState } from '@/components/ErrorState'

export default function OrganizerError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('organizer')
  return <ErrorState error={error} reset={reset} home={{ href: '/dashboard', label: t('dashboard.title') }} />
}
