import { describe, it, expect, vi, beforeEach } from 'vitest'

interface AdminOpts {
  existingUser?: { id: string } | null
  schoolInsert?: { data: { id: string } | null; error: unknown }
  usersInsertError?: unknown
  // The status set_initial_user_status() assigned, read back by the insert.
  insertedStatus?: 'pending' | 'approved'
}

let admin: ReturnType<typeof makeAdmin>

function makeAdmin(opts: AdminOpts = {}) {
  const {
    existingUser = null,
    schoolInsert = { data: { id: 'school-1' }, error: null },
    usersInsertError = null,
    insertedStatus = 'pending',
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
      // school_registry is deliberately absent: provisioning no longer reads it.
      // A stray probe must blow up loudly rather than pass on a permissive mock.
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
const delivered = { failure: false }
const sendSignupFailureEmail = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 5))
  delivered.failure = true
})
vi.mock('@/lib/email', () => ({
  sendSignupFailureEmail: (o: Record<string, unknown>) => sendSignupFailureEmail(o),
}))

import { provisionOrganizer } from '@/lib/auth/provision'

const baseUser = {
  id: 'u1',
  email: 'Org@Example.com',
  user_metadata: { full_name: '  Jane Doe  ' },
}

beforeEach(() => {
  admin = makeAdmin()
  sendSignupFailureEmail.mockClear()
  delivered.failure = false
})

describe('provisionOrganizer', () => {
  // The school is created blank on every path, and nothing names it any more:
  // /onboarding step 1 was the only writer (through claim_school()) and was
  // removed on 2026-08-13. Provisioning has no school to resolve and no
  // registry to read.
  it('creates a blank school and a pending organizer profile', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '', uai: null, country: 'FR' }])
    expect(admin.calls.usersInserted).toEqual([
      {
        id: 'u1', school_id: 'school-1', role: 'organizer', org_role: 'owner',
        full_name: 'Jane Doe', email: 'org@example.com', locale: 'en',
      },
    ])
  })

  // A real French-market signup must not silently land in an English app —
  // actions/invitations.ts:140 seeds a student's profile the same way, from
  // whatever locale signal the caller could read off the request.
  it('seeds the locale the caller resolved off the request', async () => {
    await provisionOrganizer(baseUser, 'fr')
    expect(admin.calls.usersInserted[0]).toMatchObject({ locale: 'fr' })
  })

  it('falls back to en for an unsupported or missing locale', async () => {
    await provisionOrganizer(baseUser, 'pt')
    expect(admin.calls.usersInserted[0]).toMatchObject({ locale: 'en' })

    admin = makeAdmin()
    await provisionOrganizer(baseUser)
    expect(admin.calls.usersInserted[0]).toMatchObject({ locale: 'en' })
  })

  it('creates the same blank school for a Google identity', async () => {
    const result = await provisionOrganizer({
      id: 'g1', email: 'Org@Example.com', user_metadata: { full_name: '  Jane Google  ' },
    })
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '', uai: null, country: 'FR' }])
    expect(admin.calls.usersInserted[0]).toMatchObject({ full_name: 'Jane Google' })
  })

  it('falls back to the name field when full_name is absent', async () => {
    const result = await provisionOrganizer({
      id: 'g1', email: 'a@b.com', user_metadata: { name: 'From Name' },
    })
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.usersInserted[0]).toMatchObject({ full_name: 'From Name' })
  })

  // Since the waitlist change, a self-signup can only reach provisioning if its
  // address is already on signup_allowlist — and set_initial_user_status()
  // auto-approves those. A `pending` result therefore means the application
  // check and the DB trigger disagreed: alert on it rather than silently
  // stranding the account on /pending.
  it('alerts when an account unexpectedly lands pending', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(sendSignupFailureEmail).toHaveBeenCalledTimes(1)
    expect(sendSignupFailureEmail.mock.calls[0][0]).toEqual({
      email: 'org@example.com', reason: 'unexpected_pending_status',
    })
    expect(delivered.failure).toBe(true)
  })

  it('reports approved for an allowlisted address, and sends nothing', async () => {
    admin = makeAdmin({ insertedStatus: 'approved' })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(sendSignupFailureEmail).not.toHaveBeenCalled()
  })

  it('is idempotent: no writes when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'u1' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(admin.calls.schoolsInserted).toEqual([])
    expect(admin.calls.usersInserted).toEqual([])
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
    admin = makeAdmin({ schoolInsert: { data: null, error: { message: 'boom' } } })
    await provisionOrganizer(baseUser)
    expect(delivered.failure).toBe(true)
  })

  it('logs the failure reason without leaking the address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    admin = makeAdmin({ schoolInsert: { data: null, error: { message: 'boom' } } })
    await provisionOrganizer(baseUser)
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('school_insert_failed')
    expect(logged).not.toContain('org@example.com')
    spy.mockRestore()
  })
})
