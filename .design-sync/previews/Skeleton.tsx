import { Skeleton } from 'eazyexchange'

export const Formes = () => (
  <div className="w-[320px] space-y-3">
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-10 w-full" />
  </div>
)

export const CarteEnChargement = () => (
  <div className="w-[380px] space-y-4 rounded-card border border-border bg-card p-6">
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-5/6" />
  </div>
)

export const LigneDeTableau = () => (
  <div className="w-[420px] space-y-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20 rounded-pill" />
      </div>
    ))}
  </div>
)
