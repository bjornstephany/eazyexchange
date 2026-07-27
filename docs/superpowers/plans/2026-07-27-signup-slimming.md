# Signup Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/signup` requires full name, email and password — nothing else — and the establishment is captured only at `/onboarding` step 1.

**Architecture:** Delete the signup-side establishment picker and the two intake fields, then follow the dead weight downstream: `provisionOrganizer` collapses to a single function that always creates a blank school (the existing Google path), the anon `searchPublicSchools` action goes, and the `/admin` card, the request email and two DB columns shed the fields they carried. `/onboarding` is not touched — it already does the real capture and simply starts firing for email/password signups.

**Tech Stack:** Next.js 14 App Router, Supabase (RLS + service-role admin client), Vitest + Testing Library, Tailwind, Resend.

**Spec:** `docs/superpowers/specs/2026-07-27-signup-slimming-design.md`

## Global Constraints

- Branch is `feature/signup-slimming` in the worktree. **Confirm with `git branch --show-current` before every commit.**
- **Never `git add -A` / `git add .`** — stage only the named files.
- All UI copy is French, with typographic apostrophes (`’`, U+2019), never `'`. `lib/__tests__/email-french-copy.test.ts` scans rendered email text and will fail on a straight apostrophe.
- Never log student/parent PII. `failProvisioning` logs the reason only, never the address — that assertion is under test and must keep passing.
- Expected outcomes are structured return values, never thrown — prod redacts thrown Server Action messages.
- Task 5 touches `supabase/migrations/`, which is **single-writer across sessions**. Do not start it while another session is mid-migration.
- Gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`.

---

### Task 1: Slim `/signup` to three fields

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Test: `app/(auth)/__tests__/signup.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `signUp` metadata contract `{ full_name: string }` — Task 2's `provisionOrganizer` reads exactly `full_name` (falling back to `name` for Google) and nothing else.

Independently shippable: after this task `provisionOrganizer` still compiles and still works, because `resolveSchool` already returns `null` (→ blank school) when `school_uai` is absent. Task 2 removes the now-unreachable branch.

- [ ] **Step 1: Rewrite the test file**

Replace `app/(auth)/__tests__/signup.test.tsx` in full:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

const { confirmSignupCode, resendSignupCode } = vi.hoisted(() => ({
  confirmSignupCode: vi.fn(async (_email: string, _code: string) => ({ ok: false, error: 'invalid_code' as const })),
  resendSignupCode: vi.fn(async (_email: string) => ({ ok: true as const })),
}))
vi.mock('@/app/(auth)/signup/actions', () => ({ confirmSignupCode, resendSignupCode }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => {
  signUp.mockClear()
  confirmSignupCode.mockClear()
  resendSignupCode.mockClear()
})

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
  await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
}

describe('SignupPage (French)', () => {
  // Creating an account asks for the three things an account needs. The
  // establishment is captured at /onboarding step 1, which validates it against
  // the registry; asking here as well was a duplicate the approval gate made
  // redundant. Asserting absence is the point — re-adding a field would
  // otherwise slip through every other test in this file.
  it('asks for the full name, e-mail and password only', () => {
    render(<SignupPage />)
    expect(screen.getByLabelText(/nom complet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/votre établissement/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/votre rôle/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/comment nous avez-vous connus/i)).not.toBeInTheDocument()
  })

  it('submits signUp with the full name as the only metadata', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    // toEqual, not toMatchObject: a leftover school_uai or role_description key
    // would mean provisionOrganizer is still being fed data nothing reads.
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(await screen.findByLabelText(/code de confirmation/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/^e-mail/i), 'a@b')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/adresse e-mail valide/i)).toBeInTheDocument()
  })

  it('submits the 6-digit code to confirmSignupCode', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)
    await user.type(await screen.findByLabelText(/code de confirmation/i), '123456')
    await user.click(screen.getByRole('button', { name: /confirmer/i }))
    expect(confirmSignupCode).toHaveBeenCalledWith('jane@example.com', '123456')
  })

  it('renders a structured error inline when the code is wrong', async () => {
    confirmSignupCode.mockResolvedValueOnce({ ok: false, error: 'invalid_code' })
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)
    await user.type(await screen.findByLabelText(/code de confirmation/i), '000000')
    await user.click(screen.getByRole('button', { name: /confirmer/i }))
    expect(await screen.findByText(/code incorrect/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run "app/(auth)/__tests__/signup.test.tsx" --exclude '**/.claude/**'`

Expected: FAIL — the first test finds « Votre établissement » still in the DOM, and the metadata test sees the extra `school_uai` / `role_description` / `how_found_us` keys.

- [ ] **Step 3: Remove the three fields from the page**

In `app/(auth)/signup/page.tsx`, delete these three import lines:

```tsx
import { SchoolCombobox } from '@/app/onboarding/SchoolCombobox'
import { searchPublicSchools } from '@/actions/public-schools'
import type { SchoolOption } from '@/lib/schools/registry'
```

Delete these three state declarations:

```tsx
const [school, setSchool] = useState<SchoolOption | null>(null)
const [roleDescription, setRoleDescription] = useState('')
const [howFoundUs, setHowFoundUs] = useState('')
```

Replace the whole body of `handleSignup` (keep the function signature) with:

```tsx
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = fullName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name) { setError('Veuillez remplir tous les champs.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    // Full name is all provisionOrganizer reads. The establishment is captured
    // at /onboarding step 1, where it is validated against school_registry —
    // asking for it here as well duplicated that, and the approval gate
    // (every self-signup lands pending) is what actually keeps fake schools out.
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    setConfirmEmail(cleanEmail)
    setCooldown(RESEND_COOLDOWN)
    setSubmitted(true)
    setLoading(false)
  }
```

In the JSX, delete the `<SchoolCombobox ... />` line and the two `<div>` blocks whose labels are `roleDescription` and `howFoundUs` — everything from `<SchoolCombobox` through the closing `</div>` of the `howFoundUs` block, leaving the « Nom complet » block followed directly by the « E-mail » block.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run "app/(auth)/__tests__/signup.test.tsx" "app/(auth)/signup/__tests__/page.order.test.tsx" --exclude '**/.claude/**'`

Expected: PASS, both files. `page.order.test.tsx` must pass **untouched** — it asserts the submit button still precedes the Google button.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/signup-slimming
git add "app/(auth)/signup/page.tsx" "app/(auth)/__tests__/signup.test.tsx"
git commit -m "feat(signup): ask for name, e-mail and password only"
```

---

### Task 2: Collapse `provisionOrganizer` to one function

**Files:**
- Modify: `lib/auth/provision.ts`
- Modify: `lib/email.ts:372-399` (`sendSignupRequestEmail`)
- Modify: `app/auth/callback/route.ts:5,57`
- Test: `lib/auth/__tests__/provision.test.ts`
- Test: `lib/__tests__/email-signup.test.ts`

**Interfaces:**
- Consumes: the `{ full_name }` metadata contract from Task 1.
- Produces: `provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult>` — the single exported provisioning entry point. `provisionOrganizerFromOAuth` no longer exists. `sendSignupRequestEmail(opts: { fullName: string; email: string })`.

`lib/email.ts` and `lib/auth/provision.ts` change in the same task because the call signature is shared — splitting them leaves the tree uncompilable in between.

- [ ] **Step 1: Rewrite the provisioning test file**

Replace `lib/auth/__tests__/provision.test.ts` in full:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface AdminOpts {
  existingUser?: { id: string } | null
  schoolInsert?: { data: { id: string } | null; error: unknown }
  usersInsertError?: unknown
  // The status set_initial_user_status() assigned, read back by the insert.
  insertedStatus?: 'pending' | 'approved'
}

let admin: ReturnType<typeof makeAdmin>

function makeAdmin(opts: AdminOpts = {}) {
  const {
    existingUser = null,
    schoolInsert = { data: { id: 'school-1' }, error: null },
    usersInsertError = null,
    insertedStatus = 'pending',
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
          insert: (row: unknown) => {
            calls.usersInserted.push(row)
            return {
              select: () => ({
                single: async () => ({
                  data: usersInsertError ? null : { status: insertedStatus },
                  error: usersInsertError,
                }),
              }),
            }
          },
        }
      }
      if (table === 'schools') {
        return {
          insert: (row: unknown) => { calls.schoolsInserted.push(row); return { select: () => ({ single: async () => schoolInsert }) } },
          delete: () => ({ eq: async (_col: string, id: string) => { calls.schoolsDeleted.push(id); return { error: null } } }),
        }
      }
      // school_registry is deliberately absent: provisioning no longer reads it.
      // A stray probe must blow up loudly rather than pass on a permissive mock.
      throw new Error('unexpected table ' + table)
    },
  }
  return client
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

// The mocks take real async time on purpose: a fire-and-forget (`void`) call
// would still be in flight when provisionOrganizer returns, so `delivered`
// distinguishes an awaited send from a dropped one. On serverless the dropped
// one never arrives — which is how a broken service-role key stayed silent.
const delivered = { request: false, failure: false }
const sendSignupRequestEmail = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 5))
  delivered.request = true
})
const sendSignupFailureEmail = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 5))
  delivered.failure = true
})
vi.mock('@/lib/email', () => ({
  sendSignupRequestEmail: (o: Record<string, unknown>) => sendSignupRequestEmail(o),
  sendSignupFailureEmail: (o: Record<string, unknown>) => sendSignupFailureEmail(o),
}))

import { provisionOrganizer } from '@/lib/auth/provision'

const baseUser = {
  id: 'u1',
  email: 'Org@Example.com',
  user_metadata: { full_name: '  Jane Doe  ' },
}

beforeEach(() => {
  admin = makeAdmin()
  sendSignupRequestEmail.mockClear()
  sendSignupFailureEmail.mockClear()
  delivered.request = false
  delivered.failure = false
})

describe('provisionOrganizer', () => {
  // The school is created blank on every path. /onboarding step 1 names it
  // through claim_school(), which re-validates against school_registry — so
  // provisioning has no school to resolve and no registry to read.
  it('creates a blank school and a pending organizer profile', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '', uai: null, country: 'FR' }])
    expect(admin.calls.usersInserted).toEqual([
      {
        id: 'u1', school_id: 'school-1', role: 'organizer', org_role: 'owner',
        full_name: 'Jane Doe', email: 'org@example.com',
      },
    ])
  })

  it('creates the same blank school for a Google identity', async () => {
    const result = await provisionOrganizer({
      id: 'g1', email: 'Org@Example.com', user_metadata: { full_name: '  Jane Google  ' },
    })
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.schoolsInserted).toEqual([{ name: '', uai: null, country: 'FR' }])
    expect(admin.calls.usersInserted[0]).toMatchObject({ full_name: 'Jane Google' })
  })

  it('falls back to the name field when full_name is absent', async () => {
    const result = await provisionOrganizer({
      id: 'g1', email: 'a@b.com', user_metadata: { name: 'From Name' },
    })
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(admin.calls.usersInserted[0]).toMatchObject({ full_name: 'From Name' })
  })

  it('notifies the platform admins about a pending request', async () => {
    await provisionOrganizer(baseUser)
    expect(sendSignupRequestEmail).toHaveBeenCalledTimes(1)
    expect(sendSignupRequestEmail.mock.calls[0][0]).toEqual({
      fullName: 'Jane Doe', email: 'org@example.com',
    })
  })

  it('reports approved for an allowlisted address, and sends no request email', async () => {
    admin = makeAdmin({ insertedStatus: 'approved' })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(sendSignupRequestEmail).not.toHaveBeenCalled()
  })

  it('is idempotent: no writes when a profile already exists', async () => {
    admin = makeAdmin({ existingUser: { id: 'u1' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(admin.calls.schoolsInserted).toEqual([])
    expect(admin.calls.usersInserted).toEqual([])
  })

  it('rolls back the school and alerts when the profile insert fails', async () => {
    admin = makeAdmin({ usersInsertError: { message: 'boom' } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'profile_insert_failed' })
    expect(admin.calls.schoolsDeleted).toEqual(['school-1'])
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'org@example.com', reason: 'profile_insert_failed',
    })
  })

  it('alerts when the school insert fails', async () => {
    admin = makeAdmin({ schoolInsert: { data: null, error: { message: 'boom' } } })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: false, reason: 'school_insert_failed' })
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'org@example.com', reason: 'school_insert_failed',
    })
  })

  it('fails without creating anything when the full name is missing', async () => {
    const result = await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(result).toEqual({ ok: false, reason: 'missing_metadata' })
    expect(admin.calls.schoolsInserted).toEqual([])
  })

  it('alerts when metadata is missing', async () => {
    await provisionOrganizer({ id: 'u1', email: 'a@b.com', user_metadata: {} })
    expect(sendSignupFailureEmail).toHaveBeenCalledWith({
      email: 'a@b.com', reason: 'missing_metadata',
    })
  })

  // A `void` send is dropped when the serverless function freezes after the
  // response — precisely when the alert matters most. send() already swallows
  // its own errors, so awaiting cannot fail the signup.
  it('waits for the failure alert to be delivered before returning', async () => {
    admin = makeAdmin({ schoolInsert: { data: null, error: { message: 'boom' } } })
    await provisionOrganizer(baseUser)
    expect(delivered.failure).toBe(true)
  })

  it('waits for the admin notification to be delivered before returning', async () => {
    await provisionOrganizer(baseUser)
    expect(delivered.request).toBe(true)
  })

  it('logs the failure reason without leaking the address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    admin = makeAdmin({ schoolInsert: { data: null, error: { message: 'boom' } } })
    await provisionOrganizer(baseUser)
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('school_insert_failed')
    expect(logged).not.toContain('org@example.com')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Rewrite the signup-email test cases**

In `lib/__tests__/email-signup.test.ts`, replace the entire `describe('sendSignupRequestEmail', ...)` block (lines 15–59) with:

```ts
describe('sendSignupRequestEmail', () => {
  it('sends the request to ADMIN_EMAILS with a link to the queue', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({ fullName: 'Marie Dupont', email: 'm.dupont@ac-lyon.fr' })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toEqual(['owner@example.com'])
    expect(call.html).toContain('Marie Dupont')
    expect(call.html).toContain('m.dupont@ac-lyon.fr')
    expect(call.html).toContain('/admin')
  })

  it('escapes HTML in the applicant-supplied fields', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({ fullName: '<script>alert(1)</script>', email: 'x@y.fr' })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('does nothing when ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({ fullName: 'A', email: 'a@b.fr' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
```

The dropped « marks a Google signup as having no details » case goes with the `viaGoogle` note: every request now carries the same two facts, so there is no Google-specific rendering left to assert. Leave `describe('sendSignupFailureEmail', ...)` untouched.

- [ ] **Step 3: Run both test files to verify they fail**

Run: `pnpm vitest run lib/auth/__tests__/provision.test.ts lib/__tests__/email-signup.test.ts --exclude '**/.claude/**'`

Expected: FAIL — `provisionOrganizer` still inserts `role_description`/`how_found_us` and still probes `school_registry` (which now throws `unexpected table school_registry`); `sendSignupRequestEmail` still requires four more options.

- [ ] **Step 4: Rewrite `lib/auth/provision.ts`**

Replace the file in full:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignupRequestEmail, sendSignupFailureEmail } from '@/lib/email'

export interface ProvisionUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export type ProvisionResult =
  | { ok: true; status: 'pending' | 'approved' }
  | { ok: false; reason: string }

function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

function normalizedEmail(user: ProvisionUser): string {
  return (user.email ?? '').trim().toLowerCase()
}

// Single exit for every provisioning failure, because none of them is visible
// otherwise: the user only ever sees a generic « Réessayez », and these are
// structured returns by design, so they never reach error_reports either.
//
// The email is awaited, not fire-and-forget. send() swallows its own errors and
// returns a boolean, so awaiting cannot fail a signup — whereas a `void` call is
// dropped when the serverless function freezes after the response, i.e. exactly
// when the alert matters. The log line carries the reason only, never the
// address.
async function failProvisioning(email: string, reason: string): Promise<ProvisionResult> {
  console.error(`[provision] failed: ${reason}`)
  if (email) await sendSignupFailureEmail({ email, reason })
  return { ok: false, reason }
}

// Creates the organizer account for every signup path — email/password and
// Google alike. Idempotent; rolls back the school if the profile insert fails
// so a partial failure leaves no debris.
//
// The school is always created blank. /onboarding step 1 names it through
// claim_school(), which re-validates the pick against school_registry; signup
// deliberately asks for nothing but the name, and the approval gate (every
// self-signup lands pending) is what keeps fake schools out.
//
// The initial status is NOT decided here — set_initial_user_status() decides
// it in the database so that join.ts, invitations.ts and the RLS fixtures are
// covered by the same rule. We read it back to pick the redirect.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  // `name` is Google's field; email/password signups only ever set `full_name`.
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  const email = normalizedEmail(user)
  if (!fullName || !email) return failProvisioning(email, 'missing_metadata')

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true, status: 'approved' }

  const { data: created, error: schoolError } = await admin
    .from('schools')
    .insert({ name: '', uai: null, country: 'FR' })
    .select('id').single()
  if (schoolError || !created) {
    return failProvisioning(email, 'school_insert_failed')
  }

  const { data: profile, error: profileError } = await admin.from('users').insert({
    id: user.id,
    school_id: created.id,
    role: 'organizer' as const,
    org_role: 'owner' as const,
    full_name: fullName,
    email,
  }).select('status').single()

  if (profileError || !profile) {
    await admin.from('schools').delete().eq('id', created.id)
    return failProvisioning(email, 'profile_insert_failed')
  }

  const status = profile.status as 'pending' | 'approved'
  if (status === 'pending') {
    // Awaited for the same reason as the failure alert: send() cannot throw, and
    // a dropped notification means an organizer waits on /pending that nobody
    // knows about.
    await sendSignupRequestEmail({ fullName, email })
  }

  return { ok: true, status }
}
```

- [ ] **Step 5: Rewrite `sendSignupRequestEmail`**

In `lib/email.ts`, replace the whole function (currently lines 372–399) with:

```ts
export async function sendSignupRequestEmail(opts: {
  fullName: string
  email: string
}): Promise<void> {
  const to = adminRecipients()
  if (to.length === 0) return

  // Name and address are all signup collects. The establishment is not known
  // yet — it is captured at /onboarding, after approval — so there is nothing
  // provider-specific left to flag either.
  const html = layout(`
    <p><strong>Nouvelle demande d’accès</strong></p>
    <p style="font-size:14px;">
      <strong>${esc(opts.fullName)}</strong><br>
      ${esc(opts.email)}
    </p>
    <p><a href="${APP_URL}/admin" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Examiner la demande</a></p>
  `, ADMIN_FOOTER)
  await send(to, 'Nouvelle demande d’accès', html, 'signup request email')
}
```

Note the two typographic apostrophes in « demande d’accès » (U+2019) — `email-french-copy.test.ts` fails on a straight `'`.

- [ ] **Step 6: Update the Google callback call site**

In `app/auth/callback/route.ts` line 5, change the import:

```ts
import { provisionOrganizer } from '@/lib/auth/provision'
```

and line 57:

```ts
    const result = await provisionOrganizer(user)
```

`app/(auth)/signup/actions.ts` and `app/auth/confirm/route.ts` already import `provisionOrganizer` and need no change.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run lib/auth/__tests__/provision.test.ts lib/__tests__/email-signup.test.ts lib/__tests__/email-french-copy.test.ts --exclude '**/.claude/**'`

Expected: PASS, all three files.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors. (Trust this over any LSP diagnostics — worktrees produce false ones.)

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # must print feature/signup-slimming
git add lib/auth/provision.ts lib/email.ts app/auth/callback/route.ts \
        lib/auth/__tests__/provision.test.ts lib/__tests__/email-signup.test.ts
git commit -m "refactor(auth): one provisioning path, always a blank school"
```

---

### Task 3: Delete the anonymous registry search

**Files:**
- Delete: `actions/public-schools.ts`
- Delete: `actions/__tests__/public-schools.test.ts`
- Modify: `app/onboarding/SchoolCombobox.tsx:16-24,54`

**Interfaces:**
- Consumes: Task 1 removed the only import of `searchPublicSchools`.
- Produces: `SchoolCombobox({ value, onSelect })` — the injectable `search` prop is gone; `/onboarding` is the sole consumer and always uses the organizer-gated `searchSchools`.

- [ ] **Step 1: Delete both files**

```bash
git rm actions/public-schools.ts actions/__tests__/public-schools.test.ts
```

- [ ] **Step 2: Remove the injectable prop from `SchoolCombobox`**

In `app/onboarding/SchoolCombobox.tsx`, replace the component signature (currently lines 16–24) with:

```tsx
export function SchoolCombobox({ value, onSelect }: {
  value: SchoolOption | null
  onSelect: (option: SchoolOption | null) => void
}) {
```

In the debounced effect, change the call to the direct import:

```tsx
      void searchSchools(query)
```

and drop `search` from the effect's dependency array, which becomes:

```tsx
  }, [query, value])
```

The `import { searchSchools } from '@/actions/onboarding'` on line 3 stays and is now the only search path.

- [ ] **Step 3: Verify nothing still references the deleted action**

Run: `grep -rn "searchPublicSchools\|public-schools" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "\.next"`

Expected: no output.

- [ ] **Step 4: Run the onboarding tests and typecheck**

Run: `pnpm vitest run app/onboarding --exclude '**/.claude/**' && npx tsc --noEmit`

Expected: PASS, no type errors. These tests are the regression net proving step 1 still works for the organizers now routed through it.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/signup-slimming
git add app/onboarding/SchoolCombobox.tsx
git commit -m "refactor(schools): drop the anonymous registry search action"
```

Stage only the modified file: `git rm` in Step 1 already staged both deletions, and naming a path that no longer exists would fail the pathspec and abort the **entire** `git add`, committing the rm alone. Confirm with `git status --short` before committing — expect `D`, `D`, `M`.

---

### Task 4: Drop the intake fields from `/admin`

**Files:**
- Modify: `app/admin/page.tsx:15-16,33,51-54`

**Interfaces:**
- Consumes: nothing. Must land **before** Task 5, which drops the columns this page currently selects.
- Produces: an `/admin` page that reads no column Task 5 removes.

- [ ] **Step 1: Remove the two columns from the row type and query**

In `app/admin/page.tsx`, delete these two lines from `type Row`:

```ts
  role_description: string | null
  how_found_us: string | null
```

and change the `select` on line 33 to:

```ts
    .select('id, email, full_name, status, created_at, reviewed_at, notes, schools(name)')
```

- [ ] **Step 2: Update the card body**

Delete this block entirely:

```tsx
                <div className="mt-1 text-[13px] text-[#8A97B2]">
                  Rôle : {r.role_description || '—'} · Nous a connus par : {r.how_found_us || '—'}
                </div>
```

and change the establishment line above it to:

```tsx
                <div className="text-[#5B6B8C]">{r.schools?.name || <em>établissement pas encore renseigné</em>}</div>
```

The old copy said « (Google) », which was true when email/password signups named their school up front. Every pending row is blank now, whatever the provider — the establishment arrives at `/onboarding`, after approval. `schools(name)` stays in the query because a reviewed row does show it.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && pnpm lint`

Expected: no errors, no warnings.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feature/signup-slimming
git add app/admin/page.tsx
git commit -m "feat(admin): review requests on name, e-mail and date"
```

---

### Task 5: Drop the two columns

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_drop_signup_intake_fields.sql`
- Modify: `types/supabase.ts` (regenerated verbatim, never hand-edited)

**Interfaces:**
- Consumes: Tasks 1, 2 and 4 must all be committed first — nothing may read or write these columns when the migration lands.
- Produces: no new interface. `users` loses `role_description` and `how_found_us`.

**`supabase/migrations/` is single-writer across sessions.** Before starting, confirm no other session is mid-migration; if one is, wait.

- [ ] **Step 1: Confirm nothing references the columns**

Run: `grep -rn "role_description\|how_found_us" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "\.next" | grep -v types/supabase.ts | grep -v supabase/migrations`

Expected: no output. `types/supabase.ts` and the 20260725154243 migration are the only permitted hits, and the first is fixed in Step 5.

- [ ] **Step 2: Write the migration**

Timestamp the filename with the current UTC time in `YYYYMMDDHHMMSS` form (e.g. `20260727143000_drop_signup_intake_fields.sql`):

```sql
-- Drop the two self-declared signup intake fields.
-- Spec: docs/superpowers/specs/2026-07-27-signup-slimming-design.md
--
-- Added on 2026-07-25 with the approval gate to inform the /admin decision.
-- That decision is made over private email with the applicant, so the fields
-- only cost two required inputs at the highest-friction moment in the funnel.
-- Nothing reads or writes them as of this migration.

alter table public.users
  drop column role_description,
  drop column how_found_us;

-- The grant in 20260725154243 named both columns, so it has to be re-issued.
-- Same shape as there: revoke wholesale, then grant the exact self-writable
-- set — full_name (accept-invite, settings), email, locale (settings) and
-- exchange_order (session). status, reviewed_at and notes stay service-role
-- only, which is the approval gate's whole point.
revoke update on public.users from authenticated, anon;
grant update (full_name, email, locale, exchange_order)
  on public.users to authenticated;
```

- [ ] **Step 3: Apply to staging**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Expected: the new migration applies cleanly. If it hangs, it is the known WSL2 IPv6 issue — resolve the host with `getent ahostsv4` and substitute the IPv4 address in the URL.

- [ ] **Step 4: Apply to production**

Use the Supabase MCP `apply_migration` tool with `name` = `drop_signup_intake_fields` and the SQL body from Step 2. **Never `supabase db push` against prod.**

Then MCP `list_migrations`: if the ledger stamped a version different from the filename, `git mv` the local file to the stamped version. Also update staging's ledger to match if it drifts — never run `migration repair`.

- [ ] **Step 5: Regenerate types**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim.

Run: `npx tsc --noEmit`

Expected: no errors. `types/db.ts` narrows the generated rows, so schema drift fails compile there — fix the alias if it does, never hand-edit `types/supabase.ts`.

- [ ] **Step 6: Run the RLS regression matrix**

Run: `pnpm test:rls`

Expected: PASS. This migration changes column grants on `users`, so the matrix is mandatory.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feature/signup-slimming
git add supabase/migrations/<stamped-filename>.sql types/supabase.ts
git commit -m "feat(db): drop users.role_description and users.how_found_us"
```

---

### Task 6: Full gate and merge

**Files:** none — verification only.

- [ ] **Step 1: Run the full gate**

```bash
pnpm lint && pnpm test && pnpm build && pnpm test:rls
```

Expected: all four pass. A single test file that fails once and passes on re-run is another session's mid-write race — re-run that file alone before debugging it.

- [ ] **Step 2: Check no other session is merging**

`main` is merge-only and three sessions are in flight. Check `git log origin/main..main` and the state of `main` before merging; if another session is mid-merge, wait for it.

- [ ] **Step 3: Merge to `main`**

```bash
git checkout main
git merge --no-ff feature/signup-slimming
```

- [ ] **Step 4: Push**

Only once all three sessions have merged. Push from one session:

```bash
git push origin main
```

- [ ] **Step 5: Leave the worktree**

Use the `ExitWorktree` tool with `remove` — not `git worktree remove`.

## Manual verification (post-deploy)

Not automatable here; record the result in the session.

1. `/signup` shows exactly three inputs plus the Google button.
2. A fresh email/password signup receives the 6-digit code, confirms, and lands on `/pending`.
3. The « Nouvelle demande d’accès » email arrives with the name and address, and its `/admin` button works.
4. Approving at `/admin` sends the organizer to `/onboarding` **step 1**, with the country selector and the registry combobox — the step email/password signups used to skip.
5. Picking « Autre pays » → free text completes onboarding, confirming the four non-FR locales now have a working email/password path.
