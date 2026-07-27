import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

let user: { id: string } | null
// The users-row the middleware's isAuthRoute branch will find. null models an
// orphaned/stale session: a JWT that still verifies locally (getClaims) but has
// no backing users row (account deleted or DB reset).
let profileRow: { role: string; full_name: string | null; status: string } | null
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

beforeEach(() => {
  user = null
  profileRow = { role: 'organizer', full_name: 'Org', status: 'approved' }
})

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

  // The signup consent line and the landing footer link here, and robots.ts /
  // sitemap.ts advertise these URLs to anonymous crawlers. Gating them sent every
  // visitor without an account to /login instead of the document they clicked.
  it.each(['/legal/cgu', '/legal/cgv', '/legal/confidentialite', '/legal/mentions-legales'])(
    'lets a logged-out visitor reach %s (no redirect)',
    async (path) => {
      const res = await middleware(req(path))
      expect(res.headers.get('location')).toBeNull()
    }
  )

  it('still serves /legal to a logged-in user without bouncing them to their app', async () => {
    user = { id: 'u1' }
    const res = await middleware(req('/legal/cgv'))
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
    profileRow = { role: 'student', full_name: 'Stu', status: 'approved' }
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/my-forms')
  })

  // The signup approval gate: not approved means /pending is the only page.
  it('redirects a pending organizer from / to /pending', async () => {
    user = { id: 'u3' }
    profileRow = { role: 'organizer', full_name: 'Org', status: 'pending' }
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/pending')
  })

  it('redirects a rejected organizer off /login to /pending', async () => {
    user = { id: 'u4' }
    profileRow = { role: 'organizer', full_name: 'Org', status: 'rejected' }
    const res = await middleware(req('/login'))
    expect(res.headers.get('location')).toContain('/pending')
  })

  // /pending must never be bounced back to itself — that loop is a blank tab.
  it('lets a pending organizer reach /pending itself (no redirect)', async () => {
    user = { id: 'u3' }
    profileRow = { role: 'organizer', full_name: 'Org', status: 'pending' }
    const res = await middleware(req('/pending'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('does NOT redirect an orphaned session off / (landing page must render)', async () => {
    // Valid JWT but no users row: redirecting would bounce off the getUser()-based
    // layouts back to /login → loop. The landing page is safe to serve instead.
    user = { id: 'ghost' }
    profileRow = null
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toBeNull()
  })

  // The gate is the middleware's job, not each page's. The layouts of the
  // (organizer) and (student) groups bounce a non-approved account too, but a
  // route outside those groups — /billing was one — used to render for them.
  describe('non-approved accounts get /pending on every gated route', () => {
    beforeEach(() => {
      user = { id: 'u3' }
      profileRow = { role: 'organizer', full_name: 'Org', status: 'pending' }
    })

    it.each([
      '/billing',
      '/billing/return',
      '/admin',
      '/dashboard',
      '/applications',
      '/settings',
      '/onboarding',
      '/my-forms',
    ])('redirects a pending organizer off %s to /pending', async (path) => {
      const res = await middleware(req(path))
      expect(res.headers.get('location')).toContain('/pending')
    })

    it('redirects a rejected account off /billing too', async () => {
      profileRow = { role: 'organizer', full_name: 'Org', status: 'rejected' }
      const res = await middleware(req('/billing'))
      expect(res.headers.get('location')).toContain('/pending')
    })

    // The service-role money path: no RLS in front of it, so the redirect here
    // is the only thing between a non-approved account and a live Stripe
    // checkout session against their own school.
    it.each(['/billing/checkout?plan=growth', '/billing/portal', '/billing/upgrade?plan=growth'])(
      'redirects a pending organizer off %s to /pending',
      async (path) => {
        const res = await middleware(req(path))
        expect(res.headers.get('location')).toContain('/pending')
      },
    )

    // Public means public: a logged-in pending user is no more and no less
    // privileged than the anonymous visitor sitting next to them.
    it.each(['/legal/cgv', '/apply/some-slug', '/invite/tok123', '/join/tok123', '/api/health'])(
      'still serves the public route %s',
      async (path) => {
        const res = await middleware(req(path))
        expect(res.headers.get('location')).toBeNull()
      },
    )

    it('leaves an approved organizer alone on /billing', async () => {
      profileRow = { role: 'organizer', full_name: 'Org', status: 'approved' }
      const res = await middleware(req('/billing'))
      expect(res.headers.get('location')).toBeNull()
    })

    // Same reasoning as the /login and / cases above: an orphaned session has
    // no status to judge, and bouncing it loops into a blank tab.
    it('does not bounce an orphaned session (no users row) off a gated route', async () => {
      profileRow = null
      const res = await middleware(req('/dashboard'))
      expect(res.headers.get('location')).toBeNull()
    })
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
