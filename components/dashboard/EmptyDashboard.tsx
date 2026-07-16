'use client'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/Logo'
import { useShellUi } from '@/components/shell/ShellUiContext'
import { useTranslations } from 'next-intl'

export function EmptyDashboard() {
  const { openNewExchange } = useShellUi()
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  return (
    <div>
      <h3 className="mb-6 font-display text-[30px] font-bold tracking-tight text-navy">
        {t('dashboard.title')}
      </h3>
      <div className="flex flex-col items-center gap-4 rounded-[22px] border-2 border-dashed border-frame bg-[rgba(255,255,255,.5)] px-10 py-16 text-center">
        <Logo href={null} />
        <h4 className="font-display text-[24px] font-bold text-navy">
          {t('dashboard.emptyHeading')}
        </h4>
        <p className="max-w-[480px] text-[17px] leading-relaxed text-muted-foreground">
          {t('dashboard.emptyBody')}
        </p>
        <Button className="mt-2" onClick={openNewExchange}>
          {c('actions.newExchange')}
        </Button>
      </div>
    </div>
  )
}
