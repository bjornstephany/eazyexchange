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
  // A PostgREST error on the registry probes — what a bad service-role key
  // produces. Distinct from `registry: null`, which is a genuine miss.
  registryError?: unknown
}

let admin: ReturnType<typeof makeAdmin>

function makeAdmin(opts: AdminOpts = {}) {
  const {
    existingUser = null,
    schoolInsert = { data: { id: 'school-1' }, error: null },
    usersInsertError = null,
    insertedStatus = 'pending',
    registry = { uai: '0690123X', name: 'Lycée Jean Moulin' },
    registryError = null,
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
        const probe = async () => ({
          data: registryError ? null : registry,
          error: registryError,
        })
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: probe }) }) }),
              order: () => ({ limit: () => ({ maybeSingle: probe }) }),
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

// The mocks take real async time on purpose: a fire-and-forget (`void`) call
// would still be in flight when provisionOrganizer returns, so `delivered`
// distinguishes an awaited send from a dropped one. On serverless the dropped
// one never arrives — which is how a broken service-role key stayed silent.
const delivered = { request: false, failure: false }
const sendSignupRequestEmail = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 5))
  delivered.request = true
})
const sendSignupFailureEmail = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 5))
  delivered.failure = true
})
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
  delivered.request = false
  delivered.failure = false
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

  it('alerts when the UAI is genuinely absent from the registry', async () => {
    admin = makeAdmin({ registry: null })
    await provisionOrganizer(baseUser)
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'org@example.com', reason: 'unknown_school',
    })
  })

  // The failure that actually happened in production on 2026-07-27: a stale
  // service-role key made every registry probe 401. Reading only `.data` made
  // that indistinguishable from "no such school", so the one branch that sends
  // no alert swallowed a total outage.
  it('distinguishes a failed registry lookup from an unknown school', async () => {
    admin = makeAdmin({ registryError: { message: 'Invalid API key' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'school_lookup_failed' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })

  it('alerts when the registry lookup fails', async () => {
    admin = makeAdmin({ registryError: { message: 'Invalid API key' } })
    await provisionOrganizer(baseUser)
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'org@example.com', reason: 'school_lookup_failed',
    })
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

  it('alerts when metadata is missing', async () => {
    await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'a@b.com', reason: 'missing_metadata',
    })
  })

  // A `void` send is dropped when the serverless function freezes after the
  // response — precisely when the alert matters most. send() already swallows
  // its own errors, so awaiting cannot fail the signup.
  it('waits for the failure alert to be delivered before returning', async () => {
    admin = makeAdmin({ registryError: { message: 'Invalid API key' } })
    await provisionOrganizer(baseUser)
    expect(delivered.failure).toBe(true)
  })

  it('waits for the admin notification to be delivered before returning', async () => {
    await provisionOrganizer(baseUser)
    expect(delivered.request).toBe(true)
  })

  it('logs the failure reason without leaking the address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    admin = makeAdmin({ registryError: { message: 'Invalid API key' } })
    await provisionOrganizer(baseUser)
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('school_lookup_failed')
    expect(logged).not.toContain('org@example.com')
    spy.mockRestore()
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
