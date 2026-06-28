import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

let user: { id: string } | null
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: async (request: NextRequest) => ({
    supabaseResponse: NextResponse.next({ request }),
    user,
  }),
}))

// Used only by middleware's logged-in isAuthRoute branch to look up role.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role: 'organizer', full_name: 'Org' } }) }),
      }),
    }),
  }),
}))

import { middleware } from '@/middleware'

beforeEach(() => { user = null })

function req(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
}

describe('middleware', () => {
  it('lets a logged-out visitor reach / (no redirect)', async () => {
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('lets a logged-out visitor reach /signup (no redirect)', async () => {
    const res = await middleware(req('/signup'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects a logged-in visitor away from /signup to their dashboard', async () => {
    user = { id: 'u1' }
    const res = await middleware(req('/signup'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('still redirects a logged-out visitor on a gated route to /login', async () => {
    const res = await middleware(req('/dashboard'))
    expect(res.headers.get('location')).toContain('/login')
  })
})
