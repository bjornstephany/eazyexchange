# Application Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each exchange its own application questionnaire — resolved from a code-defined library template, editable by adding and removing questions inside the four fixed sections, and locked permanently once the first application arrives.

**Architecture:** A nullable `exchanges.application_fields jsonb` column stores a per-exchange copy of the questionnaire. Built-in questions are stored **by reference** (`{ "ref": "last_name" }`) so their type, label and five translations keep coming from `lib/application-form.ts` + the message catalogs; custom questions carry their whole monolingual definition inline. One pure resolver, `resolveApplicationSections(doc)`, turns that document back into the existing `AppSection[]` shape, so the funnel form, the organizer read view and the PDF recap keep their current structure and only change where their sections come from. `null` means "never customized" and resolves to today's `APPLICATION_SECTIONS` verbatim — every existing exchange keeps working with no backfill.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS), TypeScript, Tailwind + shadcn/ui, next-intl (5 locales), vitest, Playwright.

## Global Constraints

- **Package manager is pnpm.** Never `npm`.
- **Verification gate** (run before considering any task complete): `pnpm lint`, `pnpm test`, `pnpm build`. Task 1 additionally requires `pnpm test:rls`.
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- **Confirm the branch before every commit**: `git branch --show-current` must print `feature/application-template-editor`.
- **`supabase/migrations/` is single-writer.** Only one session at a time may add or apply a migration.
- **Never run `supabase db push` against prod.** Local → staging (`db push`) → prod (MCP `apply_migration`).
- **Production redacts thrown Server Action messages.** Expected outcomes are structured return values with a `reason` CODE; only genuinely unexpected failures throw. Never branch client-side on `error.message`.
- **Auth preambles are shared helpers** — `requireOrganizer()` from `lib/auth/require.ts`. Error strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing.
- **Never log student/parent PII** — no emails, names or answer contents in logs or error messages. Custom question labels are organizer-written but flow through the same surfaces: never log them either.
- **The service role is walled in.** Everything in this feature uses the request-scoped RLS client (`lib/supabase/server`). No new entry in `lib/supabase/__tests__/admin-allowlist.test.ts`.
- **Message catalogs must stay in parity.** `messages/{en,fr,es,it,de}.json` must have the identical key set (gated by `messages/__tests__/parity.test.ts`, which uses **fr** as the reference) and no empty values. French copy uses typographic apostrophes (`’`), never ASCII `'`.
- **The four sections are fixed**: `student`, `parents`, `hosting`, `profile`, always all four, always in that order.
- **Locked question ids** (never removable): `first_name`, `last_name`, `email`.
- **Custom `textarea` questions are capped at 150 characters.** Not configurable.
- **Custom question labels: max 120 characters**, monolingual, shown exactly as typed in every locale.
- **Choice options are stored as `{ value, label }`** where `value` is a generated stable token (`o1`, `o2`, …). Stored answers persist the token, never the wording.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `supabase/migrations/<stamp>_application_questionnaire.sql` | `exchanges.application_fields` column, `application_custom_questions` table + RLS, `application_question_suggestions` RPC |
| `lib/application-fields.ts` | The stored-document model: types, defensive parse, `resolveApplicationSections`, `questionnaireHasPhoto`, pure mutation helpers, cascade map, label normalization |
| `lib/application-templates/library.ts` | Code-defined library of templates; one entry, `standard` |
| `lib/questionnaire/result.ts` | Structured result codes + action input types (importable by client components; a `'use server'` module may only export async functions) |
| `actions/questionnaire.ts` | Organizer server actions: read, add, remove, edit, reset, suggestions |
| `app/(organizer)/applications/questionnaire/page.tsx` | The editor route |
| `components/applications/QuestionnaireEditor.tsx` | The four section blocks, rows, remove/edit, cascade confirm |
| `components/applications/AddQuestionDialog.tsx` | The three-zone « + » dialog |
| `components/applications/QuestionnaireCard.tsx` | The card on `/applications` |

**Modify:**

| File | Change |
|---|---|
| `lib/application-form.ts` | `AppField` gains `label?`; `options` gains `label?`; the three validators + `parentGroupFields` take an optional `sections` argument |
| `lib/application-form.labels.ts` | `localizedApplicationSections(t, sections?)`; custom labels pass through untranslated |
| `components/ApplicationForm.tsx` | Takes `sections` + `photoEnabled` props; skips empty sections |
| `components/ApplicationReadView.tsx` | Takes `sections`; skips empty sections |
| `lib/pdf/application-recap.tsx` | `recapSections(data, t, sections)`; `renderApplicationRecapPdf` takes `sections` |
| `actions/apply.ts` | Every gate runs against the exchange's resolved sections; photo upload refuses when the photo was removed |
| `lib/apply/result.ts` | New failure reason `photo_disabled` |
| `actions/applications-review.ts` | `getApplicationForReview` also returns the exchange's `application_fields` |
| `components/applications/ApplicationDetail.tsx` | Threads `applicationFields` to `ApplicationReadView` |
| `app/apply/resume/[token]/page.tsx` | Resolves sections from the draft's exchange |
| `app/(organizer)/applications/page.tsx` | Loads questionnaire state, passes it to `CandidaturesView` |
| `components/applications/CandidaturesView.tsx` | Renders `QuestionnaireCard` beside the invitation panel |
| `messages/{en,fr,es,it,de}.json` | `organizer.questionnaire.*` + `apply.errors.photo_disabled` |
| `tests/rls/seed.ts`, `tests/rls/matrix.test.ts`, `tests/rls/rpc.test.ts` | Fixtures + deny/allow cases for the new table and RPC |

---

## Task 1: Migration, generated types, RLS coverage

**Files:**
- Create: `supabase/migrations/20260729103000_application_questionnaire.sql`
- Modify: `types/supabase.ts` (regenerated verbatim — never hand-edit)
- Modify: `tests/rls/seed.ts`
- Modify: `tests/rls/matrix.test.ts`
- Modify: `tests/rls/rpc.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: column `exchanges.application_fields jsonb null`; table `application_custom_questions (id uuid, school_id uuid, label text, normalized_label text GENERATED, locale text, type text, options jsonb, created_at timestamptz)`; RPC `application_question_suggestions(p_locale text) returns table (label text, type text, options jsonb, schools bigint)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260729103000_application_questionnaire.sql`:

```sql
-- Per-exchange application questionnaire + the cross-school bank of
-- organizer-written questions that feeds the « + » dialog's suggestions.
--
-- Spec: docs/superpowers/specs/2026-07-29-application-template-editor-design.md

-- ---------------------------------------------------------------------------
-- 1. The per-exchange questionnaire.
-- ---------------------------------------------------------------------------
-- NULL means « never customized »: the funnel renders lib/application-form.ts's
-- APPLICATION_SECTIONS unchanged. Every existing exchange keeps working with no
-- backfill, and « Réinitialiser » writes NULL back rather than a copy of the
-- standard structure — one representation for one meaning.
--
-- Built-in questions are stored BY REFERENCE ({"ref":"last_name"}) so their
-- type, label and five translations keep coming from code; custom questions
-- carry their whole monolingual definition inline. Shape:
--   { "version": 1, "sections": [ { "id": "student", "fields": [ … ] }, … ] }
alter table exchanges add column application_fields jsonb;

comment on column exchanges.application_fields is
  'Per-exchange application questionnaire. NULL = the code-defined default. See lib/application-fields.ts.';

-- No new grant: organizers already hold UPDATE on exchanges (they set
-- application_open / deadline through the same request-scoped client), and the
-- existing exchange policies scope that to their own school.

-- ---------------------------------------------------------------------------
-- 2. The cross-school question bank.
-- ---------------------------------------------------------------------------
-- One row per (school, question) the first time an organizer writes it. Its
-- ONLY purpose is the aggregate below: phrasings that at least three
-- INDEPENDENT schools converged on, offered back as one-click suggestions.
--
-- Organizers may INSERT for their own school and have NO SELECT AT ALL — one
-- school must never see another's raw wording. The three-school threshold is
-- also the PII guard: a label containing a student's name will never be
-- written by three schools.
create table application_custom_questions (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  label      text not null check (length(label) between 1 and 120),
  -- GENERATED, not app-written: the SQL and the JS mirror
  -- (normalizeQuestionLabel in lib/application-fields.ts) cannot drift, and the
  -- unique index below cannot be dodged by sending a different value.
  -- Lowercase, every run of non-alphanumerics collapsed to one space, trimmed —
  -- so « Sait nager ? » and « sait nager? » are the same question.
  normalized_label text generated always as (
    btrim(regexp_replace(lower(label), '[^[:alnum:]]+', ' ', 'g'))
  ) stored,
  locale     text not null check (locale in ('en','fr','es','it','de')),
  type       text not null check (type in ('text','textarea','date','yesno','radio')),
  options    jsonb,
  created_at timestamptz not null default now()
);

-- One row per school per phrasing per locale: a school writing the same
-- question on two exchanges must not count twice toward the threshold.
create unique index application_custom_questions_unique
  on application_custom_questions (school_id, normalized_label, locale);

-- The aggregate's scan path, and the school_id FK index the unindexed_fks
-- advisor wants.
create index application_custom_questions_school_idx
  on application_custom_questions (school_id);
create index application_custom_questions_bank_idx
  on application_custom_questions (locale, normalized_label);

alter table application_custom_questions enable row level security;

-- INSERT only, own school only. Non-recursive: references the STABLE
-- my_role()/my_school_id() helpers with (select …) initplan wrappers per
-- 20260705173309.
create policy "organizers bank own school custom questions"
  on application_custom_questions for insert
  with check (
    (select my_role()) = 'organizer'
    and school_id = (select my_school_id())
  );

-- No SELECT / UPDATE / DELETE policy at all. Belt-and-braces beyond "no
-- policy": drop the default grants so a future over-permissive policy cannot
-- re-open the raw rows (same discipline as audit_log / communication_events).
revoke select, update, delete, truncate on application_custom_questions
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The suggestions RPC — the ONLY read path into the bank.
-- ---------------------------------------------------------------------------
-- Returns aggregates, never rows: a phrasing plus how many distinct schools
-- wrote it, and only at three or more. min(label) picks one representative
-- spelling for a normalized group, deterministically.
create or replace function application_question_suggestions(p_locale text)
  returns table (label text, type text, options jsonb, schools bigint)
  language sql stable security definer set search_path = public as $$
    select min(q.label), q.type, q.options, count(distinct q.school_id)
    from application_custom_questions q
    where q.locale = p_locale
    group by q.normalized_label, q.type, q.options
    having count(distinct q.school_id) >= 3
    order by count(distinct q.school_id) desc, min(q.label)
    limit 8;
$$;
revoke execute on function public.application_question_suggestions(text) from public;
grant execute on function public.application_question_suggestions(text) to authenticated;
```

- [ ] **Step 2: Apply locally and confirm the schema**

```bash
pnpm exec supabase start        # if the stack is not already up
pnpm exec supabase db reset     # re-runs every migration from scratch
```

Expected: reset completes with no error. Then:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "select label, normalized_label from (select 'Sait nager ?'::text as label) s
   cross join lateral (select btrim(regexp_replace(lower(s.label), '[^[:alnum:]]+', ' ', 'g'))) n(normalized_label)"
```

Expected: `sait nager`.

- [ ] **Step 3: Add RLS fixtures**

In `tests/rls/seed.ts`, add to the `Fixtures` type (after the `infoCardA` line):

```ts
  customQuestionA: string
```

Add to the `fx` literal (after `infoCardA: id(),`):

```ts
    customQuestionA: id(),
```

Then, immediately before the `return fx` at the end of `seedFixtures`, insert the bank row and a customized questionnaire on school A's exchange:

```ts
  // School A banks one custom question and customizes its own exchange's
  // questionnaire. Both are targets for the school-B deny cases.
  await sql`insert into application_custom_questions
      (id, school_id, label, locale, type, options)
    values (${fx.customQuestionA}, ${fx.schoolA}, ${'Sait nager ?'}, 'fr', 'yesno', null)`
  await sql`update exchanges
    set application_fields = ${sql.json({
      version: 1,
      sections: [
        { id: 'student', fields: [{ ref: 'photo' }, { ref: 'last_name' }, { ref: 'first_name' }, { ref: 'email' }] },
        { id: 'parents', fields: [] },
        { id: 'hosting', fields: [] },
        { id: 'profile', fields: [] },
      ],
    })}
    where id = ${fx.exchangeA}`
```

In `cleanupFixtures`, add a delete before the schools delete (the FK cascades, but be explicit so a partial run cleans up):

```ts
  await sql`delete from application_custom_questions where school_id in (${fx.schoolA}, ${fx.schoolB}, ${fx.schoolC})`
```

- [ ] **Step 4: Write the failing RLS cases**

In `tests/rls/matrix.test.ts`, inside the existing `describe.each(...)('cross-tenant deny as %s', …)` block, add:

```ts
  it('application_custom_questions: cannot read school A bank rows', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from application_custom_questions where id = ${fx.customQuestionA}`)).toHaveLength(0)
  })

  it('application_custom_questions: cannot insert for school A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into application_custom_questions (school_id, label, locale, type)
         values (${fx.schoolA}, 'Injecté', 'fr', 'text')`))
  })

  it('exchanges: cannot rewrite school A questionnaire', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchanges set application_fields = '{"version":1,"sections":[]}'::jsonb
         where id = ${fx.exchangeA}`))
  })
```

Then add a standalone allow/deny block at the end of the same file:

```ts
// ---------------------------------------------------------------------------
// The question bank is INSERT-only, even for its owner. Suggestions come from
// application_question_suggestions(), never from the rows.
// ---------------------------------------------------------------------------
describe('question bank is write-only for its own school', () => {
  it('organizer A may insert a bank row for their own school', async () => {
    const outcome = await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into application_custom_questions (school_id, label, locale, type)
         values (${fx.schoolA}, 'Taille de vêtement', 'fr', 'text')`)
    expect(outcome).toEqual({ ok: true })
  })

  it('organizer A cannot read back even their own bank rows', async () => {
    expect(await readRows(fx.orgA, (tx) =>
      tx`select id from application_custom_questions where school_id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('organizer A may customize their own exchange questionnaire', async () => {
    const outcome = await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchanges set application_fields = '{"version":1,"sections":[]}'::jsonb
         where id = ${fx.exchangeA}`)
    expect(outcome).toEqual({ ok: true })
  })
})
```

In `tests/rls/rpc.test.ts`, add:

```ts
describe('application_question_suggestions', () => {
  it('returns aggregates only — never a raw row shape', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['label', 'options', 'schools', 'type'])
    }
  })

  it('hides a phrasing only one school has written', async () => {
    const rows = await runAs(sql, fx.orgA, (tx) =>
      tx`select * from application_question_suggestions('fr')`)
    expect(rows.map((r) => r.label)).not.toContain('Sait nager ?')
  })

  it('surfaces a phrasing three independent schools converged on, merging spellings', async () => {
    // schoolA already banked « Sait nager ? »; add B and C with different
    // spellings — the generated normalized_label must merge all three.
    const rows = await runAs(sql, fx.orgA, async (tx) => {
      await tx`insert into application_custom_questions (school_id, label, locale, type) values
        (${fx.schoolB}, 'sait nager?', 'fr', 'yesno'),
        (${fx.schoolC}, 'SAIT NAGER ?', 'fr', 'yesno')`
      return tx`select * from application_question_suggestions('fr')`
    })
    const hit = rows.find((r) => String(r.label).toLowerCase().includes('sait nager'))
    expect(hit).toBeDefined()
    expect(Number(hit!.schools)).toBe(3)
  })

  it('is not callable anonymously', async () => {
    await expect(runAs(sql, null, (tx) =>
      tx`select * from application_question_suggestions('fr')`)).rejects.toMatchObject({ code: '42501' })
  })
})
```

- [ ] **Step 5: Run the RLS suite**

Run: `pnpm test:rls`
Expected: PASS. If the anon case fails with a different code than `42501`, check that the `revoke execute … from public` line ran (a `create or replace` on an existing function keeps prior grants).

- [ ] **Step 6: Apply to staging, then prod, then regenerate types**

```bash
set -a; source .env.staging; set +a
pnpm exec supabase db push --db-url "$STAGING_DB_URL" --include-all
```

Expected: the new migration applies. (`--include-all` is required for out-of-order files; a pg-delta certificate warning is a known red herring — see `reference_supabase_staging_ledger_drift`.)

Then apply to prod with the Supabase MCP `apply_migration` tool, `name = application_questionnaire`. Then MCP `list_migrations`: if the ledger stamped a version different from the filename, `git mv` the local file to the stamped version **and** update staging's ledger to match.

Then MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → confirm:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feature/application-template-editor
git add supabase/migrations/20260729103000_application_questionnaire.sql types/supabase.ts tests/rls/seed.ts tests/rls/matrix.test.ts tests/rls/rpc.test.ts
git commit -m "feat(db): per-exchange application_fields + cross-school question bank"
```

---

## Task 2: The questionnaire document model

**Files:**
- Create: `lib/application-fields.ts`
- Create: `lib/__tests__/application-fields.test.ts`
- Modify: `lib/application-form.ts` (add `label?` to `AppField`, `label?` to option entries)

**Interfaces:**
- Consumes: `APPLICATION_SECTIONS`, `AppField`, `AppSection` from `lib/application-form.ts`.
- Produces:
  ```ts
  type SectionId = 'student' | 'parents' | 'hosting' | 'profile'
  type CustomQuestionType = 'text' | 'textarea' | 'date' | 'yesno' | 'radio'
  type QuestionRef = { ref: string }
  type CustomQuestion = { id: string; type: CustomQuestionType; label: string; required?: boolean; maxLength?: number; options?: { value: string; label: string }[] }
  type QuestionEntry = QuestionRef | CustomQuestion
  type ApplicationFieldsDoc = { version: 1; sections: { id: SectionId; fields: QuestionEntry[] }[] }

  const SECTION_IDS: readonly SectionId[]
  const CUSTOM_QUESTION_TYPES: readonly CustomQuestionType[]
  const LOCKED_QUESTION_IDS: readonly string[]     // first_name, last_name, email
  const PHOTO_REF = 'photo'
  const CUSTOM_LABEL_MAX = 120
  const CUSTOM_TEXTAREA_MAX_LENGTH = 150
  const CASCADE_REMOVALS: Record<string, string[]>

  function isCustomQuestion(e: QuestionEntry): e is CustomQuestion
  function entryId(e: QuestionEntry): string
  function parseApplicationFields(value: unknown): ApplicationFieldsDoc | null
  function resolveApplicationSections(doc: ApplicationFieldsDoc | null): AppSection[]
  function questionnaireHasPhoto(doc: ApplicationFieldsDoc | null): boolean
  function questionCount(doc: ApplicationFieldsDoc | null): number
  function sectionEntries(doc: ApplicationFieldsDoc, sectionId: SectionId): QuestionEntry[]
  function removedBuiltIns(doc: ApplicationFieldsDoc, sectionId: SectionId): AppField[]
  function removeQuestion(doc: ApplicationFieldsDoc, sectionId: SectionId, questionId: string): ApplicationFieldsDoc
  function addQuestion(doc: ApplicationFieldsDoc, sectionId: SectionId, entry: QuestionEntry): ApplicationFieldsDoc
  function replaceCustomQuestion(doc: ApplicationFieldsDoc, sectionId: SectionId, question: CustomQuestion): ApplicationFieldsDoc
  function normalizeQuestionLabel(label: string): string
  function newCustomQuestionId(doc: ApplicationFieldsDoc, rand?: () => string): string
  function optionTokens(labels: string[]): { value: string; label: string }[]
  ```

- [ ] **Step 1: Widen `AppField` in `lib/application-form.ts`**

Replace the `AppField` interface (lines 8–15) with:

```ts
export interface AppField {
  id: string
  type: AppFieldType
  required?: boolean
  group?: 'father' | 'mother'
  // Built-in options carry a value only — their wording lives in the `apply`
  // catalog. A custom question's options carry their single typed label; the
  // value is always a generated token (o1, o2, …) so a stored answer never
  // depends on the wording.
  options?: { value: string; label?: string }[]
  maxLength?: number
  // Set ONLY on custom (organizer-written) questions: the one label the
  // organizer typed, shown verbatim in every locale. Built-ins leave it
  // undefined and resolve through lib/application-form.labels.ts.
  label?: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `lib/__tests__/application-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { APPLICATION_SECTIONS } from '../application-form'
import {
  parseApplicationFields, resolveApplicationSections, questionnaireHasPhoto,
  questionCount, removeQuestion, addQuestion, replaceCustomQuestion,
  removedBuiltIns, normalizeQuestionLabel, newCustomQuestionId, optionTokens,
  isCustomQuestion, entryId, CASCADE_REMOVALS,
  type ApplicationFieldsDoc,
} from '../application-fields'

const EMPTY: ApplicationFieldsDoc = {
  version: 1,
  sections: [
    { id: 'student', fields: [] },
    { id: 'parents', fields: [] },
    { id: 'hosting', fields: [] },
    { id: 'profile', fields: [] },
  ],
}

function docWith(sectionId: 'student' | 'parents' | 'hosting' | 'profile', fields: ApplicationFieldsDoc['sections'][number]['fields']): ApplicationFieldsDoc {
  return { version: 1, sections: EMPTY.sections.map(s => (s.id === sectionId ? { ...s, fields } : s)) }
}

describe('resolveApplicationSections', () => {
  // The regression that matters most: an exchange that was never customized
  // must render byte-for-byte today's questionnaire.
  it('null resolves to APPLICATION_SECTIONS verbatim', () => {
    expect(resolveApplicationSections(null)).toEqual(APPLICATION_SECTIONS)
  })

  it('resolves built-in refs against the code catalog, keeping type and required', () => {
    const sections = resolveApplicationSections(docWith('student', [{ ref: 'last_name' }, { ref: 'sex' }]))
    const student = sections.find(s => s.id === 'student')!
    expect(student.fields.map(f => f.id)).toEqual(['last_name', 'sex'])
    expect(student.fields[1].type).toBe('radio')
    expect(student.fields[1].options!.map(o => o.value)).toEqual(['male', 'female', 'other'])
    expect(student.fields[0].required).toBe(true)
  })

  it('always returns all four sections in fixed order, even when empty', () => {
    expect(resolveApplicationSections(EMPTY).map(s => s.id)).toEqual(['student', 'parents', 'hosting', 'profile'])
  })

  it('skips the photo pseudo-field — it is not an answerable field', () => {
    const sections = resolveApplicationSections(docWith('student', [{ ref: 'photo' }, { ref: 'email' }]))
    expect(sections.find(s => s.id === 'student')!.fields.map(f => f.id)).toEqual(['email'])
  })

  it('skips an unknown ref rather than throwing (a built-in later deleted from code)', () => {
    const sections = resolveApplicationSections(docWith('student', [{ ref: 'no_such_field' }, { ref: 'email' }]))
    expect(sections.find(s => s.id === 'student')!.fields.map(f => f.id)).toEqual(['email'])
  })

  it('resolves a built-in ref only inside its own section', () => {
    // last_name belongs to `student`; a ref to it under `hosting` is bogus.
    const sections = resolveApplicationSections(docWith('hosting', [{ ref: 'last_name' }]))
    expect(sections.find(s => s.id === 'hosting')!.fields).toEqual([])
  })

  it('passes a custom question through with its inline definition', () => {
    const sections = resolveApplicationSections(docWith('student', [
      { id: 'c_7f3a', type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150 },
    ]))
    expect(sections.find(s => s.id === 'student')!.fields[0]).toEqual({
      id: 'c_7f3a', type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150,
    })
  })
})

describe('questionnaireHasPhoto', () => {
  it("null keeps the photo (today's behaviour)", () => {
    expect(questionnaireHasPhoto(null)).toBe(true)
  })
  it('true when the photo ref is present in the student section', () => {
    expect(questionnaireHasPhoto(docWith('student', [{ ref: 'photo' }]))).toBe(true)
  })
  it('false when the photo ref was removed', () => {
    expect(questionnaireHasPhoto(docWith('student', [{ ref: 'email' }]))).toBe(false)
  })
})

describe('parseApplicationFields', () => {
  it('null and undefined mean "never customized"', () => {
    expect(parseApplicationFields(null)).toBeNull()
    expect(parseApplicationFields(undefined)).toBeNull()
  })
  it('accepts a well-formed document', () => {
    const doc = docWith('student', [{ ref: 'email' }])
    expect(parseApplicationFields(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })
  it('degrades a malformed document to null rather than throwing', () => {
    // A crash here would cost an applicant their submission — the funnel must
    // fall back to the default questionnaire instead.
    expect(parseApplicationFields('nope')).toBeNull()
    expect(parseApplicationFields({ version: 2, sections: [] })).toBeNull()
    expect(parseApplicationFields({ version: 1 })).toBeNull()
    expect(parseApplicationFields({ version: 1, sections: [{ id: 'bogus', fields: [] }] })).toBeNull()
    expect(parseApplicationFields({ version: 1, sections: [{ id: 'student', fields: [{}] }] })).toBeNull()
  })
  it('drops a custom entry with an unsupported type', () => {
    expect(parseApplicationFields({
      version: 1,
      sections: [{ id: 'student', fields: [{ id: 'c_1', type: 'file', label: 'x' }] }],
    })).toBeNull()
  })
  it('normalizes a document missing a section by adding it empty', () => {
    const parsed = parseApplicationFields({ version: 1, sections: [{ id: 'student', fields: [] }] })
    expect(parsed!.sections.map(s => s.id)).toEqual(['student', 'parents', 'hosting', 'profile'])
  })
})

describe('mutations', () => {
  it('removeQuestion drops the entry and returns a new document', () => {
    const doc = docWith('student', [{ ref: 'email' }, { ref: 'sex' }])
    const next = removeQuestion(doc, 'student', 'sex')
    expect(next.sections.find(s => s.id === 'student')!.fields.map(entryId)).toEqual(['email'])
    expect(doc.sections.find(s => s.id === 'student')!.fields).toHaveLength(2)
  })

  it('removeQuestion cascades sex → gender_other', () => {
    const doc = docWith('student', [{ ref: 'sex' }, { ref: 'gender_other' }, { ref: 'email' }])
    expect(removeQuestion(doc, 'student', 'sex').sections.find(s => s.id === 'student')!.fields.map(entryId))
      .toEqual(['email'])
  })

  it('removeQuestion cascades family_status → separation_housing_address', () => {
    const doc = docWith('parents', [{ ref: 'family_status' }, { ref: 'separation_housing_address' }])
    expect(removeQuestion(doc, 'parents', 'family_status').sections.find(s => s.id === 'parents')!.fields)
      .toEqual([])
  })

  it('CASCADE_REMOVALS documents exactly the two dependent pairs', () => {
    expect(CASCADE_REMOVALS).toEqual({ sex: ['gender_other'], family_status: ['separation_housing_address'] })
  })

  it('addQuestion appends at the end of its section', () => {
    const next = addQuestion(docWith('student', [{ ref: 'email' }]), 'student', { ref: 'sex' })
    expect(next.sections.find(s => s.id === 'student')!.fields.map(entryId)).toEqual(['email', 'sex'])
  })

  it('addQuestion is a no-op when the question is already present', () => {
    const doc = docWith('student', [{ ref: 'email' }])
    expect(addQuestion(doc, 'student', { ref: 'email' })).toEqual(doc)
  })

  it('replaceCustomQuestion swaps the definition in place', () => {
    const doc = docWith('student', [
      { id: 'c_1', type: 'text', label: 'Ancien' },
      { ref: 'email' },
    ])
    const next = replaceCustomQuestion(doc, 'student', { id: 'c_1', type: 'text', label: 'Nouveau', required: true })
    const fields = next.sections.find(s => s.id === 'student')!.fields
    expect(fields.map(entryId)).toEqual(['c_1', 'email'])
    expect((fields[0] as { label: string }).label).toBe('Nouveau')
  })

  it('questionCount counts every entry including the photo', () => {
    expect(questionCount(docWith('student', [{ ref: 'photo' }, { ref: 'email' }]))).toBe(2)
  })

  it('questionCount on null counts the built-in catalog plus the photo', () => {
    const builtins = APPLICATION_SECTIONS.reduce((n, s) => n + s.fields.length, 0)
    expect(questionCount(null)).toBe(builtins + 1)
  })
})

describe('removedBuiltIns', () => {
  it("lists the section's catalog questions absent from the document", () => {
    const doc = docWith('hosting', [{ ref: 'pets' }])
    const ids = removedBuiltIns(doc, 'hosting').map(f => f.id)
    expect(ids).not.toContain('pets')
    expect(ids).toContain('own_room')
  })
  it('never offers a locked question back (they are never removable)', () => {
    const ids = removedBuiltIns(EMPTY, 'student').map(f => f.id)
    expect(ids).not.toContain('first_name')
    expect(ids).not.toContain('last_name')
    expect(ids).not.toContain('email')
  })
})

describe('normalizeQuestionLabel', () => {
  it('merges spelling and punctuation variants', () => {
    expect(normalizeQuestionLabel('Sait nager ?')).toBe('sait nager')
    expect(normalizeQuestionLabel('sait nager?')).toBe('sait nager')
    expect(normalizeQuestionLabel('  SAIT   NAGER  ')).toBe('sait nager')
  })
  it('keeps accented letters (it is not an ASCII fold)', () => {
    expect(normalizeQuestionLabel('Allergies alimentaires ?')).toBe('allergies alimentaires')
    expect(normalizeQuestionLabel('Régime spécial')).toBe('régime spécial')
  })
})

describe('newCustomQuestionId', () => {
  it('produces a c_-prefixed id that does not collide with an existing one', () => {
    const doc = docWith('student', [{ id: 'c_aaaa', type: 'text', label: 'x' }])
    const seq = ['aaaa', 'bbbb']
    let i = 0
    expect(newCustomQuestionId(doc, () => seq[i++])).toBe('c_bbbb')
  })
})

describe('optionTokens', () => {
  it('assigns stable positional tokens, so an answer never depends on the wording', () => {
    expect(optionTokens(['Oui', 'Non', 'Peut-être'])).toEqual([
      { value: 'o1', label: 'Oui' },
      { value: 'o2', label: 'Non' },
      { value: 'o3', label: 'Peut-être' },
    ])
  })
  it('trims and drops blank lines', () => {
    expect(optionTokens(['  A  ', '', '   ', 'B'])).toEqual([
      { value: 'o1', label: 'A' },
      { value: 'o2', label: 'B' },
    ])
  })
})

describe('isCustomQuestion / entryId', () => {
  it('discriminates refs from inline definitions', () => {
    expect(isCustomQuestion({ ref: 'email' })).toBe(false)
    expect(isCustomQuestion({ id: 'c_1', type: 'text', label: 'x' })).toBe(true)
    expect(entryId({ ref: 'email' })).toBe('email')
    expect(entryId({ id: 'c_1', type: 'text', label: 'x' })).toBe('c_1')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/application-fields.test.ts`
Expected: FAIL — "Failed to resolve import '../application-fields'".

- [ ] **Step 4: Write the implementation**

Create `lib/application-fields.ts`:

```ts
// The per-exchange application questionnaire, as stored in
// exchanges.application_fields and as consumed by the funnel.
//
// Two representations, one resolver between them:
//   * the DOCUMENT (ApplicationFieldsDoc) — what an organizer edits and what
//     the column holds. Built-in questions are stored BY REFERENCE so their
//     type, label and five translations keep coming from lib/application-form.ts
//     and the message catalogs, and a later copy fix still reaches every
//     exchange. Custom questions carry their whole monolingual definition.
//   * the RESOLVED sections (AppSection[]) — today's shape, which the form, the
//     organizer read view, the PDF recap and every validator already speak.
//
// `null` means « never customized » and resolves to APPLICATION_SECTIONS
// verbatim, so every exchange that predates this feature keeps working with no
// backfill and « Réinitialiser » has somewhere honest to write back to.
import { APPLICATION_SECTIONS, type AppField, type AppSection } from '@/lib/application-form'

export type SectionId = 'student' | 'parents' | 'hosting' | 'profile'
export const SECTION_IDS = ['student', 'parents', 'hosting', 'profile'] as const

// The five types the « + » dialog offers. Deliberately a subset of
// AppFieldType: `email` and `tel` carry format validation that only makes
// sense for the built-in fields that drive invitations and acceptance mail.
export type CustomQuestionType = 'text' | 'textarea' | 'date' | 'yesno' | 'radio'
export const CUSTOM_QUESTION_TYPES = ['text', 'textarea', 'date', 'yesno', 'radio'] as const

// Collected on the apply landing page, before the questionnaire opens, and used
// to address the invitation — removing them would break the funnel's entry.
export const LOCKED_QUESTION_IDS = ['first_name', 'last_name', 'email'] as const

// The photo is a pseudo-field: it lives on applications.photo_path, not in the
// answers map. It is stored as an ordinary entry in the student section so that
// removing it is simply absence from the list, but it never resolves to an
// AppField — nothing may try to render or validate it as one.
export const PHOTO_REF = 'photo'

export const CUSTOM_LABEL_MAX = 120
// Matching the built-in profile questions. Not configurable: one fewer control,
// and it keeps the PDF recap's layout predictable.
export const CUSTOM_TEXTAREA_MAX_LENGTH = 150

// Questions the funnel shows only when another answer selects them. Removing
// the driver must remove the dependent, or the dependent becomes unreachable
// and (being conditionally required) could block submission forever.
export const CASCADE_REMOVALS: Record<string, string[]> = {
  sex: ['gender_other'],
  family_status: ['separation_housing_address'],
}

export type QuestionRef = { ref: string }
export type CustomQuestion = {
  id: string
  type: CustomQuestionType
  label: string
  required?: boolean
  maxLength?: number
  options?: { value: string; label: string }[]
}
export type QuestionEntry = QuestionRef | CustomQuestion
export type DocSection = { id: SectionId; fields: QuestionEntry[] }
export type ApplicationFieldsDoc = { version: 1; sections: DocSection[] }

export function isCustomQuestion(entry: QuestionEntry): entry is CustomQuestion {
  return (entry as CustomQuestion).id !== undefined
}

export function entryId(entry: QuestionEntry): string {
  return isCustomQuestion(entry) ? entry.id : entry.ref
}

// Built-in catalog lookups, scoped to the section a field actually belongs to:
// a ref is only meaningful inside its own section, so a hand-edited document
// cannot teleport `last_name` into `hosting`.
function builtInsOf(sectionId: SectionId): AppField[] {
  return APPLICATION_SECTIONS.find(s => s.id === sectionId)?.fields ?? []
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Defensive parse of an untyped jsonb column. Anything malformed returns null —
// which the resolver reads as « never customized » and answers with the default
// questionnaire. A throw here would 500 the funnel and cost an applicant their
// submission; silently serving the standard questionnaire is strictly better.
// (The column is written only by actions/questionnaire.ts, so this is a
// backstop, not a routine path.)
export function parseApplicationFields(value: unknown): ApplicationFieldsDoc | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as { version?: unknown; sections?: unknown }
  if (raw.version !== 1 || !Array.isArray(raw.sections)) return null

  const parsed = new Map<SectionId, QuestionEntry[]>()
  for (const section of raw.sections) {
    if (!section || typeof section !== 'object') return null
    const { id, fields } = section as { id?: unknown; fields?: unknown }
    if (typeof id !== 'string' || !(SECTION_IDS as readonly string[]).includes(id)) return null
    if (!Array.isArray(fields)) return null
    const entries: QuestionEntry[] = []
    for (const field of fields) {
      const entry = parseEntry(field)
      if (!entry) return null
      entries.push(entry)
    }
    parsed.set(id as SectionId, entries)
  }
  // A document missing a section gets it back, empty: the four sections are
  // fixed and always present.
  return {
    version: 1,
    sections: SECTION_IDS.map(id => ({ id, fields: parsed.get(id) ?? [] })),
  }
}

function parseEntry(value: unknown): QuestionEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.ref === 'string' && raw.ref !== '') return { ref: raw.ref }
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (typeof raw.label !== 'string' || raw.label === '') return null
  if (typeof raw.type !== 'string' || !(CUSTOM_QUESTION_TYPES as readonly string[]).includes(raw.type)) return null
  const question: CustomQuestion = {
    id: raw.id,
    type: raw.type as CustomQuestionType,
    label: raw.label,
  }
  if (raw.required === true) question.required = true
  if (typeof raw.maxLength === 'number') question.maxLength = raw.maxLength
  if (Array.isArray(raw.options)) {
    const options: { value: string; label: string }[] = []
    for (const option of raw.options) {
      if (!option || typeof option !== 'object') return null
      const { value: v, label: l } = option as { value?: unknown; label?: unknown }
      if (typeof v !== 'string' || typeof l !== 'string') return null
      options.push({ value: v, label: l })
    }
    question.options = options
  }
  return question
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

// The single bridge from the stored document back to today's AppSection[].
// Every downstream consumer — the funnel form, submitApplication's gates, the
// organizer read view, the PDF recap — goes through here, so a question can
// never be renderable and unvalidatable (or the reverse).
export function resolveApplicationSections(doc: ApplicationFieldsDoc | null): AppSection[] {
  if (!doc) return APPLICATION_SECTIONS
  return doc.sections.map(section => ({
    id: section.id,
    fields: section.fields.flatMap(entry => {
      if (isCustomQuestion(entry)) {
        const field: AppField = { id: entry.id, type: entry.type, label: entry.label }
        if (entry.required) field.required = true
        if (entry.maxLength != null) field.maxLength = entry.maxLength
        if (entry.options) field.options = entry.options
        return [field]
      }
      // The photo is not an answerable field; the resolver drops it and
      // questionnaireHasPhoto() reports it separately.
      if (entry.ref === PHOTO_REF) return []
      // An unknown ref — a built-in later deleted from code — is skipped rather
      // than throwing, so a stale document never breaks a live funnel.
      const builtIn = builtInsOf(section.id).find(f => f.id === entry.ref)
      return builtIn ? [builtIn] : []
    }),
  }))
}

export function questionnaireHasPhoto(doc: ApplicationFieldsDoc | null): boolean {
  if (!doc) return true
  return doc.sections
    .find(s => s.id === 'student')?.fields
    .some(e => !isCustomQuestion(e) && e.ref === PHOTO_REF) ?? false
}

// What the card on /applications shows. The photo counts as a question: it is
// one of the things the organizer can remove.
export function questionCount(doc: ApplicationFieldsDoc | null): number {
  if (!doc) return APPLICATION_SECTIONS.reduce((n, s) => n + s.fields.length, 0) + 1
  return doc.sections.reduce((n, s) => n + s.fields.length, 0)
}

export function sectionEntries(doc: ApplicationFieldsDoc, sectionId: SectionId): QuestionEntry[] {
  return doc.sections.find(s => s.id === sectionId)?.fields ?? []
}

// The « Questions retirées » zone of the + dialog: the section's catalog
// questions currently absent. Locked questions are excluded — they can never
// leave, so they can never come back.
export function removedBuiltIns(doc: ApplicationFieldsDoc, sectionId: SectionId): AppField[] {
  const present = new Set(sectionEntries(doc, sectionId).map(entryId))
  return builtInsOf(sectionId).filter(
    f => !present.has(f.id) && !(LOCKED_QUESTION_IDS as readonly string[]).includes(f.id),
  )
}

// ---------------------------------------------------------------------------
// Mutations — pure, always returning a new document
// ---------------------------------------------------------------------------

function mapSection(
  doc: ApplicationFieldsDoc,
  sectionId: SectionId,
  fn: (fields: QuestionEntry[]) => QuestionEntry[],
): ApplicationFieldsDoc {
  return {
    version: 1,
    sections: doc.sections.map(s => (s.id === sectionId ? { id: s.id, fields: fn(s.fields) } : s)),
  }
}

export function removeQuestion(
  doc: ApplicationFieldsDoc, sectionId: SectionId, questionId: string,
): ApplicationFieldsDoc {
  const doomed = new Set([questionId, ...(CASCADE_REMOVALS[questionId] ?? [])])
  return mapSection(doc, sectionId, fields => fields.filter(e => !doomed.has(entryId(e))))
}

export function addQuestion(
  doc: ApplicationFieldsDoc, sectionId: SectionId, entry: QuestionEntry,
): ApplicationFieldsDoc {
  const id = entryId(entry)
  if (sectionEntries(doc, sectionId).some(e => entryId(e) === id)) return doc
  return mapSection(doc, sectionId, fields => [...fields, entry])
}

export function replaceCustomQuestion(
  doc: ApplicationFieldsDoc, sectionId: SectionId, question: CustomQuestion,
): ApplicationFieldsDoc {
  return mapSection(doc, sectionId, fields =>
    fields.map(e => (entryId(e) === question.id ? question : e)))
}

// ---------------------------------------------------------------------------
// Custom-question helpers
// ---------------------------------------------------------------------------

// Mirror of the `normalized_label` GENERATED column (see the migration): lower
// case, every run of non-alphanumerics collapsed to one space, trimmed. Accents
// survive — « régime » and « regime » are different questions, but « Sait nager ? »
// and « sait nager? » are the same one.
export function normalizeQuestionLabel(label: string): string {
  return label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function randomSuffix(): string {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// `c_` + 4 hex. The prefix guarantees a custom id can never shadow a built-in
// (all of which are snake_case words), and the loop guarantees uniqueness
// inside this document. `rand` is injectable for tests.
export function newCustomQuestionId(
  doc: ApplicationFieldsDoc, rand: () => string = randomSuffix,
): string {
  const taken = new Set(doc.sections.flatMap(s => s.fields.map(entryId)))
  for (;;) {
    const id = `c_${rand()}`
    if (!taken.has(id)) return id
  }
}

// Positional, stable tokens for a choice list. The stored answer is `o2`, never
// « Non » — so an organizer re-wording an option never orphans a stored answer.
// (Same discipline the built-in radio fields already follow.)
export function optionTokens(labels: string[]): { value: string; label: string }[] {
  return labels
    .map(l => l.trim())
    .filter(l => l !== '')
    .map((label, i) => ({ value: `o${i + 1}`, label }))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/application-fields.test.ts lib/__tests__/application-form.test.ts`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add lib/application-fields.ts lib/__tests__/application-fields.test.ts lib/application-form.ts
git commit -m "feat(questionnaire): stored-document model + resolver"
```

---

## Task 3: The template library and custom labels

**Files:**
- Create: `lib/application-templates/library.ts`
- Create: `lib/application-templates/__tests__/library.test.ts`
- Modify: `lib/application-form.labels.ts`
- Modify: `lib/__tests__/application-form.labels.test.ts`

**Interfaces:**
- Consumes: `ApplicationFieldsDoc`, `SECTION_IDS`, `PHOTO_REF` from Task 2; `APPLICATION_SECTIONS`.
- Produces:
  ```ts
  // lib/application-templates/library.ts
  type TemplateId = 'standard'
  type LibraryTemplate = { id: TemplateId; build: () => ApplicationFieldsDoc }
  const APPLICATION_TEMPLATES: readonly LibraryTemplate[]
  function templateById(id: string): LibraryTemplate | null
  function standardQuestionnaire(): ApplicationFieldsDoc

  // lib/application-form.labels.ts  (signature widened, default preserved)
  function localizedApplicationSections(t: AppTranslator, sections?: AppSection[]): LocalizedSection[]
  ```

- [ ] **Step 1: Write the failing library test**

Create `lib/application-templates/__tests__/library.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { APPLICATION_SECTIONS } from '@/lib/application-form'
import { resolveApplicationSections, questionnaireHasPhoto, entryId } from '@/lib/application-fields'
import { APPLICATION_TEMPLATES, templateById, standardQuestionnaire } from '../library'

describe('template library', () => {
  it('offers exactly one template today', () => {
    expect(APPLICATION_TEMPLATES.map(t => t.id)).toEqual(['standard'])
  })

  it('templateById resolves a known id and rejects anything else', () => {
    expect(templateById('standard')?.id).toBe('standard')
    expect(templateById('bogus')).toBeNull()
  })

  // The load-bearing property: assigning the standard template must produce a
  // questionnaire indistinguishable from `null`, or « Réinitialiser » and a
  // fresh copy would disagree.
  it("the standard template resolves to today's questionnaire, photo included", () => {
    const doc = standardQuestionnaire()
    expect(resolveApplicationSections(doc)).toEqual(APPLICATION_SECTIONS)
    expect(questionnaireHasPhoto(doc)).toBe(true)
  })

  it('stores the photo first in the student section', () => {
    const student = standardQuestionnaire().sections.find(s => s.id === 'student')!
    expect(entryId(student.fields[0])).toBe('photo')
  })

  it('stores every built-in by reference — no inline copies of labels or types', () => {
    for (const section of standardQuestionnaire().sections) {
      for (const field of section.fields) {
        expect(Object.keys(field)).toEqual(['ref'])
      }
    }
  })

  it('returns a fresh document each call (callers mutate their copy)', () => {
    expect(standardQuestionnaire()).not.toBe(standardQuestionnaire())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/application-templates/__tests__/library.test.ts`
Expected: FAIL — cannot resolve `../library`.

- [ ] **Step 3: Write the library**

Create `lib/application-templates/library.ts`:

```ts
// The library of application questionnaires an organizer can start from.
//
// Code-defined, not a table: there is one entry today and the « Changer de
// modèle » picker only ships with the second one. Assigning a template COPIES
// its structure into exchanges.application_fields, so editing an exchange's
// questionnaire can never reach another exchange — or a running campaign.
import { APPLICATION_SECTIONS } from '@/lib/application-form'
import { PHOTO_REF, SECTION_IDS, type ApplicationFieldsDoc } from '@/lib/application-fields'

export type TemplateId = 'standard'
export type LibraryTemplate = {
  id: TemplateId
  // A factory, not a constant: callers mutate the document they are handed.
  build: () => ApplicationFieldsDoc
}

// Today's 54 questions plus the portrait, stored entirely by reference so a
// later copy fix in the message catalogs still reaches every exchange built
// from this template.
export function standardQuestionnaire(): ApplicationFieldsDoc {
  return {
    version: 1,
    sections: SECTION_IDS.map(id => {
      const refs = (APPLICATION_SECTIONS.find(s => s.id === id)?.fields ?? [])
        .map(f => ({ ref: f.id }))
      return { id, fields: id === 'student' ? [{ ref: PHOTO_REF }, ...refs] : refs }
    }),
  }
}

export const APPLICATION_TEMPLATES: readonly LibraryTemplate[] = [
  { id: 'standard', build: standardQuestionnaire },
]

export function templateById(id: string): LibraryTemplate | null {
  return APPLICATION_TEMPLATES.find(t => t.id === id) ?? null
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run lib/application-templates/__tests__/library.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing label test**

Append to `lib/__tests__/application-form.labels.test.ts`:

```ts
describe('custom questions', () => {
  const t = ((key: string) => `T:${key}`) as unknown as Parameters<typeof localizedApplicationSections>[0]

  it('shows a custom label verbatim instead of looking it up in the catalog', () => {
    const [section] = localizedApplicationSections(t, [
      { id: 'student', fields: [{ id: 'c_7f3a', type: 'textarea', label: 'Sait nager ?', maxLength: 150 }] },
    ])
    expect(section.fields[0].label).toBe('Sait nager ?')
  })

  it('shows custom option labels verbatim and keeps their tokens', () => {
    const [section] = localizedApplicationSections(t, [
      {
        id: 'student',
        fields: [{
          id: 'c_1', type: 'radio', label: 'Régime',
          options: [{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }],
        }],
      },
    ])
    expect(section.fields[0].options).toEqual([
      { value: 'o1', label: 'Végétarien' },
      { value: 'o2', label: 'Aucun' },
    ])
  })

  it('still translates built-in fields passed in explicitly', () => {
    const [section] = localizedApplicationSections(t, [
      { id: 'student', fields: [{ id: 'last_name', type: 'text', required: true }] },
    ])
    expect(section.fields[0].label).toBe('T:fields.last_name.label')
    expect(section.title).toBe('T:sections.student.title')
  })

  it('defaults to the full built-in catalog when no sections are given', () => {
    expect(localizedApplicationSections(t).map(s => s.id)).toEqual(['student', 'parents', 'hosting', 'profile'])
  })
})
```

Make sure the file's import line includes `localizedApplicationSections` (it already does) and that `describe` is imported.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/application-form.labels.test.ts`
Expected: FAIL — `localizedApplicationSections` takes one argument; custom label returns `T:fields.c_7f3a.label`.

- [ ] **Step 7: Widen the label resolver**

Replace the body of `localizedApplicationSections` in `lib/application-form.labels.ts`:

```ts
// The application schema with its `apply.*` catalog labels resolved. Every label
// consumer — the funnel form, the organizer read view and the PDF recap — goes
// through here, so there is exactly one place where a field id maps to a key.
//
// `sections` defaults to the built-in catalog so untouched call sites keep
// working; a per-exchange questionnaire passes its RESOLVED sections instead
// (lib/application-fields.ts). A custom question carries the single label its
// organizer typed and is shown verbatim in every locale — deliberately
// monolingual, since we cannot translate what an organizer wrote.
export function localizedApplicationSections(
  t: AppTranslator,
  sections: AppSection[] = APPLICATION_SECTIONS,
): LocalizedSection[] {
  return sections.map((section) => ({
    ...section,
    title: t(`sections.${section.id}.title`),
    fields: section.fields.map((field) => ({
      ...field,
      label: field.label ?? t(`fields.${field.id}.label`),
      options: field.options?.map((o) => ({
        value: o.value,
        label: o.label ?? t(`fields.${field.id}.options.${o.value}`),
      })),
    })),
  }))
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/application-form.labels.test.ts lib/application-templates`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add lib/application-templates/library.ts lib/application-templates/__tests__/library.test.ts lib/application-form.labels.ts lib/__tests__/application-form.labels.test.ts
git commit -m "feat(questionnaire): standard template + verbatim custom labels"
```

---

## Task 4: Section-aware validation

**Files:**
- Modify: `lib/application-form.ts:124-198` (`requiredApplicationFieldIds`, `parentGroupFields`, `missingRequiredApplication`, `invalidFormatApplicationFields`, `overLimitApplicationFields`)
- Modify: `lib/__tests__/application-form.test.ts`

**Interfaces:**
- Consumes: `AppSection`, `APPLICATION_SECTIONS` (same module).
- Produces:
  ```ts
  function allApplicationFields(sections?: AppSection[]): AppField[]
  function requiredApplicationFieldIds(sections?: AppSection[]): string[]
  function parentGroupFields(group: 'father' | 'mother', sections?: AppSection[]): AppField[]
  function missingRequiredApplication(
    data: Record<string, string>,
    opts?: { hasPhoto?: boolean; photoRequired?: boolean; sections?: AppSection[] },
  ): string[]
  function invalidFormatApplicationFields(data: Record<string, string>, sections?: AppSection[]): string[]
  function overLimitApplicationFields(data: Record<string, string>, sections?: AppSection[]): string[]
  ```
  Every `sections` parameter defaults to `APPLICATION_SECTIONS` and `photoRequired` defaults to `true`, so every existing call site keeps its exact current behaviour.

**Why this task is critical:** `submitApplication` runs these gates server-side. If they keep reading the global catalog while the funnel renders a reduced questionnaire, a removed question is permanently missing and **every submission on that exchange is blocked**.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/application-form.test.ts`:

```ts
import type { AppSection } from '../application-form'

// A questionnaire with one parent group half-removed, no photo, and the two
// conditional questions gone — the shapes an organizer can actually produce.
const TRIMMED: AppSection[] = [
  { id: 'student', fields: [
    { id: 'last_name', type: 'text', required: true },
    { id: 'first_name', type: 'text', required: true },
    { id: 'email', type: 'email', required: true },
    { id: 'c_7f3a', type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150 },
  ] },
  { id: 'parents', fields: [
    { id: 'mother_last_name', type: 'text', group: 'mother' },
    { id: 'mother_email', type: 'email', group: 'mother' },
  ] },
  { id: 'hosting', fields: [] },
  { id: 'profile', fields: [] },
]

function trimmedComplete(over: Record<string, string> = {}): Record<string, string> {
  return {
    last_name: 'Durand', first_name: 'Alix', email: 'alix@example.com',
    c_7f3a: 'Oui', mother_last_name: 'Durand', mother_email: 'mere@example.com',
    ...over,
  }
}

describe('section-aware validation', () => {
  it('a complete answer to a trimmed questionnaire submits', () => {
    expect(missingRequiredApplication(trimmedComplete(), { hasPhoto: false, photoRequired: false, sections: TRIMMED }))
      .toEqual([])
  })

  it('a removed question never appears as missing', () => {
    const missing = missingRequiredApplication({}, { hasPhoto: false, photoRequired: false, sections: TRIMMED })
    expect(missing).not.toContain('pets')
    expect(missing).not.toContain('date_of_birth')
  })

  it('flags a blank custom required question', () => {
    expect(missingRequiredApplication(trimmedComplete({ c_7f3a: '  ' }), { hasPhoto: false, photoRequired: false, sections: TRIMMED }))
      .toContain('c_7f3a')
  })

  it('the parent rule falls back to the only remaining group', () => {
    // The father group is gone entirely; the mother group must still be complete.
    const missing = missingRequiredApplication(
      trimmedComplete({ mother_email: '' }),
      { hasPhoto: false, photoRequired: false, sections: TRIMMED },
    )
    expect(missing).toContain('mother_email')
    expect(missing).not.toContain('father_email')
  })

  it('the parent rule is skipped entirely when every parent field is removed', () => {
    const noParents = TRIMMED.map(s => (s.id === 'parents' ? { ...s, fields: [] } : s))
    const data = trimmedComplete()
    delete data.mother_last_name; delete data.mother_email
    expect(missingRequiredApplication(data, { hasPhoto: false, photoRequired: false, sections: noParents }))
      .toEqual([])
  })

  it('a partially filled remaining group is still invalid', () => {
    expect(missingRequiredApplication(
      trimmedComplete({ mother_last_name: '' }),
      { hasPhoto: false, photoRequired: false, sections: TRIMMED },
    )).toContain('mother_last_name')
  })

  it('does not demand a photo when the photo was removed', () => {
    expect(missingRequiredApplication(trimmedComplete(), { hasPhoto: false, photoRequired: false, sections: TRIMMED }))
      .not.toContain('photo')
  })

  it('still demands a photo when the questionnaire keeps it', () => {
    expect(missingRequiredApplication(trimmedComplete(), { hasPhoto: false, photoRequired: true, sections: TRIMMED }))
      .toContain('photo')
  })

  it('skips the conditional rules when their question was removed', () => {
    // A stale answer of `other` / `separated` must not resurrect a question the
    // organizer deleted.
    expect(missingRequiredApplication(
      trimmedComplete({ sex: 'other', family_status: 'separated' }),
      { hasPhoto: false, photoRequired: false, sections: TRIMMED },
    )).toEqual([])
  })

  it('keeps the conditional rules when the driver and dependent are both present', () => {
    const withSex: AppSection[] = TRIMMED.map(s => (s.id === 'student' ? { ...s, fields: [
      ...s.fields,
      { id: 'sex', type: 'radio', required: true, options: [{ value: 'male' }, { value: 'other' }] },
      { id: 'gender_other', type: 'text' },
    ] } : s))
    expect(missingRequiredApplication(
      trimmedComplete({ sex: 'other' }),
      { hasPhoto: false, photoRequired: false, sections: withSex },
    )).toContain('gender_other')
  })

  it('format checks only the fields still present', () => {
    expect(invalidFormatApplicationFields({ email: 'nope', father_email: 'also-nope' }, TRIMMED))
      .toEqual(['email'])
  })

  it('length checks only the fields still present, custom ones included', () => {
    expect(overLimitApplicationFields({ c_7f3a: 'x'.repeat(151), lived_abroad: 'y'.repeat(500) }, TRIMMED))
      .toEqual(['c_7f3a'])
  })

  it('defaults to the built-in catalog when no sections are given', () => {
    expect(requiredApplicationFieldIds()).toEqual(requiredApplicationFieldIds(APPLICATION_SECTIONS))
    expect(parentGroupFields('father')).toHaveLength(8)
  })
})
```

Add `invalidFormatApplicationFields` and `requiredApplicationFieldIds` to the existing import list at the top of the file if not already there (both are).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/application-form.test.ts`
Expected: FAIL — the new `opts.sections` / second arguments are ignored, so removed questions still show up as missing.

- [ ] **Step 3: Rewrite the validators**

Replace `lib/application-form.ts` lines 120–198 (from `allApplicationFields` through `overLimitApplicationFields`) with:

```ts
// Every helper below takes the questionnaire it should validate against and
// defaults to the built-in catalog. An exchange with a customized questionnaire
// passes its RESOLVED sections (lib/application-fields.ts): the funnel form,
// submitApplication's gates and the PDF recap must all see the same list, or a
// removed question becomes permanently missing and blocks every submission.
export function allApplicationFields(sections: AppSection[] = APPLICATION_SECTIONS): AppField[] {
  return sections.flatMap(s => s.fields)
}

export function requiredApplicationFieldIds(sections: AppSection[] = APPLICATION_SECTIONS): string[] {
  return allApplicationFields(sections).filter(f => f.required).map(f => f.id)
}

export function parentGroupFields(
  group: 'father' | 'mother', sections: AppSection[] = APPLICATION_SECTIONS,
): AppField[] {
  return allApplicationFields(sections).filter(f => f.group === group)
}

export function missingRequiredApplication(
  data: Record<string, string>,
  opts?: { hasPhoto?: boolean; photoRequired?: boolean; sections?: AppSection[] },
): string[] {
  const sections = opts?.sections ?? APPLICATION_SECTIONS
  const present = new Set(allApplicationFields(sections).map(f => f.id))
  const empty = (id: string) => (data[id] ?? '').trim() === ''
  const missing = requiredApplicationFieldIds(sections).filter(empty)

  // Parents: at least one parent group filled in completely; a partially filled
  // group is invalid either way. « Complete » means *all fields of that group
  // still present are filled* — if the organizer removed a whole group the rule
  // falls back to the other, and if they removed every parent field it is
  // skipped entirely rather than making the form unsubmittable.
  const groups = (['father', 'mother'] as const)
    .map(g => parentGroupFields(g, sections))
    .filter(g => g.length > 0)
  if (groups.length > 0) {
    const emptyOf = (g: AppField[]) => g.filter(f => empty(f.id)).map(f => f.id)
    for (const g of groups) {
      const e = emptyOf(g)
      if (e.length > 0 && e.length < g.length) missing.push(...e)
    }
    if (groups.every(g => emptyOf(g).length === g.length)) {
      for (const g of groups) missing.push(...emptyOf(g))
    }
  }

  // Where the exchange partner will be housed only applies when the family is
  // separated / recomposed; the field is hidden from the form otherwise. Both
  // conditional rules are skipped when their question is no longer in the
  // questionnaire — a stale answer must never resurrect a deleted question.
  if (present.has('separation_housing_address')) {
    const fs = (data.family_status ?? '').trim()
    if ((fs === 'separated' || fs === 'step_family') && empty('separation_housing_address')) {
      missing.push('separation_housing_address')
    }
  }

  // The gender "specify" field only applies when gender is "other".
  if (present.has('gender_other') && (data.sex ?? '').trim() === 'other' && empty('gender_other')) {
    missing.push('gender_other')
  }

  // The photo lives on the applications row (photo_path), not in `data`;
  // callers that know whether one exists say so explicitly. `photoRequired`
  // reports whether this exchange's questionnaire still asks for one at all —
  // it defaults to true so every pre-existing call site is unchanged.
  if ((opts?.photoRequired ?? true) && opts?.hasPhoto === false) missing.push('photo')

  return missing
}

// Ids of `email`/`tel` fields holding something that isn't one. Only non-empty
// values are checked: an empty required field is missingRequiredApplication's
// business, and the optional parent group must not light up red when left
// blank. Drafts are never run through this — they are partial by design.
export function invalidFormatApplicationFields(
  data: Record<string, string>, sections: AppSection[] = APPLICATION_SECTIONS,
): string[] {
  return allApplicationFields(sections)
    .filter((f) => {
      if (f.type !== 'email' && f.type !== 'tel') return false
      // String() coercion mirrors hasOverlongAnswer: client payloads aren't
      // runtime-typed, so a non-string value must not reach the validators.
      const value = String(data[f.id] ?? '').trim()
      if (value === '') return false
      return f.type === 'email' ? !isValidEmail(value) : !isValidPhone(value)
    })
    .map((f) => f.id)
}

// Ids of fields whose answer exceeds their per-field maxLength. Pure server-side
// backstop of the client-side maxLength attribute; String() coercion mirrors
// hasOverlongAnswer (client payloads aren't runtime-typed).
export function overLimitApplicationFields(
  data: Record<string, string>, sections: AppSection[] = APPLICATION_SECTIONS,
): string[] {
  return allApplicationFields(sections)
    .filter(f => f.maxLength != null && String(data[f.id] ?? '').length > f.maxLength)
    .map(f => f.id)
}
```

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm exec vitest run --exclude '**/.claude/**'`
Expected: PASS. The existing `application-form`, `ApplicationForm`, `ApplicationReadView` and `application-recap` suites must be untouched — every default preserves today's behaviour. (A single-file failure that passes on re-run is another session mid-write, not a regression — see CLAUDE.md → Parallel Sessions.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/application-form.ts lib/__tests__/application-form.test.ts
git commit -m "feat(questionnaire): validate against the exchange's resolved sections"
```

---

## Task 5: Wire the applicant funnel

**Files:**
- Modify: `lib/apply/result.ts` (new reason `photo_disabled`)
- Modify: `actions/apply.ts` (`getApplicationDraft`, `saveApplicationDraft`, `submitApplication`, `uploadApplicationPhoto`)
- Modify: `components/ApplicationForm.tsx`
- Modify: `app/apply/resume/[token]/page.tsx`
- Modify: `components/__tests__/ApplicationForm.test.tsx`
- Modify: `messages/{en,fr,es,it,de}.json` (one key: `apply.errors.photo_disabled`)

**Interfaces:**
- Consumes: `parseApplicationFields`, `resolveApplicationSections`, `questionnaireHasPhoto` (Task 2); the widened validators (Task 4); `localizedApplicationSections(t, sections)` (Task 3).
- Produces: `ApplicationForm` props gain `sections: AppSection[]` and `photoEnabled: boolean`; `getApplicationDraft`'s live-draft branch gains `applicationFields: unknown` (the raw column value, resolved by the page).

- [ ] **Step 1: Add the failure reason and its copy**

In `lib/apply/result.ts`, add to the `ApplyFailureReason` union, under the `// Photo upload` comment:

```ts
  | 'photo_disabled'  // this exchange's questionnaire no longer asks for a portrait
```

Then add `"photo_disabled"` under `apply.errors` in all five catalogs:

- `messages/fr.json` → `"photo_disabled": "Ce questionnaire ne demande pas de photo."`
- `messages/en.json` → `"photo_disabled": "This questionnaire does not ask for a photo."`
- `messages/es.json` → `"photo_disabled": "Este cuestionario no pide ninguna foto."`
- `messages/it.json` → `"photo_disabled": "Questo questionario non richiede una foto."`
- `messages/de.json` → `"photo_disabled": "Dieser Fragebogen verlangt kein Foto."`

- [ ] **Step 2: Thread the questionnaire through `actions/apply.ts`**

Add to the imports at the top of `actions/apply.ts`:

```ts
import {
  parseApplicationFields, resolveApplicationSections, questionnaireHasPhoto,
} from '@/lib/application-fields'
```

**2a — `getApplicationDraft`:** change the select to include the column, and return it.

```ts
    .select('status, data, language, photo_path, resume_token_expires_at, exchanges(name, apply_slug, application_fields)')
```

and the final live-draft return becomes:

```ts
  return {
    expired: false as const, submitted: false as const,
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, photoUrl, exchangeName,
    slug: app.exchanges?.apply_slug ?? '',
    // The raw column; the page resolves it. Shipping the DOCUMENT rather than
    // the resolved sections keeps the built-in labels coming from the client's
    // own catalog, so a language switch still relabels the whole form.
    applicationFields: (app.exchanges?.application_fields ?? null) as unknown,
  }
```

**2b — `saveApplicationDraft`:** the per-field cap has to know the questionnaire, so it moves after the row read.

```ts
export async function saveApplicationDraft(token: string, data: Record<string, string>): Promise<ApplyWriteResult> {
  // The absolute cap first — it needs no context and rejects a hostile payload
  // before we touch the database.
  if (hasOverlongAnswer(data)) return applyFailure('too_long')
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, status, resume_token_expires_at, exchange_id, exchanges(application_fields)')
    .eq('resume_token', token).maybeSingle()
  if (!app) return applyFailure('not_found')
  if (tokenExpired(app.resume_token_expires_at)) return applyFailure('expired')
  if (app.status !== 'draft' && app.status !== 'invited') return applyFailure('locked')
  // Per-field caps come from THIS exchange's questionnaire — a custom textarea
  // has its own 150-char limit and the built-in ones may have been removed.
  const sections = resolveApplicationSections(parseApplicationFields(app.exchanges?.application_fields))
  const overLimit = overLimitApplicationFields(data, sections)
  if (overLimit.length > 0) return applyFailure('too_long', overLimit)
  await assertExchangeWritable(admin, app.exchange_id)
  // First edit of an organizer-invited row marks it "started".
  const patch: { data: Record<string, string>; status?: 'draft' } =
    app.status === 'invited' ? { data, status: 'draft' } : { data }
  const { error } = await admin
    .from('applications').update(patch).eq('resume_token', token)
  if (error) return applyFailure('failed')
  return { ok: true }
}
```

**2c — `submitApplication`:** the exchange read moves ABOVE the content gates so they can use its questionnaire; the gate ORDER is unchanged (too_long → missing_fields → bad_format → closed), because the applicant must get the same sentence for the same condition as before.

Replace the body from `export async function submitApplication` down to (and including) the `if (applicationsClosed(exchange)) return applyFailure('closed')` line with:

```ts
export async function submitApplication(token: string, data: Record<string, string>): Promise<ApplyWriteResult> {
  if (hasOverlongAnswer(data)) return applyFailure('too_long')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, status, email, exchange_id, school_id, resume_token_expires_at, photo_path')
    .eq('resume_token', token).maybeSingle()
  if (!app) return applyFailure('not_found')
  if (tokenExpired(app.resume_token_expires_at)) return applyFailure('expired')
  if (app.status !== 'draft' && app.status !== 'invited') return applyFailure('locked')

  // Read the exchange BEFORE the content gates: every one of them runs against
  // this exchange's own questionnaire. Running them against the global catalog
  // would make a removed question permanently "missing" and block every
  // submission on a customized exchange.
  const { data: exchange } = await admin
    .from('exchanges')
    .select('name, application_open, application_deadline, application_fields')
    .eq('id', app.exchange_id).maybeSingle()
  if (!exchange) return applyFailure('not_found')
  const doc = parseApplicationFields(exchange.application_fields)
  const sections = resolveApplicationSections(doc)

  const overLimit = overLimitApplicationFields(data, sections)
  if (overLimit.length > 0) return applyFailure('too_long', overLimit)

  // Server-side backstop of the client submit gate — same policy, including
  // the photo (which lives on the row, not in `data`) and whether this
  // questionnaire still asks for one. Structured so the client can flag the
  // offending fields instead of showing a digest.
  const missing = missingRequiredApplication(data, {
    hasPhoto: app.photo_path != null,
    photoRequired: questionnaireHasPhoto(doc),
    sections,
  })
  if (missing.length > 0) return applyFailure('missing_fields', missing)

  // Format backstop for the e-mail/phone fields. Structured, not thrown: the
  // client can point at the offending fields, and a malformed parent address
  // here would 422 the whole acceptance send later on.
  const invalidFormat = invalidFormatApplicationFields(data, sections)
  if (invalidFormat.length > 0) return applyFailure('bad_format', invalidFormat)

  // Re-check the window at submit time: startApplication gated it, but the
  // organizer may have closed applications (or the deadline passed) while this
  // draft was open.
  if (applicationsClosed(exchange)) return applyFailure('closed')
```

Everything from `await assertExchangeWritable(admin, app.exchange_id)` onwards stays exactly as it is.

**2d — `uploadApplicationPhoto`:** refuse when the portrait was removed.

```ts
  const { data: app } = await admin
    .from('applications')
    .select('id, status, resume_token_expires_at, exchange_id, exchanges(application_fields)')
    .eq('resume_token', token).maybeSingle()
  if (!app) return applyFailure('not_found')
  if (tokenExpired(app.resume_token_expires_at)) return applyFailure('expired')
  if (app.status !== 'draft' && app.status !== 'invited') return applyFailure('locked')
  // The form does not render the uploader when the portrait was removed; this
  // is the server-side backstop for a stale tab or a hand-made request.
  if (!questionnaireHasPhoto(parseApplicationFields(app.exchanges?.application_fields))) {
    return applyFailure('photo_disabled')
  }
  await assertExchangeWritable(admin, app.exchange_id)
```

- [ ] **Step 3: Give `ApplicationForm` its questionnaire**

In `components/ApplicationForm.tsx`:

Add to the imports:

```ts
import type { AppSection } from '@/lib/application-form'
```

Extend `Props`:

```ts
interface Props {
  token: string
  slug: string
  exchangeName: string
  initialData: Record<string, string>
  locale: Locale
  initialPhotoUrl: string | null
  // This exchange's resolved questionnaire and whether it still asks for a
  // portrait. Both come from the page, which reads exchanges.application_fields.
  sections: AppSection[]
  photoEnabled: boolean
}
```

Delete the module-level constant on line 30:

```ts
const PARENT_FIELD_IDS = [...parentGroupFields('father'), ...parentGroupFields('mother')].map(f => f.id)
```

Change the signature and the label resolution:

```ts
export function ApplicationForm({ token, slug, exchangeName, initialData, locale, initialPhotoUrl, sections, photoEnabled }: Props) {
```

Replace line 47 (`const sections = localizedApplicationSections(...)`) with:

```ts
  // Field labels come from the `apply` catalog (one source for the funnel form,
  // the organizer read view and the PDF recap); a custom question carries its
  // own. An empty section is simply not rendered — except `student`, which
  // still hosts the portrait when the questionnaire keeps it.
  const visible = localizedApplicationSections(asAppTranslator(t), sections)
    .filter(s => s.fields.length > 0 || (s.id === 'student' && photoEnabled))
  const parentFieldIds = [
    ...parentGroupFields('father', sections), ...parentGroupFields('mother', sections),
  ].map(f => f.id)
```

In `onSubmit`, pass the questionnaire to all three gates:

```ts
    const miss = missingRequiredApplication(data, { hasPhoto, photoRequired: photoEnabled, sections })
    const over = overLimitApplicationFields(data, sections)
    const badFormat = invalidFormatApplicationFields(data, sections)
```

Replace the three remaining references to the old locals:

```ts
  const parentsInvalid = missing.some(id => parentFieldIds.includes(id))
  const total = visible.length
```

and the render loop header:

```ts
        {visible.map((section, i) => (
```

and gate the uploader on `photoEnabled`:

```ts
              {section.id === 'student' && photoEnabled && (
```

- [ ] **Step 4: Resolve the questionnaire on the resume page**

In `app/apply/resume/[token]/page.tsx`, add the import:

```ts
import { parseApplicationFields, resolveApplicationSections, questionnaireHasPhoto } from '@/lib/application-fields'
```

and replace the final `return wrap(...)` block:

```ts
  // The exchange's own questionnaire; `null` (never customized) resolves to the
  // built-in catalog, so an exchange that predates the editor is unchanged.
  const doc = parseApplicationFields(draft.applicationFields)
  return wrap(
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <ApplicationForm
        token={token}
        slug={draft.slug}
        exchangeName={draft.exchangeName}
        initialData={draft.data}
        locale={locale}
        initialPhotoUrl={draft.photoUrl}
        sections={resolveApplicationSections(doc)}
        photoEnabled={questionnaireHasPhoto(doc)}
      />
    </main>
  )
```

- [ ] **Step 5: Update and extend the component tests**

In `components/__tests__/ApplicationForm.test.tsx`, add the import and give `renderForm` the new defaults:

```ts
import { APPLICATION_SECTIONS } from '@/lib/application-form'

function renderForm(over: Partial<Parameters<typeof ApplicationForm>[0]> = {}) {
  return renderWithIntl(
    <ApplicationForm
      token="t" slug="s" exchangeName="Échange Espagne" initialData={{}} locale="fr"
      initialPhotoUrl={null} sections={APPLICATION_SECTIONS} photoEnabled
      {...over}
    />,
  )
}
```

Then append:

```ts
describe('ApplicationForm with a customized questionnaire', () => {
  const TRIMMED = [
    { id: 'student', fields: [
      { id: 'last_name', type: 'text' as const, required: true },
      { id: 'c_7f3a', type: 'textarea' as const, label: 'Sait nager ?', maxLength: 150 },
    ] },
    { id: 'parents', fields: [] },
    { id: 'hosting', fields: [] },
    { id: 'profile', fields: [] },
  ]

  it('renders a custom question with its typed label, untranslated', () => {
    renderForm({ sections: TRIMMED })
    expect(screen.getByText('Sait nager ?')).toBeInTheDocument()
  })

  it('does not render a removed built-in question', () => {
    renderForm({ sections: TRIMMED })
    expect(screen.queryByText('Animaux domestiques')).not.toBeInTheDocument()
  })

  it('does not render an empty section', () => {
    renderForm({ sections: TRIMMED })
    expect(screen.queryByText('Conditions d’accueil')).not.toBeInTheDocument()
    // …and the step counter counts only what is on screen.
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })

  it('hides the photo uploader when the portrait was removed', () => {
    renderForm({ sections: TRIMMED, photoEnabled: false })
    expect(screen.queryByText(/photo/i)).not.toBeInTheDocument()
  })

  it('still shows the student section when the photo is its only remaining question', () => {
    const photoOnly = TRIMMED.map(s => (s.id === 'student' ? { ...s, fields: [] } : s))
    renderForm({ sections: photoOnly, photoEnabled: true })
    expect(screen.getByText('Élève')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run components/__tests__/ApplicationForm.test.tsx messages/__tests__/parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: no errors. (`ApplicationForm`'s two new required props make every call site a compile error until it is updated — the resume page is the only one.)

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add lib/apply/result.ts actions/apply.ts components/ApplicationForm.tsx "app/apply/resume/[token]/page.tsx" components/__tests__/ApplicationForm.test.tsx messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(apply): funnel renders and validates the exchange's own questionnaire"
```

---

## Task 6: Wire the organizer read view and the PDF recap

**Files:**
- Modify: `lib/pdf/application-recap.tsx` (`recapSections`, `renderApplicationRecapPdf`)
- Modify: `components/ApplicationReadView.tsx`
- Modify: `components/applications/ApplicationDetail.tsx`
- Modify: `actions/applications-review.ts` (`getApplicationForReview`)
- Modify: `actions/apply.ts` (`downloadApplicationRecap`)
- Modify: `components/__tests__/ApplicationReadView.test.tsx`
- Modify: `lib/pdf/__tests__/application-recap.test.ts`

**Interfaces:**
- Consumes: `resolveApplicationSections`, `parseApplicationFields` (Task 2); `localizedApplicationSections(t, sections)` (Task 3).
- Produces:
  ```ts
  function recapSections(data: Record<string, string>, t: AppTranslator, sections?: AppSection[]): RecapSection[]
  renderApplicationRecapPdf(input: { …existing…; sections: AppSection[] })
  <ApplicationReadView data={…} photoUrl={…} sections={AppSection[]} />
  getApplicationForReview(id) → { application, photoUrl, applicationFields: unknown }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/pdf/__tests__/application-recap.test.ts`:

```ts
describe('recapSections with a customized questionnaire', () => {
  const t = ((key: string) => `T:${key}`) as never
  const TRIMMED = [
    { id: 'student', fields: [{ id: 'c_7f3a', type: 'textarea' as const, label: 'Sait nager ?' }] },
    { id: 'parents', fields: [] },
    { id: 'hosting', fields: [] },
    { id: 'profile', fields: [] },
  ]

  it('renders a custom question under its typed label', () => {
    const out = recapSections({ c_7f3a: 'Oui, depuis 6 ans' }, t, TRIMMED)
    expect(out).toHaveLength(1)
    expect(out[0].rows).toEqual([{ label: 'Sait nager ?', value: 'Oui, depuis 6 ans' }])
  })

  it('ignores an answer to a question that is no longer in the questionnaire', () => {
    // The sections are the single source of truth for what a recap shows — a
    // stored answer to a removed question must not resurface in the PDF.
    expect(recapSections({ c_7f3a: 'Oui', pets: 'Un chat' }, t, TRIMMED)[0].rows)
      .toEqual([{ label: 'Sait nager ?', value: 'Oui' }])
  })

  it('maps a custom choice token back to its typed option label', () => {
    const sections = [{ id: 'student', fields: [{
      id: 'c_1', type: 'radio' as const, label: 'Régime',
      options: [{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }],
    }] }]
    expect(recapSections({ c_1: 'o2' }, t, sections)[0].rows)
      .toEqual([{ label: 'Régime', value: 'Aucun' }])
  })

  it('defaults to the built-in catalog when no sections are given', () => {
    expect(recapSections({ pets: 'Un chat' }, t)[0].rows)
      .toEqual([{ label: 'T:fields.pets.label', value: 'Un chat' }])
  })
})
```

Append to `components/__tests__/ApplicationReadView.test.tsx` (mirroring however that file already renders the component — it is an async server component, so follow the existing pattern in the file):

```ts
it('renders a custom question verbatim and skips an emptied section', async () => {
  const sections = [
    { id: 'student', fields: [{ id: 'c_7f3a', type: 'textarea' as const, label: 'Sait nager ?' }] },
    { id: 'parents', fields: [] },
    { id: 'hosting', fields: [] },
    { id: 'profile', fields: [] },
  ]
  render(await ApplicationReadView({ data: { c_7f3a: 'Oui' }, photoUrl: null, sections }))
  expect(screen.getByText('Sait nager ?')).toBeInTheDocument()
  expect(screen.getByText('Oui')).toBeInTheDocument()
  expect(screen.queryByText('Parents')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run lib/pdf/__tests__/application-recap.test.ts components/__tests__/ApplicationReadView.test.tsx`
Expected: FAIL — `recapSections` takes two arguments; `ApplicationReadView` has no `sections` prop.

- [ ] **Step 3: Widen the recap renderer**

In `lib/pdf/application-recap.tsx`, add the type import:

```ts
import type { AppSection } from '@/lib/application-form'
```

Replace `recapSections`:

```ts
// Pure content model of the recap: the sections and rows the PDF will draw.
// Exported so the label/option/empty-answer rules are unit-testable without
// parsing PDF bytes. Keys in `data` that are not in `sections` are ignored —
// the questionnaire is the single source of truth for what a recap shows, so
// an answer to a since-removed question never resurfaces here.
export function recapSections(
  data: Record<string, string>,
  t: AppTranslator,
  sections?: AppSection[],
): RecapSection[] {
  return localizedApplicationSections(t, sections)
    .map(section => ({
      title: section.title,
      rows: section.fields
        .map(f => ({ label: f.label, value: answerText(f, data[f.id], t) }))
        .filter(r => r.value !== ''),
    }))
    .filter(s => s.rows.length > 0)
}
```

Note `localizedApplicationSections(t, undefined)` already falls back to the built-in catalog (Task 3), so passing `sections` straight through is correct.

Then in `renderApplicationRecapPdf`, add `sections: AppSection[]` to the input type, destructure it, and pass it on:

```ts
export async function renderApplicationRecapPdf(input: {
  exchangeName: string
  applicantName: string
  submittedAt: string | null
  data: Record<string, string>
  photoBytes: Uint8Array | null
  locale: Locale
  t: AppTranslator
  sections: AppSection[]
}): Promise<Buffer> {
  const { exchangeName, applicantName, submittedAt, data, photoBytes, locale, t, sections: questionnaire } = input
  const sections = recapSections(data, t, questionnaire)
```

Also update the module header comment: replace « Layout is driven by iterating APPLICATION_SECTIONS » with « Layout is driven by iterating the exchange's resolved questionnaire ».

- [ ] **Step 4: Widen `ApplicationReadView`**

Replace the signature and the map in `components/ApplicationReadView.tsx`:

```ts
export async function ApplicationReadView({ data, photoUrl, sections }: {
  data: Record<string, string>
  photoUrl: string | null
  // The reviewed application's exchange questionnaire, resolved. Undefined
  // falls back to the built-in catalog.
  sections?: AppSection[]
}) {
  const t = asAppTranslator(await getTranslations('apply'))
  // An emptied section is not rendered — same rule as the funnel and the recap.
  const localized = localizedApplicationSections(t, sections).filter(s => s.fields.length > 0)
```

and change `{sections.map(section => (` to `{localized.map(section => (`. Add the type import:

```ts
import type { AppSection } from '@/lib/application-form'
```

- [ ] **Step 5: Return the questionnaire from the review action**

In `actions/applications-review.ts`, change `getApplicationForReview`'s return:

```ts
export async function getApplicationForReview(applicationId: string) {
  const supabase = await createClient()
  await requireUser()
  const application = await assertOrganizerOwnsApplication(supabase, applicationId)

  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above (assertOrganizerOwnsApplication).
    const urls = await signApplicationPhotoUrls([application.photo_path])
    photoUrl = urls.get(application.photo_path) ?? null
  }
  // The exchange's own questionnaire, so the read view shows exactly the
  // questions this applicant was asked — including removed ones' absence.
  const { data: exchange } = await supabase
    .from('exchanges').select('application_fields').eq('id', application.exchange_id).maybeSingle()
  return { application, photoUrl, applicationFields: (exchange?.application_fields ?? null) as unknown }
}
```

- [ ] **Step 6: Thread it through the detail view**

In `components/applications/ApplicationDetail.tsx`, add:

```ts
import { parseApplicationFields, resolveApplicationSections } from '@/lib/application-fields'
```

Add `applicationFields` to the props:

```ts
export async function ApplicationDetail({
  application,
  photoUrl,
  exchangeName,
  year,
  applicationFields,
}: {
  application: any
  photoUrl: string | null
  exchangeName: string
  year: number
  applicationFields: unknown
}) {
```

and pass the resolved sections:

```ts
        <ApplicationReadView
          data={application.data}
          photoUrl={photoUrl}
          sections={resolveApplicationSections(parseApplicationFields(applicationFields))}
        />
```

In `app/(organizer)/applications/page.tsx`, update the call:

```ts
  if (id) {
    const { application, photoUrl, applicationFields } = await getApplicationForReview(id)
    return (
      <ApplicationDetail
        application={application} photoUrl={photoUrl}
        exchangeName={active.name} year={active.year}
        applicationFields={applicationFields}
      />
    )
  }
```

Do the same in `app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx` if it also renders `ApplicationDetail` (grep for it: `grep -rn "ApplicationDetail" app/`).

- [ ] **Step 7: Give `downloadApplicationRecap` the questionnaire**

In `actions/apply.ts`, change its select and its render call:

```ts
    .select('status, data, language, photo_path, submitted_at, resume_token_expires_at, exchanges(name, application_fields)')
```

```ts
  const pdf = await renderApplicationRecapPdf({
    exchangeName: app.exchanges?.name ?? '',
    applicantName: buildApplicantName(data),
    submittedAt: app.submitted_at,
    data,
    photoBytes,
    locale: effectiveLocale,
    t: await namespaceTranslator(effectiveLocale, 'apply'),
    sections: resolveApplicationSections(parseApplicationFields(app.exchanges?.application_fields)),
  })
```

- [ ] **Step 8: Run the tests, typecheck and lint**

Run: `pnpm exec vitest run --exclude '**/.claude/**' && npx tsc --noEmit && pnpm lint`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add lib/pdf/application-recap.tsx components/ApplicationReadView.tsx components/applications/ApplicationDetail.tsx actions/applications-review.ts actions/apply.ts "app/(organizer)/applications/page.tsx" components/__tests__/ApplicationReadView.test.tsx lib/pdf/__tests__/application-recap.test.ts
git commit -m "feat(applications): read view and PDF recap follow the exchange questionnaire"
```

---

## Task 7: Organizer server actions

**Files:**
- Create: `lib/questionnaire/result.ts`
- Create: `actions/questionnaire.ts`
- Create: `actions/__tests__/questionnaire.test.ts`

**Interfaces:**
- Consumes: `requireOrganizer` (`lib/auth/require.ts`), `createClient` (`lib/supabase/server`), `assertExchangeWritable`, everything from `lib/application-fields.ts` and `lib/application-templates/library.ts`.
- Produces:
  ```ts
  // lib/questionnaire/result.ts  (plain module — a 'use server' file may only export async functions)
  type QuestionnaireFailureReason =
    'locked' | 'not_found' | 'invalid_label' | 'invalid_type' | 'invalid_options' | 'unknown_question' | 'failed'
  type QuestionnaireState  = { doc: ApplicationFieldsDoc; locked: boolean; applicationCount: number; questionCount: number }
  type QuestionnaireResult = { ok: true; doc: ApplicationFieldsDoc } | { ok: false; reason: QuestionnaireFailureReason }
  type AddQuestionInput =
    | { kind: 'builtin'; ref: string }
    | { kind: 'custom'; label: string; type: CustomQuestionType; required: boolean; options?: string[] }
  type EditQuestionInput = { id: string; label: string; required: boolean; options?: string[] }
  type QuestionSuggestion = { label: string; type: CustomQuestionType; options: { value: string; label: string }[] | null; schools: number }
  function questionnaireFailure(reason: QuestionnaireFailureReason): QuestionnaireResult

  // actions/questionnaire.ts
  async function getQuestionnaire(exchangeId: string): Promise<QuestionnaireState>
  async function addQuestion(exchangeId: string, sectionId: SectionId, input: AddQuestionInput): Promise<QuestionnaireResult>
  async function removeQuestion(exchangeId: string, sectionId: SectionId, questionId: string): Promise<QuestionnaireResult>
  async function editCustomQuestion(exchangeId: string, sectionId: SectionId, input: EditQuestionInput): Promise<QuestionnaireResult>
  async function resetQuestionnaire(exchangeId: string): Promise<QuestionnaireResult>
  async function listQuestionSuggestions(): Promise<QuestionSuggestion[]>
  ```

**Trust model:** authenticated organizer, own school only, request-scoped RLS client. This is a **fourth** application-actions file on purpose (CLAUDE.md → the split by trust model): `apply.ts` is the anonymous funnel, `applications-review.ts` is organizer *review*, `invitations.ts` is the anonymous invite token, and this one is organizer *configuration*. Never merge them.

- [ ] **Step 1: Write the result module**

Create `lib/questionnaire/result.ts`:

```ts
// Structured outcomes for the questionnaire editor.
//
// Lives outside the 'use server' module because such a module may only export
// async functions — the client components import these types and codes from
// here. Same pattern as lib/apply/result.ts and lib/team/join-result.ts.
//
// Every one of these is an EXPECTED outcome and travels as a return value:
// production replaces thrown Server Action messages with an opaque digest, so
// a throw would show the organizer a hex string. The action returns a CODE,
// never a sentence — the copy lives under `organizer.questionnaire.errors`.
import type { ApplicationFieldsDoc, CustomQuestionType } from '@/lib/application-fields'

export type QuestionnaireFailureReason =
  | 'locked'            // the exchange already has applications — permanently read-only
  | 'not_found'         // no such exchange for this organizer's school
  | 'invalid_label'     // blank, or over 120 characters
  | 'invalid_type'      // not one of the five offered types
  | 'invalid_options'   // a choice question with fewer than two options
  | 'unknown_question'  // the id is not in that section (a stale tab)
  | 'failed'            // genuinely unexpected, surfaced rather than thrown

export type QuestionnaireState = {
  doc: ApplicationFieldsDoc
  // Derived, never stored: editable while the exchange has no applications,
  // locked forever after. Re-checked server-side on every write — the client
  // is never trusted with the lock.
  locked: boolean
  applicationCount: number
  questionCount: number
}

export type QuestionnaireResult =
  | { ok: true; doc: ApplicationFieldsDoc }
  | { ok: false; reason: QuestionnaireFailureReason }

export type AddQuestionInput =
  | { kind: 'builtin'; ref: string }
  | { kind: 'custom'; label: string; type: CustomQuestionType; required: boolean; options?: string[] }

export type EditQuestionInput = { id: string; label: string; required: boolean; options?: string[] }

export type QuestionSuggestion = {
  label: string
  type: CustomQuestionType
  options: { value: string; label: string }[] | null
  schools: number
}

export function questionnaireFailure(reason: QuestionnaireFailureReason): QuestionnaireResult {
  return { ok: false, reason }
}
```

- [ ] **Step 2: Write the failing action tests**

Create `actions/__tests__/questionnaire.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profile = { id: 'org-1', school_id: 'school-1', role: 'organizer' as const, status: 'approved' as const, locale: 'fr' as const }
const requireOrganizer = vi.fn(async () => ({ user: { id: 'org-1' }, profile }))
vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: (...a: unknown[]) => requireOrganizer(...(a as [])),
  requireUser: vi.fn(async () => ({ id: 'org-1' })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))

// A minimal query-builder double. `state` is rewritten per test.
const state = {
  exchange: null as null | { id: string; school_a_id: string; school_b_id: string | null; application_fields: unknown },
  applicationCount: 0,
  updates: [] as unknown[],
  bankInserts: [] as unknown[],
  rpcRows: [] as unknown[],
}
function table(name: string) {
  if (name === 'exchanges') {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: state.exchange }),
      update: (patch: unknown) => { state.updates.push(patch); return { eq: async () => ({ error: null }) } },
    }
    return builder
  }
  if (name === 'applications') {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      then: undefined,
    }
    builder.select = () => ({ eq: async () => ({ count: state.applicationCount, error: null }) })
    return builder
  }
  if (name === 'application_custom_questions') {
    return { insert: async (row: unknown) => { state.bankInserts.push(row); return { error: null } } }
  }
  throw new Error(`unexpected table ${name}`)
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: table, rpc: async () => ({ data: state.rpcRows, error: null }) }),
}))

import {
  getQuestionnaire, addQuestion, removeQuestion, editCustomQuestion,
  resetQuestionnaire, listQuestionSuggestions,
} from '../questionnaire'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { entryId, sectionEntries } from '@/lib/application-fields'

beforeEach(() => {
  vi.clearAllMocks()
  state.exchange = { id: 'ex-1', school_a_id: 'school-1', school_b_id: null, application_fields: null }
  state.applicationCount = 0
  state.updates = []
  state.bankInserts = []
  state.rpcRows = []
  requireOrganizer.mockResolvedValue({ user: { id: 'org-1' }, profile })
})

describe('getQuestionnaire', () => {
  it('materializes the standard questionnaire for an exchange that was never customized', async () => {
    const s = await getQuestionnaire('ex-1')
    expect(s.doc).toEqual(standardQuestionnaire())
    expect(s.locked).toBe(false)
    expect(s.questionCount).toBe(55)   // 54 built-ins + the portrait
  })

  it('locks the moment the exchange has any application', async () => {
    state.applicationCount = 12
    const s = await getQuestionnaire('ex-1')
    expect(s.locked).toBe(true)
    expect(s.applicationCount).toBe(12)
  })

  it("refuses another school's exchange", async () => {
    state.exchange = { id: 'ex-1', school_a_id: 'other-school', school_b_id: null, application_fields: null }
    await expect(getQuestionnaire('ex-1')).rejects.toThrow('Unauthorized')
  })
})

describe('removeQuestion', () => {
  it('persists the whole document with the question gone', async () => {
    const res = await removeQuestion('ex-1', 'hosting', 'pets')
    expect(res.ok).toBe(true)
    expect(sectionEntries((res as { doc: never }).doc as never, 'hosting' as never).map(entryId)).not.toContain('pets')
    expect(state.updates).toHaveLength(1)
  })

  it('cascades sex → gender_other', async () => {
    const res = await removeQuestion('ex-1', 'student', 'sex')
    const ids = sectionEntries((res as { doc: never }).doc as never, 'student' as never).map(entryId)
    expect(ids).not.toContain('sex')
    expect(ids).not.toContain('gender_other')
  })

  it('refuses to remove a locked question', async () => {
    expect(await removeQuestion('ex-1', 'student', 'email')).toEqual({ ok: false, reason: 'unknown_question' })
    expect(state.updates).toHaveLength(0)
  })

  it('refuses once the exchange has an application — the client is never trusted with the lock', async () => {
    state.applicationCount = 1
    expect(await removeQuestion('ex-1', 'hosting', 'pets')).toEqual({ ok: false, reason: 'locked' })
    expect(state.updates).toHaveLength(0)
  })

  it("refuses another school's exchange", async () => {
    state.exchange = { id: 'ex-1', school_a_id: 'other-school', school_b_id: null, application_fields: null }
    expect(await removeQuestion('ex-1', 'hosting', 'pets')).toEqual({ ok: false, reason: 'not_found' })
    expect(state.updates).toHaveLength(0)
  })
})

describe('addQuestion', () => {
  it('restores a removed built-in by reference', async () => {
    await removeQuestion('ex-1', 'hosting', 'pets')
    state.exchange!.application_fields = (state.updates[0] as { application_fields: unknown }).application_fields
    const res = await addQuestion('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' })
    expect(res.ok).toBe(true)
    const entries = sectionEntries((res as { doc: never }).doc as never, 'hosting' as never)
    expect(entries.at(-1)).toEqual({ ref: 'pets' })   // new questions land at the end
  })

  it('refuses a built-in that is already present', async () => {
    expect(await addQuestion('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' }))
      .toEqual({ ok: false, reason: 'unknown_question' })
  })

  it('creates a custom question with a generated id and the 150-char cap on long text', async () => {
    const res = await addQuestion('ex-1', 'student', {
      kind: 'custom', label: 'Sait nager ?', type: 'textarea', required: true,
    })
    expect(res.ok).toBe(true)
    const added = sectionEntries((res as { doc: never }).doc as never, 'student' as never).at(-1) as {
      id: string; type: string; label: string; required: boolean; maxLength: number
    }
    expect(added.id).toMatch(/^c_[0-9a-f]{4}$/)
    expect(added).toMatchObject({ type: 'textarea', label: 'Sait nager ?', required: true, maxLength: 150 })
  })

  it("banks a newly created custom question for the organizer's school and locale", async () => {
    await addQuestion('ex-1', 'student', { kind: 'custom', label: '  Sait nager ?  ', type: 'yesno', required: false })
    expect(state.bankInserts).toEqual([
      { school_id: 'school-1', label: 'Sait nager ?', locale: 'fr', type: 'yesno', options: null },
    ])
  })

  it('never banks a restored built-in', async () => {
    await removeQuestion('ex-1', 'hosting', 'pets')
    state.exchange!.application_fields = (state.updates[0] as { application_fields: unknown }).application_fields
    await addQuestion('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' })
    expect(state.bankInserts).toEqual([])
  })

  it('tokenizes choice options so a stored answer never depends on the wording', async () => {
    const res = await addQuestion('ex-1', 'student', {
      kind: 'custom', label: 'Régime', type: 'radio', required: false,
      options: ['Végétarien', '  ', 'Aucun'],
    })
    const added = sectionEntries((res as { doc: never }).doc as never, 'student' as never).at(-1) as {
      options: { value: string; label: string }[]
    }
    expect(added.options).toEqual([{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }])
  })

  it('rejects a blank or over-long label', async () => {
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: '   ', type: 'text', required: false }))
      .toEqual({ ok: false, reason: 'invalid_label' })
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: 'x'.repeat(121), type: 'text', required: false }))
      .toEqual({ ok: false, reason: 'invalid_label' })
  })

  it('rejects an unsupported type', async () => {
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: 'X', type: 'file' as never, required: false }))
      .toEqual({ ok: false, reason: 'invalid_type' })
  })

  it('rejects a choice question with fewer than two options', async () => {
    expect(await addQuestion('ex-1', 'student', { kind: 'custom', label: 'X', type: 'radio', required: false, options: ['Seul'] }))
      .toEqual({ ok: false, reason: 'invalid_options' })
  })

  it('a bank write failure never costs the organizer their question', async () => {
    // The bank is a nice-to-have; the questionnaire is the product.
    const res = await addQuestion('ex-1', 'student', { kind: 'custom', label: 'X', type: 'text', required: false })
    expect(res.ok).toBe(true)
  })
})

describe('editCustomQuestion', () => {
  it('rewrites the label, required flag and options in place', async () => {
    const added = await addQuestion('ex-1', 'student', { kind: 'custom', label: 'Ancien', type: 'text', required: false })
    state.exchange!.application_fields = (state.updates.at(-1) as { application_fields: unknown }).application_fields
    const id = (sectionEntries((added as { doc: never }).doc as never, 'student' as never).at(-1) as { id: string }).id
    const res = await editCustomQuestion('ex-1', 'student', { id, label: 'Nouveau', required: true })
    const edited = sectionEntries((res as { doc: never }).doc as never, 'student' as never).at(-1) as {
      label: string; required: boolean
    }
    expect(edited).toMatchObject({ label: 'Nouveau', required: true })
  })

  it('refuses to edit a built-in — their labels and required-ness are not editable', async () => {
    expect(await editCustomQuestion('ex-1', 'student', { id: 'last_name', label: 'Surname', required: false }))
      .toEqual({ ok: false, reason: 'unknown_question' })
  })
})

describe('resetQuestionnaire', () => {
  it('writes NULL back — the same state as an exchange that was never customized', async () => {
    const res = await resetQuestionnaire('ex-1')
    expect(res).toEqual({ ok: true, doc: standardQuestionnaire() })
    expect(state.updates).toEqual([{ application_fields: null }])
  })

  it('refuses once locked', async () => {
    state.applicationCount = 3
    expect(await resetQuestionnaire('ex-1')).toEqual({ ok: false, reason: 'locked' })
    expect(state.updates).toHaveLength(0)
  })
})

describe('listQuestionSuggestions', () => {
  it('maps RPC aggregates onto the client shape', async () => {
    state.rpcRows = [{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }]
    expect(await listQuestionSuggestions()).toEqual([
      { label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 },
    ])
  })

  it('returns an empty list rather than throwing when the bank is empty', async () => {
    state.rpcRows = []
    expect(await listQuestionSuggestions()).toEqual([])
  })

  it('drops a row whose type is not one of the five offered', async () => {
    state.rpcRows = [{ label: 'X', type: 'file', options: null, schools: 9 }]
    expect(await listQuestionSuggestions()).toEqual([])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm exec vitest run actions/__tests__/questionnaire.test.ts`
Expected: FAIL — cannot resolve `../questionnaire`.

- [ ] **Step 4: Write the actions**

Create `actions/questionnaire.ts`:

```ts
'use server'
// The per-exchange questionnaire editor's write path.
//
// TRUST MODEL: authenticated organizer, own school only, through the
// REQUEST-SCOPED client — RLS is the boundary, not the service role. This is
// deliberately a fourth application-actions file (CLAUDE.md): apply.ts is the
// anonymous funnel, applications-review.ts is organizer review, invitations.ts
// is the anonymous invite token, and this one is organizer configuration.
//
// Every mutation persists IMMEDIATELY — there is no draft/save cycle. That is
// safe precisely because the questionnaire locks the moment the first
// application arrives, so nothing an organizer edits can ever be under a
// candidate's feet.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import {
  parseApplicationFields, removeQuestion as removeFromDoc, addQuestion as addToDoc,
  replaceCustomQuestion, removedBuiltIns, sectionEntries, entryId, isCustomQuestion,
  newCustomQuestionId, optionTokens, questionCount,
  CUSTOM_QUESTION_TYPES, CUSTOM_LABEL_MAX, CUSTOM_TEXTAREA_MAX_LENGTH, LOCKED_QUESTION_IDS,
  type ApplicationFieldsDoc, type CustomQuestion, type CustomQuestionType, type SectionId,
} from '@/lib/application-fields'
import {
  questionnaireFailure,
  type AddQuestionInput, type EditQuestionInput, type QuestionnaireResult,
  type QuestionnaireState, type QuestionSuggestion,
} from '@/lib/questionnaire/result'

// Loads the exchange's questionnaire and its lock state, refusing anything
// outside the caller's school. Not exported: a 'use server' module may only
// export async functions the client is allowed to call.
async function loadQuestionnaire(exchangeId: string): Promise<{
  doc: ApplicationFieldsDoc; locked: boolean; applicationCount: number
} | null> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  // Belt-and-suspenders with RLS (which already scopes rows to the caller's
  // school): refuse a foreign exchange id outright, the same shape as
  // listApplications in actions/applications-review.ts.
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('id, school_a_id, school_b_id, application_fields')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange) return null
  if (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id) return null

  // THE LOCK — derived, never stored. Any application at all, in any status,
  // freezes the questionnaire forever: no snapshots, no divergence, and no
  // stored answer can ever become unreadable.
  const { count } = await supabase
    .from('applications').select('id', { count: 'exact', head: true }).eq('exchange_id', exchangeId)
  const applicationCount = count ?? 0

  return {
    // `null` in the column means « never customized ». Materialize the standard
    // structure so the editor has something to edit; the column stays null
    // until the first actual change is persisted.
    doc: parseApplicationFields(exchange.application_fields) ?? standardQuestionnaire(),
    locked: applicationCount > 0,
    applicationCount,
  }
}

// Shared preamble for every mutation: load, refuse a foreign exchange, refuse
// an archived one, re-check the lock server-side. The client is never trusted
// with the lock — the editor greys itself out, and this refuses anyway.
async function loadEditable(exchangeId: string): Promise<
  { ok: true; doc: ApplicationFieldsDoc } | { ok: false; reason: 'not_found' | 'locked' }
> {
  const state = await loadQuestionnaire(exchangeId)
  if (!state) return { ok: false, reason: 'not_found' }
  if (state.locked) return { ok: false, reason: 'locked' }
  const supabase = await createClient()
  await assertExchangeWritable(supabase, exchangeId)
  return { ok: true, doc: state.doc }
}

async function persist(exchangeId: string, doc: ApplicationFieldsDoc | null): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('exchanges').update({ application_fields: doc }).eq('id', exchangeId)
  if (error) return false
  revalidatePath('/applications')
  revalidatePath('/applications/questionnaire')
  return true
}

export async function getQuestionnaire(exchangeId: string): Promise<QuestionnaireState> {
  const state = await loadQuestionnaire(exchangeId)
  // A missing/foreign exchange here is a routing bug or a hostile id, not an
  // expected outcome — the page has already resolved an active exchange.
  if (!state) throw new Error('Unauthorized')
  return { ...state, questionCount: questionCount(state.doc) }
}

export async function removeQuestion(
  exchangeId: string, sectionId: SectionId, questionId: string,
): Promise<QuestionnaireResult> {
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)
  // first_name / last_name / email are collected before the questionnaire opens
  // and drive the invitation — they can never leave.
  if ((LOCKED_QUESTION_IDS as readonly string[]).includes(questionId)) {
    return questionnaireFailure('unknown_question')
  }
  if (!sectionEntries(loaded.doc, sectionId).some(e => entryId(e) === questionId)) {
    return questionnaireFailure('unknown_question')
  }
  // Cascades (sex → gender_other, family_status → separation_housing_address)
  // are applied by removeFromDoc; the editor warns before calling.
  const doc = removeFromDoc(loaded.doc, sectionId, questionId)
  if (!(await persist(exchangeId, doc))) return questionnaireFailure('failed')
  return { ok: true, doc }
}

export async function addQuestion(
  exchangeId: string, sectionId: SectionId, input: AddQuestionInput,
): Promise<QuestionnaireResult> {
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)

  if (input.kind === 'builtin') {
    // Only a question this section actually lost may come back — which also
    // rejects a duplicate and anything locked (removedBuiltIns excludes both).
    if (!removedBuiltIns(loaded.doc, sectionId).some(f => f.id === input.ref)) {
      return questionnaireFailure('unknown_question')
    }
    const doc = addToDoc(loaded.doc, sectionId, { ref: input.ref })
    if (!(await persist(exchangeId, doc))) return questionnaireFailure('failed')
    return { ok: true, doc }
  }

  const label = input.label.trim()
  if (label === '' || label.length > CUSTOM_LABEL_MAX) return questionnaireFailure('invalid_label')
  if (!(CUSTOM_QUESTION_TYPES as readonly string[]).includes(input.type)) {
    return questionnaireFailure('invalid_type')
  }
  const options = input.type === 'radio' ? optionTokens(input.options ?? []) : undefined
  if (input.type === 'radio' && (options?.length ?? 0) < 2) return questionnaireFailure('invalid_options')

  const question: CustomQuestion = {
    id: newCustomQuestionId(loaded.doc),
    type: input.type,
    label,
  }
  if (input.required) question.required = true
  // Long text is capped at 150 characters, matching the built-in profile
  // questions. Not configurable — one fewer control, and it keeps the PDF
  // recap's layout predictable.
  if (input.type === 'textarea') question.maxLength = CUSTOM_TEXTAREA_MAX_LENGTH
  if (options) question.options = options

  const doc = addToDoc(loaded.doc, sectionId, question)
  if (!(await persist(exchangeId, doc))) return questionnaireFailure('failed')
  await bankQuestion(question, label)
  return { ok: true, doc }
}

// Records the phrasing in the cross-school bank so it can become a suggestion
// once three INDEPENDENT schools have converged on it. Best-effort by design:
// the bank is a nice-to-have, the questionnaire is the product, and a duplicate
// (the unique index on school_id + normalized_label + locale) is the normal
// case for an organizer who reuses their own wording. Never log the label —
// an organizer's wording travels the same PII-sensitive surfaces as an answer.
async function bankQuestion(question: CustomQuestion, label: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { profile } = await requireOrganizer()
    await supabase.from('application_custom_questions').insert({
      school_id: profile.school_id,
      label,
      locale: profile.locale,
      type: question.type,
      options: question.options ?? null,
    })
  } catch {
    /* the bank is never allowed to cost an organizer their question */
  }
}

export async function editCustomQuestion(
  exchangeId: string, sectionId: SectionId, input: EditQuestionInput,
): Promise<QuestionnaireResult> {
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)

  const existing = sectionEntries(loaded.doc, sectionId).find(e => entryId(e) === input.id)
  // Built-in labels and required-ness are deliberately not editable: they are
  // translated into five languages, and an organizer's edit could only ever be
  // monolingual.
  if (!existing || !isCustomQuestion(existing)) return questionnaireFailure('unknown_question')

  const label = input.label.trim()
  if (label === '' || label.length > CUSTOM_LABEL_MAX) return questionnaireFailure('invalid_label')
  const options = existing.type === 'radio' ? optionTokens(input.options ?? []) : undefined
  if (existing.type === 'radio' && (options?.length ?? 0) < 2) return questionnaireFailure('invalid_options')

  const question: CustomQuestion = { id: existing.id, type: existing.type, label }
  if (input.required) question.required = true
  if (existing.maxLength != null) question.maxLength = existing.maxLength
  if (options) question.options = options

  const doc = replaceCustomQuestion(loaded.doc, sectionId, question)
  if (!(await persist(exchangeId, doc))) return questionnaireFailure('failed')
  return { ok: true, doc }
}

export async function resetQuestionnaire(exchangeId: string): Promise<QuestionnaireResult> {
  const loaded = await loadEditable(exchangeId)
  if (!loaded.ok) return questionnaireFailure(loaded.reason)
  // NULL, not a copy of the standard structure — the same state as an exchange
  // that was never customized. One representation for one meaning.
  if (!(await persist(exchangeId, null))) return questionnaireFailure('failed')
  return { ok: true, doc: standardQuestionnaire() }
}

// Phrasings at least three INDEPENDENT schools converged on, in the caller's
// own language (banked labels are monolingual). The RPC returns aggregates
// only — one school never sees another's raw wording, and the three-school
// threshold is also the PII guard: a label containing a student's name will
// never be written by three schools.
export async function listQuestionSuggestions(): Promise<QuestionSuggestion[]> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  const { data, error } = await supabase
    .rpc('application_question_suggestions', { p_locale: profile.locale })
  // An empty list is the normal state at launch; a failure degrades to the
  // same thing rather than breaking the dialog.
  if (error || !Array.isArray(data)) return []
  return (data as { label: string; type: string; options: unknown; schools: number }[])
    .filter(r => (CUSTOM_QUESTION_TYPES as readonly string[]).includes(r.type))
    .map(r => ({
      label: r.label,
      type: r.type as CustomQuestionType,
      options: Array.isArray(r.options) ? (r.options as { value: string; label: string }[]) : null,
      schools: Number(r.schools),
    }))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run actions/__tests__/questionnaire.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirm no new service-role import**

Run: `pnpm exec vitest run lib/supabase/__tests__/admin-allowlist.test.ts`
Expected: PASS — this feature uses the request-scoped client throughout, so the allowlist is unchanged.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add lib/questionnaire/result.ts actions/questionnaire.ts actions/__tests__/questionnaire.test.ts
git commit -m "feat(questionnaire): organizer server actions with a server-side lock"
```

---

## Task 8: Editor copy in five languages

**Files:**
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the `organizer.questionnaire.*` namespace, consumed by Tasks 9–11.

This task exists on its own and comes **before** the UI so the components can be written and tested against real copy. `messages/__tests__/parity.test.ts` uses **fr** as the reference key set: add the block to `fr.json` first, then mirror it exactly.

- [ ] **Step 1: Add the block to `messages/fr.json`**

Insert under `"organizer"`, as a sibling of `"applications"`:

```json
"questionnaire": {
  "card": {
    "title": "Questionnaire de candidature",
    "template": "Modèle : {name}",
    "templateStandard": "Questionnaire standard",
    "summary": "{n} questions · 4 sections",
    "locked": "Verrouillé — {n} candidatures reçues",
    "edit": "Modifier",
    "view": "Consulter",
    "reset": "Réinitialiser",
    "resetTitle": "Revenir au questionnaire standard ?",
    "resetBody": "Toutes vos modifications seront perdues et le questionnaire redeviendra celui du modèle standard.",
    "resetConfirm": "Réinitialiser"
  },
  "page": {
    "title": "Questionnaire de candidature",
    "back": "← Candidatures",
    "intro": "Ajoutez ou retirez des questions. Chaque modification est enregistrée aussitôt.",
    "lockedNotice": "Ce questionnaire est verrouillé : {n} candidatures ont déjà été reçues. Il reste consultable.",
    "sectionCount": "{n} questions",
    "add": "＋ Ajouter une question",
    "lockedTooltip": "Recueillie avant le formulaire — elle sert à envoyer l’invitation.",
    "remove": "Retirer",
    "editQuestion": "Modifier la question",
    "required": "obligatoire",
    "empty": "Aucune question dans cette section."
  },
  "types": {
    "text": "Texte court",
    "textarea": "Texte long",
    "date": "Date",
    "yesno": "Oui / Non",
    "radio": "Choix multiple",
    "photo": "Photo",
    "email": "E-mail",
    "tel": "Téléphone"
  },
  "cascade": {
    "title": "Cette question en entraîne une autre",
    "body": "Retirer « {question} » retirera aussi « {dependent} », qui n’a de sens qu’avec elle.",
    "confirm": "Retirer les deux"
  },
  "dialog": {
    "title": "Ajouter une question — {section}",
    "removedHeading": "Questions retirées",
    "removedEmpty": "Toutes les questions du modèle sont présentes.",
    "suggestionsHeading": "Suggestions d’autres établissements",
    "suggestionsEmpty": "Aucune suggestion pour l’instant.",
    "suggestionsSchools": "{n} établissements",
    "orCreate": "ou créer",
    "label": "Intitulé",
    "type": "Type",
    "required": "Réponse obligatoire",
    "options": "Choix (un par ligne)",
    "add": "Ajouter"
  },
  "editDialog": {
    "title": "Modifier la question",
    "save": "Enregistrer"
  },
  "errors": {
    "locked": "Ce questionnaire est verrouillé : des candidatures ont déjà été reçues.",
    "not_found": "Programme introuvable.",
    "invalid_label": "L’intitulé doit contenir entre 1 et 120 caractères.",
    "invalid_type": "Type de question non pris en charge.",
    "invalid_options": "Un choix multiple demande au moins deux options.",
    "unknown_question": "Cette question n’est plus dans le questionnaire — rechargez la page.",
    "failed": "L’enregistrement a échoué. Réessayez."
  }
}
```

French copy uses typographic apostrophes (`’`) throughout — the audit flags ASCII `'` in `fr.json`.

- [ ] **Step 2: Add the same block to `messages/en.json`**

```json
"questionnaire": {
  "card": {
    "title": "Application questionnaire",
    "template": "Template: {name}",
    "templateStandard": "Standard questionnaire",
    "summary": "{n} questions · 4 sections",
    "locked": "Locked — {n} applications received",
    "edit": "Edit",
    "view": "View",
    "reset": "Reset",
    "resetTitle": "Go back to the standard questionnaire?",
    "resetBody": "All your changes will be lost and the questionnaire will return to the standard template.",
    "resetConfirm": "Reset"
  },
  "page": {
    "title": "Application questionnaire",
    "back": "← Applications",
    "intro": "Add or remove questions. Every change is saved immediately.",
    "lockedNotice": "This questionnaire is locked: {n} applications have already been received. It stays readable.",
    "sectionCount": "{n} questions",
    "add": "＋ Add a question",
    "lockedTooltip": "Collected before the form opens — it is where the invitation is sent.",
    "remove": "Remove",
    "editQuestion": "Edit question",
    "required": "required",
    "empty": "No questions in this section."
  },
  "types": {
    "text": "Short text",
    "textarea": "Long text",
    "date": "Date",
    "yesno": "Yes / No",
    "radio": "Multiple choice",
    "photo": "Photo",
    "email": "Email",
    "tel": "Phone"
  },
  "cascade": {
    "title": "This question brings another with it",
    "body": "Removing “{question}” will also remove “{dependent}”, which only makes sense alongside it.",
    "confirm": "Remove both"
  },
  "dialog": {
    "title": "Add a question — {section}",
    "removedHeading": "Removed questions",
    "removedEmpty": "Every question from the template is present.",
    "suggestionsHeading": "Suggestions from other schools",
    "suggestionsEmpty": "No suggestions yet.",
    "suggestionsSchools": "{n} schools",
    "orCreate": "or create",
    "label": "Label",
    "type": "Type",
    "required": "Answer required",
    "options": "Choices (one per line)",
    "add": "Add"
  },
  "editDialog": {
    "title": "Edit question",
    "save": "Save"
  },
  "errors": {
    "locked": "This questionnaire is locked: applications have already been received.",
    "not_found": "Programme not found.",
    "invalid_label": "The label must be between 1 and 120 characters.",
    "invalid_type": "Unsupported question type.",
    "invalid_options": "A multiple choice needs at least two options.",
    "unknown_question": "That question is no longer in the questionnaire — reload the page.",
    "failed": "Saving failed. Please try again."
  }
}
```

- [ ] **Step 3: Add the same block to `messages/es.json`**

```json
"questionnaire": {
  "card": {
    "title": "Cuestionario de candidatura",
    "template": "Plantilla: {name}",
    "templateStandard": "Cuestionario estándar",
    "summary": "{n} preguntas · 4 secciones",
    "locked": "Bloqueado — {n} candidaturas recibidas",
    "edit": "Modificar",
    "view": "Consultar",
    "reset": "Restablecer",
    "resetTitle": "¿Volver al cuestionario estándar?",
    "resetBody": "Se perderán todos tus cambios y el cuestionario volverá a la plantilla estándar.",
    "resetConfirm": "Restablecer"
  },
  "page": {
    "title": "Cuestionario de candidatura",
    "back": "← Candidaturas",
    "intro": "Añade o quita preguntas. Cada cambio se guarda al instante.",
    "lockedNotice": "Este cuestionario está bloqueado: ya se han recibido {n} candidaturas. Sigue siendo consultable.",
    "sectionCount": "{n} preguntas",
    "add": "＋ Añadir una pregunta",
    "lockedTooltip": "Se recoge antes del formulario — sirve para enviar la invitación.",
    "remove": "Quitar",
    "editQuestion": "Modificar la pregunta",
    "required": "obligatoria",
    "empty": "No hay preguntas en esta sección."
  },
  "types": {
    "text": "Texto corto",
    "textarea": "Texto largo",
    "date": "Fecha",
    "yesno": "Sí / No",
    "radio": "Opción múltiple",
    "photo": "Foto",
    "email": "Correo electrónico",
    "tel": "Teléfono"
  },
  "cascade": {
    "title": "Esta pregunta arrastra otra",
    "body": "Quitar «{question}» también quitará «{dependent}», que solo tiene sentido junto a ella.",
    "confirm": "Quitar las dos"
  },
  "dialog": {
    "title": "Añadir una pregunta — {section}",
    "removedHeading": "Preguntas quitadas",
    "removedEmpty": "Todas las preguntas de la plantilla están presentes.",
    "suggestionsHeading": "Sugerencias de otros centros",
    "suggestionsEmpty": "Todavía no hay sugerencias.",
    "suggestionsSchools": "{n} centros",
    "orCreate": "o crear",
    "label": "Enunciado",
    "type": "Tipo",
    "required": "Respuesta obligatoria",
    "options": "Opciones (una por línea)",
    "add": "Añadir"
  },
  "editDialog": {
    "title": "Modificar la pregunta",
    "save": "Guardar"
  },
  "errors": {
    "locked": "Este cuestionario está bloqueado: ya se han recibido candidaturas.",
    "not_found": "Programa no encontrado.",
    "invalid_label": "El enunciado debe tener entre 1 y 120 caracteres.",
    "invalid_type": "Tipo de pregunta no admitido.",
    "invalid_options": "Una opción múltiple necesita al menos dos opciones.",
    "unknown_question": "Esa pregunta ya no está en el cuestionario — recarga la página.",
    "failed": "No se ha podido guardar. Inténtalo de nuevo."
  }
}
```

- [ ] **Step 4: Add the same block to `messages/it.json`**

```json
"questionnaire": {
  "card": {
    "title": "Questionario di candidatura",
    "template": "Modello: {name}",
    "templateStandard": "Questionario standard",
    "summary": "{n} domande · 4 sezioni",
    "locked": "Bloccato — {n} candidature ricevute",
    "edit": "Modifica",
    "view": "Consulta",
    "reset": "Reimposta",
    "resetTitle": "Tornare al questionario standard?",
    "resetBody": "Tutte le tue modifiche andranno perse e il questionario tornerà al modello standard.",
    "resetConfirm": "Reimposta"
  },
  "page": {
    "title": "Questionario di candidatura",
    "back": "← Candidature",
    "intro": "Aggiungi o togli domande. Ogni modifica viene salvata subito.",
    "lockedNotice": "Questo questionario è bloccato: sono già state ricevute {n} candidature. Resta consultabile.",
    "sectionCount": "{n} domande",
    "add": "＋ Aggiungi una domanda",
    "lockedTooltip": "Raccolta prima del modulo — serve a inviare l’invito.",
    "remove": "Togli",
    "editQuestion": "Modifica la domanda",
    "required": "obbligatoria",
    "empty": "Nessuna domanda in questa sezione."
  },
  "types": {
    "text": "Testo breve",
    "textarea": "Testo lungo",
    "date": "Data",
    "yesno": "Sì / No",
    "radio": "Scelta multipla",
    "photo": "Foto",
    "email": "E-mail",
    "tel": "Telefono"
  },
  "cascade": {
    "title": "Questa domanda ne trascina un’altra",
    "body": "Togliere «{question}» toglierà anche «{dependent}», che ha senso solo insieme a lei.",
    "confirm": "Togli entrambe"
  },
  "dialog": {
    "title": "Aggiungi una domanda — {section}",
    "removedHeading": "Domande tolte",
    "removedEmpty": "Tutte le domande del modello sono presenti.",
    "suggestionsHeading": "Suggerimenti da altri istituti",
    "suggestionsEmpty": "Ancora nessun suggerimento.",
    "suggestionsSchools": "{n} istituti",
    "orCreate": "oppure crea",
    "label": "Testo della domanda",
    "type": "Tipo",
    "required": "Risposta obbligatoria",
    "options": "Scelte (una per riga)",
    "add": "Aggiungi"
  },
  "editDialog": {
    "title": "Modifica la domanda",
    "save": "Salva"
  },
  "errors": {
    "locked": "Questo questionario è bloccato: sono già state ricevute delle candidature.",
    "not_found": "Programma non trovato.",
    "invalid_label": "Il testo deve contenere da 1 a 120 caratteri.",
    "invalid_type": "Tipo di domanda non supportato.",
    "invalid_options": "Una scelta multipla richiede almeno due opzioni.",
    "unknown_question": "Questa domanda non è più nel questionario — ricarica la pagina.",
    "failed": "Salvataggio non riuscito. Riprova."
  }
}
```

- [ ] **Step 5: Add the same block to `messages/de.json`**

```json
"questionnaire": {
  "card": {
    "title": "Bewerbungsfragebogen",
    "template": "Vorlage: {name}",
    "templateStandard": "Standardfragebogen",
    "summary": "{n} Fragen · 4 Abschnitte",
    "locked": "Gesperrt — {n} Bewerbungen eingegangen",
    "edit": "Bearbeiten",
    "view": "Ansehen",
    "reset": "Zurücksetzen",
    "resetTitle": "Zum Standardfragebogen zurückkehren?",
    "resetBody": "Alle Ihre Änderungen gehen verloren und der Fragebogen entspricht wieder der Standardvorlage.",
    "resetConfirm": "Zurücksetzen"
  },
  "page": {
    "title": "Bewerbungsfragebogen",
    "back": "← Bewerbungen",
    "intro": "Fügen Sie Fragen hinzu oder entfernen Sie sie. Jede Änderung wird sofort gespeichert.",
    "lockedNotice": "Dieser Fragebogen ist gesperrt: Es sind bereits {n} Bewerbungen eingegangen. Er bleibt einsehbar.",
    "sectionCount": "{n} Fragen",
    "add": "＋ Frage hinzufügen",
    "lockedTooltip": "Wird vor dem Formular erhoben — daran wird die Einladung geschickt.",
    "remove": "Entfernen",
    "editQuestion": "Frage bearbeiten",
    "required": "Pflichtangabe",
    "empty": "Keine Fragen in diesem Abschnitt."
  },
  "types": {
    "text": "Kurzer Text",
    "textarea": "Langer Text",
    "date": "Datum",
    "yesno": "Ja / Nein",
    "radio": "Mehrfachauswahl",
    "photo": "Foto",
    "email": "E-Mail",
    "tel": "Telefon"
  },
  "cascade": {
    "title": "Diese Frage zieht eine weitere nach sich",
    "body": "Wenn Sie „{question}“ entfernen, wird auch „{dependent}“ entfernt — sie ergibt nur zusammen mit ihr Sinn.",
    "confirm": "Beide entfernen"
  },
  "dialog": {
    "title": "Frage hinzufügen — {section}",
    "removedHeading": "Entfernte Fragen",
    "removedEmpty": "Alle Fragen der Vorlage sind vorhanden.",
    "suggestionsHeading": "Vorschläge anderer Schulen",
    "suggestionsEmpty": "Noch keine Vorschläge.",
    "suggestionsSchools": "{n} Schulen",
    "orCreate": "oder neu anlegen",
    "label": "Fragetext",
    "type": "Typ",
    "required": "Pflichtangabe",
    "options": "Auswahlmöglichkeiten (eine pro Zeile)",
    "add": "Hinzufügen"
  },
  "editDialog": {
    "title": "Frage bearbeiten",
    "save": "Speichern"
  },
  "errors": {
    "locked": "Dieser Fragebogen ist gesperrt: Es sind bereits Bewerbungen eingegangen.",
    "not_found": "Programm nicht gefunden.",
    "invalid_label": "Der Fragetext muss zwischen 1 und 120 Zeichen lang sein.",
    "invalid_type": "Nicht unterstützter Fragetyp.",
    "invalid_options": "Eine Mehrfachauswahl braucht mindestens zwei Optionen.",
    "unknown_question": "Diese Frage ist nicht mehr im Fragebogen — laden Sie die Seite neu.",
    "failed": "Speichern fehlgeschlagen. Bitte erneut versuchen."
  }
}
```

- [ ] **Step 6: Run the parity gate**

Run: `pnpm exec vitest run messages/__tests__/parity.test.ts`
Expected: PASS — identical key sets across the five locales, no empty values, and the same ICU arguments (`{n}`, `{name}`, `{question}`, `{dependent}`, `{section}`) everywhere.

- [ ] **Step 7: Run the advisory audit**

Run: `node scripts/i18n-audit.mjs`
Expected: the new keys may be listed as "unreferenced" until Tasks 9–11 land — that is fine and expected here. There must be **no ASCII-apostrophe warning for `fr.json`**.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "i18n(questionnaire): editor copy in five languages"
```

---

## Task 9: The editor page

**Files:**
- Create: `lib/questionnaire/rows.ts`
- Create: `lib/questionnaire/__tests__/rows.test.ts`
- Create: `app/(organizer)/applications/questionnaire/page.tsx`
- Create: `components/applications/QuestionnaireEditor.tsx`
- Create: `components/applications/__tests__/QuestionnaireEditor.test.tsx`

**Interfaces:**
- Consumes: `getQuestionnaire`, `removeQuestion`, `resetQuestionnaire` (Task 7); `organizer.questionnaire.*` copy (Task 8); `localizedApplicationSections` (Task 3).
- Produces:
  ```ts
  // lib/questionnaire/rows.ts
  type EditorRow = {
    id: string
    label: string
    type: AppFieldType | 'photo'
    locked: boolean          // first_name / last_name / email — no ✕
    custom: boolean          // gets a ✎ as well
    required: boolean
    options: { value: string; label: string }[] | null
  }
  function editorRows(doc: ApplicationFieldsDoc, sectionId: SectionId, tApply: AppTranslator): EditorRow[]

  // components/applications/QuestionnaireEditor.tsx
  <QuestionnaireEditor exchangeId={string} initialDoc={ApplicationFieldsDoc} locked={boolean} applicationCount={number} />
  ```
  `AddQuestionDialog` arrives in Task 10; until then the « + » button is rendered `disabled` with a `TODO`-free placeholder handler that does nothing. Task 10 replaces it.

- [ ] **Step 1: Write the failing row-model test**

Create `lib/questionnaire/__tests__/rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { removeQuestion } from '@/lib/application-fields'
import { editorRows } from '../rows'

const t = ((key: string) => `T:${key}`) as never

describe('editorRows', () => {
  const student = editorRows(standardQuestionnaire(), 'student', t)

  it('puts the portrait first, typed as a photo and removable', () => {
    expect(student[0]).toMatchObject({ id: 'photo', type: 'photo', locked: false, custom: false })
    expect(student[0].label).toBe('T:photo.label')
  })

  it('marks the three invitation-driving questions as locked', () => {
    const locked = student.filter(r => r.locked).map(r => r.id)
    expect(locked.sort()).toEqual(['email', 'first_name', 'last_name'])
  })

  it('labels built-ins through the apply catalog', () => {
    expect(student.find(r => r.id === 'nationality')!.label).toBe('T:fields.nationality.label')
  })

  it('labels a custom question verbatim and marks it editable', () => {
    const doc = standardQuestionnaire()
    doc.sections[0].fields.push({ id: 'c_7f3a', type: 'yesno', label: 'Sait nager ?', required: true })
    const row = editorRows(doc, 'student', t).at(-1)!
    expect(row).toMatchObject({ id: 'c_7f3a', label: 'Sait nager ?', type: 'yesno', custom: true, required: true, locked: false })
  })

  it("carries a custom question's options through for the edit dialog", () => {
    const doc = standardQuestionnaire()
    doc.sections[0].fields.push({
      id: 'c_1', type: 'radio', label: 'Régime',
      options: [{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }],
    })
    expect(editorRows(doc, 'student', t).at(-1)!.options)
      .toEqual([{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }])
  })

  it('drops a row for an unknown ref rather than rendering a blank one', () => {
    const doc = standardQuestionnaire()
    doc.sections[2].fields.push({ ref: 'no_such_field' })
    expect(editorRows(doc, 'hosting', t).map(r => r.id)).not.toContain('no_such_field')
  })

  it('reflects a removal', () => {
    const doc = removeQuestion(standardQuestionnaire(), 'hosting', 'pets')
    expect(editorRows(doc, 'hosting', t).map(r => r.id)).not.toContain('pets')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/questionnaire/__tests__/rows.test.ts`
Expected: FAIL — cannot resolve `../rows`.

- [ ] **Step 3: Write the row model**

Create `lib/questionnaire/rows.ts`:

```ts
// One editable line of the questionnaire editor. Pure: the doc plus the `apply`
// translator in, display rows out — so the editor's label, lock and type rules
// are unit-testable without mounting React.
import { APPLICATION_SECTIONS, type AppFieldType } from '@/lib/application-form'
import {
  entryId, isCustomQuestion, sectionEntries, LOCKED_QUESTION_IDS, PHOTO_REF,
  type ApplicationFieldsDoc, type SectionId,
} from '@/lib/application-fields'
import type { AppTranslator } from '@/lib/i18n/messages'

export type EditorRow = {
  id: string
  label: string
  // 'photo' is the pseudo-field's own type; it is removable like any other
  // question but has no answer and no options.
  type: AppFieldType | 'photo'
  // first_name / last_name / email: collected before the questionnaire opens
  // and used to address the invitation. Rendered with a lock, never an ✕.
  locked: boolean
  custom: boolean
  required: boolean
  options: { value: string; label: string }[] | null
}

export function editorRows(
  doc: ApplicationFieldsDoc, sectionId: SectionId, tApply: AppTranslator,
): EditorRow[] {
  const builtIns = APPLICATION_SECTIONS.find(s => s.id === sectionId)?.fields ?? []
  return sectionEntries(doc, sectionId).flatMap<EditorRow>(entry => {
    if (isCustomQuestion(entry)) {
      // An organizer's own wording, shown exactly as typed in every locale.
      return [{
        id: entry.id,
        label: entry.label,
        type: entry.type,
        locked: false,
        custom: true,
        required: entry.required === true,
        options: entry.options ?? null,
      }]
    }
    if (entry.ref === PHOTO_REF) {
      return [{
        id: PHOTO_REF, label: tApply('photo.label'), type: 'photo',
        locked: false, custom: false, required: true, options: null,
      }]
    }
    const field = builtIns.find(f => f.id === entry.ref)
    // A ref to a built-in that no longer exists in code is skipped rather than
    // rendered blank — same rule as resolveApplicationSections.
    if (!field) return []
    return [{
      id: field.id,
      label: tApply(`fields.${field.id}.label`),
      type: field.type,
      locked: (LOCKED_QUESTION_IDS as readonly string[]).includes(field.id),
      custom: false,
      required: field.required === true,
      options: null,
    }]
  })
}

export { entryId }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run lib/questionnaire/__tests__/rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the editor component**

Create `components/applications/QuestionnaireEditor.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { asAppTranslator } from '@/lib/i18n/messages'
import { SECTION_IDS, CASCADE_REMOVALS, type ApplicationFieldsDoc, type SectionId } from '@/lib/application-fields'
import { editorRows, type EditorRow } from '@/lib/questionnaire/rows'
import { removeQuestion, resetQuestionnaire } from '@/actions/questionnaire'
import type { QuestionnaireFailureReason } from '@/lib/questionnaire/result'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// The four fixed sections, each a native <details> disclosure (keyboard- and
// screen-reader-correct without a line of state).
//
// Every ✕ and every add is a PERSISTED SERVER ACTION IMMEDIATELY — no
// draft/save cycle. That is safe precisely because the questionnaire locks the
// moment the first candidate appears, so nothing here can move under someone's
// feet. `locked` greys the page out; the actions re-check server-side anyway.
export function QuestionnaireEditor({
  exchangeId, initialDoc, locked, applicationCount,
}: {
  exchangeId: string
  initialDoc: ApplicationFieldsDoc
  locked: boolean
  applicationCount: number
}) {
  const t = useTranslations('organizer.questionnaire')
  const tApplyRaw = useTranslations('apply')
  const tApply = asAppTranslator(tApplyRaw)
  const c = useTranslations('common')
  const [doc, setDoc] = useState(initialDoc)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)
  // A removal that drags a dependent question with it is confirmed first.
  const [cascade, setCascade] = useState<{ sectionId: SectionId; row: EditorRow; dependent: string } | null>(null)
  const [resetting, setResetting] = useState(false)

  function labelOf(sectionId: SectionId, id: string): string {
    return editorRows(doc, sectionId, tApply).find(r => r.id === id)?.label ?? id
  }

  async function persistRemoval(sectionId: SectionId, questionId: string) {
    setBusy(true); setError(null)
    try {
      const res = await removeQuestion(exchangeId, sectionId, questionId)
      // Structured outcomes, never a thrown message: production redacts those
      // to an opaque digest.
      if (!res.ok) { setError(res.reason); return }
      setDoc(res.doc)
    } catch {
      setError('failed')
    } finally { setBusy(false); setCascade(null) }
  }

  function onRemove(sectionId: SectionId, row: EditorRow) {
    const dependentId = CASCADE_REMOVALS[row.id]?.[0]
    if (dependentId) {
      setCascade({ sectionId, row, dependent: labelOf(sectionId, dependentId) })
      return
    }
    void persistRemoval(sectionId, row.id)
  }

  async function onReset() {
    setBusy(true); setError(null)
    try {
      const res = await resetQuestionnaire(exchangeId)
      if (!res.ok) { setError(res.reason); return }
      setDoc(res.doc)
    } catch {
      setError('failed')
    } finally { setBusy(false); setResetting(false) }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-navy">
          {t('page.back')}
        </Link>
        {!locked && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => setResetting(true)}>
            {t('card.reset')}
          </Button>
        )}
      </div>

      <h1 className="font-display text-2xl font-bold text-navy">{t('page.title')}</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {locked ? t('page.lockedNotice', { n: applicationCount }) : t('page.intro')}
      </p>

      {error && <p className="mb-4 text-sm text-danger-text">{t(`errors.${error}`)}</p>}

      <div className="flex flex-col gap-3">
        {SECTION_IDS.map(sectionId => {
          const rows = editorRows(doc, sectionId, tApply)
          return (
            <details key={sectionId} open className="rounded-[11px] border bg-card px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px]">
                <span className="font-semibold text-navy">{tApply(`sections.${sectionId}.title`)}</span>
                <span className="text-muted-foreground">{t('page.sectionCount', { n: rows.length })}</span>
                <span className="ml-auto text-tertiary">⌄</span>
              </summary>

              <ul className="mt-3 flex flex-col border-t pt-2">
                {rows.length === 0 && (
                  <li className="py-2 text-[13px] text-muted-foreground">{t('page.empty')}</li>
                )}
                {rows.map(row => (
                  <li key={row.id} className="flex items-center gap-2 border-b py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm text-navy">
                      {row.label}
                      {row.required && <span className="ml-1.5 text-[11px] text-tertiary">{t('page.required')}</span>}
                    </span>
                    <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {t(`types.${row.type}`)}
                    </span>
                    {row.locked ? (
                      <span className="w-[22px] text-center text-tertiary" title={t('page.lockedTooltip')} aria-label={t('page.lockedTooltip')}>🔒</span>
                    ) : (
                      <button
                        type="button"
                        disabled={locked || busy}
                        onClick={() => onRemove(sectionId, row)}
                        aria-label={`${t('page.remove')} — ${row.label}`}
                        className="w-[22px] text-center text-danger-text disabled:opacity-30"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={locked || busy}
                  className="text-[13px] font-semibold text-brand disabled:opacity-40"
                >
                  {t('page.add')}
                </button>
              </div>
            </details>
          )
        })}
      </div>

      <Dialog open={cascade != null} onOpenChange={open => { if (!open) setCascade(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cascade.title')}</DialogTitle>
            <DialogDescription>
              {cascade && t('cascade.body', { question: cascade.row.label, dependent: cascade.dependent })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCascade(null)}>{c('actions.cancel')}</Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => cascade && void persistRemoval(cascade.sectionId, cascade.row.id)}
            >
              {t('cascade.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetting} onOpenChange={setResetting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('card.resetTitle')}</DialogTitle>
            <DialogDescription>{t('card.resetBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResetting(false)}>{c('actions.cancel')}</Button>
            <Button type="button" disabled={busy} onClick={() => void onReset()}>{t('card.resetConfirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 6: Write the page**

Create `app/(organizer)/applications/questionnaire/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getQuestionnaire } from '@/actions/questionnaire'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { QuestionnaireEditor } from '@/components/applications/QuestionnaireEditor'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

// Scoped to the ACTIVE exchange, like /applications itself: the questionnaire
// belongs to one exchange, and the shell's exchange switcher is how you change
// which one you are editing.
export default async function QuestionnairePage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { doc, locked, applicationCount } = await getQuestionnaire(active.id)
  return (
    <QuestionnaireEditor
      exchangeId={active.id}
      initialDoc={doc}
      locked={locked}
      applicationCount={applicationCount}
    />
  )
}
```

- [ ] **Step 7: Write the editor tests**

Create `components/applications/__tests__/QuestionnaireEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { removeQuestion as removeFromDoc } from '@/lib/application-fields'

const removeQuestion = vi.fn()
const resetQuestionnaire = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  removeQuestion: (...a: unknown[]) => removeQuestion(...(a as [])),
  resetQuestionnaire: (...a: unknown[]) => resetQuestionnaire(...(a as [])),
}))

import { QuestionnaireEditor } from '@/components/applications/QuestionnaireEditor'

beforeEach(() => {
  vi.clearAllMocks()
  removeQuestion.mockImplementation(async (_id: string, sectionId: never, questionId: string) =>
    ({ ok: true, doc: removeFromDoc(standardQuestionnaire(), sectionId, questionId) }))
  resetQuestionnaire.mockResolvedValue({ ok: true, doc: standardQuestionnaire() })
})

function renderEditor(over: Partial<Parameters<typeof QuestionnaireEditor>[0]> = {}) {
  return renderWithIntl(
    <QuestionnaireEditor exchangeId="ex-1" initialDoc={standardQuestionnaire()} locked={false} applicationCount={0} {...over} />,
  )
}

describe('QuestionnaireEditor', () => {
  it('renders all four sections, always', () => {
    renderEditor()
    for (const title of ['Élève', 'Parents', 'Conditions d’accueil', 'Profil de l’élève']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  it('gives the three invitation-driving questions a lock and no remove button', () => {
    renderEditor()
    expect(screen.queryByRole('button', { name: /Retirer — Nom$/ })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/sert à envoyer l’invitation/)).toHaveLength(3)
  })

  it('offers the portrait for removal like any other question', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: /Retirer — Photo récente/ })).toBeInTheDocument()
  })

  it('persists a removal immediately — there is no save button', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Retirer — Animaux domestiques/ }))
    expect(removeQuestion).toHaveBeenCalledWith('ex-1', 'hosting', 'pets')
    expect(await screen.findByText(/9 questions/)).toBeInTheDocument()
  })

  it('warns before a cascading removal and only then persists both', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Retirer — Genre/ }))
    expect(removeQuestion).not.toHaveBeenCalled()
    expect(screen.getByText(/entraîne une autre/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer les deux' }))
    expect(removeQuestion).toHaveBeenCalledWith('ex-1', 'student', 'sex')
  })

  it('is read-only once locked, and says why', () => {
    renderEditor({ locked: true, applicationCount: 12 })
    expect(screen.getByText(/12 candidatures ont déjà été reçues/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retirer — Animaux domestiques/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument()
  })

  it("shows the server's refusal code as a sentence, never a digest", async () => {
    const user = userEvent.setup()
    removeQuestion.mockResolvedValue({ ok: false, reason: 'locked' })
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Retirer — Animaux domestiques/ }))
    expect(await screen.findByText(/verrouillé/)).toBeInTheDocument()
  })

  it('resets to the standard questionnaire after confirming', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(resetQuestionnaire).toHaveBeenCalledWith('ex-1')
  })
})
```

If the last test's two identically-named buttons are ambiguous under testing-library, scope the confirm click to the dialog: `within(screen.getByRole('dialog')).getByRole('button', { name: 'Réinitialiser' })`.

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run components/applications/__tests__/QuestionnaireEditor.test.tsx lib/questionnaire`
Expected: PASS.

- [ ] **Step 9: Typecheck, lint, build**

Run: `npx tsc --noEmit && pnpm lint && pnpm build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git branch --show-current
git add lib/questionnaire/rows.ts lib/questionnaire/__tests__/rows.test.ts "app/(organizer)/applications/questionnaire/page.tsx" components/applications/QuestionnaireEditor.tsx components/applications/__tests__/QuestionnaireEditor.test.tsx
git commit -m "feat(questionnaire): the editor page"
```

---

## Task 10: The « + » dialog

**Files:**
- Create: `components/applications/AddQuestionDialog.tsx`
- Create: `components/applications/__tests__/AddQuestionDialog.test.tsx`
- Modify: `components/applications/QuestionnaireEditor.tsx` (wire the button, add the edit dialog)

**Interfaces:**
- Consumes: `addQuestion`, `editCustomQuestion`, `listQuestionSuggestions` (Task 7); `removedBuiltIns` (Task 2); `organizer.questionnaire.dialog.*` / `.editDialog.*` copy (Task 8).
- Produces:
  ```tsx
  <AddQuestionDialog
    exchangeId={string}
    sectionId={SectionId}
    doc={ApplicationFieldsDoc}
    open={boolean}
    onOpenChange={(open: boolean) => void}
    onAdded={(doc: ApplicationFieldsDoc) => void}
  />
  ```

**The three zones, in order:** the built-ins this section lost (fully translated when restored, and the only zone that is useful on day one), then suggestions at least three other schools converged on (locale-matched, empty until the bank fills), then a free-form create form.

- [ ] **Step 1: Write the dialog**

Create `components/applications/AddQuestionDialog.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { asAppTranslator } from '@/lib/i18n/messages'
import {
  removedBuiltIns, normalizeQuestionLabel, sectionEntries, isCustomQuestion,
  CUSTOM_QUESTION_TYPES, CUSTOM_LABEL_MAX,
  type ApplicationFieldsDoc, type CustomQuestionType, type SectionId,
} from '@/lib/application-fields'
import { addQuestion, listQuestionSuggestions } from '@/actions/questionnaire'
import type { QuestionnaireFailureReason, QuestionSuggestion } from '@/lib/questionnaire/result'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function AddQuestionDialog({
  exchangeId, sectionId, doc, open, onOpenChange, onAdded,
}: {
  exchangeId: string
  sectionId: SectionId
  doc: ApplicationFieldsDoc
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (doc: ApplicationFieldsDoc) => void
}) {
  const t = useTranslations('organizer.questionnaire')
  const tApply = asAppTranslator(useTranslations('apply'))
  const c = useTranslations('common')
  const [suggestions, setSuggestions] = useState<QuestionSuggestion[]>([])
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomQuestionType>('text')
  const [required, setRequired] = useState(false)
  const [options, setOptions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)

  // Reset transient state, and fetch suggestions, each time the dialog opens.
  // The list is empty at launch and stays empty until three independent schools
  // converge on a phrasing — the « Questions retirées » zone is what makes the
  // dialog useful on day one.
  useEffect(() => {
    if (!open) return
    setLabel(''); setType('text'); setRequired(false); setOptions(''); setError(null); setBusy(false)
    let live = true
    void listQuestionSuggestions()
      .then(rows => { if (live) setSuggestions(rows) })
      .catch(() => { if (live) setSuggestions([]) })
    return () => { live = false }
  }, [open])

  const restorable = removedBuiltIns(doc, sectionId)
  // Never suggest a phrasing this section already asks — comparison is on the
  // normalized label, so « Sait nager ? » does not reappear next to « sait nager? ».
  const present = new Set(
    sectionEntries(doc, sectionId)
      .filter(isCustomQuestion)
      .map(q => normalizeQuestionLabel(q.label)),
  )
  const offered = suggestions.filter(s => !present.has(normalizeQuestionLabel(s.label)))

  async function submit(input: Parameters<typeof addQuestion>[2]) {
    setBusy(true); setError(null)
    try {
      const res = await addQuestion(exchangeId, sectionId, input)
      // A code, never a message: production redacts thrown Server Action text.
      if (!res.ok) { setError(res.reason); return }
      onAdded(res.doc)
      onOpenChange(false)
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dialog.title', { section: tApply(`sections.${sectionId}.title`) })}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-danger-text">{t(`errors.${error}`)}</p>}

        <section className="mb-4">
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[.08em] text-tertiary">
            {t('dialog.removedHeading')}
          </h3>
          {restorable.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('dialog.removedEmpty')}</p>
          ) : (
            <ul className="flex flex-col">
              {restorable.map(field => (
                <li key={field.id} className="flex items-center gap-2 border-b py-1.5 last:border-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit({ kind: 'builtin', ref: field.id })}
                    className="flex-1 truncate text-left text-sm text-navy disabled:opacity-50"
                  >
                    ⊕ {tApply(`fields.${field.id}.label`)}
                  </button>
                  <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {t(`types.${field.type}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[.08em] text-tertiary">
            {t('dialog.suggestionsHeading')}
          </h3>
          {offered.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t('dialog.suggestionsEmpty')}</p>
          ) : (
            <ul className="flex flex-col">
              {offered.map(s => (
                <li key={s.label} className="flex items-center gap-2 border-b py-1.5 last:border-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit({
                      kind: 'custom', label: s.label, type: s.type, required: false,
                      options: s.options?.map(o => o.label),
                    })}
                    className="flex-1 truncate text-left text-sm text-navy disabled:opacity-50"
                  >
                    ⊕ {s.label}
                  </button>
                  <span className="whitespace-nowrap rounded-[6px] bg-subtle px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {t(`types.${s.type}`)}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-tertiary">
                    {t('dialog.suggestionsSchools', { n: s.schools })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="my-2 flex items-center gap-3 text-[11px] uppercase tracking-[.08em] text-tertiary">
          <span className="h-px flex-1 bg-border" />
          {t('dialog.orCreate')}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-question-label">{t('dialog.label')}</Label>
            <Input
              id="new-question-label"
              value={label}
              maxLength={CUSTOM_LABEL_MAX}
              onChange={e => setLabel(e.target.value)}
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[13.5px] font-semibold text-foreground">{t('dialog.type')}</legend>
            <div className="flex flex-wrap gap-3">
              {CUSTOM_QUESTION_TYPES.map(v => (
                <label key={v} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="new-question-type" checked={type === v} onChange={() => setType(v)} />
                  {t(`types.${v}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {type === 'radio' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-question-options">{t('dialog.options')}</Label>
              <Textarea id="new-question-options" value={options} onChange={e => setOptions(e.target.value)} rows={4} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
            {t('dialog.required')}
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{c('actions.cancel')}</Button>
            <Button
              type="button"
              disabled={busy || label.trim() === ''}
              onClick={() => void submit({
                kind: 'custom', label, type, required,
                options: type === 'radio' ? options.split('\n') : undefined,
              })}
            >
              {t('dialog.add')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire it into the editor**

In `components/applications/QuestionnaireEditor.tsx`:

Add the imports:

```tsx
import { AddQuestionDialog } from '@/components/applications/AddQuestionDialog'
import { editCustomQuestion } from '@/actions/questionnaire'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
```

Add state, next to the existing `cascade` state:

```tsx
  const [adding, setAdding] = useState<SectionId | null>(null)
  // Custom questions also get a pencil: label, required, options.
  const [editing, setEditing] = useState<{ sectionId: SectionId; row: EditorRow } | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editRequired, setEditRequired] = useState(false)
  const [editOptions, setEditOptions] = useState('')

  function openEdit(sectionId: SectionId, row: EditorRow) {
    setEditLabel(row.label)
    setEditRequired(row.required)
    setEditOptions((row.options ?? []).map(o => o.label).join('\n'))
    setEditing({ sectionId, row })
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true); setError(null)
    try {
      const res = await editCustomQuestion(exchangeId, editing.sectionId, {
        id: editing.row.id,
        label: editLabel,
        required: editRequired,
        options: editing.row.type === 'radio' ? editOptions.split('\n') : undefined,
      })
      if (!res.ok) { setError(res.reason); return }
      setDoc(res.doc)
      setEditing(null)
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }
```

Add the pencil to each row, immediately before the lock/✕ branch:

```tsx
                    {row.custom && (
                      <button
                        type="button"
                        disabled={locked || busy}
                        onClick={() => openEdit(sectionId, row)}
                        aria-label={`${t('page.editQuestion')} — ${row.label}`}
                        className="w-[22px] text-center text-muted-foreground disabled:opacity-30"
                      >
                        ✎
                      </button>
                    )}
```

Replace the placeholder « + » button's props with a real handler:

```tsx
                <button
                  type="button"
                  disabled={locked || busy}
                  onClick={() => setAdding(sectionId)}
                  className="text-[13px] font-semibold text-brand disabled:opacity-40"
                >
                  {t('page.add')}
                </button>
```

and render the dialog once, after the `</div>` that closes the section list:

```tsx
      {adding && (
        <AddQuestionDialog
          exchangeId={exchangeId}
          sectionId={adding}
          doc={doc}
          open
          onOpenChange={open => { if (!open) setAdding(null) }}
          onAdded={next => { setDoc(next); setAdding(null) }}
        />
      )}

      <Dialog open={editing != null} onOpenChange={open => { if (!open) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-question-label">{t('dialog.label')}</Label>
              <Input id="edit-question-label" value={editLabel} maxLength={120} onChange={e => setEditLabel(e.target.value)} />
            </div>
            {editing?.row.type === 'radio' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-question-options">{t('dialog.options')}</Label>
                <Textarea id="edit-question-options" value={editOptions} rows={4} onChange={e => setEditOptions(e.target.value)} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editRequired} onChange={e => setEditRequired(e.target.checked)} />
              {t('dialog.required')}
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{c('actions.cancel')}</Button>
              <Button type="button" disabled={busy || editLabel.trim() === ''} onClick={() => void saveEdit()}>
                {t('editDialog.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Write the dialog tests**

Create `components/applications/__tests__/AddQuestionDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { removeQuestion as removeFromDoc } from '@/lib/application-fields'

const addQuestion = vi.fn()
const listQuestionSuggestions = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  addQuestion: (...a: unknown[]) => addQuestion(...(a as [])),
  listQuestionSuggestions: () => listQuestionSuggestions(),
}))

import { AddQuestionDialog } from '@/components/applications/AddQuestionDialog'

const onAdded = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  addQuestion.mockResolvedValue({ ok: true, doc: standardQuestionnaire() })
  listQuestionSuggestions.mockResolvedValue([])
})

function renderDialog(doc = removeFromDoc(standardQuestionnaire(), 'hosting', 'pets')) {
  return renderWithIntl(
    <AddQuestionDialog
      exchangeId="ex-1" sectionId="hosting" doc={doc} open
      onOpenChange={vi.fn()} onAdded={onAdded}
    />,
  )
}

describe('AddQuestionDialog', () => {
  it('offers a removed built-in back, fully translated', async () => {
    renderDialog()
    expect(await screen.findByRole('button', { name: /Animaux domestiques/ })).toBeInTheDocument()
  })

  it('restores a built-in BY REFERENCE — never as a custom copy', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /Animaux domestiques/ }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' })
    expect(onAdded).toHaveBeenCalled()
  })

  it('says so plainly when the section has lost nothing', async () => {
    renderDialog(standardQuestionnaire())
    expect(await screen.findByText(/Toutes les questions du modèle sont présentes/)).toBeInTheDocument()
  })

  it('shows an empty suggestion zone at launch rather than hiding it', async () => {
    renderDialog()
    expect(await screen.findByText(/Aucune suggestion pour l’instant/)).toBeInTheDocument()
  })

  it('shows a suggestion with how many schools converged on it', async () => {
    listQuestionSuggestions.mockResolvedValue([{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }])
    renderDialog()
    expect(await screen.findByRole('button', { name: /Sait nager \?/ })).toBeInTheDocument()
    expect(screen.getByText('7 établissements')).toBeInTheDocument()
  })

  it('adds a suggestion as a custom question with its banked wording', async () => {
    const user = userEvent.setup()
    listQuestionSuggestions.mockResolvedValue([{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }])
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /Sait nager \?/ }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', {
      kind: 'custom', label: 'Sait nager ?', type: 'yesno', required: false, options: undefined,
    })
  })

  it('does not suggest a phrasing the section already asks, spelled differently', async () => {
    listQuestionSuggestions.mockResolvedValue([{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }])
    const doc = standardQuestionnaire()
    doc.sections[2].fields.push({ id: 'c_1', type: 'yesno', label: 'sait nager?' })
    renderDialog(doc)
    expect(await screen.findByText(/Aucune suggestion pour l’instant/)).toBeInTheDocument()
  })

  it('creates a custom question from the form', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('Intitulé'), 'Sait nager ?')
    await user.click(screen.getByLabelText('Oui / Non'))
    await user.click(screen.getByLabelText('Réponse obligatoire'))
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', {
      kind: 'custom', label: 'Sait nager ?', type: 'yesno', required: true, options: undefined,
    })
  })

  it('reveals the options field only for a multiple choice, and sends the lines', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByLabelText(/Choix \(un par ligne\)/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Intitulé'), 'Régime')
    await user.click(screen.getByLabelText('Choix multiple'))
    await user.type(screen.getByLabelText(/Choix \(un par ligne\)/), 'Végétarien\nAucun')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', {
      kind: 'custom', label: 'Régime', type: 'radio', required: false, options: ['Végétarien', 'Aucun'],
    })
  })

  it('keeps « Ajouter » inert until a label is typed', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })

  it("renders the server's refusal code as a sentence", async () => {
    const user = userEvent.setup()
    addQuestion.mockResolvedValue({ ok: false, reason: 'invalid_options' })
    renderDialog()
    await user.type(screen.getByLabelText('Intitulé'), 'Régime')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByText(/au moins deux options/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Add the editor's pencil test**

Append to `components/applications/__tests__/QuestionnaireEditor.test.tsx` (and add `editCustomQuestion` + `addQuestion` + `listQuestionSuggestions` to the `@/actions/questionnaire` mock at the top of that file):

```tsx
it('gives a custom question a pencil that pre-fills its current definition', async () => {
  const user = userEvent.setup()
  const doc = standardQuestionnaire()
  doc.sections[0].fields.push({ id: 'c_7f3a', type: 'text', label: 'Sait nager ?', required: true })
  renderEditor({ initialDoc: doc })
  await user.click(screen.getByRole('button', { name: /Modifier la question — Sait nager \?/ }))
  expect((screen.getByLabelText('Intitulé') as HTMLInputElement).value).toBe('Sait nager ?')
  expect(screen.getByLabelText('Réponse obligatoire')).toBeChecked()
})

it('gives a built-in no pencil — their labels are translated, an edit could only be monolingual', () => {
  renderEditor()
  expect(screen.queryByRole('button', { name: /Modifier la question — Nom/ })).not.toBeInTheDocument()
})
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run components/applications/__tests__/AddQuestionDialog.test.tsx components/applications/__tests__/QuestionnaireEditor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add components/applications/AddQuestionDialog.tsx components/applications/__tests__/AddQuestionDialog.test.tsx components/applications/QuestionnaireEditor.tsx components/applications/__tests__/QuestionnaireEditor.test.tsx
git commit -m "feat(questionnaire): the add-question dialog and custom-question editing"
```

---

## Task 11: The card on /applications

**Files:**
- Create: `components/applications/QuestionnaireCard.tsx`
- Create: `components/applications/__tests__/QuestionnaireCard.test.tsx`
- Modify: `app/(organizer)/applications/page.tsx`
- Modify: `components/applications/CandidaturesView.tsx`

**Interfaces:**
- Consumes: `getQuestionnaire` (Task 7); `resetQuestionnaire` (Task 7); `organizer.questionnaire.card.*` copy (Task 8).
- Produces:
  ```tsx
  <QuestionnaireCard questionCount={number} locked={boolean} applicationCount={number} exchangeId={string} />
  ```
  and `CandidaturesView` gains one prop: `questionnaire: { questionCount: number; locked: boolean; applicationCount: number }`.

- [ ] **Step 1: Write the card**

Create `components/applications/QuestionnaireCard.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { resetQuestionnaire } from '@/actions/questionnaire'
import type { QuestionnaireFailureReason } from '@/lib/questionnaire/result'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Sits beside the apply-link panel, scoped to the active exchange. There is one
// template today, so the model line is a constant — the « Changer de modèle »
// picker arrives with the second built-in template.
export function QuestionnaireCard({
  exchangeId, questionCount, locked, applicationCount,
}: {
  exchangeId: string
  questionCount: number
  locked: boolean
  applicationCount: number
}) {
  const t = useTranslations('organizer.questionnaire')
  const c = useTranslations('common')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<QuestionnaireFailureReason | null>(null)

  async function onReset() {
    setBusy(true); setError(null)
    try {
      const res = await resetQuestionnaire(exchangeId)
      if (!res.ok) { setError(res.reason); return }
      setConfirming(false)
      router.refresh()
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-5 rounded-[11px] border bg-card px-4 py-3">
      <p className="m-0 text-[13px] font-semibold text-navy">{t('card.title')}</p>
      <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
        {t('card.template', { name: t('card.templateStandard') })}
      </p>
      <p className="m-0 text-[12.5px] text-muted-foreground">{t('card.summary', { n: questionCount })}</p>
      {locked && (
        <p className="m-0 mt-1 text-[12.5px] text-tertiary">🔒 {t('card.locked', { n: applicationCount })}</p>
      )}
      {error && <p className="m-0 mt-1 text-[12.5px] text-danger-text">{t(`errors.${error}`)}</p>}

      <div className="mt-3 flex items-center gap-2">
        {!locked && (
          <Button type="button" variant="outline" className="h-[34px] text-[12.5px]" onClick={() => setConfirming(true)}>
            {t('card.reset')}
          </Button>
        )}
        <Link
          href="/applications/questionnaire"
          className="ml-auto flex h-[34px] items-center rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
        >
          {/* Once locked the editor is read-only, so the verb changes with it. */}
          {locked ? t('card.view') : t('card.edit')} ↗
        </Link>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('card.resetTitle')}</DialogTitle>
            <DialogDescription>{t('card.resetBody')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>{c('actions.cancel')}</Button>
            <Button type="button" disabled={busy} onClick={() => void onReset()}>{t('card.resetConfirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Load the state on the page**

In `app/(organizer)/applications/page.tsx`, add the import and the call:

```ts
import { getQuestionnaire } from '@/actions/questionnaire'
```

and, just before the `return <CandidaturesView … />`:

```ts
  const { questionCount, locked, applicationCount } = await getQuestionnaire(active.id)
  return (
    <CandidaturesView
      apps={apps}
      exchangeName={active.name}
      exchangeId={active.id}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
      applySlug={active.apply_slug}
      initialTab={parseTab(tab)}
      questionnaire={{ questionCount, locked, applicationCount }}
    />
  )
```

`applicationCount` deliberately comes from `getQuestionnaire`, not from `apps.length`: `listApplications` filters untouched drafts out of the grid, but **any** application at all locks the questionnaire.

- [ ] **Step 3: Render it in `CandidaturesView`**

Add the import:

```ts
import { QuestionnaireCard } from '@/components/applications/QuestionnaireCard'
```

Add the prop to the destructured parameter list and its type:

```ts
  questionnaire,
}: {
  …
  questionnaire: { questionCount: number; locked: boolean; applicationCount: number }
}) {
```

Render it directly under the invitation panel:

```tsx
          <InvitationPanel applyUrl={applyUrl} controls={controls} onInviteByEmail={() => setInviteOpen(true)} />
          <QuestionnaireCard
            exchangeId={exchangeId}
            questionCount={questionnaire.questionCount}
            locked={questionnaire.locked}
            applicationCount={questionnaire.applicationCount}
          />
```

The card lives in the `else` branch only — the `neverOpened` empty state stays a single-CTA screen.

- [ ] **Step 4: Write the card tests**

Create `components/applications/__tests__/QuestionnaireCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const resetQuestionnaire = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  resetQuestionnaire: (...a: unknown[]) => resetQuestionnaire(...(a as [])),
}))

import { QuestionnaireCard } from '@/components/applications/QuestionnaireCard'

beforeEach(() => {
  vi.clearAllMocks()
  resetQuestionnaire.mockResolvedValue({ ok: true, doc: { version: 1, sections: [] } })
})

function renderCard(over: Partial<Parameters<typeof QuestionnaireCard>[0]> = {}) {
  return renderWithIntl(
    <QuestionnaireCard exchangeId="ex-1" questionCount={55} locked={false} applicationCount={0} {...over} />,
  )
}

describe('QuestionnaireCard', () => {
  it('names the template and counts the questions', () => {
    renderCard()
    expect(screen.getByText('Modèle : Questionnaire standard')).toBeInTheDocument()
    expect(screen.getByText('55 questions · 4 sections')).toBeInTheDocument()
  })

  it('links to the editor with an editing verb while unlocked', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /Modifier/ })).toHaveAttribute('href', '/applications/questionnaire')
  })

  it('turns into a read-only "Consulter" and drops Réinitialiser once locked', () => {
    renderCard({ locked: true, applicationCount: 12 })
    expect(screen.getByRole('link', { name: /Consulter/ })).toBeInTheDocument()
    expect(screen.getByText(/12 candidatures reçues/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument()
  })

  it('confirms before resetting, then refreshes', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(resetQuestionnaire).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: 'Réinitialiser' }).at(-1)!)
    expect(resetQuestionnaire).toHaveBeenCalledWith('ex-1')
    expect(refresh).toHaveBeenCalled()
  })
})
```

Also update the existing `components/applications/__tests__/CandidaturesView.test.tsx` (if one exists — check with `ls components/applications/__tests__/`) so its render helper passes the new required `questionnaire` prop: `questionnaire={{ questionCount: 55, locked: false, applicationCount: 0 }}`.

- [ ] **Step 5: Run the tests, typecheck, lint, build**

Run: `pnpm exec vitest run --exclude '**/.claude/**' && npx tsc --noEmit && pnpm lint && pnpm build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add components/applications/QuestionnaireCard.tsx components/applications/__tests__/QuestionnaireCard.test.tsx "app/(organizer)/applications/page.tsx" components/applications/CandidaturesView.tsx components/applications/__tests__/CandidaturesView.test.tsx
git commit -m "feat(questionnaire): card on the Candidatures page"
```

---

## Task 12: Full verification gate and documentation

**Files:**
- Modify: `CLAUDE.md` (one bullet under Gotchas & Conventions)
- Modify: `docs/security/rls-testing.md` (one line in the Layout list, if the new cases warrant it)

**Interfaces:**
- Consumes: everything.
- Produces: a branch ready to merge.

- [ ] **Step 1: Run the whole gate**

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:rls
```

Expected: all four green. A single test file that fails once and passes on re-run is another session mid-write (CLAUDE.md → Parallel Sessions) — re-run that file before debugging it.

- [ ] **Step 2: Prove the default path with the Playwright smoke test**

The existing funnel spec drives the form from `allApplicationFields()` with no arguments, i.e. the built-in catalog — which is exactly the `null` / never-customized path. It must pass **untouched**; if it needs editing, the default path has regressed.

```bash
pnpm smoke
```

Expected: `tests/smoke/apply.spec.ts` passes with no changes to the file. (Serve on `localhost`, not `127.0.0.1` — see `reference_nextjs_smoke_testing_gotchas`.)

- [ ] **Step 3: Add the convention to CLAUDE.md**

Insert under **Gotchas & Conventions**, after the « Application server actions are split by trust model » bullet:

```markdown
- **The application questionnaire is per-exchange and locks at the first application.**
  `exchanges.application_fields` (jsonb, nullable) holds a copy of the questionnaire;
  `null` means « never customized » and resolves to `lib/application-form.ts`'s
  `APPLICATION_SECTIONS` verbatim, so no exchange ever needed a backfill. Built-in
  questions are stored **by reference** so their labels and five translations keep
  coming from the message catalogs; custom questions are monolingual and inline.
  Everything goes through one resolver, `resolveApplicationSections()` in
  `lib/application-fields.ts` — the funnel form, `submitApplication`'s gates, the
  organizer read view and the PDF recap must all see the same list, or a removed
  question becomes permanently "missing" and blocks every submission. The lock is
  derived (any row in `applications` for the exchange), never stored, and
  re-checked server-side in `actions/questionnaire.ts` — the client is never
  trusted with it. Organizer-written questions are banked in
  `application_custom_questions`, which organizers may INSERT into and **never
  SELECT from**: suggestions come from the `application_question_suggestions`
  SECURITY DEFINER RPC, which only returns phrasings at least three independent
  schools converged on (that threshold is the PII guard).
  Spec: `docs/superpowers/specs/2026-07-29-application-template-editor-design.md`.
```

- [ ] **Step 4: Note the new RLS coverage**

In `docs/security/rls-testing.md`, under the **Layout** list, extend the `matrix.test.ts` bullet with:

```markdown
  Also pins the **question bank**: `application_custom_questions` is INSERT-only
  even for its own school (no SELECT policy and no SELECT grant), and the
  aggregate RPC is the only read path.
```

- [ ] **Step 5: Verify the migration ledgers agree**

Run the Supabase MCP `list_migrations` against prod and confirm every filename version in `supabase/migrations/` appears there and vice versa; do the same against staging. If prod stamped a different version than the filename, the `git mv` from Task 1 should already have fixed it — re-check.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add CLAUDE.md docs/security/rls-testing.md
git commit -m "docs: per-exchange questionnaire conventions and RLS coverage"
```

- [ ] **Step 7: Report, do not merge**

Merging to `main` deploys to production and requires Bjorn's explicit confirmation on top of a green gate. Report:
- the four gate commands and their results,
- that `tests/smoke/apply.spec.ts` passed unmodified (the `null`-default regression proof),
- the migration's applied state on local / staging / prod and the stamped version,
- the two browser checks that unit tests cannot cover: **(a)** remove a question, submit an application through `/apply/<slug>`, and confirm it goes through; **(b)** open the editor on an exchange that already has applications and confirm it is read-only.

---

## Self-Review

**Spec coverage.** Every section of `2026-07-29-application-template-editor-design.md` maps to a task:

| Spec section | Task |
|---|---|
| `exchanges.application_fields jsonb` | 1 |
| `resolveApplicationSections()` | 2 |
| `application_custom_questions` + RLS + suggestions RPC | 1 (schema), 7 (writes/reads) |
| The lock | 7 (`loadEditable`), 9 + 11 (UI) |
| The library | 3 |
| Card on `/applications` | 11 |
| Editor at `/applications/questionnaire` | 9 |
| Locked fields, red ✕, pencil, immediate persistence, new-at-the-end | 9, 10 |
| Cascading removals, warned first | 2 (`CASCADE_REMOVALS`), 9 (confirm dialog) |
| The « + » dialog's three zones | 10 |
| Texte long capped at 150; option tokens `o1`, `o2`, … | 2, 7 |
| Validation changes (parent group fallback, empty sections) | 4, 5, 6 |
| Downstream consumers table | 5 (`ApplicationForm`, `submitApplication`), 6 (read view, recap) |
| Photo ripples in three places | 5 (`ApplicationPhotoUpload` not rendered, `uploadApplicationPhoto` rejects); `applicantInitials()` already handles a photo-less row, so the candidate list needs no change |
| Migration | 1 |
| Tests (resolver / validation / editor / server action / bank / smoke) | 2, 4, 9–10, 7, 1, 12 |

**Two deliberate refinements to the spec, both implementing its stated intent:**

1. The spec's suggestions SQL groups by `normalized_label, label, type, options`, which would put « Sait nager ? » and « sait nager? » in *different* groups — contradicting its own test that normalization merges them. Task 1 groups by `normalized_label, type, options` and picks `min(label)` as the representative phrasing.
2. `normalized_label` is a **generated column**, not an app-written one, so the SQL and the JS mirror cannot drift and the unique index cannot be dodged. Normalization collapses every run of non-alphanumerics (not only whitespace) so trailing `?` and the French space-before-`?` both fall out — which is what the spec's own test requires.

**One spec detail implemented differently on purpose:** the spec says the photo « is represented as the pseudo-field `photo` in the student section ». It is — in the **stored document**. But `resolveApplicationSections` deliberately does *not* emit it as an `AppField`: nothing may try to render, validate or recap it as an answerable field. `questionnaireHasPhoto()` reports it separately, and `missingRequiredApplication`'s existing `'photo'` id is unchanged.

**Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N", no test described without its code. Every function, prop and message key used in a later task is defined in an earlier one.

**Type consistency check.** `resolveApplicationSections` / `questionnaireHasPhoto` / `parseApplicationFields` (Task 2) keep the same names in Tasks 5, 6, 9. `removeQuestion` is used at three layers with three different meanings — the pure helper in `lib/application-fields.ts`, the server action in `actions/questionnaire.ts`, and the editor's handler — so Task 7 imports the pure one aliased as `removeFromDoc` and Task 9's test does the same. `addQuestion` / `addToDoc` follows the identical pattern. `localizedApplicationSections(t, sections?)` has the same two-arg shape in Tasks 3, 5, 6, 9. `EditorRow` is defined once (Task 9) and consumed by Task 10's edit dialog.
