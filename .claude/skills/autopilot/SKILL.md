---
name: autopilot
description: Use when running the autonomous backlog pipeline (start with /loop /autopilot). Each cycle syncs git + BACKLOG.md, picks ONE next action, dispatches a fresh subagent stage (brainstorm → spec → plan → build → review → PR), records state, and sleeps. Orchestrator only — never write product code in this session; autonomy stops at the PR (human merges).
---

# Autopilot — autonomous backlog orchestrator

You are a thin dispatcher working `BACKLOG.md` (repo root). You never write
product code, specs, plans, or reviews yourself — a fresh subagent does each
stage, and every handoff is a file. Your context is disposable: git state,
`BACKLOG.md`, and `.superpowers/autopilot/<slug>/` are the only truth; a
restarted session must reconstruct everything from them.

Binding design spec: `docs/superpowers/specs/2026-07-13-autopilot-workflow-design.md`.
All of `CLAUDE.md` binds you and every subagent you dispatch.

If invoked directly (a bare `/autopilot`, not via `/loop`), run exactly one
cycle and stop — do not call ScheduleWakeup. Under `/loop`, end every cycle
with ScheduleWakeup (§ Sleep).

## Hard guardrails — never, under any circumstances

1. **Never merge to `main`, push `main` to origin, or otherwise trigger a
   prod deploy.** Commits on local `main` (backlog / status / specs / plans)
   stay local until Bjorn's own pushes carry them. Only `auto/<slug>`
   branches are ever pushed.
2. **Never touch prod:** no prod migrations (MCP `apply_migration` is
   forbidden inside this loop), no edge-function deploys, no Vercel
   env/config changes, no real email. Migrations go to staging only
   (§ Migrations).
3. **Max 3 fix attempts** on a failing gate or review finding — then mark
   the item `blocked` with notes and move on.
4. **One code-writing subagent at a time, ever.** Dispatch synchronously
   (`run_in_background: false`). Never start an item whose files overlap an
   open loop-PR (§ Overlap check).
5. **No student/parent PII** in logs, commits, briefs, or PR bodies.
   Implementers stage files by name (never `git add -A` / `git add .`);
   after every implementer dispatch, scan `git diff --stat main...HEAD` for
   unexpected files before proceeding. `docs/exampleSchoolFiles/` and any
   stray PDFs must never enter a commit.
6. **Bjorn's edits win.** Any `BACKLOG.md` conflict resolves in favor of his
   Queue / Blocked lines, always.

## BACKLOG.md contract

Five sections, exact headings: `## Queue`, `## In progress`,
`## PRs awaiting merge`, `## Blocked`, `## Done`.

- **Queue** (Bjorn-owned): raw one-liners, top = highest priority. You only
  ever *remove* the top line when claiming it (or a line you queued yourself
  as `[auto] …`).
- **In progress** (loop-owned), one line per item, fields accumulate:
  `- [<status>] <slug> — «<original one-liner>» — spec: <path> — plan: <path> — branch: auto/<slug>`
  Statuses: `brainstorming → specced → planned → building (n/m) → reviewing`.
- **PRs awaiting merge** (loop-owned):
  `- [#N] <slug> — <k> decisions flagged — merge-time steps: <none | yes, see PR body>`
- **Blocked** (loop writes questions, Bjorn answers):
  `- <slug> [was: <status>] — Q: <one specific question>`
  Bjorn answers with an indented `  - A: <answer>` line. An answered
  question un-blocks the item back to `[was:]` status on the next sync.
- **Done** (loop-owned archive, newest first):
  `- <merge date> [#N] <slug> — «<one-liner>»`

Slugs: kebab-case, ≤ 5 words, derived from the one-liner, stable for the
item's life (they name the branch, spec, plan, and work dir).

## The cycle — each wakeup does exactly one pass

### 1. Sync

```bash
git checkout main
git checkout -- docs/autopilot/status.md 2>/dev/null || true   # derived state, regenerated in Record
git diff --quiet HEAD -- BACKLOG.md || { git add BACKLOG.md && git commit -m "chore(autopilot): ingest Bjorn's BACKLOG.md edits"; }
git fetch origin
git rebase origin/main
```

- Bjorn's blessed input path is appending Queue lines / Blocked answers
  straight into `BACKLOG.md` from his own editor — an uncommitted,
  working-tree change here. The commit above ingests it before fetch/rebase
  (guardrail 6: his edits win), so a dirty `BACKLOG.md` is never mistaken
  for the unrecognized-dirty-tree case in § Failure handling & resumability.
- If the rebase conflicts on `BACKLOG.md`: resolve by hand — Bjorn's Queue
  and Blocked lines win verbatim; your own loop-owned sections win for the
  rest — then `git add BACKLOG.md && git rebase --continue`.
- If the rebase conflicts on **any other file** (status.md, a spec, a plan,
  the CLAUDE.md pointer, …): `git rebase --abort`, record a Watchouts note
  in status.md (« rebase conflict on <file> — résolution manuelle requise »),
  and sleep long (1800) — degrade safely, never leave a rebase in progress.
- **Detect merged loop-PRs:**
  `gh pr list --state merged --json number,headRefName,mergedAt --limit 20`,
  filter `headRefName` starting `auto/`. For each newly merged one: move its
  item to Done (with date + PR number), then
  `git branch -D auto/<slug>; git push origin --delete auto/<slug> || true`.
- **If `origin/main` moved** (any new commits fetched): rebase every open
  `auto/*` branch onto the refreshed local `main` and
  `git push --force-with-lease origin auto/<slug>` each; a conflicting
  branch gets `git rebase --abort` and a Watchouts note in status.md instead.
  Finish back on `main`.
- **Ingest Blocked answers:** every Blocked line with an `- A:` reply moves
  back to In progress at its `[was:]` status; keep the Q/A visible in the
  item's work dir (`.superpowers/autopilot/<slug>/decisions.md`) for the
  eventual spec/PR.

### 2. Pick exactly one next action (first match wins)

1. An In-progress item exists → advance the furthest-along one to its next
   stage (finish what's started before claiming new work).
2. Open loop-PRs < 3 AND the top unclaimed Queue line does not overlap open
   PRs (§ Overlap check) → claim it: remove the line from Queue, add it to
   In progress as `[brainstorming]`, `mkdir -p .superpowers/autopilot/<slug>`.
3. Else work ahead: brainstorm/spec/plan future Queue items — doc-only, no
   branch, specs/plans commit to local `main`. (The `auto/<slug>` branch is
   created only when execution starts and the PR slot + overlap check pass.)
4. Else pull the top maintenance-menu item (§ Maintenance menu) — label it
   `[auto]`, max 1 `[auto]` item in flight anywhere in the pipeline.
5. Else there is nothing to do → Record + Sleep (long).

### 3. Dispatch the stage (§ Stage playbook)

Fresh subagent per stage via the Agent tool, always
`run_in_background: false`. Write the brief file first, pass only the brief
path + repo root in the prompt. Read the report file when it returns — not
the diff (except the `--stat` PII scan).

Model choice: spec / plan / review stages → omit `model` (inherit).
Implementer whose plan task contains complete code → `model: "sonnet"`.
Anything writing French user-facing copy → sonnet or better, **never haiku**
(it strips accents).

### 4. Record

Record **always** runs on `main`. Any Execute exit — happy path or not (task
dispatch failed twice, fix budget exhausted, gate blocked) — leaves the
controller wherever that stage left it, possibly still on `auto/<slug>`:
```bash
git checkout main   # no-op if already there
```
first, before anything below. All `BACKLOG.md` / `status.md` edits happen
only here, on `main`, after that checkout — never on the item branch. (A
stale committed copy of `BACKLOG.md` on the branch is harmless: those paths
are rebase-managed and merge cleanly by SHA.)

- Update the item's `BACKLOG.md` line and rewrite `docs/autopilot/status.md`
  (template below) — full rewrite, not append.
- Commit on `main` only when real state changed (claim, stage transition,
  block, unblock, PR opened, Done):
  `git add BACKLOG.md docs/autopilot/status.md && git commit -m "chore(autopilot): <slug> → <new status>"`.
  Code changes are committed by implementers on the item branch, never by you.

### 5. Sleep (only under /loop)

ScheduleWakeup with `prompt: "/autopilot"` and:

| Situation | delaySeconds |
|---|---|
| More actionable work right now | 60 |
| Everything waiting on Bjorn (all blocked / at PR cap / queue empty with `[auto]` in flight) | 1800 |
| A dispatch failed with rate-limit / overload errors | 3600 |

## Stage playbook

Work dir per item: `.superpowers/autopilot/<slug>/`. Briefs and reports:
`spec-brief.md` / `spec-report.md`, `plan-brief.md` / `plan-report.md`,
`task-N-brief.md` / `task-N-report.md`, `review-report.md`,
`security-report.md`, `fix-N-brief.md` / `fix-N-report.md`. Every brief
starts from the § Brief template.

**Brainstorm → spec** (`brainstorming → specced`). Brief instructs the
subagent to: explore the codebase; make every product judgment itself
(decide + flag — the pipeline never stalls on questions); write
`docs/superpowers/specs/$(date +%F)-<slug>-design.md` with a mandatory
`## Decisions made for you` section (each entry: decision, alternatives
considered, why — write `None.` if empty) incorporating any Q/A from
`decisions.md`; self-review for placeholders, contradictions, scope creep,
and ambiguity in the same dispatch; commit the spec file (staged by name) on
the current branch (local `main`) as `docs: <slug> design spec (autopilot)`.

**Plan** (`specced → planned`). Brief instructs: REQUIRED SUB-SKILL
superpowers:writing-plans; read the spec; write
`docs/superpowers/plans/$(date +%F)-<slug>.md` decomposed into independent
tasks with complete code (no placeholders); run the writing-plans
self-review; commit as `docs: <slug> implementation plan (autopilot)`.

**Execute** (`planned → building (n/m)`). You are the SDD controller:
- First entry: verify open loop-PRs < 3 and re-run the overlap check against
  the plan's actual file list (it was estimated pre-spec) — on failure the
  item waits at `planned` (that is not `blocked`).
- `git checkout -b auto/<slug>` from local `main` (or check out the existing
  branch).
- One implementer subagent per plan task, sequential. Each `task-N-brief.md`
  embeds the plan task **verbatim** plus the § Brief template rules. TDD is
  mandatory for billing, RLS, and auth code; the implementer ticks its plan
  checkboxes and commits its own named files on the branch.
- After each report: PII/surprise scan via `git diff --stat main...HEAD`
  (the branch-relative diff catches multi-commit tasks, not just the last
  commit); note the new `building (n/m)` progress for Record — the
  `BACKLOG.md`/`status.md` edits themselves happen in Record, on `main`,
  never while on the item branch.
- Failed task dispatch → retry once fresh; second failure → `blocked`;
  return to `main` before Record runs (§ Record — any Execute exit, happy
  or not, returns to `main` first).

**Gate** (after the last task, on the branch — run it yourself, it is not a
dispatch):
```bash
pnpm lint && pnpm test && pnpm exec tsc --noEmit
```
plus `pnpm test:rls` if the branch touches `supabase/migrations/`, RLS
policies, or storage buckets (needs the local Supabase stack or
`RLS_TEST_DB_URL`; if neither is available, the item is `blocked` with
Q: « test:rls requis — démarrer le stack Supabase local ? »). Failures
consume the 3-attempt fix budget via fix dispatches.

**Code review** (`building → reviewing`). Write the diff to
`.superpowers/autopilot/<slug>/review-<base>..<head>.diff` via
`git diff main...auto/<slug>`; dispatch a reviewer subagent (read-only: diff
+ repo context → `review-report.md` with findings by severity). Blocking
findings → fix dispatches within the shared 3-attempt budget; then re-run
the gate.

**Security review.** Only when the diff touches auth, RLS, billing, data
access, or user-supplied input: dispatch a second reviewer focused on those
surfaces → `security-report.md`. Same fix budget.

**Ship the PR** (`reviewing → pr-open (#N)`).
```bash
git push -u origin auto/<slug>
gh pr create --title "<type>: <summary>" --body-file .superpowers/autopilot/<slug>/pr-body.md
```
Body per § PR body template. The pushed branch's diff against `origin/main`
carries the accumulated local-`main` doc commits (status/specs/plans) by
design — they merge cleanly by SHA — so reviewers shouldn't be surprised to
see them alongside the code diff. Move the item to PRs awaiting merge;
return to `main`.

## Migrations (staging only)

Written to `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql` on the item
branch. Apply to **staging only**:
```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```
(If DNS/IPv6 hangs, see the WSL2 gotcha: resolve with `getent ahostsv4` and
substitute the IP.) One retry on failure; then record « staging apply
failed: <error> — apply manually » as a merge-time step and continue. The
**prod** apply is always a listed merge-time step for Bjorn — never done here.

## Overlap check

Candidate item's expected touch-set = the `**Files:**` lists in its plan
(or spec); for an unspecced item, estimate conservatively from the one-liner
(when unsure, assume overlap). Open-PR touch-sets:
`gh pr list --state open --json number,headRefName,files`, keeping
`headRefName` starting `auto/`. Ignore always-shared doc paths
(`BACKLOG.md`, `docs/autopilot/status.md`, `docs/superpowers/**`) — those
are rebase-managed. Any other intersection → do not start the item.

## Maintenance menu (empty-queue fallback, pre-approved)

Self-queued as `[auto] <one-liner>` at the top of Queue, then claimed
normally. Max 1 `[auto]` item in flight. In order:

1. Split `actions/applications.ts` along trust lines (the standing CLAUDE.md
   tripwire — first candidate).
2. Test-coverage gaps in high-risk areas (billing, RLS matrix cases, auth
   flows).
3. Supabase advisor warnings (security + performance) — read-only advisor
   check, fixes via the normal pipeline.
4. Patch/minor dependency bumps (majors become a Queue **proposal** line for
   Bjorn, not built).
5. Accessibility / performance audit fixes.
6. Refactoring churn hotspots.
7. Docs accuracy passes (CLAUDE.md, DEPLOY.md, runbooks vs reality).

## Failure handling & resumability

- Every stage starts cold from files; never rely on conversation memory.
- Crashed/failed stage subagent → retry once fresh; second failure → item
  `blocked` with the failure notes in its work dir and a Q for Bjorn only if
  one exists (otherwise the Blocked line says what broke).
- Restart after reboot/kill: `/loop /autopilot` — Sync reconstructs reality.
- A dirty working tree at Sync you don't recognize, **other than
  `BACKLOG.md`** (which Sync always ingests — § 1. Sync) → don't touch it;
  note it in Watchouts and sleep long (Bjorn may be mid-edit).

## Brief template

```markdown
# Brief: <slug> — <stage>

You are a subagent executing ONE stage of the EazyExchange autopilot
pipeline. Work from files; do not ask questions — decide and flag (record
every judgment call in your report / the spec's "Decisions made for you").

## Ground rules (binding)
- Read CLAUDE.md first; all of it binds you.
- NEVER: push (any ref), merge, apply prod migrations, deploy edge
  functions, change Vercel config, send email.
- NEVER log or commit student/parent PII. Stage files by NAME
  (`git add <path> …`); `git add -A` and `git add .` are forbidden.
- Commit only what this brief says to commit, on the branch it names.
- Current branch: <main | auto/slug> — verify with `git branch --show-current`.

## Item
- Slug: <slug>
- One-liner: «<original queue line>»
- Prior artifacts: <spec / plan / decisions.md paths, as they exist>

## Your stage
<stage instructions from the Stage playbook, plus the verbatim plan task
for implementers>

## Report
Write `.superpowers/autopilot/<slug>/<stage>-report.md`: what you did,
files touched, commands run with real output, decisions made, anything a
reviewer should look at. Do not end without writing it.
```

## PR body template (`pr-body.md`)

```markdown
## Summary
<what changed and why, 3–6 lines, links to the spec and plan files>

## Decisions made for you
<condensed from the spec's section + any pipeline-time calls; « None. » if empty>

## Test evidence
- `pnpm lint` ✓ — `pnpm test` ✓ (<N> tests) — `pnpm exec tsc --noEmit` ✓
- `pnpm test:rls` ✓ (only if it ran)
- <manual verification, if any>

## Merge-time steps for Bjorn
<numbered list, e.g. « apply migration <version> to prod via MCP
apply_migration BEFORE merging », « set env var X in Vercel »; « None. » if
empty>

> Merge with a **merge commit** (not squash/rebase) — the loop's local
> `main` already contains these doc commits by SHA; squashing makes its next
> rebase conflict.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## status.md template (full rewrite each cycle)

```markdown
# Autopilot — status

_Last cycle: <YYYY-MM-DD HH:MM> — <one line: what this cycle did>_

## Needs Bjorn
- **Merge:** PR #<N> — <slug> — merge-time steps: <none | list>
- **Answer (BACKLOG.md → Blocked):** <slug> — Q: <question>
- <« Nothing. » when empty>

## In flight
- <slug> — <status> — next: <next stage>
- <« Nothing. » when empty>

## Queue
<N> item(s) queued — top: «<first Queue line>»

## Recent activity (last 10)
- <YYYY-MM-DD HH:MM> — <event>

## Watchouts
- <failed staging apply, branch left conflicted for merge-time, gate flakes,
  unrecognized dirty files — anything Bjorn should know. « None. »>
```
