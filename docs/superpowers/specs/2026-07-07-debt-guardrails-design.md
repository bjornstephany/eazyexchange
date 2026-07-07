# Debt Guardrails Sprint — Design

**Date:** 2026-07-07
**Status:** Approved by Bjorn (brainstorm session)
**Shape:** Guardrails + documentation only. No restructuring, no behavior changes. ~1 focused day.

## Context

Tech-debt survey of the codebase (390 files, ~13.7k non-test TS lines, 394 commits since 2026-06-24). Bjorn reports no *felt* friction yet — this sprint is preventive. The bar for inclusion was therefore: cheap, or prevents silent corruption, or de-risks a proven bite area. Refactors requiring a prediction about future churn were declined (§5).

Survey findings that motivated each section:

- **Migration drift is real, today.** 7 local migration files carry different version timestamps than prod's migration ledger (MCP `apply_migration` stamped its own versions). `supabase db push` would try to re-apply applied migrations. `supabase/migrations/` is currently not authoritative and nothing says so.
- **`types/db.ts` is hand-maintained** with a keep-in-sync rule that lives only in Claude auto-memory. 26 `as any` / `supabase: any` escapes in `actions/` + `lib/`.
- **~54 hand-rolled auth preambles** (`getAuthUser → getProfile → role check → throw`) across server actions; `actions/settings.ts` already extracted a private `getOrganizerCtx()` used nowhere else.
- **Tribal knowledge outside the repo:** migration workflow, error-redaction convention, preview-deploy loop, invite-template config, env inventory — all in Claude auto-memory on one machine.
- Healthy and left alone: `lib/email.ts` factoring, `lib/supabase/request.ts` cached helpers, `lib/billing/` isolation, reminder pacing module, spec history in `docs/superpowers/specs/`.

## 1. Heal the migration ledger; document the one true workflow

**Heal:** `git mv` the 7 drifted local files to the versions prod's ledger recorded, after verifying content matches what shipped:

| Local (wrong) | Prod ledger (rename to) |
|---|---|
| `20260703000002_documents_organizer_delete` | `20260703172826_documents_organizer_delete` |
| `20260703000003_fix_storage_policy_name_resolution` | `20260703222526_fix_storage_policy_name_resolution` |
| `20260705000001_stable_rls_helpers` | `20260705172941_stable_rls_helpers` |
| `20260705000002_fk_indexes` | `20260705172949_fk_indexes` |
| `20260705000003_fk_indexes_followup` | `20260705173212_fk_indexes_followup` |
| `20260705000004_rls_initplan_select_wrap` | `20260705173309_rls_initplan_select_wrap` |
| `20260707000001_exchanges_school_b_nullable` | `20260707131801_exchanges_school_b_nullable` |

**Document (in CLAUDE.md, replacing the current `supabase db push` instruction):** the canonical workflow is: write the SQL file locally → apply via MCP `apply_migration` → rename the local file to the version the ledger stamped (check `list_migrations`) → regenerate DB types (§2). Include the drift check (local filenames vs `list_migrations` output) as a routine step after applying.

**Success:** local filename list is byte-identical to prod ledger versions; CLAUDE.md describes a workflow that cannot reintroduce drift.

## 2. Generated DB types replace hand-maintained ones

- Generate `types/supabase.ts` from the live schema (Supabase type generator via MCP `generate_typescript_types`); commit it.
- Keep `types/db.ts` as the app-facing module, but redefine its row types as aliases over the generated `Tables<...>` types. Hand-written enums/unions (e.g. `ApplicationStatus`) stay if the DB column is plain `text`, but must be anchored to the generated column type where possible so drift becomes a compile error.
- Type the clients with the `Database` generic in `lib/supabase/server.ts`, `admin.ts`, `client.ts` (and `request.ts` if needed).
- Burn down the ~26 `as any` / `supabase: any` in `actions/` and `lib/` that typed clients make unnecessary (e.g. `getExchanges`'s `as any[]`, `assertOrganizerOwnsApplication(supabase: any, …)`). Any that remain must earn a comment.
- Retire the "migration tasks must also touch types/db.ts" memory rule; "regenerate types" is now a mechanical step of §1's workflow.

**Success:** `tsc --noEmit` clean with typed clients; a deliberately stale `types/supabase.ts` after a schema change produces compile errors rather than silence.

## 3. Promote tribal knowledge from auto-memory into the repo

**CLAUDE.md** (conventions that affect writing code):
- The §1 migration workflow (replaces the `db push` section).
- Server-action error redaction: production redacts thrown Server Action/RSC error messages; expected outcomes must be structured return values; never branch client-side on `error.message`.

**`docs/DEPLOY.md`** (operational knowledge; absorb, don't duplicate CLAUDE.md):
- Preview-deploy loop: per-branch Vercel Preview URLs instead of pushing to prod. Data caveat: previews currently still hit the prod Supabase project; the share-prod-data decision was reversed 2026-07-07 in favor of a separate staging project (see `2026-07-07-architecture-scalability-design.md`) — document the *current* state and point at that spec for the target state.
- Supabase invite email template must point at `/auth/confirm` — a default template silently breaks all student invites (symptom: "Auth session missing!", GET `/verify` in auth logs).
- Full env-var inventory across Vercel/local: Supabase keys, Resend (`EMAIL_FROM` must be `Name <mailbox@domain>`, not a bare domain), Stripe set, `FEEDBACK_EMAIL`, `NEXT_PUBLIC_APP_URL` (must be non-sensitive or it bakes empty into the client bundle).
- Manual dashboard steps not in code: Supabase Site URL + redirect URLs, Google provider config pointer (details already in CLAUDE.md), Stripe webhook registration pointer.

Rule of thumb going forward: auto-memory holds project *status*; the repo owns *how things work*.

**Success:** a fresh clone + CLAUDE.md + docs/ is enough to develop, migrate, and deploy without Claude's auto-memory.

## 4. `requireOrganizer()` / `requireStudent()` helpers

- Add `lib/auth/require.ts` (the `lib/auth/` directory already exists): `requireUser()`, `requireOrganizer()`, `requireStudent()`, built on `getAuthUser`/`getProfile` from `lib/supabase/request.ts` — each does the auth dance once and returns `{ user, profile }`, throwing the **exact current strings** (`'Unauthenticated'`, `'Unauthorized'`) so tests and any callers relying on messages are untouched. `requireOrganizer` accepts an optional `orgRole: 'owner'` check.
- Sweep the ~54 hand-rolled preambles across `actions/*.ts`; fold `actions/settings.ts`'s private `getOrganizerCtx()` into the shared helper.
- Micro-item riding along: move `frShortDate` from `lib/dashboard/rollup.ts` to a new `lib/dates.ts` (re-export from rollup if needed to keep the diff small); `lib/email.ts` stops importing from a dashboard module.

**Success:** no action hand-rolls the preamble; all 555 tests pass unmodified. A failing test signals a semantic slip in the helper, not a test to update.

## 5. Explicitly declined, with tripwires

**Declined:**
- **components/ directory reorg** (14 legacy root-level components vs newer domain folders). Buys tidiness, not speed; changes don't ripple through placement.
- **RLS test harness** (local Supabase + policy tests). The June security audit hardened policies and the fix-migration cluster stopped; WSL2 local-Supabase friction makes this expensive. *Revisit trigger:* the next RLS bug that reaches prod. **Note:** the multi-tenancy isolation spec (8ecd104, same day) proposes a D1 RLS test suite — if that ships, it supersedes this declination; this sprint simply doesn't build one.

**Tripwire (binding on future work):**
- The next feature that touches `actions/applications.ts` (572 lines, churn leader, mixes public-token / organizer / invitation trust models) **starts by splitting it along trust lines** — `actions/apply.ts` (public token flow), `actions/applications-review.ts` (organizer), `actions/invitations.ts` — before adding behavior.

## 6. Execution shape

- One branch: `chore/debt-guardrails`. Order: §1 → §2 → §3 → §4 (types regen assumes the healed ledger; docs reference the final workflow).
- No behavior changes anywhere. Gate before merge: `pnpm lint`, `pnpm test` (555/555), `npx tsc --noEmit`.
- Coordination: three sibling specs from 2026-07-07 are also awaiting review — perf cold starts (94f2fb0), test reliability hardening (608e7a2), multi-tenancy isolation (8ecd104). This sprint's files (types/, lib/auth/, lib/supabase/, action preambles, CLAUDE.md, docs/DEPLOY.md, migration renames) barely overlap theirs, but the §4 preamble sweep touches every `actions/*.ts` file, so run this sprint while no other branch is open, and merge specs' implementation branches one at a time.

## Error handling & testing

This sprint intends zero runtime behavior change. The protections are: identical thrown error strings in §4; content-verified renames in §1 (renames don't touch prod — the ledger is already correct; only local files move); §2 is compile-time only. The existing suite (555 tests) plus `tsc` is the acceptance gate; no new tests are required except any that naturally cover the new helpers' role-rejection branches if not already covered via action tests.
