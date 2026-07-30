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
release within the week (patch/minor bump → worktree branch + the Verifying Changes
commands, merged same-day; major bump → branch + full gate + auth-flow regression). If no patch
exists, record the advisory and the accepted-risk rationale in
`docs/security/audit-decisions.md` and re-check weekly.

## Git Workflow

**All work happens on a branch in a worktree. Nothing commits directly to `main`; `main`
is merge-only.** (Worktree procedure below, in Parallel Sessions.)

- Vercel deploys `main` to production. **Never push broken code to `main`** — run the Verifying Changes commands before any push.
- **Commit automatically once a feature/fix is finished and tested** (lint + tests pass) — no need to wait for an explicit ask. Merging a branch to `main` (which deploys to production) still requires the Verifying Changes commands to pass **and** user confirmation.
- **Confirm the branch before every commit** (`git branch --show-current`). A session that finds itself on a branch it did not create must stop and report, not commit.

Rationale — why `main` is sacred, why even one-liners branch, when to merge: `docs/WORKFLOW.md#git--main`.

## Parallel Sessions

Multiple Claude sessions run at once. **One session = one worktree = one branch — no
exceptions, including one-line copy fixes.** The session that starts the work does the
work — don't hand off to a fresh session; move the current one into its own worktree:

1. **`EnterWorktree`** with `name` = `feature/<slug>` (or `fix/<slug>`). Then fix two
   warts, both one-liners:
   - it names the branch `worktree-feature+<slug>` → `git branch -m feature/<slug>`;
   - it branches off `origin/main`, missing anything on local `main` not yet pushed →
     `git merge --ff-only main`.
2. **`pnpm wt`** (no arguments, from inside the worktree) — links `.env.local` /
   `.env.staging`, pins a dev port in `.wtport`, installs deps. Skipping it means
   placeholder-env 500s and a dev server on the wrong branch.
3. Work, commit, verify, merge — all in this session.
4. **`ExitWorktree`** (`remove` once merged, `keep` to come back later) returns the
   session to the main checkout — use it, not `git worktree remove`.

- **Never `git add -A` / `git add .`** — stage only the files you touched.
- **Test failures can be another session's race.** A suite that fails once and passes on
  re-run (or an import that resolves nowhere) usually means a neighbour was mid-write —
  re-run the single file before debugging it.
- **`supabase/migrations/` is single-writer.** Only one session at a time may add or apply
  a migration; if another is mid-migration, wait.

Rationale — what a worktree protects against, the N-sessions-N-dirs picture, why the two
warts, why `.claude/worktrees/` is gitignored/excluded: `docs/WORKFLOW.md#parallel-sessions--worktrees`.

## Backlog

`BACKLOG.md` holds deferred work as one-liners, highest priority at the top.
Any session asked to « add X to the backlog » just appends one line to the
**Queue** section.

## Session & Token Hygiene (multi-stage features)

Large features run in stages: brainstorm → spec → plan → execution → merge. Conversation history from a finished stage is dead weight once its artifact is committed — carrying it into the next stage multiplies token spend for no benefit.

- **At every stage boundary** (spec committed and approved; plan committed; final merge done), do NOT roll into the next stage in the same conversation. Instead: (1) make the work resumable from disk — commit a progress note (plan file or a short markdown in the spec directory) so a fresh session needs zero conversation history; then (2) end the turn by telling Bjorn this is a `/clear` point, with the exact one-line resume prompt to paste afterwards. Only continue in-session if he explicitly says to.
- Execution must always be resumable from files alone: plan file + task briefs/reports + progress ledger. Never rely on conversation memory for execution state.
- During execution, keep subagent artifacts (briefs, reports, diffs) as file handoffs, and pick the cheapest model that can do each dispatch (plans containing complete code → transcription-tier implementers).

## Database

**Never run `supabase db push` against prod.** Prod's migration ledger is the source of truth for versions. Canonical workflow for any schema change:

1. Write the migration locally: `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`.
2. Apply to **staging first** (see Staging & Previews for the command), then to prod with the Supabase MCP `apply_migration` tool (`name` = the slug).
3. Check MCP `list_migrations`: if the ledger stamped a different version than the filename, `git mv` the local file to the stamped version.
4. Regenerate DB types: MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit` (`types/db.ts` narrows the generated rows; schema drift fails compile there — fix the alias, never hand-edit `types/supabase.ts`).
5. Routine drift check: every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

All tables use Row Level Security (RLS). Organizers can only access data for their own school. Students can only access their own assignments and submissions.

Rationale — why the ledger is the source of truth, why staging-first, the two-project model: `docs/WORKFLOW.md#migrations--staging`.

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
- **Signup is open but gated.** A self-registered organizer lands `pending` and has
  zero access until approved at `/admin` (gated by `ADMIN_EMAILS`, not a DB column).
  The gate is `public.my_role()`: it returns the role **only** when
  `users.status = 'approved'`, so every policy written as `my_role() = 'organizer'
  AND …` inherits it — including future ones. Do not add an `is_approved()` clause;
  there is deliberately one gate in one place. Initial status is decided by the
  `set_initial_user_status()` BEFORE INSERT trigger (students and colleagues joining
  an approved school are auto-approved; `signup_allowlist` pre-approves testers), so
  new user-creation paths need no changes. `users.status`, `reviewed_at` and `notes`
  have no column grant for `authenticated` — only the service role writes them.
  Spec: `docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md`.
- **Organizer email confirmation goes through `app/auth/confirm/route.ts`.** Session cookies must be persisted via `redirect()` from that route — don't bypass it. Student invite acceptance is **parent-facing**, so `respondToInvitation` deliberately mints **no** session in the confirming browser: it enrolls the student, sends the enrollment checklist, then emails the *student* a `/auth/confirm` set-your-password link (`generateLink` magiclink delivered via Resend, not a Supabase auth email). The student lands on `/accept-invite` from that emailed link.
- **Google OAuth goes through `app/auth/callback/route.ts`** (the `?code=` PKCE exchange), separate from `/auth/confirm` (email OTP `?token_hash=`). Invite-only is enforced *in the callback*: a Google user with no invited profile and no `intent=organizer_signup` is signed out and their orphan auth row deleted. Provider config is a manual dashboard step (not code): create a Google Cloud OAuth client whose redirect URI is Supabase's `https://<ref>.supabase.co/auth/v1/callback`, enable the Google provider in Supabase with that client's ID/secret, and add each app origin's `/auth/callback` under Supabase → Authentication → URL Configuration → Redirect URLs. Consent-screen branding (« pour continuer vers <ref>.supabase.co ») is fixed in Google Cloud → OAuth consent screen, not Supabase: set App name, add eazyexchange.com as an Authorized domain (verified in Search Console), publish the app; a logo upload triggers Google brand review (days). No Supabase custom domain needed for this. The invited-student Google path relies on Supabase's automatic same-email identity linking, which is default-on — there is no toggle to enable (the only linking toggle in the dashboard is for *manual* linking, which this app does not use).
- **Always escape user-supplied content in email HTML** (Resend) to prevent injection.
- **Never log student/parent PII** — no student emails, names, or submission contents in logs, error messages, or analytics. This data belongs to minors; treat it as sensitive.
- **Production redacts thrown Server Action/RSC error messages** (replaced by an opaque digest string). Never branch client-side on `error.message`. Expected outcomes (validation failures, plan caps, business rejections) must be **structured return values**; only throw for genuinely unexpected failures. See `lib/billing/exchange-limit.ts` for the pattern.
- **Auth preambles are shared helpers** — server actions use `requireUser()` / `requireOrganizer()` / `requireStudent()` from `lib/auth/require.ts`; never hand-roll the `getAuthUser → getProfile → role check → throw` dance. Error strings (`'Unauthenticated'`, `'Unauthorized'`) are load-bearing for tests.
- **Application server actions are split by trust model** — `actions/apply.ts` (anonymous resume-token funnel), `actions/applications-review.ts` (authenticated organizer review), `actions/invitations.ts` (anonymous invite-token response). New application behavior goes in the file matching its trust model; never re-merge them.
- **The application questionnaire is per-exchange and locks at the first application.**
  `exchanges.application_fields` (jsonb, nullable) holds a copy of the questionnaire;
  `null` means « never customized » and resolves to `lib/application-form.ts`'s
  `APPLICATION_SECTIONS` verbatim, so no exchange ever needed a backfill. Built-in
  questions are stored **by reference** so their labels and five translations keep
  coming from the message catalogs; custom questions are monolingual and inline.
  Everything goes through one resolver, `resolveApplicationSections()` in
  `lib/application-fields.ts` — the funnel form, `submitApplication`'s gates, the
  organizer read view and the PDF recap must all see the same list, or a removed
  question becomes permanently "missing" and blocks every submission. The lock is
  derived (any row in `applications` for the exchange), never stored, and
  re-checked server-side in `actions/questionnaire.ts` — the client is never
  trusted with it, and it fails **closed** when the count query errors, so
  `{ locked: true, applicationCount: 0 }` is a real state and no UI may render a
  count-bearing sentence from it. The portrait is a pseudo-field (it lives on
  `applications.photo_path`, not in `APPLICATION_SECTIONS`), so `removedBuiltIns`
  cannot report it and `AddQuestionDialog` restores it as an explicit special
  case — without which its ✕ would be irreversible. Organizer-written questions
  are banked in `application_custom_questions`, which organizers may INSERT into
  and **never SELECT from**: suggestions come from the
  `application_question_suggestions` SECURITY DEFINER RPC, which only returns
  phrasings at least three independent schools converged on (that threshold is
  the PII guard).
  Spec: `docs/superpowers/specs/2026-07-29-application-template-editor-design.md`.
- Package manager is **pnpm** (not npm).
- **Billing is a usage-based free trial, school-anchored.** Subscription state lives on `schools` (`subscription_status`, `plan`, `grace_until`, …), written only by the Stripe webhook (`app/api/stripe/webhook/route.ts`) via the service-role admin client — never from the browser (a migration revokes client `UPDATE` on `schools` outright — the
name is written only by the `claim_school()` SECURITY DEFINER RPC). Trial = 1 exchange; Starter = 2, Growth = 6, Scale = unlimited. The only gate is `createExchange` (+ dashboard CTA), via `lib/billing/limits.ts`. No card at signup; organizers subscribe at `/billing`. Required env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,GROWTH,SCALE}`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Register the prod webhook at `/api/stripe/webhook` for `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
**Upgrades** (`app/billing/upgrade/route.ts`) swap the price on the existing subscription
through a Stripe-hosted `subscription_update_confirm` portal flow — never through
`/billing/checkout`, which would create a second parallel subscription and a second charge.
Two things make that work, and both are easy to break:
(1) **Dashboard prerequisite** — the customer portal configuration must have subscription
updates enabled with all three prices listed under `features.subscription_update.products`,
or `sessions.create` 400s and the upgrade button is silently inert (the route degrades to
`/billing?error=unavailable`). Manual step, like the Google OAuth provider config.
(2) **The webhook reads the plan from the price ID**, not from subscription metadata: a
portal price change does not rewrite metadata, so trusting `metadata.plan` would write the
*old* plan straight back and the organizer would pay for capacity they never receive
(`planForPriceId` in `lib/billing/plans.ts`; precedence price → metadata → unchanged).

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
