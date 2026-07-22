# Send application invitations from the portal

**Status:** Design approved — ready for planning
**Date:** 2026-07-20

## Problem

Today an organizer opens applications (sets a deadline) and receives a public
link `/apply/<slug>` that they must distribute themselves (paste into their own
email, WhatsApp, a school newsletter). Two gaps:

1. Distribution is manual and off-platform.
2. Nobody appears in the portal until they hit the link and start an application
   (`startApplication` creates the row). Someone who was invited but never
   clicked is invisible — the organizer cannot see "I invited 30, 12 are silent."

## Solution

Give organizers the option to **send the application invitation to specific
students by email, from inside the portal**, and **track each invitee from the
moment it is sent** — so the applications list shows who was invited, who has
started, and who has submitted.

Explicitly **out of scope (per product decision):** no resend button, no
"nudge", no automatic follow-up reminders. Sending tracks the invitee; following
up is not part of this feature.

## Key decisions

- **Reuse the `applications` table** with a new `'invited'` status — not a
  separate `application_invites` table. Applications already enforce one row per
  `(exchange, email)`, already hold the resume-token machinery, and an
  invitation naturally *becomes* the application (same row, no join, no
  duplicated dedup logic).
- **Surface a pre-submission state to organizers.** Today `listApplications`
  does `.neq('status','draft')` — drafts are hidden. This feature makes
  organizer-invited rows visible through their whole lifecycle. Self-serve
  drafts stay hidden as they are today. The discriminator is a new
  `invited_at timestamptz` column: non-null ⇒ organizer-invited.
- **One-click invitee link.** Each invited row gets a fresh `resume_token`; the
  email links straight to that student's form — no re-typing the known email.
- **Emails only at entry** (paste a list, one per line / comma-separated). Names
  are captured when the student fills the application.

## Data model

Single migration:

```sql
alter table applications add column invited_at timestamptz;
```

No new table, no new bucket, no RLS policy change.

### Lifecycle of an organizer-invited row

| Status      | Meaning                                              | Organizer sees        |
|-------------|-----------------------------------------------------|-----------------------|
| `invited`   | Email sent; student has not opened the form         | "Invité — pas commencé" |
| `draft`     | Student opened & started (only when `invited_at` set) | "Commencé"          |
| `submitted` | Student submitted                                    | (unchanged)           |
| `accepted` / `rejected` / `maybe` / `enrolling` / `enrolled` | as today | (unchanged) |

`invited → draft` flips on the **first autosave** (`saveApplicationDraft`), so
"Commencé" means the student actually entered data, not merely received the
email. Read paths have no side effects.

## Components & flow

### Sending (new organizer action)

- Lives in `actions/applications-review.ts` (authenticated organizer trust
  model), **not** `actions/apply.ts` (anonymous funnel). New behavior goes in
  the file matching its trust model.
- Uses the **admin client**, added to `lib/supabase/__tests__/admin-allowlist.test.ts`
  **deliberately**: it bulk-inserts rows *and* emails arbitrary addresses, so it
  needs the same rate-limiting / service-role posture the anonymous funnel
  already has. Documented as an intentional allowlist extension, not a
  convenience.
- Input: exchange id + pasted email blob. Requires applications **open with a
  deadline** (same gate as the copy-link path).
- Rate-limited per organizer/IP; batch size capped (bulk emailing arbitrary
  addresses from our sending domain).

**Per-address resolution** (input deduped first — same address twice collapses):

| Outcome                        | Condition                                                        | Effect            |
|--------------------------------|------------------------------------------------------------------|-------------------|
| Sent                           | valid email, no existing row anywhere in the school              | create `invited` row (`status='invited'`, `invited_at=now()`, `data={ email }`, fresh `resume_token`) + email |
| Skipped — already in exchange  | a row already exists for `(this exchange, email)`                | no-op (idempotent) |
| Skipped — registered elsewhere | a row exists for the same email in **another** exchange of the school | no-op (honors school-wide "one email = one application", per `project_block_duplicate_applications`) |
| Invalid email                  | fails `isValidEmail`                                             | reported          |

Result returned to the UI as counts:
`{ sent, skippedExchange, skippedElsewhere, invalid }` →
"28 invitations envoyées · 2 déjà dans la liste · 1 email invalide".

Structured return value, never a throw (prod redacts thrown Server Action
messages).

### Invitee link (reuses the apply funnel)

- Email links to `/apply/resume/<resume_token>` (the existing route).
- `getApplicationDraft` learns that an `invited`-status row means "start here":
  it returns the form pre-filled with the known email instead of the
  "already submitted" marker. `draft` behaves as today.
- First `saveApplicationDraft` flips `invited → draft`.
- Submit / accept / enroll: entirely unchanged downstream.

### Organizer UI

- **Invite modal** (existing, `components/dashboard/InviteModal.tsx`): after the
  deadline step, offer two paths — **"Copier le lien"** (today) and
  **"Inviter par email"** (paste textarea → send → result summary).
- **`CandidaturesView`**: new status pills "Invité" / "Commencé"; a new
  **"Invités"** tab/filter to isolate the not-yet-started list.
- `listApplications` filter changes from `.neq('status','draft')` to include a
  row when `status != 'draft' OR invited_at is not null`.

### Invitation email

- New email type `sendApplicationInviteEmail` — subject e.g. "Vous êtes
  invité·e à candidater pour {exchange}", one-click apply button.
- Language defaults to the **organizer's locale** (student language unknown at
  invite time; the apply form retains its own language toggle).
- Address escaped in HTML; recorded in `email_send_log` with school/exchange
  context. Never log the raw student address in app logs (PII — minors).

## Edge cases

- Applications closed / deadline passed after sending: an unopened `invited`
  row's resume link hits the normal `applicationsClosed` gate — same as a
  self-serve draft.
- `invited` rows count toward the per-exchange sanity cap (2000) like any row.
- No cancel/delete of a mistaken invite in MVP; a dangling `invited` row (e.g.
  typo address) is harmless.

## Testing

- **Unit/pure:** email-blob parsing + per-address categorization
  (sent / skipped-exchange / skipped-elsewhere / invalid); the `listApplications`
  visibility rule; the `invited → draft` first-save transition.
- **Component:** invite-by-email panel (paste → result summary); "Invité" /
  "Commencé" pills and the "Invités" filter in `CandidaturesView`.
- **i18n:** new strings across all 5 locales (en/fr/es/it/de).
- **RLS:** migration touches `supabase/migrations/`, so `pnpm test:rls` must
  pass. No new matrix cases required (no new table/bucket; column + query-filter
  change only).
- Standard gate: `pnpm lint`, `pnpm test`, `pnpm build`.

## Files (anticipated)

- `supabase/migrations/<ts>_application_invited_status.sql` — add `invited_at`.
- `types/supabase.ts` — regenerate after migration.
- `actions/applications-review.ts` — new `sendApplicationInvitations` action;
  `listApplications` filter change.
- `actions/apply.ts` — `getApplicationDraft` handles `invited`;
  `saveApplicationDraft` flips `invited → draft`.
- `lib/supabase/__tests__/admin-allowlist.test.ts` — allowlist the new caller.
- `lib/email.ts` (+ templates) — `sendApplicationInviteEmail`.
- `components/dashboard/InviteModal.tsx` — add the "Inviter par email" path.
- `components/applications/CandidaturesView.tsx` — new pills + "Invités" filter.
- `lib/application-form.ts` / status-pill helper — map `invited` status.
- `messages/*.json` (5 locales) — new strings.
- Tests alongside each.
