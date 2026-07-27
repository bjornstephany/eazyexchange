# Optional guided tour for new organizers — design

**Date:** 2026-07-27
**Branch:** `feature/onboarding-tour`
**Base:** `main` at `f505043` (the pending-hard-gate merge)
**Backlog line retired:** « optional modern click-through professional onboarding tour explaining the features to new users »

## Problem

A freshly-confirmed organizer finishes onboarding and lands on `/applications`
(since the 2026-07-24 onboarding overhaul) facing five sidebar tabs whose names
tell them nothing about what belongs in each one: Aperçu, Candidatures, Fichiers,
Élèves, Communication, plus Réglages. Nothing in the product ever explains the
split. They have to click each tab and infer — on an account where every page is
an empty state, so the tabs are at their least self-explanatory precisely when
the organizer first sees them.

## Decisions

Each was chosen deliberately; recording them so the implementation does not
relitigate them.

| Decision | Choice | Why |
|---|---|---|
| Audience | **Organizers only** | Students/parents get one checklist page reached from an invite email. There are no tabs to explain. |
| Presentation | **Anchored spotlight** | Dim the app, light up one real sidebar item, explain it in a bubble. Shows the product instead of describing it, and no screenshots to rot. |
| Itinerary | **One step per tab, shallow** | 8 steps anchored on sidebar items and nothing else. Never points inside page content, so the new organizer's universal empty states cannot make a step nonsensical. |
| Trigger | **Auto-offer once + permanent re-entry** | A dismissible invitation card on `/applications`; « Visite guidée » in the account menu forever. Optional as asked — the tour never seizes the screen unasked. |
| Persistence | **`users.tour_state` enum** | Cross-device, and the only completion signal this app will ever have (there is no analytics). |
| Mechanism | **Hand-rolled spotlight + Radix Popover** | The spotlight is one div; bubble placement/collision is the part that rots when hand-rolled, so Radix owns it. |

Two facts about the current shell make this much cheaper than a general-purpose
tour engine, and the design leans on both:

1. **The sidebar has no responsive/mobile variant.** `OrganizerShell` renders
   `flex h-screen` with a `flex-none` nav pinned at 68 px (collapsed) or 250 px.
   There is no drawer and no breakpoint. Every anchor is therefore present in the
   DOM and on screen for the entire tour, whatever page is behind it.
2. **All anchors live in the layout, not in pages.** Because every step anchors on
   a sidebar item, changing route never unmounts the current anchor. The tour does
   not have to wait for a page to render, retry a `querySelector`, or hold a
   `MutationObserver`. Navigation only changes the scenery behind the dim layer.

## Non-goals

- **No student/parent tour.** A later spec may add one; nothing here is
  student-specific, but nothing here is built to be reused for them either.
- **No steps inside page content.** No « Inviter » button, form builder or
  reminder-preset step. That is the deep itinerary, explicitly deferred.
- **No mid-tour resume.** A 2-minute tour that is interrupted starts over.
- **No changes to any organizer page.** Only the shell, plus one migration.
- **No analytics beyond the `tour_state` column.**

## Design

### 1. Data — one column, one additive grant

`supabase/migrations/<stamp>_users_tour_state.sql`:

```sql
alter table users
  add column tour_state text not null default 'pending'
  check (tour_state in ('pending', 'dismissed', 'completed'));

grant update (tour_state) on public.users to authenticated;
```

This is the third per-account display preference on `users`, after
`locale` (`20260714200924`) and `exchange_order` (`20260723132613`), and follows
both exactly: the existing `"users update themselves"` policy
(`using (id = auth.uid()) with check (id = auth.uid())`, hardened in
`20260630000003`) already scopes writes to the caller's own row, so **no new
policy**.

Two details that are load-bearing:

- **The grant is additive, not a re-listing.** `20260725154243` revoked blanket
  `UPDATE` on `users` and re-granted a column list. Postgres column privileges
  accumulate, so `grant update (tour_state)` adds to that list without
  re-stating it — re-listing the other six columns would risk silently dropping
  one if the two statements ever diverge.
- **`guard_user_immutable_fields()` does not interfere.** It raises only when
  `role` or `school_id` change; `tour_state` passes through.

Existing rows get `'pending'` from the default, so every current organizer is
offered the tour once. That is intended: the tabs are no more self-explanatory
to them than to a new signup.

**Type plumbing** (in the order CLAUDE.md → Database mandates): apply to staging,
apply to prod via MCP `apply_migration`, reconcile the filename against
`list_migrations`, regenerate `types/supabase.ts`, then:

- `types/db.ts` — add `export type TourState = 'pending' | 'dismissed' | 'completed'`
  and narrow it on the existing `UserProfile` override.
- `lib/supabase/request.ts` — add `tour_state: TourState` to `Profile` and
  `tour_state` to the `getProfile()` select list. The layout already calls
  `getProfile()`, so the tour costs **zero extra queries**.

### 2. Pure core — the parts worth unit-testing

**`lib/tour/steps.ts`** — the itinerary as data, with no React and no i18n
strings (only key fragments):

```ts
export type TourStep = {
  id: string        // also the i18n key fragment
  route: string | null   // null = do not navigate
  anchor: string | null  // data-tour value; null = centered card
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome',       route: null,             anchor: null },
  { id: 'applications',  route: '/applications',  anchor: 'nav-applications' },
  { id: 'files',         route: '/forms',         anchor: 'nav-files' },
  { id: 'students',      route: '/students',      anchor: 'nav-students' },
  { id: 'communication', route: '/communication', anchor: 'nav-communication' },
  { id: 'dashboard',     route: '/dashboard',     anchor: 'nav-dashboard' },
  { id: 'settings',      route: '/settings',      anchor: 'nav-settings' },
  { id: 'finish',        route: null,             anchor: null },
]
```

Order is the approved itinerary, not sidebar order: Candidatures first because it
is where the organizer landed and where their real work starts, Aperçu later
because a progress rollup means nothing until students exist.

Also here, and the reason this file is pure:

```ts
// Indices into TOUR_STEPS whose anchor is on screen, plus the unanchored ones.
export function visibleStepIndices(isPresent: (anchor: string) => boolean): number[]
```

Resolved **once**, when the tour starts, which buys two things: the only DOM read
happens inside a click handler rather than during render (nothing SSR-unsafe),
and « n / total » counts steps the organizer will actually reach instead of
advertising a total that silently shrinks.

The filter is real, not defensive dressing: `OrganizerShell` renders the four
session-scoped tabs only when an exchange exists (`navItems` is gated on
`active`). Onboarding now guarantees a first exchange, but an organizer whose
only exchange is unreachable would otherwise get a bubble pinned to nothing —
they get a 4-step tour (welcome, Aperçu, Réglages, finish) instead.

`TOUR_STEPS` is declared `as const satisfies readonly TourStep[]` rather than
with a `: readonly TourStep[]` annotation, which would widen `id` to `string`.
`TourStepId` has to stay a literal union or next-intl rejects the dynamic key in
`t(`steps.${id}.title`)`.

**`lib/tour/state.ts`** — monotonicity, so a replay cannot downgrade a record:

```ts
// pending → dismissed → completed, one-way. Guards the replay case: finishing
// the tour from the menu must not be undoable by skipping it next time.
export function canAdvanceTourState(from: TourState, to: TourState): boolean
```

Ranks are `pending: 0, dismissed: 1, completed: 2`; advancing requires a strictly
higher rank. Enforced **server-side** in the action, not just in the client.

### 3. Client components

Three files under `components/tour/`, each with one job:

**`TourProvider.tsx`** — the only stateful piece. Holds `phase: 'idle' | 'running'`,
`index`, and the last-known `tourState`; exposes `{ start, tourState }` on a
context (mirroring the existing `ShellUiContext` precedent). Owns:

- `start()` — records the current pathname as the return address, sets
  `phase: 'running'`, `index: 0`.
- `next()` / `prev()` — `nextVisibleStep`, then `router.push(step.route)` when the
  target route differs from the current pathname.
- `finish()` / `skip()` — close, `router.push(returnAddress)` so the organizer is
  put back where they started rather than abandoned on `/settings`, and persist
  `'completed'` / `'dismissed'`.
- `dismissInvite()` — persist `'dismissed'` without ever opening the tour.

**`TourSpotlight.tsx`** — renders nothing when idle. When running:

- Measures the anchor with `getBoundingClientRect()`, re-measuring on `resize`,
  on capture-phase `scroll`, and whenever `index` or `pathname` changes (the
  sidebar collapse toggle changes width, so a `ResizeObserver` on the nav covers
  the remaining case).
- Draws the dim + hole as **one** fixed, `pointer-events-none` div sized to that
  rect: `box-shadow: 0 0 0 9999px rgb(15 23 42 / 0.55)`. No four-rectangle math,
  no SVG mask.
- Puts a second full-screen fixed layer *under* it to swallow clicks on the app
  behind, so a mis-click during the tour cannot navigate. Deliberately **inert**
  rather than dismiss-on-outside-click: a mis-click should not end the tour
  either. Passer and Escape are the exits, and both are advertised.
- Anchors `<Popover.Content side="right" align="start" sideOffset={12}
  collisionPadding={16}>` to that same div via `<Popover.Anchor asChild>`. One
  div is both the spotlight and the anchor — no invisible duplicate to keep in
  sync. `modal={false}` with `onInteractOutside` prevented, so Radix owns focus
  and Escape without fighting our own overlay.
- Steps with `anchor: null` (welcome, finish) skip Popover entirely: same dim
  layer, card centered with `fixed inset-0 grid place-items-center`.
- Bubble contents: title, body, `n / total`, progress dots, and
  Passer / Précédent / Suivant — Suivant becoming Terminer on the last step.
- The rect transition is suppressed under `prefers-reduced-motion`.

Accessibility, since `modal={false}` means Radix does **not** trap focus: the
bubble carries `role="dialog"` + `aria-modal="true"` and is labelled by its own
title (`aria-labelledby`) and body (`aria-describedby`). The provider moves focus
to the bubble on every step change, and the bubble's own `onKeyDown` keeps Tab
cycling inside it. Escape maps to skip. Without this the tour would be
keyboard-unusable: the swallow layer stops the mouse reaching the app behind, but
nothing stops Tab.

**`TourInviteCard.tsx`** — the dismissible invitation. Renders only when
`tourState === 'pending' && phase === 'idle' && pathname === '/applications'`.
« Commencer » calls `start()`; « Plus tard » calls `dismissInvite()`.

### 4. Wiring into the shell

- **`SidebarNav.tsx`** — `SidebarNavItem` gains `tourId?: string`, emitted as
  `data-tour={item.tourId}` on the `<Link>`. This is the whole anchor mechanism.
- **`OrganizerShell.tsx`** — supplies `tourId` on the six nav items, wraps its
  tree in `<TourProvider initialState={tourState}>`, renders `<TourInviteCard />`
  immediately inside `<main>` above `{children}`, and `<TourSpotlight />` at the
  end (it portals, so position in the tree is irrelevant).
- **`TourMenuItem.tsx`** — « Visite guidée » in the account menu, above
  « Se déconnecter ». It must be a *child* component, not inline JSX:
  `OrganizerShell` renders the provider, so it cannot consume the context it
  creates. It takes an `onStarted` callback to close the menu.
- **`app/(organizer)/layout.tsx`** — passes `tourState={profile.tour_state}`.

### 5. Persistence — `actions/tour.ts`

```ts
export async function setTourState(next: TourState): Promise<{ ok: boolean }>
```

`requireOrganizer()` preamble (per CLAUDE.md, never hand-rolled), then re-reads
the current value and writes only when `canAdvanceTourState` allows it. Uses the
**RLS-subject** client — the service role has no business here, and the column
grant plus the self-update policy are exactly the boundary this needs.

**It returns a structured result and never throws.** A failed tour bookkeeping
write is cosmetic: the worst case is the invitation card appearing once more. A
throw would put a Next.js error overlay in front of a brand-new organizer over a
decoration, and production redacts the message anyway. The client ignores the
result; the tour has already closed optimistically.

### 6. Copy and i18n

One new block, `organizer.shell.tour`, in all five catalogs
(`en`, `fr`, `es`, `it`, `de`):

```
tour.invite.{title,body,start,later}
tour.menuItem
tour.controls.{skip,prev,next,finish,progress}   // progress: "{current} / {total}"
tour.steps.<id>.{title,body}                    // 8 ids from TOUR_STEPS
```

`messages/__tests__/parity.test.ts` enforces key parity and ICU-argument parity
across the five locales automatically — no new test needed for that.

French copy uses typographic apostrophes (`’`). A scoped guard test asserts this
for the `tour` block only: `messages/fr.json` carries 14 pre-existing straight
apostrophes elsewhere (recorded in `BACKLOG.md`), and a repo-wide guard would
fail on them and drag unrelated fixes into this branch.

## Failure modes and degradation

| Failure | Behaviour |
|---|---|
| Anchor element missing | `nextVisibleStep` skips the step. If every anchor is missing, the tour still runs its two centered steps. |
| `setTourState` write fails | Tour closes normally. Card may be offered once more on next visit. No error surfaced. |
| Migration applied, types not regenerated | `types/db.ts` fails `tsc --noEmit` by construction — the designed drift alarm. |
| Organizer navigates by clicking the app mid-tour | Impossible: the click-swallowing layer covers the app. Sidebar links are behind it too. |
| Organizer hits Escape / browser Back | Escape closes via Radix (treated as skip). Back navigates; the tour closes on the next step attempt whose route no longer matches. Acceptable for a 2-minute optional tour. |
| Non-approved / student account | Never reached — the organizer layout redirects to `/pending` or the student shell before the shell renders. |

## Testing

**Unit (vitest):**
- `lib/tour/__tests__/steps.test.ts` — unique ids; every non-null `route` is a
  real organizer route; `nextVisibleStep` skips absent anchors in both
  directions, and returns `null` at each end.
- `lib/tour/__tests__/state.test.ts` — `canAdvanceTourState` is a strict
  one-way ladder; every downgrade and same-state pair is refused.
- `components/tour/__tests__/TourProvider.test.tsx` — invite card appears only
  for `pending` + `/applications`; « Plus tard » persists `dismissed` and does
  not open the tour; `start()` opens at step 1; walking to the end persists
  `completed`; Passer persists `dismissed`; closing returns to the start
  pathname; a missing anchor is skipped.
- `actions/__tests__/tour.test.ts` — unauthenticated rejects (`'Unauthenticated'`);
  a downgrade writes nothing; a failed write returns `{ ok: false }` and does not
  throw.
- `messages/__tests__/tour-apostrophes.test.ts` — no `'` in the French tour block.

**RLS matrix (`pnpm test:rls`)** — mirroring the `locale` / `exchange_order`
cases already in `tests/rls/matrix.test.ts`:
- organizer A can set their own `tour_state`;
- organizer A cannot set organizer B's or a school-B user's `tour_state`;
- no client can write `users.status` through the same UPDATE (the grant stays
  column-scoped — a regression here would be the serious one).

**Gate before merge:** `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`.

## File inventory

New:
```
supabase/migrations/<stamp>_users_tour_state.sql
lib/tour/steps.ts
lib/tour/state.ts
lib/tour/__tests__/steps.test.ts
lib/tour/__tests__/state.test.ts
actions/tour.ts
actions/__tests__/tour.test.ts
components/tour/TourProvider.tsx
components/tour/TourSpotlight.tsx
components/tour/TourInviteCard.tsx
components/tour/TourMenuItem.tsx
components/tour/__tests__/TourProvider.test.tsx
messages/__tests__/tour-apostrophes.test.ts
docs/superpowers/specs/2026-07-27-onboarding-tour-design.md
```

Modified:
```
components/shell/SidebarNav.tsx      (tourId → data-tour)
components/shell/OrganizerShell.tsx  (provider, tourIds, card, menu item)
app/(organizer)/layout.tsx           (pass tour_state)
lib/supabase/request.ts              (Profile.tour_state + select)
types/db.ts                          (TourState narrow)
types/supabase.ts                    (regenerated, verbatim)
messages/{en,fr,es,it,de}.json       (organizer.shell.tour)
tests/rls/matrix.test.ts             (3 cases)
BACKLOG.md                           (retire the queue line)
package.json / lock                  (@radix-ui/react-popover)
```

New production dependency: `@radix-ui/react-popover`, **pinned to exactly
1.1.17** (no caret) — the same vintage as the `react-dialog` already in the tree.
This is not fussiness: 1.1.19+ resolve a transitive
`@radix-ui/react-use-layout-effect@1.1.4` that is not published, so
`pnpm add @radix-ui/react-popover` at latest fails outright with
`ERR_PNPM_NO_MATCHING_VERSION`. Revisit the pin when upstream republishes; the
weekly `pnpm audit --prod` covers the package meanwhile (currently clean).

## Deploy state

The migration is applied and stamped on **staging** (`20260727195338`), and the
RLS matrix passes against it. **It is NOT yet applied to production**: the
Supabase MCP returned `Unauthorized` for both `apply_migration` and
`generate_typescript_types` this session, and hand-rolling prod DDL through the
Management API is not the sanctioned path.

Two consequences, in order:

1. **Do not deploy the app to production before the migration.** `getProfile()`
   now selects `tour_state`; against a prod schema without that column the select
   fails and the organizer shell breaks for everyone — not just the tour.
2. `types/supabase.ts` carries the three `tour_state` lines transplanted from a
   real staging generation (verified: the only other difference between a staging
   and a prod generation is a `graphql_public` block, which is a generator-option
   difference, not schema drift). Regenerate it verbatim via MCP once auth is
   restored, as the canonical Database step requires.

## Manual steps

- **Apply `20260727195338_users_tour_state.sql` to prod** via MCP
  `apply_migration` (name `users_tour_state`), then `list_migrations` to confirm
  the stamp matches the filename, then regenerate `types/supabase.ts`.

No dashboard configuration is needed — unlike the Stripe portal and Google OAuth
work, the migration and the deploy are the whole rollout.
