# Backlog

Managed by the autopilot loop — start it with `/loop /autopilot`
(playbook: `.claude/skills/autopilot/SKILL.md`, digest: `docs/autopilot/status.md`).

**Bjorn's zones:** append / reorder / delete one-liners in **Queue** (top =
highest priority), and answer questions in **Blocked** by adding an indented
`- A: <answer>` line under the question. Every other section is loop-owned —
to change those, tell a Claude session instead of editing.

## Queue

- batch the bulk-accept applications flow (deferred from perf-cold-starts)
- organizer 2FA via Supabase MFA TOTP (deferred 2026-07-06 — Bjorn: delete this line if still unwanted)
- organizer review aid: verify cross-form consistency of submissions (ex: parent passport copy matches the parent who signed the AST/cerfa form)
- Google search appearance: add favicon + fix meta description getting cut off in results
- signup email verification: replace the confirmation link (opens new tab) with a code (OTP) the user types into the original tab, then continues onboarding there
- optional modern click-through professional onboarding tour explaining the features to new users
- fix staging migration-ledger drift: `supabase db push --db-url $STAGING_DB_URL` is broken — 10 stamped versions in staging's ledger have no local files (20260703000002/000003, 20260705000001-4, 20260707000001/000004, 20260715000001, 20260717145051). Reconcile via `supabase migration repair` / `db pull` (or rebuild staging) so staging migrations work again; discovered 2026-07-19 during data-retention rollout (worked around with direct SQL that time)

## In progress

## PRs awaiting merge

## Blocked

## Done

- [#13 merged 2026-07-14] split-applications-trust-lines — split actions/applications.ts into apply.ts / applications-review.ts / invitations.ts by trust model; retired the CLAUDE.md tripwire. Both reviews ship.
- [#12 merged 2026-07-14] landingnav-focus-management — focus trap/restore + keyboard cycling for the landing language menu.
- [#11 merged 2026-07-14] reminder-apostrophe-tests — locked French typographic apostrophes in reminder/email/landing copy. Optional edge-fn redeploy `supabase functions deploy send-reminders` (behavior-identical) not yet run.
