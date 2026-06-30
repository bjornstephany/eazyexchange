import { describe, it, expect, vi, beforeEach } from 'vitest'

interface AdminOpts {
  existingUser?: { id: string } | null
  schoolInsert?: { data: { id: string } | null; error: unknown }
  usersInsertError?: unknown
}

let admin: ReturnType<typeof makeAdmin>

function makeAdmin(opts: AdminOpts = {}) {
  const {
    existingUser = null,
    schoolInsert = { data: { id: 'school-1' }, error: null },
    usersInsertError = null,
  } = opts
  const calls = {
    schoolsInserted: [] as unknown[],
    usersInserted: [] as unknown[],
    schoolsDeleted: [] as string[],
  }
  const client = {
    calls,
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingUser, error: null }) }) }),
          insert: async (row: unknown) => { calls.usersInserted.push(row); return { error: usersInsertError } },
        }
      }
      if (table === 'schools') {
        return {
          insert: (row: unknown) => { calls.schoolsInserted.push(row); return { select: () => ({ single: async () => schoolInsert }) } },
          delete: () => ({ eq: async (_col: string, id: string) => { calls.schoolsDeleted.push(id); return { error: null } } }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
  return client
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

import { provisionOrganizer } from '@/lib/auth/provision'

const baseUser = {
  id: 'u1',
  email: 'Org@Example.com',
  user_metadata: { full_name: '  Jane Doe  ', school_name: '  Lincoln High  ' },
}

beforeEach(() => { admin = makeAdmin() })

describe('provisionOrganizer', () => {
  it('creates a school and organizer profile when none exists', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true })
    expect(admin.calls.schoolsInserted).toEqual([{ name: 'Lincoln High' }])
    expect(admin.calls.usersInserted).toEqual([
      { id: 'u1', school_id: 'school-1', role: 'organizer', full_name: 'Jane Doe', email: 'org@example.com' },
    ])
  })

  it('is idempotent: no writes when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'u1' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true })
    expect(admin.calls.schoolsInserted).toEqual([])
    expect(admin.calls.usersInserted).toEqual([])
  })

  it('rolls back the school when the profile insert fails', async () => {
    admin = makeAdmin({ usersInsertError: { message: 'boom' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'profile_insert_failed' })
    expect(admin.calls.schoolsDeleted).toEqual(['school-1'])
  })

  it('fails without creating anything when metadata is missing', async () => {
    const result = await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(result).toEqual({ ok: false, reason: 'missing_metadata' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })
})
