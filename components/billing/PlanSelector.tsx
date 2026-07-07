'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PLAN_KEYS, type PlanKey } from '@/lib/billing/plans'
import { PLAN_LABEL_FR, PLAN_PRICE_FR, planCapLabel, PLAN_AUDIENCE_FR, PLAN_FEATURE_BULLETS_FR } from '@/lib/billing/display'

export function PlanSelector() {
  const [selected, setSelected] = useState<PlanKey>('growth')
  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {PLAN_KEYS.map(key => {
          const active = key === selected
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`relative flex flex-col gap-1.5 rounded-[14px] border p-5 text-left ${active ? 'border-2 border-[#2456E6] bg-[#F7F9FE]' : 'border-[#C4CDE0] hover:border-[#2456E6]'}`}
            >
              {key === 'growth' && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-[#2456E6] px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-white">POPULAIRE</span>
              )}
              <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-[#10203F]">{PLAN_LABEL_FR[key]}</span>
              <span className="text-[15px] font-semibold text-[#10203F]">{PLAN_PRICE_FR[key]} <span className="text-[13px] font-normal text-[#5B6B8C]">/ an</span></span>
              <span className="text-[13.5px] text-[#5B6B8C]">{planCapLabel(key)}</span>
              <span className="mt-1.5 text-[13px] font-semibold text-[#10203F]">{PLAN_AUDIENCE_FR[key]}</span>
              <ul className="mt-2 flex flex-col gap-1.5">
                {PLAN_FEATURE_BULLETS_FR.map(f => (
                  <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-[#5B6B8C]">
                    <span aria-hidden className="mt-[1px] text-[#2456E6]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
      <div className="flex gap-3">
        <Link href={`/billing/checkout?plan=${selected}`} className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">
          Continuer avec {PLAN_LABEL_FR[selected]}
        </Link>
        <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">
          Retour au tableau de bord
        </Link>
      </div>
    </>
  )
}
