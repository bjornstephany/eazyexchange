# Applications as the organizer's home — design

**Date:** 2026-07-24
**Branch:** `feature/applications-home`

## Problem

The Applications page is built for a school that already has applicants. An organizer
who has just finished onboarding lands on a page dominated by controls they cannot yet
use: an open/closed toggle, a deadline field, an application link, and an empty grid
under seven empty tabs. The one thing they need to do — invite students — is a small
outline button in the corner.

Meanwhile the Overview page carries the invite flow (`InviteModal`) even though
Applications is where invitations belong, and its "start your exchange" state offers two
CTAs where the organizer only has one real first move.

## Goals

1. Applications is a usable landing page in both states: blank with one CTA before
   anything exists, a tracking grid afterwards.
2. Opening applications is a single dialog: pick a deadline, then either copy a link or
   paste addresses.
3. Invitation controls stay reachable forever, but stop competing with the grid.
4. Overview stops owning the invite flow and points at Applications instead.

Out of scope: the post-onboarding redirect to `/applications` (owned by a parallel
session); any change to the apply funnel, the application data model, or
`sendApplicationInvitations` itself.

## A. Applications page

### A1 — Landing page

No work in this branch. A parallel session owns the redirect. This spec only makes the
page correct for an organizer who arrives with nothing.

### A2 — Empty state

Gate, evaluated in `CandidaturesView`:

```
apps.length === 0 && !applicationOpen && applicationDeadline == null
```

This is the same "never opened" notion `OverviewView` already uses (`OverviewView.tsx`,
`neverOpened`). It deliberately does **not** trigger on `apps.length === 0` alone: an
organizer who opened applications and shared the link, but has no applicants yet, must
still see the link and the deadline rather than a blank page inviting them to start over.

When the gate is true the page renders a centred block and nothing else — no state bar,
no tabs, no grid, no invitation panel:

- title (`organizer.applications.empty.title`)
- one line of body copy (`…empty.body`)
- one primary CTA (`…empty.cta`) that opens `OpenApplicationsDialog`

### A3 — `OpenApplicationsDialog`

New client component, `components/applications/OpenApplicationsDialog.tsx`. One screen,
three stacked sections:

```
┌─ Invite your students to apply ──────────┐
│  Application deadline                    │
│  [ 2026-09-15            ▾ ]             │
│  ── How do you want to invite? ──        │
│  ① Share a link                          │
│  [ https://…/apply/abc123 ] [ Copy ]     │
│  ② Or let us send the emails             │
│  [ paste addresses, one per line     ]   │
│                    [ Send invitations ]  │
│                         [ Cancel ] [Done]│
└──────────────────────────────────────────┘
```

Behaviour:

- Changing the date calls `setApplicationOpen(exchangeId, true, date)` straight away.
  That call *is* the "on save, applications open" moment — there is no separate submit.
- Sections ① and ② are visually muted and non-interactive until that call resolves.
- ② delegates to `sendApplicationInvitations` and shows the same sent/skipped/invalid
  summary the current dialog shows.
- Footer is Cancel / Done. **No "copy the link before closing" warning** — that warning
  existed in `InviteModal` because the link was shown exactly once; here it lives
  permanently in the invitation panel below the grid.

Props: `exchangeId`, `applySlug`, `open`, `onOpenChange`, and `onOpened(deadline)` so the
parent can flip out of the empty state without waiting for revalidation.

### A4 — `InvitationPanel`

New client component, `components/applications/InvitationPanel.tsx`, rendered **below**
the grid. A native `<details>`/`<summary>` disclosure, collapsed by default:

```
  ● Applications open · deadline 15 Sep      ⌄
```

Expanded, it contains today's control-bar markup unchanged, just relocated: the
open/closed toggle, the deadline input, the read-only apply link with Copy, and the
"Invite by email" button that opens `InviteByEmailDialog`.

Native `<details>` is chosen over a `useState` disclosure because it is keyboard- and
screen-reader-correct with no extra code.

### Shared invitation form

`InviteByEmailDialog` and `OpenApplicationsDialog` would otherwise duplicate the paste
box, the send call, and the result/error rendering. Extract that into
`components/applications/InviteByEmailForm.tsx` (textarea + send button + summary/error).
`InviteByEmailDialog` keeps its `Dialog` shell around it; `OpenApplicationsDialog` uses
it as section ②. The form owns its own submit state; the two consumers own only layout.

### State ownership

`CandidaturesView` keeps `open` and `deadline` in local state, as it does today, and
passes them down to `InvitationPanel` and `OpenApplicationsDialog`. When the dialog opens
applications it calls `onOpened(deadline)`, `CandidaturesView` updates its local state,
and the page re-renders from the empty state into grid + panel immediately.
`setApplicationOpen` also revalidates server-side; the local update only removes the
flash.

### Deep-linkable tab

`app/(organizer)/applications/page.tsx` reads `searchParams.tab`, validates it against
`TAB_KEYS` (unknown values fall back to `all`), and passes it to `CandidaturesView` as
the initial tab. This is what B8 links to.

## B. Overview page

| # | Change | Where |
|---|---|---|
| B5 | Remove the "Prepare forms & documents" `<Link>` | `OverviewView.tsx` + `organizer.dashboard.prepareFormsCta` key |
| B6 | `startBody` becomes "Start your exchange by inviting your students to apply." | messages |
| B7 | `inviteCta` becomes "Go to Applications"; the button becomes `<Link href="/applications">` and loses the `+` glyph | `OverviewView.tsx` + messages |
| B8 | The "N applications to review" card gains `href: '/applications?tab=toreview'` | `lib/dashboard/rollup.ts`, `lifecycleActionCards` |
| B9 | `GRID` gains `gap-x-5` | `OverviewView.tsx:36` |

B7 also removes the `inviteOpen` state, the `InviteModal` import and render, and the
now-stale comment at `OverviewView.tsx:78-83` explaining why the modal had to live
outside the `neverOpened` branch. `components/dashboard/InviteModal.tsx` is deleted —
B7 makes it unreachable and `OpenApplicationsDialog` replaces it.

B8: the card already carries `filterKey: 'toreview'`, which stays as the React key; the
existing `card.href ? <Link> : <button>` branch in `OverviewView` renders it as a link
with no further change. The button no longer filters the Overview table.

B9 root cause: `GRID` (`grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px]`) declares no column
gap, so the **Application** column's pill sits flush against the **Forms** column's `—`
placeholder. A column gap fixes every boundary in that table, not only the reported one,
and applies to the header row and the body rows because both use the same constant.

## Copy

New keys under `organizer.applications`:

- `empty.title`, `empty.body`, `empty.cta`
- `openDialog.title`, `.description`, `.deadlineLabel`, `.saving`, `.methodHeading`,
  `.linkHeading`, `.emailHeading`, `.done`
- `panel.summaryOpen`, `panel.summaryClosed`, `panel.deadlineSuffix`

Removed: `organizer.dashboard.prepareFormsCta`, the whole `organizer.dashboard.inviteModal`
block.

Every add and removal lands in all five locales (`en`, `fr`, `de`, `es`, `it`) in the same
change, so the message-parity test stays green. French is written by hand, not
transcribed by a subagent, and the apostrophe guard runs afterwards.

## Testing

- `components/applications/__tests__/OpenApplicationsDialog.test.tsx` (new): link and
  email sections inert before a deadline is set; picking a date calls
  `setApplicationOpen(id, true, date)`; sending calls `sendApplicationInvitations` and
  renders the summary.
- `components/applications/__tests__/CandidaturesView.test.tsx`: empty state renders the
  single CTA and no grid when never opened; grid + collapsed `InvitationPanel` render
  once open; a non-default initial tab is honoured; opening applications from the dialog
  leaves the empty state.
- `components/dashboard/__tests__/OverviewView.test.tsx`: drop the `InviteModal` mock;
  assert the "Go to Applications" link points at `/applications`; assert the
  prepare-forms CTA is gone.
- `lib/dashboard/__tests__` (rollup): the to-review card carries
  `href: '/applications?tab=toreview'`.
- `components/dashboard/__tests__/InviteModal.test.tsx`: deleted with its component.

No migration, no RLS change, no storage change — `pnpm test:rls` is not required for this
branch. Gate is `pnpm lint`, `pnpm test`, `pnpm build`.

## Risks

- **Empty-state gate misfires.** If a school somehow has `applicationOpen === false` and
  a null deadline but existing applications, the `apps.length === 0` clause keeps the grid
  visible. The gate requires all three conditions, so the failure mode is "shows too
  much", never "hides applications".
- **`InviteByEmailForm` extraction touches a shipped path.** `InviteByEmailDialog`'s
  existing test file stays as-is and must keep passing unchanged — that is the regression
  signal for the extraction.
