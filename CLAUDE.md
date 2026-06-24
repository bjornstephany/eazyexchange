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

Access is invite-only — no self-registration.

## Local Development

```bash
pnpm install
pnpm dev
```

Environment variables required (copy `.env.example` to `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
```

## Database

Migrations live in `supabase/migrations/`. Run with:
```bash
supabase db push
```

All tables use Row Level Security (RLS). Organizers can only access data for their own school. Students can only access their own assignments and submissions.

## Automated Reminders

A Supabase Edge Function (`send-reminders`) runs daily at 08:00 via cron. It sends reminder emails to students with incomplete forms due within 7 or 3 days. Rejection notifications are sent immediately when an organizer rejects a submission.

## Project Plan

See `plan.md` for the full build sequence and data model.
