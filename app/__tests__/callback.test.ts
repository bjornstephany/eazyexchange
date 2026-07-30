import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

let exchangeResult: { data: { user: any }; error: unknown }
const signOut = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => exchangeResult,
      signOut: () => signOut(),
    },
  }),
}))

let profile: { id: string; role: string; full_name: string } | null
let profileError: unknown = null
const deleteUser = vi.fn(async (_id: string) => ({ error: null }))
const usersUpdated: any[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: profileError }) }) }),
          update: (row: any) => { usersUpdated.push(row); return { eq: async () => ({ error: null }) } },
        }
      }
      throw new Error('unexpected table ' + table)
    },
    auth: { admin: { deleteUser: (id: string) => deleteUser(id) } },
  }),
}))

const provisionOrganizer = vi.fn(async (_u: unknown) => ({ ok: true }) as { ok: boolean })
vi.mock('@/lib/auth/provision', () => ({
  provisionOrganizer: (u: unknown) => provisionOrganizer(u),
}))

let allowlisted = false
const isSignupAllowlisted = vi.fn(async (_e: string) => allowlisted)
const recordWaitlistEntry = vi.fn(async (_e: Record<string, unknown>) => {})
vi.mock('@/lib/auth/waitlist', () => ({
  isSignupAllowlisted: (e: string) => isSignupAllowlisted(e),
  recordWaitlistEntry: (e: Record<string, unknown>) => recordWaitlistEntry(e),
}))

import { GET } from '@/app/auth/callback/route'

function req(qs: string) {
  return new NextRequest(new URL(`http://localhost/auth/callback?${qs}`))
}
async function getRedirect(qs: string): Promise<string> {
  try { await GET(req(qs)) } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

beforeEach(() => {
  redirect.mockClear(); signOut.mockClear(); deleteUser.mockClear()
  provisionOrganizer.mockClear(); usersUpdated.length = 0
  exchangeResult = { data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Stu Dent' } } }, error: null }
  profile = null
  profileError = null
  allowlisted = false
  isSignupAllowlisted.mockClear()
  recordWaitlistEntry.mockClear()
})

describe('GET /auth/callback', () => {
  it('redirects oauth_failed when there is no code', async () => {
    expect(await getRedirect('')).toBe('/login?error=oauth_failed')
  })

  it('redirects oauth_failed when the code exchange fails', async () => {
    exchangeResult = { data: { user: null }, error: { message: 'bad' } }
    expect(await getRedirect('code=x')).toBe('/login?error=oauth_failed')
  })

  it('signs an existing organizer into the dashboard', async () => {
    profile = { id: 'u1', role: 'organizer', full_name: 'Org' }
    expect(await getRedirect('code=x')).toBe('/dashboard')
    expect(usersUpdated).toEqual([])
  })

  it('signs an existing student into my-forms', async () => {
    profile = { id: 'u1', role: 'student', full_name: 'Stu' }
    expect(await getRedirect('code=x')).toBe('/my-forms')
    expect(usersUpdated).toEqual([])
  })

  it('fills the name for a freshly-invited student and sends them to my-forms', async () => {
    profile = { id: 'u1', role: 'student', full_name: '' }
    const dest = await getRedirect('code=x&next=/my-forms')
    expect(usersUpdated).toEqual([{ full_name: 'Stu Dent' }])
    expect(dest).toBe('/my-forms')
  })

  // Both of these are the allowlisted branch — since the 2026-07-30 waitlist
  // change, an address that is not on signup_allowlist never reaches
  // provisionOrganizer at all (see the gate describe block below).
  it('provisions a new organizer when intent=organizer_signup and no profile exists', async () => {
    allowlisted = true
    const dest = await getRedirect('code=x&intent=organizer_signup&next=/dashboard')
    expect(provisionOrganizer).toHaveBeenCalledTimes(1)
    expect(dest).toBe('/dashboard')
  })

  it('redirects signup_failed when provisioning fails', async () => {
    allowlisted = true
    provisionOrganizer.mockResolvedValueOnce({ ok: false })
    expect(await getRedirect('code=x&intent=organizer_signup')).toBe('/login?error=signup_failed')
  })

  it('rejects and deletes an uninvited stranger', async () => {
    const dest = await getRedirect('code=x')
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(deleteUser).toHaveBeenCalledWith('u1')
    expect(dest).toBe('/login?error=not_invited')
  })

  it('ignores an open-redirect next and falls back to the role-based destination', async () => {
    profile = { id: 'u1', role: 'organizer', full_name: 'Org' }
    expect(await getRedirect('code=x&next=//evil.com')).toBe('/dashboard')
  })

  it('honors a safe next override for an existing organizer', async () => {
    profile = { id: 'u1', role: 'organizer', full_name: 'Org' }
    expect(await getRedirect('code=x&next=/exchanges/42')).toBe('/exchanges/42')
  })

  it('redirects oauth_failed on a profile-lookup DB error, without deleting the user', async () => {
    profileError = { message: 'connection reset' }
    expect(await getRedirect('code=x')).toBe('/login?error=oauth_failed')
    expect(deleteUser).not.toHaveBeenCalled()
  })
})

describe('GET /auth/callback — the organizer_signup allowlist gate', () => {
  it('provisions an allowlisted Google signup, as before', async () => {
    allowlisted = true
    exchangeResult = {
      data: { user: { id: 'g1', email: 'Owner@Example.com', user_metadata: { name: 'G Owner' } } },
      error: null,
    }
    const dest = await getRedirect('code=abc&intent=organizer_signup')
    expect(isSignupAllowlisted).toHaveBeenCalledWith('owner@example.com')
    expect(provisionOrganizer).toHaveBeenCalledTimes(1)
    expect(recordWaitlistEntry).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
    expect(dest).toBe('/dashboard')
  })

  // Without this the Google button is a straight bypass of the whole gate.
  it('waitlists a non-allowlisted Google signup and leaves no orphan auth row', async () => {
    exchangeResult = {
      data: { user: { id: 'g2', email: 'Stranger@Example.com', user_metadata: { name: 'A Stranger' } } },
      error: null,
    }
    const dest = await getRedirect('code=abc&intent=organizer_signup')
    expect(recordWaitlistEntry).toHaveBeenCalledWith({
      email: 'stranger@example.com', fullName: 'A Stranger', source: 'google',
    })
    expect(provisionOrganizer).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(deleteUser).toHaveBeenCalledWith('g2')
    expect(dest).toBe('/signup?waitlisted=1')
  })

  it('records a null name when Google supplied none', async () => {
    exchangeResult = {
      data: { user: { id: 'g3', email: 'noname@example.com', user_metadata: {} } },
      error: null,
    }
    await getRedirect('code=abc&intent=organizer_signup')
    expect(recordWaitlistEntry).toHaveBeenCalledWith({
      email: 'noname@example.com', fullName: null, source: 'google',
    })
  })

  // The waitlist row must be written BEFORE the session is dropped — the
  // teardown is what makes the address unrecoverable afterwards.
  it('writes the waitlist row before tearing the session down', async () => {
    const order: string[] = []
    recordWaitlistEntry.mockImplementationOnce(async () => { order.push('waitlist') })
    signOut.mockImplementationOnce(async () => { order.push('signOut'); return { error: null } })
    exchangeResult = {
      data: { user: { id: 'g4', email: 'order@example.com', user_metadata: { name: 'O' } } },
      error: null,
    }
    await getRedirect('code=abc&intent=organizer_signup')
    expect(order).toEqual(['waitlist', 'signOut'])
  })
})
