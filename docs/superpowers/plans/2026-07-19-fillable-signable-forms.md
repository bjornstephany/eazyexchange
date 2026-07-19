# Fillable, Signable Standard Forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 4 standard forms (décharge, absence, engagement, medical) as product-maintained fillable + e-signable templates (`kind: 'fillable'`), with per-exchange program details (chaperones, dates, destination, schools, proviseur…) as organizer-editable variables, and a generated signed PDF per submission.

**Architecture:** Code-defined document definitions (`lib/forms/fillable/`) render both the student web form and the signed PDF. A new 1:1 table `exchange_program_details` holds the shared variables (edited in Settings → Programme). Submissions store `fillable_data` jsonb + `generated_pdf_path` in the existing `documents` bucket; the existing submit → review → approve pipeline is unchanged.

**Tech Stack:** Next.js 15 App Router + Server Actions, Supabase (RLS), `@react-pdf/renderer` (new dep) for PDF generation, vitest, next-intl (organizer portal only).

**Spec:** `docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md` — read it first.

## Global Constraints

- Work on branch `feature/fillable-forms` in an isolated worktree (superpowers:using-git-worktrees). Never push to `main`; autonomy stops at the PR.
- Package manager is **pnpm**. Verify gates: `pnpm lint`, `pnpm test`, `pnpm build` (if `.env.local` placeholders break build, `npx tsc --noEmit` is the type gate), and `pnpm test:rls` (migration + new table ⇒ mandatory).
- **Migration goes to STAGING only during this build** (`.env.staging`, never committed). Prod apply (MCP `apply_migration`) is a merge-time step listed in the PR body — do NOT touch prod.
- `types/supabase.ts` is GENERATED — regenerate from the staging DB after the migration (command in Task 1), never hand-edit. `types/db.ts` narrows it.
- Expected outcomes are **structured returns** (`{ ok: false, message }`), never throws — prod redacts thrown messages. Auth preambles via `lib/auth/require.ts` (`'Unauthenticated'`/`'Unauthorized'` strings are load-bearing).
- **Never log student/parent PII** (names, answers, signature names) — error paths report ids only.
- French copy uses typographic apostrophes (’) inside single-quoted TS strings (no `\'` escapes) and « » guillemets — this repo's convention. Student-facing copy is hardcoded French (tutoiement), organizer-facing copy goes through next-intl (all 5 locales: en/fr/es/it/de).
- No new `lib/supabase/admin` imports — everything runs under the caller's RLS session.
- Commit after each green task (`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

---

### Task 1: Migration + generated types + `types/db.ts` narrowing

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_fillable_forms.sql` (use `date +%Y%m%d%H%M%S` at execution time)
- Overwrite (generated): `types/supabase.ts`
- Modify: `types/db.ts`

**Interfaces:**
- Produces table `exchange_program_details` (columns below), `submissions.fillable_data jsonb` + `submissions.generated_pdf_path text`, and relaxed `form_templates` constraints admitting `kind='fillable'` with `type='data_entry'`.
- Produces types consumed everywhere later: `TemplateKind` (now includes `'fillable'`), `FillableSignature`, `FillableData`, `ExchangeProgramDetails`, narrowed `Submission`.

- [ ] **Step 1: Write the migration**

```sql
-- Fillable, signable standard forms
-- (spec: docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md)
-- 1) exchange_program_details: shared per-exchange variables consumed by the
--    code-defined fillable templates (lib/forms/fillable/).
-- 2) submissions: e-signed payload + generated-PDF path.
-- 3) form_templates: admit the new kind 'fillable' (collects structured data).

create table exchange_program_details (
  exchange_id uuid primary key references exchanges(id) on delete cascade,
  destination text,
  travel_start date,
  travel_end date,
  chaperones text[] not null default '{}',
  association_name text,
  sending_school_name text,
  receiving_school_name text,
  proviseur_name text,
  sending_city text,
  absence_dates text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table exchange_program_details enable row level security;

-- Organizers of either participating school manage the row (the details
-- describe the shared trip). Same scoping helper as exchange_enrollments.
create policy "organizers manage program details" on exchange_program_details
  for all
  using (my_role() = 'organizer' and exchange_in_my_school(exchange_id))
  with check (my_role() = 'organizer' and exchange_in_my_school(exchange_id));

-- Enrolled students read the values (their fillable forms render them).
create policy "students read enrolled program details" on exchange_program_details
  for select
  using (exists (
    select 1 from exchange_enrollments en
    where en.exchange_id = exchange_program_details.exchange_id
      and en.user_id = (select auth.uid())
  ));

-- E-signed fillable submissions: answers + signatures JSON, generated PDF path
-- (documents bucket, key <assignment_id>/fillable/<submission_id>.pdf so the
-- existing assignment-scoped storage policies apply unchanged).
alter table submissions
  add column fillable_data jsonb,
  add column generated_pdf_path text;

-- Admit the new kind. Fillable templates collect structured data (data_entry)
-- but have neither form_fields nor document_slots — structure lives in code.
alter table form_templates
  drop constraint form_templates_kind_check,
  add constraint form_templates_kind_check
    check (kind in ('online', 'pdf', 'doc', 'fillable')),
  drop constraint form_templates_kind_type_coherent,
  add constraint form_templates_kind_type_coherent check (
    (kind in ('online', 'fillable') and type = 'data_entry')
    or (kind in ('pdf', 'doc') and type = 'document_upload')
  );
```

(No explicit grants needed: `20260708000001_baseline_client_grants.sql` set default privileges for new tables; RLS is the boundary.)

- [ ] **Step 2: Apply to STAGING**

```bash
set -a; source .env.staging; set +a
npx supabase db push --db-url "$STAGING_DB_URL"
```
Expected: the new migration applies cleanly. WSL2 gotcha: if the host hangs/IPv6-fails, resolve IPv4 with `getent ahostsv4 <host>` and substitute the IP in the URL (see memory `reference_wsl2_supabase_db_push_ipv6`).

- [ ] **Step 3: Regenerate `types/supabase.ts` from staging**

```bash
npx supabase gen types typescript --db-url "$STAGING_DB_URL" --schema public > types/supabase.ts
git diff --stat types/supabase.ts   # sanity: additions only, no unrelated drift
```
Expected: `exchange_program_details` Row/Insert/Update appear; `submissions` gains `fillable_data: Json | null` and `generated_pdf_path: string | null`. If unrelated drift appears (tables missing on staging vs prod), STOP and report — do not commit a types file that loses existing tables.

- [ ] **Step 4: Narrow in `types/db.ts`**

In `types/db.ts` change the `TemplateKind` line:

```ts
export type TemplateKind = 'online' | 'pdf' | 'doc' | 'fillable'
```

Add after the `SubmissionStatus` line:

```ts
// One e-signature inside a fillable submission. signed_at is null while the
// submission is a draft; the submit action stamps it server-side (UTC ISO).
export type FillableSignature = {
  key: string
  role_label: string
  full_name: string
  signed_at: string | null
}
export type FillableData = {
  answers: Record<string, string>
  signatures: FillableSignature[]
}
```

Replace the existing `Submission` alias (`export type Submission = Override<...>`) with the Omit pattern (same precedent as `Application` — jsonb columns don't satisfy `Narrow extends Partial<Row>`):

```ts
export type Submission = Omit<Tables<'submissions'>, 'status' | 'fillable_data'> & {
  status: SubmissionStatus
  fillable_data: FillableData | null
}
```

Add with the other simple aliases (near `export type Exchange`):

```ts
export type ExchangeProgramDetails = Tables<'exchange_program_details'>
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
```
Expected: clean (the `submissions` OverrideRow in the `Database` type already re-points Row at the new alias).

```bash
git add supabase/migrations/*_fillable_forms.sql types/supabase.ts types/db.ts
git commit -m "feat(fillable): exchange_program_details + submissions e-sign columns + kind 'fillable'"
```

---

### Task 2: Fillable core — block types + pure render/validation helpers (TDD)

**Files:**
- Create: `lib/forms/fillable/types.ts`
- Create: `lib/forms/fillable/render.ts`
- Test: `lib/forms/fillable/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `FillableData` from `types/db.ts` (Task 1), `MAX_ANSWER_LENGTH` from `lib/validation`.
- Produces (used by Tasks 3–10): all types below, plus
  `joinNames(names: string[], conj: string): string`,
  `travelPeriodFr(start: string, end: string): string`,
  `travelPeriodEn(start: string, end: string): string`,
  `resolveVariables(input: { exchangeName: string; details: ProgramDetailsValues | null; now?: Date }): ResolvedVariables`,
  `missingDetailLabels(def: FillableDefinition, details: ProgramDetailsValues | null): string[]`,
  `validateFillable(def: FillableDefinition, input: FillableInput): { ok: true } | { ok: false; message: string }`,
  `signatureBlocks(def: FillableDefinition): { key: string; roleLabel: string; required: boolean; prefill?: 'student_name' }[]`.

- [ ] **Step 1: Write `lib/forms/fillable/types.ts`** (types only — no test cycle of its own)

```ts
// Code-defined fillable documents: fixed French legal text with variable
// tokens (resolved from exchange_program_details + the exchange name), input
// blanks, and e-signature blocks. One definition renders both the student web
// form (components/FillableForm.tsx) and the signed PDF (lib/pdf/fillable-pdf.tsx).

export type ProgramVariable =
  | 'exchange_name' | 'today'
  | 'destination' | 'travel_period' | 'travel_period_en'
  | 'chaperones_et' | 'chaperones_ou' | 'chaperones_or_en'
  | 'association_name' | 'sending_school_name' | 'receiving_school_name'
  | 'proviseur_name' | 'sending_city' | 'absence_dates'

// Plain shape of an exchange_program_details row (structurally satisfied by
// the generated Row type — kept separate so the pure helpers stay DB-free).
export type ProgramDetailsValues = {
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
}

export type Run =
  | { t: 'text'; text: string }
  | { t: 'var'; name: ProgramVariable }
  | { t: 'blank'; key: string; label: string; required?: boolean; prefill?: 'student_name' }

export type Block =
  | { b: 'heading'; runs: Run[]; level?: 1 | 2 }
  | { b: 'paragraph'; runs: Run[]; style?: 'normal' | 'bold' | 'italic' }
  | { b: 'field'; key: string; label: string; input: 'text' | 'textarea' | 'phone'; required: boolean; prefix?: string }
  | { b: 'radio'; key: string; label: string; options: string[]; required: boolean }
  | { b: 'check'; key: string; runs: Run[]; required: boolean }
  | { b: 'signature'; key: string; roleLabel: string; required: boolean; prefill?: 'student_name' }
  | { b: 'divider' }

// « at least one of these keys must be provided » — a key counts as provided
// when it is a completed signature or a non-empty answer.
export type RequireOneOf = { keys: string[]; message: string }

export type FillableDefinition = {
  key: string // = form_templates.standard_key
  title: string
  variables: ProgramVariable[]
  blocks: Block[]
  requireOneOf?: RequireOneOf[]
}

// Which detail columns a variable needs before a template can activate.
// exchange_name/today derive from the exchange row / the clock — never missing.
export const VARIABLE_REQUIREMENTS: Record<ProgramVariable, (keyof ProgramDetailsValues)[]> = {
  exchange_name: [], today: [],
  destination: ['destination'],
  travel_period: ['travel_start', 'travel_end'],
  travel_period_en: ['travel_start', 'travel_end'],
  chaperones_et: ['chaperones'], chaperones_ou: ['chaperones'], chaperones_or_en: ['chaperones'],
  association_name: ['association_name'],
  sending_school_name: ['sending_school_name'],
  receiving_school_name: ['receiving_school_name'],
  proviseur_name: ['proviseur_name'],
  sending_city: ['sending_city'],
  absence_dates: ['absence_dates'],
}

// French labels for missing-detail messages (activation gate + hints). NOT
// localized — same convention as the MSG_* activation messages.
export const DETAIL_LABELS: Record<keyof ProgramDetailsValues, string> = {
  destination: 'Destination',
  travel_start: 'Date de départ',
  travel_end: 'Date de retour',
  chaperones: 'Accompagnateurs',
  association_name: 'Nom de l’association',
  sending_school_name: 'Lycée d’origine',
  receiving_school_name: 'Établissement d’accueil',
  proviseur_name: 'Nom du proviseur',
  sending_city: 'Ville du lycée',
  absence_dates: 'Jours d’absence',
}

// What the client sends; the server stamps signed_at (never trusted from client).
export type SignatureInput = { key: string; full_name: string; approved: boolean }
export type FillableInput = { answers: Record<string, string>; signatures: SignatureInput[] }
```

- [ ] **Step 2: Write the failing tests** (`lib/forms/fillable/__tests__/render.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import {
  joinNames, travelPeriodFr, travelPeriodEn, resolveVariables,
  missingDetailLabels, validateFillable, signatureBlocks,
} from '../render'
import type { FillableDefinition, ProgramDetailsValues } from '../types'

const details: ProgramDetailsValues = {
  destination: 'le Minnesota, USA',
  travel_start: '2025-10-17', travel_end: '2025-11-02',
  chaperones: ['Polly STEPHANY', 'Susan ALABASTER-DARY', 'Chantal KERLOCH'],
  association_name: 'AGESSIA',
  sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School',
  proviseur_name: 'Mme Sharon MIRON HUGHES',
  sending_city: 'Luynes',
  absence_dates: ['le jeudi 19 octobre 2025', 'le vendredi 20 octobre 2025'],
}

const def: FillableDefinition = {
  key: 'test', title: 'Test',
  variables: ['destination', 'travel_period', 'chaperones_et'],
  blocks: [
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nous ' },
      { t: 'blank', key: 'parent1', label: 'Parent 1' },
      { t: 'blank', key: 'parent2', label: 'Parent 2', required: false },
    ] },
    { b: 'radio', key: 'regime', label: 'Régime', options: ['externe', 'interne'], required: true },
    { b: 'check', key: 'accept', runs: [{ t: 'text', text: 'OK' }], required: true },
    { b: 'signature', key: 'sig_p1', roleLabel: 'Représentant légal 1', required: true },
    { b: 'signature', key: 'sig_p2', roleLabel: 'Représentant légal 2', required: false },
  ],
  requireOneOf: [{ keys: ['sig_p1', 'sig_p2'], message: 'Au moins un parent doit signer.' }],
}

describe('joinNames', () => {
  it('joins with the conjunction before the last name', () => {
    expect(joinNames(['A', 'B', 'C'], 'et')).toBe('A, B et C')
    expect(joinNames(['A', 'B'], 'ou')).toBe('A ou B')
    expect(joinNames(['A'], 'et')).toBe('A')
    expect(joinNames([' ', 'A'], 'et')).toBe('A')
  })
})

describe('travel periods', () => {
  it('formats French same-year period without repeating the year', () => {
    expect(travelPeriodFr('2025-10-17', '2025-11-02')).toBe('du 17 octobre au 2 novembre 2025')
  })
  it('keeps both years across a year boundary', () => {
    expect(travelPeriodFr('2025-12-20', '2026-01-05')).toBe('du 20 décembre 2025 au 5 janvier 2026')
  })
  it('formats the English period', () => {
    expect(travelPeriodEn('2025-10-17', '2025-11-02')).toBe('from October 17, 2025 through November 2, 2025')
  })
})

describe('resolveVariables', () => {
  it('resolves every variable from full details', () => {
    const v = resolveVariables({ exchangeName: 'France-Minnesota 2025', details })
    expect(v.exchange_name).toBe('France-Minnesota 2025')
    expect(v.chaperones_et).toBe('Polly STEPHANY, Susan ALABASTER-DARY et Chantal KERLOCH')
    expect(v.chaperones_ou).toBe('Polly STEPHANY, Susan ALABASTER-DARY ou Chantal KERLOCH')
    expect(v.chaperones_or_en).toBe('Polly STEPHANY, Susan ALABASTER-DARY or Chantal KERLOCH')
    expect(v.travel_period).toBe('du 17 octobre au 2 novembre 2025')
    expect(v.absence_dates).toBe('le jeudi 19 octobre 2025 et le vendredi 20 octobre 2025')
    expect(v.proviseur_name).toBe('Mme Sharon MIRON HUGHES')
  })
  it('always resolves exchange_name and today, even with null details', () => {
    const v = resolveVariables({ exchangeName: 'X', details: null, now: new Date('2026-07-19T10:00:00Z') })
    expect(v.exchange_name).toBe('X')
    expect(v.today).toBe('19 juillet 2026')
    expect(v.destination).toBeUndefined()
  })
})

describe('missingDetailLabels', () => {
  it('is empty when everything the definition needs is present', () => {
    expect(missingDetailLabels(def, details)).toEqual([])
  })
  it('lists each missing column label once', () => {
    const partial = { ...details, destination: '  ', travel_start: null, chaperones: [] }
    expect(missingDetailLabels(def, partial)).toEqual(['Destination', 'Date de départ', 'Accompagnateurs'])
  })
  it('treats null details as all-missing', () => {
    expect(missingDetailLabels(def, null)).toEqual(['Destination', 'Date de départ', 'Date de retour', 'Accompagnateurs'])
  })
})

const goodInput = {
  answers: { parent1: 'Jean Dupont', regime: 'externe', accept: 'true' },
  signatures: [{ key: 'sig_p1', full_name: 'Jean Dupont', approved: true }],
}

describe('validateFillable', () => {
  it('accepts a complete input', () => {
    expect(validateFillable(def, goodInput)).toEqual({ ok: true })
  })
  it('rejects a missing required blank', () => {
    const r = validateFillable(def, { ...goodInput, answers: { ...goodInput.answers, parent1: ' ' } })
    expect(r.ok).toBe(false)
  })
  it('accepts an empty optional blank', () => {
    expect(validateFillable(def, goodInput)).toEqual({ ok: true }) // parent2 absent
  })
  it('rejects an unchecked required check', () => {
    const r = validateFillable(def, { ...goodInput, answers: { ...goodInput.answers, accept: 'false' } })
    expect(r.ok).toBe(false)
  })
  it('rejects a required signature without approval', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [{ key: 'sig_p1', full_name: 'Jean', approved: false }] })
    expect(r.ok).toBe(false)
  })
  it('rejects a partially-filled optional signature (name without approval)', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [...goodInput.signatures, { key: 'sig_p2', full_name: 'Marie', approved: false }] })
    expect(r.ok).toBe(false)
  })
  it('accepts a fully-empty optional signature', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [...goodInput.signatures, { key: 'sig_p2', full_name: '', approved: false }] })
    expect(r).toEqual({ ok: true })
  })
  it('enforces requireOneOf', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('Au moins un parent')
  })
  it('rejects overlong answers', () => {
    const r = validateFillable(def, { ...goodInput, answers: { ...goodInput.answers, parent1: 'x'.repeat(6000) } })
    expect(r.ok).toBe(false)
  })
  it('rejects an unknown signature key', () => {
    const r = validateFillable(def, { ...goodInput, signatures: [...goodInput.signatures, { key: 'nope', full_name: 'X', approved: true }] })
    expect(r.ok).toBe(false)
  })
})

describe('signatureBlocks', () => {
  it('extracts signature blocks in order', () => {
    expect(signatureBlocks(def).map(s => s.key)).toEqual(['sig_p1', 'sig_p2'])
  })
})
```

- [ ] **Step 3: Run to verify failure**

```bash
pnpm vitest run lib/forms/fillable/__tests__/render.test.ts
```
Expected: FAIL — `../render` does not exist.

- [ ] **Step 4: Implement `lib/forms/fillable/render.ts`**

```ts
// Pure substitution + validation for fillable definitions. No React, no
// Supabase — mirrors the lib/forms/rollup.ts testing pattern.
import type {
  FillableDefinition, ProgramDetailsValues, ProgramVariable, FillableInput,
} from './types'
import { VARIABLE_REQUIREMENTS, DETAIL_LABELS } from './types'
import { MAX_ANSWER_LENGTH } from '@/lib/validation'

const FR_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const FR_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
const EN_DATE = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

// 'YYYY-MM-DD' → Date pinned to noon UTC so Paris formatting never shifts a day.
function parseDate(d: string): Date {
  return new Date(`${d}T12:00:00Z`)
}

export function joinNames(names: string[], conj: string): string {
  const clean = names.map(n => n.trim()).filter(Boolean)
  if (clean.length <= 1) return clean.join('')
  return `${clean.slice(0, -1).join(', ')} ${conj} ${clean[clean.length - 1]}`
}

export function travelPeriodFr(start: string, end: string): string {
  const s = parseDate(start)
  const e = parseDate(end)
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  return `du ${sameYear ? FR_DAY_MONTH.format(s) : FR_DATE.format(s)} au ${FR_DATE.format(e)}`
}

export function travelPeriodEn(start: string, end: string): string {
  return `from ${EN_DATE.format(parseDate(start))} through ${EN_DATE.format(parseDate(end))}`
}

export type ResolvedVariables = Partial<Record<ProgramVariable, string>>

export function resolveVariables(input: {
  exchangeName: string
  details: ProgramDetailsValues | null
  now?: Date
}): ResolvedVariables {
  const out: ResolvedVariables = {
    exchange_name: input.exchangeName,
    today: FR_DATE.format(input.now ?? new Date()),
  }
  const d = input.details
  if (!d) return out
  if (d.destination?.trim()) out.destination = d.destination.trim()
  if (d.travel_start && d.travel_end) {
    out.travel_period = travelPeriodFr(d.travel_start, d.travel_end)
    out.travel_period_en = travelPeriodEn(d.travel_start, d.travel_end)
  }
  const chap = d.chaperones.map(c => c.trim()).filter(Boolean)
  if (chap.length > 0) {
    out.chaperones_et = joinNames(chap, 'et')
    out.chaperones_ou = joinNames(chap, 'ou')
    out.chaperones_or_en = joinNames(chap, 'or')
  }
  for (const k of ['association_name', 'sending_school_name', 'receiving_school_name', 'proviseur_name', 'sending_city'] as const) {
    const v = d[k]
    if (v?.trim()) out[k] = v.trim()
  }
  const days = d.absence_dates.map(x => x.trim()).filter(Boolean)
  if (days.length > 0) out.absence_dates = joinNames(days, 'et')
  return out
}

export function missingDetailLabels(
  def: FillableDefinition,
  details: ProgramDetailsValues | null,
): string[] {
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
  return [...missing].map(c => DETAIL_LABELS[c])
}

type SigBlock = { key: string; roleLabel: string; required: boolean; prefill?: 'student_name' }

export function signatureBlocks(def: FillableDefinition): SigBlock[] {
  const out: SigBlock[] = []
  for (const b of def.blocks) {
    if (b.b === 'signature') out.push({ key: b.key, roleLabel: b.roleLabel, required: b.required, prefill: b.prefill })
  }
  return out
}

// Every answerable key with its requiredness and kind ('check' needs 'true').
function answerKeys(def: FillableDefinition): { key: string; required: boolean; isCheck: boolean }[] {
  const out: { key: string; required: boolean; isCheck: boolean }[] = []
  for (const b of def.blocks) {
    if (b.b === 'heading' || b.b === 'paragraph') {
      for (const r of b.runs) {
        if (r.t === 'blank') out.push({ key: r.key, required: r.required !== false, isCheck: false })
      }
    } else if (b.b === 'field' || b.b === 'radio') {
      out.push({ key: b.key, required: b.required, isCheck: false })
    } else if (b.b === 'check') {
      out.push({ key: b.key, required: b.required, isCheck: true })
    }
  }
  return out
}

const MSG_INCOMPLETE = 'Complétez tous les champs obligatoires avant d’envoyer.'
const MSG_SIGNATURES = 'Chaque signature doit comporter le nom complet et la case « Lu et approuvé » cochée.'
const MSG_TOO_LONG = `Une réponse dépasse la limite de ${MAX_ANSWER_LENGTH} caractères.`
const MSG_UNKNOWN = 'Données de formulaire invalides.'

export function validateFillable(
  def: FillableDefinition,
  input: FillableInput,
): { ok: true } | { ok: false; message: string } {
  const keys = answerKeys(def)
  const known = new Set(keys.map(k => k.key))
  for (const k of Object.keys(input.answers)) {
    if (!known.has(k)) return { ok: false, message: MSG_UNKNOWN }
  }
  for (const v of Object.values(input.answers)) {
    if (String(v ?? '').length > MAX_ANSWER_LENGTH) return { ok: false, message: MSG_TOO_LONG }
  }
  for (const k of keys) {
    const v = (input.answers[k.key] ?? '').trim()
    if (k.required && (k.isCheck ? v !== 'true' : v === '')) {
      return { ok: false, message: MSG_INCOMPLETE }
    }
  }

  const sigDefs = signatureBlocks(def)
  const sigKeys = new Set(sigDefs.map(s => s.key))
  const byKey = new Map(input.signatures.map(s => [s.key, s]))
  if (input.signatures.length !== byKey.size) return { ok: false, message: MSG_UNKNOWN }
  for (const s of input.signatures) {
    if (!sigKeys.has(s.key)) return { ok: false, message: MSG_UNKNOWN }
    if (String(s.full_name ?? '').length > MAX_ANSWER_LENGTH) return { ok: false, message: MSG_TOO_LONG }
  }
  const complete = (key: string) => {
    const s = byKey.get(key)
    return !!s && s.full_name.trim() !== '' && s.approved === true
  }
  const untouched = (key: string) => {
    const s = byKey.get(key)
    return !s || (s.full_name.trim() === '' && s.approved !== true)
  }
  for (const sd of sigDefs) {
    if (sd.required && !complete(sd.key)) return { ok: false, message: MSG_SIGNATURES }
    if (!sd.required && !complete(sd.key) && !untouched(sd.key)) {
      return { ok: false, message: MSG_SIGNATURES }
    }
  }

  for (const rule of def.requireOneOf ?? []) {
    const satisfied = rule.keys.some(k =>
      complete(k) || (input.answers[k] ?? '').trim() !== '')
    if (!satisfied) return { ok: false, message: rule.message }
  }
  return { ok: true }
}
```

- [ ] **Step 5: Run to verify pass**

```bash
pnpm vitest run lib/forms/fillable/__tests__/render.test.ts
```
Expected: PASS (all tests). If the `today` assertion fails on formatting, check the Node ICU locale output (`19 juillet 2026`) and fix the test's expected string to match `Intl` output exactly — never reimplement formatting by hand.

- [ ] **Step 6: Commit**

```bash
git add lib/forms/fillable/types.ts lib/forms/fillable/render.ts lib/forms/fillable/__tests__/render.test.ts
git commit -m "feat(fillable): block model + pure substitution/validation helpers"
```

---

### Task 3: The four form definitions + registry + invariant tests

**Files:**
- Create: `lib/forms/fillable/decharge.ts`, `lib/forms/fillable/absence.ts`, `lib/forms/fillable/engagement.ts`, `lib/forms/fillable/medical.ts`
- Create: `lib/forms/fillable/index.ts`
- Test: `lib/forms/fillable/__tests__/definitions.test.ts`

**Interfaces:**
- Consumes: types from Task 2.
- Produces: `FILLABLE_DEFINITIONS: Record<string, FillableDefinition>` keyed by `standard_key` (`decharge`, `absence`, `famille`, `medical`) — consumed by the activation gate, student page, PDF, review page.

**Content-fidelity notes (from the spec, applied below):** text transcribed from `docs/exampleSchoolFiles/*.pdf` with typographic apostrophes; paper-only instructions neutralized (« bureau 307 » dropped); gendered « accompagnatrices » → neutral « accompagnateurs »; destination always used preposition-free (parenthetical or « Destination : … ») so any destination works; the medical form stays bilingual; the engagement's duplicated « L’élève : » paragraph (copy artifact in the original) and the AGESSIA logo are dropped; « courant juin » (schedule-specific) dropped.

- [ ] **Step 1: Write the invariant tests** (`lib/forms/fillable/__tests__/definitions.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { FILLABLE_DEFINITIONS } from '../index'
import type { Block, ProgramVariable, Run } from '../types'

const defs = Object.values(FILLABLE_DEFINITIONS)

function usedVariables(blocks: Block[]): Set<ProgramVariable> {
  const used = new Set<ProgramVariable>()
  const scanRuns = (runs: Run[]) => runs.forEach(r => { if (r.t === 'var') used.add(r.name) })
  for (const b of blocks) {
    if (b.b === 'heading' || b.b === 'paragraph' || b.b === 'check') scanRuns(b.runs)
  }
  return used
}

function allKeys(blocks: Block[]): string[] {
  const keys: string[] = []
  for (const b of blocks) {
    if (b.b === 'heading' || b.b === 'paragraph') {
      b.runs.forEach(r => { if (r.t === 'blank') keys.push(r.key) })
    } else if (b.b === 'field' || b.b === 'radio' || b.b === 'check' || b.b === 'signature') {
      keys.push(b.key)
    }
  }
  return keys
}

describe('fillable definitions', () => {
  it('registry has exactly the four standard keys', () => {
    expect(Object.keys(FILLABLE_DEFINITIONS).sort()).toEqual(['absence', 'decharge', 'famille', 'medical'])
  })

  it.each(defs.map(d => [d.key, d] as const))('%s: keys are unique', (_k, def) => {
    const keys = allKeys(def.blocks)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(defs.map(d => [d.key, d] as const))('%s: declared variables match used variables', (_k, def) => {
    const used = usedVariables(def.blocks)
    expect([...used].sort()).toEqual([...def.variables].sort())
  })

  it.each(defs.map(d => [d.key, d] as const))('%s: requireOneOf keys exist', (_k, def) => {
    const keys = new Set(allKeys(def.blocks))
    for (const rule of def.requireOneOf ?? []) {
      for (const key of rule.keys) expect(keys.has(key)).toBe(true)
    }
  })

  it('every definition has at least one required signature path', () => {
    for (const def of defs) {
      const sigs = def.blocks.filter(b => b.b === 'signature')
      expect(sigs.length).toBeGreaterThan(0)
    }
  })

  it('no straight apostrophes in French text (typographic ’ only)', () => {
    const scan = (runs: Run[]) => runs.forEach(r => {
      if (r.t === 'text') expect(r.text).not.toMatch(/'/)
    })
    for (const def of defs) {
      for (const b of def.blocks) {
        if (b.b === 'heading' || b.b === 'paragraph' || b.b === 'check') scan(b.runs)
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm vitest run lib/forms/fillable/__tests__/definitions.test.ts
```
Expected: FAIL — `../index` does not exist.

- [ ] **Step 3: Write `lib/forms/fillable/decharge.ts`**

```ts
// Décharge de responsabilité + code de conduite de l’élève.
// Source: docs/exampleSchoolFiles/Decharge de Responsabilite.pdf
import type { FillableDefinition } from './types'

export const decharge: FillableDefinition = {
  key: 'decharge',
  title: 'Décharge de responsabilité / code de conduite',
  variables: [
    'exchange_name', 'association_name', 'destination',
    'chaperones_et', 'chaperones_ou', 'travel_period', 'receiving_school_name',
  ],
  requireOneOf: [],
  blocks: [
    { b: 'heading', level: 2, runs: [{ t: 'text', text: 'ÉCHANGE : ' }, { t: 'var', name: 'exchange_name' }] },
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'DÉCHARGE DE RESPONSABILITÉ' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nous, soussignés ' },
      { t: 'blank', key: 'parent1_name', label: 'Nom du représentant légal 1' },
      { t: 'text', text: ' et ' },
      { t: 'blank', key: 'parent2_name', label: 'Nom du représentant légal 2 (facultatif)', required: false },
      { t: 'text', text: ', parents (ou responsables légaux) de ' },
      { t: 'blank', key: 'student_name', label: 'Nom de l’élève', prefill: 'student_name' },
      { t: 'text', text: ', reconnaissons que l’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' est simple facilitatrice de l’échange culturel et linguistique entre familles auquel nous autorisons notre enfant à participer. Destination : ' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Par conséquent nous certifions décharger de toute responsabilité l’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' et ses membres ainsi que les accompagnateurs, ' },
      { t: 'var', name: 'chaperones_et' },
      { t: 'text', text: ', en cas d’accident, de vol de quelque nature que ce soit ou autre dommage causé par le mineur ci-dessus mentionné, ou par autrui à son encontre, pendant toute la durée du voyage, soit ' },
      { t: 'var', name: 'travel_period' },
      { t: 'text', text: '. Conscients des responsabilités que la participation à ce voyage implique, nous renonçons à tout recours contre l’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ', contre les membres de son bureau ou contre ' },
      { t: 'var', name: 'chaperones_ou' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'blank', key: 'parents_place', label: 'Lieu' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: 'Signature des représentants légaux précédée de la mention « Lu et approuvé »' },
    ] },
    { b: 'signature', key: 'sig_parent1', roleLabel: 'Représentant légal 1', required: true },
    { b: 'signature', key: 'sig_parent2', roleLabel: 'Représentant légal 2 (facultatif)', required: false },
    { b: 'divider' },
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'CODE DE CONDUITE de l’élève' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je soussigné(e) ' },
      { t: 'blank', key: 'conduct_student_name', label: 'Nom de l’élève', prefill: 'student_name' },
      { t: 'text', text: ' m’engage à respecter le Règlement Général de l’établissement d’accueil, ' },
      { t: 'var', name: 'receiving_school_name' },
      { t: 'text', text: ', et à avoir une conduite respectueuse et irréprochable envers la famille d’accueil et ' },
      { t: 'var', name: 'chaperones_et' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: 'Signature du mineur précédée de la mention « Lu et approuvé »' },
    ] },
    { b: 'signature', key: 'sig_student', roleLabel: 'Élève', required: true, prefill: 'student_name' },
  ],
}
```

- [ ] **Step 4: Write `lib/forms/fillable/absence.ts`**

```ts
// Demande d’absence du lycée pour la durée de l’échange.
// Source: docs/exampleSchoolFiles/Demande d'absence du Lycée.pdf
import type { FillableDefinition } from './types'

export const absence: FillableDefinition = {
  key: 'absence',
  title: 'Demande d’absence',
  variables: [
    'sending_city', 'today', 'receiving_school_name', 'destination',
    'travel_period', 'sending_school_name', 'proviseur_name', 'absence_dates',
  ],
  requireOneOf: [],
  blocks: [
    { b: 'paragraph', style: 'italic', runs: [
      { t: 'var', name: 'sending_city' }, { t: 'text', text: ', le ' }, { t: 'var', name: 'today' },
    ] },
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'Demande d’absence du Lycée' }] },
    { b: 'paragraph', runs: [{ t: 'text', text: 'Madame, Monsieur,' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Certains élèves du lycée, dont votre enfant, participent à un échange culturel et linguistique avec ' },
      { t: 'var', name: 'receiving_school_name' },
      { t: 'text', text: ' (' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: '), qui se tiendra ' },
      { t: 'var', name: 'travel_period' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Le lycée ' },
      { t: 'var', name: 'sending_school_name' },
      { t: 'text', text: ' n’est pas organisateur du séjour. Aucun enseignant n’est chargé d’assumer la responsabilité des élèves sur place. Des accompagnateurs, à titre personnel, accompagneront les élèves.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je vous demande donc de bien vouloir compléter l’autorisation d’absence ci-dessous.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: 'Pour le Proviseur, ' }, { t: 'var', name: 'proviseur_name' },
    ] },
    { b: 'divider' },
    { b: 'heading', level: 2, runs: [
      { t: 'text', text: 'ÉCHANGE LINGUISTIQUE ' },
      { t: 'var', name: 'travel_period' },
      { t: 'text', text: ' — ' },
      { t: 'var', name: 'destination' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je soussigné(e) ' },
      { t: 'blank', key: 'parent_name', label: 'Nom du parent / responsable légal' },
      { t: 'text', text: ', responsable de l’élève ' },
      { t: 'blank', key: 'student_name', label: 'Nom de l’élève', prefill: 'student_name' },
      { t: 'text', text: ', demande que mon enfant soit excusé(e) pour son absence en cours ' },
      { t: 'var', name: 'absence_dates' },
      { t: 'text', text: '. Il/elle participe à l’échange linguistique (' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: ').' },
    ] },
    { b: 'radio', key: 'regime', label: 'Régime de l’élève', options: ['demi-pensionnaire', 'externe', 'interne'], required: true },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'blank', key: 'place', label: 'Lieu' },
      { t: 'text', text: '.' },
    ] },
    { b: 'signature', key: 'sig_parent', roleLabel: 'Parent / responsable légal', required: true },
  ],
}
```

- [ ] **Step 5: Write `lib/forms/fillable/engagement.ts`**

```ts
// Engagement de la famille : conditions pour participer à un échange.
// Source: docs/exampleSchoolFiles/ENGAGEMENT DE FAMILLE.pdf
import type { FillableDefinition } from './types'

export const engagement: FillableDefinition = {
  key: 'famille',
  title: 'Engagement de famille',
  variables: ['association_name', 'sending_school_name'],
  requireOneOf: [
    { keys: ['sig_pere', 'sig_mere'], message: 'Au moins un parent doit signer l’engagement.' },
  ],
  blocks: [
    { b: 'heading', level: 1, runs: [
      { t: 'text', text: 'ENGAGEMENT DE LA FAMILLE : CONDITIONS POUR PARTICIPER À UN ÉCHANGE ' },
      { t: 'var', name: 'association_name' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: '1. Être membre ' }, { t: 'var', name: 'association_name' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [{ t: 'text', text: '2. L’élève :' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– À l’étranger, il s’engage à avoir un comportement exemplaire lors de son séjour en famille et dans l’établissement scolaire et pendant le voyage, et il fait l’effort de s’intégrer dans la famille d’accueil et d’accepter les différences culturelles.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– En France, il s’engage à parler français avec son correspondant et à l’intégrer dans son quotidien.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [{ t: 'text', text: '3. Les parents :' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– Ils assument la responsabilité totale et entière de la participation de leur enfant à un échange ainsi que de l’accueil de son correspondant étranger. L’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' et le lycée ' },
      { t: 'var', name: 'sending_school_name' },
      { t: 'text', text: ' ne font que faciliter un échange entre les familles et ne peuvent être tenus comme responsables.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– Les échanges proposés demandent donc un engagement familial important. Ils ne sont pas considérés comme des échanges scolaires mais comme des échanges linguistiques privés.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– En famille, ils s’engagent à parler français avec le correspondant et à régler ses frais d’accueil.' },
    ] },
    { b: 'check', key: 'accept_conditions', required: true, runs: [
      { t: 'text', text: 'Nous attestons avoir pris connaissance et accepter les conditions des échanges.' },
    ] },
    { b: 'check', key: 'accept_responsibility', required: true, runs: [
      { t: 'text', text: 'Nous en acceptons aussi la responsabilité.' },
    ] },
    { b: 'check', key: 'wish_participation', required: true, runs: [
      { t: 'text', text: 'Nous souhaitons que notre fils / notre fille participe à cet échange.' },
    ] },
    { b: 'check', key: 'accept_committee', required: true, runs: [
      { t: 'text', text: 'Nous comprenons qu’il y a peu de places et acceptons la décision du comité des échanges, qui s’effectue de manière collégiale entre les responsables de ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' et les professeurs.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nom, prénom de l’élève : ' },
      { t: 'blank', key: 'student_name', label: 'Nom, prénom de l’élève', prefill: 'student_name' },
    ] },
    { b: 'signature', key: 'sig_pere', roleLabel: 'Père (au moins un parent doit signer)', required: false },
    { b: 'signature', key: 'sig_mere', roleLabel: 'Mère (au moins un parent doit signer)', required: false },
    { b: 'signature', key: 'sig_eleve', roleLabel: 'Élève', required: true, prefill: 'student_name' },
    { b: 'paragraph', style: 'italic', runs: [
      { t: 'text', text: 'Le résultat de la sélection sera communiqué par mail à chaque famille.' },
    ] },
  ],
}
```

- [ ] **Step 6: Write `lib/forms/fillable/medical.ts`**

```ts
// Medical authorisation / autorisation médicale — bilingual EN/FR (read by
// the US host family). Source: docs/exampleSchoolFiles/Medical Authorisation.pdf
import type { FillableDefinition } from './types'

export const medical: FillableDefinition = {
  key: 'medical',
  title: 'Autorisation médicale',
  variables: ['chaperones_or_en', 'chaperones_ou', 'travel_period_en'],
  requireOneOf: [
    { keys: ['sig_father', 'sig_mother'], message: 'Au moins un parent doit signer l’autorisation. / At least one parent must sign.' },
    { keys: ['mother_phone', 'father_phone'], message: 'Indiquez au moins un numéro de téléphone d’urgence.' },
  ],
  blocks: [
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'MEDICAL AUTHORISATION' }] },
    { b: 'heading', level: 2, runs: [{ t: 'text', text: 'Autorisation médicale' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'We hereby authorize ' },
      { t: 'blank', key: 'host_family', label: 'Host family (if known) / Famille d’accueil (si connue)', required: false },
      { t: 'text', text: ', the host family, and/or French chaperones, ' },
      { t: 'var', name: 'chaperones_or_en' },
      { t: 'text', text: ', to: (1) administer first aid treatment and (2) give permission and consent for any and all emergency medical care and procedures deemed necessary regarding the medical treatment of our child ' },
      { t: 'blank', key: 'child_name', label: 'Child’s name / Nom de l’enfant', prefill: 'student_name' },
      { t: 'text', text: ' in the event that we cannot be reached by telephone ' },
      { t: 'var', name: 'travel_period_en' },
      { t: 'text', text: '. We further undertake to pay all medical bills and costs incurred.' },
    ] },
    { b: 'paragraph', style: 'italic', runs: [
      { t: 'text', text: 'Nous, soussignés, autorisons la famille d’accueil nommée ci-dessus et ' },
      { t: 'var', name: 'chaperones_ou' },
      { t: 'text', text: ' : (1) à administrer les premiers soins et (2) à agir en notre nom pour tout soin ou toute intervention d’urgence à l’égard de notre enfant nommé ci-dessus, au cas où nous ne serions pas joignables par téléphone. Nous nous engageons à les dédommager de toute facture médicale encourue.' },
    ] },
    { b: 'heading', level: 2, runs: [{ t: 'text', text: 'Emergency Contact Telephone Numbers / Numéros d’urgence' }] },
    { b: 'field', key: 'mother_phone', label: 'Mother’s mobile number / Portable de la mère', input: 'phone', required: false, prefix: '0 11 33' },
    { b: 'field', key: 'father_phone', label: 'Father’s mobile number / Portable du père', input: 'phone', required: false, prefix: '0 11 33' },
    { b: 'field', key: 'medical_needs', label: 'Special medical needs/allergies/restrictions/diet — Contre-indications / allergies / restrictions / régime particuliers', input: 'textarea', required: false },
    { b: 'signature', key: 'sig_father', roleLabel: 'Father / Père (au moins un parent doit signer)', required: false },
    { b: 'signature', key: 'sig_mother', roleLabel: 'Mother / Mère (au moins un parent doit signer)', required: false },
  ],
}
```

- [ ] **Step 7: Write `lib/forms/fillable/index.ts`**

```ts
import type { FillableDefinition } from './types'
import { decharge } from './decharge'
import { absence } from './absence'
import { engagement } from './engagement'
import { medical } from './medical'

// Keyed by form_templates.standard_key (the engagement's key is 'famille',
// matching the existing standard-library entry).
export const FILLABLE_DEFINITIONS: Record<string, FillableDefinition> = {
  [decharge.key]: decharge,
  [absence.key]: absence,
  [engagement.key]: engagement,
  [medical.key]: medical,
}
```

- [ ] **Step 8: Run to verify pass**

```bash
pnpm vitest run lib/forms/fillable/__tests__/definitions.test.ts
```
Expected: PASS. If the « declared variables match used variables » case fails, fix the `variables:` array of the definition (not the test) so it lists exactly the variables its runs use.

- [ ] **Step 9: Commit**

```bash
git add lib/forms/fillable/
git commit -m "feat(fillable): code definitions for décharge, absence, engagement, medical"
```

---

### Task 4: PDF generation module (fonts + renderer) + smoke test

**Files:**
- Modify: `package.json` (via pnpm — new deps)
- Create: `scripts/generate-pdf-fonts.mjs`
- Create: `lib/pdf/fonts.ts` (generated by the script, committed)
- Create: `lib/pdf/fillable-pdf.tsx`
- Test: `lib/pdf/__tests__/fillable-pdf.test.ts`

**Interfaces:**
- Consumes: `FillableDefinition`, `Block`, `Run` (Task 2 types), `ResolvedVariables` (Task 2), `FillableData` (Task 1), `FILLABLE_DEFINITIONS` (Task 3, test only).
- Produces: `renderFillablePdf(input: { def: FillableDefinition; values: ResolvedVariables; data: FillableData; meta: { exchangeName: string; associationName: string | null; submissionId: string } }): Promise<Buffer>` — consumed by Task 7's submit action.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @react-pdf/renderer
pnpm add -D @expo-google-fonts/noto-sans
```
Expected: clean install (@react-pdf/renderer v4 supports React 19). If a peer warning appears for react 19, it is a warning only — verify `pnpm vitest run` still boots.

- [ ] **Step 2: Write the font-embedding script** (`scripts/generate-pdf-fonts.mjs`)

Fonts must be available inside the serverless bundle with zero runtime fetches and no file-tracing config, so the TTFs are baked into a generated TS module as data URIs. Noto Sans covers full Latin (accents + arbitrary names) — the built-in Helvetica only covers WinAnsi.

```js
// Regenerates lib/pdf/fonts.ts from @expo-google-fonts/noto-sans (devDependency).
// Run manually when the font package updates: node scripts/generate-pdf-fonts.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const b64 = (name) =>
  readFileSync(require.resolve(`@expo-google-fonts/noto-sans/400Regular/${name}`)).toString('base64')

// Package layout: @expo-google-fonts/noto-sans/<weight><Style>/NotoSans_<...>.ttf
// (verify with `ls node_modules/@expo-google-fonts/noto-sans` and adjust paths
// if the package layout differs — the assertion below catches a bad read).
const files = {
  notoSansRegular: require.resolve('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
  notoSansBold: require.resolve('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'),
  notoSansItalic: require.resolve('@expo-google-fonts/noto-sans/400Regular_Italic/NotoSans_400Regular_Italic.ttf'),
}

let out = '// GENERATED by scripts/generate-pdf-fonts.mjs — do not edit by hand.\n'
for (const [name, path] of Object.entries(files)) {
  const buf = readFileSync(path)
  // TTF magic: 00 01 00 00
  if (buf[0] !== 0x00 || buf[1] !== 0x01) throw new Error(`${path} is not a TTF`)
  out += `export const ${name} = 'data:font/ttf;base64,${buf.toString('base64')}'\n`
}
writeFileSync(new URL('../lib/pdf/fonts.ts', import.meta.url), out)
console.log('lib/pdf/fonts.ts written')
```

- [ ] **Step 3: Run it**

```bash
node scripts/generate-pdf-fonts.mjs
ls -la lib/pdf/fonts.ts
```
Expected: `lib/pdf/fonts.ts written`; file of roughly 1–2 MB. If `require.resolve` fails, inspect the actual package layout (`find node_modules/@expo-google-fonts/noto-sans -name '*.ttf'`) and fix the three paths in the script — the filenames are authoritative, the directory layout may differ by version.

- [ ] **Step 4: Write the failing smoke test** (`lib/pdf/__tests__/fillable-pdf.test.ts`)

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderFillablePdf } from '../fillable-pdf'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { resolveVariables } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

const details: ProgramDetailsValues = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY', 'Chantal KERLOCH'],
  association_name: 'AGESSIA',
  sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School',
  proviseur_name: 'Mme Sharon MIRON HUGHES',
  sending_city: 'Luynes',
  absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('renderFillablePdf', () => {
  it('renders a completed décharge to a PDF buffer', async () => {
    const def = FILLABLE_DEFINITIONS.decharge
    const buf = await renderFillablePdf({
      def,
      values: resolveVariables({ exchangeName: 'France-Minnesota 2026', details }),
      data: {
        answers: {
          parent1_name: 'Jean Dupont', student_name: 'Zoé Dupont',
          conduct_student_name: 'Zoé Dupont', parents_place: 'Luynes',
        },
        signatures: [
          { key: 'sig_parent1', role_label: 'Représentant légal 1', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' },
          { key: 'sig_student', role_label: 'Élève', full_name: 'Zoé Dupont', signed_at: '2026-07-19T10:00:00Z' },
        ],
      },
      meta: { exchangeName: 'France-Minnesota 2026', associationName: 'AGESSIA', submissionId: 'sub-123' },
    })
    expect(buf.length).toBeGreaterThan(5000)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})
```

- [ ] **Step 5: Run to verify failure** — `pnpm vitest run lib/pdf/__tests__/fillable-pdf.test.ts` → FAIL (`../fillable-pdf` missing).

- [ ] **Step 6: Implement `lib/pdf/fillable-pdf.tsx`**

```tsx
// Renders a completed fillable definition (+ answers + e-signatures) to a PDF
// buffer. Server-side only — imported by actions/fillable.ts at submit time.
// Layout is a clean regeneration of the document, not a pixel copy of the
// paper originals (spec § PDF generation).
import React from 'react'
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { FillableDefinition, Run } from '@/lib/forms/fillable/types'
import type { ResolvedVariables } from '@/lib/forms/fillable/render'
import type { FillableData } from '@/types/db'
import { notoSansRegular, notoSansBold, notoSansItalic } from './fonts'

Font.register({
  family: 'NotoSans',
  fonts: [
    { src: notoSansRegular },
    { src: notoSansBold, fontWeight: 700 },
    { src: notoSansItalic, fontStyle: 'italic' },
  ],
})
// French words must not be hyphen-broken mid-word.
Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 10.5, lineHeight: 1.45, paddingTop: 48, paddingBottom: 64, paddingHorizontal: 56, color: '#111' },
  h1: { fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 10, marginTop: 6 },
  h2: { fontSize: 11, fontWeight: 700, textAlign: 'center', marginBottom: 8, marginTop: 4 },
  para: { marginBottom: 8 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: 'italic' },
  answer: { fontWeight: 700, textDecoration: 'underline' },
  fieldRow: { marginBottom: 6 },
  fieldLabel: { fontWeight: 700 },
  check: { flexDirection: 'row', marginBottom: 5 },
  checkBox: { width: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#999', borderBottomStyle: 'dashed', marginVertical: 12 },
  sigBox: { borderWidth: 1, borderColor: '#bbb', borderRadius: 4, padding: 10, marginBottom: 8 },
  sigRole: { fontSize: 9, color: '#555', marginBottom: 2 },
  footer: { position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 8, color: '#777', textAlign: 'center' },
})

const SIGNED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
})

function runText(run: Run, values: ResolvedVariables, answers: Record<string, string>): { text: string; isAnswer: boolean } {
  if (run.t === 'text') return { text: run.text, isAnswer: false }
  if (run.t === 'var') return { text: values[run.name] ?? '—', isAnswer: false }
  const v = (answers[run.key] ?? '').trim()
  return { text: v === '' ? '……………' : v, isAnswer: v !== '' }
}

function Runs({ runs, values, answers }: {
  runs: Run[]; values: ResolvedVariables; answers: Record<string, string>
}) {
  return (
    <>
      {runs.map((r, i) => {
        const { text, isAnswer } = runText(r, values, answers)
        return <Text key={i} style={isAnswer ? styles.answer : undefined}>{text}</Text>
      })}
    </>
  )
}

export async function renderFillablePdf(input: {
  def: FillableDefinition
  values: ResolvedVariables
  data: FillableData
  meta: { exchangeName: string; associationName: string | null; submissionId: string }
}): Promise<Buffer> {
  const { def, values, data, meta } = input
  const answers = data.answers
  const sigByKey = new Map(data.signatures.map(s => [s.key, s]))

  const doc = (
    <Document title={def.title} author={meta.associationName ?? 'EazyExchange'}>
      <Page size="A4" style={styles.page}>
        {def.blocks.map((b, i) => {
          if (b.b === 'heading') {
            return (
              <Text key={i} style={b.level === 2 ? styles.h2 : styles.h1}>
                <Runs runs={b.runs} values={values} answers={answers} />
              </Text>
            )
          }
          if (b.b === 'paragraph') {
            const extra = b.style === 'bold' ? styles.bold : b.style === 'italic' ? styles.italic : undefined
            return (
              <Text key={i} style={[styles.para, ...(extra ? [extra] : [])]}>
                <Runs runs={b.runs} values={values} answers={answers} />
              </Text>
            )
          }
          if (b.b === 'field') {
            const v = (answers[b.key] ?? '').trim()
            return (
              <View key={i} style={styles.fieldRow}>
                <Text>
                  <Text style={styles.fieldLabel}>{b.label} : </Text>
                  {b.prefix ? `${b.prefix} ` : ''}
                  <Text style={styles.answer}>{v === '' ? '—' : v}</Text>
                </Text>
              </View>
            )
          }
          if (b.b === 'radio') {
            const v = (answers[b.key] ?? '').trim()
            return (
              <View key={i} style={styles.fieldRow}>
                <Text>
                  <Text style={styles.fieldLabel}>{b.label} : </Text>
                  <Text style={styles.answer}>{v === '' ? '—' : v}</Text>
                </Text>
              </View>
            )
          }
          if (b.b === 'check') {
            const checked = (answers[b.key] ?? '') === 'true'
            return (
              <View key={i} style={styles.check}>
                <Text style={styles.checkBox}>{checked ? '☑' : '☐'}</Text>
                <Text style={{ flex: 1 }}>
                  <Runs runs={b.runs} values={values} answers={answers} />
                </Text>
              </View>
            )
          }
          if (b.b === 'signature') {
            const s = sigByKey.get(b.key)
            if (!s || s.full_name.trim() === '') {
              // Untouched optional signatory: omit the box entirely.
              return b.required ? (
                <View key={i} style={styles.sigBox}>
                  <Text style={styles.sigRole}>{b.roleLabel}</Text>
                  <Text>—</Text>
                </View>
              ) : null
            }
            const when = s.signed_at ? SIGNED_AT.format(new Date(s.signed_at)) : '—'
            return (
              <View key={i} style={styles.sigBox} wrap={false}>
                <Text style={styles.sigRole}>{b.roleLabel}</Text>
                <Text>
                  Signé électroniquement par <Text style={styles.answer}>{s.full_name}</Text> le {when} — « Lu et approuvé »
                </Text>
              </View>
            )
          }
          return <View key={i} style={styles.divider} />
        })}
        <Text style={styles.footer} fixed>
          {meta.exchangeName}{meta.associationName ? ` — ${meta.associationName}` : ''} · Signé via EazyExchange · Soumission {meta.submissionId}
        </Text>
      </Page>
    </Document>
  )

  return await renderToBuffer(doc)
}
```

- [ ] **Step 7: Run to verify pass** — `pnpm vitest run lib/pdf/__tests__/fillable-pdf.test.ts` → PASS. If `renderToBuffer` is not exported by the installed major, use `import { pdf } from '@react-pdf/renderer'` and `Buffer.from(await pdf(doc).toBuffer())` — check the installed version's API before changing.

- [ ] **Step 8: Run the whole unit suite** — `pnpm vitest run --exclude 'tests/rls/**'` → all green (guards against the Font.register import breaking jsdom suites; if a jsdom suite chokes on importing the action chain, keep PDF imports confined to `lib/pdf/` and dynamic-import in the action — Task 7 already does a static import; flip to `await import('@/lib/pdf/fillable-pdf')` inside the submit branch if needed).

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/generate-pdf-fonts.mjs lib/pdf/fonts.ts lib/pdf/fillable-pdf.tsx lib/pdf/__tests__/fillable-pdf.test.ts
git commit -m "feat(fillable): PDF renderer (@react-pdf/renderer, embedded Noto Sans)"
```

---

### Task 5: Program-details server actions

**Files:**
- Create: `actions/fillable.ts` (program-details half; Task 7 adds the student half to the same file)
- Test: `actions/__tests__/fillable-program-details.test.ts`

**Interfaces:**
- Consumes: `requireOrganizer` from `lib/auth/require`, `ExchangeProgramDetails` from `types/db` (Task 1).
- Produces:
  `getProgramDetails(exchangeId: string): Promise<ExchangeProgramDetails | null>`,
  `saveProgramDetails(exchangeId: string, input: ProgramDetailsInput): Promise<{ ok: true } | { ok: false; message: string }>`,
  `export type ProgramDetailsInput` (all 10 content fields; arrays for chaperones/absence_dates).

- [ ] **Step 1: Write the failing tests** (`actions/__tests__/fillable-program-details.test.ts`) — same mock pattern as `actions/__tests__/forms.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  role: 'organizer' | 'student'
  profileSchool: string
  exchangeSchools: { a: string; b: string | null } | null
  upsertError: { message: string } | null
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        upsert: async () => ({ error: scenario.upsertError }),
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role, org_role: 'owner' }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'exchanges') {
            if (!scenario.exchangeSchools) return { data: null, error: null }
            return { data: { id: 'ex-1', school_a_id: scenario.exchangeSchools.a, school_b_id: scenario.exchangeSchools.b }, error: null }
          }
          if (table === 'exchange_program_details') return { data: null, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveProgramDetails, getProgramDetails } from '../fillable'

const validInput = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'],
  association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School', proviseur_name: 'Mme MIRON HUGHES',
  sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('program details actions', () => {
  beforeEach(() => {
    scenario = {
      userId: 'u1', role: 'organizer', profileSchool: 'school-1',
      exchangeSchools: { a: 'school-1', b: null }, upsertError: null,
    }
  })

  it('rejects a student caller', async () => {
    scenario.role = 'student'
    await expect(saveProgramDetails('ex-1', validInput)).rejects.toThrow('Unauthorized')
  })

  it('rejects an organizer from a non-participating school', async () => {
    scenario.exchangeSchools = { a: 'school-2', b: 'school-3' }
    await expect(saveProgramDetails('ex-1', validInput)).rejects.toThrow('Unauthorized')
  })

  it('accepts either side of the exchange', async () => {
    scenario.exchangeSchools = { a: 'school-9', b: 'school-1' }
    expect(await saveProgramDetails('ex-1', validInput)).toEqual({ ok: true })
  })

  it('saves valid input', async () => {
    expect(await saveProgramDetails('ex-1', validInput)).toEqual({ ok: true })
  })

  it('rejects retour before départ as a structured message', async () => {
    const r = await saveProgramDetails('ex-1', { ...validInput, travel_start: '2026-11-02', travel_end: '2026-10-17' })
    expect(r.ok).toBe(false)
  })

  it('rejects an overlong field as a structured message', async () => {
    const r = await saveProgramDetails('ex-1', { ...validInput, destination: 'x'.repeat(300) })
    expect(r.ok).toBe(false)
  })

  it('surfaces an upsert failure as a structured message', async () => {
    scenario.upsertError = { message: 'boom' }
    const r = await saveProgramDetails('ex-1', validInput)
    expect(r.ok).toBe(false)
  })

  it('getProgramDetails also enforces the scope check', async () => {
    scenario.exchangeSchools = { a: 'school-2', b: null }
    await expect(getProgramDetails('ex-1')).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run actions/__tests__/fillable-program-details.test.ts` → FAIL (`../fillable` missing).

- [ ] **Step 3: Implement the program-details half of `actions/fillable.ts`**

```ts
'use server'
// Fillable, signable standard forms — two trust models in one feature file:
// organizer program-details management (this half) and the student fill/sign
// action (saveFillable below, Task 7). Spec:
// docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExchangeProgramDetails } from '@/types/db'

// Throw unless the caller is an organizer of a school participating in the
// exchange (either side — the details describe the shared trip).
async function assertOrganizerOnExchange(
  supabase: SupabaseClient, exchangeId: string,
): Promise<void> {
  const { profile } = await requireOrganizer()
  const { data: exchange } = await supabase
    .from('exchanges').select('id, school_a_id, school_b_id')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }
}

export async function getProgramDetails(exchangeId: string): Promise<ExchangeProgramDetails | null> {
  const supabase = await createClient()
  await assertOrganizerOnExchange(supabase, exchangeId)
  const { data } = await supabase
    .from('exchange_program_details').select('*')
    .eq('exchange_id', exchangeId).maybeSingle()
  return data ?? null
}

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
}

const MAX_FIELD = 200
const MAX_LIST = 12
const MAX_LIST_ITEM = 160

function cleanText(v: string | null): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}
function cleanList(v: string[]): string[] {
  return v.map(x => x.trim()).filter(Boolean)
}

export async function saveProgramDetails(
  exchangeId: string, input: ProgramDetailsInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient()
  await assertOrganizerOnExchange(supabase, exchangeId)

  const texts = [input.destination, input.association_name, input.sending_school_name,
    input.receiving_school_name, input.proviseur_name, input.sending_city]
  if (texts.some(t => (t ?? '').length > MAX_FIELD)) {
    return { ok: false, message: `Un champ dépasse ${MAX_FIELD} caractères.` }
  }
  const chaperones = cleanList(input.chaperones)
  const absenceDates = cleanList(input.absence_dates)
  if (chaperones.length > MAX_LIST || absenceDates.length > MAX_LIST) {
    return { ok: false, message: `${MAX_LIST} entrées maximum par liste.` }
  }
  if ([...chaperones, ...absenceDates].some(x => x.length > MAX_LIST_ITEM)) {
    return { ok: false, message: `Une entrée de liste dépasse ${MAX_LIST_ITEM} caractères.` }
  }
  const start = cleanText(input.travel_start)
  const end = cleanText(input.travel_end)
  if ((start && !end) || (!start && end)) {
    return { ok: false, message: 'Renseignez les deux dates du voyage (départ et retour).' }
  }
  if (start && end && end < start) {
    return { ok: false, message: 'La date de retour doit être après la date de départ.' }
  }

  const { error } = await supabase.from('exchange_program_details').upsert({
    exchange_id: exchangeId,
    destination: cleanText(input.destination),
    travel_start: start,
    travel_end: end,
    chaperones,
    association_name: cleanText(input.association_name),
    sending_school_name: cleanText(input.sending_school_name),
    receiving_school_name: cleanText(input.receiving_school_name),
    proviseur_name: cleanText(input.proviseur_name),
    sending_city: cleanText(input.sending_city),
    absence_dates: absenceDates,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'exchange_id' })
  if (error) return { ok: false, message: 'L’enregistrement a échoué. Réessayez.' }

  revalidatePath('/settings')
  // Fillable templates render these values on /forms drawers and the student
  // pages; organizer surfaces refresh here, student pages re-render on load
  // (server components, no cache) — same cross-actor stance as submissions.
  revalidatePath('/forms', 'layout')
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run actions/__tests__/fillable-program-details.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/fillable.ts actions/__tests__/fillable-program-details.test.ts
git commit -m "feat(fillable): program-details actions (get/save, exchange-scoped)"
```

---

### Task 6: Settings → Programme « Détails du programme » card + i18n

**Files:**
- Create: `components/settings/ProgramDetailsCard.tsx`
- Modify: `components/settings/SettingsView.tsx` (add card to the `prog` section + new prop)
- Modify: `app/(organizer)/settings/page.tsx` (fetch details, pass prop)
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Modify (if needed): `components/settings/__tests__/SettingsView.test.tsx` (new prop in fixtures)
- Test: `components/settings/__tests__/ProgramDetailsCard.test.tsx`

**Interfaces:**
- Consumes: `getProgramDetails` / `saveProgramDetails` / `ProgramDetailsInput` (Task 5), `ExchangeProgramDetails` (Task 1).
- Produces: `<ProgramDetailsCard exchangeId initial readOnly />`.

- [ ] **Step 1: Add the i18n keys.** In each of the 5 `messages/*.json`, inside `organizer.settings`, add a `programDetails` object (sibling of `program`). French:

```json
"programDetails": {
  "heading": "Détails du programme",
  "subtitle": "Ces informations remplissent automatiquement les formulaires à signer en ligne (décharge, demande d’absence, engagement de famille, autorisation médicale). Modifiez-les ici : tous les formulaires non encore signés se mettent à jour.",
  "destination": "Destination",
  "destinationHint": "Telle qu’elle apparaîtra dans les formulaires, ex. « le Minnesota, USA »",
  "travelStart": "Date de départ",
  "travelEnd": "Date de retour",
  "chaperones": "Accompagnateurs",
  "chaperonesHint": "Un nom complet par ligne",
  "association": "Nom de l’association",
  "sendingSchool": "Lycée d’origine",
  "receivingSchool": "Établissement d’accueil",
  "proviseur": "Nom du proviseur",
  "sendingCity": "Ville du lycée",
  "absenceDates": "Jours d’absence à excuser",
  "absenceDatesHint": "Un jour par ligne, ex. « le jeudi 19 octobre 2026 »",
  "save": "Enregistrer",
  "saved": "Enregistré."
}
```

English:

```json
"programDetails": {
  "heading": "Program details",
  "subtitle": "These values automatically fill the online signable forms (liability waiver, absence request, family commitment, medical authorisation). Edit them here: every not-yet-signed form updates.",
  "destination": "Destination",
  "destinationHint": "As it will appear in the forms, e.g. “le Minnesota, USA”",
  "travelStart": "Departure date",
  "travelEnd": "Return date",
  "chaperones": "Chaperones",
  "chaperonesHint": "One full name per line",
  "association": "Association name",
  "sendingSchool": "Home school",
  "receivingSchool": "Host school",
  "proviseur": "Principal’s name",
  "sendingCity": "School’s city",
  "absenceDates": "Absence days to excuse",
  "absenceDatesHint": "One day per line, e.g. “le jeudi 19 octobre 2026”",
  "save": "Save",
  "saved": "Saved."
}
```

Spanish:

```json
"programDetails": {
  "heading": "Detalles del programa",
  "subtitle": "Estos datos rellenan automáticamente los formularios para firmar en línea (descarga de responsabilidad, solicitud de ausencia, compromiso familiar, autorización médica). Edítalos aquí: todos los formularios aún no firmados se actualizan.",
  "destination": "Destino",
  "destinationHint": "Tal como aparecerá en los formularios, p. ej. « le Minnesota, USA »",
  "travelStart": "Fecha de salida",
  "travelEnd": "Fecha de regreso",
  "chaperones": "Acompañantes",
  "chaperonesHint": "Un nombre completo por línea",
  "association": "Nombre de la asociación",
  "sendingSchool": "Centro de origen",
  "receivingSchool": "Centro de acogida",
  "proviseur": "Nombre del director",
  "sendingCity": "Ciudad del centro",
  "absenceDates": "Días de ausencia a justificar",
  "absenceDatesHint": "Un día por línea, p. ej. « le jeudi 19 octobre 2026 »",
  "save": "Guardar",
  "saved": "Guardado."
}
```

Italian:

```json
"programDetails": {
  "heading": "Dettagli del programma",
  "subtitle": "Questi dati compilano automaticamente i moduli da firmare online (liberatoria, richiesta di assenza, impegno della famiglia, autorizzazione medica). Modificali qui: tutti i moduli non ancora firmati si aggiornano.",
  "destination": "Destinazione",
  "destinationHint": "Come apparirà nei moduli, es. « le Minnesota, USA »",
  "travelStart": "Data di partenza",
  "travelEnd": "Data di ritorno",
  "chaperones": "Accompagnatori",
  "chaperonesHint": "Un nome completo per riga",
  "association": "Nome dell’associazione",
  "sendingSchool": "Istituto di provenienza",
  "receivingSchool": "Istituto ospitante",
  "proviseur": "Nome del preside",
  "sendingCity": "Città dell’istituto",
  "absenceDates": "Giorni di assenza da giustificare",
  "absenceDatesHint": "Un giorno per riga, es. « le jeudi 19 octobre 2026 »",
  "save": "Salva",
  "saved": "Salvato."
}
```

German:

```json
"programDetails": {
  "heading": "Programmdetails",
  "subtitle": "Diese Angaben füllen die online zu unterzeichnenden Formulare automatisch aus (Haftungsausschluss, Abwesenheitsantrag, Familienverpflichtung, medizinische Vollmacht). Hier bearbeiten: alle noch nicht unterzeichneten Formulare werden aktualisiert.",
  "destination": "Reiseziel",
  "destinationHint": "So, wie es in den Formularen erscheint, z. B. « le Minnesota, USA »",
  "travelStart": "Abreisedatum",
  "travelEnd": "Rückreisedatum",
  "chaperones": "Begleitpersonen",
  "chaperonesHint": "Ein vollständiger Name pro Zeile",
  "association": "Name des Vereins",
  "sendingSchool": "Heimatschule",
  "receivingSchool": "Gastschule",
  "proviseur": "Name der Schulleitung",
  "sendingCity": "Stadt der Schule",
  "absenceDates": "Zu entschuldigende Fehltage",
  "absenceDatesHint": "Ein Tag pro Zeile, z. B. « le jeudi 19 octobre 2026 »",
  "save": "Speichern",
  "saved": "Gespeichert."
}
```

- [ ] **Step 2: Write the failing component test** (`components/settings/__tests__/ProgramDetailsCard.test.tsx`) — follow the style of the sibling tests in that directory (they mock `next-intl`'s `useTranslations` and the action module):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProgramDetailsCard } from '../ProgramDetailsCard'

const saveMock = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/actions/fillable', () => ({
  saveProgramDetails: (...args: unknown[]) => saveMock(...args),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('ProgramDetailsCard', () => {
  beforeEach(() => saveMock.mockClear())

  it('renders empty fields with no initial row', () => {
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={false} />)
    expect(screen.getByLabelText('settings.programDetails.destination')).toHaveValue('')
  })

  it('submits parsed values (lists split on newlines)', async () => {
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={false} />)
    fireEvent.change(screen.getByLabelText('settings.programDetails.destination'), { target: { value: 'le Minnesota, USA' } })
    fireEvent.change(screen.getByLabelText('settings.programDetails.chaperones'), { target: { value: 'A B\nC D\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'settings.programDetails.save' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const [exchangeId, input] = saveMock.mock.calls[0] as [string, { destination: string; chaperones: string[] }]
    expect(exchangeId).toBe('ex-1')
    expect(input.destination).toBe('le Minnesota, USA')
    expect(input.chaperones).toEqual(['A B', 'C D'])
  })

  it('disables everything when readOnly', () => {
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={true} />)
    expect(screen.getByLabelText('settings.programDetails.destination')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'settings.programDetails.save' })).toBeNull()
  })
})
```

Note: if sibling tests mock `next-intl` differently (check `LanguageSelect.test.tsx` first), copy their exact mock so the suite stays consistent.

- [ ] **Step 3: Run to verify failure** — `pnpm vitest run components/settings/__tests__/ProgramDetailsCard.test.tsx` → FAIL.

- [ ] **Step 4: Implement `components/settings/ProgramDetailsCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { saveProgramDetails, type ProgramDetailsInput } from '@/actions/fillable'
import type { ExchangeProgramDetails } from '@/types/db'

type Props = { exchangeId: string; initial: ExchangeProgramDetails | null; readOnly: boolean }

const inputCls = 'h-10 w-full rounded-[9px] border px-3 text-[13px] text-foreground focus-visible:border-brand focus-visible:outline-none disabled:opacity-60'
const areaCls = 'w-full rounded-[9px] border px-3 py-2 text-[13px] text-foreground focus-visible:border-brand focus-visible:outline-none disabled:opacity-60'
const labelCls = 'mb-1 block text-[12px] font-semibold text-foreground'
const hintCls = 'mt-1 text-[11.5px] text-tertiary'

export function ProgramDetailsCard({ exchangeId, initial, readOnly }: Props) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [form, setForm] = useState({
    destination: initial?.destination ?? '',
    travel_start: initial?.travel_start ?? '',
    travel_end: initial?.travel_end ?? '',
    chaperones: (initial?.chaperones ?? []).join('\n'),
    association_name: initial?.association_name ?? '',
    sending_school_name: initial?.sending_school_name ?? '',
    receiving_school_name: initial?.receiving_school_name ?? '',
    proviseur_name: initial?.proviseur_name ?? '',
    sending_city: initial?.sending_city ?? '',
    absence_dates: (initial?.absence_dates ?? []).join('\n'),
  })
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<'saved' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [k]: e.target.value }))
    setFlash(null)
  }

  async function handleSave() {
    setBusy(true); setError(null); setFlash(null)
    const input: ProgramDetailsInput = {
      destination: form.destination || null,
      travel_start: form.travel_start || null,
      travel_end: form.travel_end || null,
      chaperones: form.chaperones.split('\n').map(s => s.trim()).filter(Boolean),
      association_name: form.association_name || null,
      sending_school_name: form.sending_school_name || null,
      receiving_school_name: form.receiving_school_name || null,
      proviseur_name: form.proviseur_name || null,
      sending_city: form.sending_city || null,
      absence_dates: form.absence_dates.split('\n').map(s => s.trim()).filter(Boolean),
    }
    try {
      const res = await saveProgramDetails(exchangeId, input)
      if (res.ok) setFlash('saved')
      else setError(res.message)
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  const text = (key: keyof typeof form, label: string, hint?: string, type: 'text' | 'date' = 'text') => (
    <div>
      <label htmlFor={`pd-${key}`} className={labelCls}>{label}</label>
      <input id={`pd-${key}`} type={type} value={form[key]} onChange={set(key)} disabled={readOnly} className={inputCls} />
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  )

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">
        {t('settings.programDetails.heading')}
      </div>
      <p className="mb-5 text-[12.5px] leading-normal text-muted-foreground">
        {t('settings.programDetails.subtitle')}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {text('destination', t('settings.programDetails.destination'), t('settings.programDetails.destinationHint'))}
        {text('association_name', t('settings.programDetails.association'))}
        {text('travel_start', t('settings.programDetails.travelStart'), undefined, 'date')}
        {text('travel_end', t('settings.programDetails.travelEnd'), undefined, 'date')}
        {text('sending_school_name', t('settings.programDetails.sendingSchool'))}
        {text('receiving_school_name', t('settings.programDetails.receivingSchool'))}
        {text('proviseur_name', t('settings.programDetails.proviseur'))}
        {text('sending_city', t('settings.programDetails.sendingCity'))}
        <div>
          <label htmlFor="pd-chaperones" className={labelCls}>{t('settings.programDetails.chaperones')}</label>
          <textarea id="pd-chaperones" rows={3} value={form.chaperones} onChange={set('chaperones')} disabled={readOnly} className={areaCls} />
          <p className={hintCls}>{t('settings.programDetails.chaperonesHint')}</p>
        </div>
        <div>
          <label htmlFor="pd-absence_dates" className={labelCls}>{t('settings.programDetails.absenceDates')}</label>
          <textarea id="pd-absence_dates" rows={3} value={form.absence_dates} onChange={set('absence_dates')} disabled={readOnly} className={areaCls} />
          <p className={hintCls}>{t('settings.programDetails.absenceDatesHint')}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] font-medium text-danger-text">{error}</p>}
      {flash === 'saved' && <p className="mt-3 text-[12.5px] font-medium text-muted-foreground">{t('settings.programDetails.saved')}</p>}

      {!readOnly && (
        <div className="mt-4 flex justify-end">
          <button
            type="button" disabled={busy} onClick={() => void handleSave()}
            className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('settings.programDetails.save')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire into the settings page and view.**

`components/settings/SettingsView.tsx` — add to `SettingsProps`:

```ts
  programDetails: ExchangeProgramDetails | null
```
with `import type { ExchangeProgramDetails } from '@/types/db'` and `import { ProgramDetailsCard } from './ProgramDetailsCard'`; in the `prog` section render between `ProgramCard` and `ReminderSettingsCard`:

```tsx
              <ProgramDetailsCard
                exchangeId={props.program.id}
                initial={props.programDetails}
                readOnly={props.program.archived}
              />
```

`app/(organizer)/settings/page.tsx` — add `import { getProgramDetails } from '@/actions/fillable'` and `import type { ExchangeProgramDetails } from '@/types/db'`; after the `if (active) program = await getProgramInfo(active.id)` line:

```ts
  let programDetails: ExchangeProgramDetails | null = null
  if (active) programDetails = await getProgramDetails(active.id)
```
and pass `programDetails={programDetails}` to `<SettingsView …>`.

If `components/settings/__tests__/SettingsView.test.tsx` constructs `SettingsProps`, add `programDetails: null` to its fixtures.

- [ ] **Step 6: Run tests + type-check**

```bash
pnpm vitest run components/settings messages
npx tsc --noEmit
```
Expected: PASS (including the messages parity suite — it validates key parity across the 5 locales).

- [ ] **Step 7: Commit**

```bash
git add components/settings/ProgramDetailsCard.tsx components/settings/SettingsView.tsx components/settings/__tests__/ app/\(organizer\)/settings/page.tsx messages/
git commit -m "feat(fillable): Détails du programme card in Settings → Programme (5 locales)"
```

---

### Task 7: Student fill/sign server action (`saveFillable`)

**Files:**
- Modify: `actions/fillable.ts` (append the student half)
- Test: `actions/__tests__/fillable-save.test.ts`

**Interfaces:**
- Consumes: `FILLABLE_DEFINITIONS` (Task 3), `validateFillable` / `signatureBlocks` / `resolveVariables` (Task 2), `renderFillablePdf` (Task 4), `FillableInput` (Task 2 types), `assertExchangeWritable` from `lib/exchange-guard`, `hasOverlongAnswer` / `MAX_ANSWER_LENGTH` from `lib/validation`, `requireUser` from `lib/auth/require`.
- Produces: `saveFillable(assignmentId: string, input: FillableInput, submit: boolean): Promise<{ ok: true } | { ok: false; message: string }>` — consumed by Task 8's `FillableForm`.

- [ ] **Step 1: Write the failing tests** (`actions/__tests__/fillable-save.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  assignmentFound: boolean
  templateKind: string
  standardKey: string | null
  submissionStatus: string | null
  uploadError: { message: string } | null
  pdfFails: boolean
}

const updates: Record<string, unknown>[] = []

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'sub-1' }, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          updates.push({ table, ...payload })
          return { eq: async () => ({ error: null }) }
        },
        single: async () => {
          if (table === 'users') return { data: { role: 'student', school_id: 's-1' }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'assignments') {
            if (!scenario.assignmentFound) return { data: null, error: null }
            return { data: { id: 'a-1', form_templates: {
              id: 't-1', kind: scenario.templateKind, standard_key: scenario.standardKey,
              exchange_id: 'ex-1', name: 'Décharge',
            } }, error: null }
          }
          if (table === 'submissions') {
            if (!scenario.submissionStatus) return { data: null, error: null }
            return { data: { id: 'sub-1', status: scenario.submissionStatus }, error: null }
          }
          if (table === 'exchanges') return { data: { name: 'France-Minnesota 2026', archived_at: null }, error: null }
          if (table === 'exchange_program_details') return { data: null, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: scenario.uploadError }),
      }),
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))
vi.mock('@/lib/pdf/fillable-pdf', () => ({
  renderFillablePdf: vi.fn(async () => {
    if (scenario.pdfFails) throw new Error('render boom')
    return Buffer.from('%PDF-fake')
  }),
}))

import { saveFillable } from '../fillable'

// Décharge requires: parent1_name, student_name, conduct_student_name,
// parents_place + sig_parent1 + sig_student.
const completeInput = {
  answers: {
    parent1_name: 'Jean Dupont', student_name: 'Zoé Dupont',
    conduct_student_name: 'Zoé Dupont', parents_place: 'Luynes',
  },
  signatures: [
    { key: 'sig_parent1', full_name: 'Jean Dupont', approved: true },
    { key: 'sig_student', full_name: 'Zoé Dupont', approved: true },
  ],
}

describe('saveFillable', () => {
  beforeEach(() => {
    updates.length = 0
    scenario = {
      userId: 'stu-1', assignmentFound: true, templateKind: 'fillable',
      standardKey: 'decharge', submissionStatus: null, uploadError: null, pdfFails: false,
    }
  })

  it('throws for an assignment the student does not own', async () => {
    scenario.assignmentFound = false
    await expect(saveFillable('a-1', completeInput, false)).rejects.toThrow('Assignment not found')
  })

  it('throws for a non-fillable template', async () => {
    scenario.templateKind = 'online'
    await expect(saveFillable('a-1', completeInput, false)).rejects.toThrow()
  })

  it('locks an approved submission (structured)', async () => {
    scenario.submissionStatus = 'approved'
    const r = await saveFillable('a-1', completeInput, false)
    expect(r.ok).toBe(false)
  })

  it('returns validation failure on submit with missing signature', async () => {
    const r = await saveFillable('a-1', { ...completeInput, signatures: [] }, true)
    expect(r.ok).toBe(false)
    expect(updates.filter(u => u.table === 'submissions' && u.status === 'submitted')).toHaveLength(0)
  })

  it('saves a draft without stamping signed_at', async () => {
    const r = await saveFillable('a-1', completeInput, false)
    expect(r).toEqual({ ok: true })
    const draft = updates.find(u => u.table === 'submissions') as { fillable_data: { signatures: { signed_at: string | null }[] } } | undefined
    // No prior submission → the row was inserted then updated with data only.
    if (draft) expect(draft.fillable_data.signatures.every(s => s.signed_at === null)).toBe(true)
  })

  it('submits: stamps signatures, uploads PDF, sets submitted', async () => {
    const r = await saveFillable('a-1', completeInput, true)
    expect(r).toEqual({ ok: true })
    const final = updates.find(u => u.table === 'submissions' && u.status === 'submitted') as any
    expect(final).toBeDefined()
    expect(final.generated_pdf_path).toBe('a-1/fillable/sub-1.pdf')
    expect(final.fillable_data.signatures.every((s: any) => typeof s.signed_at === 'string')).toBe(true)
  })

  it('PDF failure → structured error, stays draft', async () => {
    scenario.pdfFails = true
    const r = await saveFillable('a-1', completeInput, true)
    expect(r.ok).toBe(false)
    expect(updates.filter(u => u.table === 'submissions' && u.status === 'submitted')).toHaveLength(0)
  })

  it('storage failure → structured error, stays draft', async () => {
    scenario.uploadError = { message: 'boom' }
    const r = await saveFillable('a-1', completeInput, true)
    expect(r.ok).toBe(false)
    expect(updates.filter(u => u.table === 'submissions' && u.status === 'submitted')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run actions/__tests__/fillable-save.test.ts` → FAIL (`saveFillable` not exported).

- [ ] **Step 3: Append to `actions/fillable.ts`**

Add imports at the top (merge with existing):

```ts
import { requireUser } from '@/lib/auth/require'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { hasOverlongAnswer, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { validateFillable, signatureBlocks, resolveVariables } from '@/lib/forms/fillable/render'
import type { FillableInput } from '@/lib/forms/fillable/types'
import { renderFillablePdf } from '@/lib/pdf/fillable-pdf'
import type { FillableData, FillableSignature } from '@/types/db'
```

Then the action:

```ts
const MSG_LOCKED = 'Ce formulaire a déjà été validé et ne peut plus être modifié.'
const MSG_PDF_FAILED = 'La génération du PDF a échoué. Réessaie dans un instant.'
const MSG_UPLOAD_FAILED = 'L’enregistrement du PDF a échoué. Réessaie dans un instant.'

// Student fill & e-sign. Draft saves persist answers + signature names without
// timestamps; submit validates everything, stamps signed_at SERVER-side,
// renders the PDF, uploads it, then flips the submission to submitted. The
// submission row is only marked submitted after a successful upload — a PDF
// or storage failure leaves it in draft (structured error, nothing thrown).
export async function saveFillable(
  assignmentId: string,
  input: FillableInput,
  submit: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, form_templates!inner(id, kind, standard_key, exchange_id, name)')
    .eq('id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle<{ id: string; form_templates: {
      id: string; kind: string; standard_key: string | null; exchange_id: string; name: string
    } }>()
  if (!assignment) throw new Error('Assignment not found')
  const tmpl = assignment.form_templates
  const def = tmpl.kind === 'fillable' && tmpl.standard_key
    ? FILLABLE_DEFINITIONS[tmpl.standard_key]
    : undefined
  if (!def) throw new Error('Not a fillable template')
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  if (hasOverlongAnswer(input.answers)) {
    return { ok: false, message: `Une réponse dépasse la limite de ${MAX_ANSWER_LENGTH} caractères.` }
  }
  if (submit) {
    const valid = validateFillable(def, input)
    if (!valid.ok) return valid
  }

  const { data: existing } = await supabase
    .from('submissions').select('id, status')
    .eq('assignment_id', assignmentId).maybeSingle()
  if (existing?.status === 'approved') return { ok: false, message: MSG_LOCKED }

  let submissionId: string
  if (existing) {
    submissionId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('submissions')
      .insert({
        assignment_id: assignmentId, status: 'draft', submitted_at: null,
        reviewed_at: null, reviewer_id: null, review_note: null,
      })
      .select('id').single()
    if (error) throw error
    submissionId = created.id
  }

  const roleByKey = new Map(signatureBlocks(def).map(s => [s.key, s.roleLabel]))
  const signedAt = new Date().toISOString()
  const signatures: FillableSignature[] = input.signatures
    .filter(s => s.full_name.trim() !== '' || s.approved === true)
    .map(s => ({
      key: s.key,
      role_label: roleByKey.get(s.key) ?? s.key,
      full_name: s.full_name.trim(),
      signed_at: submit && s.approved === true ? signedAt : null,
    }))
  const fillableData: FillableData = { answers: input.answers, signatures }

  if (!submit) {
    // Draft: data only — a rejected submission stays rejected until resubmit.
    const { error } = await supabase
      .from('submissions').update({ fillable_data: fillableData }).eq('id', submissionId)
    if (error) throw error
  } else {
    const [{ data: exchange }, { data: details }] = await Promise.all([
      supabase.from('exchanges').select('name').eq('id', tmpl.exchange_id).maybeSingle(),
      supabase.from('exchange_program_details').select('*').eq('exchange_id', tmpl.exchange_id).maybeSingle(),
    ])
    const values = resolveVariables({ exchangeName: exchange?.name ?? '', details })

    let pdf: Buffer
    try {
      pdf = await renderFillablePdf({
        def, values, data: fillableData,
        meta: {
          exchangeName: exchange?.name ?? '',
          associationName: details?.association_name ?? null,
          submissionId,
        },
      })
    } catch {
      // Expected-enough failure mode; no PII in any log (ids only via the
      // structured return). Do not rethrow — the student can retry.
      return { ok: false, message: MSG_PDF_FAILED }
    }

    const path = `${assignmentId}/fillable/${submissionId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, pdf, { upsert: true, contentType: 'application/pdf' })
    if (uploadError) return { ok: false, message: MSG_UPLOAD_FAILED }

    const { error } = await supabase
      .from('submissions')
      .update({
        fillable_data: fillableData,
        generated_pdf_path: path,
        status: 'submitted',
        submitted_at: signedAt,
      })
      .eq('id', submissionId)
    if (error) throw error
  }

  revalidatePath(`/my-forms/${assignmentId}`)
  revalidatePath('/my-forms')
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run actions/__tests__/fillable-save.test.ts actions/__tests__/fillable-program-details.test.ts` → PASS (both suites — same file, both halves).

- [ ] **Step 5: Commit**

```bash
git add actions/fillable.ts actions/__tests__/fillable-save.test.ts
git commit -m "feat(fillable): saveFillable student action (draft/e-sign/PDF/submit)"
```

---

### Task 8: Student fill & sign UI (`FillableForm` + assignment page)

**Files:**
- Create: `components/FillableForm.tsx`
- Modify: `app/(student)/my-forms/[assignmentId]/page.tsx`
- Test: `components/__tests__/FillableForm.test.tsx`

**Interfaces:**
- Consumes: `saveFillable` (Task 7), `FillableDefinition`/`Run`/`Block` + `ResolvedVariables` (Task 2), `FillableData` (Task 1), `FILLABLE_DEFINITIONS` + `resolveVariables` (page side), `getProfile` from `lib/supabase/request`, `createClient` from `lib/supabase/server`.
- Produces: `<FillableForm assignmentId def values initialData readOnly studentName />` — also reused read-only by the review page (Task 10).

Student-facing copy is hardcoded French (tutoiement for chrome, vouvoiement inside the legal text itself), matching `DataEntryForm`.

- [ ] **Step 1: Write the failing tests** (`components/__tests__/FillableForm.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FillableForm } from '../FillableForm'
import type { FillableDefinition } from '@/lib/forms/fillable/types'

const saveMock = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/actions/fillable', () => ({
  saveFillable: (...args: unknown[]) => saveMock(...args),
}))
const routerPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

const def: FillableDefinition = {
  key: 'test', title: 'Test',
  variables: ['destination'],
  blocks: [
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nous, soussignés ' },
      { t: 'blank', key: 'parent1', label: 'Nom du représentant légal 1' },
      { t: 'text', text: ', autorisons le voyage — ' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: '.' },
    ] },
    { b: 'check', key: 'ok', runs: [{ t: 'text', text: 'J’accepte.' }], required: true },
    { b: 'signature', key: 'sig1', roleLabel: 'Représentant légal 1', required: true },
  ],
}

describe('FillableForm', () => {
  beforeEach(() => { saveMock.mockClear(); routerPush.mockClear() })

  it('substitutes variables into the text', () => {
    render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'le Minnesota, USA' }}
      initialData={null} readOnly={false} studentName="Zoé" />)
    expect(screen.getByText(/le Minnesota, USA/)).toBeInTheDocument()
  })

  it('sends answers and signatures on submit', async () => {
    render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'X' }}
      initialData={null} readOnly={false} studentName="Zoé" />)
    fireEvent.change(screen.getByLabelText('Nom du représentant légal 1'), { target: { value: 'Jean Dupont' } })
    fireEvent.click(screen.getByLabelText('J’accepte.'))
    fireEvent.change(screen.getByLabelText('Nom complet — Représentant légal 1'), { target: { value: 'Jean Dupont' } })
    fireEvent.click(screen.getByLabelText(/Lu et approuvé — Représentant légal 1/))
    fireEvent.click(screen.getByRole('button', { name: 'Signer et envoyer' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalled())
    const [assignmentId, input, submit] = saveMock.mock.calls[0] as [string, { answers: Record<string, string>; signatures: { key: string; approved: boolean }[] }, boolean]
    expect(assignmentId).toBe('a-1')
    expect(submit).toBe(true)
    expect(input.answers.parent1).toBe('Jean Dupont')
    expect(input.answers.ok).toBe('true')
    expect(input.signatures[0]).toMatchObject({ key: 'sig1', approved: true })
  })

  it('shows a structured error without navigating', async () => {
    saveMock.mockResolvedValueOnce({ ok: false, message: 'Complétez tout.' } as never)
    render(<FillableForm assignmentId="a-1" def={def} values={{}} initialData={null} readOnly={false} studentName="Zoé" />)
    fireEvent.click(screen.getByRole('button', { name: 'Signer et envoyer' }))
    await waitFor(() => expect(screen.getByText('Complétez tout.')).toBeInTheDocument())
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('readOnly renders values as text without buttons', () => {
    render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'X' }}
      initialData={{ answers: { parent1: 'Jean Dupont', ok: 'true' }, signatures: [{ key: 'sig1', role_label: 'Représentant légal 1', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' }] }}
      readOnly={true} studentName="Zoé" />)
    expect(screen.queryByRole('button', { name: 'Signer et envoyer' })).toBeNull()
    expect(screen.getAllByText(/Jean Dupont/).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run components/__tests__/FillableForm.test.tsx` → FAIL.

- [ ] **Step 3: Implement `components/FillableForm.tsx`**

```tsx
'use client'
// Document-style fill & e-sign page for kind:'fillable' templates. The same
// component renders the organizer review (readOnly) — keep it presentation-only
// apart from the save/submit calls.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveFillable } from '@/actions/fillable'
import { Button } from '@/components/ui/button'
import type { FillableDefinition, Run, Block } from '@/lib/forms/fillable/types'
import type { ResolvedVariables } from '@/lib/forms/fillable/render'
import type { FillableData } from '@/types/db'

type Props = {
  assignmentId: string
  def: FillableDefinition
  values: ResolvedVariables
  initialData: FillableData | null
  readOnly: boolean
  studentName: string
}

type SigState = Record<string, { full_name: string; approved: boolean }>

const SIGNED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
})

export function FillableForm({ assignmentId, def, values, initialData, readOnly, studentName }: Props) {
  const router = useRouter()

  // Prefill student-name blanks/signatures on first open only.
  const initialAnswers = (() => {
    const a: Record<string, string> = { ...(initialData?.answers ?? {}) }
    if (!initialData) {
      for (const b of def.blocks) {
        if ((b.b === 'heading' || b.b === 'paragraph')) {
          for (const r of b.runs) {
            if (r.t === 'blank' && r.prefill === 'student_name' && !a[r.key]) a[r.key] = studentName
          }
        }
      }
    }
    return a
  })()
  const initialSigs = (() => {
    const s: SigState = {}
    for (const b of def.blocks) {
      if (b.b !== 'signature') continue
      const existing = initialData?.signatures.find(x => x.key === b.key)
      s[b.key] = {
        full_name: existing?.full_name ?? (b.prefill === 'student_name' && !initialData ? studentName : ''),
        approved: !!existing?.signed_at,
      }
    }
    return s
  })()

  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [sigs, setSigs] = useState<SigState>(initialSigs)
  const [loading, setLoading] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setAnswer = (key: string, value: string) => setAnswers(prev => ({ ...prev, [key]: value }))
  const setSig = (key: string, patch: Partial<SigState[string]>) =>
    setSigs(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  async function handleSave(submit: boolean) {
    setLoading(submit ? 'submit' : 'draft')
    setError(null)
    try {
      const res = await saveFillable(assignmentId, {
        answers,
        signatures: Object.entries(sigs).map(([key, s]) => ({ key, full_name: s.full_name, approved: s.approved })),
      }, submit)
      if (!res.ok) setError(res.message)
      else if (submit) router.push('/my-forms')
    } catch {
      setError('Échec de l’enregistrement. Réessaie dans un instant.')
    } finally {
      setLoading(null)
    }
  }

  const signedAtByKey = new Map((initialData?.signatures ?? []).map(s => [s.key, s.signed_at]))

  function renderRuns(runs: Run[]) {
    return runs.map((r, i) => {
      if (r.t === 'text') return <span key={i}>{r.text}</span>
      if (r.t === 'var') return <strong key={i} className="font-semibold">{values[r.name] ?? '…'}</strong>
      const v = answers[r.key] ?? ''
      if (readOnly) {
        return <strong key={i} className="font-semibold underline decoration-dotted">{v.trim() === '' ? '—' : v}</strong>
      }
      return (
        <input
          key={i}
          aria-label={r.label}
          placeholder={r.label}
          value={v}
          onChange={e => setAnswer(r.key, e.target.value)}
          className="mx-1 inline-block h-8 w-[220px] max-w-full rounded-[7px] border border-dashed border-frame-dashed bg-card px-2 align-baseline text-[13px] focus-visible:border-brand focus-visible:outline-none"
        />
      )
    })
  }

  function renderBlock(b: Block, i: number) {
    if (b.b === 'heading') {
      return b.level === 2
        ? <h3 key={i} className="mb-3 mt-2 text-center text-[14px] font-bold text-navy">{renderRuns(b.runs)}</h3>
        : <h2 key={i} className="mb-4 mt-2 text-center font-display text-[17px] font-bold tracking-tight text-navy underline">{renderRuns(b.runs)}</h2>
    }
    if (b.b === 'paragraph') {
      const cls = b.style === 'bold' ? 'font-semibold' : b.style === 'italic' ? 'italic' : ''
      return <p key={i} className={`mb-4 text-[13.5px] leading-[1.7] text-foreground ${cls}`}>{renderRuns(b.runs)}</p>
    }
    if (b.b === 'field') {
      const v = answers[b.key] ?? ''
      return (
        <div key={i} className="mb-4">
          <label htmlFor={`f-${b.key}`} className="mb-1 block text-[12px] font-semibold text-foreground">
            {b.label}{b.required && <span className="ml-1 text-danger-text">*</span>}
          </label>
          <div className="flex items-center gap-2">
            {b.prefix && <span className="text-[13px] text-muted-foreground">{b.prefix}</span>}
            {b.input === 'textarea' ? (
              <textarea id={`f-${b.key}`} rows={3} value={v} disabled={readOnly}
                onChange={e => setAnswer(b.key, e.target.value)}
                className="w-full rounded-[9px] border px-3 py-2 text-[13px] focus-visible:border-brand focus-visible:outline-none disabled:opacity-70" />
            ) : (
              <input id={`f-${b.key}`} type={b.input === 'phone' ? 'tel' : 'text'} value={v} disabled={readOnly}
                onChange={e => setAnswer(b.key, e.target.value)}
                className="h-10 w-full max-w-[340px] rounded-[9px] border px-3 text-[13px] focus-visible:border-brand focus-visible:outline-none disabled:opacity-70" />
            )}
          </div>
        </div>
      )
    }
    if (b.b === 'radio') {
      const v = answers[b.key] ?? ''
      return (
        <fieldset key={i} className="mb-4">
          <legend className="mb-1 text-[12px] font-semibold text-foreground">
            {b.label}{b.required && <span className="ml-1 text-danger-text">*</span>}
          </legend>
          <div className="flex flex-wrap gap-4">
            {b.options.map(opt => (
              <label key={opt} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                <input type="radio" name={`r-${b.key}`} checked={v === opt} disabled={readOnly}
                  onChange={() => setAnswer(b.key, opt)} className="h-4 w-4 border-border" />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>
      )
    }
    if (b.b === 'check') {
      const checked = (answers[b.key] ?? '') === 'true'
      return (
        <label key={i} className="mb-3 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-[1.6]">
          <input type="checkbox" checked={checked} disabled={readOnly}
            onChange={e => setAnswer(b.key, e.target.checked ? 'true' : 'false')}
            className="mt-1 h-4 w-4 rounded border-border" />
          <span>{renderRuns(b.runs)}</span>
        </label>
      )
    }
    if (b.b === 'signature') {
      const s = sigs[b.key]
      const signedAt = signedAtByKey.get(b.key) ?? null
      return (
        <div key={i} className="mb-3 rounded-[12px] border bg-hoverrow/40 px-4 py-3">
          <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{b.roleLabel}</p>
          {readOnly ? (
            s.full_name.trim() === '' ? (
              <p className="text-[13px] italic text-muted-foreground">Non signé</p>
            ) : (
              <p className="text-[13.5px]">
                Signé électroniquement par <strong>{s.full_name}</strong>
                {signedAt && <> le {SIGNED_AT.format(new Date(signedAt))}</>} — « Lu et approuvé »
              </p>
            )
          ) : (
            <>
              <input
                aria-label={`Nom complet — ${b.roleLabel}`}
                placeholder="Nom complet"
                value={s.full_name}
                onChange={e => setSig(b.key, { full_name: e.target.value })}
                className="mb-2 h-10 w-full max-w-[340px] rounded-[9px] border px-3 text-[13px] focus-visible:border-brand focus-visible:outline-none"
              />
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" checked={s.approved}
                  aria-label={`Lu et approuvé — ${b.roleLabel}`}
                  onChange={e => setSig(b.key, { approved: e.target.checked })}
                  className="h-4 w-4 rounded border-border" />
                « Lu et approuvé »
              </label>
            </>
          )}
        </div>
      )
    }
    return <hr key={i} className="my-6 border-dashed border-frame-dashed" />
  }

  return (
    <div className="space-y-1">
      <div className="rounded-[14px] border bg-card px-6 py-7 sm:px-9">
        {def.blocks.map(renderBlock)}
      </div>

      {!readOnly && (
        <>
          <p className="pt-3 text-[12px] leading-relaxed text-muted-foreground">
            En cochant « Lu et approuvé » puis en envoyant ce formulaire, chaque signataire
            appose une signature électronique : son nom complet ainsi que la date et l’heure
            d’envoi sont enregistrés et figurent sur le document PDF final.
          </p>
          {error && <p className="pt-1 text-sm text-danger-text">{error}</p>}
          <div className="flex gap-3 pt-3">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={loading !== null}>
              {loading === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={loading !== null} className="bg-brand hover:bg-brand-hover">
              {loading === 'submit' ? 'Envoi…' : 'Signer et envoyer'}
            </Button>
          </div>
        </>
      )}
      {readOnly && error && <p className="pt-2 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run components/__tests__/FillableForm.test.tsx` → PASS.

- [ ] **Step 5: Wire the student page.** In `app/(student)/my-forms/[assignmentId]/page.tsx`:

Add imports:

```tsx
import { FillableForm } from '@/components/FillableForm'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { resolveVariables, type ResolvedVariables } from '@/lib/forms/fillable/render'
import type { FillableDefinition } from '@/lib/forms/fillable/types'
import { getProfile } from '@/lib/supabase/request'
```

After the `templatePdfUrl` block, add the fillable data fetch:

```tsx
  // Fillable templates: resolve program variables + prefill under the
  // student's own RLS session (enrolled students may read the details row).
  let fillable: { def: FillableDefinition; values: ResolvedVariables; studentName: string } | null = null
  if (template.kind === 'fillable' && template.standard_key) {
    const def = FILLABLE_DEFINITIONS[template.standard_key]
    if (def) {
      const supabase = await createClient()
      const [{ data: exchange }, { data: details }, profile] = await Promise.all([
        supabase.from('exchanges').select('name').eq('id', template.exchange_id).maybeSingle(),
        supabase.from('exchange_program_details').select('*').eq('exchange_id', template.exchange_id).maybeSingle(),
        getProfile(),
      ])
      fillable = {
        def,
        values: resolveVariables({ exchangeName: exchange?.name ?? '', details }),
        studentName: profile?.full_name ?? '',
      }
    }
  }
```

Change the `data_entry` render guard so fillable doesn't fall into `DataEntryForm` (fillable rows are `type: 'data_entry'`):

```tsx
      {fillable && (
        <FillableForm
          assignmentId={assignmentId}
          def={fillable.def}
          values={fillable.values}
          initialData={submission?.fillable_data ?? null}
          readOnly={readOnly}
          studentName={fillable.studentName}
        />
      )}

      {template.type === 'data_entry' && template.kind !== 'fillable' && (
        <DataEntryForm … unchanged … />
      )}
```

Also update the « submitted » banner copy path: no change needed (status flow identical).

- [ ] **Step 6: Type-check + student-page suites**

```bash
npx tsc --noEmit
pnpm vitest run components/__tests__ app/__tests__
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/FillableForm.tsx components/__tests__/FillableForm.test.tsx 'app/(student)/my-forms/[assignmentId]/page.tsx'
git commit -m "feat(fillable): student fill & e-sign page"
```

---

### Task 9: Wire `kind: 'fillable'` into the library + activation gate + organizer UI

**Files:**
- Modify: `lib/forms/standard-library.ts` (flip 4 entries; fix insert type/slot guard)
- Modify: `actions/forms.ts` (`activateTemplate` fillable branch; `getOwnedTemplate` select)
- Modify: `lib/forms/rollup.ts` (`TemplateKind`, `typePill`, `activationHints`)
- Modify: `lib/forms/card.ts` (`previewMode`)
- Modify: `components/forms/TemplateIcon.tsx`, `components/forms/TemplateCard.tsx`, `components/forms/TemplateEditor.tsx`, `components/forms/FormDrawer.tsx`
- Modify: `messages/*.json` (5 locales — one new pill label)
- Test: `lib/forms/__tests__/rollup.test.ts` (extend), `actions/__tests__/forms-activate-fillable.test.ts` (new)

**Interfaces:**
- Consumes: `missingDetailLabels` (Task 2), `FILLABLE_DEFINITIONS` (Task 3), `ProgramDetailsValues` (Task 2 types).
- Produces: `activateTemplate` rejects fillable activation with a structured message listing missing program-detail labels; library adds create fillable drafts correctly (data_entry, no slot, no fields).

- [ ] **Step 1: Flip the standard-library entries + fix the insert.** In `lib/forms/standard-library.ts`:

Change the 4 entries `medical`, `decharge`, `absence`, `famille` from `kind: 'pdf'` to `kind: 'fillable'` and set their `fields: []` (fillable forms carry no `form_fields` — the structure is in code). Leave `ast` as `kind: 'pdf'` (it's a real CERFA PDF, out of scope). Example for `medical`:

```ts
  {
    key: 'medical', kind: 'fillable', audience: 'all', name: 'Autorisation médicale',
    condition_label: null, external_url: null,
    description: 'Autorisation de soins à remplir et signer en ligne par les parents.',
    fields: [],
  },
```
Apply the analogous change to `decharge`, `absence`, `famille` (update each `description` to say « à remplir et signer en ligne » instead of « télécharger … redéposer »). Update the `StandardTemplate.kind` type union:

```ts
  kind: 'online' | 'pdf' | 'doc' | 'fillable'
```

Fix `insertStandardTemplate` — the type mapping and the slot insertion must treat fillable like online (data_entry, no document_slot):

```ts
      type: std.kind === 'online' || std.kind === 'fillable' ? 'data_entry' : 'document_upload',
```
```ts
  if (std.kind !== 'online' && std.kind !== 'fillable') {
    const { error: slotError } = await supabase
      .from('document_slots')
      .insert({ template_id: templateId, label: std.name, description: null, required: true, order: 0 })
    if (slotError) throw slotError
  }
```

- [ ] **Step 2: Update the existing add-standard-template test** if it asserts a document_slot for these keys.

```bash
pnpm vitest run actions/__tests__/add-standard-template.test.ts
```
If it fails because a flipped key no longer inserts a slot, adjust that test's expectations (fillable keys → no slot, type data_entry). If it uses a key you didn't flip (e.g. `esta`/`ast`), it stays green untouched.

- [ ] **Step 3: Write the failing activation test** (`actions/__tests__/forms-activate-fillable.test.ts`) — mock pattern from `actions/__tests__/forms.test.ts`, extended with program-details + exchange rows:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string; role: 'organizer' | 'student'; profileSchool: string
  template: { school_id: string; kind: string; standard_key: string | null; status: string; deadline: string | null; exchange_id: string; audience: string }
  details: Record<string, unknown> | null
  updated: boolean
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, in: () => builder,
        update: () => { scenario.updated = true; return { eq: async () => ({ error: null }) } },
        insert: async () => ({ error: null }),
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'form_templates') return { data: { id: 't-1', ...scenario.template, template_file_path: null, form_fields: [] }, error: null }
          if (table === 'exchange_program_details') return { data: scenario.details, error: null }
          if (table === 'exchanges') return { data: { id: scenario.template.exchange_id, archived_at: null }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))

import { activateTemplate } from '../forms'

const fullDetails = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('activateTemplate for fillable', () => {
  beforeEach(() => {
    scenario = {
      userId: 'org-1', role: 'organizer', profileSchool: 'school-1',
      template: { school_id: 'school-1', kind: 'fillable', standard_key: 'decharge', status: 'draft', deadline: '2026-10-01', exchange_id: 'ex-1', audience: 'all' },
      details: fullDetails, updated: false,
    }
  })

  it('activates when program details are complete', async () => {
    const r = await activateTemplate('t-1')
    expect(r).toEqual({ ok: true })
    expect(scenario.updated).toBe(true)
  })

  it('blocks with a message listing missing details', async () => {
    scenario.details = { ...fullDetails, destination: null, chaperones: [] }
    const r = await activateTemplate('t-1')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('Destination')
      expect(r.message).toContain('Accompagnateurs')
    }
    expect(scenario.updated).toBe(false)
  })

  it('blocks when no details row exists at all', async () => {
    scenario.details = null
    const r = await activateTemplate('t-1')
    expect(r.ok).toBe(false)
    expect(scenario.updated).toBe(false)
  })

  it('still requires a deadline', async () => {
    scenario.template.deadline = null
    const r = await activateTemplate('t-1')
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 4: Run to verify failure** — `pnpm vitest run actions/__tests__/forms-activate-fillable.test.ts` → FAIL.

- [ ] **Step 5: Implement the activation gate.** In `actions/forms.ts`:

Add imports:

```ts
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { missingDetailLabels } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'
```

`getOwnedTemplate` already selects `standard_key` and `exchange_id` — confirm the select string includes both (it does). In `activateTemplate`, after the existing `online` check and before the conditional-audience block, add:

```ts
  if (tmpl.kind === 'fillable') {
    const def = tmpl.standard_key ? FILLABLE_DEFINITIONS[tmpl.standard_key] : undefined
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
```

- [ ] **Step 6: Run to verify pass** — `pnpm vitest run actions/__tests__/forms-activate-fillable.test.ts` → PASS.

- [ ] **Step 7: Add the display branches + extend rollup test.**

`lib/forms/rollup.ts`:
- `export type TemplateKind = 'online' | 'pdf' | 'doc' | 'fillable'`
- `typePill`: add a fillable case before the online/pdf ternary:

```ts
export function typePill(kind: TemplateKind, t: T): Pill {
  if (kind === 'fillable') return { kind: 'info', label: t('organizer.forms.pills.fillable') }
  return kind === 'online'
    ? { kind: 'info', label: t('organizer.forms.pills.onlineForm') }
    : { kind: 'neutral', label: t('organizer.forms.pills.pdfToSign') }
}
```
- `activationHints`: fillable needs only the deadline gate here (program-details completeness is enforced server-side with a precise message). The existing `if (t.kind === 'pdf' …)` and `if (t.kind === 'online' …)` lines already skip fillable — no change needed beyond confirming fillable falls through to just the deadline hint.

Add to `lib/forms/rollup.ts` test (`lib/forms/__tests__/rollup.test.ts`):

```ts
it('typePill labels fillable distinctly', () => {
  const t = ((k: string) => k) as never
  expect(typePill('fillable', t)).toEqual({ kind: 'info', label: 'organizer.forms.pills.fillable' })
})
it('activationHints for a fillable draft with a deadline is empty', () => {
  expect(activationHints({ status: 'draft', kind: 'fillable', deadline: '2026-10-01', template_file_path: null, fields: [] })).toEqual([])
})
```
(Import `typePill` if not already imported in that test file.)

`lib/forms/card.ts` `previewMode`: map fillable to the online-paper look (a form the student fills):

```ts
export function previewMode(t: Pick<TemplateVM, 'kind' | 'template_file_path'>): PreviewMode {
  if (t.kind === 'online' || t.kind === 'fillable') return 'online-paper'
  if (t.kind === 'doc') return 'doc-placeholder'
  return t.template_file_path ? 'pdf-file' : 'pdf-missing'
}
```
(Fillable templates have an empty `fields` array, so `PaperFields` renders its skeleton lines — acceptable; no card-render change required.)

`components/forms/TemplateIcon.tsx`: fillable should not render the pdf third line and should use the brand color like online. Change the two conditions:

```tsx
        (kind === 'online' || kind === 'fillable') ? 'bg-brand' : 'bg-rail',
```
and the inner document lines already render for the non-doc branch; the `kind === 'pdf'` extra line stays pdf-only — fillable falls into the online-looking icon. Good, no other change.

`components/forms/TemplateEditor.tsx`: fillable must NOT show the FormBuilder or the PDF replacer; show an explanatory panel instead. Change the FormBuilder guard from `template.kind !== 'doc'` to `template.kind === 'online'`, and add a fillable panel:

```tsx
      {template.kind === 'fillable' && (
        <div className="rounded-[14px] border bg-card p-5 text-[13.5px] leading-relaxed text-muted-foreground">
          Ce formulaire est prêt à l’emploi : son texte et ses champs sont prédéfinis et
          se remplissent automatiquement avec les <strong>détails du programme</strong>
          (Réglages → Programme). Les familles le complètent et le signent en ligne ; un
          PDF signé est généré à l’envoi.
        </div>
      )}

      {template.kind === 'online' && (
        <div className="rounded-[14px] border bg-card p-5">
          <FormBuilder
            templateId={template.id}
            mode="questions"
            fields={[...template.form_fields].sort((a, b) => a.order - b.order)}
          />
        </div>
      )}

      {template.kind === 'doc' && (
        <div className="rounded-[14px] border bg-card p-5">
          <FormBuilder
            templateId={template.id}
            mode="checklist"
            fields={[...template.form_fields].sort((a, b) => a.order - b.order)}
          />
        </div>
      )}
```
(Replaces the single `template.kind !== 'doc'` block. The `doc` checklist path was already reached via `kind !== 'doc'` being false — wait: previously `kind !== 'doc'` rendered FormBuilder for online AND pdf; `doc` rendered nothing here. Preserve exactly: online → questions, pdf → checklist, doc → nothing, fillable → info panel. So:)

Corrected final structure for that region:

```tsx
      {template.kind === 'fillable' && ( /* info panel above */ )}
      {(template.kind === 'online' || template.kind === 'pdf') && (
        <div className="rounded-[14px] border bg-card p-5">
          <FormBuilder
            templateId={template.id}
            mode={template.kind === 'online' ? 'questions' : 'checklist'}
            fields={[...template.form_fields].sort((a, b) => a.order - b.order)}
          />
        </div>
      )}
```
(The PDF-replace block at `template.kind === 'pdf'` is unchanged and correctly excludes fillable.)

`components/forms/FormDrawer.tsx`: the drawer's fields heading uses `vm.kind === 'pdf' ? …Pdf : …Online`. Fillable falls to the Online heading and shows the empty-fields note. Replace the empty-fields note for fillable with a purpose line. Change the fields section so fillable shows a dedicated note instead of `emptyFields`:

```tsx
          {vm.kind === 'fillable' ? (
            <div className="rounded-xl border border-dashed border-frame bg-hoverrow p-[18px] text-[13px] leading-normal text-muted-foreground">
              {t('forms.drawer.fillableNote')}
            </div>
          ) : vm.fields.length > 0 ? (
            /* existing fields list unchanged */
          ) : (
            /* existing emptyFields note unchanged */
          )}
```

- [ ] **Step 8: Add the two new i18n keys** (`organizer.forms.pills.fillable`, `organizer.forms.drawer.fillableNote`) in all 5 locales.

fr: `"fillable": "À signer en ligne"`, `"fillableNote": "Formulaire prêt à l’emploi : rempli et signé en ligne par la famille, avec les détails du programme insérés automatiquement."`
en: `"fillable": "Sign online"`, `"fillableNote": "Ready-to-use form: filled in and signed online by the family, with the program details inserted automatically."`
es: `"fillable": "Firmar en línea"`, `"fillableNote": "Formulario listo para usar: la familia lo rellena y firma en línea, con los detalles del programa insertados automáticamente."`
it: `"fillable": "Firma online"`, `"fillableNote": "Modulo pronto all’uso: compilato e firmato online dalla famiglia, con i dettagli del programma inseriti automaticamente."`
de: `"fillable": "Online unterschreiben"`, `"fillableNote": "Gebrauchsfertiges Formular: von der Familie online ausgefüllt und unterschrieben, mit automatisch eingefügten Programmdetails."`

- [ ] **Step 9: Run the affected suites + type-check**

```bash
pnpm vitest run lib/forms actions/__tests__/forms.test.ts actions/__tests__/forms-activate-fillable.test.ts actions/__tests__/add-standard-template.test.ts messages
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/forms/ actions/forms.ts components/forms/ messages/ actions/__tests__/forms-activate-fillable.test.ts
git commit -m "feat(fillable): library flip + activation gate + organizer kind branches"
```

---

### Task 10: Organizer review — read-only document + signed-PDF download

**Files:**
- Modify: `actions/submissions.ts` (`getSubmissionForReview`: fillable data + signed PDF URL)
- Modify: `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx`
- Modify: `messages/*.json` (5 locales — download-PDF label)
- Test: extend `actions/__tests__/submissions.test.ts` if it covers `getSubmissionForReview` (else add `actions/__tests__/submissions-fillable-review.test.ts`)

**Interfaces:**
- Consumes: `FILLABLE_DEFINITIONS` + `resolveVariables` (server side), `FillableForm` in read-only mode (Task 8), the `documents` bucket signed-URL pattern already in `getSubmissionForReview`.
- Produces: review page renders the completed fillable document read-only + a « Télécharger le PDF signé » link.

- [ ] **Step 1: Extend `getSubmissionForReview`** in `actions/submissions.ts` to attach a signed URL for `generated_pdf_path`. The function already selects `submissions('*')` (so `fillable_data` + `generated_pdf_path` come along). After the `document_uploads` signed-URL block, add:

```ts
  // Fillable submissions: sign the generated PDF (documents bucket, same
  // assignment-scoped policy as uploads) for the organizer download button.
  let generatedPdfUrl: string | null = null
  if (submission?.generated_pdf_path) {
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(submission.generated_pdf_path, 3600, { download: true })
    generatedPdfUrl = data?.signedUrl ?? null
  }
```
and add `generatedPdfUrl` to the returned object:

```ts
  return { assignment, template: template!, student, submission, generatedPdfUrl }
```
(If TypeScript complains that `submission` typing lacks `generated_pdf_path`, cast the `.maybeSingle<…>()` generic to include `generated_pdf_path?: string | null` and `fillable_data?: FillableData | null` — import `FillableData` from `@/types/db`.)

- [ ] **Step 2: Render the fillable branch on the review page.** In `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx`:

Add imports:

```tsx
import { FillableForm } from '@/components/FillableForm'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { resolveVariables } from '@/lib/forms/fillable/render'
import { createClient } from '@/lib/supabase/server'
```

Destructure `generatedPdfUrl` from `getSubmissionForReview`. Before the `data_entry` block, resolve the fillable view (organizer reads the details under their own RLS — they manage the row):

```tsx
  let fillableView: React.ReactNode = null
  if (submission && template.kind === 'fillable' && template.standard_key && submission.fillable_data) {
    const def = FILLABLE_DEFINITIONS[template.standard_key]
    if (def) {
      const supabase = await createClient()
      const [{ data: exchange }, { data: details }] = await Promise.all([
        supabase.from('exchanges').select('name').eq('id', template.exchange_id).maybeSingle(),
        supabase.from('exchange_program_details').select('*').eq('exchange_id', template.exchange_id).maybeSingle(),
      ])
      fillableView = (
        <div className="space-y-4">
          {generatedPdfUrl && (
            <a href={generatedPdfUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[9px] border bg-card px-4 py-2.5 text-[13px] font-semibold text-navy hover:bg-hoverrow">
              ⬇ {t('pages.submissionReview.downloadSignedPdf')}
            </a>
          )}
          <FillableForm
            assignmentId={assignmentId}
            def={def}
            values={resolveVariables({ exchangeName: exchange?.name ?? '', details })}
            initialData={submission.fillable_data}
            readOnly={true}
            studentName={student?.full_name ?? ''}
          />
        </div>
      )
    }
  }
```
Render `{fillableView}` where the `data_entry` block is, and guard the existing `data_entry` block so fillable doesn't double-render:

```tsx
      {submission && template.type === 'data_entry' && template.kind !== 'fillable' && ( /* existing */ )}
      {fillableView}
```

- [ ] **Step 3: Add the i18n key** `organizer.pages.submissionReview.downloadSignedPdf` in all 5 locales:
fr `"Télécharger le PDF signé"`, en `"Download signed PDF"`, es `"Descargar el PDF firmado"`, it `"Scarica il PDF firmato"`, de `"Signiertes PDF herunterladen"`.

- [ ] **Step 4: Test.** If `actions/__tests__/submissions.test.ts` exercises `getSubmissionForReview`, add a case asserting `generatedPdfUrl` is populated when `generated_pdf_path` is set (mock `storage.from().createSignedUrl` to return a URL). Otherwise add a focused test file mirroring the existing submissions mock. Run:

```bash
pnpm vitest run actions/__tests__/submissions.test.ts messages
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/submissions.ts 'app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx' messages/ actions/__tests__/
git commit -m "feat(fillable): organizer review — read-only document + signed-PDF download"
```

---

### Task 11: RLS matrix cases + full verification gate

**Files:**
- Modify: `tests/rls/seed.ts` (seed a program-details row + a fillable template/submission for school A)
- Modify: `tests/rls/matrix.test.ts` (deny + allow cases for `exchange_program_details`)
- Test: `pnpm test:rls`

**Interfaces:**
- Consumes: the migration from Task 1 (must be applied to the RLS test DB — local stack or `RLS_TEST_DB_URL`).
- Produces: green RLS matrix proving partner-school isolation of `exchange_program_details`.

- [ ] **Step 1: Seed a program-details row.** In `tests/rls/seed.ts`, after the exchange-A rows are inserted, add:

```ts
  await sql`insert into exchange_program_details (exchange_id, destination, chaperones, association_name)
    values (${fx.exchangeA}, 'le Minnesota', array['Polly STEPHANY'], 'AGESSIA')`
```
(No new `Fixtures` fields needed — it keys off `fx.exchangeA`, already seeded. `studentA` is enrolled in `exchangeA` via existing seed rows; confirm by checking the existing enrollment insert — if `studentA` is only enrolled in `exchangeShared`, add an `exchange_enrollments` row for `(exchangeA, studentA)` so the student-allow case has a true positive.)

- [ ] **Step 2: Add matrix cases.** In `tests/rls/matrix.test.ts`, in the cross-tenant deny `describe.each` block add:

```ts
  it('exchange_program_details: cannot read school A details', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select exchange_id from exchange_program_details where exchange_id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchange_program_details: cannot upsert school A details', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchange_program_details set destination = 'pwned' where exchange_id = ${fx.exchangeA}`))
  })

  it('exchange_program_details: cannot insert into school A exchange', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into exchange_program_details (exchange_id, destination) values (${fx.exchangeA}, 'pwned')`))
  })
```

In the allow section (find the block where `orgA` reads/writes school-A rows), add:

```ts
  it('organizer A reads own program details', async () => {
    expect(await readRows(fx.orgA, (tx) =>
      tx`select destination from exchange_program_details where exchange_id = ${fx.exchangeA}`)).toHaveLength(1)
  })

  it('organizer A updates own program details', async () => {
    writeOutcome(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchange_program_details set destination = 'le Wisconsin' where exchange_id = ${fx.exchangeA}`))
  })

  it('enrolled student A reads program details', async () => {
    expect(await readRows(fx.studentA, (tx) =>
      tx`select destination from exchange_program_details where exchange_id = ${fx.exchangeA}`)).toHaveLength(1)
  })

  it('enrolled student A cannot write program details', async () => {
    expectBlocked(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`update exchange_program_details set destination = 'pwned' where exchange_id = ${fx.exchangeA}`))
  })
```
Fix the `organizer A updates` case to the file's actual allow-write helper (grep the existing allow block for how a successful write is asserted — likely `expect(await writeOutcome(...)).toBe(...)` or a plain `await runAs`). Match that exact style; don't invent a helper.

- [ ] **Step 3: Ensure the migration is on the RLS DB, then run.**

```bash
# local stack: apply pending migrations to the test DB
npx supabase db reset   # or the project's documented RLS-DB migration step (docs/security/rls-testing.md)
pnpm test:rls
```
Expected: all matrix cases PASS, including the new `exchange_program_details` deny/allow cases. If the `partner-boundary` block (school C) has its own read cases, add a deny case there too proving school C (partner) cannot read A's details unless a policy intends it — the policy scopes to `exchange_in_my_school`, and school C IS on `exchangeShared` not `exchangeA`, so C must NOT read `exchangeA`'s details: assert length 0.

- [ ] **Step 4: Full verification gate.**

```bash
pnpm lint
pnpm vitest run --exclude 'tests/rls/**'
npx tsc --noEmit    # (or pnpm build if .env.local is real)
pnpm test:rls
```
Expected: all green. Fix any failure before proceeding — do not open the PR on red.

- [ ] **Step 5: Commit**

```bash
git add tests/rls/seed.ts tests/rls/matrix.test.ts
git commit -m "test(fillable): RLS matrix cases for exchange_program_details"
```

- [ ] **Step 6: Open the PR** (autonomy stops here — never merge). Push the branch and open a PR whose body lists the merge-time manual steps:

```
## Merge-time steps (do NOT let the loop run these)
1. Apply the migration to PROD via MCP `apply_migration`
   (name `fillable_forms`) — staging was applied during the build.
2. Regenerate prod types if the prod ledger stamps a different version
   (`git mv` the migration file to the stamped version per CLAUDE.md → Database).
3. Verify `@react-pdf/renderer` is in the deployed bundle (Vercel build).
4. Smoke-test on the preview: add « Autorisation médicale » from the library,
   fill Détails du programme, activate, sign as a seeded student, download the PDF.
```

Verify the branch is `feature/fillable-forms`, then:

```bash
git push -u origin feature/fillable-forms
gh pr create --title "Fillable, signable standard forms" --body "$(cat <<'BODY'
Ships the 4 standard forms (décharge, absence, engagement, medical) as
fillable + e-signable templates (kind 'fillable'), per-exchange program
details, and a generated signed PDF per submission.

Spec: docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md
Plan: docs/superpowers/plans/2026-07-19-fillable-signable-forms.md

## Merge-time steps (do NOT let the loop run these)
1. Apply the migration to PROD via MCP apply_migration (name `fillable_forms`).
2. Regenerate prod types if the ledger stamps a different version; git mv the file.
3. Verify @react-pdf/renderer is bundled in the Vercel build.
4. Preview smoke test: add Autorisation médicale, fill Détails du programme,
   activate, sign as a seeded student, download the PDF.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- New kind `fillable` + code definitions → Tasks 1, 3. ✅
- `exchange_program_details` table + Settings card → Tasks 1, 5, 6. ✅
- Activation gate (missing details) → Task 9. ✅
- Student fill + all-signatories-one-session e-sign → Tasks 7, 8. ✅
- Server-stamped signatures, PDF gen, submissions columns, documents bucket → Tasks 1, 4, 7. ✅
- Organizer review + signed-PDF download → Task 10. ✅
- Content-fidelity rules (neutralized instructions, bilingual medical, single-parent) → Task 3 + `requireOneOf`. ✅
- RLS (partner isolation, student read) → Tasks 1, 11. ✅
- Structured errors / no PII / no admin client → enforced throughout (Global Constraints + Task 7 PDF-failure path). ✅
- Existing pdf-kind templates keep working (only new adds are fillable; `ast` stays pdf) → Task 9. ✅
- i18n organizer copy in 5 locales → Tasks 6, 9, 10. ✅

**Type consistency:** `FillableInput`/`FillableData`/`FillableSignature`, `resolveVariables`→`ResolvedVariables`, `validateFillable`, `signatureBlocks`, `missingDetailLabels`, `renderFillablePdf` signatures are defined once (Tasks 1–4) and referenced with the same shapes in Tasks 5–10. Storage path `${assignmentId}/fillable/${submissionId}.pdf` is identical in the migration comment, the action (Task 7), and the review signer (Task 10).

**Known judgment calls left to the implementer (flagged inline):** exact `@react-pdf/renderer` buffer API for the installed major (Task 4 Step 7); font package file layout (Task 4 Step 3); the RLS allow-write assertion helper style (Task 11 Step 2); whether `studentA` needs an explicit `exchangeA` enrollment in the seed (Task 11 Step 1).
