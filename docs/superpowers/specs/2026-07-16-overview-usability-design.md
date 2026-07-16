# Overview usability fixes — design

**Date:** 2026-07-16
**Status:** Approved by Bjorn (brainstorming session)
**Scope:** Four organizer-Overview usability fixes + a terminology sweep. UI-only: no migration, no new server actions, no RLS impact.

## Problems (as reported)

1. The CTA to create forms and documents is not clear enough.
2. An accepted student's name doesn't appear on the Overview.
3. The Application column says « Confirmed » where Bjorn expects « Accepted ».
4. Clicking a student to review their application opens a side drawer instead of the application itself.

## 1. Forms & documents CTA in the first empty state

The « Start your exchange » empty state (`components/dashboard/OverviewView.tsx`, `neverOpened` branch) currently offers only « Invite your students to apply ».

**Change:** add a second, secondary-styled (outline) CTA **« Prepare forms & documents »** linking to `/forms`, below/beside the primary invite button. Extend the body copy to mention both steps (invite students to apply *and* prepare the forms & documents they'll need to complete). All 5 locales (en/fr/es/it/de).

Unchanged: the right-rail « No active form » action card (still appears when there are zero active templates).

## 2. Enrolled student name fallback

**Root cause:** when a student responds yes to an invitation, `actions/invitations.ts` creates their profile with `full_name: ''` (deliberately empty until they finish account setup at `/accept-invite`). `buildLifecycleRows` (`lib/dashboard/rollup.ts`) merges the confirmed application into the enrolled-student row and displays `rollup.name` — the empty `full_name` — so the row (and the drawer header) renders blank.

**Change:** in `buildLifecycleRows`, when an enrolled row's rollup name is empty, fall back to the applicant name from the matching application (matched by normalized email, same match the merge already performs), else the student's email. The resolved name must flow into the drawer too (the enrolled row carries a rollup copy with the resolved name so `StudentDrawer` stays unchanged).

## 3. « Accepted » replaces « Confirmed » (accepted-at-acceptance model)

Decision: the label reflects the organizer's action. As soon as an application is accepted it reads « Accepted », qualified while the invitation is unanswered. « Confirmed » disappears from the product.

- **Application column** (`candidaturePill`):
  - `accepted` → **« Accepted — awaiting reply »** (warn) — replaces « Invited — awaiting reply ».
  - `null` (directly invited) / `enrolling` / `enrolled` → **« Accepted »** (ok) — replaces « Confirmed ».
- **Status column** (`applicantStatusPill`): `enrolling`/`enrolled` → **« Accepted »** (ok) — replaces « Confirmed ». The interim `accepted` → « Awaiting » stays.
- **Funnel tile:** « Confirmed » → **« Accepted »**. New count: everyone the organizer accepted who hasn't declined or been rejected — i.e. exactly the rows the tile's filter shows: enrolled rows + applicant rows with status `accepted`, `maybe`, `enrolling`, `enrolled`. (Previously: enrolled students only.) The filter key `confirmed` → `accepted`, updated to include `maybe`. The « X / Y complete » tile keeps enrolled students (rollups) as its denominator.
- **Message keys renamed** (not just values) so the typed translator makes `npx tsc --noEmit` catch stragglers: e.g. `pills.confirmedParen`/`pills.confirmed` → `pills.accepted`, `pills.invitedWaiting` → `pills.acceptedAwaiting`, `funnel.confirmed` → `funnel.accepted`. One shared `pills.accepted` label (FR « Accepté(e) ») serves both columns. All 5 locales.

### Terminology sweep (rest of the organizer portal)

Same rename wherever « confirmed » describes students (all 5 locales):

- `organizer.settings.program.stats.enrolled` — « # confirmed students » → « # accepted students ».
- `organizer.students.listSummary` — « # confirmed students · … » → « # accepted students · … ».
- `organizer.pages.students.emptyHeading` — « No confirmed students for this session yet. » → « No accepted students for this session yet. »
- `organizer.documents.addPanel.mandatoryTile.description` — « every confirmed student » → « every accepted student ».
- `organizer.dashboard.actionCards.maybeDesc` — reword to drop « convert into confirmation » (e.g. « "Maybe" replies to follow up with families. » / FR « Réponses "Peut-être" à relancer. »).

Note: the Students page and exchange-card counts keep their current *semantics* (students with accounts, i.e. replied yes) — only the label changes. Password-confirm / removal-confirm UI verbs (`confirmPasswordLabel`, `removeDialog.confirm`, `confirmRejectCta`) are untouched.

## 4. Applicant rows navigate to the application

- Clicking an **applicant** row on the Overview navigates to `/applications?id=<applicationId>` (`router.push`, same pattern as `CandidaturesView`). That page already shows the full application, accept/reject actions for submitted applications, and print.
- Clicking an **enrolled** row keeps the current drawer (forms & documents checklist).
- **Cleanup:** the drawer's application branch becomes unreachable — delete it: `DrawerSubject`'s `application` kind, the timeline + accept/reject UI in `StudentDrawer`, `timelineFor` in `lib/dashboard/rollup.ts`, and the orphaned `organizer.dashboard.timeline.*` messages (all locales). Accept/reject then lives in exactly two places: the application page and the Candidatures bulk actions.
- Known wrinkle, accepted: the application page's back link goes to `/applications` (Candidatures), not back to the Overview.

## Testing

- `lib/dashboard/__tests__` unit tests: name fallback (empty `full_name` → application name → email), new `accepted` funnel count and filter (incl. `maybe`, excl. `declined`/`rejected`), `candidaturePill`/`applicantStatusPill` labels.
- Component tests (`components/dashboard/__tests__`): applicant row click navigates (mock router), enrolled row click opens drawer, empty state renders both CTAs, drawer has no application branch.
- Renamed/deleted message keys verified across all 5 locale files; `npx tsc --noEmit` gates translator keys.
- Gate: `pnpm lint` · `pnpm test` · `pnpm build`. No migration → `pnpm test:rls` not required.

## Out of scope

- Student-portal and email wording (no « confirmed » student-facing occurrences identified).
- Back-navigation from the application page to the Overview.
- Any change to statuses in the database — `accepted`/`enrolling`/`enrolled` stay as-is; this is label-and-navigation work only.
