# Perf & Cold Starts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill cold starts for anonymous visitors (static landing page), fix the send-reminders 1,000-row silent truncation, and keep the logged-in app's function warm via a pg_cron ping.

**Architecture:** Three independently shippable items. (1) The logged-in redirect on `/` moves from `app/page.tsx` into `middleware.ts` so the landing page prerenders and serves from CDN. (2) `send-reminders` pushes its cheap filters into PostgREST and pages through `assignments` via a small pure helper (`fetch-all.ts`, vitest-tested like `pacing.ts`). (3) A new no-auth `/api/health` route gets pinged every 5 minutes by a Supabase pg_cron job (checked-in SQL, applied manually).

**Tech Stack:** Next.js 14 App Router middleware, Supabase Edge Function (Deno) + PostgREST, pg_cron/pg_net, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-perf-cold-starts-design.md`
**Branch:** `feature/perf-cold-starts`

## Global Constraints

- Verification gate (run before any commit claim): `pnpm lint` + `pnpm test` + `npx tsc --noEmit`. Local `pnpm build` FAILS on placeholder env — do not use it; `tsc --noEmit` is the type gate.
- `supabase/functions/**` is excluded from tsconfig — vitest is the only automated check on files there. Files shared with vitest must use no Deno globals and no `@/` path aliases.
- Deno imports need explicit `.ts` extensions (`./fetch-all.ts` in `index.ts`); vitest imports are extensionless (`./fetch-all` in the test).
- Never log student/parent PII (no emails, names, submission contents) — preserve the existing PII-safe logging in `send-reminders`.
- `pacing.ts` is untouched. `verify_jwt = false` for send-reminders (config.toml) is untouched.
- Middleware `/` handling: any failure mode must fall through to serving the page — never a redirect loop or 500. The existing orphaned-session escape (no `users` row → pass through) and the `/accept-invite` incomplete-setup carve-out stay byte-for-byte in behavior.
- Reminders pager: any page fetch error fails the whole run with a 500 (retry next day) — never send from a partially-read cohort.
- Prod SQL (the keep-warm cron job) is applied via MCP `execute_sql`, NEVER `supabase db push` (known drift trap). No DB migration in this feature.
- `git add` only the files named in each task's commit step — never `git add -A` (PII sweep risk).
- Package manager is pnpm.

---

### Task 1: Middleware handles the logged-in redirect for `/`

Moves the role-based redirect for authenticated users visiting `/` from `app/page.tsx` (Task 2 removes it there) into the middleware branch that already does the `users` role lookup for auth routes. Anonymous visitors and orphaned sessions must keep passing through to the landing page.

**Files:**
- Modify: `middleware.ts:26` (the `user && isAuthRoute` branch)
- Test: `app/__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: `updateSession(request)` from `@/lib/supabase/middleware` (returns `{ supabaseResponse, user, supabase }`) — unchanged.
- Produces: logged-in `GET /` → 307 to `/dashboard` (organizer) or `/my-forms` (student); anonymous or orphaned-session `GET /` → pass-through. Task 2 relies on this so `app/page.tsx` can drop its own redirect.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('middleware', …)` block in `app/__tests__/middleware.test.ts` (the mock harness at the top of the file already provides `user` / `profileRow` — reuse it, change nothing above the describe):

```ts
  it('redirects a logged-in organizer from / to /dashboard', async () => {
    user = { id: 'u1' }
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/dashboard')
  })

  it('redirects a logged-in student from / to /my-forms', async () => {
    user = { id: 'u2' }
    profileRow = { role: 'student', full_name: 'Stu' }
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/my-forms')
  })

  it('does NOT redirect an orphaned session off / (landing page must render)', async () => {
    // Valid JWT but no users row: redirecting would bounce off the getUser()-based
    // layouts back to /login → loop. The landing page is safe to serve instead.
    user = { id: 'ghost' }
    profileRow = null
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toBeNull()
  })
```

Note: the existing first test (`lets a logged-out visitor reach /`) already covers the anonymous case — leave it as is.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run app/__tests__/middleware.test.ts`
Expected: the two new redirect tests FAIL (`location` is null — middleware currently passes `/` through for everyone); the orphaned-session test passes vacuously; all pre-existing tests pass.

- [ ] **Step 3: Implement the middleware change**

In `middleware.ts`, change the branch condition (line 26) and its comment:

```ts
  // Logged-in users hitting the auth routes or the marketing page (/) get sent
  // to their app. Handling / here (not in app/page.tsx) keeps the landing page
  // fully static so anonymous visitors are served from the CDN with no cold start.
  if (user && (isAuthRoute || pathname === '/')) {
```

Everything inside the branch (profile lookup, orphaned-session escape, `/accept-invite` carve-out, role-based destination) stays exactly as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run app/__tests__/middleware.test.ts`
Expected: PASS, 10 tests (7 pre-existing + 3 new).

- [ ] **Step 5: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green. (`app/__tests__/page.test.tsx` still passes — `app/page.tsx` is unchanged until Task 2.)

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/__tests__/middleware.test.ts
git commit -m "feat: middleware redirects logged-in users away from /"
```

---

### Task 2: Make `app/page.tsx` static

With the redirect now in middleware, the page drops its auth calls so Next prerenders it (`x-vercel-cache: PRERENDER`/`HIT` in prod). `LandingPage` is already `'use client'` with language state in `localStorage` — no server reads — so nothing else blocks prerendering.

**Files:**
- Modify: `app/page.tsx` (full rewrite below)
- Modify: `app/__tests__/page.test.tsx` (full rewrite below — its redirect tests moved to middleware in Task 1)

**Interfaces:**
- Consumes: Task 1's middleware redirect (must land first, or logged-in users hitting `/` would see the landing page).
- Produces: a statically prerenderable `/`. No exports change: default `RootPage` + `metadata`.

- [ ] **Step 1: Rewrite the page test**

Replace the entire contents of `app/__tests__/page.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest'
import RootPage from '@/app/page'
import { LandingPage } from '@/components/landing/LandingPage'

// The logged-in redirect for / lives in middleware.ts (see middleware.test.ts).
// This page must stay free of auth/DB reads so it prerenders — RootPage is a
// plain synchronous component that always renders the landing page.
describe('RootPage', () => {
  it('renders the landing page unconditionally', () => {
    const result = RootPage()
    expect(result.type).toBe(LandingPage)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run app/__tests__/page.test.tsx`
Expected: FAIL — current `RootPage` is async, so `result` is a Promise and `result.type` is undefined (and tsc would reject the sync call; the runtime failure is enough here).

- [ ] **Step 3: Rewrite the page**

Replace the entire contents of `app/page.tsx` with (metadata strings copied verbatim — keep the typographic apostrophes):

```tsx
import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: "Eazyexchange — La plateforme des organisateurs d’échanges scolaires",
  description:
    "Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.",
}

// No auth calls here — the logged-in redirect happens in middleware.ts. Keeping
// this component synchronous and dependency-free is what lets Next prerender the
// landing page so anonymous visitors never pay a function cold start.
export default function RootPage() {
  return <LandingPage />
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run app/__tests__/page.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green. Also confirm no lingering imports: `grep -n "getAuthUser\|getProfile\|redirect" app/page.tsx` → no matches.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat: static landing page — drop auth reads from app/page.tsx"
```

Static-ness itself is only verifiable at deploy time (Vercel build output shows `○ /`; `curl -sI https://eazyexchange.com/` shows `x-vercel-cache: PRERENDER`/`HIT`) — recorded in Task 6's post-deploy checklist.

---

### Task 3: `fetchAllPages` pagination helper (pure, vitest-tested)

PostgREST silently caps un-ranged selects at 1,000 rows — the root cause of the reminders time bomb. This helper loops `.range()` pages until a short page, aborting entirely on any page error. Same pattern as `pacing.ts`: lives next to the edge function, no Deno globals, no `@/` aliases, vitest is its only automated check.

**Files:**
- Create: `supabase/functions/send-reminders/fetch-all.ts`
- Test: `supabase/functions/send-reminders/fetch-all.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 4 imports this as `./fetch-all.ts`):
  - `PAGE_SIZE: number` (= 1000)
  - `fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize?: number): Promise<{ rows: T[]; error: { message: string } | null }>`
  - `from`/`to` are inclusive PostgREST `.range()` bounds. On success `error` is null; on any page error `rows` is `[]` and `error` is the page's error.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/send-reminders/fetch-all.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fetchAllPages, PAGE_SIZE, type PageResult } from './fetch-all'

// Typed manual mock (avoids vi.fn generics — untyped mocks have broken tsc here
// before). Records the (from, to) bounds of every call and replays `pages` in order.
function pager(pages: PageResult<number>[]) {
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to])
    return pages[calls.length - 1] ?? { data: [], error: null }
  }
  return { fetchPage, calls }
}

describe('fetchAllPages', () => {
  it('returns a single short page and stops after one fetch', async () => {
    const { fetchPage, calls } = pager([{ data: [1, 2, 3], error: null }])
    const { rows, error } = await fetchAllPages(fetchPage, 5)
    expect(rows).toEqual([1, 2, 3])
    expect(error).toBeNull()
    expect(calls).toEqual([[0, 4]])
  })

  it('accumulates full pages in order until a short page', async () => {
    const { fetchPage, calls } = pager([
      { data: [1, 2], error: null },
      { data: [3, 4], error: null },
      { data: [5], error: null },
    ])
    const { rows, error } = await fetchAllPages(fetchPage, 2)
    expect(rows).toEqual([1, 2, 3, 4, 5])
    expect(error).toBeNull()
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('handles a dataset that ends exactly on a page boundary (final empty page)', async () => {
    const { fetchPage, calls } = pager([
      { data: [1, 2], error: null },
      { data: [], error: null },
    ])
    const { rows, error } = await fetchAllPages(fetchPage, 2)
    expect(rows).toEqual([1, 2])
    expect(error).toBeNull()
    expect(calls.length).toBe(2)
  })

  it('aborts with the error and NO rows when any page fails (never a partial cohort)', async () => {
    const { fetchPage } = pager([
      { data: [1, 2], error: null },
      { data: null, error: { message: 'boom' } },
    ])
    const { rows, error } = await fetchAllPages(fetchPage, 2)
    expect(error).toEqual({ message: 'boom' })
    expect(rows).toEqual([])
  })

  it('treats null data as an empty page and defaults to PAGE_SIZE bounds', async () => {
    const { fetchPage, calls } = pager([{ data: null, error: null }])
    const { rows, error } = await fetchAllPages(fetchPage)
    expect(rows).toEqual([])
    expect(error).toBeNull()
    expect(calls).toEqual([[0, PAGE_SIZE - 1]])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run supabase/functions/send-reminders/fetch-all.test.ts`
Expected: FAIL — `Cannot find module './fetch-all'`.

- [ ] **Step 3: Implement the helper**

Create `supabase/functions/send-reminders/fetch-all.ts`:

```ts
// Paginated "fetch everything" for send-reminders. PostgREST silently caps
// un-ranged selects at 1,000 rows, so the cron must page through assignments
// explicitly or students silently stop getting reminders once the table grows.
//
// No Deno globals and no path aliases — imported by index.ts (Deno, as
// './fetch-all.ts') and unit-tested under vitest (fetch-all.test.ts), same
// arrangement as pacing.ts.

export type PageError = { message: string }
export type PageResult<T> = { data: T[] | null; error: PageError | null }

// PostgREST's own default cap — one page per round trip at the maximum size.
export const PAGE_SIZE = 1000

// Accumulates every page from fetchPage(from, to) — inclusive .range() bounds —
// until a short page signals the end. Any page error aborts the whole read and
// returns no rows: callers must never act on a partially-read cohort.
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: T[]; error: PageError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { rows: [], error }
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return { rows, error: null }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run supabase/functions/send-reminders/fetch-all.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green (tsc ignores `supabase/functions/**` — expected; vitest is the check for this file).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-reminders/fetch-all.ts supabase/functions/send-reminders/fetch-all.test.ts
git commit -m "feat: fetchAllPages pagination helper for send-reminders"
```

---

### Task 4: Wire filters + pagination into `send-reminders/index.ts`

Replaces the single unbounded select with PostgREST-side filters (deadline present, exchange not archived, reminders enabled — all legal on the existing `!inner` embeds) plus the Task 3 pager. Grouping, cadence math, stamp-after-send, PII-safe logging: all untouched. Status filtering ("needs action") deliberately stays in JS per the spec.

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (imports at top; the fetch block currently at lines 131–143; the loop header at line 152)

**Interfaces:**
- Consumes: `fetchAllPages` + `PAGE_SIZE` semantics from Task 3 (`./fetch-all.ts`, Deno-style extension).
- Produces: same HTTP contract as today — 401 without cron secret, 500 `{ error }` on query failure, 200 `{ students, emailsSent }` otherwise.

No vitest coverage exists for `index.ts` (Deno file, tsconfig-excluded) — the loop/error semantics are covered by Task 3's tests; this task is verified by careful diff review plus the post-deploy checks in Task 6.

- [ ] **Step 1: Add the import**

At the top of `supabase/functions/send-reminders/index.ts`, next to the pacing import:

```ts
import { resolvePreset, isDue } from './pacing.ts'
import { fetchAllPages } from './fetch-all.ts'
```

- [ ] **Step 2: Replace the fetch block**

Replace this current block (comment + query + error check):

```ts
  // Pull every assignment with its form deadline, reminder state, exchange
  // reminder settings, and latest submission status. Cadence and "needs
  // action" are filtered in code.
  const { data: rows, error } = await supabase
    .from('assignments')
    .select(
      'id, last_reminded_at, student:users!student_id(email, full_name), form_templates!inner(name, deadline, exchanges!inner(name, archived_at, reminders_enabled, reminder_cadence)), submissions(status)',
    )

  if (error) {
    console.error('[send-reminders] query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
```

with:

```ts
  // Pull every assignment that could need a reminder, with its form deadline,
  // reminder state, exchange settings, and latest submission status. The hard
  // disqualifiers (no deadline, archived exchange, reminders off) are pushed
  // into PostgREST via the !inner embeds; "needs action" and cadence stay in
  // code. PostgREST silently caps un-ranged selects at 1,000 rows, so the read
  // pages explicitly — on any page error the whole run aborts (retried by the
  // next daily cron) rather than reminding from a half-read cohort.
  const { rows, error } = await fetchAllPages<Record<string, unknown>>((from, to) =>
    supabase
      .from('assignments')
      .select(
        'id, last_reminded_at, student:users!student_id(email, full_name), form_templates!inner(name, deadline, exchanges!inner(name, archived_at, reminders_enabled, reminder_cadence)), submissions(status)',
      )
      .not('form_templates.deadline', 'is', null)
      .is('form_templates.exchanges.archived_at', null)
      .eq('form_templates.exchanges.reminders_enabled', true)
      .order('id')
      .range(from, to),
  )

  if (error) {
    console.error('[send-reminders] query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
```

- [ ] **Step 3: Update the loop header**

The grouping loop currently reads `for (const row of (rows ?? []) as any[]) {` — `rows` is now always an array, so change it to:

```ts
  for (const row of rows as any[]) {
```

Keep the in-loop defensive checks (archived, `reminders_enabled === false`, missing deadline) exactly as they are — they're now redundant with the DB filters but harmless, and they keep the function safe if a filter is ever loosened.

- [ ] **Step 4: Verify nothing else changed**

Run: `git diff supabase/functions/send-reminders/index.ts`
Expected: only the import, the fetch block, and the loop header changed. `pacing.ts` untouched: `git status --short supabase/functions/send-reminders/pacing.ts` → empty.

- [ ] **Step 5: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green (index.ts is outside tsc/vitest — this catches accidental damage elsewhere).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "fix: send-reminders pages through assignments (1,000-row PostgREST cap)"
```

Deploying the function is a manual step in Task 6 — do NOT deploy here.

---

### Task 5: Keep-warm pinger — `/api/health` route + middleware allowlist + cron SQL

A no-auth, no-DB route for the pg_cron ping. Two subtleties: (a) it must be `force-dynamic`, otherwise Next statically optimizes the route and the ping hits the CDN instead of warming the function; (b) it must join the middleware public allowlist, otherwise anonymous pings get 307'd to `/login` and warm nothing.

**Files:**
- Create: `app/api/health/route.ts`
- Create: `supabase/keep-warm-setup.sql`
- Modify: `middleware.ts:15-20` (`isPublicRoute`)
- Test: `app/__tests__/health-route.test.ts`, `app/__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: nothing (deliberately zero dependencies — the route can never 500).
- Produces: `GET /api/health` → 200 `{ ok: true }`, publicly reachable. The SQL file is applied to prod manually in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `app/__tests__/health-route.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GET, dynamic } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 { ok: true }', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('opts out of static optimization so each ping reaches the function', () => {
    // Without force-dynamic Next serves a cached static body from the CDN and
    // the keep-warm ping never touches the function.
    expect(dynamic).toBe('force-dynamic')
  })
})
```

And append inside the `describe('middleware', …)` block in `app/__tests__/middleware.test.ts`:

```ts
  it('lets the unauthenticated keep-warm pinger reach /api/health (no redirect)', async () => {
    const res = await middleware(req('/api/health'))
    expect(res.headers.get('location')).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run app/__tests__/health-route.test.ts app/__tests__/middleware.test.ts`
Expected: health-route FAILS (`Cannot find module '@/app/api/health/route'`); the new middleware test FAILS (location contains `/login`); all pre-existing middleware tests pass.

- [ ] **Step 3: Implement the route and the allowlist entry**

Create `app/api/health/route.ts`:

```ts
// Keep-warm target: a Supabase pg_cron job (supabase/keep-warm-setup.sql) hits
// this every 5 minutes so the Vercel function serving the logged-in app stays
// warm between real visits. No auth, no DB, nothing secret — and no dependency
// that could ever make it fail. force-dynamic so the ping reaches the function
// instead of a CDN-cached static response.

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true })
}
```

In `middleware.ts`, add one line to `isPublicRoute`:

```ts
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/api/stripe') ||
    pathname === '/api/health'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run app/__tests__/health-route.test.ts app/__tests__/middleware.test.ts`
Expected: PASS — 2 health tests, 11 middleware tests.

- [ ] **Step 5: Create the cron setup SQL**

Create `supabase/keep-warm-setup.sql`:

```sql
-- ============================================================
-- Keep-warm ping for the Vercel app (mirrors cron-setup.sql).
-- Apply manually against the live project — via MCP execute_sql,
-- NOT `supabase db push` (this is not a migration).
--
-- Hits the public no-auth /api/health route every 5 minutes so the
-- function serving the logged-in app stays warm between real visits.
-- The route returns { ok: true } and touches nothing sensitive, so
-- the request needs no headers or secrets.
--
-- Caveat (accepted in the 2026-07-07 perf spec): whether warming
-- /api/health also keeps the dashboard's function warm depends on
-- Vercel's route-to-function bundling. Verify empirically ~24 h after
-- enabling (first-hit TTFB after idle). Fallback: point the ping at a
-- heavier public dynamic route (e.g. /apply/<slug>) or unschedule and
-- rely on Fluid Compute alone.
--
-- Prerequisite: pg_cron + pg_net extensions enabled (already required
-- by cron-setup.sql for send-reminders).
-- ============================================================

select cron.schedule(
  'keep-warm-app',
  '*/5 * * * *',
  $$
  select net.http_get(url := 'https://eazyexchange.com/api/health');
  $$
);

-- To remove the schedule later:
--   select cron.unschedule('keep-warm-app');
```

- [ ] **Step 6: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/api/health/route.ts app/__tests__/health-route.test.ts middleware.ts app/__tests__/middleware.test.ts supabase/keep-warm-setup.sql
git commit -m "feat: /api/health keep-warm route + pg_cron ping setup"
```

---

### Task 6: Final gate, merge, and manual deploy checklist

**Files:** none (verification + process).

- [ ] **Step 1: Full verification gate on the branch**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: lint clean (pre-existing apple-icon `<img>` warning only), all tests pass, tsc clean.

- [ ] **Step 2: Diff hygiene scan**

Run: `git diff main...HEAD --stat`
Expected: exactly these files — `middleware.ts`, `app/page.tsx`, `app/api/health/route.ts`, `app/__tests__/middleware.test.ts`, `app/__tests__/page.test.tsx`, `app/__tests__/health-route.test.ts`, `supabase/functions/send-reminders/index.ts`, `supabase/functions/send-reminders/fetch-all.ts`, `supabase/functions/send-reminders/fetch-all.test.ts`, `supabase/keep-warm-setup.sql`, plus this plan/spec under `docs/superpowers/`. Nothing else (PII sweep check).

- [ ] **Step 3: Merge (user-gated)**

Merging to `main` + pushing = Vercel prod deploy. Use superpowers:finishing-a-development-branch; get Bjorn's confirmation before push. Check local `main` is not behind `origin/main` before merging (known drift gotcha).

- [ ] **Step 4: Manual deploy steps (after the push, in this order)**

1. **Edge function:** `supabase functions deploy send-reminders` (config.toml keeps `verify_jwt = false` — verify the deploy output doesn't flip it).
2. **Keep-warm cron:** apply `supabase/keep-warm-setup.sql` to prod via MCP `execute_sql` (NOT db push). Confirm with `select jobname, schedule from cron.job;` → `keep-warm-app` at `*/5 * * * *` alongside `send-reminders-daily`.
3. **Fluid Compute (Bjorn, 30 s):** Vercel → Settings → Functions → confirm Fluid Compute is enabled.

- [ ] **Step 5: Post-deploy verification (whole feature)**

1. `curl -sI https://eazyexchange.com/` → `x-vercel-cache: PRERENDER` or `HIT`; anonymous TTFB < 150 ms even after idle. (Vercel build log should show `○ /` static.)
2. Logged-in browser hitting `/` still lands on `/dashboard` (organizer) — Bjorn's account.
3. `curl -s https://eazyexchange.com/api/health` → `{"ok":true}`; a few minutes later, `select status, (response).status_code from net._http_response order by id desc limit 3;` shows the cron's pings succeeding (or check pg_cron run details).
4. Next 08:00 reminders run: response JSON `{ students, emailsSent }` plausible, no error logs (`supabase functions logs send-reminders` or MCP `get_logs`).
5. ~24 h later: re-run the cold-vs-warm curl on first hit after idle; first-hit TTFB should be ≪ 1.9 s. If not, fallback per spec: repoint the ping at a heavier public dynamic route or unschedule and rely on Fluid Compute alone.
