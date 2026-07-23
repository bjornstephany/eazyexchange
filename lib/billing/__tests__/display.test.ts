import { describe, it, expect } from 'vitest'
import { usagePct } from '@/lib/billing/display'

// Plan copy now lives in the `organizer.billing` message namespace — see
// lib/billing/__tests__/plan-copy.test.ts. Only the math is left here.
describe('usagePct', () => {
  it('is the rounded percentage of the cap', () => {
    expect(usagePct(1, 2)).toBe(50)
    expect(usagePct(2, 2)).toBe(100)
    expect(usagePct(0, 1)).toBe(0)
    expect(usagePct(2, 6)).toBe(33)
  })
  it('clamps above the cap', () => {
    expect(usagePct(3, 2)).toBe(100)
  })
  it('shows a token sliver for unlimited plans', () => {
    expect(usagePct(0, Infinity)).toBe(6)
    expect(usagePct(99, Infinity)).toBe(6)
  })
  it('is zero for a zero cap rather than NaN', () => {
    expect(usagePct(3, 0)).toBe(0)
  })
})

describe('the module surface', () => {
  // The retirement itself is the deliverable: nothing customer-facing may live
  // in this file any more, or /billing and Settings can drift back apart.
  it('exports only the math', async () => {
    const mod = await import('@/lib/billing/display')
    expect(Object.keys(mod).sort()).toEqual(['usagePct'])
  })
})
