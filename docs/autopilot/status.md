# Autopilot — status

_Last cycle: 2026-07-14 16:45 — GitHub DNS recovered; all 3 in-flight PRs MERGED to main with merge commits (#11 e18e3f6, #12 7dd25df, #13 fb46091). CI unit→rls→deploy running on the #13 merge (final prod deploy). WIP now empty → next loop wake can claim from Queue (top: bulk-accept batching)._

## Needs Bjorn
- **Optional:** `supabase functions deploy send-reminders` — the edge fn trails the repo (behavior-identical; from PR #11). No urgency.
- **PR #10** (chore/claude-md-lean, Bjorn's) still open and now CONFLICTS with main's CLAUDE.md (PR #13 retired the tripwire). Rebase/resolve taking both sides, or close it.

## In flight
- (none) — all three merged.

## Queue
6 item(s) queued — top: «batch the bulk-accept applications flow (deferred from perf-cold-starts)»

## Recent activity (last 10)
- 2026-07-14 16:45 — DNS recovered; re-verified both held branches green, pushed, opened PR #12/#13, then MERGED all three (#11/#12/#13) with merge commits. Local main reset to origin/main (fb46091). CI deploying. WIP cleared.
- 2026-07-14 01:48 — split-applications-trust-lines: plan committed (6503def); 4 tasks (branch/split/import-sites/verify), 3 new action files transcribed byte-for-byte, 25 import sites + allowlist + 2 docs as exact one-liners; single stage-by-name commit in Task 3 (no shim → tree green only as a whole); overlap constraints honored (no landing/**, no PR#11 files)
- 2026-07-14 01:36 — split-applications-trust-lines: spec committed (013d9be); no re-export shim, shared helpers → lib/tokens.ts + lib/uploads.ts (use-server constraint), allowlist test reflects the 3 new paths, CLAUDE.md tripwire retired in build PR; 2 pre-existing bugs flagged as separate backlog candidates (not fixed). Spec wrapper hit the Fable-5 limit AFTER committing — work intact.
- 2026-07-14 01:20 — landingnav-focus-management code review: VERDICT ship (focus logic, wrap math, preventDefault scope verified; 7/7 tests fail-if-regressed; 2 no-action nits); GitHub unreachable — PR push deferred
- 2026-07-14 01:14 — landingnav Task 2/2 done (44a5960): Tab/arrow wrap cycle + 2 tests; final component byte-identical vs plan; gate green (647/647)
- 2026-07-14 01:05 — landingnav Task 1/2 done (cbb5c1f): 5 new tests, pre-impl failures matched the plan's corrected list; 645/645, build ok
- 2026-07-14 00:58 — landingnav plan committed (61c438c); self-review caught a vacuous-pass TDD trap
- 2026-07-14 00:49 — landingnav spec committed (fa0a7f4); scoped to the language dropdown (no mobile menu exists); zero overlap with PR #11
- 2026-07-14 00:42 — PR #11 opened: reminder-apostrophe-tests — 23 new tests, no product copy changes
- 2026-07-14 00:38 — reminder-apostrophe-tests security review: VERDICT ship
- 2026-07-14 00:33 — reminder-apostrophe-tests code review: VERDICT ship
- 2026-07-14 00:26 — reminder-apostrophe-tests Task 3/3 done (0b20217); gate green (663/663)

## Watchouts
- **GitHub DNS: RESOLVED 2026-07-14 16:30** — reachable again. (If DNS64 poisoning recurs — unroutable `64:ff9b::` IPv6 for github.com — fix: `sudo sh -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf'`.)
- split-applications spec flags 2 pre-existing bugs as backlog candidates (do not fix in the refactor): (1) `getApplicationForReview` selects `*` incl. tokens server-side (not serialized to browser today, but narrow the select); (2) `acceptApplication` allows `rejected → accepted` un-reject, undocumented.
- Spec flags (reminder item): sendRejectionEmail copy is English (backlog candidate); send-reminders edge fn trails the repo until a manual `supabase functions deploy send-reminders`.
- Open PR #10 (chore/claude-md-lean-2026-07-13, Bjorn's) also edits CLAUDE.md — expect a one-time rebase conflict for the loop's local main when it merges. The split-applications build PR also edits CLAUDE.md (retires the tripwire) — second CLAUDE.md conflict source.
