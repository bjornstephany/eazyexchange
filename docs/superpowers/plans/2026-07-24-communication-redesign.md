# Communication Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the organizer Communication page so Infos is read-at-rest with deliberate editing, Modèles never exposes mustache syntax, and a new Historique sub-tab records what was published and sent.

**Architecture:** Three independent slices sharing one new append-only table. (1) A `communication_events` table under RLS, written best-effort from the four existing action call sites through the request-scoped client — no new service-role import. (2) Pure helpers in `lib/communication/` (`tokens.ts` for the mustache↔label display transform, `history.ts` for day-bucketed grouping, `events.ts` for the write) so every behavioural rule is unit-testable without React or Supabase. (3) `components/communication/` gains `InfoCardRow.tsx`, `InfoCardComposer.tsx` and `HistoryCard.tsx`; `InfoCardsCard.tsx` shrinks to a list container and `CommunicationView.tsx` grows a fourth sub-tab.

**Tech Stack:** Next.js 14 App Router (Server Actions), Supabase (Postgres + RLS), TypeScript, Tailwind, next-intl, Vitest + Testing Library, `postgres` (RLS matrix tests).

Spec: `docs/superpowers/specs/2026-07-24-communication-redesign-design.md`

## Global Constraints

- Branch: `feature/communication-redesign`, worktree `.claude/worktrees/feature+communication-redesign`. **Confirm `git branch --show-current` before every commit.** Never commit to `main`.
- Package manager is **pnpm**, never npm.
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- Storage format for the good-news template stays **mustache** (`{{student_name}}`, `{{exchange_name}}`). `lib/good-news-template.ts` and `lib/email.ts` are not touched by the token work. The display transform lives only between the DB value and the editor's `value`/`onChange`.
- **No new import of `lib/supabase/admin`.** All `communication_events` writes and reads go through the request-scoped client under RLS. `lib/supabase/__tests__/admin-allowlist.test.ts` must stay unchanged.
- **Never log student/parent PII.** `communication_events.subject` may hold an applicant *name* (it is an RLS-protected application table, not a log sink) but never an email address, and nothing new goes to `console`.
- Auth preambles use `requireOrganizer()` from `lib/auth/require.ts`. Error strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing.
- Expected outcomes are **structured return values**, never thrown errors (production redacts thrown Server Action messages).
- French copy uses the typographic apostrophe **`’` (U+2019)**, never `'`. Guard after any FR edit:
  `grep -n "[a-zA-Zà-ÿ]'[a-zA-Zà-ÿ]" messages/fr.json` must print nothing.
- Every new i18n key ships in **all five locales** (`en`, `fr`, `es`, `it`, `de`) in the same commit — `messages/__tests__/parity.test.ts` enforces key paths *and* ICU placeholder names.
- Verification gate before any merge: `pnpm lint`, `pnpm test`, `pnpm build`. Task 1 additionally requires `pnpm test:rls`.
- `supabase/migrations/` is single-writer across parallel sessions — do not start Task 1 if another session is mid-migration.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260724150000_communication_events.sql` | Table, indexes, RLS, append-only grants |
| `lib/communication/events.ts` | `recordCommunicationEvent()` — best-effort append, never throws |
| `lib/communication/tokens.ts` | `toEditor` / `toStored` pure display transform |
| `lib/communication/history.ts` | Types + `groupHistory()` pure day/collapse grouping |
| `lib/communication/__tests__/events.test.ts` | Write helper unit tests |
| `lib/communication/__tests__/tokens.test.ts` | Transform unit tests |
| `lib/communication/__tests__/history.test.ts` | Grouping unit tests |
| `actions/communication.ts` | `getCommunicationEvents()` server action (read) |
| `actions/__tests__/communication-events.test.ts` | Event lands on each of the four writes |
| `components/communication/InfoCardRow.tsx` | One published card: rest → edit → delete-confirm |
| `components/communication/InfoCardComposer.tsx` | Collapsed `+ Ajouter une info` → publish form |
| `components/communication/HistoryCard.tsx` | Historique rendering |
| `components/communication/__tests__/InfoCardRow.test.tsx` | |
| `components/communication/__tests__/InfoCardComposer.test.tsx` | |
| `components/communication/__tests__/GoodNewsCard.test.tsx` | Caret insertion + no-mustache |
| `components/communication/__tests__/HistoryCard.test.tsx` | |
| `tests/rls/communication-events.test.ts` | RLS matrix cases |

**Modified**

| File | Change |
|---|---|
| `actions/exchanges.ts` | `InfoCard` gains `createdAt`/`updatedAt`; three writes record events |
| `actions/applications-review.ts` | `await` the good-news send; record `good_news_sent` |
| `lib/email.ts` | `sendGoodNewsEmail` returns `Promise<boolean>` |
| `lib/retention/rules.ts` | `communicationEvents: 365` |
| `lib/retention/sweep.ts` | `purgeByAge` line |
| `lib/retention/__tests__/rules.test.ts` | assert the new floor |
| `components/communication/InfoCardsCard.tsx` | shrinks to list container |
| `components/communication/GoodNewsCard.tsx` | insert chips, no mustache, no `font-mono` |
| `components/communication/CommunicationView.tsx` | fourth sub-tab |
| `components/communication/__tests__/CommunicationView.test.tsx` | four tabs, new props |
| `app/(organizer)/communication/page.tsx` | load events |
| `types/supabase.ts` | regenerated |
| `messages/{en,fr,es,it,de}.json` | new/changed keys |
| `tests/rls/seed.ts` | `applicationA` already exists; no change expected — verify only |

---

## Task 1: `communication_events` table, RLS, retention

**Files:**
- Create: `supabase/migrations/20260724150000_communication_events.sql`
- Create: `tests/rls/communication-events.test.ts`
- Modify: `lib/retention/rules.ts`
- Modify: `lib/retention/sweep.ts:120-124` (the "simple age-based" block)
- Modify: `lib/retention/__tests__/rules.test.ts`
- Modify: `types/supabase.ts` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: nothing.
- Produces: table `communication_events` with columns `id, created_at, exchange_id, actor_id, application_id, kind, subject, status`; `kind ∈ {'info_published','info_updated','info_deleted','good_news_sent'}`; `status ∈ {'ok','failed'}`. Retention key `communicationEvents` on `RETENTION_DAYS`.

> **This task's DB-apply steps (6, 7, 8) require the Supabase MCP and touch production. They must be run by the main session, not delegated to a subagent.**

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260724150000_communication_events.sql`:

```sql
-- Append-only record of what the Communication page published or sent, per
-- exchange. Read by Communication → Historique.
--
-- Why not audit_log: lib/audit.ts is ids-and-actions only, never names or
-- contents. Historique must show « Point de rendez-vous » and « Marie Dupont »
-- to be worth anything, so it gets its own table rather than bending that rule.
--
-- Written through the REQUEST-SCOPED client under RLS (lib/communication/
-- events.ts) — deliberately not the service role, so no admin-allowlist entry.
create table communication_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exchange_id    uuid not null references exchanges(id) on delete cascade,
  -- on delete set null, NOT no action: this FK must never join the four that
  -- already block auth-user deletion.
  actor_id       uuid references users(id) on delete set null,
  -- Cascades so erasing an application also erases the stored applicant name.
  application_id uuid references applications(id) on delete cascade,
  kind           text not null check (kind in
                   ('info_published','info_updated','info_deleted','good_news_sent')),
  -- Denormalized: an info card title survives the card's deletion.
  subject        text not null default '',
  status         text not null default 'ok' check (status in ('ok','failed'))
);

-- Primary read path (Historique: newest first for one exchange). Doubles as the
-- exchange_id FK index.
create index communication_events_exchange_idx
  on communication_events (exchange_id, created_at desc);
-- FK indexes so the unindexed_fks advisor stays at 0.
create index communication_events_actor_idx on communication_events (actor_id);
create index communication_events_application_idx on communication_events (application_id);

alter table communication_events enable row level security;

-- Organizers whose school is either side of the exchange. Non-recursive:
-- references exchanges + the STABLE my_role()/my_school_id() helpers only, with
-- (select …) initplan wrappers per 20260705000004. Mirrors 20260719173904.
create policy "organizers read exchange communication events" on communication_events for select
  using (
    (select my_role()) = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = communication_events.exchange_id
        and (e.school_a_id = (select my_school_id()) or e.school_b_id = (select my_school_id()))
    )
  );

create policy "organizers append exchange communication events" on communication_events for insert
  with check (
    (select my_role()) = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = communication_events.exchange_id
        and (e.school_a_id = (select my_school_id()) or e.school_b_id = (select my_school_id()))
    )
  );

-- No policy for students — they never see this table.
-- Append-only enforcement beyond "no policy": drop the default grants so even a
-- future over-permissive policy cannot re-open mutation. Same belt-and-braces
-- as audit_log (20260709000002).
revoke update, delete, truncate on communication_events from anon, authenticated;
```

- [ ] **Step 2: Write the failing RLS test**

Create `tests/rls/communication-events.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures
let eventId: string

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path write (postgres bypasses RLS), so the read/deny cases below
  // have a row to aim at.
  const [row] = await sql<{ id: string }[]>`
    insert into communication_events (exchange_id, actor_id, kind, subject)
    values (${fx.exchangeA}, ${fx.orgA}, 'info_published', 'Point de rendez-vous')
    returning id`
  eventId = row.id
})
afterAll(async () => {
  await sql`delete from communication_events where exchange_id = ${fx.exchangeA}`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

// Read as a persona; a revoked grant counts as "no rows visible".
async function readRows(
  userId: string | null,
  q: (tx: postgres.TransactionSql) => Promise<postgres.Row[]>,
): Promise<postgres.Row[]> {
  try {
    return await runAs(sql, userId, q)
  } catch (e) {
    if ((e as { code?: string }).code === '42501') return []
    throw e
  }
}

describe('communication_events (organizer append-only, exchange-scoped)', () => {
  it('the owning organizer reads their exchange events', async () => {
    expect(await readRows(fx.orgA, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(1)
  })

  it('the owning organizer appends an event', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into communication_events (exchange_id, actor_id, kind, subject)
         values (${fx.exchangeA}, ${fx.orgA}, 'good_news_sent', 'Marie Dupont')`)).toBe(1)
  })

  it('an unrelated school organizer cannot read', async () => {
    expect(await readRows(fx.orgB, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(0)
  })

  it('an unrelated school organizer cannot append to exchange A', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into communication_events (exchange_id, kind, subject)
         values (${fx.exchangeA}, 'info_published', 'pwned')`))
  })

  it('a student cannot read', async () => {
    expect(await readRows(fx.studentA, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(0)
  })

  it('a student cannot append', async () => {
    expectBlocked(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`insert into communication_events (exchange_id, kind, subject)
         values (${fx.exchangeA}, 'info_published', 'pwned')`))
  })

  it('anon cannot read', async () => {
    expect(await readRows(null, (tx) =>
      tx`select id from communication_events where id = ${eventId}`)).toHaveLength(0)
  })

  // Append-only: the grant is revoked, so even the owning organizer is blocked.
  it('nobody can update — not even the owning organizer', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA, null]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`update communication_events set subject = 'rewritten' where id = ${eventId}`))
    }
  })

  it('nobody can delete — not even the owning organizer', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA, null]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from communication_events where id = ${eventId}`))
    }
  })
})
```

- [ ] **Step 3: Add the retention floor**

In `lib/retention/rules.ts`, inside the `RETENTION_DAYS` object, after the `emailSendLog` line:

```ts
  emailSendLog: 365,              // created_at
  communicationEvents: 365,       // created_at — mirrors emailSendLog
  auditLog: 730,                  // created_at
```

In `lib/retention/sweep.ts`, in block 6 ("Simple age-based, service-role-only row purges"), after the `emailSendLog` line:

```ts
  summary.emailSendLog = await purgeByAge(admin, mode, 'email_send_log', 'created_at', cutoff(now, 'emailSendLog'))
  summary.communicationEvents = await purgeByAge(admin, mode, 'communication_events', 'created_at', cutoff(now, 'communicationEvents'))
  summary.auditLog = await purgeByAge(admin, mode, 'audit_log', 'created_at', cutoff(now, 'auditLog'))
```

In `lib/retention/__tests__/rules.test.ts`, next to the existing floor assertions:

```ts
    expect(RETENTION_DAYS.communicationEvents).toBe(365)
```

- [ ] **Step 4: Run the unit tests to verify the retention change passes**

Run: `pnpm vitest run lib/retention --exclude '**/.claude/**'`
Expected: PASS (the sweep test may need no change — `summary` is a `Record<string, number>`; if it asserts an exact object shape, add `communicationEvents: 0` to the expectation).

- [ ] **Step 5: Apply the migration to the LOCAL stack and run the RLS matrix**

Run:
```bash
supabase db reset   # `supabase start` does NOT apply new migrations; db reset does
pnpm test:rls
```
Expected: all suites PASS, including the 9 new `communication_events` cases.

If the local stack is unavailable, point at a dedicated test project with `RLS_TEST_DB_URL` — **never production**.

- [ ] **Step 6: Apply to STAGING first**

Run from the **main checkout** (`.env.staging` is never committed and lives there):
```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```
Expected: `Applying migration 20260724150000_communication_events.sql...` then `Finished supabase db push.`

If it hangs on IPv6, resolve v4 first: `getent ahostsv4 <pooler-host>` and substitute the IP in `--db-url`.

- [ ] **Step 7: Apply to PROD via MCP, then reconcile the ledger**

Use the Supabase MCP `apply_migration` tool with `name` = `communication_events` and the file's SQL body.

Then MCP `list_migrations`: if prod stamped a version different from `20260724150000`, `git mv` the local file to the stamped version **and** update staging's ledger row to match (otherwise staging re-drifts). Never run the CLI's suggested `migration repair`.

- [ ] **Step 8: Regenerate DB types**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` **verbatim** (never hand-edit).

Run: `npx tsc --noEmit`
Expected: no output. `types/db.ts` narrows generated rows, so drift fails here rather than silently.

- [ ] **Step 9: Check the advisors**

MCP `get_advisors` with `type: 'performance'` — `unindexed_fks` must not name `communication_events`. MCP `get_advisors` with `type: 'security'` — no new RLS finding.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260724150000_communication_events.sql \
        tests/rls/communication-events.test.ts \
        lib/retention/rules.ts lib/retention/sweep.ts \
        lib/retention/__tests__/rules.test.ts \
        types/supabase.ts
git commit -m "feat(db): communication_events table, RLS and 365-day retention"
```

---

## Task 2: `recordCommunicationEvent()`

**Files:**
- Create: `lib/communication/events.ts`
- Create: `lib/communication/__tests__/events.test.ts`

**Interfaces:**
- Consumes: the `communication_events` table from Task 1.
- Produces:
  ```ts
  export type CommunicationEventKind =
    | 'info_published' | 'info_updated' | 'info_deleted' | 'good_news_sent'
  export type CommunicationEventStatus = 'ok' | 'failed'
  export type CommunicationEventInput = {
    exchangeId: string
    actorId: string | null
    applicationId?: string | null
    kind: CommunicationEventKind
    subject: string
    status?: CommunicationEventStatus
  }
  export async function recordCommunicationEvent(
    supabase: CommunicationEventClient,
    entry: CommunicationEventInput,
  ): Promise<void>
  ```
  where `CommunicationEventClient = Awaited<ReturnType<typeof createClient>>` (`@/lib/supabase/server`). Tasks 3 and 4 call it with the client they already built.

- [ ] **Step 1: Write the failing test**

Create `lib/communication/__tests__/events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordCommunicationEvent } from '@/lib/communication/events'

let inserted: Record<string, unknown>[] = []
let insertResult: { error: { code?: string } | null } = { error: null }

function makeClient() {
  return {
    from(table: string) {
      expect(table).toBe('communication_events')
      return {
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row)
          return insertResult
        },
      }
    },
  } as never
}

beforeEach(() => {
  inserted = []
  insertResult = { error: null }
})

describe('recordCommunicationEvent', () => {
  it('maps the camelCase input onto the snake_case row', async () => {
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1',
      actorId: 'user-1',
      kind: 'info_published',
      subject: 'Point de rendez-vous',
    })
    expect(inserted).toEqual([{
      exchange_id: 'ex-1',
      actor_id: 'user-1',
      application_id: null,
      kind: 'info_published',
      subject: 'Point de rendez-vous',
      status: 'ok',
    }])
  })

  it('carries application_id and a failed status through', async () => {
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1',
      actorId: 'user-1',
      applicationId: 'app-1',
      kind: 'good_news_sent',
      subject: 'Marie Dupont',
      status: 'failed',
    })
    expect(inserted[0]).toMatchObject({ application_id: 'app-1', status: 'failed' })
  })

  it('truncates an over-long subject rather than letting the insert fail', async () => {
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1', actorId: null, kind: 'info_updated', subject: 'x'.repeat(500),
    })
    expect((inserted[0].subject as string).length).toBe(200)
  })

  // Best-effort, exactly like logEmailSend: a history hiccup must never roll
  // back the real action the organizer performed.
  it('never throws when the insert returns an error', async () => {
    insertResult = { error: { code: '42501' } }
    await expect(recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1', actorId: null, kind: 'info_deleted', subject: 'T',
    })).resolves.toBeUndefined()
  })

  it('never throws when the client itself blows up', async () => {
    const broken = { from() { throw new Error('boom') } } as never
    await expect(recordCommunicationEvent(broken, {
      exchangeId: 'ex-1', actorId: null, kind: 'info_deleted', subject: 'T',
    })).resolves.toBeUndefined()
  })

  it('logs no PII when the write fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertResult = { error: { code: '42501' } }
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1', actorId: null, kind: 'good_news_sent', subject: 'Marie Dupont',
    })
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('Marie Dupont')
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/communication/__tests__/events.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `Failed to resolve import "@/lib/communication/events"`.

- [ ] **Step 3: Write the implementation**

Create `lib/communication/events.ts`:

```ts
import type { createClient } from '@/lib/supabase/server'

// The request-scoped client, passed in by the calling action. Deliberately not
// the service-role client: communication_events is written under RLS, so this
// module never appears in lib/supabase/__tests__/admin-allowlist.test.ts.
export type CommunicationEventClient = Awaited<ReturnType<typeof createClient>>

export type CommunicationEventKind =
  | 'info_published' | 'info_updated' | 'info_deleted' | 'good_news_sent'
export type CommunicationEventStatus = 'ok' | 'failed'

export type CommunicationEventInput = {
  exchangeId: string
  actorId: string | null
  applicationId?: string | null
  kind: CommunicationEventKind
  subject: string
  status?: CommunicationEventStatus
}

// Info-card titles cap at 120 and applicant names are far shorter; this is a
// backstop so a pathological subject can never fail the insert.
const SUBJECT_MAX = 200

// Append one Historique row. Await it at call sites, but it NEVER throws: a
// history hiccup must not roll back the action the organizer actually
// performed. Same philosophy as logEmailSend / logAudit.
// PII: `subject` may hold an applicant name (RLS-protected app table, not a log
// sink) — but it is never written to console here.
export async function recordCommunicationEvent(
  supabase: CommunicationEventClient,
  entry: CommunicationEventInput,
): Promise<void> {
  try {
    const { error } = await supabase.from('communication_events').insert({
      exchange_id: entry.exchangeId,
      actor_id: entry.actorId,
      application_id: entry.applicationId ?? null,
      kind: entry.kind,
      subject: entry.subject.slice(0, SUBJECT_MAX),
      status: entry.status ?? 'ok',
    })
    if (error) console.error('[communication-events] write failed:', error.code ?? 'unknown')
  } catch {
    console.error('[communication-events] write failed: unexpected')
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/communication/__tests__/events.test.ts --exclude '**/.claude/**'`
Expected: PASS, 6 tests.

- [ ] **Step 5: Confirm the admin allowlist is untouched**

Run: `pnpm vitest run lib/supabase/__tests__/admin-allowlist.test.ts --exclude '**/.claude/**'`
Expected: PASS with no edit to the allowlist file.

- [ ] **Step 6: Commit**

```bash
git add lib/communication/events.ts lib/communication/__tests__/events.test.ts
git commit -m "feat(communication): best-effort recordCommunicationEvent under RLS"
```

---

## Task 3: Info-card actions record events; `InfoCard` gains timestamps

**Files:**
- Modify: `actions/exchanges.ts:301-389`
- Create: `actions/__tests__/communication-events.test.ts`
- Modify: `actions/__tests__/exchange-info-cards.test.ts` (the `addInfoCard` success assertion gains the two timestamps)

**Interfaces:**
- Consumes: `recordCommunicationEvent` (Task 2).
- Produces:
  ```ts
  export type InfoCard = {
    id: string; title: string; body: string; position: number
    createdAt: string; updatedAt: string
  }
  ```
  Task 7's `InfoCardRow` renders the status line from `createdAt`/`updatedAt`.

Note: `actions/student-info.ts` selects its own columns into `StudentInfoCard` and is **not** affected.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/communication-events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { userId: string; role: 'organizer' | 'student'; profileSchool: string; exchangeSchoolA: string }
let events: any[] = []

const CARD_ROW = {
  id: 'card-1', title: 'Point de rendez-vous', body: 'Gare', position: 0,
  created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-22T09:00:00.000Z',
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: async () => ({ data: [{ position: 0 }], error: null }),
        insert: (row: any) => {
          if (table === 'communication_events') { events.push(row); return Promise.resolve({ error: null }) }
          return { select: () => ({ single: async () => ({ data: CARD_ROW, error: null }) }) }
        },
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: CARD_ROW, error: null }) }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        maybeSingle: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          if (table === 'exchanges') return { data: { school_a_id: scenario.exchangeSchoolA, school_b_id: null, archived_at: null }, error: null }
          if (table === 'exchange_info_cards') return { data: { exchange_id: 'ex-1', title: 'Point de rendez-vous' }, error: null }
          return { data: null, error: null }
        },
        single: async () => ({ data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }),
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: scenario.userId }),
  getProfile: async () => ({ school_id: scenario.profileSchool, role: scenario.role }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addInfoCard, updateInfoCard, deleteInfoCard } from '../exchanges'

beforeEach(() => {
  events = []
  scenario = { userId: 'u1', role: 'organizer', profileSchool: 'school-1', exchangeSchoolA: 'school-1' }
})

describe('info-card actions record communication events', () => {
  it('addInfoCard appends info_published with the title', async () => {
    await addInfoCard('ex-1', { title: 'Point de rendez-vous', body: 'Gare' })
    expect(events).toEqual([{
      exchange_id: 'ex-1', actor_id: 'u1', application_id: null,
      kind: 'info_published', subject: 'Point de rendez-vous', status: 'ok',
    }])
  })

  it('updateInfoCard appends info_updated with the NEW title', async () => {
    await updateInfoCard('card-1', { title: 'Nouveau titre', body: '' })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'info_updated', subject: 'Nouveau titre' })
  })

  it('deleteInfoCard appends info_deleted with the title read BEFORE the delete', async () => {
    await deleteInfoCard('card-1')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'info_deleted', subject: 'Point de rendez-vous' })
  })

  it('a rejected validation records nothing', async () => {
    await addInfoCard('ex-1', { title: '   ', body: '' })
    expect(events).toHaveLength(0)
  })

  it('addInfoCard returns the card timestamps the Infos status line needs', async () => {
    const r = await addInfoCard('ex-1', { title: 'Point de rendez-vous', body: 'Gare' })
    expect(r).toEqual({ ok: true, card: {
      id: 'card-1', title: 'Point de rendez-vous', body: 'Gare', position: 0,
      createdAt: '2026-07-20T09:00:00.000Z', updatedAt: '2026-07-22T09:00:00.000Z',
    } })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run actions/__tests__/communication-events.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `events` is empty and the returned card has no `createdAt`.

- [ ] **Step 3: Widen the `InfoCard` type and add a row mapper**

In `actions/exchanges.ts`, replace line 301 and add a mapper below it:

```ts
export type InfoCard = {
  id: string; title: string; body: string; position: number
  // Drive the Infos status line (« publiée le … » vs « modifiée le … »).
  createdAt: string; updatedAt: string
}
export type InfoCardResult = { ok: true; card: InfoCard } | { ok: false; error: InfoCardError }

const INFO_CARD_COLUMNS = 'id, title, body, position, created_at, updated_at'

type InfoCardRow = {
  id: string; title: string; body: string; position: number
  created_at: string; updated_at: string
}
function toInfoCard(row: InfoCardRow): InfoCard {
  return {
    id: row.id, title: row.title, body: row.body, position: row.position,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 4: Rewrite the three read/write bodies**

Import at the top of `actions/exchanges.ts`, alongside the existing imports:

```ts
import { recordCommunicationEvent } from '@/lib/communication/events'
```

Replace `getInfoCards`, `addInfoCard`, `updateInfoCard` and `deleteInfoCard` bodies:

```ts
export async function getInfoCards(exchangeId: string): Promise<InfoCard[]> {
  const supabase = await createClient()
  await requireOrganizer()
  await assertExchangeInScope(supabase, exchangeId)

  const { data, error } = await supabase
    .from('exchange_info_cards')
    .select(INFO_CARD_COLUMNS)
    .eq('exchange_id', exchangeId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as InfoCardRow[]).map(toInfoCard)
}

export async function addInfoCard(
  exchangeId: string, input: { title: string; body: string },
): Promise<InfoCardResult> {
  const supabase = await createClient()
  const { user } = await requireOrganizer()
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const validated = validateInfoCard(input)
  if (!validated.ok) return validated

  // Append: next position after the current max for this exchange.
  const { data: rows } = await supabase
    .from('exchange_info_cards')
    .select('position')
    .eq('exchange_id', exchangeId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPosition = ((rows?.[0]?.position as number | undefined) ?? -1) + 1

  const { data, error } = await supabase
    .from('exchange_info_cards')
    .insert({ exchange_id: exchangeId, title: validated.value.title, body: validated.value.body, position: nextPosition })
    .select(INFO_CARD_COLUMNS)
    .single()
  if (error) throw error

  await recordCommunicationEvent(supabase, {
    exchangeId, actorId: user.id, kind: 'info_published', subject: validated.value.title,
  })
  revalidatePath('/communication')
  return { ok: true, card: toInfoCard(data as InfoCardRow) }
}

export async function updateInfoCard(
  cardId: string, input: { title: string; body: string },
): Promise<InfoCardResult> {
  const supabase = await createClient()
  const { user } = await requireOrganizer()

  // Resolve the card's exchange, then scope + writable-guard it.
  const { data: existing } = await supabase
    .from('exchange_info_cards').select('exchange_id, title').eq('id', cardId).maybeSingle()
  if (!existing) throw new Error('Info card not found')
  const exchangeId = existing.exchange_id as string
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const validated = validateInfoCard(input)
  if (!validated.ok) return validated

  const { data, error } = await supabase
    .from('exchange_info_cards')
    .update({ title: validated.value.title, body: validated.value.body, updated_at: new Date().toISOString() })
    .eq('id', cardId)
    .select(INFO_CARD_COLUMNS)
    .single()
  if (error) throw error

  await recordCommunicationEvent(supabase, {
    exchangeId, actorId: user.id, kind: 'info_updated', subject: validated.value.title,
  })
  revalidatePath('/communication')
  return { ok: true, card: toInfoCard(data as InfoCardRow) }
}

export async function deleteInfoCard(cardId: string): Promise<void> {
  const supabase = await createClient()
  const { user } = await requireOrganizer()

  // Read the title BEFORE the delete — Historique keeps a record of cards that
  // no longer exist, which is the whole point of denormalizing `subject`.
  const { data: existing } = await supabase
    .from('exchange_info_cards').select('exchange_id, title').eq('id', cardId).maybeSingle()
  if (!existing) throw new Error('Info card not found')
  const exchangeId = existing.exchange_id as string
  const title = (existing.title as string) ?? ''
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase.from('exchange_info_cards').delete().eq('id', cardId)
  if (error) throw error

  await recordCommunicationEvent(supabase, {
    exchangeId, actorId: user.id, kind: 'info_deleted', subject: title,
  })
  revalidatePath('/communication')
}
```

- [ ] **Step 5: Update the pre-existing action test**

In `actions/__tests__/exchange-info-cards.test.ts`, the mock row must carry the new columns and the success assertion the new shape. Replace the `insert` and `update` lines in `makeClient` (lines 14–15) with:

```ts
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'card-1', title: 'T', body: '', position: 0, created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-20T09:00:00.000Z' }, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'card-1', title: 'T', body: '', position: 0, created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-20T09:00:00.000Z' }, error: null }) }) }) }),
```

and the last assertion (line 60–61) with:

```ts
    await expect(addInfoCard('ex-1', { title: 'T', body: '' }))
      .resolves.toEqual({ ok: true, card: {
        id: 'card-1', title: 'T', body: '', position: 0,
        createdAt: '2026-07-20T09:00:00.000Z', updatedAt: '2026-07-20T09:00:00.000Z',
      } })
```

- [ ] **Step 6: Run both action suites**

Run: `pnpm vitest run actions/__tests__/communication-events.test.ts actions/__tests__/exchange-info-cards.test.ts actions/__tests__/onboarding-first-exchange.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. (`components/communication/InfoCardsCard.tsx` still compiles — it only reads `title`/`body`/`id`.)

- [ ] **Step 8: Commit**

```bash
git add actions/exchanges.ts actions/__tests__/communication-events.test.ts \
        actions/__tests__/exchange-info-cards.test.ts
git commit -m "feat(communication): record info-card events; expose card timestamps"
```

---

## Task 4: Await the good-news send and record its true outcome

**Files:**
- Modify: `lib/email.ts:177-206`
- Modify: `actions/applications-review.ts:229-240`
- Modify: `actions/__tests__/bulk-applications.test.ts` (mock returns a boolean; new assertions)

**Interfaces:**
- Consumes: `recordCommunicationEvent` (Task 2).
- Produces: `sendGoodNewsEmail(...): Promise<boolean>` — `true` when Resend accepted the send.

- [ ] **Step 1: Write the failing tests**

In `actions/__tests__/bulk-applications.test.ts`, change the `@/lib/email` mock so the good-news mock resolves a boolean, and add the event capture. Replace the mock block (lines ~74–81) with:

```ts
let events: any[] = []
vi.mock('@/lib/communication/events', () => ({
  recordCommunicationEvent: vi.fn(async (_client: unknown, entry: any) => { events.push(entry) }),
}))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(async () => {}),
  sendApplicationConfirmationEmail: vi.fn(async () => {}),
  sendNewApplicationAlertEmail: vi.fn(async () => {}),
  sendInvitationEmail: vi.fn(async () => {}),
  sendApplicationRejectionEmail: vi.fn(async () => {}),
  sendGoodNewsEmail: vi.fn(async () => true),
}))
```

Add `events = []` to the existing `beforeEach` body, next to `updates = []`.

Then append this describe block at the end of the file:

```ts
describe('accept records a good_news_sent event with the real send outcome', () => {
  it('records ok per accepted application, named and application-scoped', async () => {
    await acceptApplications(['app-ok', 'app-noparent'])
    expect(events).toHaveLength(2)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exchangeId: 'ex-1', kind: 'good_news_sent',
        applicationId: 'app-ok', subject: 'A B', status: 'ok',
      }),
      expect.objectContaining({
        applicationId: 'app-noparent', subject: 'C D', status: 'ok',
      }),
    ]))
  })

  // A history that says "sent" for a mail that bounced is worse than no
  // history: the send result has to be awaited, not fire-and-forget.
  it('records failed when the send returns false', async () => {
    vi.mocked(sendGoodNewsEmail).mockResolvedValue(false)
    await acceptApplications(['app-ok'])
    expect(events[0]).toMatchObject({ kind: 'good_news_sent', status: 'failed' })
  })

  // rejectApplications(ids, note, sendEmail) — positional, per
  // actions/applications-review.ts:317.
  it('a rejection records nothing', async () => {
    await rejectApplications(['app-ok'], 'non', true)
    expect(events).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run actions/__tests__/bulk-applications.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `events` is empty (the accept path is still fire-and-forget and records nothing).

- [ ] **Step 3: Make `sendGoodNewsEmail` return the send result**

In `lib/email.ts`, change the signature at line 189 and the last line of the body:

```ts
}): Promise<boolean> {
```

```ts
  return send(opts.to, subject, html, 'good news email', opts.ctx)
```

(`send()` already returns `Promise<boolean>`; only the `await`-and-discard becomes a `return`.)

- [ ] **Step 4: Await the send and record the event**

In `actions/applications-review.ts`, add the import beside `logAudit`:

```ts
import { recordCommunicationEvent } from '@/lib/communication/events'
```

Replace lines 229–240 (the `void sendGoodNewsEmail(...)` block and its `return`):

```ts
          // Awaited, not fire-and-forget: Historique must record what actually
          // happened. This does NOT serialize a bulk accept — the whole
          // per-application body already runs inside Promise.all over ids, so
          // the Resend calls stay parallel; the action just waits for the
          // slowest round-trip.
          const sent = await sendGoodNewsEmail({
            to: parentRecipients(app.data as Record<string, string>, app.email),
            studentName: buildApplicantName(app.data),
            exchangeName: exchange?.name ?? '',
            subject: exchange?.good_news_subject ?? null,
            body: exchange?.good_news_body ?? null,
            respondUrl: `${APP_URL}/invite/${inviteToken}`,
            language: app.language === 'fr' ? 'fr' : 'en',
            personalNote: op.personalNote,
            ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
          }).catch(() => false)

          await recordCommunicationEvent(supabase, {
            exchangeId: app.exchange_id,
            actorId: user.id,
            applicationId: id,
            kind: 'good_news_sent',
            subject: buildApplicantName(app.data),
            status: sent ? 'ok' : 'failed',
          })
          return { ok: true }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/bulk-applications.test.ts actions/__tests__/applications.test.ts actions/__tests__/audit-instrumentation.test.ts --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 6: Sweep for other `sendGoodNewsEmail` callers**

Run: `grep -rn "sendGoodNewsEmail" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v '\.claude/'`
Expected: only `lib/email.ts`, `actions/applications-review.ts`, and test mocks. A `Promise<void>` → `Promise<boolean>` widening is source-compatible for any caller that ignores the result, but any *other* mock returning `undefined` must be updated to `true`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add lib/email.ts actions/applications-review.ts actions/__tests__/bulk-applications.test.ts
git commit -m "feat(communication): await the good-news send and record its outcome"
```

---

## Task 5: `toEditor` / `toStored` display transform

**Files:**
- Create: `lib/communication/tokens.ts`
- Create: `lib/communication/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type TokenLabels = { studentName: string; exchangeName: string }
  export function toEditor(stored: string, labels: TokenLabels): string
  export function toStored(editorText: string, labels: TokenLabels): string
  export function tokenChip(label: string): string   // `[[${label}]]`
  ```
  Task 6 feeds `labels` from `settings.goodNews.tokens.*`.

- [ ] **Step 1: Write the failing test**

Create `lib/communication/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toEditor, toStored, tokenChip, type TokenLabels } from '@/lib/communication/tokens'

// The real French labels, apostrophe included — the transform must survive
// non-ASCII and typographic punctuation.
const FR: TokenLabels = {
  studentName: 'Prénom et nom de l’élève',
  exchangeName: 'Nom du programme',
}
const DE: TokenLabels = { studentName: 'Vor- und Nachname', exchangeName: 'Programmname' }

describe('tokenChip', () => {
  it('wraps a label in the double-bracket delimiters', () => {
    expect(tokenChip(FR.studentName)).toBe('[[Prénom et nom de l’élève]]')
  })
})

describe('toEditor', () => {
  it('renders each mustache token as its localized label', () => {
    expect(toEditor('{{student_name}}', FR)).toBe('[[Prénom et nom de l’élève]]')
    expect(toEditor('{{exchange_name}}', FR)).toBe('[[Nom du programme]]')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(toEditor('{{student_name}} et {{student_name}}', FR))
      .toBe('[[Prénom et nom de l’élève]] et [[Prénom et nom de l’élève]]')
  })

  it('leaves surrounding prose and newlines untouched', () => {
    expect(toEditor('Bonjour,\n\n{{student_name}} part !', FR))
      .toBe('Bonjour,\n\n[[Prénom et nom de l’élève]] part !')
  })

  it('leaves an unknown mustache token alone rather than mangling it', () => {
    expect(toEditor('{{unknown}}', FR)).toBe('{{unknown}}')
  })

  it('is locale-driven: the same storage renders differently per locale', () => {
    expect(toEditor('{{student_name}}', DE)).toBe('[[Vor- und Nachname]]')
  })
})

describe('toStored', () => {
  it('converts each localized label back to mustache', () => {
    expect(toStored('[[Prénom et nom de l’élève]]', FR)).toBe('{{student_name}}')
    expect(toStored('[[Nom du programme]]', FR)).toBe('{{exchange_name}}')
  })

  it('leaves unmatched brackets as literal text', () => {
    expect(toStored('[[Autre chose]]', FR)).toBe('[[Autre chose]]')
    expect(toStored('[[', FR)).toBe('[[')
    expect(toStored('a ] b [ c', FR)).toBe('a ] b [ c')
  })

  it('does not convert a label written without its brackets', () => {
    expect(toStored('Prénom et nom de l’élève', FR)).toBe('Prénom et nom de l’élève')
  })

  it('leaves mustache the organizer somehow typed by hand alone', () => {
    expect(toStored('{{student_name}}', FR)).toBe('{{student_name}}')
  })
})

describe('round trip', () => {
  const samples = [
    '{{student_name}} — {{exchange_name}}',
    'Bonjour,\n\nLa candidature de {{student_name}} pour {{exchange_name}} a été retenue !',
    'Aucun jeton ici.',
    '',
  ]
  it('toStored(toEditor(x)) === x for every stored sample', () => {
    for (const s of samples) expect(toStored(toEditor(s, FR), FR)).toBe(s)
  })
  it('toEditor(toStored(y)) === y for every editor sample', () => {
    for (const s of samples) {
      const editor = toEditor(s, FR)
      expect(toEditor(toStored(editor, FR), FR)).toBe(editor)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/communication/__tests__/tokens.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `Failed to resolve import "@/lib/communication/tokens"`.

- [ ] **Step 3: Write the implementation**

Create `lib/communication/tokens.ts`:

```ts
// The good-news template is STORED as mustache ({{student_name}},
// {{exchange_name}}) — lib/good-news-template.ts, lib/email.ts and every row
// already in prod depend on that and are untouched. But a schoolteacher must
// never see mustache, so the editor shows a human-readable surface form and
// this module converts between the two on the way in and out.
//
//   toEditor('{{student_name}}')             → '[[Prénom et nom de l’élève]]'
//   toStored('[[Prénom et nom de l’élève]]') → '{{student_name}}'
//
// Labels are localized; storage never is. Switching locale simply re-renders
// with the new label. `[[…]]` plus the exact localized label makes accidental
// collision implausible; unmatched brackets degrade to literal text because the
// replacement is an exact-string swap, never a pattern match.

export type TokenLabels = { studentName: string; exchangeName: string }

export function tokenChip(label: string): string {
  return `[[${label}]]`
}

const MUSTACHE = {
  studentName: '{{student_name}}',
  exchangeName: '{{exchange_name}}',
} as const

export function toEditor(stored: string, labels: TokenLabels): string {
  return stored
    .replaceAll(MUSTACHE.studentName, tokenChip(labels.studentName))
    .replaceAll(MUSTACHE.exchangeName, tokenChip(labels.exchangeName))
}

export function toStored(editorText: string, labels: TokenLabels): string {
  return editorText
    .replaceAll(tokenChip(labels.studentName), MUSTACHE.studentName)
    .replaceAll(tokenChip(labels.exchangeName), MUSTACHE.exchangeName)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/communication/__tests__/tokens.test.ts --exclude '**/.claude/**'`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/communication/tokens.ts lib/communication/__tests__/tokens.test.ts
git commit -m "feat(communication): mustache↔label display transform for the template editor"
```

---

## Task 6: Modèles — insert chips, no mustache, no monospace

**Files:**
- Modify: `components/communication/GoodNewsCard.tsx`
- Create: `components/communication/__tests__/GoodNewsCard.test.tsx`
- Modify: `messages/{en,fr,es,it,de}.json` → `organizer.settings.goodNews`

**Interfaces:**
- Consumes: `toEditor`, `toStored`, `tokenChip` (Task 5).
- Produces: no exported API change — `GoodNewsCard` keeps its current props.

- [ ] **Step 1: Add the i18n keys (all five locales)**

Under `organizer.settings.goodNews`: **delete** `placeholdersLabel`, **add** `whenSent`, `insertLabel`, `tokens.studentName`, `tokens.exchangeName`.

`messages/fr.json`:
```json
      "whenSent": "Envoyé automatiquement aux parents lorsque vous acceptez une candidature.",
      "insertLabel": "Insérer :",
      "tokens": {
        "studentName": "Prénom et nom de l’élève",
        "exchangeName": "Nom du programme"
      },
```

`messages/en.json`:
```json
      "whenSent": "Sent automatically to the parents when you accept an application.",
      "insertLabel": "Insert:",
      "tokens": {
        "studentName": "Student’s first and last name",
        "exchangeName": "Programme name"
      },
```

`messages/es.json`:
```json
      "whenSent": "Se envía automáticamente a los padres cuando aceptas una candidatura.",
      "insertLabel": "Insertar:",
      "tokens": {
        "studentName": "Nombre y apellidos del alumno",
        "exchangeName": "Nombre del programa"
      },
```

`messages/it.json`:
```json
      "whenSent": "Inviata automaticamente ai genitori quando accetti una candidatura.",
      "insertLabel": "Inserisci:",
      "tokens": {
        "studentName": "Nome e cognome dell’alunno",
        "exchangeName": "Nome del programma"
      },
```

`messages/de.json`:
```json
      "whenSent": "Wird automatisch an die Eltern gesendet, wenn Sie eine Bewerbung annehmen.",
      "insertLabel": "Einfügen:",
      "tokens": {
        "studentName": "Vor- und Nachname des Schülers",
        "exchangeName": "Name des Programms"
      },
```

**Label constraint:** no `[` or `]` may appear in any `tokens.*` value — they are wrapped in `[[…]]` by `tokenChip`.

- [ ] **Step 2: Write the failing component test**

Create `components/communication/__tests__/GoodNewsCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const updateGoodNewsTemplate = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/actions/settings', () => ({ updateGoodNewsTemplate }))

import { GoodNewsCard } from '@/components/communication/GoodNewsCard'

const g = fr.organizer.settings.goodNews
const STUDENT_CHIP = `[[${g.tokens.studentName}]]`
const EXCHANGE_CHIP = `[[${g.tokens.exchangeName}]]`

const baseProps = {
  exchangeId: 'ex-1',
  exchangeName: 'France-Canada 2026',
  initialSubject: 'Bonne nouvelle pour {{student_name}}',
  initialBody: 'Bonjour,\n\n{{student_name}} part pour {{exchange_name}}.',
  readOnly: false,
}

const subjectInput = () => screen.getByLabelText(g.subjectLabel) as HTMLInputElement
const bodyInput = () => screen.getByLabelText(g.bodyLabel) as HTMLTextAreaElement

beforeEach(() => vi.clearAllMocks())

describe('GoodNewsCard', () => {
  it('never shows mustache syntax anywhere on the card', () => {
    const { container } = renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(container.textContent).not.toContain('{{')
    expect(subjectInput().value).not.toContain('{{')
    expect(bodyInput().value).not.toContain('{{')
  })

  it('renders stored mustache as localized labels', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(subjectInput().value).toBe(`Bonne nouvelle pour ${STUDENT_CHIP}`)
    expect(bodyInput().value).toBe(`Bonjour,\n\n${STUDENT_CHIP} part pour ${EXCHANGE_CHIP}.`)
  })

  it('states when the mail fires instead of listing tags', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getByText(g.whenSent)).toBeTruthy()
  })

  it('gives each field its own insert row', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getAllByText(g.insertLabel)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: g.tokens.studentName })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: g.tokens.exchangeName })).toHaveLength(2)
  })

  it('inserts at the caret in the subject, replacing the selection', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    const input = subjectInput()
    fireEvent.change(input, { target: { value: 'AB' } })
    input.setSelectionRange(1, 1)
    fireEvent.click(screen.getAllByRole('button', { name: g.tokens.exchangeName })[0])
    expect(input.value).toBe(`A${EXCHANGE_CHIP}B`)
  })

  it('replaces a selected range and leaves the caret after the insert', async () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    const area = bodyInput()
    fireEvent.change(area, { target: { value: 'XYZ' } })
    area.setSelectionRange(1, 2)
    fireEvent.click(screen.getAllByRole('button', { name: g.tokens.studentName })[1])
    expect(area.value).toBe(`X${STUDENT_CHIP}Z`)
    // The caret moves in a requestAnimationFrame, after the DOM value updates.
    await vi.waitFor(() => expect(area.selectionStart).toBe(1 + STUDENT_CHIP.length))
  })

  it('saves mustache, not labels', async () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    fireEvent.change(subjectInput(), { target: { value: `Salut ${STUDENT_CHIP}` } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(g.saveButton) }))
    await vi.waitFor(() => expect(updateGoodNewsTemplate).toHaveBeenCalled())
    expect(updateGoodNewsTemplate).toHaveBeenCalledWith(
      'ex-1',
      'Salut {{student_name}}',
      'Bonjour,\n\n{{student_name}} part pour {{exchange_name}}.',
    )
  })

  it('the body is prose, not code — no monospace class', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(bodyInput().className).not.toContain('font-mono')
  })

  it('the preview still substitutes real values', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} />)
    expect(screen.getByText('Bonne nouvelle pour Marie Dupont')).toBeTruthy()
  })

  it('read-only hides insert chips, reset and save', () => {
    renderWithIntl(<GoodNewsCard {...baseProps} readOnly />)
    expect(screen.queryByText(g.insertLabel)).toBeNull()
    expect(screen.queryByText(g.resetToDefault)).toBeNull()
    expect(screen.queryByText(g.saveButton)).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run components/communication/__tests__/GoodNewsCard.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — `g.whenSent` is undefined / the inputs still show `{{student_name}}`.

- [ ] **Step 4: Rewrite `GoodNewsCard.tsx`**

Replace the whole file:

```tsx
'use client'
import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SaveIcon } from 'lucide-react'
import { updateGoodNewsTemplate } from '@/actions/settings'
import { toEditor, toStored, tokenChip, type TokenLabels } from '@/lib/communication/tokens'
import {
  renderGoodNews,
  DEFAULT_GOOD_NEWS_SUBJECT,
  DEFAULT_GOOD_NEWS_BODY,
} from '@/lib/good-news-template'

export function GoodNewsCard({ exchangeId, exchangeName, initialSubject, initialBody, readOnly }: {
  exchangeId: string
  exchangeName: string
  initialSubject: string
  initialBody: string
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  // Localized surface form for the two tokens. Storage stays mustache; this
  // pair is the only thing that changes when the locale does.
  const labels: TokenLabels = useMemo(() => ({
    studentName: t('settings.goodNews.tokens.studentName'),
    exchangeName: t('settings.goodNews.tokens.exchangeName'),
  }), [t])

  // State holds the EDITOR form throughout; toStored runs once, on save.
  const [subject, setSubject] = useState(() => toEditor(initialSubject, labels))
  const [body, setBody] = useState(() => toEditor(initialBody, labels))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const storedSubject = toStored(subject, labels)
  const storedBody = toStored(body, labels)

  // Live preview with a representative student so the organizer sees the result.
  const preview = renderGoodNews({
    subject: storedSubject, body: storedBody, studentName: 'Marie Dupont', exchangeName,
  })

  // Insert at the caret, replacing any selection, then put the caret straight
  // after the inserted chip so the organizer can keep typing.
  function insertAt<E extends HTMLInputElement | HTMLTextAreaElement>(
    ref: React.RefObject<E>,
    value: string,
    setValue: (v: string) => void,
    label: string,
  ) {
    const el = ref.current
    const chip = tokenChip(label)
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + chip + value.slice(end)
    setValue(next)
    setSaved(false)
    // The DOM value updates on the next render; move the caret after it.
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + chip.length, start + chip.length)
    })
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await updateGoodNewsTemplate(exchangeId, storedSubject, storedBody)
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setSaved(true)
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  const disabled = busy || readOnly

  // Per-field chip row rather than one shared toolbar: there is never a
  // question which field a chip lands in.
  const chipRow = (onInsert: (label: string) => void) => (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-tertiary">{t('settings.goodNews.insertLabel')}</span>
      {([labels.studentName, labels.exchangeName]).map(label => (
        <button
          key={label} type="button" disabled={busy} onClick={() => onInsert(label)}
          className="rounded-full border border-subtle bg-subtle px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.goodNews.heading')}</div>
      <p className="m-0 mb-1 text-[12.5px] leading-normal text-muted-foreground">{t('settings.goodNews.description')}</p>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-tertiary">{t('settings.goodNews.whenSent')}</p>

      <label htmlFor="good-news-subject" className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.subjectLabel')}</label>
      {!readOnly && chipRow(label => insertAt(subjectRef, subject, setSubject, label))}
      <input
        id="good-news-subject" ref={subjectRef}
        value={subject} disabled={disabled}
        onChange={e => { setSubject(e.target.value); setSaved(false) }}
        maxLength={200}
        className="mb-4 w-full rounded-[10px] border px-3.5 py-2.5 text-[13.5px] disabled:opacity-60"
      />

      <label htmlFor="good-news-body" className="mb-1 block text-[12.5px] font-semibold text-foreground">{t('settings.goodNews.bodyLabel')}</label>
      {!readOnly && chipRow(label => insertAt(bodyRef, body, setBody, label))}
      <textarea
        id="good-news-body" ref={bodyRef}
        value={body} disabled={disabled}
        onChange={e => { setBody(e.target.value); setSaved(false) }}
        maxLength={5000} rows={12}
        className="mb-2 w-full rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-relaxed disabled:opacity-60"
      />

      {!readOnly && (
        <button
          type="button"
          onClick={() => {
            setSubject(toEditor(DEFAULT_GOOD_NEWS_SUBJECT, labels))
            setBody(toEditor(DEFAULT_GOOD_NEWS_BODY, labels))
            setSaved(false)
          }}
          className="mb-4 text-[12px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('settings.goodNews.resetToDefault')}
        </button>
      )}

      <div className="mb-4 rounded-xl border border-subtle bg-subtle/40 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-tertiary">{t('settings.goodNews.previewLabel')}</div>
        <div className="mb-2 text-[13px] font-semibold text-foreground">{preview.subject}</div>
        <div className="text-[13px] leading-relaxed text-muted-foreground" dangerouslySetInnerHTML={{ __html: preview.bodyHtml }} />
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="rounded-[9px] bg-[#1F7A57] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Oui, nous confirmons</span>
          <span className="rounded-[9px] bg-[#5C7268] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Non</span>
          <span className="rounded-[9px] bg-[#2456E6] px-3 py-2 text-center text-[12.5px] font-semibold text-white">Oui, mais nous avons des questions…</span>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button" disabled={disabled} onClick={save}
            className="flex items-center gap-1.5 rounded-[9px] bg-tint-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            <SaveIcon aria-hidden size={15} strokeWidth={1.75} />
            {t('settings.goodNews.saveButton')}
          </button>
          {saved && <span className="text-[12.5px] font-medium text-tint-text">{t('settings.goodNews.savedNotice')}</span>}
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
```

jsdom implements `requestAnimationFrame`, and the caret assertion is wrapped in `vi.waitFor`, so no timer stubbing is needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run components/communication/__tests__/GoodNewsCard.test.tsx messages --exclude '**/.claude/**'`
Expected: PASS — 11 component tests plus catalog parity.

- [ ] **Step 6: Apostrophe guard**

Run: `grep -n "[a-zA-Zà-ÿ]'[a-zA-Zà-ÿ]" messages/fr.json messages/it.json`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add components/communication/GoodNewsCard.tsx \
        components/communication/__tests__/GoodNewsCard.test.tsx \
        messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(communication): Modèles insert chips, no mustache in the editor"
```

---

## Task 7: Infos — read at rest, deliberate edit, two-step delete, dashed composer

**Files:**
- Create: `components/communication/InfoCardRow.tsx`
- Create: `components/communication/InfoCardComposer.tsx`
- Modify: `components/communication/InfoCardsCard.tsx` (becomes a list container)
- Create: `components/communication/__tests__/InfoCardRow.test.tsx`
- Create: `components/communication/__tests__/InfoCardComposer.test.tsx`
- Modify: `messages/{en,fr,es,it,de}.json` → `organizer.communication.info`

**Interfaces:**
- Consumes: `InfoCard` with `createdAt`/`updatedAt` (Task 3).
- Produces:
  ```ts
  // InfoCardRow.tsx
  export function InfoCardRow(props: {
    card: InfoCard
    editing: boolean
    busy: boolean
    readOnly: boolean
    // The LIST asks this row to raise its discard prompt, because the organizer
    // clicked Modifier on a *different* card while this one has unsaved edits.
    forceDiscardPrompt: boolean
    onRequestEdit: () => void
    onCancelEdit: () => void
    onDiscardCancelled: () => void
    // Reported up so the list knows whether a cross-card switch needs a prompt.
    onDirtyChange: (dirty: boolean) => void
    onSave: (next: { title: string; body: string }) => Promise<void>
    onDelete: () => Promise<void>
  }): JSX.Element

  // InfoCardComposer.tsx
  export function InfoCardComposer(props: {
    busy: boolean
    onPublish: (input: { title: string; body: string }) => Promise<boolean>
  }): JSX.Element
  ```
  `onPublish` resolves `true` on success so the composer knows to collapse.

- [ ] **Step 1: Add the i18n keys (all five locales)**

Under `organizer.communication.info`, **keep** `heading`, `description`, `addButton`, `titlePlaceholder`, `bodyPlaceholder`, `saveButton`, `deleteButton`, `empty`, `readOnlyNotice`, `errors.*`. **Add**:

`messages/fr.json`:
```json
      "statusVisible": "Visible par les élèves",
      "publishedOn": "publiée le {date}",
      "updatedOn": "modifiée le {date}",
      "editButton": "Modifier",
      "cancelButton": "Annuler",
      "publishButton": "Publier",
      "showMore": "Afficher tout",
      "showLess": "Réduire",
      "deleteConfirmQuestion": "Supprimer ? Cette info disparaîtra du portail des élèves.",
      "deleteConfirmYes": "Confirmer",
      "discardConfirmQuestion": "Abandonner les modifications ?",
      "discardConfirmYes": "Abandonner",
```

`messages/en.json`:
```json
      "statusVisible": "Visible to students",
      "publishedOn": "published on {date}",
      "updatedOn": "updated on {date}",
      "editButton": "Edit",
      "cancelButton": "Cancel",
      "publishButton": "Publish",
      "showMore": "Show all",
      "showLess": "Show less",
      "deleteConfirmQuestion": "Delete? This note will disappear from the student portal.",
      "deleteConfirmYes": "Confirm",
      "discardConfirmQuestion": "Discard your changes?",
      "discardConfirmYes": "Discard",
```

`messages/es.json`:
```json
      "statusVisible": "Visible para los alumnos",
      "publishedOn": "publicada el {date}",
      "updatedOn": "modificada el {date}",
      "editButton": "Editar",
      "cancelButton": "Cancelar",
      "publishButton": "Publicar",
      "showMore": "Mostrar todo",
      "showLess": "Mostrar menos",
      "deleteConfirmQuestion": "¿Eliminar? Esta información desaparecerá del portal de los alumnos.",
      "deleteConfirmYes": "Confirmar",
      "discardConfirmQuestion": "¿Descartar los cambios?",
      "discardConfirmYes": "Descartar",
```

`messages/it.json`:
```json
      "statusVisible": "Visibile agli alunni",
      "publishedOn": "pubblicata il {date}",
      "updatedOn": "modificata il {date}",
      "editButton": "Modifica",
      "cancelButton": "Annulla",
      "publishButton": "Pubblica",
      "showMore": "Mostra tutto",
      "showLess": "Mostra meno",
      "deleteConfirmQuestion": "Eliminare? Questa informazione sparirà dal portale degli alunni.",
      "deleteConfirmYes": "Conferma",
      "discardConfirmQuestion": "Annullare le modifiche?",
      "discardConfirmYes": "Annulla le modifiche",
```

`messages/de.json`:
```json
      "statusVisible": "Für Schüler sichtbar",
      "publishedOn": "veröffentlicht am {date}",
      "updatedOn": "geändert am {date}",
      "editButton": "Bearbeiten",
      "cancelButton": "Abbrechen",
      "publishButton": "Veröffentlichen",
      "showMore": "Alles anzeigen",
      "showLess": "Weniger anzeigen",
      "deleteConfirmQuestion": "Löschen? Diese Information verschwindet aus dem Schülerportal.",
      "deleteConfirmYes": "Bestätigen",
      "discardConfirmQuestion": "Änderungen verwerfen?",
      "discardConfirmYes": "Verwerfen",
```

- [ ] **Step 2: Write the failing `InfoCardRow` test**

Create `components/communication/__tests__/InfoCardRow.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { InfoCardRow } from '@/components/communication/InfoCardRow'
import type { InfoCard } from '@/actions/exchanges'

const i = fr.organizer.communication.info

const card: InfoCard = {
  id: 'card-1',
  title: 'Point de rendez-vous',
  body: 'Gare de Lyon, hall 2.',
  position: 0,
  createdAt: '2026-07-20T09:00:00.000Z',
  updatedAt: '2026-07-22T09:00:00.000Z',
}
const untouched: InfoCard = { ...card, updatedAt: card.createdAt }

const handlers = {
  onRequestEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDiscardCancelled: vi.fn(),
  onDirtyChange: vi.fn(),
  onSave: vi.fn(async () => {}),
  onDelete: vi.fn(async () => {}),
}
const base = { busy: false, readOnly: false, forceDiscardPrompt: false, ...handlers }

beforeEach(() => vi.clearAllMocks())

describe('InfoCardRow at rest', () => {
  it('has NO form controls in the DOM — not even disabled ones', () => {
    const { container } = renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
  })

  it('shows the visible-to-students status with an updated stamp', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.getByText(new RegExp(i.statusVisible))).toBeTruthy()
    expect(screen.getByText(/modifiée le/)).toBeTruthy()
  })

  it('falls back to « publiée le » when the card was never edited', () => {
    renderWithIntl(<InfoCardRow {...base} card={untouched} editing={false} />)
    expect(screen.getByText(/publiée le/)).toBeTruthy()
    expect(screen.queryByText(/modifiée le/)).toBeNull()
  })

  it('renders title and body as text', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.getByText('Point de rendez-vous')).toBeTruthy()
    expect(screen.getByText('Gare de Lyon, hall 2.')).toBeTruthy()
  })

  it('offers exactly one action: Modifier — never Supprimer', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.getByRole('button', { name: i.editButton })).toBeTruthy()
    expect(screen.queryByRole('button', { name: i.deleteButton })).toBeNull()
  })

  it('clicking Modifier asks the list to open this card', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))
    expect(handlers.onRequestEdit).toHaveBeenCalledOnce()
  })

  it('offers « Afficher tout » only for a long body', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} />)
    expect(screen.queryByRole('button', { name: i.showMore })).toBeNull()

    const long = { ...card, body: Array.from({ length: 12 }, (_, n) => `ligne ${n}`).join('\n') }
    renderWithIntl(<InfoCardRow {...base} card={long} editing={false} />)
    fireEvent.click(screen.getByRole('button', { name: i.showMore }))
    expect(screen.getByRole('button', { name: i.showLess })).toBeTruthy()
  })

  it('read-only drops Modifier entirely', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing={false} readOnly />)
    expect(screen.queryByRole('button', { name: i.editButton })).toBeNull()
  })
})

describe('InfoCardRow in edit mode', () => {
  const editing = () => renderWithIntl(<InfoCardRow {...base} card={card} editing />)

  it('swaps to inputs seeded with the card values', () => {
    editing()
    expect((screen.getByDisplayValue('Point de rendez-vous') as HTMLInputElement).tagName).toBe('INPUT')
    expect(screen.getByDisplayValue('Gare de Lyon, hall 2.')).toBeTruthy()
  })

  it('saves the edited values', async () => {
    editing()
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'Nouveau titre' } })
    fireEvent.click(screen.getByRole('button', { name: i.saveButton }))
    await vi.waitFor(() => expect(handlers.onSave).toHaveBeenCalledWith({
      title: 'Nouveau titre', body: 'Gare de Lyon, hall 2.',
    }))
  })

  it('cancels straight away when nothing changed', () => {
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.cancelButton }))
    expect(handlers.onCancelEdit).toHaveBeenCalledOnce()
    expect(screen.queryByText(i.discardConfirmQuestion)).toBeNull()
  })

  it('confirms inline before discarding unsaved changes', () => {
    editing()
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: i.cancelButton }))
    expect(handlers.onCancelEdit).not.toHaveBeenCalled()
    expect(screen.getByText(i.discardConfirmQuestion)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i.discardConfirmYes }))
    expect(handlers.onCancelEdit).toHaveBeenCalledOnce()
  })

  // Three deliberate acts to destroy something 24 families are reading.
  it('deletes only after Modifier → Supprimer → Confirmer', async () => {
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.deleteButton }))
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(i.deleteConfirmQuestion)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i.deleteConfirmYes }))
    await vi.waitFor(() => expect(handlers.onDelete).toHaveBeenCalledOnce())
  })

  it('backing out of the delete confirmation deletes nothing', () => {
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.deleteButton }))
    fireEvent.click(screen.getAllByRole('button', { name: i.cancelButton })[0])
    expect(handlers.onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText(i.deleteConfirmQuestion)).toBeNull()
  })

  // Driven by the LIST when the organizer clicks Modifier on another card
  // while this one holds unsaved edits. (`renderWithIntl` nests the provider in
  // children rather than passing RTL's `wrapper` option, so a bare `rerender`
  // would drop the intl context — each case renders fresh instead.)
  it('raises the discard prompt on demand from the list', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing forceDiscardPrompt />)
    expect(screen.getByText(i.discardConfirmQuestion)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i.discardConfirmYes }))
    expect(handlers.onCancelEdit).toHaveBeenCalledOnce()
  })

  it('backing out of a list-driven discard tells the list to stay put', () => {
    renderWithIntl(<InfoCardRow {...base} card={card} editing forceDiscardPrompt />)
    fireEvent.click(screen.getAllByRole('button', { name: i.cancelButton })[0])
    expect(handlers.onDiscardCancelled).toHaveBeenCalledOnce()
    expect(handlers.onCancelEdit).not.toHaveBeenCalled()
  })

  it('reports its dirty state up so the list can decide whether to prompt', () => {
    editing()
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false)
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  // The native dialog is untranslatable and untestable in jsdom.
  it('uses no window.confirm', () => {
    const spy = vi.spyOn(window, 'confirm')
    editing()
    fireEvent.click(screen.getByRole('button', { name: i.deleteButton }))
    fireEvent.click(screen.getByRole('button', { name: i.deleteConfirmYes }))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run components/communication/__tests__/InfoCardRow.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — `Failed to resolve import "@/components/communication/InfoCardRow"`.

- [ ] **Step 4: Write `InfoCardRow.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { InfoCard } from '@/actions/exchanges'
import { INFO_TITLE_MAX, INFO_BODY_MAX } from '@/lib/exchange/info-card'

// A body longer than this collapses behind « Afficher tout ». Line count, not
// characters: the clamp is visual.
const CLAMP_LINES = 4

type Confirm = null | 'delete' | 'discard'

export function InfoCardRow({
  card, editing, busy, readOnly, forceDiscardPrompt,
  onRequestEdit, onCancelEdit, onDiscardCancelled, onSave, onDelete,
}: {
  card: InfoCard
  editing: boolean
  busy: boolean
  readOnly: boolean
  forceDiscardPrompt: boolean
  onRequestEdit: () => void
  onCancelEdit: () => void
  onDiscardCancelled: () => void
  onDirtyChange: (dirty: boolean) => void
  onSave: (next: { title: string; body: string }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const t = useTranslations('organizer')
  const locale = useLocale()
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const dirty = title !== card.title || body !== card.body
  // Either this row's own Annuler, or the list telling it another card wants
  // to open. Both land on the same inline prompt.
  const showDiscard = confirm === 'discard' || forceDiscardPrompt

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  const longBody = card.body.split('\n').length > CLAMP_LINES || card.body.length > 260

  // « modifiée le … » only when the card really was edited; otherwise the card
  // has never changed since publication and « publiée le … » is the honest line.
  const edited = card.updatedAt !== card.createdAt
  const stamp = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    .format(new Date(edited ? card.updatedAt : card.createdAt))
  const statusDetail = edited
    ? t('communication.info.updatedOn', { date: stamp })
    : t('communication.info.publishedOn', { date: stamp })

  function requestCancel() {
    if (dirty) { setConfirm('discard'); return }
    onCancelEdit()
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-subtle bg-card px-[18px] py-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-tertiary">
            <span aria-hidden className="text-tint-text">●</span>
            <span>{t('communication.info.statusVisible')} · {statusDetail}</span>
          </div>
          {!readOnly && (
            <button
              type="button" disabled={busy} onClick={onRequestEdit}
              className="flex-none rounded-[9px] px-2.5 py-1 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow hover:text-foreground disabled:opacity-50"
            >
              {t('communication.info.editButton')}
            </button>
          )}
        </div>
        <div className="mb-1 font-display text-[14px] font-bold tracking-[-.01em] text-foreground">{card.title}</div>
        {card.body && (
          <p className={`m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground ${
            longBody && !expanded ? 'line-clamp-4' : ''
          }`}>
            {card.body}
          </p>
        )}
        {longBody && (
          <button
            type="button" onClick={() => setExpanded(v => !v)}
            className="mt-1.5 text-[12px] font-semibold text-brand underline underline-offset-2"
          >
            {expanded ? t('communication.info.showLess') : t('communication.info.showMore')}
          </button>
        )}
      </div>
    )
  }

  // Edit mode: brand border, so the thing being changed is unmistakable.
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-brand bg-card px-[18px] py-4">
      <input
        value={title} maxLength={INFO_TITLE_MAX} disabled={busy}
        onChange={e => setTitle(e.target.value)}
        placeholder={t('communication.info.titlePlaceholder')}
        className="rounded-lg border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-brand disabled:opacity-70"
      />
      <textarea
        value={body} maxLength={INFO_BODY_MAX} rows={4} disabled={busy}
        onChange={e => setBody(e.target.value)}
        placeholder={t('communication.info.bodyPlaceholder')}
        className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-70"
      />

      {confirm === null && !showDiscard && (
        <div className="flex items-center gap-2">
          <button
            type="button" disabled={busy || title.trim().length === 0}
            onClick={() => onSave({ title, body })}
            className="rounded-[9px] bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('communication.info.saveButton')}
          </button>
          <button
            type="button" disabled={busy} onClick={requestCancel}
            className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow hover:text-foreground disabled:opacity-50"
          >
            {t('communication.info.cancelButton')}
          </button>
          {/* Supprimer exists ONLY here, pushed right and danger-outlined. */}
          <button
            type="button" disabled={busy} onClick={() => setConfirm('delete')}
            className="ml-auto rounded-[9px] border border-danger bg-card px-3 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
          >
            {t('communication.info.deleteButton')}
          </button>
        </div>
      )}

      {/* Inline, never window.confirm: the native dialog is untranslatable and
          untestable in jsdom. */}
      {confirm === 'delete' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger bg-danger px-3 py-2">
          <span className="text-[12.5px] font-medium text-danger-text">{t('communication.info.deleteConfirmQuestion')}</span>
          <button
            type="button" disabled={busy}
            onClick={async () => { setConfirm(null); await onDelete() }}
            className="ml-auto rounded-[9px] border border-danger bg-card px-3 py-1.5 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
          >
            {t('communication.info.deleteConfirmYes')}
          </button>
          <button
            type="button" disabled={busy} onClick={() => setConfirm(null)}
            className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow"
          >
            {t('communication.info.cancelButton')}
          </button>
        </div>
      )}

      {showDiscard && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-subtle bg-subtle px-3 py-2">
          <span className="text-[12.5px] font-medium text-foreground">{t('communication.info.discardConfirmQuestion')}</span>
          <button
            type="button"
            onClick={() => { setConfirm(null); setTitle(card.title); setBody(card.body); onCancelEdit() }}
            className="ml-auto rounded-[9px] border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow"
          >
            {t('communication.info.discardConfirmYes')}
          </button>
          <button
            type="button"
            onClick={() => { setConfirm(null); onDiscardCancelled() }}
            className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow"
          >
            {t('communication.info.cancelButton')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the `InfoCardRow` tests to verify they pass**

Run: `pnpm vitest run components/communication/__tests__/InfoCardRow.test.tsx --exclude '**/.claude/**'`
Expected: PASS, 15 tests.

- [ ] **Step 6: Write the failing `InfoCardComposer` test**

Create `components/communication/__tests__/InfoCardComposer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { InfoCardComposer } from '@/components/communication/InfoCardComposer'

const i = fr.organizer.communication.info
const onPublish = vi.fn(async () => true)

beforeEach(() => { vi.clearAllMocks(); onPublish.mockResolvedValue(true) })

describe('InfoCardComposer', () => {
  it('is collapsed to a single trigger with no fields in the DOM', () => {
    const { container } = renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    expect(screen.getByRole('button', { name: new RegExp(i.addButton) })).toBeTruthy()
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
  })

  it('cannot be mistaken for a card — the trigger is dashed', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    expect(screen.getByRole('button', { name: new RegExp(i.addButton) }).className)
      .toContain('border-dashed')
  })

  it('expands to title + body + Publier', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect(screen.getByPlaceholderText(i.titlePlaceholder)).toBeTruthy()
    expect(screen.getByPlaceholderText(i.bodyPlaceholder)).toBeTruthy()
    expect(screen.getByRole('button', { name: i.publishButton })).toBeTruthy()
  })

  // « Publier », not « Ajouter » — the verb names the consequence.
  it('never offers an « Ajouter » verb inside the expanded form', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect(screen.queryByRole('button', { name: i.addButton })).toBeNull()
  })

  it('Publier is inert until a title is typed', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect((screen.getByRole('button', { name: i.publishButton }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    expect((screen.getByRole('button', { name: i.publishButton }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('publishes, then collapses back and forgets the draft', async () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    fireEvent.change(screen.getByPlaceholderText(i.bodyPlaceholder), { target: { value: 'Détails' } })
    fireEvent.click(screen.getByRole('button', { name: i.publishButton }))

    await vi.waitFor(() => expect(onPublish).toHaveBeenCalledWith({ title: 'Titre', body: 'Détails' }))
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(i.titlePlaceholder)).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect((screen.getByPlaceholderText(i.titlePlaceholder) as HTMLInputElement).value).toBe('')
  })

  it('stays open with the draft intact when publishing fails', async () => {
    onPublish.mockResolvedValue(false)
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    fireEvent.click(screen.getByRole('button', { name: i.publishButton }))
    await vi.waitFor(() => expect(onPublish).toHaveBeenCalled())
    expect((screen.getByPlaceholderText(i.titlePlaceholder) as HTMLInputElement).value).toBe('Titre')
  })

  it('Annuler collapses and discards', () => {
    renderWithIntl(<InfoCardComposer busy={false} onPublish={onPublish} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    fireEvent.change(screen.getByPlaceholderText(i.titlePlaceholder), { target: { value: 'Titre' } })
    fireEvent.click(screen.getByRole('button', { name: i.cancelButton }))
    expect(screen.queryByPlaceholderText(i.titlePlaceholder)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i.addButton) }))
    expect((screen.getByPlaceholderText(i.titlePlaceholder) as HTMLInputElement).value).toBe('')
  })
})
```

- [ ] **Step 7: Write `InfoCardComposer.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PlusIcon } from 'lucide-react'
import { INFO_TITLE_MAX, INFO_BODY_MAX } from '@/lib/exchange/info-card'

// Collapsed to a dashed full-width trigger that cannot be mistaken for a
// published card — the old composer used the identical card shell, which is
// exactly what made the Infos tab unreadable.
export function InfoCardComposer({ busy, onPublish }: {
  busy: boolean
  onPublish: (input: { title: string; body: string }) => Promise<boolean>
}) {
  const t = useTranslations('organizer')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '' })

  function close() { setOpen(false); setDraft({ title: '', body: '' }) }

  if (!open) {
    return (
      <button
        type="button" disabled={busy} onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-subtle px-[18px] py-3.5 text-[13px] font-semibold text-muted-foreground hover:border-brand hover:text-brand disabled:opacity-50"
      >
        <PlusIcon aria-hidden size={15} strokeWidth={2} />
        {t('communication.info.addButton')}
      </button>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-card px-[18px] py-4">
      <input
        autoFocus
        value={draft.title} maxLength={INFO_TITLE_MAX} disabled={busy}
        onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
        placeholder={t('communication.info.titlePlaceholder')}
        className="rounded-lg border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-brand"
      />
      <textarea
        value={draft.body} maxLength={INFO_BODY_MAX} rows={4} disabled={busy}
        onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
        placeholder={t('communication.info.bodyPlaceholder')}
        className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand"
      />
      <div className="flex items-center gap-2">
        {/* « Publier », not « Ajouter »: the verb names the consequence. */}
        <button
          type="button" disabled={busy || draft.title.trim().length === 0}
          onClick={async () => { if (await onPublish(draft)) close() }}
          className="rounded-[9px] bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {t('communication.info.publishButton')}
        </button>
        <button
          type="button" disabled={busy} onClick={close}
          className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:bg-hoverrow hover:text-foreground disabled:opacity-50"
        >
          {t('communication.info.cancelButton')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Rewrite `InfoCardsCard.tsx` as the list container**

```tsx
'use client'
import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addInfoCard, updateInfoCard, deleteInfoCard, type InfoCard } from '@/actions/exchanges'
import type { InfoCardError } from '@/lib/exchange/info-card'
import { InfoCardRow } from './InfoCardRow'
import { InfoCardComposer } from './InfoCardComposer'

export function InfoCardsCard({ exchangeId, initialCards, readOnly }: {
  exchangeId: string
  initialCards: InfoCard[]
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [cards, setCards] = useState<InfoCard[]>(initialCards)
  // One card at a time: the LIST owns which card is open, so opening another
  // necessarily closes the first. `pendingEditId` is the card the organizer
  // asked for while the open one still had unsaved edits — the open row raises
  // its discard prompt and the switch only happens once they confirm.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [dirtyId, setDirtyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errText = (code: InfoCardError) => t(`communication.info.errors.${code}`)

  async function run(fn: () => Promise<{ ok: false; error: InfoCardError } | void | { ok: true }>) {
    setBusy(true); setError(null)
    try {
      const r = await fn()
      if (r && 'ok' in r && r.ok === false) { setError(errText(r.error)); return false }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
      return false
    } finally { setBusy(false) }
  }

  async function onPublish(input: { title: string; body: string }): Promise<boolean> {
    return run(async () => {
      const r = await addInfoCard(exchangeId, input)
      if (r.ok) setCards(prev => [...prev, r.card])
      return r
    })
  }

  function closeEditor() { setEditingId(null); setPendingEditId(null); setDirtyId(null) }

  async function onSave(card: InfoCard, next: { title: string; body: string }) {
    const ok = await run(async () => {
      const r = await updateInfoCard(card.id, next)
      if (r.ok) setCards(prev => prev.map(x => (x.id === card.id ? r.card : x)))
      return r
    })
    if (ok) closeEditor()
  }

  async function onDelete(card: InfoCard) {
    const ok = await run(async () => {
      await deleteInfoCard(card.id)
      setCards(prev => prev.filter(x => x.id !== card.id))
    })
    if (ok) closeEditor()
  }

  // Opening another card closes the first — but never silently over unsaved
  // edits: park the request and let the open row ask.
  function requestEdit(cardId: string) {
    if (editingId && editingId !== cardId && dirtyId === editingId) {
      setPendingEditId(cardId)
      return
    }
    setEditingId(cardId); setPendingEditId(null); setDirtyId(null)
  }

  // Stable identity so InfoCardRow's dirty-reporting effect does not re-fire on
  // every list render.
  const reportDirty = useCallback((cardId: string, dirty: boolean) => {
    setDirtyId(prev => (dirty ? cardId : prev === cardId ? null : prev))
  }, [])

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('communication.info.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('communication.info.description')}</p>

      <div className="flex flex-col gap-3">
        {cards.length === 0 && <p className="text-[12.5px] text-muted-foreground">{t('communication.info.empty')}</p>}
        {cards.map(card => (
          <InfoCardRow
            key={card.id}
            card={card}
            editing={editingId === card.id}
            busy={busy}
            readOnly={readOnly}
            forceDiscardPrompt={editingId === card.id && pendingEditId !== null}
            onRequestEdit={() => requestEdit(card.id)}
            onCancelEdit={() => {
              // Confirmed: honour the parked request, or just close.
              const next = pendingEditId
              closeEditor()
              if (next) setEditingId(next)
            }}
            onDiscardCancelled={() => setPendingEditId(null)}
            onDirtyChange={dirty => reportDirty(card.id, dirty)}
            onSave={next => onSave(card, next)}
            onDelete={() => onDelete(card)}
          />
        ))}
      </div>

      {!readOnly && <InfoCardComposer busy={busy} onPublish={onPublish} />}

      {readOnly && <p className="mt-3 text-[12.5px] text-muted-foreground">{t('communication.info.readOnlyNotice')}</p>}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
```

The one-card-at-a-time rule with its dirty guard is a three-way handshake, and it is the trickiest part of this task: the row owns the draft (so it knows `dirty`), the list owns which card is open (so it knows a *switch* is being asked for). The row reports `dirty` up; the list parks the request in `pendingEditId` and flips `forceDiscardPrompt` on the open row; the row shows the same inline prompt it uses for its own `Annuler`; confirming routes through `onCancelEdit`, which the list uses to close and then open the parked card.

- [ ] **Step 8b: Cover the switch handshake at the list level**

Append to `components/communication/__tests__/InfoCardRow.test.tsx` a second describe that mounts the real container. Add these imports at the top of the file:

```tsx
import { InfoCardsCard } from '@/components/communication/InfoCardsCard'
vi.mock('@/actions/exchanges', () => ({
  addInfoCard: vi.fn(), updateInfoCard: vi.fn(), deleteInfoCard: vi.fn(),
}))
```

and the block:

```tsx
describe('InfoCardsCard switching between cards', () => {
  const second: InfoCard = { ...card, id: 'card-2', title: 'Bagages', body: 'Un sac.' }
  const render2 = () => renderWithIntl(
    <InfoCardsCard exchangeId="ex-1" initialCards={[card, second]} readOnly={false} />,
  )
  const editButtons = () => screen.getAllByRole('button', { name: i.editButton })

  it('opens exactly one card at a time', () => {
    render2()
    fireEvent.click(editButtons()[0])
    expect(screen.getAllByRole('textbox')).toHaveLength(2)   // title + body of ONE card
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))  // the other card
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByDisplayValue('Bagages')).toBeTruthy()
  })

  it('confirms before switching away from unsaved edits', () => {
    render2()
    fireEvent.click(editButtons()[0])
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))

    expect(screen.getByText(i.discardConfirmQuestion)).toBeTruthy()
    expect(screen.queryByDisplayValue('Bagages')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: i.discardConfirmYes }))
    expect(screen.getByDisplayValue('Bagages')).toBeTruthy()
    expect(screen.queryByDisplayValue('dirty')).toBeNull()
  })

  it('backing out of that prompt keeps the original card open and dirty', () => {
    render2()
    fireEvent.click(editButtons()[0])
    fireEvent.change(screen.getByDisplayValue('Point de rendez-vous'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: i.editButton }))
    fireEvent.click(screen.getAllByRole('button', { name: i.cancelButton })[0])

    expect(screen.queryByText(i.discardConfirmQuestion)).toBeNull()
    expect(screen.getByDisplayValue('dirty')).toBeTruthy()
    expect(screen.queryByDisplayValue('Bagages')).toBeNull()
  })
})
```

- [ ] **Step 9: Run the Infos component tests**

Run: `pnpm vitest run components/communication --exclude '**/.claude/**'`
Expected: PASS. `CommunicationView.test.tsx` still passes — `c.info.addButton` remains a key and is still rendered (now inside the dashed trigger).

- [ ] **Step 10: Apostrophe guard, parity, typecheck**

Run:
```bash
grep -n "[a-zA-Zà-ÿ]'[a-zA-Zà-ÿ]" messages/fr.json messages/it.json
pnpm vitest run messages --exclude '**/.claude/**'
npx tsc --noEmit
```
Expected: no grep output; parity PASS; no tsc output.

- [ ] **Step 11: Commit**

```bash
git add components/communication/InfoCardRow.tsx \
        components/communication/InfoCardComposer.tsx \
        components/communication/InfoCardsCard.tsx \
        components/communication/__tests__/InfoCardRow.test.tsx \
        components/communication/__tests__/InfoCardComposer.test.tsx \
        messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(communication): Infos read at rest, deliberate edit, two-step delete"
```

---

## Task 8: `groupHistory()` — day buckets and good-news collapsing

**Files:**
- Create: `lib/communication/history.ts`
- Create: `lib/communication/__tests__/history.test.ts`

**Interfaces:**
- Consumes: `CommunicationEventKind` / `CommunicationEventStatus` (Task 2) — imported type-only and re-exported, never redefined.
- Produces:
  ```ts
  export type CommunicationEvent = {
    id: string
    createdAt: string           // ISO
    kind: CommunicationEventKind
    subject: string
    status: 'ok' | 'failed'
  }
  export type HistoryEntry =
    | { type: 'info'; id: string; at: string; kind: 'info_published' | 'info_updated' | 'info_deleted'; subject: string }
    | { type: 'good_news'; id: string; at: string; sent: number; failed: number;
        recipients: { id: string; subject: string; status: 'ok' | 'failed' }[] }
  export type HistoryDay = { key: string; at: string; entries: HistoryEntry[] }
  export function groupHistory(events: CommunicationEvent[]): HistoryDay[]
  ```
  Task 9's `getCommunicationEvents` returns `CommunicationEvent[]`; `HistoryCard` renders `HistoryDay[]`.

- [ ] **Step 1: Write the failing test**

Create `lib/communication/__tests__/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupHistory, type CommunicationEvent } from '@/lib/communication/history'

// Timestamps are pinned to mid-day UTC so the local-day bucketing is identical
// in Paris (CI runs UTC, Bjorn runs UTC+1/+2) — the assertions below are about
// grouping, not about time zones.
function ev(over: Partial<CommunicationEvent> & { id: string; createdAt: string }): CommunicationEvent {
  return { kind: 'info_published', subject: 'T', status: 'ok', ...over }
}

describe('groupHistory', () => {
  it('returns nothing for no events', () => {
    expect(groupHistory([])).toEqual([])
  })

  it('buckets by day, newest day first', () => {
    const days = groupHistory([
      ev({ id: 'a', createdAt: '2026-07-20T12:00:00.000Z' }),
      ev({ id: 'b', createdAt: '2026-07-22T12:00:00.000Z' }),
      ev({ id: 'c', createdAt: '2026-07-21T12:00:00.000Z' }),
    ])
    expect(days.map(d => d.entries[0].id)).toEqual(['b', 'c', 'a'])
    expect(days).toHaveLength(3)
  })

  it('orders entries newest-first inside a day', () => {
    const [day] = groupHistory([
      ev({ id: 'early', createdAt: '2026-07-22T09:00:00.000Z' }),
      ev({ id: 'late', createdAt: '2026-07-22T15:00:00.000Z' }),
    ])
    expect(day.entries.map(e => e.id)).toEqual(['late', 'early'])
  })

  it('keeps info events one line each, carrying kind and subject', () => {
    const [day] = groupHistory([
      ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z', kind: 'info_deleted', subject: 'Point de rendez-vous' }),
    ])
    expect(day.entries).toEqual([{
      type: 'info', id: 'a', at: '2026-07-22T12:00:00.000Z',
      kind: 'info_deleted', subject: 'Point de rendez-vous',
    }])
  })

  it('collapses all good-news sends in a day into one row, stamped with the last', () => {
    const [day] = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-22T09:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T15:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy' }),
    ])
    expect(day.entries).toHaveLength(1)
    const entry = day.entries[0]
    expect(entry.type).toBe('good_news')
    if (entry.type !== 'good_news') throw new Error('unreachable')
    expect(entry.at).toBe('2026-07-22T15:00:00.000Z')
    expect(entry.sent).toBe(2)
    expect(entry.failed).toBe(0)
    expect(entry.recipients.map(r => r.subject)).toEqual(['Théo Leroy', 'Marie Dupont'])
  })

  it('counts failures separately within the collapsed row', () => {
    const [day] = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-22T09:00:00.000Z', kind: 'good_news_sent', subject: 'A', status: 'ok' }),
      ev({ id: 'g2', createdAt: '2026-07-22T10:00:00.000Z', kind: 'good_news_sent', subject: 'B', status: 'ok' }),
      ev({ id: 'g3', createdAt: '2026-07-22T11:00:00.000Z', kind: 'good_news_sent', subject: 'C', status: 'failed' }),
    ])
    const entry = day.entries[0]
    if (entry.type !== 'good_news') throw new Error('unreachable')
    expect(entry.sent).toBe(2)
    expect(entry.failed).toBe(1)
  })

  it('does NOT collapse good-news sends across two different days', () => {
    const days = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-21T12:00:00.000Z', kind: 'good_news_sent', subject: 'A' }),
      ev({ id: 'g2', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'B' }),
    ])
    expect(days).toHaveLength(2)
    expect(days.every(d => d.entries.length === 1)).toBe(true)
  })

  it('sorts a collapsed good-news row against info events by its own stamp', () => {
    const [day] = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-22T09:00:00.000Z', kind: 'good_news_sent', subject: 'A' }),
      ev({ id: 'i1', createdAt: '2026-07-22T11:00:00.000Z', kind: 'info_published', subject: 'Info' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'B' }),
    ])
    // The good-news row stamps at 13:00, so it sorts above the 11:00 info line.
    expect(day.entries.map(e => e.type)).toEqual(['good_news', 'info'])
  })

  it('gives the day a stable key and a representative timestamp for the header', () => {
    const [day] = groupHistory([ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z' })])
    expect(day.key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(day.at).toBe('2026-07-22T12:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/communication/__tests__/history.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `Failed to resolve import "@/lib/communication/history"`.

- [ ] **Step 3: Write the implementation**

Create `lib/communication/history.ts`:

```ts
// Pure grouping for Communication → Historique. No React, no Supabase.
// The rendering rules ("one row per day-bucket of good-news sends", "info
// events stay one line each") are behaviour, so they live here and are tested
// without a DOM.
//
// The two unions are defined ONCE, in ./events, and imported type-only here so
// the kind list cannot drift between the write side and the read side. The
// `import type` is erased at build time, so pulling this module into a client
// component drags in nothing from ./events at runtime.
import type { CommunicationEventKind, CommunicationEventStatus } from './events'

export type { CommunicationEventKind, CommunicationEventStatus }

export type CommunicationEvent = {
  id: string
  createdAt: string
  kind: CommunicationEventKind
  subject: string
  status: CommunicationEventStatus
}

export type InfoEventKind = 'info_published' | 'info_updated' | 'info_deleted'

export type HistoryEntry =
  | { type: 'info'; id: string; at: string; kind: InfoEventKind; subject: string }
  | {
      type: 'good_news'; id: string; at: string
      sent: number; failed: number
      recipients: { id: string; subject: string; status: CommunicationEventStatus }[]
    }

export type HistoryDay = {
  key: string   // 'YYYY-MM-DD' in the viewer's local zone — bucket identity only
  at: string    // ISO of the newest event in the bucket; formats the header
  entries: HistoryEntry[]
}

// Local calendar day, not UTC: a 23:00 Paris publication belongs to that
// evening, not to the next morning.
function dayKey(iso: string): string {
  const d = new Date(iso)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const desc = (a: string, b: string) => new Date(b).getTime() - new Date(a).getTime()

export function groupHistory(events: CommunicationEvent[]): HistoryDay[] {
  const buckets = new Map<string, CommunicationEvent[]>()
  for (const e of events) {
    const key = dayKey(e.createdAt)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(e)
    else buckets.set(key, [e])
  }

  const days: HistoryDay[] = []
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => desc(a.createdAt, b.createdAt))

    const entries: HistoryEntry[] = []
    const goodNews = sorted.filter(e => e.kind === 'good_news_sent')
    for (const e of sorted) {
      if (e.kind === 'good_news_sent') continue
      entries.push({
        type: 'info', id: e.id, at: e.createdAt,
        kind: e.kind as InfoEventKind, subject: e.subject,
      })
    }

    // Every send in the day collapses into one row stamped with the LAST one.
    // Two separate accepts on the same day merging is acceptable — arguably
    // desirable: the organizer thinks in "the day we told the families".
    if (goodNews.length > 0) {
      entries.push({
        type: 'good_news',
        id: `good-news-${key}`,
        at: goodNews[0].createdAt,
        sent: goodNews.filter(e => e.status === 'ok').length,
        failed: goodNews.filter(e => e.status === 'failed').length,
        recipients: goodNews.map(e => ({ id: e.id, subject: e.subject, status: e.status })),
      })
    }

    entries.sort((a, b) => desc(a.at, b.at))
    days.push({ key, at: entries[0]?.at ?? sorted[0].createdAt, entries })
  }

  days.sort((a, b) => desc(a.at, b.at))
  return days
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/communication/__tests__/history.test.ts --exclude '**/.claude/**'`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/communication/history.ts lib/communication/__tests__/history.test.ts
git commit -m "feat(communication): pure day-bucket grouping for Historique"
```

---

## Task 9: Historique sub-tab — read action, `HistoryCard`, wiring

**Files:**
- Create: `actions/communication.ts`
- Create: `components/communication/HistoryCard.tsx`
- Create: `components/communication/__tests__/HistoryCard.test.tsx`
- Modify: `components/communication/CommunicationView.tsx`
- Modify: `components/communication/__tests__/CommunicationView.test.tsx`
- Modify: `app/(organizer)/communication/page.tsx`
- Modify: `messages/{en,fr,es,it,de}.json` → `organizer.communication.tabs.historique`, `organizer.communication.history.*`

**Interfaces:**
- Consumes: `groupHistory`, `CommunicationEvent` (Task 8).
- Produces:
  ```ts
  // actions/communication.ts
  export async function getCommunicationEvents(exchangeId: string): Promise<CommunicationEvent[]>
  // components/communication/HistoryCard.tsx
  export function HistoryCard(props: { events: CommunicationEvent[] }): JSX.Element
  ```
  `CommunicationProps` gains `events: CommunicationEvent[]`.

- [ ] **Step 1: Add the i18n keys (all five locales)**

Add `historique` to `organizer.communication.tabs` and a new `organizer.communication.history` block.

`messages/fr.json`:
```json
      "historique": "Historique"
```
```json
    "history": {
      "heading": "Historique",
      "description": "Ce qui a été publié et envoyé aux familles pour ce programme.",
      "empty": "Rien n’a encore été envoyé ni publié pour ce programme.",
      "infoPublished": "Info publiée : « {subject} »",
      "infoUpdated": "Info modifiée : « {subject} »",
      "infoDeleted": "Info supprimée : « {subject} »",
      "goodNews": "« Bonne nouvelle » envoyée · {count, plural, one {# famille} other {# familles}}",
      "counts": "{sent} ✓ · {failed} ✗",
      "expand": "Voir le détail",
      "collapse": "Masquer le détail",
      "failedNotice": "l’e-mail n’est pas parti"
    }
```

`messages/en.json`:
```json
      "historique": "History"
```
```json
    "history": {
      "heading": "History",
      "description": "What has been published and sent to families for this programme.",
      "empty": "Nothing has been sent or published for this programme yet.",
      "infoPublished": "Note published: “{subject}”",
      "infoUpdated": "Note updated: “{subject}”",
      "infoDeleted": "Note deleted: “{subject}”",
      "goodNews": "“Good news” email sent · {count, plural, one {# family} other {# families}}",
      "counts": "{sent} ✓ · {failed} ✗",
      "expand": "Show details",
      "collapse": "Hide details",
      "failedNotice": "the email did not go out"
    }
```

`messages/es.json`:
```json
      "historique": "Historial"
```
```json
    "history": {
      "heading": "Historial",
      "description": "Lo que se ha publicado y enviado a las familias para este programa.",
      "empty": "Todavía no se ha enviado ni publicado nada para este programa.",
      "infoPublished": "Información publicada: «{subject}»",
      "infoUpdated": "Información modificada: «{subject}»",
      "infoDeleted": "Información eliminada: «{subject}»",
      "goodNews": "Correo «Buenas noticias» enviado · {count, plural, one {# familia} other {# familias}}",
      "counts": "{sent} ✓ · {failed} ✗",
      "expand": "Ver el detalle",
      "collapse": "Ocultar el detalle",
      "failedNotice": "el correo no ha salido"
    }
```

`messages/it.json`:
```json
      "historique": "Cronologia"
```
```json
    "history": {
      "heading": "Cronologia",
      "description": "Ciò che è stato pubblicato e inviato alle famiglie per questo programma.",
      "empty": "Non è ancora stato inviato né pubblicato nulla per questo programma.",
      "infoPublished": "Informazione pubblicata: «{subject}»",
      "infoUpdated": "Informazione modificata: «{subject}»",
      "infoDeleted": "Informazione eliminata: «{subject}»",
      "goodNews": "E-mail «Buona notizia» inviata · {count, plural, one {# famiglia} other {# famiglie}}",
      "counts": "{sent} ✓ · {failed} ✗",
      "expand": "Vedi il dettaglio",
      "collapse": "Nascondi il dettaglio",
      "failedNotice": "l’e-mail non è partita"
    }
```

`messages/de.json`:
```json
      "historique": "Verlauf"
```
```json
    "history": {
      "heading": "Verlauf",
      "description": "Was für dieses Programm veröffentlicht und an die Familien gesendet wurde.",
      "empty": "Für dieses Programm wurde noch nichts gesendet oder veröffentlicht.",
      "infoPublished": "Information veröffentlicht: „{subject}“",
      "infoUpdated": "Information geändert: „{subject}“",
      "infoDeleted": "Information gelöscht: „{subject}“",
      "goodNews": "E-Mail „Gute Nachricht“ gesendet · {count, plural, one {# Familie} other {# Familien}}",
      "counts": "{sent} ✓ · {failed} ✗",
      "expand": "Details anzeigen",
      "collapse": "Details ausblenden",
      "failedNotice": "die E-Mail wurde nicht versendet"
    }
```

- [ ] **Step 2: Write the read action**

Create `actions/communication.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import type { CommunicationEvent } from '@/lib/communication/history'

// Historique shows a recent window, not the whole 365-day retention span:
// beyond this the page stops being scannable and starts being an export.
const HISTORY_LIMIT = 200

// RLS scopes the read to exchanges of the caller's school (see
// 20260724150000). No service-role client is involved.
export async function getCommunicationEvents(exchangeId: string): Promise<CommunicationEvent[]> {
  const supabase = await createClient()
  await requireOrganizer()

  const { data, error } = await supabase
    .from('communication_events')
    .select('id, created_at, kind, subject, status')
    .eq('exchange_id', exchangeId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (error) throw error

  return ((data ?? []) as { id: string; created_at: string; kind: string; subject: string; status: string }[])
    .map(r => ({
      id: r.id,
      createdAt: r.created_at,
      kind: r.kind as CommunicationEvent['kind'],
      subject: r.subject,
      status: r.status as CommunicationEvent['status'],
    }))
}
```

- [ ] **Step 3: Write the failing `HistoryCard` test**

Create `components/communication/__tests__/HistoryCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { HistoryCard } from '@/components/communication/HistoryCard'
import type { CommunicationEvent } from '@/lib/communication/history'

const h = fr.organizer.communication.history

const ev = (o: Partial<CommunicationEvent> & { id: string; createdAt: string }): CommunicationEvent =>
  ({ kind: 'info_published', subject: 'T', status: 'ok', ...o })

describe('HistoryCard', () => {
  it('shows the empty state when nothing happened', () => {
    renderWithIntl(<HistoryCard events={[]} />)
    expect(screen.getByText(h.empty)).toBeTruthy()
  })

  it('renders an info line per event with its verb and quoted subject', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z', kind: 'info_published', subject: 'Point de rendez-vous' }),
      ev({ id: 'b', createdAt: '2026-07-22T13:00:00.000Z', kind: 'info_deleted', subject: 'Ancienne info' }),
    ]} />)
    expect(screen.getByText('Info publiée : « Point de rendez-vous »')).toBeTruthy()
    expect(screen.getByText('Info supprimée : « Ancienne info »')).toBeTruthy()
  })

  it('collapses the day’s good-news sends into one counted row', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy' }),
    ]} />)
    expect(screen.getByText(/2 familles/)).toBeTruthy()
    expect(screen.queryByText('Marie Dupont')).toBeNull()
  })

  it('shows « 1 ✓ · 1 ✗ » when a send failed', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy', status: 'failed' }),
    ]} />)
    expect(screen.getByText('1 ✓ · 1 ✗')).toBeTruthy()
  })

  it('hides the counts when everything succeeded', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
    ]} />)
    expect(screen.queryByText(/✗/)).toBeNull()
  })

  it('names the families on expand and flags the failure', () => {
    renderWithIntl(<HistoryCard events={[
      ev({ id: 'g1', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy', status: 'failed' }),
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: h.expand }))
    expect(screen.getByText('Marie Dupont')).toBeTruthy()
    expect(screen.getByText('Théo Leroy')).toBeTruthy()
    expect(screen.getByText(new RegExp(h.failedNotice))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: h.collapse }))
    expect(screen.queryByText('Marie Dupont')).toBeNull()
  })

  it('groups under one header per day, newest first', () => {
    const { container } = renderWithIntl(<HistoryCard events={[
      ev({ id: 'a', createdAt: '2026-07-20T12:00:00.000Z', subject: 'Ancienne' }),
      ev({ id: 'b', createdAt: '2026-07-22T12:00:00.000Z', subject: 'Récente' }),
    ]} />)
    const headers = container.querySelectorAll('[data-history-day]')
    expect(headers).toHaveLength(2)
    expect(container.textContent!.indexOf('Récente'))
      .toBeLessThan(container.textContent!.indexOf('Ancienne'))
  })

  // Historique is read-only by nature — there is no readOnly prop to pass.
  it('exposes no editing affordance at all', () => {
    const { container } = renderWithIntl(<HistoryCard events={[
      ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z' }),
    ]} />)
    expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
  })
})
```

- [ ] **Step 4: Write `HistoryCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { FileTextIcon, MailIcon, PencilIcon, Trash2Icon, type LucideIcon } from 'lucide-react'
import { groupHistory, type CommunicationEvent, type InfoEventKind } from '@/lib/communication/history'

const INFO_ICON: Record<InfoEventKind, LucideIcon> = {
  info_published: FileTextIcon,
  info_updated: PencilIcon,
  info_deleted: Trash2Icon,
}
const INFO_KEY: Record<InfoEventKind, 'infoPublished' | 'infoUpdated' | 'infoDeleted'> = {
  info_published: 'infoPublished',
  info_updated: 'infoUpdated',
  info_deleted: 'infoDeleted',
}

export function HistoryCard({ events }: { events: CommunicationEvent[] }) {
  const t = useTranslations('organizer')
  const locale = useLocale()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const days = groupHistory(events)
  const dayLabel = (iso: string) => new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(iso))
  const timeLabel = (iso: string) => new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('communication.history.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('communication.history.description')}</p>

      {days.length === 0 && (
        <p className="text-[12.5px] text-muted-foreground">{t('communication.history.empty')}</p>
      )}

      <div className="flex flex-col gap-5">
        {days.map(day => (
          <div key={day.key}>
            <div data-history-day={day.key} className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-tertiary">
              {dayLabel(day.at)}
            </div>
            <div className="flex flex-col gap-1.5">
              {day.entries.map(entry => {
                if (entry.type === 'info') {
                  const Icon = INFO_ICON[entry.kind]
                  return (
                    <div key={entry.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
                      <Icon aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 flex-none text-tertiary" />
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">
                        {t(`communication.history.${INFO_KEY[entry.kind]}`, { subject: entry.subject })}
                      </span>
                      <span className="flex-none text-[11.5px] tabular-nums text-tertiary">{timeLabel(entry.at)}</span>
                    </div>
                  )
                }

                const open = expanded.has(entry.id)
                return (
                  <div key={entry.id} className="rounded-lg px-2 py-1.5">
                    <div className="flex items-start gap-2.5">
                      <MailIcon aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 flex-none text-tertiary" />
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">
                        {t('communication.history.goodNews', { count: entry.sent + entry.failed })}
                        {/* No banner: at this volume the inline counts are loud enough. */}
                        {entry.failed > 0 && (
                          <span className="ml-2 text-[12px] font-semibold text-danger-text">
                            {t('communication.history.counts', { sent: entry.sent, failed: entry.failed })}
                          </span>
                        )}
                      </span>
                      <span className="flex-none text-[11.5px] tabular-nums text-tertiary">{timeLabel(entry.at)}</span>
                    </div>
                    <button
                      type="button" onClick={() => toggle(entry.id)}
                      className="ml-[26px] mt-0.5 text-[12px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {open ? t('communication.history.collapse') : t('communication.history.expand')}
                    </button>
                    {open && (
                      <ul className="ml-[26px] mt-1.5 flex list-none flex-col gap-1 p-0">
                        {entry.recipients.map(r => (
                          <li key={r.id} className={`text-[12.5px] ${r.status === 'failed' ? 'text-danger-text' : 'text-muted-foreground'}`}>
                            {r.subject}
                            {r.status === 'failed' && <span className="ml-1.5 font-medium">— {t('communication.history.failedNotice')}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the `HistoryCard` tests**

Run: `pnpm vitest run components/communication/__tests__/HistoryCard.test.tsx --exclude '**/.claude/**'`
Expected: PASS, 8 tests.

- [ ] **Step 6: Wire the fourth sub-tab**

In `components/communication/CommunicationView.tsx`:

```tsx
import type { CommunicationEvent } from '@/lib/communication/history'
import { HistoryCard } from './HistoryCard'
```

Add to `CommunicationProps`:
```tsx
  events: CommunicationEvent[]
```

Widen the tab union and the tab list:
```tsx
type SubTab = 'infos' | 'modeles' | 'historique' | 'auto'
```
```tsx
  const tabs: { key: SubTab; label: string }[] = [
    { key: 'infos', label: t('communication.tabs.infos') },
    { key: 'modeles', label: t('communication.tabs.modeles') },
    { key: 'historique', label: t('communication.tabs.historique') },
    { key: 'auto', label: t('communication.tabs.auto') },
  ]
```

Add the panel after the `modeles` panel. Historique is read-only by nature, so `archived` deliberately does not reach it:
```tsx
          {tab === 'historique' && <HistoryCard events={props.events} />}
```

- [ ] **Step 7: Load the events on the page**

In `app/(organizer)/communication/page.tsx`:

```ts
import { getCommunicationEvents } from '@/actions/communication'
```

```ts
  const [infoCards, comms, events] = await Promise.all([
    getInfoCards(active.id),
    getCommunicationSettings(active.id),
    getCommunicationEvents(active.id),
  ])
```

and pass `events={events}` to `<CommunicationView …>`.

- [ ] **Step 8: Update the `CommunicationView` test**

In `components/communication/__tests__/CommunicationView.test.tsx`:

- add `events: []` to `baseProps`;
- rename the first test to `renders exactly four sub-tabs` and add:
  ```tsx
    expect(screen.getByRole('button', { name: c.tabs.historique })).toBeTruthy()
  ```
- append:
  ```tsx
  it('shows Historique, and it stays available on an archived programme', () => {
    renderWithIntl(<CommunicationView {...baseProps} archived />)
    openTab(c.tabs.historique)
    expect(screen.getByText(fr.organizer.communication.history.heading)).toBeTruthy()
    expect(screen.getByText(fr.organizer.communication.history.empty)).toBeTruthy()
  })
  ```
- the existing `propagates archived as read-only into every sub-tab` test needs no change (Historique has no editable control to assert on).

- [ ] **Step 9: Run the whole communication surface**

Run: `pnpm vitest run components/communication lib/communication actions/__tests__/communication-events.test.ts messages --exclude '**/.claude/**'`
Expected: PASS.

- [ ] **Step 10: Apostrophe guard and typecheck**

Run:
```bash
grep -n "[a-zA-Zà-ÿ]'[a-zA-Zà-ÿ]" messages/fr.json messages/it.json
npx tsc --noEmit
```
Expected: no output from either.

- [ ] **Step 11: Commit**

```bash
git add actions/communication.ts \
        components/communication/HistoryCard.tsx \
        components/communication/CommunicationView.tsx \
        components/communication/__tests__/HistoryCard.test.tsx \
        components/communication/__tests__/CommunicationView.test.tsx \
        "app/(organizer)/communication/page.tsx" \
        messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(communication): Historique sub-tab"
```

---

## Task 10: Full gate, browser check, merge

**Files:** none created; this task verifies and integrates.

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: a verified branch ready for Bjorn's merge decision.

- [ ] **Step 1: Run the full verification gate**

Run:
```bash
pnpm lint
pnpm test
pnpm build
```
Expected: lint clean; the whole vitest suite green (baseline plus roughly 60 new tests); build succeeds with no type errors.

If `pnpm build` fails with a shifting `ENOENT` filename under `.next/`, orphaned `next-server` workers are racing the directory — kill them by `/proc` cwd (never `pkill -f "next build"`) and re-run.

If a single suite fails once and passes on re-run, that is a parallel-session race, not a bug — re-run the single file before debugging it.

- [ ] **Step 2: Run the RLS matrix**

Run: `pnpm test:rls`
Expected: PASS, including the 9 `communication_events` cases from Task 1.

- [ ] **Step 3: Confirm no service-role creep**

Run:
```bash
grep -rn "lib/supabase/admin" lib/communication actions/communication.ts
git diff main --stat -- lib/supabase/__tests__/admin-allowlist.test.ts
```
Expected: no grep output; no diff on the allowlist test.

- [ ] **Step 4: Browser check on a preview or the local dev server**

Run `pnpm wt` once if the worktree was never linked, then `pnpm dev`, and walk the four sub-tabs as an organizer with an active exchange:

1. **Infos** — a published card shows no input at rest; `Modifier` opens exactly one card with a brand border; `Supprimer` appears only there and needs `Confirmer`; the composer is a dashed `+ Ajouter une info` that expands and says `Publier`.
2. **Modèles** — no `{{` anywhere; each field has its own `Insérer :` row; clicking a chip drops the label at the caret and leaves the caret after it; the preview still renders « Marie Dupont ».
3. **Historique** — publish an info, edit it, delete it, then accept an application: four lines appear under today's header with the good-news row collapsed and counted.
4. Switch the locale and confirm the template labels re-render while the saved value is unchanged.

Record what was checked. If the browser check is skipped, say so explicitly rather than implying it passed.

- [ ] **Step 5: Merge decision**

Report the gate output to Bjorn and ask before merging — merging to `main` deploys to production and requires his confirmation. Use `superpowers:finishing-a-development-branch` for the merge itself, then `ExitWorktree` (`remove`).
```
