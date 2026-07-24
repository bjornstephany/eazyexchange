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
| 2 | Migration — three acceptance-email columns | **done** (`782d542`) |
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

## Task 2 notes (recovered after an OOM crash mid-implementer)

The first execution session was killed while the Task 2 implementer was
running. Triage on resume found its work complete but uncommitted:

- Migration `20260724141437_acceptance_email_details.sql` was **already applied
  to both staging and prod** — verified in prod's MCP `list_migrations` and in
  staging's `supabase_migrations.schema_migrations`, and the three columns are
  present in staging's `information_schema.columns`. **Do not re-apply.**
- `types/supabase.ts` had lost its whole `graphql_public` block. That is
  **faithful** MCP output, not a truncated write: a fresh
  `generate_typescript_types` call returns the same shape (the tool emits the
  `public` schema only now, and drops `graphql_public` from `Constants` too).
  The file ends cleanly and `npx tsc --noEmit` exits 0.
- The regenerated types deliberately **do not** contain
  `communication_events` — the regeneration predates the sibling session's
  `20260724151343` migration, and that table belongs to their branch's own
  regeneration. Do not pull it in here.
- RLS matrix against staging: 152 green (148 + 4 in a re-run of
  `audit-log.test.ts`, whose worker timed out at startup the first time — a
  transient, it passes alone). All four new acceptance-email cases verified
  passing by name.
- `components/settings/__tests__/ProgramDetailsCard.test.tsx` needed the three
  new keys in its fixture to satisfy the widened `Row` type; that one-file
  change rode along in Task 2's commit so the tree compiles at every commit.
  Task 5 extends the same file further.

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
