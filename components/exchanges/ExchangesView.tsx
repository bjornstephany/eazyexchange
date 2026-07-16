'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useShellUi } from '@/components/shell/ShellUiContext'

export type ExchangeCardData = {
  id: string
  name: string
  year: number
  pct: number | null
  pctLabel: string
}

function ExchangeCard({ exchange }: { exchange: ExchangeCardData }) {
  const { id, name, year, pct, pctLabel } = exchange
  return (
    <Link
      href={`/exchanges/${id}`}
      className="bg-card border rounded-[14px] p-5 hover:bg-hoverrow-soft flex flex-col"
    >
      <div className="flex items-center gap-2.5">
        <span className="font-display text-base font-bold text-navy">{name}</span>
        <span className="rounded-pill bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {year}
        </span>
      </div>
      <div className="text-[13px] text-muted-foreground mt-1">{pctLabel}</div>
      {pct !== null && (
        <>
          <div className="h-[8px] rounded-pill bg-track mt-2.5">
            <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">{pct}%</div>
        </>
      )}
    </Link>
  )
}

const CREATE_BTN =
  'rounded-[9px] bg-brand text-white hover:bg-brand-hover px-4 h-[38px] flex items-center justify-center text-[13px] font-semibold'

export function ExchangesView({
  exchangesData,
  atCap,
}: {
  exchangesData: ExchangeCardData[]
  atCap: boolean
}) {
  const { openNewExchange } = useShellUi()
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">{t('exchanges.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('exchanges.subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('exchanges.listLabel')}
        </span>

        <div className="flex flex-col gap-3">
          {exchangesData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              {t('exchanges.emptyState')}
            </p>
          ) : (
            exchangesData.map((exchange) => <ExchangeCard key={exchange.id} exchange={exchange} />)
          )}
        </div>

        <div className="flex justify-start pt-1">
          {atCap ? (
            <Link href="/billing" className={CREATE_BTN}>
              {c('actions.newExchange')}
            </Link>
          ) : (
            <button type="button" onClick={openNewExchange} className={CREATE_BTN}>
              {c('actions.newExchange')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
