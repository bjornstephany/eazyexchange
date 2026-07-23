import { PLAN_EXCHANGE_CAP } from './limits'
import { PLAN_KEYS, type PlanKey } from './plans'

// Plan ordering, low to high. Both the /billing/upgrade route (which refuses
// anything that is not strictly an upgrade) and the page (which decides which
// cards to render) read it, so "an upgrade" is defined in exactly one place.
export const PLAN_RANK: Record<PlanKey, number> = { starter: 0, growth: 1, scale: 2 }

export function upgradeTargets(current: PlanKey): PlanKey[] {
  return PLAN_KEYS.filter((k) => PLAN_RANK[k] > PLAN_RANK[current])
}

export function isUpgrade(current: PlanKey, target: PlanKey): boolean {
  return PLAN_RANK[target] > PLAN_RANK[current]
}

export type CapDelta = { kind: 'more'; n: number } | { kind: 'unlimited' }

// Derived from PLAN_EXCHANGE_CAP so it can never drift from the cap the
// createExchange gate actually enforces. The delta is the pitch on an upgrade
// card ("+4 échanges"), not the absolute number.
export function capDelta(current: PlanKey, target: PlanKey): CapDelta {
  const to = PLAN_EXCHANGE_CAP[target]
  if (to === Infinity) return { kind: 'unlimited' }
  return { kind: 'more', n: to - PLAN_EXCHANGE_CAP[current] }
}
