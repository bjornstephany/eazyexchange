import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every expected failure of acceptOrganizerInvite must come back as a
// structured result: production replaces thrown Server Action messages with an
// opaque digest, so a throw here is a hex string in the organizer's face.
type Scenario = {
  rate: 'allowed' | 'limited' | 'error'
  inviteRow: Record<string, unknown> | null
  claimed: { id: string }[]
  pwned: boolean
  createError: { code?: string } | null
  createdUser: { user: { id: string } } | null
  profileError: { message: string } | null
  updates: Record<string, unknown>[]
  insertedUser: Record<string, unknown> | null
  deleted: string[]
}
let scenario: Scenario

const future = () => new Date(Date.now() + 86_400_000).toISOString()
const past = () => new Date(Date.now() - 86_400_000).toISOString()
const INVITE = {
  id: 'inv-1', school_id: 's-1', email: 'collegue@lycee.fr',
  expires_at: future(), accepted_at: null, revoked_at: null,
  schools: { name: 'Lycée Mistral' },
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          insert: async (row: Record<string, unknown>) => {
            scenario.insertedUser = row
            return { error: scenario.profileError }
          },
        }
      }
      // organizer_invites: one chainable builder covering the lookup, the
      // single-use claim, and the rollback update.
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.is = () => chain
      chain.update = (patch: Record<string, unknown>) => {
        scenario.updates.push(patch)
        return chain
      }
      chain.maybeSingle = async () => ({ data: scenario.inviteRow })
      // Awaiting the chain (claim / rollback) resolves to the claim result.
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: scenario.claimed })
      return chain
    },
    auth: {
      admin: {
        createUser: async () => ({ data: scenario.createdUser, error: scenario.createError }),
        deleteUser: async (id: string) => { scenario.deleted.push(id); return { error: null } },
      },
    },
  }),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => scenario.rate,
  clientIp: async () => '203.0.113.7',
}))
vi.mock('@/lib/auth/hibp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/hibp')>('@/lib/auth/hibp')
  return { ...actual, isPasswordPwned: async () => scenario.pwned }
})

import { acceptOrganizerInvite } from '@/actions/join'
import { JOIN_ERROR_MESSAGES, type JoinErrorCode } from '@/lib/team/join-result'

beforeEach(() => {
  scenario = {
    rate: 'allowed',
    inviteRow: { ...INVITE },
    claimed: [{ id: 'inv-1' }],
    pwned: false,
    createError: null,
    createdUser: { user: { id: 'new-user' } },
    profileError: null,
    updates: [],
    insertedUser: null,
    deleted: [],
  }
})

const accept = () => acceptOrganizerInvite('tok', 'Claire Nguyen', 'longenough')

/** Asserts the call resolved (never threw) with the given error code. */
async function expectError(
  promise: Promise<Awaited<ReturnType<typeof acceptOrganizerInvite>>>,
  code: JoinErrorCode,
) {
  const result = await promise
  expect(result).toEqual({ ok: false, error: code, message: JOIN_ERROR_MESSAGES[code] })
  return result
}

describe('acceptOrganizerInvite', () => {
  it('creates the account and returns the invited e-mail', async () => {
    const result = await accept()
    expect(result).toEqual({ ok: true, email: 'collegue@lycee.fr' })
    expect(scenario.insertedUser).toMatchObject({
      id: 'new-user', school_id: 's-1', role: 'organizer',
      org_role: 'admin', full_name: 'Claire Nguyen', email: 'collegue@lycee.fr',
    })
    expect(scenario.deleted).toEqual([])
  })

  it('returns rate_limited instead of throwing the English enforce message', async () => {
    scenario.rate = 'limited'
    await expectError(accept(), 'rate_limited')
    // Nothing was touched: no claim, no account.
    expect(scenario.updates).toEqual([])
    expect(scenario.insertedUser).toBeNull()
  })

  it('fails OPEN when the rate-limit check itself errors', async () => {
    scenario.rate = 'error'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await accept()).toEqual({ ok: true, email: 'collegue@lycee.fr' })
    spy.mockRestore()
  })

  it.each([
    ['no matching token', null, 'invalid'],
    ['an expired token', { ...INVITE, expires_at: past() }, 'expired'],
    ['a revoked token', { ...INVITE, revoked_at: past() }, 'revoked'],
    ['an already-used token', { ...INVITE, accepted_at: past() }, 'accepted'],
  ] as const)('reports %s as a value', async (_label, row, code) => {
    scenario.inviteRow = row
    await expectError(accept(), code)
    expect(scenario.insertedUser).toBeNull()
  })

  it('requires a full name', async () => {
    await expectError(acceptOrganizerInvite('tok', '   ', 'longenough'), 'name_required')
  })

  it('reports a too-short password as a value, not a digest', async () => {
    await expectError(acceptOrganizerInvite('tok', 'Claire Nguyen', 'court'), 'password_too_short')
    expect(scenario.insertedUser).toBeNull()
  })

  it('reports a leaked password as a value, not a digest', async () => {
    scenario.pwned = true
    await expectError(accept(), 'password_leaked')
    expect(scenario.insertedUser).toBeNull()
  })

  it('reports the lost single-use race as accepted', async () => {
    scenario.claimed = []
    await expectError(accept(), 'accepted')
    expect(scenario.insertedUser).toBeNull()
  })

  it('reports an existing account and releases the invite', async () => {
    scenario.createError = { code: 'email_exists' }
    scenario.createdUser = null
    await expectError(accept(), 'email_exists')
    expect(scenario.updates.at(-1)).toEqual({ accepted_at: null })
  })

  it('reports any other creation failure as retryable', async () => {
    scenario.createError = { code: 'unexpected_failure' }
    scenario.createdUser = null
    await expectError(accept(), 'creation_failed')
    expect(scenario.updates.at(-1)).toEqual({ accepted_at: null })
  })

  it('rolls back the auth user and the claim when the profile insert fails', async () => {
    scenario.profileError = { message: 'duplicate key' }
    await expectError(accept(), 'creation_failed')
    expect(scenario.deleted).toEqual(['new-user'])
    expect(scenario.updates.at(-1)).toEqual({ accepted_at: null })
  })
})

describe('JOIN_ERROR_MESSAGES', () => {
  it('carries French copy for every code, with typographic apostrophes', () => {
    for (const [code, message] of Object.entries(JOIN_ERROR_MESSAGES)) {
      expect(message.length, code).toBeGreaterThan(0)
      expect(message, code).not.toMatch(/'/)
    }
  })
})
