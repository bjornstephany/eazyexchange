# Autopilot — status

_Last cycle: 2026-07-13 20:36 — claimed reminder-apostrophe-tests from Queue and produced its design spec (commit 3566188)._

## Needs Bjorn
- Nothing.

## In flight
- reminder-apostrophe-tests — specced — next: plan

## Queue
4 item(s) queued — top: «LandingNav focus management — focus trap/restore for the mobile landing nav (UI-polish leftover)»

## Recent activity (last 10)
- 2026-07-13 20:36 — reminder-apostrophe-tests: spec committed (3566188); zero existing ASCII-apostrophe bugs found; design = pure email-copy extraction + generic /\p{L}'\p{L}/u guard + positive ’ assertions
- 2026-07-13 20:26 — claimed reminder-apostrophe-tests (top Queue line) as [brainstorming]

## Watchouts
- Spec flags: (1) sendRejectionEmail copy is currently English — backlog candidate, out of scope here; (2) merge-time: send-reminders edge fn will trail the repo until the next manual `supabase functions deploy send-reminders` (behavior-identical; a redeploy was already pending from perf-cold-starts).
- Open PR #10 (chore/claude-md-lean-2026-07-13, Bjorn's) also edits CLAUDE.md — expect a one-time rebase conflict for the loop's local main when it merges.
