# Backlog

Managed by the autopilot loop — start it with `/loop /autopilot`
(playbook: `.claude/skills/autopilot/SKILL.md`, digest: `docs/autopilot/status.md`).

**Bjorn's zones:** append / reorder / delete one-liners in **Queue** (top =
highest priority), and answer questions in **Blocked** by adding an indented
`- A: <answer>` line under the question. Every other section is loop-owned —
to change those, tell a Claude session instead of editing.

## Queue

- add unit-test assertions locking the French apostrophes (’) in the reminder email copy (UI-polish leftover)
- LandingNav focus management — focus trap/restore for the mobile landing nav (UI-polish leftover)
- split actions/applications.ts along trust lines: actions/apply.ts (public token), actions/applications-review.ts (organizer), actions/invitations.ts (CLAUDE.md tripwire)
- batch the bulk-accept applications flow (deferred from perf-cold-starts)
- organizer 2FA via Supabase MFA TOTP (deferred 2026-07-06 — Bjorn: delete this line if still unwanted)

## In progress

## PRs awaiting merge

## Blocked

## Done
