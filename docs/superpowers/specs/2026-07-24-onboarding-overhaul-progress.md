# Onboarding overhaul — progress ledger

**Branch:** `feature/onboarding-overhaul` (worktree
`.claude/worktrees/feature+onboarding-overhaul`, dev port 3293)
**Spec:** `docs/superpowers/specs/2026-07-24-onboarding-overhaul-design.md`
**Plan:** `docs/superpowers/plans/2026-07-24-onboarding-overhaul.md`
**Execution mode:** subagent-driven (one fresh subagent per task, review between)

## Task status

| # | Task | Status |
|---|---|---|
| 1 | Reproduce the blank tab and the « Continuer » flash | not started |
| 2 | Migration — three acceptance-email columns | not started |
| 3 | `good-news-fields` pure module | not started |
| 4 | `saveProgramDetails` persists the three columns | not started |
| 5 | Réglages → Programme edits the acceptance-email values | not started |
| 6 | Onboarding draft module | not started |
| 7 | Shrink `first-exchange` to the required fields | not started |
| 8 | `completeFirstExchange` derives, then redirects | not started |
| 9 | `OnboardingForm` — two steps, live date check, draft | not started |
| 10 | Entry and exit redirects | not started |
| 11 | Full gate, staging verification, manual steps | not started |

Update this table as each task lands. Nothing here depends on conversation
history — the plan carries complete code for every task.

## Blocked on Bjorn

- **Task 1, Step 1** needs one Management-API read that the classifier blocks the
  agent from issuing. Bjorn runs it with the `!` prefix; the exact command is in
  the plan. Everything else in Task 1 runs against staging unattended.

## Ordering constraints

- Task 1 before Tasks 8 and 10 (both read its findings file).
- Task 2 before Tasks 4 and 5 (columns must exist).
- Task 7 before Tasks 8 and 9 (they consume the shrunk types).
- Tasks 3 and 6 are independent — they can go any time.

## Boundaries with parallel sessions

- `app/(organizer)/applications/**` — another session. This branch only changes
  what redirects to it.
- `lib/good-news-template.ts` and the good-news half of `lib/email.ts` — another
  session owns the template and the never-send-with-blanks guard. This branch
  gives them `missingGoodNewsFields` (Task 3) and stops there.
- `claim_school` / `school_registry` — merged 2026-07-24 (`13d0abc`). Read only.

## Not yet done, do not forget

- Merging to `main` needs the full gate green **and** Bjorn's confirmation.
- Task 11 records the Supabase email-template change, if Task 1 finds one is
  needed — that is a dashboard step only Bjorn can apply.
