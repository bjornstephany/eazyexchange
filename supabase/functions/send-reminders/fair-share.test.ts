import { describe, it, expect } from 'vitest'
import { rotateSchools, planFairShare } from './fair-share'

// 2026-01-01T00:00:00Z is exactly day 20454 since epoch; 20454 % 3 === 0, so
// with three schools the sorted order is unrotated on d0 and shifts by one on d1.
const d0 = new Date('2026-01-01T08:00:00Z')
const d1 = new Date(d0.getTime() + 24 * 60 * 60 * 1000)

describe('rotateSchools', () => {
  it('is deterministic for a given day', () => {
    expect(rotateSchools(['b', 'c', 'a'], d0)).toEqual(rotateSchools(['a', 'b', 'c'], d0))
  })
  it('rotates by one position per day so no school is permanently last', () => {
    expect(rotateSchools(['a', 'b', 'c'], d0)).toEqual(['a', 'b', 'c'])
    expect(rotateSchools(['a', 'b', 'c'], d1)).toEqual(['b', 'c', 'a'])
  })
  it('dedupes and handles empty input', () => {
    expect(rotateSchools(['a', 'a'], d0)).toEqual(['a'])
    expect(rotateSchools([], d0)).toEqual([])
  })
})

describe('planFairShare', () => {
  const entries = [
    { schoolId: 'b', item: 'b1' },
    { schoolId: 'a', item: 'a1' },
    { schoolId: 'a', item: 'a2' },
    { schoolId: 'a', item: 'a3' },
  ]
  it('orders sends by school rotation, preserving input order within a school', () => {
    expect(planFairShare(entries, d0, 10).send).toEqual(['a1', 'a2', 'a3', 'b1'])
    expect(planFairShare(entries, d1, 10).send).toEqual(['b1', 'a1', 'a2', 'a3'])
  })
  it('truncates each school at the budget and flags it', () => {
    const plan = planFairShare(entries, d0, 2)
    expect(plan.send).toEqual(['a1', 'a2', 'b1'])
    expect(plan.perSchool).toEqual({
      a: { due: 3, sending: 2, budgetHit: true },
      b: { due: 1, sending: 1, budgetHit: false },
    })
  })
  it('handles empty input', () => {
    expect(planFairShare([], d0, 5)).toEqual({ send: [], perSchool: {} })
  })
})
