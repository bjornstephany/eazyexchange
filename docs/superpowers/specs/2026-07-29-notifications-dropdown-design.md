# Notifications dropdown in the organizer header — design

**Date:** 2026-07-29
**Branch:** `feature/notifications-dropdown`
**Base:** `main` at `f35e645` (the landing-page pending-gate merge)

## Problem

The organizer dashboard already computes six "action cards" — candidatures à
examiner, dossiers à vérifier, élèves en retard, documents manquants, « peut-être »
en suspens, aucun formulaire (`lib/dashboard/rollup.ts:289`). All six are scoped to
the **active exchange**, and they only exist on `/dashboard`.

So an organizer running three exchanges has no way to answer *"is anything waiting
for me anywhere?"* short of switching exchange three times and reading the dashboard
each time. And from any other page — Fichiers, Élèves, Communication, Réglages —
there is no signal at all that work has arrived.

## Decisions

Each was chosen deliberately; recording them so the implementation does not
relitigate them.

| Decision | Choice | Why |
|---|---|---|
| Content model | **Derived digest, no event table** | Computed from existing rows on each render. An event feed (`notifications` table, write points in every server action) is explicitly deferred — see Future direction. |
| Scope | **All exchanges, grouped by exchange** | This is the entire value. An active-exchange-only bell would restate the dashboard. |
| Row grain | **Aggregated counts per exchange per kind** | Bounded height whatever the school size, one round trip, and **no student names in a header dropdown on every page** — this data belongs to minors. |
| Badge semantics | **Seen-watermark, not total** | A derived digest has no read state; an élève stays overdue for weeks. Badging the total means a permanently red bell, which trains organizers to ignore it. |
| Query shape | **One `security invoker` SQL function** | Per-exchange grouping done by the DB in one round trip instead of several supabase-js counts grouped in JS. |
| Fetch site | **`app/(organizer)/layout.tsx`, in the existing `Promise.all`** | Badge and list share one payload: no client fetch, no spinner, no flash, always fresh after any navigation. |
| Kinds in v1 | **Three** | Candidatures à examiner, dossiers à vérifier, élèves en retard. Everything else deferred. |

## Non-goals

- **No `notifications` table, no write points, no backfill.** v1 derives.
- **No per-student rows.** Names of minors stay off the global header.
- **No billing/payment row.** `PaymentWarningBanner` already surfaces grace and
  failed payments inside the shell; duplicating it in the bell buys nothing.
- **No « documents manquants », « peut-être » or « aucun formulaire » rows.** The
  first two have no event timestamp so they could never contribute to the badge;
  the third is a setup nag, not a notification. The dashboard keeps all three.
- **No realtime, no polling.** The digest refreshes on navigation, which for this
  product's cadence (deadlines measured in weeks) is ample.
- **No student-side notifications.** Students have one checklist page.
- **No changes to any organizer page.** The files touched are: one migration,
  `app/(organizer)/layout.tsx`, `actions/session.ts`, `components/shell/*`,
  `lib/shell/notifications.ts`, the five `messages/*.json`, and tests. Nothing
  under `app/(organizer)/{dashboard,applications,forms,students,communication}`.

## Design

### 1. Data — one migration, two objects

`supabase/migrations/<stamp>_organizer_notifications.sql`.

#### (a) The watermark column

```sql
alter table users add column notifications_seen_at timestamptz;

grant update (notifications_seen_at) on public.users to authenticated;
```

Nullable on purpose: `null` means "never opened the bell", so on first sight every
open item counts as new. This is the fourth per-account display preference on
`users` after `locale` (20260714200924), `exchange_order` (20260723132613) and
`tour_state` (20260727224025), and is governed identically — the existing
*"users update themselves"* policy (20260624000002, hardened in 20260630000003)
already confines the write to the caller's own row, so **no new policy**.

The grant is additive, exactly as in `20260727224025_users_tour_state.sql:24`:
Postgres column privileges accumulate, so this statement adds one column to the
explicit list installed by 20260725154243. **Do not restate the other columns** —
`status`, `reviewed_at` and `notes` must stay service-role-only.

#### (b) The aggregate function

```sql
create function public.organizer_notifications()
returns table (
  exchange_id uuid,
  kind        text,          -- 'applications_to_review' | 'submissions_to_review' | 'late'
  total       int,           -- open items right now
  new_count   int,           -- subset whose event time is after notifications_seen_at
  newest_at   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with seen as (
    select coalesce(
      (select u.notifications_seen_at from users u where u.id = (select auth.uid())),
      '-infinity'::timestamptz
    ) as at
  ),
  items as (
    -- Candidatures à examiner: the subject IS the application, so the dedup
    -- below is a no-op for this branch.
    select a.exchange_id, 'applications_to_review'::text as kind,
           a.id::text as subject, a.submitted_at as event_at
      from applications a
      join exchanges e on e.id = a.exchange_id
     where a.status = 'submitted'
       and a.submitted_at is not null
       and e.archived_at is null

    union all

    -- Dossiers à vérifier: subject is the STUDENT, not the submission.
    select t.exchange_id, 'submissions_to_review',
           asg.student_id::text, s.submitted_at
      from submissions s
      join assignments asg  on asg.id = s.assignment_id
      join form_templates t on t.id  = asg.template_id
      join exchanges e      on e.id  = t.exchange_id
     where s.status = 'submitted'
       and s.submitted_at is not null
       and e.archived_at is null

    union all

    -- Élèves en retard: subject is the STUDENT. Event time is the deadline.
    select t.exchange_id, 'late',
           asg.student_id::text, t.deadline::timestamptz
      from assignments asg
      join form_templates t   on t.id = asg.template_id
      join exchanges e        on e.id = t.exchange_id
      left join submissions s on s.assignment_id = asg.id
     where t.deadline is not null
       and t.deadline < current_date
       and (s.id is null or s.status <> 'approved')
       and e.archived_at is null
  ),
  deduped as (
    select i.exchange_id, i.kind, i.subject, max(i.event_at) as event_at
      from items i
     group by i.exchange_id, i.kind, i.subject
  )
  select d.exchange_id,
         d.kind,
         count(*)::int,
         count(*) filter (where d.event_at > (select at from seen))::int,
         max(d.event_at)
    from deduped d
   where (select my_role()) = 'organizer'
   group by d.exchange_id, d.kind
$$;

grant execute on function public.organizer_notifications() to authenticated;
```

Three `union all` branches over a common shape
`(exchange_id, kind, subject, event_at)`, deduped by subject, then grouped:

| kind | one counted unit = | event time |
|---|---|---|
| `applications_to_review` | one **application** with `status = 'submitted'` | `applications.submitted_at` |
| `submissions_to_review` | one **student** with ≥1 submission awaiting review | latest `submissions.submitted_at` for that student |
| `late` | one **student** past ≥1 template deadline with no approved submission | latest passed `form_templates.deadline` for that student |

**The counted unit is the student, not the row, for the last two.** That is what
makes « 7 dossiers à vérifier » and « 2 élèves en retard » in the bell equal the
numbers the dashboard's action cards already show for the same words — those count
per-student rollups (`lib/dashboard/rollup.ts:309,317`), not submissions. Counting
raw submissions here would give the same phrase two different numbers on two
surfaces, which is worse than no bell.

`new_count` counts subjects whose `event_at` is after the caller's
`notifications_seen_at` (`-infinity` when never opened, so first sight shows
everything as new).

Making the deadline the event time is what gives `late` sane badge behaviour: an
overdue dossier lights the badge on the day its deadline crosses, then goes quiet
while remaining **listed** in the panel. That is the mechanism that stops the bell
from being permanently red.

Rows with `total = 0` are not returned. Archived exchanges (`exchanges.archived_at
is not null`) are excluded outright — no notifications for a closed programme.
Templates with `deadline is null` cannot be late and are excluded from that branch.
A submission with status `rejected` still counts as late: only `approved` clears it.

**Security.** `security invoker` is the whole story: RLS on `applications`,
`submissions`, `assignments` and `form_templates` already scopes an organizer to
their own school, and the function inherits the caller's policies rather than
restating them. It additionally opens with `(select my_role()) = 'organizer'`,
which is also the approval gate — per CLAUDE.md, `my_role()` returns the role only
when `users.status = 'approved'`, so a pending account gets zero rows for free.
No service role anywhere, therefore **no `lib/supabase/admin` allowlist entry**.

`set search_path = public` is belt-and-braces against search-path games; `stable`
lets the planner call it once.

### 2. Reading it — the layout

`app/(organizer)/layout.tsx` already awaits the exchanges query. The RPC joins it:

```ts
const [{ data: exchangeRows }, { data: notificationRows }] = await Promise.all([
  supabase.from('exchanges').select(...)...,
  supabase.rpc('organizer_notifications'),
])
```

One extra round trip, issued in parallel, so ~no added latency.

**It must never break the shell.** An RPC error yields `null`, which the shaping
layer treats as `[]`: the bell renders with no badge and the empty state. The
layout does not throw, does not log PII, and does not block the page.

The rows are handed to a pure module, `lib/shell/notifications.ts`:

```ts
export type NotificationRow = { exchange_id: string; kind: NotificationKind; total: number; new_count: number; newest_at: string | null }
export type NotificationGroup = { exchangeId: string; exchangeName: string; items: { kind: NotificationKind; total: number; isNew: boolean }[] }

export function buildNotificationGroups(rows, exchanges): NotificationGroup[]
export function badgeCount(rows): number   // sum of new_count, 0 when empty
```

`buildNotificationGroups` orders groups by the **display order the sidebar already
uses** — the `sortExchanges` output the layout computes for `ExchangeOption[]` — so
the bell and the sidebar can never disagree about ordering or naming. Rows whose
`exchange_id` matches no visible exchange are dropped. Items within a group are
ordered `applications_to_review`, `submissions_to_review`, `late` (fixed, not
data-driven, so the panel does not reshuffle between renders).

Keeping shaping in a pure module is deliberate: it is the part with branching, and
it becomes unit-testable without a database.

### 3. Writing the watermark — one server action

`markNotificationsSeen()` in `actions/session.ts`. It belongs there rather than in a
new file: same trust model as `setExchangeOrder` — an authenticated organizer
writing a display preference on their own row.

```ts
export type MarkSeenResult = { ok: true } | { ok: false; reason: 'write_failed' }
```

- `requireOrganizer()` preamble (never hand-rolled — CLAUDE.md).
- `update users set notifications_seen_at = now() where id = user.id`, confined by
  the existing self-update policy.
- **Structured return, never a throw.** Production replaces thrown server-action
  messages with an opaque digest, so a throw would be unreadable at the call site.
- **Deliberately no `revalidatePath`** — the same reasoning as `setExchangeOrder`
  (`actions/session.ts:58`): busting the layout tree would re-render the entire
  shell while the dropdown is open, closing it under the organizer's cursor. The
  badge clears in local component state instead, and the next navigation re-reads
  the real value.

Called once when the panel opens (not on every render, not on close). A failed
write is silent: the badge still clears locally for this session and reappears on
the next navigation. Nothing the organizer can do about it, and nothing lost.

### 4. The UI

#### Icon

The supplied bell SVG lands in `components/shell/RailIcons.tsx` as `IconBell`,
alongside `IconOverview` / `IconFeedbackLight` etc. It is a `fill="currentColor"`
path, matching that file's convention. Sized **18px**, not the snippet's `size-6`,
to sit with the header's other glyphs.

#### Placement

`OrganizerShell.tsx:223` — the header's right cluster is currently
`[Feedback] [avatar]`. It becomes `[Feedback] [bell] [avatar]`.

#### Trigger

A button matching the Feedback button's 38px metrics, with
`aria-haspopup="menu"`, `aria-expanded`, and `aria-label` from
`organizer.shell.notifications.trigger`.

The badge is a small pill anchored top-right of the button, **rendered only when
`badgeCount > 0`**, capped at `9+`. `total` never drives the badge; only
`new_count` does. It is also exposed to assistive tech through the trigger's
accessible name (`{n} nouveautés`), not as a bare decorative number.

#### Panel

Same visual language as the account menu at `OrganizerShell.tsx:244` —
`absolute right-0 top-full mt-2 rounded-[11px] border bg-card shadow-float` — but
~300px wide with a `max-h` and internal scroll.

Content: exchange name as a group header, then one row per kind. Rows with
`isNew` carry the accent dot and stronger weight; carried-over rows are muted.
Empty state is a single centred *« Rien en attente »*.

#### Clicking a row

Mirrors `ExchangeList`'s handler at `ExchangeList.tsx:204` exactly:

```ts
await setActiveExchange(exchangeId)
router.push(destination)
```

then closes the panel. Destinations:

| kind | destination |
|---|---|
| `applications_to_review` | `/applications?tab=toreview` |
| `submissions_to_review` | `/dashboard` |
| `late` | `/dashboard` |

The two dashboard rows land on the dashboard **unfiltered**, where the matching
action card already sits at the top of the page. Deep-linking a filter is
deliberately out of scope: the dashboard's filter is component state
(`useState` in `OverviewView.tsx:66`), not a URL parameter, so honouring
`?filter=late` would mean editing an organizer page — which the non-goals forbid.
If that becomes worth doing it is its own change.

#### One targeted cleanup

The outside-click + Escape effect at `OrganizerShell.tsx:116–132` currently serves
the account menu alone. Rather than paste a second copy, lift it into
`components/shell/useDismissable.ts` — `useDismissable(open, onClose)` returning
the ref — and have **both** menus use it. Opening one closes the other (a single
`openMenu: 'account' | 'notifications' | null` state in `OrganizerShell` rather
than two booleans).

This is the only refactor in scope. Nothing else in the shell is touched.

### 5. i18n

New keys under `organizer.shell.notifications.*` in all five locale files
(`messages/{en,fr,de,es,it}.json`):

- `trigger` — the button's accessible name
- `badgeLabel` — `{n} nouveautés`, plural-aware
- `title` — panel heading
- `empty` — « Rien en attente »
- `kinds.applicationsToReview` / `kinds.submissionsToReview` / `kinds.late` —
  each plural-aware on `{n}` (« 1 candidature à examiner » / « 3 candidatures à
  examiner »)

The existing apostrophe/accent guard applies; French uses typographic apostrophes
per `20260716121027_normalize_standard_apostrophes.sql` and the i18n sweep.

## Testing

**Vitest — `lib/shell/__tests__/notifications.test.ts`** (pure, no DB):
grouping and sidebar ordering; unknown `exchange_id` dropped; fixed kind order
within a group; `badgeCount` sums `new_count` and ignores `total`; `[]` and
`null` inputs both yield an empty result.

**Vitest — `components/shell/__tests__/NotificationsMenu.test.tsx`**:
badge hidden at 0 and capped at `9+`; groups and rows render; empty state; row
click calls `setActiveExchange` then `router.push` with the right destination and
closes the panel; opening calls `markNotificationsSeen` exactly once; Escape and
outside-pointerdown close; opening the bell closes the account menu and vice versa.

**Vitest — `components/shell/__tests__/OrganizerShell.test.tsx`** (extend):
the bell renders between the Feedback button and the avatar trigger.

**RLS matrix — `tests/rls/rpc.test.ts`** (extend), required by CLAUDE.md since this
ships a new function:
organizer A's call returns rows only for school A's exchanges; organizer B sees
none of A's counts; a `pending` organizer gets zero rows (the `my_role()` gate);
a student gets zero rows; `anon` cannot `execute`. Plus one case asserting the
`notifications_seen_at` column grant lets a user update their own row and the
existing policy still blocks updating another's.

`pnpm test:rls` is mandatory for this change (new function + new column grant),
on top of `pnpm lint`, `pnpm test`, `pnpm build`.

## Risks

**The RSC navigation stall.** `setActiveExchange` → `router.push` is precisely the
pattern of the unresolved investigation in
`docs/superpowers/specs/2026-07-28-rsc-navigation-stall-investigation.md` — the
router intermittently never commits a navigation after a successful server action.
This design does **not** introduce the bug: `ExchangeList.tsx:204` already ships it
today, and the bell reuses that exact handler shape. It does add a second surface
where an organizer can hit it. Recorded, not solved here; whatever fixes
`ExchangeList` fixes the bell.

**Layout cost.** One extra round trip on every organizer page render. Mitigated by
issuing it inside the existing `Promise.all`. If it ever shows up in the cold-start
work, the fallback is to move the RPC behind the panel's open and keep only a
cheap count in the layout — the shaping module and the component both survive that
change unmodified.

## Future direction — the event feed

v1 is deliberately shaped so the deferred event feed is an additive change rather
than a rewrite:

- `users.notifications_seen_at` **is** the read state an event feed needs. It
  survives the migration unchanged.
- `NotificationGroup` / `NotificationKind` and the panel's row rendering stay; a
  feed adds rows with a per-item subject and timestamp rather than replacing the
  grouping.
- `organizer_notifications()` can gain a fourth `union all` branch reading a
  `notifications` table, so derived and recorded items coexist during the
  transition instead of requiring a cutover.

What a feed would add and this cannot: *"Marie a déposé son passeport il y a 2h"* —
per-item history with actors and subjects. That is also what forces the PII
decision this version sidesteps, and it is the reason it is deferred rather than
merely unbuilt.
