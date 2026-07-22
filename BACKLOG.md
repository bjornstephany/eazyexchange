# Backlog

Ideas and deferred work, highest priority at the top. Append one-liners freely;
pick items off the top when starting new work.

## Queue

- organizer 2FA via Supabase MFA TOTP (deferred 2026-07-06 — delete this line if still unwanted)
- organizer review aid: verify cross-form consistency of submissions (ex: parent passport copy matches the parent who signed the AST/cerfa form)
- Google search appearance: add favicon + fix meta description getting cut off in results
- signup email verification: replace the confirmation link (opens new tab) with a code (OTP) the user types into the original tab, then continues onboarding there
- optional modern click-through professional onboarding tour explaining the features to new users

## Known pre-existing bugs

Flagged during the 2026-07-14 applications refactor, deliberately not fixed there:

- `sendRejectionEmail` copy is still English while the rest of the product is
  localized.

## Done

- [#13 merged 2026-07-14] split-applications-trust-lines — split actions/applications.ts into apply.ts / applications-review.ts / invitations.ts by trust model; retired the CLAUDE.md tripwire.
- [#12 merged 2026-07-14] landingnav-focus-management — focus trap/restore + keyboard cycling for the landing language menu.
- [#11 merged 2026-07-14] reminder-apostrophe-tests — locked French typographic apostrophes in reminder/email/landing copy.
