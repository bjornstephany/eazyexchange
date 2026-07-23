# Development Workflow

The one "how development works here" doc. It covers the per-feature skill loop,
plus the three things that are easy to get wrong when you work solo and
auto-deploy: how `main` works, how parallel sessions stay out of each other's
way, and how schema migrations reach both Supabase projects safely.

`main` auto-deploys to production on Vercel, so the discipline here is what keeps
prod safe while working solo. `CLAUDE.md` carries the terse, must-follow version
of every rule below; this doc carries the *why*.

Run the loop with Claude Code. Each step maps to a skill (`/<skill-name>`).

## The loop

1. **Brainstorm — `/brainstorm`**
   Before any code exists. Pull requirements and design decisions out of your
   head and pressure-test them. This is the cheapest place to change your mind
   (e.g. pricing model, data shape, what's in/out of scope).

2. **Plan — `/writing-plans`** (then `/executing-plans` to run it)
   Turn the agreed design into a written, reviewable implementation plan. Approve
   the plan before code is written. Changing a plan is cheap; unwinding code isn't.

3. **Build with TDD — `/test-driven-development` (via `/feature-dev`)**
   Write the test first, watch it fail, then implement. **Mandatory for money
   code (billing) and security code (RLS, auth).** These are the bugs that cost
   real money or leak minors' data.

4. **Self-review — `/code-review ultra`**
   Deep multi-agent cloud review of the branch. Catch mistakes before they reach
   `main`. Use plain `/code-review` for smaller diffs.

5. **Security review — `/security-review`**
   Run on anything touching auth, data access, payments, or user-supplied input.
   Non-negotiable before merging features that handle student/parent PII.

6. **Verify it actually works — `/verify` / `/run`**
   Confirm the feature works in the running app (Chrome DevTools MCP), not just
   that it compiles or that tests pass.

7. **Merge.** Only after lint + test + type-check are green. A git `pre-push`
   hook (`.git/hooks/pre-push`) enforces this automatically: it runs
   `pnpm lint && pnpm test && pnpm exec tsc --noEmit` and aborts the push on
   failure. Emergency override: `git push --no-verify`. The full `pnpm build`
   runs on Vercel at deploy (a failed build leaves prod on the last good one).

   > The git hook lives in `.git/hooks/` and is **not** committed. If you want
   > it versioned/shared, move it to a tracked path and run
   > `git config core.hooksPath <dir>`, or adopt Husky.

## Git & main

`main` is sacred: Vercel deploys every push to it straight to production. There's
no staging gate on `main` and no reviewer but you — a broken commit on `main` is a
broken production site. That single fact drives the whole rule:

**All work happens on a branch in a worktree. Nothing commits directly to `main`;
`main` is merge-only.**

You might expect an escape hatch for trivial changes — a one-line copy fix surely
doesn't need its own branch. It does, and the reason is parallel sessions (next
section), not risk: you routinely run several Claude sessions at once, and two of
them committing to `main` from the same directory entangle each other's history.
So even the one-liners branch; they just merge the same day. (This is why the old
"small safe changes → straight to `main`" shortcut is gone — it contradicted the
branch-always rule the parallel-session setup actually requires.)

When do you merge? Once the change is finished, tested (lint + tests green — the
`pre-push` hook enforces this), and — for anything non-trivial — you've watched it
work. Claude auto-commits to the branch as soon as the work is done and tested; the
*merge to `main`* is the gated step that needs the green suite and your go-ahead.

## Parallel sessions & worktrees

Running several Claude sessions at once is your default, not an edge case. The
hazard is that a plain checkout has one working directory and one `HEAD`: two
sessions sharing it fight over which branch is checked out and whose changes are
staged. When that goes wrong the recovery is reflog archaeology — reconstructing
lost commits by hash. Not worth it.

A **git worktree** is a second working directory attached to the same repository,
with its own branch and its own `HEAD`. Give every session its own worktree and the
mental picture goes clean: N sessions, N directories, N branches, zero collisions.
That's the whole point — isolation comes from the worktree, not from starting a
fresh session, so the session that starts a piece of work keeps it and just moves
itself into a worktree.

`EnterWorktree` does the setup but leaves two warts, which is why `CLAUDE.md` has
you fix them by hand:

- It names the branch `worktree-feature+<slug>` instead of `feature/<slug>`, so you
  rename it (`git branch -m`).
- It branches off `origin/main`, not your local `main` — so any commit you made
  locally but haven't pushed is missing until you `git merge --ff-only main`.

Worktrees live under `.claude/worktrees/`, which is gitignored and excluded from
`tsconfig.json` and `vitest.config.ts`. That's deliberate: a sibling worktree's
files can never be staged into your branch by accident, nor swept into another
worktree's test run. `EnterWorktree` also refuses to nest, so a session physically
cannot end up two worktrees deep. The day-to-day upshot: a test that fails once and
passes on re-run, or an import that resolves nowhere, is almost always a neighbour
mid-write — re-run the single file before you debug it.

## Migrations & staging

There are two Supabase projects. **Production** holds real data. **Staging**
(`eazyexchange-staging`) backs every Vercel Preview deployment, so previews
physically cannot touch prod data. A schema change has to land in both, and the
order and mechanism matter.

**Prod's migration ledger is the source of truth for versions.** When you apply a
migration through the Supabase MCP `apply_migration` tool, it stamps its *own*
timestamp rather than trusting your filename — so the version recorded in prod can
differ from the `<YYYYMMDDHHMMSS>` in your local filename. That's why the workflow
has you check `list_migrations` and `git mv` the file to match: you're reconciling
your local copy to the ledger, never the other way round. It's also why
`supabase db push` against prod is banned — it would try to re-apply already-applied
migrations under the drifted versions and make a mess.

**Staging gets the migration first** (`supabase db push` against the staging DB),
and only then does prod get it via MCP. Skip the staging apply and previews break in
ways that look unrelated to the migration: the schema the preview app expects has
drifted from the schema the staging DB actually has. Applying staging-first keeps
them in lockstep.

## Quick reference

| Situation | Skill |
|---|---|
| New feature, fresh idea | `/brainstorm` → `/writing-plans` |
| Implement an approved plan | `/feature-dev` / `/executing-plans` |
| Billing / RLS / auth code | `/test-driven-development` first |
| Hit a bug | `/systematic-debugging` |
| New UI | `/frontend-design` |
| Before merge | `/code-review ultra` → `/security-review` → `/verify` |

## Why this exists

Solo + auto-deploy means there's no second pair of eyes and no staging gate
except this loop. The skills are the second pair of eyes.
