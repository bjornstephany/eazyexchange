# Autopilot — status

_Last cycle: 2026-07-14 00:38 — reminder-apostrophe-tests: security review VERDICT: ship (escaping byte-identical, no regressions, no PII); both reviews clean — PR ships next cycle._

## Needs Bjorn
- Nothing.

## In flight
- reminder-apostrophe-tests — reviewing (both reviews: ship) — next: push auto/reminder-apostrophe-tests + open PR

## Queue
7 item(s) queued — top: «LandingNav focus management — focus trap/restore for the mobile landing nav (UI-polish leftover)»

## Recent activity (last 10)
- 2026-07-14 00:38 — security review: VERDICT ship (esc() byte-identical incl. escape order; subject-path exchange name unescaped = pre-existing on main, informational only; no admin-client imports; fixtures fictional)
- 2026-07-14 00:33 — code review: VERDICT ship (extraction reverse-diffed byte-identical vs main; 18/18 re-run independently; 2 informational nits only; reminder to list the optional edge-fn redeploy as a PR merge-time step)
- 2026-07-14 00:26 — Task 3/3 done (0b20217): recursive fr-tree apostrophe guard in landing content test, mutation-proofed; gate GREEN on the branch (lint ✓, 663/663 ✓, tsc ✓); diff scan clean (6 expected files)
- 2026-07-14 00:21 — Task 2/3 done (4e45c1e): 5 apostrophe-guard tests for the French lib/email.ts senders; mutation proof failed 3/5 as expected-plus (Phase2 also renders STUDENT_FOOTER); plan defect noted: Step 3's literal mutation instruction would be a JS parse error, implementer correctly used the \'-escaped form
- 2026-07-14 00:15 — Task 1/3 done on auto/reminder-apostrophe-tests (4dcd39d): email-copy.ts pure extraction, 18 new tests, 52/52 edge-fn suite green, lint clean; diff --stat scan clean
- 2026-07-14 00:12 — Task 1 first dispatch died mid-run (API connection closed, no writes); retried fresh per playbook — retry succeeded
- 2026-07-14 00:10 — ingested Bjorn's 3 new Queue items: cross-form consistency review aid, Google search favicon/meta description, signup OTP-instead-of-link (ec4d170)
- 2026-07-14 00:07 — reminder-apostrophe-tests: plan committed (c93baaf); 3 transcription-tier tasks, plan's extraction block machine-diffed against index.ts (0 drift)
- 2026-07-13 20:36 — reminder-apostrophe-tests: spec committed (3566188); zero existing ASCII-apostrophe bugs found; design = pure email-copy extraction + generic /\p{L}'\p{L}/u guard + positive ’ assertions
- 2026-07-13 20:26 — claimed reminder-apostrophe-tests (top Queue line) as [brainstorming]

## Watchouts
- Spec flags: (1) sendRejectionEmail copy is currently English — backlog candidate, out of scope here; (2) merge-time: send-reminders edge fn will trail the repo until the next manual `supabase functions deploy send-reminders` (behavior-identical; a redeploy was already pending from perf-cold-starts).
- Open PR #10 (chore/claude-md-lean-2026-07-13, Bjorn's) also edits CLAUDE.md — expect a one-time rebase conflict for the loop's local main when it merges.
