# School registry signup gate — design

**Date:** 2026-07-23
**Status:** approved, ready for planning
**Branch:** `feature/school-registry-signup-gate`

## Problem

Organizer signup is fully open. `/signup` creates an auth user; `lib/auth/provision.ts`
creates a `schools` row with an empty name; `/onboarding` step 1 captures the school
name as **free text**. Nothing validates that the school exists.

Two consequences motivate this work:

1. **Fake and throwaway accounts.** Anyone can burn a free trial under a junk school
   name. Nothing distinguishes a real lycée from `asdf`.
2. **Child-data safety.** The app stores minors' PII. Only genuine institutions should
   be able to open an account and start collecting it.

Data quality and lead qualification are pleasant side effects, not the goal.

## Scope

**In scope:** France, verified against the official registry. The other four locales get
a free-text path flagged for manual review.

**Out of scope (deliberately):**

- Verifying that the *person* signing up actually works at the school. The decision was
  "school is real (only)" — instant self-serve signup, zero manual work in the FR path.
  No professional-email requirement, no manual approval queue, no confirmation mail to
  the school's official address.
- Registries for ES / IT / DE / other countries.
- Deduplicating two organizers from the same school into one tenant. Today they get
  separate tenants; that stays true. Verification is about realness, not deduplication,
  and hard-blocking a second signup from the same UAI would be a support burden with a
  PII-leak shaped error message.

## Data source

`data.education.gouv.fr`, dataset `fr-en-annuaire-education` (Opendatasoft v2.1 API,
public, no key).

Filter: `type_etablissement in ("Lycée","Collège") and etat="OUVERT"` — **14 611 rows**,
4.5 MB, retrievable in a single call to the `/exports/json` endpoint.

The paged `/records` endpoint caps `offset` at 10 000, which is below our row count, so
`/exports/json` is the only endpoint that can return the whole set. Fields selected:

```
identifiant_de_l_etablissement  nom_etablissement       type_etablissement
statut_public_prive             nom_commune             code_postal
libelle_departement             libelle_academie
```

**Known limitation:** the dataset is metropolitan + DOM France only. French schools
abroad (AEFE network, e.g. Lycée français de Madrid) are absent and will land on the
"I can't find my school" contact link.

## Architecture

### Chosen approach: local snapshot table

The registry is imported into a Supabase table; the onboarding autocomplete queries our
own database.

Rejected alternatives:

- **Live API proxy** (route handler forwards each keystroke to Opendatasoft). Puts a
  third-party government API on the critical path of every signup — an outage, a
  rate-limit against Vercel's shared egress IPs, or ordinary latency (300–600 ms per
  keystroke) either locks out real customers or makes the gate fall open. A gate that
  depends on someone else's uptime is not a gate.
- **Hybrid** (snapshot primary, live API when a search returns nothing). Doubles the code
  and error paths to cover an event that happens a few times a year, which a manual
  re-sync already covers.

### `school_registry` table

```sql
create table school_registry (
  id           bigserial primary key,
  uai          text not null,   -- official RNE/UAI code, e.g. '0690574Z'
  name         text not null,
  type         text not null,   -- 'Collège' | 'Lycée'
  status       text not null,   -- 'Public' | 'Privé'
  commune      text not null,
  postal_code  text not null,
  department   text,
  academy      text,
  search_text  text not null    -- unaccented lowercase "name commune postal_code"
);
create index school_registry_search_idx
  on school_registry using gin (search_text gin_trgm_ops);
```

**Why a surrogate primary key.** UAI is *not* unique in the source: 65 codes are shared
by multi-site establishments (`Collège Jean-Marie Pelt` and its annexe both carry
`0572025S`; `Lycée Chevreul Lestonnac` and its Saint-Didier site both carry `0690574Z`).
`(uai, name)` still collides 8 times, and `(uai, name, postal_code)` twice. No natural
key is reliable, so the table gets a surrogate id and the sync avoids upserts entirely.

Keeping both rows of a duplicate pair is correct: an organizer may well search for the
annexe by name, and both entries are real schools. Verification only asks "does this UAI
exist in the registry", which both satisfy.

Only the `pg_trgm` extension is required. Accent stripping happens in JavaScript on both
sides — the sync script builds `search_text`, and `lib/schools/registry.ts` normalizes
the incoming query — so Postgres `unaccent` is **not** needed. Search is
`search_text ilike '%' || q || '%'`, which the trigram GIN index accelerates; ordering
puts prefix matches on `name` first, then the rest, limit 8.

**RLS:** enabled, one `select` policy granted to `anon` and `authenticated`. This is
public open government data containing no PII. No client `insert`/`update`/`delete`
grants.

### Sync script

`scripts/sync-school-registry.mjs`, run as `pnpm sync:schools`.

Fetches the export, then performs a **full replace inside one transaction**
(`delete from school_registry` + bulk insert) using the `postgres` client already in
`package.json`. MVCC means no concurrent reader ever observes an empty table, and no
upsert-key design is needed — which matters given no natural key exists.

Nothing holds a foreign key to `school_registry` (see below), so a full replace is safe.

The script uses the service role via a direct connection string, like
`scripts/seed-demo.mjs`. It is **not** app code, so `lib/supabase/admin`'s import
allowlist (`lib/supabase/__tests__/admin-allowlist.test.ts`) is untouched.

Cadence: manual, roughly once a term. The underlying data changes a handful of times a
year.

### `schools` table changes

```sql
alter table schools
  add column uai     text null,
  add column country text not null default 'FR';
```

`uai` is set only by picking a registry row. `null` means unverified (non-FR, or a
legacy row).

**No foreign key to `school_registry`** — deliberate. If a school closes and drops out of
a future sync, an existing paying customer must not break.

Column grants: `uai` and `country` are **not** added to the client-updatable column grant
on `schools` (which today covers only `name`, per `20260701000001`). Both are written
server-side by the onboarding action.

## Flow

### `/onboarding` step 1

Replaces the current free-text "Votre établissement" input with:

- A country select, defaulting to **France**. Exact options: France, Allemagne, Espagne,
  Italie, Royaume-Uni, and « Autre pays ». Choosing « Autre pays » reveals a free-text
  country field, so a legitimate Canadian or American organizer is not turned away.
  `schools.country` stores `'FR'` for France and the chosen (or typed) country name
  otherwise.
- **France →** a combobox. Typing ≥ 2 characters fires a debounced (250 ms)
  `searchSchools(query)` server action, returning at most 8 rows rendered as
  « Lycée Chevreul Lestonnac — 69007 Lyon · Privé ». Selecting a row holds its `uai` in
  component state. There is no free-text field.
- Below the box, « Je ne trouve pas mon établissement » opens a contact link. It is
  **not** a free-text fallback — that would reopen the door this feature closes.
- **Any other country →** a plain school-name text field.

### `searchSchools(query)` server action

Behind `requireOrganizer()`. Normalizes the query (trim, lowercase, strip accents),
requires ≥ 2 characters, queries `school_registry`, returns at most 8 rows. No rate
limiter: the data is public, the action is authenticated, and a fail-closed limiter on a
search box would break onboarding when the limiter breaks.

### `completeOnboarding` changes

Converted from `throw`-based to a **structured return** (`{ ok: true } | { ok: false;
error; message }`), per the Server Action redaction rule in CLAUDE.md. The current
version throws, and the client reads `err.message` — which production redacts.

Server-side re-validation:

- `country === 'FR'`: look the submitted `uai` up in `school_registry`. Unknown UAI →
  structured rejection. On success write `schools.name` **from the registry row**, never
  from client input, plus `uai` and `country = 'FR'`. A crafted request therefore cannot
  spoof the displayed name.
- Other country: require a non-empty name; write `name`, `country`, `uai = null`; fire
  the ops notification (below).

### The onboarding gate

`lib/onboarding/gate.ts`'s `mustOnboard(schoolName, ownedExchangeCount)` keeps its
current shape — `schoolName === '' || ownedExchangeCount === 0`.

The FR invariant "`name` is only ever written together with a `uai`" is enforced in the
single action that writes it, rather than duplicated into the gate predicate. This also
means existing schools (all of which have names) keep working untouched.

### Non-FR review path

A school claimed with `country != 'FR'` is written with `uai = null` and triggers a
notification email to the ops address, using the existing `lib/email.ts` +
`FEEDBACK_EMAIL` path — so a new unverified school actually reaches Bjorn rather than
sitting unnoticed in a table.

Triage query, run by hand in the Supabase dashboard:

```sql
select id, name, country, created_at from schools where uai is null;
```

No admin UI. Same posture as `error_reports`.

### Closing the settings back door

`actions/settings.ts` → `updateOrganizerSettings` currently lets an owner rewrite
`schools.name` to arbitrary free text (`schools.name` is the one client-updatable school
column). Left alone this undoes the gate one screen later: pick a real lycée to get in,
then rename to anything.

**Decision:** for `country = 'FR'`, the settings school-name field becomes **read-only**,
displaying the registry name with a note to contact support to change establishment.
Non-FR keeps its free-text field.

Changing school is a rare, support-worthy event; this is materially less code than
embedding a second picker in settings. (The considered alternative — reuse the combobox
in settings so an owner can re-pick — was rejected as roughly half a day more work for a
rare case.)

Enforcement lives in `updateOrganizerSettings`, which rejects a name change when the
caller's school has `country = 'FR'`; the read-only field is the UI half of the same
rule. The column grant on `schools.name` **stays** — non-FR schools still legitimately
rename through it.

## Backfill

Production currently holds **5 schools, all named, 1 with a paid subscription.**

Because `mustOnboard` still keys off `name`, every existing school keeps working with no
forced re-onboarding and no dual-mode code. Backfill is therefore a data-quality step,
not a correctness requirement:

- After the prod sync runs, match the real schools against `school_registry` by name and
  set their `uai` by hand via SQL. Record the statements in the PR.
- Test/demo rows keep `uai = null` and correctly surface in the unverified list.

## Testing

**Unit**

- Query normalization + result formatting helper (`lib/schools/registry.ts`).
- `completeOnboarding`: FR happy path; unknown UAI rejected; non-FR path; empty name;
  client-supplied name ignored in favour of the registry row.
- `searchSchools`: below-minimum query returns empty; result cap of 8.

**Component**

- `OnboardingForm` step 1: country switch swaps combobox ↔ text field; results render;
  submit carries the `uai`; "school not found" link present.

**RLS matrix**

`school_registry` is a new table, so per CLAUDE.md it ships with cases in `tests/rls/` in
the same PR: `anon` can `select`; neither `anon` nor `authenticated` can
`insert`/`update`/`delete`. `pnpm test:rls` must pass.

The sync script is not unit-tested; it is verified by running it against staging first.

## Rollout order

1. Migration applied to **staging** (`supabase db push --db-url "$STAGING_DB_URL"`).
2. Sync script against staging.
3. Verify the picker on a preview deployment.
4. Migration to **prod** via MCP `apply_migration`; reconcile the filename against
   `list_migrations`.
5. Sync script against prod.
6. Regenerate `types/supabase.ts` via MCP `generate_typescript_types`; `npx tsc --noEmit`.
7. Backfill the 5 prod `schools.uai` values by hand.

## Coordination

- Another session is on `feature/single-tab-signup-confirm`, which reworks `/signup` and
  the confirm route. File overlap is small — that branch touches signup, this one touches
  `/onboarding` — but **`supabase/migrations/` is single-writer**. If that branch adds a
  migration, one session waits.
- This work runs in the worktree `feature/school-registry-signup-gate`.

## Files touched (expected)

| File | Change |
| --- | --- |
| `supabase/migrations/<ts>_school_registry.sql` | new table + RLS + extensions; `schools.uai`, `schools.country` |
| `scripts/sync-school-registry.mjs` | new — fetch + transactional full replace |
| `package.json` | `sync:schools` script |
| `lib/schools/registry.ts` | new — query normalization, result shape, formatting |
| `actions/onboarding.ts` | `searchSchools`; `completeOnboarding` → structured return + UAI validation |
| `app/onboarding/OnboardingForm.tsx` | step 1: country select + combobox |
| `actions/settings.ts` | reject school rename when `country = 'FR'` |
| `app/settings/…` | read-only school name for FR |
| `types/supabase.ts` | regenerated |
| `tests/rls/…` | `school_registry` matrix cases |
| tests | as listed above |
