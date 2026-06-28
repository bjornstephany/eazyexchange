import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }))

let user: { id: string } | null
let role: string
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }),
    }),
  }),
}))

import RootPage from '@/app/page'

beforeEach(() => {
  redirect.mockClear()
  user = null
  role = 'organizer'
})

describe('RootPage', () => {
  it('redirects a logged-in organizer to /dashboard', async () => {
    user = { id: 'u1' }
    role = 'organizer'
    await RootPage()
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects a logged-in student to /my-forms', async () => {
    user = { id: 'u2' }
    role = 'student'
    await RootPage()
    expect(redirect).toHaveBeenCalledWith('/my-forms')
  })

  it('renders the landing page (no redirect) for logged-out visitors', async () => {
    user = null
    const result = await RootPage()
    expect(redirect).not.toHaveBeenCalled()
    expect(result).toBeTruthy()
  })
})
