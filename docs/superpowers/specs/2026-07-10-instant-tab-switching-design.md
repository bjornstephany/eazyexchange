# Instant tab switching — design

**Date:** 2026-07-10
**Source:** prod UX complaint — clicking between the organizer rail tabs shows the
full branded splash (« CHARGEMENT DE VOTRE ESPACE… ») on every switch.
**Scope exclusions:**
- No client-side data layer (SWR/React Query conversion was considered and ruled
  out — against the server-component + RLS + server-actions architecture).
- Student side and deeper organizer pages (`exchanges/[id]`, form builder,
  submission review) keep the existing splash; only the six rail tabs get
  skeletons.
- Dev-mode speed is out of scope (Next.js disables `Link` prefetching in dev and
  compiles routes on demand; the complaint is production-only, confirmed).

**Why it's slow today:** each rail tab is a dynamic server route. Every click
sends an RSC request that re-runs auth + several Supabase queries before
anything paints, and Next 15's default client router cache keeps dynamic pages
for **0 seconds** — even switching back to a tab you just left refetches
everything. Meanwhile `app/(organizer)/loading.tsx` shows the full splash.

**Success criteria:** in prod, switching between prefetched/recently-visited
rail tabs paints instantly with no loading UI; a cache-miss switch shows a
content-shaped shimmer, never the splash; your own edits still appear fresh
immediately.

---

## 1. Client router cache + prefetch

Files: `next.config.mjs`, `components/shell/OrganizerShell.tsx`.

### 1a. Enable router-cache reuse for dynamic pages
```js
// next.config.mjs
const nextConfig = {
  experimental: { staleTimes: { dynamic: 180 } },
}
```
Visited dynamic pages become reusable from the client router cache for
**180 seconds** (locked decision). This is global (student side, billing, apply
funnel included). Brainstorming spot-checks found no flow that relies on a
fresh read after a plain client-side navigation without a server action or
`router.refresh()` in between; §3 makes that a systematic check.

### 1b. Prefetch the six rail tabs
`RailItem`'s `<Link>` in `OrganizerShell.tsx` gets `prefetch={true}`. The rail
is always visible, so all six tabs prefetch their full RSC payload right after
the shell mounts — the *first* click on each tab is instant too. Prefetched
entries are reusable for 5 minutes (Next's `static` staleTime, left at its
default). The `/settings` link in the avatar dropdown keeps default prefetch.

### 1c. Freshness mechanisms — unchanged, load-bearing
- Server actions call `revalidatePath` (45 call sites across all 8 action
  files) → your own mutations purge the router cache; the next tab view is
  fresh.
- `SessionSelector` (exchange switch) already revalidates the whole tree.
- `ReturnPoller` (Stripe checkout return) calls `router.refresh()` every 2 s →
  the post-payment dashboard is fresh by construction.

**Accepted trade-offs** (approved 2026-07-10):
- Changes made by *others* (e.g. a student submitting while the organizer flips
  tabs) can lag up to ~3–5 min. A full reload always shows live data.
- Each shell mount triggers ~6 background RSC renders (auth + queries each) —
  negligible at current scale; keep-warm cron keeps the function hot.

## 2. Content-shaped skeletons for the six rail tabs

Files: new `components/ui/skeleton.tsx` (shadcn-style `animate-pulse` block) +
six new `loading.tsx` files under `app/(organizer)/`:

| Route | Skeleton shape (mirrors the page's real layout) |
|---|---|
| `dashboard/` | stat tiles row + roster-grid block (per `OverviewView`) |
| `exchanges/` | page header bar + card list (per `ExchangesView`) |
| `applications/` | header + toolbar + table rows (per `CandidaturesView`) |
| `forms/` | header + card grid (per `FormsView`) |
| `documents/` | header + card grid (per `DocsView`) |
| `students/` | header + table rows |

Skeletons are neutral shimmer blocks only — no text, reuse each page's
container/padding structure so the switch feels spatially stable. Exact block
counts/sizes are the implementer's call from the real page markup; no
pixel-perfection required.

The group-level `app/(organizer)/loading.tsx` splash **stays** and still covers
everything without a closer boundary (deeper pages, cold entries to them).

**Locked decision:** cold entry after login lands on `/dashboard` and now shows
the dashboard skeleton instead of the splash — accepted, deliberate.

## 3. Freshness audit (verification task, expected no-op)

Sweep every mutation in `actions/*.ts` and confirm its `revalidatePath` set
covers the *other* tabs its result appears on (e.g. accepting an application →
`/students` + `/dashboard`; creating a form template → `/forms` + `/dashboard`;
toggling application_open → `/applications` + `/dashboard`). Coverage looks
complete (45 call sites); any gap found is fixed by adding the missing
`revalidatePath` in the same PR. Also confirm no client flow does a plain
`router.push` to a page whose data it just changed outside a server action.

## 4. Error handling & testing

No new error surface: `error.tsx` boundaries unchanged; a failed prefetch
silently degrades to a normal navigation.

- Unit: render test for each of the six `loading.tsx` (renders without crash,
  contains shimmer blocks); a `RailItem` test asserting `prefetch` is passed to
  `Link` (via the existing shell test setup / `next/link` mock).
- Manual on preview then prod: click all six tabs twice — no splash, instant on
  revisit; make an edit on one tab, confirm it's fresh on another; full reload
  still shows live data.

## 5. Rollout

One branch, standard gate (`pnpm lint` / `pnpm test` / `pnpm build`). No
migration, no RLS change, no new env vars. Preview deploy spot-check (staging
data), then PR → merge → CI deploys prod.
