# Feedback widget — design spec

**Date:** 2026-07-07 (brainstormed Session D of the 2026-07-06 backlog)
**Source:** `docs/feedback-backlog-2026-07-06.md`, sub-project 6.
**Status of sub-project 5 (organizer 2FA):** deferred by decision 2026-07-06 — no 2FA for now; no spec written.

## Goal

Give organizers a low-friction way to send suggestions and bug reports from
inside the dashboard. Feedback lands in a database table (source of truth,
designed to be polled by a future automated triage loop) and pings Bjorn by
email so early submissions don't sit unread.

## Locked decisions

- **Audience:** organizers only. No student-facing widget, no public/anonymous form.
- **Destination:** Supabase `feedback` table **plus** a Resend notification email per submission.
- **Placement:** discreet sidebar rail item in `OrganizerShell`, just above the profile menu.
- **Approach:** own table + server action (no third-party widget, no GitHub-issues pipe).
- **Triage:** happens outside the app (Supabase Studio, MCP, or a future scheduled
  session using the service role). No in-app admin view.

## Data model

One migration, new table `feedback`:

| column | type | constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `user_id` | uuid | not null, FK → `users(id)`, indexed |
| `school_id` | uuid | not null, FK → `schools(id)`, indexed |
| `type` | text | not null, check `type in ('suggestion','bug')` |
| `message` | text | not null, check `char_length(message) between 1 and 2000` |
| `page_path` | text | nullable; client-captured pathname (e.g. `/dashboard`) |
| `status` | text | not null default `'new'`, check `status in ('new','reviewed','done')` |
| `created_at` | timestamptz | not null default `now()` |

RLS:

- `alter table feedback enable row level security;`
- Single **INSERT** policy for `authenticated`: `with check (user_id = (select auth.uid()))`
  — `(select auth.uid())` wrap per the project's STABLE/initplan convention.
- **No** client SELECT / UPDATE / DELETE policies. Status transitions
  (`new → reviewed → done`) are made with the service role only.

Non-organizer inserts are blocked in the server action (role check), not in RLS —
consistent with how other organizer actions gate.

## UI

- **Rail item:** in `components/shell/OrganizerShell.tsx`, above the profile-menu
  block at the bottom of the sidebar. Message-square icon (added to `RailIcons.tsx`
  in the existing style) + label « Feedback ». Same visual treatment and states
  (hover, collapsed rail, etc.) as the existing rail items — mirror whatever
  they do.
- **Modal:** new client component `components/shell/FeedbackModal.tsx`, styled after
  `NewExchangeModal`:
  - Title: « Une suggestion ? Un problème ? »
  - Two type pills: « Suggestion » (default) / « Bug ou problème »
  - Textarea, placeholder « Décrivez votre idée ou le problème rencontré… »,
    maxLength 2000, required
  - Submit button « Envoyer » (busy state « Envoi… »)
  - On success: content swaps to a short « Merci ! Votre message a bien été envoyé. »
    state, then the modal closes (auto after ~1.5 s or on click)
  - Expected errors render inline in the modal from the structured action result
- The modal captures `window.location.pathname` at submit time and passes it as
  `page_path`.

## Server action

New `actions/feedback.ts` exporting `submitFeedback(input: { type; message; pagePath })`:

1. `getProfile()` — must exist and be `role === 'organizer'`, else structured error.
2. Validate: `type` is `'suggestion' | 'bug'`; `message` trimmed length 1–2000;
   `pagePath` optional string (truncate defensively, e.g. 300 chars).
3. Insert `{ user_id, school_id, type, message, page_path }` via the normal
   server client (RLS insert policy applies).
4. Send the notification email (step below). Email failure is caught and
   swallowed (console-level log without message contents) — the row is already
   inserted and must not be lost or the user shown an error for a Resend outage.
5. Return `{ ok: true }` or `{ ok: false, error: string }` — never throw for
   expected failures (prod redacts thrown Server Action messages).

## Notification email

New `sendFeedbackNotificationEmail` in `lib/email.ts`, following the existing
helper pattern:

- **To:** `process.env.FEEDBACK_EMAIL`; if unset, skip sending silently (the row
  is the source of truth). The var is optional and Bjorn-only, so it does not go
  in CLAUDE.md's required-env list; set it in the Vercel prod environment.
- **Subject:** `Nouveau feedback (suggestion|bug) — <school name>`
- **Body:** type, school name, organizer full name, page path, message —
  **all interpolated values HTML-escaped** per the email-injection rule.
- Organizer name/school in this email is fine (adult user, not student PII).

## Testing

Vitest units in the existing patterns:

- `actions/__tests__`: `submitFeedback` — rejects non-organizer, bad type,
  empty and >2000-char message; success inserts the expected payload
  (user_id/school_id from profile, trimmed message, page_path); email failure
  still returns `{ ok: true }`; unset `FEEDBACK_EMAIL` skips the send.
- `lib` email test: `sendFeedbackNotificationEmail` escapes HTML in message,
  school, and name fields.
- `components/shell/__tests__`: FeedbackModal renders pills/textarea, disables
  submit while busy, shows the merci state on success, shows inline error on
  structured failure.

Gate before commit: `pnpm lint`, `pnpm test`, `tsc --noEmit` (local build fails
on placeholder env — per project convention).

## Out of scope

- Student-facing feedback entry points.
- In-app admin/triage UI or status-change controls.
- Attachments / screenshots.
- Rate limiting (authenticated organizer-only surface; revisit if abused).
- The automated "poll suggestions and improve the app" loop itself — this spec
  only guarantees the `status` column contract it will consume.
