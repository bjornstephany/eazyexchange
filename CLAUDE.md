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

## Database

Migrations live in `supabase/migrations/`. Run with:
```bash
supabase db push
```

All tables use Row Level Security (RLS). Organizers can only access data for their own school. Students can only access their own assignments and submissions.

## Gotchas & Conventions

- **RLS is the most error-prone area.** Avoid self-referential/recursive policies (see `20260625000005_fix_rls_recursion.sql`). New access needs a migration, never a client-side service-role workaround.
- **Invite acceptance & email confirmation go through `app/auth/confirm/route.ts`.** Session cookies must be persisted via `redirect()` from that route — don't bypass it.
- **Always escape user-supplied content in email HTML** (Resend) to prevent injection.
- **Never log student/parent PII** — no student emails, names, or submission contents in logs, error messages, or analytics. This data belongs to minors; treat it as sensitive.
- Package manager is **pnpm** (not npm).

## Automated Reminders

A Supabase Edge Function (`send-reminders`) runs daily at 08:00 via cron. It paces reminder emails to students with incomplete forms: weekly while the deadline is more than 7 days out, then daily during the final week and while overdue. Pacing is tracked per assignment via `assignments.last_reminded_at`. Rejection notifications are sent immediately when an organizer rejects a submission.

## Project Plan

See `plan.md` for the full build sequence and data model.
