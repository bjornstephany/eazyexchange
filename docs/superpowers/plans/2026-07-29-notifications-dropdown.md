# Notifications Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bell dropdown to the organizer header, left of the profile circle, showing per-exchange counts of work waiting across **all** exchanges.

**Architecture:** One `security invoker` SQL function aggregates three derived
"kinds" (candidatures à examiner, dossiers à vérifier, élèves en retard) grouped
by exchange. The organizer layout calls it in its existing `Promise.all` and
passes raw rows to `OrganizerShell`; a pure module shapes them into groups. A
watermark column, `users.notifications_seen_at`, drives the badge so chronic
items stop lighting it up.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions),
Supabase (Postgres + RLS), TypeScript, Tailwind, next-intl, Vitest, React
Testing Library, `postgres` (RLS matrix tests).

**Spec:** `docs/superpowers/specs/2026-07-29-notifications-dropdown-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- Work happens on branch `feature/notifications-dropdown` in its worktree. Never commit to `main`. **Confirm the branch with `git branch --show-current` before every commit.**
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- Verification commands: `pnpm lint`, `pnpm test`, `pnpm build`. This change touches `supabase/migrations/` so `pnpm test:rls` is **also mandatory** (needs the local Supabase stack or `RLS_TEST_DB_URL`).
- `supabase/migrations/` is **single-writer**: if another session is mid-migration, wait.
- Migrations go to **staging first** (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`), then prod via Supabase MCP `apply_migration`. **Never `supabase db push` against prod.**
- Never log student/parent PII — no names, emails or submission contents in logs or errors.
- Expected outcomes are **structured return values**, never thrown errors: production replaces thrown Server Action messages with an opaque digest. Never branch on `error.message`.
- Server actions use `requireUser()` / `requireOrganizer()` / `requireStudent()` from `lib/auth/require.ts`. Never hand-roll the auth preamble.
- Never import `lib/supabase/admin` — this feature uses no service role anywhere.
- All five locale files (`messages/{en,fr,de,es,it}.json`) must stay key-identical; `messages/__tests__/parity.test.ts` enforces it.
- French copy uses typographic apostrophes (`’`), not `'`.
- Row-counting grain: `applications_to_review` counts applications; `submissions_to_review` and `late` count **distinct students**, so the bell's numbers equal the dashboard action cards' numbers for the same words.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<stamp>_organizer_notifications.sql` | Watermark column + column grant + aggregate function + execute grant |
| `types/supabase.ts` | Regenerated DB types (never hand-edited) |
| `tests/rls/rpc.test.ts` | RLS matrix cases for the new function and column grant |
| `lib/shell/notifications.ts` | Pure shaping: rows → groups, badge count. No React, no Supabase. |
| `lib/shell/__tests__/notifications.test.ts` | Unit tests for the above |
| `actions/session.ts` | Adds `markNotificationsSeen()` beside `setActiveExchange` / `setExchangeOrder` |
| `components/shell/useDismissable.ts` | Outside-pointerdown + Escape hook, shared by both header menus |
| `components/shell/RailIcons.tsx` | Adds `IconBell` |
| `components/shell/NotificationsMenu.tsx` | The trigger, badge and panel |
| `components/shell/__tests__/NotificationsMenu.test.tsx` | Component tests |
| `components/shell/OrganizerShell.tsx` | Places the bell; owns which menu is open |
| `components/shell/__tests__/OrganizerShell.test.tsx` | Extended for placement + mutual exclusion |
| `app/(organizer)/layout.tsx` | Calls the RPC in the existing `Promise.all`, passes rows down |
| `messages/{en,fr,de,es,it}.json` | Four new keys under `organizer.shell.notifications` |

**Task order matters:** Task 2 (pure module) and Task 3 (server action) are
consumed by Task 5 (component). Task 1 (migration) can run in parallel with 2–4
but must land before `pnpm test:rls` passes.

---

### Task 1: Migration — watermark column and aggregate function

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_organizer_notifications.sql`
- Modify: `types/supabase.ts` (regenerated, never hand-edited)
- Test: `tests/rls/rpc.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: nothing.
- Produces: SQL function `public.organizer_notifications()` returning rows
  `(exchange_id uuid, kind text, total int, new_count int, newest_at timestamptz)`
  where `kind` is one of `'applications_to_review' | 'submissions_to_review' | 'late'`.
  Column `public.users.notifications_seen_at timestamptz` (nullable), updatable by `authenticated` for their own row.

- [ ] **Step 1: Confirm no other session is mid-migration**

Run: `git status --short supabase/migrations/ && ls -t supabase/migrations/ | head -3`
Expected: no uncommitted migration files. If another session has one in flight, **stop and wait** — `supabase/migrations/` is single-writer.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/<stamp>_organizer_notifications.sql` where `<stamp>` is the current UTC time as `YYYYMMDDHHMMSS` (get it with `date -u +%Y%m%d%H%M%S`):

```sql
-- Cross-exchange "what is waiting for me" digest behind the header bell.
--
-- Derived, not recorded: there is no notifications table and no write points.
-- Everything here is computed from rows that already exist. The deferred event
-- feed would add a fourth union-all branch rather than replace this.
-- Spec: docs/superpowers/specs/2026-07-29-notifications-dropdown-design.md

-- 1. The seen-watermark. Nullable on purpose: null means "never opened the
-- bell", so on first sight every open item counts as new.
--
-- Fourth per-account display preference on `users` after locale
-- (20260714200924), exchange_order (20260723132613) and tour_state
-- (20260727224025), and governed identically: the existing "users update
-- themselves" policy (20260624000002, hardened in 20260630000003) already
-- confines the write to the caller's own row — no new policy.
alter table users add column notifications_seen_at timestamptz;

-- 20260725154243 revoked blanket UPDATE on users and re-granted an explicit
-- column list. Postgres column privileges accumulate, so this ADDS one column.
-- Do NOT restate the others: `status`, `reviewed_at` and `notes` must stay
-- service-role-only.
grant update (notifications_seen_at) on public.users to authenticated;

-- 2. The aggregate.
--
-- SECURITY INVOKER is the whole security story: RLS on applications,
-- submissions, assignments and form_templates already scopes an organizer to
-- their own school, so this inherits the caller's policies instead of
-- restating them. The my_role() guard is also the approval gate — my_role()
-- returns the role only when users.status = 'approved', so a pending organizer
-- gets zero rows for free.
create function public.organizer_notifications()
returns table (
  exchange_id uuid,
  kind        text,
  total       int,
  new_count   int,
  newest_at   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with seen as (
    select coalesce(
      (select u.notifications_seen_at from users u where u.id = (select auth.uid())),
      '-infinity'::timestamptz
    ) as at
  ),
  items as (
    -- Candidatures à examiner: the subject IS the application, so the dedup
    -- below is a no-op for this branch.
    select a.exchange_id, 'applications_to_review'::text as kind,
           a.id::text as subject, a.submitted_at as event_at
      from applications a
      join exchanges e on e.id = a.exchange_id
     where a.status = 'submitted'
       and a.submitted_at is not null
       and e.archived_at is null

    union all

    -- Dossiers à vérifier: subject is the STUDENT, not the submission, so the
    -- count equals the dashboard's « n dossiers à vérifier » action card.
    select t.exchange_id, 'submissions_to_review',
           asg.student_id::text, s.submitted_at
      from submissions s
      join assignments asg  on asg.id = s.assignment_id
      join form_templates t on t.id  = asg.template_id
      join exchanges e      on e.id  = t.exchange_id
     where s.status = 'submitted'
       and s.submitted_at is not null
       and e.archived_at is null

    union all

    -- Élèves en retard: subject is the STUDENT. Event time is the deadline
    -- itself, so an overdue dossier lights the badge on the day it crosses and
    -- then goes quiet while remaining listed. Only 'approved' clears it —
    -- a rejected submission is still outstanding work.
    select t.exchange_id, 'late',
           asg.student_id::text, t.deadline::timestamptz
      from assignments asg
      join form_templates t   on t.id = asg.template_id
      join exchanges e        on e.id = t.exchange_id
      left join submissions s on s.assignment_id = asg.id
     where t.deadline is not null
       and t.deadline < current_date
       and (s.id is null or s.status <> 'approved')
       and e.archived_at is null
  ),
  deduped as (
    select i.exchange_id, i.kind, i.subject, max(i.event_at) as event_at
      from items i
     group by i.exchange_id, i.kind, i.subject
  )
  select d.exchange_id,
         d.kind,
         count(*)::int,
         count(*) filter (where d.event_at > (select at from seen))::int,
         max(d.event_at)
    from deduped d
   where (select my_role()) = 'organizer'
   group by d.exchange_id, d.kind
$$;

grant execute on function public.organizer_notifications() to authenticated;
```

- [ ] **Step 3: Write the failing RLS matrix tests**

Append to `tests/rls/rpc.test.ts`, after the existing `describe` blocks:

```ts
describe('organizer_notifications()', () => {
  it('organizer A sees only their own school’s exchanges', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from organizer_notifications()`)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.exchange_id).toBe(fx.exchangeA)
      expect(['applications_to_review', 'submissions_to_review', 'late']).toContain(r.kind)
    }
  })

  it('returns the seeded submitted application as one item to review', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from organizer_notifications() where kind = 'applications_to_review'`)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].total)).toBe(1)
    // notifications_seen_at is null for the fixture, so everything is new.
    expect(Number(rows[0].new_count)).toBe(1)
  })

  it('organizer B sees none of school A’s counts', async () => {
    const rows = await runAs(sql, fx.orgB, (tx) =>
      tx`select * from organizer_notifications()`)
    expect(rows.every((r: { exchange_id: string }) => r.exchange_id !== fx.exchangeA)).toBe(true)
  })

  it('a student gets zero rows (my_role() gate)', async () => {
    expect(await runAs(sql, fx.studentA, (tx) =>
      tx`select * from organizer_notifications()`)).toHaveLength(0)
  })

  it('a pending organizer gets zero rows (approval gate via my_role())', async () => {
    expect(await runAs(sql, fx.orgPending, (tx) =>
      tx`select * from organizer_notifications()`)).toHaveLength(0)
  })

  it('anon cannot execute it', async () => {
    await expect(
      runAs(sql, null, (tx) => tx`select * from organizer_notifications()`)
    ).rejects.toThrow()
  })

  it('stamping the watermark suppresses new_count but not total', async () => {
    const rows = await runAs(sql, fx.orgA, async (tx) => {
      await tx`update users set notifications_seen_at = now() where id = ${fx.orgA}`
      return tx`select * from organizer_notifications() where kind = 'applications_to_review'`
    })
    expect(Number(rows[0].total)).toBe(1)
    expect(Number(rows[0].new_count)).toBe(0)
  })

  it('an organizer cannot stamp another user’s watermark', async () => {
    const outcome = await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set notifications_seen_at = now() where id = ${fx.orgB}`)
    expect(outcome === 'denied' || outcome === 0).toBe(true)
  })
})
```

Add `writeOutcome` to the existing import from `./db` at the top of the file:

```ts
import { connect, runAs, writeOutcome } from './db'
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test:rls -- -t "organizer_notifications"`
Expected: FAIL with `function organizer_notifications() does not exist` (or `column "notifications_seen_at" does not exist`).

- [ ] **Step 5: Apply the migration locally, then to staging**

Run locally: `supabase db reset` (or `supabase migration up`) against the local stack.
Then staging: `set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`

If `db push` complains about out-of-order files, add `--include-all`. Its pg-delta certificate error is a known red herring — check the ledger, not the message.

**Do NOT apply to prod in this task.** Prod goes last, after the whole branch is verified and approved for merge.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:rls -- -t "organizer_notifications"`
Expected: PASS, 8 tests.

Then the full matrix, to prove nothing else regressed:
Run: `pnpm test:rls`
Expected: PASS.

- [ ] **Step 7: Regenerate DB types**

Use the Supabase MCP `generate_typescript_types` tool and overwrite `types/supabase.ts` **verbatim**. Never hand-edit it.

Run: `npx tsc --noEmit`
Expected: no errors. If `types/db.ts` fails to compile, fix the narrowing alias there — never `types/supabase.ts`.

- [ ] **Step 8: Check the ledger stamp matches the filename**

Use the Supabase MCP `list_migrations` tool. If the ledger stamped a version different from your filename, `git mv` the local file to the stamped version, and update staging's ledger to match too.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # must print feature/notifications-dropdown
git add supabase/migrations/*_organizer_notifications.sql types/supabase.ts tests/rls/rpc.test.ts
git commit -m "feat(db): organizer_notifications() aggregate and seen watermark"
```

---

### Task 2: Pure shaping module

**Files:**
- Create: `lib/shell/notifications.ts`
- Test: `lib/shell/__tests__/notifications.test.ts`

**Interfaces:**
- Consumes: the row shape produced by Task 1's function.
- Produces:
  - `type NotificationKind = 'applications_to_review' | 'submissions_to_review' | 'late'`
  - `type NotificationRow = { exchange_id: string; kind: string; total: number; new_count: number; newest_at: string | null }`
  - `type NotificationItem = { kind: NotificationKind; total: number; isNew: boolean }`
  - `type NotificationGroup = { exchangeId: string; exchangeName: string; items: NotificationItem[] }`
  - `function badgeCount(rows: NotificationRow[] | null | undefined): number`
  - `function buildNotificationGroups(rows: NotificationRow[] | null | undefined, exchanges: { id: string; name: string }[]): NotificationGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/shell/__tests__/notifications.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { badgeCount, buildNotificationGroups, type NotificationRow } from '@/lib/shell/notifications'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026' },
  { id: 'ex2', name: 'Espagne–Canada 2025' },
]

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    exchange_id: 'ex1',
    kind: 'applications_to_review',
    total: 3,
    new_count: 2,
    newest_at: '2026-07-29T08:00:00Z',
    ...over,
  }
}

describe('badgeCount', () => {
  it('sums new_count across rows', () => {
    expect(badgeCount([row({ new_count: 2 }), row({ kind: 'late', new_count: 5 })])).toBe(7)
  })

  it('ignores total — only new_count drives the badge', () => {
    expect(badgeCount([row({ total: 99, new_count: 0 })])).toBe(0)
  })

  it('ignores unknown kinds', () => {
    expect(badgeCount([row({ kind: 'something_else', new_count: 4 })])).toBe(0)
  })

  it('returns 0 for empty, null and undefined', () => {
    expect(badgeCount([])).toBe(0)
    expect(badgeCount(null)).toBe(0)
    expect(badgeCount(undefined)).toBe(0)
  })
})

describe('buildNotificationGroups', () => {
  it('groups by exchange and names them', () => {
    const groups = buildNotificationGroups([row()], exchanges)
    expect(groups).toHaveLength(1)
    expect(groups[0].exchangeId).toBe('ex1')
    expect(groups[0].exchangeName).toBe('France–Canada 2026')
    expect(groups[0].items).toEqual([{ kind: 'applications_to_review', total: 3, isNew: true }])
  })

  it('orders groups by the caller’s exchange order, not by row order', () => {
    const groups = buildNotificationGroups(
      [row({ exchange_id: 'ex2' }), row({ exchange_id: 'ex1' })],
      exchanges,
    )
    expect(groups.map((g) => g.exchangeId)).toEqual(['ex1', 'ex2'])
  })

  it('orders items by a fixed kind order, not by row order', () => {
    const groups = buildNotificationGroups(
      [row({ kind: 'late' }), row({ kind: 'submissions_to_review' }), row({ kind: 'applications_to_review' })],
      exchanges,
    )
    expect(groups[0].items.map((i) => i.kind)).toEqual([
      'applications_to_review',
      'submissions_to_review',
      'late',
    ])
  })

  it('drops rows whose exchange is not visible to the caller', () => {
    expect(buildNotificationGroups([row({ exchange_id: 'ex-archived' })], exchanges)).toEqual([])
  })

  it('drops unknown kinds and non-positive totals', () => {
    expect(buildNotificationGroups([row({ kind: 'bogus' })], exchanges)).toEqual([])
    expect(buildNotificationGroups([row({ total: 0 })], exchanges)).toEqual([])
  })

  it('marks isNew false when new_count is 0 but still lists the item', () => {
    const groups = buildNotificationGroups([row({ new_count: 0 })], exchanges)
    expect(groups[0].items[0]).toEqual({ kind: 'applications_to_review', total: 3, isNew: false })
  })

  it('returns [] for empty, null and undefined', () => {
    expect(buildNotificationGroups([], exchanges)).toEqual([])
    expect(buildNotificationGroups(null, exchanges)).toEqual([])
    expect(buildNotificationGroups(undefined, exchanges)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/shell/__tests__/notifications.test.ts --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/lib/shell/notifications`.

- [ ] **Step 3: Write the implementation**

Create `lib/shell/notifications.ts`:

```ts
// Shaping for the header bell. Pure — no React, no Supabase — so the branching
// part is unit-testable without a database. The layout hands the raw rows from
// organizer_notifications() straight through; OrganizerShell shapes them here.

export const NOTIFICATION_KINDS = [
  'applications_to_review',
  'submissions_to_review',
  'late',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

// `kind` is a plain string because it arrives from Postgres, not from a union
// the type system enforces. Everything below narrows it before trusting it.
export type NotificationRow = {
  exchange_id: string
  kind: string
  total: number
  new_count: number
  newest_at: string | null
}

export type NotificationItem = { kind: NotificationKind; total: number; isNew: boolean }
export type NotificationGroup = {
  exchangeId: string
  exchangeName: string
  items: NotificationItem[]
}

function isKind(kind: string): kind is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

/**
 * The badge number. Only `new_count` drives it — never `total`. That is the
 * whole reason the watermark exists: badging the total would leave the bell
 * permanently red for a school with a chronically overdue élève.
 */
export function badgeCount(rows: NotificationRow[] | null | undefined): number {
  if (!rows) return 0
  return rows.reduce((n, r) => (isKind(r.kind) && r.new_count > 0 ? n + r.new_count : n), 0)
}

/**
 * Group rows under exchange names.
 *
 * `exchanges` must arrive in DISPLAY order — the same sortExchanges output the
 * sidebar renders — so the bell and the sidebar can never disagree about
 * ordering. Iterating `exchanges` rather than `rows` also drops any row whose
 * exchange the viewer cannot see, without a second lookup.
 */
export function buildNotificationGroups(
  rows: NotificationRow[] | null | undefined,
  exchanges: { id: string; name: string }[],
): NotificationGroup[] {
  if (!rows || rows.length === 0) return []

  const byExchange = new Map<string, NotificationItem[]>()
  for (const r of rows) {
    if (!isKind(r.kind) || r.total <= 0) continue
    const items = byExchange.get(r.exchange_id) ?? []
    items.push({ kind: r.kind, total: r.total, isNew: r.new_count > 0 })
    byExchange.set(r.exchange_id, items)
  }

  const groups: NotificationGroup[] = []
  for (const ex of exchanges) {
    const items = byExchange.get(ex.id)
    if (!items || items.length === 0) continue
    // Fixed order, not data-driven, so the panel does not reshuffle between
    // renders as counts change.
    items.sort(
      (a, b) => NOTIFICATION_KINDS.indexOf(a.kind) - NOTIFICATION_KINDS.indexOf(b.kind),
    )
    groups.push({ exchangeId: ex.id, exchangeName: ex.name, items })
  }
  return groups
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/shell/__tests__/notifications.test.ts --exclude '**/.claude/**'`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/notifications-dropdown
git add lib/shell/notifications.ts lib/shell/__tests__/notifications.test.ts
git commit -m "feat(shell): pure shaping for notification groups and badge count"
```

---

### Task 3: `markNotificationsSeen` server action

**Files:**
- Modify: `actions/session.ts` (append after `setExchangeOrder`)
- Test: `actions/__tests__/mark-notifications-seen.test.ts`

**Interfaces:**
- Consumes: `requireOrganizer()` from `lib/auth/require.ts`, `createClient()` from `lib/supabase/server`, `users.notifications_seen_at` from Task 1.
- Produces: `markNotificationsSeen(): Promise<MarkNotificationsSeenResult>` where
  `type MarkNotificationsSeenResult = { ok: true } | { ok: false; reason: 'write_failed' }`

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/mark-notifications-seen.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn()
const eq = vi.fn()
const requireOrganizer = vi.fn()

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: (...args: unknown[]) => requireOrganizer(...args),
  requireUser: vi.fn(),
  requireStudent: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ update }) }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markNotificationsSeen } from '@/actions/session'
import { revalidatePath } from 'next/cache'

describe('markNotificationsSeen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrganizer.mockResolvedValue({ user: { id: 'user-1' }, profile: { role: 'organizer' } })
    update.mockReturnValue({ eq })
    eq.mockResolvedValue({ error: null })
  })

  it('stamps the caller’s own row and reports success', async () => {
    await expect(markNotificationsSeen()).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ notifications_seen_at: expect.any(String) }),
    )
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns a structured failure instead of throwing when the write fails', async () => {
    eq.mockResolvedValue({ error: { message: 'nope' } })
    await expect(markNotificationsSeen()).resolves.toEqual({ ok: false, reason: 'write_failed' })
  })

  it('does not revalidate — that would re-render the shell under the open panel', async () => {
    await markNotificationsSeen()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('propagates the auth preamble’s rejection', async () => {
    requireOrganizer.mockRejectedValue(new Error('Unauthorized'))
    await expect(markNotificationsSeen()).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run actions/__tests__/mark-notifications-seen.test.ts --exclude '**/.claude/**'`
Expected: FAIL — `markNotificationsSeen` is not exported from `@/actions/session`.

- [ ] **Step 3: Write the implementation**

Append to `actions/session.ts`:

```ts
export type MarkNotificationsSeenResult = { ok: true } | { ok: false; reason: 'write_failed' }

/**
 * Stamp the header bell's seen-watermark, called once when the panel opens.
 *
 * Same trust model as setExchangeOrder — an authenticated organizer writing a
 * display preference on their own row — hence the same file. RLS ("users update
 * themselves") plus the notifications_seen_at column grant confine the write.
 *
 * Deliberately NO revalidatePath: busting the layout tree would re-render the
 * whole shell while the dropdown is open, closing it under the organizer's
 * cursor. The badge clears in local component state instead, and the next
 * navigation re-reads the real value.
 *
 * Structured return, never a throw: production replaces thrown server-action
 * messages with an opaque digest, so a throw would be unreadable at the call
 * site. A failed write is harmless — the badge simply reappears next navigation.
 */
export async function markNotificationsSeen(): Promise<MarkNotificationsSeenResult> {
  const { user } = await requireOrganizer()

  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return { ok: false, reason: 'write_failed' }

  return { ok: true }
}
```

No new imports are needed — `requireOrganizer` and `createClient` are already imported at the top of the file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run actions/__tests__/mark-notifications-seen.test.ts --exclude '**/.claude/**'`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/notifications-dropdown
git add actions/session.ts actions/__tests__/mark-notifications-seen.test.ts
git commit -m "feat(shell): markNotificationsSeen server action"
```

---

### Task 4: Extract `useDismissable` from OrganizerShell

This is a pure refactor: behaviour must not change, and the existing
`OrganizerShell.test.tsx` suite must stay green without edits.

**Files:**
- Create: `components/shell/useDismissable.ts`
- Modify: `components/shell/OrganizerShell.tsx:116-132` (the effect) and `:79` (the ref)
- Test: `components/shell/__tests__/useDismissable.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `useDismissable<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void): React.RefObject<T | null>`

- [ ] **Step 1: Write the failing test**

Create `components/shell/__tests__/useDismissable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useDismissable } from '@/components/shell/useDismissable'

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useDismissable<HTMLDivElement>(open, onClose)
  return (
    <div>
      <div ref={ref} data-testid="inside">panel</div>
      <div data-testid="outside">elsewhere</div>
    </div>
  )
}

describe('useDismissable', () => {
  let onClose: ReturnType<typeof vi.fn>
  beforeEach(() => {
    onClose = vi.fn()
  })

  it('closes on pointerdown outside the ref', () => {
    render(<Harness open onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on pointerdown inside the ref', () => {
    render(<Harness open onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    render(<Harness open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing while closed', () => {
    render(<Harness open={false} onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('outside'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not resubscribe when the callback identity changes each render', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const { rerender } = render(<Harness open onClose={() => {}} />)
    const afterFirst = addSpy.mock.calls.length
    rerender(<Harness open onClose={() => {}} />)
    expect(addSpy.mock.calls.length).toBe(afterFirst)
    addSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/shell/__tests__/useDismissable.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/components/shell/useDismissable`.

- [ ] **Step 3: Write the hook**

Create `components/shell/useDismissable.ts`:

```ts
'use client'
import { useEffect, useRef } from 'react'

/**
 * Close a floating panel on outside pointerdown or Escape.
 *
 * Extracted from OrganizerShell when the notifications bell became a second
 * header menu — two hand-rolled copies of this effect would have drifted.
 * Returns the ref to attach to the element that must NOT dismiss the panel:
 * the trigger and the panel together, so clicking the trigger to close does not
 * race the outside handler.
 *
 * The callback is held in a ref rather than listed as a dependency: callers
 * pass inline arrows, and depending on it would tear down and re-add both
 * listeners on every render.
 */
export function useDismissable<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    function handleOutside(e: Event) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        onCloseRef.current()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return ref
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/shell/__tests__/useDismissable.test.tsx --exclude '**/.claude/**'`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use the hook in OrganizerShell**

In `components/shell/OrganizerShell.tsx`:

Add the import next to the other shell imports:

```ts
import { useDismissable } from './useDismissable'
```

Delete the `const menuRef = useRef<HTMLDivElement>(null)` line (currently line 79) and the entire `useEffect` block that registers `handleOutside` / `handleKey` (currently lines 116–132), replacing the ref line with:

```ts
const closeMenu = useCallback(() => setMenuOpen(false), [])
const menuRef = useDismissable<HTMLDivElement>(menuOpen, closeMenu)
```

`useCallback` is already imported at the top of the file. `useRef` stays imported — `NewExchangeAutoOpen` and other code may still use it; if `pnpm lint` reports it unused, remove it from the import list.

- [ ] **Step 6: Run the existing shell tests to prove behaviour is unchanged**

Run: `pnpm vitest run components/shell --exclude '**/.claude/**'`
Expected: PASS — the whole existing suite, with no test edits.

If a suite fails once and passes on re-run, that is a neighbouring session mid-write, not this change; re-run the single file before debugging.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feature/notifications-dropdown
git add components/shell/useDismissable.ts components/shell/__tests__/useDismissable.test.tsx components/shell/OrganizerShell.tsx
git commit -m "refactor(shell): extract useDismissable from OrganizerShell"
```

---

### Task 5: The bell — icon, i18n keys and `NotificationsMenu`

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/de.json`, `messages/es.json`, `messages/it.json`
- Modify: `components/shell/RailIcons.tsx` (append `IconBell`)
- Create: `components/shell/NotificationsMenu.tsx`
- Test: `components/shell/__tests__/NotificationsMenu.test.tsx`

**Interfaces:**
- Consumes: `NotificationGroup` / `NotificationKind` from Task 2, `markNotificationsSeen` from Task 3, `useDismissable` from Task 4, `setActiveExchange` from `actions/session`.
- Produces: `NotificationsMenu({ groups, badge, open, onOpenChange })` where
  `groups: NotificationGroup[]`, `badge: number`, `open: boolean`, `onOpenChange: (open: boolean) => void`.

- [ ] **Step 1: Add the four new i18n keys to all five locale files**

Insert a `"notifications"` object inside `organizer.shell`, as a sibling of `"accountMenu"`, in each file.

`messages/fr.json`:
```json
"notifications": {
  "trigger": "Notifications",
  "title": "Notifications",
  "empty": "Rien en attente",
  "badgeLabel": "{n, plural, one {# nouveauté} other {# nouveautés}}"
}
```

`messages/en.json`:
```json
"notifications": {
  "trigger": "Notifications",
  "title": "Notifications",
  "empty": "Nothing pending",
  "badgeLabel": "{n, plural, one {# new item} other {# new items}}"
}
```

`messages/de.json`:
```json
"notifications": {
  "trigger": "Benachrichtigungen",
  "title": "Benachrichtigungen",
  "empty": "Nichts ausstehend",
  "badgeLabel": "{n, plural, one {# Neuigkeit} other {# Neuigkeiten}}"
}
```

`messages/es.json`:
```json
"notifications": {
  "trigger": "Notificaciones",
  "title": "Notificaciones",
  "empty": "Nada pendiente",
  "badgeLabel": "{n, plural, one {# novedad} other {# novedades}}"
}
```

`messages/it.json`:
```json
"notifications": {
  "trigger": "Notifiche",
  "title": "Notifiche",
  "empty": "Nulla in sospeso",
  "badgeLabel": "{n, plural, one {# novità} other {# novità}}"
}
```

The three **row labels are not new keys** — the component reuses
`organizer.dashboard.actionCards.toReviewTitle` / `reviewTitle` / `lateTitle`,
which already exist and are already translated in all five locales. That reuse is
what makes the bell and the dashboard say the same words about the same numbers.

- [ ] **Step 2: Verify locale parity**

Run: `pnpm vitest run messages/__tests__/parity.test.ts --exclude '**/.claude/**'`
Expected: PASS — all five files key-identical.

- [ ] **Step 3: Write the failing component test**

Create `components/shell/__tests__/NotificationsMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
}))
vi.mock('@/actions/session', () => ({
  setActiveExchange: vi.fn().mockResolvedValue(undefined),
  markNotificationsSeen: vi.fn().mockResolvedValue({ ok: true }),
}))

import { setActiveExchange, markNotificationsSeen } from '@/actions/session'
import { NotificationsMenu } from '@/components/shell/NotificationsMenu'
import type { NotificationGroup } from '@/lib/shell/notifications'

const groups: NotificationGroup[] = [
  {
    exchangeId: 'ex1',
    exchangeName: 'France–Canada 2026',
    items: [
      { kind: 'applications_to_review', total: 3, isNew: true },
      { kind: 'submissions_to_review', total: 7, isNew: false },
    ],
  },
  {
    exchangeId: 'ex2',
    exchangeName: 'Espagne–Canada 2025',
    items: [{ kind: 'late', total: 2, isNew: true }],
  },
]

function renderMenu(over: { groups?: NotificationGroup[]; badge?: number; open?: boolean } = {}) {
  const onOpenChange = vi.fn()
  const utils = renderWithIntl(
    <NotificationsMenu
      groups={over.groups ?? groups}
      badge={over.badge ?? 5}
      open={over.open ?? false}
      onOpenChange={onOpenChange}
    />,
  )
  return { ...utils, onOpenChange }
}

// Owns `open` itself so a click really drives the closed → open transition.
function OpenHarness({ badge = 5 }: { badge?: number }) {
  const [open, setOpen] = useState(false)
  return <NotificationsMenu groups={groups} badge={badge} open={open} onOpenChange={setOpen} />
}

describe('NotificationsMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the badge count when there are new items', () => {
    renderMenu({ badge: 5 })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('hides the badge entirely at zero', () => {
    renderMenu({ badge: 0 })
    expect(screen.queryByText('0')).toBeNull()
  })

  it('caps the badge at 9+', () => {
    renderMenu({ badge: 42 })
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('renders French group headers and reuses the dashboard row wording', () => {
    renderMenu({ open: true })
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Espagne–Canada 2025')).toBeInTheDocument()
    expect(screen.getByText('3 candidatures à examiner')).toBeInTheDocument()
    expect(screen.getByText('7 dossiers à vérifier')).toBeInTheDocument()
    expect(screen.getByText('2 élèves en retard')).toBeInTheDocument()
  })

  it('shows the empty state when there is nothing waiting', () => {
    renderMenu({ open: true, groups: [], badge: 0 })
    expect(screen.getByText('Rien en attente')).toBeInTheDocument()
  })

  it('renders no panel while closed', () => {
    renderMenu({ open: false })
    expect(screen.queryByText('France–Canada 2026')).toBeNull()
  })

  it('asks to open when the trigger is clicked', () => {
    const { onOpenChange } = renderMenu({ open: false })
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  // These two exercise the closed → open transition. They drive it through a
  // stateful harness rather than RTL's rerender(): renderWithIntl nests the
  // provider INSIDE the element instead of passing it as `wrapper`, so a bare
  // rerender would drop NextIntlClientProvider and every t() call would throw.
  it('stamps the watermark once when it becomes open', async () => {
    renderWithIntl(<OpenHarness />)
    expect(markNotificationsSeen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(markNotificationsSeen).toHaveBeenCalledTimes(1))
  })

  it('clears the badge locally once opened, without waiting for a navigation', async () => {
    renderWithIntl(<OpenHarness badge={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(screen.queryByText('5')).toBeNull())
  })

  it('switches exchange then navigates when a candidature row is clicked', async () => {
    renderMenu({ open: true })
    fireEvent.click(screen.getByText('3 candidatures à examiner'))
    await waitFor(() => expect(setActiveExchange).toHaveBeenCalledWith('ex1'))
    expect(push).toHaveBeenCalledWith('/applications?tab=toreview')
  })

  it('sends the dossier and retard rows to the dashboard', async () => {
    renderMenu({ open: true })
    fireEvent.click(screen.getByText('2 élèves en retard'))
    await waitFor(() => expect(setActiveExchange).toHaveBeenCalledWith('ex2'))
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('closes after a row is clicked', async () => {
    const { onOpenChange } = renderMenu({ open: true })
    fireEvent.click(screen.getByText('3 candidatures à examiner'))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('closes on Escape', () => {
    const { onOpenChange } = renderMenu({ open: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on outside pointerdown', () => {
    const { onOpenChange } = renderMenu({ open: true })
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run components/shell/__tests__/NotificationsMenu.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — cannot resolve `@/components/shell/NotificationsMenu`.

- [ ] **Step 5: Add the bell icon**

Append to `components/shell/RailIcons.tsx`:

```tsx
export function IconBell() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={18}
      height={18}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
```

Note the JSX casing: `fillRule` / `clipRule`, not the HTML `fill-rule` / `clip-rule`. The supplied `class="size-6"` is dropped in favour of explicit 18px, matching `IconApplications` and the header's other glyphs.

- [ ] **Step 6: Write the component**

Create `components/shell/NotificationsMenu.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { markNotificationsSeen, setActiveExchange } from '@/actions/session'
import type { NotificationGroup, NotificationKind } from '@/lib/shell/notifications'
import { IconBell } from './RailIcons'
import { useDismissable } from './useDismissable'

// The row labels are the dashboard's action-card titles, reused verbatim so the
// bell and the dashboard cannot say the same words about different numbers.
const KIND_LABEL_KEY: Record<NotificationKind, string> = {
  applications_to_review: 'dashboard.actionCards.toReviewTitle',
  submissions_to_review: 'dashboard.actionCards.reviewTitle',
  late: 'dashboard.actionCards.lateTitle',
}

// The dashboard's filter is component state, not a URL parameter, so the two
// dossier kinds land there unfiltered rather than dragging a ?filter= param
// into an organizer page. See the spec's non-goals.
const KIND_HREF: Record<NotificationKind, string> = {
  applications_to_review: '/applications?tab=toreview',
  submissions_to_review: '/dashboard',
  late: '/dashboard',
}

export function NotificationsMenu({
  groups,
  badge,
  open,
  onOpenChange,
}: {
  groups: NotificationGroup[]
  badge: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const ref = useDismissable<HTMLDivElement>(open, () => onOpenChange(false))

  // Which badge value the organizer has already looked at. Comparing values
  // rather than holding a boolean means a NEW badge from the next navigation
  // shows again without an effect to reset it.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const shown = dismissedAt === badge ? 0 : badge

  useEffect(() => {
    if (!open) return
    setDismissedAt(badge)
    // Fire-and-forget: a failed stamp only means the badge reappears on the
    // next navigation, which is not worth surfacing to the organizer.
    void markNotificationsSeen()
    // Deliberately keyed on `open` alone — re-stamping because `badge` changed
    // while the panel is open would be a second pointless write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleRow(exchangeId: string, kind: NotificationKind) {
    onOpenChange(false)
    await setActiveExchange(exchangeId)
    router.push(KIND_HREF[kind])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={
          shown > 0
            ? `${t('shell.notifications.trigger')} — ${t('shell.notifications.badgeLabel', { n: shown })}`
            : t('shell.notifications.trigger')
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border text-muted-foreground hover:bg-hoverrow hover:text-foreground"
      >
        <IconBell />
        {shown > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-pill bg-brand px-1 font-mono text-[10px] font-semibold text-white"
          >
            {shown > 9 ? '9+' : shown}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[300px] overflow-y-auto rounded-[11px] border bg-card p-1 shadow-float"
        >
          <p className="px-3 pb-1 pt-2 font-display text-[13px] font-semibold text-navy">
            {t('shell.notifications.title')}
          </p>

          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              {t('shell.notifications.empty')}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.exchangeId} className="pb-1.5">
                <p className="truncate px-3 pb-0.5 pt-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.exchangeName}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    onClick={() => handleRow(group.exchangeId, item.kind)}
                    className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[13px] hover:bg-hoverrow"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-[7px] w-[7px] flex-none rounded-full',
                        item.isNew ? 'bg-brand' : 'bg-border',
                      )}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        item.isNew ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {t(KIND_LABEL_KEY[item.kind] as never, { n: item.total })}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run components/shell/__tests__/NotificationsMenu.test.tsx --exclude '**/.claude/**'`
Expected: PASS, 14 tests.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feature/notifications-dropdown
git add components/shell/NotificationsMenu.tsx components/shell/RailIcons.tsx components/shell/__tests__/NotificationsMenu.test.tsx messages/en.json messages/fr.json messages/de.json messages/es.json messages/it.json
git commit -m "feat(shell): notifications bell trigger, badge and panel"
```

---

### Task 6: Wire the bell into the header and the layout

**Files:**
- Modify: `components/shell/OrganizerShell.tsx` (props, menu state, header placement)
- Modify: `app/(organizer)/layout.tsx` (RPC call, pass rows)
- Test: `components/shell/__tests__/OrganizerShell.test.tsx` (extend)

**Interfaces:**
- Consumes: `NotificationsMenu` (Task 5), `buildNotificationGroups` / `badgeCount` / `NotificationRow` (Task 2), `organizer_notifications()` (Task 1).
- Produces: `OrganizerShell` gains one optional prop, `notifications?: NotificationRow[]`, defaulting to `[]` so every existing caller and test is unaffected.

- [ ] **Step 1: Write the failing tests**

Append to `components/shell/__tests__/OrganizerShell.test.tsx`, inside the existing `describe('OrganizerShell', ...)`:

```tsx
  it('renders the bell between the Feedback button and the account trigger', () => {
    renderShell()
    const header = screen.getByText('France–Canada 2026').closest('header')!
    const buttons = within(header).getAllByRole('button')
    const labels = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)
    const feedback = labels.findIndex((l) => l?.includes('Feedback'))
    const bell = labels.findIndex((l) => l?.includes('Notifications'))
    const account = labels.findIndex((l) => l?.includes('Compte'))
    expect(feedback).toBeGreaterThanOrEqual(0)
    expect(bell).toBeGreaterThan(feedback)
    expect(account).toBeGreaterThan(bell)
  })

  it('shows no badge when there are no notifications', () => {
    renderShell()
    expect(screen.queryByText('9+')).toBeNull()
  })

  it('shapes the raw rows into a badge count', () => {
    renderWithIntl(
      <OrganizerShell
        exchanges={exchanges}
        activeExchangeId="ex1"
        organizerName="Marie Bernard"
        schoolName="Lycée Mistral"
        notifications={[
          { exchange_id: 'ex1', kind: 'applications_to_review', total: 3, new_count: 2, newest_at: null },
        ]}
      >
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('opening the bell closes the account menu', async () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Compte/ }))
    expect(screen.getByText('Se déconnecter')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() => expect(screen.queryByText('Se déconnecter')).toBeNull())
  })
```

Extend the existing `@/actions/session` mock at the top of the file so the new
action is stubbed:

```ts
vi.mock('@/actions/session', () => ({
  setActiveExchange: vi.fn(),
  markNotificationsSeen: vi.fn().mockResolvedValue({ ok: true }),
}))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx --exclude '**/.claude/**'`
Expected: FAIL — no button named `Notifications` in the header.

- [ ] **Step 3: Wire the shell**

In `components/shell/OrganizerShell.tsx`:

Add the imports:

```ts
import { NotificationsMenu } from './NotificationsMenu'
import { badgeCount, buildNotificationGroups, type NotificationRow } from '@/lib/shell/notifications'
```

Add the prop to the destructured parameter list (after `tourState`) and to the type:

```ts
  notifications = [],
```
```ts
  notifications?: NotificationRow[]
```

Replace the `const [menuOpen, setMenuOpen] = useState(false)` line with a single
tri-state so the two header menus cannot both be open:

```ts
  // One state, not two booleans: opening either header menu must close the other.
  const [openMenu, setOpenMenu] = useState<'account' | 'notifications' | null>(null)
  const menuOpen = openMenu === 'account'
```

`setMenuOpen` has two call sites that must change:
- the account trigger's `onClick={() => setMenuOpen((o) => !o)}` becomes
  `onClick={() => setOpenMenu((m) => (m === 'account' ? null : 'account'))}`
- `TourMenuItem`'s `onStarted={() => setMenuOpen(false)}` becomes
  `onStarted={() => setOpenMenu(null)}`

And Task 4's `closeMenu` becomes:

```ts
  const closeMenu = useCallback(() => setOpenMenu(null), [])
```

Derive the panel data just below `shellUi`:

```ts
  const notificationGroups = useMemo(
    () => buildNotificationGroups(notifications, exchanges),
    [notifications, exchanges],
  )
  const notificationBadge = useMemo(() => badgeCount(notifications), [notifications])
```

Then place the bell in the header's right cluster, between the Feedback button
(which currently ends at line 231) and the `<div ref={menuRef} className="relative">`
that wraps the account trigger:

```tsx
            <NotificationsMenu
              groups={notificationGroups}
              badge={notificationBadge}
              open={openMenu === 'notifications'}
              onOpenChange={(next) => setOpenMenu(next ? 'notifications' : null)}
            />
```

- [ ] **Step 4: Run the shell tests to verify they pass**

Run: `pnpm vitest run components/shell --exclude '**/.claude/**'`
Expected: PASS — the new cases plus every pre-existing shell test.

- [ ] **Step 5: Fetch the rows in the layout**

In `app/(organizer)/layout.tsx`, replace the standalone exchanges query with a
parallel pair. Find:

```ts
  const { data: exchangeRows } = await supabase
    .from('exchanges')
    .select('id, name, year, archived_at, school_a_id')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })
```

and replace it with:

```ts
  // One extra round trip for the header bell, issued alongside the exchanges
  // query rather than after it, so it costs a query but ~no added latency.
  const [{ data: exchangeRows }, { data: notificationRows }] = await Promise.all([
    supabase
      .from('exchanges')
      .select('id, name, year, archived_at, school_a_id')
      .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
      .order('created_at', { ascending: false }),
    supabase.rpc('organizer_notifications'),
  ])
```

Then pass the rows to the shell, alongside `tourState`:

```tsx
          notifications={notificationRows ?? []}
```

An RPC error yields `data: null`, so the `?? []` is the entire failure path: the
bell renders empty and the page is untouched. Deliberately no throw, no log — the
row shapes could name students, and the shell must never break over a badge.

- [ ] **Step 6: Verify the whole gate**

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:rls
```
Expected: all four PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feature/notifications-dropdown
git add components/shell/OrganizerShell.tsx components/shell/__tests__/OrganizerShell.test.tsx "app/(organizer)/layout.tsx"
git commit -m "feat(shell): place the notifications bell in the organizer header"
```

---

## Manual verification before merge

Automated tests do not cover the visual result or the real query. Run the dev
server in this worktree (`pnpm dev`, port pinned in `.wtport`) against the local
stack seeded with `pnpm seed`, and check:

- [ ] The bell sits between « Feedback » and the initials circle, vertically centred, same height as the Feedback button.
- [ ] With seeded submitted applications, the badge shows a number and the panel lists them grouped under the exchange name.
- [ ] Opening the panel clears the badge; navigating to another page leaves it cleared.
- [ ] Clicking a « candidature » row switches exchange and lands on Candidatures with the review tab. **Watch for the known RSC navigation stall** (`docs/superpowers/specs/2026-07-28-rsc-navigation-stall-investigation.md`) — if the URL does not commit, that is the pre-existing bug, not this change; `ExchangeList` will stall the same way.
- [ ] Escape and an outside click both close the panel; opening the bell closes the account menu and vice versa.
- [ ] An account with nothing waiting shows « Rien en attente » and no badge.
- [ ] Switch locale to EN/DE/ES/IT and confirm the panel has no missing-key placeholders.

## Merge and prod migration

Only after the four gate commands pass **and** Bjorn confirms:

1. Apply the migration to **prod** via Supabase MCP `apply_migration` (`name` = `organizer_notifications`).
2. Check MCP `list_migrations`; if prod stamped a different version than the filename, `git mv` the local file to the stamped version and sync staging's ledger.
3. Merge to `main` and push (Vercel deploys `main` to production).
4. `ExitWorktree` with `remove`.
