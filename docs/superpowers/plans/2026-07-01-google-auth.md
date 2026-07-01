# Google Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Continue with Google" for organizer sign up/in and invited-student sign in/setup, without breaking organizer-self-registration or student-invite-only.

**Architecture:** One new server route, `app/auth/callback/route.ts`, exchanges the OAuth `?code=` for a session and runs a single decision tree (existing user → sign in; new user + organizer intent → provision; otherwise → reject + delete orphan). Intent rides in the `redirectTo` query string. New organizers are provisioned with an empty school name, captured later on the first-exchange form. Students rely on Supabase automatic identity-linking by verified email.

**Tech Stack:** Next.js 14 App Router (route handlers, server actions), Supabase Auth (`@supabase/ssr`), Supabase Postgres + RLS, Tailwind + shadcn/ui, vitest + @testing-library/react.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Verify with `pnpm lint`, `pnpm test`, and `pnpm build` before considering work complete. Locally `pnpm build` fails on placeholder env vars — use `pnpm exec tsc --noEmit` for type checking (see project memory) and rely on `pnpm lint` + `pnpm test`.
- Email-link/OAuth verification handlers under `/auth/*` **must** `redirect()` via `next/navigation` (not `NextResponse.redirect`) so Supabase session cookies flush. `middleware.ts` already passes `/auth/*` through untouched — do not change it.
- **Never log student/parent PII** (names, emails, submission contents).
- RLS: new table access needs a migration; never a client-side service-role workaround. Avoid self-referential/recursive policies — use the existing `my_role()` / `my_school_id()` SECURITY DEFINER helpers.
- `schools.name` is `text NOT NULL`; the empty string `''` is the "name not yet set" sentinel.
- Provisioning result type is `{ ok: true } | { ok: false; reason: string }`.
- Commit after each task once its tests pass (solo project, commit small changes to `main`; this feature is multi-step so work on a branch — see Task 0).

---

### Task 0: Branch

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b feat/google-auth
```

- [ ] **Step 2: Confirm clean baseline**

```bash
pnpm test
```

Expected: existing suite passes.

---

### Task 1: `provisionOrganizerFromOAuth`

Add a provisioning path that sources `full_name` from the Google identity and defers the school name (empty string). Refactor the shared insert logic out of `provisionOrganizer` so both paths stay DRY.

**Files:**
- Modify: `lib/auth/provision.ts`
- Test: `lib/auth/__tests__/provision.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` from `@/lib/supabase/admin`; `ProvisionUser`, `ProvisionResult` (existing exports).
- Produces: `provisionOrganizerFromOAuth(user: ProvisionUser): Promise<ProvisionResult>` — creates a `schools` row with `name: ''` and a `users` row `{ role: 'organizer', full_name: <google name>, email }`. `full_name` comes from `user_metadata.full_name`, falling back to `user_metadata.name`. Idempotent when a profile already exists.

- [ ] **Step 1: Write the failing tests**

Append to `lib/auth/__tests__/provision.test.ts` (the file's `makeAdmin`, `admin`, and `beforeEach` already exist and are reused):

```ts
import { provisionOrganizer, provisionOrganizerFromOAuth } from '@/lib/auth/provision'

const oauthUser = {
  id: 'g1',
  email: 'Org@Example.com',
  user_metadata: { full_name: '  Jane Google  ' },
}

describe('provisionOrganizerFromOAuth', () => {
  it('creates a school with an empty name and an organizer profile from the Google identity', async () => {
    const result = await provisionOrganizerFromOAuth(oauthUser)
    expect(result).toEqual({ ok: true })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '' }])
    expect(admin.calls.usersInserted).toEqual([
      { id: 'g1', school_id: 'school-1', role: 'organizer', full_name: 'Jane Google', email: 'org@example.com' },
    ])
  })

  it('falls back to the name field when full_name is absent', async () => {
    const result = await provisionOrganizerFromOAuth({
      id: 'g1', email: 'a@b.com', user_metadata: { name: 'From Name' },
    })
    expect(result).toEqual({ ok: true })
    expect(admin.calls.usersInserted[0]).toMatchObject({ full_name: 'From Name' })
  })

  it('is idempotent when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'g1' } })
    const result = await provisionOrganizerFromOAuth(oauthUser)
    expect(result).toEqual({ ok: true })
    expect(admin.calls.usersInserted).toEqual([])
  })
})
```

Note: the existing top of the file already does `import { provisionOrganizer } from '@/lib/auth/provision'`. Change that single import line to also import `provisionOrganizerFromOAuth` (shown above) rather than adding a duplicate import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/auth/__tests__/provision.test.ts`
Expected: FAIL — `provisionOrganizerFromOAuth is not a function` / not exported.

- [ ] **Step 3: Refactor `lib/auth/provision.ts` and add the new function**

Replace the body of `provisionOrganizer` with a thin wrapper over a shared helper, and add the OAuth variant. Keep `metaString`, `ProvisionUser`, `ProvisionResult` as they are.

```ts
// Shared account-creation core. Idempotent; rolls back the school if the
// profile insert fails so a partial failure leaves no debris.
async function createOrganizerAccount(
  user: ProvisionUser,
  fullName: string,
  schoolName: string,
): Promise<ProvisionResult> {
  const email = (user.email ?? '').trim().toLowerCase()
  if (!fullName || !email) return { ok: false, reason: 'missing_metadata' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true }

  const { data: school, error: schoolError } = await admin
    .from('schools').insert({ name: schoolName }).select('id').single()
  if (schoolError || !school) return { ok: false, reason: 'school_insert_failed' }

  const { error: profileError } = await admin.from('users').insert({
    id: user.id,
    school_id: school.id,
    role: 'organizer' as const,
    full_name: fullName,
    email,
  })
  if (profileError) {
    await admin.from('schools').delete().eq('id', school.id)
    return { ok: false, reason: 'profile_insert_failed' }
  }

  return { ok: true }
}

// Email/password signup: full name + school name come from signup metadata.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const schoolName = metaString(user.user_metadata, 'school_name')
  if (!schoolName) return { ok: false, reason: 'missing_metadata' }
  return createOrganizerAccount(user, fullName, schoolName)
}

// Google signup: full name comes from the Google identity; the school name is
// deferred (empty sentinel), captured later on the first-exchange form.
export async function provisionOrganizerFromOAuth(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  return createOrganizerAccount(user, fullName, '')
}
```

- [ ] **Step 4: Run the full provision suite to verify it passes**

Run: `pnpm exec vitest run lib/auth/__tests__/provision.test.ts`
Expected: PASS — new tests green, and the four existing `provisionOrganizer` tests still green (missing-metadata, idempotent, rollback, happy path).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/provision.ts lib/auth/__tests__/provision.test.ts
git commit -m "feat(auth): provisionOrganizerFromOAuth for Google signup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `/auth/callback` OAuth route

The single decision point. Exchanges the OAuth code, then routes by account state.

**Files:**
- Create: `app/auth/callback/route.ts`
- Test: `app/__tests__/callback.test.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (`auth.exchangeCodeForSession`, `auth.signOut`); `createAdminClient()` from `@/lib/supabase/admin` (`from('users')` select/update, `auth.admin.deleteUser`); `provisionOrganizerFromOAuth` from `@/lib/auth/provision`.
- Produces: `GET(request: NextRequest)` route handler. Redirects (via `next/navigation`): existing organizer → `/dashboard`; existing student → `/my-forms`; existing student with empty `full_name` → fills name from Google then `/my-forms`; no profile + `intent=organizer_signup` → provisions then `/dashboard`; no profile otherwise → signOut + deleteUser + `/login?error=not_invited`; exchange/code failure → `/login?error=oauth_failed`; provisioning failure → `/login?error=signup_failed`.

- [ ] **Step 1: Write the failing tests**

Create `app/__tests__/callback.test.ts`:

```ts
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
const deleteUser = vi.fn(async () => ({ error: null }))
const usersUpdated: any[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
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
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run app/__tests__/callback.test.ts`
Expected: FAIL — cannot find module `@/app/auth/callback/route`.

- [ ] **Step 3: Implement the route**

Create `app/auth/callback/route.ts`:

```ts
import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionOrganizerFromOAuth } from '@/lib/auth/provision'

// OAuth (Google) callback for the SSR/PKCE flow. Distinct from /auth/confirm,
// which handles email-OTP links (?token_hash=). Here we exchange the ?code=
// for a session, then route by account state. See
// docs/superpowers/specs/2026-07-01-google-auth-design.md.
//
// IMPORTANT: redirect via next/navigation's redirect() so exchangeCodeForSession's
// cookie writes flush onto the response (same reason as /auth/confirm).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const intent = searchParams.get('intent')
  const next = searchParams.get('next') ?? '/'
  // Only same-origin relative paths for `next`, to avoid open redirects.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!code) return redirect('/login?error=oauth_failed')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return redirect('/login?error=oauth_failed')
  const user = data.user

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id, role, full_name').eq('id', user.id).maybeSingle()

  if (profile) {
    // A freshly-invited student whose Google identity auto-linked to their
    // account still has an empty full_name — complete setup from the Google name.
    if (profile.role === 'student' && !profile.full_name) {
      const meta = user.user_metadata as Record<string, unknown> | undefined
      const googleName =
        (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta?.name === 'string' && meta.name.trim()) || ''
      if (googleName) {
        await admin.from('users').update({ full_name: googleName }).eq('id', user.id)
      }
    }
    const dest = safeNext !== '/' ? safeNext : (profile.role === 'organizer' ? '/dashboard' : '/my-forms')
    return redirect(dest)
  }

  // No profile — a brand-new Google user.
  if (intent === 'organizer_signup') {
    const result = await provisionOrganizerFromOAuth(user)
    if (!result.ok) return redirect('/login?error=signup_failed')
    return redirect('/dashboard')
  }

  // Uninvited student / stranger — enforce invite-only: drop the session and
  // delete the orphan auth row Google just created.
  await supabase.auth.signOut()
  await admin.auth.admin.deleteUser(user.id).catch(() => {})
  return redirect('/login?error=not_invited')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run app/__tests__/callback.test.ts`
Expected: PASS (all 9).

- [ ] **Step 5: Commit**

```bash
git add app/auth/callback/route.ts app/__tests__/callback.test.ts
git commit -m "feat(auth): OAuth callback route with invite-only enforcement

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `GoogleButton` component

Shared "Continue with Google" button that starts the OAuth redirect.

**Files:**
- Create: `components/auth/GoogleButton.tsx`
- Test: `components/auth/__tests__/GoogleButton.test.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client` (`auth.signInWithOAuth`); `Button` from `@/components/ui/button`.
- Produces: `GoogleButton(props: { intent?: 'organizer_signup'; next?: string; label?: string })` — on click calls `signInWithOAuth({ provider: 'google', options: { redirectTo } })` where `redirectTo` = `${window.location.origin}/auth/callback` plus `intent`/`next` query params when provided.

- [ ] **Step 1: Write the failing test**

Create `components/auth/__tests__/GoogleButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signInWithOAuth = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

import { GoogleButton } from '@/components/auth/GoogleButton'

beforeEach(() => { signInWithOAuth.mockClear() })

describe('GoogleButton', () => {
  it('starts Google OAuth with intent and next in redirectTo', async () => {
    render(<GoogleButton intent="organizer_signup" next="/dashboard" />)
    await userEvent.click(screen.getByRole('button'))
    const arg = signInWithOAuth.mock.calls[0][0] as any
    expect(arg.provider).toBe('google')
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback\?intent=organizer_signup&next=%2Fdashboard$/)
  })

  it('omits query params when neither intent nor next is given', async () => {
    render(<GoogleButton />)
    await userEvent.click(screen.getByRole('button'))
    const arg = signInWithOAuth.mock.calls[0][0] as any
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback$/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run components/auth/__tests__/GoogleButton.test.tsx`
Expected: FAIL — cannot find module `@/components/auth/GoogleButton`.

- [ ] **Step 3: Implement the component**

Create `components/auth/GoogleButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function GoogleButton({
  intent,
  next,
  label = 'Continue with Google',
}: {
  intent?: 'organizer_signup'
  next?: string
  label?: string
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleClick() {
    setLoading(true)
    const params = new URLSearchParams()
    if (intent) params.set('intent', intent)
    if (next) params.set('next', next)
    const qs = params.toString()
    const redirectTo = `${window.location.origin}/auth/callback${qs ? `?${qs}` : ''}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    // On success the browser has already navigated to Google; only reset on error.
    if (error) setLoading(false)
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={loading}
    >
      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
      </svg>
      {loading ? 'Redirecting…' : label}
    </Button>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run components/auth/__tests__/GoogleButton.test.tsx`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add components/auth/GoogleButton.tsx components/auth/__tests__/GoogleButton.test.tsx
git commit -m "feat(auth): shared Continue with Google button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire the button into signup / login / accept-invite + login error copy

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/accept-invite/page.tsx`
- Test: `app/(auth)/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `GoogleButton` from `@/components/auth/GoogleButton`.

- [ ] **Step 1: Write the failing login error-copy tests**

Append two cases to `app/(auth)/__tests__/login.test.tsx` (inside the existing `describe('LoginPage error banner', …)`):

```tsx
  it('surfaces the oauth_failed message', async () => {
    window.history.pushState({}, '', '/login?error=oauth_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/couldn’t sign you in with google/i)).toBeInTheDocument()
  })

  it('surfaces the not_invited message', async () => {
    window.history.pushState({}, '', '/login?error=not_invited')
    render(<LoginPage />)
    expect(await screen.findByText(/couldn’t match your google account to an invitation/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run "app/(auth)/__tests__/login.test.tsx"`
Expected: FAIL — the new copy isn't rendered.

- [ ] **Step 3: Add the two error messages to the login page**

In `app/(auth)/login/page.tsx`, extend the existing `useEffect` error mapping. Replace:

```tsx
    if (err === 'invite_invalid') {
      setError('That invite link is invalid or has expired — ask your organizer to resend it.')
    } else if (err === 'signup_failed') {
      setError('We couldn’t finish creating your account. Please try signing up again.')
    }
```

with:

```tsx
    if (err === 'invite_invalid') {
      setError('That invite link is invalid or has expired — ask your organizer to resend it.')
    } else if (err === 'signup_failed') {
      setError('We couldn’t finish creating your account. Please try signing up again.')
    } else if (err === 'oauth_failed') {
      setError('We couldn’t sign you in with Google. Please try again.')
    } else if (err === 'not_invited') {
      setError('We couldn’t match your Google account to an invitation. Use the same email your organizer invited you with, or set a password from your invite link instead.')
    }
```

- [ ] **Step 4: Add the Google button to the login page**

In `app/(auth)/login/page.tsx`, add the import at the top with the other imports:

```tsx
import { GoogleButton } from '@/components/auth/GoogleButton'
```

Inside `<CardContent>`, immediately **above** the `<form …>`, insert the button plus a divider:

```tsx
          <GoogleButton />
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
```

- [ ] **Step 5: Add the Google button to the signup page (organizer intent)**

In `app/(auth)/signup/page.tsx`, add the import:

```tsx
import { GoogleButton } from '@/components/auth/GoogleButton'
```

Inside the main (non-`submitted`) return's `<CardContent>`, immediately **above** the `<form …>`, insert:

```tsx
          <GoogleButton intent="organizer_signup" next="/dashboard" label="Sign up with Google" />
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
```

- [ ] **Step 6: Add the Google option to accept-invite**

In `app/(auth)/accept-invite/page.tsx`, add the import:

```tsx
import { GoogleButton } from '@/components/auth/GoogleButton'
```

Inside `<CardContent>`, immediately **above** the `<form …>`, insert (the student is already signed in from the magic link; Google auto-links by their confirmed email and the callback fills their name — no password needed):

```tsx
          <GoogleButton next="/my-forms" label="Continue with Google" />
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or set a password <span className="h-px flex-1 bg-border" />
          </div>
```

- [ ] **Step 7: Run the login tests + lint**

Run: `pnpm exec vitest run "app/(auth)/__tests__/login.test.tsx" && pnpm lint`
Expected: login tests PASS (including the two existing signup_failed/invite_invalid cases and the two new ones); lint clean.

- [ ] **Step 8: Commit**

```bash
git add "app/(auth)/login/page.tsx" "app/(auth)/signup/page.tsx" "app/(auth)/accept-invite/page.tsx" "app/(auth)/__tests__/login.test.tsx"
git commit -m "feat(auth): add Continue with Google to login, signup, accept-invite

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Deferred school-name capture (migration + createExchange)

Let an organizer whose school name is still empty set it on their first exchange. Requires an UPDATE policy on `schools` scoped to their own school.

**Files:**
- Create: `supabase/migrations/20260701000001_schools_update_own_name.sql`
- Modify: `actions/exchanges.ts` (`createExchange`)
- Test: `actions/__tests__/create-exchange.test.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server`; `applySlug` from `@/lib/tokens`; `revalidatePath` from `next/cache`.
- Produces: `createExchange(formData: FormData)` additionally reads `school_a_name` from the form and, when the organizer's own `schools.name` is `''`, requires it and updates the school; throws `Please provide your school name` when it's empty in that case. Unchanged behavior when the school name is already set.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260701000001_schools_update_own_name.sql`:

```sql
-- Organizers who sign up with Google are provisioned with an empty school name
-- (deferred capture). They set it on their first exchange (createExchange),
-- which needs UPDATE on their own school row. Scope strictly to their own school
-- via the existing SECURITY DEFINER helpers (no recursion).
create policy "organizers update their school" on schools for update
  using (my_role() = 'organizer' and id = my_school_id())
  with check (my_role() = 'organizer' and id = my_school_id());
```

- [ ] **Step 2: Write the failing tests**

Create `actions/__tests__/create-exchange.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let opts: { role?: string; ownSchoolName?: string }
let calls: { schoolUpdated: any; partnerInserted: any; exchangeInserted: any }

function makeClient() {
  calls = { schoolUpdated: null, partnerInserted: null, exchangeInserted: null }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { school_id: 's-own', role: opts.role ?? 'organizer' } }) }) }) }
      }
      if (table === 'schools') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { name: opts.ownSchoolName ?? 'Existing High' }, error: null }) }) }),
          update: (row: any) => { calls.schoolUpdated = row; return { eq: async () => ({ error: null }) } },
          insert: (row: any) => { calls.partnerInserted = row; return { select: () => ({ single: async () => ({ data: { id: 's-partner' }, error: null }) }) } },
        }
      }
      if (table === 'exchanges') {
        return { insert: async (row: any) => { calls.exchangeInserted = row; return { error: null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createExchange } from '../exchanges'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const base = { name: 'France–Canada', year: '2026', school_b_name: 'Partner Lycée' }

beforeEach(() => { opts = {} })

describe('createExchange deferred school name', () => {
  it('persists the organizer school name on the first exchange when it is empty', async () => {
    opts = { ownSchoolName: '' }
    await createExchange(form({ ...base, school_a_name: 'Lincoln High' }))
    expect(calls.schoolUpdated).toEqual({ name: 'Lincoln High' })
    expect(calls.partnerInserted).toEqual({ name: 'Partner Lycée' })
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada', year: 2026, school_a_id: 's-own', school_b_id: 's-partner' })
  })

  it('throws when the school name is empty and none was provided', async () => {
    opts = { ownSchoolName: '' }
    await expect(createExchange(form(base))).rejects.toThrow('Please provide your school name')
  })

  it('does not touch the school name when it is already set', async () => {
    opts = { ownSchoolName: 'Existing High' }
    await createExchange(form({ ...base, school_a_name: 'Ignored' }))
    expect(calls.schoolUpdated).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run actions/__tests__/create-exchange.test.ts`
Expected: FAIL — `createExchange` neither reads `school_a_name` nor updates the school (first two cases fail; the third may pass incidentally).

- [ ] **Step 4: Update `createExchange`**

In `actions/exchanges.ts`, in `createExchange`, insert the capture block **after** the name/year/school_b validation and **before** the partner-school insert. Locate:

```ts
  if (!name || !schoolBName || Number.isNaN(year)) {
    throw new Error('Please provide an exchange name, year, and partner school name')
  }
```

Immediately after that block, add:

```ts
  // Deferred school-name capture: organizers who signed up with Google start
  // with an empty school name (nothing displays it until their first exchange).
  // Collect and persist it now, alongside the partner-school name.
  const { data: ownSchool } = await supabase
    .from('schools').select('name').eq('id', profile.school_id).single()
  if (ownSchool && ownSchool.name === '') {
    const schoolAName = (formData.get('school_a_name') as string ?? '').trim()
    if (!schoolAName) throw new Error('Please provide your school name')
    const { error: renameError } = await supabase
      .from('schools').update({ name: schoolAName }).eq('id', profile.school_id)
    if (renameError) throw renameError
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run actions/__tests__/create-exchange.test.ts`
Expected: PASS (all 3).

- [ ] **Step 6: Apply the migration to the remote project**

Run: `supabase db push`
Expected: `20260701000001_schools_update_own_name.sql` applied without error.

If `supabase db push` isn't wired locally, apply the same SQL via the Supabase MCP `apply_migration` tool (name `schools_update_own_name`). Either way, verify the policy exists before moving on.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260701000001_schools_update_own_name.sql actions/exchanges.ts actions/__tests__/create-exchange.test.ts
git commit -m "feat(exchanges): capture deferred school name on first exchange

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: New-exchange form — conditional "Your school name" field

Show the field only when the organizer's school name is still empty. Split the current client page into a server page (reads the name) + client form (renders the field conditionally).

**Files:**
- Create: `components/NewExchangeForm.tsx`
- Modify: `app/(organizer)/exchanges/new/page.tsx`

**Interfaces:**
- Consumes: `createExchange` from `@/actions/exchanges`; `createClient()` from `@/lib/supabase/server`; shadcn `Button`/`Input`/`Label`/`Card…`.
- Produces: `NewExchangeForm(props: { needsSchoolName: boolean })` client component; server page passes `needsSchoolName`.

- [ ] **Step 1: Create the client form component**

Create `components/NewExchangeForm.tsx` — this is the existing form JSX moved out of the page, plus a conditional field. Full content:

```tsx
'use client'
import { createExchange } from '@/actions/exchanges'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'

export function NewExchangeForm({ needsSchoolName }: { needsSchoolName: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createExchange(new FormData(e.currentTarget))
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>New exchange</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Exchange name</Label>
            <Input id="name" name="name" placeholder="France–Canada 2026" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={new Date().getFullYear()} required />
          </div>
          {needsSchoolName && (
            <div className="space-y-1">
              <Label htmlFor="school_a_name">Your school name</Label>
              <Input id="school_a_name" name="school_a_name" placeholder="Lincoln High" required />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="school_b_name">Partner school name</Label>
            <Input id="school_b_name" name="school_b_name" placeholder="Lycée Victor Hugo" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create exchange'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Rewrite the page as a server component**

Replace the entire contents of `app/(organizer)/exchanges/new/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { NewExchangeForm } from '@/components/NewExchangeForm'

export default async function NewExchangePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let needsSchoolName = false
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('school_id').eq('id', user.id).single()
    if (profile) {
      const { data: school } = await supabase
        .from('schools').select('name').eq('id', profile.school_id).single()
      needsSchoolName = school?.name === ''
    }
  }

  return <NewExchangeForm needsSchoolName={needsSchoolName} />
}
```

- [ ] **Step 3: Typecheck, lint, and run the full suite**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: no type errors, lint clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/NewExchangeForm.tsx "app/(organizer)/exchanges/new/page.tsx"
git commit -m "feat(exchanges): prompt for school name on first exchange when unset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Provider configuration + docs

No app code. Configure Google + Supabase (in dashboards) and record the setup so it's reproducible. This task's deliverable is a working end-to-end Google sign-in in a deployed/preview environment plus a short doc.

**Files:**
- Create: `docs/google-auth-setup.md`
- Modify: `CLAUDE.md` (add a short "Google Auth" note under Gotchas & Conventions or a new subsection)

- [ ] **Step 1: Configure Google Cloud OAuth**

In Google Cloud Console → APIs & Services → Credentials: create an **OAuth client ID** of type **Web application**. Under "Authorized redirect URIs" add the Supabase callback:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

Copy the generated **Client ID** and **Client secret**.

- [ ] **Step 2: Enable Google in Supabase**

Supabase Dashboard → Authentication → Providers → **Google**: toggle on, paste the Client ID and Client secret, save.

- [ ] **Step 3: Allow-list the app callback + confirm email linking**

- Authentication → URL Configuration → **Redirect URLs**: add `${NEXT_PUBLIC_APP_URL}/auth/callback` for each environment (production Vercel domain, any preview domains, and `http://localhost:3000/auth/callback` for local).
- Confirm **"link accounts with the same email"** is enabled (Authentication settings). This is load-bearing: it lets an invited student's Google identity attach to the account created by their magic link. If it cannot be enabled on the current plan, stop and flag it — the student Google path depends on it.

- [ ] **Step 4: Write the setup doc**

Create `docs/google-auth-setup.md` capturing Steps 1–3 (the exact redirect URIs, which dashboards, and the email-linking requirement) so the config is reproducible and the assumptions are recorded.

- [ ] **Step 5: Note it in CLAUDE.md**

Add a brief note to `CLAUDE.md` (e.g. under "Gotchas & Conventions"):

```md
- **Google OAuth** goes through `app/auth/callback/route.ts` (the `?code=` PKCE exchange), separate from `/auth/confirm` (email OTP `?token_hash=`). Invite-only is enforced *in the callback*: a Google user with no invited profile and no `intent=organizer_signup` is signed out and deleted. Provider config + the required "link accounts with the same email" setting are documented in `docs/google-auth-setup.md`.
```

- [ ] **Step 6: Manual end-to-end verification (in a preview/prod deploy)**

Verify each path against a real Google account:
1. **New organizer** — `/signup` → "Sign up with Google" → lands on `/dashboard`; creating the first exchange prompts for "Your school name".
2. **Returning organizer** — `/login` → "Continue with Google" → `/dashboard`, no school prompt on later exchanges.
3. **Invited student** — accept an invite, click the magic link, then on `/accept-invite` choose "Continue with Google" (same Google email as invited) → lands on `/my-forms` with their name set.
4. **Uninvited stranger** — `/login` → Google with an un-invited account → bounced to `/login` with the `not_invited` message; confirm no orphan `users`/`auth` row remains.

- [ ] **Step 7: Commit**

```bash
git add docs/google-auth-setup.md CLAUDE.md
git commit -m "docs: Google auth provider setup + convention note

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Finalize

- [ ] **Step 1: Full verification**

Run: `pnpm lint && pnpm test && pnpm exec tsc --noEmit`
Expected: all green. (`pnpm build` fails locally on placeholder env vars — rely on tsc + lint + tests here; the real build runs on Vercel.)

- [ ] **Step 2: Open a PR (do not merge without confirmation)**

```bash
git push -u origin feat/google-auth
gh pr create --title "Sign up / sign in with Google" --body "Adds Continue with Google for organizers (sign up + in) and invited students (sign in + password-free setup). Invite-only enforced in the OAuth callback; new-organizer school name deferred to first exchange. Requires provider config + the 'link accounts with same email' Supabase setting — see docs/google-auth-setup.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merging to `main` deploys to production — get user confirmation first, and ensure the provider config (Task 7) is live in production before merging.

---

## Notes / accepted edge cases

- **Student Google email ≠ invited email:** Google can't match the invite → new orphan → callback rejects with `not_invited`. Expected and messaged; the student can use the password path or the matching Google account.
- **Google returns no name:** Google reliably returns `name`/`full_name`; if it were ever empty for a student, `full_name` stays `''` and middleware keeps them on `/accept-invite`. Accepted (not worth extra complexity).
- **Forged `intent=organizer_signup`:** grants only an organizer account, which anyone can self-register anyway — no boundary crossed.
