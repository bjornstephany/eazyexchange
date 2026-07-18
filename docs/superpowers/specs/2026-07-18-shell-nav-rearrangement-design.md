# Shell navigation rearrangement

## Problem

Two organizer-shell affordances sit in awkward places:

- The profile circle's dropdown mixes account settings (« Réglages ») with sign-out, so a
  primary navigation destination is buried in an account menu.
- The Feedback button lives at the bottom of the left rail, competing visually with the
  content tabs and the profile menu.

## Goal

- The profile circle's dropdown offers **only** « Se déconnecter ».
- « Réglages » becomes a first-class rail item with a gear icon, alongside the other tabs.
- The Feedback button moves to the **top-right of the header bar**.

## Scope

All changes are confined to the organizer shell. No routes, data model, RLS, or migrations
are touched.

- `components/shell/OrganizerShell.tsx` — the three moves.
- `components/shell/RailIcons.tsx` — a light-background variant of the feedback icon (see
  below).
- `components/shell/__tests__/OrganizerShell.test.tsx` — updated assertions.

## Design

### 1. Réglages gear in the rail

Add a rail item using the existing `IconSettings` gear, pinned at the **bottom** of the rail
via `mt-auto` (the slot Feedback occupies today), directly above the profile circle. It uses
the same `RailItem` styling as the content tabs:

- label: `t('shell.accountMenu.settings')` (« Réglages ») — the existing key is reused.
- href: `/settings`.
- active state: `pathname.startsWith('/settings')` (the shell already computes `isSettings`).

Unlike the exchange-scoped tabs (Applications / Formulaires / Documents / Élèves), the gear
is **always rendered**, even when there is no active exchange — settings is school-level, not
exchange-scoped, matching Aperçu and Échanges.

### 2. Profile circle dropdown slimmed

The initials circle stays at the bottom of the rail. Its dropdown now contains a single item:

- « Se déconnecter » (`t('shell.accountMenu.signOut')`), wired to the existing `handleSignOut`.

The « Réglages » `<Link>` is removed from the dropdown (the translation key stays; it is
reused for the rail label). All existing menu behavior — outside-click close, Escape close,
`aria-haspopup`/`aria-expanded` — is preserved.

### 3. Feedback in the header top-right

Remove the Feedback rail button. Add an **outlined pill** button at the far right of the
white header bar, present on every organizer page:

- content: the feedback speech-bubble icon + label `t('shell.nav.feedback')` (« Feedback »).
- style: bordered pill on the light header (`border`, `rounded`, small text), not brand-filled
  — it must not compete with primary page actions.
- opens the existing `FeedbackModal` via the existing `feedbackOpen` state.

Header layout: the header is a `justify-between` flex row. The right side becomes a flex group
holding the existing Élèves search input (when shown) followed by the Feedback button, so on
the Élèves page the search sits to the **left** of Feedback. On all other pages only Feedback
shows on the right.

#### Feedback icon on a light background

The current `IconFeedback` masks its little tail corner with `bg-rail` (the dark rail color),
which is invisible against the dark rail but would show as a dark square on the light header.
Add a light-background variant (the tail mask uses the header/card background, e.g. `bg-card`)
so the icon reads correctly in the header. The rail no longer renders `IconFeedback`, so the
original can be replaced outright rather than kept in parallel — but a small `bg`-parameterized
version or a dedicated `IconFeedbackLight` is acceptable; implementer's choice, whichever is
cleaner.

## Testing

Update `components/shell/__tests__/OrganizerShell.test.tsx`:

- The account dropdown, once opened, contains « Se déconnecter » and **not** « Réglages ».
- The rail renders a « Réglages » item linking to `/settings`, with the active class applied
  when the current path is under `/settings`.
- The header renders a Feedback button, and clicking it opens the `FeedbackModal`.
- The rail no longer renders a Feedback button.

Then the standard gate: `pnpm lint`, `pnpm test`, `pnpm build`.

## Out of scope

- Student shell (`StudentTopBar`) — unchanged.
- Any change to `/settings` page content, routing, or the FeedbackModal itself.
