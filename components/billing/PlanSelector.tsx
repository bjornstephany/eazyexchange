'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PLAN_KEYS, type PlanKey } from '@/lib/billing/plans'
import { planCopy, featureBullets } from '@/lib/billing/plan-copy'
import { asAppTranslator } from '@/lib/i18n/messages'
import { PlanCard } from './PlanCard'

export function PlanSelector() {
  const t = asAppTranslator(useTranslations('organizer.billing'))
  const [selected, setSelected] = useState<PlanKey>('growth')
  const cardRefs = useRef<Partial<Record<PlanKey, HTMLDivElement | null>>>({})
  // Move selection to an adjacent card and follow it with focus (radiogroup arrow-key behavior).
  const move = (key: PlanKey, delta: number) => {
    const next = PLAN_KEYS[(PLAN_KEYS.indexOf(key) + delta + PLAN_KEYS.length) % PLAN_KEYS.length]
    setSelected(next)
    cardRefs.current[next]?.focus()
  }
  const features = featureBullets(t)
  return (
    <>
      <div role="radiogroup" aria-label={t('selectorLegend')} className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {PLAN_KEYS.map((key) => {
          const active = key === selected
          const copy = planCopy(t, key)
          return (
            <PlanCard
              key={key}
              cardRef={(el) => { cardRefs.current[key] = el }}
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(key)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelected(key) }
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(key, 1) }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(key, -1) }
              }}
              className={active ? 'cursor-pointer' : 'cursor-pointer hover:border-[#2456E6]'}
              selected={active}
              label={copy.label}
              price={copy.price}
              per={copy.per}
              capLine={copy.capLine}
              audience={copy.audience}
              features={features}
              badge={key === 'growth' ? (
                <span className="absolute -top-2.5 left-4 rounded-full bg-[#2456E6] px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-white">
                  {t('popularBadge')}
                </span>
              ) : undefined}
            />
          )
        })}
      </div>
      <div className="flex gap-3">
        <Link href={`/billing/checkout?plan=${selected}`} className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">
          {t('continueCta', { plan: planCopy(t, selected).label })}
        </Link>
        <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">
          {t('backToDashboard')}
        </Link>
      </div>
    </>
  )
}
