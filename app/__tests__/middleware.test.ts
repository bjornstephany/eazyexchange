import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

let user: { id: string } | null
// The users-row the middleware's isAuthRoute branch will find. null models an
// orphaned/stale session: a JWT that still verifies locally (getClaims) but has
// no backing users row (account deleted or DB reset).
let profileRow: { role: string; full_name: string | null } | null
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: async (request: NextRequest) => ({
    supabaseResponse: NextResponse.next({ request }),
    user,
    // Used only by middleware's logged-in isAuthRoute branch to look up role.
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: profileRow }) }),
        }),
      }),
    },
  }),
}))

import { middleware, config } from '@/middleware'

beforeEach(() => { user = null; profileRow = { role: 'organizer', full_name: 'Org' } })

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

  it('does NOT redirect an orphaned session (valid JWT, no users row) off /login', async () => {
    // getClaims accepts the stale JWT so `user` is set, but the users row is
    // gone. Redirecting to /my-forms would bounce off the getUser()-based
    // layout back to /login → infinite loop → blank screen. Let /login render.
    user = { id: 'ghost' }
    profileRow = null
    const res = await middleware(req('/login'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('still redirects a logged-out visitor on a gated route to /login', async () => {
    const res = await middleware(req('/dashboard'))
    expect(res.headers.get('location')).toContain('/login')
  })

  it('lets a logged-out visitor reach /apply/<slug> (no redirect)', async () => {
    const res = await middleware(req('/apply/some-slug'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('lets a logged-out visitor reach /invite/<tok> (no redirect)', async () => {
    const res = await middleware(req('/invite/tok123'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects a logged-in organizer from / to /dashboard', async () => {
    user = { id: 'u1' }
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('redirects a logged-in student from / to /my-forms', async () => {
    user = { id: 'u2' }
    profileRow = { role: 'student', full_name: 'Stu' }
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/my-forms')
  })

  it('does NOT redirect an orphaned session off / (landing page must render)', async () => {
    // Valid JWT but no users row: redirecting would bounce off the getUser()-based
    // layouts back to /login → loop. The landing page is safe to serve instead.
    user = { id: 'ghost' }
    profileRow = null
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('lets the unauthenticated keep-warm pinger reach /api/health (no redirect)', async () => {
    const res = await middleware(req('/api/health'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('lets the unauthenticated pg_cron caller reach /api/cron/* (self-auth via CRON_SECRET)', async () => {
    const res = await middleware(req('/api/cron/retention-sweep'))
    expect(res.headers.get('location')).toBeNull()
  })
})

// The matcher decides which paths the middleware even RUNS on. The public
// next/og metadata image routes have no file extension, so they must be listed
// explicitly here or anonymous crawlers get 302'd to /login (breaking the
// favicon, OG/Twitter cards, and the JSON-LD logo). We validate the matcher
// pattern as a regex; the runtime proof is a post-deploy fetch of /icon etc.
describe('middleware matcher', () => {
  const re = new RegExp(`^${config.matcher[0]}$`)

  it.each(['/icon', '/apple-icon', '/opengraph-image', '/twitter-image'])(
    'excludes the public image route %s from the middleware matcher',
    (path) => {
      expect(re.test(path)).toBe(false)
    },
  )

  it('still runs the middleware on gated app routes', () => {
    expect(re.test('/dashboard')).toBe(true)
    expect(re.test('/my-forms')).toBe(true)
  })

  it('keeps the existing static-asset exclusions', () => {
    expect(re.test('/sitemap.xml')).toBe(false)
    expect(re.test('/robots.txt')).toBe(false)
  })
})
