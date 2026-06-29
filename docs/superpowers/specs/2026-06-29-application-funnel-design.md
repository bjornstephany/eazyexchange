# Design: Phase 1 Application Funnel

**Date:** 2026-06-29
**Status:** Approved (pending spec review)

## Problem

Today EazyExchange is invite-only: an organizer types a student's email, Supabase
sends an invite, and on signup the student is auto-enrolled and auto-assigned every
Phase 2 form for their school. There is no concept of *applying* to an exchange.

Real exchange organization starts earlier: organizers email all interested students an
info message with an application, review the applications, accept a subset, and only the
accepted students go on to fill out the detailed forms and upload documents. This project
adds that funnel **in front of** the existing enrollment/forms machinery.

## Scope

In scope (Phases 1 and 2 of the organizer's mental model):

- **Phase 1:** public application → organizer review → accept/reject → invitation →
  Yes/No/Maybe response → (Yes) account creation + enrollment.
- **Phase 2:** the *existing* forms/documents collection, unchanged. Enrollment from
  Phase 1 feeds straight into it.

Out of scope:

- Organizer-customizable application questions (fixed standard form for now).
- Phase 3 (matching / organizing the exchange).
- Capacity limits / number of spots.
- Languages beyond French and English.

## Key decisions

1. **Applying is account-free.** The public application creates an `applications` record
   only — no auth account, no password. An auth account is created only when an accepted
   candidate answers "Yes." This preserves the invite-only model (no orphan accounts from
   rejected applicants) and reuses the existing invite/confirm/auth flow untouched.
2. **The application is a fixed, purpose-built form**, modeled on the AGESSIA 2026-27
   sample (`docs/Agessia Edina 2026-27 EXCHANGE Application Rev 2 (2).pdf`). It is NOT
   built with the existing field-builder (which is unsuited to a document this rich).
   Customization is deferred; the JSONB `data` column makes it addable later.
3. **Magic-link resume** for the long anonymous form: the applicant gives their email up
   front, gets a private resume URL, and can leave and return on any device. Submit locks
   the application.
4. **Language toggle (FR / EN)** at the top of the application switches all labels live;
   defaults to the browser language.
5. **Guided experience = plain dashboard organized by phase, with light hints/badges** —
   not an enforced wizard. The dashboard surfaces the recommended next action but never
   blocks the organizer (review, responses, and form-building overlap in real life).
6. **Yes/No/Maybe is collected before account creation.** Nobody is forced to sign up
   just to decline.

## Lifecycle / state machine

A single applicant moves through:

```
draft        → started, magic-link saved, not yet submitted
submitted    → completed application, awaiting organizer review
rejected     → organizer declined (optional polite email)
accepted     → organizer accepted → invitation email sent
   ↓ (candidate clicks invite link, answers "Will you join?")
declined     → said No
maybe        → said Maybe (+ note); stays visible for follow-up
enrolled     → said Yes → account created → becomes a student, gets Phase 2 forms
```

The moment an applicant reaches `enrolled`, the existing `exchange_enrollments` insert
trigger (`20260627000001_auto_assign_forms.sql`) auto-assigns the Phase 2 forms. No change
to that machinery.

## Data model

### New table `applications`

Scoped to an exchange + the organizer's school. RLS follows the established school-scoping
pattern (organizers read/write only their own school's applications).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `exchange_id` | uuid fk → exchanges | |
| `school_id` | uuid fk → schools | the organizer's school side |
| `email` | text | captured first, used for the magic link |
| `resume_token` | text unique | secret in the resume URL (edit-draft stage) |
| `invite_token` | text unique | secret in the invitation URL (respond stage); set on accept |
| `status` | text | the state machine above |
| `data` | jsonb | all field answers (one column keeps the fixed form flexible) |
| `photo_path` | text | private Supabase Storage path |
| `language` | text | 'fr' \| 'en' |
| `invite_response` | text | 'yes' \| 'no' \| 'maybe' |
| `invite_response_note` | text | note for "maybe" (or any response) |
| `responded_at` | timestamptz | |
| `enrolled_user_id` | uuid fk → users | set when they say Yes; links application → student |
| `submitted_at` | timestamptz | |
| `reviewed_at` | timestamptz | |
| `reviewer_id` | uuid fk → users | organizer who accepted/rejected |
| `review_note` | text | optional note on reject |
| `created_at` / `updated_at` | timestamptz | |

`resume_token` and `invite_token` are **separate secrets for separate stages** (resume =
edit my draft; invite = respond to acceptance). This prevents reopening a locked draft, etc.

### `exchanges` additions

| Column | Type | Notes |
|---|---|---|
| `application_open` | boolean default false | organizer toggle for the public link |
| `application_deadline` | date null | optional; link closes after this |
| `apply_slug` | text unique | short random/readable slug for the public apply URL (avoids exposing the uuid) |

### Unchanged

`users`, `exchange_enrollments`, `form_templates`, `form_fields`, `document_slots`,
`assignments`, `submissions`, `field_answers`, `document_uploads`. The accept→enrolled
bridge feeds the existing invite/enrollment path rather than replacing it.

### RLS notes

- Organizers: read/write `applications` where `school_id` = their school (existing pattern).
- The public **insert draft / update draft / submit** path goes through a narrow server
  action keyed by `resume_token` — never broad client access, never client service-role.
- The public **respond to invitation** path goes through a narrow server action keyed by
  `invite_token`.
- Anonymous photo upload goes through a server action that writes to a private Storage
  path keyed by `resume_token`. No public bucket.

## The standard application form

Four sections, mirroring the sample PDF. Stored in `applications.data` (JSONB). Rendered by
a purpose-built component with FR/EN label sets.

1. **Student** — last/first name, native language, nationality(ies), date of birth, sex,
   pronouns, grade in 26-27, French class, email, cell phone, **recent photo (upload)**.
2. **Parents** — two-column Father/Mother: last/first name, nationality, native language,
   cell phone, email, address, occupation; family status (married / separated / step-family,
   radio); conditional "if separated, address where the exchange student will be housed."
3. **Hosting conditions** — # brothers at home (+ ages), # sisters at home (+ ages), pets,
   food allergies/requirements, other allergies, main language at home, other languages at
   home, anyone smokes? (Y/N), own room for guest? (Y/N), accept opposite-sex student? (Y/N).
4. **Student profile** — ~14 free-text reflection questions (lived abroad, countries visited
   with/without parents, sports + hours, activities/clubs + hours, instruments, weekend/
   holiday family activities, favorite spare time, 3 adjectives, introvert/extrovert recharge,
   3 life to-do items, ideal exchange partner, what to share when hosting, anything to add).

Field types: text inputs, textareas (profile section), Y/N toggles, radios, one file upload.
Required-field validation runs on final submit.

## Public application experience

Entry: `eazyexchange.com/apply/<exchange-slug>` (organizer pastes into their intro email).
If `application_open` is false or the deadline has passed → friendly "applications closed" page.

1. **Language toggle (FR/EN)** top-right, defaults to browser language.
2. **Step 0 — Start:** asks email + first/last name → creates the `draft` application →
   emails the magic resume link. From here the applicant is on their private resume URL
   (`/apply/resume/<resume_token>`).
3. **The form** rendered in the four sections above. Autosaves (debounced) against
   `resume_token`. Photo upload via the narrow server action.
4. **Submit** validates required fields → status `submitted` → fires applicant confirmation
   email + organizer alert.

## Organizer experience

The exchange page is a **plain dashboard organized by phase, with light hints**:

- **Phase 1 — Applications card:** share link with copy button, open/closed toggle, optional
  deadline; counts ("12 submitted · 3 to review"); link to the applications list. Light hint,
  e.g. "3 new applications waiting for review."
- **Applications list:** table of submitted applicants (name, submitted date, status badge);
  click → application detail.
- **Application detail:** clean read view of all answers + photo, with **Accept** / **Reject**.
  Reject takes an optional note + "send email?" checkbox. Accept → status `accepted` + fires
  invitation email.
- **Invitations / responses:** each accepted applicant shows Yes / No / Maybe(+note) / awaiting.
- **Phase 2 — Forms & documents card:** the existing form-builder + master grid. Only enrolled
  students appear, so it's naturally gated.

The dashboard never blocks; it badges what needs attention.

## Accept → enrolled bridge

1. Organizer clicks **Accept** → status `accepted`, `invite_token` set → invitation email with
   `eazyexchange.com/invite/<invite_token>`.
2. Candidate opens it → public page "You've been accepted into [Exchange]! Will you join?" →
   **Yes / No / Maybe (+ note).**
   - **No** → `declined`, recorded, no account.
   - **Maybe** → `maybe` + note saved; stays in the organizer's list.
   - **Yes** → `enrolled`; run the **existing invite flow**: create auth user + `users` profile
     (role `student`, `school_id` = organizer's school, name/email prefilled from the
     application), create `exchange_enrollments` row; candidate sets password via the existing
     `app/auth/confirm` route. Set `applications.enrolled_user_id`.
3. Existing enrollment trigger auto-assigns Phase 2 forms.

Everything from "Yes" onward is the current code path, fed from the application instead of the
manual invite form. The manual "invite by email" form stays as an escape hatch (retire later).

## Emails (existing Resend setup)

| Trigger | To | Content |
|---|---|---|
| Magic resume link (Step 0) | Applicant | Private link to resume the draft |
| Application submitted | Applicant | "We received your application" confirmation |
| Application submitted | Organizer | "New application from [name]" alert |
| **Accepted** | Applicant | **Invitation** + Yes/No/Maybe link (always sent) |
| Rejected | Applicant | Polite decline + optional note (per-applicant opt-out) |

All user-supplied content escaped in the HTML (per CLAUDE.md). No student/parent PII in logs.

## Verification (end-to-end)

1. Organizer creates exchange, opens applications, copies the apply link.
2. Visit apply link anonymously → toggle FR/EN → start with email → receive resume link.
3. Resume on a different browser → data persists → fill all sections + photo → submit.
4. Applicant gets confirmation email; organizer gets new-application alert.
5. Organizer reviews application detail → rejects one (email sent) → accepts another.
6. Accepted candidate gets invitation → answers "Maybe" (note saved, shows in list) → re-opens
   and answers "Yes" → account setup → becomes enrolled student.
7. Enrolled student sees Phase 2 forms auto-assigned; original application is linked via
   `enrolled_user_id`.
8. Closing applications (toggle off / past deadline) shows the "closed" page.
