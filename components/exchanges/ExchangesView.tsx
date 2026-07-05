'use client'
import Link from 'next/link'
import { useShellUi } from '@/components/shell/ShellUiContext'

export type ExchangeCardData = {
  id: string
  name: string
  year: number
  phase: 1 | 2
  pct: number | null
  pctLabel: string
}

const PHASE_LABEL: Record<1 | 2, string> = {
  1: 'Phase 1 · Recrutement',
  2: 'Phase 2 · Préparation',
}

function ExchangeCard({ exchange }: { exchange: ExchangeCardData }) {
  const { id, name, year, phase, pct, pctLabel } = exchange
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
        <span className="rounded-pill bg-tint text-tint-text px-2.5 py-0.5 font-mono text-[11px]">
          {PHASE_LABEL[phase]}
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">Échanges</h1>
        <p className="text-sm text-muted-foreground">
          Suivez tous vos programmes d&apos;échange — passés, en cours et à venir.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          Vos échanges
        </span>

        <div className="flex flex-col gap-3">
          {exchangesData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              Aucun échange pour l&apos;instant — créez le premier.
            </p>
          ) : (
            exchangesData.map((exchange) => <ExchangeCard key={exchange.id} exchange={exchange} />)
          )}
        </div>

        <div className="flex justify-start pt-1">
          {atCap ? (
            <Link href="/billing" className={CREATE_BTN}>
              + Nouvel échange
            </Link>
          ) : (
            <button type="button" onClick={openNewExchange} className={CREATE_BTN}>
              + Nouvel échange
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
