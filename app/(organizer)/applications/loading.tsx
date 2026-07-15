'use client'
import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'

export default function ApplicationsLoading() {
  const c = useTranslations('common')
  return (
    <div role="status" aria-label={c('states.loadingLabel')} className="max-w-[1180px]">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-4 h-4 w-96 max-w-full" />
      <Skeleton className="mb-5 h-12 rounded-[11px]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-[9px]" />
        ))}
      </div>
    </div>
  )
}
