import { describe, it, expect } from 'vitest'
import { PLAN_RANK, upgradeTargets, isUpgrade, capDelta } from '@/lib/billing/upgrade'

describe('PLAN_RANK', () => {
  it('orders starter < growth < scale', () => {
    expect(PLAN_RANK.starter).toBeLessThan(PLAN_RANK.growth)
    expect(PLAN_RANK.growth).toBeLessThan(PLAN_RANK.scale)
  })
})

describe('upgradeTargets', () => {
  it('offers everything above the current plan, in ascending order', () => {
    expect(upgradeTargets('starter')).toEqual(['growth', 'scale'])
    expect(upgradeTargets('growth')).toEqual(['scale'])
  })
  it('offers nothing on the top plan', () => {
    expect(upgradeTargets('scale')).toEqual([])
  })
})

describe('isUpgrade', () => {
  it('is true only when the target outranks the current plan', () => {
    expect(isUpgrade('starter', 'growth')).toBe(true)
    expect(isUpgrade('starter', 'scale')).toBe(true)
    expect(isUpgrade('growth', 'starter')).toBe(false) // downgrade
    expect(isUpgrade('growth', 'growth')).toBe(false)  // same plan
    expect(isUpgrade('scale', 'growth')).toBe(false)
  })
})

describe('capDelta', () => {
  it('reports the added capacity for bounded targets', () => {
    // starter 2 → growth 6
    expect(capDelta('starter', 'growth')).toEqual({ kind: 'more', n: 4 })
  })
  it('reports unlimited for scale, whatever the current plan', () => {
    expect(capDelta('starter', 'scale')).toEqual({ kind: 'unlimited' })
    expect(capDelta('growth', 'scale')).toEqual({ kind: 'unlimited' })
  })
  it('is zero for a same-plan pair', () => {
    expect(capDelta('growth', 'growth')).toEqual({ kind: 'more', n: 0 })
  })
})
