import { getTranslations } from 'next-intl/server'

// 2a system state: content-area loader (renders inside the resolved shell, so it
// fills its container via min-h, not the full viewport — approved deviation).
export async function LoadingState() {
  const c = await getTranslations('common')
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[30px] bg-background">
      <div className="relative h-[60px] w-20">
        <span className="ee-mark-l absolute left-0 top-0 h-12 w-12 rounded-full bg-navy" />
        <span className="ee-mark-r absolute bottom-0 right-0 h-12 w-12 rounded-full bg-brand mix-blend-multiply" />
      </div>
      <span className="font-display text-[28px] font-bold text-navy">Eazyexchange</span>
      <div className="h-[5px] w-[220px] overflow-hidden rounded-pill bg-track">
        <div className="ee-indeterminate h-full w-20 rounded-pill bg-brand" />
      </div>
      <span className="font-mono text-[14px] text-placeholder">
        {c('states.loadingSpace')}
      </span>
    </div>
  )
}
