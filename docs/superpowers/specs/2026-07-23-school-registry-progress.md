# School registry signup gate — execution progress

Plan: `docs/superpowers/plans/2026-07-23-school-registry-signup-gate.md`
Branch: `feature/school-registry-signup-gate`

## Status: Tasks 1–8 COMPLETE. Task 9 stopped at its human gate (Step 3).

| Task | State | Commit |
| --- | --- | --- |
| 1 — migration, `schools.uai/country`, `claim_school` RPC | DONE, applied to **staging only** | `0422686` |
| 2 — `lib/schools/registry.ts` pure helpers | DONE, 11 tests | `9435bc3` |
| 3 — sync script, `pnpm sync:schools`, `.env.example` | DONE, 14 tests, **14 611 rows synced to staging** | `8aa3d68` |
| 4 — RLS matrix for `school_registry` + `claim_school` | DONE, 12 cases | `0422686` |
| — types regenerated from staging | DONE | `5aba540` |
| 5 — `searchSchools` server action | DONE, 7 tests | `d934410` |
| 6 — `completeOnboarding` structured returns + ops email | DONE, 21 tests | `8bdaf57` |
| 7 — country select + registry combobox UI | DONE, 12 tests | `2bae55e` |
| 8 — settings rename back door closed | DONE, 4 + 17 tests | `5548cec` |

## Verification gate — all green (2026-07-23)

```
pnpm lint     ✔ No ESLint warnings or errors
pnpm test     198 files, 1386 tests passed
pnpm build    ✔ compiled successfully
pnpm test:rls 10 files, 142 tests passed   (130 baseline + 12 new)
```

## Two blockers hit and resolved (both pre-existing, neither caused by this branch)

### 1. `supabase db push` is broken against staging

Exits 1: five ledger versions on staging have no local file. Root cause is the
repo's own documented workflow — staging stamps the **filename** version, prod's
MCP `apply_migration` stamps a **different** one, and CLAUDE.md has you `git mv`
the file to prod's stamp, orphaning staging's row. Confirmed against
`git log --diff-filter=R`:

| Staging ledger (orphan) | Local file today |
| --- | --- |
| `20260719150046 exchange_info_cards` | `20260719173904_exchange_info_cards.sql` |
| `20260719155514 fillable_forms` | `20260719173549_fillable_forms.sql` |
| `20260721000001 activate_ready_drafts` | `20260721150342_activate_ready_drafts.sql` |
| `20260722195822 applications_language_all_locales` | `20260722195955_applications_language_all_locales.sql` |
| `20260723132613 users_exchange_order` | sibling branch `feature/exchange-reordering` |

**Bjorn chose the bypass:** this migration was applied to staging as one
transaction (DDL + its own `supabase_migrations.schema_migrations` row under the
real filename version `20260723133420`). No pre-existing drift was touched, and
no new drift was created. **The 4 orphans are still there — worth a BACKLOG line.**

### 2. `20260719150427_good_news_template.sql` had never been applied to staging

On prod, absent from staging entirely. It failed 3 RLS matrix cases and was
silently breaking Vercel Previews for the good-news template. **Bjorn approved
applying it**; done by the same mechanism. Matrix went 139/142 → 142/142.

Also note: `supabase gen types --db-url` needs Docker, which this machine does
not have. Use `supabase gen types typescript --project-id loygdbjdyciipvdcpvmr`
(hosted API) instead — that is how `types/supabase.ts` was regenerated.

## Deviations from the plan (beyond the 7 the plan already lists)

1. **The four message constants in `actions/onboarding.ts` are module-local, not
   exported.** A `'use server'` file may only export async functions. Nothing
   outside needs them — the UI renders `result.message`.
2. **The `claim_school` RPC args are cast at the call site.** A Postgres
   signature carries no nullability, so the generated `Args` type says `string`
   where the SQL explicitly accepts `null` for `p_uai`/`p_name`. Cast rather than
   hand-edit the generated types.
3. **`OnboardingForm`'s `schoolName` state was removed.** Step 1 no longer
   renders it and step 2 reads the claimed name from `details.sending_school_name`,
   so the plan's version left it written-but-never-read.
4. **`types/supabase.ts` currently also carries `users.exchange_order`** (the
   sibling branch applied it to staging) and a `graphql_public` block. Task 9
   Step 7 regenerates from **prod** and replaces the file — do not skip it.

## Remaining: Task 9 from Step 2

- [ ] Step 2 — preview browser check (5 items in the plan)
- [ ] Step 3 — **Bjorn's go-ahead. Everything below writes to production.**
- [ ] Step 4 — MCP `apply_migration` to prod (`name` = `school_registry`)
- [ ] Step 5 — reconcile the filename if prod stamps a different version
- [ ] Step 6 — `SCHOOL_REGISTRY_DB_URL='<prod>' pnpm sync:schools`
- [ ] Step 7 — regenerate types from **prod**, `npx tsc --noEmit`
- [ ] Step 8 — backfill the 5 production schools' UAIs (record every statement)
- [ ] Step 9 — merge (needs the gate re-run + Bjorn's confirmation)
- [ ] Step 10 — post-merge prod smoke check

## Decisions taken

- `SUPPORT_EMAIL = 'contact@eazyexchange.com'` in `app/onboarding/SchoolCombobox.tsx`.
  eazyexchange.com is on Cloudflare with Email Routing already live
  (MX = `route1/2/3.mx.cloudflare.net`), so the address is free to create:
  Cloudflare → eazyexchange.com → Email → Email Routing → Routing rules →
  Create address `contact` → forward to `bjornstephany@gmail.com`.
  **Still to do by Bjorn** — until then the link goes nowhere.
- AEFE schools abroad remain absent from the dataset and land on that contact
  link; the « Autre pays » path already onboards them. Copy not changed.
