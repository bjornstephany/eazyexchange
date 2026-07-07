# Debt Guardrails Sprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardrails + documentation only — heal the migration ledger, replace hand-maintained DB types with generated ones, promote tribal knowledge into the repo, and extract shared auth-preamble helpers. Zero runtime behavior change.

**Architecture:** Four independent workstreams on one branch (`chore/debt-guardrails`), executed strictly in order §1→§2→§3→§4 because the docs (§3) describe the final types workflow (§2), which assumes the healed ledger (§1). The §4 sweep touches every `actions/*.ts` file, so no other branch may be open during this sprint.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (supabase-js 2.108, @supabase/ssr 0.12), TypeScript 5, Vitest 4. Spec: `docs/superpowers/specs/2026-07-07-debt-guardrails-design.md`.

## Global Constraints

- **Zero runtime behavior change.** Thrown error strings are load-bearing and must be preserved **verbatim**: `'Unauthenticated'`, `'Unauthorized'`, `'No profile'`, `'Réservé au propriétaire du compte.'`.
- **All 555 existing tests pass UNMODIFIED.** Editing any existing test file to make it pass = the task is wrong, stop and report. (New test files for new helpers are allowed.)
- Gate before merge: `pnpm lint`, `pnpm test` (555 existing + new), `npx tsc --noEmit`. **`pnpm build` does NOT run locally** (`.env.local` has placeholders) — `tsc --noEmit` is the type gate.
- Branch: `chore/debt-guardrails` off `main`. No other branch open while this sprint runs.
- Package manager is **pnpm**, never npm.
- Migration files: **rename only** (`git mv`) — never edit migration SQL content.
- Never log student/parent PII.
- Commit after every green step; stage **only named files** (never `git add -A` / `git add .` — untracked PDFs in `docs/` are student PII).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/*` (7 files) | rename | match prod ledger versions |
| `types/supabase.ts` | create | generated verbatim from live schema; never hand-edited |
| `types/db.ts` | rewrite | app-facing module: closed unions + narrow aliases over generated rows |
| `actions/*.ts` (8 files) | modify | drop `as any` escapes (Task 3); use auth helpers (Task 7) |
| `CLAUDE.md` | modify | migration workflow, error-redaction rule, auth-helper convention, applications.ts tripwire |
| `docs/DEPLOY.md` | modify | preview loop, invite-template config, env inventory, dashboard steps |
| `lib/auth/require.ts` | create | `requireUser` / `requireOrganizer` / `requireStudent` |
| `lib/auth/__tests__/require.test.ts` | create | helper unit tests |
| `lib/dates.ts` | create | `frShortDate` (moved from dashboard module) |
| `lib/dashboard/rollup.ts` | modify | re-export `frShortDate` from `lib/dates` |
| `lib/email.ts` | modify | import `frShortDate` from `@/lib/dates` |

---

### Task 1: Heal the migration ledger (7 renames)

**Files:**
- Rename: 7 files in `supabase/migrations/` (list below)

**Interfaces:**
- Consumes: nothing.
- Produces: a `supabase/migrations/` directory whose filenames are byte-identical to prod's ledger versions. Tasks 2 and 4 assume this is done.

Background: MCP `apply_migration` stamped its own version timestamps in prod's ledger for 7 migrations, so the local filenames drifted. Prod is correct; only local files move. Renames don't touch prod. The ledger was re-verified against prod on 2026-07-07 while writing this plan (via MCP `list_migrations`) — the table below is confirmed current.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --ff-only && git checkout -b chore/debt-guardrails
```

- [ ] **Step 2: Verify content-safety of the renames**

The renames are safe iff each local file's slug matches the ledger's `name` for the target version (the SQL content is what MCP applied — the filename is the only drift). Confirm each pair exists locally under the old name and NOT under the new name:

```bash
cd supabase/migrations
for f in 20260703000002_documents_organizer_delete 20260703000003_fix_storage_policy_name_resolution 20260705000001_stable_rls_helpers 20260705000002_fk_indexes 20260705000003_fk_indexes_followup 20260705000004_rls_initplan_select_wrap 20260707000001_exchanges_school_b_nullable; do
  ls "$f.sql" >/dev/null || echo "MISSING: $f"
done
```

Expected: no output (all 7 present). If any is missing, STOP — the tree changed since planning; re-check against `list_migrations`.

- [ ] **Step 3: Rename all 7 files**

```bash
cd supabase/migrations
git mv 20260703000002_documents_organizer_delete.sql          20260703172826_documents_organizer_delete.sql
git mv 20260703000003_fix_storage_policy_name_resolution.sql  20260703222526_fix_storage_policy_name_resolution.sql
git mv 20260705000001_stable_rls_helpers.sql                  20260705172941_stable_rls_helpers.sql
git mv 20260705000002_fk_indexes.sql                          20260705172949_fk_indexes.sql
git mv 20260705000003_fk_indexes_followup.sql                 20260705173212_fk_indexes_followup.sql
git mv 20260705000004_rls_initplan_select_wrap.sql            20260705173309_rls_initplan_select_wrap.sql
git mv 20260707000001_exchanges_school_b_nullable.sql         20260707131801_exchanges_school_b_nullable.sql
```

- [ ] **Step 4: Verify the local list now matches the prod ledger exactly**

Prod ledger (39 versions, verified 2026-07-07):

```
20260624000001 20260624000002 20260625000001 20260625000002 20260625000003
20260625000004 20260625000005 20260627000001 20260627000002 20260628000001
20260628000002 20260628000003 20260628000004 20260628000005 20260628000006
20260628000007 20260628000008 20260629000001 20260629000002 20260630000001
20260630000002 20260630000003 20260630000004 20260630000005 20260701000001
20260701000002 20260702000001 20260703000001 20260703172826 20260703222526
20260704000001 20260705172941 20260705172949 20260705173212 20260705173309
20260706000001 20260707000002 20260707000003 20260707131801
```

```bash
ls supabase/migrations/ | sed 's/_.*//' | sort > /tmp/local-versions.txt
# paste the 39 versions above, one per line, sorted, into /tmp/ledger-versions.txt
diff /tmp/local-versions.txt /tmp/ledger-versions.txt && echo LEDGER-CLEAN
```

Expected: `LEDGER-CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "chore: heal migration ledger — rename 7 drifted files to prod versions"
```

(`git add supabase/migrations/` is safe here: `git status` must show exactly 7 renames and nothing else — verify with `git status --short` before committing.)

---

### Task 2: Generated DB types (`types/supabase.ts`) + `types/db.ts` aliases

**Files:**
- Create: `types/supabase.ts` (generated, committed verbatim)
- Rewrite: `types/db.ts`

**Interfaces:**
- Consumes: live schema via MCP `generate_typescript_types` (controller runs this; the tool takes no arguments and returns the full file content).
- Produces: `types/db.ts` keeps exporting **exactly these names** (all existing consumers keep compiling unchanged): `Role`, `OrgRole`, `FormType`, `TemplateKind`, `TemplateStatus`, `TemplateAudience`, `SubmissionStatus`, `FieldType`, `ApplicationStatus`, `SubscriptionStatus`, `School`, `Exchange`, `UserProfile`, `ExchangeEnrollment`, `FormTemplate`, `FormField`, `DocumentSlot`, `Assignment`, `Submission`, `FieldAnswer`, `DocumentUpload`, `Application`, `OrganizerInvite`, `RateLimit`, `Feedback`, `Database`. New re-exports: `Json`, `Tables`, `TablesInsert`, `TablesUpdate`.
- The four client files (`lib/supabase/server.ts`, `admin.ts`, `client.ts`, `middleware.ts`) already do `createXClient<Database>` with `Database` imported from `@/types/db` — **they need zero changes**; swapping what `db.ts` exports as `Database` is what types them against the generated schema.

- [ ] **Step 1: Generate `types/supabase.ts`**

Run the MCP tool `mcp__supabase__generate_typescript_types` and write its returned TypeScript **verbatim** to `types/supabase.ts`. Do not edit it — add only this header comment at the top:

```ts
// GENERATED FILE — do not hand-edit.
// Regenerate after every migration: MCP generate_typescript_types → overwrite this file.
// App code imports from types/db.ts, which narrows these rows.
```

Verify the helpers exist:

```bash
grep -c "export type Tables<" types/supabase.ts   # expect 1
grep -c "export type Database" types/supabase.ts  # expect 1
```

If (unlikely, generator-version dependent) `Tables<` is absent, append these local helpers to the BOTTOM of `types/db.ts` instead of importing them:

```ts
type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
```

- [ ] **Step 2: Rewrite `types/db.ts`**

Replace the entire file with the following. The unions are copied verbatim from the current file; each row type becomes an alias over the generated row, narrowed only where the app relies on a closed union (`Override`'s `Narrow extends Partial<Row>` constraint is the drift anchor: a renamed/removed/retyped column makes the override a compile error).

```ts
// App-facing DB types. types/supabase.ts is GENERATED from the live schema —
// regenerate it after every migration (see CLAUDE.md → Database). This module
// narrows generated rows with the app's closed unions; if a migration isn't
// re-generated, the aliases below break the build instead of drifting silently.
import type { Tables } from './supabase'

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './supabase'

export type Role = 'organizer' | 'student'
export type OrgRole = 'owner' | 'admin'
export type FormType = 'data_entry' | 'document_upload'
export type TemplateKind = 'online' | 'pdf' | 'doc'
export type TemplateStatus = 'draft' | 'active'
export type TemplateAudience = 'all' | 'conditional'
export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type FieldType = 'text' | 'textarea' | 'date' | 'checkbox' | 'select'
export type ApplicationStatus =
  | 'draft' | 'submitted' | 'rejected' | 'accepted' | 'declined' | 'maybe' | 'enrolling' | 'enrolled'

export type SubscriptionStatus =
  | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete'

// Narrow chosen columns of a generated row to the app's closed unions.
// `Narrow extends Partial<Row>` anchors every override to a real column with a
// compatible type — schema drift here is a compile error, not silence.
type Override<Row, Narrow extends Partial<Row>> = Omit<Row, keyof Narrow> & Narrow

export type School = Override<Tables<'schools'>, {
  subscription_status: SubscriptionStatus | null
  plan: 'starter' | 'growth' | 'scale' | null
}>
export type Exchange = Tables<'exchanges'>
export type UserProfile = Override<Tables<'users'>, {
  role: Role
  org_role: OrgRole
}>
export type ExchangeEnrollment = Tables<'exchange_enrollments'>
export type FormTemplate = Override<Tables<'form_templates'>, {
  type: FormType
  kind: TemplateKind
  status: TemplateStatus
  audience: TemplateAudience
}>
export type FormField = Override<Tables<'form_fields'>, {
  field_type: FieldType
  options: string[] | null
}>
export type DocumentSlot = Tables<'document_slots'>
// last_reminded_at stays optional for source compatibility with existing
// call sites that construct Assignment values without it.
export type Assignment = Omit<Tables<'assignments'>, 'last_reminded_at'> & {
  last_reminded_at?: string | null
}
export type Submission = Override<Tables<'submissions'>, {
  status: SubmissionStatus
}>
export type FieldAnswer = Tables<'field_answers'>
export type DocumentUpload = Tables<'document_uploads'>
// terms_acknowledged_at stays optional (same reason as Assignment).
export type Application = Omit<
  Tables<'applications'>,
  'status' | 'data' | 'language' | 'invite_response' | 'terms_acknowledged_at'
> & {
  status: ApplicationStatus
  data: Record<string, string>
  language: 'en' | 'fr'
  invite_response: 'yes' | 'no' | 'maybe' | null
  terms_acknowledged_at?: string | null
}
export type OrganizerInvite = Tables<'organizer_invites'>
export type RateLimit = Tables<'rate_limits'>
export type Feedback = Override<Tables<'feedback'>, {
  type: 'suggestion' | 'bug'
  status: 'new' | 'reviewed' | 'done'
}>
```

- [ ] **Step 3: Type-check and resolve fallout — in `types/db.ts` ONLY**

```bash
npx tsc --noEmit
```

Expected: clean, or a small number of errors. **Resolution rules, in order:**

1. An `Override` constraint error (`Narrow does not satisfy Partial<Row>`) means the generated column type differs from the assumption (e.g. a column is `Json` where we narrow to `string[]`). Verify the narrow type is genuinely assignable to the generated one; if the generated column is `Json`, the narrowing is valid and the error is a constraint-inference limit — switch that one row type to the explicit `Omit<...> & {...}` form used by `Application` above.
2. An error at a **consumer** site (components, lib) means an alias lost source compatibility (usually required-vs-optional). Fix by adjusting the alias in `types/db.ts` (the `Omit & { field?: ... }` pattern), never the consumer.
3. Do NOT touch `actions/` errors caused by `as any` sites — those don't exist yet (the casts silence them) and Task 3 handles that area.

- [ ] **Step 4: Run the suite**

```bash
pnpm test
```

Expected: 555 passed, zero test files modified.

- [ ] **Step 5: Lint + commit**

```bash
pnpm lint
git add types/supabase.ts types/db.ts
git commit -m "feat(types): generated DB types; db.ts narrows generated rows"
```

---

### Task 3: Burn down `as any` / `: any` in `actions/`

**Files:**
- Modify: `actions/forms.ts`, `actions/settings.ts`, `actions/students.ts`, `actions/exchanges.ts`, `actions/my-forms.ts`, `actions/applications.ts`, `actions/submissions.ts`

**Interfaces:**
- Consumes: typed clients from Task 2 (`createClient()` now returns `SupabaseClient<Database>`-shaped clients, and generated `Relationships` make embedded selects like `form_templates!inner(...)` resolve to real types).
- Produces: `assertExchangeInScope`, `sendPhase2ChecklistOnce`, `stampChecklist` (exchanges.ts) and `assertOrganizerOwnsApplication` (applications.ts) take `supabase: SupabaseClient<Database>`; **signatures otherwise unchanged.** Task 7 edits these same files later — different lines (preambles), no interface coupling.

There are 52 sites (grep-verified 2026-07-07). Work **one file per step, committing per file**. Fix categories:

- **(a) Callback annotations** — `(e: any) => e.user_id`, `(t: any) => t.id`, `(u: any) => ...`: delete the `: any`; inference from the typed query supplies the type.
- **(b) Query-result casts** — `.single() as any`, `.maybeSingle() as any`, `return data as any`, `(rows ?? []) as any[]`: delete the cast. If downstream code then fails to type-check against the inferred shape (embed arrays vs objects, wider strings), define a minimal local result type right above the query and apply it with `.single<T>()` / `.maybeSingle<T>()` / `.returns<T>()` (all available in supabase-js 2.108) — matching what the code actually reads, e.g.:

```ts
type AppWithExchange = Application & { exchanges: { name: string; apply_slug: string | null } | null }
// ...
.single<AppWithExchange>()
```

- **(c) `supabase: any` params** — type as `SupabaseClient<Database>`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'
// ...
async function assertExchangeInScope(supabase: SupabaseClient<Database>, exchangeId: string) {
```

- **(d) Error-code casts** — `(inviteError as any).code`, `(profileError as any).code`: supabase-js 2.108 types `.code` on both `AuthError` and `PostgrestError` — delete the cast; if the narrower type genuinely lacks `.code`, keep the cast **with a trailing comment**.
- **(e) Escape hatch** — any cast that removing would force a behavior-adjacent refactor stays, with a comment: `// cast: <specific reason>` (e.g. `// cast: embed alias school_a not resolvable by the select parser`). An uncommented `any` after this task is a defect.

Site inventory (line numbers as of planning; re-grep before editing each file):

| File | Sites |
|---|---|
| `forms.ts` | 41, 43, 88 (b); 229, 233, 272, 276, 280, 390, 399, 420, 425 (a); 314 (b); 400 `assignments: any[]` (b) |
| `settings.ts` | 174, 179, 180 (a) |
| `students.ts` | 46, 55, 125, 126 (a); 66 `[] as any[]` (b — type the empty fallback to match the other Promise branch); 76, 81, 135 (b) |
| `exchanges.ts` | 36, 165, 208, 295, 301, 302, 314 (a/b); 136, 280, 337 (c) |
| `my-forms.ts` | 22 (b) |
| `applications.ts` | 158, 181, 226, 435 `(app as any).exchanges` (b — one local `AppWithExchange` type reused); 320 (c); 507, 520, 526 (d) |
| `submissions.ts` | 22, 37, 66, 73, 254, 264, 343 (b); 270 (a) |

- [ ] **Step 1: `actions/my-forms.ts`** (1 site — smallest first, validates the approach)

Remove the cast on line 22 (`return (data ?? []) as any[]`). The select embeds `form_templates!inner(id, name, type, deadline, exchanges!inner(name))` — with generated Relationships this now infers. If the consumer (`app/(student)` pages) breaks on the inferred type, apply fix (b) with a local type. Then:

```bash
npx tsc --noEmit && pnpm test && pnpm lint
git add actions/my-forms.ts && git commit -m "refactor(actions): typed queries in my-forms, drop as-any"
```

- [ ] **Step 2: `actions/settings.ts`** — same procedure (3 category-(a) sites), same verify + commit (`refactor(actions): drop any-annotations in settings`).

- [ ] **Step 3: `actions/students.ts`** — same procedure, verify + commit.

- [ ] **Step 4: `actions/exchanges.ts`** — same procedure including the three `SupabaseClient<Database>` params (category c), verify + commit.

- [ ] **Step 5: `actions/submissions.ts`** — same procedure; note the two private asserts pass results to `.form_templates.exchange_id` — a local type like `{ form_templates: { exchange_id: string; school_id: string } }` on `.maybeSingle<T>()` is the expected fallback if inference returns an array shape for the to-one embed. Verify + commit.

- [ ] **Step 6: `actions/applications.ts`** — same procedure (`AppWithExchange` local type shared by the four `(app as any).exchanges` sites; typed param on `assertOrganizerOwnsApplication`; error-code casts). Verify + commit.

- [ ] **Step 7: `actions/forms.ts`** — largest file, same procedure. Verify + commit.

- [ ] **Step 8: Closing check**

```bash
grep -rn "as any\|: any" actions/ lib/ --include="*.ts" | grep -v __tests__ | grep -v "// cast:"
```

Expected: no output. Every survivor must carry a `// cast:` comment.

---

### Task 4: CLAUDE.md — migration workflow, redaction rule, tripwire

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the healed ledger (Task 1) and generated-types step (Task 2) — the workflow below references both.
- Produces: nothing code-facing.

- [ ] **Step 1: Replace the `## Database` section**

Replace the entire current section (the `supabase db push` instruction + RLS paragraph) with:

```markdown
## Database

Migrations live in `supabase/migrations/`, but **prod's migration ledger is the source of truth for versions** (MCP `apply_migration` stamps its own timestamps). Never run `supabase db push` against prod — it would try to re-apply already-applied migrations under drifted versions. Canonical workflow for any schema change:

1. Write the migration locally: `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`.
2. Apply it with the Supabase MCP `apply_migration` tool (`name` = the slug).
3. Check MCP `list_migrations`: if the ledger stamped a different version than the filename, `git mv` the local file to the stamped version.
4. Regenerate DB types: MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit` (`types/db.ts` narrows the generated rows; schema drift fails compile there — fix the alias, never hand-edit `types/supabase.ts`).
5. Routine drift check: every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

All tables use Row Level Security (RLS). Organizers can only access data for their own school. Students can only access their own assignments and submissions.
```

- [ ] **Step 2: Add three bullets to `## Gotchas & Conventions`**

Append after the existing "Never log student/parent PII" bullet:

```markdown
- **Production redacts thrown Server Action/RSC error messages** (replaced by an opaque digest string). Never branch client-side on `error.message`. Expected outcomes (validation failures, plan caps, business rejections) must be **structured return values**; only throw for genuinely unexpected failures. See `lib/billing/exchange-limit.ts` for the pattern.
- **Auth preambles are shared helpers** — server actions use `requireUser()` / `requireOrganizer()` / `requireStudent()` from `lib/auth/require.ts`; never hand-roll the `getAuthUser → getProfile → role check → throw` dance. Error strings (`'Unauthenticated'`, `'Unauthorized'`) are load-bearing for tests.
- **Tripwire — `actions/applications.ts`:** the next feature that touches it must FIRST split it along trust lines (`actions/apply.ts` public-token flow, `actions/applications-review.ts` organizer, `actions/invitations.ts`) before adding behavior. It mixes three trust models and is the churn leader.
```

(Note: the auth-helpers bullet lands before Task 6 builds the helpers — that's fine within one branch; if executing tasks strictly in order and this bothers review, move this single bullet into Task 6's commit instead.)

- [ ] **Step 3: Commit**

```bash
pnpm lint
git add CLAUDE.md
git commit -m "docs: canonical migration workflow, redaction rule, auth-helper convention, applications.ts tripwire"
```

---

### Task 5: docs/DEPLOY.md — operational knowledge promotion

**Files:**
- Modify: `docs/DEPLOY.md`

**Interfaces:** none (docs only). Absorb, don't duplicate CLAUDE.md — link to it where the detail already lives there.

- [ ] **Step 1: Update the stale env table in section 4**

Extend the existing Vercel env table with the rows the app has grown since (keep the existing 6 rows):

```markdown
   | `STRIPE_SECRET_KEY` | Stripe secret key (payments; app runs without it — `/billing` 500s until set) |
   | `STRIPE_WEBHOOK_SECRET` | signing secret of the prod webhook endpoint (step: register `/api/stripe/webhook` — see CLAUDE.md → Billing) |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
   | `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_SCALE` | the three yearly Price IDs |
   | `FEEDBACK_EMAIL` | recipient for the in-app feedback widget notifications |
```

And add two warnings under the table:

```markdown
   > **`EMAIL_FROM` format:** must be `Name <mailbox@domain>` — a bare domain silently fails Resend sends.
   >
   > **`NEXT_PUBLIC_APP_URL` must be a NON-sensitive Vercel var.** Vercel refuses to expose Sensitive vars to the client bundle, so a Sensitive value bakes in as an empty string (dashboard shows it "set", the app disagrees). `vercel env add NEXT_PUBLIC_APP_URL production --no-sensitive ...`. Preview deploys don't need it — `lib/app-url.ts` falls back to `VERCEL_BRANCH_URL`/`VERCEL_URL`.
```

- [ ] **Step 2: Rewrite section 5 (auth URL config) and add the invite-template section**

Replace the redirect-URLs list in section 5 with the full current set and append the template config. New content for section 5:

```markdown
## 5. Supabase Auth configuration (dashboard, not code)

In **Authentication → URL Configuration**:

- **Site URL**: `https://eazyexchange.com` (the production domain — `{{ .SiteURL }}` drives every auth email link; if this is still `localhost`, real users' confirmation/invite links point at their own machine).
- **Redirect URLs**: add, for the production domain AND `http://localhost:3000`:
  - `/auth/confirm` (email OTP: signup confirmation, student invites)
  - `/auth/callback` (Google OAuth PKCE)
  - `/accept-invite`

### Invite email template (load-bearing, silently breaks student invites)

The **Invite user** email template MUST link to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
```

The default template (`{{ .ConfirmationURL }}` → `GET /auth/v1/verify`) bypasses `app/auth/confirm/route.ts`, so no SSR session cookie is ever set and the student's "Get started" click fails with **"Auth session missing!"**.

- **Diagnose:** Supabase auth logs — `GET /verify` entries = default template (broken); `POST /verify` = the app's `verifyOtp` route (correct).
- **Free-tier prerequisite:** template editing requires custom SMTP first (Resend: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key). Set both via the dashboard or `PATCH https://api.supabase.com/v1/projects/<ref>/config/auth`.

### Other manual dashboard steps (pointers)

- **Google OAuth provider** — full setup steps in `CLAUDE.md` → Gotchas (Google Cloud client, Supabase provider config, redirect URLs).
- **Stripe prod webhook** — register `https://<domain>/api/stripe/webhook` for the 4 events listed in `CLAUDE.md` → Billing; see also `docs/stripe-billing-setup.md`.
```

(Keep the existing "first organizer" SQL block at the end of section 5 — still valid — but note above it that organizers now self-register at `/signup`, so it's only needed for a bootstrap without email.)

- [ ] **Step 3: Add a new section 7 — Preview deployments**

Append after section 6:

```markdown
---

## 7. Previewing changes (don't push to prod to look at a branch)

Per-branch **Vercel Preview URLs** are the "see it on the website" step:

1. branch → build → local gate (`pnpm lint`, `pnpm test`, `npx tsc --noEmit` — `pnpm build` only works on Vercel; local `.env.local` has placeholders)
2. `git push` the branch → Vercel builds a Preview URL → live-drive the real flow there
3. only then merge to `main` (= production deploy). Merging is the boring last step, not how you learn whether it works.

**⚠️ Data caveat (current state):** Preview deploys share the **production** Supabase project and Resend key — a preview writes real rows and sends real emails. No destructive or bulk actions on previews. The planned fix is a separate staging Supabase project with Preview-scoped env keys (see `docs/superpowers/specs/2026-07-07-architecture-scalability-design.md`); until that ships, treat previews as read-mostly.
```

- [ ] **Step 4: Commit**

```bash
pnpm lint
git add docs/DEPLOY.md
git commit -m "docs(deploy): env inventory, auth/template dashboard config, preview-deploy loop"
```

---

### Task 6: `lib/auth/require.ts` helpers (TDD)

**Files:**
- Create: `lib/auth/require.ts`
- Test: `lib/auth/__tests__/require.test.ts`

**Interfaces:**
- Consumes: `getAuthUser`, `getProfile`, `type Profile` from `@/lib/supabase/request` (request-cached — helper calls cost no extra round trips in prod; in vitest the React-18 fallback is uncached but tests mock the seam anyway).
- Produces (Task 7 relies on these exact signatures):
  - `requireUser(): Promise<User>` — throws `'Unauthenticated'` if no auth user.
  - `requireOrganizer(opts?: { orgRole?: 'owner' }): Promise<{ user: User; profile: Profile }>` — `'Unauthenticated'` first, then `'Unauthorized'` for missing/non-organizer profile, then `'Réservé au propriétaire du compte.'` if `orgRole: 'owner'` requested and `(profile.org_role ?? 'admin') !== 'owner'`.
  - `requireStudent(): Promise<{ user: User; profile: Profile }>` — same shape, role `'student'`. (No current action checks student role — see Task 7; the helper ships for future actions per spec §4.)

- [ ] **Step 1: Write the failing test**

Create `lib/auth/__tests__/require.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let user: { id: string } | null
let profile: { role: string; org_role: string | null } | null

vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => user,
  getProfile: async () => profile,
}))

import { requireUser, requireOrganizer, requireStudent } from '../require'

beforeEach(() => {
  user = { id: 'u1' }
  profile = { role: 'organizer', org_role: 'owner' }
})

describe('requireUser', () => {
  it('throws Unauthenticated when there is no user', async () => {
    user = null
    await expect(requireUser()).rejects.toThrow('Unauthenticated')
  })
  it('returns the user', async () => {
    await expect(requireUser()).resolves.toEqual({ id: 'u1' })
  })
})

describe('requireOrganizer', () => {
  it('throws Unauthenticated before any profile check', async () => {
    user = null
    profile = null
    await expect(requireOrganizer()).rejects.toThrow('Unauthenticated')
  })
  it('throws Unauthorized when the profile is missing', async () => {
    profile = null
    await expect(requireOrganizer()).rejects.toThrow('Unauthorized')
  })
  it('throws Unauthorized for a student', async () => {
    profile = { role: 'student', org_role: null }
    await expect(requireOrganizer()).rejects.toThrow('Unauthorized')
  })
  it('returns user and profile for an organizer', async () => {
    const ctx = await requireOrganizer()
    expect(ctx.user.id).toBe('u1')
    expect(ctx.profile.role).toBe('organizer')
  })
  it('owner check rejects an admin with the exact French message', async () => {
    profile = { role: 'organizer', org_role: 'admin' }
    await expect(requireOrganizer({ orgRole: 'owner' }))
      .rejects.toThrow('Réservé au propriétaire du compte.')
  })
  it('owner check treats null org_role as admin', async () => {
    profile = { role: 'organizer', org_role: null }
    await expect(requireOrganizer({ orgRole: 'owner' }))
      .rejects.toThrow('Réservé au propriétaire du compte.')
  })
  it('owner check passes an owner through', async () => {
    await expect(requireOrganizer({ orgRole: 'owner' })).resolves.toBeTruthy()
  })
})

describe('requireStudent', () => {
  it('throws Unauthorized for an organizer', async () => {
    await expect(requireStudent()).rejects.toThrow('Unauthorized')
  })
  it('returns user and profile for a student', async () => {
    profile = { role: 'student', org_role: null }
    const ctx = await requireStudent()
    expect(ctx.profile.role).toBe('student')
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm vitest run lib/auth/__tests__/require.test.ts
```

Expected: FAIL — cannot resolve `../require`.

- [ ] **Step 3: Implement `lib/auth/require.ts`**

```ts
import type { User } from '@supabase/supabase-js'
import { getAuthUser, getProfile, type Profile } from '@/lib/supabase/request'

// Shared server-action auth preambles, built on the request-cached
// getAuthUser/getProfile (no extra round trips per call in prod).
// Error strings are load-bearing — tests and callers match on them exactly.

export type AuthCtx = { user: User; profile: Profile }

export async function requireUser(): Promise<User> {
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  return user
}

export async function requireOrganizer(opts?: { orgRole?: 'owner' }): Promise<AuthCtx> {
  const user = await requireUser()
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  if (opts?.orgRole === 'owner' && (profile.org_role ?? 'admin') !== 'owner') {
    throw new Error('Réservé au propriétaire du compte.')
  }
  return { user, profile }
}

export async function requireStudent(): Promise<AuthCtx> {
  const user = await requireUser()
  const profile = await getProfile()
  if (!profile || profile.role !== 'student') throw new Error('Unauthorized')
  return { user, profile }
}
```

- [ ] **Step 4: Run tests, verify green**

```bash
pnpm vitest run lib/auth/__tests__/require.test.ts   # 11 passed
pnpm test                                            # 555 + 11
npx tsc --noEmit && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth/require.ts lib/auth/__tests__/require.test.ts
git commit -m "feat(auth): requireUser/requireOrganizer/requireStudent shared preambles"
```

---

### Task 7: Sweep the hand-rolled preambles in `actions/*.ts`

**Files:**
- Modify: `actions/onboarding.ts`, `actions/my-forms.ts`, `actions/student-context.ts`, `actions/students.ts`, `actions/exchanges.ts`, `actions/settings.ts`, `actions/applications.ts`, `actions/submissions.ts`, `actions/forms.ts`
- NOT touched: `actions/feedback.ts` (return-based gate, no throw — out of pattern by design), `actions/join.ts` + `actions/session.ts` (no auth preamble).

**Interfaces:**
- Consumes: Task 6's helpers, exact signatures above.
- Produces: no exported signature changes anywhere. Private helpers change: `forms.ts assertOrganizer()` loses its unused `supabase` param; `settings.ts getOrganizerCtx(opts?)` loses `supabase`, gains `opts`; `settings.ts assertOwner` is deleted.

**The three replacement patterns** (semantics-preserving; `requireOrganizer` checks user before profile exactly like today's B-variant order):

```ts
// Pattern A — user-only check:
//   const user = await getAuthUser()
//   if (!user) throw new Error('Unauthenticated')
// becomes (bind only if `user` is used later in the function):
const user = await requireUser()      // or:  await requireUser()

// Pattern B — user check + adjacent organizer-profile check:
//   const user = await getAuthUser()
//   if (!user) throw new Error('Unauthenticated')
//   const profile = await getProfile()
//   if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
// becomes (destructure only the names used later):
const { user, profile } = await requireOrganizer()

// Pattern C — profile-only organizer check inside a private helper whose every
// caller already passed an auth check:
//   const profile = await getProfile()
//   if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
// becomes:
const { profile } = await requireOrganizer()
```

**Binding rules:**
1. Never change the order of checks within a function.
2. Only replace *pure* preambles. A profile check fused with a scope comparison in one `if` (e.g. `submissions.ts` `assertOrganizerOwnsAssignment`: `profile?.role !== 'organizer' || profile.school_id !== ctx...`) is NOT a preamble — leave it.
3. Non-standard strings stay inline: `getExchanges`'s `if (!profile) throw new Error('No profile')` keeps its own line (only the user check above it becomes `requireUser`).
4. After each file: remove now-unused `getAuthUser`/`getProfile` imports, add `import { requireUser, requireOrganizer } from '@/lib/auth/require'` (only the names used), then `npx tsc --noEmit && pnpm test && pnpm lint` — **zero test edits** — then commit that one file.

Per-file map (function → pattern; line refs from planning, re-grep before editing):

| Step | File | Functions |
|---|---|---|
| 1 | `onboarding.ts` | `completeOnboarding`: B → `const { profile } = await requireOrganizer()` |
| 2 | `my-forms.ts` | `getMyAssignments`: A (binds `user`) |
| 3 | `student-context.ts` | `getStudentContext`: A (binds `user`); the following non-throwing `getProfile()` stays |
| 4 | `students.ts` | `assertOrganizerInExchange`: C; `getStudentsDirectory`, `remindStudent`: A |
| 5 | `exchanges.ts` | `getExchanges`: A + keep `'No profile'` line; `createExchange`: B (binds `user` **and** `profile` — both used); `getExchange`, `getExchangeGrid`: A; `setApplicationOpen`, `setExchangePhase`, `updateReminderSettings`: B; `assertExchangeInScope`: **leave** (it deliberately admits students of the school — Rule 2/3) |
| 6 | `applications.ts` | `assertOrganizerOwnsApplication`: C (its app-fetch + school check after stays); `listApplications`: B; `getApplicationForReview`, `acceptApplication`, `rejectApplication`: A (accept/reject bind `user` for `reviewer_id`); public-token actions (`startApplication`…`respondToInvitation`, `getInvitation`) have no preamble — untouched; check `acceptApplications`/`rejectApplications` (bulk) — if they delegate to the singles they need nothing |
| 7 | `submissions.ts` | `getAssignmentDetails`, `saveFormAnswers`, `recordDocumentUpload`, `getSubmissionForReview`, `approveSubmission`, `rejectSubmission`, `submitDocumentAssignment`: A (most bind `user`); both private asserts: **leave** (Rule 2) |
| 8 | `forms.ts` | `assertOrganizer`: C + drop the unused `supabase` param (update its internal callers `assertOrganizerOwnsTemplate`, `getOwnedTemplate`, and any direct call sites); all ~11 action-level A-pairs → `await requireUser()` (only `createDraftTemplate` binds `user` — `created_by: user.id`); `getTemplatesPage`'s trailing scope check stays |
| 9 | `settings.ts` | see below |

- [ ] **Steps 1–8:** apply the map above, one file per step, each ending with the Rule-4 verify + commit (`refactor(actions): shared auth preamble in <file>`).

- [ ] **Step 9: `actions/settings.ts` — fold `getOrganizerCtx` + delete `assertOwner`**

Replace the private helper (keep `OrganizerCtx` and every call-site variable shape identical):

```ts
import { requireOrganizer } from '@/lib/auth/require'

type OrganizerCtx = { userId: string; schoolId: string; orgRole: 'owner' | 'admin'; email: string; fullName: string }

async function getOrganizerCtx(opts?: { orgRole?: 'owner' }): Promise<OrganizerCtx> {
  const { user, profile } = await requireOrganizer(opts)
  return {
    userId: user.id, schoolId: profile.school_id,
    orgRole: (profile.org_role ?? 'admin') as 'owner' | 'admin',
    email: profile.email, fullName: profile.full_name,
  }
}
```

Delete `assertOwner`. Update the 11 call sites:
- Plain sites (lines 42, 69, 158): `getOrganizerCtx(supabase)` → `getOrganizerCtx()`.
- Owner-gated sites (the 7 `getOrganizerCtx(supabase)` + `assertOwner(ctx)` pairs at lines 101–102, 186–187, 201–202, 215–216, 263–264, 288–289, 299–300): both lines → `const ctx = await getOrganizerCtx({ orgRole: 'owner' })`. (Order is preserved: role check throws before the owner check, exactly like the old two-step.)

Remove now-unused imports (`getAuthUser`, `getProfile`, possibly `SupabaseClient` if no other use). Verify + commit:

```bash
npx tsc --noEmit && pnpm test && pnpm lint
git add actions/settings.ts
git commit -m "refactor(actions): fold getOrganizerCtx into requireOrganizer, drop assertOwner"
```

- [ ] **Step 10: Sweep completeness check**

```bash
grep -rn "getAuthUser" actions/ --include="*.ts" | grep -v __tests__
```

Expected: no output (every direct `getAuthUser` use in actions is gone; `getProfile` legitimately remains in `feedback.ts`, `student-context.ts`, and inside fused checks in `exchanges.ts`/`submissions.ts`).

---

### Task 8: Move `frShortDate` to `lib/dates.ts`

**Files:**
- Create: `lib/dates.ts`
- Modify: `lib/dashboard/rollup.ts` (remove definition, re-export), `lib/email.ts` (import path only)

**Interfaces:**
- Produces: `frShortDate(iso: string | null): string` exported from `@/lib/dates` AND re-exported from `@/lib/dashboard/rollup` (7 component/lib consumers import from rollup — they stay untouched).

- [ ] **Step 1: Create `lib/dates.ts`** (function body moved **verbatim** from `lib/dashboard/rollup.ts:25-31`):

```ts
// Locale date helpers shared across UI and email. No React, no Supabase.

// "12 sept." style French short date; empty string for null/invalid input.
export function frShortDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date)
  return formatted.replace(/\.$/, '')
}
```

- [ ] **Step 2: Update `lib/dashboard/rollup.ts`** — delete the `frShortDate` function definition; at the top add:

```ts
import { frShortDate } from '@/lib/dates'

// Re-export: dashboard components historically import frShortDate from here.
export { frShortDate }
```

(The internal use at the old line 289 now resolves via the import.)

- [ ] **Step 3: Update `lib/email.ts` line 2** — `import { frShortDate } from '@/lib/dashboard/rollup'` → `import { frShortDate } from '@/lib/dates'`. Email no longer imports a dashboard module.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit && pnpm test && pnpm lint
git add lib/dates.ts lib/dashboard/rollup.ts lib/email.ts
git commit -m "refactor: move frShortDate to lib/dates (email stops importing dashboard code)"
```

---

### Task 9: Final gate + handoff

**Files:** none (verification only).

- [ ] **Step 1: Full gate on the branch**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: lint clean (the pre-existing `apple-icon` `<img>` warning is expected), 555 existing tests + 11 new all passing, tsc clean.

- [ ] **Step 2: Diff hygiene scan**

```bash
git diff main...HEAD --stat
```

Expected files only: `supabase/migrations/*` (7 renames), `types/supabase.ts`, `types/db.ts`, `actions/*.ts` (8 files — feedback/join/session untouched), `CLAUDE.md`, `docs/DEPLOY.md`, `lib/auth/require.ts`, `lib/auth/__tests__/require.test.ts`, `lib/dates.ts`, `lib/dashboard/rollup.ts`, `lib/email.ts`, plus this plan. **No test file outside `lib/auth/__tests__/` may appear.** No `.pdf` or other untracked PII swept in.

- [ ] **Step 3: Success-criteria spot checks (from the spec)**

```bash
ls supabase/migrations/ | sed 's/_.*//' | sort | diff - /tmp/ledger-versions.txt   # §1: byte-identical
grep -rn "as any\|: any" actions/ lib/ --include="*.ts" | grep -v __tests__ | grep -v "// cast:"   # §2: empty
grep -rn "getAuthUser" actions/ --include="*.ts" | grep -v __tests__   # §4: empty
```

- [ ] **Step 4: Controller-only follow-ups (not subagent work)**

- Merge is **user-gated** (merge to `main` = prod deploy): use superpowers:finishing-a-development-branch — full whole-branch review, then present merge options to Bjorn. Recommend a Vercel Preview drive first per docs/DEPLOY.md §7 (though this sprint is behavior-neutral, so the local gate is the real evidence).
- Auto-memory updates after merge: retire the "migration tasks must also touch types/db.ts" rule (in `project_email_controls_acceptance_terms.md`) — regeneration is now step 4 of the CLAUDE.md workflow; update `project_debt_guardrails.md` status.
- No prod DB action of any kind is needed — the ledger renames are local-only.

---

## Self-Review (done at planning time)

- **Spec coverage:** §1 → Task 1 + Task 4 (workflow doc). §2 → Tasks 2–3 (+ workflow step 4 in Task 4; memory-rule retirement in Task 9). §3 → Tasks 4–5 (CLAUDE.md conventions; DEPLOY.md operations; "repo owns how-things-work" satisfied). §4 → Tasks 6–8 (helpers, sweep incl. `getOrganizerCtx` fold, `frShortDate` move). §5 declined items → tripwire recorded in Task 4 Step 2; nothing else to build. §6 → branch/order/gate baked into Global Constraints and Task 9.
- **Known judgment calls:** (a) `requireStudent` ships unused by the sweep — no existing action checks student role, and adding checks would change behavior; spec §4 names the helper explicitly, so it ships tested. (b) `feedback.ts` keeps its return-based gate (structured results per the redaction rule — converting it to throws would be a behavior change). (c) `assertExchangeInScope` is not swept — it intentionally admits students (role-unchecked), and its `'No profile'` string differs. (d) The spec counts "~26" any-escapes; the verified grep finds 52 (it counts `(x: any)` lambdas too) — all inventoried in Task 3.
- **Type consistency:** `requireOrganizer` signature identical in Task 6 (producer) and Task 7 (consumer), including the `opts` object and `AuthCtx` shape; `frShortDate(iso: string | null): string` identical across Task 8 files; `SupabaseClient<Database>` param typing consistent between Tasks 3 and 7 (different lines of the same files, Task 3 lands first).
