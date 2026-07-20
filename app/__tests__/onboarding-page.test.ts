import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))
// Defensive: the page transitively imports the action module.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
let ownedExchangeCount = 0
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: ownedExchangeCount, error: null }),
      }),
    }),
  }),
}))

let authedUser: { id: string } | null
let profile: any
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => authedUser,
  getProfile: async () => profile,
}))

import OnboardingPage from '@/app/onboarding/page'

async function getRedirect(): Promise<string> {
  try { await OnboardingPage() } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

beforeEach(() => {
  redirect.mockClear()
  authedUser = { id: 'u1' }
  profile = { role: 'organizer', school_id: 's-1', schools: { name: '' } }
  ownedExchangeCount = 0
})

describe('OnboardingPage', () => {
  it('redirects unauthenticated visitors to /login', async () => {
    authedUser = null
    expect(await getRedirect()).toBe('/login')
  })

  it('redirects a student to /my-forms', async () => {
    profile = { role: 'student', school_id: 's-1', schools: { name: '' } }
    expect(await getRedirect()).toBe('/my-forms')
  })

  it('redirects a fully-onboarded organizer (named + has exchange) to /dashboard', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    ownedExchangeCount = 2
    expect(await getRedirect()).toBe('/dashboard')
  })

  it('renders (no redirect) for a named school that owns no exchange', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    ownedExchangeCount = 0
    await expect(OnboardingPage()).resolves.toBeTruthy() // renders at step 2
  })

  it('renders (no redirect) for a blank school name', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: '' } }
    await expect(OnboardingPage()).resolves.toBeTruthy() // renders at step 1
  })
})
