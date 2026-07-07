# Perf & correctness: cold starts + reminders cron — design

**Date:** 2026-07-07
**Status:** approved (brainstorm with Bjorn)
**Branch:** `feature/perf-cold-starts`

## Problem

Prod feels slow on **first load only** (snappy once warm). Measured on
`https://eazyexchange.com/`: cold TTFB **1.88 s**, warm **0.35–0.50 s** — the gap
is Vercel function cold start, and at current traffic nearly every real visit is
cold. The database is not the felt problem (July 2026 index/RLS round holds; no
N+1s found in the dashboard assembly).

Evidence gathering also surfaced one correctness time bomb: the `send-reminders`
edge function reads the **entire `assignments` table with no filter**. PostgREST
silently caps un-ranged selects at 1,000 rows, so once total platform assignments
pass 1,000 (~4–5 active exchanges), some students silently stop receiving
reminder emails. No error is raised anywhere.

## Scope

Three items, independently shippable:

1. Static landing page (kills cold starts for anonymous prospects).
2. Reminders cron: filtered + paginated query (fixes the 1,000-row truncation).
3. Keep-warm ping for the logged-in app (mitigates cold starts for organizers).

**Out of scope** (explicitly deferred): bulk accept/reject batching
(`actions/applications.ts:554` — sequential loop, revisit when an organizer
complains), any caching layer, dashboard query changes, new indexes.

## 1. Static landing page

Today `app/page.tsx` calls `getAuthUser()` (and `getProfile()` when logged in)
to redirect authenticated users. That single auth call forces the marketing page
fully dynamic (`x-vercel-cache: MISS`, `cache-control: no-store`), so every
anonymous prospect pays cold start + a Supabase auth round trip. `/login` by
contrast is `PRERENDER`.

**Change:**

- `middleware.ts`: handle the logged-in redirect for `/`. Merge `pathname === '/'`
  into the existing `user && isAuthRoute` branch so `/` and the auth routes share
  the single `users` role lookup already performed there. Redirect organizer →
  `/dashboard`, student → `/my-forms`. Preserve the existing orphaned-session
  escape (profile row missing → fall through, do not redirect) and the
  `/accept-invite` incomplete-setup carve-out untouched.
- `app/page.tsx`: drop `getAuthUser`/`getProfile` imports and calls; render
  `<LandingPage />` unconditionally. `metadata` stays.

`LandingPage` is a `'use client'` component whose FR/EN language state lives in
`localStorage` — no server cookie/header reads — so the page prerenders cleanly.
Middleware still runs on `/` but only does a local JWT check (`getClaims`) for
anonymous visitors and does not prevent CDN serving of the prerendered page.

**Verification:** `curl -sI https://eazyexchange.com/` shows
`x-vercel-cache: PRERENDER`/`HIT`; anonymous TTFB ≈ CDN latency (< 150 ms) even
after idle; a logged-in browser hitting `/` still lands on `/dashboard`
(organizer) or `/my-forms` (student). `middleware.test.ts` gains cases:
`/` anonymous → pass-through; `/` logged-in organizer → `/dashboard`; `/`
logged-in student → `/my-forms`; `/` orphaned session → pass-through.

## 2. Reminders cron: bounded, filtered query

`supabase/functions/send-reminders/index.ts` keeps its per-student grouping,
cadence math (`pacing.ts` untouched) and stamp-after-send behavior. Only the
fetch changes:

- **Filters pushed into PostgREST** (legal on the existing `!inner` joins):
  - `form_templates.deadline` not null
  - `form_templates.exchanges.archived_at` is null
  - `form_templates.exchanges.reminders_enabled = true`
- **Pagination:** fetch in pages of 1,000 via `.range()`, ordered by `id`,
  looping until a short page. Accumulate all pages before grouping.
- Status filtering ("needs action" = no submission / draft / rejected) **stays in
  JS**: filtering a parent on a nullable one-to-one embed is fragile in PostgREST
  and the filtered row volume is small once the above filters apply.

The pagination loop is extracted as a small pure-ish helper (page-fetcher
callback → accumulated rows) so vitest can cover the loop/short-page/error
semantics without Deno. On any page fetch error: log and return 500 as today
(no partial sends from a half-read cohort — matches current all-or-nothing
behavior).

**Deploy:** manual `supabase functions deploy send-reminders` (keep
`verify_jwt: false`). No DB migration.

**Verification:** unit tests for the pager; deployed function's response JSON
(`{ students, emailsSent }`) sanity-checked against expectations after one cron
run.

## 3. Keep-warm for the logged-in app

Cold starts on `/dashboard` can't be removed (page must stay dynamic), so shrink
their frequency:

- **Manual step (Bjorn):** Vercel → Settings → Functions → confirm **Fluid
  Compute** is enabled (default for projects this new; 30-second check).
- **Pinger:** Vercel Cron is off the table (Hobby plan = max once daily). Reuse
  the existing stack instead: a Supabase `pg_cron` job (same mechanism as
  `send-reminders`) calls `https://eazyexchange.com/api/health` every 5 minutes
  via `pg_net`.
- **New route:** `app/api/health/route.ts` — dynamic, no auth, no DB, returns
  `{ ok: true }`. Nothing secret; safe to expose.
- The cron SQL lives in a checked-in setup file (mirroring
  `supabase/cron-setup.sql` conventions), applied to prod via MCP `execute_sql`
  (NOT `supabase db push` — known drift trap).

**Known caveat (accepted):** whether warming `/api/health` keeps the dashboard's
function warm depends on Vercel's route-to-function bundling. Verification is
empirical: ~24 h after enabling, re-run the cold-vs-warm curl measurement on a
first hit after idle. If first-hit TTFB has not dropped, fallback = point the
ping at a heavier public dynamic route (e.g. `/apply/<slug>`) or drop the pinger
and rely on Fluid Compute alone.

## Error handling

- Middleware redirect: any failure mode must fall through to serving the page,
  never a 500 loop (mirror existing orphaned-session handling).
- Health route: unconditionally 200; no dependencies to fail.
- Reminders pager: fail the whole run on a page error (retry next day) rather
  than sending from a truncated dataset.

## Testing & ship gate

- `pnpm lint`, `pnpm test` (vitest), `tsc --noEmit` (local `pnpm build` fails on
  placeholder env — per project convention).
- New unit tests: middleware `/` cases; reminders pager.
- Standard gate before merge to `main`; merge deploys to prod. Edge-function
  deploy and pg_cron SQL are separate manual steps recorded in the plan.

## Verification after deploy (whole feature)

1. `curl -sI https://eazyexchange.com/` → `PRERENDER`/`HIT`.
2. Logged-in `/` → dashboard redirect intact.
3. One daily reminders run: response JSON plausible, no error logs.
4. After 24 h of pinging: first-hit TTFB after idle ≪ 1.9 s.
