import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { orgRole: string; country: string; updates: { table: string; row: any }[] }

// Mocking the auth preamble (rather than the whole supabase client) is this
// repo's pattern for actions/settings.ts — see settings.locale.test.ts.
vi.mock('@/lib/auth/require', () => ({
  requireUser: async () => ({ id: 'u1' }),
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: {
      id: 'u1', role: 'organizer', school_id: 's-1', full_name: 'Marie B.',
      email: 'a@b.com', org_role: scenario.orgRole, locale: 'fr',
      schools: { name: 'Lycée Chevreul Lestonnac', country: scenario.country },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      update: (row: any) => {
        scenario.updates.push({ table, row })
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

import { updateProfile } from '@/actions/settings'

beforeEach(() => {
  scenario = { orgRole: 'owner', country: 'FR', updates: [] }
})

const schoolWrites = () => scenario.updates.filter(u => u.table === 'schools')

// The school name is read-only for EVERY country now, not just registry-verified
// French schools: updateProfile no longer takes a school name at all, so there
// is no client write path to schools.name left.
describe('updateProfile — no school can be renamed', () => {
  it('never writes schools for a France-verified school', async () => {
    const res = await updateProfile({ fullName: 'Marie B.' })
    expect(res).toEqual({ ok: true })
    expect(schoolWrites()).toEqual([])
    expect(scenario.updates.some(u => u.table === 'users')).toBe(true)
  })

  it('never writes schools for a school outside France either', async () => {
    scenario.country = 'Espagne'
    const res = await updateProfile({ fullName: 'Marie B.' })
    expect(res).toEqual({ ok: true })
    expect(schoolWrites()).toEqual([])
  })

  it('never writes schools for an admin', async () => {
    scenario.country = 'Espagne'
    scenario.orgRole = 'admin'
    await updateProfile({ fullName: 'Marie B.' })
    expect(schoolWrites()).toEqual([])
  })
})

describe('updateProfile — the full name', () => {
  it('trims and saves it', async () => {
    await updateProfile({ fullName: '  Marie Blanchet  ' })
    expect(scenario.updates).toEqual([
      { table: 'users', row: { full_name: 'Marie Blanchet' } },
    ])
  })

  // Structured, not thrown: production replaces thrown Server Action messages
  // with an opaque digest.
  it('returns a structured error for an empty name, without writing', async () => {
    const res = await updateProfile({ fullName: '   ' })
    expect(res).toEqual({ ok: false, message: 'settings.errors.nameEmpty' })
    expect(scenario.updates).toEqual([])
  })

  it('returns a structured error past 120 characters, without writing', async () => {
    const res = await updateProfile({ fullName: 'a'.repeat(121) })
    expect(res).toEqual({ ok: false, message: 'settings.errors.nameTooLong' })
    expect(scenario.updates).toEqual([])
  })

  it('accepts exactly 120 characters', async () => {
    const res = await updateProfile({ fullName: 'a'.repeat(120) })
    expect(res).toEqual({ ok: true })
    expect(scenario.updates.length).toBe(1)
  })
})
