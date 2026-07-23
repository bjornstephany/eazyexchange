# School registry signup gate — execution progress

Plan: `docs/superpowers/plans/2026-07-23-school-registry-signup-gate.md`
Branch: `feature/school-registry-signup-gate`

## Done

| Task | State | Commit |
| --- | --- | --- |
| 2 — `lib/schools/registry.ts` pure helpers | DONE, 11 tests green | `9435bc3` |
| 3 — sync script + `pnpm sync:schools` + `.env.example` | Files DONE, 14 tests green. **Steps 6–7 (run against staging) NOT done — blocked.** | `8aa3d68` |
| 6 — `sendUnverifiedSchoolEmail` in `lib/email.ts` (steps 1–4 only) | DONE, 3 tests green, **uncommitted** (rest of Task 6 needs Task 1) | — |

## BLOCKED — Task 1 (migration) cannot proceed

`supabase db push --db-url "$STAGING_DB_URL"` **exits 1** against staging:

```
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260719150046 20260719155514 \
  20260721000001 20260722195822 20260723132613
```

### Root cause (confirmed, not a mystery)

This is a systemic artifact of the repo's own documented workflow
(`docs/WORKFLOW.md#migrations--staging`): staging stamps the migration with the
**filename** version, then prod's MCP `apply_migration` stamps a **different**
version, and CLAUDE.md step 3 has you `git mv` the local file to prod's stamp.
Staging's ledger is left holding the pre-rename version, which now has no local
file. Four such orphans have accumulated. Each is proven by `git log
--diff-filter=R` plus a name match:

| Staging ledger (orphan) | Local file today | Rename commit |
| --- | --- | --- |
| `20260719150046 exchange_info_cards` | `20260719173904_exchange_info_cards.sql` | `1fe5691` |
| `20260719155514 fillable_forms` | `20260719173549_fillable_forms.sql` | `7614517` |
| `20260721000001 activate_ready_drafts` | `20260721150342_activate_ready_drafts.sql` | — |
| `20260722195822 applications_language_all_locales` | `20260722195955_applications_language_all_locales.sql` | — |
| `20260723132613 users_exchange_order` | **not on this branch** — sibling session `feature/exchange-reordering`, still uncommitted there | — |

**Staging's schema is correct.** Only the ledger version numbers are stale. No
DDL is missing.

`--include-all` does not help; the check is a hard stop.

### Options (awaiting Bjorn)

- **A — repair the staging ledger.** For each of the 4 pairs: `supabase migration
  repair --status applied <new>` + `--status reverted <old>`. Fixes the papercut
  for every session, permanently. But it mutates shared staging state, and it is
  **not sufficient alone**: `20260723132613` is the sibling session's and stays
  remote-only until their file lands on `main` and is merged here.
- **B — bypass `db push` for staging (recommended).** Apply this migration's SQL
  directly to staging in one transaction via the `postgres` client, then insert
  its own row into `supabase_migrations.schema_migrations` under the real
  filename version. Unblocks now, touches no pre-existing drift, leaves no new
  drift. Prod still goes through MCP `apply_migration` per the plan.
- **C — wait** for the sibling to merge, then still face the other 4.

The staging-ledger repair is worth a `BACKLOG.md` line regardless of the choice.

## Resume

After the decision: do Task 1 (migration + `types/supabase.ts` regen), then
Task 3 steps 6–7 (`pnpm sync:schools` against staging), then Tasks 4 → 9 in
order. Task 6's `lib/email.ts` change is already written and green.

## Open questions for Bjorn (from the plan's "Notes for Bjorn")

1. `contact@eazyexchange.com` is the address « Je ne trouve pas mon
   établissement » writes to. No support address exists anywhere in the repo.
   Confirm or replace — one constant in `app/onboarding/SchoolCombobox.tsx`.
2. French schools abroad (AEFE) are absent from the dataset; they land on that
   contact link. The « Autre pays » path already works for them — say if the
   copy should point there explicitly.
