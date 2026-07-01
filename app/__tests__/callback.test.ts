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
const deleteUser = vi.fn(async () => ({ error: null }))
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

const provisionOrganizerFromOAuth = vi.fn(async (_u: unknown) => ({ ok: true }) as { ok: boolean })
vi.mock('@/lib/auth/provision', () => ({
  provisionOrganizerFromOAuth: (u: unknown) => provisionOrganizerFromOAuth(u),
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
  provisionOrganizerFromOAuth.mockClear(); usersUpdated.length = 0
  exchangeResult = { data: { user: { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Stu Dent' } } }, error: null }
  profile = null
  profileError = null
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

  it('provisions a new organizer when intent=organizer_signup and no profile exists', async () => {
    const dest = await getRedirect('code=x&intent=organizer_signup&next=/dashboard')
    expect(provisionOrganizerFromOAuth).toHaveBeenCalledTimes(1)
    expect(dest).toBe('/dashboard')
  })

  it('redirects signup_failed when provisioning fails', async () => {
    provisionOrganizerFromOAuth.mockResolvedValueOnce({ ok: false })
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
