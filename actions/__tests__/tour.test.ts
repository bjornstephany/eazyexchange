import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TourState } from '@/types/db'

// The auth preamble throws (convention: 'Unauthenticated'/'Unauthorized' are
// load-bearing). The WRITE never throws — a failed cosmetic bookkeeping write
// must not put an error overlay in front of a brand-new organizer.
type Scenario = {
  user: { id: string } | null
  profile: Record<string, unknown> | null
  updateError: { message: string } | null
  updates: Record<string, unknown>[]
}
let scenario: Scenario

vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => scenario.user,
  getProfile: async () => scenario.profile,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.update = (patch: Record<string, unknown>) => {
        scenario.updates.push(patch)
        return chain
      }
      chain.eq = async () => ({ error: scenario.updateError })
      return chain
    },
  }),
}))

const { setTourState } = await import('@/actions/tour')

function profile(tour_state: TourState, over: Record<string, unknown> = {}) {
  return {
    id: 'u-1', role: 'organizer', status: 'approved', school_id: 's-1',
    org_role: 'owner', tour_state, ...over,
  }
}

beforeEach(() => {
  scenario = {
    user: { id: 'u-1' },
    profile: profile('pending'),
    updateError: null,
    updates: [],
  }
})

describe('setTourState — auth', () => {
  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    scenario.profile = null
    await expect(setTourState('completed')).rejects.toThrow('Unauthenticated')
    expect(scenario.updates).toEqual([])
  })

  it('rejects a student', async () => {
    scenario.profile = profile('pending', { role: 'student' })
    await expect(setTourState('completed')).rejects.toThrow('Unauthorized')
    expect(scenario.updates).toEqual([])
  })

  it('rejects a non-approved organizer', async () => {
    scenario.profile = profile('pending', { status: 'pending' })
    await expect(setTourState('completed')).rejects.toThrow('Unauthorized')
    expect(scenario.updates).toEqual([])
  })
})

describe('setTourState — writes', () => {
  it('writes a forward move', async () => {
    await expect(setTourState('dismissed')).resolves.toEqual({ ok: true })
    expect(scenario.updates).toEqual([{ tour_state: 'dismissed' }])
  })

  it('writes completion', async () => {
    await expect(setTourState('completed')).resolves.toEqual({ ok: true })
    expect(scenario.updates).toEqual([{ tour_state: 'completed' }])
  })

  it('lets a skipper come back and complete', async () => {
    scenario.profile = profile('dismissed')
    await expect(setTourState('completed')).resolves.toEqual({ ok: true })
    expect(scenario.updates).toEqual([{ tour_state: 'completed' }])
  })

  // The replay case, and the reason the ladder is enforced server-side.
  it('refuses to un-complete a finished tour, without erroring', async () => {
    scenario.profile = profile('completed')
    await expect(setTourState('dismissed')).resolves.toEqual({ ok: true })
    expect(scenario.updates).toEqual([])
  })

  it('writes nothing for a same-state call', async () => {
    scenario.profile = profile('dismissed')
    await expect(setTourState('dismissed')).resolves.toEqual({ ok: true })
    expect(scenario.updates).toEqual([])
  })

  it('reports a failed write as { ok: false } instead of throwing', async () => {
    scenario.updateError = { message: 'permission denied for column tour_state' }
    await expect(setTourState('completed')).resolves.toEqual({ ok: false })
  })

  it('throws on a value our own client should never send', async () => {
    await expect(setTourState('done' as TourState)).rejects.toThrow('Unsupported tour state')
    expect(scenario.updates).toEqual([])
  })
})
