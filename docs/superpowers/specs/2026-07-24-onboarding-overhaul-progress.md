# Onboarding overhaul — progress ledger

**Branch:** `feature/onboarding-overhaul` (worktree
`.claude/worktrees/feature+onboarding-overhaul`, dev port 3293)
**Spec:** `docs/superpowers/specs/2026-07-24-onboarding-overhaul-design.md`
**Plan:** `docs/superpowers/plans/2026-07-24-onboarding-overhaul.md`
**Execution mode:** subagent-driven (one fresh subagent per task, review between)

## Task status

| # | Task | Status |
|---|---|---|
| 1 | Reproduce the blank tab and the « Continuer » flash | **done** — item 1 hypothesis DISPROVED, real cause found and fixed; item 7 fixed-behaviour verified |
| 2 | Migration — three acceptance-email columns | **done** (`782d542`) |
| 3 | `good-news-fields` pure module | **done** (`60dfaa6`) |
| 4 | `saveProgramDetails` persists the three columns | **done** (`4428cf1`) |
| 5 | Réglages → Programme edits the acceptance-email values | **done** (`adec011`) |
| 6 | Onboarding draft module | **done** (`4f5e82b`) |
| 7 | Shrink `first-exchange` to the required fields | **done** (`2d7bfe4`) |
| 8 | `completeFirstExchange` derives, then redirects | **done** (`71c7cec`) |
| 9 | `OnboardingForm` — two steps, live date check, draft | **done** (`117a47c`) |
| 10 | Entry and exit redirects | **done** (`bbbca13` loop fix + `fdbc022` redirects) |
| 11 | Full gate, staging verification, manual steps | **done** (`ed55531`) — 5/5 staging checks PASS |

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

## Task 4 notes (recovered after a second crash)

The session that ran Task 3 was killed before it updated this table — Task 3's
commit `60dfaa6` was already on the branch when the next session resumed. Check
`git log` against this table before trusting it.

Two plan corrections found while implementing Task 4:

- The plan says to **create** `actions/__tests__/fillable-program-details.test.ts`.
  That file **already exists** and is tracked (`dfcf258`, `3f4af85`) with nine
  tests, including the two authorization checks. Writing the plan's version over
  it would have silently deleted them. The four new cases were appended as a
  second `describe` block instead, the shared mock grew an `upserted` capture
  array, and `validInput` is now typed `ProgramDetailsInput` so it fails compile
  if the type widens again.
- Widening `ProgramDetailsInput` with three **required** fields breaks
  `components/settings/ProgramDetailsCard.tsx` — the plan does not mention it
  until Task 5. Task 4's commit bridges the three values through from `initial`
  rather than passing `null`: a `null` pass-through would have blanked the
  acceptance-email columns on every save from Réglages between Tasks 4 and 5.
  **Task 5 must replace that bridge with real form state**, not add inputs
  alongside it.

Gate after Task 4: lint clean, `npx tsc --noEmit` clean, 1492 tests / 207 files
green (run with `--exclude '**/.claude/**'`).

## Task 5 notes

- Same "create" wart: `components/settings/__tests__/ProgramDetailsCard.test.tsx`
  already existed with six tests. The new cases went in as a second `describe`,
  in the file's house style (`renderWithIntl` + `fireEvent`, not the plan's
  `NextIntlClientProvider` + `userEvent`).
- The plan's Task 5 test list does not cover the bridge removal, so one extra
  test was added: an untouched `participation_cost` must still round-trip
  through save. It passed before and after the swap — that is the point.
- Message keys were inserted as **text** at the `absenceDatesHint` anchor in all
  five locales, not via `json.load`/`dump`, which would have reformatted the
  whole file. Diff is exactly +7 lines per locale.
- Apostrophe guard: no straight apostrophes in any added line; `fr.json` still
  holds exactly its 14 known pre-existing ones (now logged in `BACKLOG.md`).

Gate after Task 5: lint clean, `tsc --noEmit` clean, 1497 tests / 207 files
green, `pnpm build` green.

## Blocked on Bjorn

**All 11 tasks are done. Nothing is blocked. Not merged — merging needs Bjorn.**

Two things left for Bjorn, both in the findings file's "Manual steps":
1. Prod email template: fallback link `next=/dashboard` → `next=/onboarding`
   (low urgency — /dashboard still works, it just costs a hop).
2. Prod smoke of a fresh signup. This is also the only way to close out the
   blank-tab question: the loop is fixed by construction, but that a real signup
   was producing the null profile remains inference.

Open decision, not blocking: spec §1's blank-tab diagnosis is wrong and its
confirmation-path table is stale. Either amend §1 or accept the findings file as
the correction of record (recommended — it already carries the corrected table).

## Blank-tab loop fix (`bbbca13`) — what is and is not proven

`lib/auth/shell-destination.ts` is now the single decision for "which shell does
this request belong in", and a missing profile leaves the shells for `/login`
instead of picking the other one. Applied at four sites: both shell layouts,
`/onboarding`, `/billing`. `/communication` already went to `/login`.

- **Proven:** the loop is gone by construction, and ten tests pin it, including
  the property that neither shell may send a missing profile to the other and
  that both agree on one destination. Gate green: lint, tsc, 1507 tests / 208
  files, build.
- **Still unproven:** that this is what Bjorn actually saw. The mechanism is
  certain; that a fresh prod signup produces the null profile is inference. A
  real prod signup, or an `error_reports` / Vercel-log check for a redirect burst
  around a signup, would close it. **Do not report the blank tab as fixed until
  one of those happens** — report it as "the loop that would cause it is fixed".
- If the null profile is caused by admin-write-then-RLS-read lag in
  `/auth/confirm`, the organizer now gets a `/login` page instead of a blank tab.
  That is strictly better but still not "into the product" — a retry or a short
  read-back wait in `provisionOrganizer` may be the real cure. Not in scope here;
  worth a backlog line if the prod check confirms the lag.

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
