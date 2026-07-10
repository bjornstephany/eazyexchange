import { Skeleton } from '@/components/ui/skeleton'

export default function ExchangesLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1040px]">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
        ))}
      </div>
    </div>
  )
}
