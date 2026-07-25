import { describe, it, expect, vi, beforeEach } from 'vitest'

interface AdminOpts {
  existingUser?: { id: string } | null
  schoolInsert?: { data: { id: string } | null; error: unknown }
  usersInsertError?: unknown
  // The status set_initial_user_status() assigned, read back by the insert.
  insertedStatus?: 'pending' | 'approved'
  // Rows school_registry returns for the exact (uai, name) probe and the
  // UAI-only fallback. null on both models a UAI the registry does not carry.
  registry?: { uai: string; name: string } | null
}

let admin: ReturnType<typeof makeAdmin>

function makeAdmin(opts: AdminOpts = {}) {
  const {
    existingUser = null,
    schoolInsert = { data: { id: 'school-1' }, error: null },
    usersInsertError = null,
    insertedStatus = 'pending',
    registry = { uai: '0690123X', name: 'Lycée Jean Moulin' },
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
          insert: (row: unknown) => {
            calls.usersInserted.push(row)
            return {
              select: () => ({
                single: async () => ({
                  data: usersInsertError ? null : { status: insertedStatus },
                  error: usersInsertError,
                }),
              }),
            }
          },
        }
      }
      if (table === 'schools') {
        return {
          insert: (row: unknown) => { calls.schoolsInserted.push(row); return { select: () => ({ single: async () => schoolInsert }) } },
          delete: () => ({ eq: async (_col: string, id: string) => { calls.schoolsDeleted.push(id); return { error: null } } }),
        }
      }
      if (table === 'school_registry') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: registry, error: null }) }) }) }),
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: registry, error: null }) }) }),
            }),
          }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
  return client
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const sendSignupRequestEmail = vi.fn(async (_opts: Record<string, unknown>) => {})
const sendSignupFailureEmail = vi.fn(async (_opts: Record<string, unknown>) => {})
vi.mock('@/lib/email', () => ({
  sendSignupRequestEmail: (o: Record<string, unknown>) => sendSignupRequestEmail(o),
  sendSignupFailureEmail: (o: Record<string, unknown>) => sendSignupFailureEmail(o),
}))

import { provisionOrganizer, provisionOrganizerFromOAuth } from '@/lib/auth/provision'

const baseUser = {
  id: 'u1',
  email: 'Org@Example.com',
  user_metadata: {
    full_name: '  Jane Doe  ',
    school_uai: '0690123X',
    school_name: 'Lycée Jean Moulin',
    school_country: 'FR',
    role_description: '  Professeure  ',
    how_found_us: '  Recommandation  ',
  },
}

beforeEach(() => {
  admin = makeAdmin()
  sendSignupRequestEmail.mockClear()
  sendSignupFailureEmail.mockClear()
})

describe('provisionOrganizer', () => {
  it('creates the registry-resolved school and a pending organizer profile', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([
      { name: 'Lycée Jean Moulin', uai: '0690123X', country: 'FR' },
    ])
    expect(admin.calls.usersInserted).toEqual([
      {
        id: 'u1', school_id: 'school-1', role: 'organizer', org_role: 'owner',
        full_name: 'Jane Doe', email: 'org@example.com',
        role_description: 'Professeure', how_found_us: 'Recommandation',
      },
    ])
  })

  it('notifies the platform admins about a pending request', async () => {
    await provisionOrganizer(baseUser)
    expect(sendSignupRequestEmail).toHaveBeenCalledTimes(1)
    expect(sendSignupRequestEmail.mock.calls[0][0]).toMatchObject({
      email: 'org@example.com',
      schoolLabel: 'Lycée Jean Moulin',
      roleDescription: 'Professeure',
      viaGoogle: false,
    })
  })

  it('reports approved for an allowlisted address, and sends no request email', async () => {
    admin = makeAdmin({ insertedStatus: 'approved' })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(sendSignupRequestEmail).not.toHaveBeenCalled()
  })

  it('is idempotent: no writes when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'u1' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(admin.calls.schoolsInserted).toEqual([])
    expect(admin.calls.usersInserted).toEqual([])
  })

  it('refuses a UAI the registry does not carry', async () => {
    admin = makeAdmin({ registry: null })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'unknown_school' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })

  it('still provisions when no school was picked', async () => {
    const result = await provisionOrganizer({
      id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'A' },
    })
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '', uai: null, country: 'FR' }])
  })

  it('rolls back the school and alerts when the profile insert fails', async () => {
    admin = makeAdmin({ usersInsertError: { message: 'boom' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'profile_insert_failed' })
    expect(admin.calls.schoolsDeleted).toEqual(['school-1'])
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'org@example.com', reason: 'profile_insert_failed',
    })
  })

  it('alerts when the school insert fails', async () => {
    admin = makeAdmin({ schoolInsert: { data: null, error: { message: 'boom' } } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'school_insert_failed' })
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'org@example.com', reason: 'school_insert_failed',
    })
  })

  it('fails without creating anything when the full name is missing', async () => {
    const result = await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(result).toEqual({ ok: false, reason: 'missing_metadata' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })
})

const oauthUser = {
  id: 'g1',
  email: 'Org@Example.com',
  user_metadata: { full_name: '  Jane Google  ' },
}

describe('provisionOrganizerFromOAuth', () => {
  it('creates a school with an empty name and an organizer profile from the Google identity', async () => {
    const result = await provisionOrganizerFromOAuth(oauthUser)
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '', uai: null, country: 'FR' }])
    expect(admin.calls.usersInserted).toEqual([
      {
        id: 'g1', school_id: 'school-1', role: 'organizer', org_role: 'owner',
        full_name: 'Jane Google', email: 'org@example.com',
        role_description: null, how_found_us: null,
      },
    ])
  })

  it('flags the request as a Google signup with no details', async () => {
    await provisionOrganizerFromOAuth(oauthUser)
    expect(sendSignupRequestEmail.mock.calls[0][0]).toMatchObject({
      viaGoogle: true, schoolLabel: '—', roleDescription: '—', howFoundUs: '—',
    })
  })

  it('falls back to the name field when full_name is absent', async () => {
    const result = await provisionOrganizerFromOAuth({
      id: 'g1', email: 'a@b.com', user_metadata: { name: 'From Name' },
    })
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.usersInserted[0]).toMatchObject({ full_name: 'From Name' })
  })

  it('is idempotent when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'g1' } })
    const result = await provisionOrganizerFromOAuth(oauthUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(admin.calls.usersInserted).toEqual([])
  })
})
