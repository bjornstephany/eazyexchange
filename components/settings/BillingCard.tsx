import Link from 'next/link'
import type { BillingOverview } from '@/actions/settings'

export function BillingCard({ billing }: { billing: BillingOverview }) {
  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-[18px] flex items-center justify-between gap-4">
        <div className="font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Facturation</div>
        <Link
          href="/billing"
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
        >
          Voir les forfaits
        </Link>
      </div>
      <div className="rounded-xl border border-subtle px-5 py-[18px]">
        <span className="rounded-pill bg-tint px-2.5 py-[3px] text-[11px] font-semibold text-tint-text">{billing.planLabel}</span>
        <div className="mt-1.5 flex items-baseline gap-[5px]">
          <span className="font-display text-[28px] font-bold leading-none tracking-[-.02em] text-foreground">{billing.price}</span>
          {billing.per && <span className="text-[13px] font-medium text-tertiary">{billing.per}</span>}
        </div>
        <div className="mb-3.5 mt-1 text-[13px] text-muted-foreground">{billing.desc}</div>
        <div className="mb-[5px] h-1.5 overflow-hidden rounded-pill bg-background">
          <div className="h-full rounded-pill bg-brand" style={{ width: `${billing.usagePct}%` }} />
        </div>
        <div className="font-mono text-[11px] font-medium text-tertiary">{billing.usageLabel}</div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-[13.5px] font-semibold text-foreground">Moyen de paiement</div>
          <div className="mt-0.5 text-[12.5px] text-tertiary">{billing.payment.note}</div>
        </div>
        <Link
          href={billing.payment.href}
          className="flex-none rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow"
        >
          {billing.payment.cta}
        </Link>
      </div>
    </div>
  )
}
