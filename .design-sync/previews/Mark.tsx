import { Mark } from 'eazyexchange'

/* The mark is a bare <svg> with no intrinsic size — it always needs sizing
 * classes from the caller. Aspect ratio is 26:19. */
export const Variantes = () => (
  <div className="flex items-center gap-6">
    <div className="rounded-card border border-border bg-card p-6">
      <Mark variant="light" className="h-10 w-[54px]" />
    </div>
    <div className="rounded-card bg-navy p-6">
      <Mark variant="dark" className="h-10 w-[54px]" />
    </div>
  </div>
)

export const Tailles = () => (
  <div className="flex items-end gap-6">
    <Mark className="h-4 w-[22px]" />
    <Mark className="h-6 w-[33px]" />
    <Mark className="h-10 w-[54px]" />
    <Mark className="h-16 w-[87px]" />
  </div>
)
