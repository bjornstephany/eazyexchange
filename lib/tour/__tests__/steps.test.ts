import { describe, it, expect } from 'vitest'
import { TOUR_STEPS, visibleStepIndices } from '@/lib/tour/steps'

// Every route a step navigates to must be a real organizer route. Hard-coded
// rather than globbed: if someone deletes or renames a tab, this list is the
// thing that should fail and force the itinerary to be updated with it.
const ORGANIZER_ROUTES = [
  '/dashboard', '/applications', '/forms', '/students', '/communication', '/settings',
]

const allPresent = () => true
const nonePresent = () => false

describe('TOUR_STEPS', () => {
  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('opens and closes with an unanchored card', () => {
    expect(TOUR_STEPS[0]!.anchor).toBeNull()
    expect(TOUR_STEPS[0]!.route).toBeNull()
    expect(TOUR_STEPS.at(-1)!.anchor).toBeNull()
    expect(TOUR_STEPS.at(-1)!.route).toBeNull()
  })

  it('navigates only to real organizer routes', () => {
    for (const step of TOUR_STEPS) {
      if (step.route !== null) expect(ORGANIZER_ROUTES).toContain(step.route)
    }
  })

  it('covers every sidebar tab exactly once', () => {
    const routes = TOUR_STEPS.map((s) => s.route).filter((r) => r !== null)
    expect([...routes].sort()).toEqual([...ORGANIZER_ROUTES].sort())
  })

  it('pairs every route with an anchor and vice versa', () => {
    for (const step of TOUR_STEPS) {
      expect(step.route === null).toBe(step.anchor === null)
    }
  })
})

describe('visibleStepIndices', () => {
  it('keeps the whole itinerary when every anchor is on screen', () => {
    expect(visibleStepIndices(allPresent)).toEqual(TOUR_STEPS.map((_, i) => i))
  })

  it('drops a step whose anchor is absent', () => {
    // Hide only /forms ('files'), at index 2.
    const plan = visibleStepIndices((a) => a !== 'nav-files')
    expect(plan).not.toContain(2)
    expect(plan.length).toBe(TOUR_STEPS.length - 1)
    // Still in itinerary order, so cursor arithmetic stays monotonic.
    expect([...plan]).toEqual([...plan].sort((x, y) => x - y))
  })

  it('leaves only welcome and finish when no tab is rendered', () => {
    // An organizer with no reachable exchange: the scoped tabs are all gone.
    expect(visibleStepIndices(nonePresent)).toEqual([0, TOUR_STEPS.length - 1])
  })

  it('always keeps the unanchored steps, whatever the DOM says', () => {
    const plan = visibleStepIndices(nonePresent)
    for (const i of plan) expect(TOUR_STEPS[i]!.anchor).toBeNull()
    expect(plan.length).toBe(2)
  })
})
