# Multi-Tenancy & Data Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant isolation regression-guarded and abuse-resistant: an admin-client allowlist + the walled-service-role rule in CLAUDE.md (D1b/D2), partner-exchange coverage in the RLS test matrix (D1 delta), two small RLS-convention migrations (D3), and fair-share reminder pacing + a per-exchange application cap (D4).

**Architecture:** The RLS regression harness itself is built by Phase W1 of the security-hardening plan (`docs/superpowers/plans/2026-07-07-security-hardening.md`) — this plan **extends** it rather than duplicating it. Pure logic (fair-share rotation/budget) lives in a new Deno-and-vitest-compatible module beside `pacing.ts`; enforcement changes are one action-level cap check and two one-policy migrations.

**Tech Stack:** Next.js 14 server actions, Supabase (Postgres RLS, Edge Functions/Deno), vitest, the W1 RLS harness (`tests/rls/`, `pnpm test:rls`).

**Spec:** `docs/superpowers/specs/2026-07-07-multi-tenancy-isolation-design.md`

## Relationship to other in-flight plans (read before executing)

Three 2026-07-07 sub-projects touch the same ground. This plan is written to compose with them:

1. **Security-hardening plan, Phase W1 (Tasks 1–6)** builds the RLS harness the multi-tenancy spec's D1 calls for: two-school fixture world, four personas, deny/allow matrix over every table + all three storage buckets, CI job, reviewer runbook. **Planning decision (2026-07-07): D1's "two-tenant RLS test suite" is satisfied by W1 plus this plan's Task 5 delta** (W1's fixture exchange has `school_b_id = null` — no shared exchange, so the partner boundary the multi-tenancy spec singles out is untested there). Tasks 5–7 here **hard-require the W1 harness** (`tests/rls/db.ts` + `seed.ts` + `matrix.test.ts` present, `pnpm test:rls` green). Tasks 1–4 have no such dependency.
2. **Perf/cold-starts spec, item 2** rewrites the `send-reminders` fetch (filtered + paginated, fixes the 1,000-row truncation). The multi-tenancy spec sequences fair-share **after** that lands. Task 4 has a preflight check; its two edits (add `school_id` to the select embeds; replace the send loop) are the same in both worlds because grouping always happens over the accumulated rows.
3. **Test-reliability spec** plans its own `.github/workflows/ci.yml` (check + deploy jobs) while W1 creates `ci.yml` with unit + rls jobs. Whichever lands second merges into the existing file — flag it at execution time, don't clobber.

## Global Constraints

- Package manager is **pnpm**; never npm.
- Verification gate for every task: `pnpm lint` + `pnpm test` + `npx tsc --noEmit`. (`pnpm build` fails locally on placeholder `.env.local` — tsc is the local substitute; Vercel builds `main`.) Tasks 5–7 additionally run `pnpm test:rls`.
- Prod migrations are applied via MCP `apply_migration` at ship time — **never `supabase db push`** (known drift trap). Locally: `pnpm exec supabase db reset`.
- Neither migration in this plan changes any column, so `types/db.ts` needs no edit (the migration-task rule from the email-controls project is satisfied vacuously — say so in the task report).
- **No student/parent PII in logs** — fair-share logs school UUIDs and counts only; never emails or names.
- New/changed RLS policies wrap `auth.uid()` / helper calls as `(select …)` per the initplan convention (`20260705000004`), except where mirroring an existing policy's exact USING text.
- Edge-function deploys must preserve `verify_jwt = false` for `send-reminders` (confirm `supabase/config.toml` or pass `--no-verify-jwt`).
- Funnel-facing copy is bilingual EN/FR (matches `NOTICE` in `ApplicationStartForm.tsx`); organizer UI copy is French.
- Work happens on branch `feature/multi-tenancy-isolation`. Merging to `main` = prod deploy: full gate green + Bjorn's confirmation. Before merging, check local `main` is in sync with `origin/main` (known drift gotcha).
- Implementers stage **only named files** (`git add <file> …`), never `git add -A` (PII-sweep gotcha).
- One-way door reminder (spec D5): the tenant graph stays one hop deep — nothing in this plan (or its follow-ups) may entangle a school in other tenants' networks.

## File Structure

- `lib/supabase/__tests__/admin-allowlist.test.ts` — create (Task 1): allowlist guard.
- `CLAUDE.md` — modify (Task 1): walled-service-role rule in Gotchas.
- `actions/applications.ts` — modify (Task 2): `APPLICATION_CAP_PER_EXCHANGE` + cap check in `startApplication`.
- `components/ApplicationStartForm.tsx` — modify (Task 2): `closed` notice.
- `actions/__tests__/applications.test.ts`, `components/__tests__/ApplicationStartForm.test.tsx` — modify (Task 2).
- `supabase/functions/send-reminders/fair-share.ts` + `fair-share.test.ts` — create (Task 3): pure rotation/budget.
- `supabase/functions/send-reminders/index.ts` — modify (Task 4): fair-share send loop + per-school counts.
- `tests/rls/seed.ts`, `tests/rls/matrix.test.ts`, `docs/security/rls-testing.md` — modify (Task 5): shared-exchange fixtures + partner-boundary block.
- `supabase/migrations/20260707000004_feedback_school_with_check.sql` — create (Task 6).
- `supabase/migrations/20260707000005_submissions_update_with_check.sql` — create (Task 7).

---

### Task 1: Branch, admin-client allowlist guard, CLAUDE.md rule (D1b + D2)

**Files:**
- Create: `lib/supabase/__tests__/admin-allowlist.test.ts`
- Modify: `CLAUDE.md` (Gotchas & Conventions section)

**Interfaces:**
- Consumes: nothing (pure filesystem scan, runs in the main vitest suite).
- Produces: the guard test other tasks must keep green; the documented rule.

Note: the spec estimated "8 production files today"; the verified count (grep, 2026-07-07) is **13**. The allowlist below is the real list.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b feature/multi-tenancy-isolation
```

- [ ] **Step 2: Write the guard test — deliberately missing one entry, to prove it detects drift**

Create `lib/supabase/__tests__/admin-allowlist.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

// D1/D2 (multi-tenancy spec): RLS is the isolation layer; the service-role
// client (lib/supabase/admin — bypasses RLS) may only be imported from this
// reviewed allowlist. A new import is a design decision, not a convenience:
// prefer a scoped RLS policy; if the service role is genuinely required,
// extend this list deliberately in the same change and say why in the commit.
const ALLOWLIST = [
  'actions/applications.ts',
  'actions/exchanges.ts',
  'actions/join.ts',
  'actions/settings.ts',
  'app/api/stripe/webhook/route.ts',
  'app/apply/[slug]/page.tsx',
  'app/auth/callback/route.ts',
  'app/billing/checkout/route.ts',
  'app/billing/page.tsx',
  'app/billing/portal/route.ts',
  'app/billing/return/page.tsx',
  'lib/auth/provision.ts',
  // 'lib/rate-limit.ts',  // ← RED step: restore in Step 4
].sort()

// vitest runs with cwd = repo root (where vitest.config.ts lives); avoid
// __dirname, which is unreliable under vitest's ESM transform.
const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'actions', 'lib', 'components']
const ROOT_FILES = ['middleware.ts']
const IMPORT_RE = /from\s+['"][^'"]*supabase\/admin['"]/

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('service-role admin-client allowlist', () => {
  it('only allowlisted files import lib/supabase/admin', () => {
    const candidates = [
      ...SCAN_DIRS.flatMap((d) => tsFiles(join(ROOT, d))),
      ...ROOT_FILES.map((f) => join(ROOT, f)).filter((p) => existsSync(p)),
    ]
    const importers = candidates
      .filter((f) => IMPORT_RE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      .sort()
    expect(importers).toEqual(ALLOWLIST)
  })
})
```

- [ ] **Step 3: Run it — verify it FAILS (proves detection)**

Run: `pnpm test -- admin-allowlist`
Expected: FAIL — the received array contains `lib/rate-limit.ts`, the expected array doesn't.

- [ ] **Step 4: Restore the full allowlist**

Uncomment `'lib/rate-limit.ts',` (remove the `// ← RED step` comment too).

- [ ] **Step 5: Run it — verify it PASSES**

Run: `pnpm test -- admin-allowlist`
Expected: PASS, 1 test.

- [ ] **Step 6: Add the D2 rule to CLAUDE.md**

In `CLAUDE.md` → "Gotchas & Conventions", directly after the existing bullet "**RLS is the most error-prone area.** …", add:

```markdown
- **RLS is the isolation layer; the service role is walled in.** `lib/supabase/admin` (bypasses RLS) may only be imported by the files allowlisted in `lib/supabase/__tests__/admin-allowlist.test.ts` — the anonymous funnel, auth/provisioning, billing/Stripe, and the rate limiter. Any new import is a design decision, not a convenience: prefer a scoped RLS policy; if the service role is genuinely required, extend the allowlist deliberately in the same change.
```

- [ ] **Step 7: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add lib/supabase/__tests__/admin-allowlist.test.ts CLAUDE.md
git commit -m "test: admin-client allowlist guard + walled-service-role rule (D1b/D2)"
```

---

### Task 2: Funnel sanity cap (D4)

**Files:**
- Modify: `actions/applications.ts` (result type ~line 44, `startApplication` after the `if (existing)` block ~line 97)
- Modify: `components/ApplicationStartForm.tsx`
- Test: `actions/__tests__/applications.test.ts`, `components/__tests__/ApplicationStartForm.test.tsx`

**Interfaces:**
- Produces: `APPLICATION_CAP_PER_EXCHANGE = 2000` (exported const), `StartApplicationResult` gains `| { closed: true }`.
- Consumers: only `ApplicationStartForm.tsx` branches on `StartApplicationResult` (verified: `ApplyEntry.tsx` passes results through unchanged).

Cap number decision (spec left it to the plan): **2000** per exchange. Real cohorts are 20–60 students; 2000 is pure abuse headroom against rotating-IP bloat, invisible to legitimate use.

- [ ] **Step 1: Write the failing action tests**

In `actions/__tests__/applications.test.ts`:

(a) add `applicationCount: number` to the `scenario` type declaration (after `rateLimitAllowed: boolean`), and `applicationCount: 0,` to the `scenario = { … }` object in the top-level `beforeEach`.

(b) in `builder()`, replace `select: () => b,` with a head-count-aware version:

```ts
    select: (_cols?: string, opts?: { count?: 'exact'; head?: boolean }) => {
      // startApplication's cap check: .select('id', { count: 'exact', head: true }).eq(…)
      if (opts?.head) return { eq: async () => ({ count: scenario.applicationCount, error: null }) }
      return b
    },
```

(c) append inside `describe('startApplication', …)`:

```ts
  it('at the per-exchange cap: { closed: true }, no insert, no email', async () => {
    scenario.applicationCount = 2000
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ closed: true })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
  it('one under the cap still inserts', async () => {
    scenario.applicationCount = 1999
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect('token' in res).toBe(true)
  })
  it('an existing draft is still resumable past the cap (cap only blocks new rows)', async () => {
    scenario.applicationCount = 2000
    scenario.application = { id: 'app-1', status: 'draft', resume_token: 'tok-old' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'draft' })
  })
```

- [ ] **Step 2: Run them — verify they fail**

Run: `pnpm test -- actions/__tests__/applications`
Expected: the at-cap test FAILS (`{ token: … }` returned instead of `{ closed: true }`). The under-cap and resumable tests already pass against the old code (the cap doesn't exist yet; the existing-row branch precedes the insert) — they are regression pins, not RED cases.

- [ ] **Step 3: Implement the cap in `actions/applications.ts`**

Above `export type StartApplicationResult` add:

```ts
// Hard sanity cap, not a product limit: no legitimate exchange approaches this
// (typical cohorts are 20–60 students). Protects the shared DB/storage from
// rotating-IP bulk fakes that the per-IP/per-email rate limits can't see.
export const APPLICATION_CAP_PER_EXCHANGE = 2000
```

Change the result type:

```ts
export type StartApplicationResult = { token: string } | { existing: 'draft' | 'submitted' } | { closed: true }
```

In `startApplication`, between the end of the `if (existing) { … }` block and `const token = randomToken()`, insert:

```ts
  // Per-exchange sanity cap — abuse guard only; existing applicants resumed
  // above are never affected. Fail open on a count error: a DB blip must not
  // block a legitimate applicant (same convention as the rate limiter).
  const { count, error: countError } = await admin
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('exchange_id', exchange.id)
  if (!countError && (count ?? 0) >= APPLICATION_CAP_PER_EXCHANGE) {
    return { closed: true }
  }
```

- [ ] **Step 4: Run the action tests — verify they pass**

Run: `pnpm test -- actions/__tests__/applications`
Expected: ALL PASS (existing cases untouched).

- [ ] **Step 5: Write the failing component test**

In `components/__tests__/ApplicationStartForm.test.tsx`, append inside the describe (reusing the file's `fillAndStart` helper):

```ts
  it('shows the closed notice when the cap refuses new applications', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ closed: true })
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    await fillAndStart(user)
    expect(await screen.findByText(/applications are closed for this exchange/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
```

Run: `pnpm test -- ApplicationStartForm` → Expected: FAIL (notice not rendered).

- [ ] **Step 6: Implement the notice in `components/ApplicationStartForm.tsx`**

Add to `NOTICE`:

```ts
  closed: {
    en: 'Applications are closed for this exchange.',
    fr: 'Les candidatures sont fermées pour cet échange.',
  },
```

Change the notice state to `useState<'draft' | 'submitted' | 'closed' | null>(null)` and in `start()` replace `setNotice(res.existing)` with:

```ts
      if ('closed' in res) {
        setNotice('closed')
        setLoading(false)
        return
      }
      setNotice(res.existing)
```

- [ ] **Step 7: Run component tests — verify pass**

Run: `pnpm test -- ApplicationStartForm`
Expected: ALL PASS.

- [ ] **Step 8: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add actions/applications.ts components/ApplicationStartForm.tsx actions/__tests__/applications.test.ts components/__tests__/ApplicationStartForm.test.tsx
git commit -m "feat: per-exchange application sanity cap (2000) with structured closed response (D4)"
```

---

### Task 3: Fair-share pure module (D4)

**Files:**
- Create: `supabase/functions/send-reminders/fair-share.ts`
- Test: `supabase/functions/send-reminders/fair-share.test.ts` (picked up by the main vitest suite, like `pacing.test.ts`)

**Interfaces:**
- Produces: `rotateSchools(schoolIds: string[], runDate: Date): string[]` and `planFairShare<T>(entries: { schoolId: string; item: T }[], runDate: Date, perSchoolBudget: number): FairSharePlan<T>` where `FairSharePlan<T> = { send: T[]; perSchool: Record<string, { due: number; sending: number; budgetHit: boolean }> }`. No Deno globals, no path aliases (same constraint as `pacing.ts`).
- Consumed by: Task 4 (`index.ts`).

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/send-reminders/fair-share.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rotateSchools, planFairShare } from './fair-share'

// 2026-01-01T00:00:00Z is exactly day 20454 since epoch; 20454 % 3 === 0, so
// with three schools the sorted order is unrotated on d0 and shifts by one on d1.
const d0 = new Date('2026-01-01T08:00:00Z')
const d1 = new Date(d0.getTime() + 24 * 60 * 60 * 1000)

describe('rotateSchools', () => {
  it('is deterministic for a given day', () => {
    expect(rotateSchools(['b', 'c', 'a'], d0)).toEqual(rotateSchools(['a', 'b', 'c'], d0))
  })
  it('rotates by one position per day so no school is permanently last', () => {
    expect(rotateSchools(['a', 'b', 'c'], d0)).toEqual(['a', 'b', 'c'])
    expect(rotateSchools(['a', 'b', 'c'], d1)).toEqual(['b', 'c', 'a'])
  })
  it('dedupes and handles empty input', () => {
    expect(rotateSchools(['a', 'a'], d0)).toEqual(['a'])
    expect(rotateSchools([], d0)).toEqual([])
  })
})

describe('planFairShare', () => {
  const entries = [
    { schoolId: 'b', item: 'b1' },
    { schoolId: 'a', item: 'a1' },
    { schoolId: 'a', item: 'a2' },
    { schoolId: 'a', item: 'a3' },
  ]
  it('orders sends by school rotation, preserving input order within a school', () => {
    expect(planFairShare(entries, d0, 10).send).toEqual(['a1', 'a2', 'a3', 'b1'])
    expect(planFairShare(entries, d1, 10).send).toEqual(['b1', 'a1', 'a2', 'a3'])
  })
  it('truncates each school at the budget and flags it', () => {
    const plan = planFairShare(entries, d0, 2)
    expect(plan.send).toEqual(['a1', 'a2', 'b1'])
    expect(plan.perSchool).toEqual({
      a: { due: 3, sending: 2, budgetHit: true },
      b: { due: 1, sending: 1, budgetHit: false },
    })
  })
  it('handles empty input', () => {
    expect(planFairShare([], d0, 5)).toEqual({ send: [], perSchool: {} })
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `pnpm test -- fair-share`
Expected: FAIL — `Cannot find module './fair-share'`.

- [ ] **Step 3: Implement the module**

Create `supabase/functions/send-reminders/fair-share.ts`:

```ts
// Fair-share scheduling for send-reminders (multi-tenancy spec D4). Pure — no
// Deno globals and no path aliases: imported by index.ts (Deno, './fair-share.ts')
// and unit-tested under vitest (fair-share.test.ts), like ./pacing.ts.
//
// Two protections for the shared Resend quota:
//   - rotation: schools are visited in an order that rotates daily, so if a
//     run dies partway the same schools are not starved every day;
//   - budget: each school sends at most `perSchoolBudget` emails per run, so
//     one huge school cannot exhaust the quota. Truncated students are picked
//     up on the next run automatically — their last_reminded_at was never
//     stamped (stamping happens only after a successful send).

export type FairSharePlan<T> = {
  send: T[]
  // Keyed by school id (never PII) — safe to log as counts.
  perSchool: Record<string, { due: number; sending: number; budgetHit: boolean }>
}

const DAY_MS = 24 * 60 * 60 * 1000

export function rotateSchools(schoolIds: string[], runDate: Date): string[] {
  const sorted = [...new Set(schoolIds)].sort()
  if (sorted.length === 0) return []
  const offset = Math.floor(runDate.getTime() / DAY_MS) % sorted.length
  return [...sorted.slice(offset), ...sorted.slice(0, offset)]
}

export function planFairShare<T>(
  entries: { schoolId: string; item: T }[],
  runDate: Date,
  perSchoolBudget: number,
): FairSharePlan<T> {
  const bySchool = new Map<string, T[]>()
  for (const e of entries) {
    const list = bySchool.get(e.schoolId) ?? []
    list.push(e.item)
    bySchool.set(e.schoolId, list)
  }
  const send: T[] = []
  const perSchool: FairSharePlan<T>['perSchool'] = {}
  for (const schoolId of rotateSchools([...bySchool.keys()], runDate)) {
    const due = bySchool.get(schoolId)!
    const sending = due.slice(0, perSchoolBudget)
    send.push(...sending)
    perSchool[schoolId] = { due: due.length, sending: sending.length, budgetHit: sending.length < due.length }
  }
  return { send, perSchool }
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `pnpm test -- fair-share`
Expected: 6 passed.

- [ ] **Step 5: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add supabase/functions/send-reminders/fair-share.ts supabase/functions/send-reminders/fair-share.test.ts
git commit -m "feat: fair-share rotation + per-school budget module for send-reminders (D4)"
```

---

### Task 4: Fair-share integration in `send-reminders/index.ts` (D4)

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts`

**Interfaces:**
- Consumes: `planFairShare` from `./fair-share.ts` (Task 3).
- Produces: response JSON gains `perSchool`; env knob `REMINDER_SCHOOL_BUDGET` (default 150).

Testing note (per spec §4): `index.ts` is Deno and outside tsconfig — the budget/rotation math is covered by Task 3's vitest suite; this wiring is review-verified and spot-checked on the first deployed cron run (Task 8). Deploy is manual and happens in Task 8, not here.

- [ ] **Step 1: Preflight — check whether the perf/cold-starts fetch rewrite has landed**

Run: `grep -n "\.range(" supabase/functions/send-reminders/index.ts`

The spec sequences fair-share **after** the cold-starts pagination rewrite. If the grep finds nothing, the rewrite has not landed: **report this to the controller before proceeding.** Proceeding anyway is acceptable (the edits below are identical in both worlds and were written against the current single-fetch shape); the cost is a small textual merge when the cold-starts work lands, plus both changes must ship in the same manual edge-function deploy if they land together.

- [ ] **Step 2: Import + budget knob**

In `index.ts`, extend the pacing import area:

```ts
import { planFairShare } from './fair-share.ts'
```

Below the `CRON_SECRET` const add:

```ts
// Per-school per-run send budget (fair-share, multi-tenancy spec D4). Generous
// headroom — real cohorts are 20–60 students — not a punitive quota; schools
// that hit it are logged and their remainder sends next run.
const PER_SCHOOL_BUDGET = Number(Deno.env.get('REMINDER_SCHOOL_BUDGET') ?? '150')
```

- [ ] **Step 3: Carry the student's school through the query and grouping**

In the assignments select string, change the student embed from
`student:users!student_id(email, full_name)` to
`student:users!student_id(email, full_name, school_id)`
(locate the `.select(…)` wherever the current fetch shape puts it — single call today, page-fetcher after the cold-starts rewrite; the embed edit is the same).

Extend the `perStudent` map value type with `schoolId: string`:

```ts
  const perStudent = new Map<
    string,
    { name: string; schoolId: string; forms: ReminderForm[]; assignmentIds: string[]; exchangeNames: Set<string> }
  >()
```

and where a bucket is first created, add the field:

```ts
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        schoolId: student.school_id ?? 'unknown',
        forms: [],
        assignmentIds: [],
        exchangeNames: new Set<string>(),
      })
```

- [ ] **Step 4: Replace the send loop with the fair-share plan**

Replace:

```ts
  const nowIso = new Date().toISOString()
  let sent = 0
  for (const [email, { name, forms, assignmentIds, exchangeNames }] of perStudent) {
```

with:

```ts
  // Fair-share (multi-tenancy spec D4): rotate school order daily and cap each
  // school's sends per run so one big school can't exhaust the Resend quota or
  // starve schools later in the iteration. Truncated students retry next run
  // (their last_reminded_at is only stamped after a successful send).
  const entries = [...perStudent.entries()].map(([email, bucket]) => ({
    schoolId: bucket.schoolId,
    item: { email, ...bucket },
  }))
  const plan = planFairShare(entries, new Date(), PER_SCHOOL_BUDGET)

  const nowIso = new Date().toISOString()
  let sent = 0
  for (const { email, name, forms, assignmentIds, exchangeNames } of plan.send) {
```

(the loop body — subject, `sendEmail`, stamp — is unchanged).

After the loop, before the `return new Response(…)`, add:

```ts
  // School ids and counts only — never emails or names (PII rule).
  console.log('[send-reminders] fair-share per-school counts:', JSON.stringify(plan.perSchool))
```

and change the response to include the counts:

```ts
  return new Response(
    JSON.stringify({ students: perStudent.size, emailsSent: sent, perSchool: plan.perSchool }),
    { headers: { 'Content-Type': 'application/json' } },
  )
```

- [ ] **Step 5: Verify — vitest untouched, Deno check if available**

Run: `pnpm test` → Expected: same pass count as Task 3 (index.ts is outside vitest/tsconfig).
Run: `command -v deno >/dev/null && deno check supabase/functions/send-reminders/index.ts || echo "deno not installed — skip (checked at deploy)"`
Expected: either `Checked …` or the skip message. Also re-read the final diff: the loop body must destructure the same five names it used before.

- [ ] **Step 6: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add supabase/functions/send-reminders/index.ts
git commit -m "feat: fair-share school rotation + per-run budget in send-reminders (D4) — deploy pending"
```

---

### Task 5: Partner-exchange RLS coverage (D1 delta — REQUIRES the W1 harness)

**Files:**
- Modify: `tests/rls/seed.ts`, `tests/rls/matrix.test.ts`, `docs/security/rls-testing.md`

**Interfaces:**
- Consumes: the W1 harness — `Fixtures`/`seedFixtures`/`cleanupFixtures` from `tests/rls/seed.ts`; `readRows`, `runAs`, `writeOutcome`, `expectBlocked`, shared `fx` from `tests/rls/matrix.test.ts` (security-hardening plan Tasks 1–4).
- Produces: `Fixtures` gains `exchangeShared: string; templateShared: string`.

- [ ] **Step 1: HARD GATE — verify the harness exists and is green**

```bash
test -f tests/rls/db.ts && test -f tests/rls/seed.ts && test -f tests/rls/matrix.test.ts && echo HARNESS_OK || echo HARNESS_MISSING
```

If `HARNESS_MISSING`: **STOP.** Report to the controller — Phase W1 (Tasks 1–6) of `docs/superpowers/plans/2026-07-07-security-hardening.md` must execute and merge first; if it merged after this branch was cut, merge `main` into this branch now. Otherwise start the stack and confirm green before touching anything:

```bash
pnpm exec supabase start   # or: db reset, if already running
pnpm test:rls              # Expected: all pass before this task's changes
```

- [ ] **Step 2: Write the failing partner-boundary block**

Append to `tests/rls/matrix.test.ts` as a new top-level describe:

```ts
// ---------------------------------------------------------------------------
// PARTNER BOUNDARY (multi-tenancy spec D1): exchanges span two schools. A
// partner organizer sees the shared exchange and its enrollment rows — but
// never the other school's user profiles or templates. The tenant graph is
// one hop deep; these cases pin that edge.
// ---------------------------------------------------------------------------
describe('partner boundary on the shared exchange', () => {
  it('organizer B reads the shared exchange (pair scope, positive)', async () => {
    expect(await readRows(fx.orgB, (tx) =>
      tx`select id from exchanges where id = ${fx.exchangeShared}`)).toHaveLength(1)
  })
  it('organizer B reads enrollment rows on the shared exchange (positive)', async () => {
    expect(await readRows(fx.orgB, (tx) =>
      tx`select user_id from exchange_enrollments where exchange_id = ${fx.exchangeShared}`)).toHaveLength(1)
  })
  it('organizer B cannot read the enrolled partner student profile', async () => {
    expect(await readRows(fx.orgB, (tx) =>
      tx`select id from users where id = ${fx.studentA}`)).toHaveLength(0)
  })
  it('organizer B cannot read school A templates on the shared exchange', async () => {
    expect(await readRows(fx.orgB, (tx) =>
      tx`select id from form_templates where id = ${fx.templateShared}`)).toHaveLength(0)
  })
  it('organizer B cannot enroll a school A student', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into exchange_enrollments (exchange_id, user_id)
         values (${fx.exchangeShared}, ${fx.studentA})`))
  })
  it('organizer B can enroll their own student into the shared exchange (positive)', async () => {
    expect(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into exchange_enrollments (exchange_id, user_id)
         values (${fx.exchangeShared}, ${fx.studentB})`)).toBe(1)
  })
})
```

Run: `pnpm test:rls -- matrix`
Expected: FAIL — `fx.exchangeShared` is undefined (TypeScript may already fail compile: property missing on `Fixtures`).

- [ ] **Step 3: Add the shared-exchange fixtures to `tests/rls/seed.ts`**

Extend the `Fixtures` type with:

```ts
  exchangeShared: string; templateShared: string
```

Extend the `fx` initializer with:

```ts
    exchangeShared: id(), templateShared: id(),
```

In `seedFixtures`, after the `feedback` insert and before the storage-objects insert, add:

```ts
  // Shared exchange (school A ↔ school B) — the partner boundary the matrix's
  // partner-boundary block exercises. studentA's enrollment plus school A's
  // active template auto-creates an assignment via trg_assign_on_template_insert;
  // it is untracked here and removed by the exchange-delete cascade in cleanup.
  await sql`insert into exchanges (id, name, year, school_a_id, school_b_id, apply_slug, application_open)
    values (${fx.exchangeShared}, ${'RLS Échange partagé ' + suffix}, 2026,
      ${fx.schoolA}, ${fx.schoolB}, ${'rls-shared-' + suffix}, false)`
  await sql`insert into exchange_enrollments (exchange_id, user_id)
    values (${fx.exchangeShared}, ${fx.studentA})`
  await sql`insert into form_templates
      (id, exchange_id, school_id, name, description, type, kind, status, audience, deadline, created_by)
    values (${fx.templateShared}, ${fx.exchangeShared}, ${fx.schoolA}, ${'Fiche partagée ' + suffix}, null,
      'data_entry', 'online', 'active', 'all', current_date + 30, ${fx.orgA})`
```

In `cleanupFixtures`, change the exchange delete to cover both:

```ts
  await sql`delete from exchanges where id in (${fx.exchangeA}, ${fx.exchangeShared})`
```

- [ ] **Step 4: Run the full RLS suite — verify green**

Run: `pnpm test:rls`
Expected: ALL PASS — the six new partner cases plus every pre-existing W1 case (the new fixtures must not disturb them; if a W1 case now fails, the fixture bled into a shared assertion — fix the fixture, never the W1 assertion).

Per the harness convention: if one of the six **deny** cases fails, that is a real cross-tenant finding, not a test bug — stop and escalate.

- [ ] **Step 5: Note the partner block in the runbook**

In `docs/security/rls-testing.md`, add to the Layout list after the `matrix.test.ts` line:

```markdown
- `matrix.test.ts` also pins the **partner boundary**: a shared (two-school)
  exchange where the partner organizer sees the exchange + enrollment rows but
  not the other school's user profiles or templates.
```

- [ ] **Step 6: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit && pnpm test:rls
git add tests/rls/seed.ts tests/rls/matrix.test.ts docs/security/rls-testing.md
git commit -m "test(rls): partner-boundary coverage on a shared two-school exchange (D1)"
```

---

### Task 6: Feedback INSERT pins `school_id` (D3 — REQUIRES the W1 harness)

**Files:**
- Create: `supabase/migrations/20260707000004_feedback_school_with_check.sql`
- Modify: `tests/rls/matrix.test.ts`

**Interfaces:**
- Consumes: the deny `describe.each` block in `matrix.test.ts` (personas orgB/studentB via `uid()`), `writeOutcome`/`expectBlocked`.
- Produces: migration file (applied to prod in Task 8). No column change → no `types/db.ts` edit (state this in the report).

- [ ] **Step 1: Write the failing matrix case (this is live drift — expect RED)**

Append inside the existing `describe.each(…)('cross-tenant deny as %s', …)` callback, after the feedback-forge case:

```ts
  it('feedback: cannot stamp another school on own feedback (D3)', async () => {
    // Today only user_id is pinned — this insert SUCCEEDS until migration
    // 20260707000004 lands. uid() is the persona's own id; the school is A's.
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into feedback (user_id, school_id, type, message)
         values (${uid()}, ${fx.schoolA}, 'bug', 'cross-school stamp')`))
  })
```

Run: `pnpm test:rls -- matrix`
Expected: FAIL for both B personas — the insert is currently allowed (returns 1 row, not blocked). This failing test is the spec's D3 finding reproduced.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260707000004_feedback_school_with_check.sql`:

```sql
-- D3 (multi-tenancy spec 2026-07-07): the feedback INSERT policy only pinned
-- user_id, so any authenticated user could stamp another school's id on their
-- own feedback row. Trivial impact (feedback is read only via the service
-- role) but it is tenant-integrity drift — pin school_id to the caller's
-- school as well. my_school_id() is the STABLE SECURITY DEFINER helper from
-- 20260625000005/20260705000001; (select …) wrap per the initplan convention.
drop policy "users insert own feedback" on feedback;
create policy "users insert own feedback" on feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()) and school_id = (select my_school_id()));
```

- [ ] **Step 3: Apply locally and verify green**

```bash
pnpm exec supabase db reset
pnpm test:rls
```

Expected: ALL PASS — the new D3 case now blocks, and the positive case ("any authenticated user can insert feedback stamped with their own uid" — own uid + own school) still passes.

- [ ] **Step 4: Sanity-check the app path**

Run: `grep -n "school_id" actions/feedback.ts`
Expected: `submitFeedback` stamps the caller's own profile `school_id` — so the tightened policy changes nothing for the widget. (It does; this is a read-only confirmation. If it somehow doesn't, stop and escalate — do not patch the action in this task.)

- [ ] **Step 5: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add supabase/migrations/20260707000004_feedback_school_with_check.sql tests/rls/matrix.test.ts
git commit -m "fix(rls): feedback INSERT also pins school_id = my_school_id() (D3)"
```

---

### Task 7: UPDATE-policy WITH CHECK audit + submissions fix (D3 — REQUIRES the W1 harness)

**Files:**
- Create: `supabase/migrations/20260707000005_submissions_update_with_check.sql`

**Interfaces:**
- Consumes: local stack + `pnpm test:rls` as the regression net.
- Produces: migration file (applied to prod in Task 8). No column change → no `types/db.ts` edit.

Audit result baked in from planning (2026-07-07, read from the migrations): of the five UPDATE policies, four already carry an explicit `WITH CHECK` (`users update themselves` — 20260630000003; `organizers update exchanges` — 20260630000002; `organizers update their school` — 20260701000001; `organizers update school applications` — 20260630000001). Exactly one does not: **`organizers update submission status` on `submissions`** (20260625000005). This is *not* a live hole — Postgres applies USING to the post-image when WITH CHECK is absent — but every other UPDATE policy states it explicitly (the 20260630 convention); make this one match. `FOR ALL` policies (e.g. `students manage own submissions`) intentionally rely on USING-as-check and are out of scope per the spec.

- [ ] **Step 1: Re-run the audit against the live local schema (confirm the baked-in result)**

Run against the local stack (`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"` or the harness DB URL):

```sql
select tablename, policyname from pg_policies
where schemaname in ('public', 'storage') and cmd = 'UPDATE' and with_check is null
order by 1, 2;
```

Expected: exactly one row — `submissions | organizers update submission status`. If MORE rows appear (a policy landed since planning), give each the same treatment as Step 2: `alter policy … with check (<its exact USING expression>)` in the same migration, and note it in the task report.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260707000005_submissions_update_with_check.sql`:

```sql
-- D3 audit (multi-tenancy spec 2026-07-07): the only UPDATE policy without an
-- explicit WITH CHECK. Not a live hole — Postgres applies USING to the
-- post-image when WITH CHECK is absent — but every other UPDATE policy states
-- it explicitly (20260630 convention); make this one match so the invariant
-- "select … from pg_policies where cmd='UPDATE' and with_check is null" stays
-- empty. Expression mirrors the policy's USING verbatim (20260625000005).
alter policy "organizers update submission status" on submissions
  with check (my_role() = 'organizer' and assignment_school(assignment_id) = my_school_id());
```

- [ ] **Step 3: Apply locally, re-audit, and verify no behavior change**

```bash
pnpm exec supabase db reset
pnpm test:rls
```

Expected: ALL PASS (semantics identical — the matrix's organizer-approve positive case and cross-tenant submission-deny cases both still hold). Re-run the Step 1 audit query: **zero rows**.

- [ ] **Step 4: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add supabase/migrations/20260707000005_submissions_update_with_check.sql
git commit -m "chore(rls): explicit WITH CHECK on submissions UPDATE policy (D3 audit — convention, no behavior change)"
```

---

### Task 8: Ship gate + deploy checklist

**Files:** none created — verification and deployment.

- [ ] **Step 1: Full local gate on the branch**

```bash
pnpm lint && pnpm test && npx tsc --noEmit && pnpm test:rls
```

Expected: all green. Record counts in the task report.

- [ ] **Step 2: USER-GATED — merge protocol**

Confirm with Bjorn before merging (merge to `main` = prod deploy). Pre-merge: `git fetch && git status` — verify local `main` matches `origin/main` (known drift gotcha). Merge `--no-ff` per house style; re-run the full gate on merged `main` before pushing.

- [ ] **Step 3: Apply the two migrations to prod — MCP `apply_migration`, never `db push`**

Apply in order, names matching the files exactly:
1. `20260707000004_feedback_school_with_check` (contents from Task 6)
2. `20260707000005_submissions_update_with_check` (contents from Task 7)

Then verify on prod (MCP `execute_sql`, read-only):

```sql
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy where polname in ('users insert own feedback', 'organizers update submission status');
```

Expected: both rows show the new WITH CHECK expressions. Then run MCP `get_advisors` (security) — expected: **zero new findings** vs. the pre-existing WARN classes.

- [ ] **Step 4: Deploy the edge function (manual, after the code merge)**

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

(`verify_jwt` must stay false — the cron gate is the `x-cron-secret` header.) Optionally set `REMINDER_SCHOOL_BUDGET` as a function secret; the default 150 needs no config.

- [ ] **Step 5: Post-deploy verification (whole feature)**

1. After the next 08:00 cron run: response JSON / function logs show `perSchool` counts, `budgetHit: false` everywhere at current scale, no PII in the log line.
2. Prod feedback widget still submits (D3 policy live).
3. `pnpm test:rls` against local remains the regression net; CI (from W1) runs it on every PR.
4. Spot-check `/apply/<slug>` still accepts a normal application (cap is invisible at legitimate volume).

- [ ] **Step 6: Update `.superpowers/sdd/progress.md` + auto-memory; end at the stage boundary per CLAUDE.md session hygiene.**

---

## Coverage map (spec → tasks)

| Spec item | Task |
|---|---|
| D1 two-tenant RLS suite | Security-hardening plan Phase W1 (dependency) + Task 5 partner delta |
| D1 admin-client allowlist | Task 1 |
| D2 CLAUDE.md walled-service-role rule | Task 1 |
| D3 feedback WITH CHECK pins school_id | Task 6 |
| D3 UPDATE-policy WITH CHECK audit | Task 7 |
| D4 fair-share reminders (after cold-starts) | Tasks 3–4 (+ Task 4 preflight) |
| D4 funnel sanity cap (number set here: 2000) | Task 2 |
| D5 doors | Documented in the spec; one-hop rule restated in Global Constraints — build nothing (per spec) |
