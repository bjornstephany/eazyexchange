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

describe('updateProfile — FR schools cannot be renamed', () => {
  it('ignores a submitted school name for a France-verified school', async () => {
    await updateProfile({ fullName: 'Marie B.', schoolName: 'Université Bidon' })
    expect(schoolWrites()).toEqual([])
    expect(scenario.updates.some(u => u.table === 'users')).toBe(true)
  })

  it('still renames a non-FR school', async () => {
    scenario.country = 'Espagne'
    await updateProfile({ fullName: 'Marie B.', schoolName: 'Colegio Nuevo' })
    expect(schoolWrites()).toEqual([{ table: 'schools', row: { name: 'Colegio Nuevo' } }])
  })

  it('still ignores an admin’s submitted school name', async () => {
    scenario.country = 'Espagne'
    scenario.orgRole = 'admin'
    await updateProfile({ fullName: 'Marie B.', schoolName: 'Colegio Nuevo' })
    expect(schoolWrites()).toEqual([])
  })

  it('still rejects an empty name for a non-FR school', async () => {
    scenario.country = 'Espagne'
    await expect(updateProfile({ fullName: 'Marie B.', schoolName: '  ' })).rejects.toThrow()
    expect(schoolWrites()).toEqual([])
  })
})
