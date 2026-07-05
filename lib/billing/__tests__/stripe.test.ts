import { describe, it, expect, afterEach } from 'vitest'
import { isStripeConfigured } from '@/lib/billing/stripe'

describe('isStripeConfigured', () => {
  const original = process.env.STRIPE_SECRET_KEY
  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = original
  })

  it('is false when STRIPE_SECRET_KEY is unset or empty', () => {
    delete process.env.STRIPE_SECRET_KEY
    expect(isStripeConfigured()).toBe(false)
    process.env.STRIPE_SECRET_KEY = ''
    expect(isStripeConfigured()).toBe(false)
  })

  it('is true when STRIPE_SECRET_KEY is present', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    expect(isStripeConfigured()).toBe(true)
  })
})
