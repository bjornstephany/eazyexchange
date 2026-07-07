# Test Coverage & Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production deploys gated by CI, make the Stripe webhook fail loudly on DB errors so Stripe retries, extract and test the send-reminders per-row filter, and turn the dormant RLS SQL tests into a living convention.

**Architecture:** Four independent workstreams from the approved spec (`docs/superpowers/specs/2026-07-07-test-reliability-design.md`): (2) a TDD fix to `app/api/stripe/webhook/route.ts` returning 500 on Supabase errors, (3) a behavior-identical extraction of the reminder decision into a pure `filter.ts` beside `pacing.ts`, (4) a CLAUDE.md rule for RLS migrations, and (1) a GitHub Actions workflow that becomes the only path to production (Vercel git auto-deploy for `main` turned off via `vercel.json`).

**Tech Stack:** Next.js 14 App Router, vitest (jsdom, `vitest.setup.ts`), Supabase Edge Functions (Deno), GitHub Actions, Vercel CLI.

## Global Constraints

- Budget ~1 day, highest-leverage only. **No new infrastructure**: no Docker, no local Supabase stack, no paid GitHub features (spec header).
- Package manager is **pnpm** (v11 locally; Node 22). Never npm.
- Verification trio everywhere (local and CI): `pnpm lint && pnpm test && pnpm exec tsc --noEmit`. Local `pnpm build` fails by design (placeholder `.env.local`); Vercel runs the real build at deploy time.
- Work on branch **`feature/test-reliability`**. Never push broken code to `main`; merging to `main` requires the verification trio green **and Bjorn's confirmation** (deploys to production).
- **Coordination:** the perf-cold-starts plan (commit d3825cd, `docs/superpowers/plans/2026-07-07-perf-cold-starts.md`) also modifies `supabase/functions/send-reminders/index.ts` (1000-row truncation fix). Before starting Task 2, check `git log --oneline -- supabase/functions/send-reminders/` — if that fix already landed, apply Task 2's edits on top of the current file (the extraction is the same; only surrounding lines differ).
- **Never log student/parent PII** (emails, names, submission contents) — applies to any code touched in `send-reminders`.
- Edge-function deploys are manual: `supabase functions deploy send-reminders --no-verify-jwt` (the function does its own `x-cron-secret` gate; `verify_jwt` must stay false).
- Non-goals (do NOT add): tests for `actions/settings.ts` / `students.ts` / `join.ts`, new component render tests, checkout/portal route tests, coverage thresholds, e2e.

## File Structure

- Create: `app/__tests__/stripe-webhook.test.ts` — webhook route tests (mock Stripe signature check + admin client, style of existing route tests).
- Modify: `app/api/stripe/webhook/route.ts` — capture Supabase errors, return 500.
- Create: `supabase/functions/send-reminders/filter.ts` — pure per-row reminder decision (Deno-compatible relative imports, like `pacing.ts`).
- Create: `supabase/functions/send-reminders/filter.test.ts` — vitest (picked up automatically, like `pacing.test.ts`).
- Modify: `supabase/functions/send-reminders/index.ts` — delegate the per-row decision to `filter.ts`; keeps fetching, grouping, sending, stamping.
- Modify: `CLAUDE.md` — RLS-migration test rule in Gotchas & Conventions.
- Create: `.github/workflows/ci.yml` — `check` job (every push/PR) + `deploy` job (`main` only, `needs: check`).
- Modify: `vercel.json` — add `git.deploymentEnabled.main: false`.

---

### Task 1: Stripe webhook — return 500 on DB errors

The route currently ignores every Supabase error and returns 200, so Stripe never retries and a paid subscription's state change is silently dropped. Fix: any school-lookup or update error → 500 (Stripe retries with backoff up to ~3 days). "No school matches the customer" stays 200 — genuinely nothing to do (checkout persists `stripe_customer_id` before the Checkout session exists, so event ordering can't cause a spurious not-found).

**Files:**
- Create: `app/__tests__/stripe-webhook.test.ts`
- Modify: `app/api/stripe/webhook/route.ts:27-45`

**Interfaces:**
- Consumes: `POST` from `@/app/api/stripe/webhook/route`; `resolveBillingUpdate` (`lib/billing/webhook.ts`, pure, already tested — used unmocked).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/test-reliability
```

- [ ] **Step 2: Write the failing tests**

Create `app/__tests__/stripe-webhook.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Control Stripe signature verification: constructEvent returns the injected
// event, or throws when `signatureValid` is false.
let incomingEvent: unknown
let signatureValid: boolean
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => {
        if (!signatureValid) throw new Error('bad signature')
        return incomingEvent
      },
    },
  }),
}))

// Admin client mock: injectable results for the school lookup (maybeSingle)
// and for updates; records every update call.
let lookupResult: { data: { id: string; grace_until: string | null } | null; error: { message: string } | null }
let updateResult: { error: { message: string } | null }
let lookupCalls: number
let updateCalls: Array<{ patch: Record<string, unknown>; column: string; value: unknown }>
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            lookupCalls++
            return lookupResult
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          updateCalls.push({ patch, column, value })
          return Promise.resolve(updateResult)
        },
      }),
    }),
  }),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function req(withSignature = true) {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: withSignature ? { 'stripe-signature': 'sig' } : undefined,
    body: '{}',
  })
}

// invoice.payment_failed resolves to the stateful grace branch (patch = {}).
const paymentFailedEvent = { type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } }
// customer.subscription.deleted resolves to the plain-patch branch.
const subscriptionDeletedEvent = {
  type: 'customer.subscription.deleted',
  data: { object: { id: 'sub_1', customer: 'cus_1' } },
}

beforeEach(() => {
  signatureValid = true
  incomingEvent = { type: 'some.unhandled.event', data: { object: {} } }
  lookupResult = { data: null, error: null }
  updateResult = { error: null }
  lookupCalls = 0
  updateCalls = []
})

describe('POST /api/stripe/webhook — signature', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await POST(req(false))
    expect(res.status).toBe(400)
  })

  it('returns 400 when signature verification fails', async () => {
    signatureValid = false
    const res = await POST(req())
    expect(res.status).toBe(400)
  })
})

describe('POST /api/stripe/webhook — patch branch', () => {
  it('returns 200 and touches nothing for unhandled event types', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(lookupCalls).toBe(0)
    expect(updateCalls).toHaveLength(0)
  })

  it('applies the patch by customer id and returns 200', async () => {
    incomingEvent = subscriptionDeletedEvent
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].patch).toMatchObject({ subscription_status: 'canceled' })
    expect(updateCalls[0].column).toBe('stripe_customer_id')
    expect(updateCalls[0].value).toBe('cus_1')
  })

  it('returns 500 when the patch update fails so Stripe retries', async () => {
    incomingEvent = subscriptionDeletedEvent
    updateResult = { error: { message: 'db down' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})

describe('POST /api/stripe/webhook — grace branch (invoice.payment_failed)', () => {
  it('starts the grace clock when grace_until is null', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: { id: 'school_1', grace_until: null }, error: null }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].column).toBe('id')
    expect(updateCalls[0].value).toBe('school_1')
    expect(typeof updateCalls[0].patch.grace_until).toBe('string')
  })

  it('leaves an already-running grace clock untouched', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: { id: 'school_1', grace_until: '2026-07-10T00:00:00.000Z' }, error: null }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(0)
  })

  it('returns 200 when no school matches the customer (nothing to do)', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: null, error: null }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(0)
  })

  it('returns 500 when the school lookup fails', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: null, error: { message: 'db down' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })

  it('returns 500 when the grace update fails', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: { id: 'school_1', grace_until: null }, error: null }
    updateResult = { error: { message: 'db down' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 3: Run tests to verify the right ones fail**

Run: `pnpm exec vitest run app/__tests__/stripe-webhook.test.ts`
Expected: the three "returns 500" tests FAIL (route currently returns 200 — the bug); all other tests PASS.

- [ ] **Step 4: Fix the route**

In `app/api/stripe/webhook/route.ts`, replace everything from `if (update.setGraceIfNull) {` to the end of the function (currently lines 27–45) with:

```ts
  if (update.setGraceIfNull) {
    const { data: school, error: lookupError } = await admin
      .from('schools')
      .select('id, grace_until')
      .eq('stripe_customer_id', update.customerId)
      .maybeSingle()
    // 500 → Stripe retries with backoff. A swallowed error drops the event forever.
    if (lookupError) return new Response('school lookup failed', { status: 500 })
    if (school && !school.grace_until) {
      const { error: graceError } = await admin
        .from('schools')
        .update({ grace_until: new Date(Date.now() + GRACE_MS).toISOString() })
        .eq('id', school.id)
      if (graceError) return new Response('grace update failed', { status: 500 })
    }
    return new Response('ok', { status: 200 })
  }

  if (Object.keys(update.patch).length > 0) {
    const { error: patchError } = await admin
      .from('schools')
      .update(update.patch)
      .eq('stripe_customer_id', update.customerId)
    if (patchError) return new Response('school update failed', { status: 500 })
  }
  return new Response('ok', { status: 200 })
```

(Do not log the error objects — Stripe retries carry the signal; Supabase error messages can embed row data.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run app/__tests__/stripe-webhook.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 6: Full verification and commit**

Run: `pnpm lint && pnpm test && pnpm exec tsc --noEmit`
Expected: all green (555 existing + 10 new tests).

```bash
git add app/__tests__/stripe-webhook.test.ts app/api/stripe/webhook/route.ts
git commit -m "fix: Stripe webhook returns 500 on DB errors so Stripe retries"
```

---

### Task 2: Extract the reminder per-row filter into `filter.ts`

Behavior-identical refactor: the "should this assignment trigger a reminder" decision moves out of `index.ts` into a pure module beside `pacing.ts`. `index.ts` keeps fetching, per-student grouping, sending, and stamping. The student-email check stays in `index.ts` (it's about addressing, not the remind decision).

> **Coordination check first:** run `git log --oneline -5 -- supabase/functions/send-reminders/`. If the perf-cold-starts truncation fix has landed, `index.ts` will have pagination around the query — the loop-body edits below still apply verbatim; only re-locate them inside the paginated loop.

**Files:**
- Create: `supabase/functions/send-reminders/filter.ts`
- Create: `supabase/functions/send-reminders/filter.test.ts`
- Modify: `supabase/functions/send-reminders/index.ts:16-17` (imports), `:32-42` (remove `daysUntil`), `:152-188` (loop body)

**Interfaces:**
- Consumes: `resolvePreset(cadence: unknown): PacingPreset` and `isDue(daysLeft: number, lastRemindedAt: string | null, preset: PacingPreset): boolean` from `./pacing.ts`.
- Produces: `shouldRemind(row: ReminderRow): ReminderDecision | null` and `daysUntil(isoDate: string): number` from `filter.ts`, where `ReminderDecision = { deadline: string; daysLeft: number }` (`daysLeft` negative = overdue). `index.ts` and the tests consume these.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/send-reminders/filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldRemind, daysUntil, type ReminderRow } from './filter'

const DAY_MS = 24 * 60 * 60 * 1000
// ISO date (YYYY-MM-DD) n days from now — matches form_templates.deadline's shape.
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)
// ISO timestamp n days ago — matches last_reminded_at's shape.
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

// A row that SHOULD remind: no submission, active exchange, reminders on,
// cadence normale, deadline 30 days out, never reminded.
function baseRow(): ReminderRow {
  return {
    last_reminded_at: null,
    form_templates: {
      deadline: inDays(30),
      exchanges: { archived_at: null, reminders_enabled: true, reminder_cadence: 'normale' },
    },
    submissions: null,
  }
}

describe('daysUntil', () => {
  it('is 0 today, positive in the future, negative in the past', () => {
    expect(daysUntil(inDays(0))).toBe(0)
    expect(daysUntil(inDays(10))).toBe(10)
    expect(daysUntil(inDays(-3))).toBe(-3)
  })
})

describe('shouldRemind — submission status', () => {
  it('reminds when there is no submission', () => {
    expect(shouldRemind(baseRow())).not.toBeNull()
  })

  it('skips approved and submitted', () => {
    for (const status of ['approved', 'submitted']) {
      const row = baseRow()
      row.submissions = { status }
      expect(shouldRemind(row)).toBeNull()
    }
  })

  it('reminds for draft and rejected', () => {
    for (const status of ['draft', 'rejected']) {
      const row = baseRow()
      row.submissions = { status }
      expect(shouldRemind(row)).not.toBeNull()
    }
  })

  it('handles the PostgREST array shape for submissions', () => {
    const skipped = baseRow()
    skipped.submissions = [{ status: 'approved' }]
    expect(shouldRemind(skipped)).toBeNull()

    const reminded = baseRow()
    reminded.submissions = []
    expect(shouldRemind(reminded)).not.toBeNull()
  })
})

describe('shouldRemind — exchange settings', () => {
  it('skips archived exchanges', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.archived_at = '2026-07-01T00:00:00Z'
    expect(shouldRemind(row)).toBeNull()
  })

  it('skips when automatic reminders are turned off', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.reminders_enabled = false
    expect(shouldRemind(row)).toBeNull()
  })

  it('still reminds when reminders_enabled is null (legacy rows)', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.reminders_enabled = null
    expect(shouldRemind(row)).not.toBeNull()
  })
})

describe('shouldRemind — deadline and pacing', () => {
  it('skips when the form has no deadline', () => {
    const row = baseRow()
    row.form_templates!.deadline = null
    expect(shouldRemind(row)).toBeNull()
  })

  it('returns the deadline and negative daysLeft when overdue', () => {
    const row = baseRow()
    row.form_templates!.deadline = inDays(-3)
    const decision = shouldRemind(row)
    expect(decision).not.toBeNull()
    expect(decision!.deadline).toBe(inDays(-3))
    expect(decision!.daysLeft).toBeLessThan(0)
  })

  it('respects the cadence via last_reminded_at (normale = weekly far out)', () => {
    const tooSoon = baseRow()
    tooSoon.last_reminded_at = ago(2)
    expect(shouldRemind(tooSoon)).toBeNull()

    const due = baseRow()
    due.last_reminded_at = ago(7.2)
    expect(shouldRemind(due)).not.toBeNull()
  })

  it('falls back to normale on an unknown cadence', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.reminder_cadence = 'weekly'
    row.last_reminded_at = ago(2)
    expect(shouldRemind(row)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run supabase/functions/send-reminders/filter.test.ts`
Expected: FAIL — cannot resolve `./filter`.

- [ ] **Step 3: Write `filter.ts`**

Create `supabase/functions/send-reminders/filter.ts`:

```ts
// Pure per-row reminder decision for send-reminders. No Deno globals and no
// path aliases — imported by index.ts (Deno, as './filter.ts') and unit-tested
// under vitest (filter.test.ts). tsconfig excludes supabase/functions, so
// vitest is the only automated check on this file.
//
// Decides whether one assignment row (as fetched by index.ts) should trigger
// a reminder today. index.ts keeps fetching, per-student grouping, sending,
// and stamping last_reminded_at.

import { resolvePreset, isDue } from './pacing.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// Whole days from now until an ISO date (UTC). Negative when the date is past.
export function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00Z`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

// The slice of the PostgREST assignment row this decision reads. The real row
// has more fields (id, student, form name) — structural typing accepts it.
export type ReminderRow = {
  last_reminded_at: string | null
  form_templates: {
    deadline: string | null
    exchanges: {
      archived_at: string | null
      reminders_enabled: boolean | null
      reminder_cadence: string | null
    } | null
  } | null
  submissions: { status: string } | { status: string }[] | null
}

export type ReminderDecision = { deadline: string; daysLeft: number }

// null = skip. Otherwise the deadline and whole days left (negative = overdue)
// that the grouping/email code needs.
export function shouldRemind(row: ReminderRow): ReminderDecision | null {
  // submissions is one-to-one with assignments, so PostgREST returns it as an
  // object (not an array). Handle both shapes defensively.
  const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
  const status = submission?.status
  if (status === 'approved' || status === 'submitted') return null

  const exchange = row.form_templates?.exchanges
  if (exchange?.archived_at) return null
  // Master switch: the organizer turned automatic reminders off for this
  // exchange. Manual « Relancer » is unaffected (it lives in the app).
  if (exchange?.reminders_enabled === false) return null

  const deadline = row.form_templates?.deadline
  if (!deadline) return null

  const daysLeft = daysUntil(deadline)
  // Unknown/missing cadence resolves to 'normale' — never fail the run on it.
  const preset = resolvePreset(exchange?.reminder_cadence)
  if (!isDue(daysLeft, row.last_reminded_at, preset)) return null

  return { deadline, daysLeft }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run supabase/functions/send-reminders/filter.test.ts`
Expected: all PASS. (Vite resolves the explicit `./pacing.ts` extension import; `pacing.test.ts` proves the directory is already in vitest's scope.)

- [ ] **Step 5: Rewire `index.ts`**

Three edits to `supabase/functions/send-reminders/index.ts`:

**Edit 1 — imports.** Replace:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolvePreset, isDue } from './pacing.ts'
```

with:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { shouldRemind } from './filter.ts'
```

Also update the header comment line

```ts
// interval math lives in ./pacing.ts (pure, unit-tested under vitest).
```

to:

```ts
// interval math lives in ./pacing.ts and the per-row decision in ./filter.ts
// (both pure, unit-tested under vitest).
```

**Edit 2 — delete the now-moved helper.** Remove the `daysUntil` function and its comment (and the `const DAY_MS = 24 * 60 * 60 * 1000` line, which nothing else in `index.ts` uses):

```ts
const DAY_MS = 24 * 60 * 60 * 1000

...

// Whole days from now until an ISO date (UTC). Negative when the date is past.
function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00Z`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}
```

(Keep `type ReminderForm` — still used by grouping.)

**Edit 3 — loop body.** Replace the per-row filtering block:

```ts
  for (const row of (rows ?? []) as any[]) {
    // submissions is one-to-one with assignments, so PostgREST returns it as an
    // object (not an array). Handle both shapes defensively.
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status: string | undefined = submission?.status
    if (status === 'approved' || status === 'submitted') continue

    const exchange = row.form_templates?.exchanges
    if (exchange?.archived_at) continue
    // Master switch: the organizer turned automatic reminders off for this
    // exchange. Manual « Relancer » is unaffected (it lives in the app).
    if (exchange?.reminders_enabled === false) continue

    const deadline: string | undefined = row.form_templates?.deadline
    if (!deadline) continue

    const daysLeft = daysUntil(deadline)
    // Unknown/missing cadence resolves to 'normale' — never fail the run on it.
    const preset = resolvePreset(exchange?.reminder_cadence)
    if (!isDue(daysLeft, row.last_reminded_at, preset)) continue

    const student = row.student
    if (!student?.email) continue

    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        forms: [],
        assignmentIds: [],
        exchangeNames: new Set<string>(),
      })
    }
    const bucket = perStudent.get(student.email)!
    bucket.forms.push({ name: row.form_templates.name, deadline, overdue: daysLeft < 0 })
    bucket.assignmentIds.push(row.id)
    if (exchange?.name) bucket.exchangeNames.add(exchange.name)
  }
```

with:

```ts
  for (const row of (rows ?? []) as any[]) {
    const decision = shouldRemind(row)
    if (!decision) continue

    const student = row.student
    if (!student?.email) continue

    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        forms: [],
        assignmentIds: [],
        exchangeNames: new Set<string>(),
      })
    }
    const bucket = perStudent.get(student.email)!
    bucket.forms.push({
      name: row.form_templates.name,
      deadline: decision.deadline,
      overdue: decision.daysLeft < 0,
    })
    bucket.assignmentIds.push(row.id)
    const exchangeName = row.form_templates?.exchanges?.name
    if (exchangeName) bucket.exchangeNames.add(exchangeName)
  }
```

- [ ] **Step 6: Best-effort Deno check of `index.ts`**

vitest and tsc do not compile `index.ts` (tsconfig excludes `supabase/functions`), so:

Run: `command -v deno >/dev/null && deno check supabase/functions/send-reminders/index.ts || echo "deno not installed — rely on careful review"`
Expected: no type errors, or the skip message. Either way, re-read the final `index.ts` diff and confirm: no remaining reference to `daysUntil`, `resolvePreset`, `isDue`, or `DAY_MS`.

- [ ] **Step 7: Full verification and commit**

Run: `pnpm lint && pnpm test && pnpm exec tsc --noEmit`
Expected: all green.

```bash
git add supabase/functions/send-reminders/filter.ts supabase/functions/send-reminders/filter.test.ts supabase/functions/send-reminders/index.ts
git commit -m "refactor: extract send-reminders per-row filter into tested pure module"
```

(Deploying the edge function is deferred to Task 5's handover — behavior is identical, so there's no urgency, and it must not race the perf-cold-starts deploy.)

---

### Task 3: CLAUDE.md rule — RLS migrations must run the SQL tests

Turns the four dormant tests in `supabase/tests/` (C1, H1, H2, L2) into a living gate. No harness — convention only (a proper harness is deferred; the multi-tenancy spec's D1 suite supersedes the test list if it ships first, and this rule stays valid either way because it says "whatever lives in `supabase/tests/`").

**Files:**
- Modify: `CLAUDE.md` (Gotchas & Conventions, right after the RLS bullet)

**Interfaces:** none.

- [ ] **Step 1: Add the rule**

In `CLAUDE.md`, the first bullet under `## Gotchas & Conventions` currently ends with `…never a client-side service-role workaround.` Insert a new bullet directly after it:

```markdown
- **Any migration that creates or alters RLS policies must end with running the SQL tests in `supabase/tests/`** (via MCP `execute_sql`) and confirming each prints `ROLLBACK_OK`. They self-rollback and are safe against the real DB.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: RLS migrations must run supabase/tests/ SQL tests (ROLLBACK_OK gate)"
```

---

### Task 4: CI workflow — `check` on every push/PR, `deploy` from `main`

CI becomes the only path to production (the flip that enforces this is Task 5). The `check` job mirrors the pre-push hook exactly — same trio, same rationale: CI has no real env vars, so `tsc --noEmit` stands in for `pnpm build`; Vercel runs the real build at deploy time. The suite does not read `.env.local` (the pre-push hook already passes without real secrets), so no CI env vars are needed for `check`.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: GitHub repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (set up in Task 5 — the `deploy` job is inert until then and only runs on `main` anyway).
- Produces: the `check` job that Task 5's flip makes mandatory.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm exec tsc --noEmit

  # Sole path to production once vercel.json sets git.deploymentEnabled.main: false.
  # Builds on Vercel's infra (env vars live there), not in Actions.
  deploy:
    needs: check
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - run: npm install --global vercel@latest
      - run: vercel deploy --prod --yes --token=${{ secrets.VERCEL_TOKEN }}
```

- [ ] **Step 2: Commit and push the branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: check (lint+test+tsc) on every push/PR; deploy job for main"
git push -u origin feature/test-reliability
```

(The push event runs the workflow from this branch's ref, so `check` exercises immediately; `deploy` is skipped off-`main`. The branch push also creates a normal Vercel preview — untouched by this work.)

- [ ] **Step 3: Verify `check` is green on the branch**

Run: `gh run watch --exit-status $(gh run list --branch feature/test-reliability --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: `check` job SUCCESS, `deploy` job skipped. (If `gh` is unauthenticated, check the repo's Actions tab instead.)

- [ ] **Step 4 (optional, spec verification): prove a red test fails `check`**

Only if Bjorn wants the demonstration: push a commit with a deliberately failing assertion, watch the run go red, then `git revert` it and push. Skip by default — Step 3 already proves wiring.

---

### Task 5: Deploy handover — secrets, `vercel.json` flip, merge, verify

Order matters: secrets first (so `deploy` can succeed), flip + merge second. If the flip merged without secrets, pushes to `main` would deploy nothing — prod safely frozen on the last deploy, but frozen.

**Files:**
- Modify: `vercel.json`

**Interfaces:**
- Consumes: the `deploy` job from Task 4; repo secrets.
- Produces: production deploys happen only via CI from this point on.

- [ ] **Step 1: Set the non-sensitive secrets from the local Vercel link**

`.vercel/project.json` already holds both IDs:

```bash
gh secret set VERCEL_ORG_ID --body "$(node -e "console.log(require('./.vercel/project.json').orgId)")"
gh secret set VERCEL_PROJECT_ID --body "$(node -e "console.log(require('./.vercel/project.json').projectId)")"
gh secret list
```

Expected: both listed. (For reference: orgId `team_EZu7cbwKL829127wRjACF388`, projectId `prj_JcJagcrffg31OIH5BgHAZ553SQ0D`.)

- [ ] **Step 2: MANUAL (Bjorn) — create the Vercel token**

Bjorn: create a token at https://vercel.com/account/settings/tokens (scope: the eazyexchange team; expiry: your call) and add it as the `VERCEL_TOKEN` repo secret at https://github.com/<owner>/<repo>/settings/secrets/actions (or run `gh secret set VERCEL_TOKEN` and paste). **Do not paste the token into the Claude conversation.** Confirm with `gh secret list` showing all three.

- [ ] **Step 3: Flip Vercel git auto-deploy for `main`**

Replace the entire content of `vercel.json` (currently just the regions pin) with:

```json
{
  "regions": ["fra1"],
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

(Only `main` is disabled — branch pushes keep their automatic preview deploys.)

- [ ] **Step 4: Commit and push the flip on the branch**

```bash
git add vercel.json
git commit -m "ci: disable Vercel git auto-deploy for main — CI owns production deploys"
git push
```

Expected: branch `check` run green again.

- [ ] **Step 5: MANUAL GATE (Bjorn) — confirm the merge**

Merging deploys to production and changes how production deploys work. Present Bjorn the summary and wait for explicit go-ahead.

- [ ] **Step 6: Merge to `main` and push**

```bash
git checkout main
git pull                     # local main has drifted behind origin before — always sync first
git merge --no-ff feature/test-reliability -m "merge: test-reliability hardening (CI-owned deploys, webhook 500s, reminder filter)"
git push
```

(The pre-push hook runs the trio one more time locally.)

- [ ] **Step 7: Verify CI deploys production**

Run: `gh run watch --exit-status $(gh run list --branch main --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: `check` then `deploy` both SUCCESS. Then confirm the new production deployment exists and is READY (Vercel dashboard, `vercel ls`, or the Vercel MCP `list_deployments`) and that its source is the CLI (not git). Confirm no *second* git-triggered production deploy appeared (the flip works).

- [ ] **Step 8: Deploy the edge function and spot-check**

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

Expected: new version deployed, `verify_jwt` false. Spot-check the next cron run's response counts (`{"students":N,"emailsSent":M}`) against the previous run via Supabase function logs — the filter refactor is behavior-identical, so counts should look normal. If the perf-cold-starts branch is mid-flight on this same function, coordinate before deploying.

- [ ] **Step 9: Delete the branch and close out**

```bash
git branch -d feature/test-reliability
git push origin --delete feature/test-reliability
```

Update `.superpowers/sdd/progress.md` and the auto-memory phase entry (sub-project complete; note that the pre-push hook stays as fast local feedback but CI is now the gate).

---

## Verification (from the spec)

- `pnpm lint && pnpm test && pnpm exec tsc --noEmit` green locally and in the CI `check` job.
- Webhook: 10 new route tests pass; simulated DB failures return 500.
- Reminders: extracted filter tests pass; deployed function behaves identically (spot-check one cron run's response counts).
- CI pipeline: a branch push runs `check` only; a `main` push runs `check` then `deploy`; (optional) a deliberately red test on a branch fails `check`.
