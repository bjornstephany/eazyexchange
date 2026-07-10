import { Skeleton } from '@/components/ui/skeleton'

export default function StudentsLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1180px]">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-[9px]" />
        ))}
      </div>
    </div>
  )
}
