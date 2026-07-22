import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  orgRole: 'owner' | 'admin'
  exchange: Record<string, unknown> | null
}

// Mirrors lib/auth/require's contract: requesting orgRole 'owner' while the
// caller is an admin throws. getProgramInfo must no longer request it.
vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async (opts?: { orgRole?: 'owner' }) => {
    if (opts?.orgRole === 'owner' && scenario.orgRole !== 'owner') throw new Error('Unauthorized')
    return {
      user: { id: 'u1' },
      profile: { school_id: 's1', org_role: scenario.orgRole, email: 'a@b.c', full_name: 'A' },
    }
  },
}))

// Chainable, thenable query builder: count queries are awaited directly
// (then), row queries end in maybeSingle.
function table(result: { data?: unknown; count?: number }) {
  const b: any = {
    select: () => b, eq: () => b, not: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => ({ data: result.data ?? null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ count: result.count ?? 0 }),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return table({ data: scenario.exchange })
      if (t === 'exchange_enrollments') return table({ count: 10 })
      if (t === 'applications') return table({ count: 12 })
      return table({ data: null }) // form_templates deadline lookup
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getProgramInfo, archiveExchange } from '@/actions/settings'

beforeEach(() => {
  scenario = {
    orgRole: 'admin',
    exchange: {
      id: 'ex1', name: 'Programme Espagne', year: 2026, archived_at: null,
      school_a_id: 's1', school_b_id: 's2',
      reminders_enabled: null, reminder_cadence: null,
    },
  }
})

describe('getProgramInfo', () => {
  it('succeeds for a non-owner organizer', async () => {
    const info = await getProgramInfo('ex1')
    expect(info.name).toBe('Programme Espagne')
    expect(info.enrolled).toBe(10)
    expect(info.applications).toBe(12)
  })
  it('defaults reminder fields when the columns are null', async () => {
    const info = await getProgramInfo('ex1')
    expect(info.remindersEnabled).toBe(true)
    expect(info.reminderCadence).toBe('normale')
  })
  it('passes explicit reminder values through', async () => {
    scenario.exchange = { ...scenario.exchange!, reminders_enabled: false, reminder_cadence: 'insistante' }
    const info = await getProgramInfo('ex1')
    expect(info.remindersEnabled).toBe(false)
    expect(info.reminderCadence).toBe('insistante')
  })
  it('rejects an out-of-scope exchange', async () => {
    scenario.exchange = { ...scenario.exchange!, school_a_id: 's8', school_b_id: 's9' }
    await expect(getProgramInfo('ex1')).rejects.toThrow('Unauthorized')
  })
})

describe('archiveExchange', () => {
  it('still requires the owner role', async () => {
    await expect(archiveExchange('ex1')).rejects.toThrow('Unauthorized')
  })
})
