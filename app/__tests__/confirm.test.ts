import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

let verifyResult: { data: { user: unknown }; error: unknown }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp: async () => verifyResult } }),
}))

const provisionOrganizer = vi.fn(async () => ({ ok: true }) as { ok: boolean; reason?: string })
vi.mock('@/lib/auth/provision', () => ({ provisionOrganizer: (u: unknown) => provisionOrganizer(u) }))

import { GET } from '@/app/auth/confirm/route'

function req(qs: string) {
  return new NextRequest(new URL(`http://localhost/auth/confirm?${qs}`))
}
async function getRedirect(qs: string): Promise<string> {
  try { await GET(req(qs)) } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

beforeEach(() => {
  redirect.mockClear()
  provisionOrganizer.mockClear()
  verifyResult = { data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } }, error: null }
})

describe('GET /auth/confirm', () => {
  it('provisions and redirects to next on a successful signup confirmation', async () => {
    const dest = await getRedirect('token_hash=h&type=signup&next=/dashboard')
    expect(provisionOrganizer).toHaveBeenCalledTimes(1)
    expect(dest).toBe('/dashboard')
  })

  it('redirects to signup_failed when provisioning fails', async () => {
    provisionOrganizer.mockResolvedValueOnce({ ok: false, reason: 'profile_insert_failed' })
    const dest = await getRedirect('token_hash=h&type=signup&next=/dashboard')
    expect(dest).toBe('/login?error=signup_failed')
  })

  it('does not provision for non-signup types', async () => {
    const dest = await getRedirect('token_hash=h&type=invite&next=/accept-invite')
    expect(provisionOrganizer).not.toHaveBeenCalled()
    expect(dest).toBe('/accept-invite')
  })

  it('redirects to invite_invalid when verification fails', async () => {
    verifyResult = { data: { user: null }, error: { message: 'bad' } }
    const dest = await getRedirect('token_hash=h&type=signup&next=/dashboard')
    expect(dest).toBe('/login?error=invite_invalid')
  })
})
