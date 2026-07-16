# Dashboard empty-rollup fix — design

**Date:** 2026-07-16
**Status:** approved by Bjorn (design conversation)

## Bug

On the Aperçu (organizer dashboard), an enrolled student with **no form/document
templates assigned** shows Formulaires « Reçu », Documents « Complet », and
Statut « Complet » — before anything has been sent. Root cause:
`lib/dashboard/rollup.ts` rolls up an empty template list as vacuously
`'complete'` (`rollupStudent`, the `dataTemplates.length === 0` /
`docTemplates.length === 0` branches).

The vacuous completeness leaks into every consumer:

- Aperçu funnel tile « Complets » reads `n / n` with nothing sent.
- `lifecycleFilter('complete')` matches every enrolled student.
- Échanges page card reads « n / n dossiers validés » (`exchangeProgress`).
- Student directory (`lib/students/directory.ts` → `buildStudentVM`, which
  runs the same rollup on the student's assigned templates only) shows
  « Dossier complet » for a student with zero assignments.

## Decisions (Bjorn)

1. Empty columns show a **neutral « — » pill** (reuse the existing
   `organizer.dashboard.pills.dash` key — no new translations). No
   explanatory pill; the existing « create your first form » action card
   already nudges the next step.
2. A student with zero assigned templates **does not count as complete** in
   the funnel tile, the « Complets » filter, or the Échanges progress.

## Design — fix semantics at the source (rollup)

All changes in `lib/dashboard/rollup.ts`; consumers inherit the fix.

### New `'none'` state

- `DossierRollup['forms']`: `'complete' | 'pending' | 'missing' | 'none'`
- `DossierRollup['docs']`: `'complete' | 'review' | 'pending' | 'missing' | 'none'`
- In `rollupStudent`: `dataTemplates.length === 0` → `forms = 'none'`;
  `docTemplates.length === 0` → `docs = 'none'` (previously `'complete'`).

### Pills

- `formsPill('none')` and `docsPill('none')` →
  `{ kind: 'neutral', label: t('organizer.dashboard.pills.dash') }`.
- `overall` (Statut): when forms **and** docs are both `'none'`, return a
  neutral « — » pill (`pills.dash`). When only one side is `'none'`, overall
  is driven by the side that has templates: forms complete + no doc slots is
  genuinely « Complet ». Ordering stays: `docs === 'review'` check first,
  then complete, late, incomplete.

### Completion helper

New exported `dossierComplete(r: DossierRollup): boolean` — true iff every
side is `'complete'` or `'none'` **and** at least one side is not `'none'`.
Replaces the three inline `r.forms === 'complete' && r.docs === 'complete'`
checks in `lifecycleFunnel`, `lifecycleFilter('complete')`, and
`exchangeProgress`.

### Ripple effects (verified, accepted)

- **Student directory:** neutral overall maps through the existing
  `KIND_TO_KEY` (`neutral → 'incomplet'`); an unassigned student sorts as
  incomplete with summary « 0 pièce attendue ». Accepted as honest-but-blunt;
  no new directory status.
- **StudentDrawer:** renders the overall pill as-is → shows « — ». No change.
- **OverviewView:** no change — enrolled rows now match the « — » applicant
  rows already render for these columns.

## Testing (TDD)

Extend `lib/dashboard/__tests__/rollup.test.ts` before the fix:

- Zero templates → `forms = 'none'`, `docs = 'none'`, overall neutral « — ».
- Forms-only exchange, all forms approved → `docs = 'none'`, overall
  « Complet », `dossierComplete` true.
- Zero templates → funnel « Complets » count 0, `lifecycleFilter('complete')`
  empty, `exchangeProgress` done = 0.

Gate: `pnpm lint && pnpm test` + `npx tsc --noEmit` (exhaustive switches in
the pill helpers make missed `'none'` handling a compile error).

## Scope

Pure derivation-library change: no migration, no RLS impact, no new
translation keys. Straight-to-main candidate once green.
