import type { School } from '@/types/db'
import type { PlanKey } from './plans'

export const TRIAL_EXCHANGE_CAP = 1

export const PLAN_EXCHANGE_CAP: Record<PlanKey, number> = {
  starter: 2,
  growth: 6,
  scale: Infinity,
}

export type BillingState = Pick<School, 'subscription_status' | 'plan' | 'grace_until'>

export function isInGrace(school: BillingState, now: Date = new Date()): boolean {
  const s = school.subscription_status
  if (s !== 'past_due' && s !== 'unpaid') return false
  return !!school.grace_until && now < new Date(school.grace_until)
}

export function hasActivePlan(school: BillingState, now: Date = new Date()): boolean {
  return school.subscription_status === 'active' || isInGrace(school, now)
}

export function exchangeCap(school: BillingState, now: Date = new Date()): number {
  if (hasActivePlan(school, now) && school.plan) return PLAN_EXCHANGE_CAP[school.plan]
  return TRIAL_EXCHANGE_CAP
}

export function canCreateExchange(
  school: BillingState,
  currentCount: number,
  now: Date = new Date(),
): boolean {
  return currentCount < exchangeCap(school, now)
}
