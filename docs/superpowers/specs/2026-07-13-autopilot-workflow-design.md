# Autopilot — autonomous backlog pipeline (design)

**Date:** 2026-07-13
**Status:** Approved by Bjorn (brainstorm session)
**Goal:** An always-working, token-maximizing workflow: Bjorn feeds one-line items
into a living checklist; a local self-pacing loop takes each item through
brainstorm → spec → plan → build → review → PR, one at a time, with Bjorn only
merging and answering flagged questions.

## Locked decisions

| Question | Decision |
|---|---|
| Autonomy ceiling | **Up to PR; human merges.** The loop never touches `main` on origin or prod. |
| Runtime | **Local `/loop` session** on Bjorn's WSL box (started from a plain WSL terminal, not VS Code). |
| Product decisions mid-brainstorm | **Decide + flag.** Agent makes the most reasonable call, records every judgment in a "Decisions made for you" section; pipeline never stalls on questions. |
| Checklist home | **`BACKLOG.md` at repo root**, tracked in git. Bjorn appends one-liners; loop manages item state in the same file. |
| Empty queue | **Self-generate maintenance work** from a pre-approved menu, labeled `[auto]`, same pipeline. |
| PR pileup | **WIP cap of 3 open loop-PRs** + prefer non-overlapping items; at the cap (or when everything overlaps) work ahead on doc-only stages and the maintenance menu. |
| Architecture | **Thin orchestrator + fresh subagent per stage** (Approach B). Orchestrator context stays tiny; every handoff is a file. |

## 1. Components

| Piece | Location | Role |
|---|---|---|
| Living checklist | `BACKLOG.md` (repo root, tracked) | Source of truth: Bjorn's queue + loop-managed item states |
| Playbook skill | `.claude/skills/autopilot/SKILL.md` | Orchestrator rulebook; makes `/autopilot` invocable |
| Morning digest | `docs/autopilot/status.md` | Rewritten each cycle: PRs open, decisions flagged, blockers, last activity |
| Per-item work products | `docs/superpowers/specs/`, `docs/superpowers/plans/`, `.superpowers/autopilot/<item-slug>/` (briefs/reports/diffs) | Same SDD file-handoff discipline already in use |

Start command: `/loop /autopilot`. The session self-paces with ScheduleWakeup.
Killing the session loses nothing; restart is the same command — all state is on
disk.

## 2. BACKLOG.md format

Two ownership zones so Bjorn and the loop never edit the same lines:

```markdown
# Backlog

## Queue            <- Bjorn-owned: raw one-liners, top = highest priority
- students should see partner school info on their dashboard
- export all submissions as zip

## In progress      <- loop-owned: one structured block per claimed item
- [building 3/7] submissions-zip-export — spec: docs/superpowers/specs/2026-07-13-… — branch: auto/submissions-zip-export

## PRs awaiting merge
- [#12] partner-school-info — 2 decisions flagged — merge-time steps: none

## Blocked          <- loop-owned entries; Bjorn answers inline
- csv-import — Q: should import overwrite existing students or skip duplicates?

## Done             <- archive, newest first, with PR number and merge date
```

Rules:
- Bjorn only touches **Queue** (append / reorder / delete) and answers inline in
  **Blocked**. Anything else he wants changed, he tells a session.
- The loop claims the **top** Queue line, moves it to In progress with a slug,
  and owns it from there.
- Item statuses: `queued → brainstorming → specced → planned → building (n/m) →
  reviewing → pr-open (#N) → done`, plus `blocked` from any stage.
- Adding an item = appending a line from any terminal (`echo` / editor) or
  telling any Claude session "add X to the backlog."

## 3. Orchestrator cycle

The `/loop` session is a dispatcher; it never writes product code itself. Each
wakeup:

1. **Sync.** `git fetch origin`; rebase local `main` on `origin/main` (backlog
   commits rebase cleanly). Detect merged loop-PRs → move items to Done, delete
   local+remote branches. Ingest Blocked answers (an answered question unblocks
   the item back to its prior stage).
2. **Pick exactly one next action**, in priority order:
   1. Advance an in-progress item to its next stage.
   2. Else, if open loop-PRs < 3 **and** the top unclaimed Queue item does not
      overlap the files of open PRs → claim it and start brainstorming.
      (Overlap = the spec/plan's expected touch-set intersects an open PR's
      diff; when judging a not-yet-specced item, estimate conservatively.)
   3. Else, work ahead: brainstorm/spec/plan future Queue items (doc-only,
      conflict-free). Specs and plans always commit to local `main`; the
      item's `auto/<slug>` branch is created only when execution starts.
   4. Else, pull the next maintenance-menu item (§6).
3. **Dispatch the stage** to a fresh subagent with a written brief in
   `.superpowers/autopilot/<slug>/`. One code-writing agent at a time, ever.
4. **Record.** Update `BACKLOG.md` + `docs/autopilot/status.md`; commit locally
   on `main` (backlog/status/spec/plan docs) or on the item branch (code).
5. **Sleep.** ScheduleWakeup: near-immediate continuation while work remains;
   long heartbeat (≥20 min) when everything is waiting on Bjorn; long delay on
   rate limiting.

## 4. Per-item pipeline

Mirrors `docs/WORKFLOW.md`, with Bjorn's interactive role replaced by
decide-and-flag:

1. **Brainstorm → spec** (fresh subagent). Explores the codebase, writes
   `docs/superpowers/specs/<date>-<slug>-design.md`. Every product judgment goes
   in a mandatory **"Decisions made for you"** section (decision, alternatives,
   why). Spec self-review (placeholders, contradictions, scope, ambiguity)
   happens in the same dispatch.
2. **Plan** (fresh subagent, writing-plans conventions) →
   `docs/superpowers/plans/<date>-<slug>.md`, decomposed into independent tasks.
3. **Execute** task-by-task: one fresh implementer subagent per task, brief +
   report files, cheapest capable model per task. TDD is mandatory for billing,
   RLS, and auth code. Implementers stage **only named files** (never
   `git add -A` — PII rule).
4. **Gate:** `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`; plus
   `pnpm test:rls` if migrations/RLS/storage touched.
5. **Code review** subagent on the branch diff; findings fixed (or item blocked
   if unfixable in the retry budget).
6. **Security review** for any diff touching auth, RLS, billing, data access,
   or user-supplied input.
7. **Ship the PR:** push the `auto/<slug>` branch, open a PR whose body has:
   summary, *Decisions made for you*, test evidence, and **Merge-time steps for
   Bjorn** (e.g. "apply migration `<version>` to prod via MCP `apply_migration`
   before merging", "set env var X"). Item → `pr-open`.

Migrations: written to `supabase/migrations/` and applied to **staging only**
(`.env.staging` flow). Prod apply is always a listed merge-time step, done by
Bjorn in a supervised session per the CLAUDE.md canonical workflow.

## 5. Hard guardrails (never, under any circumstances)

- Merge to `main`, push to `origin main`, or otherwise trigger a prod deploy.
  Backlog/status/spec commits on local `main` stay **local-only** until Bjorn's
  own pushes carry them.
- Apply migrations to prod, deploy edge functions, modify Vercel env/config, or
  cause real email to be sent.
- Exceed **3 fix attempts** on a failing gate/review finding — then mark the
  item `blocked` with notes and move on.
- Run two code-writing agents concurrently, or start an item whose files
  overlap an open loop-PR.
- Log or commit student/parent PII (existing CLAUDE.md rules bind all
  subagents; implementer briefs restate the named-files-only staging rule).

## 6. Maintenance menu (pre-approved, empty-queue fallback)

Self-generated items labeled `[auto]`, same full pipeline, **max 1 in flight**:

1. Split `actions/applications.ts` along trust lines (the standing CLAUDE.md
   tripwire — first candidate).
2. Test-coverage gaps in high-risk areas (billing, RLS matrix cases, auth
   flows).
3. Supabase advisor warnings (security + performance).
4. Patch/minor dependency bumps (majors go to Queue as a proposal, not built).
5. Accessibility / performance audit fixes.
6. Refactoring churn hotspots.
7. Docs accuracy passes (CLAUDE.md, DEPLOY.md, runbooks vs reality).

## 7. Bjorn's daily ritual (~10 min)

- **Morning:** read `docs/autopilot/status.md` → review/merge PRs on GitHub
  (CI runs unit → rls → deploy) → run listed merge-time steps in a supervised
  session → answer Blocked questions inline in `BACKLOG.md`.
- **Anytime:** append Queue lines; reorder to reprioritize.
- The loop notices merges and answers on its next sync — no need to tell it.

## 8. Failure handling & resumability

- Every stage starts cold from files; the orchestrator's context is disposable.
- Crashed/failed stage subagent → retry once fresh; second failure → item
  `blocked` with the failure notes.
- Machine reboot / session killed → restart with `/loop /autopilot`; the sync
  step reconstructs reality (git state + BACKLOG.md are the truth).
- Rate limits → ScheduleWakeup with a long delay. This is also the natural
  100 %-of-budget regulator: the loop works until the harness throttles it.
- If `BACKLOG.md` is mid-edit by Bjorn (merge conflict on rebase), the loop
  resolves in favor of Bjorn's Queue/Blocked edits, always.

## 9. Deliverables

1. `BACKLOG.md` seeded with known open threads (tripwire split, deferred
   organizer 2FA, LandingNav focus management, reminder apostrophe assertions,
   bulk-accept batching, and anything else Bjorn adds).
2. `.claude/skills/autopilot/SKILL.md` — the playbook: cycle algorithm, stage
   brief templates, guardrails, PR-body template, status.md template.
3. `docs/autopilot/status.md` initial template + a short CLAUDE.md pointer
   section.
4. **Supervised dry run:** one trivial seeded item end-to-end while Bjorn
   watches — verify: item claimed, spec+plan written, branch built, gate green,
   PR opened, `BACKLOG.md`/status updated, zero pushes to `main`.

## Out of scope (explicitly)

- Cloud/scheduled agents, phone-based item entry, GitHub-issues mirroring.
- Auto-merge of any tier of change.
- Parallel implementation of multiple items.
- Changes to the CI deploy pipeline (a docs-only `paths-ignore` optimization
  was considered and deferred — backlog commits stay local, so CI never sees
  them anyway).
