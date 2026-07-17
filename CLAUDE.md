# EazyExchange

A SaaS web app for student exchange organizers to manage forms and documents collection from students and parents.

## Project Overview

**Problem:** Exchange organizers spend significant time chasing students/parents to fill out required forms before a trip.

**Solution:**
- Students get a personal checklist of forms to complete with clear deadlines and automated reminders
- Organizers get a master dashboard showing completion status across all students

**MVP Scope:** Forms and documents collection only. One exchange program at a time per school pair.

## Tech Stack

- **Framework:** Next.js 14+ (App Router, Server Actions)
- **Database / Auth / Storage:** Supabase (PostgreSQL + RLS + Supabase Auth + Supabase Storage)
- **Email:** Resend
- **Styling:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel (frontend), Supabase hosted (backend)

## Key Concepts

- **School:** Each participating high school is a record. Organizers and students belong to a school.
- **Exchange:** A named program linking two schools (e.g., "France-Canada 2026").
- **Form Template:** Created by an organizer. Either `data_entry` (structured fields) or `document_upload` (named file slots).
- **Assignment:** Links a student to a form template they must complete.
- **Submission:** A student's response to an assignment. Statuses: `draft` → `submitted` → `approved` / `rejected`.

## User Roles

- **Organizer:** Creates exchanges, builds form templates, invites students, reviews/approves submissions.
- **Student/Parent:** Invited by email, fills out forms and uploads documents, sees their own status.

Organizers self-register at `/signup` (email-confirmed; creates their school). Students/parents remain invite-only — no student self-registration.

## Local Development

```bash
pnpm install
pnpm dev
```

Environment variables: copy `.env.example` (the authoritative, commented list of
every required variable) to `.env.local` and fill it in. Key rotation:
`docs/security/key-rotation-runbook.md`.

## Verifying Changes

Run before considering work complete:
```bash
pnpm lint        # next lint
pnpm test        # vitest run (config: vitest.config.ts)
pnpm build       # catches type errors + build breakage
```

Any change touching `supabase/migrations/`, RLS policies, or storage buckets must
also pass `pnpm test:rls` (RLS regression matrix — see `docs/security/rls-testing.md`;
needs the local Supabase stack or `RLS_TEST_DB_URL`). New tables/buckets ship with
matrix cases in the same PR.

## Dependency Audit Cadence

`.github/workflows/dependency-audit.yml` runs `pnpm audit --prod --audit-level high`
weekly (Monday 06:00 UTC) and on every push to `main`; it fails on any high/critical
advisory in production dependencies. Triage rule when it goes red: bump to the patched
release within the week (patch/minor bump → straight to `main` after the Verifying
Changes commands; major bump → branch + full gate + auth-flow regression). If no patch
exists, record the advisory and the accepted-risk rationale in
`docs/security/audit-decisions.md` and re-check weekly.

## Git Workflow (solo project)

- Small, safe, self-contained changes (docs, copy, confident bug fixes) → commit straight to `main`.
- Multi-step, risky, or multi-turn work (new features, schema migrations, refactors) → use a branch so half-finished work never sits on `main`.
- Vercel deploys `main` to production. **Never push broken code to `main`** — run the Verifying Changes commands before any push.
- **Commit automatically once a feature/fix is finished and tested** (lint + tests pass) — no need to wait for an explicit ask. Pushing to `main` / merging (which deploys to production) still requires the Verifying Changes commands to pass and, for branches, user confirmation.

## Autopilot (autonomous backlog loop)

`/loop /autopilot` (playbook: `.claude/skills/autopilot/SKILL.md`) works
`BACKLOG.md` items through brainstorm → spec → plan → build → review → PR,
one at a time. Autonomy stops at the PR: the loop never pushes or merges
`main` and never touches prod (no prod migrations, edge-function deploys,
Vercel config, or real email). Bjorn's touchpoints: append one-liners to the
**Queue** section of `BACKLOG.md`, answer **Blocked** questions inline
(`- A: …`), read `docs/autopilot/status.md`, merge PRs **with a merge
commit** and run their listed merge-time steps. Any session asked to « add X
to the backlog » just appends one line to Queue. All hard guardrails live in
the skill file and bind every session and subagent.

## Session & Token Hygiene (multi-stage features)

Large features run in stages: brainstorm → spec → plan → execution → merge. Conversation history from a finished stage is dead weight once its artifact is committed — carrying it into the next stage multiplies token spend for no benefit.

- **At every stage boundary** (spec committed and approved; plan committed; final merge done), do NOT roll into the next stage in the same conversation. Instead: (1) make the work resumable from disk — commit a progress note (plan file or a short markdown in the spec directory) so a fresh session needs zero conversation history; then (2) end the turn by telling Bjorn this is a `/clear` point, with the exact one-line resume prompt to paste afterwards. Only continue in-session if he explicitly says to.
- Execution must always be resumable from files alone: plan file + task briefs/reports + progress ledger. Never rely on conversation memory for execution state.
- During execution, keep subagent artifacts (briefs, reports, diffs) as file handoffs, and pick the cheapest model that can do each dispatch (plans containing complete code → transcription-tier implementers).

## Database

Migrations live in `supabase/migrations/`, but **prod's migration ledger is the source of truth for versions** (MCP `apply_migration` stamps its own timestamps). Never run `supabase db push` against prod — it would try to re-apply already-applied migrations under drifted versions. Canonical workflow for any schema change:

1. Write the migration locally: `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`.
2. Apply it with the Supabase MCP `apply_migration` tool (`name` = the slug).
3. Check MCP `list_migrations`: if the ledger stamped a different version than the filename, `git mv` the local file to the stamped version.
4. Regenerate DB types: MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit` (`types/db.ts` narrows the generated rows; schema drift fails compile there — fix the alias, never hand-edit `types/supabase.ts`).
5. Routine drift check: every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

All tables use Row Level Security (RLS). Organizers can only access data for their own school. Students can only access their own assignments and submissions.

## Staging & Previews

A second Supabase project (`eazyexchange-staging`, ref in `.env.staging` — never committed) backs all Vercel **Preview** deployments; Production keeps the real project. Previews physically cannot touch prod data.

- **Every migration is applied to staging FIRST** (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`), then to prod via MCP `apply_migration`. Never skip the staging apply — drift breaks previews mysteriously.
- Seed data: `scripts/seed-staging.mjs` (fake school/organizer/students, idempotent). Login `demo-organizer@example.com`; password is set at seed time (`SEED_PASSWORD`).
- Staging sends NO email (`RESEND_API_KEY` unset app-side and function-side; sends degrade to console warnings). Free-tier Supabase auth email ≈ 2/hour.
- Google OAuth is not configured on staging — Google buttons error on previews; use email/password.
- `send-reminders` is deployed to staging but has no cron; invoke manually with the `x-cron-secret` header (`STAGING_CRON_SECRET` in `.env.staging`) to rehearse.
- Staging auth emails use Supabase's **default templates** (free tier blocks template customization without custom SMTP) — the invite/confirm links use the broken `GET /verify` flow, and the default provider only delivers to org team members. Wire Resend SMTP on staging only if preview email testing ever demands it; that also unlocks template editing.

## Gotchas & Conventions

- **RLS is the most error-prone area.** Avoid self-referential/recursive policies (see `20260625000005_fix_rls_recursion.sql`). New access needs a migration, never a client-side service-role workaround.
- **RLS is the isolation layer; the service role is walled in.** `lib/supabase/admin` (bypasses RLS) may only be imported by the files allowlisted in `lib/supabase/__tests__/admin-allowlist.test.ts` — the anonymous funnel, auth/provisioning, billing/Stripe, the rate limiter, and audit logging. Any new import is a design decision, not a convenience: prefer a scoped RLS policy; if the service role is genuinely required, extend the allowlist deliberately in the same change.
- **Organizer email confirmation goes through `app/auth/confirm/route.ts`.** Session cookies must be persisted via `redirect()` from that route — don't bypass it. Student invite acceptance no longer sends any Supabase auth email: `respondToInvitation` mints the session in-action (`generateLink` magiclink + `verifyOtp` on the cookie-aware server client) and the client redirects to `/accept-invite`.
- **Google OAuth goes through `app/auth/callback/route.ts`** (the `?code=` PKCE exchange), separate from `/auth/confirm` (email OTP `?token_hash=`). Invite-only is enforced *in the callback*: a Google user with no invited profile and no `intent=organizer_signup` is signed out and their orphan auth row deleted. Provider config is a manual dashboard step (not code): create a Google Cloud OAuth client whose redirect URI is Supabase's `https://<ref>.supabase.co/auth/v1/callback`, enable the Google provider in Supabase with that client's ID/secret, and add each app origin's `/auth/callback` under Supabase → Authentication → URL Configuration → Redirect URLs. Consent-screen branding (« pour continuer vers <ref>.supabase.co ») is fixed in Google Cloud → OAuth consent screen, not Supabase: set App name, add eazyexchange.com as an Authorized domain (verified in Search Console), publish the app; a logo upload triggers Google brand review (days). No Supabase custom domain needed for this. The invited-student Google path relies on Supabase's automatic same-email identity linking, which is default-on — there is no toggle to enable (the only linking toggle in the dashboard is for *manual* linking, which this app does not use).
- **Always escape user-supplied content in email HTML** (Resend) to prevent injection.
- **Never log student/parent PII** — no student emails, names, or submission contents in logs, error messages, or analytics. This data belongs to minors; treat it as sensitive.
- **Production redacts thrown Server Action/RSC error messages** (replaced by an opaque digest string). Never branch client-side on `error.message`. Expected outcomes (validation failures, plan caps, business rejections) must be **structured return values**; only throw for genuinely unexpected failures. See `lib/billing/exchange-limit.ts` for the pattern.
- **Auth preambles are shared helpers** — server actions use `requireUser()` / `requireOrganizer()` / `requireStudent()` from `lib/auth/require.ts`; never hand-roll the `getAuthUser → getProfile → role check → throw` dance. Error strings (`'Unauthenticated'`, `'Unauthorized'`) are load-bearing for tests.
- **Application server actions are split by trust model** — `actions/apply.ts` (anonymous resume-token funnel), `actions/applications-review.ts` (authenticated organizer review), `actions/invitations.ts` (anonymous invite-token response). New application behavior goes in the file matching its trust model; never re-merge them.
- Package manager is **pnpm** (not npm).
- **Billing is a usage-based free trial, school-anchored.** Subscription state lives on `schools` (`subscription_status`, `plan`, `grace_until`, …), written only by the Stripe webhook (`app/api/stripe/webhook/route.ts`) via the service-role admin client — never from the browser (a migration revokes client `UPDATE` on `schools` except `name`). Trial = 1 exchange; Starter = 2, Growth = 6, Scale = unlimited. The only gate is `createExchange` (+ dashboard CTA), via `lib/billing/limits.ts`. No card at signup; organizers subscribe at `/billing`. Required env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,GROWTH,SCALE}`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Register the prod webhook at `/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## Automated Reminders

A Supabase Edge Function (`send-reminders`) runs daily at 08:00 via cron. Pacing is per exchange: organizers pick a preset on the exchange detail page — `douce` (weekly, never accelerates), `normale` (weekly, then daily during the final week and while overdue — the default) or `insistante` (every 3 days, then daily during the final 2 weeks and while overdue) — or turn automatic reminders off entirely (`exchanges.reminders_enabled`). Interval math lives in `supabase/functions/send-reminders/pacing.ts` (pure, vitest-tested). Pacing is tracked per assignment via `assignments.last_reminded_at`; manual « Relancer » ignores these settings. Rejection notifications are sent immediately when an organizer rejects a submission. Deploying edge-function changes is manual: `supabase functions deploy send-reminders`.

## Server Error Reporting

Unexpected server errors (server actions, RSC renders, route handlers) are
recorded to the `error_reports` table by `instrumentation.ts` →
`lib/error-reporting.ts` (Next `onRequestError`; dedup by fingerprint of
normalized message + route, `open`/`resolved` status, occurrence counter).
Service-role only — no client access, no admin UI: triage in the Supabase
dashboard, flip `status` to `resolved` by hand; a recurrence reopens the row.
The reporter never throws; expected outcomes (structured returns) never land
here. Spec: `docs/superpowers/specs/2026-07-16-error-reporting-design.md`.

## Project Plan

See `plan.md` for the full build sequence and data model.
