import type { AppTranslator } from '@/lib/i18n/messages'
import { PLAN_EXCHANGE_CAP } from './limits'
import type { PlanKey } from './plans'
import { capDelta } from './upgrade'

// All plan copy lives in the `organizer.billing` message namespace. These
// helpers take an AppTranslator ALREADY scoped to that namespace so the same
// strings serve the client selector (useTranslations) and the server upgrade
// cards (getTranslations) without duplication.
//
// AppTranslator intentionally erases next-intl's literal key union — the
// documented escape hatch (lib/i18n/messages.ts). A wrong key would slip past
// the compiler, so plan-copy.test.ts asserts every one against the real French
// catalog and the parity gate keeps the other four locales in step.

export type PlanCopy = {
  label: string
  price: string
  per: string
  audience: string
  capLine: string
}

export function planCopy(t: AppTranslator, key: PlanKey): PlanCopy {
  const cap = PLAN_EXCHANGE_CAP[key]
  return {
    label: t(`plans.${key}.label`),
    price: t(`plans.${key}.price`),
    per: t('per'),
    audience: t(`audience.${key}`),
    capLine: cap === Infinity ? t('capUnlimited') : t('capLine', { cap }),
  }
}

export function featureBullets(t: AppTranslator): string[] {
  return [t('features.f1'), t('features.f2'), t('features.f3'), t('features.f4')]
}

// The pitch on an upgrade card: "+4 échanges", not "6 échanges".
export function deltaLabel(t: AppTranslator, current: PlanKey, target: PlanKey): string {
  const d = capDelta(current, target)
  return d.kind === 'unlimited' ? t('delta.unlimited') : t('delta.more', { n: d.n })
}
