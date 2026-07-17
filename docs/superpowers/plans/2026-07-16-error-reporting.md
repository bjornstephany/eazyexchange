# Server Error Reporting (`error_reports`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every unexpected production server error — with its detailed reason — as a deduplicated row in an `error_reports` table that reads as a bug list (occurrence counter, `open`/`resolved` status, regression reopen).

**Architecture:** Next.js 15's `onRequestError` hook in a new repo-root `instrumentation.ts` delegates (Node-runtime only, dynamic import, never throws) to `lib/error-reporting.ts`, which normalizes/sanitizes the error, computes a SHA-256 fingerprint (normalized message + route path — stack deliberately excluded), and calls a `record_error_report()` SQL function through the service-role admin client for an atomic dedup-upsert. The table has RLS enabled with **zero policies** plus revoked grants: only the service role can touch it; triage happens in the Supabase dashboard.

**Tech Stack:** Next.js 15.5 (`instrumentation.ts` + `Instrumentation.onRequestError` type), Supabase (Postgres migration + service-role RPC), `node:crypto` SHA-256, vitest (unit + RLS matrix).

**Spec:** `docs/superpowers/specs/2026-07-16-error-reporting-design.md`

**Branch:** `feature/error-reporting` (multi-step feature → branch, per CLAUDE.md git workflow).

## Global Constraints

- **Never log or store student/parent PII.** Email-shaped strings are redacted from message and stack before storage; request **headers are never forwarded** to the reporter (cookies/PII); the `console.error` fallback logs error **codes only, never message contents**.
- **The reporter never throws and never blocks the request beyond its own awaited write** (same contract as `lib/audit.ts` → `logAudit`).
- **Capture unexpected crashes only.** `redirect()` / `notFound()` control-flow digests (`NEXT_REDIRECT…`, `NEXT_NOT_FOUND…`, `NEXT_HTTP_ERROR_FALLBACK…`) are skipped. Expected outcomes use structured returns and never reach the hook.
- **Truncation limits:** message 2000 chars, stack 8000 chars (exact values from spec).
- **No client access path**: RLS enabled, zero policies, `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` revoked from `anon`+`authenticated`, `EXECUTE` on `record_error_report()` revoked from `public`/`anon`/`authenticated`.
- **Admin allowlist**: `lib/error-reporting.ts` is added to `lib/supabase/__tests__/admin-allowlist.test.ts` deliberately (no user session exists inside the hook; clients must never write a bug table).
- **Migration workflow** (CLAUDE.md → Database): staging first via `db push --db-url "$STAGING_DB_URL"`, then prod via MCP `apply_migration` — **never `supabase db push` against prod**. Regenerate `types/supabase.ts` via MCP afterwards; never hand-edit it.
- **New table ships RLS matrix cases in the same PR** (`pnpm test:rls`).
- Package manager is **pnpm**. Local `pnpm build` fails on placeholder `.env.local` — use `npx tsc --noEmit` locally; CI/Vercel runs the real build.
- Out of scope (YAGNI, per spec): admin UI, notifications, client-side capture, source-map symbolication, retention/cleanup.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260716150000_error_reports.sql` (create) | `error_reports` table, RLS lockdown, `record_error_report()` dedup-upsert RPC |
| `tests/rls/error-reports.test.ts` (create) | RLS matrix: no client read/write/execute; service-path dedup + reopen semantics |
| `types/supabase.ts` (regenerate via MCP) | Generated schema incl. new table + RPC |
| `types/db.ts` (modify) | `ErrorReport` narrow alias (`status` union) wired into `Database` |
| `lib/error-reporting.ts` (create) | Pure helpers (normalize, redact, truncate, fingerprint) + `reportServerError` (admin RPC, never throws) |
| `lib/__tests__/error-reporting.test.ts` (create) | Unit tests for helpers + reporter contract |
| `instrumentation.ts` (create, repo root) | `onRequestError` shim: Node-only guard, dynamic import, never throws |
| `lib/__tests__/instrumentation.test.ts` (create) | Shim tests: delegation, runtime guard, never-throw |
| `lib/supabase/__tests__/admin-allowlist.test.ts` (modify) | Add `lib/error-reporting.ts` to ALLOWLIST; add `instrumentation.ts` to ROOT_FILES scan |
| `CLAUDE.md` (modify) | Short "Server Error Reporting" section so future sessions know the subsystem exists |

Task order note: the migration lands **first** (Tasks 1–2) because `admin.rpc('record_error_report', …)` in Task 4 only typechecks once `types/supabase.ts` has been regenerated from a schema that contains the function. The table is inert until `instrumentation.ts` ships (nothing writes or reads it), so applying the migration to staging+prod mid-branch is safe — this repo's precedent (feedback widget, email controls).

---

### Task 1: Migration — `error_reports` table + `record_error_report()` RPC + RLS matrix tests

**Files:**
- Create: `supabase/migrations/20260716150000_error_reports.sql`
- Test: `tests/rls/error-reports.test.ts`

**Interfaces:**
- Consumes: RLS harness `tests/rls/db.ts` (`connect()`, `runAs(sql, userId|null, fn)`, `writeOutcome(sql, userId, write)`, `expectBlocked(outcome)`) and `tests/rls/seed.ts` (`seedFixtures`, `cleanupFixtures`, `Fixtures` with `orgA`, `studentA`, …).
- Produces: table `public.error_reports` (columns exactly as in the SQL below) and SQL function `record_error_report(p_fingerprint text, p_message text, p_route_path text, p_method text, p_stack text default null, p_digest text default null) returns void` — later tasks call it via the admin client as `admin.rpc('record_error_report', { p_fingerprint, p_message, p_route_path, p_method, p_stack?, p_digest? })`.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feature/error-reporting
```

(Verify you're actually on `feature/error-reporting` before every commit — concurrent sessions have moved HEAD under a running session before.)

- [ ] **Step 2: Write the failing RLS matrix test**

Create `tests/rls/error-reports.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

// Deterministic test fingerprints, cleaned up by prefix in afterAll.
const FP = 'rls-test-fp-main'

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path write (postgres stands in for the service role: both bypass
  // RLS and both hold EXECUTE on the function).
  await sql`select record_error_report(${FP}, 'boom', '/exchanges/[id]', 'GET', 'stack text', 'digest-1')`
})
afterAll(async () => {
  await sql`delete from error_reports where fingerprint like 'rls-test-%'`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('error_reports (zero-policy: service role only)', () => {
  it('no client role can select — anon, organizer, student all see nothing', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      let rows: readonly unknown[] = []
      try {
        rows = await runAs(sql, uid, (tx) => tx`select id from error_reports where fingerprint = ${FP}`)
      } catch (e) {
        // Revoked SELECT grant surfaces as 42501 — equally a denial.
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${uid ?? 'anon'}`).toHaveLength(0)
    }
  })

  it('no client role can insert', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into error_reports (fingerprint, message, route_path, method)
         values ('rls-test-forged-insert', 'forged', '/', 'GET')`))
  })

  it('no client role can update (e.g. flip status)', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update error_reports set status = 'resolved' where fingerprint = ${FP}`))
  })

  it('no client role can execute record_error_report()', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      let code: string | undefined
      try {
        await runAs(sql, uid, (tx) =>
          tx`select record_error_report('rls-test-forged-rpc', 'forged', '/', 'GET')`)
      } catch (e) {
        code = (e as { code?: string }).code
      }
      expect(code, `persona ${uid ?? 'anon'}`).toBe('42501')
    }
  })

  it('recurrence increments occurrences, refreshes last_seen_at, updates digest', async () => {
    await sql`select record_error_report(${FP}, 'boom', '/exchanges/[id]', 'GET', 'stack text', 'digest-2')`
    const [row] = await sql`
      select occurrences, digest, status, first_seen_at, last_seen_at
      from error_reports where fingerprint = ${FP}`
    expect(row.occurrences).toBe(2)
    expect(row.digest).toBe('digest-2')
    expect(row.status).toBe('open')
    expect(new Date(row.last_seen_at as string).getTime())
      .toBeGreaterThanOrEqual(new Date(row.first_seen_at as string).getTime())
  })

  it('a resolved bug that recurs flips back to open; a missing digest keeps the last one', async () => {
    await sql`update error_reports set status = 'resolved' where fingerprint = ${FP}`
    // No stack/digest args this time (defaults null).
    await sql`select record_error_report(${FP}, 'boom', '/exchanges/[id]', 'GET')`
    const [row] = await sql`select occurrences, digest, status from error_reports where fingerprint = ${FP}`
    expect(row.status).toBe('open')
    expect(row.occurrences).toBe(3)
    expect(row.digest).toBe('digest-2') // coalesce kept the last known digest
  })

  it('a new fingerprint creates a fresh open row with occurrences 1', async () => {
    await sql`select record_error_report('rls-test-fp-other', 'other boom', '/billing', 'POST')`
    const [row] = await sql`select occurrences, status, stack from error_reports where fingerprint = 'rls-test-fp-other'`
    expect(row.occurrences).toBe(1)
    expect(row.status).toBe('open')
    expect(row.stack).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails for the right reason**

```bash
pnpm exec supabase start        # local stack (needs Docker; applies existing migrations)
pnpm test:rls -- tests/rls/error-reports.test.ts
```

Expected: FAIL in `beforeAll` — `record_error_report` / `error_reports` does not exist (Postgres `42883`/`42P01`).

(No Docker in this environment? Do NOT point `RLS_TEST_DB_URL` at staging or prod — the suite seeds and deletes rows. Skip local red/green, rely on CI's `test:rls` job, and say so explicitly in the task report.)

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260716150000_error_reports.sql`:

```sql
-- Server error reporting: unexpected server crashes recorded as a deduplicated
-- bug list (spec: docs/superpowers/specs/2026-07-16-error-reporting-design.md).
-- Written ONLY by the service-role client (lib/error-reporting.ts) via
-- record_error_report(). Zero RLS policies + revoked grants: no client role
-- can read or write — stricter than audit_log (not even organizer reads).
-- Triage happens in the Supabase dashboard (flip status by hand).

create table error_reports (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,  -- sha256(normalized message + route path)
  message text not null,             -- emails redacted, truncated to 2000 chars app-side
  stack text,                        -- emails redacted, truncated to 8000 chars app-side
  digest text,                       -- latest Next.js prod error digest
  route_path text not null,          -- parameterized route from the hook context
  method text not null,
  occurrences int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved'))
);

alter table error_reports enable row level security;

-- Belt and braces beyond "no policies": drop the default grants so even a
-- future over-permissive policy cannot open client access.
revoke select, insert, update, delete, truncate on error_reports from anon, authenticated;

-- Atomic dedup-upsert. A resolved bug that recurs flips back to open (free
-- regression detection); a null digest keeps the last known one.
create function record_error_report(
  p_fingerprint text,
  p_message text,
  p_route_path text,
  p_method text,
  p_stack text default null,
  p_digest text default null
) returns void
language sql security definer set search_path = public as $$
  insert into error_reports (fingerprint, message, stack, digest, route_path, method)
  values (p_fingerprint, p_message, p_stack, p_digest, p_route_path, p_method)
  on conflict (fingerprint) do update set
    occurrences  = error_reports.occurrences + 1,
    last_seen_at = now(),
    digest       = coalesce(excluded.digest, error_reports.digest),
    status       = 'open';
$$;

-- Service role only. Revoking from public removes the default EXECUTE grant,
-- so service_role needs its own explicit grant back.
revoke execute on function public.record_error_report(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_error_report(text, text, text, text, text, text)
  to service_role;
```

- [ ] **Step 5: Apply locally and run the RLS suite to verify it passes**

```bash
pnpm exec supabase db reset     # re-applies all local migrations incl. the new one
pnpm test:rls
```

Expected: PASS — the new `error-reports` cases green, and the full existing matrix still green (proves the revokes didn't collide with anything).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260716150000_error_reports.sql tests/rls/error-reports.test.ts
git commit -m "feat(db): error_reports bug list + record_error_report dedup-upsert RPC"
```

---

### Task 2: Apply migration to staging + prod, regenerate types, narrow `ErrorReport`

**Files:**
- Modify: `types/supabase.ts` (regenerated verbatim via MCP — never hand-edit)
- Modify: `types/db.ts`
- Possibly rename: `supabase/migrations/20260716150000_error_reports.sql` (if the prod ledger stamps a different version)

**Interfaces:**
- Consumes: the migration file from Task 1.
- Produces: `types/supabase.ts` containing `error_reports` in `Tables` and `record_error_report` in `Functions` (with `p_stack`/`p_digest` optional — they have SQL defaults); `types/db.ts` exporting `ErrorReportStatus = 'open' | 'resolved'` and `ErrorReport`. Task 4's `admin.rpc('record_error_report', …)` typechecks against this.

- [ ] **Step 1: Apply to staging FIRST**

```bash
set -a; source .env.staging; set +a
npx supabase db push --db-url "$STAGING_DB_URL"
```

Expected: applies `20260716150000_error_reports.sql` (possibly after listing already-applied ones). WSL gotcha: if this hangs, the direct host may be IPv6-only — resolve an IPv4 with `getent ahostsv4 <host>` and substitute the IP into `--db-url` (see memory `reference_wsl2_supabase_db_push_ipv6`). If push refuses due to pre-existing ledger drift (it has before), fall back to MCP `execute_sql` of the file contents against **staging** plus inserting the version row — mirror what memory `project_multi_tenancy_isolation` records.

- [ ] **Step 2: Apply to prod via MCP**

Use the Supabase MCP `apply_migration` tool: `name` = `error_reports`, `query` = the exact contents of the migration file. **Never `supabase db push` against prod.**

- [ ] **Step 3: Ledger check + advisors**

- MCP `list_migrations`: confirm a version for `error_reports` exists. If the stamped version differs from `20260716150000`, `git mv` the local file to the stamped version.
- MCP `get_advisors` (security): expect **no new** advisories (the function pins `search_path`, RLS is enabled).

- [ ] **Step 4: Regenerate types**

- MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim.
- Verify the diff contains `error_reports` table types and a `record_error_report` entry under `Functions` whose `Args` mark `p_stack` and `p_digest` optional.

- [ ] **Step 5: Narrow the row in `types/db.ts`**

Add with the other status unions (after `EmailSendLog`/`AuditLog`, around line 83):

```ts
export type ErrorReportStatus = 'open' | 'resolved'
export type ErrorReport = Override<Tables<'error_reports'>, {
  status: ErrorReportStatus
}>
```

And wire it into the `Database` override: add `'error_reports'` to the `Omit<Generated['public']['Tables'], …>` union (line ~100) and add to the replacement block:

```ts
      error_reports: OverrideRow<'error_reports', ErrorReport>
```

- [ ] **Step 6: Typecheck and run unit tests**

```bash
npx tsc --noEmit
pnpm test
```

Expected: both clean (nothing consumes the new types yet; this proves the regeneration didn't drift any existing alias).

- [ ] **Step 7: Commit**

```bash
git add types/supabase.ts types/db.ts supabase/migrations/
git commit -m "chore(db): apply error_reports to staging+prod, regenerate types, narrow ErrorReport"
```

---

### Task 3: Pure helpers in `lib/error-reporting.ts` (normalize, redact, truncate, fingerprint)

**Files:**
- Create: `lib/error-reporting.ts` (helpers only — `reportServerError` comes in Task 4)
- Test: `lib/__tests__/error-reporting.test.ts`

**Interfaces:**
- Consumes: `node:crypto` only. **No admin import yet** (that's Task 4's deliberate allowlist step).
- Produces (exact signatures Task 4 and its tests rely on):
  - `normalizeMessage(message: string): string`
  - `redactEmails(text: string): string`
  - `truncate(text: string, max: number): string`
  - `errorFingerprint(normalizedMessage: string, routePath: string): string` (64-char hex)
  - `MESSAGE_MAX = 2000`, `STACK_MAX = 8000`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/error-reporting.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeMessage, redactEmails, truncate, errorFingerprint,
  MESSAGE_MAX, STACK_MAX,
} from '../error-reporting'

describe('normalizeMessage', () => {
  it('replaces UUIDs with a placeholder', () => {
    expect(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'))
      .toBe('Exchange <uuid> not found')
  })

  it('replaces long digit runs (4+) with a placeholder', () => {
    expect(normalizeMessage('row 123456 failed after 2026 ms')).toBe('row <n> failed after <n> ms')
  })

  it('keeps short numbers so HTTP 404 and HTTP 500 stay distinct bugs', () => {
    expect(normalizeMessage('Request failed with status 500'))
      .toBe('Request failed with status 500')
  })

  it('handles several ids in one message', () => {
    const a = normalizeMessage('link 0f8fad5b-d9cb-469f-a165-70867728950e to 7c9e6679-7425-40de-944b-e07fc1f90ae7')
    expect(a).toBe('link <uuid> to <uuid>')
  })
})

describe('errorFingerprint', () => {
  it('is stable across messages differing only by ids', () => {
    const a = errorFingerprint(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), '/exchanges/[id]')
    const b = errorFingerprint(normalizeMessage('Exchange 7c9e6679-7425-40de-944b-e07fc1f90ae7 not found'), '/exchanges/[id]')
    expect(a).toBe(b)
  })

  it('differs across routes for the same message', () => {
    expect(errorFingerprint('boom', '/exchanges/[id]'))
      .not.toBe(errorFingerprint('boom', '/billing'))
  })

  it('is a 64-char hex sha256', () => {
    expect(errorFingerprint('boom', '/')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('redactEmails', () => {
  it('redacts email-shaped strings', () => {
    expect(redactEmails('sending to parent.dupont@example.com failed'))
      .toBe('sending to <email> failed')
  })

  it('redacts several emails and leaves the rest intact', () => {
    expect(redactEmails('a@b.fr then c.d@e-f.co: timeout'))
      .toBe('<email> then <email>: timeout')
  })

  it('leaves plain text alone', () => {
    expect(redactEmails('constraint violation on submissions')).toBe('constraint violation on submissions')
  })
})

describe('truncate', () => {
  it('caps at the limit', () => {
    expect(truncate('a'.repeat(3000), MESSAGE_MAX)).toHaveLength(2000)
    expect(truncate('a'.repeat(9000), STACK_MAX)).toHaveLength(8000)
  })

  it('leaves short strings untouched', () => {
    expect(truncate('short', MESSAGE_MAX)).toBe('short')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm exec vitest run lib/__tests__/error-reporting.test.ts
```

Expected: FAIL — cannot resolve `../error-reporting`.

- [ ] **Step 3: Implement the helpers**

Create `lib/error-reporting.ts`:

```ts
import { createHash } from 'node:crypto'

export const MESSAGE_MAX = 2000
export const STACK_MAX = 8000

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// 4+ digits: long enough to be an id/timestamp, short enough that HTTP status
// codes (404 vs 500) keep producing distinct fingerprints.
const LONG_DIGITS_RE = /\d{4,}/g
const EMAIL_RE = /[^\s@<>()[\]:;,"']+@[^\s@<>()[\]:;,"']+\.[a-zA-Z]{2,}/g

// Group "Exchange abc not found" and "Exchange def not found" as ONE bug:
// ids collapse to placeholders before fingerprinting. Stored messages keep
// their concrete ids (useful when debugging); only emails are stripped.
export function normalizeMessage(message: string): string {
  return message.replace(UUID_RE, '<uuid>').replace(LONG_DIGITS_RE, '<n>')
}

export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, '<email>')
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

// Stack frames deliberately excluded from the fingerprint: minified frame
// text changes across deploys and would split one bug into many rows.
export function errorFingerprint(normalizedMessage: string, routePath: string): string {
  return createHash('sha256').update(`${normalizedMessage}\n${routePath}`).digest('hex')
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
pnpm exec vitest run lib/__tests__/error-reporting.test.ts
```

Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/error-reporting.ts lib/__tests__/error-reporting.test.ts
git commit -m "feat: error normalization, email redaction and fingerprint helpers"
```

---

### Task 4: `reportServerError` — never-throw reporter over the service-role RPC + allowlist extension

**Files:**
- Modify: `lib/error-reporting.ts` (append the reporter)
- Modify: `lib/__tests__/error-reporting.test.ts` (append reporter tests)
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts`

**Interfaces:**
- Consumes: Task 3's helpers; `createAdminClient()` from `@/lib/supabase/admin`; the `record_error_report` RPC types from Task 2.
- Produces (Task 5 relies on this exact signature):
  - `export type ServerErrorContext = { routePath: string; method: string }`
  - `reportServerError(err: unknown, ctx: ServerErrorContext): Promise<void>` — resolves always, never throws.

- [ ] **Step 1: Write the failing reporter tests**

Append to `lib/__tests__/error-reporting.test.ts`. The admin mock follows the repo's `lib/__tests__/audit.test.ts` pattern (mock declared before `vi.mock`, mocked module imported after):

At the **top of the file**, extend the existing vitest import to `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'` (one statement — avoid a duplicate `from 'vitest'` import), then add before the `../error-reporting` import:

```ts
const rpcMock = vi.fn(async (_fn: string, _args: unknown) => ({ error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (fn: string, args: unknown) => rpcMock(fn, args) }),
}))
```

and extend the existing import with `reportServerError`:

```ts
import {
  normalizeMessage, redactEmails, truncate, errorFingerprint,
  MESSAGE_MAX, STACK_MAX, reportServerError,
} from '../error-reporting'
```

Then append at the end of the file:

```ts
describe('reportServerError', () => {
  const ctx = { routePath: '/exchanges/[id]', method: 'POST' }
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    rpcMock.mockClear()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('records via record_error_report with a normalized fingerprint and the concrete message', async () => {
    const err = Object.assign(new Error('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), { digest: 'dgst123' })
    await reportServerError(err, ctx)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('record_error_report')
    expect(args).toMatchObject({
      p_message: 'Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found',
      p_route_path: '/exchanges/[id]',
      p_method: 'POST',
      p_digest: 'dgst123',
      p_fingerprint: errorFingerprint(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), '/exchanges/[id]'),
    })
    expect(typeof args.p_stack).toBe('string')
  })

  it('skips Next.js control-flow digests (redirect / notFound are not bugs)', async () => {
    for (const digest of ['NEXT_REDIRECT;replace;/login;307;', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404']) {
      await reportServerError(Object.assign(new Error('x'), { digest }), ctx)
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('redacts emails from message and stack before storage', async () => {
    const err = new Error('mail to parent.dupont@example.com bounced')
    err.stack = 'Error: mail to parent.dupont@example.com bounced\n    at sendMail'
    await reportServerError(err, ctx)
    const [, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(args.p_message).toBe('mail to <email> bounced')
    expect(args.p_stack).not.toContain('parent.dupont@example.com')
  })

  it('truncates message to 2000 and stack to 8000 chars', async () => {
    const err = new Error('m'.repeat(5000))
    err.stack = 's'.repeat(20000)
    await reportServerError(err, ctx)
    const [, args] = rpcMock.mock.calls[0] as [string, { p_message: string; p_stack: string }]
    expect(args.p_message).toHaveLength(MESSAGE_MAX)
    expect(args.p_stack).toHaveLength(STACK_MAX)
  })

  it('handles non-Error throwables: message from String(), no stack, no digest', async () => {
    await reportServerError('plain string failure', ctx)
    const [, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(args.p_message).toBe('plain string failure')
    expect(args.p_stack).toBeUndefined()
    expect(args.p_digest).toBeUndefined()
  })

  it('resolves and logs only an error code when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { code: '42501' } })
    await expect(reportServerError(new Error('secret contents'), ctx)).resolves.toBeUndefined()
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('42501')
    expect(logged).not.toContain('secret contents')
  })

  it('resolves even when the admin client throws (never-throw contract)', async () => {
    rpcMock.mockRejectedValueOnce(new Error('network down'))
    await expect(reportServerError(new Error('boom'), ctx)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
pnpm exec vitest run lib/__tests__/error-reporting.test.ts
```

Expected: FAIL — `reportServerError` is not exported (Task 3's helper tests must stay green).

- [ ] **Step 3: Implement the reporter**

Append to `lib/error-reporting.ts` (and add the admin import at the top of the file):

```ts
import { createAdminClient } from '@/lib/supabase/admin'
```

```ts
// Next.js control-flow "errors" (redirect(), notFound()) carry these digest
// prefixes — they are working as designed, never bugs.
const CONTROL_FLOW_DIGEST_RE = /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/

export type ServerErrorContext = { routePath: string; method: string }

// Record an unexpected server error in the error_reports bug list (service
// role only — clients have no path to the table, see migration
// 20260716150000). Same contract as logAudit: await it, but it NEVER throws —
// a bug-logging hiccup must not worsen the user's error experience. PII rule:
// the console fallback logs error codes only, never message contents.
export async function reportServerError(err: unknown, ctx: ServerErrorContext): Promise<void> {
  try {
    const digestProp = (err as { digest?: unknown } | null)?.digest
    const digest = typeof digestProp === 'string' ? digestProp : null
    if (digest && CONTROL_FLOW_DIGEST_RE.test(digest)) return

    const rawMessage = err instanceof Error ? err.message : String(err)
    const rawStack = err instanceof Error && err.stack ? err.stack : null
    const message = truncate(redactEmails(rawMessage), MESSAGE_MAX)
    const stack = rawStack ? truncate(redactEmails(rawStack), STACK_MAX) : null

    const admin = createAdminClient()
    const { error } = await admin.rpc('record_error_report', {
      p_fingerprint: errorFingerprint(normalizeMessage(message), ctx.routePath),
      p_message: message,
      p_route_path: ctx.routePath,
      p_method: ctx.method,
      p_stack: stack ?? undefined,
      p_digest: digest ?? undefined,
    })
    if (error) console.error('[error-reporting] write failed:', error.code ?? 'unknown')
  } catch {
    console.error('[error-reporting] write failed: unexpected')
  }
}
```

- [ ] **Step 4: Run the reporter tests, then witness the allowlist guard fire**

```bash
pnpm exec vitest run lib/__tests__/error-reporting.test.ts
pnpm exec vitest run lib/supabase/__tests__/admin-allowlist.test.ts
```

Expected: reporter tests PASS; allowlist test **FAILS** listing `lib/error-reporting.ts` as an unexpected importer — the guard working as designed.

- [ ] **Step 5: Extend the allowlist deliberately**

In `lib/supabase/__tests__/admin-allowlist.test.ts`:

1. Add `'lib/error-reporting.ts'` to `ALLOWLIST` (the array is `.sort()`ed, so position doesn't matter, but keep it alphabetical for readers — after `'lib/email-log.ts'`).
2. Extend the scan to cover the new root file, so a future *direct* admin import from the hook can't slip past:

```ts
const ROOT_FILES = ['middleware.ts', 'instrumentation.ts']
```

- [ ] **Step 6: Full unit suite + typecheck**

```bash
pnpm test
npx tsc --noEmit
```

Expected: all green. (`tsc` also proves the `admin.rpc('record_error_report', …)` call matches the generated `Functions` types from Task 2.)

- [ ] **Step 7: Commit**

```bash
git add lib/error-reporting.ts lib/__tests__/error-reporting.test.ts lib/supabase/__tests__/admin-allowlist.test.ts
git commit -m "feat: reportServerError — never-throw dedup bug reporting via service-role RPC

lib/error-reporting.ts joins the admin-client allowlist deliberately: the
onRequestError hook runs with no user session, and clients must never have
a write path to the bug table (RLS zero-policy + revoked grants)."
```

---

### Task 5: `instrumentation.ts` hook + CLAUDE.md note + full gate

**Files:**
- Create: `instrumentation.ts` (repo root)
- Test: `lib/__tests__/instrumentation.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `reportServerError(err, { routePath, method })` from Task 4 (via **dynamic** import — see comment in the code).
- Produces: the Next.js 15 `onRequestError` export. Nothing else consumes it; Next.js calls it.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/instrumentation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const reportMock = vi.fn(async (_err: unknown, _ctx: unknown) => {})
vi.mock('@/lib/error-reporting', () => ({ reportServerError: reportMock }))

import { onRequestError } from '@/instrumentation'

type Req = Parameters<typeof onRequestError>[1]
type Ctx = Parameters<typeof onRequestError>[2]

const request = { path: '/exchanges/123/edit', method: 'POST', headers: {} } as Req
const context = { routerKind: 'App Router', routePath: '/exchanges/[id]/edit', routeType: 'action' } as Ctx

describe('onRequestError', () => {
  beforeEach(() => {
    reportMock.mockClear()
    reportMock.mockResolvedValue(undefined)
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('delegates to reportServerError with the parameterized route path and method', async () => {
    const err = new Error('boom')
    await onRequestError(err, request, context)
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledWith(err, { routePath: '/exchanges/[id]/edit', method: 'POST' })
  })

  it('falls back to the request path when the context has no route path', async () => {
    await onRequestError(new Error('boom'), request, { ...context, routePath: '' } as Ctx)
    expect(reportMock).toHaveBeenCalledWith(expect.anything(), { routePath: '/exchanges/123/edit', method: 'POST' })
  })

  it('does nothing outside the Node runtime (edge middleware errors)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await onRequestError(new Error('boom'), request, context)
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('never throws, even when the reporter rejects', async () => {
    reportMock.mockRejectedValueOnce(new Error('db down'))
    await expect(onRequestError(new Error('boom'), request, context)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run lib/__tests__/instrumentation.test.ts
```

Expected: FAIL — cannot resolve `@/instrumentation`.

- [ ] **Step 3: Implement the hook**

Create `instrumentation.ts` at the repo root (next to `middleware.ts`). Next 15's `instrumentation.ts` is stable — no `next.config.mjs` change needed:

```ts
import type { Instrumentation } from 'next'

// Fires for every unexpected server error across server actions, RSC renders
// and route handlers. Thin shim over lib/error-reporting: Node-runtime only
// (the reporter needs node:crypto + the service-role client, neither of which
// belongs in the edge bundle — hence the dynamic import), and it never throws.
// Request headers are deliberately not forwarded (cookies, PII).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { reportServerError } = await import('@/lib/error-reporting')
    await reportServerError(err, {
      routePath: context.routePath || request.path,
      method: request.method,
    })
  } catch {
    console.error('[error-reporting] onRequestError hook failed')
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm exec vitest run lib/__tests__/instrumentation.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Document the subsystem in CLAUDE.md**

Add this section after "## Automated Reminders":

```markdown
## Server Error Reporting

Unexpected server errors (server actions, RSC renders, route handlers) are
recorded to the `error_reports` table by `instrumentation.ts` →
`lib/error-reporting.ts` (Next `onRequestError`; dedup by fingerprint of
normalized message + route, `open`/`resolved` status, occurrence counter).
Service-role only — no client access, no admin UI: triage in the Supabase
dashboard, flip `status` to `resolved` by hand; a recurrence reopens the row.
The reporter never throws; expected outcomes (structured returns) never land
here. Spec: `docs/superpowers/specs/2026-07-16-error-reporting-design.md`.
```

- [ ] **Step 6: Full gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
pnpm test:rls        # migration + RLS touched on this branch (skip only if no local stack; CI covers it)
```

Expected: all green. (Local `pnpm build` fails on placeholder `.env.local` env — the Vercel preview build on the PR is the real build gate; watch it for any edge-bundle complaint about `instrumentation.ts`.)

- [ ] **Step 7: Commit**

```bash
git add instrumentation.ts lib/__tests__/instrumentation.test.ts CLAUDE.md
git commit -m "feat: onRequestError instrumentation records unexpected server errors"
```

---

### Task 6: Finish the branch

- [ ] **Step 1: Use the finishing skill**

Use `superpowers:finishing-a-development-branch`. Recommended path for this repo: push `feature/error-reporting`, open a PR (CI runs unit + RLS + the real build), request review via `superpowers:requesting-code-review`. Bjorn merges with a **merge commit** (repo convention); merging deploys to prod via CI.

- [ ] **Step 2: Post-merge smoke check (listed on the PR for merge time)**

The migration is already live (Task 2), so the deploy just activates the hook. To verify end-to-end after the prod deploy: trigger any unexpected error (or temporarily hit a known-bad URL that 500s) and confirm a row appears in `error_reports` in the Supabase dashboard with `occurrences = 1`, then re-trigger and confirm `occurrences = 2` on the same row.

---

## Self-Review

- **Spec coverage:** table + RPC + RLS zero-policy (Task 1); staging→prod workflow + type regen (Task 2); normalization/fingerprint/redaction/truncation (Task 3); reporter never-throw + control-flow skip + allowlist (Task 4); `instrumentation.ts` shim (Task 5); RLS matrix cases same PR (Task 1); admin-allowlist test (Task 4). Out-of-scope list respected — no UI, no notifications, no client capture, no retention.
- **Deviation from spec, intentional:** digit-run placeholder threshold is 4+ (spec said "long digit runs") so 3-digit HTTP status codes keep distinct fingerprints; `p_stack`/`p_digest` get SQL `default null` so the generated RPC arg types mark them optional (`?? undefined` at the call site).
- **Type consistency:** `reportServerError(err: unknown, ctx: ServerErrorContext)` produced in Task 4 = consumed in Task 5; `errorFingerprint(normalizedMessage, routePath)` used identically in Task 4's implementation and tests; RPC arg names (`p_fingerprint`, `p_message`, `p_route_path`, `p_method`, `p_stack`, `p_digest`) match between migration, RLS tests, and reporter.
