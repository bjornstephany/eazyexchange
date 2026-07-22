# Exchange key-info cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers author a list of titled "key information" cards per exchange from Settings → Programme, and let students read them from a new "Infos" tab on the student portal.

**Architecture:** New `exchange_info_cards` table (title + optional body + position), scoped by RLS to organizers of the exchange's school (full R/W) and enrolled students (read-only). Organizer authoring is a client component in the existing Settings → Programme section, backed by server actions in `actions/exchanges.ts`. Students read via a new server action + presentational component behind a new `/infos` route, with a tab row added to the student layout.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS), Tailwind, next-intl (organizer portal only), Vitest.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **Student portal is NOT internationalized** — the `student` message namespace is empty; DossierView/StudentTopBar use hardcoded French. All new student-facing strings are hardcoded French, no `useTranslations`.
- **Organizer portal IS internationalized** — new organizer strings go in all 5 locale files (`messages/{en,fr,es,it,de}.json`); `messages/__tests__/parity.test.ts` fails if any locale is missing a key.
- **Never throw for expected outcomes** (validation failures) — production redacts thrown Server Action errors to an opaque digest. Return structured results with a stable error **code**; the client maps the code to a translated string. Only throw for genuinely unexpected failures. Auth guards (`requireOrganizer` etc.) throw the load-bearing strings `'Unauthenticated'`/`'Unauthorized'` as usual.
- **RLS is the isolation layer** — no service-role/admin client. New table ships with `test:rls` matrix cases in this same change.
- Auth preambles use `requireOrganizer()` / `requireStudent()` from `lib/auth/require.ts`; exchange scope via the existing private `assertExchangeInScope` in `actions/exchanges.ts`; archived-write gate via `assertExchangeWritable` from `lib/exchange-guard.ts`.
- Never log student/parent PII. Info-card content is organizer-authored (not PII), but keep the no-PII habit in any error paths.
- Migration/type workflow follows CLAUDE.md → Database + Staging (staging push first, then prod via MCP `apply_migration`, then MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit`). Never hand-edit `types/supabase.ts`.
- Verifying Changes gate before any push: `pnpm lint`, `pnpm test`, `pnpm build`, plus `pnpm test:rls` (this change touches migrations + RLS).

## File Structure

- **Create** `supabase/migrations/<ts>_exchange_info_cards.sql` — table + FK index + RLS policies.
- **Create** `lib/exchange/info-card.ts` — pure `validateInfoCard` + length constants.
- **Create** `lib/exchange/__tests__/info-card.test.ts` — unit tests for validation.
- **Create** `lib/student/linkify.tsx` — pure `segmentText` + `<Linkified>` component.
- **Create** `lib/student/__tests__/linkify.test.ts` — unit tests for segmentation.
- **Modify** `actions/exchanges.ts` — add `InfoCard` type + `getInfoCards`/`addInfoCard`/`updateInfoCard`/`deleteInfoCard`.
- **Create** `actions/__tests__/exchange-info-cards.test.ts` — action auth + validation tests.
- **Create** `actions/student-info.ts` — `getStudentInfoCards` (student trust model).
- **Create** `components/settings/InfoCardsCard.tsx` — organizer editor (client).
- **Modify** `components/settings/SettingsView.tsx` — render `InfoCardsCard` in the `prog` section; new `infoCards` prop.
- **Modify** `app/(organizer)/settings/page.tsx` — load info cards for the active exchange.
- **Create** `components/student/StudentTabs.tsx` — student tab row (client, `usePathname`).
- **Modify** `app/(student)/layout.tsx` — render `StudentTabs` under the top bar.
- **Create** `components/student/InfoCardsView.tsx` — presentational card list (hardcoded French).
- **Create** `app/(student)/infos/page.tsx` — server page.
- **Modify** `messages/{en,fr,es,it,de}.json` — organizer `settings.info.*` keys.
- **Modify** `tests/rls/seed.ts` + `tests/rls/matrix.test.ts` — fixture card + RLS cases.

---

### Task 1: Migration — `exchange_info_cards` table + RLS

**Files:**
- Create: `supabase/migrations/<ts>_exchange_info_cards.sql`
- Modify: `tests/rls/seed.ts:4-15` (Fixtures type), `tests/rls/seed.ts` (seed insert + cleanup), `tests/rls/matrix.test.ts`
- Modify: `types/supabase.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: table `exchange_info_cards(id uuid, exchange_id uuid, title text, body text, position int, created_at timestamptz, updated_at timestamptz)`; `Tables<'exchange_info_cards'>` in `types/db.ts` after regen. Fixture key `fx.infoCardA: string`.

- [ ] **Step 1: Add the failing RLS fixture + matrix cases**

In `tests/rls/seed.ts`, add `infoCardA: string` to the `Fixtures` type (near `feedbackA`), initialise it in the `fx` object (`infoCardA: id()`), and seed a row right after the feedback insert (≈ line 106):

```ts
await sql`insert into exchange_info_cards (id, exchange_id, title, body, position)
  values (${fx.infoCardA}, ${fx.exchangeA}, ${'Point de rendez-vous'}, ${'Gare centrale, quai 3.'}, 0)`
```

No cleanup change needed — the `delete from exchanges where id in (...)` cascade removes it (FK `on delete cascade`).

In `tests/rls/matrix.test.ts`, inside the `cross-tenant deny as %s` block (after the `exchanges: cannot update exchange A` case, ≈ line 70), add:

```ts
  it('exchange_info_cards: cannot read exchange A info cards', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from exchange_info_cards where exchange_id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchange_info_cards: cannot insert an info card into exchange A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into exchange_info_cards (exchange_id, title, body, position)
         values (${fx.exchangeA}, 'pwned', '', 9)`))
  })
```

In the `own-school allow` describe, add:

```ts
  it('organizer A manages their exchange info cards (read/insert/update/delete)', async () => {
    const readCount = await runAs(sql, fx.orgA, (tx) =>
      tx`select id from exchange_info_cards where id = ${fx.infoCardA}`)
    expect(readCount).toHaveLength(1)
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchange_info_cards set title = 'Point de RDV' where id = ${fx.infoCardA}`)).toBe(1)
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into exchange_info_cards (exchange_id, title, body, position)
         values (${fx.exchangeA}, 'Bagages', 'Un sac max.', 1)`)).toBe(1)
  })

  it('enrolled student A reads their exchange info cards but cannot write', async () => {
    expect(await runAs(sql, fx.studentA, (tx) =>
      tx`select id from exchange_info_cards where id = ${fx.infoCardA}`)).toHaveLength(1)
    expectBlocked(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`update exchange_info_cards set title = 'pwned' where id = ${fx.infoCardA}`))
    expectBlocked(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`insert into exchange_info_cards (exchange_id, title, body, position)
         values (${fx.exchangeA}, 'forged', '', 5)`))
  })
```

- [ ] **Step 2: Run RLS tests to verify they fail**

Run: `pnpm test:rls`
Expected: FAIL — `relation "exchange_info_cards" does not exist` (table not created yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_exchange_info_cards.sql` (use a real UTC timestamp for `<ts>`):

```sql
-- Key-information cards per exchange. Organizers author them (Settings →
-- Programme); enrolled students read them (student portal « Infos » tab).
create table exchange_info_cards (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK index (matches the repo's unindexed-FK convention).
create index exchange_info_cards_exchange_id_idx on exchange_info_cards (exchange_id);

alter table exchange_info_cards enable row level security;

-- Organizers whose school is either side of the exchange: full R/W.
-- Non-recursive: references exchanges + the stable my_role()/my_school_id()
-- helpers only (no self-reference on exchange_info_cards).
create policy "organizers manage exchange info cards" on exchange_info_cards for all
  using (
    my_role() = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = exchange_info_cards.exchange_id
        and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id())
    )
  )
  with check (
    my_role() = 'organizer' and exists (
      select 1 from exchanges e
      where e.id = exchange_info_cards.exchange_id
        and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id())
    )
  );

-- Enrolled students: read only. Mirrors « students read enrolled exchanges ».
create policy "students read enrolled exchange info cards" on exchange_info_cards for select
  using (
    exists (
      select 1 from exchange_enrollments en
      where en.exchange_id = exchange_info_cards.exchange_id
        and en.user_id = auth.uid()
    )
  );
```

- [ ] **Step 4: Apply the migration for local RLS testing**

Apply the migration to whatever database `pnpm test:rls` targets (local Supabase stack or `RLS_TEST_DB_URL`). For the local stack: `supabase db reset` (re-applies every migration including this one). Confirm the table exists, then run:

Run: `pnpm test:rls`
Expected: PASS — the two deny cases, the organizer-manage case, and the enrolled-student read/deny-write case all green.

- [ ] **Step 5: Apply to staging + prod and regenerate types**

Per CLAUDE.md → Staging then Database:
1. Staging first: `set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`.
2. Prod via Supabase MCP `apply_migration` (`name` = `exchange_info_cards`).
3. MCP `list_migrations`: if the stamped version differs from the filename, `git mv` the local file to the stamped version.
4. MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim.

Run: `npx tsc --noEmit`
Expected: PASS — `Tables<'exchange_info_cards'>` now resolves; no drift errors in `types/db.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations types/supabase.ts tests/rls/seed.ts tests/rls/matrix.test.ts
git commit -m "feat(exchanges): exchange_info_cards table + RLS + matrix cases"
```

---

### Task 2: Pure info-card validation helper

**Files:**
- Create: `lib/exchange/info-card.ts`
- Test: `lib/exchange/__tests__/info-card.test.ts`

**Interfaces:**
- Produces:
  - `INFO_TITLE_MAX = 120`, `INFO_BODY_MAX = 2000`
  - `type InfoCardInput = { title: string; body: string }`
  - `type InfoCardError = 'titleRequired' | 'titleTooLong' | 'bodyTooLong'`
  - `validateInfoCard(input: { title: string; body: string }): { ok: true; value: InfoCardInput } | { ok: false; error: InfoCardError }` — trims title and body; empty-after-trim title → `titleRequired`; over-length → the matching code.

- [ ] **Step 1: Write the failing test**

```ts
// lib/exchange/__tests__/info-card.test.ts
import { describe, it, expect } from 'vitest'
import { validateInfoCard, INFO_TITLE_MAX, INFO_BODY_MAX } from '../info-card'

describe('validateInfoCard', () => {
  it('accepts a title with optional body and trims both', () => {
    const r = validateInfoCard({ title: '  Point de RDV  ', body: '  Gare  ' })
    expect(r).toEqual({ ok: true, value: { title: 'Point de RDV', body: 'Gare' } })
  })

  it('accepts an empty body', () => {
    const r = validateInfoCard({ title: 'Titre', body: '' })
    expect(r.ok).toBe(true)
  })

  it('rejects a blank title', () => {
    expect(validateInfoCard({ title: '   ', body: 'x' })).toEqual({ ok: false, error: 'titleRequired' })
  })

  it('rejects an over-long title', () => {
    expect(validateInfoCard({ title: 'a'.repeat(INFO_TITLE_MAX + 1), body: '' }))
      .toEqual({ ok: false, error: 'titleTooLong' })
  })

  it('rejects an over-long body', () => {
    expect(validateInfoCard({ title: 'Titre', body: 'b'.repeat(INFO_BODY_MAX + 1) }))
      .toEqual({ ok: false, error: 'bodyTooLong' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/exchange/__tests__/info-card.test.ts`
Expected: FAIL — cannot resolve `../info-card`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/exchange/info-card.ts
export const INFO_TITLE_MAX = 120
export const INFO_BODY_MAX = 2000

export type InfoCardInput = { title: string; body: string }
export type InfoCardError = 'titleRequired' | 'titleTooLong' | 'bodyTooLong'

export function validateInfoCard(
  input: { title: string; body: string },
): { ok: true; value: InfoCardInput } | { ok: false; error: InfoCardError } {
  const title = input.title.trim()
  const body = input.body.trim()
  if (title.length === 0) return { ok: false, error: 'titleRequired' }
  if (title.length > INFO_TITLE_MAX) return { ok: false, error: 'titleTooLong' }
  if (body.length > INFO_BODY_MAX) return { ok: false, error: 'bodyTooLong' }
  return { ok: true, value: { title, body } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/exchange/__tests__/info-card.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/exchange/info-card.ts lib/exchange/__tests__/info-card.test.ts
git commit -m "feat(exchanges): validateInfoCard pure helper"
```

---

### Task 3: Linkify helper + component

**Files:**
- Create: `lib/student/linkify.tsx`
- Test: `lib/student/__tests__/linkify.test.ts`

**Interfaces:**
- Produces:
  - `type Segment = { type: 'text'; value: string } | { type: 'url'; value: string }`
  - `segmentText(text: string): Segment[]` — splits on http(s) URLs; preserves surrounding text verbatim (including newlines).
  - `Linkified({ text }: { text: string }): JSX.Element` — renders segments; URLs as `<a href target="_blank" rel="noopener noreferrer">`; text via React (auto-escaped), with `whitespace-pre-wrap` on the wrapper preserving newlines.

- [ ] **Step 1: Write the failing test**

```ts
// lib/student/__tests__/linkify.test.ts
import { describe, it, expect } from 'vitest'
import { segmentText } from '../linkify'

describe('segmentText', () => {
  it('returns a single text segment when there is no URL', () => {
    expect(segmentText('bonjour')).toEqual([{ type: 'text', value: 'bonjour' }])
  })

  it('splits a URL out of surrounding text', () => {
    expect(segmentText('carte https://maps.example/x ici')).toEqual([
      { type: 'text', value: 'carte ' },
      { type: 'url', value: 'https://maps.example/x' },
      { type: 'text', value: ' ici' },
    ])
  })

  it('handles a URL at the very start', () => {
    expect(segmentText('https://a.b/c suite')).toEqual([
      { type: 'url', value: 'https://a.b/c' },
      { type: 'text', value: ' suite' },
    ])
  })

  it('does not swallow a trailing period into the URL', () => {
    expect(segmentText('voir https://a.b/c.')).toEqual([
      { type: 'text', value: 'voir ' },
      { type: 'url', value: 'https://a.b/c' },
      { type: 'text', value: '.' },
    ])
  })

  it('preserves newlines in text segments', () => {
    expect(segmentText('ligne1\nligne2')).toEqual([{ type: 'text', value: 'ligne1\nligne2' }])
  })

  it('returns an empty array for an empty string', () => {
    expect(segmentText('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/student/__tests__/linkify.test.ts`
Expected: FAIL — cannot resolve `../linkify`.

- [ ] **Step 3: Write the implementation**

```tsx
// lib/student/linkify.tsx
import React from 'react'

export type Segment = { type: 'text'; value: string } | { type: 'url'; value: string }

// Match http(s) URLs. Stop before trailing punctuation that is almost never
// part of the link (., comma, ), etc.) so "…/c." keeps the period as text.
const URL_RE = /https?:\/\/[^\s]+[^\s.,;:!?)\]}'"]/g

export function segmentText(text: string): Segment[] {
  if (text.length === 0) return []
  const segments: Segment[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) })
    segments.push({ type: 'url', value: m[0] })
    last = start + m[0].length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}

export function Linkified({ text }: { text: string }): JSX.Element {
  return (
    <span className="whitespace-pre-wrap break-words">
      {segmentText(text).map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline underline-offset-2 hover:text-brand-hover"
          >
            {seg.value}
          </a>
        ) : (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ),
      )}
    </span>
  )
}
```

> Note: a single-URL match like `https://a.b/c` where the last char is alphanumeric is kept whole because `[^\s.,;:!?)\]}'"]` matches that final `c`. The regex requires at least two chars after the scheme; single-letter-path edge cases are irrelevant for real links.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/student/__tests__/linkify.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/student/linkify.tsx lib/student/__tests__/linkify.test.ts
git commit -m "feat(student): linkify helper + Linkified component"
```

---

### Task 4: Organizer server actions

**Files:**
- Modify: `actions/exchanges.ts` (append after `updateReminderSettings`, ≈ line 256)
- Test: `actions/__tests__/exchange-info-cards.test.ts`

**Interfaces:**
- Consumes: `assertExchangeInScope` (private, same file), `assertExchangeWritable` (`@/lib/exchange-guard`), `requireOrganizer` (`@/lib/auth/require`), `validateInfoCard`/`InfoCardError` (`@/lib/exchange/info-card`), `Tables` (`@/types/db`).
- Produces:
  - `type InfoCard = { id: string; title: string; body: string; position: number }`
  - `getInfoCards(exchangeId: string): Promise<InfoCard[]>` — ordered by `position` then `created_at`.
  - `type InfoCardResult = { ok: true; card: InfoCard } | { ok: false; error: InfoCardError }`
  - `addInfoCard(exchangeId: string, input: { title: string; body: string }): Promise<InfoCardResult>`
  - `updateInfoCard(cardId: string, input: { title: string; body: string }): Promise<InfoCardResult>`
  - `deleteInfoCard(cardId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// actions/__tests__/exchange-info-cards.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { userId: string; role: 'organizer' | 'student'; profileSchool: string; exchangeSchoolA: string }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'card-1', title: 'T', body: '', position: 0 }, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'card-1', title: 'T', body: '', position: 0 }, error: null }) }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        maybeSingle: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          if (table === 'exchanges') return { data: { school_a_id: scenario.exchangeSchoolA, school_b_id: null, archived_at: null }, error: null }
          if (table === 'exchange_info_cards') return { data: { exchange_id: 'ex-1' }, error: null }
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

import { addInfoCard } from '../exchanges'

describe('exchange info-card actions', () => {
  beforeEach(() => {
    scenario = { userId: 'u1', role: 'organizer', profileSchool: 'school-1', exchangeSchoolA: 'school-1' }
  })

  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(addInfoCard('ex-1', { title: 'T', body: '' })).rejects.toThrow('Unauthorized')
  })

  it('rejects an organizer from another school', async () => {
    scenario.exchangeSchoolA = 'school-2'
    await expect(addInfoCard('ex-1', { title: 'T', body: '' })).rejects.toThrow('Unauthorized')
  })

  it('returns a validation error code for a blank title (no throw)', async () => {
    await expect(addInfoCard('ex-1', { title: '   ', body: '' }))
      .resolves.toEqual({ ok: false, error: 'titleRequired' })
  })

  it('creates the card for the owning organizer', async () => {
    await expect(addInfoCard('ex-1', { title: 'T', body: '' }))
      .resolves.toEqual({ ok: true, card: { id: 'card-1', title: 'T', body: '', position: 0 } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- actions/__tests__/exchange-info-cards.test.ts`
Expected: FAIL — `addInfoCard` is not exported.

- [ ] **Step 3: Write the implementation**

Add the import near the top of `actions/exchanges.ts` (with the other `@/lib` imports):

```ts
import { validateInfoCard, type InfoCardError } from '@/lib/exchange/info-card'
```

Append after `updateReminderSettings`:

```ts
export type InfoCard = { id: string; title: string; body: string; position: number }
export type InfoCardResult = { ok: true; card: InfoCard } | { ok: false; error: InfoCardError }

export async function getInfoCards(exchangeId: string): Promise<InfoCard[]> {
  const supabase = await createClient()
  await requireOrganizer()
  await assertExchangeInScope(supabase, exchangeId)

  const { data, error } = await supabase
    .from('exchange_info_cards')
    .select('id, title, body, position')
    .eq('exchange_id', exchangeId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as InfoCard[]
}

export async function addInfoCard(
  exchangeId: string, input: { title: string; body: string },
): Promise<InfoCardResult> {
  const supabase = await createClient()
  await requireOrganizer()
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
    .select('id, title, body, position')
    .single()
  if (error) throw error
  revalidatePath('/settings')
  return { ok: true, card: data as InfoCard }
}

export async function updateInfoCard(
  cardId: string, input: { title: string; body: string },
): Promise<InfoCardResult> {
  const supabase = await createClient()
  await requireOrganizer()

  // Resolve the card's exchange, then scope + writable-guard it.
  const { data: existing } = await supabase
    .from('exchange_info_cards').select('exchange_id').eq('id', cardId).maybeSingle()
  if (!existing) throw new Error('Info card not found')
  await assertExchangeInScope(supabase, existing.exchange_id as string)
  await assertExchangeWritable(supabase, existing.exchange_id as string)

  const validated = validateInfoCard(input)
  if (!validated.ok) return validated

  const { data, error } = await supabase
    .from('exchange_info_cards')
    .update({ title: validated.value.title, body: validated.value.body, updated_at: new Date().toISOString() })
    .eq('id', cardId)
    .select('id, title, body, position')
    .single()
  if (error) throw error
  revalidatePath('/settings')
  return { ok: true, card: data as InfoCard }
}

export async function deleteInfoCard(cardId: string): Promise<void> {
  const supabase = await createClient()
  await requireOrganizer()

  const { data: existing } = await supabase
    .from('exchange_info_cards').select('exchange_id').eq('id', cardId).maybeSingle()
  if (!existing) throw new Error('Info card not found')
  await assertExchangeInScope(supabase, existing.exchange_id as string)
  await assertExchangeWritable(supabase, existing.exchange_id as string)

  const { error } = await supabase.from('exchange_info_cards').delete().eq('id', cardId)
  if (error) throw error
  revalidatePath('/settings')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- actions/__tests__/exchange-info-cards.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add actions/exchanges.ts actions/__tests__/exchange-info-cards.test.ts
git commit -m "feat(exchanges): info-card CRUD server actions"
```

---

### Task 5: Organizer editor UI + i18n wiring

**Files:**
- Create: `components/settings/InfoCardsCard.tsx`
- Modify: `components/settings/SettingsView.tsx:14-22` (props), `:67-77` (prog section)
- Modify: `app/(organizer)/settings/page.tsx:31-52`
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`

**Interfaces:**
- Consumes: `getInfoCards`, `addInfoCard`, `updateInfoCard`, `deleteInfoCard`, `type InfoCard` (`@/actions/exchanges`); `INFO_TITLE_MAX`, `INFO_BODY_MAX` (`@/lib/exchange/info-card`).
- Produces: `<InfoCardsCard exchangeId initialCards readOnly />`; `SettingsProps.infoCards: InfoCard[]`.

- [ ] **Step 1: Add organizer i18n keys to all 5 locales**

In each `messages/<locale>.json`, add an `info` object under `organizer.settings` (sibling of `program` / `nav`). Use these exact values:

`messages/fr.json`:
```json
"info": {
  "heading": "Infos pratiques",
  "description": "Ajoutez les informations clés du programme. Les élèves les voient dans l’onglet « Infos » de leur portail.",
  "addButton": "Ajouter une info",
  "titlePlaceholder": "Titre (ex. Point de rendez-vous)",
  "bodyPlaceholder": "Détails visibles par les élèves…",
  "saveButton": "Enregistrer",
  "deleteButton": "Supprimer",
  "empty": "Aucune info pour l’instant.",
  "readOnlyNotice": "Programme archivé — lecture seule.",
  "errors": {
    "titleRequired": "Le titre est obligatoire.",
    "titleTooLong": "Titre trop long (120 caractères max).",
    "bodyTooLong": "Détails trop longs (2000 caractères max)."
  }
}
```

`messages/en.json`:
```json
"info": {
  "heading": "Key information",
  "description": "Add the program’s key information. Students see it in the “Infos” tab of their portal.",
  "addButton": "Add information",
  "titlePlaceholder": "Title (e.g. Meeting point)",
  "bodyPlaceholder": "Details visible to students…",
  "saveButton": "Save",
  "deleteButton": "Delete",
  "empty": "No information yet.",
  "readOnlyNotice": "Program archived — read only.",
  "errors": {
    "titleRequired": "Title is required.",
    "titleTooLong": "Title too long (120 characters max).",
    "bodyTooLong": "Details too long (2000 characters max)."
  }
}
```

`messages/es.json`:
```json
"info": {
  "heading": "Información clave",
  "description": "Añade la información clave del programa. Los estudiantes la ven en la pestaña «Infos» de su portal.",
  "addButton": "Añadir información",
  "titlePlaceholder": "Título (p. ej. Punto de encuentro)",
  "bodyPlaceholder": "Detalles visibles para los estudiantes…",
  "saveButton": "Guardar",
  "deleteButton": "Eliminar",
  "empty": "Aún no hay información.",
  "readOnlyNotice": "Programa archivado — solo lectura.",
  "errors": {
    "titleRequired": "El título es obligatorio.",
    "titleTooLong": "Título demasiado largo (120 caracteres máx.).",
    "bodyTooLong": "Detalles demasiado largos (2000 caracteres máx.)."
  }
}
```

`messages/it.json`:
```json
"info": {
  "heading": "Informazioni utili",
  "description": "Aggiungi le informazioni chiave del programma. Gli studenti le vedono nella scheda «Infos» del loro portale.",
  "addButton": "Aggiungi informazione",
  "titlePlaceholder": "Titolo (es. Punto d’incontro)",
  "bodyPlaceholder": "Dettagli visibili agli studenti…",
  "saveButton": "Salva",
  "deleteButton": "Elimina",
  "empty": "Nessuna informazione per ora.",
  "readOnlyNotice": "Programma archiviato — sola lettura.",
  "errors": {
    "titleRequired": "Il titolo è obbligatorio.",
    "titleTooLong": "Titolo troppo lungo (max 120 caratteri).",
    "bodyTooLong": "Dettagli troppo lunghi (max 2000 caratteri)."
  }
}
```

`messages/de.json`:
```json
"info": {
  "heading": "Wichtige Infos",
  "description": "Fügen Sie die wichtigsten Infos zum Programm hinzu. Schüler sehen sie im Tab „Infos“ ihres Portals.",
  "addButton": "Info hinzufügen",
  "titlePlaceholder": "Titel (z. B. Treffpunkt)",
  "bodyPlaceholder": "Für Schüler sichtbare Details…",
  "saveButton": "Speichern",
  "deleteButton": "Löschen",
  "empty": "Noch keine Infos.",
  "readOnlyNotice": "Programm archiviert — schreibgeschützt.",
  "errors": {
    "titleRequired": "Der Titel ist erforderlich.",
    "titleTooLong": "Titel zu lang (max. 120 Zeichen).",
    "bodyTooLong": "Details zu lang (max. 2000 Zeichen)."
  }
}
```

Run: `pnpm test -- messages/__tests__/parity.test.ts`
Expected: PASS — all locales carry the same keys.

- [ ] **Step 2: Write the editor component**

```tsx
// components/settings/InfoCardsCard.tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { addInfoCard, updateInfoCard, deleteInfoCard, type InfoCard } from '@/actions/exchanges'
import { INFO_TITLE_MAX, INFO_BODY_MAX, type InfoCardError } from '@/lib/exchange/info-card'

export function InfoCardsCard({ exchangeId, initialCards, readOnly }: {
  exchangeId: string
  initialCards: InfoCard[]
  readOnly: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [cards, setCards] = useState<InfoCard[]>(initialCards)
  const [draft, setDraft] = useState({ title: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errText = (code: InfoCardError) => t(`settings.info.errors.${code}`)

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

  async function onAdd() {
    const ok = await run(async () => {
      const r = await addInfoCard(exchangeId, draft)
      if (r.ok) setCards(prev => [...prev, r.card])
      return r
    })
    if (ok) setDraft({ title: '', body: '' })
  }

  async function onSave(card: InfoCard, next: { title: string; body: string }) {
    await run(async () => {
      const r = await updateInfoCard(card.id, next)
      if (r.ok) setCards(prev => prev.map(x => (x.id === card.id ? r.card : x)))
      return r
    })
  }

  async function onDelete(card: InfoCard) {
    await run(async () => {
      await deleteInfoCard(card.id)
      setCards(prev => prev.filter(x => x.id !== card.id))
    })
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.info.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('settings.info.description')}</p>

      <div className="flex flex-col gap-3">
        {cards.length === 0 && <p className="text-[12.5px] text-muted-foreground">{t('settings.info.empty')}</p>}
        {cards.map(card => (
          <EditableRow key={card.id} card={card} readOnly={readOnly || busy}
            t={t} onSave={onSave} onDelete={onDelete} />
        ))}
      </div>

      {!readOnly && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-subtle px-[18px] py-4">
          <input
            value={draft.title} maxLength={INFO_TITLE_MAX} disabled={busy}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder={t('settings.info.titlePlaceholder')}
            className="rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <textarea
            value={draft.body} maxLength={INFO_BODY_MAX} rows={2} disabled={busy}
            onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
            placeholder={t('settings.info.bodyPlaceholder')}
            className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <button
            type="button" disabled={busy || draft.title.trim().length === 0} onClick={onAdd}
            className="self-start rounded-[9px] bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('settings.info.addButton')}
          </button>
        </div>
      )}

      {readOnly && <p className="mt-3 text-[12.5px] text-muted-foreground">{t('settings.info.readOnlyNotice')}</p>}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}

function EditableRow({ card, readOnly, t, onSave, onDelete }: {
  card: InfoCard
  readOnly: boolean
  t: ReturnType<typeof useTranslations>
  onSave: (card: InfoCard, next: { title: string; body: string }) => Promise<void>
  onDelete: (card: InfoCard) => Promise<void>
}) {
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const dirty = title !== card.title || body !== card.body

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-subtle px-[18px] py-4">
      <input
        value={title} maxLength={INFO_TITLE_MAX} disabled={readOnly}
        onChange={e => setTitle(e.target.value)}
        className="rounded-lg border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-brand disabled:opacity-70"
      />
      <textarea
        value={body} maxLength={INFO_BODY_MAX} rows={2} disabled={readOnly}
        onChange={e => setBody(e.target.value)}
        className="resize-y rounded-lg border px-3 py-2 text-[13.5px] outline-none focus:border-brand disabled:opacity-70"
      />
      {!readOnly && (
        <div className="flex gap-2">
          <button
            type="button" disabled={!dirty} onClick={() => onSave(card, { title, body })}
            className="rounded-[9px] border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow disabled:opacity-50"
          >
            {t('settings.info.saveButton')}
          </button>
          <button
            type="button" onClick={() => onDelete(card)}
            className="rounded-[9px] border border-danger bg-card px-3 py-1.5 text-[12.5px] font-semibold text-danger-text hover:bg-danger"
          >
            {t('settings.info.deleteButton')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire it into SettingsView**

In `components/settings/SettingsView.tsx`: add the import, extend props, render the card in the `prog` section.

```tsx
import { InfoCardsCard } from './InfoCardsCard'
import type { TeamMember, PendingInvite, BillingOverview, ProgramInfo } from '@/actions/settings'
import type { InfoCard } from '@/actions/exchanges'
```

Add to `SettingsProps`:
```tsx
  infoCards: InfoCard[]
```

Replace the `prog` block (currently lines 67-77) with:
```tsx
          {section === 'prog' && props.program && (
            <>
              <ProgramCard program={props.program} isOwner={props.isOwner} />
              <InfoCardsCard
                exchangeId={props.program.id}
                initialCards={props.infoCards}
                readOnly={props.program.archived}
              />
              <ReminderSettingsCard
                exchangeId={props.program.id}
                initialEnabled={props.program.remindersEnabled}
                initialCadence={props.program.reminderCadence}
                readOnly={props.program.archived}
              />
            </>
          )}
```

- [ ] **Step 4: Load the cards in the settings page**

In `app/(organizer)/settings/page.tsx`: import `getInfoCards`, fetch when there's an active exchange, pass to `SettingsView`.

```tsx
import { getInfoCards } from '@/actions/exchanges'
```

After `if (active) program = await getProgramInfo(active.id)`:
```tsx
  const infoCards = active ? await getInfoCards(active.id) : []
```

Add `infoCards={infoCards}` to the `<SettingsView .../>` props.

- [ ] **Step 5: Verify build + full unit suite**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: PASS — no type errors; parity + all unit tests green.

- [ ] **Step 6: Commit**

```bash
git add components/settings/InfoCardsCard.tsx components/settings/SettingsView.tsx app/\(organizer\)/settings/page.tsx messages
git commit -m "feat(settings): key-info editor in Programme section (5 locales)"
```

---

### Task 6: Student read action

**Files:**
- Create: `actions/student-info.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `requireUser` (`@/lib/auth/require`).
- Produces:
  - `type StudentInfoCard = { id: string; title: string; body: string; exchangeName: string }`
  - `getStudentInfoCards(): Promise<StudentInfoCard[]>` — the cards for every exchange the student is enrolled in (RLS enforces enrollment), ordered by exchange name then position.

- [ ] **Step 1: Write the implementation**

```ts
// actions/student-info.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require'

export type StudentInfoCard = { id: string; title: string; body: string; exchangeName: string }

export async function getStudentInfoCards(): Promise<StudentInfoCard[]> {
  const supabase = await createClient()
  await requireUser()

  // RLS restricts SELECT to cards of exchanges the student is enrolled in.
  // The inner join pulls the exchange name for grouping in the view.
  const { data, error } = await supabase
    .from('exchange_info_cards')
    .select('id, title, body, position, exchanges!inner(name)')
    .order('position', { ascending: true })
    .returns<{ id: string; title: string; body: string; position: number; exchanges: { name: string } }[]>()
  if (error) throw error

  return (data ?? [])
    .map(r => ({ id: r.id, title: r.title, body: r.body, exchangeName: r.exchanges.name }))
    .sort((a, b) => a.exchangeName.localeCompare(b.exchangeName))
}
```

> No unit test here: it is a thin RLS-scoped read with no branching logic (RLS coverage is Task 1; the grouping logic lives in the view and is trivial). Type-checked by `pnpm build`.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add actions/student-info.ts
git commit -m "feat(student): getStudentInfoCards read action"
```

---

### Task 7: Student "Infos" tab + view

**Files:**
- Create: `components/student/StudentTabs.tsx`
- Modify: `app/(student)/layout.tsx:15-20`
- Create: `components/student/InfoCardsView.tsx`
- Create: `app/(student)/infos/page.tsx`

**Interfaces:**
- Consumes: `getStudentInfoCards`, `type StudentInfoCard` (`@/actions/student-info`); `Linkified` (`@/lib/student/linkify`).
- Produces: `/infos` route; tab row on every student page.

- [ ] **Step 1: Write the tab row (hardcoded French)**

```tsx
// components/student/StudentTabs.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/my-forms', label: 'Mon dossier' },
  { href: '/infos', label: 'Infos' },
]

export function StudentTabs() {
  const pathname = usePathname()
  return (
    <nav className="sticky top-[66px] z-10 flex gap-1 border-b bg-card px-7">
      {TABS.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-3 text-[13.5px] font-semibold ${
              active ? 'border-brand text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Render the tabs in the student layout**

In `app/(student)/layout.tsx`, import and place `StudentTabs` between the top bar and `<main>`:

```tsx
import { StudentTabs } from '@/components/student/StudentTabs'
```

```tsx
  return (
    <div className="min-h-screen bg-background">
      <StudentTopBar initials={ctx.initials} exchangeLabel={ctx.exchangeLabel} />
      <StudentTabs />
      <main className="mx-auto max-w-[920px] px-7 pb-[70px] pt-[34px]">{children}</main>
    </div>
  )
```

- [ ] **Step 3: Write the presentational view (hardcoded French)**

```tsx
// components/student/InfoCardsView.tsx
import { Linkified } from '@/lib/student/linkify'
import type { StudentInfoCard } from '@/actions/student-info'

export function InfoCardsView({ cards }: { cards: StudentInfoCard[] }) {
  const multiExchange = new Set(cards.map(c => c.exchangeName)).size > 1

  // Preserve the action's ordering while grouping by exchange.
  const groups: { name: string; cards: StudentInfoCard[] }[] = []
  for (const card of cards) {
    const last = groups[groups.length - 1]
    if (last && last.name === card.exchangeName) last.cards.push(card)
    else groups.push({ name: card.exchangeName, cards: [card] })
  }

  return (
    <div>
      <div className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Infos pratiques</div>
      <h1 className="mb-6 font-display text-[30px] font-bold leading-[1.1] tracking-tight text-navy">Bon à savoir</h1>

      {cards.length === 0 && (
        <div className="rounded-[22px] border border-tint-border bg-tint px-[34px] py-[30px]">
          <div className="font-display text-[18px] font-semibold text-navy">Rien pour l’instant</div>
          <p className="mt-1 text-[15px] leading-relaxed text-foreground">
            Ton organisateur n’a pas encore ajouté d’informations. Reviens plus tard — elles apparaîtront ici.
          </p>
        </div>
      )}

      {groups.map(group => (
        <section key={group.name} className="mb-7">
          {multiExchange && (
            <div className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.name}
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {group.cards.map(card => (
              <div key={card.id} className="rounded-[14px] border bg-card px-5 py-4">
                <div className="font-display text-[15px] font-semibold text-navy">{card.title}</div>
                {card.body && (
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground">
                    <Linkified text={card.body} />
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Write the route**

```tsx
// app/(student)/infos/page.tsx
import { getStudentInfoCards } from '@/actions/student-info'
import { InfoCardsView } from '@/components/student/InfoCardsView'

export default async function InfosPage() {
  const cards = await getStudentInfoCards()
  return <InfoCardsView cards={cards} />
}
```

- [ ] **Step 5: Verify build**

Run: `pnpm lint && pnpm build`
Expected: PASS — `/infos` compiles; no type errors.

- [ ] **Step 6: Commit**

```bash
git add components/student/StudentTabs.tsx components/student/InfoCardsView.tsx app/\(student\)/layout.tsx app/\(student\)/infos/page.tsx
git commit -m "feat(student): Infos tab + key-info view"
```

---

### Task 8: Full verification + PR

**Files:** none (verification + integration).

- [ ] **Step 1: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm build && pnpm test:rls`
Expected: ALL PASS. If `pnpm test`/`pnpm test:rls` in the main checkout sweeps sibling worktrees under `.claude/worktrees/*`, scope with `vitest run --exclude '**/.claude/**'` and note it (see the vitest-sweeps-worktree reference).

- [ ] **Step 2: Drive the flow end-to-end (verify skill)**

Manually (or via the `verify`/`run` skill): as an organizer, open Settings → Programme, add two info cards (one with a pasted `https://` link), edit one, delete one. As an enrolled student, open the portal, click the **Infos** tab, confirm both cards render, the link is clickable (opens in a new tab), newlines are preserved, and the empty state shows for an exchange with no cards. Confirm the tab still shows (empty state) when the organizer has added nothing.

- [ ] **Step 3: Confirm migration ledger + type drift are clean**

Verify every filename version in `supabase/migrations/` appears in MCP `list_migrations` and vice-versa; `npx tsc --noEmit` is clean.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin <feature-branch>
gh pr create --title "feat: exchange key-info cards" --body "$(cat <<'EOF'
## Summary
- New `exchange_info_cards` table (organizer R/W, enrolled-student read) with RLS matrix cases.
- Organizers author titled info cards from Settings → Programme.
- Students read them from a new « Infos » tab on the portal; plain-text bodies with auto-linked URLs.

## Test plan
- `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls` all green.
- Manual: authored/edited/deleted cards as organizer; viewed as enrolled student (link + newlines + empty state).

## Merge-time steps
- Migration already applied to staging + prod (source-of-truth ledger); `types/supabase.ts` regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Autonomy stops here — Bjorn merges with a merge commit.

---

## Self-Review

**Spec coverage:**
- Titled cards (title + body) → Task 1 schema, Task 2 validation. ✅
- Authoring in Settings → Programme, active-exchange scoped, read-only when archived → Task 5. ✅
- Student "Infos" tab (first student nav), always visible, empty state → Task 7. ✅
- Plain text + auto-linked URLs, no injection surface → Task 3. ✅
- RLS: organizer R/W (either school), enrolled-student read-only, others denied → Task 1 policies + matrix cases. ✅
- Structured-result validation (no throw) → Task 2 + Task 4 return codes, Task 5 maps to i18n. ✅
- i18n across 5 locales + parity → Task 5. ✅
- No reordering / body optional / title required defaults → Task 2 + Task 5. ✅
- Staging-first rollout + type regen → Task 1 Step 5, Task 8. ✅

**Placeholder scan:** No TBD/TODO; every code step carries full code; migration timestamp `<ts>` and the feature-branch name are the only intentional fill-ins (real values chosen at execution).

**Type consistency:** `InfoCard` (`{id,title,body,position}`) is defined in Task 4 and consumed identically in Task 5. `InfoCardError` codes (`titleRequired`/`titleTooLong`/`bodyTooLong`) match across Task 2, Task 4 returns, and the Task 5 i18n `errors.*` keys. `StudentInfoCard` (`{id,title,body,exchangeName}`) defined in Task 6, consumed in Task 7. `validateInfoCard`/`INFO_TITLE_MAX`/`INFO_BODY_MAX` names consistent Task 2 → 4 → 5. `segmentText`/`Linkified` consistent Task 3 → 7.
