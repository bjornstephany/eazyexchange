# Backlog

Ideas and deferred work, highest priority at the top. Append one-liners freely;
pick items off the top when starting new work.

## Queue

- organizer 2FA via Supabase MFA TOTP (deferred 2026-07-06 — delete this line if still unwanted)
- organizer review aid: verify cross-form consistency of submissions (ex: parent passport copy matches the parent who signed the AST/cerfa form)
- Google search appearance: add favicon + fix meta description getting cut off in results
- password reset flow (with code entry) — no reset flow exists today; build one using the same single-tab 6-digit-code pattern as signup confirmation (spec: docs/superpowers/specs/2026-07-23-single-tab-signup-confirmation-design.md)
- optional modern click-through professional onboarding tour explaining the features to new users
- messages/fr.json: 14 pre-existing straight apostrophes violate the typographic-`’` convention (lines ~159, 344, 347, 348, 363, 430, 431, 447, 895, 896, 959, 964, 967, 971 as of 2026-07-24) — found by the onboarding-overhaul apostrophe guard, left alone there to keep that branch's diff in scope

## Known pre-existing bugs

Flagged during the 2026-07-14 applications refactor, deliberately not fixed there:

- `sendRejectionEmail` copy is still English while the rest of the product is
  localized.

## Done

- [#13 merged 2026-07-14] split-applications-trust-lines — split actions/applications.ts into apply.ts / applications-review.ts / invitations.ts by trust model; retired the CLAUDE.md tripwire.
- [#12 merged 2026-07-14] landingnav-focus-management — focus trap/restore + keyboard cycling for the landing language menu.
- [#11 merged 2026-07-14] reminder-apostrophe-tests — locked French typographic apostrophes in reminder/email/landing copy.
