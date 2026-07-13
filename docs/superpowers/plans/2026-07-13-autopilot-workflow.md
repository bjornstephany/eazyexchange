# Autopilot Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the autonomous backlog pipeline — a seeded `BACKLOG.md`, the `/autopilot` orchestrator playbook skill, the status-digest template, a CLAUDE.md pointer — then prove it with one supervised dry run that ends in an open PR and zero pushes to `main`.

**Architecture:** Everything is documents. The orchestrator is a project skill (`.claude/skills/autopilot/SKILL.md`) invoked by `/loop /autopilot`; it dispatches fresh subagents per stage and keeps all state in `BACKLOG.md`, `docs/autopilot/status.md`, and `.superpowers/autopilot/<slug>/` (already gitignored). Tasks 1–3 are pure transcription of content locked in this plan; Task 4 is the supervised end-to-end dry run with Bjorn watching.

**Tech Stack:** Markdown, git, `gh` CLI (authenticated as bjornstephany), Claude Code Agent/ScheduleWakeup tools. No product code, no dependencies, no migrations.

**Spec:** `docs/superpowers/specs/2026-07-13-autopilot-workflow-design.md`

## Global Constraints

- All commits in Tasks 1–3 go to **local `main`** and are **never pushed** (Bjorn pushes; this matches the spec's "backlog/status/spec commits stay local-only" rule and the repo's docs-to-main workflow).
- Stage files **by name** (`git add <path> …`); never `git add -A` / `git add .`. `docs/exampleSchoolFiles/` is untracked in the working tree and must NOT be swept into any commit (potential PII).
- File-content code blocks in Tasks 1–3 are **verbatim deliverables** — transcribe exactly, including French guillemets and accents. Do not "improve" wording.
- Exact paths: `BACKLOG.md` (repo root), `.claude/skills/autopilot/SKILL.md`, `docs/autopilot/status.md`.
- Package manager is **pnpm**. `pnpm build` fails locally (placeholder `.env.local`) — never use it as a check here.
- Task 4 requires Bjorn at the keyboard in a **plain WSL terminal** (not VS Code); it cannot be dispatched to a subagent.

### Decisions made at plan time (not explicit in the spec — flag to Bjorn)

1. **Track the skill in git.** `.gitignore` currently ignores all of `.claude/`; Task 2 narrows it to `.claude/*` + `!.claude/skills/` so the playbook is versioned, reviewable, and survives a fresh clone. Settings, hooks, and local config stay ignored.
2. **Open loop-PR branches are rebased onto refreshed local `main` (with `--force-with-lease`) whenever `origin/main` moves.** Branches are cut from local `main`, so they carry the spec/plan/backlog doc commits; without this rebase, the first merged PR makes every other open PR conflict on `BACKLOG.md`.
3. **Loop PRs must be merged with a merge commit, not squash/rebase** (stated in the PR-body template). Squash rewrites the doc commits that local `main` already has, making the next sync-rebase conflict.
4. **Blocked answer convention:** Bjorn answers with an indented `- A: …` line under the question line — deterministic to parse, impossible to collide with loop edits.
5. **`status.md` is derived state:** rewritten every cycle, but uncommitted changes to it are discarded before rebase and it is only committed alongside real state changes — otherwise every cycle mints a noise commit that later rides PRs onto origin.
6. **Staging-migration apply failure does not block an item** (staging has known ledger drift): after 1 retry, the failure is recorded as a prominent merge-time step in the PR body instead.
7. **Dry-run item = the reminder-apostrophe test assertions** (UI-polish leftover): test-only, no migration, no UI — the cheapest change that still exercises claim → spec → plan → branch → gate → PR. It is seeded at the top of Queue.

---

### Task 1: Seed `BACKLOG.md`

**Files:**
- Create: `BACKLOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the section headings (`## Queue`, `## In progress`, `## PRs awaiting merge`, `## Blocked`, `## Done`) and line grammar that `SKILL.md` (Task 2) parses. Heading text must match Task 2 exactly.

- [ ] **Step 1: Write the file**

Create `BACKLOG.md` at the repo root with exactly this content:

```markdown
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
```

- [ ] **Step 2: Verify structure**

Run:

```bash
grep -c '^## ' BACKLOG.md && grep -n '^## ' BACKLOG.md
```

Expected: `5` and the five headings in order: `Queue`, `In progress`, `PRs awaiting merge`, `Blocked`, `Done`.

- [ ] **Step 3: Commit**

```bash
git add BACKLOG.md
git commit -m "docs: seed BACKLOG.md for the autopilot loop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: The `/autopilot` playbook skill (+ gitignore exception)

**Files:**
- Modify: `.gitignore` (the `# Claude Code local config` block, currently `.claude/` at line ~35)
- Create: `.claude/skills/autopilot/SKILL.md`

**Interfaces:**
- Consumes: `BACKLOG.md` headings and line grammar from Task 1 (verbatim match).
- Produces: the `status.md` template that Task 3's initial file must instantiate field-for-field; the `/autopilot` invocation Task 4 exercises.

- [ ] **Step 1: Narrow the `.claude/` gitignore rule**

In `.gitignore`, replace:

```
# Claude Code local config
.claude/
```

with:

```
# Claude Code local config (skills are tracked; everything else stays local)
.claude/*
!.claude/skills/
```

- [ ] **Step 2: Verify ignore behavior flips correctly**

Run:

```bash
mkdir -p .claude/skills/autopilot
git check-ignore .claude/settings.json && echo "settings still ignored (good)"
git check-ignore .claude/skills/autopilot/SKILL.md || echo "skills tracked (good)"
```

Expected: both `(good)` lines print. If `settings.json` is NOT ignored or `SKILL.md` IS ignored, stop and fix the pattern before continuing.

- [ ] **Step 3: Write `.claude/skills/autopilot/SKILL.md`**

Exactly this content:

````markdown
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
   after every implementer dispatch, scan `git diff --stat HEAD~1` for
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
git fetch origin
git rebase origin/main
```

- If the rebase conflicts on `BACKLOG.md`: resolve by hand — Bjorn's Queue
  and Blocked lines win verbatim; your own loop-owned sections win for the
  rest — then `git add BACKLOG.md && git rebase --continue`.
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
- After each report: PII/surprise scan via `git diff --stat HEAD~1`; update
  `building (n/m)`.
- Failed task dispatch → retry once fresh; second failure → `blocked`.

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
Body per § PR body template. Move the item to PRs awaiting merge; return to
`main`.

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
- A dirty working tree at Sync that you don't recognize → don't touch it;
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

## Queue
<N> item(s) queued — top: «<first Queue line>»

## Recent activity (last 10)
- <YYYY-MM-DD HH:MM> — <event>

## Watchouts
- <failed staging apply, branch left conflicted for merge-time, gate flakes,
  unrecognized dirty files — anything Bjorn should know. « None. »>
```
````

- [ ] **Step 4: Verify frontmatter and internal consistency**

Run:

```bash
head -4 .claude/skills/autopilot/SKILL.md
grep -c '## Queue\|## In progress\|## PRs awaiting merge\|## Blocked\|## Done' .claude/skills/autopilot/SKILL.md
grep -n 'apply_migration\|force-with-lease\|run_in_background' .claude/skills/autopilot/SKILL.md | head
```

Expected: frontmatter opens with `---` / `name: autopilot`; the five BACKLOG heading names all appear (count ≥ 1 each — combined grep -c ≥ 2); the three key mechanics appear. Then cross-check by eye: every file path mentioned in SKILL.md is either created by this plan (`BACKLOG.md`, `docs/autopilot/status.md`) or already exists (`CLAUDE.md`, `docs/superpowers/specs/2026-07-13-autopilot-workflow-design.md`, `.env.staging` is local-only by design).

- [ ] **Step 5: Commit**

```bash
git add .gitignore .claude/skills/autopilot/SKILL.md
git commit -m "feat: autopilot orchestrator playbook skill

Tracks .claude/skills/ in git (rest of .claude/ stays ignored).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Initial `docs/autopilot/status.md` + CLAUDE.md pointer

**Files:**
- Create: `docs/autopilot/status.md`
- Modify: `CLAUDE.md` (insert a new section between `## Git Workflow (solo project)` and `## Session & Token Hygiene (multi-stage features)`)

**Interfaces:**
- Consumes: the status.md template from Task 2 (this file is its empty-state instantiation — same headings, same order).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the initial status file**

Create `docs/autopilot/status.md` with exactly:

```markdown
# Autopilot — status

_Last cycle: never — the loop has not run yet. Start it with `/loop /autopilot`._

## Needs Bjorn
- « Nothing. »

## In flight
- « Nothing. »

## Queue
5 item(s) queued — top: «add unit-test assertions locking the French apostrophes (’) in the reminder email copy (UI-polish leftover)»

## Recent activity (last 10)
- 2026-07-13 — autopilot installed (BACKLOG.md seeded, playbook committed); no cycle has run

## Watchouts
- « None. »
```

- [ ] **Step 2: Add the CLAUDE.md pointer section**

In `CLAUDE.md`, directly **after** the `## Git Workflow (solo project)` section (i.e. immediately before the `## Session & Token Hygiene (multi-stage features)` heading), insert:

```markdown
## Autopilot (autonomous backlog loop)

`/loop /autopilot` (playbook: `.claude/skills/autopilot/SKILL.md`) works
`BACKLOG.md` items through brainstorm → spec → plan → build → review → PR,
one at a time. Autonomy stops at the PR: the loop never pushes or merges
`main` and never touches prod (no prod migrations, edge-function deploys,
Vercel config, or real email). Bjorn's touchpoints: append one-liners to the
**Queue** section of `BACKLOG.md`, answer **Blocked** questions inline
(`- A: …`), read `docs/autopilot/status.md`, merge PRs **with a merge
commit** and run their listed merge-time steps. Any session asked to « add X
to the backlog » just appends one line to Queue. All hard guardrails live in
the skill file and bind every session and subagent.

```

(Keep one blank line before the next `##` heading.)

- [ ] **Step 3: Verify placement and repo health**

Run:

```bash
grep -n '^## ' CLAUDE.md | sed -n '/Git Workflow/,/Session & Token/p'
pnpm lint && pnpm test
```

Expected: the three headings appear consecutively — `Git Workflow (solo project)`, `Autopilot (autonomous backlog loop)`, `Session & Token Hygiene (multi-stage features)` — and lint + tests pass (markdown-only change; this is the green-baseline check before the dry run).

- [ ] **Step 4: Commit**

```bash
git add docs/autopilot/status.md CLAUDE.md
git commit -m "docs: autopilot status digest + CLAUDE.md pointer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Supervised dry run (Bjorn at the keyboard)

**Files:**
- No files authored by this task; it exercises everything from Tasks 1–3. The loop itself will create a spec, a plan, a branch `auto/<slug>`, and a PR for the top Queue item (the reminder-apostrophe assertions).

**Interfaces:**
- Consumes: `/autopilot` skill, seeded `BACKLOG.md`, initial `status.md`.
- Produces: the verified go/no-go for unattended operation.

This task is **manual and supervised** — it cannot be dispatched to a subagent. Skills are discovered at session start, so it must run in a **fresh** Claude Code session.

- [ ] **Step 1: Record the pre-run baseline**

In a plain WSL terminal (not VS Code):

```bash
cd ~/eazyexchange
git rev-parse origin/main > /tmp/autopilot-dryrun-baseline
git status --short
```

Expected: `git status` shows only `?? docs/exampleSchoolFiles/` (or clean). Note the baseline SHA.

- [ ] **Step 2: Start the loop**

```bash
claude
```

then in the session: `/loop /autopilot`. Confirm the session announces the autopilot skill (if `/autopilot` is not found, the skill file's location or frontmatter is wrong — stop and fix Task 2).

- [ ] **Step 3: Watch the pipeline end-to-end**

Let it run, intervening only if a guardrail is about to break. Check off as each happens:

- Cycle 1 syncs, claims the apostrophe item (line leaves Queue, appears In progress as `[brainstorming]`), and dispatches the spec subagent.
- Spec lands at `docs/superpowers/specs/2026-07-13-<slug>-design.md` (committed on local `main`) with a `## Decisions made for you` section.
- Plan lands at `docs/superpowers/plans/<date>-<slug>.md`, item → `[planned]`.
- Branch `auto/<slug>` created; implementer commits appear on it; item → `[building n/m]`.
- Gate runs green (`pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`; no `test:rls` — no migration in this item).
- Review report written; PR opened; `BACKLOG.md` shows the item under PRs awaiting merge; `docs/autopilot/status.md` rewritten with the PR under "Needs Bjorn".

- [ ] **Step 4: Verify the guardrails held**

In a second terminal:

```bash
git rev-parse origin/main; cat /tmp/autopilot-dryrun-baseline
git log --oneline origin/main..main | head -20
gh pr list --state open --json number,headRefName,title
```

Expected: `origin/main` SHA **identical** to the baseline (zero pushes to main); the local-only commits are docs/backlog/status/spec/plan plus nothing unexpected; exactly one open PR from `auto/<slug>` whose body has all four sections (Summary / Decisions made for you / Test evidence / Merge-time steps) and the merge-commit note.

- [ ] **Step 5: Merge and confirm the loop notices**

Bjorn reviews the PR on GitHub (CI: unit → rls → deploy) and merges it **with a merge commit** (merge-time steps: none for this item). Then let the loop's next wakeup run its sync, and verify: item moved to Done with PR number and date, local + remote `auto/<slug>` branches deleted, status.md updated. `Ctrl+C` the session when satisfied — restarting later with `/loop /autopilot` must lose nothing.

- [ ] **Step 6: Record the outcome**

If any step failed, fix the playbook (edit `SKILL.md`, commit as `fix: autopilot playbook — <what>`) and re-run from Step 2. When all checks pass, the pipeline is cleared for unattended use; Bjorn's ritual is § 7 of the spec (morning: status.md → merge PRs → merge-time steps → answer Blocked; anytime: append to Queue).
