# Drag-and-drop exchange reordering in the organizer sidebar

**Date:** 2026-07-23
**Status:** approved, ready for planning
**Branch:** `feature/exchange-reordering`

## Problem

The organizer sidebar lists every exchange the school participates in, ordered
`created_at desc` (`app/(organizer)/layout.tsx`). Organizers cannot influence that
order. A school running several programmes at once has no way to keep the one it
works in daily at the top, and the list only gets worse as archived exchanges
accumulate.

## Goal

Let an organizer click and drag exchanges in the sidebar into whatever order they
want, and have that order persist.

## Decisions

Three choices were made explicitly during design; each rules out an approach that
would otherwise look reasonable.

### The order is personal, not shared

A reorder changes **only the sidebar of the organizer who performed it**.

Exchanges are shared objects: an exchange links `school_a_id` and `school_b_id`, and
a school can have several organizer collaborators. A shared order would mean one
person's tidying silently rearranges a colleague's navigation — and a school-A
reorder would reshuffle school B's sidebar. Ordering is a display preference, so it
belongs to the viewer.

### Storage is a column on `users`

```sql
alter table users add column exchange_order uuid[] not null default '{}';
```

This mirrors `20260714200924_users_locale.sql` — the existing precedent for a
per-account preference — and is governed by the existing `"users update themselves"`
policy from `20260624000002_rls_policies.sql`. **No new policy, no new table.**

`getProfile()` (`lib/supabase/request.ts`) already runs one `users` lookup per
request with an explicit column list, feeding the organizer layout. Adding
`exchange_order` to that list costs **zero extra queries**.

Rejected alternatives:

- **localStorage** — no migration, but the order is per-browser (lost on a new
  device or after clearing site data) and the server would render the default order
  first, so the sidebar visibly re-sorts on every hydration.
- **A dedicated `exchange_order` table** — more normalized, but it needs its own
  table, its own RLS policies, its own RLS matrix cases, and an extra query on every
  organizer page load. Disproportionate for a sidebar preference.

**Security note:** the column is display-only. Its ids are intersected against
exchanges RLS already permits the user to read, so ids that match nothing are simply
ignored. A junk value cannot reveal anything, and the RLS policy confines writes to
the user's own row.

### Reordering uses dnd-kit

Add `@dnd-kit/core` + `@dnd-kit/sortable` (~12 kB gzipped, no transitive deps). The
sidebar is the app's primary navigation, so keyboard reordering is not optional —
dnd-kit provides it, plus touch support, for free.

Rejected: hand-rolled HTML5 drag events (does not fire on touch at all, no keyboard
path) and hand-rolled pointer events (re-implements drop-index math, transforms,
autoscroll, and keyboard handling — more bugs, more test burden).

These are two new production dependencies and will appear in the weekly
`pnpm audit --prod` run.

## Design

### Sorting — `lib/shell/exchange-order.ts`

A pure, independently testable function:

```ts
export function sortExchanges<T extends { id: string }>(
  exchanges: T[],
  order: string[],
): T[]
```

Rules:

1. Exchanges **not** present in `order` come **first**, keeping their incoming
   `created_at desc` sequence.
2. Then the exchanges named in `order`, in that sequence.
3. Ids in `order` that match no exchange are ignored (deleted or no-longer-visible
   exchanges).

**Why unlisted go on top, not bottom.** A newly created exchange stays where the
organizer expects it — matching today's newest-first behaviour — instead of being
buried under a hand-ordered list. Because every drop persists the *complete* id list
(not just the moved row), "unlisted" only ever means *created since your last drag*.
The state self-heals after one reorder.

### Knock-on: default active exchange

`resolveActiveExchange` (`lib/exchange-session.ts`) falls back to the first
non-archived exchange when no cookie is set. Once the list is personally ordered,
that fallback honours the organizer's order rather than recency — an improvement,
and the intended behaviour.

Its header comment currently asserts the input is `created_at desc`. It must be
updated to say the input is pre-sorted in display order.

### Interaction — `components/shell/ExchangeList.tsx`

- `DndContext` + `SortableContext` with `verticalListSortingStrategy`, restricted to
  the vertical axis.
- **A dedicated grip handle carries the drag listeners — not the row button.**
  dnd-kit's keyboard sensor lifts on Space, which is also how a `<button>` fires;
  putting both on one element makes reordering and exchange-selection fight each
  other. The grip is a sibling element inside the row: it fades in on row hover or
  focus, and is always reachable by Tab.
- **Reordering is expanded-only.** The 68 px collapsed rail shows unlabelled colour
  dots; dragging dots you cannot read is not useful, and excluding it removes a set
  of layout edge cases. Collapsed still *renders* the persisted order.
- Local `useState`, seeded from props, holds the order during the drag so the row
  moves under the cursor. A `useEffect` resyncs it when the server sends new props.
- Clicking a row must still select that exchange. A pointer-sensor activation
  constraint of **5 px** separates a click from a drag.

### Persistence — `setExchangeOrder(ids)` in `actions/session.ts`

Placed beside the existing `setActiveExchange`. Uses `requireOrganizer()` from
`lib/auth/require.ts` — never a hand-rolled auth preamble.

Validation: uuid shape, dedupe (first occurrence wins), and a hard cap of **200
ids** to prevent unbounded growth. Validation failure returns a **structured**
`{ ok: false }` result rather than throwing, per the production error-redaction
rule.

Called fire-and-forget from the drop handler: optimistic local state already shows
the result, so there is no spinner and the drag is never blocked on a round trip.

### i18n

New keys across all five locales (`en`, `fr`, `es`, `it`, `de`):

- the grip handle's `aria-label`
- dnd-kit screen-reader announcements: picked up / moved to position N of M /
  dropped / cancelled

Run the apostrophe guard on the French strings.

## Testing

| File | Covers |
| --- | --- |
| `lib/shell/__tests__/exchange-order.test.ts` | sort rules: unlisted-on-top, stale ids dropped, empty order, fully-listed, order preserved |
| `components/shell/__tests__/ExchangeList.test.tsx` | existing tests still pass; grip present expanded / absent collapsed; keyboard reorder invokes the action; clicking a row still selects |
| `actions/__tests__/session.test.ts` | auth guard; uuid / dedupe / cap validation; structured failure result |
| RLS matrix | organizer A cannot write organizer B's `exchange_order` |

Full gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, and — because
`supabase/migrations/` is touched — `pnpm test:rls`.

## Out of scope

- Drag-to-archive or drag-to-delete
- Grouping or foldering exchanges
- Any cross-school or school-wide shared ordering
- Reordering the fixed nav items above the exchange list
- Reordering while the sidebar is collapsed
