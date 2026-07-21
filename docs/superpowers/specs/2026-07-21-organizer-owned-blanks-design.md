# Organizer-owned blanks in fillable forms

**Date:** 2026-07-21
**Status:** approved

## Problem

In `kind:'fillable'` templates, two student-editable blanks hold a value the
organizer already owns:

- `decharge.ts` — « Fait à ___ » (`{t:'blank', key:'parents_place'}`)
- `absence.ts` — « Fait à ___ » (`{t:'blank', key:'place'}`)

Both ask the student to type the sending school's city. The organizer already
enters that city once per exchange as `exchange_program_details.sending_city`
(Réglages → Programme), and `absence.ts` **already renders it as a variable at
the top of the same document** (« {sending_city}, le {today} ») before asking
the student to retype it at the bottom. Same value, two owners, two chances to
disagree — on a document that gets signed and archived as a PDF.

## Ownership rule

The existing model is correct and stays:

| construct | owner | rendering |
|---|---|---|
| `{t:'var'}` | organizer / program data | fixed bold text, not editable |
| `{t:'blank'}`, `field`, `radio`, `check`, `signature` | student / parent | editable input |

**Rule:** if the source document shows an empty line the family fills in, it is
a student blank. If the value is program-specific (dates, chaperones,
destination, schools, city), it is an organizer variable.

Audited against that rule, every other input in the four definitions is
correctly assigned and is **not** touched by this change:

- `parent1_name`, `parent2_name`, `parent_name` — parent-known
- `mother_phone`, `father_phone`, `medical_needs`, `regime` — parent-known
- `host_family` — an empty line on the source document, marked « si connue »;
  per-student, and the app has no host-family/pairing model. Stays student.
- `student_name`, `child_name`, `conduct_student_name` — prefilled from the
  profile but stay editable so a family can correct a spelling
- the consent checkboxes and all signature blocks

## Design

### 1. Definition edits

- `lib/forms/fillable/decharge.ts`: replace the `parents_place` blank run with
  `{ t: 'var', name: 'sending_city' }`, and add `'sending_city'` to the
  definition's `variables` array.
- `lib/forms/fillable/absence.ts`: replace the `place` blank run with
  `{ t: 'var', name: 'sending_city' }`. Its `variables` already lists
  `sending_city`; no other change.

No new run/block kinds, no schema change, no migration.

### 2. Activation-gate consequence (intended)

`VARIABLE_REQUIREMENTS['sending_city'] = ['sending_city']`, and
`missingDetailLabels()` drives both the activation gate and the organizer hint.
Adding the variable to `decharge` therefore means **the décharge can no longer
be activated until « Ville du lycée » is filled**. That is the correct outcome
— without it the document would print « Fait à … ». The absence form already
carries this requirement, so no organizer who can activate the absence form is
newly blocked.

This composes with the pending `feature/instant-activation` spec, whose add-time
fallback collects missing program details in the library row expansion.

### 3. Stale draft answers

`validateFillable()` rejects any answer key the definition does not declare
(`MSG_UNKNOWN`, « Données de formulaire invalides »). A student holding a saved
draft whose `answers` still contain `place` / `parents_place` would hit that on
their next save with no way out.

Fix on the client, keeping server validation strict: in `FillableForm`'s
`initialAnswers` builder, filter `initialData.answers` down to the keys the
current definition declares. Stale keys are dropped on load and never
resubmitted.

Implementation: export a helper from `lib/forms/fillable/render.ts` that returns
the set of declared answer keys for a definition — the private `answerKeys()`
already computes exactly this, so promote it rather than duplicating the
traversal. `FillableForm` consumes it; `validateFillable` keeps using it
unchanged.

### 4. Already-submitted documents

An archived submission that stored `parents_place` now renders the organizer's
`sending_city` in that slot instead of the parent-typed string. Prod holds test
data only, so no reconciliation is needed. The generated PDF
(`lib/pdf/fillable-pdf.tsx`) walks the same definition and needs no change: it
resolves the run as a variable like any other.

## Testing

- `lib/forms/fillable/__tests__/definitions.test.ts` — assert neither definition
  declares a `place` / `parents_place` answer key, and that `decharge.variables`
  includes `sending_city`.
- `lib/forms/fillable/__tests__/` (render) — `missingDetailLabels(decharge, …)`
  reports « Ville du lycée » when `sending_city` is blank.
- `components/__tests__/FillableForm.test.tsx` — mounting with
  `initialData.answers` containing a key the definition no longer declares
  drops it, and saving does not send it.

Existing coverage for `validateFillable`'s unknown-key rejection stays as is —
that behaviour is deliberately unchanged.

## Out of scope

- Adding « , le {today} » to the décharge's « Fait à » line (the absence form
  dates itself at the top; the décharge's source PDF has no date there).
- Any host-family / pairing model.
- An explicit `owner` discriminator on runs and blocks. With four hand-written
  definitions the ownership rule above plus review is enough; revisit if the
  definition set grows.
