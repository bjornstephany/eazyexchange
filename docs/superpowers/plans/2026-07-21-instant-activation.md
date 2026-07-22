# Instant Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect a template's deadline (and anything else its activation gate demands) at the moment it is added, so adding a form or document publishes it immediately and the « Activer » button disappears.

**Architecture:** The activation gate moves out of the `activateTemplate` server action into a plain module (`lib/forms/activate.ts`) that the three add paths — `addStandardTemplate`, `createDraftTemplate`, `addField` — call in-request. The add UI is widened to collect every input that gate demands: a required deadline everywhere, the fillable forms' missing `exchange_program_details` fields in an inline row expansion, and the conditional-document student picker. The AST's national CERFA PDF ships in the repo and is uploaded into the school's own storage path on add. Onboarding step 2 becomes structured so the first exchange starts with program details filled and two generated Info cards. The only surviving `draft` is a custom online form between creation and its first saved question.

**Tech Stack:** Next.js 15 App Router (Server Actions), Supabase (PostgreSQL + RLS + Storage), TypeScript, Tailwind, next-intl (5 locales), Vitest + Testing Library, pnpm.

## Global Constraints

- Package manager is **pnpm**, never npm.
- Expected outcomes (validation failures, business rejections) are **structured return values**, never thrown — production redacts thrown Server Action messages. Only genuinely unexpected failures throw. Existing error strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing for tests.
- Auth preambles use `requireUser()` / `requireOrganizer()` from `lib/auth/require.ts`; never hand-roll them.
- Every exchange-scoped mutation calls `assertExchangeWritable(supabase, exchangeId)` (throws `'Programme archivé — lecture seule.'`).
- Never log student/parent PII.
- `lib/supabase/admin` is off-limits for this feature — all writes go through the RLS (cookie) client.
- Message catalogs: **all five locales** (`messages/{en,fr,es,it,de}.json`) must stay key-identical — `messages/__tests__/parity.test.ts` enforces it. Adding a key means adding it five times; removing one means removing it five times.
- French copy: preserve typographic apostrophes (`’`, U+2019) exactly as written in this plan. Never substitute `'`.
- Migrations: write the file under `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`, apply to **staging first**, then to prod via Supabase MCP `apply_migration`, then reconcile the filename against `list_migrations`. Never `supabase db push` against prod.
- Verification gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, plus `pnpm test:rls` for the migration task.
- Prototype-key hazard: any lookup of a user-supplied string in a plain object (`FILLABLE_DEFINITIONS[key]`, `BUNDLED_PDFS[key]`) must be guarded with `Object.hasOwn(...)` first.

## File Structure

**Created**
- `lib/forms/activate.ts` — the activation gate + publish, callable from any server module. Owns nothing else.
- `lib/forms/__tests__/activate.test.ts` — gate tests (moved out of the action tests).
- `lib/forms/add-requirements.ts` — pure mapping from a standard-library key + the current details row to the detail fields the add prompt must show, plus the patch/merge shapes.
- `lib/forms/__tests__/add-requirements.test.ts`
- `lib/forms/assets.ts` — bundled-PDF registry + reader.
- `lib/forms/assets/ast-cerfa-15646.pdf` — the national CERFA 15646 (moved from `docs/exampleSchoolFiles/AST.pdf`).
- `components/forms/ProgramDetailFields.tsx` — the shared detail-input block used by the library drawer's inline expansion.
- `components/forms/__tests__/ProgramDetailFields.test.tsx`
- `supabase/migrations/20260721000001_activate_ready_drafts.sql`

**Modified**
- `lib/forms/fillable/types.ts` — add `DETAIL_ORDER`.
- `lib/forms/fillable/render.ts` — split `missingDetailKeys` out of `missingDetailLabels`.
- `lib/forms/standard-library.ts` — corrected policy comment; `insertStandardTemplate` uploads the bundled PDF and accepts a deadline.
- `actions/forms.ts` — `activateTemplate` removed from the exported surface; `addStandardTemplate` / `createDraftTemplate` / `addField` activate in-request; `getTemplatesPage` returns `programDetails`.
- `lib/forms/rollup.ts` — `activationHints` deleted.
- `lib/forms/template-result.ts` — unused `MSG_*` removed.
- `components/forms/LibraryDrawer.tsx` — inline row expansion, required deadline, conditional picker, online→editor.
- `components/forms/FichiersView.tsx` — passes program details down, routes online drafts to the editor.
- `components/forms/FormDrawer.tsx`, `components/documents/DocDrawer.tsx` — Activer button + hint block removed.
- `app/(organizer)/forms/page.tsx` — passes `programDetails`.
- `app/onboarding/OnboardingForm.tsx`, `app/onboarding/page.tsx`, `lib/onboarding/first-exchange.ts`, `actions/onboarding.ts` — structured step 2.
- `next.config.mjs` — trace the bundled PDF into the serverless output.
- `messages/{en,fr,es,it,de}.json`

---

### Task 1: Missing-detail computation (pure helpers)

**Files:**
- Modify: `lib/forms/fillable/types.ts`
- Modify: `lib/forms/fillable/render.ts:68-83`
- Create: `lib/forms/add-requirements.ts`
- Test: `lib/forms/__tests__/add-requirements.test.ts`

**Interfaces:**
- Consumes: `FILLABLE_DEFINITIONS` (`lib/forms/fillable/index.ts`), `VARIABLE_REQUIREMENTS` / `DETAIL_LABELS` / `ProgramDetailsValues` (`lib/forms/fillable/types.ts`).
- Produces:
  - `DETAIL_ORDER: DetailKey[]` (from `lib/forms/fillable/types.ts`)
  - `missingDetailKeys(def: FillableDefinition, details: ProgramDetailsValues | null): DetailKey[]` (from `lib/forms/fillable/render.ts`)
  - `type DetailKey = keyof ProgramDetailsValues`
  - `type ProgramDetailPatch = Partial<Record<'destination'|'travel_start'|'travel_end'|'association_name'|'sending_school_name'|'receiving_school_name'|'proviseur_name'|'sending_city', string> & Record<'chaperones'|'absence_dates', string[]>>`
  - `missingProgramFields(standardKey: string | null, details: ProgramDetailsValues | null): DetailKey[]`
  - `mergeProgramDetails(existing: ProgramDetailsValues | null, patch: ProgramDetailPatch): ProgramDetailsValues`
  - `EMPTY_DETAILS: ProgramDetailsValues`

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/add-requirements.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  missingProgramFields, mergeProgramDetails, EMPTY_DETAILS,
} from '@/lib/forms/add-requirements'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

const full: ProgramDetailsValues = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'],
  association_name: 'AGESSIA',
  sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School',
  proviseur_name: 'Mme Sharon MIRON HUGHES',
  sending_city: 'Luynes',
  absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('missingProgramFields', () => {
  it('returns nothing for a non-fillable entry', () => {
    expect(missingProgramFields('passeport', null)).toEqual([])
    expect(missingProgramFields('ast', null)).toEqual([])
    expect(missingProgramFields(null, null)).toEqual([])
  })

  it('returns nothing for an unknown or prototype key', () => {
    expect(missingProgramFields('nope', null)).toEqual([])
    expect(missingProgramFields('constructor', null)).toEqual([])
    expect(missingProgramFields('__proto__', null)).toEqual([])
  })

  it.each([
    ['decharge', ['destination', 'travel_start', 'travel_end', 'chaperones', 'association_name', 'receiving_school_name']],
    ['medical', ['travel_start', 'travel_end', 'chaperones']],
    ['absence', ['destination', 'travel_start', 'travel_end', 'sending_school_name', 'receiving_school_name', 'proviseur_name', 'sending_city', 'absence_dates']],
    ['famille', ['association_name', 'sending_school_name']],
  ])('empty details → %s asks for its full set', (key, expected) => {
    expect(missingProgramFields(key, null)).toEqual(expected)
  })

  it.each(['decharge', 'medical', 'absence', 'famille'])(
    'complete details → %s asks for nothing', (key) => {
      expect(missingProgramFields(key, full)).toEqual([])
    })

  it('partial details → only the blanks, in canonical order', () => {
    const partial = { ...full, destination: '   ', chaperones: [], travel_end: null }
    expect(missingProgramFields('decharge', partial)).toEqual([
      'destination', 'travel_end', 'chaperones',
    ])
  })

  it('a whitespace-only list entry counts as missing', () => {
    expect(missingProgramFields('absence', { ...full, absence_dates: ['  '] }))
      .toEqual(['absence_dates'])
  })
})

describe('mergeProgramDetails', () => {
  it('fills a null existing row from the patch', () => {
    const out = mergeProgramDetails(null, { destination: 'Berlin', chaperones: ['A'] })
    expect(out).toEqual({ ...EMPTY_DETAILS, destination: 'Berlin', chaperones: ['A'] })
  })

  it('keeps existing values the patch does not mention', () => {
    const out = mergeProgramDetails(full, { proviseur_name: 'M. Y' })
    expect(out.destination).toBe('le Minnesota, USA')
    expect(out.proviseur_name).toBe('M. Y')
  })

  it('ignores blank patch values rather than wiping existing data', () => {
    const out = mergeProgramDetails(full, { destination: '   ', chaperones: [] })
    expect(out.destination).toBe('le Minnesota, USA')
    expect(out.chaperones).toEqual(['Polly STEPHANY'])
  })

  it('trims text and drops blank list entries', () => {
    const out = mergeProgramDetails(null, {
      destination: '  Berlin  ', absence_dates: [' le 3 mai ', '', '  '],
    })
    expect(out.destination).toBe('Berlin')
    expect(out.absence_dates).toEqual(['le 3 mai'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/add-requirements.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/forms/add-requirements"`.

- [ ] **Step 3: Add `DETAIL_ORDER` to `lib/forms/fillable/types.ts`**

Append immediately after the `DETAIL_LABELS` block (currently ends at line 83):

```ts
// Canonical display order for detail columns — drives the add-time prompt and
// every missing-detail message, so the organizer always sees the same sequence.
export const DETAIL_ORDER: (keyof ProgramDetailsValues)[] = [
  'destination', 'travel_start', 'travel_end', 'chaperones',
  'association_name', 'sending_school_name', 'receiving_school_name',
  'proviseur_name', 'sending_city', 'absence_dates',
]
```

- [ ] **Step 4: Split `missingDetailKeys` out of `missingDetailLabels`**

In `lib/forms/fillable/render.ts`, extend the existing import on line 6 and replace the whole `missingDetailLabels` function (lines 68-83):

```ts
import { VARIABLE_REQUIREMENTS, DETAIL_LABELS, DETAIL_ORDER } from './types'
```

```ts
// Which detail columns a definition still needs, in DETAIL_ORDER sequence.
export function missingDetailKeys(
  def: FillableDefinition,
  details: ProgramDetailsValues | null,
): (keyof ProgramDetailsValues)[] {
  const missing = new Set<keyof ProgramDetailsValues>()
  for (const v of def.variables) {
    for (const col of VARIABLE_REQUIREMENTS[v]) {
      const val = details?.[col]
      const empty = Array.isArray(val)
        ? val.map(x => x.trim()).filter(Boolean).length === 0
        : !(val ?? '').trim()
      if (empty) missing.add(col)
    }
  }
  return DETAIL_ORDER.filter(k => missing.has(k))
}

export function missingDetailLabels(
  def: FillableDefinition,
  details: ProgramDetailsValues | null,
): string[] {
  return missingDetailKeys(def, details).map(c => DETAIL_LABELS[c])
}
```

- [ ] **Step 5: Create `lib/forms/add-requirements.ts`**

```ts
// What a standard-library entry still needs before it can be activated, and
// how add-time answers fold back into the exchange's program-details row.
// Pure — no React, no Supabase (mirrors lib/forms/rollup.ts).
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { missingDetailKeys } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

export type DetailKey = keyof ProgramDetailsValues

// What the add prompt sends back. Text columns arrive as strings, the two
// list columns as string arrays. Absent keys mean « not asked ».
export type ProgramDetailPatch = Partial<{
  destination: string
  travel_start: string
  travel_end: string
  chaperones: string[]
  association_name: string
  sending_school_name: string
  receiving_school_name: string
  proviseur_name: string
  sending_city: string
  absence_dates: string[]
}>

export const EMPTY_DETAILS: ProgramDetailsValues = {
  destination: null, travel_start: null, travel_end: null, chaperones: [],
  association_name: null, sending_school_name: null, receiving_school_name: null,
  proviseur_name: null, sending_city: null, absence_dates: [],
}

const LIST_KEYS = ['chaperones', 'absence_dates'] as const
export const LIST_DETAIL_KEYS: readonly DetailKey[] = LIST_KEYS
export const DATE_DETAIL_KEYS: readonly DetailKey[] = ['travel_start', 'travel_end']

// Only fillable entries carry program-detail requirements; everything else
// needs nothing beyond its deadline. Object.hasOwn keeps a crafted key
// ('constructor', '__proto__') from resolving to a prototype member.
export function missingProgramFields(
  standardKey: string | null,
  details: ProgramDetailsValues | null,
): DetailKey[] {
  if (!standardKey || !Object.hasOwn(FILLABLE_DEFINITIONS, standardKey)) return []
  return missingDetailKeys(FILLABLE_DEFINITIONS[standardKey], details)
}

// Patch wins only where it carries a real value — a blank answer never wipes
// data the organizer already saved in Réglages → Programme.
export function mergeProgramDetails(
  existing: ProgramDetailsValues | null,
  patch: ProgramDetailPatch,
): ProgramDetailsValues {
  const base: ProgramDetailsValues = { ...EMPTY_DETAILS, ...(existing ?? {}) }
  for (const key of LIST_KEYS) {
    const next = (patch[key] ?? []).map(x => x.trim()).filter(Boolean)
    if (next.length > 0) base[key] = next
  }
  for (const key of ['destination', 'travel_start', 'travel_end', 'association_name',
    'sending_school_name', 'receiving_school_name', 'proviseur_name', 'sending_city'] as const) {
    const next = (patch[key] ?? '').trim()
    if (next) base[key] = next
  }
  return base
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run lib/forms/__tests__/add-requirements.test.ts lib/forms/fillable/__tests__/render.test.ts`
Expected: PASS — both files green (the render tests' expected label order already matches `DETAIL_ORDER`).

- [ ] **Step 7: Commit**

```bash
git add lib/forms/add-requirements.ts lib/forms/__tests__/add-requirements.test.ts lib/forms/fillable/types.ts lib/forms/fillable/render.ts
git commit -m "feat(forms): pure helper for a standard entry's missing program details"
```

---

### Task 2: Extract the activation gate into `lib/forms/activate.ts`

Pure refactor — the gate logic is unchanged, it just moves somewhere the add paths can call it and tests can reach it directly. `activateTemplate` stops being a server action.

**Files:**
- Create: `lib/forms/activate.ts`
- Create: `lib/forms/__tests__/activate.test.ts`
- Modify: `actions/forms.ts:260-315` (delete `activateTemplate`), `actions/forms.ts:11-15` (imports)
- Modify: `actions/__tests__/forms-phase3.test.ts` (delete the `activateTemplate` describe)
- Delete: `actions/__tests__/forms-activate-fillable.test.ts` (its cases move into `lib/forms/__tests__/activate.test.ts`)

**Interfaces:**
- Consumes: `TemplateActionResult`, `MSG_DEADLINE_REQUIRED`, `MSG_PDF_REQUIRED`, `MSG_QUESTIONS_REQUIRED` (`lib/forms/template-result.ts`); `FILLABLE_DEFINITIONS`; `missingDetailLabels`.
- Produces:
  - `type ActivatableTemplate = { id, exchange_id, school_id, kind, status, audience, deadline, standard_key, template_file_path, form_fields?: { id: string }[] | null }`
  - `activateTemplateRecord(supabase: SupabaseClient, tmpl: ActivatableTemplate, studentIds?: string[]): Promise<TemplateActionResult>`

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/activate.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { activateTemplateRecord, type ActivatableTemplate } from '@/lib/forms/activate'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'

const fullDetails = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

let state: {
  details: typeof fullDetails | null
  enrolled: string[]
  schoolStudents: string[]
}
const updated: Record<string, unknown>[] = []
const assignmentsInserted: unknown[] = []

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'exchange_program_details') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.details }) }) }) }
      }
      if (table === 'exchange_enrollments') {
        return { select: () => ({ eq: async () => ({ data: state.enrolled.map(user_id => ({ user_id })) }) }) }
      }
      if (table === 'users') {
        return { select: () => ({ in: (_c: string, ids: string[]) => ({ eq: () => ({ eq: async () => ({
          data: ids.filter(i => state.schoolStudents.includes(i)).map(id => ({ id })),
        }) }) }) }) }
      }
      if (table === 'form_templates') {
        return { update: (patch: Record<string, unknown>) => ({ eq: async () => { updated.push(patch); return { error: null } } }) }
      }
      if (table === 'assignments') {
        return { insert: async (rows: unknown) => { assignmentsInserted.push(rows); return { error: null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  } as never
}

const base: ActivatableTemplate = {
  id: 't-1', exchange_id: 'ex-1', school_id: 'sch-1', kind: 'doc', status: 'draft',
  audience: 'all', deadline: '2026-10-01', standard_key: null,
  template_file_path: null, form_fields: [],
}

beforeEach(() => {
  state = { details: fullDetails, enrolled: ['stu-1'], schoolStudents: ['stu-1'] }
  updated.length = 0
  assignmentsInserted.length = 0
})

describe('activateTemplateRecord', () => {
  it('is a no-op for an already active template', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, status: 'active' }))
      .resolves.toEqual({ ok: true })
    expect(updated).toHaveLength(0)
  })

  it('requires a deadline', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, deadline: null }))
      .resolves.toEqual({ ok: false, message: MSG_DEADLINE_REQUIRED })
  })

  it('requires a PDF for kind=pdf', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'pdf' }))
      .resolves.toEqual({ ok: false, message: MSG_PDF_REQUIRED })
  })

  it('requires at least one question for kind=online', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'online' }))
      .resolves.toEqual({ ok: false, message: MSG_QUESTIONS_REQUIRED })
  })

  it('activates an « all » doc without inserting assignments (the trigger does it)', async () => {
    await expect(activateTemplateRecord(fakeClient(), base)).resolves.toEqual({ ok: true })
    expect(updated).toEqual([{ status: 'active' }])
    expect(assignmentsInserted).toHaveLength(0)
  })

  it('requires a student selection for a conditional doc', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, audience: 'conditional' }))
      .resolves.toEqual({ ok: false, message: 'Choisissez au moins un élève concerné.' })
  })

  it('activates a conditional doc and inserts assignments for the chosen students', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, audience: 'conditional' }, ['stu-1']))
      .resolves.toEqual({ ok: true })
    expect(assignmentsInserted).toEqual([[{ template_id: 't-1', student_id: 'stu-1' }]])
  })

  it('rejects a student who is not enrolled in the exchange', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, audience: 'conditional' }, ['stu-1', 'ghost']))
      .resolves.toEqual({ ok: false, message: 'Sélection invalide : élève non inscrit à cet échange.' })
  })

  it('activates a fillable when program details are complete', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'fillable', standard_key: 'decharge' }))
      .resolves.toEqual({ ok: true })
    expect(updated).toEqual([{ status: 'active' }])
  })

  it('blocks a fillable listing the missing details', async () => {
    state.details = { ...fullDetails, destination: null, chaperones: [] }
    const r = await activateTemplateRecord(fakeClient(), { ...base, kind: 'fillable', standard_key: 'decharge' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('Destination')
      expect(r.message).toContain('Accompagnateurs')
    }
    expect(updated).toHaveLength(0)
  })

  it('blocks a fillable with an unknown standard_key', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'fillable', standard_key: 'constructor' }))
      .resolves.toEqual({ ok: false, message: 'Modèle à signer inconnu.' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/activate.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/forms/activate"`.

- [ ] **Step 3: Create `lib/forms/activate.ts`**

```ts
// The activation gate and the publish itself, lifted verbatim out of the old
// `activateTemplate` server action. It lives outside a 'use server' module so
// the add paths (addStandardTemplate / createDraftTemplate / addField) can
// call it in-request and so it stays directly unit-testable. Callers own the
// auth preamble, assertExchangeWritable and revalidatePath.
//
// The gate is deliberately kept intact even though the add UI now collects
// every input it demands: a bug in that UI must degrade to a template that
// stays `draft`, never to a half-configured template published to families.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TemplateActionResult } from '@/lib/forms/template-result'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { missingDetailLabels } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
import type { TemplateKind } from '@/lib/forms/rollup'

// Structurally satisfied by what actions/forms.ts's getOwnedTemplate selects.
export type ActivatableTemplate = {
  id: string
  exchange_id: string
  school_id: string
  kind: TemplateKind
  status: 'draft' | 'active'
  audience: 'all' | 'conditional'
  deadline: string | null
  standard_key: string | null
  template_file_path: string | null
  form_fields?: { id: string }[] | null
}

export async function activateTemplateRecord(
  supabase: SupabaseClient,
  tmpl: ActivatableTemplate,
  studentIds?: string[],
): Promise<TemplateActionResult> {
  if (tmpl.status === 'active') return { ok: true }

  if (!tmpl.deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }
  if (tmpl.kind === 'pdf' && !tmpl.template_file_path) return { ok: false, message: MSG_PDF_REQUIRED }
  if (tmpl.kind === 'online' && (tmpl.form_fields ?? []).length === 0) return { ok: false, message: MSG_QUESTIONS_REQUIRED }

  if (tmpl.kind === 'fillable') {
    const def = tmpl.standard_key && Object.hasOwn(FILLABLE_DEFINITIONS, tmpl.standard_key)
      ? FILLABLE_DEFINITIONS[tmpl.standard_key]
      : undefined
    if (!def) return { ok: false, message: 'Modèle à signer inconnu.' }
    const { data: details } = await supabase
      .from('exchange_program_details').select('*')
      .eq('exchange_id', tmpl.exchange_id).maybeSingle<ProgramDetailsValues>()
    const missing = missingDetailLabels(def, details ?? null)
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Complétez d’abord les détails du programme (Réglages → Programme) : ${missing.join(', ')}.`,
      }
    }
  }

  let chosen: string[] = []
  if (tmpl.audience === 'conditional') {
    if (!studentIds || studentIds.length === 0) return { ok: false, message: 'Choisissez au moins un élève concerné.' }
    // Only enrolled students of our school may be targeted.
    const { data: enrollments } = await supabase
      .from('exchange_enrollments').select('user_id').eq('exchange_id', tmpl.exchange_id)
    const enrolledIds = new Set((enrollments ?? []).map((e) => e.user_id))
    const { data: validUsers } = await supabase
      .from('users').select('id')
      .in('id', studentIds).eq('school_id', tmpl.school_id).eq('role', 'student')
    const validIds = new Set((validUsers ?? []).map((u) => u.id))
    chosen = studentIds.filter(sid => enrolledIds.has(sid) && validIds.has(sid))
    if (chosen.length !== studentIds.length) return { ok: false, message: 'Sélection invalide : élève non inscrit à cet échange.' }
  }

  const { error } = await supabase.from('form_templates').update({ status: 'active' }).eq('id', tmpl.id)
  if (error) throw error

  if (tmpl.audience === 'conditional' && chosen.length > 0) {
    const { error: insertError } = await supabase
      .from('assignments')
      .insert(chosen.map(sid => ({ template_id: tmpl.id, student_id: sid })))
    if (insertError) throw insertError
  }

  return { ok: true }
}
```

- [ ] **Step 4: Delete `activateTemplate` from `actions/forms.ts`**

Delete lines 260-315 entirely (the whole `export async function activateTemplate` block). Then fix the imports at the top of the file — replace lines 11-15:

```ts
import type { TemplateActionResult, CreateTemplateResult } from '@/lib/forms/template-result'
import { STANDARD_TEMPLATES, insertStandardTemplate } from '@/lib/forms/standard-library'
import { activateTemplateRecord } from '@/lib/forms/activate'
```

(`MSG_*`, `FILLABLE_DEFINITIONS`, `missingDetailLabels` and `ProgramDetailsValues` are no longer referenced from this file — remove those four import lines. `TemplateActionResult` is still used by `updateTemplateMeta` / `replaceTemplateFile`.)

- [ ] **Step 5: Remove the moved tests**

In `actions/__tests__/forms-phase3.test.ts`: delete the whole `describe('activateTemplate', …)` block (starting at line 86) and drop `activateTemplate` from the import on line 70. Keep `MSG_DEADLINE_REQUIRED` imported — Task 5 adds a `createDraftTemplate` case that uses it. Remove `MSG_PDF_REQUIRED` / `MSG_QUESTIONS_REQUIRED` from the imports if nothing else in the file references them (`pnpm lint` will flag them if left unused).

```bash
rm actions/__tests__/forms-activate-fillable.test.ts
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run lib/forms actions/__tests__/forms-phase3.test.ts && npx tsc --noEmit`
Expected: PASS, and `tsc` clean apart from errors in `FormDrawer.tsx` / `DocDrawer.tsx` / `FichiersView.test.tsx`, which still import `activateTemplate` — those are removed in Task 8. **Do not fix them here**; note them and move on.

- [ ] **Step 7: Commit**

```bash
git add lib/forms/activate.ts lib/forms/__tests__/activate.test.ts actions/forms.ts actions/__tests__/forms-phase3.test.ts actions/__tests__/forms-activate-fillable.test.ts
git commit -m "refactor(forms): move the activation gate out of the server action"
```

---

### Task 3: Bundle the AST's national CERFA PDF

**Files:**
- Create: `lib/forms/assets/ast-cerfa-15646.pdf` (git mv from `docs/exampleSchoolFiles/AST.pdf`)
- Create: `lib/forms/assets.ts`
- Create: `lib/forms/__tests__/assets.test.ts`
- Modify: `next.config.mjs`

**Interfaces:**
- Produces:
  - `BUNDLED_PDF_PATHS: Record<string, string>` — standard_key → repo-relative path
  - `readBundledPdf(standardKey: string): Promise<Buffer | null>`

- [ ] **Step 1: Move the file**

```bash
mkdir -p lib/forms/assets
git mv docs/exampleSchoolFiles/AST.pdf lib/forms/assets/ast-cerfa-15646.pdf
```

- [ ] **Step 2: Write the failing test**

Create `lib/forms/__tests__/assets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readBundledPdf, BUNDLED_PDF_PATHS } from '@/lib/forms/assets'

describe('readBundledPdf', () => {
  it('returns null for a key with no bundled file', async () => {
    expect(await readBundledPdf('passeport')).toBeNull()
    expect(await readBundledPdf('decharge')).toBeNull()
  })

  it('returns null for a prototype key rather than resolving a member', async () => {
    expect(await readBundledPdf('constructor')).toBeNull()
    expect(await readBundledPdf('__proto__')).toBeNull()
  })

  it('reads the AST CERFA as a real PDF', async () => {
    const buf = await readBundledPdf('ast')
    expect(buf).not.toBeNull()
    expect(buf!.byteLength).toBeGreaterThan(1000)
    expect(buf!.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('registers exactly the one national form', () => {
    expect(Object.keys(BUNDLED_PDF_PATHS)).toEqual(['ast'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/assets.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/forms/assets"`.

- [ ] **Step 4: Create `lib/forms/assets.ts`**

```ts
// PDFs that ship with the app because they are national forms, identical for
// every school. Read server-side with fs (deliberately NOT public/, which
// would expose them as static routes for no reason) and uploaded into the
// school's own form-templates path on add, so there is one storage read path
// and one RLS story for every template PDF.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// standard_key → repo-relative path.
export const BUNDLED_PDF_PATHS: Record<string, string> = {
  ast: 'lib/forms/assets/ast-cerfa-15646.pdf',
}

export async function readBundledPdf(standardKey: string): Promise<Buffer | null> {
  if (!Object.hasOwn(BUNDLED_PDF_PATHS, standardKey)) return null
  return readFile(path.join(process.cwd(), BUNDLED_PDF_PATHS[standardKey]))
}
```

- [ ] **Step 5: Trace the asset into the serverless bundle**

The file is read by path at runtime, so Next's tracer cannot see it. In `next.config.mjs`, add `outputFileTracingIncludes` to `nextConfig`:

```js
const nextConfig = {
  // The AST CERFA is read with fs at add time (lib/forms/assets.ts); nothing
  // imports it, so the build tracer needs to be told to ship it.
  outputFileTracingIncludes: {
    '/**': ['./lib/forms/assets/**'],
  },
  experimental: {
    // Client router cache: dynamic pages stay reusable for 3 min after a
    // visit; the rail's prefetch={true} entries get the 5-min static window.
    // Own mutations stay fresh via revalidatePath in server actions.
    staleTimes: { dynamic: 180 },
  },
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/assets.test.ts && pnpm build`
Expected: tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/forms/assets.ts lib/forms/assets/ast-cerfa-15646.pdf lib/forms/__tests__/assets.test.ts next.config.mjs docs/exampleSchoolFiles
git commit -m "feat(forms): ship the AST CERFA 15646 as a bundled template PDF"
```

---

### Task 4: `addStandardTemplate` takes a deadline + detail patch and activates

**Files:**
- Modify: `lib/forms/standard-library.ts:1-5` (comment), `:76-121` (`insertStandardTemplate`)
- Modify: `actions/forms.ts:186-203` (`addStandardTemplate`)
- Test: `actions/__tests__/add-standard-template.test.ts`

**Interfaces:**
- Consumes: `readBundledPdf` (Task 3), `activateTemplateRecord` (Task 2), `missingProgramFields` / `mergeProgramDetails` / `ProgramDetailPatch` (Task 1).
- Produces:
  - `insertStandardTemplate(supabase, std, opts: { exchangeId; schoolId; userId; deadline: string }): Promise<{ id: string } | { duplicate: true }>` — now stores the deadline and uploads a bundled PDF when the entry has one.
  - `addStandardTemplate(exchangeId: string, standardKey: string, input: { deadline: string; details?: ProgramDetailPatch }): Promise<CreateTemplateResult>`

- [ ] **Step 1: Write the failing test**

Replace `actions/__tests__/add-standard-template.test.ts` wholesale:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  role: 'organizer' | 'student'
  archived: boolean
  dupInsert: boolean
  details: Record<string, unknown> | null
}
let inserted: { templates: any[]; slots: any[]; fields: any[] }
let updates: Record<string, unknown>[]
let upserted: Record<string, unknown>[]
let uploads: { path: string; bytes: number }[]

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    storage: {
      from: () => ({
        upload: async (path: string, body: Blob) => {
          uploads.push({ path, bytes: body.size })
          return { error: null }
        },
      }),
    },
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({
            single: async () => ({ data: { school_id: 's1', role: scenario.role }, error: null }),
            // activateTemplateRecord's conditional branch (unused here)
            in: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }),
          }) }),
        }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { archived_at: scenario.archived ? '2026-01-01T00:00:00Z' : null },
        }) }) }) }
      }
      if (table === 'exchange_program_details') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: scenario.details }) }) }),
          upsert: async (row: Record<string, unknown>) => { upserted.push(row); return { error: null } },
        }
      }
      if (table === 'form_templates') {
        return {
          insert: (row: any) => ({ select: () => ({ single: async () => {
            if (scenario.dupInsert) return { data: null, error: { code: '23505', message: 'duplicate' } }
            inserted.templates.push(row)
            return { data: { id: 'tpl-new' }, error: null }
          } }) }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); return { error: null } } }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: {
              id: 'tpl-new', exchange_id: 'ex1', school_id: 's1',
              name: 'X', kind: inserted.templates[0]?.kind ?? 'doc', status: 'draft',
              audience: 'all', deadline: inserted.templates[0]?.deadline ?? null,
              standard_key: inserted.templates[0]?.standard_key ?? null,
              template_file_path: updates.find(u => 'template_file_path' in u)?.template_file_path ?? null,
              form_fields: [],
            },
          }) }) }),
        }
      }
      if (table === 'document_slots') {
        return { insert: async (rows: any) => { inserted.slots.push(...[].concat(rows)); return { error: null } } }
      }
      if (table === 'form_fields') {
        return { insert: async (rows: any) => { inserted.fields.push(...[].concat(rows)); return { error: null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { addStandardTemplate } from '../forms'

const fullDetails = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

beforeEach(() => {
  scenario = { role: 'organizer', archived: false, dupInsert: false, details: fullDetails }
  inserted = { templates: [], slots: [], fields: [] }
  updates = []
  upserted = []
  uploads = []
  revalidatePath.mockClear()
})

const DL = { deadline: '2026-09-30' }

describe('addStandardTemplate', () => {
  it('rejects a student caller', async () => {
    scenario.role = 'student'
    await expect(addStandardTemplate('ex1', 'medical', DL)).rejects.toThrow('Unauthorized')
  })

  it('rejects an archived exchange', async () => {
    scenario.archived = true
    await expect(addStandardTemplate('ex1', 'medical', DL)).rejects.toThrow('Programme archivé — lecture seule.')
  })

  it('returns a structured error for an unknown key (never throws)', async () => {
    const res = await addStandardTemplate('ex1', 'nope', DL)
    expect(res).toEqual({ ok: false, message: 'Modèle standard inconnu.' })
    expect(inserted.templates).toHaveLength(0)
  })

  it('refuses a missing deadline as a structured outcome', async () => {
    const res = await addStandardTemplate('ex1', 'medical', { deadline: '  ' })
    expect(res).toEqual({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    expect(inserted.templates).toHaveLength(0)
  })

  it('returns a friendly duplicate message on the unique-index violation', async () => {
    scenario.dupInsert = true
    const res = await addStandardTemplate('ex1', 'medical', DL)
    expect(res).toEqual({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('adds a doc entry ACTIVE with its deadline in one call', async () => {
    const res = await addStandardTemplate('ex1', 'passeport', DL)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(inserted.templates[0]).toMatchObject({
      exchange_id: 'ex1', school_id: 's1', standard_key: 'passeport',
      kind: 'doc', status: 'draft', deadline: '2026-09-30', created_by: 'u1',
    })
    expect(updates).toContainEqual({ status: 'active' })
    expect(inserted.slots).toHaveLength(1)
    expect(revalidatePath).toHaveBeenCalledWith('/forms', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('adds a fillable ACTIVE when program details are already complete', async () => {
    const res = await addStandardTemplate('ex1', 'medical', DL)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(updates).toContainEqual({ status: 'active' })
    expect(upserted).toHaveLength(0)
  })

  it('writes the supplied details, then activates, on an exchange with none', async () => {
    scenario.details = null
    const res = await addStandardTemplate('ex1', 'famille', {
      deadline: '2026-09-30',
      details: { association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby' },
    })
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(upserted[0]).toMatchObject({
      exchange_id: 'ex1', association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby',
    })
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('leaves the template draft (not deleted) when details are still incomplete', async () => {
    scenario.details = null
    const res = await addStandardTemplate('ex1', 'famille', { deadline: '2026-09-30' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain('Nom de l’association')
    expect(updates).not.toContainEqual({ status: 'active' })
  })

  it('uploads the bundled CERFA for the AST and stores its path', async () => {
    const res = await addStandardTemplate('ex1', 'ast', DL)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(uploads).toHaveLength(1)
    expect(uploads[0].path).toBe('s1/tpl-new.pdf')
    expect(uploads[0].bytes).toBeGreaterThan(1000)
    expect(updates).toContainEqual({ template_file_path: 's1/tpl-new.pdf' })
    expect(updates).toContainEqual({ status: 'active' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run actions/__tests__/add-standard-template.test.ts`
Expected: FAIL — `addStandardTemplate` takes 2 arguments, deadline is ignored, nothing activates.

- [ ] **Step 3: Update `lib/forms/standard-library.ts`**

Correct the header comment (lines 1-5):

```ts
// Canonical standard-template library. Since the forms-page redesign
// (2026-07-16) nothing is auto-seeded: organizers add entries from the
// library drawer (actions/forms.ts → addStandardTemplate). Templates are
// added WITHOUT files — the PDFs are school-specific, so each school's
// organizer attaches their own per exchange via the UI. The one exception is
// the AST: CERFA 15646 is a national French form, identical for every school,
// so it ships with the app (lib/forms/assets.ts) and is copied into the
// school's own storage path on add. The organizer can still replace it.
```

Add the import at the top of the file, next to the existing `SupabaseClient` import:

```ts
import { readBundledPdf } from '@/lib/forms/assets'
```

Replace the `insertStandardTemplate` signature and body (lines 76-121):

```ts
// Insert ONE library entry (+ document slot / fields / bundled PDF). The
// caller activates it afterwards. The partial unique index
// form_templates_standard_key_unique makes a repeat add an expected outcome —
// surfaced as { duplicate: true }, never thrown.
export async function insertStandardTemplate(
  supabase: SupabaseClient,
  std: StandardTemplate,
  opts: { exchangeId: string; schoolId: string; userId: string; deadline: string },
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await supabase
    .from('form_templates')
    .insert({
      exchange_id: opts.exchangeId,
      school_id: opts.schoolId,
      name: std.name,
      description: std.description,
      type: std.kind === 'online' || std.kind === 'fillable' ? 'data_entry' : 'document_upload',
      kind: std.kind,
      status: 'draft',
      audience: std.audience,
      standard_key: std.key,
      condition_label: std.condition_label,
      external_url: std.external_url,
      deadline: opts.deadline,
      created_by: opts.userId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    throw error
  }
  const templateId = data.id as string

  if (std.kind !== 'online' && std.kind !== 'fillable') {
    const { error: slotError } = await supabase
      .from('document_slots')
      .insert({ template_id: templateId, label: std.name, description: null, required: true, order: 0 })
    if (slotError) throw slotError
  }
  if (std.fields.length > 0) {
    const { error: fieldError } = await supabase
      .from('form_fields')
      .insert(std.fields.map((f, i) => ({
        template_id: templateId, label: f.label, field_type: f.field_type, required: true, order: i,
      })))
    if (fieldError) throw fieldError
  }

  // National forms ship with the app; copy into the school's own path so the
  // download/replace plumbing, bucket and RLS are the same as a manual upload.
  const bundled = await readBundledPdf(std.key)
  if (bundled) {
    const path = `${opts.schoolId}/${templateId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('form-templates')
      .upload(path, new Blob([new Uint8Array(bundled)], { type: 'application/pdf' }),
        { upsert: true, contentType: 'application/pdf' })
    if (uploadError) throw uploadError
    const { error: pathError } = await supabase
      .from('form_templates').update({ template_file_path: path }).eq('id', templateId)
    if (pathError) throw pathError
  }

  return { id: templateId }
}
```

- [ ] **Step 4: Rewrite `addStandardTemplate` in `actions/forms.ts`**

Add the imports next to the existing ones near the top of the file:

```ts
import { MSG_DEADLINE_REQUIRED } from '@/lib/forms/template-result'
import { mergeProgramDetails, type ProgramDetailPatch } from '@/lib/forms/add-requirements'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
```

Replace the whole `addStandardTemplate` function (lines 186-203):

```ts
// Add one standard-library template to an exchange and publish it in the same
// request. The library drawer's inline « Ajouter » collects the deadline and
// whatever program details the entry still needs, so the activation gate can
// no longer fail here — but it still runs, so a UI bug degrades to a draft
// rather than to a half-configured template sent to families.
// Duplicate adds (unique index on (exchange_id, standard_key)) and a failing
// gate are expected outcomes → structured messages.
export async function addStandardTemplate(
  exchangeId: string,
  standardKey: string,
  input: { deadline: string; details?: ProgramDetailPatch },
): Promise<CreateTemplateResult> {
  const supabase = await createClient()
  const user = await requireUser()
  const schoolId = await assertOrganizer()
  await assertExchangeWritable(supabase, exchangeId)

  const std = STANDARD_TEMPLATES.find((s) => s.key === standardKey)
  if (!std) return { ok: false, message: 'Modèle standard inconnu.' }

  const deadline = (input.deadline ?? '').trim()
  if (!deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }

  // Detail answers are per exchange, so they land on the shared row before the
  // gate reads it — a later fillable form then asks for less or nothing.
  if (input.details && Object.keys(input.details).length > 0) {
    const { data: existing } = await supabase
      .from('exchange_program_details').select('*')
      .eq('exchange_id', exchangeId).maybeSingle<ProgramDetailsValues>()
    const merged = mergeProgramDetails(existing ?? null, input.details)
    const { error: detailsError } = await supabase.from('exchange_program_details').upsert({
      exchange_id: exchangeId, ...merged, updated_at: new Date().toISOString(),
    }, { onConflict: 'exchange_id' })
    if (detailsError) throw detailsError
  }

  const res = await insertStandardTemplate(supabase, std, { exchangeId, schoolId, userId: user.id, deadline })
  if ('duplicate' in res) return { ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' }

  const tmpl = await getOwnedTemplate(supabase, res.id)
  const activated = await activateTemplateRecord(supabase, tmpl)
  if (!activated.ok) {
    // Keep the draft — the organizer can finish it from Modifier rather than
    // lose the row (and, for the AST, the uploaded PDF).
    revalidatePath('/forms', 'layout')
    return { ok: false, message: activated.message }
  }

  revalidatePath('/forms', 'layout')
  revalidatePath('/dashboard')
  return { ok: true, id: res.id }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/add-standard-template.test.ts`
Expected: PASS — all 10 cases.

- [ ] **Step 6: Commit**

```bash
git add lib/forms/standard-library.ts actions/forms.ts actions/__tests__/add-standard-template.test.ts
git commit -m "feat(forms): standard-library adds land active with a deadline"
```

---

### Task 5: `createDraftTemplate` requires a deadline and activates (except online)

**Files:**
- Modify: `actions/forms.ts:119-184` (`createDraftTemplate`)
- Test: `actions/__tests__/forms-phase3.test.ts` (extend the `createDraftTemplate` describe)

**Interfaces:**
- Consumes: `activateTemplateRecord`, `MSG_DEADLINE_REQUIRED`.
- Produces: `createDraftTemplate(formData)` — unchanged signature. New recognised FormData field `student_ids` (a JSON array of uuid strings, conditional docs only). Returns `{ ok: true, id }` for both the activated and the still-draft (online) case.

- [ ] **Step 1: Write the failing test**

Append to the `describe('createDraftTemplate', …)` block in `actions/__tests__/forms-phase3.test.ts` (match the file's existing fixture/mocking style — read it before writing):

```ts
  it('refuses a missing deadline as a structured outcome', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Carte vitale')
    await expect(createDraftTemplate(fd)).resolves.toEqual({
      ok: false, message: MSG_DEADLINE_REQUIRED,
    })
  })

  it('a doc lands ACTIVE in one call', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Carte vitale')
    fd.set('deadline', '2026-09-30')
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('a conditional doc activates with the chosen students', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Justificatif')
    fd.set('deadline', '2026-09-30'); fd.set('audience', 'conditional')
    fd.set('condition_label', 'si parents divorcés')
    fd.set('student_ids', JSON.stringify(['stu-1']))
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(assignmentsInserted).toEqual([[{ template_id: 'tpl-new', student_id: 'stu-1' }]])
  })

  it('a conditional doc with no selection stays draft with a structured message', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Justificatif')
    fd.set('deadline', '2026-09-30'); fd.set('audience', 'conditional')
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: false, message: 'Choisissez au moins un élève concerné.' })
  })

  it('an online form stays DRAFT — its questions come next', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'online'); fd.set('name', 'Questionnaire')
    fd.set('deadline', '2026-09-30')
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(updates).not.toContainEqual({ status: 'active' })
  })
```

If the file's fake client does not yet record `form_templates.update` patches or `assignments.insert` rows, extend it with `updates: Record<string, unknown>[]` and `assignmentsInserted: unknown[]` arrays reset in `beforeEach`, plus a `form_templates.select().eq().maybeSingle()` branch returning the just-inserted row (same shape as in Task 4's fake).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run actions/__tests__/forms-phase3.test.ts`
Expected: FAIL — deadline is still optional and nothing activates.

- [ ] **Step 3: Update `createDraftTemplate`**

In `actions/forms.ts`, change the deadline parse and validation (lines 128 and 133-140):

```ts
  const deadline = ((formData.get('deadline') as string) ?? '').trim()
```

```ts
  if (!['online', 'pdf', 'doc'].includes(kind)) return { ok: false, message: 'Type de modèle invalide.' }
  if (!name) return { ok: false, message: 'Donnez un nom au modèle.' }
  if (!deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }
  if (audience === 'conditional' && kind !== 'doc') return { ok: false, message: 'Seules les pièces peuvent être conditionnelles.' }
  if (kind === 'pdf') {
    if (!file || file.size === 0) return { ok: false, message: 'Téléversez le PDF à faire signer.' }
    const problem = pdfProblem(file)
    if (problem) return { ok: false, message: problem }
  }

  // Conditional documents pick their audience here so they activate on add
  // like everything else. Malformed JSON is treated as « no selection ».
  let studentIds: string[] = []
  if (audience === 'conditional') {
    const raw = (formData.get('student_ids') as string) ?? '[]'
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) studentIds = parsed.filter((x): x is string => typeof x === 'string')
    } catch {
      studentIds = []
    }
  }
```

Then replace the tail of the function (currently lines 182-183, after the try/catch that uploads the PDF):

```ts
  // An online form is the only template that can legitimately stay draft: its
  // questions cannot be authored in a compact add prompt. addField publishes
  // it the moment the first one is saved.
  if (kind === 'online') {
    revalidatePath('/forms', 'layout')
    return { ok: true, id: templateId }
  }

  const tmpl = await getOwnedTemplate(supabase, templateId)
  const activated = await activateTemplateRecord(supabase, tmpl, audience === 'conditional' ? studentIds : undefined)
  if (!activated.ok) {
    revalidatePath('/forms', 'layout')
    return { ok: false, message: activated.message }
  }

  revalidatePath('/forms', 'layout')
  revalidatePath('/dashboard')
  return { ok: true, id: templateId }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/forms-phase3.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/forms.ts actions/__tests__/forms-phase3.test.ts
git commit -m "feat(forms): custom adds require a deadline and activate on creation"
```

---

### Task 6: `addField` activates a ready online draft

**Files:**
- Modify: `actions/forms.ts:50-68` (`addField`)
- Test: `actions/__tests__/forms.test.ts` (or a new `actions/__tests__/add-field-activates.test.ts` if `forms.test.ts`'s fake client cannot express template state — read it first and pick)

**Interfaces:**
- Consumes: `activateTemplateRecord`, `getOwnedTemplate`.
- Produces: `addField(templateId, label, fieldType, required, options?)` — unchanged signature; now activates the template when it is a draft that passes the gate.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/add-field-activates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let template: {
  status: 'draft' | 'active'
  deadline: string | null
  fieldCount: number
}
let updates: Record<string, unknown>[]

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({
          data: { school_id: 's1', role: 'organizer' }, error: null,
        }) }) }) }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { archived_at: null } }) }) }) }
      }
      if (table === 'form_fields') {
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({
            single: async () => ({ data: template.fieldCount > 0 ? { order: template.fieldCount - 1 } : null }),
          }) }) }) }),
          insert: async () => { template.fieldCount += 1; return { error: null } },
        }
      }
      if (table === 'form_templates') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: {
              id: 'tpl-1', exchange_id: 'ex-1', school_id: 's1', name: 'Q',
              kind: 'online', status: template.status, audience: 'all',
              deadline: template.deadline, standard_key: null, template_file_path: null,
              form_fields: Array.from({ length: template.fieldCount }, (_, i) => ({ id: `f${i}` })),
            },
          }) }) }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); return { error: null } } }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addField } from '../forms'

beforeEach(() => {
  template = { status: 'draft', deadline: '2026-09-30', fieldCount: 0 }
  updates = []
})

describe('addField auto-activation', () => {
  it('activates a draft online form once its first question is saved', async () => {
    await addField('tpl-1', 'Groupe sanguin', 'text', true)
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('does not activate a draft with no deadline', async () => {
    template.deadline = null
    await addField('tpl-1', 'Groupe sanguin', 'text', true)
    expect(updates).not.toContainEqual({ status: 'active' })
  })

  it('is a no-op on an already active template', async () => {
    template.status = 'active'
    template.fieldCount = 2
    await addField('tpl-1', 'Autre', 'text', false)
    expect(updates).not.toContainEqual({ status: 'active' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run actions/__tests__/add-field-activates.test.ts`
Expected: FAIL — `expected [] to deep equally include { status: 'active' }`.

- [ ] **Step 3: Update `addField`**

Replace the tail of `addField` in `actions/forms.ts` (from the `if (error) throw error` on line 63 through the closing brace):

```ts
  if (error) throw error

  // Saving the first question is what publishes a custom online form — there
  // is no Activate button any more. The gate still runs, so a form without a
  // deadline simply stays draft.
  const tmpl = await getOwnedTemplate(supabase, templateId)
  if (tmpl.status === 'draft') {
    const activated = await activateTemplateRecord(supabase, tmpl)
    if (activated.ok) revalidatePath('/dashboard')
  }

  // FormBuilder only renders for kind !== 'doc' templates, which live under
  // /forms/[templateId] (not the legacy /exchanges/[id]/forms/* route these
  // used to point at) — without this the editor's own page never refreshes.
  revalidatePath('/forms', 'layout')
}
```

Note `getOwnedTemplate` is declared at line 85, below `addField`; function declarations hoist, so no reordering is needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/add-field-activates.test.ts actions/__tests__/forms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/forms.ts actions/__tests__/add-field-activates.test.ts
git commit -m "feat(forms): first saved question publishes a custom online form"
```

---

### Task 7: The add UI — inline row expansion, required deadline, online→editor

**Files:**
- Create: `components/forms/ProgramDetailFields.tsx`
- Create: `components/forms/__tests__/ProgramDetailFields.test.tsx`
- Modify: `components/forms/LibraryDrawer.tsx`
- Modify: `components/forms/FichiersView.tsx`
- Modify: `actions/forms.ts` (`getTemplatesPage` return)
- Modify: `app/(organizer)/forms/page.tsx`
- Modify: `messages/{en,fr,es,it,de}.json`
- Test: `components/forms/__tests__/FichiersView.test.tsx`

**Interfaces:**
- Consumes: `missingProgramFields`, `ProgramDetailPatch`, `DetailKey`, `LIST_DETAIL_KEYS`, `DATE_DETAIL_KEYS` (Task 1); `addStandardTemplate(exchangeId, key, { deadline, details })` (Task 4); `createDraftTemplate(formData)` with `student_ids` (Task 5).
- Produces:
  - `DetailState = Record<DetailKey, string>` and `EMPTY_DETAIL_STATE` (from `components/forms/ProgramDetailFields.tsx`)
  - `detailPatch(keys: DetailKey[], state: DetailState): ProgramDetailPatch`
  - `<ProgramDetailFields keys state onChange idPrefix />`
  - `getTemplatesPage` gains `programDetails: ProgramDetailsValues | null` in its return object.
  - `<FichiersView exchangeId templates enrolledStudents programDetails />`
  - `<LibraryDrawer exchangeId existingKeys programDetails onClose onAdded />` where `onAdded: (id: string, kind: TemplateKind) => void`.

- [ ] **Step 1: Add the message keys (5 locales)**

In each of `messages/{en,fr,es,it,de}.json`:

1. Under `organizer.library`, add three keys:

| key | en | fr | es | it | de |
|---|---|---|---|---|---|
| `deadlineLabel` | `Deadline` | `Échéance` | `Fecha límite` | `Scadenza` | `Frist` |
| `detailsHint` | `These details are filled into the document automatically.` | `Ces informations sont insérées automatiquement dans le document.` | `Estos datos se insertan automáticamente en el documento.` | `Queste informazioni vengono inserite automaticamente nel documento.` | `Diese Angaben werden automatisch in das Dokument eingesetzt.` |
| `confirmAdd` | `Add to the programme` | `Ajouter au programme` | `Añadir al programa` | `Aggiungi al programma` | `Zum Programm hinzufügen` |

2. Under `organizer.documents.addPanel`, add:

| key | en | fr | es | it | de |
|---|---|---|---|---|---|
| `studentsLabel` | `Students concerned` | `Élèves concernés` | `Alumnos afectados` | `Studenti interessati` | `Betroffene Schüler` |
| `noStudents` | `No enrolled students yet.` | `Aucun élève inscrit pour l’instant.` | `Aún no hay alumnos inscritos.` | `Nessuno studente iscritto per ora.` | `Noch keine eingeschriebenen Schüler.` |

3. Under `organizer.forms.addPanel`, add:

| key | en | fr | es | it | de |
|---|---|---|---|---|---|
| `createAndEdit` | `Create and add questions` | `Créer et ajouter les questions` | `Crear y añadir preguntas` | `Crea e aggiungi le domande` | `Erstellen und Fragen hinzufügen` |

4. Change the now-mandatory deadline labels — `organizer.forms.addPanel.deadlineLabel` **and** `organizer.documents.addPanel.deadlineLabel` — from the "(optional)" wording to: en `Deadline`, fr `Échéance`, es `Fecha límite`, it `Scadenza`, de `Frist`.

5. Change `organizer.forms.addPanel.createDraft` and `organizer.documents.addPanel.createDraft` to the add wording: en `Add`, fr `Ajouter`, es `Añadir`, it `Aggiungi`, de `Hinzufügen`. Leave `creating` as-is.

- [ ] **Step 2: Run the parity test**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS. If it fails, a key is missing from one locale — fix that locale.

- [ ] **Step 3: Write the failing test for `ProgramDetailFields`**

Create `components/forms/__tests__/ProgramDetailFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import {
  ProgramDetailFields, EMPTY_DETAIL_STATE, detailPatch,
} from '@/components/forms/ProgramDetailFields'

describe('ProgramDetailFields', () => {
  it('renders only the requested keys, with the Réglages labels', () => {
    renderWithIntl(
      <ProgramDetailFields idPrefix="x" keys={['destination', 'travel_start']}
        state={EMPTY_DETAIL_STATE} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Destination')).toBeInTheDocument()
    expect(screen.getByLabelText('Date de départ')).toHaveAttribute('type', 'date')
    expect(screen.queryByLabelText('Accompagnateurs')).toBeNull()
  })

  it('renders list columns as textareas', () => {
    renderWithIntl(
      <ProgramDetailFields idPrefix="x" keys={['chaperones']}
        state={EMPTY_DETAIL_STATE} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Accompagnateurs').tagName).toBe('TEXTAREA')
  })

  it('reports edits by key', () => {
    const onChange = vi.fn()
    renderWithIntl(
      <ProgramDetailFields idPrefix="x" keys={['destination']}
        state={EMPTY_DETAIL_STATE} onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Berlin' } })
    expect(onChange).toHaveBeenCalledWith('destination', 'Berlin')
  })
})

describe('detailPatch', () => {
  it('sends only the asked-for keys, splitting list columns on newlines', () => {
    const state = { ...EMPTY_DETAIL_STATE, destination: ' Berlin ', chaperones: 'A\n\n B ', sending_city: 'Luynes' }
    expect(detailPatch(['destination', 'chaperones'], state)).toEqual({
      destination: ' Berlin ', chaperones: ['A', 'B'],
    })
  })

  it('is empty when nothing was asked', () => {
    expect(detailPatch([], EMPTY_DETAIL_STATE)).toEqual({})
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/ProgramDetailFields.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/forms/ProgramDetailFields"`.

- [ ] **Step 5: Create `components/forms/ProgramDetailFields.tsx`**

```tsx
'use client'
import { useTranslations } from 'next-intl'
import {
  LIST_DETAIL_KEYS, DATE_DETAIL_KEYS,
  type DetailKey, type ProgramDetailPatch,
} from '@/lib/forms/add-requirements'

// One text/date/textarea input per program-detail column, reusing the labels
// already written for Réglages → Programme so the same field never has two
// names. Values are held as plain strings (list columns newline-separated,
// same convention as ProgramDetailsCard) and converted by detailPatch.
export type DetailState = Record<DetailKey, string>

export const EMPTY_DETAIL_STATE: DetailState = {
  destination: '', travel_start: '', travel_end: '', chaperones: '',
  association_name: '', sending_school_name: '', receiving_school_name: '',
  proviseur_name: '', sending_city: '', absence_dates: '',
}

const LABEL_KEY: Record<DetailKey, string> = {
  destination: 'settings.programDetails.destination',
  travel_start: 'settings.programDetails.travelStart',
  travel_end: 'settings.programDetails.travelEnd',
  chaperones: 'settings.programDetails.chaperones',
  association_name: 'settings.programDetails.association',
  sending_school_name: 'settings.programDetails.sendingSchool',
  receiving_school_name: 'settings.programDetails.receivingSchool',
  proviseur_name: 'settings.programDetails.proviseur',
  sending_city: 'settings.programDetails.sendingCity',
  absence_dates: 'settings.programDetails.absenceDates',
}

export function detailPatch(keys: DetailKey[], state: DetailState): ProgramDetailPatch {
  const patch: ProgramDetailPatch = {}
  for (const key of keys) {
    if (LIST_DETAIL_KEYS.includes(key)) {
      ;(patch as Record<string, unknown>)[key] =
        state[key].split('\n').map(s => s.trim()).filter(Boolean)
    } else {
      ;(patch as Record<string, unknown>)[key] = state[key]
    }
  }
  return patch
}

const inputCls = 'h-10 w-full rounded-[9px] border border-frame bg-card px-3 text-[13px] focus:border-brand focus:outline-none'
const areaCls = 'w-full rounded-[9px] border border-frame bg-card px-3 py-2 text-[13px] focus:border-brand focus:outline-none'

export function ProgramDetailFields({
  keys, state, onChange, idPrefix,
}: {
  keys: DetailKey[]
  state: DetailState
  onChange: (key: DetailKey, value: string) => void
  idPrefix: string
}) {
  const t = useTranslations('organizer')
  if (keys.length === 0) return null

  return (
    <>
      {keys.map((key) => {
        const id = `${idPrefix}-${key}`
        const label = t(LABEL_KEY[key])
        return (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-[13px] font-semibold text-navy">{label}</label>
            {LIST_DETAIL_KEYS.includes(key) ? (
              <textarea id={id} rows={2} required value={state[key]}
                onChange={(e) => onChange(key, e.target.value)} className={areaCls} />
            ) : (
              <input id={id} required
                type={DATE_DETAIL_KEYS.includes(key) ? 'date' : 'text'}
                value={state[key]} onChange={(e) => onChange(key, e.target.value)}
                className={inputCls} />
            )}
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 6: Run the component test**

Run: `pnpm vitest run components/forms/__tests__/ProgramDetailFields.test.tsx`
Expected: PASS.

- [ ] **Step 7: Expose the program details to the page**

In `actions/forms.ts` → `getTemplatesPage`, widen the return type and fetch the row. Add to the declared return type:

```ts
  programDetails: ProgramDetailsValues | null
```

Add the query alongside the existing `Promise.all` (a third entry is fine — it is scoped by `exchangeId`, and the caller is already proven to own the exchange a few lines above):

```ts
  const [{ data: templates }, { data: enrollments }, { data: programDetails }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, kind, status, audience, name, description, deadline, standard_key, condition_label, template_file_path, external_url, form_fields(label, "order")')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
    supabase.from('exchange_program_details').select('*')
      .eq('exchange_id', exchangeId).maybeSingle<ProgramDetailsValues>(),
  ])
```

and add `programDetails: programDetails ?? null,` to the returned object.

In `app/(organizer)/forms/page.tsx`:

```tsx
  const { templates, enrolledStudents, programDetails } = await getTemplatesPage(active.id)
  return (
    <FichiersView exchangeId={active.id} templates={templates}
      enrolledStudents={enrolledStudents} programDetails={programDetails} />
  )
```

- [ ] **Step 8: Write the failing view tests**

In `components/forms/__tests__/FichiersView.test.tsx`:

- Update `renderView` to pass the new prop:

```tsx
function renderView(templates: TemplateVM[], programDetails: ProgramDetailsValues | null = fullDetails) {
  return renderWithIntl(
    <FichiersView exchangeId="ex1" templates={templates}
      enrolledStudents={students} programDetails={programDetails} />,
  )
}

const fullDetails: ProgramDetailsValues = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}
```

(add `import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'`).

- Delete the four now-obsolete tests: `'form drawer activation still works from a card'`, `'conditional doc draft activation with student picking still works'`, `'drawer shows the structured activation message inline'`, `'form drawer lists readiness hints for an unready draft'`. Drop the `activate` mock (`const activate = …` and its entry in the `@/actions/forms` mock).
- Add a router mock capable of asserting navigation:

```tsx
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (...a: unknown[]) => push(...a), refresh: vi.fn() }) }))
```

- Replace the two add-path tests and add the new ones:

```tsx
  it('« Ajouter » on a standard entry expands it in place asking only for a deadline', () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    const row = screen.getByTestId('lib-entry-medical')
    expect(within(row).getByLabelText('Échéance')).toBeInTheDocument()
    // details are complete → no extra fields
    expect(within(row).queryByLabelText('Accompagnateurs')).toBeNull()
    // the library list is still visible behind the expansion
    expect(screen.getByTestId('lib-entry-passeport')).toBeInTheDocument()
  })

  it('the expansion asks for the entry’s missing program details', () => {
    renderView([], null)
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-famille')).getByRole('button', { name: 'Ajouter' }))
    const row = screen.getByTestId('lib-entry-famille')
    expect(within(row).getByLabelText('Nom de l’association')).toBeInTheDocument()
    expect(within(row).getByLabelText('Lycée d’origine')).toBeInTheDocument()
    expect(within(row).queryByLabelText('Destination')).toBeNull()
  })

  it('confirming the expansion sends deadline + details and opens the new drawer', async () => {
    renderView([], null)
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    const row = () => screen.getByTestId('lib-entry-famille')
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter' }))
    fireEvent.change(within(row()).getByLabelText('Échéance'), { target: { value: '2026-09-30' } })
    fireEvent.change(within(row()).getByLabelText('Nom de l’association'), { target: { value: 'AGESSIA' } })
    fireEvent.change(within(row()).getByLabelText('Lycée d’origine'), { target: { value: 'Lycée Georges Duby' } })
    fireEvent.click(within(row()).getByRole('button', { name: 'Ajouter au programme' }))
    await waitFor(() => expect(addStandard).toHaveBeenCalled())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'famille', {
      deadline: '2026-09-30',
      details: { association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby' },
    })
  })

  it('a custom online form goes straight to the editor instead of the drawer', async () => {
    createDraft.mockResolvedValueOnce({ ok: true, id: 'online-1' })
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer et ajouter les questions' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/forms/online-1'))
  })

  it('a conditional custom document picks its students in the create form', async () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Demander un document' }))
    fireEvent.change(screen.getByLabelText('Nom de la pièce'), { target: { value: 'Justificatif' } })
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Selon la situation' }))
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    const fd = createDraft.mock.calls.at(-1)![0] as FormData
    expect(fd.get('audience')).toBe('conditional')
    expect(fd.get('deadline')).toBe('2026-09-30')
    expect(JSON.parse(fd.get('student_ids') as string)).toEqual(['s1'])
  })
```

Reset `push` in a `beforeEach`.

- [ ] **Step 9: Run tests to verify they fail**

Run: `pnpm vitest run components/forms/__tests__/FichiersView.test.tsx`
Expected: FAIL — the drawer has no inline expansion and `FichiersView` rejects the new prop.

- [ ] **Step 10: Rewrite `components/forms/LibraryDrawer.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { libraryEntriesGrouped } from '@/lib/forms/library'
import { missingProgramFields, type DetailKey } from '@/lib/forms/add-requirements'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
import type { TemplateKind } from '@/lib/forms/rollup'
import { addStandardTemplate, createDraftTemplate } from '@/actions/forms'
import {
  ProgramDetailFields, detailPatch, EMPTY_DETAIL_STATE, type DetailState,
} from './ProgramDetailFields'

type CreateMode = 'pdf' | 'online' | 'doc'

// Right library drawer (460px, same pattern as FormDrawer): one search box
// over the whole standard library, rendered as two subsections — Formulaires
// then Documents, an empty subsection is hidden. « Ajouter » expands that row
// IN PLACE (the list stays visible, so adding three documents is three quick
// expansions rather than three dialogs) asking for the deadline plus only the
// program details that entry still needs. The three custom tiles flip the
// drawer to the short create form. Everything activates on add except a
// custom online form, which hands its id to onAdded with kind 'online' so the
// view can send the organizer straight to the question editor.
export function LibraryDrawer({
  exchangeId, existingKeys, programDetails, enrolledStudents, onClose, onAdded,
}: {
  exchangeId: string
  existingKeys: string[]
  programDetails: ProgramDetailsValues | null
  enrolledStudents: { id: string; full_name: string }[]
  onClose: () => void
  onAdded: (id: string, kind: TemplateKind) => void
}) {
  const [query, setQuery] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deadline, setDeadline] = useState('')
  const [details, setDetails] = useState<DetailState>(EMPTY_DETAIL_STATE)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const grouped = libraryEntriesGrouped(existingKeys, query)
  const sections = [
    { id: 'forms', heading: t('library.formsSection'), entries: grouped.forms },
    { id: 'docs', heading: t('library.docsSection'), entries: grouped.docs },
  ].filter((s) => s.entries.length > 0)

  function expand(key: string) {
    setExpandedKey(key)
    setDeadline('')
    setDetails(EMPTY_DETAIL_STATE)
    setError(null)
  }

  async function handleAdd(e: React.FormEvent, key: string, missing: DetailKey[], kind: TemplateKind) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await addStandardTemplate(exchangeId, key, {
        deadline,
        details: detailPatch(missing, details),
      })
      if (!res.ok) { setError(res.message); setBusy(false); return }
      onAdded(res.id, kind)
    } catch {
      setError(c('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] max-w-full flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-center justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="font-display text-lg font-semibold text-navy">
            {t('library.addTitle')}
          </div>
          <button type="button" onClick={onClose} aria-label={t('forms.close')}
            className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        {createMode === null ? (
          <div className="flex-1 overflow-auto px-[26px] py-[22px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="mb-5 h-11 w-full rounded-[10px] border border-frame bg-card px-3 text-[14px] placeholder:text-placeholder focus:border-brand focus:outline-none" />

            {sections.map((section) => (
              <div key={section.id} className="mb-5">
                <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
                  {section.heading}
                </div>
                <div className="flex flex-col gap-2.5">
                  {section.entries.map((entry) => {
                    const missing = missingProgramFields(entry.key, programDetails)
                    const open = expandedKey === entry.key
                    return (
                      <div key={entry.key} data-testid={`lib-entry-${entry.key}`}
                        className={`rounded-xl border border-dashed border-frame p-3.5 ${entry.added ? 'opacity-45' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-display text-[13.5px] font-semibold leading-snug text-navy">{entry.name}</div>
                            <div className="mt-1 line-clamp-2 text-[12px] leading-normal text-muted-foreground">{entry.description}</div>
                          </div>
                          {entry.added ? (
                            <span className="flex-none pt-0.5 text-[11.5px] font-semibold text-muted-foreground">{t('library.alreadyAdded')}</span>
                          ) : !open ? (
                            <button type="button" disabled={busy} onClick={() => expand(entry.key)}
                              className="flex-none rounded-lg bg-subtle px-3 py-1.5 text-[12.5px] font-semibold text-navy hover:bg-hoverrow disabled:opacity-60">
                              {c('actions.add')}
                            </button>
                          ) : null}
                        </div>

                        {open && (
                          <form onSubmit={(e) => handleAdd(e, entry.key, missing, entry.kind)}
                            className="mt-3 flex flex-col gap-3 border-t border-frame pt-3">
                            <div className="flex flex-col gap-1">
                              <label htmlFor={`lib-${entry.key}-deadline`} className="text-[13px] font-semibold text-navy">
                                {t('library.deadlineLabel')}
                              </label>
                              <input id={`lib-${entry.key}-deadline`} type="date" required
                                value={deadline} onChange={(e) => setDeadline(e.target.value)}
                                className="h-10 w-full rounded-[9px] border border-frame bg-card px-3 text-[13px] focus:border-brand focus:outline-none" />
                            </div>
                            {missing.length > 0 && (
                              <p className="text-[12px] leading-normal text-muted-foreground">{t('library.detailsHint')}</p>
                            )}
                            <ProgramDetailFields idPrefix={`lib-${entry.key}`} keys={missing}
                              state={details}
                              onChange={(k, v) => setDetails(prev => ({ ...prev, [k]: v }))} />
                            {error && <p className="text-sm text-danger-text">{error}</p>}
                            <div className="flex gap-2.5">
                              <button type="submit" disabled={busy}
                                className="rounded-[9px] bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
                                {busy ? t('library.adding') : t('library.confirmAdd')}
                              </button>
                              <button type="button" onClick={() => setExpandedKey(null)}
                                className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground">
                                {c('actions.cancel')}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-background" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-placeholder">{t('library.customHeading')}</span>
              <div className="h-px flex-1 bg-background" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setCreateMode('pdf')}
                className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">⤒</span> {t('library.uploadPdfTile')}
              </button>
              <button type="button" onClick={() => setCreateMode('online')}
                className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">✎</span> {t('library.createOnlineTile')}
              </button>
              <button type="button" onClick={() => setCreateMode('doc')}
                className="col-span-2 rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">+</span> {t('library.requestDocTile')}
              </button>
            </div>
          </div>
        ) : (
          <CreateTemplateForm mode={createMode} exchangeId={exchangeId}
            enrolledStudents={enrolledStudents}
            onBack={() => setCreateMode(null)} onCreated={onAdded} />
        )}
      </div>
    </div>
  )
}
```

Then replace `CreateTemplateForm` — it gains a required deadline, a student picker for conditional documents, and hands the kind back:

```tsx
// The short create form for the three custom tiles. The deadline is required
// (setting it IS publishing) and a conditional document picks its students
// here, so everything but an online form activates on creation.
function CreateTemplateForm({
  mode, exchangeId, enrolledStudents, onBack, onCreated,
}: {
  mode: CreateMode
  exchangeId: string
  enrolledStudents: { id: string; full_name: string }[]
  onBack: () => void
  onCreated: (id: string, kind: TemplateKind) => void
}) {
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [audience, setAudience] = useState<'all' | 'conditional'>('all')
  const [condition, setCondition] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  const isDoc = mode === 'doc'

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', mode)
      fd.set('name', name)
      fd.set('deadline', deadline)
      if (mode === 'pdf' && file) fd.set('file', file)
      if (mode === 'doc') {
        fd.set('audience', audience)
        if (audience === 'conditional') {
          if (condition) fd.set('condition_label', condition)
          fd.set('student_ids', JSON.stringify(chosen))
        }
      }
      const res = await createDraftTemplate(fd)
      if (!res.ok) {
        setError(res.message)
        setBusy(false)
        return
      }
      onCreated(res.id, mode)
    } catch {
      setError(c('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-3 overflow-auto px-[26px] py-[22px]">
      <div className="flex flex-col gap-1">
        <label htmlFor="lib-create-name" className="text-[13px] font-semibold text-navy">
          {isDoc ? t('documents.addPanel.nameLabel') : t('forms.addPanel.nameLabel')}
        </label>
        <input id="lib-create-name" value={name} onChange={(e) => setName(e.target.value)} required
          placeholder={mode === 'doc' ? t('documents.addPanel.namePlaceholder')
            : mode === 'pdf' ? t('forms.addPanel.namePlaceholderPdf') : t('forms.addPanel.namePlaceholderOnline')}
          className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lib-create-deadline" className="text-[13px] font-semibold text-navy">
          {isDoc ? t('documents.addPanel.deadlineLabel') : t('forms.addPanel.deadlineLabel')}
        </label>
        <input id="lib-create-deadline" type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)}
          className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
      </div>
      {mode === 'pdf' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="lib-create-file" className="text-[13px] font-semibold text-navy">{t('forms.addPanel.fileLabel')}</label>
          <input id="lib-create-file" type="file" accept="application/pdf" required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] text-muted-foreground" />
        </div>
      )}
      {mode === 'doc' && (
        <fieldset className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
            <input type="radio" name="lib-audience" checked={audience === 'all'} onChange={() => setAudience('all')} />
            {t('documents.addPanel.mandatoryTile.title')}
          </label>
          <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
            <input type="radio" name="lib-audience" checked={audience === 'conditional'} onChange={() => setAudience('conditional')} />
            {t('documents.addPanel.conditionalTile.title')}
          </label>
        </fieldset>
      )}
      {mode === 'doc' && audience === 'conditional' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="lib-create-cond" className="text-[13px] font-semibold text-navy">{t('documents.addPanel.conditionLabel')}</label>
            <input id="lib-create-cond" value={condition} onChange={(e) => setCondition(e.target.value)}
              placeholder={t('documents.addPanel.conditionPlaceholder')}
              className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-navy">{t('documents.addPanel.studentsLabel')}</span>
            <div className="flex flex-col overflow-hidden rounded-xl border">
              {enrolledStudents.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 border-b px-3.5 py-[11px] text-[13px] font-medium text-navy last:border-0 hover:bg-hoverrow-soft">
                  <input type="checkbox" checked={chosen.includes(s.id)} aria-label={s.full_name}
                    onChange={(e) => setChosen(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))} />
                  {s.full_name}
                </label>
              ))}
              {enrolledStudents.length === 0 && (
                <div className="px-3.5 py-[11px] text-[13px] text-muted-foreground">{t('documents.addPanel.noStudents')}</div>
              )}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <div className="mt-auto flex gap-2.5 pt-3">
        <button type="submit" disabled={busy}
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
          {busy
            ? (isDoc ? t('documents.addPanel.creating') : t('forms.addPanel.creating'))
            : mode === 'online' ? t('forms.addPanel.createAndEdit')
            : (isDoc ? t('documents.addPanel.createDraft') : t('forms.addPanel.createDraft'))}
        </button>
        <button type="button" onClick={onBack}
          className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">
          {isDoc ? t('documents.addPanel.back') : t('forms.addPanel.back')}
        </button>
      </div>
    </form>
  )
}
```

(`enrolledStudents` is already threaded through the props block and the `<CreateTemplateForm />` call site shown above — no extra wiring needed.)

- [ ] **Step 11: Update `components/forms/FichiersView.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type TemplateVM, type TemplateKind } from '@/lib/forms/rollup'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
import { TemplateGrid } from './TemplateGrid'
import { TemplateCard } from './TemplateCard'
import { LibraryDrawer } from './LibraryDrawer'
import { FormDrawer } from './FormDrawer'
import { DocDrawer } from '@/components/documents/DocDrawer'
```

Add `programDetails` to the props, `const router = useRouter()` next to the other hooks, and change the drawer wiring:

```tsx
      {showLibrary && (
        <LibraryDrawer exchangeId={exchangeId} existingKeys={existingKeys}
          programDetails={programDetails} enrolledStudents={enrolledStudents}
          onClose={() => setShowLibrary(false)}
          onAdded={(id, kind) => {
            setShowLibrary(false)
            // A custom online form is the only template that lands draft —
            // send the organizer straight to its questions; saving the first
            // one publishes it. Everything else is already active, so the
            // detail drawer is the useful next stop.
            if (kind === 'online') router.push(`/forms/${id}`)
            else setOpenId(id)
          }} />
      )}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `pnpm vitest run components/forms messages/__tests__/parity.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` clean except the still-pending `activateTemplate` imports in `FormDrawer.tsx` / `DocDrawer.tsx` (Task 8).

- [ ] **Step 13: Commit**

```bash
git add components/forms actions/forms.ts "app/(organizer)/forms/page.tsx" messages
git commit -m "feat(forms): collect the deadline and missing details in the add flow"
```

---

### Task 8: Remove the Activate button and the « Avant d'activer » hints

**Files:**
- Modify: `components/forms/FormDrawer.tsx`
- Modify: `components/documents/DocDrawer.tsx`
- Modify: `lib/forms/rollup.ts:39-51` (delete `activationHints`)
- Modify: `lib/forms/template-result.ts`
- Modify: `lib/forms/__tests__/rollup.test.ts:87-111` (delete the `activationHints` describe)
- Modify: `messages/{en,fr,es,it,de}.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `lib/forms/rollup.ts` no longer exports `activationHints`. `statusPill` and `progressLabel` stay — the transient online-form draft still needs a label.

- [ ] **Step 1: Delete the hints test**

In `lib/forms/__tests__/rollup.test.ts`, delete the whole `describe('activationHints', …)` block (lines 87-111) and remove `activationHints` from the import on line 7.

- [ ] **Step 2: Delete `activationHints`**

In `lib/forms/rollup.ts`, delete lines 39-51 (the comment block and the function) and delete the now-unused import on line 5:

```ts
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'
```

In `lib/forms/template-result.ts`, delete `MSG_PDF_REQUIRED` and `MSG_QUESTIONS_REQUIRED`'s exports **only if** `grep -rn "MSG_PDF_REQUIRED\|MSG_QUESTIONS_REQUIRED" --include=*.ts --include=*.tsx . | grep -v node_modules` shows no remaining consumers. `lib/forms/activate.ts` uses all three, so in practice **all three stay** — run the grep and leave the file untouched if they are still referenced.

- [ ] **Step 3: Strip the Activate UI from `FormDrawer.tsx`**

- Line 7: drop `activationHints` from the `@/lib/forms/rollup` import.
- Line 9: `import { deleteTemplate, getTemplateFileUrl } from '@/actions/forms'`.
- Line 28: delete `const hints = activationHints(vm)`.
- Delete `handleActivate` (lines 58-68).
- Delete the whole `{hints.length > 0 && ( … )}` block (lines 129-141).
- In the footer (lines 143-149), delete the `{vm.status === 'draft' && ( <button … Activer … /> )}` block. Keep the `Modifier le modèle` link exactly as it is (including its draft/active styling ternary) — for a draft online form it is now the primary next step.
- If `Link` becomes unused, leave it: it is still used by the edit link.

- [ ] **Step 4: Strip the Activate UI from `DocDrawer.tsx`**

- Line 7: drop `activationHints` from the import.
- Line 10: `import { deleteTemplate, remindTemplate } from '@/actions/forms'`.
- Line 42: delete `const hints = activationHints(vm)`.
- Delete `handleActivate` (lines 55-68) and the `picking` / `chosen` state (lines 23-24), their reset in the `useEffect` on line 31, and `needsPicker` (line 44). Documents now arrive active with their audience already chosen.
- Delete the `{isDraft && picking && ( … )}` student-picker block (lines 132-145). Keep the `{isDraft && !picking && …}` empty-state block but simplify it to `{isDraft && ( … t('documents.drawer.draftEmptyAll') … )}` — a doc can only be draft now if the gate rejected it, and that message still reads correctly.
- Delete the whole `{hints.length > 0 && ( … )}` block (lines 182-194).
- In the footer (lines 196-207), replace the `isDraft ? <Activer> : <Relancer>` ternary with the Relancer button unconditionally, disabled while draft:

```tsx
          <button type="button" disabled={busy || isDraft} onClick={handleRemind}
            className="flex-1 rounded-[9px] bg-brand py-[11px] text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
            {busy ? t('documents.drawer.sending') : t('documents.drawer.remindFamilies')}
          </button>
```

- [ ] **Step 5: Remove the orphaned message keys (5 locales)**

Delete from each of `messages/{en,fr,es,it,de}.json`:
- `organizer.forms.drawer.activate`
- `organizer.forms.drawer.activating`
- `organizer.documents.drawer.activate`
- `organizer.documents.drawer.activating`
- `organizer.documents.drawer.chooseAndActivate`
- `organizer.documents.drawer.draftEmptyConditional`

Keep `organizer.documents.drawer.draftEmptyAll` and `organizer.forms.pills.draft`.

- [ ] **Step 6: Verify no references remain**

Run:
```bash
grep -rn "activationHints\|activateTemplate\|Avant d’activer\|chooseAndActivate\|draftEmptyConditional" --include=*.ts --include=*.tsx . | grep -v node_modules
```
Expected: only `activateTemplateRecord` hits in `lib/forms/activate.ts`, `actions/forms.ts` and `lib/forms/__tests__/activate.test.ts`. Anything else must be cleaned up.

- [ ] **Step 7: Run the full suite**

Run: `pnpm vitest run && npx tsc --noEmit && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add components lib/forms messages
git commit -m "feat(forms): remove the Activer button and the pre-activation hints"
```

---

### Task 9: Structured onboarding step 2

**Files:**
- Modify: `lib/onboarding/first-exchange.ts`
- Modify: `actions/onboarding.ts:36-107` (`completeFirstExchange`)
- Modify: `app/onboarding/OnboardingForm.tsx`
- Modify: `app/onboarding/page.tsx`
- Test: `lib/onboarding/__tests__/first-exchange.test.ts` (create if absent), `actions/__tests__/onboarding-first-exchange.test.ts`

**Interfaces:**
- Consumes: `travelPeriodFr` (`lib/forms/fillable/render.ts`), `validateInfoCard`, `canCreateExchange`.
- Produces:
  - `type FirstExchangeDetails = { destination: string; travel_start: string; travel_end: string; chaperones: string; association_name: string; sending_school_name: string; receiving_school_name: string; proviseur_name: string; sending_city: string }`
  - `EMPTY_FIRST_EXCHANGE_DETAILS: FirstExchangeDetails`
  - `DETAILS_REQUIRED_MESSAGE`, `TRAVEL_ORDER_MESSAGE`
  - `detailsProblem(d: FirstExchangeDetails): string | null`
  - `generatedCards(d: FirstExchangeDetails): FirstExchangeCard[]`
  - `completeFirstExchange(name: string, details: FirstExchangeDetails, cards: FirstExchangeCard[]): Promise<CompleteFirstExchangeResult>`
  - `<OnboardingForm initialStep initialSchoolName />`
  - `CompleteFirstExchangeResult`'s `error` union loses `'noCards'`.

- [ ] **Step 1: Write the failing pure-helper test**

Create `lib/onboarding/__tests__/first-exchange.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  detailsProblem, generatedCards, filledCards,
  EMPTY_FIRST_EXCHANGE_DETAILS, DETAILS_REQUIRED_MESSAGE, TRAVEL_ORDER_MESSAGE,
  ONBOARDING_CARD_PROMPTS,
} from '@/lib/onboarding/first-exchange'

const good = {
  ...EMPTY_FIRST_EXCHANGE_DETAILS,
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
}

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
})

describe('generatedCards', () => {
  it('generates the Destination and Dates clés cards from the structured values', () => {
    expect(generatedCards(good)).toEqual([
      { title: 'Destination', body: 'le Minnesota, USA' },
      { title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.' },
    ])
  })
})

describe('ONBOARDING_CARD_PROMPTS', () => {
  it('no longer prompts for the two generated cards', () => {
    expect(ONBOARDING_CARD_PROMPTS).toEqual(['Hébergement', 'Contact organisateur', 'À prévoir'])
  })
})

describe('filledCards', () => {
  it('still drops cards with an empty body', () => {
    expect(filledCards([{ title: 'A', body: '  ' }, { title: ' B ', body: ' x ' }]))
      .toEqual([{ title: 'B', body: 'x' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/onboarding/__tests__/first-exchange.test.ts`
Expected: FAIL — `detailsProblem` is not exported.

- [ ] **Step 3: Rewrite `lib/onboarding/first-exchange.ts`**

```ts
// Pure helpers + shared contract for the onboarding "first exchange" step.
// Lives outside the 'use server' action module so values and types can be
// imported by both the action and the client form (a 'use server' file may
// export only async functions).
import { travelPeriodFr } from '@/lib/forms/fillable/render'

export type FirstExchangeCard = { title: string; body: string }

// The structured program details collected in step 2. Destination and the two
// travel dates are required — they feed three of the four fillable forms and
// both generated Info cards. The rest is optional: an organizer signing up in
// September may genuinely not know the receiving school yet, and the library
// drawer's add-time prompt collects whatever is still blank.
export type FirstExchangeDetails = {
  destination: string
  travel_start: string
  travel_end: string
  chaperones: string
  association_name: string
  sending_school_name: string
  receiving_school_name: string
  proviseur_name: string
  sending_city: string
}

export const EMPTY_FIRST_EXCHANGE_DETAILS: FirstExchangeDetails = {
  destination: '', travel_start: '', travel_end: '', chaperones: '',
  association_name: '', sending_school_name: '', receiving_school_name: '',
  proviseur_name: '', sending_city: '',
}

// completeFirstExchange returns this for expected outcomes instead of throwing
// (Next.js redacts thrown Server Action messages in production).
export type CompleteFirstExchangeResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'limit'; message: string }

// Free-text card titles still typed by hand. Destination and Dates clés are
// generated from the structured details, so they are no longer prompted.
export const ONBOARDING_CARD_PROMPTS: readonly string[] = [
  'Hébergement',
  'Contact organisateur',
  'À prévoir',
]

export const CARD_INVALID_MESSAGE =
  'Chaque information renseignée doit avoir un titre.'

export const DETAILS_REQUIRED_MESSAGE =
  'Renseignez la destination et les deux dates du voyage.'

export const TRAVEL_ORDER_MESSAGE =
  'La date de retour doit être après la date de départ.'

export function detailsProblem(d: FirstExchangeDetails): string | null {
  if (!d.destination.trim()) return DETAILS_REQUIRED_MESSAGE
  if (!d.travel_start.trim() || !d.travel_end.trim()) return DETAILS_REQUIRED_MESSAGE
  if (d.travel_end < d.travel_start) return TRAVEL_ORDER_MESSAGE
  return null
}

// The two Info cards students see, derived from the structured values rather
// than typed a second time.
export function generatedCards(d: FirstExchangeDetails): FirstExchangeCard[] {
  return [
    { title: 'Destination', body: d.destination.trim() },
    { title: 'Dates clés', body: `Le voyage se déroulera ${travelPeriodFr(d.travel_start, d.travel_end)}.` },
  ]
}

// Trim both fields; keep only cards the organizer actually filled in (non-empty
// body). Cards left blank are dropped rather than created.
export function filledCards(cards: FirstExchangeCard[]): FirstExchangeCard[] {
  return cards
    .map(c => ({ title: c.title.trim(), body: c.body.trim() }))
    .filter(c => c.body.length > 0)
}
```

- [ ] **Step 4: Run the pure test**

Run: `pnpm vitest run lib/onboarding/__tests__/first-exchange.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing action test**

In `actions/__tests__/onboarding-first-exchange.test.ts`: add an `exchange_program_details` branch to the fake client (`upsert` recording into `inserted.details`), change every `completeFirstExchange(name, cards)` call to `completeFirstExchange(name, details, cards)`, delete the `'noCards'` case, and add:

```ts
  const details = {
    ...EMPTY_FIRST_EXCHANGE_DETAILS,
    destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
    sending_school_name: 'Lycée Georges Duby',
  }

  it('rejects a submission missing the destination', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, destination: '' }, [])
    expect(res).toEqual({ ok: false, error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing a travel date', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, travel_end: '' }, [])
    expect(res).toEqual({ ok: false, error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
  })

  it('writes exchange_program_details for the new exchange', async () => {
    await completeFirstExchange('Échange X', details, [])
    expect(inserted.details[0]).toMatchObject({
      exchange_id: 'ex-new', destination: 'le Minnesota, USA',
      travel_start: '2026-10-17', travel_end: '2026-11-02',
      sending_school_name: 'Lycée Georges Duby', chaperones: [], absence_dates: [],
    })
  })

  it('generates the Destination and Dates clés cards ahead of the free ones', async () => {
    await completeFirstExchange('Échange X', details, [{ title: 'Hébergement', body: 'En famille' }])
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Destination', body: 'le Minnesota, USA', position: 0 },
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.', position: 1 },
      { exchange_id: 'ex-new', title: 'Hébergement', body: 'En famille', position: 2 },
    ])
  })

  it('succeeds with no free-text cards at all', async () => {
    await expect(completeFirstExchange('Échange X', details, [])).resolves.toEqual({ ok: true })
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run actions/__tests__/onboarding-first-exchange.test.ts`
Expected: FAIL — `completeFirstExchange` takes two arguments.

- [ ] **Step 7: Rewrite `completeFirstExchange`**

In `actions/onboarding.ts`, replace the import block (lines 11-17) and the function (lines 36-107):

```ts
import {
  filledCards,
  generatedCards,
  detailsProblem,
  CARD_INVALID_MESSAGE,
  type FirstExchangeCard,
  type FirstExchangeDetails,
  type CompleteFirstExchangeResult,
} from '@/lib/onboarding/first-exchange'
```

```ts
// The forced onboarding step: create the school's first exchange together with
// its structured program details. Destination and the travel dates are
// required — they feed the fillable forms and generate the Destination and
// Dates clés Info cards, so students always land on a non-empty /infos page
// without the organizer typing anything twice. Mirrors createExchange's guards
// (name, plan cap, active-exchange cookie). Structured returns for expected
// outcomes.
export async function completeFirstExchange(
  name: string,
  details: FirstExchangeDetails,
  cards: FirstExchangeCard[],
): Promise<CompleteFirstExchangeResult> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const trimmedName = (name ?? '').trim()
  if (!trimmedName) return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }

  const problem = detailsProblem(details)
  if (problem) return { ok: false, error: 'invalid', message: problem }

  // Plan cap (trial = 1). At 0 exchanges this always passes; kept for parity
  // with createExchange so the rule lives in one shape.
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until')
    .eq('id', profile.school_id)
    .single()
  if (schoolError) throw schoolError

  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (school && !canCreateExchange(school, count ?? 0)) {
    return { ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE }
  }

  const validated: { title: string; body: string }[] = []
  for (const card of [...generatedCards(details), ...filledCards(cards)]) {
    const v = validateInfoCard(card)
    if (!v.ok) return { ok: false, error: 'invalid', message: CARD_INVALID_MESSAGE }
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

  const trim = (v: string) => v.trim() || null
  const { error: detailsError } = await supabase.from('exchange_program_details').upsert({
    exchange_id: created.id,
    destination: trim(details.destination),
    travel_start: details.travel_start,
    travel_end: details.travel_end,
    chaperones: details.chaperones.split('\n').map(s => s.trim()).filter(Boolean),
    association_name: trim(details.association_name),
    sending_school_name: trim(details.sending_school_name),
    receiving_school_name: trim(details.receiving_school_name),
    proviseur_name: trim(details.proviseur_name),
    sending_city: trim(details.sending_city),
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

  revalidatePath('/', 'layout')
  return { ok: true }
}
```

- [ ] **Step 8: Run the action test**

Run: `pnpm vitest run actions/__tests__/onboarding-first-exchange.test.ts`
Expected: PASS.

- [ ] **Step 9: Update the onboarding form**

In `app/onboarding/page.tsx`, pass the school name down. The file already computes `schoolName` for its `mustOnboard(schoolName, ownedCount)` check — add the one prop to the existing `<OnboardingForm … />` element, leaving its current `initialStep` expression exactly as written:

```tsx
  initialSchoolName={schoolName}
```

In `app/onboarding/OnboardingForm.tsx`:

- Change the import and signature:

```tsx
import {
  ONBOARDING_CARD_PROMPTS, EMPTY_FIRST_EXCHANGE_DETAILS,
  type FirstExchangeCard, type FirstExchangeDetails,
} from '@/lib/onboarding/first-exchange'

export function OnboardingForm({
  initialStep = 1, initialSchoolName = '',
}: { initialStep?: 1 | 2; initialSchoolName?: string }) {
```

- Make step 1's school name controlled so step 2 can pre-fill from it, and seed the details:

```tsx
  const [schoolName, setSchoolName] = useState(initialSchoolName)
  const [details, setDetails] = useState<FirstExchangeDetails>({
    ...EMPTY_FIRST_EXCHANGE_DETAILS,
    sending_school_name: initialSchoolName,
  })
```

- In `handleName`, carry the name into the details before advancing:

```tsx
      await completeOnboarding(new FormData(e.currentTarget))
      setDetails(prev => ({ ...prev, sending_school_name: prev.sending_school_name || schoolName.trim() }))
      setStep(2)
```

- Bind the step-1 input: `value={schoolName} onChange={e => setSchoolName(e.target.value)}`.
- In `handleExchange`, pass the details: `await completeFirstExchange(exchangeName, details, cards)`.
- Add a `setDetail` helper next to `setCard`:

```tsx
  function setDetail(key: keyof FirstExchangeDetails, value: string) {
    setDetails(prev => ({ ...prev, [key]: value }))
  }
```

- Replace step 2's card list with the structured block, keeping the free-text cards below it. Insert between the `Nom du programme` field and the `{cards.map(…)}` block:

```tsx
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="pd-destination" className="text-[13px] font-semibold text-[#42506E]">Destination</Label>
            <Input id="pd-destination" required value={details.destination}
              onChange={e => setDetail('destination', e.target.value)}
              placeholder="le Minnesota, USA"
              className="h-11 rounded-[10px] border-[#C4CDE0]" />
            <p className="m-0 text-[12px] text-[#8A97B1]">Telle qu’elle apparaîtra dans les formulaires.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pd-travel-start" className="text-[13px] font-semibold text-[#42506E]">Date de départ</Label>
            <Input id="pd-travel-start" type="date" required value={details.travel_start}
              onChange={e => setDetail('travel_start', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pd-travel-end" className="text-[13px] font-semibold text-[#42506E]">Date de retour</Label>
            <Input id="pd-travel-end" type="date" required value={details.travel_end}
              onChange={e => setDetail('travel_end', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
          </div>
        </div>

        <details className="rounded-[10px] border border-[#E1E7F0] p-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-[#42506E]">
            Informations complémentaires (facultatif)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-chaperones" className="text-[13px] font-semibold text-[#42506E]">Accompagnateurs</Label>
              <Textarea id="pd-chaperones" rows={2} value={details.chaperones}
                onChange={e => setDetail('chaperones', e.target.value)}
                placeholder="Un nom complet par ligne" className="rounded-[8px] border-[#C4CDE0] text-[14px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-association" className="text-[13px] font-semibold text-[#42506E]">Nom de l’association</Label>
              <Input id="pd-association" value={details.association_name}
                onChange={e => setDetail('association_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-sending-school" className="text-[13px] font-semibold text-[#42506E]">Lycée d’origine</Label>
              <Input id="pd-sending-school" value={details.sending_school_name}
                onChange={e => setDetail('sending_school_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-receiving-school" className="text-[13px] font-semibold text-[#42506E]">Établissement d’accueil</Label>
              <Input id="pd-receiving-school" value={details.receiving_school_name}
                onChange={e => setDetail('receiving_school_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-proviseur" className="text-[13px] font-semibold text-[#42506E]">Nom du proviseur</Label>
              <Input id="pd-proviseur" value={details.proviseur_name}
                onChange={e => setDetail('proviseur_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-sending-city" className="text-[13px] font-semibold text-[#42506E]">Ville du lycée</Label>
              <Input id="pd-sending-city" value={details.sending_city}
                onChange={e => setDetail('sending_city', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
          </div>
        </details>
```

- Replace the hint line under the free-text cards (line 132) — the « at least one » rule is gone because two cards are always generated:

```tsx
          <p className="m-0 text-[12.5px] text-[#8A97B1]">Ces informations sont facultatives — vos élèves les verront dans l’onglet Infos.</p>
```

- [ ] **Step 10: Run the onboarding tests**

Run: `pnpm vitest run lib/onboarding actions/__tests__/onboarding-first-exchange.test.ts app/__tests__/onboarding-page.test.ts && npx tsc --noEmit`
Expected: PASS, clean. Fix any surviving reference to `NO_CARDS_MESSAGE` or `'noCards'` that the greps below turn up:

```bash
grep -rn "NO_CARDS_MESSAGE\|noCards" --include=*.ts --include=*.tsx . | grep -v node_modules
```

- [ ] **Step 11: Commit**

```bash
git add lib/onboarding actions/onboarding.ts app/onboarding
git commit -m "feat(onboarding): collect structured program details and generate the first two Info cards"
```

---

### Task 10: Migration — activate every existing draft that already passes its gates

**Files:**
- Create: `supabase/migrations/20260721000001_activate_ready_drafts.sql`

**Interfaces:**
- Consumes: nothing (data-only).
- Produces: no schema change — no new table, policy or bucket, so `tests/rls/matrix.test.ts` needs no new cases.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260721000001_activate_ready_drafts.sql`:

```sql
-- Instant activation (docs/superpowers/specs/2026-07-21-instant-activation-design.md):
-- setting a deadline is now the act of publishing, and the « Activer » button
-- is gone. Every existing draft that would already have passed the old gate is
-- activated here so no template is stranded with no way to publish it.
--
-- Fillable drafts are deliberately excluded rather than join-checked against
-- ten nullable detail columns: production holds only test data, and any
-- fillable that stays draft can simply be deleted and re-added from the UI.
update form_templates set status = 'active'
where status = 'draft' and deadline is not null
  and kind <> 'fillable'
  and (kind <> 'pdf' or template_file_path is not null)
  and (kind <> 'online' or exists (
        select 1 from form_fields where template_id = form_templates.id));
```

- [ ] **Step 2: Apply to staging first**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```
Expected: the new migration applies; no error.

- [ ] **Step 3: Apply to production via MCP**

Use the Supabase MCP `apply_migration` tool with `name` = `activate_ready_drafts` and the SQL above. Then call MCP `list_migrations`: if the ledger stamped a version other than `20260721000001`, `git mv` the local file to the stamped version.

- [ ] **Step 4: Verify no ready drafts remain**

Run this via MCP `execute_sql` against prod:

```sql
select count(*) from form_templates
where status = 'draft' and deadline is not null and kind <> 'fillable'
  and (kind <> 'pdf' or template_file_path is not null)
  and (kind <> 'online' or exists (select 1 from form_fields where template_id = form_templates.id));
```
Expected: `0`.

- [ ] **Step 5: Run the RLS matrix**

Run: `pnpm test:rls`
Expected: PASS (unchanged count — the migration touches no policy).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): activate existing drafts that already pass their gates"
```

---

### Task 11: Full gate + manual smoke

**Files:** none — verification only.

- [ ] **Step 1: Run the full verification gate**

```bash
pnpm lint && pnpm test && pnpm build
```
Expected: all three green. `pnpm test` sweeps sibling worktrees under `.claude/worktrees/*` — if unrelated failures appear from there, re-run scoped: `pnpm vitest run --exclude '**/.claude/**'`.

- [ ] **Step 2: Confirm nothing stale remains**

```bash
grep -rn "activateTemplate\b\|activationHints\|Avant d’activer" --include=*.ts --include=*.tsx . | grep -v node_modules
grep -rn "AST.pdf" --include=*.ts --include=*.tsx --include=*.md . | grep -v node_modules
```
Expected: no hits for the first (only `activateTemplateRecord`, which the `\b` excludes); the second should only hit this plan and the spec.

- [ ] **Step 3: Manual smoke on a preview deployment**

Push the branch, open the Vercel preview (it hits **staging**; log in as `demo-organizer@example.com`), and walk:

1. A fresh organizer through `/onboarding` → step 2 rejects a missing destination, accepts destination + both dates, and `/infos` shows the generated **Destination** and **Dates clés** cards.
2. `/forms` → « + Ajouter » → **Passeport de l'élève**: the row expands in place, asks only for a deadline, and the card lands with the **Actif** pill.
3. « + Ajouter » → **AST**: lands active with a downloadable PDF (drawer → Télécharger opens the CERFA).
4. « + Ajouter » → **Demande d'absence** on a second exchange with no details: the expansion asks for its blanks, and Réglages → Programme afterwards shows those values saved.
5. Custom tile → **Créer un formulaire en ligne**: name + deadline → lands directly on `/forms/<id>`; saving the first question flips the pill to **Actif** without any button.
6. Custom tile → **Demander un document** → « Selon la situation »: pick one student → the doc lands active with exactly that student in its tracking list.
7. Confirm no drawer anywhere shows « Activer » or « Avant d'activer ».

- [ ] **Step 4: Report**

Report the gate output and any smoke-step deviation verbatim. Do not open the PR until every step above has actually been run.

---

## Merge-time steps (for Bjorn)

- Migration `20260721000001_activate_ready_drafts` is applied to staging and prod **during Task 10**, before merge — nothing to run at merge time.
- Merge with a **merge commit**.
