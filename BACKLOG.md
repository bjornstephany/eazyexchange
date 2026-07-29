# Backlog

Ideas and deferred work, highest priority at the top. Append one-liners freely;
pick items off the top when starting new work.

## Queue

- organizer 2FA via Supabase MFA TOTP (deferred 2026-07-06 — delete this line if still unwanted)
- organizer review aid: verify cross-form consistency of submissions (ex: parent passport copy matches the parent who signed the AST/cerfa form)
- Google search appearance: add favicon + fix meta description getting cut off in results
- password reset flow (with code entry) — no reset flow exists today; build one using the same single-tab 6-digit-code pattern as signup confirmation (spec: docs/superpowers/specs/2026-07-23-single-tab-signup-confirmation-design.md)
- messages/fr.json: 14 pre-existing straight apostrophes violate the typographic-`’` convention (lines ~159, 344, 347, 348, 363, 430, 431, 447, 895, 896, 959, 964, 967, 971 as of 2026-07-24) — found by the onboarding-overhaul apostrophe guard, left alone there to keep that branch's diff in scope
- Migrate the remaining native `<input type="date">` fields (LibraryDrawer, template editors, `app/onboarding/OnboardingForm.tsx` trip start/end) to `components/ui/date-field` — the Candidatures deadlines moved 2026-07-29.
- `DateField` has no text entry and no arrow-key roving focus, so reaching a far month costs one Enter per month plus up to 31 tabs, where `<input type="date">` let you type the date in ten keystrokes. Worth revisiting with arrow-key roving focus in the grid and a year stepper.
- `components/shell/OrganizerShell.tsx`'s `NewExchangeAutoOpen` opens a modal Radix Dialog on `?new-exchange=1`. Nothing produces that parameter today, so it's unreachable — but now that the tour auto-starts, a `pending` organizer on such a URL would get both, and the dialog's trapped focus scope would pull focus out of the tour bubble (a plain div, not a Radix `FocusScope`). A `plan.length > 0` bail in `NewExchangeAutoOpen` would close it.

## Known pre-existing bugs

Flagged during the 2026-07-14 applications refactor, deliberately not fixed there:

- `sendRejectionEmail` copy is still English while the rest of the product is
  localized.

## Done

- [2026-07-27] onboarding-tour — optional anchored spotlight tour of the six
  organizer tabs, offered once on `/applications` and replayable from the account
  menu. State in `users.tour_state`
  (`20260727195338`). Spec:
  `docs/superpowers/specs/2026-07-27-onboarding-tour-design.md`.
- [2026-07-25] revoke-schools-name-grant — `authenticated` has no UPDATE on
  `schools` at all (`20260725122126`); the dead "organizers update their school"
  policy dropped with it. `claim_school()` is the only writer of the name.
- [#13 merged 2026-07-14] split-applications-trust-lines — split actions/applications.ts into apply.ts / applications-review.ts / invitations.ts by trust model; retired the CLAUDE.md tripwire.
- [#12 merged 2026-07-14] landingnav-focus-management — focus trap/restore + keyboard cycling for the landing language menu.
- [#11 merged 2026-07-14] reminder-apostrophe-tests — locked French typographic apostrophes in reminder/email/landing copy.
