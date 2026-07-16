# In-Page Continuation After Invitation Acceptance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-16-invite-inline-continuation-design.md`
**Branch:** `feature/invite-inline-continuation` (created in Task 1, Step 0)

**Goal:** Clicking « Oui, je veux participer » on `/invite/[token]` signs the student in immediately (no second email) and redirects them to `/accept-invite`; the invite page also gains recovery states for abandoned setup.

**Architecture:** `respondToInvitation('yes')` swaps `inviteUserByEmail` for `createUser({ email_confirm: true })` + `generateLink({ type: 'magiclink' })` + `verifyOtp` on the cookie-aware server client (same primitive as `/auth/confirm`), so the session is minted inside the server action. All expected outcomes travel as structured return values (house pattern: `lib/billing/exchange-limit.ts`). A new `resumeInviteSetup` action lets a student with a valid token re-mint a session if they abandoned setup.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (admin client + SSR cookie client), Vitest + Testing Library, Tailwind. Package manager is **pnpm**.

## Global Constraints

- **No DB migration** — no `test:rls` run required (spec §Unchanged).
- **All student-facing copy is French** (spec §3).
- **Never branch client-side on `error.message`** — prod redacts thrown Server Action messages; expected outcomes are structured returns, throwing only for genuinely unexpected failures (spec §3, CLAUDE.md gotcha).
- **Never log student email/name/PII** (CLAUDE.md).
- `actions/invitations.ts` is the anonymous invite-token trust-model file — the new resume action lives there, not in `apply.ts`/`applications-review.ts` (CLAUDE.md). It is already on the admin-client allowlist; no allowlist change.
- `'use server'` files may only export async functions — shared types/constants go in a plain `lib/` module (pattern: `lib/billing/exchange-limit.ts`).
- Verification gate: `pnpm lint && pnpm test && pnpm build` (build fails locally on placeholder env — use `npx tsc --noEmit` instead of `pnpm build`, per `project_local_verification_setup`).
- Commit staging: **name files explicitly** in `git add` — never `git add -A`.
- `/accept-invite`, `/auth/confirm`, `/auth/callback`, « Non merci »/« Peut-être » paths, and the enrollment-checklist email are **unchanged**.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `lib/invite-response.ts` | Create | Shared result type + French error messages (importable by action *and* client components) |
| `actions/invitations.ts` | Modify | Rewrite `respondToInvitation` (createUser + session mint + structured returns), add `mintInviteSession` helper, add `resumeInviteSetup`, extend `getInvitation` with `setupComplete` |
| `actions/__tests__/applications.test.ts` | Modify | Rewrite `respondToInvitation` block for new auth mocks + structured returns; add `resumeInviteSetup` block |
| `actions/__tests__/enrollment-checklist.test.ts` | Modify | Update auth mocks + return-value assertions |
| `components/InviteResponseForm.tsx` | Modify | Branch on structured result; `router.push('/accept-invite')` on Yes; drop « boîte mail » copy |
| `components/__tests__/InviteResponseForm.test.tsx` | Modify | New behavior coverage |
| `components/InviteResumeCard.tsx` | Create | Client card: « Reprendre la configuration » button → `resumeInviteSetup` → redirect |
| `app/invite/[token]/page.tsx` | Modify | Recovery states for `enrolling`/`enrolled` (resume vs. account-active) |
| `app/__tests__/invite-page.test.tsx` | Create | Page state matrix tests |
| `CLAUDE.md` | Modify (Task 5) | Correct the invite-acceptance gotcha line |

---

### Task 1: Structured result contract + `respondToInvitation` rewrite

**Files:**
- Create: `lib/invite-response.ts`
- Modify: `actions/invitations.ts`
- Test: `actions/__tests__/applications.test.ts`, `actions/__tests__/enrollment-checklist.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (cookie-aware, `await`ed), `tokenExpired` from `@/lib/tokens`, `ARCHIVED_ERROR` from `@/lib/exchange-guard`.
- Produces (later tasks rely on these exactly):
  - `lib/invite-response.ts`: `type InviteErrorCode = 'not_found' | 'expired' | 'closed' | 'email_exists' | 'retry' | 'archived'`; `type InviteActionResult = { ok: true } | { ok: false; error: InviteErrorCode; message: string }`; `const INVITE_ERROR_MESSAGES: Record<InviteErrorCode, string>`; `function inviteError(code: InviteErrorCode): InviteActionResult`.
  - `actions/invitations.ts`: `respondToInvitation(token: string, response: 'yes' | 'no' | 'maybe', note: string): Promise<InviteActionResult>`; module-private `mintInviteSession(admin, email): Promise<boolean>`.

- [ ] **Step 0: Create the branch**

```bash
git checkout main && git pull && git checkout -b feature/invite-inline-continuation
```

- [ ] **Step 1: Write `lib/invite-response.ts`** (contract first — tests import it)

```ts
// Shared contract for the invitation actions' *expected* outcomes.
// Lives outside the 'use server' module so both the actions and the client
// components can import the type and messages — a 'use server' file may only
// export async functions. Same pattern as lib/billing/exchange-limit.ts:
// Next.js redacts thrown Server Action error messages in production, so
// expected results must travel as return values, in French (student-facing).

export type InviteErrorCode =
  | 'not_found'      // token matches no application
  | 'expired'        // invite_token_expires_at is past
  | 'closed'         // invitation already answered / not open
  | 'email_exists'   // an account already exists for this email
  | 'retry'          // enrollment succeeded but the session mint failed — click « Oui » again
  | 'archived'       // exchange archived (read-only)

export const INVITE_ERROR_MESSAGES: Record<InviteErrorCode, string> = {
  not_found: 'Cette invitation est introuvable. Vérifie le lien dans ton e-mail.',
  expired: 'Cette invitation a expiré. Contacte ton organisateur pour en recevoir une nouvelle.',
  closed: 'Cette invitation n’est plus ouverte.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail. Connecte-toi depuis la page de connexion.',
  retry: 'Ton inscription est bien enregistrée, mais la connexion automatique a échoué. Clique à nouveau sur « Oui, je veux participer » pour accéder à ton compte.',
  archived: 'Programme archivé — lecture seule.',
}

export type InviteActionResult =
  | { ok: true }
  | { ok: false; error: InviteErrorCode; message: string }

export function inviteError(code: InviteErrorCode): InviteActionResult {
  return { ok: false, error: code, message: INVITE_ERROR_MESSAGES[code] }
}
```

- [ ] **Step 2: Rewrite the `respondToInvitation` test block in `actions/__tests__/applications.test.ts`**

2a. Extend the `scenario` type (top of file) — add these fields to the `let scenario:` block:

```ts
  profileInsertError: any | null   // injected error for users-table inserts
  createUserAttrs: any | null      // captured attrs of auth.admin.createUser
  createUserResult: any            // returned by auth.admin.createUser
  generateLinkAttrs: any | null    // captured attrs of auth.admin.generateLink
  generateLinkResult: any          // returned by auth.admin.generateLink
  verifyOtpAttrs: any | null       // captured attrs of auth.verifyOtp
  verifyOtpResult: any             // returned by auth.verifyOtp
```

2b. In `builder()`, extend the insert-error routing (the `insert:` property) so the `users` table can fail:

```ts
      const error = table === 'exchange_enrollments' ? (scenario.enrollError ?? null)
        : table === 'applications' ? (scenario.insertError ?? null)
        : table === 'users' ? (scenario.profileInsertError ?? null) : null
```

2c. Replace the `auth:` block of `adminClient` (currently `inviteUserByEmail` + `deleteUser`) with:

```ts
  auth: {
    admin: {
      createUser: async (attrs: any) => { scenario.createUserAttrs = attrs; return scenario.createUserResult },
      generateLink: async (attrs: any) => { scenario.generateLinkAttrs = attrs; return scenario.generateLinkResult },
      deleteUser: async (id: string) => { scenario.deletedAuthUserId = id; return { error: null } },
    },
    // The cookie-aware server client is mocked to this same object, so the
    // in-action session mint's verifyOtp lands here.
    verifyOtp: async (attrs: any) => { scenario.verifyOtpAttrs = attrs; return scenario.verifyOtpResult },
  },
```

2d. In the top-level `beforeEach`, add defaults to the `scenario = { … }` literal:

```ts
    profileInsertError: null,
    createUserAttrs: null,
    createUserResult: { data: { user: { id: 'new-user' } }, error: null },
    generateLinkAttrs: null,
    generateLinkResult: { data: { properties: { hashed_token: 'hash-1' } }, error: null },
    verifyOtpAttrs: null,
    verifyOtpResult: { data: { session: {} }, error: null },
```

2e. Add `resumeInviteSetup` to the import from `'../invitations'`:

```ts
import { respondToInvitation, resumeInviteSetup } from '../invitations'
```

2f. Replace the entire `describe('respondToInvitation', …)` block with:

```ts
describe('respondToInvitation', () => {
  beforeEach(() => {
    scenario.application = {
      id: 'app-1', exchange_id: 'ex-1', school_id: 's-1', status: 'accepted',
      email: 'a@b.co', invite_token: 'inv-1', data: { first_name: 'A', last_name: 'B' },
      enrolled_user_id: null,
    }
  })
  it('returns a structured expired error through an expired invite link', async () => {
    scenario.application.invite_token_expires_at = PAST
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'expired' })
  })
  it('records a No without creating an account', async () => {
    const res = await respondToInvitation('inv-1', 'no', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.status).toBe('declined')
    expect(scenario.createUserAttrs).toBeNull()
  })
  it('records a Maybe with a note', async () => {
    const res = await respondToInvitation('inv-1', 'maybe', 'need to check dates')
    expect(res).toEqual({ ok: true })
    expect(scenario.updated.row.status).toBe('maybe')
    expect(scenario.updated.row.invite_response_note).toBe('need to check dates')
  })
  it('returns closed for a non-invited application', async () => {
    scenario.application.status = 'submitted'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'closed' })
  })
  it('on Yes creates a confirmed account with no email, enrolls, finalizes, and mints a session', async () => {
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toMatchObject({ email: 'a@b.co', email_confirm: true })
    expect(scenario.updated.row.status).toBe('enrolled')
    expect(scenario.updated.row.enrolled_user_id).toBe('new-user')
    expect(scenario.generateLinkAttrs).toMatchObject({ type: 'magiclink', email: 'a@b.co' })
    expect(scenario.verifyOtpAttrs).toMatchObject({ type: 'magiclink', token_hash: 'hash-1' })
  })
  it('a Yes on an already-claimed (enrolling) invite mints a session instead of a silent no-op', async () => {
    scenario.application.status = 'enrolling'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toBeNull()           // no second account
    expect(scenario.generateLinkAttrs).toMatchObject({ type: 'magiclink', email: 'a@b.co' })
  })
  it('a Yes on an already-enrolled invite also mints a session (retry after mint failure)', async () => {
    scenario.application.status = 'enrolled'
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toEqual({ ok: true })
    expect(scenario.createUserAttrs).toBeNull()
  })
  it('returns the structured retry error when the session mint fails after enrollment', async () => {
    scenario.generateLinkResult = { data: null, error: { message: 'boom' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'retry' })
    // enrollment itself was finalized — the retry lands in the claim-fail branch
    expect(scenario.updates.some(u => u.row.status === 'enrolled')).toBe(true)
  })
  it('a failing verifyOtp also returns the retry error', async () => {
    scenario.verifyOtpResult = { data: null, error: { message: 'bad hash' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'retry' })
  })
  it('returns email_exists and releases the claim when the auth account already exists', async () => {
    scenario.createUserResult = { data: { user: null }, error: { code: 'email_exists', message: 'exists' } }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'email_exists' })
    expect(scenario.updated.row.status).toBe('accepted')  // claim released
  })
  it('maps a 23505 profile-insert race to email_exists and rolls back the auth user', async () => {
    scenario.profileInsertError = { code: '23505', message: 'duplicate key' }
    const res = await respondToInvitation('inv-1', 'yes', '')
    expect(res).toMatchObject({ ok: false, error: 'email_exists' })
    expect(scenario.deletedAuthUserId).toBe('new-user')
    expect(scenario.updated.row.status).toBe('accepted')
  })
  it('on a non-23505 enroll failure, rolls back the profile + auth user, then throws (unexpected)', async () => {
    scenario.enrollError = { code: '500', message: 'boom' }
    await expect(respondToInvitation('inv-1', 'yes', '')).rejects.toBeTruthy()
    expect(scenario.deletedProfileUserId).toBe('new-user')
    expect(scenario.deletedAuthUserId).toBe('new-user')
    expect(scenario.updated.row.status).toBe('accepted')
    expect(scenario.updated.row.enrolled_user_id).toBeUndefined()
  })
  it('on Yes stamps terms_acknowledged_at on the claim', async () => {
    await respondToInvitation('inv-1', 'yes', '')
    const claim = scenario.updates.find(u => u.table === 'applications' && u.row.status === 'enrolling')
    expect(claim?.row.terms_acknowledged_at).toBeTruthy()
  })
  it('No and Maybe never set terms_acknowledged_at', async () => {
    await respondToInvitation('inv-1', 'no', '')
    expect(scenario.updated.row.terms_acknowledged_at).toBeUndefined()
    await respondToInvitation('inv-1', 'maybe', '')
    expect(scenario.updated.row.terms_acknowledged_at).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the block to verify it fails**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: FAIL — `respondToInvitation` still returns `void`/throws, `resumeInviteSetup` is not exported, `createUser` never called.

- [ ] **Step 4: Rewrite `actions/invitations.ts`**

Full new file content (keep `sendEnrollmentChecklist` exactly as it is today — it is unchanged and omitted here for brevity; everything above it is replaced):

```ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { applicantName as buildApplicantName } from '@/lib/application-form'
import { assertExchangeWritable, ARCHIVED_ERROR } from '@/lib/exchange-guard'
import { tokenExpired } from '@/lib/tokens'
import { sendChecklistEmail } from '@/lib/email'
import { inviteError, type InviteActionResult } from '@/lib/invite-response'

// ---- Public invitation response (keyed by invite_token) ----

export async function getInvitation(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, invite_token_expires_at, enrolled_user_id, exchanges(name)')
    .eq('invite_token', token).maybeSingle()
  if (!app) return null
  const applicantName = buildApplicantName(app.data)
  // For enrolled/enrolling invites, report whether account setup finished so
  // the invite page can offer « reprendre la configuration » vs. a login link.
  // Same signal middleware uses: a non-empty full_name means setup is done.
  let setupComplete: boolean | null = null
  if (app.status === 'enrolling' || app.status === 'enrolled') {
    setupComplete = false
    if (app.enrolled_user_id) {
      const { data: profile } = await admin
        .from('users').select('full_name').eq('id', app.enrolled_user_id).maybeSingle()
      setupComplete = !!profile?.full_name
    }
  }
  return {
    exchangeName: app.exchanges?.name ?? '', applicantName, status: app.status,
    expired: tokenExpired(app.invite_token_expires_at),
    setupComplete,
  }
}

// Module-private sentinel so the catch-and-release block below can tell the
// one *expected* account-creation failure apart from genuine unexpected ones.
class InviteEmailExistsError extends Error {}

export async function respondToInvitation(
  token: string, response: 'yes' | 'no' | 'maybe', note: string,
): Promise<InviteActionResult> {
  const admin = createAdminClient()

  // Reject an expired invite link up front with a clear message (the atomic
  // updates below would otherwise just report "no longer open").
  const { data: pre } = await admin
    .from('applications').select('id, invite_token_expires_at, exchange_id').eq('invite_token', token).maybeSingle()
  if (!pre) return inviteError('not_found')
  if (tokenExpired(pre.invite_token_expires_at)) return inviteError('expired')
  try { await assertExchangeWritable(admin, pre.exchange_id) }
  catch (err) {
    if (err instanceof Error && err.message === ARCHIVED_ERROR) return inviteError('archived')
    throw err
  }

  const base = {
    invite_response: response, invite_response_note: note || null,
    responded_at: new Date().toISOString(),
  }

  // 'no' / 'maybe' are single atomic updates, gated on the invite still being
  // open. `.in('status', [...])` makes the guard race-safe (a second click that
  // arrives after the first updates nothing → "no longer open").
  if (response === 'no' || response === 'maybe') {
    const { data: updated } = await admin
      .from('applications')
      .update({ ...base, status: response === 'no' ? 'declined' : 'maybe' })
      .eq('invite_token', token).in('status', ['accepted', 'maybe'])
      .select('id').maybeSingle()
    if (!updated) {
      // Distinguish "doesn't exist" from "already responded" for a clearer error.
      const { data: exists } = await admin
        .from('applications').select('id').eq('invite_token', token).maybeSingle()
      return inviteError(exists ? 'closed' : 'not_found')
    }
    return { ok: true }
  }

  // 'yes' → atomically CLAIM the invite (accepted/maybe → enrolling) before
  // touching auth. Only one concurrent/retried request wins the claim, so the
  // account-creation sequence runs exactly once.
  const { data: claimed } = await admin
    .from('applications')
    // Clicking « Oui » is the explicit terms acknowledgment (the respond page
    // shows the notice right under the button). Stamped at claim time and
    // deliberately KEPT if the claim is later released back to 'accepted' —
    // it records that the acknowledgment click happened. A retry overwrites
    // it with the newer click.
    .update({ ...base, status: 'enrolling', terms_acknowledged_at: new Date().toISOString() })
    .eq('invite_token', token).in('status', ['accepted', 'maybe'])
    .select('id, email, school_id, exchange_id, data').maybeSingle()
  if (!claimed) {
    const { data: cur } = await admin
      .from('applications').select('status, email').eq('invite_token', token).maybeSingle()
    if (!cur) return inviteError('not_found')
    // A parallel request already claimed it (enrolling) or finished (enrolled).
    // Mint the session anyway so a double-click — or a deliberate retry after a
    // mint failure — still lands the student on /accept-invite instead of the
    // old silent no-op that stranded them.
    if (cur.status === 'enrolling' || cur.status === 'enrolled') {
      const minted = await mintInviteSession(admin, cur.email)
      return minted ? { ok: true } : inviteError('retry')
    }
    return inviteError('closed')
  }

  let userId: string
  try {
    // Create the auth account directly — confirmed, no email sent. Possessing
    // the invite token already proves mailbox access (the link was delivered
    // by Resend to this address), so no activation round-trip is needed.
    // trg_assign_on_enrollment_insert fans out the Phase 2 assignments.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: claimed.email, email_confirm: true,
    })
    if (createError || !created?.user) {
      if (createError?.code === 'email_exists') throw new InviteEmailExistsError()
      throw createError ?? new Error('createUser returned no user')
    }
    userId = created.user.id
    // Empty full_name: middleware infers "setup
    // complete" from a non-empty full_name, so pre-filling it would bounce the
    // student past /accept-invite before they set a password.
    const { error: profileError } = await admin.from('users').insert({
      id: userId, school_id: claimed.school_id, role: 'student' as const,
      email: claimed.email, full_name: '',
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      if (profileError.code === '23505') throw new InviteEmailExistsError()
      throw profileError
    }
    const { error: enrollError } = await admin.from('exchange_enrollments').insert({
      exchange_id: claimed.exchange_id, user_id: userId,
    })
    if (enrollError && enrollError.code !== '23505') {
      await admin.from('users').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      throw enrollError
    }
  } catch (err) {
    // Account creation failed (and any partial account was rolled back above):
    // release the claim back to 'accepted' so the applicant can retry cleanly.
    await admin.from('applications')
      .update({ status: 'accepted' }).eq('id', claimed.id).eq('status', 'enrolling')
    if (err instanceof InviteEmailExistsError) return inviteError('email_exists')
    throw err
  }

  // Account + enrollment exist. Finalize enrolling → enrolled (now error-checked).
  // If this rare last step fails we deliberately leave the row 'enrolling' rather
  // than releasing it: the account is live, so reverting to 'accepted' would
  // dead-end a retry on email_exists. A retry instead hits the claim-fail branch
  // above and mints a session.
  const { error: finalErr } = await admin.from('applications')
    .update({ status: 'enrolled', enrolled_user_id: userId }).eq('id', claimed.id)
  if (finalErr) throw finalErr
  // No revalidatePath: the caller is the unauthenticated invitee, whose browser
  // never renders organizer tabs — revalidation here would be inert. The
  // organizer seeing the enrollment within staleTimes.dynamic is the spec's
  // accepted cross-actor staleness trade-off (§1c).

  // One checklist email at enrollment: the DB trigger
  // (trg_assign_on_enrollment_insert) has just fanned out the assignments,
  // so list what's pending. Best-effort — never breaks the enrollment.
  await sendEnrollmentChecklist(admin, {
    userId,
    email: claimed.email,
    studentName: buildApplicantName(claimed.data as Record<string, string> | null),
    schoolId: claimed.school_id,
    exchangeId: claimed.exchange_id,
  })

  // Sign the student in right here: the server action may write cookies, so
  // verifyOtp on the cookie-aware client establishes the session in-page and
  // the client just router.push()es to /accept-invite. If this rare last step
  // fails, enrollment stands — the structured retry error tells the student to
  // click « Oui » again, which lands in the claim-fail branch above.
  const minted = await mintInviteSession(admin, claimed.email)
  return minted ? { ok: true } : inviteError('retry')
}

// Abandoned-setup recovery: the invite page shows « Reprendre la configuration »
// for an enrolled/enrolling invite whose account setup never finished. Token
// possession + unexpired window is the same trust respondToInvitation relies on.
export async function resumeInviteSetup(token: string): Promise<InviteActionResult> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, email, invite_token_expires_at')
    .eq('invite_token', token).maybeSingle()
  if (!app) return inviteError('not_found')
  if (tokenExpired(app.invite_token_expires_at)) return inviteError('expired')
  if (app.status !== 'enrolled' && app.status !== 'enrolling') return inviteError('closed')
  const minted = await mintInviteSession(admin, app.email)
  return minted ? { ok: true } : inviteError('retry')
}

// generateLink returns the hashed OTP token WITHOUT sending any email; verifying
// it on the cookie-aware server client is exactly what /auth/confirm does with
// the emailed link — minus the email. Magiclink (not invite-type) because it
// also works for existing users, which the retry/recovery paths need.
async function mintInviteSession(
  admin: ReturnType<typeof createAdminClient>, email: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) return false
    const supabase = await createClient()
    const { error: otpError } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    return !otpError
  } catch {
    // Never log the email (PII); the caller surfaces the structured retry error.
    return false
  }
}
```

Note the removed pieces: the `getAppUrl` import, the `APP_URL` constant, and the `inviteUserByEmail` call are gone. `sendEnrollmentChecklist` stays byte-identical below.

- [ ] **Step 5: Run the action tests**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: PASS (all describes, including the untouched `startApplication` etc.).

- [ ] **Step 6: Fix `actions/__tests__/enrollment-checklist.test.ts`**

6a. Replace the `auth:` block of its `adminClient`:

```ts
  auth: {
    admin: {
      createUser: async () => ({ data: { user: { id: 'stu-1' } }, error: null }),
      generateLink: async () => ({ data: { properties: { hashed_token: 'hash-1' } }, error: null }),
      deleteUser: async () => ({ error: null }),
    },
    verifyOtp: async () => ({ data: {}, error: null }),
  },
```

6b. Below the existing `vi.mock('@/lib/supabase/admin', …)` line, add:

```ts
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adminClient }))
```

6c. In the test `'an email failure never breaks the enrollment'`, change the assertion:

```ts
    await expect(respondToInvitation('inv-1', 'yes', '')).resolves.toEqual({ ok: true })
```

- [ ] **Step 7: Run both test files**

Run: `pnpm test actions/__tests__/applications.test.ts actions/__tests__/enrollment-checklist.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (`InviteResponseForm.tsx` still awaits the action without reading the result — a behavior gap Task 3 fixes, but not a type error, since widening a return type breaks no caller that ignores it.)

- [ ] **Step 9: Commit**

```bash
git add lib/invite-response.ts actions/invitations.ts actions/__tests__/applications.test.ts actions/__tests__/enrollment-checklist.test.ts
git commit -m "feat(invitations): mint session in respondToInvitation, structured returns"
```

---

### Task 2: `resumeInviteSetup` + `getInvitation.setupComplete` tests

The implementation already landed in Task 1's rewrite (single-file rewrite made it atomic); this task pins it with tests. A reviewer can reject this task independently by judging the coverage insufficient.

**Files:**
- Test: `actions/__tests__/applications.test.ts` (append two describe blocks)

**Interfaces:**
- Consumes: `resumeInviteSetup(token): Promise<InviteActionResult>`, `getInvitation(token)` returning `{ exchangeName, applicantName, status, expired, setupComplete: boolean | null }` (Task 1).
- Produces: nothing new — coverage only.

- [ ] **Step 1: Append the `resumeInviteSetup` describe block** (after the `respondToInvitation` block)

```ts
describe('resumeInviteSetup', () => {
  beforeEach(() => {
    scenario.application = {
      id: 'app-1', status: 'enrolled', email: 'a@b.co',
      invite_token: 'inv-1', invite_token_expires_at: null, enrolled_user_id: 'stu-1',
    }
  })
  it('mints a session for an enrolled invite', async () => {
    const res = await resumeInviteSetup('inv-1')
    expect(res).toEqual({ ok: true })
    expect(scenario.generateLinkAttrs).toMatchObject({ type: 'magiclink', email: 'a@b.co' })
    expect(scenario.verifyOtpAttrs).toMatchObject({ type: 'magiclink', token_hash: 'hash-1' })
  })
  it('also works mid-enrollment (status enrolling)', async () => {
    scenario.application.status = 'enrolling'
    const res = await resumeInviteSetup('inv-1')
    expect(res).toEqual({ ok: true })
  })
  it('returns expired for an expired token', async () => {
    scenario.application.invite_token_expires_at = PAST
    const res = await resumeInviteSetup('inv-1')
    expect(res).toMatchObject({ ok: false, error: 'expired' })
    expect(scenario.generateLinkAttrs).toBeNull()
  })
  it('returns closed when the invitation was never accepted', async () => {
    scenario.application.status = 'accepted'
    const res = await resumeInviteSetup('inv-1')
    expect(res).toMatchObject({ ok: false, error: 'closed' })
  })
  it('returns not_found for an unknown token', async () => {
    scenario.application = null
    const res = await resumeInviteSetup('inv-1')
    expect(res).toMatchObject({ ok: false, error: 'not_found' })
  })
  it('returns retry when the magiclink cannot be generated', async () => {
    scenario.generateLinkResult = { data: null, error: { message: 'boom' } }
    const res = await resumeInviteSetup('inv-1')
    expect(res).toMatchObject({ ok: false, error: 'retry' })
  })
})
```

- [ ] **Step 2: Append the `getInvitation setup state` describe block**

The shared mock's `rowFor('users')` returns an array (used by other suites); getInvitation's `users` lookup goes through `maybeSingle`, which returns that value directly. Route it via a scenario field instead. In `rowFor`, change the `users` line to:

```ts
  if (table === 'users') return scenario.userProfile ?? [{ email: 'org@school.test' }]
```

Add `userProfile: any | null` to the scenario type and `userProfile: null,` to the `beforeEach` literal. Then append:

```ts
describe('getInvitation setup state', () => {
  it('reports setupComplete: null for a not-yet-answered invite', async () => {
    scenario.application = { status: 'accepted', data: { first_name: 'A' }, invite_token_expires_at: null, enrolled_user_id: null, exchanges: { name: 'X' } }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBeNull()
  })
  it('reports setupComplete: false for an enrolled invite whose profile has no name yet', async () => {
    scenario.application = { status: 'enrolled', data: {}, invite_token_expires_at: null, enrolled_user_id: 'stu-1', exchanges: { name: 'X' } }
    scenario.userProfile = { full_name: '' }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBe(false)
  })
  it('reports setupComplete: false while enrolling with no user row yet', async () => {
    scenario.application = { status: 'enrolling', data: {}, invite_token_expires_at: null, enrolled_user_id: null, exchanges: { name: 'X' } }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBe(false)
  })
  it('reports setupComplete: true once the profile has a full name', async () => {
    scenario.application = { status: 'enrolled', data: {}, invite_token_expires_at: null, enrolled_user_id: 'stu-1', exchanges: { name: 'X' } }
    scenario.userProfile = { full_name: 'Léa Martin' }
    const res = await getInvitation('inv-1')
    expect(res?.setupComplete).toBe(true)
  })
})
```

And extend the import: `import { respondToInvitation, resumeInviteSetup, getInvitation } from '../invitations'`.

- [ ] **Step 3: Run the tests**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: PASS. If a case fails, the defect is in Task 1's implementation — fix `actions/invitations.ts`, not the test, unless the test contradicts the spec.

- [ ] **Step 4: Commit**

```bash
git add actions/__tests__/applications.test.ts
git commit -m "test(invitations): cover resumeInviteSetup and getInvitation setup state"
```

---

### Task 3: `InviteResponseForm` — redirect on Yes, structured errors

**Files:**
- Modify: `components/InviteResponseForm.tsx`
- Test: `components/__tests__/InviteResponseForm.test.tsx`

**Interfaces:**
- Consumes: `respondToInvitation(token, response, note): Promise<InviteActionResult>` (Task 1).
- Produces: nothing consumed later; the component keeps its `{ token, firstName, exchangeName }` props (page.tsx usage unchanged).

- [ ] **Step 1: Rewrite the test file**

Replace `components/__tests__/InviteResponseForm.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/actions/invitations', () => ({ respondToInvitation: vi.fn(async () => ({ ok: true })) }))

import { InviteResponseForm } from '@/components/InviteResponseForm'
import { respondToInvitation } from '@/actions/invitations'
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'

describe('InviteResponseForm (French)', () => {
  beforeEach(() => { vi.clearAllMocks(); (respondToInvitation as any).mockResolvedValue({ ok: true }) })

  it('renders the personalized heading and accept CTA', () => {
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="Espagne · Automne 2026" />)
    expect(screen.getByText(/tu es invitée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /je veux participer/i })).toBeInTheDocument()
  })
  it('redirects straight to /accept-invite after accepting — no check-your-email copy', async () => {
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(respondToInvitation).toHaveBeenCalledWith('t', 'yes', '')
    expect(pushMock).toHaveBeenCalledWith('/accept-invite')
    expect(screen.queryByText(/boîte mail/i)).not.toBeInTheDocument()
  })
  it('renders the structured error message and does not redirect', async () => {
    ;(respondToInvitation as any).mockResolvedValue({ ok: false, error: 'expired', message: 'Cette invitation a expiré.' })
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(await screen.findByText('Cette invitation a expiré.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
  it('shows a generic French message on an unexpected throw (never error.message)', async () => {
    ;(respondToInvitation as any).mockRejectedValue(new Error('opaque digest 123'))
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument()
    expect(screen.queryByText(/opaque digest/i)).not.toBeInTheDocument()
  })
  it('still confirms a No inline', async () => {
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /non merci/i }))
    expect(await screen.findByText(/merci de nous avoir prévenus/i)).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
  it('shows the terms notice directly under the accept button', () => {
    render(<InviteResponseForm token="t" firstName="" exchangeName="X" />)
    expect(screen.getByText(EXCHANGE_TERMS_RESPOND)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `pnpm test components/__tests__/InviteResponseForm.test.tsx`
Expected: FAIL — redirect test fails (component shows « boîte mail » copy, never pushes), structured-error test fails.

- [ ] **Step 3: Update the component**

In `components/InviteResponseForm.tsx`, apply these changes (rest of the JSX stays identical):

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToInvitation } from '@/actions/invitations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'

export function InviteResponseForm({ token, firstName, exchangeName }: { token: string; firstName: string; exchangeName: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try {
      const res = await respondToInvitation(token, response, response === 'maybe' ? note : '')
      if (!res.ok) { setError(res.message); setBusy(false); return }
      // Yes → the action just minted the session; land on account setup.
      // Stay busy through the navigation so the buttons can't double-fire.
      if (response === 'yes') { router.push('/accept-invite'); return }
      setResult(response)
    } catch {
      // Unexpected failure only — prod redacts thrown messages, so never show them.
      setError('Une erreur est survenue. Réessaie.'); setBusy(false)
    }
  }

  if (result === 'no') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci de nous avoir prévenus. Nous te souhaitons le meilleur.</p>
  if (result === 'maybe') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — nous avons noté ta réponse, l’organisateur reviendra vers toi.</p>

  return (
    /* … the existing JSX below this line is byte-identical … */
  )
}
```

Removed: the `result === 'yes'` branch and its « Parfait ! Regarde ta boîte mail… » copy; `'yes'` from the `result` state union.

- [ ] **Step 4: Run the tests**

Run: `pnpm test components/__tests__/InviteResponseForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/InviteResponseForm.tsx components/__tests__/InviteResponseForm.test.tsx
git commit -m "feat(invite): redirect to /accept-invite on Oui, structured error display"
```

---

### Task 4: Invite page recovery states + `InviteResumeCard`

**Files:**
- Create: `components/InviteResumeCard.tsx`
- Modify: `app/invite/[token]/page.tsx`
- Test: `app/__tests__/invite-page.test.tsx` (new)

**Interfaces:**
- Consumes: `getInvitation` with `setupComplete: boolean | null` (Task 1), `resumeInviteSetup(token): Promise<InviteActionResult>` (Task 1).
- Produces: `InviteResumeCard({ token, exchangeName }: { token: string; exchangeName: string })`.

- [ ] **Step 1: Write the failing page tests** — create `app/__tests__/invite-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getInvitationMock = vi.fn()
vi.mock('@/actions/invitations', () => ({
  getInvitation: (...a: unknown[]) => getInvitationMock(...a),
  respondToInvitation: vi.fn(),
  resumeInviteSetup: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import InvitePage from '@/app/invite/[token]/page'

const BASE = {
  exchangeName: 'Espagne · Automne 2026', applicantName: 'Léa Martin',
  status: 'accepted', expired: false, setupComplete: null as boolean | null,
}

async function renderPage() {
  render(await InvitePage({ params: Promise.resolve({ token: 'tok-1' }) }))
}

describe('InvitePage states', () => {
  beforeEach(() => { getInvitationMock.mockReset() })

  it('shows the response form for an open invitation', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE })
    await renderPage()
    expect(screen.getByRole('button', { name: /je veux participer/i })).toBeInTheDocument()
  })
  it('offers to resume setup for an enrolled invite with incomplete setup', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: false })
    await renderPage()
    expect(screen.getByRole('button', { name: /reprendre la configuration/i })).toBeInTheDocument()
  })
  it('also offers resume while stuck mid-enrollment (enrolling)', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolling', setupComplete: false })
    await renderPage()
    expect(screen.getByRole('button', { name: /reprendre la configuration/i })).toBeInTheDocument()
  })
  it('links to /login once setup is complete', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: true })
    await renderPage()
    expect(screen.getByText(/ton compte est déjà actif/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute('href', '/login')
  })
  it('an expired enrolled invite keeps the dead-end (no resume)', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: false, expired: true })
    await renderPage()
    expect(screen.getByText(/cette invitation a expiré/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reprendre la configuration/i })).not.toBeInTheDocument()
  })
  it('declined invitations keep the already-answered dead-end', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'declined' })
    await renderPage()
    expect(screen.getByText(/a déjà reçu une réponse/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test app/__tests__/invite-page.test.tsx`
Expected: FAIL — the enrolled cases render the « déjà reçu une réponse » dead-end (page has no recovery states yet).

- [ ] **Step 3: Create `components/InviteResumeCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resumeInviteSetup } from '@/actions/invitations'
import { Button } from '@/components/ui/button'

// Abandoned-setup recovery on /invite/[token]: the student already said « Oui »
// but never finished /accept-invite. One click re-mints a session server-side
// (token possession = mailbox proof, expiry still enforced by the action).
export function InviteResumeCard({ token, exchangeName }: { token: string; exchangeName: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function resume() {
    setBusy(true); setError(null)
    try {
      const res = await resumeInviteSetup(token)
      if (!res.ok) { setError(res.message); setBusy(false); return }
      router.push('/accept-invite')
    } catch {
      setError('Une erreur est survenue. Réessaie.'); setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">Participation confirmée</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">Ton inscription à l’échange {exchangeName} est enregistrée</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Il ne reste plus qu’à configurer ton compte (nom et mot de passe).</p>
      </div>
      <Button disabled={busy} onClick={resume} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Reprendre la configuration de ton compte</Button>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Update `app/invite/[token]/page.tsx`**

Full new file content:

```tsx
import Link from 'next/link'
import { getInvitation } from '@/actions/invitations'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { InviteResumeCard } from '@/components/InviteResumeCard'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads live invitation state (accepted / already-answered) via the cookie-less
// admin client — force dynamic so the response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) return (
    <InvalidLinkState
      title="Ce lien n’est plus valide"
      body="Il a peut-être expiré — c’est normal, les liens expirent pour protéger ton dossier. Vérifie l’adresse dans ton e-mail, ou demande à ton organisateur de t’en renvoyer un nouveau."
    />
  )
  if (invite.expired) return (
    <InvalidLinkState
      title="Cette invitation a expiré"
      body="Contacte ton organisateur pour recevoir une nouvelle invitation."
    />
  )

  // Already said « Oui » with a still-valid token: recovery states instead of a
  // dead-end — resume setup if the account isn't configured, else point to login.
  if (invite.status === 'enrolling' || invite.status === 'enrolled') {
    if (invite.setupComplete) return (
      <CenteredCard maxWidth={520}>
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">Ton compte est déjà actif</h3>
            <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Ton inscription à l’échange {invite.exchangeName} est terminée. Connecte-toi pour accéder à ton espace élève.</p>
          </div>
          <Link href="/login" className="inline-flex h-[50px] w-full items-center justify-center rounded-[11px] bg-[#2456E6] text-base font-semibold text-white hover:bg-[#1D48C7]">Se connecter</Link>
        </div>
      </CenteredCard>
    )
    return (
      <CenteredCard maxWidth={520}>
        <InviteResumeCard token={token} exchangeName={invite.exchangeName} />
      </CenteredCard>
    )
  }

  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <InvalidLinkState
      title="Cette invitation a déjà reçu une réponse"
      body="Tu as déjà répondu à cette invitation. Si c’est une erreur, contacte ton organisateur."
    />
  )
  const firstName = (invite.applicantName ?? '').trim().split(/\s+/)[0] ?? ''
  return (
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} firstName={firstName} exchangeName={invite.exchangeName} />
    </CenteredCard>
  )
}
```

- [ ] **Step 5: Run the page tests**

Run: `pnpm test app/__tests__/invite-page.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add components/InviteResumeCard.tsx "app/invite/[token]/page.tsx" app/__tests__/invite-page.test.tsx
git commit -m "feat(invite): abandoned-setup recovery states on the invite page"
```

---

### Task 5: Full gate, doc correction, wrap-up

**Files:**
- Modify: `CLAUDE.md` (one gotcha line)

- [ ] **Step 1: Correct the CLAUDE.md gotcha** — the invite path no longer flows through `/auth/confirm`. In the Gotchas section, change:

```
- **Invite acceptance & email confirmation go through `app/auth/confirm/route.ts`.** Session cookies must be persisted via `redirect()` from that route — don't bypass it.
```

to:

```
- **Organizer email confirmation goes through `app/auth/confirm/route.ts`.** Session cookies must be persisted via `redirect()` from that route — don't bypass it. Student invite acceptance no longer sends any Supabase auth email: `respondToInvitation` mints the session in-action (`generateLink` magiclink + `verifyOtp` on the cookie-aware server client) and the client redirects to `/accept-invite`.
```

- [ ] **Step 2: Run the full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: lint clean, full suite PASS, tsc clean. (`pnpm build` fails locally on placeholder env — tsc is the documented local substitute; CI runs the real build.)

- [ ] **Step 3: Grep for leftovers**

Run: `grep -rn "inviteUserByEmail\|boîte mail" actions components app --include="*.ts" --include="*.tsx"`
Expected: no matches (spec §4 removals complete).

- [ ] **Step 4: Commit and finish**

```bash
git add CLAUDE.md
git commit -m "docs: invite acceptance now mints its session in-action"
```

Then use superpowers:finishing-a-development-branch (branch stays local; push/PR per Bjorn's git workflow — merging needs his confirmation).

---

## Notes for reviewers / executors

- **Why magiclink, not invite-type link:** `generateLink({ type: 'invite' })` fails for existing users; magiclink serves both the first click and every retry/recovery path (spec §1).
- **Mint-failure semantics:** enrollment is never rolled back when only the session mint fails — the structured `retry` error routes the student's next click into the claim-fail branch, which just mints.
- **`resumeInviteSetup` doesn't gate on `setupComplete`:** the page only shows the button when setup is incomplete; if a completed user triggers it anyway, middleware bounces their fresh session from `/accept-invite` to `/my-forms` — harmless, and the token still proves mailbox access within its expiry window.
- **PII:** no student email or name in any log line, including the new failure paths (`mintInviteSession` swallows and returns `false`).
