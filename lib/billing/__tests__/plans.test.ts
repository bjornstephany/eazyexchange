import { describe, it, expect, afterEach } from 'vitest'
import {
  PLAN_KEYS, DEFAULT_PLAN, isPlanKey, coercePlan, resolveCheckoutPlan,
  hasPriceForPlan, priceIdForPlan,
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

  describe('hasPriceForPlan / priceIdForPlan', () => {
    const KEY = 'STRIPE_PRICE_STARTER'
    const original = process.env[KEY]
    afterEach(() => {
      if (original === undefined) delete process.env[KEY]
      else process.env[KEY] = original
    })

    it('hasPriceForPlan is false when the price env is unset', () => {
      delete process.env[KEY]
      expect(hasPriceForPlan('starter')).toBe(false)
      expect(() => priceIdForPlan('starter')).toThrow(/Missing Stripe price/)
    })

    it('hasPriceForPlan is true and priceIdForPlan returns the id when set', () => {
      process.env[KEY] = 'price_test_123'
      expect(hasPriceForPlan('starter')).toBe(true)
      expect(priceIdForPlan('starter')).toBe('price_test_123')
    })
  })
})
