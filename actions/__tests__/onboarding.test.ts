import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  user: { id: string } | null
  role: string
  rpc: { name: string; args: any } | null
  rpcResult: string | null
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from() {
      const b: any = {
        select: () => b, eq: () => b,
        single: async () => ({
          data: {
            id: 'u1', role: scenario.role, school_id: 's-1', full_name: 'Marie B.',
            email: 'a@b.com', org_role: 'owner', locale: 'fr',
            schools: { name: '', country: 'FR' },
          },
        }),
      }
      return b
    },
    rpc: async (name: string, args: any) => {
      scenario.rpc = { name, args }
      return { data: scenario.rpcResult, error: null }
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
const sendUnverifiedSchoolEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email', () => ({
  sendUnverifiedSchoolEmail: (...a: unknown[]) => sendUnverifiedSchoolEmail(...a),
}))

import { completeOnboarding } from '@/actions/onboarding'

beforeEach(() => {
  sendUnverifiedSchoolEmail.mockClear()
  scenario = { user: { id: 'u1' }, role: 'organizer', rpc: null, rpcResult: null }
})

describe('completeOnboarding — France', () => {
  it('claims the establishment by UAI and returns the registry name', async () => {
    scenario.rpcResult = 'Lycée Chevreul Lestonnac'
    const res = await completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' })
    expect(res).toEqual({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
    expect(scenario.rpc).toEqual({
      name: 'claim_school',
      args: { p_country: 'FR', p_uai: '0690574Z', p_name: null },
    })
  })

  it('ignores a client-supplied name — the registry row wins', async () => {
    scenario.rpcResult = 'Lycée Chevreul Lestonnac'
    const res = await completeOnboarding({ country: 'FR', uai: '0690574Z', name: 'Nom Falsifié' })
    expect(res).toEqual({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
    expect(scenario.rpc!.args.p_name).toBeNull()
  })

  it('rejects an unknown UAI with a structured result, never a throw', async () => {
    scenario.rpcResult = null
    const res = await completeOnboarding({ country: 'FR', uai: 'NOSUCH', name: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('unknown_school')
  })

  it('rejects a missing UAI before touching the database', async () => {
    const res = await completeOnboarding({ country: 'FR', uai: null, name: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid')
    expect(scenario.rpc).toBeNull()
  })

  it('sends no ops notification for a verified French school', async () => {
    scenario.rpcResult = 'Lycée Chevreul Lestonnac'
    await completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' })
    expect(sendUnverifiedSchoolEmail).not.toHaveBeenCalled()
  })
})

describe('completeOnboarding — other countries', () => {
  it('stores the typed name and notifies ops', async () => {
    scenario.rpcResult = 'Colegio San Miguel'
    const res = await completeOnboarding({
      country: 'Espagne', uai: null, name: '  Colegio San Miguel  ',
    })
    expect(res).toEqual({ ok: true, schoolName: 'Colegio San Miguel' })
    expect(scenario.rpc).toEqual({
      name: 'claim_school',
      args: { p_country: 'Espagne', p_uai: null, p_name: 'Colegio San Miguel' },
    })
    expect(sendUnverifiedSchoolEmail).toHaveBeenCalledWith({
      schoolName: 'Colegio San Miguel', country: 'Espagne', organizerName: 'Marie B.',
    })
  })

  it('rejects an empty name before touching the database', async () => {
    const res = await completeOnboarding({ country: 'Espagne', uai: null, name: '   ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid')
    expect(scenario.rpc).toBeNull()
  })

  it('rejects an empty country', async () => {
    const res = await completeOnboarding({ country: '  ', uai: null, name: 'Something' })
    expect(res.ok).toBe(false)
    expect(scenario.rpc).toBeNull()
  })

  it('still succeeds when the ops notification fails', async () => {
    scenario.rpcResult = 'Colegio San Miguel'
    sendUnverifiedSchoolEmail.mockRejectedValueOnce(new Error('resend down'))
    const res = await completeOnboarding({ country: 'Espagne', uai: null, name: 'Colegio San Miguel' })
    expect(res.ok).toBe(true)
  })
})

describe('completeOnboarding — auth', () => {
  it('rejects a non-organizer caller', async () => {
    scenario.role = 'student'
    await expect(completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' }))
      .rejects.toThrow('Unauthorized')
  })

  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    await expect(completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' }))
      .rejects.toThrow('Unauthenticated')
  })
})
