import { describe, it, expect, vi, beforeEach } from 'vitest'

let callerRole: 'owner' | 'admin'
let target: { id: string; role: string; org_role: string; school_id: string } | null
let deleteUserError: unknown
let reassigns: { table: string; set: Record<string, unknown>; where: string }[]
let deletedUser: string | null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({}),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'owner-1' }),
  getProfile: async () => ({
    role: 'organizer', school_id: 's-1', full_name: 'Owner', email: 'owner@s.fr',
    org_role: callerRole,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'users') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: target }) }) }),
        update: (set: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { reassigns.push({ table, set, where: id }); return Promise.resolve({ error: null }) } }),
      }
      return {
        update: (set: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { reassigns.push({ table, set, where: id }); return Promise.resolve({ error: null }) } }),
      }
    },
    auth: { admin: { deleteUser: async (id: string) => { deletedUser = id; return { error: deleteUserError ?? null } } } },
  }),
}))

import { removeOrganizer } from '@/actions/settings'

beforeEach(() => {
  callerRole = 'owner'
  target = { id: 'admin-9', role: 'organizer', org_role: 'admin', school_id: 's-1' }
  deleteUserError = null
  reassigns = []
  deletedUser = null
})

describe('removeOrganizer', () => {
  it('reassigns FKs to the owner BEFORE deleting the target', async () => {
    await removeOrganizer('admin-9')
    const tables = reassigns.map(r => r.table)
    expect(tables).toEqual(['form_templates', 'submissions', 'applications', 'organizer_invites'])
    expect(reassigns.every(r => r.where === 'admin-9')).toBe(true)
    expect(reassigns[0].set).toEqual({ created_by: 'owner-1' })
    expect(reassigns[1].set).toEqual({ reviewer_id: 'owner-1' })
    expect(reassigns[3].set).toEqual({ invited_by: 'owner-1' })
    expect(deletedUser).toBe('admin-9')
  })

  it('rejects a non-owner caller', async () => {
    callerRole = 'admin'
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Réservé au propriétaire du compte.')
    expect(deletedUser).toBeNull()
  })

  it('rejects removing the owner (target org_role=owner)', async () => {
    target = { id: 'admin-9', role: 'organizer', org_role: 'owner', school_id: 's-1' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Ce collaborateur est introuvable.')
    expect(deletedUser).toBeNull()
  })

  it('rejects a target from another school', async () => {
    target = { id: 'admin-9', role: 'organizer', org_role: 'admin', school_id: 's-OTHER' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Ce collaborateur est introuvable.')
    expect(deletedUser).toBeNull()
  })

  it('rejects a student target', async () => {
    target = { id: 'admin-9', role: 'student', org_role: 'admin', school_id: 's-1' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Ce collaborateur est introuvable.')
  })

  it('rejects an unknown id', async () => {
    target = null
    await expect(removeOrganizer('nope')).rejects.toThrow('Ce collaborateur est introuvable.')
  })

  it('throws a clean message if auth deletion fails', async () => {
    deleteUserError = { message: 'boom' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Le collaborateur n’a pas pu être retiré. Réessayez.')
  })
})
