# Sidebar redesign — organizer shell

**Date:** 2026-07-22
**Branch:** `feature/sidebar-redesign`
**Status:** approved, ready for planning

## Problem

The organizer shell navigates through an 82px dark icon rail with abbreviated
labels (`Candid.`, `Comm.`), and exchange switching hides behind a dropdown in
the header (`SessionSelector`). Two consequences:

- Nav labels are truncated to fit 82px, so the rail reads as icons-with-hints
  rather than navigation.
- Switching exchange — the single most structural action an organizer takes —
  requires discovering a dropdown whose affordance is a small `▾` next to the
  page title.

## Goal

Replace the rail with a wide, light, labelled sidebar that lists the
organizer's exchanges inline, modelled on a reference design supplied by the
user. This is a **presentation change**: no new server actions, no schema
change, no change to what an organizer can do.

## Non-goals

- No per-exchange overflow (`···`) menu. Rename / archive / reminder settings
  stay in Réglages → Programme where they live today.
- No `color` column on `exchanges`, no colour picker.
- No progress subtitles in the sidebar.
- No change to the student-facing shell.

## Design

### Layout

`OrganizerShell` renders a **250px** light sidebar (`bg-card`, `border-r`)
replacing the 82px `bg-rail` nav. Three zones, top to bottom:

```
┌──────────────────────────┐
│ ▪ EazyExchange           │  Mark (light variant) + wordmark
│                          │
│ ⌂  Aperçu                │  active: bg-brand-soft, text-brand, font-semibold
│ ▤  Candidatures          │  inactive: text-muted-foreground
│ ▤  Fichiers              │  hover: bg-hoverrow
│ ▤  Élèves                │
│ ✉  Communication         │
├──────────────────────────┤  border-t
│ Mes échanges   [+ Ajouter]│  group header + pill button
│ ● France-Canada 2026     │
│ ● Espagne 2026  [Archivé]│
│ ● Italie 2027            │  active: bg-subtle, font-semibold
│                          │
│         (flex-1 spacer)  │
├──────────────────────────┤  border-t
│ ⚙  Réglages              │
│ «  Réduire               │  collapse toggle
└──────────────────────────┘
```

The session-scoped nav items (Candidatures, Fichiers, Élèves, Communication)
remain conditional on an active exchange existing, exactly as today. With zero
exchanges: only Aperçu and Réglages render, and the « Mes échanges » group
shows an empty state whose only affordance is « + Ajouter ».

### Header

The header keeps its 66px height and reduces to:

- **Left:** active exchange name (static text, no longer a dropdown trigger) +
  `Archivé` pill when applicable. On `/settings`, the school name, as today.
  With zero exchanges, the existing « Nouvel échange » brand CTA.
- **Right:** Feedback button, then the account avatar (initials) opening the
  existing sign-out popover.

### Components

**Deleted**

- `components/shell/SessionSelector.tsx` — its sole job (switching the active
  exchange) is now the sidebar list. Its `setActiveExchange` + navigate logic
  moves into the sidebar exchange row.
- `components/shell/__tests__/` cases that target the selector panel.

**New**

- `lib/shell/exchange-color.ts` — pure module, no DB:

  ```ts
  const PALETTE = ['#7C3AED','#2456E6','#14B8C4','#F59E0B',
                   '#F43F5E','#22A06B','#4F46E5','#EA7317'] as const
  export function exchangeDotColor(id: string): string
  ```

  A stable string hash of the exchange UUID indexes `PALETTE`. Deterministic,
  works for every existing row with no backfill, and requires **no migration** —
  which also means no contention with the other concurrent sessions, since
  `supabase/migrations/` is single-writer.

- `components/shell/useSidebarCollapsed.ts` — `localStorage` key
  `ee.sidebar.collapsed`. On first visit only (no stored value), defaults to
  collapsed when `window.innerWidth < 1100`. The server renders **expanded**
  and the hook applies the stored value in an effect, so there is no hydration
  mismatch; the transition is a CSS width transition, not a layout jump.

- `components/shell/SidebarNav.tsx` and `components/shell/ExchangeList.tsx` —
  extracted so `OrganizerShell.tsx` stays a composition root rather than
  growing past its current ~270 lines. `ExchangeList` owns the switch action;
  `SidebarNav` is presentational.

**New token**

- `tailwind.config.ts` gains `brand.soft: "#EDF2FE"` — the active-nav-item
  background. Every other colour the sidebar needs already exists (`card`,
  `subtle`, `hoverrow`, `navy`, `brand`, `muted-foreground`). The `rail` token
  keeps its definition; nothing else in the app consumes it after this change,
  but removing it is out of scope.

**Unchanged**

- `RailIcons.tsx` — every icon is lucide or uses `bg-current` / `border-current`,
  so all inherit the new dark-on-light colours with no edit. (`IconFeedback`'s
  `bg-rail` notch is the dark-rail variant used only in the modal; the header
  uses `IconFeedbackLight`.)
- `NewExchangeModal`, `FeedbackModal`, `ShellUiContext.openNewExchange`.
- `getExchangeProgressSummaries` in `actions/exchanges.ts` — still used by the
  Aperçu page; simply no longer called by the shell.

### Collapsed state

68px wide. Logo mark only, icons only (centred, no labels), colour dots only
for exchanges, `title` attributes for tooltips. The « + Ajouter » pill reduces
to a `+` icon button. Réglages and the toggle (`»`) stay pinned at the bottom.

### Search relocation

`ShellUiContext` loses `listSearch` / `setListSearch`. The header no longer
renders a search input on any route. The Élèves page owns a search input in its
own toolbar as local component state — the input was already conditional on
`pathname.startsWith('/students')`, so this is a move, not a removal, and no
filtering behaviour changes.

### Copy and i18n

The wider sidebar removes the need for abbreviations:

| Key | Before (fr) | After (fr) |
|---|---|---|
| `shell.nav.applications` | `Candid.` | `Candidatures` |
| `shell.nav.communication` | `Comm.` | `Communication` |
| `shell.nav.files` | `Formulaires / Docs` | `Fichiers` |
| `shell.nav.dashboard` | `Aperçu` | `Aperçu` (unchanged) |
| `shell.nav.students` | `Élèves` | `Élèves` (unchanged) |

New keys under `organizer.shell`:

- `exchangeGroup.title` — « Mes échanges »
- `exchangeGroup.add` — « + Ajouter »
- `exchangeGroup.empty` — « Aucun échange »
- `sidebar.collapse` — « Réduire »
- `sidebar.expand` — « Développer »

All five locales (`fr`, `en`, `es`, `de`, `it`).

> **Concurrency note.** `feature/i18n-phase3-student-apply` is live in another
> worktree and also edits `messages/*.json`. Restrict edits to the
> `organizer.shell` subtree and merge this branch last, re-running the full
> gate after the merge.

## Testing

`components/shell/__tests__/OrganizerShell.test.tsx` (21 existing cases):

- **Survive with selector updates:** rail-item rendering, route targets, the
  zero-exchange cases, billing-cap redirect, modal opening, stale
  `activeExchangeId` fallback, the Archivé pill, the Réglages tab, the
  sign-out-only profile menu, the Feedback button.
- **Deleted:** « dismisses the session selector panel on outside click » — the
  component no longer exists.
- **Rewritten:** « shows the students search placeholder » moves to the Élèves
  page's own test file and asserts the shell renders no search input.

New cases:

- Clicking an exchange row calls `setActiveExchange` and navigates to
  `/dashboard` when not already there; clicking the **active** row is a no-op.
- The collapse toggle flips width and persists to `localStorage`; a stored
  `true` renders collapsed on mount.
- Collapsed mode renders no text labels but keeps accessible names
  (`title` / `aria-label`) for every nav item.
- Archived exchanges still render with the Archivé pill in the sidebar list.

New `lib/shell/__tests__/exchange-color.test.ts`:

- Same id always yields the same colour.
- Every returned value is a member of `PALETTE`.
- A spread of ids covers more than one palette entry (guards a degenerate hash).

## Verification

`pnpm lint && pnpm test && pnpm build`. No migration, so `pnpm test:rls` is not
required. Because sibling worktrees exist, run vitest with
`--exclude '**/.claude/**'`.

A manual browser check at `http://localhost:3347` is required before merge —
this is a purely visual change, and every prior shell change in this repo left
its visual check as the last open item.
