# Development Workflow — the per-feature skill loop

This is the standard loop for shipping any non-trivial change to EazyExchange,
especially **paid features, auth, RLS, and billing**. `main` auto-deploys to
production on Vercel, so the discipline here is what keeps prod safe while
working solo.

Run it with Claude Code. Each step maps to a skill (`/<skill-name>`).

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
