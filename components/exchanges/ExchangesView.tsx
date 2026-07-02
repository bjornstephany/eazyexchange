'use client'
import Link from 'next/link'
import { PLAN_KEYS } from '@/lib/billing/plans'
import { useShellUi } from '@/components/shell/ShellUiContext'

export type ExchangeCardData = {
  id: string
  name: string
  year: number
  phase: 1 | 2
  pct: number | null
  pctLabel: string
}

export type BillingBlock =
  | { kind: 'trial' }
  | { kind: 'active'; planLabel: string }
  | { kind: 'grace' }

const PLAN_LABEL: Record<(typeof PLAN_KEYS)[number], string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
}
const PLAN_PRICE: Record<(typeof PLAN_KEYS)[number], string> = {
  starter: '$299',
  growth: '$499',
  scale: '$599',
}
const PLAN_CAP_LABEL: Record<(typeof PLAN_KEYS)[number], string> = {
  starter: '2 échanges',
  growth: '6 échanges',
  scale: 'Échanges illimités',
}

const PHASE_LABEL: Record<1 | 2, string> = {
  1: 'Phase 1 · Recrutement',
  2: 'Phase 2 · Préparation',
}

const SECONDARY_CTA = 'rounded-[9px] border bg-card text-navy hover:bg-hint text-center py-2.5 text-[13px] font-semibold'
const PRIMARY_CTA = 'rounded-[9px] bg-brand text-white hover:bg-brand-hover text-center py-2.5 text-[13px] font-semibold'

function PlanTiles() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
      {PLAN_KEYS.map((key) => {
        const isGrowth = key === 'growth'
        return (
          <div
            key={key}
            className={`border rounded-[14px] p-5 flex flex-col gap-2 ${isGrowth ? 'border-2 border-brand bg-hoverrow relative' : ''}`}
          >
            {isGrowth && (
              <span className="absolute -top-2.5 left-4 rounded-pill bg-brand text-white px-2.5 py-0.5 font-mono text-[10px] font-semibold">
                POPULAIRE
              </span>
            )}
            <div className="font-display text-[17px] font-bold">{PLAN_LABEL[key]}</div>
            <div>
              <span className="text-navy font-semibold text-lg">{PLAN_PRICE[key]}</span>{' '}
              <span className="text-muted-foreground text-[12.5px]">/ an</span>
            </div>
            <div className="text-[13.5px] text-muted-foreground">{PLAN_CAP_LABEL[key]}</div>
            <Link href={`/billing/checkout?plan=${key}`} className={isGrowth ? PRIMARY_CTA : SECONDARY_CTA}>
              Choisir {PLAN_LABEL[key]}
            </Link>
          </div>
        )
      })}
    </div>
  )
}

function BillingSection({ billing }: { billing: BillingBlock }) {
  if (billing.kind === 'trial') {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="bg-card border rounded-[14px] p-5 flex gap-3 items-start">
          <div className="w-[34px] h-[34px] flex-none rounded-[9px] bg-tint text-tint-text flex items-center justify-center">
            ★
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-navy">
              Essai gratuit — votre premier échange est offert
            </div>
            <div className="text-[13px] text-muted-foreground">
              Choisissez un forfait pour créer d&apos;autres échanges et débloquer toutes vos sessions.
            </div>
          </div>
          <div className="font-mono text-[11px] text-tertiary whitespace-nowrap">Forfaits ci-dessous ↓</div>
        </div>
        <PlanTiles />
      </div>
    )
  }

  const isGrace = billing.kind === 'grace'
  const title = isGrace
    ? 'Paiement en échec — accès maintenu temporairement'
    : `Forfait ${billing.planLabel}`
  const linkLabel = isGrace ? 'Mettre à jour le paiement' : "Gérer l'abonnement"

  return (
    <div className="bg-card border rounded-[14px] p-5 flex items-center justify-between">
      <span className={`text-sm font-semibold ${isGrace ? 'text-danger-text' : 'text-navy'}`}>{title}</span>
      <Link href="/billing/portal" className="rounded-[9px] border px-4 py-2 text-[13px] font-semibold text-navy hover:bg-hint">
        {linkLabel}
      </Link>
    </div>
  )
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

export function ExchangesView({
  billing,
  exchangesData,
  atCap,
}: {
  billing: BillingBlock
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

      <BillingSection billing={billing} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
            Vos échanges
          </span>
          {atCap ? (
            <Link href="/billing" className="rounded-[9px] border bg-card text-navy hover:bg-hint px-4 h-[38px] flex items-center text-[13px] font-semibold">
              Choisir un forfait
            </Link>
          ) : (
            <button
              type="button"
              onClick={openNewExchange}
              className="rounded-[9px] bg-brand text-white px-4 h-[38px] text-[13px] font-semibold"
            >
              + Nouvel échange
            </button>
          )}
        </div>
        {atCap && (
          <div className="text-[12.5px] text-muted-foreground">
            Créez d&apos;autres échanges en choisissant un forfait.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {exchangesData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              Aucun échange pour l&apos;instant — créez le premier.
            </p>
          ) : (
            exchangesData.map((exchange) => <ExchangeCard key={exchange.id} exchange={exchange} />)
          )}
        </div>
      </div>
    </div>
  )
}
