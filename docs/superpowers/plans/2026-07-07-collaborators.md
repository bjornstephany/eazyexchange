# Collaborators + Nouvel échange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school owner remove an active collaborator, invite collaborators during onboarding and exchange creation, and slim « Nouvel échange » to a single name field while dropping phantom partner-school rows.

**Architecture:** One additive migration makes `exchanges.school_b_id` nullable. A new pure helper `lib/team/invite.ts` holds the invite mechanics (dedupe → insert → email → rollback) so both the strict `inviteOrganizer` action and the best-effort `createExchange` path share one implementation. A new owner-gated `removeOrganizer` action reassigns the target's FKs to the owner then deletes the auth user. UI changes thread `org_role` from the organizer layout through `OrganizerShell` into a redesigned `NewExchangeModal`, add a « Retirer » confirm flow to `TeamCard`, and give onboarding a second (optional) invite step.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS + service-role admin client), Resend, Tailae + shadcn/ui, Vitest + Testing Library.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **Never log student/parent/collaborator PII** — no emails, names, or contents in logs or error messages.
- Expected server-action outcomes must travel as **return values**, not thrown errors — Next.js redacts thrown Server Action messages in production. Thrown French messages are only acceptable where the existing code already throws them for a client `try/catch` (settings actions consumed by `TeamCard`).
- New data access needs a **migration**, never a client-side service-role workaround. Only the Stripe webhook and existing admin-client server actions may use the service role.
- All French copy uses **typographic apostrophes** (`’`, U+2019) in JSX/string literals, matching the surrounding files (e.g. `l’échange`, `n’a pas`). Straight apostrophes only inside JSX attribute-escaped `&apos;` or where the file already does so.
- Verification gate before "done": `pnpm lint` && `pnpm test` && `pnpm exec tsc --noEmit`. (`pnpm build` fails locally because `.env.local` holds placeholders — use `tsc --noEmit` for type checking.)

---

## File Structure

**New files**
- `supabase/migrations/20260707000001_exchanges_school_b_nullable.sql` — drop NOT NULL on `exchanges.school_b_id`.
- `lib/team/invite.ts` — `createAndSendOrganizerInvite(admin, opts)`: shared invite mechanics returning a structured result.
- `lib/team/__tests__/invite.test.ts` — unit tests for the helper.
- `actions/__tests__/remove-organizer.test.ts` — unit tests for `removeOrganizer`.

**Modified files**
- `lib/billing/exchange-limit.ts` — slim the invalid message to name-only; add `inviteErrors` to `CreateExchangeResult`.
- `actions/settings.ts` — refactor `inviteOrganizer` onto the shared helper; add `removeOrganizer`.
- `actions/exchanges.ts` — slim `createExchange` (name-only, `year` server-default, `school_b_id: null`, best-effort owner invites).
- `actions/onboarding.ts` — `completeOnboarding` stops redirecting; returns void so the client can advance to step 2.
- `components/shell/NewExchangeModal.tsx` — single field, owner-only collaborator chips, `inviteErrors` display.
- `components/shell/OrganizerShell.tsx` — accept + forward `orgRole` to the modal.
- `app/(organizer)/layout.tsx` — pass `orgRole={profile.org_role}` into the shell.
- `components/settings/TeamCard.tsx` — « Retirer » on active admin rows (owner view) with a confirm dialog.
- `app/onboarding/OnboardingForm.tsx` — two-step flow (name → optional invites → dashboard).
- `app/(organizer)/exchanges/[id]/page.tsx` — null-`school_b` header fallback.
- `actions/__tests__/create-exchange.test.ts` — updated expectations (null partner, name-only, invites).
- `actions/__tests__/onboarding.test.ts` — updated for the no-redirect return.
- `components/shell/__tests__/NewExchangeModal.test.tsx` — updated for the single field + chips.
- `components/settings/__tests__/SettingsView.test.tsx` — (if it asserts TeamCard rows) extend for the Retirer control. Inspect first; only touch if it references team rows.

---

## Task 1: Migration — `exchanges.school_b_id` nullable

**Files:**
- Create: `supabase/migrations/20260707000001_exchanges_school_b_nullable.sql`

**Interfaces:**
- Produces: a nullable `exchanges.school_b_id` column. Later tasks insert `school_b_id: null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260707000001_exchanges_school_b_nullable.sql`:

```sql
-- « Nouvel échange » no longer collects a partner school, and createExchange
-- stops creating a phantom partner-school row per exchange (those rows polluted
-- `schools`, which is also the billing/customer table). New exchanges store
-- school_b_id = null; existing exchanges keep their partner rows.
--
-- Safe because school_b is already a phantom: every organizer belongs to a
-- freshly-created school_a, so no user ever belongs to school_b — every
-- `or school_b_id = my_school_id()` policy branch is dead in practice and never
-- matches null. The immutability guard (20260630000003) uses `is distinct from`,
-- which is null-safe.
alter table exchanges alter column school_b_id drop not null;
```

- [ ] **Step 2: Verify the SQL parses**

Run: `grep -c 'drop not null' supabase/migrations/20260707000001_exchanges_school_b_nullable.sql`
Expected: `1`

(The migration is applied to the remote DB during the Task 9 gate, not now — schema push is a deploy-time step. Local Vitest never touches Postgres.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260707000001_exchanges_school_b_nullable.sql
git commit -m "feat: make exchanges.school_b_id nullable"
```

---

## Task 2: Shared invite helper `lib/team/invite.ts` + refactor `inviteOrganizer`

**Files:**
- Create: `lib/team/invite.ts`
- Create: `lib/team/__tests__/invite.test.ts`
- Modify: `actions/settings.ts` (`inviteOrganizer`)

**Interfaces:**
- Produces:
  ```ts
  type InviteResult = { ok: true } | { ok: false; message: string }
  async function createAndSendOrganizerInvite(
    admin: SupabaseClient,
    opts: { schoolId: string; email: string; inviterUserId: string; inviterName: string; appUrl: string },
  ): Promise<InviteResult>
  ```
  Consumed by `inviteOrganizer` (Task 2) and `createExchange` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `lib/team/__tests__/invite.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendOrganizerInviteEmail = vi.fn()
vi.mock('@/lib/email', () => ({ sendOrganizerInviteEmail: (...a: unknown[]) => sendOrganizerInviteEmail(...a) }))
vi.mock('@/lib/tokens', () => ({ randomToken: () => 'tok-123' }))

import { createAndSendOrganizerInvite } from '@/lib/team/invite'

type Row = Record<string, unknown>
let existingMember: Row | null
let existingInvite: Row | null
let insertError: unknown
let deleted: string[]
let inserted: Row | null

function makeAdmin() {
  deleted = []; inserted = null
  return {
    from(table: string) {
      if (table === 'users') return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingMember }) }) }) }),
      }
      if (table === 'schools') return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Lincoln High' } }) }) }),
      }
      if (table === 'organizer_invites') return {
        select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ is: () => ({ gt: () => ({ maybeSingle: async () => ({ data: existingInvite }) }) }) }) }) }) }),
        insert: (row: Row) => { inserted = row; return { select: () => ({ single: async () => ({ data: insertError ? null : { id: 'inv-1' }, error: insertError ?? null }) }) } },
        delete: () => ({ eq: (_c: string, id: string) => { deleted.push(id); return Promise.resolve({ error: null }) } }),
      }
      throw new Error('unexpected table ' + table)
    },
  } as never
}

const opts = { schoolId: 's-1', email: 'New@School.fr', inviterUserId: 'u1', inviterName: 'Alice', appUrl: 'https://app.test' }

beforeEach(() => {
  existingMember = null; existingInvite = null; insertError = null
  sendOrganizerInviteEmail.mockReset().mockResolvedValue(true)
})

describe('createAndSendOrganizerInvite', () => {
  it('normalizes the email, inserts a pending row, and sends the email', async () => {
    const r = await createAndSendOrganizerInvite(makeAdmin(), opts)
    expect(r).toEqual({ ok: true })
    expect(inserted).toMatchObject({ school_id: 's-1', email: 'new@school.fr', token: 'tok-123', invited_by: 'u1' })
    expect(sendOrganizerInviteEmail).toHaveBeenCalledWith({
      to: 'new@school.fr', inviterName: 'Alice', schoolName: 'Lincoln High',
      joinUrl: 'https://app.test/join/tok-123',
    })
  })

  it('rejects an invalid email without inserting', async () => {
    const r = await createAndSendOrganizerInvite(makeAdmin(), { ...opts, email: 'not-an-email' })
    expect(r).toEqual({ ok: false, message: 'Adresse e-mail invalide.' })
  })

  it('rejects an email that already belongs to a member', async () => {
    existingMember = { id: 'u9' }
    const r = await createAndSendOrganizerInvite(makeAdmin(), opts)
    expect(r).toEqual({ ok: false, message: 'Cette personne fait déjà partie de votre équipe.' })
  })

  it('rejects an email that already has a pending invite', async () => {
    existingInvite = { id: 'inv-0' }
    const r = await createAndSendOrganizerInvite(makeAdmin(), opts)
    expect(r).toEqual({ ok: false, message: 'Une invitation est déjà en attente pour cette adresse.' })
  })

  it('rolls back the pending row when the email fails', async () => {
    sendOrganizerInviteEmail.mockResolvedValueOnce(false)
    const admin = makeAdmin()
    const r = await createAndSendOrganizerInvite(admin, opts)
    expect(r).toEqual({ ok: false, message: 'L’e-mail d’invitation n’a pas pu être envoyé. Réessayez.' })
    expect(deleted).toEqual(['inv-1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/team/__tests__/invite.test.ts`
Expected: FAIL — `Cannot find module '@/lib/team/invite'`.

- [ ] **Step 3: Write the helper**

Create `lib/team/invite.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { randomToken } from '@/lib/tokens'
import { sendOrganizerInviteEmail } from '@/lib/email'

export type InviteResult = { ok: true } | { ok: false; message: string }

// Shared organizer-invite mechanics: dedupe → insert pending row → send email,
// rolling back the row if the email never goes out (no orphan pending invites).
// The caller supplies a service-role admin client and has ALREADY authorized
// the action (owner-gate + rate-limit live in the calling server action).
// Returns a structured result so strict callers (inviteOrganizer) can throw and
// best-effort callers (createExchange) can collect failures.
export async function createAndSendOrganizerInvite(
  admin: SupabaseClient,
  opts: { schoolId: string; email: string; inviterUserId: string; inviterName: string; appUrl: string },
): Promise<InviteResult> {
  const email = normalizeEmail(opts.email)
  if (!isValidEmail(email)) return { ok: false, message: 'Adresse e-mail invalide.' }

  const { data: existingMember } = await admin
    .from('users').select('id')
    .eq('school_id', opts.schoolId).eq('email', email).maybeSingle()
  if (existingMember) return { ok: false, message: 'Cette personne fait déjà partie de votre équipe.' }

  const { data: existingInvite } = await admin
    .from('organizer_invites').select('id')
    .eq('school_id', opts.schoolId).eq('email', email)
    .is('accepted_at', null).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (existingInvite) return { ok: false, message: 'Une invitation est déjà en attente pour cette adresse.' }

  const { data: school } = await admin
    .from('schools').select('name').eq('id', opts.schoolId).single()

  const token = randomToken()
  const { data: invite, error: insertError } = await admin
    .from('organizer_invites')
    .insert({ school_id: opts.schoolId, email, token, invited_by: opts.inviterUserId })
    .select('id').single()
  if (insertError || !invite) return { ok: false, message: 'L’invitation n’a pas pu être créée. Réessayez.' }

  const ok = await sendOrganizerInviteEmail({
    to: email, inviterName: opts.inviterName, schoolName: school?.name ?? '',
    joinUrl: `${opts.appUrl}/join/${token}`,
  })
  if (!ok) {
    await admin.from('organizer_invites').delete().eq('id', invite.id)
    return { ok: false, message: 'L’e-mail d’invitation n’a pas pu être envoyé. Réessayez.' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/team/__tests__/invite.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Refactor `inviteOrganizer` onto the helper**

In `actions/settings.ts`, replace the whole `inviteOrganizer` body (lines 186–230) with:

```ts
export async function inviteOrganizer(rawEmail: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)
  await enforceRateLimit(`team-invite:${ctx.schoolId}`, 10, 3600)

  const admin = createAdminClient()
  const result = await createAndSendOrganizerInvite(admin, {
    schoolId: ctx.schoolId, email: rawEmail,
    inviterUserId: ctx.userId, inviterName: ctx.fullName, appUrl: getAppUrl(),
  })
  if (!result.ok) throw new Error(result.message)
  revalidatePath('/settings')
}
```

Add the import near the other `lib` imports at the top of `actions/settings.ts`:

```ts
import { createAndSendOrganizerInvite } from '@/lib/team/invite'
```

Then remove the now-unused imports from `actions/settings.ts` **only if nothing else uses them**: `normalizeEmail`, `isValidEmail`, `randomToken`, `sendOrganizerInviteEmail`. (Grep before deleting — `revokeOrganizerInvite` and other actions may still use some.)

Run: `grep -nE 'normalizeEmail|isValidEmail|randomToken|sendOrganizerInviteEmail' actions/settings.ts`
Delete each import line whose symbol has no remaining reference.

- [ ] **Step 6: Verify the refactor typechecks and the suite is green**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run lib/team components/settings`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/team/invite.ts lib/team/__tests__/invite.test.ts actions/settings.ts
git commit -m "refactor: extract shared organizer-invite helper"
```

---

## Task 3: `removeOrganizer` action

**Files:**
- Modify: `actions/settings.ts`
- Create: `actions/__tests__/remove-organizer.test.ts`

**Interfaces:**
- Consumes: `getOrganizerCtx`, `assertOwner`, `createAdminClient` (already in `actions/settings.ts`).
- Produces: `async function removeOrganizer(userId: string): Promise<void>` — consumed by `TeamCard` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/remove-organizer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let callerRole: 'owner' | 'admin'
let target: { id: string; role: string; org_role: string; school_id: string } | null
let deleteUserError: unknown
let reassigns: { table: string; set: Record<string, unknown>; where: string }[]
let deletedUser: string | null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({}),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'owner-1' }),
  getProfile: async () => ({
    role: 'organizer', school_id: 's-1', full_name: 'Owner', email: 'owner@s.fr',
    org_role: callerRole,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'users') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: target }) }) }),
        update: (set: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { reassigns.push({ table, set, where: id }); return Promise.resolve({ error: null }) } }),
      }
      return {
        update: (set: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { reassigns.push({ table, set, where: id }); return Promise.resolve({ error: null }) } }),
      }
    },
    auth: { admin: { deleteUser: async (id: string) => { deletedUser = id; return { error: deleteUserError ?? null } } } },
  }),
}))

import { removeOrganizer } from '@/actions/settings'

beforeEach(() => {
  callerRole = 'owner'
  target = { id: 'admin-9', role: 'organizer', org_role: 'admin', school_id: 's-1' }
  deleteUserError = null
  reassigns = []
  deletedUser = null
})

describe('removeOrganizer', () => {
  it('reassigns FKs to the owner BEFORE deleting the target', async () => {
    await removeOrganizer('admin-9')
    const tables = reassigns.map(r => r.table)
    expect(tables).toEqual(['form_templates', 'submissions', 'applications', 'organizer_invites'])
    expect(reassigns.every(r => r.where === 'admin-9')).toBe(true)
    expect(reassigns[0].set).toEqual({ created_by: 'owner-1' })
    expect(reassigns[1].set).toEqual({ reviewer_id: 'owner-1' })
    expect(reassigns[3].set).toEqual({ invited_by: 'owner-1' })
    expect(deletedUser).toBe('admin-9')
  })

  it('rejects a non-owner caller', async () => {
    callerRole = 'admin'
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Réservé au propriétaire du compte.')
    expect(deletedUser).toBeNull()
  })

  it('rejects removing the owner (target org_role=owner)', async () => {
    target = { id: 'admin-9', role: 'organizer', org_role: 'owner', school_id: 's-1' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Ce collaborateur est introuvable.')
    expect(deletedUser).toBeNull()
  })

  it('rejects a target from another school', async () => {
    target = { id: 'admin-9', role: 'organizer', org_role: 'admin', school_id: 's-OTHER' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Ce collaborateur est introuvable.')
    expect(deletedUser).toBeNull()
  })

  it('rejects a student target', async () => {
    target = { id: 'admin-9', role: 'student', org_role: 'admin', school_id: 's-1' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Ce collaborateur est introuvable.')
  })

  it('rejects an unknown id', async () => {
    target = null
    await expect(removeOrganizer('nope')).rejects.toThrow('Ce collaborateur est introuvable.')
  })

  it('throws a clean message if auth deletion fails', async () => {
    deleteUserError = { message: 'boom' }
    await expect(removeOrganizer('admin-9')).rejects.toThrow('Le collaborateur n’a pas pu être retiré. Réessayez.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run actions/__tests__/remove-organizer.test.ts`
Expected: FAIL — `removeOrganizer` is not exported.

- [ ] **Step 3: Add the action**

Append to `actions/settings.ts` (after `revokeOrganizerInvite`, before `ProgramInfo`):

```ts
export async function removeOrganizer(userId: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  assertOwner(ctx)

  const admin = createAdminClient()
  // Target must be an ADMIN organizer in the caller's school. Excluding
  // org_role='owner' makes owner removal impossible by construction, so a school
  // always keeps exactly one owner.
  const { data: target } = await admin
    .from('users').select('id, role, org_role, school_id')
    .eq('id', userId).maybeSingle()
  if (!target || target.school_id !== ctx.schoolId
      || target.role !== 'organizer' || target.org_role !== 'admin') {
    throw new Error('Ce collaborateur est introuvable.')
  }

  // Reassign every FK the target may hold to the owner BEFORE deletion, so
  // nothing dangles when the profile row cascades on auth deletion. These are
  // the only four `references users(id)` columns an organizer can hold.
  await admin.from('form_templates').update({ created_by: ctx.userId }).eq('created_by', userId)
  await admin.from('submissions').update({ reviewer_id: ctx.userId }).eq('reviewer_id', userId)
  await admin.from('applications').update({ reviewer_id: ctx.userId }).eq('reviewer_id', userId)
  await admin.from('organizer_invites').update({ invited_by: ctx.userId }).eq('invited_by', userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error('Le collaborateur n’a pas pu être retiré. Réessayez.')

  revalidatePath('/settings')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run actions/__tests__/remove-organizer.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add actions/settings.ts actions/__tests__/remove-organizer.test.ts
git commit -m "feat: removeOrganizer action (owner-only, FK reassignment)"
```

---

## Task 4: Slim `createExchange` — name-only + best-effort owner invites

**Files:**
- Modify: `lib/billing/exchange-limit.ts`
- Modify: `actions/exchanges.ts` (`createExchange`)
- Modify: `actions/__tests__/create-exchange.test.ts`

**Interfaces:**
- Consumes: `createAndSendOrganizerInvite` (Task 2).
- Produces:
  ```ts
  type CreateExchangeResult =
    | { ok: true; inviteErrors?: { email: string; message: string }[] }
    | { ok: false; error: 'limit' | 'invalid'; message: string }
  ```
  Consumed by `NewExchangeModal` (Task 5). `createExchange` reads `name` (required) and repeated `invite_email` fields from FormData; `year` defaults to the current year server-side; `school_b_id` is inserted as `null`.

- [ ] **Step 1: Update the shared contract (types + message)**

In `lib/billing/exchange-limit.ts`, replace the invalid-message constant and the result type:

```ts
export const EXCHANGE_INVALID_MESSAGE =
  "Veuillez renseigner le nom de l’échange."
```

```ts
export type CreateExchangeResult =
  | { ok: true; inviteErrors?: { email: string; message: string }[] }
  | { ok: false; error: 'limit' | 'invalid'; message: string }
```

Leave `EXCHANGE_LIMIT_MESSAGE` unchanged.

- [ ] **Step 2: Update the action test to the new behavior (write failing expectations)**

In `actions/__tests__/create-exchange.test.ts`:

1. Extend the `users` branch of `makeClient` to carry the owner context fields, and add an `orgRole` opt:

```ts
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: {
          school_id: 's-own', role: opts.role ?? 'organizer',
          org_role: opts.orgRole ?? 'owner', full_name: 'Owner', email: 'owner@s.fr',
        } }) }) }) }
      }
```

2. Add `orgRole?: string` to the `opts` type declaration at the top.

3. Change `base` to name-only and add a form helper that appends invite emails:

```ts
const base = { name: 'France–Canada' }

function formWith(fields: Record<string, string>, invites: string[] = []): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  for (const e of invites) fd.append('invite_email', e)
  return fd
}
```

4. Replace the two assertions that reference the partner school / year / school_b_id. The success cases now expect:

```ts
  it('creates the exchange with a null partner school and current-year default', async () => {
    opts = { ownSchoolName: '' }
    await createExchange(form(base))
    expect(calls.schoolUpdated).toBeNull()
    expect(calls.partnerInserted).toBeNull()
    expect(calls.exchangeInserted).toMatchObject({
      name: 'France–Canada', year: new Date().getFullYear(),
      school_a_id: 's-own', school_b_id: null,
    })
    expect(calls.fromTables).toContain('form_templates')
  })
```

5. Update the validation test to name-only:

```ts
  it('returns an invalid result for a blank name instead of throwing', async () => {
    const result = await createExchange(form({ name: '   ' }))
    expect(result).toEqual({ ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE })
    expect(calls.exchangeInserted).toBeNull()
  })
```

6. Add a `partnerInserted` note: the `schools` branch's `insert` should now never be called for a partner. Keep it in the mock but assert `calls.partnerInserted` stays `null` in the success case (done above).

7. Add the best-effort-invite tests (append a new `describe`):

```ts
import { createAndSendOrganizerInvite } from '@/lib/team/invite'
vi.mock('@/lib/team/invite', () => ({ createAndSendOrganizerInvite: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.test' }))

describe('createExchange collaborator invites', () => {
  it('sends best-effort invites for an owner and returns ok on full success', async () => {
    ;(createAndSendOrganizerInvite as any).mockResolvedValue({ ok: true })
    const result = await createExchange(formWith(base, ['a@x.fr', 'b@x.fr']))
    expect(createAndSendOrganizerInvite).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ok: true })
  })

  it('still creates the exchange and returns inviteErrors when an invite fails', async () => {
    ;(createAndSendOrganizerInvite as any)
      .mockResolvedValueOnce({ ok: false, message: 'Adresse e-mail invalide.' })
      .mockResolvedValueOnce({ ok: true })
    const result = await createExchange(formWith(base, ['bad', 'b@x.fr']))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
    expect(result).toEqual({ ok: true, inviteErrors: [{ email: 'bad', message: 'Adresse e-mail invalide.' }] })
  })

  it('skips invites entirely for an admin caller', async () => {
    ;(createAndSendOrganizerInvite as any).mockResolvedValue({ ok: true })
    opts = { orgRole: 'admin' }
    const result = await createExchange(formWith(base, ['a@x.fr']))
    expect(createAndSendOrganizerInvite).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })
})
```

Add `beforeEach(() => { (createAndSendOrganizerInvite as any).mockReset?.() })` inside that describe or reset it in the existing top-level `beforeEach`.

Run: `pnpm exec vitest run actions/__tests__/create-exchange.test.ts`
Expected: FAIL (old implementation still inserts a partner school / requires school_b_name).

- [ ] **Step 3: Rewrite `createExchange`**

In `actions/exchanges.ts`, add imports near the top:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { createAndSendOrganizerInvite } from '@/lib/team/invite'
```

Replace the body of `createExchange` from the `name`/`year`/`schoolBName` parsing (line 44) through the `return { ok: true }` (line 113) with:

```ts
  const name = (formData.get('name') as string ?? '').trim()
  if (!name) {
    // Expected outcome, not an exception: return so the client can show it.
    // A thrown message would be redacted in production (see exchange-limit.ts).
    return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }
  }
  // The app never needs data about the partner school; default the year
  // server-side (the DB column stays NOT NULL).
  const year = new Date().getFullYear()

  // Fetch the school's subscription state for the plan cap check below.
  const { data: ownSchool, error: ownSchoolError } = await supabase
    .from('schools')
    .select('name, subscription_status, plan, grace_until')
    .eq('id', profile.school_id).single()
  if (ownSchoolError) throw ownSchoolError

  // Enforce the plan's exchange cap (trial = 1). Count only exchanges this
  // school owns — it is always school_a on exchanges it created.
  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (ownSchool && !canCreateExchange(ownSchool, count ?? 0)) {
    // Expected cap outcome — return so the modal can redirect to /billing.
    return { ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE }
  }

  const { data: createdExchange, error } = await supabase
    .from('exchanges')
    .insert({
      name,
      year,
      school_a_id: profile.school_id,
      school_b_id: null,
      apply_slug: applySlug(name),
    })
    .select('id')
    .single()
  if (error) throw error

  await seedStandardTemplates(supabase, {
    exchangeId: createdExchange.id,
    schoolId: profile.school_id,
    userId: user.id,
  })

  // Optional collaborator invites from the modal — owner-only, best-effort:
  // a failed invite never fails the creation, it is returned for inline display.
  const inviteErrors: { email: string; message: string }[] = []
  if (profile.org_role === 'owner') {
    const emails = (formData.getAll('invite_email') as string[])
      .map(e => e.trim()).filter(Boolean)
    if (emails.length > 0) {
      const admin = createAdminClient()
      const appUrl = getAppUrl()
      for (const email of emails) {
        const r = await createAndSendOrganizerInvite(admin, {
          schoolId: profile.school_id, email,
          inviterUserId: user.id, inviterName: profile.full_name, appUrl,
        })
        if (!r.ok) inviteErrors.push({ email, message: r.message })
      }
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, createdExchange.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  // The shell's exchange selector (layout data) must pick up the new exchange.
  revalidatePath('/', 'layout')

  return inviteErrors.length > 0 ? { ok: true, inviteErrors } : { ok: true }
```

Note `profile.full_name` and `profile.org_role` come from `getProfile()` (verified: its select includes `full_name` and `org_role`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run actions/__tests__/create-exchange.test.ts`
Expected: PASS (all cases incl. the three invite tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/billing/exchange-limit.ts actions/exchanges.ts actions/__tests__/create-exchange.test.ts
git commit -m "feat: slim createExchange to name-only with best-effort owner invites"
```

---

## Task 5: Redesign `NewExchangeModal` + thread `orgRole` through the shell

**Files:**
- Modify: `app/(organizer)/layout.tsx`
- Modify: `components/shell/OrganizerShell.tsx`
- Modify: `components/shell/NewExchangeModal.tsx`
- Modify: `components/shell/__tests__/NewExchangeModal.test.tsx`

**Interfaces:**
- Consumes: `createExchange` returning `CreateExchangeResult` with optional `inviteErrors`.
- Produces: `NewExchangeModal` gains an `isOwner?: boolean` prop (default `false`); `OrganizerShell` gains an `orgRole?: 'owner' | 'admin'` prop (default `'admin'`). The modal submits repeated hidden `invite_email` inputs.

- [ ] **Step 1: Thread `orgRole` layout → shell → modal (no test yet; wiring)**

In `app/(organizer)/layout.tsx`, add to the `<OrganizerShell ... />` props:

```tsx
      orgRole={(profile.org_role ?? 'admin') as 'owner' | 'admin'}
```

In `components/shell/OrganizerShell.tsx`, add to the props type and destructuring (default `'admin'`):

```tsx
  orgRole = 'admin',
```
```tsx
  orgRole?: 'owner' | 'admin'
```

And pass it to the modal at the bottom of the component:

```tsx
      <NewExchangeModal
        open={newExchangeOpen}
        onOpenChange={setNewExchangeOpen}
        isTrial={isTrial}
        remaining={remaining}
        isOwner={orgRole === 'owner'}
      />
```

- [ ] **Step 2: Rewrite the modal test for the single field + chips (failing)**

Replace `components/shell/__tests__/NewExchangeModal.test.tsx` `fillRequiredFields` and the "renders the French form" test, and add chip tests. Key edits:

```ts
async function fillName() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nom de l’échange'), 'Espagne 2026')
  return user
}
```

Replace every `fillRequiredFields()` call with `fillName()`. Update the render test:

```ts
  it('renders a single name field and no partner/year inputs', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} />)
    expect(screen.getByLabelText('Nom de l’échange')).toBeInTheDocument()
    expect(screen.queryByLabelText('Année')).toBeNull()
    expect(screen.queryByLabelText('Établissement partenaire')).toBeNull()
    expect(screen.getByRole('button', { name: 'Créer l’échange' })).toBeInTheDocument()
  })
```

Update every `{ name: "Créer l'échange" }` matcher to the typographic apostrophe form `'Créer l’échange'` to match the rewritten JSX.

Add collaborator tests:

```ts
  it('hides the collaborator section for non-owners', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} isOwner={false} />)
    expect(screen.queryByText(/Inviter un collaborateur/)).toBeNull()
  })

  it('lets an owner add and dedupe collaborator chips and submits them', async () => {
    createExchange.mockResolvedValueOnce({ ok: true })
    render(<NewExchangeModal open onOpenChange={() => {}} isOwner />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom de l’échange'), 'Espagne 2026')
    await user.click(screen.getByRole('button', { name: /Inviter un collaborateur/ }))
    const emailInput = screen.getByPlaceholderText('adresse@etablissement.fr')
    await user.type(emailInput, 'collega@x.fr{Enter}')
    await user.type(emailInput, 'collega@x.fr{Enter}') // duplicate → ignored
    expect(screen.getAllByText('collega@x.fr')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))
    const fd = createExchange.mock.calls[0][0] as FormData
    expect(fd.getAll('invite_email')).toEqual(['collega@x.fr'])
  })

  it('shows inviteErrors inline while still closing on ok', async () => {
    createExchange.mockResolvedValueOnce({ ok: true, inviteErrors: [{ email: 'bad', message: 'Adresse e-mail invalide.' }] })
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} isOwner />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom de l’échange'), 'Espagne 2026')
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))
    expect(await screen.findByText(/bad/)).toBeInTheDocument()
    expect(await screen.findByText(/Adresse e-mail invalide\./)).toBeInTheDocument()
  })
```

Run: `pnpm exec vitest run components/shell/__tests__/NewExchangeModal.test.tsx`
Expected: FAIL (old modal has Année/partner fields, no chips).

- [ ] **Step 3: Rewrite the modal**

Replace `components/shell/NewExchangeModal.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExchange } from '@/actions/exchanges'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { exchangeNoticeMessage } from '@/lib/billing/exchange-notice'
import { normalizeEmail, isValidEmail } from '@/lib/validation'

export function NewExchangeModal({
  open,
  onOpenChange,
  isTrial = false,
  remaining = Infinity,
  isOwner = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isTrial?: boolean
  remaining?: number
  isOwner?: boolean
}) {
  const notice = exchangeNoticeMessage({ isTrial, remaining })
  const [error, setError] = useState<string | null>(null)
  const [inviteErrors, setInviteErrors] = useState<{ email: string; message: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [chips, setChips] = useState<string[]>([])
  const router = useRouter()

  useEffect(() => {
    if (open) {
      setError(null)
      setInviteErrors([])
      setLoading(false)
      setShowInvite(false)
      setEmailDraft('')
      setEmailError(null)
      setChips([])
    }
  }, [open])

  function addChip() {
    const email = normalizeEmail(emailDraft)
    if (!isValidEmail(email)) { setEmailError('Adresse e-mail invalide.'); return }
    setChips(prev => prev.includes(email) ? prev : [...prev, email]) // dedupe
    setEmailDraft('')
    setEmailError(null)
  }

  function removeChip(email: string) {
    setChips(prev => prev.filter(e => e !== email))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInviteErrors([])
    try {
      const result = await createExchange(new FormData(e.currentTarget))
      if (result.ok) {
        if (result.inviteErrors && result.inviteErrors.length > 0) {
          // Exchange created; some invites failed. Show them, then move on.
          setInviteErrors(result.inviteErrors)
          setLoading(false)
          return
        }
        onOpenChange(false)
        router.push('/dashboard')
        return
      }
      if (result.error === 'limit') {
        onOpenChange(false)
        router.push('/billing')
        return
      }
      setError(result.message)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
            Nouvel échange
          </DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            Donnez un nom à votre échange pour commencer.
          </DialogDescription>
        </DialogHeader>
        {notice && (
          <p
            role="note"
            className={
              notice.tone === 'warning'
                ? 'rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900'
                : 'rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground'
            }
          >
            {notice.message}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom de l’échange</Label>
            <Input id="name" name="name" placeholder="Espagne 2026" required className="h-12" />
          </div>

          {isOwner && (
            <div className="flex flex-col gap-2">
              {!showInvite ? (
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="self-start text-[13px] font-semibold text-brand hover:text-brand-hover"
                >
                  + Inviter un collaborateur (optionnel)
                </button>
              ) : (
                <>
                  <Label htmlFor="invite">Inviter un collaborateur (optionnel)</Label>
                  <div className="flex gap-2.5">
                    <Input
                      id="invite"
                      value={emailDraft}
                      onChange={e => setEmailDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChip() } }}
                      placeholder="adresse@etablissement.fr"
                      className="h-11"
                    />
                    <Button type="button" variant="secondary" onClick={addChip} className="h-11 flex-none">
                      Ajouter
                    </Button>
                  </div>
                  {emailError && <p className="text-sm text-danger-text">{emailError}</p>}
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {chips.map(email => (
                        <span key={email} className="flex items-center gap-1.5 rounded-pill bg-subtle px-3 py-1 text-[12.5px] font-medium text-foreground">
                          {email}
                          <button
                            type="button"
                            aria-label={`Retirer ${email}`}
                            onClick={() => removeChip(email)}
                            className="text-tertiary hover:text-danger-text"
                          >
                            ×
                          </button>
                          <input type="hidden" name="invite_email" value={email} />
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-danger-text">{error}</p>}
          {inviteErrors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
              <p className="mb-1 font-semibold">L’échange est créé, mais certaines invitations ont échoué :</p>
              <ul className="list-disc pl-5">
                {inviteErrors.map(ie => (
                  <li key={ie.email}>{ie.email} — {ie.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-1.5 flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (inviteErrors.length > 0) { onOpenChange(false); router.push('/dashboard'); return }
                onOpenChange(false)
              }}
              className="text-muted-foreground"
            >
              {inviteErrors.length > 0 ? 'Continuer' : 'Annuler'}
            </Button>
            {inviteErrors.length === 0 && (
              <Button type="submit" disabled={loading}>
                {loading ? 'Création…' : 'Créer l’échange'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Note the Enter-in-name-field caveat: the collaborator `Input` swallows Enter to add a chip, but Enter in the **name** field still submits the form (native). That is intended — the chip input is a separate field. Verify `Button` supports `variant="secondary"`; if not, use `variant="outline"` (check `components/ui/button.tsx` variants and pick an existing one).

- [ ] **Step 4: Run the modal + shell tests**

Run: `pnpm exec vitest run components/shell`
Expected: PASS. If `OrganizerShell.test.tsx` fails on the new required prop, it isn't required (defaults to `'admin'`) — investigate any real failure.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/\(organizer\)/layout.tsx components/shell/OrganizerShell.tsx components/shell/NewExchangeModal.tsx components/shell/__tests__/NewExchangeModal.test.tsx
git commit -m "feat: single-field Nouvel échange with owner collaborator invites"
```

---

## Task 6: TeamCard « Retirer » — remove an active collaborator

**Files:**
- Modify: `components/settings/TeamCard.tsx`
- Modify (if needed): `components/settings/__tests__/SettingsView.test.tsx`
- Create: `components/settings/__tests__/TeamCard.test.tsx`

**Interfaces:**
- Consumes: `removeOrganizer(userId)` (Task 3); `TeamMember` already carries `id`, `isOwner`, `isYou`.

- [ ] **Step 1: Write the failing test**

Create `components/settings/__tests__/TeamCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const inviteOrganizer = vi.fn()
const revokeOrganizerInvite = vi.fn()
const removeOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({
  inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a),
  revokeOrganizerInvite: (...a: unknown[]) => revokeOrganizerInvite(...a),
  removeOrganizer: (...a: unknown[]) => removeOrganizer(...a),
}))

import { TeamCard } from '@/components/settings/TeamCard'

const team = {
  members: [
    { id: 'o1', name: 'Owner One', email: 'owner@s.fr', isOwner: true, isYou: true },
    { id: 'a1', name: 'Admin Two', email: 'admin@s.fr', isOwner: false, isYou: false },
  ],
  pending: [],
}

beforeEach(() => { removeOrganizer.mockReset().mockResolvedValue(undefined) })

describe('TeamCard remove collaborator', () => {
  it('shows Retirer only on admin rows for the owner', () => {
    render(<TeamCard team={team} isOwner />)
    // one Retirer button (for Admin Two), none for the owner row
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(1)
  })

  it('hides Retirer entirely for non-owners', () => {
    render(<TeamCard team={team} isOwner={false} />)
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull()
  })

  it('confirms then calls removeOrganizer with the target id', async () => {
    render(<TeamCard team={team} isOwner />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(screen.getByText(/perdra l’accès/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }))
    await waitFor(() => expect(removeOrganizer).toHaveBeenCalledWith('a1'))
  })

  it('surfaces a removal error inline', async () => {
    removeOrganizer.mockRejectedValueOnce(new Error('Le collaborateur n’a pas pu être retiré. Réessayez.'))
    render(<TeamCard team={team} isOwner />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }))
    expect(await screen.findByText(/n’a pas pu être retiré/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run components/settings/__tests__/TeamCard.test.tsx`
Expected: FAIL — no `Retirer` control / `removeOrganizer` not imported.

- [ ] **Step 3: Add the Retirer control + confirm dialog**

In `components/settings/TeamCard.tsx`:

1. Extend the import:

```tsx
import { inviteOrganizer, revokeOrganizerInvite, removeOrganizer, type TeamMember, type PendingInvite } from '@/actions/settings'
```

2. Add dialog primitives + state at the top of the component:

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
```

```tsx
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  async function handleRemove() {
    if (!removing) return
    setRemoveBusy(true); setError(null)
    try {
      await removeOrganizer(removing.id)
      setRemoving(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setRemoveBusy(false)
  }
```

3. In the members `.map`, on the badge line, for an owner viewing a non-owner, non-self row, add a Retirer button after the Administrateur badge:

```tsx
            {m.isOwner ? (
              <span className="rounded-pill bg-navy px-3 py-[5px] text-[11.5px] font-semibold text-white">Propriétaire</span>
            ) : (
              <span className="rounded-pill bg-subtle px-3 py-[5px] text-[11.5px] font-semibold text-muted-foreground">Administrateur</span>
            )}
            {isOwner && !m.isOwner && !m.isYou && (
              <button
                type="button"
                onClick={() => setRemoving(m)}
                className="px-1.5 py-1 text-xs font-semibold text-tertiary hover:text-danger-text"
              >
                Retirer
              </button>
            )}
```

4. Add the confirm dialog just before the component's closing `</div>`:

```tsx
      <Dialog open={!!removing} onOpenChange={o => { if (!o) setRemoving(null) }}>
        <DialogContent className="max-w-[440px] rounded-card p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold text-navy">Retirer ce collaborateur ?</DialogTitle>
            <DialogDescription className="text-[14px] text-muted-foreground">
              {removing?.name} perdra l’accès à tous les échanges de votre établissement.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setRemoving(null)} className="text-muted-foreground">
              Annuler
            </Button>
            <Button type="button" onClick={handleRemove} disabled={removeBusy} className="bg-danger-text hover:bg-danger-text/90">
              {removeBusy ? 'Retrait…' : 'Confirmer le retrait'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
```

(If `bg-danger-text` is not a valid background utility in this Tailwind config, use the destructive button variant if one exists, or a red utility already used elsewhere — check `components/ui/button.tsx` for a `destructive` variant and prefer `variant="destructive"`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run components/settings/__tests__/TeamCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Check the existing SettingsView test still passes**

Run: `pnpm exec vitest run components/settings/__tests__/SettingsView.test.tsx`
Expected: PASS. If it now finds an unexpected extra button, update only the affected assertion.

- [ ] **Step 6: Commit**

```bash
git add components/settings/TeamCard.tsx components/settings/__tests__/TeamCard.test.tsx
git commit -m "feat: remove an active collaborator from the team card"
```

---

## Task 7: Onboarding step 2 — optional collaborator invites

**Files:**
- Modify: `actions/onboarding.ts` (`completeOnboarding` stops redirecting)
- Modify: `actions/__tests__/onboarding.test.ts`
- Modify: `app/onboarding/OnboardingForm.tsx` (two-step flow)
- Modify: `app/onboarding/page.tsx` (subtitle copy only, if desired)

**Interfaces:**
- Consumes: `completeOnboarding(formData)` → `Promise<void>` (no longer redirects); `inviteOrganizer(email)` (Task 2).

- [ ] **Step 1: Update the onboarding action test (failing)**

In `actions/__tests__/onboarding.test.ts`, change the first test to expect a **return** instead of a redirect, and stop asserting a redirect throw:

```ts
  it('persists the trimmed name without redirecting (client advances to step 2)', async () => {
    await completeOnboarding(fd('  Lincoln High  '))
    expect(scenario.updated).toEqual({ name: 'Lincoln High' })
    expect(redirect).not.toHaveBeenCalled()
  })
```

The other three tests (empty name, non-organizer, unauthenticated) stay as-is.

Run: `pnpm exec vitest run actions/__tests__/onboarding.test.ts`
Expected: FAIL — current action still calls `redirect('/dashboard')`.

- [ ] **Step 2: Remove the redirect from `completeOnboarding`**

In `actions/onboarding.ts`, delete the `redirect('/dashboard')` line and the `redirect` import; keep `revalidatePath('/dashboard')`. The function now simply returns after a successful update (its return type is already `Promise<void>`).

Run: `pnpm exec vitest run actions/__tests__/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 3: Two-step OnboardingForm (write the failing component test)**

Create `app/onboarding/__tests__/OnboardingForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const completeOnboarding = vi.fn()
vi.mock('@/actions/onboarding', () => ({ completeOnboarding: (...a: unknown[]) => completeOnboarding(...a) }))
const inviteOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({ inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a) }))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

beforeEach(() => {
  push.mockReset()
  completeOnboarding.mockReset().mockResolvedValue(undefined)
  inviteOrganizer.mockReset().mockResolvedValue(undefined)
})

describe('OnboardingForm', () => {
  it('advances to the invite step after saving the school name', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText(/Invitez vos collègues/)).toBeInTheDocument()
    expect(completeOnboarding).toHaveBeenCalledOnce()
  })

  it('lets the user skip straight to the dashboard', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.click(await screen.findByRole('button', { name: 'Passer' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('sends an invite and lists it as sent', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.type(await screen.findByPlaceholderText('adresse@etablissement.fr'), 'c@x.fr')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(inviteOrganizer).toHaveBeenCalledWith('c@x.fr'))
    expect(await screen.findByText('c@x.fr')).toBeInTheDocument()
  })
})
```

Run: `pnpm exec vitest run app/onboarding/__tests__/OnboardingForm.test.tsx`
Expected: FAIL — no invite step / no `Passer` button.

- [ ] **Step 4: Rewrite `OnboardingForm` as two steps**

Replace `app/onboarding/OnboardingForm.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeOnboarding } from '@/actions/onboarding'
import { inviteOrganizer } from '@/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 2 invite state
  const [email, setEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [sent, setSent] = useState<string[]>([])

  async function handleName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await completeOnboarding(new FormData(e.currentTarget))
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setLoading(false)
  }

  async function handleInvite() {
    setInviteBusy(true); setInviteError(null)
    try {
      await inviteOrganizer(email)
      setSent(prev => [...prev, email.trim()])
      setEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setInviteBusy(false)
  }

  if (step === 1) {
    return (
      <form onSubmit={handleName} className="flex flex-col gap-4">
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h4 className="m-0 font-display text-[17px] font-bold text-[#10203F]">Invitez vos collègues (optionnel)</h4>
        <p className="m-0 text-[14px] leading-relaxed text-[#5B6B8C]">
          Ils pourront co-gérer vos échanges. Vous pourrez aussi les inviter plus tard depuis les Réglages.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleInvite() } }}
          placeholder="adresse@etablissement.fr"
          className="h-11 rounded-[10px] border-[#C4CDE0]"
        />
        <Button type="button" onClick={handleInvite} disabled={inviteBusy} className="h-11 flex-none rounded-[11px] bg-[#2456E6] px-5 text-base font-semibold hover:bg-[#1D48C7]">
          Inviter
        </Button>
      </div>
      {inviteError && <p className="text-sm text-[#C0392B]">{inviteError}</p>}
      {sent.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {sent.map(e => (
            <li key={e} className="rounded-[9px] bg-[#EEF1F7] px-3 py-2 text-[13.5px] text-[#42506E]">
              ✓ Invitation envoyée à {e}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-between">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')} className="text-[#5B6B8C]">
          Passer
        </Button>
        <Button type="button" onClick={() => router.push('/dashboard')} className="h-11 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          Continuer
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the onboarding component test**

Run: `pnpm exec vitest run app/onboarding`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add actions/onboarding.ts actions/__tests__/onboarding.test.ts app/onboarding/OnboardingForm.tsx app/onboarding/__tests__/OnboardingForm.test.tsx
git commit -m "feat: optional collaborator-invite step in onboarding"
```

---

## Task 8: Exchange detail header — null `school_b` fallback

**Files:**
- Modify: `app/(organizer)/exchanges/[id]/page.tsx`

**Interfaces:**
- Consumes: `getExchange(id)` returning `school_b` possibly `null`.

- [ ] **Step 1: Update the header to fall back when `school_b` is null**

Replace the `<p>` line in `app/(organizer)/exchanges/[id]/page.tsx`:

```tsx
      <p className="mb-1 text-sm text-muted-foreground">
        {exchange.school_b?.name
          ? `${exchange.school_a?.name} ↔ ${exchange.school_b.name} · ${exchange.year}`
          : `${exchange.school_a?.name ?? ''} · ${exchange.year}`}
      </p>
```

- [ ] **Step 2: Grep for other `school_b` display sites needing the same fallback**

Run: `grep -rnE 'school_b(\?)?\.name' app components | grep -v __tests__`
For each hit that renders text, ensure it already uses `?.` optional chaining and has a sensible null fallback. The detail header is the primary one; `getExchanges`/`getExchange` selects are data, not display. Fix any raw `{x.school_b.name}` (non-optional) you find; leave optional-chained ones.

- [ ] **Step 3: Typecheck + full suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(organizer\)/exchanges/\[id\]/page.tsx
git commit -m "feat: null-partner fallback in exchange detail header"
```

---

## Task 9: Full verification gate + live-drive prep

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

Run: `pnpm lint && pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: lint clean, all tests green, no type errors. Fix anything red before proceeding.

- [ ] **Step 2: Confirm no straight-apostrophe regressions in new French copy**

Run: `grep -rnE "l'échange|n'a pas|d'invitation|perdra l'acc" components app lib | grep -v __tests__ | grep -v '&apos;'`
Expected: no hits (all new copy uses `’`). Any hit outside a JSX `&apos;` attribute must be converted to `’`.

- [ ] **Step 3: Apply the migration to the remote DB (deploy step)**

The migration is a safe nullable relaxation with no data backfill. Apply via `supabase db push` (or the Supabase MCP `apply_migration`) against the project. If `supabase db push` hangs at "Initialising login role" on IPv6-less networks, use the IPv4 session-pooler `--db-url` (see the WSL2 supabase IPv6 memory).

- [ ] **Step 4: One preview live-drive (manual, on the Vercel preview URL for this branch)**

Walk the full path once:
1. As an owner, open « Nouvel échange », enter only a name, add a collaborator chip, create → lands on dashboard; invite email arrives.
2. Accept via `/join/<token>` → the collaborator co-manages the exchange.
3. Réglages → « Retirer » the collaborator → confirm → they lose access.
4. Onboarding (fresh owner): set school name → step 2 invite → « Passer ».
5. Open a legacy exchange detail → header still shows « A ↔ B · year »; the new exchange shows « Name · year ».

- [ ] **Step 5: Final commit / branch finish**

If the branch is `feature/application-resume-flow` (current) or a fresh collaborators branch, ensure all task commits are present, then hand off per the finishing-a-development-branch skill (merge to `main` only after the gate + live-drive pass and with user confirmation, since merge deploys to production).

---

## Self-Review

**Spec coverage:**
- Goal 1 (remove active collaborator) → Task 3 (action) + Task 6 (UI). ✅
- Goal 2 (onboarding invite) → Task 7. ✅
- Goal 3 (invites in exchange creation) → Task 4 (action) + Task 5 (modal). ✅
- Goal 4 (single-field Nouvel échange, no phantom partner rows) → Task 4 + Task 5. ✅
- Locked decision 4 (one field, year server-default) → Task 4. ✅
- Locked decision 5 (`school_b_id` nullable, no partner insert) → Task 1 + Task 4. ✅
- Server changes: `removeOrganizer` FK reassignment order + guards → Task 3; `createExchange` best-effort owner-only invites → Task 4. ✅
- UI: TeamCard Retirer → Task 6; onboarding 2 steps → Task 7; modal chips owner-only + inviteErrors → Task 5; detail header fallback → Task 8. ✅
- Edge cases: dedupe chips (Task 5 `addChip`), already-member/invited errors (Task 2 helper messages), FK reassignment (Task 3), PII discipline (Global Constraints — no emails logged; the helper/action never log). ✅
- Testing matrix (actions, components, gate, live-drive) → Tasks 2–7 tests + Task 9. ✅

**Type consistency:** `CreateExchangeResult.inviteErrors` shape `{ email; message }[]` is identical in `lib/billing/exchange-limit.ts` (Task 4), the action return (Task 4), and the modal state (Task 5). `createAndSendOrganizerInvite` signature is identical across its definition (Task 2), `inviteOrganizer` (Task 2), and `createExchange` (Task 4). `InviteResult` / `{ ok; message }` consistent. `orgRole: 'owner' | 'admin'` consistent layout→shell→modal (`isOwner` boolean at the modal boundary).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; test steps include full test bodies. Two "check the existing variant" caveats (Button variant name in Tasks 5/6, SettingsView test in Task 6) are explicit verification instructions, not deferred implementation.
