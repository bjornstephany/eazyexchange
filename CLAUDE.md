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

Environment variables required (create `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
```

## Verifying Changes

Run before considering work complete:
```bash
pnpm lint        # next lint
pnpm test        # vitest run (config: vitest.config.ts)
pnpm build       # catches type errors + build breakage
```

## Git Workflow (solo project)

- Small, safe, self-contained changes (docs, copy, confident bug fixes) → commit straight to `main`.
- Multi-step, risky, or multi-turn work (new features, schema migrations, refactors) → use a branch so half-finished work never sits on `main`.
- Vercel deploys `main` to production. **Never push broken code to `main`** — run the Verifying Changes commands before any push.
- Default to committing small changes to `main`; suggest a branch when a change is big or risky.
- **Commit automatically once a feature/fix is finished and tested** (lint + tests pass) — no need to wait for an explicit ask. Pushing to `main` / merging (which deploys to production) still requires the Verifying Changes commands to pass and, for branches, user confirmation.

## Session & Token Hygiene (multi-stage features)

Large features run in stages: brainstorm → spec → plan → execution → merge. Conversation history from a finished stage is dead weight once its artifact is committed — carrying it into the next stage multiplies token spend for no benefit.

- **At every stage boundary** (spec committed and approved; plan committed; final merge done), do NOT roll into the next stage in the same conversation. Instead: (1) commit the stage artifact and leave enough in files for a fresh session to resume with zero conversation context; then (2) end the turn by telling Bjorn this is a `/clear` point, with an exact one-line resume prompt to paste. Only continue in-session if he explicitly says to.
- Execution must always be resumable from files alone: plan file + task briefs/reports + progress ledger. Never rely on conversation memory for execution state.
- During execution, keep subagent artifacts (briefs, reports, diffs) as file handoffs, and pick the cheapest model that can do each dispatch (plans containing complete code → transcription-tier implementers).

## Database

Migrations live in `supabase/migrations/`. Run with:
```bash
supabase db push
```

All tables use Row Level Security (RLS). Organizers can only access data for their own school. Students can only access their own assignments and submissions.

## Gotchas & Conventions

- **RLS is the most error-prone area.** Avoid self-referential/recursive policies (see `20260625000005_fix_rls_recursion.sql`). New access needs a migration, never a client-side service-role workaround.
- **Invite acceptance & email confirmation go through `app/auth/confirm/route.ts`.** Session cookies must be persisted via `redirect()` from that route — don't bypass it.
- **Google OAuth goes through `app/auth/callback/route.ts`** (the `?code=` PKCE exchange), separate from `/auth/confirm` (email OTP `?token_hash=`). Invite-only is enforced *in the callback*: a Google user with no invited profile and no `intent=organizer_signup` is signed out and their orphan auth row deleted. Provider config is a manual dashboard step (not code): create a Google Cloud OAuth client whose redirect URI is Supabase's `https://<ref>.supabase.co/auth/v1/callback`, enable the Google provider in Supabase with that client's ID/secret, and add each app origin's `/auth/callback` under Supabase → Authentication → URL Configuration → Redirect URLs. The invited-student Google path relies on Supabase's automatic same-email identity linking, which is default-on — there is no toggle to enable (the only linking toggle in the dashboard is for *manual* linking, which this app does not use).
- **Always escape user-supplied content in email HTML** (Resend) to prevent injection.
- **Never log student/parent PII** — no student emails, names, or submission contents in logs, error messages, or analytics. This data belongs to minors; treat it as sensitive.
- Package manager is **pnpm** (not npm).
- **Billing is a usage-based free trial, school-anchored.** Subscription state lives on `schools` (`subscription_status`, `plan`, `grace_until`, …), written only by the Stripe webhook (`app/api/stripe/webhook/route.ts`) via the service-role admin client — never from the browser (a migration revokes client `UPDATE` on `schools` except `name`). Trial = 1 exchange; Starter = 2, Growth = 6, Scale = unlimited. The only gate is `createExchange` (+ dashboard CTA), via `lib/billing/limits.ts`. No card at signup; organizers subscribe at `/billing`. Required env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,GROWTH,SCALE}`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Register the prod webhook at `/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## Automated Reminders

A Supabase Edge Function (`send-reminders`) runs daily at 08:00 via cron. It paces reminder emails to students with incomplete forms: weekly while the deadline is more than 7 days out, then daily during the final week and while overdue. Pacing is tracked per assignment via `assignments.last_reminded_at`. Rejection notifications are sent immediately when an organizer rejects a submission.

## Project Plan

See `plan.md` for the full build sequence and data model.
