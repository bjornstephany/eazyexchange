# Invite-via-modal on Aperçu — Design

**Date:** 2026-07-05
**Status:** Approved, ready for planning

## Problem

Inviting students to apply currently lives in an `ApplicationsCard` on the exchange
detail page (`/exchanges/[id]`), reached via a `+ Inviter des élèves` button in the top
banner (anchor `#invite`). This scatters the "start the exchange" action away from where
organizers actually look (the Aperçu overview) and buries it behind a page navigation.

We want the first action of a new exchange to be front-and-centre on the Aperçu page, and
the invite flow (set a deadline → open applications → get the share link) to happen in a
single modal rather than a separate page.

## Goals

- Remove the `+ Inviter des élèves` button from the top banner (all header variants).
- On the Aperçu page, when an exchange has never opened applications, show a centered
  empty-state CTA inviting the organizer to invite students to apply.
- The CTA opens a two-step modal: (1) set a deadline (which opens applications), then
  (2) reveal the share link with a copy button and a warning on exit that the link won't
  be shown again.
- Once applications are opened, the CTA and empty state are permanently replaced by the
  normal Aperçu overview.
- Ongoing controls (change deadline, close applications early) move to a compact controls
  bar on the Candidatures page.

## Non-goals

- No genuinely-secret / one-time token. The invite link stays the existing persistent
  `/apply/{apply_slug}` URL; "shown once" is a UI presentation, not a security property.
- No link recovery UI. After the modal closes, the organizer cannot re-view the link in
  the app (see Accepted tradeoff). The link itself keeps working.
- No schema change and no new server action — `setApplicationOpen` already covers the
  data mutation.

## Key decisions (from brainstorming)

1. **Link semantics:** persistent `/apply/{apply_slug}`, presented once with a warning,
   still valid forever. No new column, no recovery spot.
2. **Ongoing controls:** small deadline + open/close controls bar on the Candidatures
   (`/applications`) page.
3. **CTA trigger:** show while the exchange is pristine (`!application_open &&
   application_deadline == null`); once opened it's gone permanently, even with 0
   applicants and even if applications are later closed again.
4. **Banner button:** removed everywhere, including the Élèves-page header variant.
5. **`/exchanges/[id]`:** kept as a thin stub (minimal header, no invite controls) so it
   doesn't 404.

## Architecture

All changes are UI-layer. The single existing mutation `setApplicationOpen(exchangeId,
open, deadline)` (in `actions/exchanges.ts`) is reused unchanged.

### Data flow

- `app/(organizer)/dashboard/page.tsx` currently passes `exchangeId` and `phase` into
  `OverviewView`. It must additionally supply the active exchange's `apply_slug`,
  `application_open`, and `application_deadline`. Fetch these for the active exchange
  (e.g. `getExchange(active.id)` or by extending the existing query) and pass them down.
- `OverviewView` uses `application_open` + `application_deadline` to decide between the
  empty-state CTA and the normal overview, and passes `exchangeId`, `apply_slug`, and
  deadline into the invite modal.

### Components

**`InviteModal` (new client component)**
- Props: `exchangeId`, `applySlug`, `open` (controlled), `onOpenChange`.
- Built on the existing design-system dialog/modal primitives (match `NewExchangeModal`).
- Internal state: `step` (`'deadline' | 'link'`), `deadline`, `saving`, `confirmingClose`.
- Step 1 (deadline): date input + primary button « Ouvrir les candidatures » (disabled
  until a date is chosen). On click → `setApplicationOpen(exchangeId, true, deadline)` →
  on success advance `step` to `'link'`. Does **not** refresh the page yet.
- Step 2 (link): read-only `{window.location.origin}/apply/{applySlug}` field, a
  « Copier » button (`navigator.clipboard.writeText`), a short explanation to share it
  with students they want to invite, and confirmation that applications are open with the
  chosen deadline.
- Exit from step 2 (X / backdrop / « Fermer ») sets `confirmingClose`, showing the
  warning « Vous ne reverrez plus ce lien. Assurez-vous de l'avoir copié avant de
  fermer. » with Confirmer / Annuler. Confirmer closes the modal and refreshes the page
  (`router.refresh()`) so the CTA/empty state disappears.
- Exit during step 1 (before opening) closes immediately, no warning, no mutation.

**`OverviewView` (modified)**
- New props: `applicationOpen`, `applicationDeadline`, `applySlug`.
- When `phase === 1 && !applicationOpen && applicationDeadline == null`: render only the
  centered empty state (CTA line ~« Commencez votre échange en invitant vos élèves à
  postuler. » + primary button « Inviter vos élèves à postuler ») and mount `InviteModal`.
  Suppress the funnel, table, and right rail in this state.
- Otherwise: render the existing overview unchanged.

**Candidatures controls bar (modified `CandidaturesView` / `/applications` page)**
- Compact bar above the tabs: an Ouvert/Fermé toggle and an inline date input for the
  deadline, both wired to `setApplicationOpen(exchangeId, open, deadline)`.
- Requires `exchangeId`, `application_open`, `application_deadline` to be passed into
  `CandidaturesView` (the `/applications` page must fetch/forward them).
- Update the empty-state copy that currently reads "partagez le lien de candidature
  depuis la page de l'échange" — the link now comes from the invite modal / apply page.

### Removals

- Delete both `+ Inviter des élèves` blocks in `OrganizerShell.tsx` (the `listPage === null`
  header and the Élèves-page `listPage === 'students'` header variant; keep the Élèves
  search box). Remove the now-unused `#invite` anchoring assumptions.
- Retire `ApplicationsCard` and the `#invite` section on `/exchanges/[id]`; reduce that
  page to a minimal header stub.

## Edge cases

- **Legacy exchanges opened without a deadline** (old card allowed open with null
  deadline): gate the CTA strictly on `!application_open && application_deadline == null`
  so any already-configured exchange skips the empty state.
- **Deadline in the past:** the apply page already treats a passed deadline as closed;
  the controls bar lets the organizer move it. No special handling in the modal beyond a
  normal date input.
- **Modal closed mid-flow after step 1 wrote to DB:** applications are already open;
  refreshing on close correctly drops the CTA. Reopening isn't possible (no entry point),
  which is the intended "shown once" behavior.
- **Clipboard API unavailable:** the field is selectable/read-only so manual copy still
  works; the Copier button is best-effort.

## Accepted tradeoff

With "shown once, no recovery," an organizer who closes the modal without copying — and
before sharing — has no in-app way to retrieve the link until a future recovery feature is
added. The link still works; it's just not re-surfaced in the UI. The exit warning is the
only guard. Accepted for MVP.

## Testing

- `InviteModal`: step 1 → step 2 progression only after a successful
  `setApplicationOpen`; « Ouvrir les candidatures » disabled without a date; exit from
  step 2 shows the warning and only closes + refreshes on Confirmer; exit from step 1
  closes without warning and without mutating.
- `OverviewView`: empty-state CTA renders iff `phase === 1 && !applicationOpen &&
  applicationDeadline == null`; normal overview renders otherwise (including opened with 0
  applicants and closed-after-open).
- Candidatures controls bar: toggle and deadline input call `setApplicationOpen` with the
  expected arguments; updated empty-state copy.
- Regression: `OrganizerShell` no longer renders any `+ Inviter des élèves` button; Élèves
  search box still present.

## Verification

`pnpm lint`, `pnpm test`, `pnpm build` must pass before merge (per CLAUDE.md).
