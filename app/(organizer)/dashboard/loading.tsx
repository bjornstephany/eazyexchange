'use client'
import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  const c = useTranslations('common')
  return (
    <div role="status" aria-label={c('states.loadingLabel')} className="max-w-[1180px]">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[14px]" />
    </div>
  )
}
