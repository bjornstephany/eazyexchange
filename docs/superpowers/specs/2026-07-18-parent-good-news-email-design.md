# Parent "Bonne nouvelle" confirmation email — design

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan

## Context

When an organizer accepts a student's application today, `acceptApplication`
(`actions/applications-review.ts`) emails the **student** a fixed "Bonne nouvelle
— ta candidature a été retenue" message (`sendInvitationEmail` in `lib/email.ts`)
linking to `/invite/[token]`, where the student clicks **Yes / No / Maybe** on a
landing page (`components/InviteResponseForm.tsx`). "Yes" creates the student's
auth account, enrolls them, and mints their session inline.

Real organizers (e.g. AGESSIA) need the good-news email to go to **parents**, not
the student, because parental confirmation is the family's definitive commitment
("Cette confirmation vaudra engagement définitif"). They also need each exchange's
email to carry that exchange's specific details (dates, costs, membership/payment
link, passport warning, confirmation deadline), and a way to capture and review
questions from families who are interested but not yet certain.

This design evolves the existing acceptance flow into a **parent-facing,
per-exchange, customizable bonne-nouvelle email** with inline Yes / No / Maybe
buttons, where "Maybe" collects questions the organizer can review. Family
confirmation and student account setup become two clean steps.

## Decisions (from brainstorming)

- **Parent email replaces** the student-facing acceptance email. Parent "Yes"
  records the family's commitment; the student then **separately** receives a
  link to create their account.
- **Reuse existing parent-email fields** rather than adding new ones to the start
  page: make `father_email` required and keep `mother_email` optional (this is the
  "two fields, second optional"). Both stay in the Parents section of the form.
- **Questions are reviewed on the candidate detail card** — no new dedicated view.
- **Template is per-exchange with placeholders**, edited under Settings → Programme.

## Data model

New migration `supabase/migrations/<ts>_good_news_template.sql`:

- `exchanges.good_news_subject text` (nullable)
- `exchanges.good_news_body text` (nullable)

Nullable: when null, the app falls back to a built-in default template (seeded
from the AGESSIA/Edina example, generalized with placeholders). Client `UPDATE`
on `exchanges` is already restricted; these columns are written only by an
organizer server action scoped by RLS to their own school — verify the existing
`exchanges` UPDATE policy covers organizer writes to these columns and add an RLS
matrix case for them (per CLAUDE.md: any migration touching tables/RLS ships
matrix cases and passes `pnpm test:rls`).

After the migration: MCP `apply_migration` → `list_migrations` drift check →
`generate_typescript_types` → overwrite `types/supabase.ts` → `npx tsc --noEmit`
(fix `types/db.ts` alias, never hand-edit generated types). Apply to **staging
first**, then prod via MCP (per CLAUDE.md staging workflow).

`lib/application-form.ts`: `father_email` → `required: true`; `mother_email`
stays optional.

Reuse existing `applications` columns unchanged: `invite_token`,
`invite_response`, `invite_response_note`, `terms_acknowledged_at`, and status
values (`accepted` / `declined` / `maybe`). No new status is needed.

## Template authoring (Settings → Programme, per exchange)

In `components/settings/SettingsView.tsx` under `section === 'prog'`, add a
"Bonne nouvelle" card next to `ProgramCard` / `ReminderSettingsCard`:

- Subject input + body textarea, pre-populated with the current stored value or
  the default template.
- Available placeholders documented next to the editor:
  **`{{student_name}}`** and **`{{exchange_name}}`**. Everything else (dates,
  costs, links, passport warning, confirmation deadline) is identical for all
  families in the exchange, so the organizer types it literally into the body.
- A live preview showing the substituted body plus the auto-appended buttons.
- The **Yes / No / Maybe buttons are appended by the system**, never part of the
  editable body, so an organizer cannot break them.

New `lib/good-news-template.ts` (pure, unit-tested) holds:

- `DEFAULT_GOOD_NEWS_SUBJECT` / `DEFAULT_GOOD_NEWS_BODY` constants (the
  generalized AGESSIA example).
- `renderGoodNews({ subject, body, studentName, exchangeName })` → substitutes
  `{{student_name}}` / `{{exchange_name}}`, HTML-escapes the result, converts
  `\n` → `<br>`. Shared by both the settings preview and the email renderer so
  they never drift.

Save via a new organizer server action (e.g. `updateGoodNewsTemplate` in
`actions/settings.ts` or `actions/exchanges.ts`), RLS-scoped to the caller's
school, following the existing `getProgramInfo` / program-update patterns.
Expected validation outcomes are structured return values, not throws (prod
redacts thrown Server Action messages).

## The email and the buttons

`acceptApplication` (`actions/applications-review.ts`) changes:

- Still sets status `accepted`, generates `invite_token`, stamps review fields.
- Sends a **new `sendGoodNewsEmail`** (in `lib/email.ts`) to the **parents**
  instead of `sendInvitationEmail` to the student.
- Recipients: `data.father_email` + `data.mother_email` (filtered to present
  values), **falling back to the student's email** if neither is present, so an
  accept never silently fails to notify. `buildApplicantName(data)` supplies
  `{{student_name}}`.
- `sendGoodNewsEmail` renders the exchange's template via `renderGoodNews`
  (falling back to the defaults when the columns are null) and **auto-appends
  three styled link-buttons**.

Because email clients run no scripts and link-prefetchers can hit bare URLs, the
three buttons are **links that deep-link to `/invite/[token]?r=yes|no|maybe`**;
the response is only recorded by an explicit action on that page (never on GET):

- **Oui** → lands on the page with "Yes" pre-selected → one confirm action.
- **Non** → lands with "No" pre-selected → one confirm action.
- **« Oui, mais nous avons des questions… »** → lands and opens a questions
  textarea → submit.

Escape all organizer-authored template content in the email HTML (CLAUDE.md
rule). Never log parent/student PII from the send path.

## Parent response → student onboarding

`/invite/[token]` becomes parent-facing. `app/invite/[token]/page.tsx` reads the
`?r=` search param and passes it to `InviteResponseForm`, which pre-selects the
choice. `respondToInvitation` (`actions/invitations.ts`, anonymous invite-token
trust model, already admin-allowlisted):

- **No** → status `declined` (unchanged path).
- **Maybe** → status `maybe`, questions stored in `invite_response_note`
  (unchanged path).
- **Yes** → record confirmation + stamp `terms_acknowledged_at` (the **parent's**
  click is now the terms acknowledgment), create the student's auth account +
  `exchange_enrollments` row (as today), but **do not mint a session for the
  parent**. Instead, email the **student** a set-your-password link:
  `generateLink` (magiclink) → deliver the resulting
  `/auth/confirm?token_hash=…&type=magiclink&next=/accept-invite` URL via Resend
  (a new `sendStudentSetupEmail` in `lib/email.ts`). The existing
  `app/auth/confirm/route.ts` already verifies `magiclink` OTPs and redirects to
  `next`, so the student lands logged in on `/accept-invite` to set a password.

Parent success copy: "Merci — votre enfant recevra un lien pour créer son accès."

`components/InviteResponseForm.tsx` updates: parent-facing copy throughout,
pre-select from the `r` prop, the Maybe button reads **« Oui, mais nous avons des
questions… »** and reveals the questions textarea, distinct success states for
yes / no / maybe.

Idempotency/race handling: keep the existing atomic-claim guards
(`.in('status', [...])`) so a double-clicked link or two parents clicking Yes
creates the account and sends the student link **exactly once**.

## Organizer review of questions

Questions surface on the candidate detail card
(`components/applications/ApplicationDetail.tsx`). Today the note block only
renders when `status === 'submitted'` (via `ApplicationReviewActions`), so a
`maybe` application's questions would be invisible — **fix**: render the
`invite_response_note` (the questions) whenever it is present, including for
`status === 'maybe'`. No new view.

## Out of scope (YAGNI)

- A dedicated cross-exchange "questions inbox" view (candidate detail is enough).
- Rich-text / WYSIWYG template editing (plain text + `\n` line breaks).
- New parent-email fields on the start page (reusing existing form fields).
- CC'ing the student on the good-news email (they get their own setup email).
- Localizing the organizer-authored template (it is authored in the organizer's
  own language; system-appended button labels follow the applicant `language`).

## Files touched (summary)

- `supabase/migrations/<ts>_good_news_template.sql` (+ RLS matrix case)
- `types/supabase.ts` (regenerated), `types/db.ts` (alias check)
- `lib/application-form.ts` — `father_email` required
- `lib/good-news-template.ts` (new) — defaults + `renderGoodNews` (unit-tested)
- `lib/email.ts` — `sendGoodNewsEmail`, `sendStudentSetupEmail`
- `actions/applications-review.ts` — `acceptApplication` sends to parents
- `actions/invitations.ts` — parent Yes creates account + emails student link
- `actions/settings.ts` (or `actions/exchanges.ts`) — `updateGoodNewsTemplate`
- `components/settings/SettingsView.tsx` + new "Bonne nouvelle" card
- `components/InviteResponseForm.tsx`, `app/invite/[token]/page.tsx`
- `components/applications/ApplicationDetail.tsx` — show questions for `maybe`

## Verification

- Unit: `lib/good-news-template.ts` (substitution, escaping, `\n`→`<br>`,
  placeholder edge cases); updated `respondToInvitation` tests (parent Yes creates
  account + triggers student email but mints no parent session; Maybe stores
  questions; No declines; double-click idempotency); `acceptApplication` recipient
  selection (father/mother/fallback).
- `pnpm lint && pnpm test && pnpm build`.
- `pnpm test:rls` (migration touches `exchanges` columns / policies) with new
  matrix cases.
- Manual on **staging** (previews hit staging; no real email — sends degrade to
  console warnings, so verify recipients/URLs from logs): edit a template under
  Settings → Programme, accept an application, confirm the good-news email targets
  the parent addresses with correct placeholder substitution and working
  deep-linked buttons, walk Yes → student setup email → `/accept-invite`, and
  Maybe → questions visible on the candidate detail card.
