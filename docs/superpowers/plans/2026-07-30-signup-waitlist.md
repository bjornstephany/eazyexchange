# Signup Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the signup gate from a human clicking « Approuver » at `/admin` *after* an account exists, to `signup_allowlist` consulted *before* an account exists — everyone else is captured on a new `signup_waitlist` table and never gets an auth row.

**Architecture:** One new service-role-only table (`signup_waitlist`), one shared helper module (`lib/auth/waitlist.ts`) holding the allowlist lookup and the waitlist write, consumed by both signup entry points: a new `requestOrganizerSignup` server action (the email/password funnel moves off the browser) and the `intent=organizer_signup` branch of `app/auth/callback/route.ts` (Google). The `/admin` queue and `lib/auth/admin.ts` are deleted. The DB gate (`users.status`, `my_role()`, `set_initial_user_status()`) stays untouched as the fail-closed backstop.

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (Postgres + RLS + Auth), Resend, Tailwind, vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-30-signup-waitlist-design.md`

## Global Constraints

- **Branch:** all work happens on `feature/signup-waitlist` in this worktree. Confirm with `git branch --show-current` before every commit. Never `git add -A` / `git add .` — stage only the files named in the task.
- **Package manager is `pnpm`**, never npm.
- **Every expected outcome is a structured return value, never a `throw`.** Production redacts thrown Server Action / RSC error messages behind an opaque digest, so a thrown validation error reaches the user as nothing at all.
- **Never log student/parent PII** — no emails, names or submission contents in `console.log` / `console.error`. Log reasons and counts only.
- **Always escape user-supplied content in email HTML** via the existing `esc()` helper in `lib/email.ts`.
- **Auth-page copy is hardcoded French.** `/signup`, `/login`, `/pending` are not in the `next-intl` catalogs — do not add translation keys.
- **Typographic apostrophes.** French copy uses `’` (U+2019), never `'`. Match the surrounding files exactly.
- **`lib/supabase/admin` (service role) may only be imported by files listed in `lib/supabase/__tests__/admin-allowlist.test.ts`.** This plan adds exactly one importer (`lib/auth/waitlist.ts`) and removes two (`app/admin/page.tsx`, `app/admin/actions.ts`).
- **`supabase/migrations/` is single-writer.** Only one session at a time may add or apply a migration.
- **Never run `supabase db push` against production.** Staging first, then prod via the Supabase MCP `apply_migration` tool.
- **Verification commands:** `pnpm lint`, `pnpm test`, `pnpm build`. Anything touching `supabase/migrations/`, RLS policies or storage buckets also runs `pnpm test:rls`. The full gate is `pnpm ship`.
- **Commit automatically once a task is finished and its tests pass.** Merging to `main` still requires user confirmation.

## File Structure

**Created**
| File | Responsibility |
|---|---|
| `supabase/migrations/<stamp>_signup_waitlist.sql` | the `signup_waitlist` table, its revokes, and three one-off data fixes |
| `lib/auth/waitlist.ts` | the only module that reads `signup_allowlist` and writes `signup_waitlist`; on the admin allowlist |
| `lib/auth/__tests__/waitlist.test.ts` | unit tests for the two helpers |
| `tests/rls/signup-waitlist.test.ts` | RLS matrix cases: anon *and* authenticated get nothing, on both waitlist and allowlist |
| `scripts/reset-account.mjs` | `pnpm reset-account <email>` — FK-ordered teardown so the signup cycle is repeatable |

**Modified**
| File | Change |
|---|---|
| `types/supabase.ts` | regenerated (adds `signup_waitlist`) |
| `lib/email.ts:371-391` | `sendSignupRequestEmail` → `sendWaitlistNotificationEmail`, body points at the Supabase dashboard |
| `lib/__tests__/email-signup.test.ts` | follows the rename |
| `lib/auth/provision.ts:2,85-91` | stops sending the request email; a `pending` result is now an alertable anomaly |
| `lib/auth/__tests__/provision.test.ts` | follows |
| `app/(auth)/signup/actions.ts` | gains `requestOrganizerSignup` |
| `app/(auth)/signup/__tests__/actions.test.ts` | gains its tests |
| `app/(auth)/signup/page.tsx` | submits through the action; third terminal state; `?waitlisted=1` |
| `app/(auth)/__tests__/signup.test.tsx` | follows |
| `app/(auth)/signup/__tests__/page.order.test.tsx` | mock gains the new action |
| `app/auth/callback/route.ts:57-61,63-76` | allowlist check before `provisionOrganizer`; shared teardown helper |
| `app/__tests__/callback.test.ts` | gains its cases |
| `app/pending/page.tsx` | copy rewritten to match the waitlist message |
| `app/__tests__/pending.test.tsx` | follows |
| `app/robots.ts:34` | drops the stale `/admin` entry |
| `lib/supabase/__tests__/admin-allowlist.test.ts` | −2 entries, +1 |
| `scripts/seed-cast.mjs` | exports the allowlisted smoke address |
| `scripts/seed-demo.mjs` | seeds the matching `signup_allowlist` row; wipes seed waitlist rows |
| `tests/smoke/helpers/reset.ts` | clears waitlist rows + signup rate-limit counters |
| `tests/smoke/signup.spec.ts` | two specs replace the `/pending` assertion |
| `package.json` | `reset-account` script |
| `CLAUDE.md` | the « Signup is open but gated » bullet |

**Deleted**
`app/admin/page.tsx`, `app/admin/actions.ts`, `app/admin/__tests__/actions.test.ts`, `lib/auth/admin.ts`, `lib/auth/__tests__/admin.test.ts`.

---

### Task 1: The migration, the types, and the RLS matrix

**Files:**
- Create: `supabase/migrations/<stamp>_signup_waitlist.sql`
- Create: `tests/rls/signup-waitlist.test.ts`
- Modify: `types/supabase.ts` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.signup_waitlist (email text pk, full_name text, source text not null check in ('password','google'), created_at timestamptz not null default now(), notified_at timestamptz, note text)`, service-role only. Generated type `Database['public']['Tables']['signup_waitlist']`.

**Context you need:**
`signup_allowlist` already exists (`supabase/migrations/20260725154243_signup_approval_gate.sql:32-41`) and already works — `set_initial_user_status()` auto-approves any email found in it. This task adds its sibling and nothing more. The baseline migration `20260708000001` grants default privileges to `anon` and `authenticated` on new public tables, which is why the explicit `revoke all` is load-bearing rather than decorative.

Production currently has exactly one non-approved row: `bjornstephany@gmail.com`, `pending`, created 2026-07-30 16:57. Data fix 2 must run **before** data fix 3, or the owner's own address is copied onto the waitlist.

- [ ] **Step 1: Create the migration file with a UTC stamp**

```bash
git branch --show-current   # must print: feature/signup-waitlist
touch "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_signup_waitlist.sql"
ls supabase/migrations | tail -3
```

The newest existing migration is `20260730102741_application_template.sql`; the new stamp must sort after it.

- [ ] **Step 2: Write the migration**

```sql
-- Signup waitlist — replaces the /admin approval queue.
-- Spec: docs/superpowers/specs/2026-07-30-signup-waitlist-design.md
--
-- The decision moves from AFTER the account exists (a human clicking
-- « Approuver » at /admin) to BEFORE it exists: both signup paths consult
-- signup_allowlist, and everyone else lands here instead of leaving behind a
-- permanent half-account (an auth row, a blank school, a users row that is
-- awkward to delete against four NO ACTION foreign keys).
--
-- users.status / my_role() / set_initial_user_status() are deliberately NOT
-- touched. ~30 table policies, 5 storage policies and claim_school() are
-- written as `my_role() = 'organizer' AND …`, so they all inherit that gate —
-- including policies not yet written. After this change it simply never fires
-- for a new account; it remains the fail-closed backstop if the
-- application-layer check is ever bypassed.

create table public.signup_waitlist (
  email       text primary key,          -- always stored lowercased
  full_name   text,
  source      text not null check (source in ('password','google')),
  created_at  timestamptz not null default now(),
  -- Stamped by hand on the day access opens, so a second launch email does not
  -- re-mail everyone. Nothing in the application writes it.
  notified_at timestamptz,
  note        text
);

alter table public.signup_waitlist enable row level security;
-- Deliberately NO policies and NO grants: service role only, exactly like
-- signup_allowlist. The baseline default privileges from 20260708000001 would
-- otherwise hand anon and authenticated a grant on this table, so revoke
-- explicitly. This revoke is the ONLY thing protecting a table of third-party
-- email addresses — tests/rls/signup-waitlist.test.ts asserts both roles.
revoke all on public.signup_waitlist from anon, authenticated;

-- --------------------------------------------------------------------------
-- One-off data fixes. All three are written set-wise or with ON CONFLICT so
-- they are correct on local, staging and production alike, and survive a
-- `supabase db reset`.
-- --------------------------------------------------------------------------

-- 1. The owner's own testers, allowlisted forever. Polly gets her own school,
--    because that is what a self-signup does; a second seat on the owner's
--    school is what the /join colleague invite is for.
insert into public.signup_allowlist (email, note) values
  ('bjornstephany@gmail.com', 'owner — permanent tester'),
  ('pollystephany@gmail.com', 'owner — separate organizer, own school')
on conflict (email) do nothing;

-- 2. The owner's existing production account is sitting `pending`. Without
--    this he would have to delete and re-create his own account just to get
--    in. A no-op on local and staging, where the row does not exist.
--    MUST run before fix 3, or fix 3 copies him onto the waitlist.
update public.users
   set status = 'approved', reviewed_at = now()
 where email = 'bjornstephany@gmail.com'
   and status <> 'approved';

-- 3. Every remaining pending organizer moves to the waitlist, so they receive
--    the launch email instead of being forgotten on a page nobody visits.
--    Set-wise rather than by address: correct on every environment, needs no
--    existence guard, and a no-op wherever there are none. Their users row is
--    left in place — it stays `pending`, so it still has zero access, and
--    deleting it would mean fighting the same four NO ACTION foreign keys
--    scripts/reset-account.mjs exists to handle.
insert into public.signup_waitlist (email, full_name, source, note)
select u.email,
       nullif(u.full_name, ''),
       'password',
       'migré depuis la file /admin le 2026-07-30'
  from public.users u
 where u.role = 'organizer'
   and u.status = 'pending'
on conflict (email) do nothing;
```

- [ ] **Step 3: Write the failing RLS test**

Create `tests/rls/signup-waitlist.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

// Deterministic probe rows, cleaned up by prefix in afterAll.
const WAITLISTED = 'rls-waitlist-probe@rls.test'
const ALLOWLISTED = 'rls-waitlist-allow@rls.test'

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path writes (postgres stands in for the service role: both bypass
  // RLS and both hold the grants these tables deny to everyone else).
  await sql`insert into signup_waitlist (email, full_name, source, note)
            values (${WAITLISTED}, 'Probe Person', 'password', 'rls test')
            on conflict (email) do nothing`
  await sql`insert into signup_allowlist (email, note)
            values (${ALLOWLISTED}, 'rls test')
            on conflict (email) do nothing`
})
afterAll(async () => {
  await sql`delete from signup_waitlist where email like 'rls-waitlist-%'`
  await sql`delete from signup_allowlist where email like 'rls-waitlist-%'`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

// A `grant to authenticated` is never exclusive of `anon`, and vice versa —
// both roles are asserted independently for every verb. These two tables hold
// third-party email addresses and have NO policies at all, so the revoke in the
// migration is the only thing protecting them.
const PERSONAS = () => [
  ['anon', null],
  ['approved organizer', fx.orgA],
  ['student', fx.studentA],
] as const

describe('signup_waitlist (zero-policy: service role only)', () => {
  it('no client role can select', async () => {
    for (const [label, uid] of PERSONAS()) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) =>
          tx`select email from signup_waitlist where email = ${WAITLISTED}`)
      } catch (e) {
        // A revoked SELECT grant surfaces as 42501 — equally a denial.
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${label}`).toHaveLength(0)
    }
  })

  it('no client role can insert', async () => {
    for (const [label, uid] of PERSONAS()) {
      const outcome = await writeOutcome(sql, uid, (tx) =>
        tx`insert into signup_waitlist (email, source)
           values ('rls-waitlist-forged@rls.test', 'password')`)
      expect(outcome, `persona ${label}`).toBe('denied')
    }
  })

  it('no client role can update', async () => {
    for (const [, uid] of PERSONAS()) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`update signup_waitlist set notified_at = now() where email = ${WAITLISTED}`))
    }
  })

  it('no client role can delete', async () => {
    for (const [, uid] of PERSONAS()) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from signup_waitlist where email = ${WAITLISTED}`))
    }
  })

  // Non-vacuousness: prove the denials come from the revoke, not from a probe
  // row that was never written.
  it('the service path does see the row', async () => {
    const rows = await sql`select email, source from signup_waitlist where email = ${WAITLISTED}`
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('password')
  })

  it('rejects a source outside the closed set', async () => {
    await expect(
      sql`insert into signup_waitlist (email, source) values ('rls-waitlist-bad@rls.test', 'sms')`,
    ).rejects.toMatchObject({ code: '23514' })
  })
})

// The sibling table. It has been service-role-only since 20260725154243, but it
// had no matrix case — and it is now the thing that decides who gets an account.
describe('signup_allowlist (zero-policy: service role only)', () => {
  it('no client role can select', async () => {
    for (const [label, uid] of PERSONAS()) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) =>
          tx`select email from signup_allowlist where email = ${ALLOWLISTED}`)
      } catch (e) {
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${label}`).toHaveLength(0)
    }
  })

  it('no client role can insert themselves onto it', async () => {
    for (const [label, uid] of PERSONAS()) {
      const outcome = await writeOutcome(sql, uid, (tx) =>
        tx`insert into signup_allowlist (email) values ('rls-waitlist-forged@rls.test')`)
      expect(outcome, `persona ${label}`).toBe('denied')
    }
  })
})
```

- [ ] **Step 4: Run the RLS test to verify it fails**

```bash
pnpm exec vitest run --config vitest.rls.config.ts tests/rls/signup-waitlist.test.ts
```

Expected: FAIL — `relation "signup_waitlist" does not exist`. If the local stack is down, start it first with `supabase start`.

- [ ] **Step 5: Apply the migration locally**

```bash
supabase migration up
```

- [ ] **Step 6: Run the RLS test to verify it passes**

```bash
pnpm exec vitest run --config vitest.rls.config.ts tests/rls/signup-waitlist.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 7: Regenerate the DB types**

Use the Supabase MCP `generate_typescript_types` tool and overwrite `types/supabase.ts` **verbatim** — never hand-edit it. Then:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS. `types/db.ts` narrows the generated rows, so schema drift fails compile there; if it does, fix the alias in `types/db.ts`, never `types/supabase.ts`.

> Note: `generate_typescript_types` reads the **production** schema, which does not have this table yet. Run this step again after the production apply in Task 10 and commit any difference. For now, if the MCP output lacks `signup_waitlist`, generate from the local stack instead:
> `supabase gen types typescript --local > types/supabase.ts`

- [ ] **Step 8: Run the full RLS suite**

```bash
pnpm test:rls
```

Expected: PASS — nothing else regressed.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # feature/signup-waitlist
git add supabase/migrations tests/rls/signup-waitlist.test.ts types/supabase.ts
git commit -m "feat(db): add signup_waitlist, service-role only

Sibling of signup_allowlist: no policies, no grants, anon and authenticated
revoked explicitly. Carries three one-off data fixes — allowlist the owner's
two addresses, approve the owner's stranded production row, and move every
remaining pending organizer onto the waitlist.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Repurpose the notification email, decouple provisioning

**Files:**
- Modify: `lib/email.ts:371-391`
- Modify: `lib/__tests__/email-signup.test.ts:15-40`
- Modify: `lib/auth/provision.ts:2,85-91`
- Modify: `lib/auth/__tests__/provision.test.ts:64-74,127-140`

**Interfaces:**
- Consumes: `adminRecipients()`, `layout()`, `esc()`, `send()`, `ADMIN_FOOTER` — all already private to `lib/email.ts`.
- Produces: `sendWaitlistNotificationEmail(opts: { fullName: string; email: string; source: 'password' | 'google' }): Promise<void>` — used by Task 3.

**Context you need:**
`sendSignupRequestEmail` today has exactly one caller: `lib/auth/provision.ts:90`, on the `status === 'pending'` branch. After this change `pending` is unreachable for a new signup — both entry points check `signup_allowlist` before an account can exist, and `set_initial_user_status()` auto-approves an allowlisted address. Reaching that branch means the application check and the DB trigger disagreed, which is a bug worth an alert, not a queue entry. `sendSignupFailureEmail` already exists for exactly that shape of alert and is untouched otherwise.

`ADMIN_EMAILS` stays: `lib/email.ts:367` reads it directly, independently of `isPlatformAdmin` (deleted in Task 7).

- [ ] **Step 1: Write the failing test**

Replace the `describe('sendSignupRequestEmail', …)` block in `lib/__tests__/email-signup.test.ts` (lines 15-40) with:

```ts
describe('sendWaitlistNotificationEmail', () => {
  it('sends to ADMIN_EMAILS and points at the Supabase dashboard, not /admin', async () => {
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({
      fullName: 'Marie Dupont', email: 'm.dupont@ac-lyon.fr', source: 'password',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toEqual(['owner@example.com'])
    expect(call.html).toContain('Marie Dupont')
    expect(call.html).toContain('m.dupont@ac-lyon.fr')
    // The queue is gone; the only interface is SQL in the dashboard.
    expect(call.html).toContain('signup_allowlist')
    expect(call.html).not.toContain('/admin')
  })

  it('names the provider the person came through', async () => {
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({ fullName: 'G User', email: 'g@x.fr', source: 'google' })
    expect(sendMock.mock.calls[0][0].html).toContain('Google')
  })

  it('escapes HTML in the applicant-supplied name', async () => {
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({
      fullName: '<script>alert(1)</script>', email: 'x@y.fr', source: 'password',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('does nothing when ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({ fullName: 'A', email: 'a@b.fr', source: 'password' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm exec vitest run lib/__tests__/email-signup.test.ts
```

Expected: FAIL — `sendWaitlistNotificationEmail is not a function`.

- [ ] **Step 3: Rewrite the email function**

In `lib/email.ts`, replace the whole `sendSignupRequestEmail` block (lines 371-391) with:

```ts
// Someone who is not on signup_allowlist tried to create an account. No auth
// user, no school and no users row were created — only a signup_waitlist row.
//
// Awaited, not fire-and-forget, for the same reason as the failure alert:
// send() swallows its own errors and returns a boolean, so awaiting cannot fail
// a signup — whereas a `void` call is dropped when the serverless function
// freezes after the response, i.e. exactly when the alert matters.
export async function sendWaitlistNotificationEmail(opts: {
  fullName: string
  email: string
  source: 'password' | 'google'
}): Promise<void> {
  const to = adminRecipients()
  if (to.length === 0) return

  // `source` is a closed union, so it needs no escaping; fullName and email do.
  const provider = opts.source === 'google' ? 'Google' : 'e-mail / mot de passe'

  const html = layout(`
    <p><strong>Nouvelle inscription en liste d’attente</strong></p>
    <p style="font-size:14px;">
      <strong>${esc(opts.fullName || '—')}</strong><br>
      ${esc(opts.email)}<br>
      <span style="font-size:13px;color:#5C7268;">Via ${provider}</span>
    </p>
    <p style="font-size:13px;color:#5C7268;">
      Aucun compte n’a été créé. Pour ouvrir l’accès à cette personne, ajoutez son
      adresse à la table <strong>signup_allowlist</strong> depuis le tableau de bord
      Supabase ; la liste complète se consulte dans <strong>signup_waitlist</strong>.
    </p>
  `, ADMIN_FOOTER)
  await send(to, 'Nouvelle inscription en liste d’attente', html, 'waitlist notification email')
}
```

Also update the stale comment at `lib/email.ts:365` (« ADMIN_EMAILS is the same variable /admin gates on ») and at `lib/email.ts:411` (« cette personne n’apparaît pas dans /admin »):

```ts
// Recipients for owner-facing alerts. Deliberately ADMIN_EMAILS and not
// FEEDBACK_EMAIL: FEEDBACK_EMAIL is optional by design and is not confirmed
// set in Vercel prod, which would drop signup alerts silently. ADMIN_EMAILS is
// confirmed set there and is now read only here — /admin and isPlatformAdmin
// are gone (2026-07-30 waitlist change).
```

and, inside `sendSignupFailureEmail`'s HTML, replace the `/admin` sentence with:

```
      Aucune ligne n’a été créée dans users : il ne reste aucune trace de cette
      personne côté application.
```

- [ ] **Step 4: Run the email test to verify it passes**

```bash
pnpm exec vitest run lib/__tests__/email-signup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing provisioning test**

In `lib/auth/__tests__/provision.test.ts`, replace the `sendSignupRequestEmail` mock (lines 64-74) so the module mock exposes only what `lib/auth/provision.ts` still imports:

```ts
const delivered = { failure: false }
const sendSignupFailureEmail = vi.fn(async (_opts: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 5))
  delivered.failure = true
})
vi.mock('@/lib/email', () => ({
  sendSignupFailureEmail: (o: Record<string, unknown>) => sendSignupFailureEmail(o),
}))
```

Update `beforeEach` (lines 87-92) to drop the removed references:

```ts
beforeEach(() => {
  admin = makeAdmin()
  sendSignupFailureEmail.mockClear()
  delivered.failure = false
})
```

Replace the two request-email cases (« notifies the platform admins about a pending request », and the `sendSignupRequestEmail` assertion inside « reports approved for an allowlisted address ») with:

```ts
  // Since the waitlist change, a self-signup can only reach provisioning if its
  // address is already on signup_allowlist — and set_initial_user_status()
  // auto-approves those. A `pending` result therefore means the application
  // check and the DB trigger disagreed: alert on it rather than silently
  // stranding the account on /pending.
  it('alerts when an account unexpectedly lands pending', async () => {
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'pending' })
    expect(sendSignupFailureEmail).toHaveBeenCalledTimes(1)
    expect(sendSignupFailureEmail.mock.calls[0][0]).toEqual({
      email: 'org@example.com', reason: 'unexpected_pending_status',
    })
    expect(delivered.failure).toBe(true)
  })

  it('reports approved for an allowlisted address, and sends nothing', async () => {
    admin = makeAdmin({ insertedStatus: 'approved' })
    const result = await provisionOrganizer(baseUser)
    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(sendSignupFailureEmail).not.toHaveBeenCalled()
  })
```

- [ ] **Step 6: Run it to verify it fails**

```bash
pnpm exec vitest run lib/auth/__tests__/provision.test.ts
```

Expected: FAIL — `sendSignupRequestEmail` is still imported by `lib/auth/provision.ts`, so the mocked `@/lib/email` no longer provides it.

- [ ] **Step 7: Update `lib/auth/provision.ts`**

Change the import on line 2:

```ts
import { sendSignupFailureEmail } from '@/lib/email'
```

Replace the `status === 'pending'` block (lines 85-91) with:

```ts
  const status = profile.status as 'pending' | 'approved'
  if (status === 'pending') {
    // Unreachable by design since the 2026-07-30 waitlist change: both signup
    // paths check signup_allowlist before an account can exist, and
    // set_initial_user_status() auto-approves an allowlisted address. Landing
    // here means those two disagreed — the account is stranded on /pending with
    // nobody watching, so it gets the same alert as a failed provision.
    await sendSignupFailureEmail({ email, reason: 'unexpected_pending_status' })
  }
```

Update the block comment above `provisionOrganizer` (lines 43-45) — « the approval gate (every self-signup lands pending) is what keeps fake schools out » is now false:

```ts
// The school is always created blank. /onboarding step 1 names it through
// claim_school(), which re-validates the pick against school_registry; signup
// deliberately asks for nothing but the name, and signup_allowlist (checked
// before this function is ever reached) is what keeps fake schools out.
```

- [ ] **Step 8: Run both tests to verify they pass**

```bash
pnpm exec vitest run lib/auth/__tests__/provision.test.ts lib/__tests__/email-signup.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add lib/email.ts lib/__tests__/email-signup.test.ts lib/auth/provision.ts lib/auth/__tests__/provision.test.ts
git commit -m "refactor(email): repurpose the signup alert as a waitlist notification

The /admin queue is going away, so the alert points at browsing
signup_waitlist in the Supabase dashboard instead. provisionOrganizer no
longer sends it: a pending result is now an anomaly, not a queue entry.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `lib/auth/waitlist.ts` — the allowlist lookup and the waitlist write

**Files:**
- Create: `lib/auth/waitlist.ts`
- Create: `lib/auth/__tests__/waitlist.test.ts`
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts:10-34`

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`; `sendWaitlistNotificationEmail` from Task 2.
- Produces:
  - `type WaitlistSource = 'password' | 'google'`
  - `isSignupAllowlisted(email: string): Promise<boolean>` — expects an already-normalized (trimmed, lowercased) address; fails **closed**.
  - `recordWaitlistEntry(entry: { email: string; fullName: string | null; source: WaitlistSource }): Promise<void>` — idempotent insert, then notify **only on a first insert**.

**Context you need:**
Both signup entry points need the same two operations, and both tables are service-role only, so this module is the single place `lib/supabase/admin` is imported for them. Adding it to `ALLOWLIST` in `lib/supabase/__tests__/admin-allowlist.test.ts` is a deliberate design decision, not a convenience: neither table can have an RLS policy, because the caller in the password path is an anonymous visitor with no session at all.

`.upsert(row, { onConflict: 'email', ignoreDuplicates: true }).select()` maps to `INSERT … ON CONFLICT DO NOTHING RETURNING`, so a conflict returns an empty array. That is how "first time only" is decided for the notification — a repeat signup still shows the same message, it just does not re-mail the owner.

- [ ] **Step 1: Write the failing test**

Create `lib/auth/__tests__/waitlist.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type UpsertRow = { email: string; full_name: string | null; source: string }
type UpsertOpts = { onConflict?: string; ignoreDuplicates?: boolean }

let allowlistRow: { email: string } | null = null
let allowlistError: { message: string } | null = null
let insertedRows: UpsertRow[] = []
let upsertReturns: UpsertRow[] = []
let upsertError: { message: string } | null = null
const upsertOpts: UpsertOpts[] = []
const allowlistQueries: string[] = []

const admin = {
  from: (table: string) => {
    if (table === 'signup_allowlist') {
      return {
        select: () => ({
          eq: (_col: string, value: string) => {
            allowlistQueries.push(value)
            return { maybeSingle: async () => ({ data: allowlistRow, error: allowlistError }) }
          },
        }),
      }
    }
    if (table === 'signup_waitlist') {
      return {
        upsert: (row: UpsertRow, opts: UpsertOpts) => {
          insertedRows.push(row)
          upsertOpts.push(opts)
          return { select: async () => ({ data: upsertReturns, error: upsertError }) }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  },
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const sendWaitlistNotificationEmail = vi.fn(async (_o: Record<string, unknown>) => {})
vi.mock('@/lib/email', () => ({
  sendWaitlistNotificationEmail: (o: Record<string, unknown>) => sendWaitlistNotificationEmail(o),
}))

import { isSignupAllowlisted, recordWaitlistEntry } from '@/lib/auth/waitlist'

beforeEach(() => {
  allowlistRow = null
  allowlistError = null
  insertedRows = []
  upsertReturns = []
  upsertError = null
  upsertOpts.length = 0
  allowlistQueries.length = 0
  sendWaitlistNotificationEmail.mockClear()
})

describe('isSignupAllowlisted', () => {
  it('is true when the address has a row', async () => {
    allowlistRow = { email: 'owner@example.com' }
    expect(await isSignupAllowlisted('owner@example.com')).toBe(true)
    expect(allowlistQueries).toEqual(['owner@example.com'])
  })

  it('is false when it does not', async () => {
    expect(await isSignupAllowlisted('stranger@example.com')).toBe(false)
  })

  // Fails CLOSED: a transient DB error must never mint an account. The visitor
  // sees the waitlist message, which is recoverable; a wrongly-created account
  // is the thing this whole design exists to prevent.
  it('is false when the lookup errors', async () => {
    allowlistError = { message: 'connection reset' }
    allowlistRow = { email: 'owner@example.com' }
    expect(await isSignupAllowlisted('owner@example.com')).toBe(false)
  })
})

describe('recordWaitlistEntry', () => {
  it('inserts on conflict-do-nothing and notifies the owner', async () => {
    upsertReturns = [{ email: 'a@b.fr', full_name: 'A B', source: 'password' }]
    await recordWaitlistEntry({ email: 'a@b.fr', fullName: 'A B', source: 'password' })
    expect(insertedRows).toEqual([{ email: 'a@b.fr', full_name: 'A B', source: 'password' }])
    expect(upsertOpts[0]).toEqual({ onConflict: 'email', ignoreDuplicates: true })
    expect(sendWaitlistNotificationEmail).toHaveBeenCalledWith({
      fullName: 'A B', email: 'a@b.fr', source: 'password',
    })
  })

  it('records a Google entry with its display name', async () => {
    upsertReturns = [{ email: 'g@x.fr', full_name: 'G User', source: 'google' }]
    await recordWaitlistEntry({ email: 'g@x.fr', fullName: 'G User', source: 'google' })
    expect(insertedRows[0]).toEqual({ email: 'g@x.fr', full_name: 'G User', source: 'google' })
  })

  // Signing up twice is idempotent and shows the same message both times; the
  // original created_at is preserved and the owner is not re-alerted.
  it('does not re-notify on a duplicate', async () => {
    upsertReturns = []
    await recordWaitlistEntry({ email: 'a@b.fr', fullName: 'A B', source: 'password' })
    expect(insertedRows).toHaveLength(1)
    expect(sendWaitlistNotificationEmail).not.toHaveBeenCalled()
  })

  it('does not notify when the insert failed', async () => {
    upsertError = { message: 'boom' }
    await recordWaitlistEntry({ email: 'a@b.fr', fullName: null, source: 'password' })
    expect(sendWaitlistNotificationEmail).not.toHaveBeenCalled()
  })

  it('never throws — the caller has already decided what to show', async () => {
    upsertError = { message: 'boom' }
    await expect(
      recordWaitlistEntry({ email: 'a@b.fr', fullName: null, source: 'password' }),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm exec vitest run lib/auth/__tests__/waitlist.test.ts
```

Expected: FAIL — cannot resolve `@/lib/auth/waitlist`.

- [ ] **Step 3: Write the implementation**

Create `lib/auth/waitlist.ts`:

```ts
// lib/auth/waitlist.ts
// The signup gate, application side. ON THE ADMIN ALLOWLIST.
//
// signup_allowlist and signup_waitlist are both service-role only (no policies,
// no grants — see the migrations). They cannot be reached with a scoped RLS
// policy instead, because the caller on the password path is an anonymous
// visitor with no session at all: there is no auth.uid() to write a policy
// against. That is why this module is on the allowlist.
//
// Both helpers expect an ALREADY-NORMALIZED address (trimmed, lowercased) —
// both tables store lowercase, and set_initial_user_status() compares with
// lower(). Callers normalize once, at their edge.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWaitlistNotificationEmail } from '@/lib/email'

export type WaitlistSource = 'password' | 'google'

// Fails CLOSED. A transient lookup error means "not allowlisted", so the
// visitor lands on the waitlist — recoverable, and they can retry. Failing open
// would create the account this whole design exists to prevent.
export async function isSignupAllowlisted(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('signup_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (error) {
    // Never the address: this runs on an anonymous path with a stranger's email.
    console.error('[waitlist] allowlist lookup failed')
    return false
  }
  return !!data
}

// Idempotent: ON CONFLICT (email) DO NOTHING, so a second signup preserves the
// original created_at and shows the same message. Never throws — the caller has
// already decided what the visitor sees, and a failed insert must not turn a
// waitlist message into an error screen.
export async function recordWaitlistEntry(entry: {
  email: string
  fullName: string | null
  source: WaitlistSource
}): Promise<void> {
  const admin = createAdminClient()

  // ignoreDuplicates maps to ON CONFLICT DO NOTHING; with .select() a conflict
  // comes back as an empty array. That is how the notification stays
  // first-time-only without a second round-trip.
  const { data, error } = await admin
    .from('signup_waitlist')
    .upsert(
      { email: entry.email, full_name: entry.fullName, source: entry.source },
      { onConflict: 'email', ignoreDuplicates: true },
    )
    .select()

  if (error) {
    console.error('[waitlist] insert failed')
    return
  }
  if ((data ?? []).length === 0) return

  // Awaited, not fire-and-forget: a `void` call is dropped when the serverless
  // function freezes after the response — exactly when the alert matters.
  await sendWaitlistNotificationEmail({
    fullName: entry.fullName ?? '',
    email: entry.email,
    source: entry.source,
  })
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm exec vitest run lib/auth/__tests__/waitlist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Extend the service-role allowlist**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, add to the `ALLOWLIST` array (keep it sorted — the assertion compares sorted arrays):

```ts
  // The signup gate. Both signup_allowlist and signup_waitlist are zero-policy
  // tables, and the password path's caller is an anonymous visitor with no
  // auth.uid() to write a policy against — the service role is the only way in.
  'lib/auth/waitlist.ts',
```

Leave `app/admin/actions.ts` and `app/admin/page.tsx` in place for now; Task 7 removes them together with the files.

- [ ] **Step 6: Run the allowlist guard**

```bash
pnpm exec vitest run lib/supabase/__tests__/admin-allowlist.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add lib/auth/waitlist.ts lib/auth/__tests__/waitlist.test.ts lib/supabase/__tests__/admin-allowlist.test.ts
git commit -m "feat(auth): add the signup allowlist lookup and waitlist writer

One module for both signup paths. isSignupAllowlisted fails closed; the
waitlist insert is ON CONFLICT DO NOTHING and notifies only on a first row.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `requestOrganizerSignup` — the email/password funnel moves server-side

**Files:**
- Modify: `app/(auth)/signup/actions.ts`
- Modify: `app/(auth)/signup/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `isSignupAllowlisted`, `recordWaitlistEntry` (Task 3); `normalizeEmail`, `isValidEmail` from `@/lib/validation`; `checkRateLimit`, `clientIp` from `@/lib/rate-limit`; `createClient` from `@/lib/supabase/server`.
- Produces:
  ```ts
  export type RequestOrganizerSignupResult =
    | { ok: true; state: 'confirm' | 'waitlisted' }
    | { ok: false; error: 'invalid_name' | 'invalid_email' | 'rate_limited' | 'signup_failed'; message?: string }

  export async function requestOrganizerSignup(input: {
    fullName: string
    email: string
    password: string
  }): Promise<RequestOrganizerSignupResult>
  ```
  Task 5 renders each outcome.

**Context you need:**
`app/(auth)/signup/page.tsx:48` currently calls `supabase.auth.signUp()` **from the browser**. A client-side check cannot prevent an account from existing, so the submit moves behind this action. Two accepted tradeoffs, both settled in the spec: the password now transits our server (as it already does in `actions/settings-password.ts`, and it is never logged), and a waitlist screen is distinguishable from a confirm screen, so allowlist membership is probeable — the leak is « is this address one of Bjorn's testers », accepted.

Rate-limit shape copies the anonymous apply funnel (`actions/apply.ts:86-89`): per-IP, 10 per hour. Unlike the funnel's open tier this one fails **CLOSED**, because it fronts an unauthenticated write to a zero-policy table and a Supabase-side account creation.

A `'use server'` module may only export async functions — helpers must not be exported.

- [ ] **Step 1: Write the failing test**

Add to `app/(auth)/signup/__tests__/actions.test.ts`. Because the file already mocks `@/lib/supabase/server`, extend that mock rather than adding a second one; the whole file becomes:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type SignUpArg = {
  email: string
  password: string
  options: { data: Record<string, string>; emailRedirectTo: string }
}

let resendResult: { error: { message?: string } | null }
let signUpResult: { error: { message: string } | null }
const resend = vi.fn(async () => resendResult)
const signUp = vi.fn(async (_arg: SignUpArg) => signUpResult)
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { resend, signUp } }),
}))

let allowlisted = false
const isSignupAllowlisted = vi.fn(async (_email: string) => allowlisted)
const recordWaitlistEntry = vi.fn(async (_e: Record<string, unknown>) => {})
vi.mock('@/lib/auth/waitlist', () => ({
  isSignupAllowlisted: (e: string) => isSignupAllowlisted(e),
  recordWaitlistEntry: (e: Record<string, unknown>) => recordWaitlistEntry(e),
}))

let rateOutcome: 'allowed' | 'limited' | 'error' = 'allowed'
const checkRateLimit = vi.fn(async (_k: string, _l: number, _w: number) => rateOutcome)
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (k: string, l: number, w: number) => checkRateLimit(k, l, w),
  clientIp: async () => '203.0.113.9',
}))

import { resendSignupEmail, requestOrganizerSignup } from '@/app/(auth)/signup/actions'

beforeEach(() => {
  resend.mockClear()
  signUp.mockClear()
  isSignupAllowlisted.mockClear()
  recordWaitlistEntry.mockClear()
  checkRateLimit.mockClear()
  resendResult = { error: null }
  signUpResult = { error: null }
  allowlisted = false
  rateOutcome = 'allowed'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

// Signup confirmation itself is the one-click link in the email, verified by
// app/auth/confirm/route.ts (covered in app/__tests__/confirm.test.ts).
describe('resendSignupEmail', () => {
  it('resends the signup confirmation email', async () => {
    const res = await resendSignupEmail('a@b.com')
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' })
    expect(res).toEqual({ ok: true })
  })

  it('returns resend_failed on error', async () => {
    resendResult = { error: { message: 'rate limited' } }
    const res = await resendSignupEmail('a@b.com')
    expect(res).toEqual({ ok: false, error: 'resend_failed' })
  })
})

describe('requestOrganizerSignup', () => {
  const input = { fullName: 'Jane Doe', email: 'jane@example.com', password: 'supersecret' }

  it('creates the account for an allowlisted address', async () => {
    allowlisted = true
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: true, state: 'confirm' })
    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.password).toBe('supersecret')
    // toEqual, not toMatchObject: a leftover key would mean provisionOrganizer
    // is still being fed data nothing reads.
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(arg.options.emailRedirectTo).toBe('https://app.test/onboarding')
    expect(recordWaitlistEntry).not.toHaveBeenCalled()
  })

  // The property the whole design rests on: no auth user, no school, no users
  // row, no confirmation email for a stranger.
  it('waitlists a non-allowlisted address and never calls signUp', async () => {
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: true, state: 'waitlisted' })
    expect(signUp).not.toHaveBeenCalled()
    expect(recordWaitlistEntry).toHaveBeenCalledWith({
      email: 'jane@example.com', fullName: 'Jane Doe', source: 'password',
    })
  })

  it('is idempotent: a second attempt still reports waitlisted', async () => {
    await requestOrganizerSignup(input)
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: true, state: 'waitlisted' })
    expect(recordWaitlistEntry).toHaveBeenCalledTimes(2)
  })

  it('normalizes case and whitespace before consulting the allowlist', async () => {
    allowlisted = true
    await requestOrganizerSignup({ ...input, email: '  Jane@Example.COM  ', fullName: '  Jane Doe  ' })
    expect(isSignupAllowlisted).toHaveBeenCalledWith('jane@example.com')
    expect(signUp.mock.calls[0][0].email).toBe('jane@example.com')
    expect(signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Jane Doe' })
  })

  it('rejects an empty name without touching the allowlist', async () => {
    const res = await requestOrganizerSignup({ ...input, fullName: '   ' })
    expect(res).toEqual({ ok: false, error: 'invalid_name' })
    expect(isSignupAllowlisted).not.toHaveBeenCalled()
  })

  it('rejects a malformed address without touching the allowlist', async () => {
    const res = await requestOrganizerSignup({ ...input, email: 'a@b' })
    expect(res).toEqual({ ok: false, error: 'invalid_email' })
    expect(isSignupAllowlisted).not.toHaveBeenCalled()
  })

  it('caps attempts per source IP', async () => {
    rateOutcome = 'limited'
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: false, error: 'rate_limited' })
    expect(checkRateLimit).toHaveBeenCalledWith('signup:203.0.113.9', 10, 3600)
    expect(signUp).not.toHaveBeenCalled()
    expect(recordWaitlistEntry).not.toHaveBeenCalled()
  })

  // Fails CLOSED: this fronts an unauthenticated write to a zero-policy table
  // and a Supabase account creation. Losing the cap is worse than a refusal.
  it('refuses when the rate-limit check itself errors', async () => {
    rateOutcome = 'error'
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: false, error: 'rate_limited' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('passes a Supabase signUp failure back as a structured result', async () => {
    allowlisted = true
    signUpResult = { error: { message: 'User already registered' } }
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: false, error: 'signup_failed', message: 'User already registered' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm exec vitest run "app/(auth)/signup/__tests__/actions.test.ts"
```

Expected: FAIL — `requestOrganizerSignup is not a function`.

- [ ] **Step 3: Write the action**

Replace `app/(auth)/signup/actions.ts` entirely:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { isSignupAllowlisted, recordWaitlistEntry } from '@/lib/auth/waitlist'

export type ResendSignupResult = { ok: true } | { ok: false; error: 'resend_failed' }

// Re-sends the signup confirmation email (carrying a fresh confirmation link).
// Relies on Supabase's own rate limits plus the client-side cooldown on the page.
//
// Confirmation itself is a one-click link in that email, verified by
// app/auth/confirm/route.ts (verifyOtp → provisionOrganizer → /onboarding).
// There is no in-tab code step. Expected failures are structured returns, never
// thrown, so prod Server Action error redaction cannot swallow them.
export async function resendSignupEmail(email: string): Promise<ResendSignupResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { ok: false, error: 'resend_failed' }
  return { ok: true }
}

export type RequestOrganizerSignupResult =
  | { ok: true; state: 'confirm' | 'waitlisted' }
  | {
      ok: false
      error: 'invalid_name' | 'invalid_email' | 'rate_limited' | 'signup_failed'
      message?: string
    }

// THE signup gate, application side. Eazyexchange is not open to the public, so
// only an address on signup_allowlist may become an account; everyone else has
// their address captured on signup_waitlist and gets no auth user, no school,
// no users row and no confirmation email.
//
// This runs on the server, not in the browser, on purpose. The page used to
// call supabase.auth.signUp() directly (page.tsx:48) — a client-side check
// cannot PREVENT an account from existing, and "no account at all" is the whole
// property this design buys. The cost is that the password transits our server,
// as it already does in actions/settings-password.ts; it is never logged.
//
// Every outcome is a structured return, never a throw: production redacts
// thrown Server Action messages behind an opaque digest, so a thrown validation
// error would reach the user as nothing at all.
export async function requestOrganizerSignup(input: {
  fullName: string
  email: string
  password: string
}): Promise<RequestOrganizerSignupResult> {
  // Same validation the client used to do, relocated. The server is now the
  // only place it happens, so a tampered client gains nothing.
  const fullName = input.fullName.trim()
  const email = normalizeEmail(input.email)
  if (!fullName) return { ok: false, error: 'invalid_name' }
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' }

  // Unauthenticated, and it writes to a table with no policies — cap it by
  // source IP on the same tier as the anonymous apply funnel. Fails CLOSED:
  // losing the cap here means unmetered account creation and unmetered mail
  // from our sending domain.
  const ip = await clientIp()
  const rate = await checkRateLimit(`signup:${ip}`, 10, 3600)
  if (rate === 'error') {
    console.error('[rate-limit] signup check failed, BLOCKING request')
    return { ok: false, error: 'rate_limited' }
  }
  if (rate === 'limited') return { ok: false, error: 'rate_limited' }

  if (!(await isSignupAllowlisted(email))) {
    await recordWaitlistEntry({ email, fullName, source: 'password' })
    return { ok: true, state: 'waitlisted' }
  }

  // Full name is all provisionOrganizer reads. The establishment is captured at
  // /onboarding step 1, where it is validated against school_registry.
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
    },
  })
  // Supabase's own message ("User already registered", password-strength
  // complaints) is the useful one and reaches the user intact — a RETURNED
  // string is not subject to prod's thrown-error redaction.
  if (error) return { ok: false, error: 'signup_failed', message: error.message }

  return { ok: true, state: 'confirm' }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm exec vitest run "app/(auth)/signup/__tests__/actions.test.ts"
```

Expected: PASS, all 11 cases.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add "app/(auth)/signup/actions.ts" "app/(auth)/signup/__tests__/actions.test.ts"
git commit -m "feat(signup): gate account creation behind requestOrganizerSignup

The submit moves off the browser: a client-side allowlist check cannot stop
an account from existing. Non-allowlisted addresses get a waitlist row and no
auth user at all. IP-capped at 10/hour, failing closed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The signup page — three terminal states

**Files:**
- Modify: `app/(auth)/signup/page.tsx:1-13,17-61,82-119`
- Modify: `app/(auth)/__tests__/signup.test.tsx`
- Modify: `app/(auth)/signup/__tests__/page.order.test.tsx:6`

**Interfaces:**
- Consumes: `requestOrganizerSignup`, `RequestOrganizerSignupResult`, `resendSignupEmail` from `./actions`.
- Produces: a `/signup?waitlisted=1` entry point — Task 6's Google callback redirects there.

**Context you need:**
The page is a `'use client'` component. `?waitlisted=1` is read the way `app/(auth)/login/page.tsx:21-33` reads `?error=`: `new URLSearchParams(window.location.search)` inside a `useEffect`. Do **not** use `useSearchParams()` — it would force a `<Suspense>` boundary and make the page dynamic, and reading `window.location` during render would hydration-mismatch.

After this change the page no longer talks to Supabase at all, so `createClient`, `normalizeEmail` and `isValidEmail` come out of its imports — leaving them behind is a lint error.

- [ ] **Step 1: Write the failing test**

Replace `app/(auth)/__tests__/signup.test.tsx` entirely:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignupInput = { fullName: string; email: string; password: string }
type SignupResult =
  | { ok: true; state: 'confirm' | 'waitlisted' }
  | { ok: false; error: string; message?: string }

const { requestOrganizerSignup, resendSignupEmail } = vi.hoisted(() => ({
  requestOrganizerSignup: vi.fn(
    async (_i: SignupInput) => ({ ok: true, state: 'confirm' }) as SignupResult,
  ),
  resendSignupEmail: vi.fn(async (_email: string) => ({ ok: true as const })),
}))
vi.mock('@/app/(auth)/signup/actions', () => ({ requestOrganizerSignup, resendSignupEmail }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => {
  requestOrganizerSignup.mockClear()
  requestOrganizerSignup.mockResolvedValue({ ok: true, state: 'confirm' })
  resendSignupEmail.mockClear()
  window.history.replaceState({}, '', '/signup')
})

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
  await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
}

describe('SignupPage (French)', () => {
  // Creating an account asks for the three things an account needs. The
  // establishment is captured at /onboarding step 1, which validates it against
  // the registry. Asserting absence is the point — re-adding a field would
  // otherwise slip through every other test in this file.
  it('asks for the full name, e-mail and password only', () => {
    render(<SignupPage />)
    expect(screen.getByLabelText(/nom complet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/votre établissement/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/votre rôle/i)).not.toBeInTheDocument()
  })

  // The account is never created in the browser any more: a client-side
  // allowlist check cannot prevent an account from existing.
  it('submits through the server action, not the browser Supabase client', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)

    expect(requestOrganizerSignup).toHaveBeenCalledTimes(1)
    expect(requestOrganizerSignup.mock.calls[0][0]).toEqual({
      fullName: 'Jane Doe', email: 'jane@example.com', password: 'supersecret',
    })
    expect(await screen.findByText(/vérifiez votre e-mail/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
  })

  it('shows the waitlist message when the address is not allowlisted', async () => {
    requestOrganizerSignup.mockResolvedValue({ ok: true, state: 'waitlisted' })
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)

    expect(await screen.findByText(/liste d’attente/i)).toBeInTheDocument()
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
    // No session exists on this path, so no sign-out affordance.
    expect(screen.queryByRole('button', { name: /se déconnecter/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/vérifiez votre e-mail/i)).not.toBeInTheDocument()
  })

  // How the Google path comes back: app/auth/callback/route.ts tears the orphan
  // auth row down and redirects to /signup?waitlisted=1.
  it('opens straight into the waitlist message with ?waitlisted=1', async () => {
    window.history.replaceState({}, '', '/signup?waitlisted=1')
    render(<SignupPage />)
    expect(await screen.findByText(/liste d’attente/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /créer mon compte/i })).not.toBeInTheDocument()
  })

  it('renders each refusal in French', async () => {
    const cases: Array<[string, RegExp]> = [
      ['invalid_email', /adresse e-mail valide/i],
      ['invalid_name', /tous les champs/i],
      ['rate_limited', /trop de tentatives/i],
    ]
    for (const [error, copy] of cases) {
      requestOrganizerSignup.mockResolvedValue({ ok: false, error })
      const user = userEvent.setup()
      const { unmount } = render(<SignupPage />)
      await submit(user)
      expect(await screen.findByText(copy)).toBeInTheDocument()
      unmount()
    }
  })

  it('surfaces the Supabase message on a signup failure', async () => {
    requestOrganizerSignup.mockResolvedValue({
      ok: false, error: 'signup_failed', message: 'User already registered',
    })
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)
    expect(await screen.findByText(/user already registered/i)).toBeInTheDocument()
  })

  // Confirmation is one click on the link in the email (handled by
  // app/auth/confirm/route.ts) — there is no code to type.
  it('tells the user to click the confirmation button in the email, with no code input', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)
    expect(await screen.findByText(/confirmer mon inscription/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/code de confirmation/i)).not.toBeInTheDocument()
  })

  // The resend is rate-limited client-side on top of Supabase's own limits.
  it('holds the resend behind a countdown', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)

    const resend = await screen.findByRole('button', { name: /renvoyer l’e-mail \(\d+s\)/i })
    expect(resend).toBeDisabled()
    await user.click(resend)
    expect(resendSignupEmail).not.toHaveBeenCalled()
  })

  it('« Recommencer » returns to the signup form', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)
    await user.click(await screen.findByRole('button', { name: /recommencer/i }))
    expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm exec vitest run "app/(auth)/__tests__/signup.test.tsx"
```

Expected: FAIL — the page still calls the browser client, so `requestOrganizerSignup` is never called.

- [ ] **Step 3: Rewrite the page's imports, state and submit handler**

In `app/(auth)/signup/page.tsx`, replace lines 1-13 with:

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MailCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { requestOrganizerSignup, resendSignupEmail } from './actions'

const RESEND_COOLDOWN = 45
const SUPPORT_EMAIL = 'contact@eazyexchange.com'

// The page has three terminal states: the form, « Vérifiez votre e-mail » for an
// allowlisted address, and the waitlist message for everyone else. Validation
// and account creation both live in requestOrganizerSignup — the browser no
// longer talks to Supabase here at all, because a client-side check cannot
// prevent an account from existing.
type Step = 'form' | 'confirm' | 'waitlisted'
```

Replace the state block and `handleSignup` (lines 17-61) with:

```tsx
export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [resendError, setResendError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resendNote, setResendNote] = useState<string | null>(null)

  // How the Google path returns here: app/auth/callback/route.ts tears down the
  // orphan auth row and redirects to /signup?waitlisted=1. Read in an effect,
  // like /login reads ?error= — useSearchParams() would force a <Suspense>
  // boundary, and reading window.location during render would hydration-mismatch.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('waitlisted') === '1') {
      setStep('waitlisted')
    }
  }, [])

  useEffect(() => {
    if (step !== 'confirm') return
    const t = setInterval(() => setCooldown(c => (c <= 0 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [step])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await requestOrganizerSignup({ fullName, email, password })
    setLoading(false)
    if (!res.ok) {
      // Structured discriminants, not error.message parsing: prod redacts thrown
      // Server Action messages to an opaque digest.
      if (res.error === 'invalid_name') setError('Veuillez remplir tous les champs.')
      else if (res.error === 'invalid_email') setError('Veuillez saisir une adresse e-mail valide.')
      else if (res.error === 'rate_limited') {
        setError('Trop de tentatives depuis cette connexion. Réessayez dans une heure.')
      } else {
        setError(res.message ?? 'La création du compte a échoué. Réessayez dans un instant.')
      }
      return
    }
    if (res.state === 'waitlisted') { setStep('waitlisted'); return }
    setConfirmEmail(email.trim().toLowerCase())
    setCooldown(RESEND_COOLDOWN)
    setStep('confirm')
  }
```

Replace `handleRestart` (lines 75-80) so it returns to the form:

```tsx
  function handleRestart() {
    setStep('form')
    setResendError(null)
    setResendNote(null)
    setCooldown(0)
  }
```

- [ ] **Step 4: Add the waitlist screen and switch the confirm guard**

Replace `if (submitted) {` (line 82) with `if (step === 'confirm') {`, and insert this block immediately **before** it:

```tsx
  if (step === 'waitlisted') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
        <Logo href="/" />
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E7EDFD] text-[#2456E6]">
            <Clock className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
            Vous êtes sur la liste d’attente
          </h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Merci de votre intérêt. Eazyexchange n’est pas encore ouvert à tous : nous
            avons enregistré votre adresse et nous vous écrirons dès que l’accès sera
            disponible.
          </p>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Une question d’ici là ?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </AuthCard>
      </div>
    )
  }
```

- [ ] **Step 5: Update the page-order test's module mock**

`app/(auth)/signup/__tests__/page.order.test.tsx:6` mocks `../actions` with only `resendSignupEmail`; `vi.mock` replaces the whole module, so the page's other import would be `undefined`. Replace line 6 with:

```tsx
vi.mock('../actions', () => ({ resendSignupEmail: vi.fn(), requestOrganizerSignup: vi.fn() }))
```

The `@/lib/supabase/client` mock on line 4 is now unused by the signup page but is still needed by `LoginPage` in the same file — leave it.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm exec vitest run "app/(auth)"
```

Expected: PASS — `signup.test.tsx`, `page.order.test.tsx`, `login.test.tsx`, `signup/__tests__/actions.test.ts`.

- [ ] **Step 7: Lint and typecheck**

```bash
pnpm lint && pnpm exec tsc --noEmit
```

Expected: PASS. If lint reports an unused `createClient` / `normalizeEmail` / `isValidEmail` / `supabase` in `page.tsx`, delete them — the page no longer talks to Supabase.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add "app/(auth)/signup/page.tsx" "app/(auth)/__tests__/signup.test.tsx" "app/(auth)/signup/__tests__/page.order.test.tsx"
git commit -m "feat(signup): add the waitlist terminal state

Third state beside the form and « Vérifiez votre e-mail ». ?waitlisted=1
opens straight into it, which is how the Google path returns here.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Close the Google bypass

**Files:**
- Modify: `app/auth/callback/route.ts:1-8,55-77`
- Modify: `app/__tests__/callback.test.ts`

**Interfaces:**
- Consumes: `isSignupAllowlisted`, `recordWaitlistEntry` (Task 3).
- Produces: nothing new; `/signup?waitlisted=1` is consumed by Task 5.

**Context you need:**
Without this the Google button is a straight bypass of the entire gate — `intent=organizer_signup` goes directly to `provisionOrganizer`. The route already contains exactly the teardown this needs, for the `not_invited` case (lines 65-75): `signOut()` followed by `admin.auth.admin.deleteUser` wrapped in `withAuthAdminRetry`. A `bad_jwt` there leaves an orphan auth row that blocks the same person from ever signing up properly (`createUser` then returns `email_exists`), which is why the retry is not optional. Factor that teardown into one local helper so both branches share it.

- [ ] **Step 1: Write the failing test**

Add to `app/__tests__/callback.test.ts`. First extend the admin-client mock (lines 21-34) so `signup_allowlist` is reachable, and add the waitlist mock next to the `provisionOrganizer` one:

```ts
let allowlisted = false
const isSignupAllowlisted = vi.fn(async (_e: string) => allowlisted)
const recordWaitlistEntry = vi.fn(async (_e: Record<string, unknown>) => {})
vi.mock('@/lib/auth/waitlist', () => ({
  isSignupAllowlisted: (e: string) => isSignupAllowlisted(e),
  recordWaitlistEntry: (e: Record<string, unknown>) => recordWaitlistEntry(e),
}))
```

Add to `beforeEach`:

```ts
  allowlisted = false
  isSignupAllowlisted.mockClear()
  recordWaitlistEntry.mockClear()
```

Then add this describe block:

```ts
describe('GET /auth/callback — the organizer_signup allowlist gate', () => {
  it('provisions an allowlisted Google signup, as before', async () => {
    allowlisted = true
    exchangeResult = {
      data: { user: { id: 'g1', email: 'Owner@Example.com', user_metadata: { name: 'G Owner' } } },
      error: null,
    }
    const dest = await getRedirect('code=abc&intent=organizer_signup')
    expect(isSignupAllowlisted).toHaveBeenCalledWith('owner@example.com')
    expect(provisionOrganizer).toHaveBeenCalledTimes(1)
    expect(recordWaitlistEntry).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
    expect(dest).toBe('/dashboard')
  })

  // Without this the Google button is a straight bypass of the whole gate.
  it('waitlists a non-allowlisted Google signup and leaves no orphan auth row', async () => {
    exchangeResult = {
      data: { user: { id: 'g2', email: 'Stranger@Example.com', user_metadata: { name: 'A Stranger' } } },
      error: null,
    }
    const dest = await getRedirect('code=abc&intent=organizer_signup')
    expect(recordWaitlistEntry).toHaveBeenCalledWith({
      email: 'stranger@example.com', fullName: 'A Stranger', source: 'google',
    })
    expect(provisionOrganizer).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(deleteUser).toHaveBeenCalledWith('g2')
    expect(dest).toBe('/signup?waitlisted=1')
  })

  it('records a null name when Google supplied none', async () => {
    exchangeResult = {
      data: { user: { id: 'g3', email: 'noname@example.com', user_metadata: {} } },
      error: null,
    }
    await getRedirect('code=abc&intent=organizer_signup')
    expect(recordWaitlistEntry).toHaveBeenCalledWith({
      email: 'noname@example.com', fullName: null, source: 'google',
    })
  })

  // The waitlist row must be written BEFORE the session is dropped — the
  // teardown is what makes the address unrecoverable afterwards.
  it('writes the waitlist row before tearing the session down', async () => {
    const order: string[] = []
    recordWaitlistEntry.mockImplementationOnce(async () => { order.push('waitlist') })
    signOut.mockImplementationOnce(async () => { order.push('signOut'); return { error: null } })
    exchangeResult = {
      data: { user: { id: 'g4', email: 'order@example.com', user_metadata: { name: 'O' } } },
      error: null,
    }
    await getRedirect('code=abc&intent=organizer_signup')
    expect(order).toEqual(['waitlist', 'signOut'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm exec vitest run app/__tests__/callback.test.ts
```

Expected: FAIL — the non-allowlisted case still calls `provisionOrganizer` and redirects to `/dashboard`.

- [ ] **Step 3: Update the route**

Add to the imports at the top of `app/auth/callback/route.ts`:

```ts
import { isSignupAllowlisted, recordWaitlistEntry } from '@/lib/auth/waitlist'
```

Replace lines 55-77 (from the `// No profile` comment to the end of the function) with:

```ts
  // No profile — a brand-new Google user.
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const googleName =
    (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta?.name === 'string' && meta.name.trim()) || ''
  const email = (user.email ?? '').trim().toLowerCase()

  // Drops the session and deletes the orphan auth row Google just created.
  // Retried: a bad_jwt here leaves an orphan that blocks the same person from
  // ever being invited or signing up properly (createUser then returns
  // email_exists). See lib/supabase/admin-retry.ts.
  async function dropOrphanUser(): Promise<void> {
    await supabase.auth.signOut()
    const { error: deleteError } = await withAuthAdminRetry(
      () => admin.auth.admin.deleteUser(user.id),
      'auth/callback.deleteOrphanUser',
    ).catch((e) => ({ error: e as { code?: string } }))
    if (deleteError) {
      console.error('[auth/callback] deleteUser failed:', deleteError?.code ?? 'unknown')
    }
  }

  if (intent === 'organizer_signup') {
    // The same gate requestOrganizerSignup applies to the password funnel.
    // Without it the Google button bypasses the entire signup gate: it would
    // land straight in provisionOrganizer and create the account.
    if (!(await isSignupAllowlisted(email))) {
      // Written BEFORE the teardown — afterwards the address is gone.
      await recordWaitlistEntry({ email, fullName: googleName || null, source: 'google' })
      await dropOrphanUser()
      return redirect('/signup?waitlisted=1')
    }
    const result = await provisionOrganizer(user)
    if (!result.ok) return redirect('/login?error=signup_failed')
    return redirect('/dashboard')
  }

  // Uninvited student / stranger — enforce invite-only.
  await dropOrphanUser()
  return redirect('/login?error=not_invited')
}
```

The student-name backfill above (lines 43-51) already computes a `googleName` locally; leave that block as it is — the two are in different branches and merging them would tangle the profile path with the no-profile path.

> If the existing block at lines 43-51 now shadows the new outer `googleName`/`meta` names and TypeScript complains, rename the inner ones to `profileMeta` / `profileGoogleName` rather than hoisting the outer pair above the `if (profile)` branch — the profile path must not pay for the signup path's work.

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm exec vitest run app/__tests__/callback.test.ts
```

Expected: PASS — the four new cases plus every pre-existing one.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add app/auth/callback/route.ts app/__tests__/callback.test.ts
git commit -m "fix(auth): apply the signup allowlist to the Google path

intent=organizer_signup went straight to provisionOrganizer, bypassing the
whole gate. Non-allowlisted now records a waitlist entry, reuses the existing
retried teardown, and returns to /signup?waitlisted=1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Delete `/admin`, rewrite `/pending`, fix the crawl surface

**Files:**
- Delete: `app/admin/page.tsx`, `app/admin/actions.ts`, `app/admin/__tests__/actions.test.ts`, `lib/auth/admin.ts`, `lib/auth/__tests__/admin.test.ts`
- Modify: `app/robots.ts:34`
- Modify: `app/pending/page.tsx:9-13,21-53`
- Modify: `app/__tests__/pending.test.tsx`
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts:17-20`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `isPlatformAdmin` disappears; `ADMIN_EMAILS` stays, read directly by `lib/email.ts:367`.

**Context you need:**
`isPlatformAdmin` has exactly one consumer, `/admin`; every other reference to `ADMIN_EMAILS` reads the env var directly (`lib/email.ts:367`, `playwright.config.ts:30`). Verify with grep before deleting.

`/pending` stays as the terminal page for the one legacy `pending` row in production. It is deliberately **not** in `proxy.ts`'s `isAuthRoute` list (see `proxy.ts:14-18`): including it would redirect `/pending` to itself.

`app/__tests__/seo-crawl-surface.test.ts` derives the segment list from the filesystem and asserts every non-public segment is disallowed. It catches a mismatch in **either** direction, so it fails today if `/admin` is deleted without touching `robots.ts` — that is the test that proves this step.

- [ ] **Step 1: Confirm `isPlatformAdmin` really has one consumer**

```bash
grep -rn "isPlatformAdmin" --include=*.ts --include=*.tsx . | grep -v node_modules
grep -rn "ADMIN_EMAILS" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Expected: `isPlatformAdmin` appears only in `lib/auth/admin.ts`, its test, `app/admin/page.tsx` and `app/admin/actions.ts`. `ADMIN_EMAILS` additionally appears in `lib/email.ts:367` and `playwright.config.ts:30` — both read the env var directly and both stay. If anything else turns up, stop and report rather than deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm -r app/admin lib/auth/admin.ts lib/auth/__tests__/admin.test.ts
```

- [ ] **Step 3: Run the crawl-surface test to verify it fails**

```bash
pnpm exec vitest run app/__tests__/seo-crawl-surface.test.ts
```

Expected: FAIL — `robots.ts` still disallows `/admin`, and the sitemap/segment cross-check no longer finds the segment. (If it passes, the test's direction check has regressed — say so before continuing.)

- [ ] **Step 4: Drop `/admin` from robots.ts**

Delete line 34 of `app/robots.ts` (`'/admin',`). The `/pending` entry on the following line stays — the page is still reachable.

- [ ] **Step 5: Run it to verify it passes**

```bash
pnpm exec vitest run app/__tests__/seo-crawl-surface.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write the failing /pending copy test**

In `app/__tests__/pending.test.tsx`, replace the first two cases with:

```tsx
  // /pending survives the waitlist change as the terminal page for the one
  // legacy `pending` row in production. Nobody is reviewing a queue any more,
  // so the copy no longer promises one.
  it('tells a pending organizer their access is not open yet, with no promise of a review', async () => {
    getProfile.mockResolvedValue({ status: 'pending', role: 'organizer' })
    render(await PendingPage())
    expect(screen.getByText(/pas encore ouvert/i)).toBeInTheDocument()
    expect(screen.queryByText(/en cours d’examen/i)).not.toBeInTheDocument()
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
  })

  it('tells a rejected organizer plainly, with a contact address', async () => {
    getProfile.mockResolvedValue({ status: 'rejected', role: 'organizer' })
    render(await PendingPage())
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
  })
```

Leave the sign-out and redirect cases exactly as they are — an account on `/pending` does have a session, so the sign-out escape hatch is still the only way to switch accounts.

- [ ] **Step 7: Run it to verify it fails**

```bash
pnpm exec vitest run app/__tests__/pending.test.tsx
```

Expected: FAIL — the page still says « Votre demande est en cours d’examen ».

- [ ] **Step 8: Rewrite the /pending copy**

In `app/pending/page.tsx`, replace the block comment (lines 9-13) and the rendered body (lines 21-53) with:

```tsx
// Terminal page for an account that is not approved. Since the 2026-07-30
// waitlist change no NEW account can land here — the gate moved to
// signup_allowlist, checked before an account exists — so this serves the
// legacy rows that predate it, and any account someone sets to 'rejected' by
// hand. Deliberately NOT in proxy.ts's isAuthRoute list: that branch redirects
// non-approved users to /pending, so including this route would redirect
// /pending to itself — an infinite loop and a blank tab.
export default async function PendingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.status === 'approved') {
    redirect(profile.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          Accès pas encore ouvert
        </h3>
        <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
          Eazyexchange n’est pas encore ouvert à tous. Votre adresse est enregistrée
          et nous vous écrirons dès que l’accès sera disponible.
        </p>
        <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
          Une question d’ici là ?{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <SignOutLink />
      </AuthCard>
    </div>
  )
}
```

The `rejected` branch collapses into the single message: the waitlist copy is truthful for both states, and there is no longer a review process for a « refusé » verdict to be the outcome of. Delete the now-unused `const rejected = …` line.

- [ ] **Step 9: Trim the admin-client allowlist**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, delete these three lines (17-20) — the comment and both entries:

```ts
  // Review queue for the manual signup approval gate: writes users.status and
  // reviewed_at, which have no grant for the authenticated role by design.
  'app/admin/actions.ts',
  'app/admin/page.tsx',
```

- [ ] **Step 10: Run the affected tests**

```bash
pnpm exec vitest run app/__tests__/pending.test.tsx app/__tests__/seo-crawl-surface.test.ts lib/supabase/__tests__/admin-allowlist.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run the whole unit suite and the build**

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test
```

Expected: PASS. A dangling import of `@/lib/auth/admin` or `./actions` from a deleted file surfaces here.

- [ ] **Step 12: Commit**

```bash
git branch --show-current
git add -u app/robots.ts app/pending/page.tsx app/__tests__/pending.test.tsx lib/supabase/__tests__/admin-allowlist.test.ts
git status --short   # confirm only the intended paths are staged
git commit -m "feat: remove the /admin approval queue

The review queue is what the waitlist replaces. isPlatformAdmin had exactly
one consumer, so lib/auth/admin.ts goes with it; ADMIN_EMAILS stays, read
directly by lib/email.ts. /pending survives for the legacy pending row, with
copy that no longer promises a review.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `pnpm reset-account <email>`

**Files:**
- Create: `scripts/reset-account.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `scripts/lib/local-target.mjs` (`LOCAL_API_URL`, `LOCAL_SERVICE_KEY`, `isLocalSupabaseUrl`).
- Produces: `pnpm reset-account <email> [--yes]`.

**Context you need:**
Running the signup cycle repeatedly requires deleting the previous account, and `public.users` is the target of four `NO ACTION` foreign keys, so this is not a one-click dashboard delete.

**The FK graph, verified against the live production schema on 2026-07-30** (not guessed — re-verify if the schema has moved):

`NO ACTION` blockers:
- on `schools`: `applications.school_id`, `exchanges.school_a_id`, `exchanges.school_b_id`, `form_templates.school_id`, `users.school_id`
- on `users`: `applications.reviewer_id`, `form_templates.created_by`, `organizer_invites.invited_by`, `submissions.reviewer_id`

Everything else clears itself: `assignments.student_id`, `exchange_enrollments.user_id`, `feedback.user_id`, `feedback.school_id`, `application_custom_questions.school_id`, `organizer_invites.school_id` are `CASCADE`; `email_send_log.school_id`, `applications.enrolled_user_id`, `communication_events.actor_id` are `SET NULL`.

> `organizer_invites` appears in the spec's blocker list but was omitted from its one-line order sketch. It must be deleted before `users`, because `invited_by` is `NO ACTION`.

Storage paths, confirmed against `information_schema` and `storage.buckets` (three private buckets: `documents`, `application-photos`, `form-templates`):
- `documents` ← `document_uploads.storage_path` and `submissions.generated_pdf_path`
- `application-photos` ← `applications.photo_path`
- `form-templates` ← `form_templates.template_file_path`

**The invariant `lib/retention/erase.ts` documents applies here too: delete storage objects BEFORE the DB rows.** Deleting a `storage.objects` row via SQL does not remove the S3 bytes — only the Storage API does — and once the DB rows are gone the paths are lost.

Unlike `pnpm seed`, this does **not** hard-refuse production: guard 1 (target must be on `signup_allowlist`) is what makes that acceptable. `withAuthAdminRetry` lives in TypeScript under `lib/` and cannot be imported from a `.mjs` script, so the retry is reimplemented locally — `bad_jwt` only. **A bare 403 is Cloudflare's block and must never be retried.**

- [ ] **Step 1: Write the script**

Create `scripts/reset-account.mjs`:

```js
#!/usr/bin/env node
/**
 * `pnpm reset-account <email> [--yes]` — delete an account and everything it
 * owns, so the signup → onboarding → walkthrough cycle can be run again.
 *
 * public.users is the target of four ON DELETE NO ACTION foreign keys and
 * schools of five more, so this is not a dashboard click. The order below is
 * derived from the live FK graph (verified 2026-07-30), not guessed: a missed
 * NO ACTION child turns this into a half-delete that leaves the account both
 * unusable AND undeletable.
 *
 * Unlike `pnpm seed`, this does NOT refuse production — guard 1 is what makes
 * that safe. It resolves its target from the environment, so it points at the
 * local stack by default and at prod only if .env.prod is deliberately sourced:
 *
 *   node scripts/reset-account.mjs me@example.com --yes                  # local
 *   set -a; source .env.prod; set +a; node scripts/reset-account.mjs …   # prod
 */
import { createClient } from '@supabase/supabase-js'
import { LOCAL_API_URL, LOCAL_SERVICE_KEY, isLocalSupabaseUrl } from './lib/local-target.mjs'

const argv = process.argv.slice(2)
const yes = argv.includes('--yes')
const email = (argv.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase()

const die = (...lines) => {
  process.stderr.write(`\n  ✗ ${lines.join('\n    ')}\n\n`)
  process.exit(1)
}

if (!email) die('Usage: pnpm reset-account <email> [--yes]')

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const url = !envUrl || isLocalSupabaseUrl(envUrl) ? (envUrl ?? LOCAL_API_URL) : envUrl
const serviceKey = isLocalSupabaseUrl(url)
  ? (process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_KEY)
  : process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) die(`No SUPABASE_SERVICE_ROLE_KEY for ${url}.`)

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// lib/supabase/admin-retry.ts is TypeScript and cannot be imported here, so the
// same policy is restated: retry ONLY bad_jwt. Supabase's sb_secret_ keys fail
// ~20% of auth-admin calls that way, and an unretried failure leaves an orphan
// auth row — which makes the NEXT signup fail with email_exists, exactly the
// loop this script exists to escape. A bare 403 is Cloudflare's block, not a
// transient auth fault, and must never be retried.
// See docs/security/supabase-secret-key-bad-jwt.md.
async function withAuthAdminRetry(fn, label, attempts = 4) {
  for (let i = 1; ; i++) {
    const res = await fn()
    if (!res?.error || res.error.code !== 'bad_jwt' || i >= attempts) return res
    process.stdout.write(`    ↻ ${label}: bad_jwt, retry ${i}/${attempts - 1}\n`)
    await new Promise((r) => setTimeout(r, 150 * i))
  }
}

const must = (label) => ({ error }) => {
  if (error) die(`${label}: ${error.message}`)
}
const ids = (rows, key = 'id') => (rows ?? []).map((r) => r[key])
const paths = (rows, key) => (rows ?? []).map((r) => r[key]).filter(Boolean)

// --- resolve the target ------------------------------------------------------

const { data: target, error: targetError } = await db
  .from('users').select('id, school_id, role').eq('email', email).maybeSingle()
if (targetError) die(`Lookup failed: ${targetError.message}`)
if (!target) die(`No account for ${email} on ${url}.`)

const { data: members, error: membersError } = await db
  .from('users').select('id, email').eq('school_id', target.school_id)
if (membersError) die(`Member lookup failed: ${membersError.message}`)

// --- guards, all checked before anything is deleted --------------------------

// 1. Structurally impossible to delete a real customer: only an address the
//    owner has deliberately allowlisted can be reset.
const { data: allow, error: allowError } = await db
  .from('signup_allowlist').select('email').eq('email', email).maybeSingle()
if (allowError) die(`Allowlist lookup failed: ${allowError.message}`)
if (!allow) {
  die(
    `${email} is not on signup_allowlist.`,
    'This script only resets accounts you have deliberately allowlisted.',
  )
}

// 2. Refuse to nuke a co-owned school out from under a colleague.
const { data: allowedRows, error: allowedError } = await db
  .from('signup_allowlist').select('email').in('email', members.map((m) => m.email))
if (allowedError) die(`Allowlist lookup failed: ${allowedError.message}`)
const allowed = new Set((allowedRows ?? []).map((r) => r.email))
const strangers = members.filter((m) => !allowed.has(m.email))
if (strangers.length > 0) {
  die(
    `The school has ${strangers.length} member(s) who are not allowlisted.`,
    'Refusing to delete a school someone else also belongs to.',
  )
}

// --- gather everything, storage paths included -------------------------------

const memberIds = ids(members)

const { data: apps } = await db
  .from('applications').select('id, photo_path').eq('school_id', target.school_id)
const { data: templates } = await db
  .from('form_templates').select('id, template_file_path').eq('school_id', target.school_id)
const { data: assignments } = await db
  .from('assignments').select('id').in('student_id', memberIds)
const assignmentIds = ids(assignments)
const { data: submissions } = assignmentIds.length
  ? await db.from('submissions').select('id, generated_pdf_path').in('assignment_id', assignmentIds)
  : { data: [] }
const submissionIds = ids(submissions)
const { data: uploads } = submissionIds.length
  ? await db.from('document_uploads').select('storage_path').in('submission_id', submissionIds)
  : { data: [] }

const documentPaths = [...paths(uploads, 'storage_path'), ...paths(submissions, 'generated_pdf_path')]
const photoPaths = paths(apps, 'photo_path')
const templatePaths = paths(templates, 'template_file_path')

process.stdout.write(
  `\n  Target       ${email} (${target.role}) on ${url}\n` +
    `  School       ${target.school_id} — ${members.length} member(s)\n` +
    `  Applications ${(apps ?? []).length}\n` +
    `  Templates    ${(templates ?? []).length}\n` +
    `  Assignments  ${assignmentIds.length}\n` +
    `  Submissions  ${submissionIds.length}\n` +
    `  Storage      ${documentPaths.length} document(s), ${photoPaths.length} photo(s), ` +
    `${templatePaths.length} template file(s)\n\n`,
)

if (!yes) {
  process.stdout.write('  Nothing deleted. Re-run with --yes to proceed.\n\n')
  process.exit(0)
}

// --- teardown ----------------------------------------------------------------

// Storage BEFORE the DB rows: deleting a storage.objects row via SQL does not
// remove the S3 bytes (only the Storage API does), and once the DB rows are
// gone the paths are lost. Same invariant as lib/retention/erase.ts. Without
// this every reset cycle silently accumulates the previous run's files.
for (const [bucket, list] of [
  ['documents', documentPaths],
  ['application-photos', photoPaths],
  ['form-templates', templatePaths],
]) {
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(list.slice(i, i + 100))
    if (error) die(`storage ${bucket}: ${error.message}`)
  }
}

// FK-derived order. Each step clears a NO ACTION reference the next one needs
// gone; everything not named here is CASCADE or SET NULL.
if ((apps ?? []).length) {
  must('applications')(await db.from('applications').delete().eq('school_id', target.school_id))
}
if (submissionIds.length) {
  must('submissions')(await db.from('submissions').delete().in('id', submissionIds))
}
if (assignmentIds.length) {
  must('assignments')(await db.from('assignments').delete().in('id', assignmentIds))
}
must('form_templates')(await db.from('form_templates').delete().eq('school_id', target.school_id))
must('exchanges a')(await db.from('exchanges').delete().eq('school_a_id', target.school_id))
must('exchanges b')(await db.from('exchanges').delete().eq('school_b_id', target.school_id))
must('organizer_invites')(await db.from('organizer_invites').delete().eq('school_id', target.school_id))
must('users')(await db.from('users').delete().eq('school_id', target.school_id))
must('schools')(await db.from('schools').delete().eq('id', target.school_id))

// So the next cycle starts clean: a leftover waitlist row is harmless but
// misleading when reading the table.
must('signup_waitlist')(await db.from('signup_waitlist').delete().in('email', members.map((m) => m.email)))

for (const m of members) {
  const { error } = await withAuthAdminRetry(
    () => db.auth.admin.deleteUser(m.id),
    'deleteUser',
  )
  if (error) die(`auth delete failed: ${error.message ?? error.code ?? 'unknown'}`)
}

process.stdout.write(`  ✓ ${email} and ${members.length} account(s) removed. Sign up again at /signup.\n\n`)
```

- [ ] **Step 2: Register the script**

In `package.json`, add after the `"seed:staging"` line:

```json
    "reset-account": "node scripts/reset-account.mjs",
```

- [ ] **Step 3: Verify the guards refuse a non-allowlisted account**

Against the local seeded stack (`pnpm dev` in another terminal, or `supabase start` + `pnpm seed`):

```bash
pnpm reset-account orga@seed.example.com
```

Expected: exits non-zero with `orga@seed.example.com is not on signup_allowlist.` and deletes nothing. Confirm with:

```bash
pnpm exec node -e "
const {createClient}=require('@supabase/supabase-js');
const {LOCAL_API_URL,LOCAL_SERVICE_KEY}=require('./scripts/lib/local-target.mjs');
" 2>/dev/null || true
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select count(*) from users where email = 'orga@seed.example.com';"
```

Expected: `1` — still there.

- [ ] **Step 4: Verify the dry run and the real teardown on a throwaway account**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "insert into signup_allowlist (email, note) values ('reset-probe@seed.example.com','manual test') on conflict do nothing;"
```

Sign up at `http://localhost:<your .wtport>/signup` as `reset-probe@seed.example.com`, confirm through Mailpit (`http://127.0.0.1:54324`), then:

```bash
pnpm reset-account reset-probe@seed.example.com          # prints counts, deletes nothing
pnpm reset-account reset-probe@seed.example.com --yes    # deletes
```

Expected: the dry run prints a School line with `1 member(s)` and ends with « Nothing deleted »; the `--yes` run ends with `✓ … removed`. Then verify the account is gone **including its auth row** — an orphan auth row is the exact failure this script exists to prevent:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "select (select count(*) from users where email='reset-probe@seed.example.com') as profile,
          (select count(*) from auth.users where email='reset-probe@seed.example.com') as auth_row;"
```

Expected: `0 | 0`. Signing up again with the same address must now work (no `email_exists`).

- [ ] **Step 5: Lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add scripts/reset-account.mjs package.json
git commit -m "feat(scripts): add pnpm reset-account for repeatable signup cycles

FK-ordered teardown derived from the live graph, storage purged before the DB
rows, auth deletion retried on bad_jwt. Two guards make it safe on prod: the
target must be on signup_allowlist, and so must every other school member.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Seed an allowlisted address and rewrite the smoke specs

**Files:**
- Modify: `scripts/seed-cast.mjs`
- Modify: `scripts/seed-demo.mjs:123-143` (wipe) and the build section
- Modify: `tests/smoke/helpers/reset.ts:66-92`
- Modify: `tests/smoke/signup.spec.ts`

**Interfaces:**
- Consumes: `SEED_DOMAIN`, `adminDb()` from `tests/smoke/helpers`.
- Produces: `ALLOWLISTED_SIGNUP` exported from `scripts/seed-cast.mjs`; a matching `signup_allowlist` row created by `pnpm seed`.

**Context you need:**
`tests/smoke/signup.spec.ts` currently asserts that a new organizer lands on `/pending`. That assertion becomes false by design.

Assertions must be **positive**. A thrown Next page returns HTTP 200 with an empty shell, so « did not land on /pending » would pass on a crash.

The address is `smoke-signup-allowlisted@seed.example.com` — deliberately under the `smoke-signup-%` prefix that `resetSignupCruft()` already sweeps, so each run starts from no account. Its `signup_allowlist` row is created by the seed, and `wipe()` must not delete it (the seed re-inserts it anyway, on conflict do nothing).

- [ ] **Step 1: Export the address from the cast**

Append to `scripts/seed-cast.mjs`:

```js
// The address tests/smoke/signup.spec.ts signs up with to exercise the
// allowlisted path. seed-demo.mjs inserts the matching signup_allowlist row —
// without it the spec would waitlist and the confirm flow would never run.
// Deliberately under the `smoke-signup-` prefix so resetSignupCruft() sweeps
// the account it creates, leaving each run a clean slate.
export const ALLOWLISTED_SIGNUP = 'smoke-signup-allowlisted@seed.example.com'
```

- [ ] **Step 2: Seed the allowlist row and clear stale waitlist rows**

In `scripts/seed-demo.mjs`, add `ALLOWLISTED_SIGNUP` to the import on line 26.

Inside `wipe()`, after the auth-user loop (line 137) and before the school delete, add:

```js
  // Signup funnel debris from a previous smoke run. The allowlist row itself is
  // NOT deleted — it is re-inserted below on conflict-do-nothing, and dropping
  // it mid-run would waitlist a spec that is mid-flight in another worktree.
  const { error: wlError } = await db
    .from('signup_waitlist').delete().like('email', `%@${SEED_DOMAIN}`)
  if (wlError) throw new Error(`wipe signup_waitlist: ${wlError.message}`)
```

After `await wipe()` (line 216), add:

```js
// The one address allowed to complete a real signup in the smoke suite. Every
// other address the suite tries must be waitlisted, which is the point.
const { error: allowError } = await db
  .from('signup_allowlist')
  .upsert({ email: ALLOWLISTED_SIGNUP, note: 'smoke suite — allowlisted signup path' },
          { onConflict: 'email', ignoreDuplicates: true })
if (allowError) throw new Error(`seed signup_allowlist: ${allowError.message}`)
```

- [ ] **Step 3: Extend the smoke reset helper**

In `tests/smoke/helpers/reset.ts`, extend `resetSignupCruft()` — the existing body stays, add this to the end of the function:

```ts
  // Waitlist rows and the per-IP signup counter. requestOrganizerSignup caps a
  // source IP at 10 signups per hour and fails CLOSED, so without this the
  // eleventh `pnpm ship` in an hour would fail for a reason that is not a bug.
  const { error: wlErr } = await db
    .from('signup_waitlist').delete().like('email', `%@${SEED_DOMAIN}`)
  if (wlErr) throw new Error(`reset signup waitlist: ${wlErr.message}`)
  const { error: rlErr } = await db.from('rate_limits').delete().like('key', 'signup:%')
  if (rlErr) throw new Error(`reset signup rate limits: ${rlErr.message}`)
```

- [ ] **Step 4: Rewrite the smoke specs**

Replace `tests/smoke/signup.spec.ts` entirely:

```ts
import { test, expect } from '@playwright/test'
import { resetSignupCruft } from './helpers/reset'
import { adminDb } from './helpers/db'
import { waitForMessage, confirmPathFrom } from './helpers/mailpit'
import { SEED_DOMAIN } from './helpers/manifest'
import { ALLOWLISTED_SIGNUP } from '../../scripts/seed-cast.mjs'

// Eazyexchange is not open to the public: signup_allowlist decides, at signup
// time, who may have an account at all. These two specs are the two sides of
// that gate.
//
// Every assertion is POSITIVE on purpose. A thrown Next page returns HTTP 200
// with an empty shell, so "did not land on /pending" would pass on a crash.

test('a stranger is waitlisted and no account is created', async ({ page }) => {
  await resetSignupCruft()
  // @seed.example.com so `pnpm dev --reseed` sweeps up anything left behind.
  const email = `smoke-signup-${Date.now().toString(36)}@${SEED_DOMAIN}`

  const res = await page.goto('/signup')
  expect(res?.status()).toBe(200)
  await page.locator('#fullName').fill('Smoke Inconnu')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('smoke-password-2026')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByText(/liste d’attente/i)).toBeVisible({ timeout: 20_000 })

  const db = adminDb()
  const { data: row } = await db
    .from('signup_waitlist').select('email, source').eq('email', email).maybeSingle()
  expect(row).toMatchObject({ email, source: 'password' })

  // THE property the whole design buys: no auth user, therefore no school and
  // no users row either.
  const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  expect(authList.users.some((u) => u.email === email)).toBe(false)

  const { data: profile } = await db
    .from('users').select('id').eq('email', email).maybeSingle()
  expect(profile).toBeNull()
})

// The cycle the owner runs by hand repeatedly — worth having a robot check it.
//
// Known limitation (see the spec): this reads the LOCAL template
// (supabase/templates/confirmation.html), a committed copy of production's. It
// proves the application's wiring; it does not prove production's template.
test('an allowlisted address signs up, confirms by mail and reaches onboarding', async ({ page }) => {
  await resetSignupCruft()

  const res = await page.goto('/signup')
  expect(res?.status()).toBe(200)
  await page.locator('#fullName').fill('Smoke Organisateur')
  await page.locator('#email').fill(ALLOWLISTED_SIGNUP)
  await page.locator('#password').fill('smoke-password-2026')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByText('Vérifiez votre e-mail')).toBeVisible({ timeout: 20_000 })

  const mail = await waitForMessage(ALLOWLISTED_SIGNUP)
  const confirmPath = confirmPathFrom(mail.html)
  // The shape assertion is the load-bearing one: a template that reverts to
  // {{ .ConfirmationURL }} bypasses app/auth/confirm/route.ts entirely.
  expect(confirmPath).toContain('token_hash=')
  expect(confirmPath).toContain('type=signup')

  // {{ .SiteURL }} is pinned to :3000 in supabase/config.toml while this suite
  // serves on the worktree's port, so the link is re-issued against the server
  // under test. Everything that matters — the route, the token, the OTP
  // verification, the provisioning — is the real thing.
  await page.goto(confirmPath)
  // Allowlisted means set_initial_user_status() approves on insert, so there is
  // no /pending stop: the account goes straight to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 })
  await expect(page.getByText(/établissement/i).first()).toBeVisible()
})
```

- [ ] **Step 5: Reseed and run the smoke suite**

```bash
pnpm dev --reseed   # in another terminal; leave it running
pnpm exec playwright test tests/smoke/signup.spec.ts
```

Expected: PASS, both specs. If the allowlisted spec waitlists instead, the seed's `signup_allowlist` insert did not run — reseed.

- [ ] **Step 6: Run the whole smoke suite**

```bash
pnpm exec playwright test
```

Expected: PASS — `apply.spec.ts`, `portals.spec.ts`, `round-trip.spec.ts`, `signup.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add scripts/seed-cast.mjs scripts/seed-demo.mjs tests/smoke/helpers/reset.ts tests/smoke/signup.spec.ts
git commit -m "test(smoke): cover both sides of the signup allowlist

A stranger is waitlisted with no auth user created; the seeded allowlisted
address completes signup and reaches /onboarding with no /pending stop.
Assertions are positive — a thrown page returns 200 with an empty shell.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentation, the full gate, and the rollout

**Files:**
- Modify: `CLAUDE.md` (« Signup is open but gated » bullet)
- Modify: `types/supabase.ts` (regenerated against prod after the apply)

**Interfaces:**
- Consumes: everything above.
- Produces: the merged, deployed change.

**Context you need:**
Every migration goes to **staging first**, then production via MCP `apply_migration` — never `supabase db push` against prod. If the prod ledger stamps a version different from the filename, `git mv` the local file to the stamped version **and** update the staging ledger to match (see `reference_supabase_staging_ledger_drift`). `db push` may need `--include-all` for out-of-order files, and its pg-delta certificate error is a red herring.

- [ ] **Step 1: Rewrite the CLAUDE.md bullet**

Replace the whole « **Signup is open but gated.** » bullet in `CLAUDE.md` → *Gotchas & Conventions* with:

```markdown
- **Signup is gated by an allowlist, checked before an account exists.** Eazyexchange
  is not open to the public. `requestOrganizerSignup` (`app/(auth)/signup/actions.ts`)
  and the `intent=organizer_signup` branch of `app/auth/callback/route.ts` both consult
  `signup_allowlist` **before** anything is created; a non-allowlisted person gets a row
  in `signup_waitlist` and **no auth user, no school and no `users` row at all**. Both
  tables are service-role only — no policies, no grants, `anon` *and* `authenticated`
  revoked explicitly — and `lib/auth/waitlist.ts` is the only module that touches them.
  **Letting someone new in is one SQL statement in the Supabase dashboard:**
  `insert into signup_allowlist (email, note) values ('them@example.com', 'why');`
  There is deliberately no UI for it, and there is no `/admin` review queue any more.
  The DB gate stays as the fail-closed backstop: `public.my_role()` returns the role
  **only** when `users.status = 'approved'`, so every policy written as
  `my_role() = 'organizer' AND …` inherits it — including future ones. Do not add an
  `is_approved()` clause; there is deliberately one gate in one place. Initial status
  comes from the `set_initial_user_status()` BEFORE INSERT trigger (students and
  colleagues joining an approved school are auto-approved; `signup_allowlist`
  pre-approves testers), so new user-creation paths need no changes. `users.status`,
  `reviewed_at` and `notes` have no column grant for `authenticated` — only the service
  role writes them. `/pending` survives for the legacy pre-allowlist rows. Reset an
  allowlisted account to run the signup cycle again with `pnpm reset-account <email>`.
  Specs: `docs/superpowers/specs/2026-07-30-signup-waitlist-design.md` (the allowlist +
  waitlist) and `docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md` (the
  DB gate it keeps).
```

- [ ] **Step 2: Run the full gate**

```bash
pnpm lint && pnpm test && pnpm build && pnpm test:rls
```

Expected: PASS at every step. Note: `pnpm test` may pick up a transient failure from a neighbouring worktree mid-write — re-run the single file before debugging it.

- [ ] **Step 3: Commit the docs**

```bash
git branch --show-current
git add CLAUDE.md
git commit -m "docs: the signup gate is an allowlist checked before signup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Apply the migration to staging**

```bash
set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"
```

If it complains about out-of-order files, add `--include-all`. A pg-delta certificate error in the output is a known red herring — check the ledger, not the message.

Expected: the new `<stamp>_signup_waitlist.sql` is applied. Verify:

```bash
set -a; source .env.staging; set +a; psql "$STAGING_DB_URL" -c \
  "select count(*) from signup_waitlist; select email from signup_allowlist order by email;"
```

Expected: the two owner addresses are listed.

- [ ] **Step 5: Apply the migration to production**

Use the Supabase MCP `apply_migration` tool with `name` = `signup_waitlist` and the migration file's contents.

- [ ] **Step 6: Check the ledger for a stamp mismatch**

Call MCP `list_migrations`. If the stamped version differs from the local filename:

```bash
git mv supabase/migrations/<local>_signup_waitlist.sql supabase/migrations/<stamped>_signup_waitlist.sql
git add supabase/migrations
git commit -m "chore(db): rename the migration to the ledger's stamp"
```

Then update **staging's** ledger to match — never run `migration repair`; follow `docs/WORKFLOW.md#migrations--staging`.

Routine drift check: every filename version in `supabase/migrations/` appears in `list_migrations`, and vice versa.

- [ ] **Step 7: Regenerate types against production and re-verify**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → then:

```bash
pnpm exec tsc --noEmit
git diff --stat types/supabase.ts
```

If it differs from the local-stack generation committed in Task 1, commit the difference:

```bash
git add types/supabase.ts
git commit -m "chore(types): regenerate against the production schema"
```

- [ ] **Step 8: Verify the owner's production row was fixed**

Run through MCP `execute_sql`:

```sql
select email, status, reviewed_at from public.users where status <> 'approved';
select email, source, created_at from public.signup_waitlist order by created_at;
```

Expected: the first query returns **zero rows** (`bjornstephany@gmail.com` is now `approved`), and the second is empty or holds only migrated legacy rows — **not** the owner's address.

- [ ] **Step 9: Run the ship gate**

```bash
pnpm ship
```

Expected: all six steps green (lint, RLS matrix, types, unit tests, production build, browser smoke).

- [ ] **Step 10: Report to Bjorn and wait for merge confirmation**

Do **not** merge to `main` without explicit confirmation — `main` deploys to production. Report: the gate result, the migration stamps on staging and prod, and this production verification checklist for after the deploy:

- Sign up with a throwaway address → waitlist message; `signup_waitlist` row present; **no** new `auth.users` row.
- `pnpm reset-account bjornstephany@gmail.com --yes` (with `.env.prod` sourced), then sign up again → confirmation mail → `/onboarding`, with no `/pending` stop.
- The Google button with a non-allowlisted account → waitlist message, no orphan auth row left behind.
- `/admin` returns 404.
- The owner receives the « Nouvelle inscription en liste d’attente » email at an `ADMIN_EMAILS` address.

- [ ] **Step 11: Merge, after confirmation**

```bash
git checkout main && git merge --no-ff feature/signup-waitlist
pnpm lint && pnpm test && pnpm build
git push origin main
```

Then `ExitWorktree` with `remove`.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Data model — `signup_waitlist` table, revokes | 1 |
| Migration data changes 1–3 (allowlist seed, owner flip, pending → waitlist) | 1 |
| `requestOrganizerSignup` steps 1–5 | 4 |
| Page states, third terminal state, `?waitlisted=1` | 5 |
| Google signup — allowlist check + existing teardown | 6 |
| What deliberately does not change (`users.status`, `my_role()`, `/pending`, `ADMIN_EMAILS`) | 1 (untouched), 7 (`/pending` copy), 2 (`ADMIN_EMAILS` comment) |
| Removals table (`app/admin/*`, `lib/auth/admin.ts` + tests) | 7 |
| `sendSignupRequestEmail` repurposed; `sendSignupFailureEmail` untouched | 2 |
| `pnpm reset-account` — guards, FK-derived order, retry, storage | 8 |
| Unit tests (action, callback, notification email) | 4, 6, 2 |
| RLS matrix for `signup_waitlist`, anon *and* authenticated | 1 |
| Smoke specs ×2, seeded allowlisted address | 9 |
| Deleted / updated tests (`pending.test.tsx`, `robots.ts`, `seo-crawl-surface`) | 7 |
| Rollout steps 1–7 + production verification | 10 |
| Documentation — CLAUDE.md bullet | 10 |

**Deviations from the spec, and why**

1. **`sendSignupRequestEmail` is renamed, not just re-bodied.** The spec says "repurposed"; keeping the old name on a function that no longer describes a request queue would mislead every future reader. Its one existing caller (`provisionOrganizer`) is removed at the same time, because after this change `pending` is unreachable for a new account — that branch now raises `sendSignupFailureEmail({ reason: 'unexpected_pending_status' })` instead of silently stranding an account. (Task 2)
2. **`organizer_invites` is added to the teardown order.** The spec lists `organizer_invites.invited_by` among the `NO ACTION` blockers but omits the table from its one-line order sketch. Verified against the live FK graph; without it the `users` delete fails. (Task 8)
3. **Storage is purged by exact path, not by prefix.** The spec says "storage prefixes are purged too". The three private buckets are `documents`, `application-photos`, `form-templates`, and every object's path is recorded on a row (`document_uploads.storage_path`, `submissions.generated_pdf_path`, `applications.photo_path`, `form_templates.template_file_path`). Collecting paths from those rows before deleting them is the approach `lib/retention/erase.ts` already uses and cannot miss a file that lives outside an assumed prefix. (Task 8)
4. **The RLS test also covers `signup_allowlist`.** The spec only requires matrix cases for the new table. Its sibling has had none since it shipped, and it is now the table that decides who gets an account — the cases are four lines and the same fixtures. (Task 1)
5. **`/pending`'s `rejected` branch collapses into one message.** The spec says the copy is rewritten to match the waitlist message; with no review process there is no verdict for a distinct « refusé » message to report, and the waitlist copy is truthful for both statuses. (Task 7)
