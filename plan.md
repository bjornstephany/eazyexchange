# EazyExchange MVP — Implementation Plan

## Context

Student exchange organizers at high schools currently chase parents and students manually to collect required forms and documents. EazyExchange solves this with a structured web app: students get a clear checklist with deadlines and automated reminders; organizers get a master dashboard showing exactly what's complete and what's missing across all students.

**Scope:** Forms/documents collection only. Joint organizer collaboration between schools is out of scope for MVP.

---

## Tech Stack

- **Frontend + Backend:** Next.js 14+ (App Router, Server Actions)
- **Database + Auth + Storage:** Supabase (PostgreSQL, RLS, Auth, Storage)
- **Email:** Resend (transactional email for invites and reminders)
- **Styling:** Tailwind CSS + shadcn/ui
- **Deployment:** Vercel + Supabase hosted

---

## Data Model

### Tables

**`schools`**
- `id`, `name`, `created_at`

**`exchanges`**
- `id`, `name` (e.g., "France-Canada 2026"), `school_a_id`, `school_b_id`, `year`, `created_at`

**`users`** (profiles extending Supabase auth.users)
- `id` (matches auth.users.id), `school_id`, `role` (`organizer` | `student`), `full_name`, `email`, `created_at`

**`exchange_enrollments`**
- `id`, `exchange_id`, `user_id`, `created_at`

**`form_templates`**
- `id`, `exchange_id`, `school_id`, `name`, `description`, `type` (`data_entry` | `document_upload`), `deadline`, `created_by`, `created_at`

**`form_fields`** (data_entry templates only)
- `id`, `template_id`, `label`, `field_type` (`text` | `textarea` | `date` | `checkbox` | `select`), `options` (JSON), `required`, `order`

**`document_slots`** (document_upload templates only)
- `id`, `template_id`, `label`, `description`, `required`, `order`

**`assignments`**
- `id`, `template_id`, `student_id`, `assigned_at`

**`submissions`**
- `id`, `assignment_id`, `status` (`draft` | `submitted` | `approved` | `rejected`), `submitted_at`, `reviewed_at`, `reviewer_id`, `review_note`, `created_at`, `updated_at`

**`field_answers`**
- `id`, `submission_id`, `field_id`, `value`

**`document_uploads`**
- `id`, `submission_id`, `slot_id`, `storage_path`, `file_name`, `uploaded_at`

---

## Key Pages

### Organizer
| Route | Purpose |
|---|---|
| `/dashboard` | List exchanges; create new |
| `/exchanges/[id]` | Master grid: students × forms with status indicators |
| `/exchanges/[id]/forms/new` | Form template builder |
| `/exchanges/[id]/forms/[formId]` | Edit form template |
| `/exchanges/[id]/students` | Invite students by email; view invite status |
| `/exchanges/[id]/submissions/[submissionId]` | Review submission; approve or reject with note |

### Student
| Route | Purpose |
|---|---|
| `/my-forms` | Checklist of assigned forms with status badge + deadline |
| `/my-forms/[assignmentId]` | Fill out form or upload documents |
| `/my-forms/[assignmentId]/status` | View approval/rejection note; resubmit |

---

## Automated Reminders

Supabase Edge Function (`send-reminders`) on a daily cron:
1. Find all assignments where `status != 'approved'` and deadline is within 7 or 3 days
2. Group by student, send one summary email per student via Resend
3. Rejection notification: immediate email when organizer rejects a submission

---

## Build Sequence

### Phase 1 — Scaffold & Auth
- [ ] Initialize Next.js 14 project (`pnpm create next-app`)
- [ ] Add Tailwind CSS + shadcn/ui
- [ ] Connect Supabase project; configure env vars
- [ ] Set up Supabase Auth (email invite flow)
- [ ] Create all database tables with Supabase migrations
- [ ] Write RLS policies for all tables
- [ ] Authenticated shell layout with nav (organizer vs student views)

### Phase 2 — Organizer Core
- [x] Exchange creation (create exchange, set both school names)
- [x] Form template builder — data entry (add/reorder fields)
- [x] Form template builder — document upload (add named slots)
- [x] Student invite flow (email → Supabase invite → auto-enrollment on signup)
- [x] Master dashboard grid (`/exchanges/[id]`)

### Phase 3 — Student Core
- [x] Student form checklist (`/my-forms`)
- [x] Data-entry form fill page (render fields, save draft, submit)
- [x] Document upload page (per-slot upload via Supabase Storage, submit)
- [x] Submission status page (state + rejection note; integrated into checklist + fill page)

### Phase 4 — Review Flow
- [x] Organizer submission review page (view answers / download files via signed URLs)
- [x] Approve action
- [x] Reject with note → trigger immediate rejection email via Resend

### Phase 5 — Reminders
- [x] Supabase Edge Function: `send-reminders`
- [x] Cron schedule: daily at 08:00 (documented in `supabase/cron-setup.sql`)
- [x] Resend email templates (reminder + rejection)

### Phase 6 — Polish & Deploy
- [x] Loading states, error handling, empty states (route-level `loading.tsx` + `error.tsx` boundaries)
- [x] Mobile-responsive layouts (stacking form rows, scrollable grid)
- [ ] Vercel deployment + Supabase production project
- [ ] End-to-end smoke test

---

## Verification

1. Create school, exchange, and two test users (organizer + student)
2. Organizer invites student → student receives email → creates account → sees checklist
3. Organizer creates a data-entry form with 3 fields and a deadline
4. Student fills out and submits form
5. Organizer rejects with note → student receives rejection email
6. Student resubmits → organizer approves → master grid shows approved
7. Manually trigger `send-reminders` → verify reminder email for a form due in 3 days
