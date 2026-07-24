# School Registry Signup Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an organizer prove their school is real before they can collect minors' PII — the FR onboarding step picks an establishment from a local snapshot of the official `annuaire de l'éducation`, and no code path lets a school name be free-typed afterwards.

**Architecture:** A `school_registry` table holds ~14 611 open French collèges/lycées, refreshed by a manual sync script that does a transactional full replace. `/onboarding` step 1 becomes a country select + a debounced combobox backed by a `searchSchools` server action. `completeOnboarding` becomes a structured-return action that writes `schools.name` **from the registry row** through a `SECURITY DEFINER` RPC (`claim_school`) — the client never gets an `UPDATE` grant on `schools.uai`/`schools.country`, so the value cannot be spoofed. `/settings` makes the school-name field read-only for `country = 'FR'`, closing the rename back door.

**Tech Stack:** Next.js 15 App Router + Server Actions, Supabase Postgres (RLS, `pg_trgm`), `postgres` (node client, sync script only), Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md`

## Global Constraints

- Branch `feature/school-registry-signup-gate`, worktree `.claude/worktrees/feature+school-registry-signup-gate`. **Confirm `git branch --show-current` before every commit.** Never `git add -A` / `git add .` — stage only named files.
- **`supabase/migrations/` is single-writer.** A sibling session is on `feature/single-tab-signup-confirm`. Before Task 1, check that no other session is mid-migration; if one is, wait.
- **There is no local Supabase stack on this machine** (no Docker). Migrations are applied to **staging first** (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`), then to prod via Supabase MCP `apply_migration`. `pnpm test:rls` runs with `RLS_TEST_DB_URL="$STAGING_DB_URL"`.
- **WSL2 gotcha:** a direct Postgres connection can hang on IPv6. If `supabase db push` or a `postgres://` connection hangs, resolve the host with `getent ahostsv4 <host>` and substitute the IPv4 literal into the URL.
- **Never hand-edit `types/supabase.ts`** — regenerate it (`supabase gen types typescript --db-url "$STAGING_DB_URL"` during dev, MCP `generate_typescript_types` at prod rollout) and overwrite verbatim.
- **French copy uses typographic apostrophes (`’`), never `'`.** Run `grep -n "'" ` over any changed French string before committing.
- Every user-visible string added under `components/settings/` needs the key in **all five** catalogs (`messages/{fr,en,es,it,de}.json`) — `messages/__tests__/parity.test.ts` fails otherwise. `/onboarding` is deliberately French-only hardcoded today; keep it that way.
- Expected outcomes are **structured return values**, never thrown errors (production redacts thrown Server Action messages). Only genuinely unexpected failures throw.
- Verification gate before any merge: `pnpm lint`, `pnpm test`, `pnpm build`, plus `RLS_TEST_DB_URL="$STAGING_DB_URL" pnpm test:rls`.
- `vitest` sweeps sibling worktrees via symlinks; the repo's `vitest.config.ts` already excludes `**/.claude/**`. Do not remove that exclude.

## Deviations from the spec (accepted, with reasons)

These were verified against the live dataset and the current code while planning. Implement the plan, not the spec, where they differ.

1. **`school_registry.status` is nullable.** The spec says `not null`; 10 of the 14 611 rows have a null `statut_public_prive`. The formatter omits the ` · Public/Privé` suffix when null.
2. **A second column `search_name` + a btree prefix index.** The spec asks for "prefix matches on `name` first, then the rest". A single trigram `%q%` query cannot deliver that ordering — for a broad query the 8 rows returned are arbitrary. Two indexed queries (prefix on `search_name`, contains on `search_text`) merged in a pure JS helper do.
3. **Normalization strips every non-alphanumeric character to a single space, on both sides.** Not just accents. `"Nouveau collège de Saint-Ouen-L'Aumône"` → `"nouveau college de saint ouen l aumone"`, so a user typing `saint-ouen` or `saint ouen` both match, and `%`/`_`/`*` can never reach a `LIKE` pattern as a wildcard.
4. **The school claim is written by a `SECURITY DEFINER` RPC (`claim_school`), not a direct client `UPDATE`.** The spec correctly refuses to grant `update (uai, country)` to `authenticated` — but the onboarding action uses the RLS cookie client, so it has no way to write those columns. The alternatives were granting the columns (which reopens the back door: set `country='XX'`, then free-rename in settings) or importing `lib/supabase/admin` into an organizer-facing action (expands the service-role blast radius). The RPC is tighter than both: it can only ever write `my_school_id()`'s row, and it re-derives the name from `school_registry` itself.
5. **The settings enforcement is "silently skip the school write when `country = 'FR'`", not "throw".** `updateProfile` already silently ignores a submitted `schoolName` from a non-owner; this mirrors that, and avoids a redacted-error dead end in production. The field is read-only in the UI, so a well-behaved client never hits it.
6. **The spec names `actions/settings.ts → updateOrganizerSettings`.** No such function exists. The school rename lives in **`updateProfile`** in the same file.
7. **`« Je ne trouve pas mon établissement »` links to `mailto:contact@eazyexchange.com`.** The repo has no support address anywhere (the legal pages still carry `[PLACEHOLDER : e-mail]`). **Bjorn must confirm this inbox exists** — it is a one-constant change in `app/onboarding/SchoolCombobox.tsx` if not.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<ts>_school_registry.sql` | `pg_trgm`, `school_registry` + indexes + RLS + revoked grants, `schools.uai`/`schools.country`, `claim_school()` RPC |
| `lib/schools/registry.ts` | Pure: text normalization, search minimums, result merge/rank, display formatting, `SchoolOption` type |
| `lib/schools/__tests__/registry.test.ts` | Unit tests for the above + normalization parity with the sync script |
| `scripts/sync-school-registry.mjs` | Fetch the Opendatasoft export, build rows, transactional full replace. Exports its normalizer for the parity test. |
| `actions/onboarding.ts` | `searchSchools` (new), `completeOnboarding` (rewritten to structured return + RPC) |
| `app/onboarding/SchoolCombobox.tsx` | The FR establishment picker (debounced search, selection chip, not-found link) |
| `app/onboarding/OnboardingForm.tsx` | Step 1 becomes country select + combobox / free-text name |
| `lib/email.ts` | `sendUnverifiedSchoolEmail` — ops notification for a non-FR claim |
| `lib/supabase/request.ts` | `Profile.schools` embed gains `country` |
| `actions/settings.ts` | `updateProfile` skips the school write when `country = 'FR'` |
| `components/settings/ProfileCard.tsx` | School name read-only when the school is FR-verified |
| `components/settings/SettingsView.tsx`, `app/(organizer)/settings/page.tsx` | Thread `schoolCountry` down |
| `messages/{fr,en,es,it,de}.json` | `settings.profile.schoolNameLockedHint` |
| `tests/rls/school-registry.test.ts` | New-table RLS matrix cases |
| `types/supabase.ts` | Regenerated |
| `.env.example`, `package.json` | `SCHOOL_REGISTRY_DB_URL`, `sync:schools` |

**Deliberately NOT touched:** `lib/onboarding/gate.ts`. `mustOnboard(schoolName, ownedExchangeCount)` keeps its exact current shape (`schoolName === '' || ownedExchangeCount === 0`). The FR invariant "a name is only ever written together with a `uai`" is enforced in the single action that writes it, not duplicated into the gate predicate — which is also why all five existing production schools keep working untouched, with no forced re-onboarding and no dual-mode code.

---

## Task 1: Migration — registry table, schools columns, claim RPC

**Files:**
- Create: `supabase/migrations/<ts>_school_registry.sql`
- Modify: `types/supabase.ts` (regenerated, do not hand-edit)

**Interfaces:**
- Consumes: nothing.
- Produces: table `school_registry(id bigserial, uai text, name text, type text, status text null, commune text, postal_code text, department text, academy text, search_name text, search_text text)`; columns `schools.uai text null`, `schools.country text not null default 'FR'`; RPC `claim_school(p_country text, p_uai text, p_name text) returns text` (returns the name written, or `null` when the claim is rejected).

**Background for the implementer:** This repo has no local Postgres. `supabase db push` against staging is the *only* way to see the schema, and the prod apply goes through the Supabase MCP tool. Both are needed before any TypeScript in later tasks will compile, because `types/supabase.ts` is generated from a live database.

- [ ] **Step 1: Check nobody else is mid-migration**

```bash
git branch --show-current           # must print: feature/school-registry-signup-gate
git worktree list
ls supabase/migrations | tail -5
```

If another worktree has an uncommitted file in `supabase/migrations/`, stop and wait — this directory is single-writer.

- [ ] **Step 2: Create the migration file**

```bash
echo "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_school_registry.sql"
```

Create the file at that exact path with this content:

```sql
-- School registry signup gate (spec: docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md).
--
-- A local snapshot of the official French establishment directory
-- (data.education.gouv.fr, dataset fr-en-annuaire-education: open collèges and
-- lycées). Public open government data, zero PII. Refreshed by hand roughly
-- once a term via `pnpm sync:schools`, which does a full replace inside one
-- transaction — so no natural key is needed, which matters because UAI is NOT
-- unique in the source (65 multi-site establishments share a code).

create extension if not exists pg_trgm with schema extensions;

create table school_registry (
  id           bigserial primary key,
  uai          text not null,   -- official RNE/UAI code, e.g. '0690574Z'. Not unique.
  name         text not null,
  type         text not null,   -- 'Collège' | 'Lycée'
  status       text,            -- 'Public' | 'Privé'. Null for 10 rows in the source.
  commune      text not null,
  postal_code  text not null,
  department   text,
  academy      text,
  search_name  text not null,   -- normalizeText(name)              — prefix matching
  search_text  text not null    -- normalizeText(name commune cp)   — contains matching
);

-- `search_name like 'q%'` (best matches first).
create index school_registry_name_prefix_idx
  on school_registry (search_name text_pattern_ops);
-- `search_text like '%q%'` (everything else).
create index school_registry_search_idx
  on school_registry using gin (search_text extensions.gin_trgm_ops);
-- The claim path looks a row up by its UAI.
create index school_registry_uai_idx on school_registry (uai);

alter table school_registry enable row level security;

-- Readable by everyone: it is public open data and the onboarding picker runs
-- before a school exists. No client writes — 20260708000001 set ALTER DEFAULT
-- PRIVILEGES granting insert/update/delete on new public tables, so the revoke
-- below is load-bearing, not decorative.
create policy "school registry is public" on school_registry
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on school_registry from anon, authenticated;

-- --- schools: verified establishment identity ---------------------------------
-- uai is null for unverified schools (non-FR, or a legacy row). Deliberately NO
-- foreign key to school_registry: if a school closes and drops out of a future
-- sync, an existing paying customer must not break.
alter table schools
  add column uai     text,
  add column country text not null default 'FR';

-- --- claim_school() -----------------------------------------------------------
-- The ONLY writer of schools.uai / schools.country. Neither column is added to
-- the client UPDATE grant (which still covers only `name`, per 20260701000001),
-- because a client that could set country='XX' would unlock the free-text
-- rename in /settings and undo the whole gate.
--
-- For FR the name is re-derived from school_registry here, so a crafted request
-- cannot spoof the displayed establishment name. Returns the name actually
-- written; returns null when the claim is rejected (unknown UAI, empty foreign
-- name, non-organizer caller) so the caller can surface a structured rejection
-- rather than a redacted thrown error.
create or replace function claim_school(p_country text, p_uai text, p_name text)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_name   text;
  v_uai    text;
begin
  v_school := my_school_id();
  if v_school is null or my_role() is distinct from 'organizer' then
    return null;
  end if;

  if p_country = 'FR' then
    select r.name, r.uai into v_name, v_uai
      from school_registry r
      where r.uai = p_uai
      order by r.id
      limit 1;
    if v_name is null then return null; end if;
  else
    v_name := nullif(btrim(coalesce(p_name, '')), '');
    v_uai  := null;
    if v_name is null then return null; end if;
    if btrim(coalesce(p_country, '')) = '' then return null; end if;
  end if;

  update schools set name = v_name, uai = v_uai, country = p_country
    where id = v_school;

  return v_name;
end;
$$;

revoke execute on function public.claim_school(text, text, text) from public, anon;
grant execute on function public.claim_school(text, text, text) to authenticated;
```

- [ ] **Step 3: Apply to staging**

```bash
set -a; source .env.staging; set +a
pnpm exec supabase db push --db-url "$STAGING_DB_URL"
```

Expected: `Applying migration <ts>_school_registry.sql...` then `Finished supabase db push.`
If it hangs with no output for >60s, it is the WSL2 IPv6 gotcha — resolve the host with `getent ahostsv4 <host>` and substitute the IPv4 literal into `$STAGING_DB_URL`.

- [ ] **Step 4: Verify the schema landed on staging**

```bash
set -a; source .env.staging; set +a
pnpm exec supabase db push --db-url "$STAGING_DB_URL" --dry-run
```

Expected: `Remote database is up to date.`

- [ ] **Step 5: Regenerate types from staging**

```bash
set -a; source .env.staging; set +a
pnpm exec supabase gen types typescript --db-url "$STAGING_DB_URL" > types/supabase.ts
npx tsc --noEmit
```

Expected: `tsc` exits 0. `git diff --stat types/supabase.ts` should show only additions for `school_registry`, `claim_school`, and the two new `schools` columns. If it shows unrelated churn, the staging schema has drifted from prod — stop and report before continuing.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # feature/school-registry-signup-gate
git add supabase/migrations types/supabase.ts
git commit -m "feat(db): school_registry snapshot table + schools.uai/country + claim_school RPC"
```

The prod apply happens in Task 9, not here.

---

## Task 2: `lib/schools/registry.ts` — pure search helpers

**Files:**
- Create: `lib/schools/registry.ts`
- Test: `lib/schools/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces:
  - `type SchoolOption = { id: number; uai: string; name: string; type: string; status: string | null; commune: string; postal_code: string }`
  - `const MIN_QUERY_LENGTH = 2`, `const MAX_RESULTS = 8`
  - `normalizeText(raw: string): string`
  - `isSearchable(normalized: string): boolean`
  - `rankSchoolOptions(prefixHits: SchoolOption[], containsHits: SchoolOption[]): SchoolOption[]`
  - `formatSchoolOption(o: SchoolOption): string`

- [ ] **Step 1: Write the failing test**

Create `lib/schools/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeText, isSearchable, rankSchoolOptions, formatSchoolOption,
  MAX_RESULTS, type SchoolOption,
} from '@/lib/schools/registry'

function opt(id: number, over: Partial<SchoolOption> = {}): SchoolOption {
  return {
    id, uai: `UAI${id}`, name: `École ${id}`, type: 'Lycée', status: 'Public',
    commune: 'Lyon', postal_code: '69007', ...over,
  }
}

describe('normalizeText', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeText('Lycée Frédéric MISTRAL')).toBe('lycee frederic mistral')
  })

  it('collapses every non-alphanumeric run to a single space and trims', () => {
    expect(normalizeText("  Nouveau collège de Saint-Ouen-L'Aumône  "))
      .toBe('nouveau college de saint ouen l aumone')
  })

  it('keeps digits so a postal code is searchable', () => {
    expect(normalizeText('Lycée — 69007 Lyon')).toBe('lycee 69007 lyon')
  })

  it('neutralises SQL LIKE and PostgREST wildcards', () => {
    expect(normalizeText('%_*\\')).toBe('')
    expect(normalizeText('ly%ce')).toBe('ly ce')
  })
})

describe('isSearchable', () => {
  it('requires at least two characters', () => {
    expect(isSearchable('')).toBe(false)
    expect(isSearchable('l')).toBe(false)
    expect(isSearchable('ly')).toBe(true)
  })
})

describe('rankSchoolOptions', () => {
  it('puts name-prefix hits before contains hits', () => {
    const ranked = rankSchoolOptions([opt(1), opt(2)], [opt(3)])
    expect(ranked.map(o => o.id)).toEqual([1, 2, 3])
  })

  it('de-duplicates by id, keeping the prefix-hit position', () => {
    const ranked = rankSchoolOptions([opt(3)], [opt(1), opt(3), opt(2)])
    expect(ranked.map(o => o.id)).toEqual([3, 1, 2])
  })

  it(`caps the result at ${MAX_RESULTS} rows`, () => {
    const many = Array.from({ length: 20 }, (_, i) => opt(i + 1))
    expect(rankSchoolOptions(many, many)).toHaveLength(MAX_RESULTS)
  })

  it('returns an empty list when nothing matched', () => {
    expect(rankSchoolOptions([], [])).toEqual([])
  })
})

describe('formatSchoolOption', () => {
  it('renders name — postcode commune · status', () => {
    expect(formatSchoolOption(opt(1, { name: 'Lycée Chevreul Lestonnac', status: 'Privé' })))
      .toBe('Lycée Chevreul Lestonnac — 69007 Lyon · Privé')
  })

  it('omits the status suffix when the source has none', () => {
    expect(formatSchoolOption(opt(1, { name: 'COLLEGE', status: null })))
      .toBe('COLLEGE — 69007 Lyon')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run lib/schools/__tests__/registry.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/schools/registry"`.

- [ ] **Step 3: Write the implementation**

Create `lib/schools/registry.ts`:

```ts
// Pure helpers for the establishment picker (spec:
// docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md).
// No imports on purpose: `scripts/sync-school-registry.mjs` mirrors
// normalizeText line for line and a parity test pins the two together.

export type SchoolOption = {
  id: number
  uai: string
  name: string
  type: string
  status: string | null
  commune: string
  postal_code: string
}

export const MIN_QUERY_LENGTH = 2
export const MAX_RESULTS = 8

// Both sides of the search must agree, so this runs over the stored
// search_name / search_text at sync time AND over the typed query at read time.
// Everything that is not [a-z0-9] collapses to a single space, which
// (a) makes "Saint-Ouen" and "saint ouen" the same string, and (b) means a
// LIKE pattern can never receive a %, _ , * or backslash from user input.
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isSearchable(normalized: string): boolean {
  return normalized.length >= MIN_QUERY_LENGTH
}

// Merge the two indexed queries into one ordered list: establishments whose
// name STARTS with the query first, then anything containing it, de-duplicated
// by id and capped.
export function rankSchoolOptions(
  prefixHits: SchoolOption[],
  containsHits: SchoolOption[],
): SchoolOption[] {
  const out: SchoolOption[] = []
  const seen = new Set<number>()
  for (const row of [...prefixHits, ...containsHits]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
    if (out.length === MAX_RESULTS) break
  }
  return out
}

export function formatSchoolOption(o: SchoolOption): string {
  const place = `${o.postal_code} ${o.commune}`
  return o.status ? `${o.name} — ${place} · ${o.status}` : `${o.name} — ${place}`
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm exec vitest run lib/schools/__tests__/registry.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add lib/schools/registry.ts lib/schools/__tests__/registry.test.ts
git commit -m "feat(schools): pure search normalization, ranking and formatting helpers"
```

---

## Task 3: Sync script

**Files:**
- Create: `scripts/sync-school-registry.mjs`
- Modify: `package.json` (scripts), `.env.example`
- Test: `lib/schools/__tests__/registry.test.ts` (append a parity describe block)

**Interfaces:**
- Consumes: `normalizeText` semantics from Task 2 (duplicated, not imported — the script is plain ESM outside the TS build).
- Produces: `pnpm sync:schools`; module exports `normalizeText(raw)`, `buildRow(record)`, `COLUMNS` for the parity test.

**Background for the implementer:** the endpoint, the filter and the field list below were verified live while planning — 14 611 rows, 4.5 MB, HTTP 200, one call. The paged `/records` endpoint caps `offset` at 10 000, which is below the row count, so `/exports/json` is the only endpoint that can return the whole set. `postgres` is already a dependency (`^3.4.9`).

- [ ] **Step 1: Write the failing parity test**

Append to `lib/schools/__tests__/registry.test.ts`:

```ts
// The sync script cannot import the TS module (it is plain ESM run by node
// outside the Next build), so it mirrors normalizeText. If the two ever drift,
// every stored search_text stops matching typed queries — pin them here.
describe('sync script / registry normalization parity', () => {
  it('produces identical output for tricky inputs', async () => {
    const script = await import('@/scripts/sync-school-registry.mjs')
    const samples = [
      'Lycée Chevreul Lestonnac',
      "Nouveau collège de Saint-Ouen-L'Aumône",
      '  ÉCOLE   des Hauts-de-Nîmes  ',
      'OneSchool Global Alès Campus (Lycée professionnel)',
      '%_*\\',
      '69007',
    ]
    for (const s of samples) {
      expect(script.normalizeText(s), s).toBe(normalizeText(s))
    }
  })

  it('builds the row a registry record maps to', async () => {
    const { buildRow } = await import('@/scripts/sync-school-registry.mjs')
    expect(buildRow({
      identifiant_de_l_etablissement: '0690574Z',
      nom_etablissement: 'Lycée Chevreul Lestonnac',
      type_etablissement: 'Lycée',
      statut_public_prive: 'Privé',
      nom_commune: 'Lyon',
      code_postal: '69007',
      libelle_departement: 'Rhône',
      libelle_academie: 'Lyon',
    })).toEqual({
      uai: '0690574Z',
      name: 'Lycée Chevreul Lestonnac',
      type: 'Lycée',
      status: 'Privé',
      commune: 'Lyon',
      postal_code: '69007',
      department: 'Rhône',
      academy: 'Lyon',
      search_name: 'lycee chevreul lestonnac',
      search_text: 'lycee chevreul lestonnac lyon 69007',
    })
  })

  it('keeps a null status rather than inventing one', async () => {
    const { buildRow } = await import('@/scripts/sync-school-registry.mjs')
    expect(buildRow({
      identifiant_de_l_etablissement: '0951234A',
      nom_etablissement: 'COLLEGE',
      type_etablissement: 'Collège',
      statut_public_prive: null,
      nom_commune: 'Cergy',
      code_postal: '95000',
      libelle_departement: null,
      libelle_academie: null,
    })).toMatchObject({ status: null, department: null, academy: null })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run lib/schools/__tests__/registry.test.ts`
Expected: FAIL — cannot resolve `@/scripts/sync-school-registry.mjs`.

- [ ] **Step 3: Write the script**

Create `scripts/sync-school-registry.mjs`:

```js
// Refreshes the school_registry snapshot from the official French
// establishment directory (data.education.gouv.fr, dataset
// fr-en-annuaire-education). Spec:
// docs/superpowers/specs/2026-07-23-school-registry-signup-gate-design.md
//
// Full replace inside ONE transaction: delete + bulk insert. MVCC means no
// concurrent reader ever sees an empty table, and no upsert key is needed —
// which matters because UAI is not unique in the source (65 multi-site
// establishments share a code, and even (uai, name) collides 8 times).
// Nothing holds a foreign key to school_registry, so a full replace is safe.
//
// Not app code: it connects with a direct service-role connection string, so
// lib/supabase/admin's import allowlist is untouched.
//
// Cadence: by hand, roughly once a term.
//
// Run (staging):
//   set -a; source .env.staging; set +a
//   pnpm sync:schools
// Run (prod):
//   SCHOOL_REGISTRY_DB_URL='postgresql://…' pnpm sync:schools
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'

const BASE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/json'
const WHERE = 'type_etablissement in ("Lycée","Collège") and etat="OUVERT"'
const FIELDS = [
  'identifiant_de_l_etablissement',
  'nom_etablissement',
  'type_etablissement',
  'statut_public_prive',
  'nom_commune',
  'code_postal',
  'libelle_departement',
  'libelle_academie',
]

export const COLUMNS = [
  'uai', 'name', 'type', 'status', 'commune', 'postal_code',
  'department', 'academy', 'search_name', 'search_text',
]

// MUST stay identical to normalizeText in lib/schools/registry.ts — the parity
// test in lib/schools/__tests__/registry.test.ts pins the two together.
export function normalizeText(raw) {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const orNull = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())

export function buildRow(r) {
  const name = String(r.nom_etablissement).trim()
  const commune = String(r.nom_commune).trim()
  const postalCode = String(r.code_postal).trim()
  return {
    uai: String(r.identifiant_de_l_etablissement).trim(),
    name,
    type: String(r.type_etablissement).trim(),
    status: orNull(r.statut_public_prive),
    commune,
    postal_code: postalCode,
    department: orNull(r.libelle_departement),
    academy: orNull(r.libelle_academie),
    search_name: normalizeText(name),
    search_text: normalizeText(`${name} ${commune} ${postalCode}`),
  }
}

async function fetchRegistry() {
  const url = new URL(BASE)
  url.searchParams.set('where', WHERE)
  url.searchParams.set('select', FIELDS.join(','))
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`registry export failed: HTTP ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('registry export did not return an array')
  return rows
}

async function main() {
  const dbUrl = process.env.SCHOOL_REGISTRY_DB_URL ?? process.env.STAGING_DB_URL
  if (!dbUrl) {
    console.error(
      'No database URL. Staging: `set -a; source .env.staging; set +a; pnpm sync:schools`.\n' +
      'Prod: `SCHOOL_REGISTRY_DB_URL=postgresql://… pnpm sync:schools`.',
    )
    process.exit(1)
  }
  console.log(`[sync] target: ${new URL(dbUrl).host}`)

  console.log('[sync] fetching the establishment directory…')
  const records = await fetchRegistry()
  const rows = records.map(buildRow)
  // A shrunken export means the upstream filter or dataset changed. Refuse to
  // wipe a good snapshot over it.
  if (rows.length < 10_000) {
    throw new Error(`refusing to replace: export returned only ${rows.length} rows`)
  }
  console.log(`[sync] ${rows.length} establishments`)

  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} })
  try {
    await sql.begin(async (tx) => {
      await tx`delete from school_registry`
      for (let i = 0; i < rows.length; i += 1000) {
        await tx`insert into school_registry ${tx(rows.slice(i, i + 1000), ...COLUMNS)}`
      }
    })
    const [{ count }] = await sql`select count(*)::int as count from school_registry`
    console.log(`[sync] done — school_registry now holds ${count} rows`)
  } finally {
    await sql.end()
  }
}

// Importable (the parity test imports normalizeText/buildRow) without running.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('[sync] failed:', err); process.exit(1) })
}
```

- [ ] **Step 4: Run the parity tests and make sure they pass**

Run: `pnpm exec vitest run lib/schools/__tests__/registry.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Register the script and document the env var**

In `package.json`, add to `"scripts"` immediately after the `"seed:staging"` line:

```json
    "sync:schools": "node scripts/sync-school-registry.mjs",
```

In `.env.example`, append at the end of the file:

```
# --- Scripts -------------------------------------------------------------------
# Direct Postgres connection string used ONLY by `pnpm sync:schools` (refreshes
# the school_registry snapshot). Never read by the app. For staging, source
# .env.staging instead — the script falls back to STAGING_DB_URL.
SCHOOL_REGISTRY_DB_URL=
```

- [ ] **Step 6: Run it against staging for real**

```bash
set -a; source .env.staging; set +a
pnpm sync:schools
```

Expected output ends with `[sync] done — school_registry now holds 14611 rows` (the exact count drifts with the upstream dataset; anything above 14 000 is normal). If the connection hangs, apply the WSL2 IPv4 substitution from the Global Constraints.

- [ ] **Step 7: Spot-check the data on staging**

```bash
set -a; source .env.staging; set +a
pnpm exec supabase db push --db-url "$STAGING_DB_URL" --dry-run   # sanity: still up to date
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.STAGING_DB_URL, { max: 1 });
(async () => {
  console.log(await sql\`select count(*)::int from school_registry\`);
  console.log(await sql\`select name, commune, status from school_registry where search_name like 'lycee chevreul%' limit 3\`);
  await sql.end();
})();
"
```

Expected: a count above 14 000, and at least one Chevreul row.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add scripts/sync-school-registry.mjs package.json .env.example lib/schools/__tests__/registry.test.ts
git commit -m "feat(schools): registry sync script with transactional full replace"
```

---

## Task 4: RLS matrix cases for `school_registry`

**Files:**
- Create: `tests/rls/school-registry.test.ts`

**Interfaces:**
- Consumes: `connect`, `runAs`, `writeOutcome`, `expectBlocked` from `tests/rls/db.ts`; `seedFixtures`, `cleanupFixtures`, `Fixtures` from `tests/rls/seed.ts`; the schema from Task 1.
- Produces: nothing consumed by later tasks.

**Background for the implementer:** per CLAUDE.md, any new table ships with matrix cases in the same PR. This suite needs a real Postgres; with no local stack, run it against staging with `RLS_TEST_DB_URL="$STAGING_DB_URL"`. The suite always rolls back its transactions, but the seed itself commits and cleans up — never point it at production.

- [ ] **Step 1: Write the failing test**

Create `tests/rls/school-registry.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

// A deterministic row of our own, so the assertions do not depend on whether
// `pnpm sync:schools` has run against this database.
const UAI = 'RLSTEST1'

beforeAll(async () => {
  fx = await seedFixtures(sql)
  await sql`
    insert into school_registry
      (uai, name, type, status, commune, postal_code, search_name, search_text)
    values
      (${UAI}, 'Lycée RLS Test', 'Lycée', 'Public', 'Lyon', '69007',
       'lycee rls test', 'lycee rls test lyon 69007')`
})
afterAll(async () => {
  await sql`delete from school_registry where uai = ${UAI}`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('school_registry (public open data, read-only for clients)', () => {
  it('anon can select — the picker runs before a school exists', async () => {
    const rows = await runAs(sql, null, (tx) =>
      tx`select uai, name from school_registry where uai = ${UAI}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Lycée RLS Test')
  })

  it('authenticated organizers and students can select too', async () => {
    for (const uid of [fx.orgA, fx.studentA]) {
      const rows = await runAs(sql, uid, (tx) =>
        tx`select uai from school_registry where uai = ${UAI}`)
      expect(rows, `persona ${uid}`).toHaveLength(1)
    }
  })

  it('no client role can insert a fake establishment', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`insert into school_registry
             (uai, name, type, commune, postal_code, search_name, search_text)
           values ('RLSFORGE', 'Faux Lycée', 'Lycée', 'Nulle Part', '00000', 'faux lycee', 'faux lycee')`))
    }
  })

  it('no client role can update a registry row', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`update school_registry set name = 'Renommé' where uai = ${UAI}`))
    }
  })

  it('no client role can delete a registry row', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from school_registry where uai = ${UAI}`))
    }
  })
})

describe('claim_school() — the only writer of schools.uai / schools.country', () => {
  it('an organizer claims a real establishment; the name comes from the registry', async () => {
    const name = await runAs(sql, fx.orgA, async (tx) => {
      const [row] = await tx`select claim_school('FR', ${UAI}, 'Nom Falsifié') as name`
      const [school] = await tx`select name, uai, country from schools where id = ${fx.schoolA}`
      expect(school.name).toBe('Lycée RLS Test')   // NOT 'Nom Falsifié'
      expect(school.uai).toBe(UAI)
      expect(school.country).toBe('FR')
      return row.name
    })
    expect(name).toBe('Lycée RLS Test')
  })

  it('an unknown UAI is rejected and writes nothing', async () => {
    await runAs(sql, fx.orgA, async (tx) => {
      const before = await tx`select name from schools where id = ${fx.schoolA}`
      const [row] = await tx`select claim_school('FR', 'NOSUCHUAI', 'Nom Falsifié') as name`
      expect(row.name).toBeNull()
      const after = await tx`select name, uai from schools where id = ${fx.schoolA}`
      expect(after[0].name).toBe(before[0].name)
      expect(after[0].uai).toBeNull()
    })
  })

  it('a non-FR claim stores the typed name with a null uai', async () => {
    await runAs(sql, fx.orgA, async (tx) => {
      const [row] = await tx`select claim_school('Canada', null, '  Collège Saint-Laurent  ') as name`
      expect(row.name).toBe('Collège Saint-Laurent')
      const [school] = await tx`select name, uai, country from schools where id = ${fx.schoolA}`
      expect(school.uai).toBeNull()
      expect(school.country).toBe('Canada')
    })
  })

  it('a non-FR claim with an empty name is rejected', async () => {
    await runAs(sql, fx.orgA, async (tx) => {
      const [row] = await tx`select claim_school('Canada', null, '   ') as name`
      expect(row.name).toBeNull()
    })
  })

  it('a student cannot claim a school', async () => {
    await runAs(sql, fx.studentA, async (tx) => {
      const [row] = await tx`select claim_school('FR', ${UAI}, null) as name`
      expect(row.name).toBeNull()
    })
  })

  it('anon cannot execute claim_school at all', async () => {
    let code: string | undefined
    try {
      await runAs(sql, null, (tx) => tx`select claim_school('FR', ${UAI}, null)`)
    } catch (e) {
      code = (e as { code?: string }).code
    }
    expect(code).toBe('42501')
  })

  it('an organizer still cannot write uai or country directly', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update schools set country = 'XX' where id = ${fx.schoolA}`))
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update schools set uai = 'FORGED' where id = ${fx.schoolA}`))
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Only meaningful before Task 1 is applied; run it now to confirm the suite wires up:

```bash
set -a; source .env.staging; set +a
RLS_TEST_DB_URL="$STAGING_DB_URL" pnpm exec vitest run --config vitest.rls.config.ts tests/rls/school-registry.test.ts
```

Expected: PASS (Task 1 already applied the schema to staging). If any case fails, the migration is wrong — fix the migration, re-push to staging, and re-run.

- [ ] **Step 3: Run the whole RLS matrix to prove nothing regressed**

```bash
set -a; source .env.staging; set +a
RLS_TEST_DB_URL="$STAGING_DB_URL" pnpm test:rls
```

Expected: all files pass (the suite was 130 green before this branch; expect 130 + the 12 new cases).

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add tests/rls/school-registry.test.ts
git commit -m "test(rls): school_registry read-only matrix + claim_school boundaries"
```

---

## Task 5: `searchSchools` server action

**Files:**
- Modify: `actions/onboarding.ts` (add the action; leave `completeOnboarding` alone in this task)
- Test: `actions/__tests__/search-schools.test.ts`

**Interfaces:**
- Consumes: `normalizeText`, `isSearchable`, `rankSchoolOptions`, `MAX_RESULTS`, `SchoolOption` from `@/lib/schools/registry` (Task 2); `requireOrganizer` from `@/lib/auth/require`; `createClient` from `@/lib/supabase/server`.
- Produces: `searchSchools(query: string): Promise<SchoolOption[]>`.

**Background for the implementer:** two indexed queries, merged by the pure helper — prefix on `search_name` (btree `text_pattern_ops`), contains on `search_text` (GIN trigram). `normalizeText` guarantees the pattern only ever contains `[a-z0-9 ]`, so `%` is safe to concatenate and no escaping is needed. No rate limiter: the data is public, the caller is authenticated, and a fail-closed limiter on a search box would break onboarding whenever the limiter breaks.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/search-schools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = {
  id: number; uai: string; name: string; type: string
  status: string | null; commune: string; postal_code: string
}

// Captured LIKE patterns, in call order, so we can assert the query shapes.
let patterns: string[]
let responses: Row[][]
let scenario: { user: { id: string } | null; role: string }

function row(id: number, name: string): Row {
  return { id, uai: `U${id}`, name, type: 'Lycée', status: 'Public', commune: 'Lyon', postal_code: '69007' }
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from(table: string) {
      if (table === 'users') {
        const u: any = {
          select: () => u, eq: () => u,
          single: async () => ({
            data: {
              id: 'u1', role: scenario.role, school_id: 's-1', full_name: 'x',
              email: 'a@b.com', org_role: 'owner', locale: 'fr',
              schools: { name: '', country: 'FR' },
            },
          }),
        }
        return u
      }
      const b: any = {
        select: () => b,
        order: () => b,
        like: (_col: string, pattern: string) => { patterns.push(pattern); return b },
        limit: async () => ({ data: responses.shift() ?? [], error: null }),
      }
      return b
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { searchSchools } from '@/actions/onboarding'

beforeEach(() => {
  patterns = []
  responses = []
  scenario = { user: { id: 'u1' }, role: 'organizer' }
})

describe('searchSchools', () => {
  it('returns nothing and hits no query below the two-character minimum', async () => {
    expect(await searchSchools('l')).toEqual([])
    expect(await searchSchools('  ')).toEqual([])
    expect(patterns).toEqual([])
  })

  it('normalizes the query and issues a prefix then a contains pattern', async () => {
    responses = [[row(1, 'Lycée Chevreul')], [row(2, 'Collège Chevreul')]]
    const out = await searchSchools('  Chevreul-Lestonnac ')
    expect(patterns).toEqual(['chevreul lestonnac%', '%chevreul lestonnac%'])
    expect(out.map(o => o.id)).toEqual([1, 2])
  })

  it('puts prefix hits first and de-duplicates across the two queries', async () => {
    responses = [[row(7, 'Lycée A')], [row(3, 'Collège B'), row(7, 'Lycée A')]]
    expect((await searchSchools('lycee')).map(o => o.id)).toEqual([7, 3])
  })

  it('caps the merged result at 8 rows', async () => {
    const many = Array.from({ length: 8 }, (_, i) => row(i + 1, `École ${i + 1}`))
    const more = Array.from({ length: 8 }, (_, i) => row(i + 100, `École ${i + 100}`))
    responses = [many, more]
    expect(await searchSchools('ecole')).toHaveLength(8)
  })

  it('never lets user input reach the pattern as a wildcard', async () => {
    responses = [[], []]
    await searchSchools('%_*')
    expect(patterns).toEqual([])   // normalizes to '', below the minimum
  })

  it('rejects a non-organizer caller', async () => {
    scenario.role = 'student'
    await expect(searchSchools('lycee')).rejects.toThrow('Unauthorized')
  })

  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    await expect(searchSchools('lycee')).rejects.toThrow('Unauthenticated')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run actions/__tests__/search-schools.test.ts`
Expected: FAIL — `searchSchools is not a function`.

- [ ] **Step 3: Write the implementation**

In `actions/onboarding.ts`, add to the import block at the top:

```ts
import {
  normalizeText, isSearchable, rankSchoolOptions, MAX_RESULTS,
  type SchoolOption,
} from '@/lib/schools/registry'
```

Then insert this function immediately after the imports, above `completeOnboarding`:

```ts
const REGISTRY_COLUMNS = 'id, uai, name, type, status, commune, postal_code'

// Establishment autocomplete for /onboarding step 1. Two indexed queries —
// name-prefix (btree text_pattern_ops on search_name) and contains-anywhere
// (GIN trigram on search_text) — merged so the best matches come first.
//
// No rate limiter on purpose: the registry is public open government data, the
// caller is an authenticated organizer, and lib/rate-limit fails CLOSED — a
// limiter outage would lock real customers out of onboarding.
export async function searchSchools(query: string): Promise<SchoolOption[]> {
  await requireOrganizer()

  const q = normalizeText(query ?? '')
  if (!isSearchable(q)) return []

  // normalizeText leaves only [a-z0-9 ], so % is safe to concatenate and no
  // LIKE escaping is needed.
  const supabase = await createClient()
  const run = async (column: 'search_name' | 'search_text', pattern: string) => {
    const { data, error } = await supabase
      .from('school_registry')
      .select(REGISTRY_COLUMNS)
      .like(column, pattern)
      .order('name')
      .limit(MAX_RESULTS)
    if (error) throw error
    return (data ?? []) as SchoolOption[]
  }

  const prefixHits = await run('search_name', `${q}%`)
  const containsHits = await run('search_text', `%${q}%`)
  return rankSchoolOptions(prefixHits, containsHits)
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `pnpm exec vitest run actions/__tests__/search-schools.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add actions/onboarding.ts actions/__tests__/search-schools.test.ts
git commit -m "feat(onboarding): searchSchools server action over the registry snapshot"
```

---

## Task 6: `completeOnboarding` — structured return, registry validation, ops email

**Files:**
- Modify: `actions/onboarding.ts`, `lib/email.ts`
- Test: `actions/__tests__/onboarding.test.ts` (rewritten), `lib/__tests__/unverified-school-email.test.ts` (new)

**Interfaces:**
- Consumes: the `claim_school` RPC (Task 1); `SchoolOption` (Task 2).
- Produces:
  - `type CompleteOnboardingInput = { country: string; uai: string | null; name: string }`
  - `type CompleteOnboardingResult = { ok: true; schoolName: string } | { ok: false; error: 'invalid' | 'unknown_school'; message: string }`
  - `completeOnboarding(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult>`
  - `sendUnverifiedSchoolEmail(opts: { schoolName: string; country: string; organizerName: string }): Promise<void>` in `lib/email.ts`

**Background for the implementer:** the current `completeOnboarding` takes a `FormData` and throws — production replaces thrown Server Action messages with an opaque digest, so the client's `err.message` render is broken today. The rewrite returns structured results. The write goes through `claim_school`, which re-derives the FR name from the registry, so `input.name` is ignored entirely for France.

- [ ] **Step 1: Write the failing email test**

Create `lib/__tests__/unverified-school-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))
vi.mock('@/lib/email-log', () => ({ logEmailSend: vi.fn() }))

import { sendUnverifiedSchoolEmail } from '@/lib/email'

const OLD = { ...process.env }
beforeEach(() => {
  send.mockClear()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.FEEDBACK_EMAIL = 'ops@example.com'
})
afterEach(() => { process.env = { ...OLD } })

describe('sendUnverifiedSchoolEmail', () => {
  it('sends to FEEDBACK_EMAIL with the country and school in the subject line', async () => {
    await sendUnverifiedSchoolEmail({
      schoolName: 'Colegio San Miguel', country: 'Espagne', organizerName: 'Ana Ruiz',
    })
    expect(send).toHaveBeenCalledOnce()
    const arg = send.mock.calls[0][0]
    expect(arg.to).toBe('ops@example.com')
    expect(arg.subject).toContain('Colegio San Miguel')
    expect(arg.subject).toContain('Espagne')
    expect(arg.html).toContain('Ana Ruiz')
  })

  it('escapes HTML in the school name', async () => {
    await sendUnverifiedSchoolEmail({
      schoolName: '<script>alert(1)</script>', country: 'Italie', organizerName: 'X',
    })
    expect(send.mock.calls[0][0].html).not.toContain('<script>')
    expect(send.mock.calls[0][0].html).toContain('&lt;script&gt;')
  })

  it('skips silently when FEEDBACK_EMAIL is unset', async () => {
    delete process.env.FEEDBACK_EMAIL
    await sendUnverifiedSchoolEmail({ schoolName: 'X', country: 'Italie', organizerName: 'Y' })
    expect(send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run lib/__tests__/unverified-school-email.test.ts`
Expected: FAIL — `sendUnverifiedSchoolEmail is not a function`.

- [ ] **Step 3: Add the email function**

In `lib/email.ts`, add immediately after `sendFeedbackNotificationEmail` (around line 322):

```ts
// A school claimed with country != 'FR' skips the registry check, so it needs a
// pair of human eyes. Same posture as the feedback widget: best-effort, the row
// in `schools` is the source of truth, and FEEDBACK_EMAIL is optional.
// Triage: select id, name, country, created_at from schools where uai is null;
export async function sendUnverifiedSchoolEmail(opts: {
  schoolName: string
  country: string
  organizerName: string
}): Promise<void> {
  const to = process.env.FEEDBACK_EMAIL
  if (!to) return

  const html = layout(`
    <p><strong>Nouvel établissement non vérifié</strong></p>
    <p style="font-size:13px;color:#5C7268;">
      Pays déclaré : ${esc(opts.country)} — hors annuaire, aucune vérification automatique.
    </p>
    <p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">
      ${esc(opts.schoolName)}<br>
      <span style="font-size:13px;color:#5C7268;">Déclaré par ${esc(opts.organizerName)}</span>
    </p>
  `, ORG_FOOTER)
  await send(
    to,
    `Établissement à vérifier — ${opts.schoolName} (${opts.country})`,
    html,
    'unverified school notification',
  )
}
```

- [ ] **Step 4: Run the email test and make sure it passes**

Run: `pnpm exec vitest run lib/__tests__/unverified-school-email.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Rewrite the action test**

Replace the whole contents of `actions/__tests__/onboarding.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  user: { id: string } | null
  role: string
  rpc: { name: string; args: any } | null
  rpcResult: string | null
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from() {
      const b: any = {
        select: () => b, eq: () => b,
        single: async () => ({
          data: {
            id: 'u1', role: scenario.role, school_id: 's-1', full_name: 'Marie B.',
            email: 'a@b.com', org_role: 'owner', locale: 'fr',
            schools: { name: '', country: 'FR' },
          },
        }),
      }
      return b
    },
    rpc: async (name: string, args: any) => {
      scenario.rpc = { name, args }
      return { data: scenario.rpcResult, error: null }
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
const sendUnverifiedSchoolEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email', () => ({
  sendUnverifiedSchoolEmail: (...a: unknown[]) => sendUnverifiedSchoolEmail(...a),
}))

import { completeOnboarding } from '@/actions/onboarding'

beforeEach(() => {
  sendUnverifiedSchoolEmail.mockClear()
  scenario = { user: { id: 'u1' }, role: 'organizer', rpc: null, rpcResult: null }
})

describe('completeOnboarding — France', () => {
  it('claims the establishment by UAI and returns the registry name', async () => {
    scenario.rpcResult = 'Lycée Chevreul Lestonnac'
    const res = await completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' })
    expect(res).toEqual({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
    expect(scenario.rpc).toEqual({
      name: 'claim_school',
      args: { p_country: 'FR', p_uai: '0690574Z', p_name: null },
    })
  })

  it('ignores a client-supplied name — the registry row wins', async () => {
    scenario.rpcResult = 'Lycée Chevreul Lestonnac'
    const res = await completeOnboarding({ country: 'FR', uai: '0690574Z', name: 'Nom Falsifié' })
    expect(res).toEqual({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
    expect(scenario.rpc!.args.p_name).toBeNull()
  })

  it('rejects an unknown UAI with a structured result, never a throw', async () => {
    scenario.rpcResult = null
    const res = await completeOnboarding({ country: 'FR', uai: 'NOSUCH', name: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('unknown_school')
  })

  it('rejects a missing UAI before touching the database', async () => {
    const res = await completeOnboarding({ country: 'FR', uai: null, name: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid')
    expect(scenario.rpc).toBeNull()
  })

  it('sends no ops notification for a verified French school', async () => {
    scenario.rpcResult = 'Lycée Chevreul Lestonnac'
    await completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' })
    expect(sendUnverifiedSchoolEmail).not.toHaveBeenCalled()
  })
})

describe('completeOnboarding — other countries', () => {
  it('stores the typed name and notifies ops', async () => {
    scenario.rpcResult = 'Colegio San Miguel'
    const res = await completeOnboarding({
      country: 'Espagne', uai: null, name: '  Colegio San Miguel  ',
    })
    expect(res).toEqual({ ok: true, schoolName: 'Colegio San Miguel' })
    expect(scenario.rpc).toEqual({
      name: 'claim_school',
      args: { p_country: 'Espagne', p_uai: null, p_name: 'Colegio San Miguel' },
    })
    expect(sendUnverifiedSchoolEmail).toHaveBeenCalledWith({
      schoolName: 'Colegio San Miguel', country: 'Espagne', organizerName: 'Marie B.',
    })
  })

  it('rejects an empty name before touching the database', async () => {
    const res = await completeOnboarding({ country: 'Espagne', uai: null, name: '   ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid')
    expect(scenario.rpc).toBeNull()
  })

  it('rejects an empty country', async () => {
    const res = await completeOnboarding({ country: '  ', uai: null, name: 'Something' })
    expect(res.ok).toBe(false)
    expect(scenario.rpc).toBeNull()
  })

  it('still succeeds when the ops notification fails', async () => {
    scenario.rpcResult = 'Colegio San Miguel'
    sendUnverifiedSchoolEmail.mockRejectedValueOnce(new Error('resend down'))
    const res = await completeOnboarding({ country: 'Espagne', uai: null, name: 'Colegio San Miguel' })
    expect(res.ok).toBe(true)
  })
})

describe('completeOnboarding — auth', () => {
  it('rejects a non-organizer caller', async () => {
    scenario.role = 'student'
    await expect(completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' }))
      .rejects.toThrow('Unauthorized')
  })

  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    await expect(completeOnboarding({ country: 'FR', uai: '0690574Z', name: '' }))
      .rejects.toThrow('Unauthenticated')
  })
})
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `pnpm exec vitest run actions/__tests__/onboarding.test.ts`
Expected: FAIL — the action still takes `FormData` and throws.

- [ ] **Step 7: Rewrite the action**

In `actions/onboarding.ts`, add to the imports:

```ts
import { sendUnverifiedSchoolEmail } from '@/lib/email'
```

Then replace the whole `completeOnboarding` function (from its leading comment through its closing brace) with:

```ts
export type CompleteOnboardingInput = {
  /** 'FR' for France, otherwise the country's display name. */
  country: string
  /** The picked registry establishment's UAI. Required when country === 'FR'. */
  uai: string | null
  /** Free-typed school name. Required when country !== 'FR'; IGNORED for FR. */
  name: string
}

export type CompleteOnboardingResult =
  | { ok: true; schoolName: string }
  | { ok: false; error: 'invalid' | 'unknown_school'; message: string }

export const COUNTRY_REQUIRED_MESSAGE = 'Veuillez indiquer le pays de votre établissement.'
export const SCHOOL_REQUIRED_MESSAGE = 'Veuillez sélectionner votre établissement.'
export const SCHOOL_NAME_REQUIRED_MESSAGE = 'Veuillez renseigner le nom de votre établissement.'
export const UNKNOWN_SCHOOL_MESSAGE =
  'Cet établissement est introuvable dans l’annuaire officiel. Sélectionnez-le dans la liste.'

// Records which establishment the organizer's school IS (/onboarding step 1).
//
// For France the school must be picked from `school_registry`; the write goes
// through the claim_school() RPC, which re-derives the name from the registry
// row, so a crafted request cannot spoof a name. Neither schools.uai nor
// schools.country is client-updatable — the RPC is their only writer.
//
// Any other country skips the registry (no equivalent open dataset), stores
// uai = null, and pings ops so an unverified tenant is actually seen.
//
// Structured returns: production redacts thrown Server Action messages, and
// every outcome below is an expected one.
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const country = (input.country ?? '').trim()
  if (!country) return { ok: false, error: 'invalid', message: COUNTRY_REQUIRED_MESSAGE }

  const isFrance = country === 'FR'
  const uai = isFrance ? ((input.uai ?? '').trim() || null) : null
  const typedName = isFrance ? null : ((input.name ?? '').trim() || null)

  if (isFrance && !uai) {
    return { ok: false, error: 'invalid', message: SCHOOL_REQUIRED_MESSAGE }
  }
  if (!isFrance && !typedName) {
    return { ok: false, error: 'invalid', message: SCHOOL_NAME_REQUIRED_MESSAGE }
  }

  const { data: schoolName, error } = await supabase.rpc('claim_school', {
    p_country: country, p_uai: uai, p_name: typedName,
  })
  if (error) throw error
  // null = the RPC rejected the claim (unknown UAI is the only way to get here
  // after the guards above).
  if (!schoolName) return { ok: false, error: 'unknown_school', message: UNKNOWN_SCHOOL_MESSAGE }

  if (!isFrance) {
    // Best effort: the schools row is the source of truth, a Resend outage must
    // not fail onboarding.
    try {
      await sendUnverifiedSchoolEmail({
        schoolName, country, organizerName: profile.full_name ?? '',
      })
    } catch {
      console.error('[onboarding] unverified-school notification failed')
    }
  }

  revalidatePath('/dashboard')
  return { ok: true, schoolName }
}
```

- [ ] **Step 8: Run both suites and make sure they pass**

Run: `pnpm exec vitest run actions/__tests__/onboarding.test.ts actions/__tests__/search-schools.test.ts lib/__tests__/unverified-school-email.test.ts`
Expected: PASS — 21 tests. The `OnboardingForm` component test will fail at this point (it still calls the old signature); Task 7 fixes it.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add actions/onboarding.ts actions/__tests__/onboarding.test.ts lib/email.ts lib/__tests__/unverified-school-email.test.ts
git commit -m "feat(onboarding): completeOnboarding validates the UAI and returns structured results"
```

---

## Task 7: Onboarding step 1 UI — country select + establishment combobox

**Files:**
- Create: `app/onboarding/SchoolCombobox.tsx`
- Modify: `app/onboarding/OnboardingForm.tsx`
- Test: `app/onboarding/__tests__/OnboardingForm.test.tsx` (extend)

**Interfaces:**
- Consumes: `searchSchools`, `completeOnboarding`, `CompleteOnboardingResult` (Tasks 5–6); `formatSchoolOption`, `normalizeText`, `isSearchable`, `SchoolOption` (Task 2).
- Produces: `SchoolCombobox({ value, onSelect })`; `SUPPORT_EMAIL` constant.

**Background for the implementer:** `/onboarding` is hardcoded French — there is no `useTranslations` in this tree and none should be added. The repo's established select control is a native `<select>` (see `components/i18n/LanguageSwitcher.tsx`), not Radix. The step-1 form previously fed `initialSchoolName` into step 2's `sending_school_name`; keep that behaviour, now sourced from the action's returned registry name.

- [ ] **Step 1: Write the failing component tests**

In `app/onboarding/__tests__/OnboardingForm.test.tsx`, replace the `vi.mock('@/actions/onboarding', …)` block and the `beforeEach` with:

```tsx
const completeOnboarding = vi.fn()
const completeFirstExchange = vi.fn()
const searchSchools = vi.fn()
vi.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
  completeFirstExchange: (...a: unknown[]) => completeFirstExchange(...a),
  searchSchools: (...a: unknown[]) => searchSchools(...a),
}))
```

```tsx
const CHEVREUL = {
  id: 1, uai: '0690574Z', name: 'Lycée Chevreul Lestonnac', type: 'Lycée',
  status: 'Privé', commune: 'Lyon', postal_code: '69007',
}

beforeEach(() => {
  push.mockReset()
  completeOnboarding.mockReset().mockResolvedValue({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
  completeFirstExchange.mockReset().mockResolvedValue({ ok: true })
  searchSchools.mockReset().mockResolvedValue([CHEVREUL])
  inviteOrganizer.mockReset().mockResolvedValue(undefined)
})
```

Then replace the first test's step-1 block, and append the new step-1 suite. The full replacement for the first test:

```tsx
  it('walks school -> exchange -> invite, then reaches the dashboard', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()

    // Step 1: pick a real French establishment from the registry
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'FR', uai: '0690574Z', name: '',
    }))

    // Step 2: exchange name + required destination/dates; free-text cards optional
    await user.type(await screen.findByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    expect(completeFirstExchange.mock.calls[0][0]).toBe('Espagne 2026')
    expect(completeFirstExchange.mock.calls[0][1]).toMatchObject({
      destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
      sending_school_name: 'Lycée Chevreul Lestonnac',
    })

    // Step 3: invite step (optional)
    expect(await screen.findByText(/Invitez vos collègues/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })
```

And append this suite at the end of the file:

```tsx
describe('OnboardingForm — step 1 establishment gate', () => {
  it('defaults to France and shows the registry combobox, not a free-text name field', () => {
    render(<OnboardingForm />)
    expect(screen.getByLabelText('Pays')).toHaveValue('FR')
    expect(screen.getByLabelText('Votre établissement')).toHaveAttribute('role', 'combobox')
    expect(screen.queryByLabelText('Nom de l’établissement')).not.toBeInTheDocument()
  })

  it('searches only from two characters up, debounced', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'c')
    await waitFor(() => expect(searchSchools).not.toHaveBeenCalled())
    await user.type(screen.getByLabelText('Votre établissement'), 'h')
    await waitFor(() => expect(searchSchools).toHaveBeenCalledWith('ch'))
  })

  it('cannot submit until an establishment is picked', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled()
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('offers a contact link instead of a free-text fallback', async () => {
    render(<OnboardingForm />)
    const link = screen.getByRole('link', { name: /Je ne trouve pas mon établissement/ })
    expect(link.getAttribute('href')).toMatch(/^mailto:/)
  })

  it('says so when the registry returns nothing', async () => {
    searchSchools.mockResolvedValue([])
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'zzzz')
    expect(await screen.findByText('Aucun établissement trouvé.')).toBeInTheDocument()
  })

  it('swaps the combobox for a free-text name field on another country', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Pays'), 'Espagne')
    expect(screen.queryByLabelText('Votre établissement')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Nom de l’établissement'), 'Colegio San Miguel')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'Espagne', uai: null, name: 'Colegio San Miguel',
    }))
  })

  it('reveals a free-text country field for « Autre pays »', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Pays'), 'other')
    await user.type(screen.getByLabelText('Précisez le pays'), 'Canada')
    await user.type(screen.getByLabelText('Nom de l’établissement'), 'Collège Saint-Laurent')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'Canada', uai: null, name: 'Collège Saint-Laurent',
    }))
  })

  it('shows the server rejection and stays on step 1', async () => {
    completeOnboarding.mockResolvedValue({
      ok: false, error: 'unknown_school',
      message: 'Cet établissement est introuvable dans l’annuaire officiel. Sélectionnez-le dans la liste.',
    })
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText(/introuvable dans l’annuaire officiel/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nom du programme')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run app/onboarding/__tests__/OnboardingForm.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Pays`.

- [ ] **Step 3: Write the combobox**

Create `app/onboarding/SchoolCombobox.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { searchSchools } from '@/actions/onboarding'
import {
  formatSchoolOption, isSearchable, normalizeText, type SchoolOption,
} from '@/lib/schools/registry'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Where « Je ne trouve pas mon établissement » writes. Deliberately NOT a
// free-text fallback — that would reopen the door this gate closes. Schools
// abroad in the AEFE network are absent from the registry and land here.
export const SUPPORT_EMAIL = 'contact@eazyexchange.com'
const SEARCH_DEBOUNCE_MS = 250

export function SchoolCombobox({ value, onSelect }: {
  value: SchoolOption | null
  onSelect: (option: SchoolOption | null) => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<SchoolOption[]>([])
  const [searching, setSearching] = useState(false)
  // Monotonic ticket: a slow response for an older query must not overwrite a
  // newer one's results.
  const ticket = useRef(0)

  useEffect(() => {
    if (value) return
    const normalized = normalizeText(query)
    if (!isSearchable(normalized)) {
      setOptions([])
      setSearching(false)
      return
    }
    setSearching(true)
    const mine = ++ticket.current
    const timer = setTimeout(() => {
      void searchSchools(query)
        .then((rows) => {
          if (mine !== ticket.current) return
          setOptions(rows)
          setSearching(false)
        })
        .catch(() => {
          if (mine !== ticket.current) return
          setOptions([])
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, value])

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[#42506E]">Votre établissement</span>
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#C4CDE0] bg-[#F7F9FC] px-3 py-2.5">
          <span className="text-[14px] text-[#10203F]">{formatSchoolOption(value)}</span>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery('') }}
            className="flex-none text-[13px] font-semibold text-[#2456E6] hover:underline"
          >
            Changer
          </button>
        </div>
      </div>
    )
  }

  const showEmpty = !searching && isSearchable(normalizeText(query)) && options.length === 0

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="school-search" className="text-[13px] font-semibold text-[#42506E]">
        Votre établissement
      </Label>
      <Input
        id="school-search"
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls="school-options"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Commencez à taper le nom ou la ville…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 rounded-[10px] border-[#C4CDE0]"
      />
      <div id="school-options" role="listbox" aria-label="Établissements">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onSelect(option)}
            className="block w-full rounded-[8px] px-3 py-2 text-left text-[14px] text-[#10203F] hover:bg-[#EEF1F7]"
          >
            {formatSchoolOption(option)}
          </button>
        ))}
      </div>
      {searching && <p className="m-0 text-[12.5px] text-[#8A97B1]">Recherche…</p>}
      {showEmpty && <p className="m-0 text-[12.5px] text-[#8A97B1]">Aucun établissement trouvé.</p>}
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Établissement introuvable dans l’annuaire')}`}
        className="text-[12.5px] font-medium text-[#2456E6] hover:underline"
      >
        Je ne trouve pas mon établissement
      </a>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite step 1 of the form**

In `app/onboarding/OnboardingForm.tsx`:

1. Replace the `completeOnboarding, completeFirstExchange` import line with:

```tsx
import { completeOnboarding, completeFirstExchange } from '@/actions/onboarding'
import { SchoolCombobox } from './SchoolCombobox'
import type { SchoolOption } from '@/lib/schools/registry'
```

2. Immediately below the imports, add:

```tsx
// The five locales the app ships in, plus an escape hatch so a legitimate
// Canadian or American organizer is not turned away. 'FR' is the only value
// that unlocks the registry picker.
const COUNTRIES: { value: string; label: string }[] = [
  { value: 'FR', label: 'France' },
  { value: 'Allemagne', label: 'Allemagne' },
  { value: 'Espagne', label: 'Espagne' },
  { value: 'Italie', label: 'Italie' },
  { value: 'Royaume-Uni', label: 'Royaume-Uni' },
  { value: 'other', label: 'Autre pays' },
]
```

3. Replace the `const [schoolName, setSchoolName] = useState(initialSchoolName)` line with:

```tsx
  // Step 1: which establishment this school IS.
  const [schoolName, setSchoolName] = useState(initialSchoolName)
  const [country, setCountry] = useState('FR')
  const [otherCountry, setOtherCountry] = useState('')
  const [school, setSchool] = useState<SchoolOption | null>(null)
  const [foreignName, setForeignName] = useState('')
```

4. Replace the whole `handleName` function with:

```tsx
  const resolvedCountry = country === 'other' ? otherCountry.trim() : country
  const canSubmitStep1 = country === 'FR'
    ? school !== null
    : resolvedCountry !== '' && foreignName.trim() !== ''

  async function handleName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await completeOnboarding({
        country: resolvedCountry,
        uai: country === 'FR' ? school?.uai ?? null : null,
        name: country === 'FR' ? '' : foreignName.trim(),
      })
      if (!result.ok) { setError(result.message); return }
      setSchoolName(result.schoolName)
      setDetails(prev => ({
        ...prev,
        sending_school_name: prev.sending_school_name || result.schoolName,
      }))
      setStep(2)
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }
```

5. Replace the whole `if (step === 1) { … }` block with:

```tsx
  if (step === 1) {
    return (
      <form onSubmit={handleName} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="country" className="text-[13px] font-semibold text-[#42506E]">Pays</Label>
          <select
            id="country"
            value={country}
            onChange={e => { setCountry(e.target.value); setSchool(null); setError(null) }}
            className="h-11 rounded-[10px] border border-[#C4CDE0] bg-white px-3 text-[14px] text-[#10203F] focus:border-[#2456E6] focus:outline-none"
          >
            {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {country === 'other' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other-country" className="text-[13px] font-semibold text-[#42506E]">Précisez le pays</Label>
            <Input
              id="other-country" required value={otherCountry}
              onChange={e => setOtherCountry(e.target.value)}
              className="h-11 rounded-[10px] border-[#C4CDE0]"
            />
          </div>
        )}

        {country === 'FR' ? (
          <SchoolCombobox value={school} onSelect={setSchool} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="foreign-school" className="text-[13px] font-semibold text-[#42506E]">Nom de l’établissement</Label>
            <Input
              id="foreign-school" required value={foreignName}
              onChange={e => setForeignName(e.target.value)}
              className="h-11 rounded-[10px] border-[#C4CDE0]"
            />
            <p className="m-0 text-[12.5px] text-[#8A97B1]">
              Hors de France, nous vérifions votre établissement manuellement.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button
          type="submit" disabled={loading || !canSubmitStep1}
          className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7] disabled:opacity-50"
        >
          {loading ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }
```

- [ ] **Step 5: Run the component tests and make sure they pass**

Run: `pnpm exec vitest run app/onboarding/__tests__/OnboardingForm.test.tsx`
Expected: PASS — 12 tests.

- [ ] **Step 6: Check the French apostrophes**

```bash
grep -n "'" app/onboarding/SchoolCombobox.tsx app/onboarding/OnboardingForm.tsx | grep -v "^\S*:[0-9]*:\s*\(import\|export\|const\|import type\)" | grep "[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]"
```

Expected: no output. Any hit is a straight apostrophe inside French copy — replace it with `’`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add app/onboarding/SchoolCombobox.tsx app/onboarding/OnboardingForm.tsx app/onboarding/__tests__/OnboardingForm.test.tsx
git commit -m "feat(onboarding): country select + registry combobox replace the free-text school name"
```

---

## Task 8: Close the settings rename back door

**Files:**
- Modify: `lib/supabase/request.ts`, `actions/settings.ts`, `components/settings/ProfileCard.tsx`, `components/settings/SettingsView.tsx`, `app/(organizer)/settings/page.tsx`, `messages/{fr,en,es,it,de}.json`
- Test: `components/settings/__tests__/SettingsView.test.tsx` (extend), `actions/__tests__/settings-school-name-lock.test.ts` (new)

**Interfaces:**
- Consumes: `schools.country` (Task 1).
- Produces: `Profile.schools.country: string`; `SettingsProps.schoolCountry: string`; `ProfileCard` prop `schoolCountry: string`; message key `organizer.settings.profile.schoolNameLockedHint`.

**Background for the implementer:** `updateProfile` is the one place an owner can rewrite `schools.name` — the only client-updatable column on `schools`. Left alone it undoes the whole gate one screen later: pick a real lycée to get in, then rename to anything. The column grant on `name` stays, because non-FR schools legitimately rename through it.

- [ ] **Step 1: Write the failing action test**

Create `actions/__tests__/settings-school-name-lock.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { orgRole: string; country: string; updates: { table: string; row: any }[] }

// Mocking the auth preamble (rather than the whole supabase client) is this
// repo's pattern for actions/settings.ts — see settings.locale.test.ts.
vi.mock('@/lib/auth/require', () => ({
  requireUser: async () => ({ id: 'u1' }),
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: {
      id: 'u1', role: 'organizer', school_id: 's-1', full_name: 'Marie B.',
      email: 'a@b.com', org_role: scenario.orgRole, locale: 'fr',
      schools: { name: 'Lycée Chevreul Lestonnac', country: scenario.country },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      update: (row: any) => {
        scenario.updates.push({ table, row })
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

import { updateProfile } from '@/actions/settings'

beforeEach(() => {
  scenario = { orgRole: 'owner', country: 'FR', updates: [] }
})

const schoolWrites = () => scenario.updates.filter(u => u.table === 'schools')

describe('updateProfile — FR schools cannot be renamed', () => {
  it('ignores a submitted school name for a France-verified school', async () => {
    await updateProfile({ fullName: 'Marie B.', schoolName: 'Université Bidon' })
    expect(schoolWrites()).toEqual([])
    expect(scenario.updates.some(u => u.table === 'users')).toBe(true)
  })

  it('still renames a non-FR school', async () => {
    scenario.country = 'Espagne'
    await updateProfile({ fullName: 'Marie B.', schoolName: 'Colegio Nuevo' })
    expect(schoolWrites()).toEqual([{ table: 'schools', row: { name: 'Colegio Nuevo' } }])
  })

  it('still ignores an admin’s submitted school name', async () => {
    scenario.country = 'Espagne'
    scenario.orgRole = 'admin'
    await updateProfile({ fullName: 'Marie B.', schoolName: 'Colegio Nuevo' })
    expect(schoolWrites()).toEqual([])
  })

  it('still rejects an empty name for a non-FR school', async () => {
    scenario.country = 'Espagne'
    await expect(updateProfile({ fullName: 'Marie B.', schoolName: '  ' })).rejects.toThrow()
    expect(schoolWrites()).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run actions/__tests__/settings-school-name-lock.test.ts`
Expected: FAIL — the first case writes `{ name: 'Université Bidon' }`.

- [ ] **Step 3: Thread `country` through the profile**

In `lib/supabase/request.ts`, add `country` to the `Profile` type's `schools` embed:

```ts
  schools: {
    name: string
    country: string
    subscription_status: string | null
    plan: string | null
    grace_until: string | null
  } | null
```

and to the select string in `getProfile`:

```ts
    .select('id, role, school_id, full_name, email, org_role, locale, schools(name, country, subscription_status, plan, grace_until)')
```

- [ ] **Step 4: Lock the rename in the action**

In `actions/settings.ts`, add `country` to the `OrganizerCtx` type and to `getOrganizerCtx`:

```ts
type OrganizerCtx = {
  userId: string; schoolId: string; orgRole: 'owner' | 'admin'
  email: string; fullName: string; schoolCountry: string
}

async function getOrganizerCtx(opts?: { orgRole?: 'owner' }): Promise<OrganizerCtx> {
  const { user, profile } = await requireOrganizer(opts)
  return {
    userId: user.id, schoolId: profile.school_id,
    orgRole: (profile.org_role ?? 'admin') as 'owner' | 'admin',
    email: profile.email, fullName: profile.full_name,
    schoolCountry: profile.schools?.country ?? 'FR',
  }
}
```

Then replace the `if (ctx.orgRole === 'owner') { … }` block in `updateProfile` with:

```ts
  // Only the owner may rename the school, and only when the school is NOT
  // registry-verified. schools.name is the one client-updatable school column
  // (column grant from 20260701000001) — left open it would undo the signup
  // gate one screen later: pick a real lycée to get in, then rename to
  // anything. FR names come from school_registry via claim_school() and change
  // only through support. Non-FR schools legitimately rename through here, so
  // the grant stays. Ignored rather than rejected, mirroring the admin case
  // below and avoiding a redacted-error dead end in production; the field is
  // read-only in the UI.
  const schoolIsVerified = ctx.schoolCountry === 'FR'
  if (ctx.orgRole === 'owner' && !schoolIsVerified) {
    const schoolName = input.schoolName.trim()
    if (!schoolName) throw new Error(t('settings.errors.schoolNameEmpty'))
    const { error: schoolError } = await supabase.from('schools')
      .update({ name: schoolName }).eq('id', ctx.schoolId)
    if (schoolError) throw schoolError
  }
```

- [ ] **Step 5: Run the action test and make sure it passes**

Run: `pnpm exec vitest run actions/__tests__/settings-school-name-lock.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Add the message key to all five catalogs**

In each file, add `schoolNameLockedHint` directly after the existing `schoolNameHint` line inside `organizer.settings.profile` (remember to add the comma to the preceding line):

`messages/fr.json`:
```json
        "schoolNameHint": "Seul le propriétaire peut modifier le nom de l’établissement.",
        "schoolNameLockedHint": "Établissement vérifié auprès de l’annuaire de l’Éducation nationale. Contactez le support pour en changer."
```

`messages/en.json`:
```json
        "schoolNameHint": "Only the owner can change the school name.",
        "schoolNameLockedHint": "School verified against the French national education registry. Contact support to change it."
```

`messages/es.json`:
```json
        "schoolNameLockedHint": "Centro verificado en el registro nacional de educación francés. Contacte con el soporte para cambiarlo."
```

`messages/it.json`:
```json
        "schoolNameLockedHint": "Istituto verificato nel registro nazionale francese dell’istruzione. Contatta l’assistenza per modificarlo."
```

`messages/de.json`:
```json
        "schoolNameLockedHint": "Schule im französischen nationalen Bildungsverzeichnis verifiziert. Wenden Sie sich an den Support, um sie zu ändern."
```

(For es/it/de, place the new key after that file's own `schoolNameHint` line and add the trailing comma to it, exactly as shown for fr/en.)

- [ ] **Step 7: Verify catalog parity**

Run: `pnpm exec vitest run messages/__tests__/parity.test.ts`
Expected: PASS — all five locales share the fr key set.

- [ ] **Step 8: Write the failing component test**

In `components/settings/__tests__/SettingsView.test.tsx`, add `schoolCountry: 'Espagne'` to `baseProps` (so the existing editable-field tests keep passing), and append:

```tsx
describe('SettingsView — the school name is locked for verified French schools', () => {
  it('an owner cannot edit the name of a registry-verified school', () => {
    render(<SettingsView {...baseProps} isOwner={true} schoolCountry="FR" />)
    expect(screen.getByLabelText('Établissement')).toBeDisabled()
    expect(screen.getByText(/vérifié auprès de l’annuaire/)).toBeInTheDocument()
  })

  it('an owner can still edit the name of a school outside France', () => {
    render(<SettingsView {...baseProps} isOwner={true} schoolCountry="Espagne" />)
    expect(screen.getByLabelText('Établissement')).toBeEnabled()
    expect(screen.queryByText(/vérifié auprès de l’annuaire/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 9: Run it to make sure it fails**

Run: `pnpm exec vitest run components/settings/__tests__/SettingsView.test.tsx`
Expected: FAIL — the field is still enabled for `schoolCountry="FR"`.

- [ ] **Step 10: Make the field read-only**

In `components/settings/ProfileCard.tsx`, change the signature and the `schoolName` field entry:

```tsx
export function ProfileCard({ profile, isOwner, schoolCountry }: {
  profile: { fullName: string; email: string; schoolName: string }
  isOwner: boolean
  schoolCountry: string
}) {
```

```tsx
  // A France-verified school's name comes from school_registry and is not
  // client-writable (see updateProfile). Changing establishment is a rare,
  // support-worthy event.
  const schoolLocked = schoolCountry === 'FR'
  const fields: { key: keyof typeof f | 'email'; label: string; disabled?: boolean; hint?: string }[] = [
    { key: 'fullName', label: t('settings.profile.fullNameLabel') },
    { key: 'email', label: t('settings.profile.emailLabel'), disabled: true, hint: t('settings.profile.emailHint') },
    {
      key: 'schoolName', label: t('settings.profile.schoolNameLabel'),
      disabled: !isOwner || schoolLocked,
      hint: schoolLocked
        ? t('settings.profile.schoolNameLockedHint')
        : isOwner ? undefined : t('settings.profile.schoolNameHint'),
    },
  ]
```

In `components/settings/SettingsView.tsx`, add `schoolCountry: string` to `SettingsProps` (right after `isOwner: boolean`) and pass it down:

```tsx
              <ProfileCard profile={props.profile} isOwner={props.isOwner} schoolCountry={props.schoolCountry} />
```

In `app/(organizer)/settings/page.tsx`, add the prop to the `<SettingsView>` call, directly after `isOwner={isOwner}`:

```tsx
      schoolCountry={profile.schools?.country ?? 'FR'}
```

- [ ] **Step 11: Run the component test and make sure it passes**

Run: `pnpm exec vitest run components/settings/__tests__/SettingsView.test.tsx`
Expected: PASS — the two new cases plus the pre-existing ones.

- [ ] **Step 12: Commit**

```bash
git branch --show-current
git add lib/supabase/request.ts actions/settings.ts actions/__tests__/settings-school-name-lock.test.ts \
        components/settings/ProfileCard.tsx components/settings/SettingsView.tsx \
        components/settings/__tests__/SettingsView.test.tsx \
        'app/(organizer)/settings/page.tsx' \
        messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(settings): a registry-verified school name is read-only and unwritable"
```

---

## Task 9: Full gate, preview check, prod rollout and backfill

**Files:** none created; `types/supabase.ts` may be regenerated.

**Interfaces:** consumes everything above.

**This task is human-gated.** Steps 4 onward touch production and require Bjorn's explicit go-ahead.

- [ ] **Step 1: Run the full verification gate**

```bash
pnpm lint
pnpm test
pnpm build
set -a; source .env.staging; set +a
RLS_TEST_DB_URL="$STAGING_DB_URL" pnpm test:rls
```

Expected: all four green. Report the exact output of any failure rather than working around it.

- [ ] **Step 2: Verify the picker on a preview deployment**

Push the branch, open its Vercel Preview (previews are backed by staging, which already has the migration and the synced registry). Preview URLs are SSO-protected — fetch them with the Vercel MCP `web_fetch_vercel_url` tool, or open in a browser.

Check by hand:
1. Sign up / log in as a fresh organizer → `/onboarding` step 1 shows the **Pays** select defaulting to France and the establishment combobox.
2. Type `chevreul` → results appear within ~1s, formatted « Lycée Chevreul Lestonnac — 69007 Lyon · Privé ».
3. Pick one → the chip replaces the input, **Continuer** enables, step 2 shows the registry name pre-filled as « Lycée d'origine ».
4. Switch **Pays** to Espagne → the combobox is replaced by a free-text name field.
5. `/settings` → **Compte** → Établissement is disabled with the "vérifié auprès de l'annuaire" hint.

Note: staging sends no email, so the ops notification for a non-FR claim degrades to a console warning there — that is expected, not a bug.

- [ ] **Step 3: Get Bjorn's go-ahead before touching production**

Report the gate results and the preview findings, then stop and ask. Everything below writes to the live database.

- [ ] **Step 4: Apply the migration to production**

Use the Supabase MCP `apply_migration` tool with `name` = `school_registry` and the exact SQL from the migration file. Do **not** run `supabase db push` against prod.

- [ ] **Step 5: Reconcile the migration filename with the ledger**

Call MCP `list_migrations`. If prod stamped a version different from the local filename:

```bash
git mv supabase/migrations/<local-ts>_school_registry.sql supabase/migrations/<stamped-ts>_school_registry.sql
```

Then confirm every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

- [ ] **Step 6: Sync the registry into production**

```bash
SCHOOL_REGISTRY_DB_URL='<prod connection string>' pnpm sync:schools
```

Expected: `[sync] done — school_registry now holds 14611 rows` (±, the upstream dataset drifts).

- [ ] **Step 7: Regenerate types from production**

Call MCP `generate_typescript_types`, overwrite `types/supabase.ts` **verbatim**, then:

```bash
npx tsc --noEmit
git diff --stat types/supabase.ts
```

Expected: `tsc` exits 0. The diff against the staging-generated version should be empty or trivial; anything else means staging and prod have drifted — stop and report.

- [ ] **Step 8: Backfill the five production schools**

List them first (MCP `execute_sql`):

```sql
select id, name, country, uai, created_at from schools order by created_at;
```

For each real school (not a test/demo row), find its registry match:

```sql
select id, uai, name, commune, postal_code
from school_registry
where search_text like '%<normalized fragment of the school name>%'
limit 10;
```

Then set the UAI, one statement per school:

```sql
update schools set uai = '<UAI>', country = 'FR' where id = '<school-uuid>';
```

Test/demo rows keep `uai = null` and correctly surface in the unverified list. **Record every statement you ran in the PR description.**

Verify what is left unverified:

```sql
select id, name, country, created_at from schools where uai is null;
```

- [ ] **Step 9: Merge**

Per CLAUDE.md, merging to `main` deploys to production and needs the Verifying Changes commands to pass **and** Bjorn's confirmation. Re-run the gate from Step 1 against the final tree, then ask.

```bash
git branch --show-current
git log origin/main..main   # check what else is riding along before pushing
```

- [ ] **Step 10: Post-merge smoke check on production**

1. `/onboarding` for a fresh organizer — search returns real establishments.
2. `select count(*) from school_registry;` returns >14 000.
3. `/settings` shows the locked Établissement field for a verified school.

---

## Notes for Bjorn

Two things need your decision, neither blocking implementation:

1. **`contact@eazyexchange.com`** is what « Je ne trouve pas mon établissement » writes to (Deviation 7). The repo has no support address anywhere — the legal pages still carry `[PLACEHOLDER : e-mail]`. Confirm this inbox exists or name the right one; it is a one-constant change in `app/onboarding/SchoolCombobox.tsx`.
2. **French schools abroad (AEFE network)** are absent from the dataset — it is metropolitan + DOM only. `Lycée français de Madrid` and friends will land on that contact link. They can also be onboarded through the « Autre pays » path today, which is probably the right answer; say if you want the copy to point them there explicitly.
