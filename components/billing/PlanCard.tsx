import type { HTMLAttributes, ReactNode, Ref } from 'react'

export type PlanCardProps = {
  label: string
  price: string
  per: string
  capLine: string
  audience: string
  features: string[]
  /** Absolute-positioned pill in the top-left notch (POPULAIRE, "+4 échanges"). */
  badge?: ReactNode
  /** Per-card call to action, rendered at the bottom. */
  cta?: ReactNode
  selected?: boolean
  cardRef?: Ref<HTMLDivElement>
} & HTMLAttributes<HTMLDivElement>

// Presentational only: every string arrives as a prop, so the same card renders
// inside the client-side PlanSelector and the async server UpgradeOptions.
export function PlanCard({
  label, price, per, capLine, audience, features,
  badge, cta, selected = false, cardRef, className = '', ...rest
}: PlanCardProps) {
  return (
    <div
      ref={cardRef}
      className={`relative flex flex-col gap-1.5 rounded-[14px] border p-5 text-left ${
        selected ? 'border-2 border-[#2456E6] bg-[#F7F9FE]' : 'border-[#C4CDE0]'
      } ${className}`}
      {...rest}
    >
      {badge}
      <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-[#10203F]">{label}</span>
      <span className="text-[15px] font-semibold text-[#10203F]">
        {price} <span className="text-[13px] font-normal text-[#5B6B8C]">{per}</span>
      </span>
      <span className="text-[13.5px] text-[#5B6B8C]">{capLine}</span>
      <span className="mt-1.5 text-[13px] font-semibold text-[#10203F]">{audience}</span>
      <ul className="mt-2 flex flex-col gap-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-[#5B6B8C]">
            <span aria-hidden className="mt-[1px] text-[#2456E6]">✓</span>
            {f}
          </li>
        ))}
      </ul>
      {cta}
    </div>
  )
}
