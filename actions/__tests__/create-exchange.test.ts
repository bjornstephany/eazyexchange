import { describe, it, expect, vi, beforeEach } from 'vitest'

let opts: {
  role?: string; ownSchoolName?: string; ownSchoolError?: unknown
  subStatus?: string; plan?: string; exchangeCount?: number
}
let calls: { schoolUpdated: any; partnerInserted: any; exchangeInserted: any }

function makeClient() {
  calls = { schoolUpdated: null, partnerInserted: null, exchangeInserted: null }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { school_id: 's-own', role: opts.role ?? 'organizer' } }) }) }) }
      }
      if (table === 'schools') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({
            data: opts.ownSchoolError ? null : {
              name: opts.ownSchoolName ?? 'Existing High',
              subscription_status: opts.subStatus ?? null,
              plan: opts.plan ?? null,
              grace_until: null,
            },
            error: opts.ownSchoolError ?? null,
          }) }) }),
          update: (row: any) => { calls.schoolUpdated = row; return { eq: async () => ({ error: null }) } },
          insert: (row: any) => { calls.partnerInserted = row; return { select: () => ({ single: async () => ({ data: { id: 's-partner' }, error: null }) }) } },
        }
      }
      if (table === 'exchanges') {
        return {
          select: () => ({ eq: async () => ({ count: opts.exchangeCount ?? 0, error: null }) }),
          insert: async (row: any) => { calls.exchangeInserted = row; return { error: null } },
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createExchange } from '../exchanges'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const base = { name: 'France–Canada', year: '2026', school_b_name: 'Partner Lycée' }

beforeEach(() => { opts = {} })

describe('createExchange deferred school name', () => {
  it('persists the organizer school name on the first exchange when it is empty', async () => {
    opts = { ownSchoolName: '' }
    await createExchange(form({ ...base, school_a_name: 'Lincoln High' }))
    expect(calls.schoolUpdated).toEqual({ name: 'Lincoln High' })
    expect(calls.partnerInserted).toEqual({ name: 'Partner Lycée' })
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada', year: 2026, school_a_id: 's-own', school_b_id: 's-partner' })
  })

  it('throws when the school name is empty and none was provided', async () => {
    opts = { ownSchoolName: '' }
    await expect(createExchange(form(base))).rejects.toThrow('Please provide your school name')
  })

  it('does not touch the school name when it is already set', async () => {
    opts = { ownSchoolName: 'Existing High' }
    await createExchange(form({ ...base, school_a_name: 'Ignored' }))
    expect(calls.schoolUpdated).toBeNull()
  })

  it('surfaces a read error instead of silently proceeding', async () => {
    opts = { ownSchoolError: { message: 'db down' } }
    await expect(createExchange(form({ ...base, school_a_name: 'Lincoln High' }))).rejects.toThrow('db down')
    expect(calls.schoolUpdated).toBeNull()
    expect(calls.exchangeInserted).toBeNull()
  })
})

describe('createExchange plan cap', () => {
  it('allows a trial school to create its first exchange', async () => {
    opts = { exchangeCount: 0 }
    await createExchange(form(base))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
  })

  it('blocks a trial school at 1 exchange', async () => {
    opts = { exchangeCount: 1 }
    await expect(createExchange(form(base))).rejects.toThrow(/exchange limit/i)
    expect(calls.exchangeInserted).toBeNull()
  })

  it('allows a Starter school to create a second exchange', async () => {
    opts = { exchangeCount: 1, subStatus: 'active', plan: 'starter' }
    await createExchange(form(base))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
  })

  it('blocks a Starter school at 2 exchanges', async () => {
    opts = { exchangeCount: 2, subStatus: 'active', plan: 'starter' }
    await expect(createExchange(form(base))).rejects.toThrow(/exchange limit/i)
  })
})
