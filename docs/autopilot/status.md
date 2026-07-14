# Autopilot — status

_Last cycle: 2026-07-14 00:07 — reminder-apostrophe-tests: implementation plan written and committed (c93baaf); next cycle starts execution on auto/reminder-apostrophe-tests._

## Needs Bjorn
- Nothing.

## In flight
- reminder-apostrophe-tests — planned — next: execute (3 tasks: T1 extract email-copy.ts + tests + rewire index.ts; T2 lib/__tests__/email-french-copy.test.ts for the 5 French senders; T3 recursive fr-tree guard in landing content test)

## Queue
4 item(s) queued — top: «LandingNav focus management — focus trap/restore for the mobile landing nav (UI-polish leftover)»

## Recent activity (last 10)
- 2026-07-14 00:07 — reminder-apostrophe-tests: plan committed (c93baaf); 3 transcription-tier tasks, plan's extraction block machine-diffed against index.ts (0 drift)
- 2026-07-13 20:36 — reminder-apostrophe-tests: spec committed (3566188); zero existing ASCII-apostrophe bugs found; design = pure email-copy extraction + generic /\p{L}'\p{L}/u guard + positive ’ assertions
- 2026-07-13 20:26 — claimed reminder-apostrophe-tests (top Queue line) as [brainstorming]

## Watchouts
- Spec flags: (1) sendRejectionEmail copy is currently English — backlog candidate, out of scope here; (2) merge-time: send-reminders edge fn will trail the repo until the next manual `supabase functions deploy send-reminders` (behavior-identical; a redeploy was already pending from perf-cold-starts).
- Open PR #10 (chore/claude-md-lean-2026-07-13, Bjorn's) also edits CLAUDE.md — expect a one-time rebase conflict for the loop's local main when it merges.
