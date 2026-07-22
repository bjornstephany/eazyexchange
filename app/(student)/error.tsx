'use client'
import { useTranslations } from 'next-intl'
import { ErrorState } from '@/components/ErrorState'

export default function StudentError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('student')
  return <ErrorState error={error} reset={reset} home={{ href: '/my-forms', label: t('shell.tabs.dossier') }} />
}
