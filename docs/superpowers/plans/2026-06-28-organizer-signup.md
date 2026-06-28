# Organizer Self-Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new organizer self-register from the landing page: sign up with name/school/email/password, confirm their email, and land on the dashboard with a newly created school and organizer profile.

**Architecture:** A client signup page calls `supabase.auth.signUp` with the full name + school name stashed in auth user metadata (no DB writes yet). Email confirmation runs through the existing `app/auth/confirm/route.ts`; on a successful `type=signup` verification, a new idempotent `provisionOrganizer` helper creates the `schools` + organizer `users` rows via the service-role admin client, then redirects to `/dashboard`.

**Tech Stack:** Next.js 14 (App Router, RSC + client components), TypeScript, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), shadcn/ui, Vitest + Testing Library + `@testing-library/user-event`.

## Global Constraints

- Package manager is **pnpm** (not npm). Run tests with `pnpm test <path>`.
- No new dependencies — only what's already in package.json.
- All account creation goes through the **service-role admin client** (`@/lib/supabase/admin`), mirroring `actions/students.ts`; do not add client-side service-role usage and do not add new RLS policies.
- Email/format validation reuses `@/lib/validation` (`normalizeEmail`, `isValidEmail`).
- `provisionOrganizer` MUST be idempotent (safe to run twice for the same user).
- Never log student/parent PII; this task concerns organizers, but keep the no-PII-in-logs rule.
- Path alias `@/` maps to the repo root. Test files live in `__tests__/` beside the code.
- Email-template configuration in the Supabase dashboard is a manual deploy step (documented in Task 6), NOT code.

---

## File Structure

- Create: `lib/auth/provision.ts` — `provisionOrganizer(user)`: idempotent school+profile creation.
- Create: `app/(auth)/signup/page.tsx` — client signup form.
- Modify: `app/auth/confirm/route.ts` — provision on `type=signup` after `verifyOtp`.
- Modify: `middleware.ts` — add `/signup` to `isAuthRoute`.
- Modify: `app/(auth)/login/page.tsx` — surface `error=signup_failed`.
- Modify: `CLAUDE.md` — update the invite-only line.
- Tests: `lib/auth/__tests__/provision.test.ts`, `app/(auth)/__tests__/signup.test.tsx`, `app/__tests__/confirm.test.ts`, `app/__tests__/middleware.test.ts` (extend), `app/(auth)/__tests__/login.test.tsx`.

---

## Task 1: provisionOrganizer helper

**Files:**
- Create: `lib/auth/provision.ts`
- Test: `lib/auth/__tests__/provision.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin` (returns a `@supabase/supabase-js` client typed with `Database`).
- Produces:
  - `interface ProvisionUser { id: string; email?: string | null; user_metadata?: Record<string, unknown> }`
  - `type ProvisionResult = { ok: true } | { ok: false; reason: string }`
  - `async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth/__tests__/provision.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface AdminOpts {
  existingUser?: { id: string } | null
  schoolInsert?: { data: { id: string } | null; error: unknown }
  usersInsertError?: unknown
}

let admin: ReturnType<typeof makeAdmin>

function makeAdmin(opts: AdminOpts = {}) {
  const {
    existingUser = null,
    schoolInsert = { data: { id: 'school-1' }, error: null },
    usersInsertError = null,
  } = opts
  const calls = {
    schoolsInserted: [] as unknown[],
    usersInserted: [] as unknown[],
    schoolsDeleted: [] as string[],
  }
  const client = {
    calls,
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingUser, error: null }) }) }),
          insert: async (row: unknown) => { calls.usersInserted.push(row); return { error: usersInsertError } },
        }
      }
      if (table === 'schools') {
        return {
          insert: (row: unknown) => { calls.schoolsInserted.push(row); return { select: () => ({ single: async () => schoolInsert }) } },
          delete: () => ({ eq: async (_col: string, id: string) => { calls.schoolsDeleted.push(id); return { error: null } } }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
  return client
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

import { provisionOrganizer } from '@/lib/auth/provision'

const baseUser = {
  id: 'u1',
  email: 'Org@Example.com',
  user_metadata: { full_name: '  Jane Doe  ', school_name: '  Lincoln High  ' },
}

beforeEach(() => { admin = makeAdmin() })

describe('provisionOrganizer', () => {
  it('creates a school and organizer profile when none exists', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true })
    expect(admin.calls.schoolsInserted).toEqual([{ name: 'Lincoln High' }])
    expect(admin.calls.usersInserted).toEqual([
      { id: 'u1', school_id: 'school-1', role: 'organizer', full_name: 'Jane Doe', email: 'org@example.com' },
    ])
  })

  it('is idempotent: no writes when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'u1' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true })
    expect(admin.calls.schoolsInserted).toEqual([])
    expect(admin.calls.usersInserted).toEqual([])
  })

  it('rolls back the school when the profile insert fails', async () => {
    admin = makeAdmin({ usersInsertError: { message: 'boom' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'profile_insert_failed' })
    expect(admin.calls.schoolsDeleted).toEqual(['school-1'])
  })

  it('fails without creating anything when metadata is missing', async () => {
    const result = await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(result).toEqual({ ok: false, reason: 'missing_metadata' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/auth/__tests__/provision.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/provision`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/provision.ts
import { createAdminClient } from '@/lib/supabase/admin'

export interface ProvisionUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export type ProvisionResult = { ok: true } | { ok: false; reason: string }

function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

// Idempotently create the school + organizer profile for a freshly confirmed
// signup. Uses the service-role admin client (bypasses RLS), mirroring
// actions/students.ts. Nothing is written until the email is confirmed, so
// abandoned signups leave no rows.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const schoolName = metaString(user.user_metadata, 'school_name')
  const email = (user.email ?? '').trim().toLowerCase()
  if (!fullName || !schoolName || !email) return { ok: false, reason: 'missing_metadata' }

  const admin = createAdminClient()

  // Idempotent: if a profile already exists, do nothing (double-clicked link, retry).
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
    // Roll back the orphan school so a failed profile insert leaves no debris.
    await admin.from('schools').delete().eq('id', school.id)
    return { ok: false, reason: 'profile_insert_failed' }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/auth/__tests__/provision.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/provision.ts lib/auth/__tests__/provision.test.ts
git commit -m "feat(signup): idempotent provisionOrganizer (school + organizer profile)"
```

---

## Task 2: Signup page

**Files:**
- Create: `app/(auth)/signup/page.tsx`
- Test: `app/(auth)/__tests__/signup.test.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (browser client; `.auth.signUp`); `normalizeEmail`, `isValidEmail` from `@/lib/validation`.
- Produces: default-exported `SignupPage` client component.

- [ ] **Step 1: Write the failing test**

```tsx
// app/(auth)/__tests__/signup.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signUp = vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => { signUp.mockClear() })

describe('SignupPage', () => {
  it('submits signUp with name + school in metadata and shows the check-email state', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/school name/i), 'Lincoln High')
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0] as {
      email: string; password: string; options: { data: Record<string, string> }
    }
    expect(arg.email).toBe('jane@example.com')
    expect(arg.password).toBe('supersecret')
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe', school_name: 'Lincoln High' })

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/full name/i), 'Jane')
    await user.type(screen.getByLabelText(/school name/i), 'Lincoln')
    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "app/(auth)/__tests__/signup.test.tsx"`
Expected: FAIL — cannot resolve `@/app/(auth)/signup/page`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/(auth)/signup/page.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const name = fullName.trim()
    const school = schoolName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name || !school) { setError('Please fill in all fields.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Please enter a valid email address.'); return }

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name, school_name: school },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to your email. Click it to finish setting up your account.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your EazyExchange account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName}
                onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="schoolName">School name</Label>
              <Input id="schoolName" value={schoolName}
                onChange={e => setSchoolName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)} required minLength={8} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test "app/(auth)/__tests__/signup.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/signup/page.tsx" "app/(auth)/__tests__/signup.test.tsx"
git commit -m "feat(signup): organizer signup page"
```

---

## Task 3: Provision on email confirmation

**Files:**
- Modify: `app/auth/confirm/route.ts`
- Test: `app/__tests__/confirm.test.ts`

**Interfaces:**
- Consumes: `provisionOrganizer` (Task 1); `createClient` from `@/lib/supabase/server`; `redirect` from `next/navigation`.
- Produces: unchanged `GET` export with added `type=signup` provisioning branch.

- [ ] **Step 1: Write the failing test**

```ts
// app/__tests__/confirm.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/__tests__/confirm.test.ts`
Expected: FAIL — current route ignores `type=signup` (never calls `provisionOrganizer`) and uses `const { error }` rather than `const { data, error }`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `app/auth/confirm/route.ts` with:

```ts
import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { provisionOrganizer } from '@/lib/auth/provision'

// Handles email-link verification for the SSR (PKCE) cookie flow.
// Supabase email templates point here with a `token_hash` + `type`, e.g.
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
// We verify the OTP server-side (which writes the session cookies), provision
// the organizer's school+profile on signup, then forward to `next`.
//
// IMPORTANT: redirect via next/navigation's redirect() rather than
// NextResponse.redirect(). verifyOtp persists the session through the
// next/headers cookie store, and those writes are only flushed onto the
// response when Next handles the redirect() — a hand-built NextResponse drops
// them, leaving the browser client with no session ("Auth session missing").
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  // Only allow same-origin relative paths for `next` to avoid open redirects.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      if (type === 'signup') {
        if (!data.user) return redirect('/login?error=signup_failed')
        const result = await provisionOrganizer(data.user)
        if (!result.ok) return redirect('/login?error=signup_failed')
      }
      return redirect(safeNext)
    }
  }

  // Invalid or expired link — send to login with a flag the page can surface.
  return redirect('/login?error=invite_invalid')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/__tests__/confirm.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/auth/confirm/route.ts app/__tests__/confirm.test.ts
git commit -m "feat(signup): provision organizer on email confirmation"
```

---

## Task 4: Make /signup reachable in middleware

**Files:**
- Modify: `middleware.ts:16`
- Test: `app/__tests__/middleware.test.ts` (extend)

**Interfaces:**
- Consumes: `updateSession` from `@/lib/supabase/middleware` (mocked); `createServerClient` from `@supabase/ssr` (mocked for the logged-in branch).
- Produces: `/signup` treated like `/login` (reachable logged-out; logged-in users redirected by role).

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `app/__tests__/middleware.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/__tests__/middleware.test.ts`
Expected: FAIL — `/signup` logged-out currently redirects to `/login` (not in `isAuthRoute`/`isPublicRoute`), so the new `/signup` tests fail.

- [ ] **Step 3: Write minimal implementation**

In `middleware.ts`, change the `isAuthRoute` line (currently line 16) to include `/signup`:

```ts
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/accept-invite') || pathname.startsWith('/signup')
```

Leave the rest of the file unchanged (the `isPublicRoute === '/'` guard and the logged-in `isAuthRoute` redirect block already produce the desired behavior for `/signup`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/__tests__/middleware.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts app/__tests__/middleware.test.ts
git commit -m "feat(signup): make /signup public (reachable logged-out)"
```

---

## Task 5: Surface signup_failed on the login page

**Files:**
- Modify: `app/(auth)/login/page.tsx:19-23`
- Test: `app/(auth)/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (mocked); `useRouter` from `next/navigation` (mocked).
- Produces: login page shows a friendly message when `?error=signup_failed`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/(auth)/__tests__/login.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import LoginPage from '@/app/(auth)/login/page'

describe('LoginPage error banner', () => {
  it('surfaces a friendly message when signup provisioning failed', async () => {
    window.history.pushState({}, '', '/login?error=signup_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/couldn’t finish creating your account/i)).toBeInTheDocument()
  })

  it('surfaces the invite-invalid message', async () => {
    window.history.pushState({}, '', '/login?error=invite_invalid')
    render(<LoginPage />)
    expect(await screen.findByText(/invite link is invalid/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test "app/(auth)/__tests__/login.test.tsx"`
Expected: FAIL — the `signup_failed` branch does not exist, so its message is not rendered.

- [ ] **Step 3: Write minimal implementation**

In `app/(auth)/login/page.tsx`, replace the `useEffect` (currently lines 19-23):

```tsx
  // Surface flags set by /auth/confirm.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'invite_invalid') {
      setError('That invite link is invalid or has expired — ask your organizer to resend it.')
    } else if (err === 'signup_failed') {
      setError('We couldn’t finish creating your account. Please try signing up again.')
    }
  }, [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test "app/(auth)/__tests__/login.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/login/page.tsx" "app/(auth)/__tests__/login.test.tsx"
git commit -m "feat(signup): surface signup_failed message on login page"
```

---

## Task 6: Docs update + full verification

**Files:**
- Modify: `CLAUDE.md`
- No new tests.

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, under "## User Roles", replace the line:

```
Access is invite-only — no self-registration.
```

with:

```
Organizers self-register at `/signup` (email-confirmed; creates their school). Students/parents remain invite-only — no student self-registration.
```

- [ ] **Step 2: Commit the docs change**

```bash
git add CLAUDE.md
git commit -m "docs: organizers self-register; students remain invite-only"
```

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (pre-existing suite + new provision/signup/confirm/middleware/login tests).

- [ ] **Step 5: Manual smoke (post-deploy — requires Supabase email-template config)**

**Required Supabase dashboard step before this works in any deployed env:** set the **Confirm signup** email template's URL to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
```

Then: visit `/signup` → submit → receive email → click link → land on `/dashboard` with a new school + organizer profile. Verify a logged-in user visiting `/signup` is redirected to `/dashboard`.

---

## Notes / Out of Scope

- **Billing/Stripe** is the next sub-project; this builds free accounts only.
- No password reset, social login, or signup rate-limiting/CAPTCHA (later hardening).
- The **Confirm signup** email-template configuration (Task 6, Step 5) is a manual Supabase dashboard step; without it, confirmation links won't establish the SSR session.
- `pnpm build` fails locally because `.env.local` holds placeholders (project memory); rely on `pnpm lint` + `pnpm test` locally. Build correctness is validated on Vercel deploy.
```
