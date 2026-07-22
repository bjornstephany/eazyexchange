# Block duplicate applications at the start

**Date:** 2026-07-20
**Status:** Approved — ready for implementation plan
**Area:** Anonymous application funnel (`actions/apply.ts`, `components/ApplicationStartForm.tsx`)

## Problem

A person who is already enrolled in one exchange (and therefore already has an
auth account) can fill out and submit an entire application to a *second*
exchange. Nothing stops them until the very last step: when they click « Oui »
to accept the resulting invitation, `respondToInvitation`
(`actions/invitations.ts`) calls `admin.auth.admin.createUser`, which fails with
`email_exists` and returns `inviteError('email_exists')`.

The block happens too late. The applicant has already done all the work. It
should be refused up front, on the application **start form**.

Within a *single* exchange this is already handled: `startApplication`
(`actions/apply.ts:75-100`) refuses a second application for the same email +
exchange (any existing row blocks a new insert; there is also a per-exchange
unique index). The gap is strictly **cross-exchange**.

## Rule

**One application per email, per school.**

When someone starts an application whose email already has **any** prior
application row in that school for a **different** exchange — any status
(`draft`, `submitted`, `accepted`, `maybe`, `enrolling`, `enrolled`,
`declined`, `rejected`) — they are stopped at the start form with a neutral
message and a link to `/login`.

A prior row for the **same** exchange keeps today's behavior unchanged (a live
draft is resumed via the emailed link; anything else returns the neutral
`existing: 'submitted'` state) — see Approach. Only cross-exchange priors
trigger the new `{ registered: true }` block.

### Scope: per-school (not global)

The applied-to exchange belongs to `school_a_id`, and application rows are
inserted with `school_id = exchange.school_a_id`. Every enrolled student always
has an application row in that same school (enrollment only ever comes from an
application), so a **per-school** email check catches the real bug — an
already-enrolled student applying to a second exchange — while keeping one
school's funnel from consulting another school's data (tenancy cleanliness).

The cross-school case (the same email applying to two *different* organizers'
schools) is deliberately left alone: it is a near-impossible real-world case,
and the existing `email_exists` backstop at invite-acceptance still covers it.

## Approach

**Broaden the existence check in `startApplication`.** One query for the email
across the school, then partition the results:

- **A row exists in *this* exchange** → today's exact behavior, unchanged:
  re-send the resume link for a live `draft`, or return the neutral
  `{ existing: 'submitted' }` otherwise (rejected/declined included).
- **A row exists only in *another* exchange** → new structured result
  `{ registered: true }`. No resume email is sent (there is nothing to resume
  on *this* exchange). The client renders a neutral "already registered — log
  in" message.

### Rejected alternatives

- **DB partial-unique index on `(school_id, email)`** — atomic, but the
  migration would fail on the duplicate rows this very bug has already created,
  and it is heavier than the funnel needs. The action-level check is sufficient;
  the race window for two simultaneous cross-exchange applications by the same
  email is negligible for this funnel, and the `submitApplication` backstop
  below closes it further.
- **Only improve the message at invite-acceptance** — rejected: the requirement
  is to block at the *start*, not the end.

## Changes

### 1. `actions/apply.ts` — `startApplication`

- Extend `StartApplicationResult` with `{ registered: true }`. Also finish the
  in-progress `{ invalidEmail: true }` structured return that already exists in
  the working tree (replacing the old `throw new Error('…valid email…')`).
- Replace the single same-exchange lookup at `:75-100` with a per-school
  by-email lookup:
  ```
  const { data: priors } = await admin
    .from('applications')
    .select('id, status, resume_token, exchange_id')
    .eq('school_id', exchange.school_a_id)
    .eq('email', email)
  ```
  Then branch:
  - `sameExchange = priors?.find(p => p.exchange_id === exchange.id)` →
    existing draft/submitted logic (resume-email for a live draft; neutral
    `{ existing: 'submitted' }` otherwise).
  - else if `priors` is non-empty → return `{ registered: true }`.
  - else → fall through to the per-exchange cap check + insert (unchanged).
- The existing `23505` unique-violation recovery path (two-tab race on the same
  exchange) stays as-is.

### 2. `actions/apply.ts` — `submitApplication` (defensive backstop)

Before finalizing the submit, re-check that no *other-exchange* application for
this email has appeared since the draft was created. If one has, return a
structured "already registered" outcome instead of submitting. Cheap; mirrors
the existing submit-time re-check of the application window. Keeps a race (draft
started here, then the same person enrolled elsewhere) from still reaching the
`email_exists` wall.

### 3. `components/ApplicationStartForm.tsx`

- Handle `{ registered: true }` → neutral message + a `/login` link, in FR and
  EN. Suggested copy:
  - FR: « Cette adresse e-mail est déjà associée à une candidature. Si tu as
    déjà un compte, connecte-toi. » + lien « Se connecter » → `/login`.
  - EN: "This email is already registered for an exchange. If you already have
    an account, log in." + "Log in" link → `/login`.
- Handle `{ invalidEmail: true }` → the friendly "use a valid email" message
  (already half-implemented at `:48`). Fixing this also resolves the current
  TypeScript error at `ApplicationStartForm.tsx:48`.

### 4. Tests — `actions/__tests__/applications.test.ts`

- Cross-exchange prior application for the email → `startApplication` returns
  `{ registered: true }`.
- Same-exchange live draft → still resumes (resume email + `{ existing:
  'draft' }`), unchanged.
- Same-exchange submitted/rejected → still neutral `{ existing: 'submitted' }`,
  unchanged.
- Keep the already-updated invalid-email test (`{ invalidEmail: true }`).
- `submitApplication`: an other-exchange application appearing after the draft
  → structured "already registered" outcome (if the backstop is kept).

No `supabase/migrations/`, RLS policies, or storage buckets are touched, so
`pnpm test:rls` is not required for this change.

## Enumeration note

This is an anonymous endpoint, but the app already reveals same-exchange
`existing` states on this same form, and the person is typing *their own* email.
A neutral "already registered — log in" message is consistent with the existing
privacy posture. No email address other than the one the visitor typed is ever
revealed, and no PII is logged.

## Verification

`pnpm lint`, `pnpm test`, `pnpm build` all green. `pnpm test:rls` not required
(no schema/RLS/bucket changes).

## Amendment (2026-07-20, post-implementation review decision)

After the feature was built and reviewed, the whole-branch review surfaced that
the "any prior application" rule, combined with the "already registered — log in"
remedy, is a dead end for non-enrolled priors (draft/submitted/declined/rejected
applicants have no account to log into). Bjorn's decision:

**The rule is one application per exchange** (the pre-existing per-exchange
dedup). **Additionally**, block a new application at the start ONLY when the
email is **already enrolled** in another exchange of the same school — i.e. an
auth account already exists (`enrolled_user_id is not null`). Only that case can
never enroll (it hits `email_exists` at « Oui »), and for it the "log in" remedy
is always correct. Non-enrolled prior applicants elsewhere are NOT blocked; they
may apply to a different exchange.

Implementation: both guards (`startApplication` and the `submitApplication`
backstop) add `.not('enrolled_user_id', 'is', null)`. The client copy is
unchanged (now always accurate). Cross-school enrolled is left to the existing
`email_exists` backstop, as before.
