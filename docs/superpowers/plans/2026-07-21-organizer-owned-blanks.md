# Organizer-owned blanks in fillable forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop asking the student to type the sending school's city on the décharge and absence forms — render it from the organizer's `sending_city` program detail instead.

**Architecture:** Two `{t:'blank'}` runs in the code-defined fillable definitions become `{t:'var', name:'sending_city'}`. Because `validateFillable()` rejects answer keys a definition no longer declares, a compatibility step lands first: `FillableForm` prunes stale keys out of a saved draft on load, so an in-flight draft carrying `place` / `parents_place` keeps saving.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, Vitest + @testing-library/react, pnpm.

## Global Constraints

- Package manager is **pnpm**, never npm.
- Work happens in the worktree `/home/bjorn/eazyexchange/.claude/worktrees/organizer-owned-blanks` on branch `feature/organizer-owned-blanks`. All paths below are relative to that directory. Do not touch the main checkout.
- **No straight apostrophes in French strings** — typographic `’` only. `definitions.test.ts` enforces this for definition text.
- No schema change, no migration, no RLS change in this plan. `pnpm test:rls` is not required.
- Spec: `docs/superpowers/specs/2026-07-21-organizer-owned-blanks-design.md`.
- Run the full gate before the branch is considered done: `pnpm lint`, `pnpm test`, `pnpm build`.

---

### Task 1: Prune stale answer keys from saved drafts

`lib/forms/fillable/render.ts` already computes the set of answerable keys in a
private `answerKeys()` helper used by `validateFillable()`. Promote a
set-returning wrapper so the client can reuse the same traversal instead of
duplicating it, then have `FillableForm` filter loaded draft answers through it.

**Files:**
- Modify: `lib/forms/fillable/render.ts` (add an export next to `signatureBlocks`, around line 93)
- Modify: `components/FillableForm.tsx:32-45` (the `initialAnswers` builder)
- Test: `lib/forms/fillable/__tests__/render.test.ts`
- Test: `components/__tests__/FillableForm.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `declaredAnswerKeys(def: FillableDefinition): Set<string>` exported from `lib/forms/fillable/render.ts` — every key a student can answer (blank runs, `field`, `radio`, `check`). Signature keys are **not** included; they live in `signatureBlocks()`.

- [ ] **Step 1: Write the failing test for `declaredAnswerKeys`**

In `lib/forms/fillable/__tests__/render.test.ts`, add `declaredAnswerKeys` to the existing import from `../render`:

```ts
import {
  joinNames, travelPeriodFr, travelPeriodEn, resolveVariables,
  missingDetailLabels, validateFillable, signatureBlocks, declaredAnswerKeys,
} from '../render'
```

Then append this describe block at the end of the file:

```ts
describe('declaredAnswerKeys', () => {
  it('returns every answerable key and no signature keys', () => {
    expect([...declaredAnswerKeys(def)].sort()).toEqual(['accept', 'parent1', 'parent2', 'regime'])
  })
})
```

(The file-level `def` fixture declares blanks `parent1` / `parent2`, radio `regime`, check `accept`, and signatures `sig_p1` / `sig_p2`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/forms/fillable/__tests__/render.test.ts`
Expected: FAIL — `declaredAnswerKeys is not a function` (or a TS/import error on the named export).

- [ ] **Step 3: Export the helper**

In `lib/forms/fillable/render.ts`, immediately **after** the private `answerKeys()` function (it ends at the line `}` following `return out`, around line 110) add:

```ts
// Every key a student can answer — blanks, fields, radios, checks. Signature
// keys are not answers; see signatureBlocks(). Used by validateFillable() and
// by the client to drop stale keys from an older saved draft.
export function declaredAnswerKeys(def: FillableDefinition): Set<string> {
  return new Set(answerKeys(def).map(k => k.key))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/forms/fillable/__tests__/render.test.ts`
Expected: PASS, all existing cases in the file still green.

- [ ] **Step 5: Write the failing test for draft pruning**

In `components/__tests__/FillableForm.test.tsx`, add this case inside the existing `describe('FillableForm', …)` block:

```tsx
it('drops saved answer keys the definition no longer declares', async () => {
  render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'X' }}
    initialData={{ answers: { parent1: 'Jean Dupont', retired_key: 'ancienne valeur' }, signatures: [] }}
    readOnly={false} studentName="Zoé" />)
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
  await waitFor(() => expect(saveMock).toHaveBeenCalled())
  const [, input] = saveMock.mock.calls[0] as [string, { answers: Record<string, string> }, boolean]
  expect(input.answers.parent1).toBe('Jean Dupont')
  expect(input.answers).not.toHaveProperty('retired_key')
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm vitest run components/__tests__/FillableForm.test.tsx`
Expected: FAIL on the last assertion — the component currently spreads the saved answers through untouched, so `retired_key` is still sent.

- [ ] **Step 7: Filter the loaded answers**

In `components/FillableForm.tsx`, change the type-only import of the render module into a value import so the helper comes along:

```tsx
import { declaredAnswerKeys, type ResolvedVariables } from '@/lib/forms/fillable/render'
```

(Delete the old `import type { ResolvedVariables } from '@/lib/forms/fillable/render'` line.)

Then replace the `initialAnswers` builder (currently lines 33-45) with:

```tsx
  // Load the saved draft, dropping any key the definition no longer declares —
  // an older draft would otherwise fail validateFillable()'s unknown-key check
  // on the next save. Prefill student-name blanks on first open only.
  const initialAnswers = (() => {
    const declared = declaredAnswerKeys(def)
    const a: Record<string, string> = {}
    for (const [k, v] of Object.entries(initialData?.answers ?? {})) {
      if (declared.has(k)) a[k] = v
    }
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
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `pnpm vitest run components/__tests__/FillableForm.test.tsx lib/forms/fillable/__tests__/render.test.ts`
Expected: PASS, no regressions in the existing cases (variable substitution, submit payload, structured error, read-only rendering).

- [ ] **Step 9: Commit**

```bash
git add lib/forms/fillable/render.ts lib/forms/fillable/__tests__/render.test.ts components/FillableForm.tsx components/__tests__/FillableForm.test.tsx
git commit -m "fix(forms): drop stale answer keys when loading a fillable draft"
```

---

### Task 2: « Fait à » becomes the organizer's sending_city

**Files:**
- Modify: `lib/forms/fillable/decharge.ts:8-11` (variables) and `:42-46` (the « Fait à » paragraph)
- Modify: `lib/forms/fillable/absence.ts:61-65` (the « Fait à » paragraph)
- Test: `lib/forms/fillable/__tests__/definitions.test.ts`
- Test: `lib/forms/fillable/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `declaredAnswerKeys()` from Task 1 (only indirectly — the pruning it enables is what makes the removed keys safe).
- Produces: nothing new for later tasks. After this task no definition declares an answer key named `place` or `parents_place`, and `decharge.variables` includes `'sending_city'`.

- [ ] **Step 1: Write the failing definition test**

In `lib/forms/fillable/__tests__/definitions.test.ts`, add this case inside the existing `describe('fillable definitions', …)` block. It uses the file's existing `allKeys` and `usedVariables` helpers:

```ts
  it('« Fait à » is the organizer’s sending_city, never a student blank', () => {
    for (const def of defs) {
      const keys = allKeys(def.blocks)
      expect(keys).not.toContain('place')
      expect(keys).not.toContain('parents_place')
    }
    for (const key of ['decharge', 'absence'] as const) {
      const def = FILLABLE_DEFINITIONS[key]
      expect(usedVariables(def.blocks).has('sending_city')).toBe(true)
    }
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/forms/fillable/__tests__/definitions.test.ts`
Expected: FAIL — `expected [ …, 'parents_place', … ] not to contain 'parents_place'`.

- [ ] **Step 3: Swap the blank in the décharge**

In `lib/forms/fillable/decharge.ts`, replace the paragraph at lines 42-46:

```ts
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'blank', key: 'parents_place', label: 'Lieu' },
      { t: 'text', text: '.' },
    ] },
```

with:

```ts
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'var', name: 'sending_city' },
      { t: 'text', text: '.' },
    ] },
```

Then add `'sending_city'` to the `variables` array (lines 8-11) so it reads:

```ts
  variables: [
    'exchange_name', 'association_name', 'destination',
    'chaperones_et', 'chaperones_ou', 'travel_period', 'receiving_school_name',
    'sending_city',
  ],
```

`definitions.test.ts` already asserts declared variables match used variables, so omitting this line fails that existing test.

- [ ] **Step 4: Swap the blank in the absence form**

In `lib/forms/fillable/absence.ts`, replace the paragraph at lines 61-65:

```ts
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'blank', key: 'place', label: 'Lieu' },
      { t: 'text', text: '.' },
    ] },
```

with:

```ts
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'var', name: 'sending_city' },
      { t: 'text', text: '.' },
    ] },
```

Do **not** touch its `variables` array — it already lists `'sending_city'` (used at line 15).

- [ ] **Step 5: Run the definition tests to verify they pass**

Run: `pnpm vitest run lib/forms/fillable/__tests__/definitions.test.ts`
Expected: PASS, including the pre-existing « declared variables match used variables » and « keys are unique » cases.

- [ ] **Step 6: Write the failing activation-gate test**

Adding `sending_city` to the décharge means it can no longer activate without « Ville du lycée ». Pin that. In `lib/forms/fillable/__tests__/render.test.ts`, import the registry at the top of the file:

```ts
import { FILLABLE_DEFINITIONS } from '../index'
```

and append:

```ts
describe('décharge activation gate', () => {
  it('requires the sending city, because the document prints « Fait à … »', () => {
    const withoutCity: ProgramDetailsValues = { ...details, sending_city: null }
    expect(missingDetailLabels(FILLABLE_DEFINITIONS.decharge, withoutCity)).toContain('Ville du lycée')
    expect(missingDetailLabels(FILLABLE_DEFINITIONS.decharge, details)).toEqual([])
  })
})
```

(`details` is the fully-populated fixture at the top of the file; it sets `sending_city: 'Luynes'`.)

- [ ] **Step 7: Run it to confirm it passes on the new definition**

Run: `pnpm vitest run lib/forms/fillable/__tests__/render.test.ts`
Expected: PASS. If it fails with an empty array from the first assertion, Step 3's `variables` edit was missed — `missingDetailLabels()` reads `def.variables`, not the blocks.

- [ ] **Step 8: Run the whole fillable + PDF suite**

Run: `pnpm vitest run lib/forms lib/pdf components/__tests__/FillableForm.test.tsx actions/__tests__/fillable-save.test.ts actions/__tests__/submissions-fillable-review.test.ts`
Expected: PASS. The PDF renderer walks the same definition and resolves the run as a variable, so no snapshot or fixture there should need editing.

- [ ] **Step 9: Commit**

```bash
git add lib/forms/fillable/decharge.ts lib/forms/fillable/absence.ts lib/forms/fillable/__tests__/definitions.test.ts lib/forms/fillable/__tests__/render.test.ts
git commit -m "fix(forms): « Fait à » uses the organizer's sending_city, not a student blank"
```

---

### Task 3: Full gate

**Files:** none modified unless the gate turns up a failure.

**Interfaces:**
- Consumes: the working tree produced by Tasks 1 and 2.
- Produces: a branch ready for a PR.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors. A common trip-up here is an unused `ResolvedVariables` import left behind in Task 1 Step 7 — delete the stale line if lint flags it.

- [ ] **Step 2: Unit tests, excluding sibling worktrees**

The repo's vitest run sweeps `.claude/worktrees/*` in the main checkout. From inside this worktree run:

Run: `pnpm vitest run --exclude '**/.claude/**'`
Expected: PASS. Note the total test count in the PR description.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: compiles with no type errors. `.env.local` placeholders can make a local build fail for unrelated reasons; if it does, fall back to `npx tsc --noEmit` and say so explicitly in the report rather than claiming the build passed.

- [ ] **Step 4: Report**

Do not push or open a PR without Bjorn's confirmation. Report: the two definition edits, the pruning change, the test counts from Step 2, and the one behaviour change an organizer will notice — **the décharge now requires « Ville du lycée » in Réglages → Programme before it can be activated.**

---

## Manual verification (Bjorn, after merge)

1. Réglages → Programme: confirm « Ville du lycée » is filled for the active exchange.
2. Fichiers tab: the décharge activates normally; if the city is blank, the activation hint names « Ville du lycée ».
3. Open the décharge and the absence form as a student: « Fait à <ville>. » renders as fixed bold text with no input box.
4. Submit one and check the generated PDF prints the city.
