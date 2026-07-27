import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  role: string
  exchanges: { id: string }[]
  appsByExchange: Record<string, { id: string; status: string; submitted_at: string | null; data: Record<string, string>; email: string }[]>
  failFor: string | null
}

// Chainable, thenable builder: list queries are awaited at an arbitrary chain
// end (then), row lookups end in single/maybeSingle. Per-table data below.
function table(data: unknown, row?: unknown) {
  const b: any = {
    select: () => b, eq: () => b, or: () => b, order: () => b, in: () => b,
    returns: () => b,
    single: async () => ({ data: row ?? null }),
    maybeSingle: async () => ({ data: row ?? null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      if (t === 'users') return table(null, { school_id: 's1', role: scenario.role, status: 'approved' })
      if (t === 'exchanges') return table(scenario.exchanges, { school_a_id: 's1', school_b_id: null })
      // form_templates / exchange_enrollments: empty → no rollups, candidature path.
      return table([])
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => ((key: string) => key),
}))
vi.mock('@/actions/applications-review', () => ({
  listApplications: async (id: string) => {
    if (scenario.failFor === id) throw new Error('boom')
    return scenario.appsByExchange[id] ?? []
  },
}))

import { getExchangeProgressSummaries } from '@/actions/exchanges'

const app = (status: string) => ({
  id: Math.random().toString(), status, submitted_at: '2026-09-12', data: {}, email: 'x@y.fr',
})

beforeEach(() => {
  scenario = {
    role: 'organizer',
    exchanges: [{ id: 'ex-1' }, { id: 'ex-2' }, { id: 'ex-3' }],
    appsByExchange: { 'ex-1': [app('submitted'), app('accepted'), app('enrolled')] },
    failFor: null,
  }
})

describe('getExchangeProgressSummaries', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(getExchangeProgressSummaries()).rejects.toThrow('Unauthorized')
  })

  it('returns candidature counts per exchange, null when nothing to count', async () => {
    const result = await getExchangeProgressSummaries()
    expect(result['ex-1']).toEqual({ done: 2, total: 3, kind: 'candidatures' })
    expect(result['ex-2']).toBeNull()
    expect(result['ex-3']).toBeNull()
  })

  it('one failing exchange yields null for that row, not a thrown action', async () => {
    scenario.failFor = 'ex-1'
    const result = await getExchangeProgressSummaries()
    expect(result['ex-1']).toBeNull()
    expect(result['ex-2']).toBeNull()
  })
})
