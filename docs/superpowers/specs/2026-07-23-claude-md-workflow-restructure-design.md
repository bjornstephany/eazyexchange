# CLAUDE.md workflow restructure — design

**Date:** 2026-07-23
**Status:** Approved (brainstorm), pending implementation
**Owner:** Bjorn

## Problem

`CLAUDE.md` (193 lines, always loaded every turn) has drifted from an *instruction
set* into a *knowledge base*. Two concrete pains:

1. **Token cost.** ~120 of 193 lines are middle-section procedural/runbook content
   loaded on every turn even when irrelevant.
2. **The workflow rules don't teach Bjorn.** Three sections were accreted by past
   agents in machine-to-machine prose, so Bjorn — who runs parallel Claude sessions
   as his *default* — does not fully own the rules he depends on daily:
   - **Git: `main` vs branch**
   - **Parallel sessions / worktrees**
   - **Migrations / staging**

   (The brainstorm→spec→plan→execute lifecycle is *not* murky and is out of scope.)

A compounding bug: **CLAUDE.md contradicts itself.** "Git Workflow" says *small safe
changes → straight to `main`*; "Parallel Sessions" then says *no exceptions —
everything gets a worktree, including one-line copy fixes.* The first rule a reader
hits is cancelled 30 lines later.

## Goals

- Shrink the always-loaded `CLAUDE.md`, most on git + worktrees.
- Give the three murky topics a **human-first home** written to teach Bjorn.
- Keep every **binding, must-follow-every-session rule** inline in `CLAUDE.md` so
  agents still obey without needing to fetch a linked doc.
- Resolve the `main`-vs-branch contradiction with one true rule.

## Non-goals

- No change to the brainstorm→spec→plan→execute lifecycle (already owned).
- No change to "Session & Token Hygiene" (the `/clear` stage-boundary rule stays in
  `CLAUDE.md` — agents need it in-context).
- No new second doc (rejected approach B) and no in-place-only rewrite (rejected
  approach C).
- No relocation of the other Gotchas/ops content in this pass (e.g. the Google OAuth
  setup essay). Possible future cleanup, explicitly deferred.

## Approach (A): extend `docs/WORKFLOW.md`

`docs/WORKFLOW.md` already exists and already models the exact voice we want:
human-first prose with a "Why this exists" section. Today it covers only the skill
loop and **is not even linked from `CLAUDE.md`.** We make it Bjorn's single
"how development works here" doc.

### Dividing principle (per topic)

- **`CLAUDE.md` keeps** the imperative, must-follow lines and any procedure an agent
  actually executes (worktree steps, migration steps) — **stripped of rationale
  prose.** Terse.
- **`docs/WORKFLOW.md` gains** the *why* and the mental model, in its existing voice.

### What moves

| Topic | Stays in `CLAUDE.md` (terse rules) | Moves to `WORKFLOW.md` (the *why*) |
|---|---|---|
| **Git `main` vs branch** | One rule: all work on a branch in a worktree, `main` is merge-only; auto-commit once tested; never push broken to `main`; confirm branch before every commit | Why `main` is sacred (auto-deploys to prod); why even one-liners branch (parallel-session entanglement); when you merge |
| **Worktrees** | The numbered procedure only: `EnterWorktree` → fix 2 warts (`git branch -m`, `git merge --ff-only main`) → `pnpm wt` → work/verify/merge → `ExitWorktree`; never `git add -A`/`git add .`; `supabase/migrations/` is single-writer; re-run a single failing test before debugging (neighbour race) | What a worktree is and protects against (two sessions in one dir entangle branches → reflog archaeology); why the two warts exist; the mental picture of N sessions in N dirs; why `.claude/worktrees/` is gitignored/excluded |
| **Migrations / staging** | The canonical numbered steps (write local → MCP `apply_migration` → reconcile ledger version → regen types → drift check); never `db push` against prod; staging-first apply command | Why prod's ledger is the source of truth (MCP stamps its own timestamps); why staging-first prevents mysterious preview breakage; the two-Supabase-project model |

### The one policy change (resolves the contradiction)

Affirm the branch-always rule as the single truth and **delete the "small safe
changes → straight to `main`" shortcut** from the Git Workflow section:

> **All work happens on a branch in a worktree. Nothing commits directly to `main`.
> `main` is merge-only.**

This matches what "Parallel Sessions" already mandated and what Bjorn does in
practice (parallel sessions are his default). No escape hatch for trivial fixes —
confirmed by Bjorn.

### Resulting `WORKFLOW.md` shape

```
# Development Workflow  (the one "how I work here" doc)
## The loop                       ← existing skill loop (unchanged)
## Git & main                     ← NEW
## Parallel sessions & worktrees  ← NEW
## Migrations & staging           ← NEW
## Quick reference                ← existing (unchanged)
## Why this exists                ← existing (unchanged)
```

### Cross-linking

- Add the missing **`CLAUDE.md` → `docs/WORKFLOW.md`** pointer (today there is none),
  placed so agents and Bjorn both find it. Each slimmed section ends with a
  "Rationale & full mental model: `docs/WORKFLOW.md#<anchor>`" pointer.
- Update `WORKFLOW.md`'s intro so it reads as the single workflow doc, not only the
  skill loop.

## Risks & mitigations

- **Agents skip the linked doc and miss a rule.** Mitigated by keeping every *binding*
  rule and *executable procedure* inline in `CLAUDE.md`; only rationale/mental-model
  prose moves. The doc is for understanding, never the sole home of a rule.
- **Drift between the two files.** Mitigated by a clean split: `CLAUDE.md` = rules,
  `WORKFLOW.md` = why. A rule change touches `CLAUDE.md`; a *why* rarely changes.

## Acceptance criteria

- [ ] `CLAUDE.md` is shorter, most visibly in the git + worktree sections; all binding
      rules and executable steps for the three topics remain present and terse.
- [ ] The `main`-vs-branch contradiction is gone; exactly one rule states it.
- [ ] `docs/WORKFLOW.md` has three new human-first sections (Git & main; Parallel
      sessions & worktrees; Migrations & staging) in its existing voice.
- [ ] `CLAUDE.md` links to `docs/WORKFLOW.md`; each slimmed section points to its
      rationale anchor.
- [ ] No content is *lost* — every fact either stays (as a rule) or moves (as *why*).
- [ ] Docs-only change: `pnpm lint`/`pnpm test`/`pnpm build` unaffected (no code
      touched); nothing to run beyond confirming the diff.
