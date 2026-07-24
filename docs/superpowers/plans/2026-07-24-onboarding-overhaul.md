# Organizer Onboarding Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the organizer onboarding flow end to end — land every email-confirmation path inside onboarding, survive an abandoned tab, exit to Applications, validate travel dates on selection, remove every optional field, and capture the four values the « Bonne nouvelle » acceptance email currently ships as `[à compléter]`.

**Architecture:** Onboarding shrinks from three steps to two. Step 1 (the school registry picker) is untouched. Step 2 keeps its four required inputs, loses nine optional ones, autosaves to `localStorage`, validates date order during render, and finishes with a server-side `redirect('/applications')` instead of a client step transition. Two derived values (`sending_school_name`, `sending_city`) move from the browser to the server, the latter read from `school_registry`. Three new columns on `exchange_program_details` hold the acceptance-email data, edited in Réglages → Programme and exposed to a parallel session's send-guard through a pure helper module.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS), TypeScript, Tailwind + shadcn/ui, Vitest + Testing Library, next-intl.

**Spec:** `docs/superpowers/specs/2026-07-24-onboarding-overhaul-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- **Branch is `feature/onboarding-overhaul` in a worktree.** Confirm with `git branch --show-current` before every commit. Never commit to `main`.
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- Verification gate: `pnpm lint && pnpm test && pnpm build`. Any task touching `supabase/migrations/` also runs `pnpm test:rls`.
- **Never run `supabase db push` against prod.** Migrations go to staging first, then prod via the Supabase MCP `apply_migration` tool.
- **Never log student/parent PII** — no student emails, names, or submission contents in logs or error messages.
- Expected outcomes are **structured return values**, never thrown errors — production redacts thrown Server Action messages. Only throw for genuinely unexpected failures.
- French UI copy uses the **typographic apostrophe `’`**, never the straight `'`. Verify with the grep in Task 5, Step 7.
- Do not touch: `app/(organizer)/applications/**` (parallel session), `lib/good-news-template.ts` / `lib/email.ts` good-news rendering (parallel session), `claim_school` or `school_registry` (just merged).
- `OnboardingForm.tsx` is deliberately hard-coded French — it renders before a tenant exists. Do **not** add `useTranslations` to it.

---

## Task 1: Reproduce the blank tab and the « Continuer » flash

The spec records items 1 and 7 as hypotheses. This task turns them into findings before any fix is written. It produces no production code — only a findings file that Tasks 8–10 depend on.

**Files:**
- Create: `docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a findings file whose "Item 7 verdict" section Task 8 reads before changing `completeFirstExchange`, and whose "Item 1 verdict" section Task 10 reads before changing the entry redirects.

- [ ] **Step 1: Read the signup confirmation email template**

The hypothesis is that the signup template still carries a `{{ .ConfirmationURL }}` link alongside the `{{ .Token }}` code, and that clicking the link enters Supabase's broken `GET /auth/v1/verify` flow.

The Supabase Management API is the only place this is visible. Per session memory, the classifier blocks the agent from issuing Management-API calls, so **ask Bjorn to run this himself** by pasting it with the `!` prefix:

```
! curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rgisrqlbcjdoetoybaqd/config/auth" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('SUBJECT:', d.get('mailer_subjects_confirmation')); print('BODY:'); print(d.get('mailer_templates_confirmation_content'))"
```

Record the exact body in the findings file. Decide:
- Body contains `{{ .ConfirmationURL }}` → **hypothesis confirmed**, the blank tab is the link.
- Body contains only `{{ .Token }}` → **hypothesis wrong**, continue to Step 2.

- [ ] **Step 2: Put a staging organizer back into mid-onboarding**

The flash needs an organizer whose school is named but owns no exchange. Build that state directly rather than signing up (staging sends no email, so a fresh signup cannot be confirmed).

```bash
set -a; source .env.staging; set +a
psql "$STAGING_DB_URL" -c "
  select u.id, u.email, s.id as school_id, s.name
  from users u join schools s on s.id = u.school_id
  where u.email = 'demo-organizer@example.com';"
```

Note the `school_id`, then clear its exchanges so `mustOnboard` fires:

```bash
psql "$STAGING_DB_URL" -c "
  delete from exchanges where school_a_id = '<school_id>';"
```

Deleting cascades to `exchange_program_details`, `exchange_info_cards`, enrollments and assignments for that school's seeded exchange. This is seed data — `pnpm seed:staging` rebuilds it in Step 5.

- [ ] **Step 3: Reproduce the flash in a browser**

Start the dev server against staging and drive it with Playwright, per the recipe in `reference_visual_check_via_staging_playwright`:

```bash
pnpm dev   # port is pinned in .wtport
```

Log in at `/login` as `demo-organizer@example.com` (password = the `SEED_PASSWORD` used at seed time). The layout gate should bounce to `/onboarding` at step 2. Fill exchange name, destination, and both dates, then click « Continuer » while recording:

```bash
npx playwright screenshot --wait-for-timeout=0 --full-page \
  "http://localhost:<port>/onboarding" /tmp/claude-1000/-home-bjorn-eazyexchange/a7372a64-e144-4b6a-ace0-567b5446b3e9/scratchpad/onboarding-before.png
```

For the flash itself a screenshot is too slow — capture the navigation sequence instead. In the browser devtools Network panel, or via a Playwright script logging `page.on('framenavigated')`, record **every URL the tab visits** between the click and the final resting page.

Expected if the hypothesis holds: `/onboarding` → `/dashboard` (or its loading skeleton) → back to `/onboarding` step 3.

- [ ] **Step 4: Write the findings file**

Create `docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md` with exactly these sections, filled in with what was observed — not with what was expected:

```markdown
# Onboarding overhaul — reproduction findings

**Date:** 2026-07-24
**Environment:** staging (eazyexchange-staging), local dev server

## Item 1 verdict — the blank tab

- Signup email template body: <paste verbatim>
- Contains `{{ .ConfirmationURL }}`: yes / no
- Conclusion: <the cause, or "not reproduced — hypothesis wrong">
- Fix owner: code / Supabase dashboard (manual, Bjorn)

## Item 7 verdict — the « Continuer » flash

- Navigation sequence observed after clicking Continuer: <list of URLs in order>
- Intermediate screen seen: <e.g. /dashboard, app/(organizer)/loading.tsx, none>
- Conclusion: <confirmed mechanism, or the actual mechanism>

## Consequences for the plan

- Task 8: <keep the server-side redirect / use the client fallback>
- Task 10: <which entry paths need changing>
```

If either verdict contradicts the spec, **stop and report to Bjorn** before continuing — the spec's §1 or §7 needs rewriting first.

- [ ] **Step 5: Restore the staging seed**

```bash
pnpm seed:staging
```

Expected: exits 0 and reports the demo exchange recreated.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md
git commit -m "docs(onboarding): reproduction findings for the blank tab and the Continuer flash"
```

---

## Task 2: Migration — three acceptance-email columns

**Files:**
- Create: `supabase/migrations/<stamp>_acceptance_email_details.sql`
- Modify: `types/supabase.ts` (regenerated, never hand-edited)
- Modify: `tests/rls/matrix.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `exchange_program_details.participation_cost` (`text`), `.payment_details` (`text`), `.confirmation_deadline` (`date`). Task 3 reads them through its own type; Task 4 writes them; Task 5 edits them.

- [ ] **Step 1: Write the migration**

Generate the stamp with `date -u +%Y%m%d%H%M%S` and use it as the filename prefix. Create `supabase/migrations/<stamp>_acceptance_email_details.sql`:

```sql
-- The four values the « Bonne nouvelle » acceptance email needs before it can
-- be sent without [à compléter] placeholders. « Dates du séjour » is already
-- held as travel_start/travel_end; these are the other three.
--
-- No policy changes: both policies on exchange_program_details
-- (20260719173549_fillable_forms.sql) are row-level, so new columns inherit
-- them. Organizers of either participating school manage the row; enrolled
-- students read it — correct here, since these are the values their family
-- receives by email.
--
-- participation_cost and payment_details are text, not numeric: real answers
-- are « 850 € par élève, vol et hébergement inclus » or « gratuit ».

alter table exchange_program_details
  add column participation_cost   text,
  add column payment_details      text,
  add column confirmation_deadline date;
```

- [ ] **Step 2: Add the RLS matrix cases**

RLS inheritance by new columns is an assumption worth testing rather than reasoning about. In `tests/rls/matrix.test.ts`, find the `describe('own-school allow', ...)` block and the existing test `'enrolled student A cannot write program details'` (around line 359). Add these two tests immediately after it:

```ts
  it('enrolled student A reads the acceptance-email columns', async () => {
    expect(await readRows(fx.studentA, (tx) =>
      tx`select participation_cost, payment_details, confirmation_deadline
         from exchange_program_details where exchange_id = ${fx.exchangeA}`)).toHaveLength(1)
  })

  it('enrolled student A cannot write the acceptance-email columns', async () => {
    expectBlocked(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`update exchange_program_details set participation_cost = '0 €'
         where exchange_id = ${fx.exchangeA}`))
  })
```

Then find the cross-school `describe` block containing `'exchange_program_details: cannot upsert school A details'` (around line 234) and add after it:

```ts
  it('exchange_program_details: cannot write school A acceptance-email columns', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchange_program_details set payment_details = 'pwned'
         where exchange_id = ${fx.exchangeA}`))
  })
```

- [ ] **Step 3: Apply to staging**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Expected: reports the new migration applied. If it hangs, it is the WSL2 IPv6 issue — resolve the host with `getent ahostsv4 <host>` and substitute the IPv4 address into `--db-url`.

- [ ] **Step 4: Run the RLS matrix against staging**

```bash
RLS_TEST_DB_URL="$STAGING_DB_URL" pnpm test:rls
```

Expected: PASS, including the three new cases. The student-read case proves inheritance; the two write cases prove the policies still deny.

- [ ] **Step 5: Apply to prod**

Use the Supabase MCP `apply_migration` tool with `name` = `acceptance_email_details` and the SQL from Step 1. Then call MCP `list_migrations` and confirm the stamped version matches the local filename. If it differs, `git mv` the local file to the stamped version — the ledger is the source of truth.

- [ ] **Step 6: Regenerate types**

Call MCP `generate_typescript_types`, overwrite `types/supabase.ts` **verbatim**, then:

```bash
npx tsc --noEmit
```

Expected: no errors. `types/db.ts`'s `ExchangeProgramDetails` alias picks the three columns up automatically — never hand-edit `types/supabase.ts`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/<stamp>_acceptance_email_details.sql types/supabase.ts tests/rls/matrix.test.ts
git commit -m "feat(db): acceptance-email columns on exchange_program_details"
```

---

## Task 3: `good-news-fields` pure module

The contract the parallel email session imports to block a send that would contain `[à compléter]`.

**Files:**
- Create: `lib/exchange/good-news-fields.ts`
- Test: `lib/exchange/__tests__/good-news-fields.test.ts`

**Interfaces:**
- Consumes: the three columns from Task 2 (by shape, not by import).
- Produces:
  - `type GoodNewsValues = { travel_start: string | null; travel_end: string | null; participation_cost: string | null; payment_details: string | null; confirmation_deadline: string | null }`
  - `type GoodNewsField = 'travel_dates' | 'participation_cost' | 'payment_details' | 'confirmation_deadline'`
  - `missingGoodNewsFields(d: GoodNewsValues | null): GoodNewsField[]`
  - `GOOD_NEWS_FIELD_LABELS: Record<GoodNewsField, string>`
  - `GOOD_NEWS_FIELD_ORDER: readonly GoodNewsField[]`

- [ ] **Step 1: Write the failing test**

Create `lib/exchange/__tests__/good-news-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  missingGoodNewsFields, GOOD_NEWS_FIELD_LABELS, GOOD_NEWS_FIELD_ORDER,
  type GoodNewsValues,
} from '@/lib/exchange/good-news-fields'

const complete: GoodNewsValues = {
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
  participation_cost: '850 € par élève',
  payment_details: 'https://helloasso.com/x',
  confirmation_deadline: '2026-09-15',
}

describe('missingGoodNewsFields', () => {
  it('reports nothing missing when all four are present', () => {
    expect(missingGoodNewsFields(complete)).toEqual([])
  })

  it('reports every field when the row does not exist yet', () => {
    expect(missingGoodNewsFields(null)).toEqual([
      'travel_dates', 'participation_cost', 'payment_details', 'confirmation_deadline',
    ])
  })

  it('treats a half-filled travel period as a missing dates entry', () => {
    expect(missingGoodNewsFields({ ...complete, travel_end: null })).toEqual(['travel_dates'])
  })

  it('treats whitespace as blank', () => {
    expect(missingGoodNewsFields({ ...complete, participation_cost: '   ' }))
      .toEqual(['participation_cost'])
  })

  it('reports missing fields in the canonical order', () => {
    const missing = missingGoodNewsFields({
      ...complete, confirmation_deadline: null, participation_cost: null,
    })
    expect(missing).toEqual(['participation_cost', 'confirmation_deadline'])
  })

  it('labels every field it can report', () => {
    for (const field of GOOD_NEWS_FIELD_ORDER) {
      expect(GOOD_NEWS_FIELD_LABELS[field]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run lib/exchange/__tests__/good-news-fields.test.ts
```

Expected: FAIL — cannot resolve `@/lib/exchange/good-news-fields`.

- [ ] **Step 3: Write the implementation**

Create `lib/exchange/good-news-fields.ts`:

```ts
// Which values the « Bonne nouvelle » acceptance email needs before it can be
// sent without [à compléter] placeholders. Pure — no React, no Supabase — so
// the send guard, the Réglages card and the tests share one definition.
//
// Deliberately NOT expressed over ProgramDetailsValues. That type means « what
// the fillable forms consume », and `keyof ProgramDetailsValues` is load-bearing
// in DETAIL_LABELS, DETAIL_ORDER, EMPTY_DETAILS and ProgramDetailFields —
// adding these keys there would make the add-a-form prompt ask for a payment
// link when an organizer adds a medical form.
//
// Structurally satisfied by an exchange_program_details row, so callers pass
// the generated Row straight in.

export type GoodNewsValues = {
  travel_start: string | null
  travel_end: string | null
  participation_cost: string | null
  payment_details: string | null
  confirmation_deadline: string | null
}

export type GoodNewsField =
  | 'travel_dates'
  | 'participation_cost'
  | 'payment_details'
  | 'confirmation_deadline'

// Canonical display order — drives both the guard's message and any UI listing
// what is still missing, so the organizer always sees the same sequence.
export const GOOD_NEWS_FIELD_ORDER: readonly GoodNewsField[] = [
  'travel_dates', 'participation_cost', 'payment_details', 'confirmation_deadline',
]

// French, not localized — same convention as DETAIL_LABELS.
export const GOOD_NEWS_FIELD_LABELS: Record<GoodNewsField, string> = {
  travel_dates: 'Dates du séjour',
  participation_cost: 'Participation aux frais',
  payment_details: 'Adhésion / paiement',
  confirmation_deadline: 'Date limite de confirmation',
}

function blank(v: string | null | undefined): boolean {
  return (v ?? '').trim() === ''
}

// The travel period counts as one entry: a half-filled period renders as badly
// as no period at all, and the two dates are always collected together.
export function missingGoodNewsFields(d: GoodNewsValues | null): GoodNewsField[] {
  if (!d) return [...GOOD_NEWS_FIELD_ORDER]
  const missing: GoodNewsField[] = []
  if (blank(d.travel_start) || blank(d.travel_end)) missing.push('travel_dates')
  if (blank(d.participation_cost)) missing.push('participation_cost')
  if (blank(d.payment_details)) missing.push('payment_details')
  if (blank(d.confirmation_deadline)) missing.push('confirmation_deadline')
  return missing
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run lib/exchange/__tests__/good-news-fields.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/exchange/good-news-fields.ts lib/exchange/__tests__/good-news-fields.test.ts
git commit -m "feat(exchange): missingGoodNewsFields helper for the acceptance-email guard"
```

---

## Task 4: `saveProgramDetails` persists the three columns

**Files:**
- Modify: `actions/fillable.ts:41-52` (`ProgramDetailsInput`), and `saveProgramDetails` (around lines 67-110)
- Test: `actions/__tests__/fillable-program-details.test.ts` (create)

**Interfaces:**
- Consumes: Task 2's columns.
- Produces: `ProgramDetailsInput` gains `participation_cost: string | null`, `payment_details: string | null`, `confirmation_deadline: string | null`. Task 5's card sends all three.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/fillable-program-details.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const upserted: any[] = []

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: 'owner', email: 'a@b.c', full_name: 'A' },
  }),
  requireUser: async () => ({ user: { id: 'u1' } }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'ex1', school_a_id: 's1', school_b_id: null }, error: null,
              }),
            }),
          }),
        }
      }
      if (t === 'exchange_program_details') {
        return { upsert: async (row: any) => { upserted.push(row); return { error: null } } }
      }
      throw new Error('unexpected table ' + t)
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveProgramDetails, type ProgramDetailsInput } from '@/actions/fillable'

const base: ProgramDetailsInput = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
  chaperones: [],
  association_name: null,
  sending_school_name: null,
  receiving_school_name: null,
  proviseur_name: null,
  sending_city: null,
  absence_dates: [],
  participation_cost: '850 € par élève',
  payment_details: 'https://helloasso.com/x',
  confirmation_deadline: '2026-09-15',
}

beforeEach(() => { upserted.length = 0 })

describe('saveProgramDetails — acceptance-email columns', () => {
  it('writes all three new columns', async () => {
    const res = await saveProgramDetails('ex1', base)
    expect(res).toEqual({ ok: true })
    expect(upserted[0]).toMatchObject({
      participation_cost: '850 € par élève',
      payment_details: 'https://helloasso.com/x',
      confirmation_deadline: '2026-09-15',
    })
  })

  it('stores a blank value as null rather than an empty string', async () => {
    await saveProgramDetails('ex1', { ...base, participation_cost: '   ', confirmation_deadline: '' })
    expect(upserted[0]).toMatchObject({
      participation_cost: null,
      confirmation_deadline: null,
    })
  })

  it('rejects an overlong participation cost without writing', async () => {
    const res = await saveProgramDetails('ex1', { ...base, participation_cost: 'x'.repeat(201) })
    expect(res).toEqual({ ok: false, message: expect.any(String) })
    expect(upserted).toHaveLength(0)
  })

  it('rejects an overlong payment detail without writing', async () => {
    const res = await saveProgramDetails('ex1', { ...base, payment_details: 'y'.repeat(201) })
    expect(res).toEqual({ ok: false, message: expect.any(String) })
    expect(upserted).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run actions/__tests__/fillable-program-details.test.ts
```

Expected: FAIL — TypeScript rejects the three unknown keys on `ProgramDetailsInput`, and the upsert assertions find no such columns.

- [ ] **Step 3: Extend the input type**

In `actions/fillable.ts`, replace the `ProgramDetailsInput` type (currently ending with `absence_dates: string[]`) with:

```ts
export type ProgramDetailsInput = {
  destination: string | null
  travel_start: string | null
  travel_end: string | null
  chaperones: string[]
  association_name: string | null
  sending_school_name: string | null
  receiving_school_name: string | null
  proviseur_name: string | null
  sending_city: string | null
  absence_dates: string[]
  // The « Bonne nouvelle » acceptance email's three non-date values. Free text,
  // not numeric — see lib/exchange/good-news-fields.ts.
  participation_cost: string | null
  payment_details: string | null
  confirmation_deadline: string | null
}
```

- [ ] **Step 4: Validate and persist them**

In `saveProgramDetails`, extend the existing length guard. Replace:

```ts
  const texts = [input.destination, input.association_name, input.sending_school_name,
    input.receiving_school_name, input.proviseur_name, input.sending_city]
```

with:

```ts
  const texts = [input.destination, input.association_name, input.sending_school_name,
    input.receiving_school_name, input.proviseur_name, input.sending_city,
    input.participation_cost, input.payment_details]
```

Then add the three columns to the upsert object, immediately after `absence_dates`:

```ts
    absence_dates: absenceDates,
    participation_cost: cleanText(input.participation_cost),
    payment_details: cleanText(input.payment_details),
    confirmation_deadline: cleanText(input.confirmation_deadline),
    updated_at: new Date().toISOString(),
```

`confirmation_deadline` is a `date` column and arrives as an ISO `YYYY-MM-DD` string from `<input type="date">`; `cleanText` turns `''` into `null`, which is what an unset date must be.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm vitest run actions/__tests__/fillable-program-details.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add actions/fillable.ts actions/__tests__/fillable-program-details.test.ts
git commit -m "feat(settings): persist the acceptance-email values with the program details"
```

---

## Task 5: Réglages → Programme edits the acceptance-email values

**Files:**
- Modify: `components/settings/ProgramDetailsCard.tsx`
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/de.json`, `messages/it.json`
- Test: `components/settings/__tests__/ProgramDetailsCard.test.tsx` (create)

**Interfaces:**
- Consumes: Task 4's `ProgramDetailsInput` keys; Task 2's columns via `ExchangeProgramDetails`.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing test**

Create `components/settings/__tests__/ProgramDetailsCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import fr from '@/messages/fr.json'

const saveProgramDetails = vi.fn()
vi.mock('@/actions/fillable', () => ({
  saveProgramDetails: (...a: unknown[]) => saveProgramDetails(...a),
}))

import { ProgramDetailsCard } from '@/components/settings/ProgramDetailsCard'

function renderCard(initial: any = null, readOnly = false) {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <ProgramDetailsCard exchangeId="ex1" initial={initial} readOnly={readOnly} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  saveProgramDetails.mockReset().mockResolvedValue({ ok: true })
})

describe('ProgramDetailsCard — acceptance-email group', () => {
  it('renders the three acceptance-email fields', () => {
    renderCard()
    expect(screen.getByLabelText('Participation aux frais')).toBeInTheDocument()
    expect(screen.getByLabelText('Adhésion / paiement')).toBeInTheDocument()
    expect(screen.getByLabelText('Date limite de confirmation')).toBeInTheDocument()
  })

  it('prefills them from the existing row', () => {
    renderCard({
      destination: null, travel_start: null, travel_end: null, chaperones: [],
      association_name: null, sending_school_name: null, receiving_school_name: null,
      proviseur_name: null, sending_city: null, absence_dates: [],
      participation_cost: '850 € par élève',
      payment_details: 'https://helloasso.com/x',
      confirmation_deadline: '2026-09-15',
    })
    expect(screen.getByLabelText('Participation aux frais')).toHaveValue('850 € par élève')
    expect(screen.getByLabelText('Date limite de confirmation')).toHaveValue('2026-09-15')
  })

  it('sends all three to saveProgramDetails on save', async () => {
    renderCard()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Participation aux frais'), '850 €')
    await user.type(screen.getByLabelText('Adhésion / paiement'), 'Chèque')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(saveProgramDetails).toHaveBeenCalledOnce())
    expect(saveProgramDetails.mock.calls[0][1]).toMatchObject({
      participation_cost: '850 €',
      payment_details: 'Chèque',
      confirmation_deadline: null,
    })
  })

  it('disables them when the exchange is archived', () => {
    renderCard(null, true)
    expect(screen.getByLabelText('Participation aux frais')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run components/settings/__tests__/ProgramDetailsCard.test.tsx
```

Expected: FAIL — the labels do not exist.

- [ ] **Step 3: Add the message keys to all five locales**

The repo has a locale-parity test; adding a key to one file without the others fails it. In each file, the keys go inside `organizer.settings.programDetails`, after `absenceDatesHint`.

`messages/fr.json` — note the typographic apostrophes:

```json
        "acceptanceHeading": "Pour l’e-mail d’acceptation",
        "acceptanceSubtitle": "Ces valeurs remplacent les mentions « à compléter » de l’e-mail « Bonne nouvelle » envoyé aux familles retenues.",
        "participationCost": "Participation aux frais",
        "participationCostHint": "Ex. « 850 € par élève, vol et hébergement inclus »",
        "paymentDetails": "Adhésion / paiement",
        "paymentDetailsHint": "Lien de paiement ou modalités, ex. « chèque à l’ordre de l’association »",
        "confirmationDeadline": "Date limite de confirmation",
```

`messages/en.json`:

```json
        "acceptanceHeading": "For the acceptance email",
        "acceptanceSubtitle": "These values replace the “to be completed” placeholders in the “Good news” email sent to selected families.",
        "participationCost": "Cost to families",
        "participationCostHint": "E.g. “€850 per student, flights and accommodation included”",
        "paymentDetails": "Membership / payment",
        "paymentDetailsHint": "Payment link or instructions, e.g. “cheque payable to the association”",
        "confirmationDeadline": "Confirmation deadline",
```

`messages/es.json`:

```json
        "acceptanceHeading": "Para el correo de aceptación",
        "acceptanceSubtitle": "Estos valores sustituyen las menciones «por completar» del correo «Buenas noticias» enviado a las familias seleccionadas.",
        "participationCost": "Participación en los gastos",
        "participationCostHint": "Ej. «850 € por alumno, vuelo y alojamiento incluidos»",
        "paymentDetails": "Afiliación / pago",
        "paymentDetailsHint": "Enlace de pago o modalidades, ej. «cheque a nombre de la asociación»",
        "confirmationDeadline": "Fecha límite de confirmación",
```

`messages/de.json`:

```json
        "acceptanceHeading": "Für die Zusage-E-Mail",
        "acceptanceSubtitle": "Diese Werte ersetzen die Platzhalter „auszufüllen“ in der E-Mail „Gute Nachrichten“ an die ausgewählten Familien.",
        "participationCost": "Kostenbeteiligung",
        "participationCostHint": "z. B. „850 € pro Schüler/in, Flug und Unterkunft inbegriffen“",
        "paymentDetails": "Mitgliedschaft / Zahlung",
        "paymentDetailsHint": "Zahlungslink oder Modalitäten, z. B. „Scheck an den Verein“",
        "confirmationDeadline": "Bestätigungsfrist",
```

`messages/it.json`:

```json
        "acceptanceHeading": "Per l’e-mail di accettazione",
        "acceptanceSubtitle": "Questi valori sostituiscono le diciture «da completare» nell’e-mail «Buone notizie» inviata alle famiglie selezionate.",
        "participationCost": "Partecipazione alle spese",
        "participationCostHint": "Es. «850 € per studente, volo e alloggio inclusi»",
        "paymentDetails": "Adesione / pagamento",
        "paymentDetailsHint": "Link di pagamento o modalità, es. «assegno intestato all’associazione»",
        "confirmationDeadline": "Termine di conferma",
```

- [ ] **Step 4: Update the card's subtitle**

The existing `settings.programDetails.subtitle` claims these fields only fill the signable forms, which stops being true. In `messages/fr.json`, replace the `subtitle` value with:

```json
        "subtitle": "Ces informations remplissent automatiquement les formulaires à signer en ligne (décharge, demande d’absence, engagement de famille, autorisation médicale) et l’e-mail d’acceptation. Modifiez-les ici : tous les formulaires non encore signés se mettent à jour.",
```

Apply the equivalent edit in the other four locales, appending the same "and the acceptance email" clause to each existing translation. Do not retranslate the rest of the sentence — only extend the parenthetical list.

- [ ] **Step 5: Extend the card**

In `components/settings/ProgramDetailsCard.tsx`, add the three keys to the `useState` initialiser, immediately after `absence_dates`:

```ts
    absence_dates: (initial?.absence_dates ?? []).join('\n'),
    participation_cost: initial?.participation_cost ?? '',
    payment_details: initial?.payment_details ?? '',
    confirmation_deadline: initial?.confirmation_deadline ?? '',
```

Add them to the `ProgramDetailsInput` built in `handleSave`, immediately after `absence_dates`:

```ts
      absence_dates: form.absence_dates.split('\n').map(s => s.trim()).filter(Boolean),
      participation_cost: form.participation_cost || null,
      payment_details: form.payment_details || null,
      confirmation_deadline: form.confirmation_deadline || null,
```

Then add the new group between the closing `</div>` of the existing details grid and the `{error && ...}` line:

```tsx
      <div className="mt-7 border-t pt-6">
        <div className="mb-1 font-display text-[14px] font-bold tracking-[-.01em] text-foreground">
          {t('settings.programDetails.acceptanceHeading')}
        </div>
        <p className="mb-4 text-[12.5px] leading-normal text-muted-foreground">
          {t('settings.programDetails.acceptanceSubtitle')}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('participation_cost', t('settings.programDetails.participationCost'), t('settings.programDetails.participationCostHint'))}
          {text('payment_details', t('settings.programDetails.paymentDetails'), t('settings.programDetails.paymentDetailsHint'))}
          {text('confirmation_deadline', t('settings.programDetails.confirmationDeadline'), undefined, 'date')}
        </div>
      </div>
```

The existing `text()` helper already wires the label, the `pd-<key>` id, the value, the change handler and `disabled={readOnly}` — no new plumbing.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm vitest run components/settings/__tests__/ProgramDetailsCard.test.tsx messages/__tests__
```

Expected: PASS — 4 card tests, plus the locale-parity suite green with the new keys in all five files.

- [ ] **Step 7: Run the apostrophe guard**

French copy must use `’`, never `'`. This must return **no output**:

```bash
grep -n "l'\|d'\|n'\|qu'\|s'\|j'\|c'" messages/fr.json
```

If it prints anything, replace each straight apostrophe with `’` and re-run.

- [ ] **Step 8: Commit**

```bash
git add components/settings/ProgramDetailsCard.tsx components/settings/__tests__/ProgramDetailsCard.test.tsx messages/fr.json messages/en.json messages/es.json messages/de.json messages/it.json
git commit -m "feat(settings): collect the acceptance-email values in Réglages → Programme"
```

---

## Task 6: Onboarding draft module

**Files:**
- Create: `lib/onboarding/draft.ts`
- Test: `lib/onboarding/__tests__/draft.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type OnboardingDraft = { exchangeName: string; destination: string; travel_start: string; travel_end: string }`
  - `loadDraft(schoolId: string): OnboardingDraft | null`
  - `saveDraft(schoolId: string, d: OnboardingDraft): void`
  - `clearDraft(schoolId: string): void`
  - `draftKey(schoolId: string): string`
  - `serializeDraft`, `parseDraft`, `isEmptyDraft` (exported for tests)

  Task 9 wires all of these into `OnboardingForm`.

- [ ] **Step 1: Write the failing test**

Create `lib/onboarding/__tests__/draft.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  draftKey, serializeDraft, parseDraft, isEmptyDraft,
  loadDraft, saveDraft, clearDraft,
  type OnboardingDraft,
} from '@/lib/onboarding/draft'

const filled: OnboardingDraft = {
  exchangeName: 'Espagne 2026',
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('draftKey', () => {
  it('scopes the draft to the school', () => {
    expect(draftKey('s1')).toBe('eazyexchange:onboarding-draft:s1')
    expect(draftKey('s2')).not.toBe(draftKey('s1'))
  })
})

describe('parseDraft', () => {
  it('round-trips a serialized draft', () => {
    expect(parseDraft(serializeDraft(filled))).toEqual(filled)
  })
  it('returns null for absent storage', () => {
    expect(parseDraft(null)).toBeNull()
  })
  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseDraft('{not json')).toBeNull()
  })
  it('rejects a draft written by a future version', () => {
    expect(parseDraft(JSON.stringify({ v: 99, exchangeName: 'x' }))).toBeNull()
  })
  it('coerces non-string members to empty strings', () => {
    expect(parseDraft(JSON.stringify({ v: 1, exchangeName: 42, destination: 'ok' })))
      .toEqual({ exchangeName: '', destination: 'ok', travel_start: '', travel_end: '' })
  })
})

describe('isEmptyDraft', () => {
  it('is true for blanks and whitespace', () => {
    expect(isEmptyDraft({ exchangeName: '  ', destination: '', travel_start: '', travel_end: '' })).toBe(true)
  })
  it('is false once anything is typed', () => {
    expect(isEmptyDraft({ ...filled })).toBe(false)
  })
})

describe('save/load/clear', () => {
  it('persists and restores a draft', () => {
    saveDraft('s1', filled)
    expect(loadDraft('s1')).toEqual(filled)
  })
  it('does not leak between schools', () => {
    saveDraft('s1', filled)
    expect(loadDraft('s2')).toBeNull()
  })
  it('removes the entry instead of storing an empty draft', () => {
    saveDraft('s1', filled)
    saveDraft('s1', { exchangeName: '', destination: '', travel_start: '', travel_end: '' })
    expect(window.localStorage.getItem(draftKey('s1'))).toBeNull()
  })
  it('clears the entry', () => {
    saveDraft('s1', filled)
    clearDraft('s1')
    expect(loadDraft('s1')).toBeNull()
  })
  it('swallows a storage failure rather than breaking onboarding', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveDraft('s1', filled)).not.toThrow()
  })
  it('returns null when reading storage throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(loadDraft('s1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run lib/onboarding/__tests__/draft.test.ts
```

Expected: FAIL — cannot resolve `@/lib/onboarding/draft`.

- [ ] **Step 3: Write the implementation**

Create `lib/onboarding/draft.ts`:

```ts
// Onboarding step 2 autosaves here so closing the tab does not discard
// everything typed. Step 1 already persists server-side (claim_school writes
// schools.name/uai/country), so this covers the only unsaved stretch of the
// flow.
//
// Best effort by design: a browser with storage disabled, in private mode, or
// with a full quota must degrade to the previous behaviour — retyping four
// fields — and must never break onboarding. Every access is wrapped.
//
// School-scoped, and school/trip data only: no student or parent PII ever
// reaches localStorage.

export type OnboardingDraft = {
  exchangeName: string
  destination: string
  travel_start: string
  travel_end: string
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  exchangeName: '', destination: '', travel_start: '', travel_end: '',
}

// Bumped if the shape changes; a draft written by another version is discarded
// rather than half-restored.
const VERSION = 1

export function draftKey(schoolId: string): string {
  return `eazyexchange:onboarding-draft:${schoolId}`
}

export function serializeDraft(d: OnboardingDraft): string {
  return JSON.stringify({ v: VERSION, ...d })
}

export function parseDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || parsed.v !== VERSION) return null
    const str = (k: keyof OnboardingDraft) =>
      typeof parsed[k] === 'string' ? (parsed[k] as string) : ''
    return {
      exchangeName: str('exchangeName'),
      destination: str('destination'),
      travel_start: str('travel_start'),
      travel_end: str('travel_end'),
    }
  } catch {
    return null
  }
}

export function isEmptyDraft(d: OnboardingDraft): boolean {
  return Object.values(d).every(v => v.trim() === '')
}

export function loadDraft(schoolId: string): OnboardingDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(draftKey(schoolId)))
  } catch {
    return null
  }
}

export function saveDraft(schoolId: string, d: OnboardingDraft): void {
  try {
    if (isEmptyDraft(d)) {
      window.localStorage.removeItem(draftKey(schoolId))
      return
    }
    window.localStorage.setItem(draftKey(schoolId), serializeDraft(d))
  } catch {
    // Quota exceeded or storage unavailable — the draft is a convenience.
  }
}

export function clearDraft(schoolId: string): void {
  try {
    window.localStorage.removeItem(draftKey(schoolId))
  } catch {
    // As above.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run lib/onboarding/__tests__/draft.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/draft.ts lib/onboarding/__tests__/draft.test.ts
git commit -m "feat(onboarding): localStorage draft so an abandoned tab keeps step 2"
```

---

## Task 7: Shrink `first-exchange` to the required fields

**Files:**
- Modify: `lib/onboarding/first-exchange.ts`
- Modify: `lib/onboarding/__tests__/first-exchange.test.ts`

**Interfaces:**
- Consumes: `travelOrderProblem` / `TRAVEL_ORDER_MESSAGE` from `lib/exchange/travel-dates` (unchanged).
- Produces:
  - `type FirstExchangeDetails = { destination: string; travel_start: string; travel_end: string }`
  - `EMPTY_FIRST_EXCHANGE_DETAILS: FirstExchangeDetails`
  - `type FirstExchangeProblem = { error: 'invalid' | 'limit'; message: string }`
  - `detailsProblem`, `generatedCards`, `DETAILS_REQUIRED_MESSAGE`, `CARD_INVALID_MESSAGE`, `TRAVEL_ORDER_MESSAGE` (all unchanged in behaviour)
  - **Removed:** `FirstExchangeCard`, `ONBOARDING_CARD_PROMPTS`, `filledCards`, `CompleteFirstExchangeResult`

  Tasks 8 and 9 consume the new shapes.

- [ ] **Step 1: Rewrite the test file**

Replace `lib/onboarding/__tests__/first-exchange.test.ts` entirely:

```ts
import { describe, it, expect } from 'vitest'
import {
  detailsProblem, generatedCards,
  EMPTY_FIRST_EXCHANGE_DETAILS, DETAILS_REQUIRED_MESSAGE, TRAVEL_ORDER_MESSAGE,
} from '@/lib/onboarding/first-exchange'

const good = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
}

describe('EMPTY_FIRST_EXCHANGE_DETAILS', () => {
  it('carries only the three required fields', () => {
    expect(Object.keys(EMPTY_FIRST_EXCHANGE_DETAILS).sort())
      .toEqual(['destination', 'travel_end', 'travel_start'])
  })
})

describe('detailsProblem', () => {
  it('accepts destination + both dates', () => {
    expect(detailsProblem(good)).toBeNull()
  })
  it('rejects a blank destination', () => {
    expect(detailsProblem({ ...good, destination: '  ' })).toBe(DETAILS_REQUIRED_MESSAGE)
  })
  it('rejects a missing travel date', () => {
    expect(detailsProblem({ ...good, travel_end: '' })).toBe(DETAILS_REQUIRED_MESSAGE)
  })
  it('rejects a return before the departure', () => {
    expect(detailsProblem({ ...good, travel_end: '2026-10-01' })).toBe(TRAVEL_ORDER_MESSAGE)
  })
  it('rejects a return on the same day as the departure', () => {
    expect(detailsProblem({ ...good, travel_end: '2026-10-17' })).toBe(TRAVEL_ORDER_MESSAGE)
  })
})

describe('generatedCards', () => {
  it('generates the Destination and Dates clés cards from the structured values', () => {
    expect(generatedCards(good)).toEqual([
      { title: 'Destination', body: 'le Minnesota, USA' },
      { title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.' },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run lib/onboarding/__tests__/first-exchange.test.ts
```

Expected: FAIL — `EMPTY_FIRST_EXCHANGE_DETAILS` still carries nine keys.

- [ ] **Step 3: Rewrite the module**

Replace `lib/onboarding/first-exchange.ts` entirely:

```ts
// Pure helpers + shared contract for the onboarding "first exchange" step.
// Lives outside the 'use server' action module so values and types can be
// imported by both the action and the client form (a 'use server' file may
// export only async functions).
import { travelPeriodFr } from '@/lib/forms/fillable/render'
import { travelOrderProblem, TRAVEL_ORDER_MESSAGE } from '@/lib/exchange/travel-dates'

// Everything onboarding asks for, and nothing else. The six detail columns that
// used to sit behind « Informations complémentaires (facultatif) » were never
// optional — every one is required by a standard fillable form — so they moved
// to the add-a-form prompt (lib/forms/add-requirements.ts), which asks for
// exactly the missing ones at the moment a form needs them. Two more are now
// derived server-side and never asked at all: sending_school_name from
// schools.name, and sending_city from the school's registry commune.
export type FirstExchangeDetails = {
  destination: string
  travel_start: string
  travel_end: string
}

export const EMPTY_FIRST_EXCHANGE_DETAILS: FirstExchangeDetails = {
  destination: '', travel_start: '', travel_end: '',
}

// completeFirstExchange returns this for expected outcomes instead of throwing
// (Next.js redacts thrown Server Action messages in production). There is no
// success arm: success redirects, so it is never observed by the caller.
export type FirstExchangeProblem = { error: 'invalid' | 'limit'; message: string }

export const CARD_INVALID_MESSAGE =
  'Chaque information renseignée doit avoir un titre.'

export const DETAILS_REQUIRED_MESSAGE =
  'Renseignez la destination et les deux dates du voyage.'

// Re-exported so the onboarding form and its tests keep one import site.
export { TRAVEL_ORDER_MESSAGE }

export function detailsProblem(d: FirstExchangeDetails): string | null {
  if (!d.destination.trim()) return DETAILS_REQUIRED_MESSAGE
  if (!d.travel_start.trim() || !d.travel_end.trim()) return DETAILS_REQUIRED_MESSAGE
  return travelOrderProblem(d.travel_start.trim(), d.travel_end.trim())
}

// The two Info cards students see, derived from the structured values rather
// than typed a second time. These are the only cards onboarding creates — the
// three free-text prompts it used to offer are optional by nature and belong in
// Communication → Infos, which can add them at any time.
export function generatedCards(d: FirstExchangeDetails): { title: string; body: string }[] {
  return [
    { title: 'Destination', body: d.destination.trim() },
    { title: 'Dates clés', body: `Le voyage se déroulera ${travelPeriodFr(d.travel_start, d.travel_end)}.` },
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run lib/onboarding/__tests__/first-exchange.test.ts
```

Expected: PASS, 8 tests. Other suites still fail — Tasks 8 and 9 fix their callers.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/first-exchange.ts lib/onboarding/__tests__/first-exchange.test.ts
git commit -m "refactor(onboarding): first-exchange carries only the required fields"
```

---

## Task 8: `completeFirstExchange` derives, then redirects

**Files:**
- Modify: `actions/onboarding.ts` (the `completeFirstExchange` half, from its doc comment to the end of file)
- Modify: `actions/__tests__/onboarding-first-exchange.test.ts`

**Interfaces:**
- Consumes: Task 7's `FirstExchangeDetails`, `FirstExchangeProblem`, `detailsProblem`, `generatedCards`, `CARD_INVALID_MESSAGE`.
- Produces: `completeFirstExchange(name: string, details: FirstExchangeDetails): Promise<FirstExchangeProblem | void>` — two parameters, not three. Task 9 calls it.

**Before starting:** read `docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md` § "Item 7 verdict". If it says the server-side redirect is not the right fix, use the fallback in the spec's §7 (client `router.replace('/applications')`) and note the deviation in the commit message.

- [ ] **Step 1: Rewrite the test file**

Replace `actions/__tests__/onboarding-first-exchange.test.ts` entirely. Note the two new mocks: `next/navigation` (so the redirect is observable) and the `school_registry` table.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EMPTY_FIRST_EXCHANGE_DETAILS, DETAILS_REQUIRED_MESSAGE } from '@/lib/onboarding/first-exchange'

let scenario: {
  school: {
    name: string
    uai: string | null
    subscription_status: string | null
    plan: string | null
    grace_until: string | null
  }
  exchangeCount: number
  // Rows the registry returns for the school's UAI, in id order.
  registry: { name: string; commune: string }[]
}

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: 'owner', email: 'a@b.c', full_name: 'A' },
  }),
}))

const inserted: { exchanges: any[]; cards: any[]; details: any[] } = { exchanges: [], cards: [], details: [] }
const cookieSet = vi.fn()
const redirect = vi.fn((path: string) => { throw new Error('NEXT_REDIRECT:' + path) })
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirect(p) }))

function exchangesTable() {
  const b: any = {
    select: () => b,
    eq: () => b,
    then: (resolve: (v: unknown) => unknown) => resolve({ count: scenario.exchangeCount, error: null }),
    insert: (row: any) => {
      inserted.exchanges.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'ex-new' }, error: null }) }) }
    },
  }
  return b
}
function schoolsTable() {
  const b: any = {
    select: () => b, eq: () => b,
    single: async () => ({ data: scenario.school, error: null }),
  }
  return b
}
function cardsTable() {
  return { insert: async (rows: any[]) => { inserted.cards.push(...rows); return { error: null } } }
}
function detailsTable() {
  return { upsert: async (row: any) => { inserted.details.push(row); return { error: null } } }
}
// .select('commune').eq('uai', ...)[.eq('name', ...)].order('id').limit(1).maybeSingle()
function registryTable() {
  let nameFilter: string | null = null
  const b: any = {
    select: () => b,
    eq: (col: string, val: string) => { if (col === 'name') nameFilter = val; return b },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => {
      const rows = nameFilter === null
        ? scenario.registry
        : scenario.registry.filter(r => r.name === nameFilter)
      return { data: rows[0] ? { commune: rows[0].commune } : null, error: null }
    },
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return exchangesTable()
      if (t === 'schools') return schoolsTable()
      if (t === 'exchange_info_cards') return cardsTable()
      if (t === 'exchange_program_details') return detailsTable()
      if (t === 'school_registry') return registryTable()
      throw new Error('unexpected table ' + t)
    },
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/tokens', () => ({ applySlug: (s: string) => 'slug-' + s.trim().toLowerCase().replace(/\s+/g, '-') }))

import { completeFirstExchange } from '@/actions/onboarding'

const details = {
  ...EMPTY_FIRST_EXCHANGE_DETAILS,
  destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
}

beforeEach(() => {
  inserted.exchanges = []
  inserted.cards = []
  inserted.details = []
  cookieSet.mockClear()
  redirect.mockClear()
  scenario = {
    school: {
      name: 'Lycée Chevreul Lestonnac', uai: '0690574Z',
      subscription_status: null, plan: null, grace_until: null, // trial
    },
    exchangeCount: 0,
    registry: [{ name: 'Lycée Chevreul Lestonnac', commune: 'Lyon' }],
  }
})

describe('completeFirstExchange', () => {
  it('creates the exchange, sets the active cookie, and redirects to Applications', async () => {
    await expect(completeFirstExchange('  Espagne 2026  ', details))
      .rejects.toThrow('NEXT_REDIRECT:/applications')
    expect(inserted.exchanges).toEqual([
      { name: 'Espagne 2026', year: new Date().getFullYear(), school_a_id: 's1', school_b_id: null, apply_slug: 'slug-espagne-2026' },
    ])
    expect(cookieSet).toHaveBeenCalledWith('ee_active_exchange', 'ex-new', expect.objectContaining({ path: '/' }))
  })

  it('creates only the two generated cards', async () => {
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Destination', body: 'le Minnesota, USA', position: 0 },
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.', position: 1 },
    ])
  })

  it('derives sending_school_name from the school, never from the client', async () => {
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0]).toMatchObject({
      exchange_id: 'ex-new',
      destination: 'le Minnesota, USA',
      travel_start: '2026-10-17',
      travel_end: '2026-11-02',
      sending_school_name: 'Lycée Chevreul Lestonnac',
      chaperones: [], absence_dates: [],
    })
  })

  it('derives sending_city from the registry commune', async () => {
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBe('Lyon')
  })

  it('picks the campus matching the school name when a UAI is shared', async () => {
    scenario.registry = [
      { name: 'Lycée Chevreul Lestonnac — Site St Didier', commune: 'Saint-Didier-au-Mont-d’Or' },
      { name: 'Lycée Chevreul Lestonnac', commune: 'Lyon' },
    ]
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBe('Lyon')
  })

  it('falls back to the first registry row when the name no longer matches', async () => {
    scenario.registry = [{ name: 'Lycée Chevreul Lestonnac (renommé)', commune: 'Lyon' }]
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBe('Lyon')
  })

  it('leaves sending_city null for a school with no UAI', async () => {
    scenario.school.uai = null
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBeNull()
  })

  it('rejects an empty name without creating anything or redirecting', async () => {
    const res = await completeFirstExchange('   ', details)
    expect(res).toEqual({ error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the limit outcome at the plan cap', async () => {
    scenario.exchangeCount = 1 // trial cap = 1
    const res = await completeFirstExchange('Espagne', details)
    expect(res).toEqual({ error: 'limit', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing the destination', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, destination: '' })
    expect(res).toEqual({ error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing a travel date', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, travel_end: '' })
    expect(res).toEqual({ error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run actions/__tests__/onboarding-first-exchange.test.ts
```

Expected: FAIL — the action still takes three parameters and returns `{ ok: true }` rather than redirecting.

- [ ] **Step 3: Rewrite the action**

In `actions/onboarding.ts`:

Add `redirect` and `SupabaseClient` to the imports at the top of the file:

```ts
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
```

Replace the `lib/onboarding/first-exchange` import block with:

```ts
import {
  generatedCards,
  detailsProblem,
  CARD_INVALID_MESSAGE,
  type FirstExchangeDetails,
  type FirstExchangeProblem,
} from '@/lib/onboarding/first-exchange'
```

Then replace everything from the `// The forced onboarding step:` comment to the end of the file with:

```ts
// The school's own commune, read from the official registry rather than typed
// by the organizer. UAI is NOT unique — 65 codes are shared by multi-site
// establishments — so prefer the exact (uai, name) pair and fall back to the
// lowest id, the same precedence claim_school() uses. Non-FR schools have no
// UAI and get null; the add-a-form prompt collects the city when a form needs it.
async function lookupSendingCity(
  supabase: SupabaseClient, uai: string | null, schoolName: string | null,
): Promise<string | null> {
  if (!uai) return null
  const name = (schoolName ?? '').trim()
  if (name) {
    const { data } = await supabase
      .from('school_registry').select('commune')
      .eq('uai', uai).eq('name', name)
      .order('id').limit(1).maybeSingle()
    if (data?.commune) return data.commune
  }
  const { data } = await supabase
    .from('school_registry').select('commune')
    .eq('uai', uai)
    .order('id').limit(1).maybeSingle()
  return data?.commune ?? null
}

// The forced onboarding step: create the school's first exchange together with
// its structured program details, then land the organizer on Applications.
//
// Only destination and the two travel dates are asked. sending_school_name and
// sending_city are derived server-side (the school row and its registry
// commune) rather than round-tripped through the browser; every other detail
// column is collected by the add-a-form prompt when a form actually needs it.
//
// Mirrors createExchange's guards (name, plan cap, active-exchange cookie).
// Expected outcomes are structured returns; success redirects, so the caller
// never observes a success value. The redirect must stay outside any try/catch
// — redirect() signals by throwing.
export async function completeFirstExchange(
  name: string,
  details: FirstExchangeDetails,
): Promise<FirstExchangeProblem | void> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const trimmedName = (name ?? '').trim()
  if (!trimmedName) return { error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }

  const problem = detailsProblem(details)
  if (problem) return { error: 'invalid', message: problem }

  // Plan cap (trial = 1). At 0 exchanges this always passes; kept for parity
  // with createExchange so the rule lives in one shape.
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('name, uai, subscription_status, plan, grace_until')
    .eq('id', profile.school_id)
    .single()
  if (schoolError) throw schoolError

  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (school && !canCreateExchange(school, count ?? 0)) {
    return { error: 'limit', message: EXCHANGE_LIMIT_MESSAGE }
  }

  const validated: { title: string; body: string }[] = []
  for (const card of generatedCards(details)) {
    const v = validateInfoCard(card)
    if (!v.ok) return { error: 'invalid', message: CARD_INVALID_MESSAGE }
    validated.push(v.value)
  }

  const { data: created, error: insertError } = await supabase
    .from('exchanges')
    .insert({
      name: trimmedName,
      year: new Date().getFullYear(),
      school_a_id: profile.school_id,
      school_b_id: null,
      apply_slug: applySlug(trimmedName),
    })
    .select('id')
    .single()
  if (insertError) throw insertError

  const sendingCity = await lookupSendingCity(supabase, school?.uai ?? null, school?.name ?? null)

  const { error: detailsError } = await supabase.from('exchange_program_details').upsert({
    exchange_id: created.id,
    destination: details.destination.trim() || null,
    travel_start: details.travel_start,
    travel_end: details.travel_end,
    chaperones: [],
    association_name: null,
    sending_school_name: (school?.name ?? '').trim() || null,
    receiving_school_name: null,
    proviseur_name: null,
    sending_city: sendingCity,
    absence_dates: [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'exchange_id' })
  if (detailsError) throw detailsError

  const cardRows = validated.map((c, i) => ({
    exchange_id: created.id, title: c.title, body: c.body, position: i,
  }))
  const { error: cardsError } = await supabase.from('exchange_info_cards').insert(cardRows)
  if (cardsError) throw cardsError

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, created.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  // Refresh the sidebar with the new exchange, then land on Applications — the
  // page a new organizer actually has work on. Navigating from the action
  // rather than the client leaves no step transition to race the revalidation
  // (see the spec's §7).
  revalidatePath('/', 'layout')
  redirect('/applications')
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run actions/__tests__/onboarding-first-exchange.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add actions/onboarding.ts actions/__tests__/onboarding-first-exchange.test.ts
git commit -m "feat(onboarding): derive school city, drop the card params, land on Applications"
```

---

## Task 9: `OnboardingForm` — two steps, live date check, draft

**Files:**
- Modify: `app/onboarding/OnboardingForm.tsx`
- Modify: `app/onboarding/__tests__/OnboardingForm.test.tsx`

**Interfaces:**
- Consumes: Task 6's draft functions, Task 7's `FirstExchangeDetails` / `EMPTY_FIRST_EXCHANGE_DETAILS` / `TRAVEL_ORDER_MESSAGE`, Task 8's two-parameter `completeFirstExchange`, and `travelOrderProblem` from `lib/exchange/travel-dates`.
- Produces: `OnboardingForm` gains a required `schoolId: string` prop. Task 10's page passes it.

- [ ] **Step 1: Rewrite the test file's first two describes**

In `app/onboarding/__tests__/OnboardingForm.test.tsx`:

Replace the mock header block (lines 1–39) with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { draftKey } from '@/lib/onboarding/draft'

const completeOnboarding = vi.fn()
const completeFirstExchange = vi.fn()
const searchSchools = vi.fn()
vi.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
  completeFirstExchange: (...a: unknown[]) => completeFirstExchange(...a),
  searchSchools: (...a: unknown[]) => searchSchools(...a),
}))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

// Step 2's Destination and both travel dates are required HTML5 fields; fill
// them before submitting so the browser lets the submit event through.
function fillProgramDetails(end = '2026-11-02') {
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'le Minnesota, USA' } })
  fireEvent.change(screen.getByLabelText('Date de départ'), { target: { value: '2026-10-17' } })
  fireEvent.change(screen.getByLabelText('Date de retour'), { target: { value: end } })
}

const CHEVREUL = {
  id: 1, uai: '0690574Z', name: 'Lycée Chevreul Lestonnac', type: 'Lycée',
  status: 'Privé', commune: 'Lyon', postal_code: '69007',
}

beforeEach(() => {
  window.localStorage.clear()
  completeOnboarding.mockReset().mockResolvedValue({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
  // Success redirects server-side; the client promise resolves to undefined.
  completeFirstExchange.mockReset().mockResolvedValue(undefined)
  searchSchools.mockReset().mockResolvedValue([CHEVREUL])
})
```

Note `next/navigation` and `@/actions/settings` are no longer mocked — step 3 is gone, so the form uses neither `useRouter` nor `inviteOrganizer`.

Then replace the whole first `describe('OnboardingForm', ...)` block (the four tests) with:

```tsx
describe('OnboardingForm', () => {
  it('walks school -> exchange and submits the two required arguments', async () => {
    render(<OnboardingForm schoolId="s1" />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'FR', uai: '0690574Z', name: 'Lycée Chevreul Lestonnac',
    }))

    await user.type(await screen.findByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    expect(completeFirstExchange.mock.calls[0]).toHaveLength(2)
    expect(completeFirstExchange.mock.calls[0][0]).toBe('Espagne 2026')
    expect(completeFirstExchange.mock.calls[0][1]).toEqual({
      destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
    })
  })

  it('has no invite-a-colleague step and no optional fields', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    expect(screen.queryByText(/Invitez vos collègues/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Informations complémentaires/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nom de l’association')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ville du lycée')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Titre 1')).not.toBeInTheDocument()
  })

  it('shows the server error and stays on the exchange step when rejected', async () => {
    completeFirstExchange.mockResolvedValue({
      error: 'invalid', message: 'Renseignez la destination et les deux dates du voyage.',
    })
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByText('Renseignez la destination et les deux dates du voyage.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du programme')).toBeInTheDocument()
  })

  it('starts on the exchange step when initialStep is 2', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    expect(screen.getByLabelText('Nom du programme')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).not.toBeInTheDocument()
  })
})

describe('OnboardingForm — travel date order', () => {
  it('shows the ordering error on selection, before any submit', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-01')
    expect(await screen.findByText('La date de retour doit être après la date de départ.')).toBeInTheDocument()
    expect(completeFirstExchange).not.toHaveBeenCalled()
  })

  it('rejects a return on the same day as the departure', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-17')
    expect(await screen.findByText('La date de retour doit être après la date de départ.')).toBeInTheDocument()
  })

  it('disables Continuer while the dates are out of order', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-01')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled())
  })

  it('clears the error and re-enables Continuer once the dates are fixed', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-01')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled())
    fireEvent.change(screen.getByLabelText('Date de retour'), { target: { value: '2026-11-02' } })
    await waitFor(() =>
      expect(screen.queryByText('La date de retour doit être après la date de départ.')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled()
  })

  it('shows nothing while only one date is set', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fireEvent.change(screen.getByLabelText('Date de départ'), { target: { value: '2026-10-17' } })
    expect(screen.queryByText('La date de retour doit être après la date de départ.')).not.toBeInTheDocument()
  })
})

describe('OnboardingForm — abandoned tab', () => {
  it('restores what was typed in step 2', async () => {
    window.localStorage.setItem(draftKey('s1'), JSON.stringify({
      v: 1, exchangeName: 'Espagne 2026', destination: 'le Minnesota, USA',
      travel_start: '2026-10-17', travel_end: '2026-11-02',
    }))
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du programme')).toHaveValue('Espagne 2026'))
    expect(screen.getByLabelText('Destination')).toHaveValue('le Minnesota, USA')
    expect(screen.getByLabelText('Date de retour')).toHaveValue('2026-11-02')
  })

  it('ignores a draft belonging to another school', async () => {
    window.localStorage.setItem(draftKey('s2'), JSON.stringify({
      v: 1, exchangeName: 'Autre', destination: '', travel_start: '', travel_end: '',
    }))
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    await waitFor(() => expect(screen.getByLabelText('Nom du programme')).toHaveValue(''))
  })

  it('saves as the organizer types', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fireEvent.change(screen.getByLabelText('Nom du programme'), { target: { value: 'Espagne 2026' } })
    await waitFor(() => {
      const raw = window.localStorage.getItem(draftKey('s1'))
      expect(raw && JSON.parse(raw).exchangeName).toBe('Espagne 2026')
    })
  })

  it('keeps the draft when the submit is rejected', async () => {
    completeFirstExchange.mockResolvedValue({ error: 'limit', message: 'Limite atteinte.' })
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await screen.findByText('Limite atteinte.')
    const raw = window.localStorage.getItem(draftKey('s1'))
    expect(raw && JSON.parse(raw).exchangeName).toBe('Espagne 2026')
  })
})
```

Finally, in the surviving `describe('OnboardingForm — step 1 establishment gate', ...)` block, add `schoolId="s1"` to all seven `render(<OnboardingForm ... />)` calls.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run app/onboarding/__tests__/OnboardingForm.test.tsx
```

Expected: FAIL — `schoolId` is not a prop, the optional fields still render, and no date error appears before submit.

- [ ] **Step 3: Rewrite the component**

In `app/onboarding/OnboardingForm.tsx`:

Replace the import block at the top with:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { completeOnboarding, completeFirstExchange } from '@/actions/onboarding'
import {
  EMPTY_FIRST_EXCHANGE_DETAILS, type FirstExchangeDetails,
} from '@/lib/onboarding/first-exchange'
import { travelOrderProblem } from '@/lib/exchange/travel-dates'
import { loadDraft, saveDraft, clearDraft } from '@/lib/onboarding/draft'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SchoolCombobox } from './SchoolCombobox'
import type { SchoolOption } from '@/lib/schools/registry'
```

`useRouter`, `inviteOrganizer` and `Textarea` are all gone with step 3 and the optional fields.

Change the signature and step state:

```tsx
export function OnboardingForm({
  schoolId, initialStep = 1,
}: { schoolId: string; initialStep?: 1 | 2 }) {
  const [step, setStep] = useState<1 | 2>(initialStep)
```

Replace the step-2 state block (`exchangeName`, `details`, `cards`) with:

```tsx
  // Step 2: exchange + the three required program details
  const [exchangeName, setExchangeName] = useState('')
  const [details, setDetails] = useState<FirstExchangeDetails>(EMPTY_FIRST_EXCHANGE_DETAILS)
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [exchangeBusy, setExchangeBusy] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
```

Delete the step-3 state block (`email`, `inviteError`, `inviteBusy`, `sent`), the `setCard` helper, and the `handleInvite` function.

After the `setDetail` helper, add the draft effects and the live date check:

```tsx
  // Restore an abandoned step 2 on mount, not as a useState initialiser —
  // reading localStorage during render breaks SSR hydration.
  useEffect(() => {
    const draft = loadDraft(schoolId)
    if (draft) {
      setExchangeName(draft.exchangeName)
      setDetails({
        destination: draft.destination,
        travel_start: draft.travel_start,
        travel_end: draft.travel_end,
      })
    }
    setDraftLoaded(true)
  }, [schoolId])

  useEffect(() => {
    if (!draftLoaded) return
    saveDraft(schoolId, { exchangeName, ...details })
  }, [draftLoaded, schoolId, exchangeName, details])

  // Derived during render, so the organizer sees the problem the moment the
  // second date is picked rather than after pressing Continuer. Null while
  // either date is still blank — required-ness is the submit's job.
  const dateProblem = travelOrderProblem(details.travel_start, details.travel_end)
```

Replace `handleExchange` with:

```tsx
  async function handleExchange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setExchangeBusy(true)
    setExchangeError(null)
    // Success redirects server-side, so there is no success branch here to
    // clear the draft from. Clear first, restore if the action objects — a
    // rejected submit changes no state, so the autosave effect will not re-fire.
    const snapshot = { exchangeName, ...details }
    clearDraft(schoolId)
    try {
      const problem = await completeFirstExchange(exchangeName, details)
      if (problem) {
        saveDraft(schoolId, snapshot)
        setExchangeError(problem.message)
      }
    } catch {
      saveDraft(schoolId, snapshot)
      setExchangeError('Une erreur est survenue. Réessayez.')
    } finally {
      setExchangeBusy(false)
    }
  }
```

In `handleName`, drop the `setDetails` call that seeded `sending_school_name` — the server derives it now:

```tsx
      if (!result.ok) { setError(result.message); return }
      setStep(2)
```

Now the step-2 JSX. Keep the heading, the « Nom du programme » field and the destination/date grid exactly as they are, but add the error under the dates and change the submit button. Replace everything from the closing `</div>` of the date grid through the end of the step-2 `return` with:

```tsx
        </div>
        {dateProblem && <p className="m-0 text-sm text-[#C0392B]">{dateProblem}</p>}
        {exchangeError && <p className="text-sm text-[#C0392B]">{exchangeError}</p>}
        <Button
          type="submit"
          disabled={exchangeBusy || dateProblem !== null}
          className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7] disabled:opacity-50"
        >
          {exchangeBusy ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }
}
```

Delete the entire `<details>` block (the six optional fields), the `cards.map(...)` block with its trailing hint paragraph, and the final `return (...)` that rendered step 3.

Because `step` is now `1 | 2`, the step-2 branch is the last one — change its guard from `if (step === 2) {` to a plain `return` after the step-1 block, or keep the `if` and let TypeScript's exhaustiveness stand. Keep the `if (step === 2)` form and end the function after it; TypeScript needs every path to return, so the component ends with the step-2 `return` inside the `if`, followed by nothing — restructure the tail as:

```tsx
  if (step === 1) {
    return ( /* unchanged step 1 */ )
  }

  return (
    <form onSubmit={handleExchange} className="flex flex-col gap-4">
      {/* step 2 */}
    </form>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run app/onboarding/__tests__/OnboardingForm.test.tsx
```

Expected: PASS — 4 flow tests, 5 date-order tests, 4 draft tests, 7 step-1 gate tests.

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/OnboardingForm.tsx app/onboarding/__tests__/OnboardingForm.test.tsx
git commit -m "feat(onboarding): two steps, live date validation, draft-backed step 2"
```

---

## Task 10: Entry and exit redirects

**Files:**
- Modify: `app/onboarding/page.tsx`
- Modify: `app/(auth)/signup/page.tsx:56` and `:187`
- Modify: `app/(auth)/signup/actions.ts` (`confirmSignupCode`'s redirect)
- Test: `app/__tests__/onboarding-page.test.ts`

**Interfaces:**
- Consumes: Task 9's `schoolId` prop.
- Produces: nothing other tasks import.

**Before starting:** read `docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md` § "Item 1 verdict". If the cause is the Supabase email template, the code changes below still apply, and the template string goes into Task 11's manual-steps note.

- [ ] **Step 1: Update the failing test**

`app/__tests__/onboarding-page.test.ts` already mocks `next/navigation` with a `REDIRECT:`-prefixed throw and exposes a `getRedirect()` helper; the fixture profile uses `school_id: 's-1'`. Work with that, do not introduce a second style.

First, find the existing test named `'redirects a fully-onboarded organizer (named + has exchange) to /dashboard'` and change both its name and its expectation:

```ts
  it('redirects a fully-onboarded organizer (named + has exchange) to /applications', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    ownedExchangeCount = 1
    expect(await getRedirect()).toBe('/applications')
  })
```

Then append this describe block to the end of the file:

```ts
describe('OnboardingPage — form props', () => {
  it('passes the school id down so the draft is school-scoped', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    ownedExchangeCount = 0
    const el = await OnboardingPage()
    expect(JSON.stringify(el)).toContain('"schoolId":"s-1"')
  })
})
```

`OnboardingPage()` returns without throwing here because `mustOnboard('Lincoln High', 0)` is true — the page renders instead of redirecting.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run app/__tests__/onboarding-page.test.ts
```

Expected: FAIL — the page redirects to `/dashboard` and passes no `schoolId`.

- [ ] **Step 3: Update the onboarding page**

In `app/onboarding/page.tsx`, change the completed-onboarding bounce:

```ts
  // Onboarding is done — the only realistic visitor here is someone who just
  // finished it, so land them where the work is. Keeping this identical to the
  // action's own destination also means a revalidation-triggered re-render
  // cannot flash a different page (spec §7).
  if (!mustOnboard(schoolName, ownedCount)) redirect('/applications')
```

and pass the school id to the form:

```tsx
        <OnboardingForm schoolId={profile.school_id} initialStep={initialStep} />
```

Remove `initialSchoolName={schoolName}` — the prop is gone.

- [ ] **Step 4: Point every confirmation path at onboarding**

In `app/(auth)/signup/page.tsx` line 56:

```ts
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
```

and line 187:

```tsx
          <GoogleButton intent="organizer_signup" next="/onboarding" label="Google" />
```

In `app/(auth)/signup/actions.ts`, in `confirmSignupCode`, replace `redirect('/dashboard')` with:

```ts
  // Straight into onboarding. Routing a fresh signup through /dashboard only to
  // be bounced adds a redirect that can only fail: if the layout gate does not
  // fire, /dashboard renders for a user with no school.
  redirect('/onboarding')
```

`safeNextPath('/onboarding')` passes — it is a relative path that does not start with `//`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm vitest run app/__tests__/onboarding-page.test.ts 'app/(auth)/signup/__tests__'
```

Expected: PASS. If a signup test asserts `redirect('/dashboard')`, update that assertion to `/onboarding` — the change is intentional.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/page.tsx 'app/(auth)/signup/page.tsx' 'app/(auth)/signup/actions.ts' app/__tests__/onboarding-page.test.ts
git commit -m "feat(auth): confirmation lands in onboarding, onboarding exits to Applications"
```

---

## Task 11: Full gate, staging verification, manual steps

**Files:**
- Modify: `docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md`

**Interfaces:**
- Consumes: everything.
- Produces: a green gate and a written record of what only Bjorn can apply.

- [ ] **Step 1: Run the full gate**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: all three exit 0. Per session memory, `vitest` can sweep other worktrees' test files — if failures appear under `.claude/worktrees/`, re-run with `pnpm vitest run --exclude '**/.claude/**'` and treat only the in-worktree results as yours. A suite that fails once and passes on re-run is usually a neighbouring session mid-write; re-run the single file before debugging it.

- [ ] **Step 2: Run the RLS matrix**

```bash
set -a; source .env.staging; set +a
RLS_TEST_DB_URL="$STAGING_DB_URL" pnpm test:rls
```

Expected: PASS, including Task 2's three new cases.

- [ ] **Step 3: Verify the fixed flow on staging**

Reset a staging organizer to mid-onboarding exactly as in Task 1, Step 2, then walk the flow in a browser and confirm all five:

1. Step 2 shows four inputs only — no « Informations complémentaires », no card textareas.
2. Setting the return date before the departure shows « La date de retour doit être après la date de départ. » immediately, and « Continuer » is disabled.
3. Typing into step 2, closing the tab, and returning to `/onboarding` restores the text.
4. « Continuer » lands on `/applications` with **no intermediate screen** — compare against the navigation sequence recorded in Task 1.
5. Réglages → Programme shows the three acceptance-email fields, saves them, and shows them again after a reload.

- [ ] **Step 4: Record what remains manual**

Append to `docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md`:

```markdown
## Manual steps (Bjorn only)

- [ ] Supabase → Authentication → Email Templates → Confirm signup: <the exact
      template body to set, or "no change needed" if Task 1 found the template
      already token-only>
- [ ] Prod smoke: fresh /signup → confirm → lands on /onboarding → finish →
      lands on /applications. Prod's users table is empty, so this starts clean.
```

If Task 1 found the template carries `{{ .ConfirmationURL }}`, the replacement link is:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding
```

- [ ] **Step 5: Commit and report**

```bash
git add docs/superpowers/specs/2026-07-24-onboarding-overhaul-findings.md
git commit -m "docs(onboarding): staging verification results and remaining manual steps"
```

Then report to Bjorn: the gate output, the five staging checks with their verdicts, and the manual steps. **Do not merge to `main`** — merging requires his confirmation.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Entry | 1 (reproduce), 10 (three redirects), 11 (template step) |
| §2 Steps and exit | 8 (action redirect), 9 (step 3 cut), 10 (page bounce) |
| §3 Abandonment | 6 (draft module), 9 (wiring) |
| §4 Date validation | 9 |
| §5 Field audit | 7 (type shrink), 8 (derivations), 9 (UI removal) |
| §6 Acceptance-email capture | 2 (columns), 3 (helper), 4 (persistence), 5 (UI + i18n) |
| §7 Flash | 1 (reproduce), 8 + 10 (fix) |
| Data model | 2 |
| Error handling | 4 (lengths), 7 (`FirstExchangeProblem`), 6 (storage failures) |
| i18n | 5 |
| Testing | every task + 11 |
| Rollout order | task order; 2 before 4/5, 1 before 8/10 |

**Type consistency:** `FirstExchangeDetails` (3 keys) is defined in Task 7 and consumed identically in Tasks 8 and 9. `FirstExchangeProblem` is defined in Task 7, returned in Task 8, read as `problem.message` in Task 9. `GoodNewsValues` (Task 3) is independent of `ProgramDetailsValues` by design. `ProgramDetailsInput`'s three new keys (Task 4) match the card's payload (Task 5) and the migration's column names (Task 2): `participation_cost`, `payment_details`, `confirmation_deadline` throughout. `draftKey`/`loadDraft`/`saveDraft`/`clearDraft` (Task 6) are used under those exact names in Task 9. `schoolId` is the prop name in both Task 9 and Task 10.
