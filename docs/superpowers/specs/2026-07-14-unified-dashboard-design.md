# Unified Organizer Dashboard (phase removal) — Design

**Date:** 2026-07-14
**Status:** Approved (brainstormed with visual companion; mockup v2 validated)

## Goal

Remove the Phase 1 / Phase 2 distinction from the product. The Aperçu becomes a
single lifecycle view showing application progress AND formulaires/documents
progress together. Simpler, more professional, no manual mode switch.

## What exists today

- `/dashboard` renders one of two views based on `exchanges.phase` (1|2):
  Phase 1 = application funnel + applications table; Phase 2 = dossier funnel +
  student rollup table (`components/dashboard/OverviewView.tsx`,
  `lib/dashboard/rollup.ts`).
- `PhaseStepper` (right rail) toggles the phase via `setExchangePhase`.
  Flipping to Phase 2 fires a one-shot checklist email to every enrolled
  student with pending items (`sendPhase2ChecklistOnce`, stamped by
  `exchanges.phase2_checklist_sent_at`).
- The phase label also appears in the shell header pill (`OrganizerShell`),
  the Échanges cards (`ExchangesView`), and Settings (`ProgramCard`).

## Decisions (user-validated)

1. **Remove the phase concept entirely** — dashboard, shell pill, exchange
   cards, settings. No auto-derived stage label replaces it.
2. **Checklist email moves to enrollment**: each student gets one checklist
   email at the moment they confirm (invite « yes »), replacing the
   phase-flip blast.
3. **Layout A — single lifecycle table**: every person is one row from
   candidature to dossier complet (chosen over stacked sections / journey bar).
4. Of the proposed extras, keep **only** « masquer les dossiers clos »
   (rejected/declined hidden behind a toggle). No KPI strip, no search/sort,
   no per-row progress bar, no quick-remind, no activity feed, no CSV export.
5. Mockup v2 refinements: **no Échéance column** (templates have different
   deadlines; per-item deadlines stay visible in the drawer), **« Complets »
   funnel tile reads « 4 / 12 »** (complete/confirmed), right rail is **only**
   the « À faire maintenant » action cards (no progress card, no relance note).

## The page (UX)

- **Header**: « Vue d'ensemble » + one mixed subline, e.g. « 5 candidatures à
  examiner, 3 dossiers à vérifier, 2 élèves en retard. »
- **Funnel card** (« Progression de l'échange »), clickable tiles filtering
  the table, same interaction as today:
  `Candidatures · À examiner · Confirmés · À vérifier · En retard · Complets (x / y)`
- **Lifecycle table**, columns: `Élève · Candidature · Formulaires ·
  Documents · Statut`.
  - Applicant rows (not enrolled): Candidature pill (À examiner / Invité — en
    attente / Peut-être…), « — » in Formulaires/Documents, Statut derived from
    application status.
  - Enrolled rows: Candidature = « Confirmé(e) », Formulaires/Documents = the
    existing rollup pills, Statut = existing overall pill (À vérifier /
    En retard / Incomplet / Complet).
  - Row click opens the existing `StudentDrawer` (application timeline for
    applicants, checklist for enrolled students).
- **Hidden closed rows**: `rejected` + `declined` excluded by default; a
  « Afficher les refusés et déclinés (n) » link under the table reveals them.
- **Right rail**: only « À faire maintenant » action cards, now mixing both
  worlds (candidatures à examiner, hésitants, dossiers à vérifier, docs
  manquants, retards), ordered by urgency. The reminder-transparency note is
  removed.
- **Empty state** (« Commencez votre échange » + invite CTA) unchanged.

## Data & derivation

`lib/dashboard/rollup.ts` stays a pure library; `p1*`/`p2*` functions are
replaced (not kept alongside) by unified equivalents.

- New `LifecycleRow` model built from the two sources the page already
  fetches (`listApplications` + `getExchangeGrid`):
  - Enrolled students → rows from grid rollups.
  - Applications not yet enrolled → applicant rows.
  - **Dedupe by email**: an application with status `enrolling`/`enrolled`
    matching an enrolled student's email merges into that student's row
    (nobody appears twice).
  - Directly-invited students (no application) show « Confirmé » in the
    Candidature column.
- Funnel counts: Candidatures = all received applications **including**
  rejected/declined (historical volume — the hide-closed toggle only affects
  the table); À examiner = `submitted`; Confirmés = enrolled count;
  À vérifier / En retard = current rollup logic; Complets = forms+docs
  complete, displayed as « x / y ».
- Unified filter function keyed by funnel tile; default view excludes
  `rejected`/`declined`; toggle includes them.
- Edge case: an `enrolling`/`enrolled` application whose email matches no
  enrolled student (shouldn't happen — enrollment reuses the application
  email) falls back to an applicant row with a « Confirmé » pill, never
  silently dropped.

## Phase removal sweep

- Delete `PhaseStepper` component, `setExchangePhase` action, and their tests.
- `OrganizerShell`: remove the phase pill (keep exchange name/year).
- `ExchangesView`: remove `PHASE_LABEL` (progress label stays).
- Settings `ProgramCard`: remove the phase line.
- `getExchanges` / shell types: stop selecting/carrying `phase`.
- **No migration**: `exchanges.phase` and `phase2_checklist_sent_at` columns
  stay in the DB, unread. Dropping them is optional later cleanup — this
  change is code-only (no staging/prod migration, no RLS impact).

## Checklist email on enrollment

- Replace `sendPhase2ChecklistOnce` with a per-student checklist email sent
  in the `respondToInvite` « yes » path (`actions/invitations.ts`) right
  after enrollment: the DB trigger (`trg_assign_on_enrollment_insert`) has
  just fanned out assignments, so query the student's pending items and send
  one email listing them with their deadlines.
- No active templates / nothing pending → no email. Items created later are
  covered by the daily reminder engine.
- Rename `sendPhase2ChecklistEmail` → neutral name (e.g.
  `sendChecklistEmail`) in `lib/email.ts`.
- **Error handling**: email failure never breaks enrollment — log a warning,
  enrollment succeeds (same degrade pattern as staging's missing Resend key).
- `actions/invitations.ts` is already in the admin-client allowlist; no
  allowlist change.

## Testing

- `rollup.test.ts`: rewrite for unified funnel/merge/filter (pure functions):
  dedupe by email, applicant vs enrolled rows, closed-row exclusion,
  « x / y » complets count.
- `OverviewView` tests: single view, funnel tile filtering, hide-closed
  toggle, drawer subjects for both row kinds, empty state.
- Shell/Exchanges/Settings tests: drop phase-label assertions.
- Delete `exchange-phase.test.ts`; add enrollment checklist email tests
  (sends once with pending items, skips when nothing pending, failure is
  non-blocking).
- Gate: `pnpm lint` + `pnpm test` + `pnpm build`. No RLS/schema change, so
  `test:rls` is unaffected.

## Out of scope

- Dropping the `phase` / `phase2_checklist_sent_at` DB columns.
- KPI strip, search/sort, per-row progress, quick-remind, activity feed,
  CSV export (all considered and declined).
- Any change to the student-side experience or the reminder engine.
