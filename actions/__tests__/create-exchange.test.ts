import { describe, it, expect, vi, beforeEach } from 'vitest'

let opts: {
  role?: string; ownSchoolName?: string; ownSchoolError?: unknown
  subStatus?: string; plan?: string; exchangeCount?: number; orgRole?: string
}
let calls: { schoolUpdated: any; partnerInserted: any; exchangeInserted: any; fromTables: string[] }

function makeClient() {
  calls = { schoolUpdated: null, partnerInserted: null, exchangeInserted: null, fromTables: [] }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      calls.fromTables.push(table)
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: {
          school_id: 's-own', role: opts.role ?? 'organizer',
          org_role: opts.orgRole ?? 'owner', full_name: 'Owner', email: 'owner@s.fr',
          status: 'approved',
        } }) }) }) }
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
          insert: (row: any) => {
            calls.exchangeInserted = row
            return { select: () => ({ single: async () => ({ data: { id: 'new-ex' }, error: null }) }) }
          },
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }))
vi.mock('@/lib/team/invite', () => ({ createAndSendOrganizerInvite: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.test' }))

import { createExchange } from '../exchanges'
import { EXCHANGE_LIMIT_MESSAGE, EXCHANGE_INVALID_MESSAGE } from '@/lib/billing/exchange-limit'
import { createAndSendOrganizerInvite } from '@/lib/team/invite'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const base = { name: 'France–Canada' }

function formWith(fields: Record<string, string>, invites: string[] = []): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  for (const e of invites) fd.append('invite_email', e)
  return fd
}

beforeEach(() => {
  opts = {}
  ;(createAndSendOrganizerInvite as any).mockReset?.()
})

describe('createExchange own-school fetch', () => {
  it('creates the exchange with a null partner school and current-year default', async () => {
    opts = { ownSchoolName: '' }
    await createExchange(form(base))
    expect(calls.schoolUpdated).toBeNull()
    expect(calls.partnerInserted).toBeNull()
    expect(calls.exchangeInserted).toMatchObject({
      name: 'France–Canada', year: new Date().getFullYear(),
      school_a_id: 's-own', school_b_id: null,
    })
    expect(calls.fromTables).not.toContain('form_templates')
  })

  it('surfaces a read error instead of silently proceeding', async () => {
    opts = { ownSchoolError: { message: 'db down' } }
    await expect(createExchange(form(base))).rejects.toThrow('db down')
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

  it('blocks a trial school at 1 exchange with a limit result (never throws)', async () => {
    opts = { exchangeCount: 1 }
    const result = await createExchange(form(base))
    expect(result).toEqual({ ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE })
    expect(calls.exchangeInserted).toBeNull()
  })

  it('allows a Starter school to create a second exchange', async () => {
    opts = { exchangeCount: 1, subStatus: 'active', plan: 'starter' }
    await createExchange(form(base))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
  })

  it('blocks a Starter school at 2 exchanges with a limit result', async () => {
    opts = { exchangeCount: 2, subStatus: 'active', plan: 'starter' }
    const result = await createExchange(form(base))
    expect(result).toEqual({ ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE })
    expect(calls.exchangeInserted).toBeNull()
  })

  it('returns ok on a successful create', async () => {
    opts = { exchangeCount: 0 }
    const result = await createExchange(form(base))
    expect(result).toEqual({ ok: true })
  })
})

describe('createExchange validation', () => {
  it('returns an invalid result for a blank name instead of throwing', async () => {
    const result = await createExchange(form({ name: '   ' }))
    expect(result).toEqual({ ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE })
    expect(calls.exchangeInserted).toBeNull()
  })
})

describe('createExchange collaborator invites', () => {
  it('sends best-effort invites for an owner and returns ok on full success', async () => {
    ;(createAndSendOrganizerInvite as any).mockResolvedValue({ ok: true })
    const result = await createExchange(formWith(base, ['a@x.fr', 'b@x.fr']))
    expect(createAndSendOrganizerInvite).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ok: true })
  })

  it('still creates the exchange and returns inviteErrors when an invite fails', async () => {
    ;(createAndSendOrganizerInvite as any)
      .mockResolvedValueOnce({ ok: false, message: 'Adresse e-mail invalide.' })
      .mockResolvedValueOnce({ ok: true })
    const result = await createExchange(formWith(base, ['bad', 'b@x.fr']))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
    expect(result).toEqual({ ok: true, inviteErrors: [{ email: 'bad', message: 'Adresse e-mail invalide.' }] })
  })

  it('still creates the exchange and returns a generic inviteError when an invite rejects unexpectedly', async () => {
    ;(createAndSendOrganizerInvite as any)
      .mockRejectedValueOnce(new Error('infra'))
      .mockResolvedValueOnce({ ok: true })
    const result = await createExchange(formWith(base, ['bad@x.fr', 'b@x.fr']))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
    expect(result).toEqual({
      ok: true,
      inviteErrors: [{ email: 'bad@x.fr', message: 'L’invitation n’a pas pu être envoyée. Réessayez.' }],
    })
  })

  it('skips invites entirely for an admin caller', async () => {
    ;(createAndSendOrganizerInvite as any).mockResolvedValue({ ok: true })
    opts = { orgRole: 'admin' }
    const result = await createExchange(formWith(base, ['a@x.fr']))
    expect(createAndSendOrganizerInvite).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })
})
