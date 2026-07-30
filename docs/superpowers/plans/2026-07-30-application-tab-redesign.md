# Application Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/applications` into two explicit steps — *create the application* (pick a template from a library, pick a deadline) then *invite the students* — and make the steady-state page a pure tracking list with nothing left to configure.

**Architecture:** One new nullable column, `exchanges.application_template text`, records which library template an exchange was built from. The page's four states are **derived** from signals that already exist (`application_deadline`, `application_open`, and the unfiltered `applicationCount` from `getQuestionnaire`) through one pure selector, `applicationState()`. The page branches **server-side**, so the pre-grid states never ship the grid's JavaScript and never run `listApplications` (which signs photo URLs). One new server action, `createApplication`, writes all four application columns in a single UPDATE and materializes `application_fields` from the template so the existing `resolveApplicationSections(null)` fallback at five call sites keeps meaning exactly what it means today.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS), TypeScript, Tailwind + shadcn/ui, next-intl (5 locales), vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-30-application-tab-redesign-design.md`

## Global Constraints

- **Package manager is pnpm.** Never `npm`.
- **Verification gate** (run before considering any task complete): `pnpm lint`, `pnpm test`, `pnpm build`. Task 1 additionally requires `pnpm test:rls`.
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- **Confirm the branch before every commit**: `git branch --show-current` must print `feature/application-tab-redesign`.
- **`supabase/migrations/` is single-writer.** Only one session at a time may add or apply a migration. If another session is mid-migration, wait.
- **Never run `supabase db push` against prod.** Local → staging (`db push --db-url "$STAGING_DB_URL"`) → prod (MCP `apply_migration`).
- **Production redacts thrown Server Action messages** to an opaque digest. Expected outcomes are structured return values carrying a `reason` CODE; only genuinely unexpected failures throw. Never branch client-side on `error.message`.
- **Auth preambles are shared helpers** — `requireOrganizer()` from `lib/auth/require.ts`. The strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing for tests.
- **The service role is walled in.** Everything in this feature uses the request-scoped RLS client (`lib/supabase/server`). No new entry in `lib/supabase/__tests__/admin-allowlist.test.ts`.
- **Never log student/parent PII** — no emails, names or answer contents in logs or error messages.
- **Message catalogs must stay in parity.** `messages/{en,fr,es,it,de}.json` must carry the identical key set (gated by `messages/__tests__/parity.test.ts`, which uses **fr** as the reference) and no empty values. ICU argument names must match across locales. French copy uses typographic apostrophes (`’`), never ASCII `'`.
- **The application questionnaire lock is derived, never stored, and fails CLOSED.** `applicationCount` comes from `getQuestionnaire`, never from `apps.length`. `{ locked: true, applicationCount: 0 }` is a real state; no UI may render a count-bearing sentence from it.
- **`resolveApplicationSections(null)` means « the standard set », not « this exchange's template ».** That is why `createApplication` materializes `application_fields` instead of leaving it null. Do not "simplify" it back to null.
- **Nothing in this feature ever writes `application_open = false`.** Closing applications early = setting the deadline to a past date.
- **The two deadline paths validate differently, on purpose.** `createApplication` rejects a past date; the En cours deadline line accepts one (it is the documented way to close applications early). Do not make the second match the first.
- **Template ids are `TemplateId`**, a string-literal union from `lib/application-templates/library.ts`. Never widen it to `string` at a UI boundary — the dynamic message keys (`templates.${id}.name`) depend on it staying finite.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `supabase/migrations/<stamp>_application_template.sql` | The `exchanges.application_template text` column + its comment. No grant or policy change. |
| `lib/applications/state.ts` | Pure state selector — the three server-derived page states. No React. |
| `lib/applications/__tests__/state.test.ts` | The selector across all states, incl. the legacy and the drift case. |
| `components/applications/TemplateLibrary.tsx` | Presentational card grid over `APPLICATION_TEMPLATES`. No state, no server calls. |
| `components/applications/InviteStudentsDialog.tsx` | The invite dialog carrying both methods: copy-link + `InviteByEmailForm`. |
| `components/applications/ApplicationSetup.tsx` | Vierge · Bibliothèque · Créée, and the create/invite state machine. |
| `components/applications/ApplicationDeadlineLine.tsx` | The En cours editable deadline line. |
| `components/applications/__tests__/ApplicationSetup.test.tsx` | The three setup screens and their transitions. |

**Modify:**

| File | Change |
|---|---|
| `lib/application-templates/library.ts` | Add `resolveTemplateId()` — `null`/unknown → `'standard'`. |
| `lib/application-templates/__tests__/library.test.ts` | Cases for `resolveTemplateId`. |
| `lib/questionnaire/result.ts` | Two new failure reasons: `deadline_past`, `unknown_template`. |
| `actions/questionnaire.ts` | Add `createApplication`; generalize `persist` to take a column patch; delete `resetQuestionnaire`. |
| `actions/__tests__/questionnaire.test.ts` | Replace the `resetQuestionnaire` describe with a `createApplication` one. |
| `app/(organizer)/applications/page.tsx` | Branch server-side on `applicationState()`; only fetch `listApplications` for En cours. |
| `components/applications/CandidaturesView.tsx` | Strip open/deadline/dialog state and the empty-state branch; render `ApplicationDeadlineLine`. |
| `components/applications/__tests__/CandidaturesView.test.tsx` | Drop the removed props and panel/toggle/dialog cases; absorb the surviving invite-file case. |
| `components/applications/QuestionnaireEditor.tsx` | Remove the « Réinitialiser » button and its confirm dialog (second `resetQuestionnaire` caller). |
| `components/applications/__tests__/QuestionnaireEditor.test.tsx` | Drop the reset case and the `resetQuestionnaire` mock. |
| `messages/{en,fr,es,it,de}.json` | Add `organizer.applications.setup.*`, `organizer.questionnaire.templates.*`, two error keys, two invite keys, `deadlineError`; rewrite `empty.*` and `emptyState`; delete the dead blocks. |
| `tests/rls/matrix.test.ts` | One deny case and one allow case for `exchanges.application_template`. |
| `scripts/seed-demo.mjs` | `application_template: 'standard'` on the demo exchange. |
| `types/supabase.ts` | Regenerated verbatim from MCP after the migration lands. |

**Delete:**

`components/applications/OpenApplicationsDialog.tsx`, `components/applications/InvitationPanel.tsx`, `components/applications/QuestionnaireCard.tsx`, `components/applications/InviteByEmailDialog.tsx`, and their four test files, plus `components/applications/__tests__/CandidaturesView.invite.test.tsx`.

**Not modified — and it matters:** `getExchanges()` in `actions/exchanges.ts` selects `'*'`, so `application_template` arrives on every exchange row the moment the column and the regenerated types exist. The spec's "`getExchanges`' select gains `application_template`" needs no code change. `lib/application-fields.ts` and `resolveApplicationSections` are untouched by design. `setApplicationOpen` survives unchanged.

---

## Task 1: The `application_template` column

**Files:**
- Create: `supabase/migrations/<generated stamp>_application_template.sql`
- Modify: `types/supabase.ts` (regenerated), `scripts/seed-demo.mjs:262-266`, `tests/rls/matrix.test.ts:266-271` and `:297-300`

**Interfaces:**
- Consumes: nothing.
- Produces: the column `exchanges.application_template text` (nullable), present in `Tables<'exchanges'>` as `application_template: string | null` and in the Update type as `application_template?: string | null`. Every later task depends on this compiling.

- [ ] **Step 1: Confirm nobody else holds the migrations directory**

```bash
git branch --show-current            # must print feature/application-tab-redesign
git status --porcelain supabase/migrations
ls supabase/migrations | tail -3
```

Expected: clean status, and the last file is `20260730091019_organizer_notifications.sql`. If another session has an unapplied migration in flight, stop and wait.

- [ ] **Step 2: Write the migration**

```bash
FILE="supabase/migrations/$(date -u +%Y%m%d%H%M%S)_application_template.sql"
echo "$FILE"
```

Write that file with exactly this content:

```sql
-- Which library template an exchange's application was built from.
--
-- Spec: docs/superpowers/specs/2026-07-30-application-tab-redesign-design.md
--
-- NULL means « created before templates existed » and resolves to 'standard'
-- (resolveTemplateId in lib/application-templates/library.ts), so no exchange
-- needs a backfill.
--
-- Stored as its own column rather than a key inside application_fields because
-- provenance and structure are different facts with different lifetimes: the
-- template id must survive an organizer deleting half the questions, and it
-- must survive a document that fails to parse.
alter table exchanges add column application_template text;

comment on column exchanges.application_template is
  'Library template id the application was created from. NULL = pre-templates, resolves to ''standard''. See lib/application-templates/library.ts.';

-- No new grant and no policy change: organizers already hold table-level UPDATE
-- on exchanges (they set application_open / application_deadline /
-- application_fields through the same request-scoped client), and the existing
-- exchange policies scope that to their own school. The column is writable by
-- exactly the right people the moment it exists — proven by the two new cases
-- in tests/rls/matrix.test.ts.
```

- [ ] **Step 3: Apply to the local stack, then staging**

```bash
supabase db push --include-all
set -a; source .env.staging; set +a; supabase db push --include-all --db-url "$STAGING_DB_URL"
```

Expected: both report the new migration applied. `--include-all` is required because out-of-order filenames otherwise get skipped. If `db push` hangs on IPv6, follow `reference_wsl2_supabase_db_push_ipv6` (resolve with `getent ahostsv4` and substitute the IP); a pg-delta certificate warning is a red herring.

- [ ] **Step 4: Apply to prod via MCP, then reconcile the stamp**

Use the Supabase MCP tool `apply_migration` with `name: "application_template"` and the same SQL body. Then `list_migrations`.

If the ledger stamped a version different from your filename:

```bash
git mv supabase/migrations/<your stamp>_application_template.sql \
       supabase/migrations/<stamped version>_application_template.sql
```

…and update staging's ledger to match (per `reference_supabase_staging_ledger_drift`: update the row, never run `migration repair`).

Then the routine drift check: every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

- [ ] **Step 5: Regenerate the types**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` **verbatim** (never hand-edit it) → then:

```bash
npx tsc --noEmit
```

Expected: no errors. Confirm the column landed:

```bash
grep -n "application_template" types/supabase.ts
```

Expected: three hits (Row, Insert, Update) inside the `exchanges` block.

- [ ] **Step 6: Seed the demo exchange with an explicit template**

In `scripts/seed-demo.mjs`, in the `insertOne('exchanges', {...})` call (around line 256-268), add the column beside the two it already sets:

```js
  apply_slug: 'demo-2026',
  application_open: true,
  application_deadline: dayOnly(20),
  // Explicit rather than left NULL: the demo exchange must exercise the normal
  // path, not the legacy « created before templates existed » one.
  application_template: 'standard',
```

- [ ] **Step 7: Write the two failing RLS matrix cases**

In `tests/rls/matrix.test.ts`, inside the `cross-tenant deny as %s` describe, immediately after the `exchanges: cannot rewrite school A questionnaire` test (ends line 270):

```ts
  it('exchanges: cannot rewrite school A application template', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchanges set application_template = 'standard' where id = ${fx.exchangeA}`))
  })
```

And inside the `own-school allow` describe, immediately after `organizer A can write their own exchange good-news template` (ends line 300):

```ts
  it('organizer A can write their own exchange application template', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchanges set application_template = 'standard' where id = ${fx.exchangeA}`)).toBe(1)
  })
```

- [ ] **Step 8: Run the RLS matrix**

```bash
pnpm test:rls
```

Expected: PASS, including the two new cases. (Needs the local Supabase stack or `RLS_TEST_DB_URL`.) If the *allow* case fails with `42501`, the column-level grant assumption in the migration comment is wrong — stop and report rather than adding a grant blindly.

- [ ] **Step 9: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all three pass. Nothing consumes the column yet, so this is a regression check on the regenerated types.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add supabase/migrations/*_application_template.sql types/supabase.ts scripts/seed-demo.mjs tests/rls/matrix.test.ts
git commit -m "feat(applications): add exchanges.application_template column"
```

---

## Task 2: The pure selectors

**Files:**
- Create: `lib/applications/state.ts`, `lib/applications/__tests__/state.test.ts`
- Modify: `lib/application-templates/library.ts:35-37`, `lib/application-templates/__tests__/library.test.ts`

**Interfaces:**
- Consumes: `TemplateId`, `templateById` from `lib/application-templates/library.ts` (Task 0 — already in the repo).
- Produces:
  - `type ApplicationState = 'blank' | 'created' | 'running'`
  - `applicationState(input: { applicationOpen: boolean; applicationDeadline: string | null; applicationCount: number }): ApplicationState`
  - `resolveTemplateId(raw: string | null | undefined): TemplateId`

- [ ] **Step 1: Write the failing selector test**

Create `lib/applications/__tests__/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applicationState } from '@/lib/applications/state'

describe('applicationState', () => {
  it('is blank when nothing was ever created', () => {
    expect(applicationState({ applicationOpen: false, applicationDeadline: null, applicationCount: 0 }))
      .toBe('blank')
  })

  it('is created once a deadline exists but nobody has applied', () => {
    expect(applicationState({ applicationOpen: true, applicationDeadline: '2026-06-12', applicationCount: 0 }))
      .toBe('created')
  })

  // The legacy exchange: it opened applications long before templates existed,
  // and was later closed. A deadline on its own is enough — no backfill.
  it('is created for a legacy exchange whose applications are closed', () => {
    expect(applicationState({ applicationOpen: false, applicationDeadline: '2026-06-12', applicationCount: 0 }))
      .toBe('created')
  })

  // application_open with no deadline is reachable in the legacy data too.
  it('is created when applications are open with no deadline', () => {
    expect(applicationState({ applicationOpen: true, applicationDeadline: null, applicationCount: 0 }))
      .toBe('created')
  })

  it('is running as soon as one application exists', () => {
    expect(applicationState({ applicationOpen: true, applicationDeadline: '2026-06-12', applicationCount: 3 }))
      .toBe('running')
  })

  // THE DRIFT CASE. listApplications hides untouched drafts (status = draft with
  // no invited_at), so apps.length can be 0 while the unfiltered count is 3 —
  // the same count that locks the questionnaire. It must resolve to running, or
  // the page would offer « Ajouter » beside a locked questionnaire.
  it('is running on the unfiltered count alone, with no deadline and closed applications', () => {
    expect(applicationState({ applicationOpen: false, applicationDeadline: null, applicationCount: 3 }))
      .toBe('running')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run lib/applications/__tests__/state.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/applications/state"`.

- [ ] **Step 3: Write the selector**

Create `lib/applications/state.ts`:

```ts
// Which of the /applications page's states an exchange is in.
//
// Pure and React-free, same shape as tabs.ts in this directory: the page
// branches on this SERVER-side, so the pre-grid states never ship the grid's
// JavaScript and never run listApplications (which signs photo URLs).
//
// Every signal is derived — there is no state column and no backfill. An
// exchange that ever opened applications lands in the right state on its own.
export type ApplicationState =
  | 'blank'    // Vierge — nothing created yet
  | 'created'  // Créée — the funnel is live, nobody has applied
  | 'running'  // En cours — applications exist; configuration is frozen

// « Bibliothèque » is deliberately absent: it is a client-only mode inside
// ApplicationSetup, entered from a button and never from server state. Putting
// it here would imply a server signal that does not exist.
export function applicationState(input: {
  applicationOpen: boolean
  applicationDeadline: string | null
  applicationCount: number
}): ApplicationState {
  // Count first, and on its own. `applicationCount` is the UNFILTERED count
  // from getQuestionnaire — deliberately the same signal that trips the
  // questionnaire lock, so « the questionnaire is frozen » and « the
  // configuration controls disappeared » can never disagree.
  if (input.applicationCount > 0) return 'running'
  if (input.applicationDeadline != null || input.applicationOpen) return 'created'
  return 'blank'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/applications/__tests__/state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing `resolveTemplateId` test**

Append to `lib/application-templates/__tests__/library.test.ts`:

```ts
describe('resolveTemplateId', () => {
  it('resolves a known id to itself', () => {
    expect(resolveTemplateId('standard')).toBe('standard')
  })

  // NULL means « created before templates existed ». It is not an error state
  // and must never render an empty template name.
  it('resolves null and undefined to standard', () => {
    expect(resolveTemplateId(null)).toBe('standard')
    expect(resolveTemplateId(undefined)).toBe('standard')
  })

  // A hostile or stale value reaching a message key would throw a next-intl
  // MISSING_MESSAGE at render time; degrade instead.
  it('resolves an unknown id to standard rather than passing it through', () => {
    expect(resolveTemplateId('deluxe')).toBe('standard')
    expect(resolveTemplateId('')).toBe('standard')
  })
})
```

…and add `resolveTemplateId` to that file's existing import from `@/lib/application-templates/library`.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run lib/application-templates/__tests__/library.test.ts`
Expected: FAIL — `resolveTemplateId is not a function`.

- [ ] **Step 7: Implement `resolveTemplateId`**

Append to `lib/application-templates/library.ts`, after `templateById`:

```ts
// The one place a stored template id becomes a TemplateId. NULL means « created
// before templates existed » and an unknown id means stale or hostile data;
// both resolve to 'standard' rather than travelling on as a `string`, because
// the UI turns this value into a message key (templates.${id}.name) and a
// missing key throws at render time.
export function resolveTemplateId(raw: string | null | undefined): TemplateId {
  return templateById(raw ?? '')?.id ?? 'standard'
}
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `pnpm vitest run lib/applications/__tests__/state.test.ts lib/application-templates/__tests__/library.test.ts`
Expected: PASS.

- [ ] **Step 9: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add lib/applications/state.ts lib/applications/__tests__/state.test.ts lib/application-templates/library.ts lib/application-templates/__tests__/library.test.ts
git commit -m "feat(applications): pure page-state selector and template id resolver"
```

---

## Task 3: The `createApplication` server action

**Files:**
- Modify: `lib/questionnaire/result.ts:13-21`, `actions/questionnaire.ts:107-115` and `:279-286`, `actions/__tests__/questionnaire.test.ts:362-374`, `messages/{en,fr,es,it,de}.json`
- Test: `actions/__tests__/questionnaire.test.ts`

**Interfaces:**
- Consumes: `templateById` (`lib/application-templates/library.ts`), `loadEditable` + `persist` (private to `actions/questionnaire.ts`), `questionnaireFailure` / `QuestionnaireResult` (`lib/questionnaire/result.ts`).
- Produces: `createApplication(exchangeId: string, templateId: string, deadline: string): Promise<QuestionnaireResult>` — exported from `actions/questionnaire.ts`. Two new `QuestionnaireFailureReason` members: `'deadline_past'`, `'unknown_template'`. Message keys `organizer.questionnaire.errors.deadline_past` and `.unknown_template`.

- [ ] **Step 1: Write the failing action test**

In `actions/__tests__/questionnaire.test.ts`: change the import at line 82-85 from `resetQuestionnaire` to `createApplication`, and **replace** the whole `describe('resetQuestionnaire', …)` block (lines 362-374) with:

```ts
describe('createApplication', () => {
  // A far-future date, so the past-deadline gate never fires on the happy path
  // no matter when the suite runs.
  const FUTURE = '2999-01-01'

  it('writes all four application columns in ONE update, materializing the template', async () => {
    const res = await createApplication('ex-1', 'standard', FUTURE)
    expect(res).toEqual({ ok: true, doc: standardQuestionnaire() })
    // One update, not four: a half-created application (fields written, deadline
    // missing) would leave the funnel live with the wrong questionnaire.
    expect(state.updates).toEqual([{
      application_template: 'standard',
      application_fields: standardQuestionnaire(),
      application_open: true,
      application_deadline: FUTURE,
    }])
  })

  // application_fields must be the MATERIALIZED document, never null:
  // resolveApplicationSections(null) falls back to the STANDARD set at five
  // call sites, so a null here would silently show template #2's candidates
  // the standard questionnaire.
  it('never writes null application_fields', async () => {
    await createApplication('ex-1', 'standard', FUTURE)
    expect((state.updates[0] as { application_fields: unknown }).application_fields).not.toBeNull()
  })

  it('rejects an unknown template id before touching the database', async () => {
    expect(await createApplication('ex-1', 'deluxe', FUTURE))
      .toEqual({ ok: false, reason: 'unknown_template' })
    expect(state.updates).toHaveLength(0)
  })

  it('rejects a deadline in the past — a funnel born dead is always a mistake', async () => {
    expect(await createApplication('ex-1', 'standard', '2000-01-01'))
      .toEqual({ ok: false, reason: 'deadline_past' })
    expect(state.updates).toHaveLength(0)
  })

  it('rejects a malformed or empty deadline as the same outcome', async () => {
    expect(await createApplication('ex-1', 'standard', '')).toEqual({ ok: false, reason: 'deadline_past' })
    expect(await createApplication('ex-1', 'standard', 'demain')).toEqual({ ok: false, reason: 'deadline_past' })
    expect(state.updates).toHaveLength(0)
  })

  // This is also what makes « Changer de modèle » safe: it calls the very same
  // action, so it inherits the very same lock.
  it('refuses once the exchange has an application', async () => {
    state.applicationCount = 1
    expect(await createApplication('ex-1', 'standard', FUTURE)).toEqual({ ok: false, reason: 'locked' })
    expect(state.updates).toHaveLength(0)
  })

  it('fails CLOSED when the application-count query itself errors', async () => {
    state.applicationCountError = { message: 'statement timeout' }
    expect(await createApplication('ex-1', 'standard', FUTURE)).toEqual({ ok: false, reason: 'locked' })
    expect(state.updates).toHaveLength(0)
  })

  it("refuses another school's exchange", async () => {
    state.exchange = { id: 'ex-1', school_a_id: 'other-school', school_b_id: null, application_fields: null }
    expect(await createApplication('ex-1', 'standard', FUTURE)).toEqual({ ok: false, reason: 'not_found' })
    expect(state.updates).toHaveLength(0)
  })

  it('returns a structured "archived" outcome rather than throwing a French sentence through', async () => {
    assertExchangeWritable.mockRejectedValueOnce(new Error(ARCHIVED_ERROR))
    expect(await createApplication('ex-1', 'standard', FUTURE)).toEqual({ ok: false, reason: 'archived' })
    expect(state.updates).toHaveLength(0)
  })

  it('accepts today as a deadline — only strictly earlier dates are dead on arrival', async () => {
    const today = new Date().toISOString().slice(0, 10)
    expect((await createApplication('ex-1', 'standard', today)).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run actions/__tests__/questionnaire.test.ts`
Expected: FAIL — `createApplication` is not exported from `../questionnaire`.

- [ ] **Step 3: Add the two failure reasons**

In `lib/questionnaire/result.ts`, extend the union (lines 13-21) — keep the one-line comment style:

```ts
export type QuestionnaireFailureReason =
  | 'locked'            // the exchange already has applications — permanently read-only
  | 'not_found'         // no such exchange for this organizer's school
  | 'archived'          // the exchange is archived — read-only, distinct from the applications lock
  | 'invalid_label'     // blank, or over 120 characters
  | 'invalid_type'      // not one of the five offered types
  | 'invalid_options'   // a choice question with fewer than two options
  | 'unknown_question'  // the id is not in that section (a stale tab)
  | 'unknown_template'  // no such library template (a stale tab, or a hostile id)
  | 'deadline_past'     // creating on a past date yields an instantly dead funnel
  | 'failed'            // genuinely unexpected, surfaced rather than thrown
```

- [ ] **Step 4: Generalize `persist` and add the action**

In `actions/questionnaire.ts`, replace `persist` (lines 107-115) with a patch-taking version, so a multi-column write reuses the same revalidation:

```ts
// A partial column patch on `exchanges`, not just the questionnaire document:
// createApplication has to write four columns in ONE update, and every writer
// in this file must share the same revalidation.
type ExchangePatch = {
  application_fields?: ApplicationFieldsDoc | null
  application_template?: string
  application_open?: boolean
  application_deadline?: string
}

async function persist(exchangeId: string, patch: ExchangePatch): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('exchanges').update(patch).eq('id', exchangeId)
  if (error) return false
  revalidatePath('/applications')
  revalidatePath('/applications/questionnaire')
  return true
}
```

Then update its four existing call sites to pass the patch object instead of the bare doc — in `removeQuestion` (line 145), `addQuestion` (lines 170, 179, 204) and `editCustomQuestion` (line 275):

```ts
  if (!(await persist(exchangeId, { application_fields: doc }))) return questionnaireFailure('failed')
```

Add the import of `templateById` beside the existing `standardQuestionnaire` import (line 18):

```ts
import { standardQuestionnaire, templateById } from '@/lib/application-templates/library'
```

Then add the action itself, replacing `resetQuestionnaire` (lines 279-286):

```ts
// Step ① of the two-step setup: pick a template, pick a deadline, and the
// funnel is live. Also step ① again — « Changer de modèle » calls this same
// action, which is exactly why the lock below makes overwriting safe.
export async function createApplication(
  exchangeId: string, templateId: string, deadline: string,
): Promise<QuestionnaireResult> {
  // Both arguments are untrusted regardless of their TypeScript types, and
  // both are checked before any DB call — same discipline as removeQuestion's
  // section-id guard, and a bogus id costs no round-trip.
  const template = templateById(templateId)
  if (!template) return questionnaireFailure('unknown_template')
  // The SAME expression the /apply gate uses (app/apply/[slug]/page.tsx) so
  // this refuses exactly what that gate would call already-closed. A calendar
  // date is compared as a string on purpose: turning it into a Date would drift
  // by a day for half the planet.
  const today = new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < today) {
    return questionnaireFailure('deadline_past')
  }
  // Foreign exchange, archived exchange, and THE LOCK — all three, server-side.
  // The client greys the button out; this refuses anyway.
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)

  // MATERIALIZED, never null. resolveApplicationSections(null) falls back to
  // APPLICATION_SECTIONS — the *standard* set — at five call sites, so a null
  // here would render the standard questionnaire to a candidate applying under
  // another template, and the organizer would review answers to questions the
  // candidate never saw. Materializing costs nothing in translation freshness:
  // built-in questions are stored BY REFERENCE, so a later copy fix in the
  // message catalogs still reaches every exchange built from the template.
  const doc = template.build()
  // ONE update. Four separate writes could leave the funnel live carrying the
  // previous questionnaire if the second one failed.
  if (!(await persist(exchangeId, {
    application_template: template.id,
    application_fields: doc,
    application_open: true,
    application_deadline: deadline,
  }))) return questionnaireFailure('failed')
  // The Aperçu carries the application state too.
  revalidatePath('/dashboard')
  return { ok: true, doc }
}
```

**Do not** delete the `resetQuestionnaire` export in this task — `QuestionnaireCard` and `QuestionnaireEditor` still call it and the build would break. Task 6 removes all three together.

- [ ] **Step 5: Run the action test to verify it passes**

Run: `pnpm vitest run actions/__tests__/questionnaire.test.ts`
Expected: PASS. The `resetQuestionnaire` describe is gone; every other describe in the file still passes (the `persist` signature change keeps `state.updates` shape-identical: `[{ application_fields: … }]`).

- [ ] **Step 6: Add the two error strings in five locales**

In each `messages/<locale>.json`, inside `organizer.questionnaire.errors`, add both keys (place them after `unknown_question`):

`fr`:
```json
      "unknown_template": "Modèle inconnu — rechargez la page.",
      "deadline_past": "Choisissez une date limite à venir : une candidature ouverte sur une date passée est déjà fermée."
```
`en`:
```json
      "unknown_template": "Unknown template — reload the page.",
      "deadline_past": "Choose a deadline in the future: an application opened on a past date is already closed."
```
`es`:
```json
      "unknown_template": "Plantilla desconocida: recargue la página.",
      "deadline_past": "Elija una fecha límite futura: una candidatura abierta con una fecha pasada ya está cerrada."
```
`it`:
```json
      "unknown_template": "Modello sconosciuto — ricarica la pagina.",
      "deadline_past": "Scegli una scadenza futura: una candidatura aperta con una data passata è già chiusa."
```
`de`:
```json
      "unknown_template": "Unbekannte Vorlage — laden Sie die Seite neu.",
      "deadline_past": "Wählen Sie eine Frist in der Zukunft: Eine Bewerbung mit einem vergangenen Datum ist bereits geschlossen."
```

- [ ] **Step 7: Run the catalog parity test**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS (identical key sets across all five locales, no empty values).

- [ ] **Step 8: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add lib/questionnaire/result.ts actions/questionnaire.ts actions/__tests__/questionnaire.test.ts messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(applications): createApplication action writing all four columns at once"
```

---

## Task 4: The setup screens — Vierge · Bibliothèque · Créée

**Files:**
- Create: `components/applications/TemplateLibrary.tsx`, `components/applications/InviteStudentsDialog.tsx`, `components/applications/ApplicationSetup.tsx`, `components/applications/__tests__/ApplicationSetup.test.tsx`
- Modify: `messages/{en,fr,es,it,de}.json`

**Interfaces:**
- Consumes: `createApplication` (Task 3), `resolveTemplateId` (Task 2), `APPLICATION_TEMPLATES` / `TemplateId` (`lib/application-templates/library.ts`), `questionCount` (`lib/application-fields.ts`), `longDate` (`lib/dates.ts`), `InviteByEmailForm` (existing), `DateField` / `Button` / `Label` / `Input` / `Dialog` (existing UI).
- Produces:
  - `TemplateLibrary({ selected, onSelect }: { selected: TemplateId | null; onSelect: (id: TemplateId) => void })`
  - `InviteStudentsDialog({ exchangeId, applySlug, open, onOpenChange }: { exchangeId: string; applySlug: string; open: boolean; onOpenChange: (open: boolean) => void })`
  - `ApplicationSetup({ exchangeId, applySlug, created, applicationTemplate, applicationDeadline, questionCount }: { exchangeId: string; applySlug: string; created: boolean; applicationTemplate: string | null; applicationDeadline: string | null; questionCount: number })` — consumed by Task 5's page.

- [ ] **Step 1: Add the copy in five locales**

Three edits per catalog file.

**(a)** Replace the three values under `organizer.applications.empty` (keys unchanged):

| locale | title | body | cta |
|---|---|---|---|
| fr | `Aucune candidature` | `Choisissez un modèle pour commencer.` | `Ajouter une candidature` |
| en | `No application yet` | `Choose a template to get started.` | `Add an application` |
| es | `Ninguna candidatura` | `Elija una plantilla para empezar.` | `Añadir una candidatura` |
| it | `Nessuna candidatura` | `Scegli un modello per iniziare.` | `Aggiungi una candidatura` |
| de | `Noch keine Bewerbung` | `Wählen Sie eine Vorlage, um zu beginnen.` | `Bewerbung hinzufügen` |

**(b)** Add a `setup` block under `organizer.applications` (place it after `empty`). `fr`:

```json
    "setup": {
      "libraryTitle": "Choisissez un modèle",
      "libraryBody": "Le modèle décide des questions posées à vos élèves. Vous pourrez le personnaliser ensuite.",
      "questionCount": "{n} questions",
      "chooseCta": "Choisir",
      "chosenLabel": "Choisi ✓",
      "deadlineLabel": "Date limite des candidatures",
      "createCta": "Ajouter la candidature",
      "creating": "Enregistrement…",
      "cardTitle": "Candidature · {template}",
      "cardSummary": "{n} questions · date limite {date}",
      "cardSummaryNoDeadline": "{n} questions",
      "customizeCta": "Personnaliser",
      "changeTemplateCta": "Changer de modèle",
      "inviteCta": "Inviter les élèves"
    },
```

`en`:
```json
    "setup": {
      "libraryTitle": "Choose a template",
      "libraryBody": "The template decides which questions your students answer. You can customize it afterwards.",
      "questionCount": "{n} questions",
      "chooseCta": "Choose",
      "chosenLabel": "Chosen ✓",
      "deadlineLabel": "Application deadline",
      "createCta": "Add the application",
      "creating": "Saving…",
      "cardTitle": "Application · {template}",
      "cardSummary": "{n} questions · deadline {date}",
      "cardSummaryNoDeadline": "{n} questions",
      "customizeCta": "Customize",
      "changeTemplateCta": "Change template",
      "inviteCta": "Invite students"
    },
```

`es`:
```json
    "setup": {
      "libraryTitle": "Elija una plantilla",
      "libraryBody": "La plantilla determina las preguntas que responderán sus alumnos. Podrá personalizarla después.",
      "questionCount": "{n} preguntas",
      "chooseCta": "Elegir",
      "chosenLabel": "Elegida ✓",
      "deadlineLabel": "Fecha límite de candidaturas",
      "createCta": "Añadir la candidatura",
      "creating": "Guardando…",
      "cardTitle": "Candidatura · {template}",
      "cardSummary": "{n} preguntas · fecha límite {date}",
      "cardSummaryNoDeadline": "{n} preguntas",
      "customizeCta": "Personalizar",
      "changeTemplateCta": "Cambiar de plantilla",
      "inviteCta": "Invitar a los alumnos"
    },
```

`it`:
```json
    "setup": {
      "libraryTitle": "Scegli un modello",
      "libraryBody": "Il modello determina le domande poste ai tuoi studenti. Potrai personalizzarlo in seguito.",
      "questionCount": "{n} domande",
      "chooseCta": "Scegli",
      "chosenLabel": "Scelto ✓",
      "deadlineLabel": "Scadenza delle candidature",
      "createCta": "Aggiungi la candidatura",
      "creating": "Salvataggio…",
      "cardTitle": "Candidatura · {template}",
      "cardSummary": "{n} domande · scadenza {date}",
      "cardSummaryNoDeadline": "{n} domande",
      "customizeCta": "Personalizza",
      "changeTemplateCta": "Cambia modello",
      "inviteCta": "Invita gli studenti"
    },
```

`de`:
```json
    "setup": {
      "libraryTitle": "Wählen Sie eine Vorlage",
      "libraryBody": "Die Vorlage bestimmt, welche Fragen Ihre Schülerinnen und Schüler beantworten. Sie können sie danach anpassen.",
      "questionCount": "{n} Fragen",
      "chooseCta": "Auswählen",
      "chosenLabel": "Ausgewählt ✓",
      "deadlineLabel": "Bewerbungsfrist",
      "createCta": "Bewerbung hinzufügen",
      "creating": "Wird gespeichert…",
      "cardTitle": "Bewerbung · {template}",
      "cardSummary": "{n} Fragen · Frist {date}",
      "cardSummaryNoDeadline": "{n} Fragen",
      "customizeCta": "Anpassen",
      "changeTemplateCta": "Vorlage wechseln",
      "inviteCta": "Schüler einladen"
    },
```

**(c)** Add a `templates` block under `organizer.questionnaire` (place it after `card`, which Task 6 deletes), plus two keys inside `organizer.applications.invite`, and retitle that dialog since it now carries both methods:

`fr` — `organizer.questionnaire.templates`:
```json
    "templates": {
      "standard": {
        "name": "Questionnaire standard",
        "description": "Le questionnaire complet : élève, parents, conditions d’accueil et profil."
      }
    },
```
`organizer.applications.invite` — replace `title` and `description`, and add two keys:
```json
      "title": "Inviter les élèves",
      "description": "Partagez le lien de candidature ou laissez-nous écrire à vos élèves.",
      "linkHeading": "Partager un lien",
      "emailHeading": "Ou laissez-nous envoyer les e-mails",
```

`en`:
```json
    "templates": {
      "standard": {
        "name": "Standard questionnaire",
        "description": "The full questionnaire: student, parents, hosting conditions and profile."
      }
    },
```
```json
      "title": "Invite students",
      "description": "Share the application link or let us email your students.",
      "linkHeading": "Share a link",
      "emailHeading": "Or let us send the emails",
```

`es`:
```json
    "templates": {
      "standard": {
        "name": "Cuestionario estándar",
        "description": "El cuestionario completo: alumno, padres, condiciones de acogida y perfil."
      }
    },
```
```json
      "title": "Invitar a los alumnos",
      "description": "Comparta el enlace de candidatura o deje que escribamos a sus alumnos.",
      "linkHeading": "Compartir un enlace",
      "emailHeading": "O deje que enviemos los correos",
```

`it`:
```json
    "templates": {
      "standard": {
        "name": "Questionario standard",
        "description": "Il questionario completo: studente, genitori, condizioni di accoglienza e profilo."
      }
    },
```
```json
      "title": "Invita gli studenti",
      "description": "Condividi il link di candidatura o lascia che scriviamo ai tuoi studenti.",
      "linkHeading": "Condividi un link",
      "emailHeading": "Oppure lascia che inviamo le e-mail",
```

`de`:
```json
    "templates": {
      "standard": {
        "name": "Standard-Fragebogen",
        "description": "Der vollständige Fragebogen: Schüler, Eltern, Unterbringung und Profil."
      }
    },
```
```json
      "title": "Schüler einladen",
      "description": "Teilen Sie den Bewerbungslink oder lassen Sie uns Ihre Schüler anschreiben.",
      "linkHeading": "Link teilen",
      "emailHeading": "Oder lassen Sie uns die E-Mails senden",
```

- [ ] **Step 2: Run parity to verify the catalogs are still in lockstep**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS. If a locale fails on the key set, a block was pasted at the wrong nesting depth.

- [ ] **Step 3: Write the failing component test**

Create `components/applications/__tests__/ApplicationSetup.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const createApplication = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  createApplication: (...a: unknown[]) => createApplication(...(a as [])),
}))
const send = vi.fn()
vi.mock('@/actions/applications-review', () => ({
  sendApplicationInvitations: (...a: unknown[]) => send(...(a as [])),
}))

import { ApplicationSetup } from '@/components/applications/ApplicationSetup'
import { standardQuestionnaire } from '@/lib/application-templates/library'

// Today is always inside the calendar's opening month view and is never
// "before today", so it is the one date that is safe to pick whenever the
// suite runs. The day-cell's accessible name is the full date, computed
// independently of lib/dates so this isn't circular.
const now = new Date()
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const longFr = (iso: string) => new Intl.DateTimeFormat('fr', {
  day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(`${iso}T00:00:00`))
const DEADLINE_EMPTY = 'Date limite des candidatures Choisir une date'

function renderSetup(over: Partial<Parameters<typeof ApplicationSetup>[0]> = {}) {
  return renderWithIntl(
    <ApplicationSetup
      exchangeId="ex-1"
      applySlug="france-canada"
      created={false}
      applicationTemplate={null}
      applicationDeadline={null}
      questionCount={55}
      {...over}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  createApplication.mockResolvedValue({ ok: true, doc: standardQuestionnaire() })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('ApplicationSetup — Vierge', () => {
  it('shows the blank state and nothing else', () => {
    renderSetup()
    expect(screen.getByRole('heading', { name: 'Aucune candidature' })).toBeInTheDocument()
    expect(screen.getByText('Choisissez un modèle pour commencer.')).toBeInTheDocument()
    expect(screen.queryByText('Choisissez un modèle')).toBeNull()
  })

  it('the CTA opens the library', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    expect(screen.getByRole('heading', { name: 'Choisissez un modèle' })).toBeInTheDocument()
    expect(screen.getByText('Questionnaire standard')).toBeInTheDocument()
  })

  // ENTERING THE LIBRARY IS NEVER DESTRUCTIVE: the write happens on
  // « Ajouter », not on « Choisir ».
  it('neither opening the library nor choosing a card writes anything', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(createApplication).not.toHaveBeenCalled()
  })
})

describe('ApplicationSetup — Bibliothèque', () => {
  it('keeps « Ajouter la candidature » disabled until both a template and a deadline are chosen', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    const add = screen.getByRole('button', { name: 'Ajouter la candidature' })
    expect(add).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(add).toBeDisabled()                       // template only — not enough
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: longFr(TODAY) }))
    expect(add).toBeEnabled()
  })

  it('creating switches to the created card with no navigation at all', async () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: longFr(TODAY) }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la candidature' }))
    await waitFor(() => expect(createApplication).toHaveBeenCalledWith('ex-1', 'standard', TODAY))
    // The returned doc is enough to render the card — the screen never waits
    // on a server round-trip it cannot observe.
    expect(await screen.findByText('Candidature · Questionnaire standard')).toBeInTheDocument()
    expect(screen.getByText(`55 questions · date limite ${longFr(TODAY)}`)).toBeInTheDocument()
  })

  it('surfaces a refusal as its own message and stays in the library', async () => {
    createApplication.mockResolvedValue({ ok: false, reason: 'deadline_past' })
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: longFr(TODAY) }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la candidature' }))
    expect(await screen.findByText(/une candidature ouverte sur une date passée/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choisissez un modèle' })).toBeInTheDocument()
  })

  it('« Annuler » returns to the blank state', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByRole('heading', { name: 'Aucune candidature' })).toBeInTheDocument()
  })
})

describe('ApplicationSetup — Créée', () => {
  const createdProps = {
    created: true, applicationTemplate: 'standard', applicationDeadline: '2026-06-12',
  }

  it('names the template, counts the questions and offers all three actions', () => {
    renderSetup(createdProps)
    expect(screen.getByText('Candidature · Questionnaire standard')).toBeInTheDocument()
    expect(screen.getByText(`55 questions · date limite ${longFr('2026-06-12')}`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Personnaliser/ })).toHaveAttribute('href', '/applications/questionnaire')
    expect(screen.getByRole('button', { name: 'Changer de modèle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inviter les élèves' })).toBeInTheDocument()
  })

  // A legacy exchange can sit at application_open = true with a null deadline.
  // Never render « date limite » with nothing after it.
  it('drops the deadline clause when there is no deadline', () => {
    renderSetup({ ...createdProps, applicationDeadline: null })
    expect(screen.getByText('55 questions')).toBeInTheDocument()
    expect(screen.queryByText(/date limite/)).toBeNull()
  })

  // NULL means « created before templates existed » — it resolves to standard,
  // never to a blank name.
  it('resolves a null template to the standard one', () => {
    renderSetup({ ...createdProps, applicationTemplate: null })
    expect(screen.getByText('Candidature · Questionnaire standard')).toBeInTheDocument()
  })

  it('the invite dialog carries BOTH methods', () => {
    renderSetup(createdProps)
    fireEvent.click(screen.getByRole('button', { name: 'Inviter les élèves' }))
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/marie@ecole\.fr/)).toBeInTheDocument()
  })

  it('« Changer de modèle » re-enters the library with the deadline pre-filled, and cancelling comes back here', () => {
    renderSetup(createdProps)
    fireEvent.click(screen.getByRole('button', { name: 'Changer de modèle' }))
    expect(screen.getByRole('heading', { name: 'Choisissez un modèle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Date limite des candidatures ${longFr('2026-06-12')}` }))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByText('Candidature · Questionnaire standard')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm vitest run components/applications/__tests__/ApplicationSetup.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/applications/ApplicationSetup"`.

- [ ] **Step 5: Write `TemplateLibrary`**

Create `components/applications/TemplateLibrary.tsx`:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { APPLICATION_TEMPLATES, type TemplateId } from '@/lib/application-templates/library'
import { questionCount } from '@/lib/application-fields'
import { Button } from '@/components/ui/button'

// Purely presentational: a card per library template, and which one is
// selected. It owns no state and calls no server action — the write happens on
// « Ajouter » in ApplicationSetup, so an organizer who opens the library to
// look around and backs out keeps their questionnaire.
//
// Names and descriptions come from the message catalogs keyed by template id,
// so all five locales are covered by construction. Built for N entries with no
// « à venir » placeholder ghosts; APPLICATION_TEMPLATES has one today, so one
// card renders.
export function TemplateLibrary({
  selected, onSelect,
}: {
  selected: TemplateId | null
  onSelect: (id: TemplateId) => void
}) {
  const t = useTranslations('organizer.questionnaire.templates')
  const s = useTranslations('organizer.applications.setup')

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {APPLICATION_TEMPLATES.map(tpl => {
        const active = selected === tpl.id
        return (
          <div
            key={tpl.id}
            className={`rounded-[13px] border bg-card px-4 py-3.5 ${active ? 'border-brand ring-1 ring-brand' : ''}`}
          >
            <p className="m-0 text-[14px] font-semibold text-navy">{t(`${tpl.id}.name`)}</p>
            <p className="m-0 mt-1 text-[12.5px] text-muted-foreground">{t(`${tpl.id}.description`)}</p>
            {/* Counted from the built document, never hardcoded: the template
                is the source of truth for how many questions it carries. */}
            <p className="m-0 mt-1 font-mono text-[11px] uppercase tracking-wide text-tertiary">
              {s('questionCount', { n: questionCount(tpl.build()) })}
            </p>
            <Button
              type="button"
              variant={active ? 'default' : 'outline'}
              onClick={() => onSelect(tpl.id)}
              className="mt-3 h-[34px] text-[12.5px]"
            >
              {active ? s('chosenLabel') : s('chooseCta')}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Write `InviteStudentsDialog`**

Create `components/applications/InviteStudentsDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InviteByEmailForm } from '@/components/applications/InviteByEmailForm'

// Step ② of the setup: both invitation methods in one dialog — the copyable
// /apply/<slug> link and the paste-addresses form. Supersedes both
// InviteByEmailDialog (a 33-line wrapper around the form) and the second half
// of OpenApplicationsDialog.
//
// Nothing here is gated on a "not yet open" state the way OpenApplicationsDialog
// was: this dialog only exists once the application has been created, so
// /apply/<slug> is already live and sendApplicationInvitations already accepts.
export function InviteStudentsDialog({
  exchangeId, applySlug, open, onOpenChange,
}: {
  exchangeId: string
  applySlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer.applications.invite')
  const ta = useTranslations('organizer.applications')
  const [copied, setCopied] = useState(false)

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* best-effort: the field is selectable for manual copy */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">{t('title')}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-students-link">{t('linkHeading')}</Label>
          <div className="flex gap-2">
            <Input
              id="invite-students-link"
              readOnly
              value={applyUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-12"
            />
            <Button type="button" variant="outline" onClick={copy} className="h-12 whitespace-nowrap">
              {copied ? ta('copiedCta') : ta('copyCta')}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-navy">{t('emailHeading')}</span>
          {/* resetKey = the dialog's own open flag, so a stale send summary
              never greets the next opening. */}
          <InviteByEmailForm exchangeId={exchangeId} resetKey={open}>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              {t('close')}
            </Button>
          </InviteByEmailForm>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Write `ApplicationSetup`**

Create `components/applications/ApplicationSetup.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createApplication } from '@/actions/questionnaire'
import { resolveTemplateId, type TemplateId } from '@/lib/application-templates/library'
import { questionCount as countQuestions } from '@/lib/application-fields'
import type { QuestionnaireFailureReason } from '@/lib/questionnaire/result'
import { longDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { TemplateLibrary } from '@/components/applications/TemplateLibrary'
import { InviteStudentsDialog } from '@/components/applications/InviteStudentsDialog'

// The two-step setup, before any candidate exists: pick a template and a
// deadline (which opens the funnel), then invite. Rendered by
// app/(organizer)/applications/page.tsx whenever applicationState() is not
// 'running', so this file never sees the tracking grid and the grid never sees
// this state.
//
// « Bibliothèque » is a client-only mode held here in useState — no route, no
// dialog — because it is a decision in progress, not a state of the exchange.
export function ApplicationSetup({
  exchangeId, applySlug, created, applicationTemplate, applicationDeadline, questionCount,
}: {
  exchangeId: string
  applySlug: string
  created: boolean
  applicationTemplate: string | null
  applicationDeadline: string | null
  questionCount: number
}) {
  const t = useTranslations('organizer.applications.setup')
  const ta = useTranslations('organizer.applications')
  const tq = useTranslations('organizer.questionnaire')
  const c = useTranslations('common')
  const locale = useLocale() as Locale
  const router = useRouter()

  // Server truth, then whatever this session has done since. A successful
  // create returns the built document, so the card can render from local state
  // with no navigation — router.refresh() below only brings the server tree
  // (and the Aperçu) into line.
  const [hasApplication, setHasApplication] = useState(created)
  const [mode, setMode] = useState<'blank' | 'library' | 'created'>(created ? 'created' : 'blank')
  const [templateId, setTemplateId] = useState<TemplateId>(resolveTemplateId(applicationTemplate))
  const [count, setCount] = useState(questionCount)
  // ONE deadline state, shared by the library's picker and the card's summary:
  // that is exactly what makes « Changer de modèle » arrive pre-filled.
  const [deadline, setDeadline] = useState(applicationDeadline ?? '')
  const [picked, setPicked] = useState<TemplateId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  function openLibrary() {
    setPicked(hasApplication ? templateId : null)
    setError(null)
    setMode('library')
  }

  function cancelLibrary() {
    setError(null)
    setMode(hasApplication ? 'created' : 'blank')
  }

  async function submit() {
    if (!picked || !deadline || busy) return
    setBusy(true); setError(null)
    try {
      const res = await createApplication(exchangeId, picked, deadline)
      // Structured outcome, never a thrown message: production redacts those to
      // an opaque digest.
      if (!res.ok) { setError(res.reason); return }
      setTemplateId(picked)
      setCount(countQuestions(res.doc))
      setHasApplication(true)
      setMode('created')
      router.refresh()
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  if (mode === 'blank') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">{ta('empty.title')}</h1>
        <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">{ta('empty.body')}</p>
        <button
          type="button"
          onClick={openLibrary}
          className="mt-6 flex h-[42px] items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          {ta('empty.cta')}
        </button>
      </div>
    )
  }

  if (mode === 'library') {
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="font-display text-2xl font-bold text-navy">{t('libraryTitle')}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{t('libraryBody')}</p>

        <TemplateLibrary selected={picked} onSelect={setPicked} />

        <div className="mt-5 flex flex-col gap-1.5">
          <Label id="create-application-deadline-label" htmlFor="create-application-deadline">
            {t('deadlineLabel')}
          </Label>
          <DateField
            id="create-application-deadline"
            ariaLabelledBy="create-application-deadline-label"
            value={deadline}
            disabled={busy}
            onChange={setDeadline}
            className="h-12"
          />
        </div>

        {error && <p className="mt-3 text-[13px] text-danger-text">{tq(`errors.${error}`)}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={cancelLibrary} className="text-muted-foreground">
            {c('actions.cancel')}
          </Button>
          {/* Both, not just the template: createApplication refuses an absent or
              past deadline, and an « Ajouter » that only ever answers with an
              error is a trap. */}
          <Button type="button" disabled={!picked || !deadline || busy} onClick={() => void submit()}>
            {busy ? t('creating') : t('createCta')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="rounded-[13px] border bg-card px-5 py-4">
        <p className="m-0 text-[15px] font-semibold text-navy">
          {t('cardTitle', { template: tq(`templates.${templateId}.name`) })}
        </p>
        {/* The count-bearing clause only appears when there is a date to bear.
            A legacy exchange can sit at application_open = true with a null
            deadline, and « date limite » with nothing after it is a bug. */}
        <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
          {deadline
            ? t('cardSummary', { n: count, date: longDate(deadline, locale) })
            : t('cardSummaryNoDeadline', { n: count })}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/applications/questionnaire"
            className="flex h-[36px] items-center rounded-[8px] border px-3.5 text-[12.5px] font-semibold text-navy hover:bg-hoverrow"
          >
            {t('customizeCta')}
          </Link>
          {/* Picking any template — including the current one — overwrites, which
              is what absorbs the old « Réinitialiser » into a single control. It
              is safe because createApplication re-checks the same lock. */}
          <Button type="button" variant="outline" onClick={openLibrary} className="h-[36px] text-[12.5px]">
            {t('changeTemplateCta')}
          </Button>
          <Button type="button" onClick={() => setInviteOpen(true)} className="ml-auto h-[36px] text-[12.5px]">
            {t('inviteCta')}
          </Button>
        </div>
      </div>

      <InviteStudentsDialog
        exchangeId={exchangeId}
        applySlug={applySlug}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  )
}
```

- [ ] **Step 8: Run the component test to verify it passes**

Run: `pnpm vitest run components/applications/__tests__/ApplicationSetup.test.tsx`
Expected: PASS (14 tests). If a `Choisir`/`Annuler` button query is ambiguous, check that `common.actions.cancel` is « Annuler » in `messages/fr.json` and that only one template card renders.

- [ ] **Step 9: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all pass. `ApplicationSetup` is not yet rendered by any page — that is Task 5.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add components/applications/TemplateLibrary.tsx components/applications/InviteStudentsDialog.tsx components/applications/ApplicationSetup.tsx components/applications/__tests__/ApplicationSetup.test.tsx messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(applications): template library, two-step setup screens and invite dialog"
```

---

## Task 5: En cours — the deadline line, the slimmed view, the server branch

**Files:**
- Create: `components/applications/ApplicationDeadlineLine.tsx`
- Modify: `components/applications/CandidaturesView.tsx` (whole file), `app/(organizer)/applications/page.tsx:30-50`, `components/applications/__tests__/CandidaturesView.test.tsx`, `messages/{en,fr,es,it,de}.json`
- Delete: `components/applications/__tests__/CandidaturesView.invite.test.tsx`

**Interfaces:**
- Consumes: `applicationState` (Task 2), `ApplicationSetup` (Task 4), `setApplicationOpen` (`actions/exchanges.ts`, unchanged), `getQuestionnaire` / `listApplications` (unchanged).
- Produces:
  - `ApplicationDeadlineLine({ exchangeId, deadline }: { exchangeId: string; deadline: string })`
  - `CandidaturesView` with its new, smaller prop set: `{ apps: AppRow[]; exchangeName: string; exchangeId: string; applicationDeadline: string | null; initialTab?: TabKey }` — `applicationOpen`, `applySlug` and `questionnaire` are **gone**.

- [ ] **Step 1: Add the two copy changes in five locales**

**(a)** Add `deadlineError` under `organizer.applications` (next to `deadlineLabel`):

| locale | value |
|---|---|
| fr | `Impossible d’enregistrer la date limite. Réessayez.` |
| en | `Could not save the deadline. Try again.` |
| es | `No se pudo guardar la fecha límite. Inténtelo de nuevo.` |
| it | `Impossibile salvare la scadenza. Riprova.` |
| de | `Die Frist konnte nicht gespeichert werden. Bitte erneut versuchen.` |

**(b)** Replace `organizer.applications.emptyState`. Today it says « partagez le lien de candidature » — there is no link on this screen any more, and this string is only ever reached in En cours (applications exist, but `listApplications` filtered every row out).

| locale | value |
|---|---|
| fr | `Aucune candidature à afficher pour le moment.` |
| en | `No application to show yet.` |
| es | `Ninguna candidatura que mostrar por ahora.` |
| it | `Nessuna candidatura da mostrare per ora.` |
| de | `Derzeit keine Bewerbung anzuzeigen.` |

Run: `pnpm vitest run messages/__tests__/parity.test.ts` → PASS.

- [ ] **Step 2: Rewrite the failing view test**

In `components/applications/__tests__/CandidaturesView.test.tsx`:

1. Delete the `vi.mock('@/actions/questionnaire', …)` line (line 13) — the view no longer imports it.
2. Delete the `firstOfThisMonthISO` / `firstOfThisMonthLongFr` consts (they only served the removed dialog case).
3. Drop `applicationOpen`, `applySlug` and `questionnaire` from **every** `renderWithIntl` call, replacing e.g.
   `<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" questionnaire={{ questionCount: 55, locked: false, applicationCount: 0 }} />`
   with
   `<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />`.
4. **Delete** these five cases outright — every one asserts a control this task removes:
   - `the toggle closes applications, keeping the current deadline`
   - `shows only the invite CTA when applications never opened and nobody applied`
   - `keeps the grid and the panel once applications are open, even with nobody yet`
   - `existing applications suppress the empty state even if applications never opened`
   - `opening applications from the dialog leaves the empty state without unmounting the dialog`
5. Keep `changing the deadline calls setApplicationOpen with the current open state` but retitle and re-assert it — the third argument is now always `true`:

```tsx
  // Nothing in the redesign ever writes application_open = false. Closing
  // applications early means setting a past deadline, and this line is where
  // that happens — so it always saves `true`, which also self-repairs a legacy
  // exchange left closed.
  it('changing the deadline always saves applications as open', async () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: `Date limite ${longFr('2026-09-01')}` }))
    fireEvent.click(screen.getByRole('button', { name: longFr('2026-09-20') }))
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-20'))
  })

  it('a failed save rolls the date back and says so', async () => {
    setApplicationOpen.mockRejectedValueOnce(new Error('boom'))
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: `Date limite ${longFr('2026-09-01')}` }))
    fireEvent.click(screen.getByRole('button', { name: longFr('2026-09-20') }))
    expect(await screen.findByText('Impossible d’enregistrer la date limite. Réessayez.')).toBeInTheDocument()
    // Rolled back, so re-picking the SAME date still fires a fresh onChange.
    expect(screen.getByRole('button', { name: `Date limite ${longFr('2026-09-01')}` })).toBeInTheDocument()
  })

  it('carries no invitation panel, no open/closed toggle and no questionnaire card', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    expect(screen.queryByText('Candidatures ouvertes')).toBeNull()
    expect(screen.queryByRole('button', { name: /Ouvert/ })).toBeNull()
    expect(screen.queryByText(/Questionnaire de candidature/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Inviter par e-mail' })).toBeNull()
  })

  it('renders the deadline line with a placeholder when the exchange has no deadline', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline={null} />)
    expect(screen.getByRole('button', { name: 'Date limite Choisir une date' })).toBeInTheDocument()
  })
```

6. Add `waitFor` to the `@testing-library/react` import.
7. Absorb the one surviving case from `CandidaturesView.invite.test.tsx` (`the Invités tab shows invited and started rows only`) into this file verbatim except for the props, then delete that file:

```tsx
  it('the Invités tab shows invited and started rows only', () => {
    const tabApps = [
      { id: '1', status: 'invited', submitted_at: null, responded_at: null, data: { email: 'a@x.co' }, email: 'a@x.co' },
      { id: '2', status: 'draft', submitted_at: null, responded_at: null, data: { email: 'b@x.co' }, email: 'b@x.co' },
      { id: '3', status: 'submitted', submitted_at: '2026-01-01', responded_at: null, data: { email: 'c@x.co' }, email: 'c@x.co' },
    ] as AppRow[]
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByText('Invités'))
    expect(screen.getByText('a@x.co')).toBeTruthy()
    expect(screen.getByText('b@x.co')).toBeTruthy()
    expect(screen.queryByText('c@x.co')).toBeNull()
  })
```

```bash
git rm components/applications/__tests__/CandidaturesView.invite.test.tsx
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run components/applications/__tests__/CandidaturesView.test.tsx`
Expected: FAIL — the deadline-line queries find nothing (`Date limite …` still renders inside the panel's `<details>` summary only when expanded, and `deadlineError` is not rendered anywhere).

- [ ] **Step 4: Write `ApplicationDeadlineLine`**

Create `components/applications/ApplicationDeadlineLine.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { setApplicationOpen } from '@/actions/exchanges'
import { DateField } from '@/components/ui/date-field'

// The ONLY configuration control left once applications are running: one
// editable deadline above the grid.
//
// It always saves application_open = true. Nothing in this feature ever writes
// false: closing applications early means setting a past date, which /apply
// already honours (today <= application_deadline). That also self-repairs a
// legacy exchange sitting at application_open = false — the first deadline edit
// reopens its link.
//
// A past date is accepted here ON PURPOSE, unlike createApplication which
// refuses one. Do not "fix" this to match: it is the documented way to close
// applications early.
export function ApplicationDeadlineLine({
  exchangeId, deadline,
}: {
  exchangeId: string
  deadline: string
}) {
  const t = useTranslations('organizer.applications')
  const [value, setValue] = useState(deadline)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function change(next: string) {
    // DateField cannot emit '', so this guard is dead today — but it records
    // why an empty deadline must never be written: doing so would move the
    // funnel back to a state with no closing date at all.
    if (!next) return
    const previous = value
    setValue(next)
    setSaving(true)
    setFailed(false)
    try {
      await setApplicationOpen(exchangeId, true, next)
    } catch {
      // Roll the optimistic value back so re-picking the SAME date still fires
      // a change event — otherwise the only way to retry is a different date.
      setValue(previous)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span id="candidatures-deadline-label">{t('deadlineLabel')}</span>
        <DateField
          ariaLabelledBy="candidatures-deadline-label"
          value={value}
          disabled={saving}
          onChange={(next) => void change(next)}
          className="h-[34px] w-auto min-w-[150px] rounded-[8px] text-[13px] md:text-[13px]"
        />
      </label>
      {failed && <p className="m-0 mt-1.5 text-[12.5px] text-danger-text">{t('deadlineError')}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Slim `CandidaturesView`**

In `components/applications/CandidaturesView.tsx`:

1. Replace the import block (lines 11-19) with:

```tsx
import { acceptApplications, rejectApplications, type AcceptBlock } from '@/actions/applications-review'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'
import { ApplicationDeadlineLine } from '@/components/applications/ApplicationDeadlineLine'
import { GoodNewsBlockNotice } from '@/components/applications/GoodNewsBlockNotice'
```

(`setApplicationOpen` is no longer imported here — it moved into the deadline line.)

2. Replace the signature (lines 25-43) with:

```tsx
// The tracking list, and nothing else. Once applications exist there is nothing
// left to configure: no template line, no copy-link, no invite, no open/closed
// toggle — only the grid, its tabs and one editable deadline. Everything that
// sets an application up now lives in ApplicationSetup, which this file never
// renders and which never renders this one (the page branches server-side).
export function CandidaturesView({
  apps,
  exchangeName,
  exchangeId,
  applicationDeadline,
  initialTab,
}: {
  apps: AppRow[]
  exchangeName: string
  exchangeId: string
  applicationDeadline: string | null
  initialTab?: TabKey
}) {
```

3. Delete these state hooks (lines 48-52): `open`, `deadline`, `savingState`, `openDialog`, `inviteOpen`.
4. Delete `toggleOpen` (141-150), `changeDeadline` (152-164), the `neverOpened` const (169), `handleOpened` (171-174), the `controls` object (176-182) and the `applyUrl` const (93-96).
5. Replace the whole render (lines 184-370) so the fragment, the `neverOpened` branch and the two trailing dialogs are gone, and the deadline line sits above the tabs. The new top of the return:

```tsx
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">{tr('organizer.applications.heading')}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {apps.length === 0
          ? tr('organizer.applications.emptyState')
          : tr('organizer.applications.countSummary', { n: apps.length, exchangeName })}
      </p>

      <ApplicationDeadlineLine exchangeId={exchangeId} deadline={applicationDeadline ?? ''} />

      <div className="flex gap-1.5 bg-subtle rounded-[11px] p-1 w-fit mb-4">
```

…keeping the tab loop, the bulk bar, `bulkBlock`, `bulkResult` and the grid exactly as they are (de-indented by one level), and ending the file with:

```tsx
      </div>
    </div>
  )
}
```

The four deleted components (`InvitationPanel`, `QuestionnaireCard`, `OpenApplicationsDialog`, `InviteByEmailDialog`) must no longer be referenced anywhere in this file. Verify:

```bash
grep -n "InvitationPanel\|QuestionnaireCard\|OpenApplicationsDialog\|InviteByEmailDialog\|setApplicationOpen" components/applications/CandidaturesView.tsx
```

Expected: no output.

- [ ] **Step 6: Branch the page server-side**

Replace `app/(organizer)/applications/page.tsx` lines 30-50 with:

```tsx
  // `applicationCount` deliberately comes from getQuestionnaire, not from
  // apps.length: listApplications filters untouched drafts out of the grid, but
  // ANY application at all locks the questionnaire — and both facts have to
  // agree, or the page would offer « Ajouter » beside a locked questionnaire.
  const { questionCount, applicationCount } = await getQuestionnaire(active.id)
  const state = applicationState({
    applicationOpen: !!active.application_open,
    applicationDeadline: active.application_deadline ?? null,
    applicationCount,
  })

  // Branching HERE, not inside a client component, is the point: the pre-grid
  // states never ship the grid's JavaScript and never run listApplications,
  // which signs a storage URL per candidate photo.
  if (state !== 'running') {
    return (
      <ApplicationSetup
        exchangeId={active.id}
        applySlug={active.apply_slug}
        created={state === 'created'}
        applicationTemplate={active.application_template}
        applicationDeadline={active.application_deadline ?? null}
        questionCount={questionCount}
      />
    )
  }

  const applications = await listApplications(active.id, { withPhotos: true })
  const apps: AppRow[] = applications.map(a => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at,
    data: a.data ?? {}, email: a.email, photoUrl: a.photoUrl ?? null,
  }))
  return (
    <CandidaturesView
      apps={apps}
      exchangeName={active.name}
      exchangeId={active.id}
      applicationDeadline={active.application_deadline ?? null}
      initialTab={parseTab(tab)}
    />
  )
}
```

…and update the imports at the top of that file:

```tsx
import { applicationState } from '@/lib/applications/state'
import { ApplicationSetup } from '@/components/applications/ApplicationSetup'
```

(`getExchanges` already selects `'*'`, so `active.application_template` is typed and populated with no change to `actions/exchanges.ts`.)

- [ ] **Step 7: Run the view test to verify it passes**

Run: `pnpm vitest run components/applications/__tests__/CandidaturesView.test.tsx`
Expected: PASS.

- [ ] **Step 8: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all pass. The four superseded components are now unreferenced but still on disk with their tests, so nothing breaks — Task 6 removes them.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add components/applications/ApplicationDeadlineLine.tsx components/applications/CandidaturesView.tsx components/applications/__tests__/CandidaturesView.test.tsx "app/(organizer)/applications/page.tsx" messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(applications): server-side state branch, deadline-only En cours view"
```

Note: `CandidaturesView.invite.test.tsx` was staged by the `git rm` in Step 2 and rides along in this commit. Per `feedback_git_add_stale_path_aborts`, do **not** name it in the `git add` — one stale pathspec aborts the whole add.

---

## Task 6: Demolition

**Files:**
- Delete: `components/applications/OpenApplicationsDialog.tsx`, `components/applications/InvitationPanel.tsx`, `components/applications/QuestionnaireCard.tsx`, `components/applications/InviteByEmailDialog.tsx` and their four test files
- Modify: `actions/questionnaire.ts` (remove `resetQuestionnaire`), `components/applications/QuestionnaireEditor.tsx:8`, `:105-111`, `:118-123`, `:270-281`, `components/applications/__tests__/QuestionnaireEditor.test.tsx`, `messages/{en,fr,es,it,de}.json`

**Interfaces:**
- Consumes: everything from Tasks 3-5 is in place; `createApplication` is the replacement for `resetQuestionnaire`.
- Produces: nothing new. `resetQuestionnaire` and the `organizer.questionnaire.card`, `organizer.applications.openDialog`, `organizer.applications.panel` blocks cease to exist.

**Spec deviation, deliberate:** the spec says `QuestionnaireCard` was `resetQuestionnaire`'s only caller. It is not — `QuestionnaireEditor.tsx:105` calls it too, from a « Réinitialiser » button at the top of `/applications/questionnaire`. Deleting the action therefore has to remove that button as well, which is consistent with the spec's own reasoning: « Changer de modèle » on the Créée card now *is* the reset, and it is reachable from exactly the same state (the editor is only editable while the questionnaire is unlocked, which is exactly when the Créée card is on screen).

- [ ] **Step 1: Delete the four superseded components and their tests**

```bash
git rm components/applications/OpenApplicationsDialog.tsx \
       components/applications/InvitationPanel.tsx \
       components/applications/QuestionnaireCard.tsx \
       components/applications/InviteByEmailDialog.tsx \
       components/applications/__tests__/OpenApplicationsDialog.test.tsx \
       components/applications/__tests__/InvitationPanel.test.tsx \
       components/applications/__tests__/QuestionnaireCard.test.tsx \
       components/applications/__tests__/InviteByEmailDialog.test.tsx
```

- [ ] **Step 2: Remove the editor's reset button, dialog and handler**

In `components/applications/QuestionnaireEditor.tsx`:

1. Line 8 — drop `resetQuestionnaire` from the import:
```tsx
import { removeQuestion, editCustomQuestion } from '@/actions/questionnaire'
```
2. Line 43 — delete the `const [resetting, setResetting] = useState(false)` hook.
3. Lines 102-111 — delete the whole `onReset` function.
4. Lines 118-123 — replace the header block so the back link stands alone:
```tsx
      <div className="mb-5">
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-navy">
          {t('page.back')}
        </Link>
      </div>
```
   (The reset button is gone: the way back to a pristine template is « Changer de modèle » on the Créée card, which overwrites through `createApplication` and re-checks the same lock.)
5. Lines 270-281 — delete the reset `<Dialog>` entirely.

Verify:
```bash
grep -n "reset\|Reset" components/applications/QuestionnaireEditor.tsx
```
Expected: no output.

- [ ] **Step 3: Drop the editor's reset test case**

In `components/applications/__tests__/QuestionnaireEditor.test.tsx`: delete the `resetQuestionnaire` const and its entry in the `vi.mock('@/actions/questionnaire', …)` factory (lines 9, 15), the `resetQuestionnaire.mockResolvedValue(…)` line in `beforeEach` (line 27), and the whole case that asserts `expect(resetQuestionnaire).toHaveBeenCalledWith('ex-1')` (around line 96).

- [ ] **Step 4: Delete `resetQuestionnaire`**

In `actions/questionnaire.ts`, delete the `resetQuestionnaire` export (it now sits where Task 3 left it, between `editCustomQuestion` and the `bankQuestion`/`listQuestionSuggestions` comment block). Then fix the two comments that reference it as a live escape hatch:

- Line ~164 (`addQuestion`, the photo special case): replace « the organizer's only way back would be `resetQuestionnaire`, discarding every other edit » with « the organizer's only way back would be « Changer de modèle », discarding every other edit ».
- `components/applications/AddQuestionDialog.tsx:71` carries the same stale reference — apply the same wording there.

If `standardQuestionnaire` is now unused in `actions/questionnaire.ts`, keep it: `loadQuestionnaire` still calls it at line 77 for the `null` fallback. Verify with:
```bash
grep -n "standardQuestionnaire\|resetQuestionnaire" actions/questionnaire.ts
```
Expected: exactly one hit, `standardQuestionnaire()` inside `loadQuestionnaire`, plus its import.

- [ ] **Step 5: Delete the dead catalog blocks in five locales**

In each `messages/<locale>.json`, delete:

- `organizer.applications.openDialog` — the whole block (10 keys).
- `organizer.applications.panel` — the whole block (3 keys).
- `organizer.applications.stateOpen` and `organizer.applications.stateClosed` — the toggle's two labels.
- `organizer.applications.linkLabel` — superseded by `invite.linkHeading`.
- `organizer.applications.invite.openCta` — the panel's button.
- `organizer.questionnaire.card` — the whole block (11 keys), including `template` / `templateStandard`, now superseded by `organizer.questionnaire.templates.<id>.name`, and the four `reset*` keys.

Keep `organizer.applications.copyCta` / `copiedCta` (the new invite dialog uses them), `organizer.applications.deadlineLabel` (the deadline line uses it) and all of `organizer.questionnaire.page.*` / `errors.*`.

Guard against a missed reference before running the suite:
```bash
grep -rn "openDialog\|applications.panel\|stateOpen\|stateClosed\|linkLabel\|card\.\(reset\|template\|summary\|locked\|edit\|view\|title\)\|invite.openCta" --include=*.tsx --include=*.ts components app lib | grep -v __tests__
```
Expected: no output.

- [ ] **Step 6: Run the affected suites to verify they pass**

Run: `pnpm vitest run messages/__tests__/parity.test.ts components/applications actions/__tests__/questionnaire.test.ts`
Expected: PASS. A `MISSING_MESSAGE` failure means a component still reads a deleted key — fix the component, never by restoring the key.

- [ ] **Step 7: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all pass. Confirm the size claim from the spec while you are here:
```bash
wc -l components/applications/CandidaturesView.tsx
```
Expected: roughly 270 lines, down from 370.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add actions/questionnaire.ts components/applications/QuestionnaireEditor.tsx components/applications/AddQuestionDialog.tsx components/applications/__tests__/QuestionnaireEditor.test.tsx messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "refactor(applications): remove the superseded panel, dialogs, card and reset path"
```

---

## Task 7: Verification gate and hand-off

**Files:** none modified (documentation of results only).

- [ ] **Step 1: The four gate commands**

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:rls
```

Expected: all four green. `pnpm test:rls` is mandatory here as well as in Task 1 — this branch touches a column's write path.

- [ ] **Step 2: Confirm the smoke suite is untouched**

```bash
pnpm vitest run --version >/dev/null; npx playwright test tests/smoke/portals.spec.ts tests/smoke/apply.spec.ts
```

Expected: PASS with **no edits** to either file. `portals.spec.ts` only asserts `/applications` renders and `apply.spec.ts` exercises the public funnel — both must keep passing unmodified. The seeded demo exchange has `application_open: true` plus a deadline and applications, so `/applications` lands in En cours for the smoke organizer. If `portals.spec.ts` fails, check the seed: a seeded organizer needs `tour_state: 'completed'` or the auto-start tour's swallow layer eats every click (`reference_autostart_tour_blocks_smoke`).

- [ ] **Step 3: Reseed locally and walk the four states in a browser**

```bash
pnpm seed && pnpm dev
```

Log in through `/dev` as the organizer, then verify each state by hand — unit tests cannot cover any of these:

1. **En cours** — the demo exchange: grid + tabs + one deadline line, and *nothing else*. Change the deadline; reload; it stuck.
2. **Vierge** — create a second exchange (`Nouvel échange`), switch to it: « Aucune candidature » + « Ajouter une candidature ».
3. **Bibliothèque → Créée** — click the CTA, choose the standard template, pick a future deadline, « Ajouter la candidature ». The card appears. Then open `/apply/<slug>` in a private window: **the funnel is live** (this is the one thing no unit test proves).
4. **Non-destructive library** — from the card, « Changer de modèle », then « Annuler ». Reload: the questionnaire is unchanged.
5. **Invite** — « Inviter les élèves »: copy the link, and send to one address. (Local sends log to the console; staging sends nothing.)
6. **The lock** — submit an application through `/apply/<slug>`, reload `/applications`: it flipped to En cours, and the template/customize/invite controls are gone for good.

- [ ] **Step 4: Report, do not merge**

Merging to `main` deploys to production and needs Bjorn's explicit confirmation on top of a green gate. Report:

- the four gate commands and their results,
- that `tests/smoke/portals.spec.ts` and `tests/smoke/apply.spec.ts` passed **unmodified**,
- the migration's applied state on local / staging / prod and the stamped version (plus whether a `git mv` was needed),
- the six browser checks above, with the funnel-is-live one (3) and the lock one (6) called out as the load-bearing pair,
- the one deliberate spec deviation: `resetQuestionnaire` had **two** callers, so the editor's « Réinitialiser » button went with it.

---

## Self-Review

**Spec coverage.** Every section of `2026-07-30-application-tab-redesign-design.md` maps to a task:

| Spec section | Task |
|---|---|
| State machine (4 states, derived, no new column) | 2 (`applicationState`), 5 (the page branch) |
| `created ⟺ deadline != null \|\| open \|\| count > 0` | 2 |
| `applicationCount` from `getQuestionnaire`, never `apps.length` | 5 (page), 2 (drift test) |
| Server-side branch, no grid JS / no `listApplications` in pre-grid states | 5 |
| Vierge copy | 4 (catalog) |
| Bibliothèque: card grid, deadline, disabled-until-chosen, « Annuler », non-destructive | 4 |
| Créée: template line, Personnaliser / Changer de modèle / Inviter | 4 |
| En cours: deadline line + tabs + grid only | 5 |
| `alter table exchanges add column application_template text` | 1 |
| `application_fields` materialized at creation | 3 |
| `createApplication` + its five refusal paths + one UPDATE | 3 |
| `resetQuestionnaire` deleted | 6 |
| `setApplicationOpen` survives, called with `open: true` | 5 |
| `getExchanges` carries `application_template` | already true (`select('*')`) — noted in File Structure |
| Template names/descriptions in the catalogs, keyed by id | 4 |
| New files (state.ts, ApplicationSetup, TemplateLibrary, InviteStudentsDialog, ApplicationDeadlineLine) | 2, 4, 5 |
| Deletions (4 components, 4 test files, 3 catalog blocks) | 6 |
| Accepted consequences (never writes `open = false`; two deadline paths differ; legacy self-repair; template chosen once; one application per exchange) | encoded as comments in 3 (`createApplication`) and 5 (`ApplicationDeadlineLine`), plus Global Constraints |
| Tests: state selector, action refusals, setup component, RLS matrix pair, seed, smoke unaffected, migration path | 2, 3, 4, 1, 1, 7, 1 |

**Three deliberate deviations from the spec, all implementing its stated intent:**

1. **`resetQuestionnaire` has two callers, not one.** `QuestionnaireEditor.tsx:105` also calls it. Task 6 removes that button too, because « Changer de modèle » is now the single control the spec says absorbs it, and it is reachable from exactly the same unlocked state.
2. **« Ajouter la candidature » requires a deadline as well as a template.** The spec says "disabled until a card is selected", but `createApplication` refuses an absent deadline as `deadline_past` — a button whose only possible answer is an error is a trap. The disabled condition is `!picked || !deadline`.
3. **The Créée card's question count is computed, so it reads 55, not the spec mock's 54.** `standardQuestionnaire()` carries 54 built-ins **plus the portrait** (asserted by the existing `getQuestionnaire` test). The spec's "54 questions" was illustrative; hardcoding it would be a lie the first time a template differs.

Two smaller judgment calls, both recorded in the tasks that make them: `ApplicationDeadlineLine` surfaces a failed save (the old `changeDeadline` swallowed it into an unhandled rejection), and `organizer.applications.emptyState` loses its "share the application link" clause because that link no longer exists on the En cours screen.

**Placeholder scan.** No `TBD`, no "add validation", no "similar to Task N", no test named without its code. Every message key, prop and function used in a later task is defined verbatim in an earlier one, in all five locales.

**Type consistency check.** `applicationState` takes `{ applicationOpen, applicationDeadline, applicationCount }` in Task 2's test, Task 2's implementation and Task 5's page — same three names, same types. `resolveTemplateId` returns `TemplateId` in Task 2 and is the only thing that narrows `applicationTemplate: string | null` in Task 4, so `templateId` is never widened to `string` at the `templates.${templateId}.name` boundary. `createApplication(exchangeId, templateId, deadline)` has the same three-arg shape in Task 3's test, Task 3's implementation and Task 4's caller. `persist(exchangeId, patch)` is changed once (Task 3) and every one of its five call sites is updated in that same step. `ApplicationSetup`'s prop `questionCount` shadows the imported helper of the same name, so Task 4 imports it as `countQuestions` — the alias is used consistently in the one place it appears.
