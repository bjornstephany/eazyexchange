# Send Application Invitations From The Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers send application invitations to specific students by email from inside the portal, and track each invitee (invited → started → submitted) in the applications list.

**Architecture:** Reuse the `applications` table with a new `'invited'` status and an `invited_at` marker column. A new authenticated organizer action bulk-creates `invited` rows (one per pasted email) and emails each a one-click apply link. The existing anonymous apply funnel treats an `invited` row as an untouched draft; the first save/upload flips it to `draft` ("started"). `listApplications` stops hiding organizer-invited rows so the funnel's pre-submission states become visible to the organizer only for invited-origin rows.

**Tech Stack:** Next.js App Router server actions, Supabase (Postgres + RLS), Resend email, next-intl (5 locales), Vitest.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **Spec:** `docs/superpowers/specs/2026-07-20-send-application-invitations-design.md`.
- **No follow-up in scope:** no resend button, no nudge, no auto-reminders.
- **Migration workflow (CLAUDE.md):** write file locally → apply with Supabase MCP `apply_migration` → if `list_migrations` stamped a different version, `git mv` the file to the stamped version → regenerate types with MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit`. Apply to **staging first**, then prod is a human merge-time step (autonomy stops at the PR).
- **Service-role rule:** `lib/supabase/admin` may only be imported by files in `lib/supabase/__tests__/admin-allowlist.test.ts`. The new send action needs it (bulk insert + email arbitrary addresses); allowlist it deliberately in the same change.
- **Never log student/parent PII** (emails, names) in app logs.
- **Expected outcomes are structured return values, never thrown** (prod redacts thrown Server Action messages). Only throw for genuinely unexpected failures / auth (`'Unauthenticated'`/`'Unauthorized'` strings are load-bearing).
- **Escape all user-supplied content in email HTML** (`esc()` in `lib/email.ts`).
- New application behavior for the **authenticated organizer trust model** goes in `actions/applications-review.ts` — never `actions/apply.ts` (anonymous funnel).
- **Verifying Changes gate:** `pnpm lint && pnpm test && pnpm build`; because a migration is touched, also `pnpm test:rls`.
- New i18n strings must be added to **all 5 locales**: `messages/{en,fr,es,it,de}.json`.

---

### Task 1: Migration — add `invited_at` column

**Files:**
- Create: `supabase/migrations/20260720000000_application_invited_status.sql` (final version may be renamed by the MCP stamp)
- Modify: `types/supabase.ts` (regenerated, verbatim)

**Interfaces:**
- Produces: `applications.invited_at` (`timestamptz`, nullable). Non-null ⇒ organizer-invited row. New status string value `'invited'` used by later tasks (no enum — `status` is free text `text`).

- [ ] **Step 1: Write the migration file**

```sql
-- Organizer-sent application invitations.
-- A row created by an organizer invite starts life as status 'invited' (email
-- sent, student has not opened the form). invited_at is the discriminator that
-- keeps these rows visible to the organizer through their whole lifecycle,
-- while self-serve drafts stay hidden. Non-null ⇒ organizer-invited.
alter table applications add column invited_at timestamptz;
```

- [ ] **Step 2: Apply to staging, then via MCP**

Apply to staging first (CLAUDE.md Staging & Previews):
```bash
set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"
```
Then apply with the Supabase MCP `apply_migration` tool (`name` = `application_invited_status`). Run MCP `list_migrations`; if the stamped version differs from `20260720000000`, `git mv` the local file to the stamped version.

- [ ] **Step 3: Regenerate types**

Run MCP `generate_typescript_types`, overwrite `types/supabase.ts` verbatim.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (`types/db.ts` narrows generated rows; a drift would fail here.)

- [ ] **Step 5: RLS regression (no new cases needed — column only)**

Run: `pnpm test:rls`
Expected: PASS. No new matrix cases (no new table/bucket; column + query change only).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ types/supabase.ts
git commit -m "feat(apply): add invited_at column for organizer-sent invitations"
```

---

### Task 2: Apply funnel treats `'invited'` as an untouched draft

**Files:**
- Modify: `lib/tokens.ts` (add `resumeTokenExpiry`)
- Modify: `actions/apply.ts` (`getApplicationDraft`, `saveApplicationDraft`, `uploadApplicationPhoto`, `submitApplication`; adopt `resumeTokenExpiry`)
- Test: `actions/__tests__/apply-invited.test.ts` (create)

**Interfaces:**
- Consumes: `applications.invited_at` / status `'invited'` (Task 1).
- Produces: `resumeTokenExpiry(deadline: string | null): string` exported from `lib/tokens.ts`. Funnel behavior: an `invited` row renders the form; the first `saveApplicationDraft` or `uploadApplicationPhoto` flips `invited → draft`; `submitApplication` accepts `invited` too.

- [ ] **Step 1: Write the failing test**

```ts
// actions/__tests__/apply-invited.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
}))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))
vi.mock('@/lib/rate-limit', () => ({
  clientIp: async () => '1.2.3.4',
  enforceRateLimit: vi.fn(async () => {}),
  enforceRateLimitStrict: vi.fn(async () => {}),
}))

let appRow: any
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: appRow, error: null }) }) }),
      update,
    }),
  }),
}))

import { saveApplicationDraft } from '../apply'

beforeEach(() => {
  update.mockClear()
  appRow = {
    id: 'a1', status: 'invited', resume_token_expires_at: new Date(Date.now() + 1e9).toISOString(),
    exchange_id: 'ex1', email: 'x@y.co', photo_path: null, school_id: 's1',
  }
})

describe('apply funnel: invited rows are editable drafts', () => {
  it('saving an invited draft flips it to draft', async () => {
    const res = await saveApplicationDraft('tok', { first_name: 'Léo' })
    expect(res).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ data: { first_name: 'Léo' }, status: 'draft' })
  })

  it('saving an already-draft row does not re-set status', async () => {
    appRow.status = 'draft'
    await saveApplicationDraft('tok', { first_name: 'Léo' })
    expect(update).toHaveBeenCalledWith({ data: { first_name: 'Léo' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- apply-invited`
Expected: FAIL — `saveApplicationDraft` currently throws on non-`draft` status ("already submitted and locked").

- [ ] **Step 3: Add the shared expiry helper**

Add to `lib/tokens.ts` (mirrors the logic currently local to `apply.ts`):

```ts
const RESUME_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000

// When a resume/invite link should die: end of the deadline day (the day after,
// 00:00 UTC — the moment applications close), or 30 days out if no deadline.
export function resumeTokenExpiry(deadline: string | null): string {
  if (deadline) return new Date(new Date(`${deadline}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()
  return new Date(Date.now() + RESUME_FALLBACK_MS).toISOString()
}
```

- [ ] **Step 4: Adopt the helper in `apply.ts`**

In `actions/apply.ts`: import `resumeTokenExpiry` from `@/lib/tokens` (alongside the existing `randomToken, tokenExpired`), delete the local `RESUME_FALLBACK_MS` const and `resumeExpiry` function, and replace the three `resumeExpiry(` call sites with `resumeTokenExpiry(`.

- [ ] **Step 5: Accept `invited` in the four funnel entry points**

In `getApplicationDraft` — change the submitted-marker guard:
```ts
  // 'invited' (organizer-sent, untouched) and 'draft' both render the form.
  if (app.status !== 'draft' && app.status !== 'invited') {
    return { expired: false as const, submitted: true as const, exchangeName }
  }
```

In `saveApplicationDraft` — change the guard + flip on first write:
```ts
  if (app.status !== 'draft' && app.status !== 'invited') throw new Error('This application is already submitted and locked')
  await assertExchangeWritable(admin, app.exchange_id)
  // First edit of an organizer-invited row marks it "started".
  const patch: { data: Record<string, string>; status?: 'draft' } =
    app.status === 'invited' ? { data, status: 'draft' } : { data }
  const { error } = await admin
    .from('applications').update(patch).eq('resume_token', token)
```

In `uploadApplicationPhoto` — change the guard + flip on first upload:
```ts
  if (app.status !== 'draft' && app.status !== 'invited') throw new Error('This application is already submitted and locked')
  await assertExchangeWritable(admin, app.exchange_id)
```
and where it updates `photo_path`:
```ts
  const patch: { photo_path: string; status?: 'draft' } =
    app.status === 'invited' ? { path, status: 'draft' } : { photo_path: path }
```
(Keep the existing `path` variable; write `photo_path: path`. Concretely:)
```ts
  const patch: { photo_path: string; status?: 'draft' } =
    app.status === 'invited' ? { photo_path: path, status: 'draft' } : { photo_path: path }
  const { error } = await admin.from('applications').update(patch).eq('id', app.id)
```

In `submitApplication` — allow submitting straight from `invited` (never-saved edge):
```ts
  if (app.status !== 'draft' && app.status !== 'invited') throw new Error('This application is already submitted')
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- apply-invited apply`
Expected: PASS (new file + any existing `apply` tests still green).

- [ ] **Step 7: Commit**

```bash
git add lib/tokens.ts actions/apply.ts actions/__tests__/apply-invited.test.ts
git commit -m "feat(apply): treat 'invited' applications as editable drafts"
```

---

### Task 3: Invitation email

**Files:**
- Modify: `lib/email.ts` (add `sendApplicationInviteEmail`)
- Test: `lib/__tests__/email.application.test.ts` (extend)

**Interfaces:**
- Produces: `sendApplicationInviteEmail(opts: { to: string; exchangeName: string; applyUrl: string; ctx?: EmailLogContext }): Promise<void>` — best-effort, never throws.

- [ ] **Step 1: Write the failing test** (add a line to the existing block)

In `lib/__tests__/email.application.test.ts`, add `sendApplicationInviteEmail` to the import and one assertion:
```ts
    await expect(sendApplicationInviteEmail({ to: 'a@b.co', exchangeName: 'X', applyUrl: 'u' })).resolves.toBeUndefined()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- email.application`
Expected: FAIL — `sendApplicationInviteEmail` is not exported.

- [ ] **Step 3: Implement the email**

Add to `lib/email.ts` (next to `sendApplicationResumeEmail`, reusing `layout`, `esc`, `send`, `APP_FOOTER`, English to match its application-cluster siblings):
```ts
export async function sendApplicationInviteEmail(opts: { to: string; exchangeName: string; applyUrl: string; ctx?: EmailLogContext }): Promise<void> {
  const html = layout(`
    <p>Hi,</p>
    <p>You've been invited to apply for <strong>${esc(opts.exchangeName)}</strong>. It only takes a few minutes — you can save and finish later on any device.</p>
    <p><a href="${opts.applyUrl}" style="display:inline-block;background:#1F7A57;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Start my application</a></p>
    <p style="font-size:12px;color:#5C7268;">Keep this email — it's your private link back to your application.</p>
  `, APP_FOOTER)
  await send(opts.to, `You're invited to apply — ${opts.exchangeName}`, html, 'application invite email', opts.ctx)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- email.application`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/__tests__/email.application.test.ts
git commit -m "feat(email): add application invitation email"
```

---

### Task 4: Pure email-list parser

**Files:**
- Create: `lib/invite-emails.ts`
- Test: `lib/__tests__/invite-emails.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeEmail`, `isValidEmail` from `@/lib/validation`.
- Produces: `MAX_INVITE_BATCH = 200`; `parseInviteEmails(raw: string): { valid: string[]; invalid: string[] }` — splits on whitespace/commas/semicolons, normalizes, de-dupes (by normalized value, first occurrence wins), partitions valid/invalid.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/invite-emails.test.ts
import { describe, it, expect } from 'vitest'
import { parseInviteEmails } from '../invite-emails'

describe('parseInviteEmails', () => {
  it('splits on newlines, commas, semicolons and spaces', () => {
    expect(parseInviteEmails('a@x.co\nb@x.co, c@x.co;d@x.co e@x.co').valid)
      .toEqual(['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co', 'e@x.co'])
  })
  it('normalizes and de-dupes, first occurrence wins', () => {
    expect(parseInviteEmails('A@X.co\n a@x.co ').valid).toEqual(['a@x.co'])
  })
  it('partitions invalid addresses', () => {
    const r = parseInviteEmails('good@x.co\nnope\nalso bad@')
    expect(r.valid).toEqual(['good@x.co'])
    expect(r.invalid).toEqual(['nope', 'bad@'])
  })
  it('ignores empty input', () => {
    expect(parseInviteEmails('   \n , ; ')).toEqual({ valid: [], invalid: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- invite-emails`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

```ts
// lib/invite-emails.ts
import { normalizeEmail, isValidEmail } from '@/lib/validation'

// Hard cap per send: emailing arbitrary addresses from our sending domain in
// bulk must stay bounded (typical cohorts are 20–60). Not a product limit.
export const MAX_INVITE_BATCH = 200

export type ParsedInviteEmails = { valid: string[]; invalid: string[] }

// Split a pasted blob into normalized, de-duplicated addresses partitioned into
// valid / invalid. De-dupe is by normalized value (first occurrence wins).
export function parseInviteEmails(raw: string): ParsedInviteEmails {
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    if (!token) continue
    const email = normalizeEmail(token)
    if (!email || seen.has(email)) continue
    seen.add(email)
    if (isValidEmail(email)) valid.push(email)
    else invalid.push(email)
  }
  return { valid, invalid }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- invite-emails`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/invite-emails.ts lib/__tests__/invite-emails.test.ts
git commit -m "feat(apply): add pure email-list parser for invitations"
```

---

### Task 5: `sendApplicationInvitations` organizer action

**Files:**
- Modify: `actions/applications-review.ts` (new action + imports)
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts` (allowlist `actions/applications-review.ts`)
- Test: `actions/__tests__/send-invitations.test.ts` (create)

**Interfaces:**
- Consumes: `resumeTokenExpiry` (Task 2), `sendApplicationInviteEmail` (Task 3), `parseInviteEmails`/`MAX_INVITE_BATCH` (Task 4).
- Produces:
```ts
export type SendInvitationsResult =
  | { ok: false; notOpen: true }
  | { ok: false; tooMany: true }
  | { ok: true; sent: number; skippedExchange: number; skippedElsewhere: number; invalid: number }
export async function sendApplicationInvitations(exchangeId: string, rawEmails: string): Promise<SendInvitationsResult>
```

- [ ] **Step 1: Write the failing test**

```ts
// actions/__tests__/send-invitations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: async () => 'ip', enforceRateLimit: vi.fn(async () => {}) }))
const sendInvite = vi.fn(async () => {})
vi.mock('@/lib/email', () => ({
  sendApplicationInviteEmail: (...a: unknown[]) => sendInvite(...a),
  sendGoodNewsEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))

// Admin client: exchange lookup, existing-rows lookup, upsert insert.
let exchange: any
let existingRows: any[]
let insertedRows: any[]
const upsert = vi.fn(() => ({ select: async () => ({ data: insertedRows, error: null }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_c?: string) => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: exchange, error: null }) }),
          in: async () => ({ data: existingRows, error: null }),
          maybeSingle: async () => ({ data: exchange, error: null }),
        }),
      }),
      upsert,
    }),
  }),
}))

import { sendApplicationInvitations } from '../applications-review'

beforeEach(() => {
  sendInvite.mockClear(); upsert.mockClear()
  exchange = {
    id: 'ex1', name: 'X', school_a_id: 'school-1',
    application_open: true, application_deadline: '2999-01-01',
  }
  existingRows = []
  insertedRows = [{ email: 'new@x.co', resume_token: 'tok' }]
})

describe('sendApplicationInvitations', () => {
  it('creates rows for new emails and emails each one', async () => {
    const res = await sendApplicationInvitations('ex1', 'new@x.co')
    expect(res).toEqual({ ok: true, sent: 1, skippedExchange: 0, skippedElsewhere: 0, invalid: 0 })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(sendInvite).toHaveBeenCalledTimes(1)
  })

  it('categorizes already-in-exchange, elsewhere, and invalid', async () => {
    existingRows = [{ email: 'here@x.co', exchange_id: 'ex1' }, { email: 'there@x.co', exchange_id: 'ex2' }]
    insertedRows = [{ email: 'new@x.co', resume_token: 'tok' }]
    const res = await sendApplicationInvitations('ex1', 'new@x.co, here@x.co, there@x.co, bad@')
    expect(res).toEqual({ ok: true, sent: 1, skippedExchange: 1, skippedElsewhere: 1, invalid: 1 })
  })

  it('refuses when applications are not open', async () => {
    exchange.application_open = false
    expect(await sendApplicationInvitations('ex1', 'a@x.co')).toEqual({ ok: false, notOpen: true })
  })

  it('refuses a foreign exchange', async () => {
    exchange.school_a_id = 'other'
    await expect(sendApplicationInvitations('ex1', 'a@x.co')).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- send-invitations`
Expected: FAIL — `sendApplicationInvitations` not exported.

- [ ] **Step 3: Implement the action**

Add these imports to `actions/applications-review.ts`:
```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { resumeTokenExpiry } from '@/lib/tokens'
import { parseInviteEmails, MAX_INVITE_BATCH } from '@/lib/invite-emails'
import { enforceRateLimit } from '@/lib/rate-limit'
import { sendApplicationInviteEmail } from '@/lib/email'
```
(`randomToken` is already imported.) Append the action:
```ts
// ---- Organizer-sent application invitations ----

export type SendInvitationsResult =
  | { ok: false; notOpen: true }
  | { ok: false; tooMany: true }
  | { ok: true; sent: number; skippedExchange: number; skippedElsewhere: number; invalid: number }

// Bulk-invite students by email from the portal. Admin client (allowlisted):
// it bulk-inserts rows AND emails arbitrary addresses, so it carries the same
// rate-limited service-role posture as the anonymous funnel (actions/apply.ts).
export async function sendApplicationInvitations(
  exchangeId: string, rawEmails: string,
): Promise<SendInvitationsResult> {
  const { user, profile } = await requireOrganizer()
  const admin = createAdminClient()

  const { data: exchange } = await admin
    .from('exchanges')
    .select('id, name, school_a_id, application_open, application_deadline')
    .eq('id', exchangeId)
    .maybeSingle()
  // Only the applicant-side school (school_a) owns the application funnel.
  if (!exchange || exchange.school_a_id !== profile.school_id) throw new Error('Unauthorized')
  await assertExchangeWritable(admin, exchange.id)

  // Must be open with a live deadline (same gate as the copy-link path).
  const today = new Date().toISOString().slice(0, 10)
  const open = exchange.application_open
    && !!exchange.application_deadline
    && today <= exchange.application_deadline
  if (!open) return { ok: false, notOpen: true }

  const { valid, invalid } = parseInviteEmails(rawEmails)
  if (valid.length > MAX_INVITE_BATCH) return { ok: false, tooMany: true }
  if (valid.length === 0) {
    return { ok: true, sent: 0, skippedExchange: 0, skippedElsewhere: 0, invalid: invalid.length }
  }

  // Per-organizer cap on bulk sends from our domain.
  await enforceRateLimit(`invite_send:${user.id}`, 10, 3600)

  // School-wide dedup: one email = one application per school.
  const { data: existing } = await admin
    .from('applications')
    .select('email, exchange_id')
    .eq('school_id', exchange.school_a_id)
    .in('email', valid)
  const hereEmails = new Set((existing ?? []).filter(r => r.exchange_id === exchange.id).map(r => r.email))
  const elsewhereEmails = new Set(
    (existing ?? []).filter(r => r.exchange_id !== exchange.id).map(r => r.email),
  )
  const toCreate = valid.filter(e => !hereEmails.has(e) && !elsewhereEmails.has(e))
  const skippedElsewhere = valid.filter(e => elsewhereEmails.has(e) && !hereEmails.has(e)).length

  const expiry = resumeTokenExpiry(exchange.application_deadline)
  const invitedAt = new Date().toISOString()
  const rows = toCreate.map(email => ({
    exchange_id: exchange.id, school_id: exchange.school_a_id, email,
    resume_token: randomToken(), invite_token: null,
    resume_token_expires_at: expiry, invite_token_expires_at: null,
    status: 'invited', language: 'fr', data: { email }, photo_path: null,
    invite_response: null, invite_response_note: null, responded_at: null,
    enrolled_user_id: null, submitted_at: null, reviewed_at: null,
    reviewer_id: null, review_note: null, invited_at: invitedAt,
  }))

  // ON CONFLICT DO NOTHING on the (exchange_id, email) unique index: a self-serve
  // start that raced our dedup read is skipped, not an error. .select() returns
  // only the rows actually inserted.
  let inserted: { email: string; resume_token: string }[] = []
  if (rows.length > 0) {
    const { data, error } = await admin
      .from('applications')
      .upsert(rows, { onConflict: 'exchange_id,email', ignoreDuplicates: true })
      .select('email, resume_token')
    if (error) throw error
    inserted = (data ?? []) as { email: string; resume_token: string }[]
  }
  const raceSkipped = toCreate.length - inserted.length
  const skippedExchange = hereEmails.size + raceSkipped

  // Await the sends (a serverless action would kill fire-and-forget promises
  // after return). send() swallows per-recipient failures; there is no resend.
  await Promise.allSettled(inserted.map(r =>
    sendApplicationInviteEmail({
      to: r.email,
      exchangeName: exchange.name,
      applyUrl: `${APP_URL}/apply/resume/${r.resume_token}`,
      ctx: { schoolId: exchange.school_a_id, exchangeId: exchange.id },
    }),
  ))

  revalidatePath('/applications')
  revalidatePath('/dashboard')
  return { ok: true, sent: inserted.length, skippedExchange, skippedElsewhere, invalid: invalid.length }
}
```

- [ ] **Step 4: Allowlist the admin-client import**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, add `'actions/applications-review.ts'` to the `ALLOWLIST` array (keep it sorted; the array is `.sort()`ed at definition so ordering in source is cosmetic but keep alphabetical):
```ts
  'actions/apply.ts',
  'actions/applications-review.ts',
  'actions/exchanges.ts',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- send-invitations admin-allowlist`
Expected: PASS (both the action tests and the allowlist guard).

- [ ] **Step 6: Commit**

```bash
git add actions/applications-review.ts lib/supabase/__tests__/admin-allowlist.test.ts actions/__tests__/send-invitations.test.ts
git commit -m "feat(apply): add sendApplicationInvitations organizer action"
```

---

### Task 6: `listApplications` surfaces organizer-invited rows

**Files:**
- Modify: `actions/applications-review.ts` (`listApplications` filter, both branches + selected columns)
- Test: `actions/__tests__/list-applications.test.ts` (extend)

**Interfaces:**
- Consumes: `applications.invited_at` (Task 1).
- Produces: `listApplications` now returns rows where `status != 'draft' OR invited_at is not null` (self-serve drafts stay hidden; organizer-invited rows appear through their whole lifecycle).

- [ ] **Step 1: Write the failing test**

Add to `actions/__tests__/list-applications.test.ts`. Because the mock's `from()` builder currently ignores filters, assert the query builder is called with the OR filter. Extend `makeClient()` to record `.or()`:
```ts
// add near the top-level mock state
let orArg: string | null = null
```
In `makeClient()`'s builder, add:
```ts
        or: (arg: string) => { orArg = arg; return builder },
```
Then a new test:
```ts
describe('listApplications visibility', () => {
  it('includes invited-origin rows but hides self-serve drafts', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    await listApplications('ex-1')
    expect(orArg).toBe('status.neq.draft,invited_at.not.is.null')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- list-applications`
Expected: FAIL — `listApplications` still uses `.neq('status','draft')`; `orArg` stays null / `.or` unused.

- [ ] **Step 3: Change both query branches**

In `actions/applications-review.ts` `listApplications`, replace `.neq('status', 'draft')` with `.or('status.neq.draft,invited_at.not.is.null')` in **both** the `!withPhotos` branch and the photos branch. Note: `.neq('status','draft')` also excludes `null` statuses — not a concern here (status is always set). The PostgREST `or` filter keeps rows whose status isn't draft OR that are organizer-invited.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- list-applications`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add actions/applications-review.ts actions/__tests__/list-applications.test.ts
git commit -m "feat(apply): surface organizer-invited rows in listApplications"
```

---

### Task 7: Status pills + i18n for `invited` / started

**Files:**
- Modify: `lib/dashboard/rollup.ts` (`applicantStatusPill`, `candidaturePill`)
- Modify: `messages/{en,fr,es,it,de}.json`
- Test: `lib/__tests__/rollup-pills.test.ts` (create)

**Interfaces:**
- Consumes: status values `'invited'` and `'draft'` (an organizer-visible `draft` is always invited-origin per Task 6).
- Produces: pill labels for `invited` ("Invité"/…) and `draft`→started ("Commencé"/…) via message keys `organizer.dashboard.pills.invited` and `organizer.dashboard.pills.started`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/rollup-pills.test.ts
import { describe, it, expect } from 'vitest'
import { applicantStatusPill, candidaturePill } from '../dashboard/rollup'

const t = (k: string) => k // identity: assert on the key

describe('invited / started pills', () => {
  it('applicantStatusPill maps invited and started', () => {
    expect(applicantStatusPill('invited', t as any).label).toBe('organizer.dashboard.pills.invited')
    expect(applicantStatusPill('draft', t as any).label).toBe('organizer.dashboard.pills.started')
  })
  it('candidaturePill maps invited and started', () => {
    expect(candidaturePill('invited', t as any).label).toBe('organizer.dashboard.pills.invited')
    expect(candidaturePill('draft', t as any).label).toBe('organizer.dashboard.pills.started')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- rollup-pills`
Expected: FAIL — both currently fall through to the `dash` default.

- [ ] **Step 3: Add the cases**

In `lib/dashboard/rollup.ts`, add to **both** `applicantStatusPill` and `candidaturePill` switch statements, before `default:`:
```ts
    case 'invited': return { kind: 'neutral', label: t('organizer.dashboard.pills.invited') }
    case 'draft': return { kind: 'neutral', label: t('organizer.dashboard.pills.started') }
```

- [ ] **Step 4: Add the message keys (all 5 locales)**

Under `organizer.dashboard.pills` in each file:
- `messages/en.json`: `"invited": "Invited", "started": "Started"`
- `messages/fr.json`: `"invited": "Invité", "started": "Commencé"`
- `messages/es.json`: `"invited": "Invitado", "started": "Empezado"`
- `messages/it.json`: `"invited": "Invitato", "started": "Iniziato"`
- `messages/de.json`: `"invited": "Eingeladen", "started": "Begonnen"`

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- rollup-pills`
Expected: PASS

- [ ] **Step 6: Verify locale files parse**

Run: `node -e "for (const l of ['en','fr','es','it','de']) require('./messages/'+l+'.json')"`
Expected: no output, no throw (valid JSON).

- [ ] **Step 7: Commit**

```bash
git add lib/dashboard/rollup.ts messages/ lib/__tests__/rollup-pills.test.ts
git commit -m "feat(apply): add invited/started status pills and translations"
```

---

### Task 8: `InviteByEmailDialog` component

**Files:**
- Create: `components/applications/InviteByEmailDialog.tsx`
- Modify: `messages/{en,fr,es,it,de}.json` (add `organizer.applications.invite.*`)
- Test: `components/applications/__tests__/InviteByEmailDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `sendApplicationInvitations` + `SendInvitationsResult` (Task 5).
- Produces: `<InviteByEmailDialog exchangeId open onOpenChange />` — paste textarea → send → result summary. Controlled `open` like `InviteModal`.

- [ ] **Step 1: Add the i18n strings first (all 5 locales)**

Under `organizer.applications`, add an `invite` object. Keys and values:

`en`:
```json
"invite": {
  "openCta": "Invite by email",
  "title": "Invite by email",
  "description": "Paste students' email addresses — one per line or comma-separated.",
  "placeholder": "marie@school.org\nleo@school.org",
  "sendCta": "Send invitations",
  "sending": "Sending…",
  "close": "Close",
  "notOpenError": "Open applications and set a deadline first.",
  "tooManyError": "Too many addresses (max 200 per send).",
  "result": "{sent} sent · {skipped} already in the list · {invalid} invalid"
}
```
`fr`:
```json
"invite": {
  "openCta": "Inviter par e-mail",
  "title": "Inviter par e-mail",
  "description": "Collez les adresses e-mail des élèves — une par ligne ou séparées par des virgules.",
  "placeholder": "marie@ecole.fr\nleo@ecole.fr",
  "sendCta": "Envoyer les invitations",
  "sending": "Envoi…",
  "close": "Fermer",
  "notOpenError": "Ouvrez d'abord les candidatures et fixez une date limite.",
  "tooManyError": "Trop d'adresses (200 maximum par envoi).",
  "result": "{sent} envoyée·s · {skipped} déjà dans la liste · {invalid} invalide·s"
}
```
`es`:
```json
"invite": {
  "openCta": "Invitar por correo",
  "title": "Invitar por correo",
  "description": "Pega los correos de los alumnos — uno por línea o separados por comas.",
  "placeholder": "marie@escuela.es\nleo@escuela.es",
  "sendCta": "Enviar invitaciones",
  "sending": "Enviando…",
  "close": "Cerrar",
  "notOpenError": "Primero abre las candidaturas y fija una fecha límite.",
  "tooManyError": "Demasiadas direcciones (máx. 200 por envío).",
  "result": "{sent} enviadas · {skipped} ya en la lista · {invalid} no válidas"
}
```
`it`:
```json
"invite": {
  "openCta": "Invita via e-mail",
  "title": "Invita via e-mail",
  "description": "Incolla le e-mail degli studenti — una per riga o separate da virgole.",
  "placeholder": "marie@scuola.it\nleo@scuola.it",
  "sendCta": "Invia inviti",
  "sending": "Invio…",
  "close": "Chiudi",
  "notOpenError": "Apri prima le candidature e imposta una scadenza.",
  "tooManyError": "Troppi indirizzi (max 200 per invio).",
  "result": "{sent} inviate · {skipped} già nell'elenco · {invalid} non valide"
}
```
`de`:
```json
"invite": {
  "openCta": "Per E-Mail einladen",
  "title": "Per E-Mail einladen",
  "description": "E-Mail-Adressen der Schüler einfügen — eine pro Zeile oder mit Komma getrennt.",
  "placeholder": "marie@schule.de\nleo@schule.de",
  "sendCta": "Einladungen senden",
  "sending": "Senden…",
  "close": "Schließen",
  "notOpenError": "Öffne zuerst die Bewerbungen und lege eine Frist fest.",
  "tooManyError": "Zu viele Adressen (max. 200 pro Versand).",
  "result": "{sent} gesendet · {skipped} bereits in der Liste · {invalid} ungültig"
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// components/applications/__tests__/InviteByEmailDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const send = vi.fn()
vi.mock('@/actions/applications-review', () => ({
  sendApplicationInvitations: (...a: unknown[]) => send(...a),
}))

import { InviteByEmailDialog } from '../InviteByEmailDialog'

beforeEach(() => { send.mockReset() })

describe('InviteByEmailDialog', () => {
  it('sends pasted emails and shows the result summary', async () => {
    send.mockResolvedValue({ ok: true, sent: 2, skippedExchange: 1, skippedElsewhere: 0, invalid: 1 })
    renderWithIntl(<InviteByEmailDialog exchangeId="ex1" open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@x.co\nb@x.co' } })
    fireEvent.click(screen.getByText('Envoyer les invitations'))
    await waitFor(() => expect(send).toHaveBeenCalledWith('ex1', 'a@x.co\nb@x.co'))
    await screen.findByText('2 envoyée·s · 1 déjà dans la liste · 1 invalide·s')
  })

  it('shows the not-open error', async () => {
    send.mockResolvedValue({ ok: false, notOpen: true })
    renderWithIntl(<InviteByEmailDialog exchangeId="ex1" open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@x.co' } })
    fireEvent.click(screen.getByText('Envoyer les invitations'))
    await screen.findByText("Ouvrez d'abord les candidatures et fixez une date limite.")
  })
})
```
(Confirm the intl test helper path — repo uses `renderWithIntl`; check an existing test e.g. `components/dashboard/__tests__/InviteModal.test.tsx` for the exact import and default locale, which is `fr`. Match it.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- InviteByEmailDialog`
Expected: FAIL — component module not found.

- [ ] **Step 4: Implement the component**

```tsx
// components/applications/InviteByEmailDialog.tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { sendApplicationInvitations } from '@/actions/applications-review'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function InviteByEmailDialog({
  exchangeId, open, onOpenChange,
}: {
  exchangeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer.applications.invite')
  const [emails, setEmails] = useState('')
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setEmails(''); setSending(false); setSummary(null); setError(null) }
  }, [open])

  async function submit() {
    if (!emails.trim() || sending) return
    setSending(true); setError(null); setSummary(null)
    try {
      const res = await sendApplicationInvitations(exchangeId, emails)
      if (!res.ok) {
        setError(res.notOpen ? t('notOpenError') : t('tooManyError'))
        return
      }
      setSummary(t('result', {
        sent: res.sent, skipped: res.skippedExchange + res.skippedElsewhere, invalid: res.invalid,
      }))
      setEmails('')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">{t('title')}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">{t('description')}</DialogDescription>
        </DialogHeader>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={t('placeholder')}
          rows={6}
          className="w-full rounded-[10px] border px-3 py-2 text-sm"
        />
        {error && (
          <div className="rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">{error}</div>
        )}
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <div className="mt-1.5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
            {t('close')}
          </Button>
          <Button type="button" disabled={!emails.trim() || sending} onClick={submit}>
            {sending ? t('sending') : t('sendCta')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- InviteByEmailDialog`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/applications/InviteByEmailDialog.tsx messages/ components/applications/__tests__/InviteByEmailDialog.test.tsx
git commit -m "feat(apply): add invite-by-email dialog"
```

---

### Task 9: Wire the dialog + "Invités" tab into `CandidaturesView`

**Files:**
- Modify: `components/applications/CandidaturesView.tsx`
- Test: `components/applications/__tests__/CandidaturesView.invite.test.tsx` (create)

**Interfaces:**
- Consumes: `InviteByEmailDialog` (Task 8); `invited`/`started` pills (Task 7).
- Produces: an "Invite by email" button in the toolbar (opens the dialog); a new `'invited'` tab filtering `status ∈ {invited, draft}`; invited/draft rows are not bulk-selectable.

- [ ] **Step 1: Write the failing test**

```tsx
// components/applications/__tests__/CandidaturesView.invite.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('@/actions/applications-review', () => ({
  acceptApplications: vi.fn(), rejectApplications: vi.fn(), sendApplicationInvitations: vi.fn(),
}))
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { CandidaturesView } from '../CandidaturesView'

const baseProps = {
  exchangeName: 'X', exchangeId: 'ex1', applicationOpen: true,
  applicationDeadline: '2999-01-01', applySlug: 'x',
}

describe('CandidaturesView invitations', () => {
  it('opens the invite-by-email dialog', () => {
    renderWithIntl(<CandidaturesView apps={[]} {...baseProps} />)
    fireEvent.click(screen.getByText('Inviter par e-mail'))
    expect(screen.getByText('Collez les adresses e-mail des élèves — une par ligne ou séparées par des virgules.')).toBeTruthy()
  })

  it('the Invités tab shows invited and started rows only', () => {
    const apps = [
      { id: '1', status: 'invited', submitted_at: null, data: { email: 'a@x.co' }, email: 'a@x.co' },
      { id: '2', status: 'draft', submitted_at: null, data: { email: 'b@x.co' }, email: 'b@x.co' },
      { id: '3', status: 'submitted', submitted_at: '2026-01-01', data: { email: 'c@x.co' }, email: 'c@x.co' },
    ] as any
    renderWithIntl(<CandidaturesView apps={apps} {...baseProps} />)
    fireEvent.click(screen.getByText('Invités'))
    expect(screen.getByText('a@x.co')).toBeTruthy()
    expect(screen.getByText('b@x.co')).toBeTruthy()
    expect(screen.queryByText('c@x.co')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- CandidaturesView.invite`
Expected: FAIL — no "Inviter par e-mail" button / no "Invités" tab.

- [ ] **Step 3: Add the tab**

In `components/applications/CandidaturesView.tsx`:
- Extend the type and keys:
```ts
type TabKey = 'all' | 'invited' | 'toreview' | 'accepted' | 'rejected'
const TAB_KEYS: TabKey[] = ['all', 'invited', 'toreview', 'accepted', 'rejected']
```
- In `matchesTab`, add:
```ts
    case 'invited': return a.status === 'invited' || a.status === 'draft'
```
- In `tabLabel`, add:
```ts
      case 'invited': return tr('organizer.applications.tabs.invited')
```
- Add the tab label to all 5 locales under `organizer.applications.tabs`: en `"invited": "Invited"`, fr `"invited": "Invités"`, es `"invited": "Invitados"`, it `"invited": "Invitati"`, de `"invited": "Eingeladen"`.

- [ ] **Step 4: Add the dialog trigger + state**

- Add import: `import { InviteByEmailDialog } from '@/components/applications/InviteByEmailDialog'`.
- Add state near the other `useState`s: `const [inviteOpen, setInviteOpen] = useState(false)`.
- In the toolbar (the `div` at the copy-link block, before the copy button's container or right after it), add:
```tsx
        <Button type="button" variant="outline" onClick={() => setInviteOpen(true)} className="h-[34px] whitespace-nowrap text-[12.5px]">
          {tr('organizer.applications.invite.openCta')}
        </Button>
```
(Import `Button` from `@/components/ui/button` if not already imported; the file currently uses raw `<button>` — either is fine, but reuse `Button` for the dialog trigger.)
- Before the closing `</div>` of the component's root, render:
```tsx
      <InviteByEmailDialog exchangeId={exchangeId} open={inviteOpen} onOpenChange={setInviteOpen} />
```

- [ ] **Step 5: Make invited/draft rows non-selectable**

- Add a helper above the component:
```ts
const SELECTABLE = (a: AppRow) => a.status !== 'invited' && a.status !== 'draft'
```
- In `toggleAll`, only select selectable rows:
```ts
  function toggleAll() {
    const selectable = filtered.filter(SELECTABLE)
    const allSelected = selectable.length > 0 && selectable.every(a => selected.includes(a.id))
    setSelected(allSelected ? [] : selectable.map(a => a.id))
  }
```
- In the header checkbox `checked` expression, swap `filtered` for the selectable subset:
```tsx
            checked={filtered.filter(SELECTABLE).length > 0 && filtered.filter(SELECTABLE).every(a => selected.includes(a.id))}
```
- In the per-row checkbox, disable for non-selectable rows:
```tsx
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                disabled={!SELECTABLE(a)}
                onChange={() => toggleOne(a.id)}
                onClick={e => e.stopPropagation()}
              />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- CandidaturesView`
Expected: PASS (new invite test + any existing CandidaturesView tests).

- [ ] **Step 7: Commit**

```bash
git add components/applications/CandidaturesView.tsx messages/ components/applications/__tests__/CandidaturesView.invite.test.tsx
git commit -m "feat(apply): wire invite-by-email + Invités tab into applications view"
```

---

### Task 10: Secondary entry point — invite from the dashboard modal

**Files:**
- Modify: `components/dashboard/InviteModal.tsx`
- Test: `components/dashboard/__tests__/InviteModal.test.tsx` (extend)

**Interfaces:**
- Consumes: `InviteByEmailDialog` (Task 8).
- Produces: on the modal's `link` step, an "Invite by email" button that opens the dialog for the same exchange.

- [ ] **Step 1: Write the failing test**

Add to `components/dashboard/__tests__/InviteModal.test.tsx`:
```tsx
it('offers invite-by-email after applications are opened', async () => {
  const onOpenChange = vi.fn()
  renderWithIntl(<InviteModal exchangeId="ex1" applySlug="france-canada" open onOpenChange={onOpenChange} />)
  fireEvent.change(screen.getByLabelText(/deadline/i), { target: { value: '2999-09-01' } })
  fireEvent.click(screen.getByText(/ouvrir/i)) // open-submit button
  expect(await screen.findByText('Inviter par e-mail')).toBeTruthy()
})
```
(Match the existing test's imports/queries; the deadline label + open-submit copy come from `organizer.dashboard.inviteModal.*`. If the exact label regexes differ, use the same selectors the existing tests use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- InviteModal`
Expected: FAIL — no "Inviter par e-mail" control on the link step.

- [ ] **Step 3: Add the trigger**

In `components/dashboard/InviteModal.tsx`:
- Import: `import { InviteByEmailDialog } from '@/components/applications/InviteByEmailDialog'`.
- Add state: `const [inviteOpen, setInviteOpen] = useState(false)`.
- On the `link` step (after the copy row, before the close button), add:
```tsx
            <Button type="button" variant="outline" onClick={() => setInviteOpen(true)} className="h-12 whitespace-nowrap">
              {t('dashboard.inviteModal.inviteByEmail')}
            </Button>
```
- Render the dialog once, inside the component's returned tree:
```tsx
      <InviteByEmailDialog exchangeId={exchangeId} open={inviteOpen} onOpenChange={setInviteOpen} />
```
- Add `organizer.dashboard.inviteModal.inviteByEmail` to all 5 locales (en "Invite by email", fr "Inviter par e-mail", es "Invitar por correo", it "Invita via e-mail", de "Per E-Mail einladen").

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- InviteModal`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/InviteModal.tsx messages/ components/dashboard/__tests__/InviteModal.test.tsx
git commit -m "feat(apply): add invite-by-email entry point to the dashboard modal"
```

---

### Task 11: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 2: Types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Unit tests**

Run: `pnpm test`
Expected: all pass. (If run from the main checkout and sibling worktrees pollute results, scope with `pnpm vitest run --exclude '**/.claude/**'` per the known worktree-sweep gotcha.)

- [ ] **Step 4: RLS regression**

Run: `pnpm test:rls`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: success (catches type/build breakage).

- [ ] **Step 6: Manual smoke checklist (record in PR description)**

- Open applications with a deadline → open the invite-by-email dialog → paste 2 emails → "2 sent".
- Re-paste the same 2 → "0 sent · 2 already in the list".
- Applications list shows both as "Invité" under the "Invités" tab; they are not selectable for bulk accept/reject.
- Open one invitee's emailed link → the apply form loads pre-filled with the email → type a field → the row flips to "Commencé".
- Submit → row moves to "À examiner" / normal review flow, accept works unchanged.

---

## Self-Review Notes

- **Spec coverage:** data model (T1), invitee one-click link + started transition (T2), invite email (T3), paste/dedup parsing (T4), send action with all four per-address outcomes + safeguards + allowlist (T5), organizer visibility rule (T6), pills+i18n (T7), UI dialog + Invités tab + non-selectable rows (T8/T9), secondary entry point (T10), full gate incl. `test:rls` (T11). No gaps.
- **Type consistency:** `SendInvitationsResult` shape identical across T5/T8/T9; `resumeTokenExpiry` defined T2, consumed T5; `parseInviteEmails`/`MAX_INVITE_BATCH` defined T4, consumed T5; pill keys `invited`/`started` defined T7, consumed by T9's tab labels reuse `tabs.invited` (distinct key, intentional).
- **Keep existing tests green:** `components/applications/__tests__/CandidaturesView.test.tsx` already exists — Task 9's `toggleAll`/checkbox changes and new tab must not break it (`pnpm test -- CandidaturesView` covers both files).
- **Deferred confirmations for the implementer:** (a) the PostgREST `.or('status.neq.draft,invited_at.not.is.null')` string — verify against the client version if the query returns unexpected rows; (b) the `renderWithIntl` helper import path/default locale — copy from an existing sibling test; (c) `upsert(..., { onConflict: 'exchange_id,email', ignoreDuplicates: true })` — confirm the unique index columns match (the same index `apply.ts` relies on for its `23505` path).
