import { describe, it, expect } from 'vitest'
import { canAdvanceTourState, isTourState } from '@/lib/tour/state'
import type { TourState } from '@/types/db'

const ALL: TourState[] = ['pending', 'dismissed', 'completed']

describe('canAdvanceTourState', () => {
  it('allows the two forward moves from pending', () => {
    expect(canAdvanceTourState('pending', 'dismissed')).toBe(true)
    expect(canAdvanceTourState('pending', 'completed')).toBe(true)
  })

  it('allows dismissed → completed, so a skipper can come back and finish', () => {
    expect(canAdvanceTourState('dismissed', 'completed')).toBe(true)
  })

  it('refuses every downgrade', () => {
    expect(canAdvanceTourState('dismissed', 'pending')).toBe(false)
    expect(canAdvanceTourState('completed', 'pending')).toBe(false)
    // The replay case: completing then replaying and skipping must not
    // overwrite the completion.
    expect(canAdvanceTourState('completed', 'dismissed')).toBe(false)
  })

  it('refuses same-state writes', () => {
    for (const s of ALL) expect(canAdvanceTourState(s, s)).toBe(false)
  })

  it('is a strict one-way ladder over every pair', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const forward = canAdvanceTourState(from, to)
        const backward = canAdvanceTourState(to, from)
        // Never both directions, and never neither unless it is the same state.
        if (from === to) expect(forward || backward).toBe(false)
        else expect(forward).toBe(!backward)
      }
    }
  })
})

describe('isTourState', () => {
  it('accepts the three real values', () => {
    for (const s of ALL) expect(isTourState(s)).toBe(true)
  })

  it('rejects anything else that could arrive over the wire', () => {
    for (const bad of ['', 'PENDING', 'done', null, undefined, 0, {}, ['pending']]) {
      expect(isTourState(bad)).toBe(false)
    }
  })
})
