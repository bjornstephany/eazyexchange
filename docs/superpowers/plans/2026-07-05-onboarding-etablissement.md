# Onboarding établissement Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "Établissement" field from organizer sign-up and capture the school name on a dedicated `/onboarding` page, hard-gated so no organizer page renders with an empty school name.

**Architecture:** Both sign-up paths (email/password and Google) now provision a school with an empty name (`''`). A new top-level `/onboarding` page + `completeOnboarding` server action collects and persists the name. A redirect gate in the organizer layout bounces any organizer whose `schools.name === ''` to `/onboarding`. The now-dead deferred-capture code in the New Exchange modal and `createExchange` is retired.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Supabase (Postgres + RLS + Auth), Tailwind + shadcn/ui, Vitest + Testing Library.

**Branch:** `feature/onboarding-etablissement` (multi-file feature — work on a branch, never on `main`).

**Spec:** `docs/superpowers/specs/2026-07-05-onboarding-etablissement-design.md`

## Global Constraints

- **French copy** — all user-facing strings are in French, matching existing pages.
- **Package manager is `pnpm`** (never `npm`).
- **Minimal profile fields** — persist **only** the school name. No new columns, no extra onboarding fields, no new migration (zero schema change).
- **`schools.name` is the only client-updatable `schools` column.** `completeOnboarding` updates it through the **cookie (RLS) client** (`@/lib/supabase/server`), exactly as the retired `createExchange` rename did — the organizer updating their own school's name is permitted by the `schools` UPDATE policy (scoped to `my_role`+`my_school_id`) and the `UPDATE(name)` grant. **Never** touch subscription/plan columns and **never** use the service-role admin client from these app flows.
- **No student/parent PII in logs.**
- **Verification gate before every commit:** `pnpm lint && pnpm test && npx tsc --noEmit`. (Local `pnpm build` fails on placeholder `.env.local` — `npx tsc --noEmit` is the local type gate; `pnpm build` is the Vercel/CI gate.)

**Setup (once, before Task 1):**

```bash
git checkout -b feature/onboarding-etablissement
```

---

### Task 1: Remove the Établissement field from sign-up

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Test: `app/(auth)/__tests__/signup.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: sign-up no longer renders an "Établissement" field and no longer sends `school_name` in `signUp` metadata. `options.data` is now exactly `{ full_name: <trimmed name> }`.

- [ ] **Step 1: Update the test first (RED)**

Replace the entire body of `app/(auth)/__tests__/signup.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => { signUp.mockClear() })

describe('SignupPage (French)', () => {
  it('does not render an Établissement field', () => {
    render(<SignupPage />)
    expect(screen.queryByLabelText(/établissement/i)).toBeNull()
  })

  it('submits signUp with only the full name and shows the check-email state', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/e-mail/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(await screen.findByText(/vérifiez votre e-mail/i)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/e-mail/i), 'a@b')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/adresse e-mail valide/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `pnpm test -- signup`
Expected: FAIL — the current page still renders the "Établissement" field and sends `school_name`, so `does not render an Établissement field` and the `options.data` assertion fail.

- [ ] **Step 3: Remove the `schoolName` state**

In `app/(auth)/signup/page.tsx`, delete this line (currently line 14):

```tsx
  const [schoolName, setSchoolName] = useState('')
```

- [ ] **Step 4: Drop the school from validation and metadata**

Replace the current validation + `signUp` call inside `handleSignup` — this block:

```tsx
    const name = fullName.trim()
    const school = schoolName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name || !school) { setError('Veuillez remplir tous les champs.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name, school_name: school },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
```

with:

```tsx
    const name = fullName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name) { setError('Veuillez remplir tous les champs.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
```

- [ ] **Step 5: Collapse the two-column grid to a full-width Nom complet field**

Replace this JSX block (the `grid grid-cols-2` wrapper holding both fields):

```tsx
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fullName" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
                <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="schoolName" className="text-[13px] font-semibold text-[#42506E]">Établissement</Label>
                <Input id="schoolName" value={schoolName} onChange={e => setSchoolName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
              </div>
            </div>
```

with:

```tsx
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
              <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
```

- [ ] **Step 6: Run the test to verify it passes (GREEN)**

Run: `pnpm test -- signup`
Expected: PASS (3/3).

- [ ] **Step 7: Commit**

```bash
git add app/(auth)/signup/page.tsx "app/(auth)/__tests__/signup.test.tsx"
git commit -m "feat: drop Établissement field from organizer sign-up"
```

---

### Task 2: Defer the school name in `provisionOrganizer`

**Files:**
- Modify: `lib/auth/provision.ts:52-58`
- Test: `lib/auth/__tests__/provision.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `provisionOrganizer(user)` now creates the school with `name: ''` — identical to `provisionOrganizerFromOAuth`. Every new organizer starts with `schools.name === ''`.

- [ ] **Step 1: Update the test first (RED)**

In `lib/auth/__tests__/provision.test.ts`, change the first `provisionOrganizer` assertion. Replace:

```tsx
    expect(admin.calls.schoolsInserted).toEqual([{ name: 'Lincoln High' }])
```

with:

```tsx
    expect(admin.calls.schoolsInserted).toEqual([{ name: '' }])
```

Then replace the `fails without creating anything when metadata is missing` test so it asserts the missing **full name** (school name is no longer read):

```tsx
  it('fails without creating anything when the full name is missing', async () => {
    const result = await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(result).toEqual({ ok: false, reason: 'missing_metadata' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `pnpm test -- provision`
Expected: FAIL — the current `provisionOrganizer` inserts `{ name: 'Lincoln High' }`, so the first assertion fails.

- [ ] **Step 3: Make `provisionOrganizer` defer the school name**

In `lib/auth/provision.ts`, replace this function (currently lines 52-58):

```tsx
// Email/password signup: full name + school name come from signup metadata.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const schoolName = metaString(user.user_metadata, 'school_name')
  if (!schoolName) return { ok: false, reason: 'missing_metadata' }
  return createOrganizerAccount(user, fullName, schoolName)
}
```

with:

```tsx
// Email/password signup: full name comes from signup metadata; the school name
// is deferred (empty sentinel) and captured later on the /onboarding page —
// identical to the Google path.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  return createOrganizerAccount(user, fullName, '')
}
```

- [ ] **Step 4: Run the test to verify it passes (GREEN)**

Run: `pnpm test -- provision`
Expected: PASS (all `provisionOrganizer` + `provisionOrganizerFromOAuth` cases).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/provision.ts "lib/auth/__tests__/provision.test.ts"
git commit -m "feat: defer school name in email/password provisioning"
```

---

### Task 3: `completeOnboarding` server action

**Files:**
- Create: `actions/onboarding.ts`
- Test: `actions/__tests__/onboarding.test.ts`

**Interfaces:**
- Consumes: `getAuthUser`, `getProfile` from `@/lib/supabase/request`; `createClient` from `@/lib/supabase/server`.
- Produces: `completeOnboarding(formData: FormData): Promise<void>` — auth + organizer guarded; trims `formData.get('name')`, rejects empty/whitespace with a French error; updates `schools.name` for the caller's `school_id`; `revalidatePath('/dashboard')`; then `redirect('/dashboard')`.

- [ ] **Step 1: Write the failing test (RED)**

Create `actions/__tests__/onboarding.test.ts`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { user: { id: string } | null; role: string; school: string; name: string; updated: any }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b,
        update: (row: any) => { scenario.updated = row; return { eq: async () => ({ error: null }) } },
        single: async () => table === 'users'
          ? { data: { id: 'u1', role: scenario.role, school_id: scenario.school, full_name: 'x', email: 'a@b.com', org_role: 'owner', schools: { name: scenario.name } } }
          : { data: null },
      }
      return b
    },
  }
}

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { completeOnboarding } from '@/actions/onboarding'

function fd(name: string) { const f = new FormData(); f.set('name', name); return f }

beforeEach(() => {
  redirect.mockClear()
  scenario = { user: { id: 'u1' }, role: 'organizer', school: 's-1', name: '', updated: null }
})

describe('completeOnboarding', () => {
  it('persists the trimmed name and redirects to /dashboard', async () => {
    await expect(completeOnboarding(fd('  Lincoln High  '))).rejects.toThrow('REDIRECT:/dashboard')
    expect(scenario.updated).toEqual({ name: 'Lincoln High' })
  })

  it('rejects an empty/whitespace name without writing or redirecting', async () => {
    await expect(completeOnboarding(fd('   '))).rejects.toThrow('Veuillez renseigner le nom de votre établissement')
    expect(scenario.updated).toBeNull()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('rejects a non-organizer caller', async () => {
    scenario.role = 'student'
    await expect(completeOnboarding(fd('Lincoln High'))).rejects.toThrow('Unauthorized')
    expect(scenario.updated).toBeNull()
  })

  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    await expect(completeOnboarding(fd('Lincoln High'))).rejects.toThrow('Unauthenticated')
    expect(scenario.updated).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `pnpm test -- onboarding`
Expected: FAIL — `@/actions/onboarding` does not exist yet (module not found).

- [ ] **Step 3: Write the action**

Create `actions/onboarding.ts`:

```tsx
'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Persists the organizer's school name from the /onboarding page. Mirrors
// createExchange's guards. Uses the cookie (RLS) client — the organizer
// updating their own school's name is the only client-permitted schools UPDATE.
export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')

  const name = ((formData.get('name') as string) ?? '').trim()
  if (!name) throw new Error('Veuillez renseigner le nom de votre établissement')

  const { error } = await supabase
    .from('schools').update({ name }).eq('id', profile.school_id)
  if (error) throw error

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
```

- [ ] **Step 4: Run the test to verify it passes (GREEN)**

Run: `pnpm test -- onboarding`
Expected: PASS (4/4). (`redirect('/dashboard')` throws the mocked `REDIRECT:/dashboard` sentinel — this is the success path.)

- [ ] **Step 5: Commit**

```bash
git add actions/onboarding.ts "actions/__tests__/onboarding.test.ts"
git commit -m "feat: completeOnboarding action to persist school name"
```

---

### Task 4: `/onboarding` page + form

**Files:**
- Create: `app/onboarding/page.tsx`
- Create: `app/onboarding/OnboardingForm.tsx`
- Test: `app/__tests__/onboarding-page.test.ts`

**Interfaces:**
- Consumes: `getAuthUser`, `getProfile` (`@/lib/supabase/request`); `completeOnboarding` (`@/actions/onboarding`); `Logo`, `AuthCard`, `Button`, `Input`, `Label`.
- Produces: top-level route `/onboarding` (outside the `(organizer)` group). Server component redirects unauthenticated → `/login`, non-organizer → `/my-forms`, already-named organizer → `/dashboard`; otherwise renders `OnboardingForm`, which submits to `completeOnboarding`.

**Note:** `completeOnboarding` calls `redirect()` server-side. When invoked imperatively from the client `try/catch`, Next handles the redirect as a navigation response — it does **not** surface as a client-side throw into the `catch`, so the catch only ever sees real errors. This is intended.

- [ ] **Step 1: Write the failing test (RED)**

Create `app/__tests__/onboarding-page.test.ts`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))
// Defensive: the page transitively imports the action module.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

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

  it('redirects an organizer whose school name is already set to /dashboard', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    expect(await getRedirect()).toBe('/dashboard')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `pnpm test -- onboarding-page`
Expected: FAIL — `@/app/onboarding/page` does not exist yet.

- [ ] **Step 3: Write the client form**

Create `app/onboarding/OnboardingForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { completeOnboarding } from '@/actions/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OnboardingForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await completeOnboarding(new FormData(e.currentTarget))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name" className="text-[13px] font-semibold text-[#42506E]">Votre établissement</Label>
        <Input id="name" name="name" required className="h-11 rounded-[10px] border-[#C4CDE0]" />
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
      <Button type="submit" disabled={loading} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
        {loading ? 'Enregistrement…' : 'Continuer'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Write the page**

Create `app/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { OnboardingForm } from './OnboardingForm'

// Dedicated first-login step: capture the organizer's school name. The
// organizer layout gate bounces here while schools.name === ''. Once set,
// this page redirects completed organizers straight to the dashboard.
export default async function OnboardingPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')
  if ((profile.schools?.name ?? '') !== '') redirect('/dashboard')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Bienvenue sur Eazyexchange</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">Dernière étape : indiquez le nom de votre établissement.</p>
        </div>
        <OnboardingForm />
      </AuthCard>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes (GREEN)**

Run: `pnpm test -- onboarding-page`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/page.tsx app/onboarding/OnboardingForm.tsx "app/__tests__/onboarding-page.test.ts"
git commit -m "feat: add /onboarding page to capture school name"
```

---

### Task 5: Hard-gate the organizer layout

**Files:**
- Modify: `app/(organizer)/layout.tsx:19-20`

**Interfaces:**
- Consumes: `redirect` (already imported); `profile.schools` (already loaded via `getProfile`).
- Produces: any organizer whose `schools.name === ''` is redirected to `/onboarding` before the shell renders. (The `needsSchoolName` prop is still threaded here — it is retired in Task 6.)

**Note:** This task has no unit test (the layout is not unit-tested in the repo — see `OrganizerShell.test.tsx` for the shell's own coverage). It is verified via `npx tsc --noEmit` + the full suite, and live-driven in Task 7.

- [ ] **Step 1: Add the redirect gate**

In `app/(organizer)/layout.tsx`, replace this block (currently lines 19-20):

```tsx
  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false
```

with:

```tsx
  const school = profile?.schools ?? null
  // Hard gate: no organizer page renders with an empty school name. A fresh
  // organizer (email/password or Google) lands here and is sent to onboarding.
  if (school && school.name === '') redirect('/onboarding')
  const showGrace = school ? isInGrace(school as never) : false
```

- [ ] **Step 2: Verify the type/build gate**

Run: `npx tsc --noEmit && pnpm test`
Expected: PASS — no type errors; full suite green (no test targets the layout directly).

- [ ] **Step 3: Commit**

```bash
git add "app/(organizer)/layout.tsx"
git commit -m "feat: gate organizer layout on empty school name -> /onboarding"
```

---

### Task 6: Retire the deferred exchange-modal capture

**Files:**
- Modify: `components/shell/NewExchangeModal.tsx`
- Modify: `components/shell/OrganizerShell.tsx`
- Modify: `app/(organizer)/layout.tsx:40`
- Modify: `actions/exchanges.ts:46-72`
- Test: `components/shell/__tests__/NewExchangeModal.test.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `needsSchoolName` no longer exists on `NewExchangeModal` or `OrganizerShell`. `createExchange` no longer reads/writes `school_a_name` (the gate guarantees a non-empty school name before any organizer page renders). The `ownSchool` fetch + cap check stay.

**Why one task:** removing `needsSchoolName` from the `OrganizerShell`/`NewExchangeModal` interfaces and from the layout call site must land together, or `tsc` breaks (a caller passing a prop the interface no longer declares). The two component tests pass `needsSchoolName` on every render, so they change in the same task.

- [ ] **Step 1: Update the NewExchangeModal test first (RED)**

In `components/shell/__tests__/NewExchangeModal.test.tsx`:

Replace the `renders the French form` test with (drops the prop, keeps the negative assertion):

```tsx
  it('renders the French form', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} />)
    expect(screen.getByText('Nouvel échange')).toBeInTheDocument()
    expect(screen.getByLabelText("Nom de l'échange")).toBeInTheDocument()
    expect(screen.getByLabelText('Année')).toBeInTheDocument()
    expect(screen.getByLabelText('Établissement partenaire')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).toBeNull()
    expect(screen.getByRole('button', { name: "Créer l'échange" })).toBeInTheDocument()
  })
```

Delete the entire `shows the school-name field when needed` test (lines 47-50):

```tsx
  it('shows the school-name field when needed', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName />)
    expect(screen.getByLabelText('Votre établissement')).toBeInTheDocument()
  })
```

Then remove `needsSchoolName={false}` from every remaining `render(<NewExchangeModal ... />)` call in the file (the failed-submit, upgrade-CTA, other-errors, success, and stale-error tests). Each `needsSchoolName={false}` occurrence — including both inside the `clears a stale error` test's `rerender(...)` calls — is deleted, leaving e.g. `render(<NewExchangeModal open onOpenChange={onOpenChange} />)`.

- [ ] **Step 2: Update the OrganizerShell test (RED)**

In `components/shell/__tests__/OrganizerShell.test.tsx`, remove every `needsSchoolName={false}` prop from all `<OrganizerShell ... >` render calls — both in the `renderShell` helper and in each inline `render(...)` (there are several). Example, the `renderShell` helper becomes:

```tsx
  return render(
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId="ex1"
      organizerName="Marie Bernard"
      schoolName="Lycée Mistral"
    >
      <p>page</p>
    </OrganizerShell>
  )
```

- [ ] **Step 3: Run the tests to verify they fail (RED)**

Run: `pnpm test -- "NewExchangeModal|OrganizerShell"`
Expected: FAIL — `tsc`/vitest still see `needsSchoolName` as a required prop, and the deleted-field test removal is not yet matched by the component. (In practice vitest reports the removed `Votre établissement` field still rendering, since the modal still has the conditional block.)

- [ ] **Step 4: Remove `needsSchoolName` from NewExchangeModal**

In `components/shell/NewExchangeModal.tsx`, replace the component signature — this:

```tsx
export function NewExchangeModal({
  open,
  onOpenChange,
  needsSchoolName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  needsSchoolName: boolean
}) {
```

with:

```tsx
export function NewExchangeModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
```

Then delete the conditional school-name field block (currently lines 93-98):

```tsx
          {needsSchoolName && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school_a_name">Votre établissement</Label>
              <Input id="school_a_name" name="school_a_name" required className="h-12" />
            </div>
          )}
```

- [ ] **Step 5: Remove `needsSchoolName` from OrganizerShell**

In `components/shell/OrganizerShell.tsx`:

Remove `needsSchoolName,` from the destructured params and `needsSchoolName: boolean` from the props type — this block:

```tsx
export function OrganizerShell({
  exchanges,
  activeExchangeId,
  organizerName,
  schoolName,
  needsSchoolName,
  children,
}: {
  exchanges: ExchangeOption[]
  activeExchangeId: string | null
  organizerName: string
  schoolName: string
  needsSchoolName: boolean
  children: React.ReactNode
}) {
```

becomes:

```tsx
export function OrganizerShell({
  exchanges,
  activeExchangeId,
  organizerName,
  schoolName,
  children,
}: {
  exchanges: ExchangeOption[]
  activeExchangeId: string | null
  organizerName: string
  schoolName: string
  children: React.ReactNode
}) {
```

Then remove the prop from the modal render at the bottom — this:

```tsx
      <NewExchangeModal
        open={newExchangeOpen}
        onOpenChange={setNewExchangeOpen}
        needsSchoolName={needsSchoolName}
      />
```

becomes:

```tsx
      <NewExchangeModal
        open={newExchangeOpen}
        onOpenChange={setNewExchangeOpen}
      />
```

- [ ] **Step 6: Remove the prop from the layout call site**

In `app/(organizer)/layout.tsx`, delete this line (currently line 40) from the `<OrganizerShell>` props:

```tsx
      needsSchoolName={school?.name === ''}
```

- [ ] **Step 7: Remove the deferred-capture block in `createExchange`**

In `actions/exchanges.ts`, update the `ownSchool` fetch comment and delete the rename block. Replace this (currently lines 46-53):

```tsx
  // Deferred school-name capture: organizers who signed up with Google start
  // with an empty school name (nothing displays it until their first exchange).
  // Collect and persist it now, alongside the partner-school name.
  const { data: ownSchool, error: ownSchoolError } = await supabase
    .from('schools')
    .select('name, subscription_status, plan, grace_until')
    .eq('id', profile.school_id).single()
  if (ownSchoolError) throw ownSchoolError
```

with:

```tsx
  // Fetch the school's subscription state for the plan cap check below.
  const { data: ownSchool, error: ownSchoolError } = await supabase
    .from('schools')
    .select('name, subscription_status, plan, grace_until')
    .eq('id', profile.school_id).single()
  if (ownSchoolError) throw ownSchoolError
```

Then delete the rename block (currently lines 66-72):

```tsx
  if (ownSchool && ownSchool.name === '') {
    const schoolAName = (formData.get('school_a_name') as string ?? '').trim()
    if (!schoolAName) throw new Error('Veuillez renseigner le nom de votre établissement')
    const { error: renameError } = await supabase
      .from('schools').update({ name: schoolAName }).eq('id', profile.school_id)
    if (renameError) throw renameError
  }
```

(Leave the `ownSchool` fetch — the `.select` keeps `name` harmlessly — the count query, and the `canCreateExchange` cap check exactly as they are.)

- [ ] **Step 8: Run the tests to verify they pass (GREEN)**

Run: `pnpm test -- "NewExchangeModal|OrganizerShell"`
Expected: PASS. Then `npx tsc --noEmit` — no type errors (`needsSchoolName` gone from every reference).

- [ ] **Step 9: Commit**

```bash
git add components/shell/NewExchangeModal.tsx components/shell/OrganizerShell.tsx "app/(organizer)/layout.tsx" actions/exchanges.ts "components/shell/__tests__/NewExchangeModal.test.tsx" "components/shell/__tests__/OrganizerShell.test.tsx"
git commit -m "refactor: retire deferred school-name capture in exchange modal"
```

---

### Task 7: Full verification + finish the branch

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full gate**

Run:

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: lint clean (a pre-existing `apple-icon` `<img>` warning is expected and acceptable); all tests pass; no type errors.

- [ ] **Step 2: Live-drive the flow (manual)**

With `pnpm dev` running, confirm end-to-end (the layout gate is not unit-tested, so drive it live):
1. Sign up with email/password (no Établissement field on the form) → confirm email → land on `/dashboard` → **bounced to `/onboarding`**.
2. Submit an empty name → French error, stays on `/onboarding`. Submit a real name → lands on `/dashboard`, school name shows in the shell.
3. Reload `/onboarding` as the now-named organizer → **redirected to `/dashboard`**.
4. Deep-link `/settings` while the name is empty (e.g. a Google-signup account mid-flow) → **bounced to `/onboarding`**, not rendered with a blank name.
5. Create a New Exchange → the modal has **no** "Votre établissement" field; the exchange is created normally.

- [ ] **Step 3: Update the progress ledger + memory**

Mark the plan stage done in `.superpowers/sdd/progress.md` (Onboarding flow section → `[x] Plan`, `[ ] Execution` progress) and update the `project_onboarding_etablissement` memory phase entry per the Session & Token Hygiene rule.

- [ ] **Step 4: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to choose merge/PR. Do **not** push to `main` (production deploy) without Bjorn's confirmation and a green `pnpm build` on the merge result. No migration ships with this feature — deploy is app-code only.

---

## Self-Review

**Spec coverage:**
- Remove Établissement from sign-up → Task 1. ✅
- Both paths start with `schools.name === ''` (email/password path) → Task 2 (Google path already did). ✅
- Dedicated `/onboarding` page + redirects (unauth→login, student→my-forms, already-named→dashboard) → Task 4. ✅
- `completeOnboarding` action (auth+organizer guard, trim, reject empty, persist, revalidate, redirect) → Task 3. ✅
- Hard gate in `app/(organizer)/layout.tsx` → Task 5. ✅
- Retire `needsSchoolName` in `NewExchangeModal` + `OrganizerShell` + layout, and the `school_a_name` block in `createExchange` (keeping the `ownSchool` fetch for the cap check) → Task 6. ✅
- Non-goal respected: only the school name is persisted; no new fields, no migration. ✅
- Testing strategy (completeOnboarding unit; onboarding page redirects; sign-up no field/metadata; provision `''`; NewExchangeModal no field; update signup.test) → Tasks 1–6; final full gate → Task 7. ✅
- Middleware: verified `/onboarding` is reachable by authenticated users and no change is required (not an auth/public route → falls through; unauth is already bounced to `/login`). No task needed. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code and exact commands. ✅

**Type consistency:** `completeOnboarding(formData: FormData): Promise<void>` is defined in Task 3 and consumed identically by `OnboardingForm` in Task 4. `needsSchoolName` is removed from `NewExchangeModal`, `OrganizerShell`, and the layout call site in the same task (Task 6), keeping `tsc` green. The form field is `name` (both the action's `formData.get('name')` and the `<Input name="name">` agree). ✅
