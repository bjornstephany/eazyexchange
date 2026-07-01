import { describe, it, expect } from 'vitest'
import {
  TRIAL_EXCHANGE_CAP, PLAN_EXCHANGE_CAP,
  isInGrace, hasActivePlan, exchangeCap, canCreateExchange,
} from '@/lib/billing/limits'

const NOW = new Date('2026-07-01T00:00:00Z')
const future = new Date('2026-07-05T00:00:00Z').toISOString()
const past = new Date('2026-06-25T00:00:00Z').toISOString()

const trial = { subscription_status: null, plan: null, grace_until: null } as const
const starter = { subscription_status: 'active', plan: 'starter', grace_until: null } as const
const growth = { subscription_status: 'active', plan: 'growth', grace_until: null } as const
const scale = { subscription_status: 'active', plan: 'scale', grace_until: null } as const

describe('limits', () => {
  it('exposes caps', () => {
    expect(TRIAL_EXCHANGE_CAP).toBe(1)
    expect(PLAN_EXCHANGE_CAP).toEqual({ starter: 2, growth: 6, scale: Infinity })
  })

  it('isInGrace only within the window for past_due/unpaid', () => {
    expect(isInGrace({ subscription_status: 'past_due', plan: 'starter', grace_until: future }, NOW)).toBe(true)
    expect(isInGrace({ subscription_status: 'past_due', plan: 'starter', grace_until: past }, NOW)).toBe(false)
    expect(isInGrace({ subscription_status: 'unpaid', plan: 'starter', grace_until: null }, NOW)).toBe(false)
    expect(isInGrace(starter, NOW)).toBe(false)
  })

  it('hasActivePlan for active or in-grace', () => {
    expect(hasActivePlan(starter, NOW)).toBe(true)
    expect(hasActivePlan({ subscription_status: 'past_due', plan: 'growth', grace_until: future }, NOW)).toBe(true)
    expect(hasActivePlan(trial, NOW)).toBe(false)
    expect(hasActivePlan({ subscription_status: 'canceled', plan: 'growth', grace_until: null }, NOW)).toBe(false)
  })

  it('exchangeCap reflects plan when active, else trial', () => {
    expect(exchangeCap(trial, NOW)).toBe(1)
    expect(exchangeCap(starter, NOW)).toBe(2)
    expect(exchangeCap(growth, NOW)).toBe(6)
    expect(exchangeCap(scale, NOW)).toBe(Infinity)
    expect(exchangeCap({ subscription_status: 'canceled', plan: 'scale', grace_until: null }, NOW)).toBe(1)
  })

  it('canCreateExchange compares count to cap', () => {
    expect(canCreateExchange(trial, 0, NOW)).toBe(true)
    expect(canCreateExchange(trial, 1, NOW)).toBe(false)
    expect(canCreateExchange(starter, 1, NOW)).toBe(true)
    expect(canCreateExchange(starter, 2, NOW)).toBe(false)
    expect(canCreateExchange(scale, 999, NOW)).toBe(true)
  })
})
