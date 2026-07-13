# Backlog

Managed by the autopilot loop — start it with `/loop /autopilot`
(playbook: `.claude/skills/autopilot/SKILL.md`, digest: `docs/autopilot/status.md`).

**Bjorn's zones:** append / reorder / delete one-liners in **Queue** (top =
highest priority), and answer questions in **Blocked** by adding an indented
`- A: <answer>` line under the question. Every other section is loop-owned —
to change those, tell a Claude session instead of editing.

## Queue

- split actions/applications.ts along trust lines: actions/apply.ts (public token), actions/applications-review.ts (organizer), actions/invitations.ts (CLAUDE.md tripwire)
- batch the bulk-accept applications flow (deferred from perf-cold-starts)
- organizer 2FA via Supabase MFA TOTP (deferred 2026-07-06 — Bjorn: delete this line if still unwanted)
- organizer review aid: verify cross-form consistency of submissions (ex: parent passport copy matches the parent who signed the AST/cerfa form)
- Google search appearance: add favicon + fix meta description getting cut off in results
- signup email verification: replace the confirmation link (opens new tab) with a code (OTP) the user types into the original tab, then continues onboarding there

## In progress

- [building (1/2)] landingnav-focus-management — «LandingNav focus management — focus trap/restore for the mobile landing nav (UI-polish leftover)» — spec: docs/superpowers/specs/2026-07-14-landingnav-focus-management-design.md — plan: docs/superpowers/plans/2026-07-14-landingnav-focus-management.md — branch: auto/landingnav-focus-management

## PRs awaiting merge

- [#11] reminder-apostrophe-tests — 6 decisions flagged — merge-time steps: yes, see PR body (optional edge-fn redeploy)

## Blocked

## Done
