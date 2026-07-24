import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { asAppTranslator } from '@/lib/i18n/messages'
import type { PlanKey } from '@/lib/billing/plans'
import { upgradeTargets } from '@/lib/billing/upgrade'
import { planCopy, featureBullets, deltaLabel } from '@/lib/billing/plan-copy'
import { PlanCard } from './PlanCard'

// The paid path. `upgradeTargets` is empty on the top plan, so `scale` needs no
// special case anywhere — this simply renders nothing.
export async function UpgradeOptions({ current }: { current: PlanKey }) {
  const t = asAppTranslator(await getTranslations('organizer.billing'))
  const targets = upgradeTargets(current)
  if (targets.length === 0) return null
  const features = featureBullets(t)

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {targets.map((key) => {
        const copy = planCopy(t, key)
        return (
          <PlanCard
            key={key}
            label={copy.label}
            price={copy.price}
            per={copy.per}
            capLine={copy.capLine}
            audience={copy.audience}
            features={features}
            badge={
              <span className="absolute -top-2.5 left-4 rounded-full bg-[#2456E6] px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-white">
                {deltaLabel(t, current, key)}
              </span>
            }
            cta={
              <Link
                href={`/billing/upgrade?plan=${key}`}
                className="mt-4 flex items-center justify-center rounded-[11px] bg-[#2456E6] py-3 text-[15px] font-semibold text-white hover:bg-[#1D48C7]"
              >
                {t('upgradeCta', { plan: copy.label })}
              </Link>
            }
          />
        )
      })}
    </div>
  )
}
