'use client'
import { ErrorState } from '@/components/ErrorState'

export default function OrganizerError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState error={error} reset={reset} home={{ href: '/dashboard', label: 'Tableau de bord' }} />
}
