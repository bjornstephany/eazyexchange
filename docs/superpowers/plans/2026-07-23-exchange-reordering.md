# Exchange Reordering (Sidebar Drag-and-Drop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organizer drag exchanges in the sidebar into a personal order that persists across devices and sessions.

**Architecture:** The order is a per-account preference stored as `users.exchange_order uuid[]`, governed by the existing `"users update themselves"` RLS policy — no new table, no new policy. The organizer layout reads it from the already-cached `getProfile()` call (zero extra queries) and sorts the exchange list server-side with a pure helper before handing it to the shell. `ExchangeList` becomes a dnd-kit sortable list with a dedicated grip handle per row; a drop updates local state instantly and fires the persistence action without awaiting it.

**Tech Stack:** Next.js 15 App Router + Server Actions, Supabase (PostgreSQL + RLS), React 19, `@dnd-kit/core` + `@dnd-kit/sortable`, next-intl (5 locales), Tailwind, Vitest.

**Source spec:** `docs/superpowers/specs/2026-07-23-exchange-reordering-design.md`

## Global Constraints

- Branch is `feature/exchange-reordering` in this worktree. **Confirm with `git branch --show-current` before every commit.** Never commit to `main`.
- **Never `git add -A` / `git add .`** — stage only the files named in the step.
- Package manager is **pnpm**, never npm.
- Exactly **two** new production dependencies: `@dnd-kit/core` and `@dnd-kit/sortable`. Do **not** add `@dnd-kit/modifiers` or `@dnd-kit/utilities` — the vertical axis lock is hand-written (see Task 4).
- Server actions use `requireOrganizer()` from `lib/auth/require.ts`. Never hand-roll the auth preamble. Error strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing.
- Production redacts thrown server-action messages. Validation failures must be **structured return values** (`{ ok: false, reason }`), never throws.
- Hard cap on the stored order: **200 ids**. Dedupe keeps the **first** occurrence.
- Reordering is **expanded-only**. The collapsed 68 px rail still renders the persisted order but shows no grips and no `DndContext`.
- The drag grip carries the drag listeners, **never the row button** (dnd-kit's keyboard sensor lifts on Space, which is also how a `<button>` fires).
- Pointer sensor activation constraint is **5 px**.
- New i18n keys go in **all five** catalogs: `messages/{en,fr,es,it,de}.json`. French copy uses typographic apostrophes (`’`), never ASCII (`'`) — `messages/__tests__/parity.test.ts` enforces key-set and ICU-argument parity across locales.
- `supabase/migrations/` is single-writer across parallel sessions. If another session is mid-migration, wait.
- Full gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, and — because `supabase/migrations/` is touched — `pnpm test:rls`.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `supabase/migrations/20260723101500_users_exchange_order.sql` | **Create** — adds the `exchange_order uuid[]` column | 1 |
| `types/supabase.ts` | **Regenerate** — generated schema types (never hand-edit) | 1 |
| `lib/supabase/request.ts` | **Modify** — `Profile.exchange_order` + the `select` column list | 1 |
| `tests/rls/matrix.test.ts` | **Modify** — deny/allow cases for `exchange_order` | 1 |
| `lib/shell/exchange-order.ts` | **Create** — pure `sortExchanges` + `reorderIds` | 2 |
| `lib/shell/__tests__/exchange-order.test.ts` | **Create** — sort/reorder unit tests | 2 |
| `actions/session.ts` | **Modify** — add `setExchangeOrder` beside `setActiveExchange` | 3 |
| `actions/__tests__/session.test.ts` | **Modify** — auth guard, validation, structured failures | 3 |
| `messages/{en,fr,es,it,de}.json` | **Modify** — grip label + screen-reader announcements | 4 |
| `components/shell/ExchangeList.tsx` | **Modify** — dnd-kit sortable list with grip handles | 4 |
| `components/shell/__tests__/ExchangeList.test.tsx` | **Modify** — grip presence, drop path, existing behaviours | 4 |
| `app/(organizer)/layout.tsx` | **Modify** — sort exchanges by the stored order | 5 |
| `lib/exchange-session.ts` | **Modify** — header comment (input is now display-ordered) | 5 |

---

### Task 1: Storage — migration, generated types, profile column, RLS matrix

Adds the column, gets it onto staging and prod, regenerates the DB types, exposes it on the request-cached profile, and proves the RLS boundary holds.

**Files:**
- Create: `supabase/migrations/20260723101500_users_exchange_order.sql`
- Modify: `types/supabase.ts` (regenerated verbatim — never hand-edited)
- Modify: `lib/supabase/request.ts:11-25` (the `Profile` type) and `lib/supabase/request.ts:42` (the `select` list)
- Modify: `tests/rls/matrix.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Profile.exchange_order: string[] | null` on the object returned by `getProfile()` from `@/lib/supabase/request`. Task 5 reads it.

- [ ] **Step 1: Check no other session is mid-migration**

Run:
```bash
git -C . status --porcelain supabase/migrations/
ls supabase/migrations/ | tail -3
```
Expected: clean output from `git status` (no other session's uncommitted migration), and the newest existing file is `20260722195955_applications_language_all_locales.sql`. The new filename `20260723101500_...` sorts after it. If `git status` shows another session's migration in flight, stop and wait.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260723101500_users_exchange_order.sql`:

```sql
-- Personal sidebar ordering for exchanges (organizer drag-and-drop).
-- Mirrors 20260714200924_users_locale.sql: a per-account display preference on
-- `users`, governed by the existing "users update themselves" policy
-- (20260624000002) — no new policy, no new table.
--
-- Display-only by construction: the stored ids are intersected against the
-- exchanges RLS already lets the viewer read, so a stale or junk id is simply
-- ignored and can reveal nothing. Writes are confined to the caller's own row.
alter table users
  add column exchange_order uuid[] not null default '{}';
```

- [ ] **Step 3: Apply to staging**

Run from the **main checkout** (`.env.staging` is not committed and is symlinked into the worktree by `pnpm wt`):
```bash
set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"
```
Expected: `Applying migration 20260723101500_users_exchange_order.sql...` then `Finished supabase db push.`

If the command hangs with no output, it is the known WSL2 IPv6 stall — resolve the host to IPv4 (`getent ahostsv4 <db-host>`) and substitute the literal IP into `--db-url`.

- [ ] **Step 4: Apply to prod**

**Checkpoint — this writes to production. Confirm with Bjorn before running it.**

Use the Supabase MCP tool `apply_migration` with `name: "users_exchange_order"` and the exact SQL body from Step 2.

Then run MCP `list_migrations` and compare the stamped version against the local filename. If the ledger stamped a different version, rename the local file to match:
```bash
git mv supabase/migrations/20260723101500_users_exchange_order.sql \
       supabase/migrations/<stamped_version>_users_exchange_order.sql
```

- [ ] **Step 5: Regenerate the DB types**

Run MCP `generate_typescript_types` and overwrite `types/supabase.ts` **verbatim** with the result. Do not hand-edit it.

Verify the column landed:
```bash
grep -n "exchange_order" types/supabase.ts
```
Expected: three hits inside the `users` block — one each in `Row`, `Insert`, `Update`.

- [ ] **Step 6: Confirm the types still compile**

Run: `npx tsc --noEmit`
Expected: no output (exit 0). `types/db.ts` narrows the generated `users` row via `UserProfile`; drift would fail here.

- [ ] **Step 7: Expose the column on the cached profile**

In `lib/supabase/request.ts`, add the field to the `Profile` type:

```ts
export type Profile = {
  id: string
  role: 'organizer' | 'student'
  school_id: string
  full_name: string
  email: string
  org_role: string | null
  locale: Locale
  // Personal sidebar order for exchanges (ids the organizer dragged into
  // place). Display-only: unknown ids are ignored at sort time.
  exchange_order: string[] | null
  schools: {
    name: string
    subscription_status: string | null
    plan: string | null
    grace_until: string | null
  } | null
}
```

and add it to the `select` list in `getProfile` (this is the same single query — zero extra round trips):

```ts
    .select('id, role, school_id, full_name, email, org_role, locale, exchange_order, schools(name, subscription_status, plan, grace_until)')
```

- [ ] **Step 8: Add the RLS matrix cases**

In `tests/rls/matrix.test.ts`, inside the `describe.each([...])('cross-tenant deny as %s', ...)` block, immediately after the existing `it('users: cannot change a school A profile locale', ...)` case, add:

```ts
  it('users: cannot change a school A organizer exchange_order', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update users set exchange_order = array[${fx.exchangeA}]::uuid[] where id = ${fx.orgA}`))
  })
```

Then, in the allow block, immediately after the existing `it('student A can set their own locale', ...)` case, add:

```ts
  it('organizer A can set their own exchange_order', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set exchange_order = array[${fx.exchangeA}]::uuid[] where id = ${fx.orgA}`)).toBe(1)
  })
```

- [ ] **Step 9: Run the RLS matrix**

Requires the local Supabase stack running (`supabase start`) or `RLS_TEST_DB_URL` pointing at a dedicated test project — **never production**.

Run: `pnpm test:rls`
Expected: all files pass, including the two new cases. The deny case must report blocked (0 rows / permission error), the allow case must report 1 row.

- [ ] **Step 10: Commit**

```bash
git branch --show-current   # must print feature/exchange-reordering
git add supabase/migrations/20260723101500_users_exchange_order.sql types/supabase.ts lib/supabase/request.ts tests/rls/matrix.test.ts
git commit -m "feat(shell): add users.exchange_order for personal sidebar ordering"
```

---

### Task 2: Sorting — `lib/shell/exchange-order.ts`

Two pure functions with no React and no Supabase: the server-side display sort, and the reorder math the drop handler uses. Independently testable, and the seam that keeps the component test free of drag physics.

**Files:**
- Create: `lib/shell/exchange-order.ts`
- Test: `lib/shell/__tests__/exchange-order.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sortExchanges<T extends { id: string }>(exchanges: T[], order: string[]): T[]` — used by `app/(organizer)/layout.tsx` (Task 5).
  - `reorderIds(ids: string[], activeId: string, overId: string): string[]` — used by `components/shell/ExchangeList.tsx` (Task 4). Returns the **same array reference** when the move is a no-op.

- [ ] **Step 1: Write the failing tests**

Create `lib/shell/__tests__/exchange-order.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reorderIds, sortExchanges } from '@/lib/shell/exchange-order'

const ex = (id: string) => ({ id, name: id.toUpperCase() })

describe('sortExchanges', () => {
  it('returns the exchanges untouched when the order is empty', () => {
    const list = [ex('a'), ex('b'), ex('c')]
    expect(sortExchanges(list, []).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array when there are no exchanges', () => {
    expect(sortExchanges([], ['a', 'b'])).toEqual([])
  })

  it('orders fully-listed exchanges exactly as the order array does', () => {
    const list = [ex('a'), ex('b'), ex('c')]
    expect(sortExchanges(list, ['c', 'a', 'b']).map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })

  it('puts unlisted exchanges first, keeping their incoming sequence', () => {
    // 'd' and 'e' arrive created_at desc and are not in the saved order:
    // a freshly created exchange must stay where the organizer expects it.
    const list = [ex('e'), ex('d'), ex('a'), ex('b')]
    expect(sortExchanges(list, ['b', 'a']).map((e) => e.id)).toEqual(['e', 'd', 'b', 'a'])
  })

  it('ignores order ids that match no exchange', () => {
    const list = [ex('a'), ex('b')]
    expect(sortExchanges(list, ['deleted', 'b', 'gone', 'a']).map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('honours the first occurrence of a duplicated id in the order', () => {
    const list = [ex('a'), ex('b')]
    expect(sortExchanges(list, ['b', 'a', 'b']).map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('does not mutate its inputs', () => {
    const list = [ex('a'), ex('b')]
    const order = ['b', 'a']
    sortExchanges(list, order)
    expect(list.map((e) => e.id)).toEqual(['a', 'b'])
    expect(order).toEqual(['b', 'a'])
  })
})

describe('reorderIds', () => {
  it('moves an id downwards to the target index', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  })

  it('moves an id upwards to the target index', () => {
    expect(reorderIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('swaps neighbours', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c'])
  })

  it('returns the same reference when the row is dropped on itself', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderIds(ids, 'b', 'b')).toBe(ids)
  })

  it('returns the same reference when either id is unknown', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderIds(ids, 'zz', 'b')).toBe(ids)
    expect(reorderIds(ids, 'a', 'zz')).toBe(ids)
  })

  it('does not mutate its input', () => {
    const ids = ['a', 'b', 'c']
    reorderIds(ids, 'a', 'c')
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/shell/__tests__/exchange-order.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/shell/exchange-order"`.

- [ ] **Step 3: Write the implementation**

Create `lib/shell/exchange-order.ts`:

```ts
// Pure ordering helpers for the organizer sidebar's exchange list. No React,
// no Supabase: the server sorts with sortExchanges before rendering, and the
// client's drop handler computes the next order with reorderIds.

/**
 * Apply an organizer's personal order to a list of exchanges.
 *
 * Exchanges absent from `order` come FIRST, keeping their incoming sequence
 * (the layout supplies created_at desc), so a newly created exchange stays
 * where the organizer expects it instead of being buried under a hand-ordered
 * list. Because every drop persists the complete id list, "unlisted" only ever
 * means "created since your last drag" — the state self-heals after one
 * reorder. Ids in `order` that match no exchange (deleted, or no longer
 * visible under RLS) are ignored.
 */
export function sortExchanges<T extends { id: string }>(exchanges: T[], order: string[]): T[] {
  if (order.length === 0) return exchanges

  const rank = new Map<string, number>()
  order.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i) // first occurrence wins
  })

  const unlisted: T[] = []
  const listed: T[] = []
  for (const exchange of exchanges) {
    ;(rank.has(exchange.id) ? listed : unlisted).push(exchange)
  }
  listed.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)

  return [...unlisted, ...listed]
}

/**
 * Move `activeId` to the index currently held by `overId`.
 *
 * Returns the SAME array reference when the move is a no-op (dropped on
 * itself, or either id is unknown) so callers can skip the state update and
 * the server round trip with a cheap identity check.
 */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1 || from === to) return ids

  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/shell/__tests__/exchange-order.test.ts`
Expected: PASS — 13 tests passed.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/exchange-reordering
git add lib/shell/exchange-order.ts lib/shell/__tests__/exchange-order.test.ts
git commit -m "feat(shell): pure sortExchanges/reorderIds helpers"
```

---

### Task 3: Persistence — `setExchangeOrder` server action

Writes the order to the caller's own `users` row. Validation failures return a structured result (production redacts thrown server-action messages), and the action deliberately does **not** revalidate — the client already shows the new order optimistically.

**Files:**
- Modify: `actions/session.ts`
- Test: `actions/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `requireOrganizer()` from `@/lib/auth/require`, `createClient()` from `@/lib/supabase/server`, the `users.exchange_order` column from Task 1.
- Produces:
  - `EXCHANGE_ORDER_CAP = 200` (exported const)
  - `type SetExchangeOrderResult = { ok: true } | { ok: false; reason: 'invalid' | 'too_many' | 'write_failed' }`
  - `setExchangeOrder(ids: string[]): Promise<SetExchangeOrderResult>` — called fire-and-forget by `ExchangeList` (Task 4).

- [ ] **Step 1: Write the failing tests**

Replace the whole of `actions/__tests__/session.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const requireOrganizer = vi.fn(async () => ({
  user: { id: 'org-1' },
  profile: { id: 'org-1', role: 'organizer' },
}))
vi.mock('@/lib/auth/require', () => ({ requireOrganizer: () => requireOrganizer() }))

const eq = vi.fn(async () => ({ error: null }))
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))

import { setActiveExchange, setExchangeOrder, EXCHANGE_ORDER_CAP } from '@/actions/session'

// Valid v4-shaped uuids; only the shape matters to the action.
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'

describe('setActiveExchange', () => {
  beforeEach(() => {
    set.mockClear()
    revalidatePath.mockClear()
  })

  it('sets the active-exchange cookie with safe attributes', async () => {
    await setActiveExchange('ex-123')
    expect(set).toHaveBeenCalledWith(
      'ee_active_exchange',
      'ex-123',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

describe('setExchangeOrder', () => {
  beforeEach(() => {
    from.mockClear()
    update.mockClear()
    eq.mockClear()
    revalidatePath.mockClear()
    requireOrganizer.mockClear()
    eq.mockResolvedValue({ error: null })
    requireOrganizer.mockResolvedValue({
      user: { id: 'org-1' },
      profile: { id: 'org-1', role: 'organizer' },
    })
  })

  it('rejects a caller who is not an organizer', async () => {
    requireOrganizer.mockRejectedValueOnce(new Error('Unauthorized'))
    await expect(setExchangeOrder([U1])).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })

  it('writes the id list to the caller own row', async () => {
    const result = await setExchangeOrder([U1, U2])
    expect(from).toHaveBeenCalledWith('users')
    expect(update).toHaveBeenCalledWith({ exchange_order: [U1, U2] })
    expect(eq).toHaveBeenCalledWith('id', 'org-1')
    expect(result).toEqual({ ok: true })
  })

  it('dedupes, keeping the first occurrence', async () => {
    await setExchangeOrder([U2, U1, U2, U3, U1])
    expect(update).toHaveBeenCalledWith({ exchange_order: [U2, U1, U3] })
  })

  it('accepts an empty list (clears the personal order)', async () => {
    const result = await setExchangeOrder([])
    expect(update).toHaveBeenCalledWith({ exchange_order: [] })
    expect(result).toEqual({ ok: true })
  })

  it('returns a structured failure for a non-uuid id, without writing', async () => {
    const result = await setExchangeOrder([U1, 'not-a-uuid'])
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(update).not.toHaveBeenCalled()
  })

  it('returns a structured failure for a non-string entry, without writing', async () => {
    const result = await setExchangeOrder([U1, 42 as unknown as string])
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(update).not.toHaveBeenCalled()
  })

  it('returns a structured failure past the cap, without writing', async () => {
    const many = Array.from(
      { length: EXCHANGE_ORDER_CAP + 1 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`
    )
    const result = await setExchangeOrder(many)
    expect(result).toEqual({ ok: false, reason: 'too_many' })
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts exactly the cap', async () => {
    const many = Array.from(
      { length: EXCHANGE_ORDER_CAP },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`
    )
    expect(await setExchangeOrder(many)).toEqual({ ok: true })
  })

  it('returns a structured failure when the write errors', async () => {
    eq.mockResolvedValueOnce({ error: { message: 'boom' } })
    expect(await setExchangeOrder([U1])).toEqual({ ok: false, reason: 'write_failed' })
  })

  it('does not revalidate — the client already shows the new order', async () => {
    await setExchangeOrder([U1, U2])
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run actions/__tests__/session.test.ts`
Expected: FAIL — `No "setExchangeOrder" export is defined on the "@/actions/session" mock` / `setExchangeOrder is not a function`.

- [ ] **Step 3: Write the implementation**

Replace the whole of `actions/session.ts` with:

```ts
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { requireOrganizer } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'

export async function setActiveExchange(exchangeId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, exchangeId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  // Every organizer page + the shell derives from the active exchange.
  revalidatePath('/', 'layout')
}

// Upper bound on the stored order so a buggy or hostile client cannot grow the
// row without limit. Far above any realistic school's exchange count.
export const EXCHANGE_ORDER_CAP = 200

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SetExchangeOrderResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'too_many' | 'write_failed' }

/**
 * Persist the organizer's personal sidebar order.
 *
 * Display-only data: the ids are intersected against the exchanges RLS already
 * lets the viewer read (see lib/shell/exchange-order.ts), so ids that match
 * nothing are ignored at render time. RLS ("users update themselves") confines
 * the write to the caller's own row.
 *
 * Every outcome here is expected, so all failures are STRUCTURED returns —
 * production replaces thrown server-action messages with an opaque digest, so
 * a throw would be unreadable to the caller.
 */
export async function setExchangeOrder(ids: string[]): Promise<SetExchangeOrderResult> {
  const { user } = await requireOrganizer()

  if (!Array.isArray(ids)) return { ok: false, reason: 'invalid' }
  if (ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return { ok: false, reason: 'invalid' }
  }

  const deduped = [...new Set(ids)] // Set preserves first-occurrence order
  if (deduped.length > EXCHANGE_ORDER_CAP) return { ok: false, reason: 'too_many' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update({ exchange_order: deduped })
    .eq('id', user.id)
  if (error) return { ok: false, reason: 'write_failed' }

  // Deliberately NO revalidatePath: the sidebar already shows the new order
  // from local state, and busting the layout tree would make the whole shell
  // re-render mid-drag for no visible gain. The next navigation re-reads the
  // profile anyway.
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/session.test.ts`
Expected: PASS — 11 tests passed.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/exchange-reordering
git add actions/session.ts actions/__tests__/session.test.ts
git commit -m "feat(shell): setExchangeOrder server action with structured validation"
```

---

### Task 4: Interaction — dnd-kit grip handles in `ExchangeList`

Adds the two dnd-kit dependencies, the i18n keys, and rewrites `ExchangeList` as a sortable list. The grip handle — not the row button — carries the drag listeners. Collapsed mode renders the persisted order with no drag affordance at all.

**Files:**
- Modify: `package.json` (+ `pnpm-lock.yaml`, via `pnpm add`)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Modify: `components/shell/ExchangeList.tsx`
- Test: `components/shell/__tests__/ExchangeList.test.tsx`

**Interfaces:**
- Consumes: `reorderIds` from `@/lib/shell/exchange-order` (Task 2); `setExchangeOrder` from `@/actions/session` (Task 3); `ExchangeOption` (`{ id: string; name: string; year: number; archived: boolean }`) from `./OrganizerShell`.
- Produces: no new exports. `ExchangeList`'s props are unchanged — `{ exchanges, activeId, collapsed, onNewExchange }`. It now expects `exchanges` to arrive **already in display order** (Task 5 sorts it server-side).

- [ ] **Step 1: Install the dependencies**

Run:
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable
```
Expected: `dependencies: + @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0`. Both declare `react >=16.8.0`, so React 19 needs no override.

Do **not** add `@dnd-kit/modifiers` (the vertical lock is hand-written below) or `@dnd-kit/utilities` (the transform string is hand-written too).

- [ ] **Step 2: Add the i18n keys to all five catalogs**

In each file, add the keys inside `organizer.shell.exchangeGroup`, next to the existing `title` / `add` / `empty`.

`messages/en.json`:
```json
      "exchangeGroup": {
        "title": "My exchanges",
        "add": "+ Add",
        "empty": "No exchanges",
        "reorder": "Reorder {name}",
        "dnd": {
          "picked": "{name} picked up. Use the arrow keys to move it, Space to drop, Escape to cancel.",
          "moved": "{name} moved to position {position} of {total}.",
          "dropped": "{name} dropped at position {position} of {total}.",
          "cancelled": "Reordering of {name} cancelled."
        }
      },
```
(Keep whatever `title` / `add` / `empty` values the file already has — only the three new entries are additions.)

`messages/fr.json` — typographic apostrophes only:
```json
        "reorder": "Réordonner {name}",
        "dnd": {
          "picked": "{name} saisi. Utilisez les flèches pour déplacer, Espace pour déposer, Échap pour annuler.",
          "moved": "{name} déplacé en position {position} sur {total}.",
          "dropped": "{name} déposé en position {position} sur {total}.",
          "cancelled": "Déplacement de {name} annulé."
        }
```

`messages/es.json`:
```json
        "reorder": "Reordenar {name}",
        "dnd": {
          "picked": "{name} seleccionado. Usa las flechas para moverlo, Espacio para soltarlo, Escape para cancelar.",
          "moved": "{name} movido a la posición {position} de {total}.",
          "dropped": "{name} soltado en la posición {position} de {total}.",
          "cancelled": "Reordenación de {name} cancelada."
        }
```

`messages/it.json`:
```json
        "reorder": "Riordina {name}",
        "dnd": {
          "picked": "{name} selezionato. Usa le frecce per spostarlo, Spazio per rilasciarlo, Esc per annullare.",
          "moved": "{name} spostato in posizione {position} di {total}.",
          "dropped": "{name} rilasciato in posizione {position} di {total}.",
          "cancelled": "Riordino di {name} annullato."
        }
```

`messages/de.json`:
```json
        "reorder": "{name} neu anordnen",
        "dnd": {
          "picked": "{name} aufgenommen. Mit den Pfeiltasten verschieben, Leertaste zum Ablegen, Escape zum Abbrechen.",
          "moved": "{name} an Position {position} von {total} verschoben.",
          "dropped": "{name} an Position {position} von {total} abgelegt.",
          "cancelled": "Neuanordnung von {name} abgebrochen."
        }
```

- [ ] **Step 3: Run the catalog parity test**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS — every locale has the same key set as `fr` and references the same ICU arguments (`{name}` everywhere, plus `{position}` and `{total}` on `moved`/`dropped`).

- [ ] **Step 4: Check the French copy for ASCII apostrophes**

Run:
```bash
grep -nP "\w'\w" messages/fr.json
```
Expected: no output. An ASCII apostrophe between two letters is a French typography regression; use `’`.

- [ ] **Step 5: Write the failing component tests**

Replace the whole of `components/shell/__tests__/ExchangeList.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

let mockPathname = '/students'
const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))
const setActive = vi.fn().mockResolvedValue(undefined)
const setOrder = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/actions/session', () => ({
  setActiveExchange: (id: string) => setActive(id),
  setExchangeOrder: (ids: string[]) => setOrder(ids),
}))

// dnd-kit is browser physics — pointer capture, layout rects, autoscroll —
// none of which jsdom models, so a real keyboard/pointer drag here would be
// pure flake. Stub the two providers so the component renders its REAL markup
// (grips included) and capture onDragEnd to drive the drop path deterministically.
// The reorder math itself is pure and covered in lib/shell/__tests__/exchange-order.test.ts.
let dragEnd: ((event: unknown) => void) | undefined
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (e: unknown) => void }) => {
    dragEnd = onDragEnd
    return <>{children}</>
  },
  closestCenter: () => [],
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  useSensor: () => undefined,
  useSensors: () => [],
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: 'vertical',
  sortableKeyboardCoordinates: () => undefined,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

import { ExchangeList } from '@/components/shell/ExchangeList'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: true },
]

// Row buttons are the only buttons whose text contains an exchange name; grips
// are icon-only and the add pill reads "+ Ajouter". getAllByRole returns
// document order, so this is the rendered order of the list.
function rowOrder() {
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((text) => text.includes('2026'))
}

describe('ExchangeList', () => {
  beforeEach(() => {
    push.mockClear()
    setActive.mockClear()
    setOrder.mockClear()
    dragEnd = undefined
    mockPathname = '/students'
  })

  it('lists every exchange with the group header and the add pill', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Mes échanges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^France–Canada 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Espagne 2026/ })).toBeInTheDocument()
  })

  it('renders the Archivé pill for an archived row', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    const row = screen.getByRole('button', { name: /^Espagne 2026/ })
    expect(row).toHaveTextContent('Archivé')
  })

  it('clicking an inactive row switches and navigates to /dashboard', async () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('does not navigate when already on /dashboard', async () => {
    mockPathname = '/dashboard'
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    expect(push).not.toHaveBeenCalled()
  })

  it('clicking the active row is a no-op', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^France–Canada 2026/ }))
    expect(setActive).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('the add pill calls onNewExchange', () => {
    const onNewExchange = vi.fn()
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={onNewExchange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }))
    expect(onNewExchange).toHaveBeenCalled()
  })

  it('shows the empty state with zero exchanges', () => {
    renderWithIntl(
      <ExchangeList exchanges={[]} activeId={null} collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Aucun échange')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('collapsed: dots only, names survive as accessible titles', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed onNewExchange={() => {}} />,
    )
    expect(screen.queryByText('Mes échanges')).toBeNull()
    expect(screen.queryByText('France–Canada 2026')).toBeNull()
    expect(screen.getByRole('button', { name: 'France–Canada 2026' }))
      .toHaveAttribute('title', 'France–Canada 2026')
  })

  it('expanded: every row carries a grip handle named for its exchange', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Réordonner France–Canada 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réordonner Espagne 2026' })).toBeInTheDocument()
  })

  it('collapsed: no grip handles — reordering is expanded-only', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed onNewExchange={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /^Réordonner/ })).toBeNull()
  })

  it('dropping a row reorders the list and persists the complete id list', async () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(rowOrder()[0]).toContain('France–Canada 2026')

    dragEnd!({ active: { id: 'ex1' }, over: { id: 'ex2' } })

    await waitFor(() => expect(setOrder).toHaveBeenCalledWith(['ex2', 'ex1']))
    expect(rowOrder()[0]).toContain('Espagne 2026')
  })

  it('dropping a row on itself does not persist anything', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    dragEnd!({ active: { id: 'ex1' }, over: { id: 'ex1' } })
    expect(setOrder).not.toHaveBeenCalled()
  })

  it('a cancelled drag (no drop target) does not persist anything', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    dragEnd!({ active: { id: 'ex1' }, over: null })
    expect(setOrder).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm vitest run components/shell/__tests__/ExchangeList.test.tsx`
Expected: FAIL — the three new grip/drop tests fail (`Unable to find an accessible element with the name "Réordonner France–Canada 2026"`, and `dragEnd` is `undefined`). The eight pre-existing tests still pass.

- [ ] **Step 7: Write the implementation**

Replace the whole of `components/shell/ExchangeList.tsx` with:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVerticalIcon } from 'lucide-react'
import { setActiveExchange, setExchangeOrder } from '@/actions/session'
import { reorderIds } from '@/lib/shell/exchange-order'
import { exchangeDotColor } from '@/lib/shell/exchange-color'
import { cn } from '@/lib/utils'
import type { ExchangeOption } from './OrganizerShell'

// The clickable exchange row itself. Shared by both the collapsed rail and the
// sortable expanded list so the two can never drift apart.
function RowButton({
  ex,
  activeId,
  collapsed,
  onSelect,
}: {
  ex: ExchangeOption
  activeId: string | null
  collapsed: boolean
  onSelect: (id: string) => void
}) {
  const t = useTranslations('organizer')
  return (
    <button
      type="button"
      onClick={() => onSelect(ex.id)}
      title={collapsed ? ex.name : undefined}
      aria-label={collapsed ? ex.name : undefined}
      aria-current={ex.id === activeId ? 'true' : undefined}
      className={cn(
        'flex items-center rounded-[10px] text-[13px]',
        collapsed ? 'h-10 w-10 justify-center' : 'min-w-0 flex-1 gap-2.5 px-3 py-2 text-left',
        ex.id === activeId
          ? 'bg-subtle font-semibold text-foreground'
          : 'text-muted-foreground hover:bg-hoverrow hover:text-foreground',
      )}
    >
      <span
        aria-hidden
        className="h-[9px] w-[9px] flex-none rounded-full"
        style={{ background: exchangeDotColor(ex.id) }}
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{ex.name}</span>}
      {!collapsed && ex.archived && (
        <span className="flex-none rounded-pill bg-subtle px-2 py-px font-mono text-[10px] font-semibold text-muted-foreground">
          {t('shell.archivedBadge')}
        </span>
      )}
    </button>
  )
}

// One draggable row: the select button plus a sibling grip. The grip — NOT the
// row button — carries dnd-kit's listeners: the keyboard sensor lifts on Space,
// which is also how a <button> fires, so putting both on one element makes
// reordering and exchange-selection fight each other.
function SortableExchangeRow({
  ex,
  activeId,
  onSelect,
}: {
  ex: ExchangeOption
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const t = useTranslations('organizer')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ex.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        // Vertical axis only: the X component is dropped on purpose so a
        // dragged row can never drift out of the 250 px rail. One line here
        // instead of a third @dnd-kit package for one modifier.
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn('group flex items-center gap-0.5', isDragging && 'relative z-10 opacity-80')}
    >
      <RowButton ex={ex} activeId={activeId} collapsed={false} onSelect={onSelect} />
      <button
        type="button"
        aria-label={t('shell.exchangeGroup.reorder', { name: ex.name })}
        className="flex h-7 w-5 flex-none cursor-grab touch-none items-center justify-center rounded-[6px] text-tertiary opacity-0 transition-opacity hover:bg-hoverrow hover:text-muted-foreground focus-visible:opacity-100 group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon aria-hidden size={14} strokeWidth={1.75} />
      </button>
    </div>
  )
}

export function ExchangeList({
  exchanges,
  activeId,
  collapsed,
  onNewExchange,
}: {
  exchanges: ExchangeOption[]
  activeId: string | null
  collapsed: boolean
  onNewExchange: () => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const pathname = usePathname()

  // Local mirror of the server-supplied order so a dropped row stays put the
  // instant it lands; persistence is fire-and-forget. Resynced whenever the
  // server sends a different id list (new exchange, deletion, another device).
  const [order, setOrder] = useState<string[]>(() => exchanges.map((e) => e.id))
  const orderKey = exchanges.map((e) => e.id).join(',')
  useEffect(() => {
    setOrder(exchanges.map((e) => e.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey])

  const rows = useMemo(() => {
    const byId = new Map(exchanges.map((e) => [e.id, e]))
    const ordered = order
      .map((id) => byId.get(id))
      .filter((e): e is ExchangeOption => e !== undefined)
    // Anything the server sent that local state has not caught up with yet
    // still renders, at the top — same rule as the server-side sort.
    const seen = new Set(ordered.map((e) => e.id))
    return [...exchanges.filter((e) => !seen.has(e.id)), ...ordered]
  }, [exchanges, order])

  const sensors = useSensors(
    // 5 px of travel is what separates "I clicked this exchange" from "I am
    // dragging it" — below that the row still selects normally.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const announcements = useMemo<Announcements>(() => {
    const nameOf = (id: string | number) => exchanges.find((e) => e.id === String(id))?.name ?? ''
    const positionOf = (id: string | number) => order.indexOf(String(id)) + 1
    const total = order.length
    return {
      onDragStart: ({ active }) =>
        t('shell.exchangeGroup.dnd.picked', { name: nameOf(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('shell.exchangeGroup.dnd.moved', {
              name: nameOf(active.id),
              position: positionOf(over.id),
              total,
            })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t('shell.exchangeGroup.dnd.dropped', {
              name: nameOf(active.id),
              position: positionOf(over.id),
              total,
            })
          : undefined,
      onDragCancel: ({ active }) =>
        t('shell.exchangeGroup.dnd.cancelled', { name: nameOf(active.id) }),
    }
  }, [exchanges, order, t])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const next = reorderIds(order, String(active.id), String(over.id))
    if (next === order) return // no-op drop: same reference back
    setOrder(next)
    // Fire-and-forget: local state already shows the result, so the drag is
    // never blocked on a round trip and there is no spinner to render.
    void setExchangeOrder(next)
  }

  async function select(id: string) {
    if (id === activeId) return
    // setActiveExchange revalidates the whole tree; the action response already
    // re-renders the current page, so only navigate if we are not on it.
    await setActiveExchange(id)
    if (pathname !== '/dashboard') router.push('/dashboard')
  }

  return (
    <div className="border-t pt-3.5">
      <div
        className={cn(
          'flex items-center px-3',
          collapsed ? 'justify-center' : 'justify-between pl-6 pr-3',
        )}
      >
        {!collapsed && (
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-tertiary">
            {t('shell.exchangeGroup.title')}
          </span>
        )}
        <button
          type="button"
          onClick={onNewExchange}
          title={collapsed ? t('shell.exchangeGroup.add') : undefined}
          aria-label={t('shell.exchangeGroup.add')}
          className={cn(
            'rounded-pill text-[11.5px] font-semibold text-brand hover:bg-brand-soft',
            collapsed ? 'flex h-7 w-7 items-center justify-center text-base' : 'px-2.5 py-1',
          )}
        >
          {collapsed ? '+' : t('shell.exchangeGroup.add')}
        </button>
      </div>

      <div className={cn('mt-1.5 flex flex-col gap-0.5 px-3', collapsed && 'items-center')}>
        {rows.length === 0 && !collapsed && (
          <p className="px-3 py-2 text-[12.5px] text-tertiary">
            {t('shell.exchangeGroup.empty')}
          </p>
        )}
        {collapsed ? (
          // The 68 px rail shows unlabelled colour dots — dragging dots you
          // cannot read is not useful, so it renders the persisted order but
          // offers no drag affordance.
          rows.map((ex) => (
            <RowButton key={ex.id} ex={ex} activeId={activeId} collapsed onSelect={select} />
          ))
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements }}
          >
            <SortableContext items={rows.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {rows.map((ex) => (
                <SortableExchangeRow
                  key={ex.id}
                  ex={ex}
                  activeId={activeId}
                  onSelect={select}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm vitest run components/shell/__tests__/ExchangeList.test.tsx`
Expected: PASS — 13 tests passed.

- [ ] **Step 9: Run the sibling shell tests**

Run: `pnpm vitest run components/shell/`
Expected: PASS — `OrganizerShell.test.tsx`, `SidebarNav.test.tsx`, `RailPrefetch.test.tsx`, `NewExchangeModal.test.tsx`, `FeedbackModal.test.tsx`, `useSidebarCollapsed.test.tsx` and `ExchangeList.test.tsx` all green.

If a suite fails once and passes on re-run, that is a neighbouring worktree session mid-write — re-run the single file before debugging it.

- [ ] **Step 10: Commit**

```bash
git branch --show-current   # must print feature/exchange-reordering
git add package.json pnpm-lock.yaml messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json components/shell/ExchangeList.tsx components/shell/__tests__/ExchangeList.test.tsx
git commit -m "feat(shell): drag-and-drop exchange reordering with dnd-kit grip handles"
```

---

### Task 5: Wiring — sort the layout's exchange list, and the full gate

Feeds the stored order into the server render so the sidebar, the header title and the default active exchange all agree, then runs the complete verification gate.

**Files:**
- Modify: `app/(organizer)/layout.tsx:26-34` (the exchange query and mapping)
- Modify: `lib/exchange-session.ts:3-5` (the header comment)

**Interfaces:**
- Consumes: `sortExchanges` from `@/lib/shell/exchange-order` (Task 2); `Profile.exchange_order` from `@/lib/supabase/request` (Task 1).
- Produces: `OrganizerShell` receives `exchanges` already in display order; `ExchangeList` (Task 4) relies on that.

- [ ] **Step 1: Sort the exchanges in the organizer layout**

In `app/(organizer)/layout.tsx`, add the import next to the existing `resolveActiveExchange` import:

```ts
import { sortExchanges } from '@/lib/shell/exchange-order'
```

Then replace the `exchanges` mapping (currently lines 32-34):

```ts
  const exchanges: ExchangeOption[] = rows.map(e => ({
    id: e.id, name: e.name, year: e.year, archived: !!e.archived_at,
  }))
```

with:

```ts
  // created_at desc from the query, then the organizer's personal drag order on
  // top of it. Exchanges the organizer has never dragged stay at the front, so
  // a brand new one is not buried under a hand-ordered list.
  const exchanges: ExchangeOption[] = sortExchanges(
    rows.map(e => ({
      id: e.id, name: e.name, year: e.year, archived: !!e.archived_at,
    })),
    profile.exchange_order ?? [],
  )
```

Leave `ownedCount` alone — it counts `rows`, which is unaffected by display order.

- [ ] **Step 2: Correct the `resolveActiveExchange` contract comment**

In `lib/exchange-session.ts`, replace the header comment above `resolveActiveExchange`:

```ts
// `exchanges` must arrive in DISPLAY order — the organizer layout applies the
// personal drag order (lib/shell/exchange-order.ts) on top of created_at desc
// before calling this. An explicit cookie selection wins even if archived
// (dossiers stay consultable); the fallback picks the first NON-archived
// exchange in that display order, so the default now honours the organizer's
// own ordering rather than pure recency.
```

The function body is unchanged.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm test`
Expected: all files pass. `lib/__tests__/exchange-session.test.ts` is unaffected (comment-only change there).

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: `✔ No ESLint warnings or errors`.

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: `✓ Compiled successfully` and the route table printed, no type errors.

If the build fails on a phantom route, kill orphaned `next-server` workers (`pkill -f next-server`) and re-run.

- [ ] **Step 7: Run the RLS gate**

`supabase/migrations/` is touched, so this is required.

Run: `pnpm test:rls`
Expected: all files pass, including the two `exchange_order` cases added in Task 1.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feature/exchange-reordering
git add app/\(organizer\)/layout.tsx lib/exchange-session.ts
git commit -m "feat(shell): apply the personal exchange order in the organizer layout"
```

- [ ] **Step 9: Browser check (manual — report the result, do not skip silently)**

Start the dev server (`pnpm dev`, port pinned in `.wtport`), sign in as an organizer with at least three exchanges, and confirm:

1. Hovering a sidebar row fades in a grip on its right; the grip is reachable with Tab.
2. Dragging by the grip moves the row; releasing leaves it in place, and a hard reload keeps that order.
3. A short click on a row (no travel) still switches the active exchange — the 5 px constraint holds.
4. Keyboard: focus a grip, press Space, ArrowDown, Space — the row moves and the order persists across a reload.
5. Collapse the sidebar: the dots appear in the new order, with no grips.
6. Create a new exchange: it appears at the top of the list.

If dev needs staging-backed data, use the seeded staging organizer (`demo-organizer@example.com`) against a preview deployment.

- [ ] **Step 10: Hand off for merge**

Report the gate results and the browser-check outcome. Merging to `main` deploys to production and requires Bjorn's explicit confirmation — do not merge unprompted.

---

## Notes for the executor

- **Task 1 Step 4 writes to production.** Stop and confirm before running `apply_migration`.
- **Deviation from the spec's test table, recorded deliberately:** the spec lists "keyboard reorder invokes the action" as an `ExchangeList` case. jsdom returns zeroed `getBoundingClientRect`s, so dnd-kit's keyboard sensor and collision detection cannot produce a meaningful drop there — a real keyboard-drag test would be flake, not coverage. Instead the reorder math is fully unit-tested as a pure function (`reorderIds`, Task 2) and the component test drives `onDragEnd` directly to prove the wiring (state update + fire-and-forget persistence + the two no-op paths). Real keyboard dragging is verified in the browser check, Task 5 Step 9.
- **Two new production dependencies** land in the weekly `pnpm audit --prod` run (`.github/workflows/dependency-audit.yml`). No action needed now; triage per the CLAUDE.md cadence if either goes red.
