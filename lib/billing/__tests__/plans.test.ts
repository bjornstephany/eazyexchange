import { describe, it, expect } from 'vitest'
import {
  PLAN_KEYS, DEFAULT_PLAN, isPlanKey, coercePlan, resolveCheckoutPlan,
} from '@/lib/billing/plans'

describe('plans', () => {
  it('exposes the three plan keys', () => {
    expect(PLAN_KEYS).toEqual(['starter', 'growth', 'scale'])
    expect(DEFAULT_PLAN).toBe('growth')
  })

  it('isPlanKey narrows valid keys only', () => {
    expect(isPlanKey('starter')).toBe(true)
    expect(isPlanKey('enterprise')).toBe(false)
    expect(isPlanKey(null)).toBe(false)
  })

  it('coercePlan falls back to the default', () => {
    expect(coercePlan('scale')).toBe('scale')
    expect(coercePlan('nonsense')).toBe('growth')
    expect(coercePlan(undefined)).toBe('growth')
  })

  it('resolveCheckoutPlan prefers query, then school, then metadata, then default', () => {
    expect(resolveCheckoutPlan({ query: 'starter', schoolPlan: 'scale', metadataPlan: 'growth' })).toBe('starter')
    expect(resolveCheckoutPlan({ query: null, schoolPlan: 'scale', metadataPlan: 'growth' })).toBe('scale')
    expect(resolveCheckoutPlan({ query: 'bad', schoolPlan: null, metadataPlan: 'starter' })).toBe('starter')
    expect(resolveCheckoutPlan({ query: null, schoolPlan: null, metadataPlan: null })).toBe('growth')
  })
})
