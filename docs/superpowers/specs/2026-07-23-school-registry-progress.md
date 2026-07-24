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

## Session 2026-07-24 — merged `main`, re-ran the gate

`main` was 33 commits ahead (billing upgrade path, exchange reordering, i18n
phase 3, dep audit). Merged in as `240a74e`. **One conflict**, in
`lib/supabase/request.ts`: this branch added `schools(country)` to the
`getProfile` select, `main` added `users.exchange_order`. Resolved as the union
of both — neither side was wrong.

Gate re-run against the merged tree, all four green:

```
pnpm lint     ✔ No ESLint warnings or errors
pnpm test     205 files, 1467 tests passed
pnpm build    ✔ compiled successfully
pnpm test:rls 10 files, 145 tests passed   (142 + 3 from main)
```

### ⚠️ Ordering constraint discovered — migration MUST precede the merge

`getProfile` now selects `schools(country)`, a column this branch's migration
adds. It does not exist on prod yet (verified: `column s.country does not
exist`). Merging to `main` before Step 4 applies the migration would break
`getProfile` — i.e. **every authenticated page in production**. Step 4 before
Step 9 is not a preference, it is a hard dependency.

### Step 8 is now a no-op — prod has no real school to backfill

The plan said "backfill the five production schools". Prod today holds
**4 schools, all test/stub rows**, and 2 users:

| name | created | members | exchanges |
| --- | --- | --- | --- |
| Edina | 2026-07-06 | 0 | 0 |
| Test | 2026-07-07 | 0 | 0 |
| Test | 2026-07-23 | 0 | 1 |
| Test Organizer School | 2026-07-24 | 2 | 1 |

The 2026-07-23 purge removed the real rows the plan was written against. All
four correctly keep `uai = null` and land in the unverified list. **Nothing to
backfill** — Step 8 collapses to running the verification query.

## Step 2 — browser check DONE, all 5 items pass (2026-07-24)

Run against a local dev server pointed at staging (recipe:
`reference_visual_check_via_staging_playwright`), not the preview URL — the
preview is SSO-protected and the flow needs a real authenticated session.

| # | Check | Result |
| --- | --- | --- |
| 1 | Pays select defaults to France + combobox | ✔ label « Pays », value `FR` |
| 2 | `chevreul` returns formatted results | ✔ 8 rows in ~1.8s, « … — 69007 Lyon · Privé » |
| 3 | Pick → chip, Continuer enabled, step 2 prefill | ✔ chip + « Changer »; « Lycée d'origine » prefilled |
| 4 | Pays → Espagne swaps in a free-text field | ✔ combobox 1→0, `#foreign-school` 0→1 |
| 5 | /settings Établissement locked | ✔ `#pf-schoolName` disabled + registry hint |

Data path was also probed directly against staging with the two queries
`searchSchools` runs: 14 611 rows, 74–500 ms, null-status rows render without
the `·` suffix, and `%_*\` normalizes to `''` so no wildcard reaches a LIKE.

### The check earned its keep — it found a real bug (fixed, `b0c090d`)

Picking « Lycée Chevreul Lestonnac — 69007 Lyon » stored **« Lycée Chevreul
Lestonnac - Site St Didier — 69370 Saint-Didier-au-Mont-d'Or »**. `claim_school`
re-derived the name from the UAI alone (`order by id limit 1`), and UAI is not
unique: 65 codes cover 135 rows. Fix prefers the exact `(uai, name)` pair, still
re-validated against `school_registry`, falling back to lowest id. Migration
edited in place (never applied to prod); staging's function was replaced.

Two notes for whoever reads the plan's Step 2 wording:
- « step 2 shows the registry name as *Lycée d'origine* » — true, but that field
  sits inside the collapsed « Informations complémentaires (facultatif) » block.
- The hint in check 5 renders in the account's interface language; a probe
  account defaulting to English shows "verified against the French national
  education registry", not « annuaire ».

Gate re-run after the fix: lint ✔ · **1468** tests ✔ · build ✔ · **148** RLS ✔

## Remaining: Task 9 from Step 3

- [ ] Step 3 — **Bjorn's go-ahead. Everything below writes to production.**
- [ ] Step 4 — MCP `apply_migration` to prod (`name` = `school_registry`)
- [ ] Step 5 — reconcile the filename if prod stamps a different version
- [ ] Step 6 — `SCHOOL_REGISTRY_DB_URL='<prod>' pnpm sync:schools`
- [ ] Step 7 — regenerate types from **prod**, `npx tsc --noEmit`
- [ ] Step 8 — ~~backfill~~ → verify `schools where uai is null` (see above)
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
