import { describe, it, expect } from 'vitest'
import { travelOrderProblem, TRAVEL_ORDER_MESSAGE } from '@/lib/exchange/travel-dates'

describe('travelOrderProblem', () => {
  it('accepts a return after the departure', () => {
    expect(travelOrderProblem('2026-10-17', '2026-11-02')).toBeNull()
  })

  it('rejects a return before the departure', () => {
    expect(travelOrderProblem('2026-10-17', '2026-10-01')).toBe(TRAVEL_ORDER_MESSAGE)
  })

  it('rejects a return on the same day as the departure', () => {
    expect(travelOrderProblem('2026-10-17', '2026-10-17')).toBe(TRAVEL_ORDER_MESSAGE)
  })

  it('says nothing when either date is missing — required-ness is the caller’s rule', () => {
    expect(travelOrderProblem('2026-10-17', null)).toBeNull()
    expect(travelOrderProblem(null, '2026-11-02')).toBeNull()
    expect(travelOrderProblem(null, null)).toBeNull()
    expect(travelOrderProblem('', '')).toBeNull()
  })
})
