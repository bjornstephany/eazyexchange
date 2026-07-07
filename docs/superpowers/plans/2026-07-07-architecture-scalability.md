# Architecture & Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split previews off production data onto a dedicated staging Supabase project, and add an RLS-protected email send log so every outgoing email is auditable.

**Architecture:** Two independent work items from the approved spec (`docs/superpowers/specs/2026-07-07-architecture-scalability-design.md`). Item 1 is mostly ops: a second free-tier Supabase project (`eazyexchange-staging`) that receives every migration *first*, seeded with fake data, wired to Vercel's Preview env scope. Item 2 is a new `email_send_log` table written via the service-role client from the one `send()` helper in `lib/email.ts` (plus the `send-reminders` edge function), readable by organizers for their own school only.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Resend, Vercel, vitest, Supabase CLI.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **Never log or store student/parent PII in logs or error messages** — the send log stores recipient addresses in the *table* (RLS-protected), but console output must never include them.
- Verification commands: `pnpm lint`, `pnpm test`, `npx tsc --noEmit` (NOT `pnpm build` — `.env.local` has placeholders, so build fails locally; tsc catches the type errors build would).
- Branch: `feature/architecture-scalability`. Never push broken code to `main`.
- **New migration workflow (this plan introduces it):** every migration is applied to staging FIRST (`supabase db push --db-url "$STAGING_DB_URL"`), then to prod via the Supabase MCP `apply_migration` tool (never `supabase db push` against prod — the migration ledger has known drift that makes prod pushes dangerous).
- WSL2 gotcha: direct Supabase DB hosts are IPv6-only and hang from this machine. Always use the **Session pooler** (IPv4) connection string for `--db-url`.
- Edge function deploys are manual: `supabase functions deploy send-reminders` (config.toml already sets `verify_jwt = false` for it — never re-enable).
- RLS policies use the existing STABLE helpers `my_role()` / `my_school_id()` (see `20260625000005_fix_rls_recursion.sql`); never write self-referential policies.
- **Coordination note:** the committed perf-cold-starts plan (`2026-07-07-perf-cold-starts.md`, commit d3825cd) also modifies `supabase/functions/send-reminders/index.ts` (1,000-row pagination fix). THIS plan executes first per Bjorn's global order; when perf-cold-starts executes later, its implementer must reconcile with the logging added here (both changes touch the fetch query and the per-student send loop).
- Tasks 1–4 contain **dashboard/checkpoint steps requiring Bjorn** (Supabase dashboard, Vercel env vars). Mark those clearly when dispatching subagents — they are controller/human steps, not subagent steps.

---

### Task 1: Create the staging Supabase project and apply all migrations

Ops task — no app code. Produces `.env.staging` (gitignored via the `.env*` rule — verify it stays untracked) holding every staging credential later tasks need.

**Files:**
- Create: `.env.staging` (NEVER committed; `.gitignore` already covers `.env*`)

**Interfaces:**
- Produces: `.env.staging` with `STAGING_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_DB_URL` — consumed by Tasks 2, 3, 4, 6, 10.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main && git pull && git checkout -b feature/architecture-scalability
```

- [ ] **Step 2: Find the org id and prod region**

```bash
supabase orgs list
supabase projects list
```

Note the org id and the **region of the existing prod project** (create staging in the same region). If the CLI isn't logged in (`supabase login` is interactive), ask Bjorn to run `! supabase login`.

- [ ] **Step 3: CHECKPOINT (Bjorn) — free-tier quota**

Supabase free tier allows 2 active free projects per org. If the org already has 2, Bjorn must decide (pause one, different org, or paid). Confirm before creating.

- [ ] **Step 4: Create the project**

```bash
STAGING_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
supabase projects create eazyexchange-staging --org-id <ORG_ID> --region <PROD_REGION> --db-password "$STAGING_DB_PASSWORD"
```

Record the new project ref from the output.

- [ ] **Step 5: Fetch API keys and write `.env.staging`**

```bash
supabase projects api-keys --project-ref <STAGING_REF>
```

Write `.env.staging` (fill in real values):

```bash
# Staging Supabase project (eazyexchange-staging) — previews + migration rehearsal.
# NEVER commit this file. NEVER put these values in Production scope on Vercel.
STAGING_PROJECT_REF=<STAGING_REF>
NEXT_PUBLIC_SUPABASE_URL=https://<STAGING_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
# Session pooler (IPv4) — copy from Dashboard → Connect → Session pooler.
STAGING_DB_URL=postgresql://postgres.<STAGING_REF>:<STAGING_DB_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

Verify it is ignored: `git status --short .env.staging` → no output.

- [ ] **Step 6: Apply every migration to staging**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Expected: all ~40 files in `supabase/migrations/` apply cleanly (fresh DB — the prod ledger drift does not exist here). If a file errors, STOP and report; do not hand-edit migrations.

- [ ] **Step 7: Verify schema + buckets landed**

```bash
supabase migration list --db-url "$STAGING_DB_URL"
```

Expected: every local file shows as applied. Then in Dashboard → SQL editor (or `--db-url` query):

```sql
select id from storage.buckets order by id;
```

Expected: `application-photos`, `documents`, `form-templates`.

---

### Task 2: Configure staging auth + deploy the edge function

Ops task. Makes invite/confirm email flows work on previews and stands up `send-reminders` on staging (no cron — manual invoke only).

**Interfaces:**
- Consumes: `.env.staging` (Task 1).
- Produces: staging `CRON_SECRET` (append to `.env.staging` as `STAGING_CRON_SECRET`) — consumed by Task 10's verification.

- [ ] **Step 1: CHECKPOINT (Bjorn/dashboard) — Auth URL configuration**

In the **staging** project Dashboard → Authentication → URL Configuration:
- Site URL: `http://localhost:3000`
- Additional Redirect URLs (find `<SCOPE>` from any existing preview URL, e.g. via `vercel ls` — it's the `-bjorns-projects-…` suffix):
  - `http://localhost:3000/**`
  - `https://eazyexchange-git-*-<SCOPE>.vercel.app/**`
  - `https://eazyexchange-*-<SCOPE>.vercel.app/**`

- [ ] **Step 2: CHECKPOINT (Bjorn/dashboard) — copy email templates from prod**

Staging ships Supabase's default templates, which point at the broken `GET /verify` flow (known trap: "Auth session missing!" on student Get started). Open prod Dashboard → Authentication → Emails side-by-side with staging and copy the customized **Invite user** and **Confirm signup** templates verbatim (they link to `/auth/confirm?token_hash=…`). Note: free-tier auth email is rate-limited (~2/hour) without custom SMTP — acceptable for previews; wire Resend SMTP later only if preview email testing demands it.

Google OAuth is deliberately NOT configured on staging: Google buttons on previews will error. Documented in Task 5.

- [ ] **Step 3: Deploy the edge function to staging with secrets**

```bash
set -a; source .env.staging; set +a
STAGING_CRON_SECRET=$(openssl rand -hex 32)
echo "STAGING_CRON_SECRET=$STAGING_CRON_SECRET" >> .env.staging
supabase secrets set --project-ref "$STAGING_PROJECT_REF" \
  SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  CRON_SECRET="$STAGING_CRON_SECRET" \
  APP_URL="http://localhost:3000" \
  EMAIL_FROM="EazyExchange <onboarding@resend.dev>"
supabase functions deploy send-reminders --project-ref "$STAGING_PROJECT_REF"
```

Deliberately NOT set: `RESEND_API_KEY` (staging must never email anyone — the function and app both degrade gracefully to "email disabled"). Deliberately NOT scheduled: no pg_cron job on staging; the function is invoked manually for rehearsal.

- [ ] **Step 4: Verify the function gate**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://$STAGING_PROJECT_REF.supabase.co/functions/v1/send-reminders"
curl -s -X POST "https://$STAGING_PROJECT_REF.supabase.co/functions/v1/send-reminders" -H "x-cron-secret: $STAGING_CRON_SECRET"
```

Expected: `401` for the first, `{"students":0,"emailsSent":0}` for the second.

---

### Task 3: Seed script for staging

**Files:**
- Create: `scripts/seed-staging.mjs`

**Interfaces:**
- Consumes: `.env.staging` (Task 1).
- Produces: staging rows — school «Lycée Démo (staging)», organizer login `demo-organizer@example.com`, exchange «Échange Démo 2026», students `demo-eleve-1@example.com` / `demo-eleve-2@example.com`, all sharing `SEED_PASSWORD`.

- [ ] **Step 1: Write the script**

```js
// Seeds the staging Supabase project with fake preview-testing data:
// one school, one organizer login, one exchange, two enrolled students.
// Idempotent: re-running reuses existing auth users and skips existing rows.
//
// Refuses to run against anything but the staging project ref — this script
// must never touch production.
//
// Run:
//   set -a; source .env.staging; set +a
//   SEED_PASSWORD='<login password for all seeded users>' node scripts/seed-staging.mjs
import { createClient } from '@supabase/supabase-js'

const ref = process.env.STAGING_PROJECT_REF
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SEED_PASSWORD

const missing = ['STAGING_PROJECT_REF', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SEED_PASSWORD']
  .filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing env var(s): ${missing.join(', ')} — see the header of this file.`)
  process.exit(1)
}
if (!url.includes(ref)) {
  console.error(`Refusing to seed: ${url} is not the staging project (${ref}).`)
  process.exit(1)
}

const admin = createClient(url, serviceKey)

async function ensureAuthUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return data.user.id
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === email)
  if (!existing) throw new Error(`createUser failed for ${email}: ${error.message}`)
  return existing.id
}

async function ensureProfile(id, schoolId, role, fullName, email, orgRole) {
  const { data: existing } = await admin.from('users').select('id').eq('id', id).maybeSingle()
  if (existing) return
  const row = { id, school_id: schoolId, role, full_name: fullName, email }
  if (orgRole) row.org_role = orgRole
  const { error } = await admin.from('users').insert(row)
  if (error) throw error
}

const SCHOOL_NAME = 'Lycée Démo (staging)'
const EXCHANGE_NAME = 'Échange Démo 2026'

// School
let { data: school } = await admin.from('schools').select('id').eq('name', SCHOOL_NAME).maybeSingle()
if (!school) {
  const { data, error } = await admin.from('schools').insert({ name: SCHOOL_NAME }).select('id').single()
  if (error) throw error
  school = data
}

// Organizer
const organizerId = await ensureAuthUser('demo-organizer@example.com')
await ensureProfile(organizerId, school.id, 'organizer', 'Orga Démo', 'demo-organizer@example.com', 'owner')

// Exchange
let { data: exchange } = await admin.from('exchanges')
  .select('id').eq('school_a_id', school.id).eq('name', EXCHANGE_NAME).maybeSingle()
if (!exchange) {
  const { data, error } = await admin.from('exchanges')
    .insert({ name: EXCHANGE_NAME, year: 2026, school_a_id: school.id, school_b_id: null })
    .select('id').single()
  if (error) throw error
  exchange = data
}

// Students (fake minors — fake data only, never real addresses)
for (const [i, email] of ['demo-eleve-1@example.com', 'demo-eleve-2@example.com'].entries()) {
  const studentId = await ensureAuthUser(email)
  await ensureProfile(studentId, school.id, 'student', `Élève Démo ${i + 1}`, email)
  const { data: enrolled } = await admin.from('exchange_enrollments')
    .select('id').eq('exchange_id', exchange.id).eq('user_id', studentId).maybeSingle()
  if (!enrolled) {
    const { error } = await admin.from('exchange_enrollments')
      .insert({ exchange_id: exchange.id, user_id: studentId })
    if (error) throw error
  }
}

console.log(`Seeded: ${SCHOOL_NAME} / ${EXCHANGE_NAME} / 1 organizer + 2 students (password: SEED_PASSWORD)`)
```

- [ ] **Step 2: Run it against staging**

```bash
set -a; source .env.staging; set +a
SEED_PASSWORD='<pick one, note it for Bjorn>' node scripts/seed-staging.mjs
```

Expected: the `Seeded: …` line. Run it twice — second run must also exit 0 (idempotency).

- [ ] **Step 3: Verify the rows**

Dashboard SQL editor (staging):

```sql
select (select count(*) from schools)      as schools,
       (select count(*) from users)        as users,
       (select count(*) from exchanges)    as exchanges,
       (select count(*) from exchange_enrollments) as enrollments;
```

Expected: `1, 3, 1, 2`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-staging.mjs
git commit -m "feat: staging seed script (fake school/organizer/students)"
```

---

### Task 4: Re-scope Vercel env vars and verify a live preview

Ops task with a CHECKPOINT — this is the moment previews stop touching prod data.

**Interfaces:**
- Consumes: `.env.staging` values (Task 1), seeded login (Task 3).

- [ ] **Step 1: Audit current scoping**

```bash
vercel env ls
```

Note which of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` currently include the Preview environment.

- [ ] **Step 2: CHECKPOINT (Bjorn) — re-scope the four vars**

For each of the three Supabase vars: remove the Preview target from the prod-valued var, then add a Preview-scoped var with the staging value:

```bash
vercel env rm NEXT_PUBLIC_SUPABASE_URL preview
printf '%s' "https://<STAGING_REF>.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL preview
# … same pattern for NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
vercel env rm RESEND_API_KEY preview   # Preview gets NO Resend key: previews never send email
```

If the CLI balks (a var created for all environments sometimes can't be edited per-target), do it in Dashboard → Project → Settings → Environment Variables: edit each var to uncheck Preview, then add a new Preview-only var with the staging value. Also confirm `NEXT_PUBLIC_APP_URL` remains Production-only (previews rely on the `getAppUrl()` Vercel-URL fallback, already on main via bb5f007). If any `STRIPE_*` var targets Preview, remove that target too (previews must never hold live Stripe keys).

- [ ] **Step 3: Push the branch to trigger a preview**

```bash
git push -u origin feature/architecture-scalability
```

Get the preview URL from `vercel ls` or the Vercel dashboard (pattern: `eazyexchange-git-feature-architecture-scalability-<SCOPE>.vercel.app`).

- [ ] **Step 4: Verify the preview hits staging, not prod**

On the preview URL: log in as `demo-organizer@example.com` / `SEED_PASSWORD`. Expected: dashboard shows «Lycée Démo (staging)» and «Échange Démo 2026». Then confirm a **prod** login on the preview fails (prod credentials don't exist on staging). Finally load `https://eazyexchange.com` and confirm prod is untouched (real school, real data).

Any mismatch = env scoping is wrong; STOP and fix before proceeding — this is the security boundary of the whole task.

---

### Task 5: Document the staging environment + cleanup

**Files:**
- Modify: `CLAUDE.md` (after the `## Database` section)

- [ ] **Step 1: Add the staging section to CLAUDE.md**

Insert after the `## Database` section:

```markdown
## Staging & Previews

A second Supabase project (`eazyexchange-staging`, ref in `.env.staging` — never committed) backs all Vercel **Preview** deployments; Production keeps the real project. Previews physically cannot touch prod data.

- **Every migration is applied to staging FIRST** (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`), then to prod via MCP `apply_migration`. Never skip the staging apply — drift breaks previews mysteriously.
- Seed data: `scripts/seed-staging.mjs` (fake school/organizer/students, idempotent). Login `demo-organizer@example.com`; password is set at seed time (`SEED_PASSWORD`).
- Staging sends NO email (`RESEND_API_KEY` unset app-side and function-side; sends degrade to console warnings). Free-tier Supabase auth email ≈ 2/hour.
- Google OAuth is not configured on staging — Google buttons error on previews; use email/password.
- `send-reminders` is deployed to staging but has no cron; invoke manually with the `x-cron-secret` header (`STAGING_CRON_SECRET` in `.env.staging`) to rehearse.
```

- [ ] **Step 2: Delete the stale remote branch**

`fix/preview-base-url` (bb5f007) is already merged into main:

```bash
git merge-base --is-ancestor bb5f007 main && git push origin --delete fix/preview-base-url
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: staging/preview environment split (migrations rehearse on staging first)"
```

---

### Task 6: `email_send_log` migration + types

First real use of the new workflow: staging first, then prod. The table is inert until Task 8 ships code that writes it, so applying to prod now is safe.

**Files:**
- Create: `supabase/migrations/20260707000004_email_send_log.sql`
- Modify: `types/db.ts` (type exports + `Database.public.Tables`)

**Interfaces:**
- Produces: table `email_send_log` with columns `id, created_at, recipient, kind, status ('sent'|'error'), error_code, school_id, exchange_id`; TS types `EmailSendLog`, `EmailSendStatus` in `types/db.ts`. Consumed by Tasks 7, 8, 10.

- [ ] **Step 1: Write the migration**

```sql
-- Email send log: one row per outgoing email attempt (audit + outbox trigger
-- signal — see docs/superpowers/specs/2026-07-07-architecture-scalability-design.md).
-- `recipient` is parents'/students' email (PII of minors): full RLS treatment.
-- Writes happen ONLY via the service role (lib/email-log.ts and the
-- send-reminders edge function) — there is deliberately no INSERT/UPDATE/DELETE
-- policy. Organizers may read their own school's rows; rows with school_id null
-- (e.g. feedback pings to the operator) are service-role-only.

create table email_send_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recipient text not null,
  kind text not null,
  status text not null check (status in ('sent', 'error')),
  error_code int,
  school_id uuid references schools(id) on delete set null,
  exchange_id uuid references exchanges(id) on delete set null
);

-- school idx doubles as the FK index (keeps the unindexed_fks advisor at 0).
create index email_send_log_school_idx on email_send_log(school_id, created_at desc);
create index email_send_log_exchange_idx on email_send_log(exchange_id);

alter table email_send_log enable row level security;

-- STABLE helpers per 20260625000005; no auth.uid() call needed directly.
create policy "organizers read own school email log" on email_send_log for select
  to authenticated
  using (my_role() = 'organizer' and school_id = my_school_id());
```

- [ ] **Step 2: Apply to STAGING first**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Expected: exactly one new migration applied.

- [ ] **Step 3: Apply to PROD via MCP** *(controller step — subagents have no MCP)*

Use Supabase MCP `apply_migration` with name `email_send_log` and the file's SQL verbatim. Then run MCP `get_advisors` (security + performance): expected **zero new** advisories.

- [ ] **Step 4: Add the types**

In `types/db.ts`, next to the other row types:

```ts
export type EmailSendStatus = 'sent' | 'error'
export type EmailSendLog = {
  id: string
  created_at: string
  recipient: string
  kind: string
  status: EmailSendStatus
  error_code: number | null
  school_id: string | null
  exchange_id: string | null
}
```

And in `Database.public.Tables` (alphabetical placement is not the file's convention — append after `feedback`):

```ts
      email_send_log: TableDef<
        EmailSendLog,
        Omit<EmailSendLog, 'id' | 'created_at' | 'error_code' | 'school_id' | 'exchange_id'> &
          Partial<Pick<EmailSendLog, 'error_code' | 'school_id' | 'exchange_id'>>,
        Partial<EmailSendLog>
      >
```

- [ ] **Step 5: Verify types compile and commit**

```bash
npx tsc --noEmit
git add supabase/migrations/20260707000004_email_send_log.sql types/db.ts
git commit -m "feat: email_send_log table (RLS'd audit of every send attempt)"
```

---

### Task 7: `lib/email-log.ts` writer

**Files:**
- Create: `lib/email-log.ts`
- Test: `lib/__tests__/email-log.test.ts`

**Interfaces:**
- Consumes: `createAdminClient()` from `@/lib/supabase/admin`; table from Task 6.
- Produces: `type EmailLogContext = { schoolId?: string | null; exchangeId?: string | null }` and `logEmailSend(entry: { recipient: string; kind: string; status: 'sent' | 'error'; errorCode?: number | null } & EmailLogContext): Promise<void>` — consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

`lib/__tests__/email-log.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn(() => ({ insert: insertMock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }))

import { logEmailSend } from '@/lib/email-log'

describe('logEmailSend', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fromMock.mockClear()
    insertMock.mockResolvedValue({ error: null })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk-test'
  })
  afterEach(() => {
    // Don't leak env into other test files in the same worker.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('inserts a row with snake_case columns and null defaults', async () => {
    await logEmailSend({ recipient: 'parent@example.com', kind: 'invitation email', status: 'sent' })
    expect(fromMock).toHaveBeenCalledWith('email_send_log')
    expect(insertMock).toHaveBeenCalledWith({
      recipient: 'parent@example.com',
      kind: 'invitation email',
      status: 'sent',
      error_code: null,
      school_id: null,
      exchange_id: null,
    })
  })

  it('passes context ids and error code through', async () => {
    await logEmailSend({
      recipient: 'parent@example.com', kind: 'student reminder email', status: 'error',
      errorCode: 429, schoolId: 'school-1', exchangeId: 'exchange-1',
    })
    expect(insertMock).toHaveBeenCalledWith({
      recipient: 'parent@example.com',
      kind: 'student reminder email',
      status: 'error',
      error_code: 429,
      school_id: 'school-1',
      exchange_id: 'exchange-1',
    })
  })

  it('never throws when the insert fails', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '42P01', message: 'relation missing' } })
    await expect(
      logEmailSend({ recipient: 'p@example.com', kind: 'x', status: 'sent' }),
    ).resolves.toBeUndefined()
  })

  it('skips silently when Supabase env is missing (local dev / most tests)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    await logEmailSend({ recipient: 'p@example.com', kind: 'x', status: 'sent' })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test lib/__tests__/email-log.test.ts`
Expected: FAIL — cannot resolve `@/lib/email-log`.

- [ ] **Step 3: Implement**

`lib/email-log.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'

export type EmailLogContext = { schoolId?: string | null; exchangeId?: string | null }

export type EmailSendLogEntry = {
  recipient: string
  kind: string
  status: 'sent' | 'error'
  errorCode?: number | null
} & EmailLogContext

// Best-effort audit trail: a logging failure must never break or slow the send
// path, and console output must never include the recipient (minors' PII —
// the table row is the RLS-protected home for it). Writes use the service-role
// client; email_send_log has no client INSERT policy by design.
export async function logEmailSend(entry: EmailSendLogEntry): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('email_send_log').insert({
      recipient: entry.recipient,
      kind: entry.kind,
      status: entry.status,
      error_code: entry.errorCode ?? null,
      school_id: entry.schoolId ?? null,
      exchange_id: entry.exchangeId ?? null,
    })
    if (error) console.error('[email-log] insert failed:', error.code ?? 'unknown')
  } catch {
    console.error('[email-log] insert threw')
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test lib/__tests__/email-log.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/email-log.ts lib/__tests__/email-log.test.ts
git commit -m "feat: logEmailSend service-role writer for email_send_log"
```

---

### Task 8: Wire logging into `lib/email.ts`

Every send attempt (success or Resend error) writes one log row. The `ctx` field rides inside each exported function's opts object. `sendRejectionEmail` loses its duplicated inline Resend call and goes through `send()` like everything else.

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/__tests__/email.sendlog.test.ts` (new)

**Interfaces:**
- Consumes: `logEmailSend`, `EmailLogContext` from Task 7.
- Produces: every exported `send*` function in `lib/email.ts` (except `sendFeedbackNotificationEmail`) accepts an optional `ctx?: EmailLogContext` property in its opts object — consumed by Task 9. Existing return types unchanged.

- [ ] **Step 1: Write the failing tests**

`lib/__tests__/email.sendlog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

const logMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/email-log', () => ({ logEmailSend: logMock }))

import { sendTemplateReminderEmail, sendRejectionEmail } from '@/lib/email'

describe('send log integration', () => {
  beforeEach(() => {
    sendMock.mockClear()
    logMock.mockClear()
    sendMock.mockResolvedValue({ error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('logs a sent row with the caller context', async () => {
    await sendTemplateReminderEmail({
      to: 'eleve@example.com', studentName: 'Léa', templateName: 'Fiche santé',
      exchangeName: 'France-Canada 2026', deadline: null,
      ctx: { schoolId: 'school-1', exchangeId: 'exchange-1' },
    })
    expect(logMock).toHaveBeenCalledWith({
      recipient: 'eleve@example.com',
      kind: 'template reminder email',
      status: 'sent',
      schoolId: 'school-1',
      exchangeId: 'exchange-1',
    })
  })

  it('logs an error row with the Resend status code', async () => {
    sendMock.mockResolvedValueOnce({ error: { name: 'rate_limit_exceeded', statusCode: 429 } })
    const ok = await sendTemplateReminderEmail({
      to: 'eleve@example.com', studentName: '', templateName: 'F', exchangeName: 'E', deadline: null,
    })
    expect(ok).toBe(false)
    expect(logMock).toHaveBeenCalledWith({
      recipient: 'eleve@example.com',
      kind: 'template reminder email',
      status: 'error',
      errorCode: 429,
    })
  })

  it('does not log when email is disabled (no RESEND_API_KEY)', async () => {
    delete process.env.RESEND_API_KEY
    await sendTemplateReminderEmail({ to: 'e@example.com', studentName: '', templateName: 'F', exchangeName: 'E', deadline: null })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('sendRejectionEmail goes through send() and logs', async () => {
    await sendRejectionEmail({
      to: 'eleve@example.com', studentName: 'Léa', formName: 'Fiche santé',
      note: 'Photo illisible', assignmentId: 'a-1',
      ctx: { schoolId: 'school-1', exchangeId: 'exchange-1' },
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].subject).toBe('Action needed: Fiche santé')
    expect(logMock).toHaveBeenCalledWith({
      recipient: 'eleve@example.com',
      kind: 'rejection email',
      status: 'sent',
      schoolId: 'school-1',
      exchangeId: 'exchange-1',
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test lib/__tests__/email.sendlog.test.ts`
Expected: FAIL (`logEmailSend` never called; `ctx` unknown property).

- [ ] **Step 3: Implement in `lib/email.ts`**

Add the import at the top:

```ts
import { logEmailSend, type EmailLogContext } from '@/lib/email-log'
```

Replace `send()` (currently lines 40–54) with:

```ts
async function send(to: string, subject: string, html: string, label: string, ctx?: EmailLogContext): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return false
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) {
      logSendError(label, error)
      await logEmailSend({
        recipient: to, kind: label, status: 'error',
        errorCode: (error as { statusCode?: number }).statusCode ?? null,
        ...ctx,
      })
      return false
    }
    await logEmailSend({ recipient: to, kind: label, status: 'sent', ...ctx })
    return true
  } catch {
    console.error(`[email] ${label} failed: send threw`)
    await logEmailSend({ recipient: to, kind: label, status: 'error', ...ctx })
    return false
  }
}
```

Note the `await` (not fire-and-forget): pending promises can be dropped when a serverless invocation ends; the audit row must be durable. `logEmailSend` never throws, so this cannot break a send. When `ctx` is undefined the spread contributes nothing and the mock-asserted object shape stays minimal.

Replace `sendRejectionEmail` entirely (the inline Resend call is the only duplicate left):

```ts
export async function sendRejectionEmail(opts: {
  to: string
  studentName: string
  formName: string
  note: string
  assignmentId: string
  ctx?: EmailLogContext
}): Promise<void> {
  // assignmentId is a server-generated UUID; encode defensively all the same.
  const link = `${APP_URL}/my-forms/${encodeURIComponent(opts.assignmentId)}`
  const greeting = opts.studentName ? `Hi ${esc(opts.studentName)},` : 'Hi,'
  const note = esc(opts.note).replace(/\n/g, '<br>')

  const html = layout(`
    <p>${greeting}</p>
    <p>Your submission for <strong>${esc(opts.formName)}</strong> needs some changes before it can be approved.</p>
    <p style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #b91c1c;">
      <strong>Organizer note:</strong> ${note}
    </p>
    <p><a href="${link}" style="display: inline-block; background: #1F7A57; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Update your submission</a></p>
  `)

  // Don't fail the caller's action just because the email bounced: send()
  // already swallows and logs failures.
  await send(opts.to, `Action needed: ${opts.formName}`, html, 'rejection email', opts.ctx)
}
```

Then add `ctx?: EmailLogContext` to the opts type of each remaining exported function and pass it as `send()`'s fifth argument — the body is otherwise untouched. The full list (function → its `send(...)` label stays as-is):

- `sendApplicationResumeEmail` → `send(opts.to, …, 'application resume email', opts.ctx)`
- `sendApplicationConfirmationEmail` → `'application confirmation email'`
- `sendNewApplicationAlertEmail` → `'new application alert email'`
- `sendInvitationEmail` → `'invitation email'`
- `sendApplicationRejectionEmail` → `'application rejection email'`
- `sendTemplateReminderEmail` → `'template reminder email'`
- `sendStudentReminderEmail` → `'student reminder email'`
- `sendPhase2ChecklistEmail` → `'phase-2 checklist email'`
- `sendOrganizerInviteEmail` → `'organizer invite email'`

`sendFeedbackNotificationEmail` gets **no** ctx parameter on purpose: its recipient is the operator's own inbox (`FEEDBACK_EMAIL`); logging it with a `school_id` would expose that address to the school's organizers through the RLS read policy. It still logs (via `send()`) with `school_id` null — service-role-visible only.

- [ ] **Step 4: Run the full email test suite**

Run: `pnpm test lib/__tests__`
Expected: new file passes AND all pre-existing email tests still pass (they don't set Supabase env, so the real `logEmailSend` short-circuits silently).

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/__tests__/email.sendlog.test.ts
git commit -m "feat: log every email send attempt to email_send_log"
```

---

### Task 9: Thread school/exchange context through the call sites

Pure plumbing so log rows carry `school_id`/`exchange_id` (the RLS read key). Each edit adds a `ctx` property to an existing options object — no behavior change. All ids are already in scope except where noted.

**Files:**
- Modify: `actions/applications.ts`, `actions/students.ts`, `actions/forms.ts`, `actions/exchanges.ts`, `actions/submissions.ts`, `lib/team/invite.ts`

**Interfaces:**
- Consumes: the `ctx?: EmailLogContext` opts field from Task 8.

- [ ] **Step 1: `actions/applications.ts` (6 sites)**

In `startApplication`, both `sendApplicationResumeEmail` calls (the existing-draft branch ~line 91 and the fresh-insert branch ~line 141) gain:

```ts
      ctx: { schoolId: exchange.school_a_id, exchangeId: exchange.id },
```

In `sendApplicationResumeLink`, widen the select to include the ids, then pass them:

```ts
    .select('email, status, resume_token_expires_at, school_id, exchange_id, exchanges(name)')
```

```ts
  await sendApplicationResumeEmail({
    to: app.email,
    exchangeName: (app as any).exchanges?.name ?? '',
    resumeUrl: `${APP_URL}/apply/resume/${token}`,
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
  })
```

In `submitApplication` (both the confirmation and the per-organizer alert) add:

```ts
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
```

In `acceptApplication` (`sendInvitationEmail`) and `rejectApplication` (`sendApplicationRejectionEmail`) — `app` comes from `assertOrganizerOwnsApplication`'s `select('*')`, so both ids exist:

```ts
    ctx: { schoolId: app.school_id, exchangeId: app.exchange_id },
```

- [ ] **Step 2: `actions/students.ts` (1 site)**

In `remindStudent`, `schoolId` and `exchangeId` are already local variables:

```ts
  const ok = await sendStudentReminderEmail({
    to: student.email, studentName: student.full_name ?? '',
    exchangeName: exchange?.name ?? '', items,
    ctx: { schoolId, exchangeId },
  })
```

- [ ] **Step 3: `actions/forms.ts` (1 site)**

Widen `notifyIncompleteAssignees`'s `tmpl` parameter type (both callers pass rows from `getOwnedTemplate`, whose select already includes `exchange_id` and `school_id`):

```ts
async function notifyIncompleteAssignees(
  supabase: SupabaseClient,
  tmpl: { id: string; name: string; deadline: string | null; exchange_id: string; school_id: string },
  exchangeName: string,
  cooldownMs: number,
): Promise<{ reminded: number; skipped: number; failed: number }> {
```

and inside its loop:

```ts
    const ok = await sendTemplateReminderEmail({
      to: student.email, studentName: student.full_name ?? '',
      templateName: tmpl.name, exchangeName, deadline: tmpl.deadline,
      ctx: { schoolId: tmpl.school_id, exchangeId: tmpl.exchange_id },
    })
```

- [ ] **Step 4: `actions/exchanges.ts` (1 site)**

In `sendPhase2ChecklistOnce` (`exchangeId` and `schoolId` are parameters):

```ts
    await sendPhase2ChecklistEmail({
      to: student.email, studentName: student.full_name ?? '',
      exchangeName: exchange.name, items,
      ctx: { schoolId, exchangeId },
    })
```

- [ ] **Step 5: `actions/submissions.ts` (1 site)**

Extend the guard's return (it already reads `school_id`):

```ts
async function assertOrganizerOwnsAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<{ exchangeId: string; schoolId: string }> {
```

with the final line becoming:

```ts
  return {
    exchangeId: ctx.form_templates.exchange_id as string,
    schoolId: ctx.form_templates.school_id as string,
  }
```

(Other callers destructure only `{ exchangeId }` — unaffected.) Then in `rejectSubmission`:

```ts
  const { exchangeId, schoolId } = await assertOrganizerOwnsAssignment(supabase, assignmentId)
```

```ts
    await sendRejectionEmail({
      to: info.student.email,
      studentName: info.student.full_name ?? '',
      formName: info.form_templates.name,
      note,
      assignmentId,
      ctx: { schoolId, exchangeId },
    })
```

- [ ] **Step 6: `lib/team/invite.ts` (1 site)**

```ts
  const ok = await sendOrganizerInviteEmail({
    to: email, inviterName: opts.inviterName, schoolName: school?.name ?? '',
    joinUrl: `${opts.appUrl}/join/${token}`,
    ctx: { schoolId: opts.schoolId },
  })
```

(No exchange in scope — organizer invites are school-level.) `actions/feedback.ts` is deliberately untouched (see Task 8).

- [ ] **Step 7: Verify and commit**

Run: `pnpm test && npx tsc --noEmit`
Expected: all green — these are type-checked plumbing edits with no behavior change.

```bash
git add actions/applications.ts actions/students.ts actions/forms.ts actions/exchanges.ts actions/submissions.ts lib/team/invite.ts
git commit -m "feat: thread school/exchange context into email send logging"
```

---

### Task 10: Log sends from the `send-reminders` edge function

The reminder cron is where the outbox trigger signal (429s, duration) must show up, so it logs through the same table — directly with its own service-role client (Deno can't import `@/lib/email-log`).

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts`

**Interfaces:**
- Consumes: `email_send_log` table (Task 6). `pacing.ts` untouched.

- [ ] **Step 1: Extend the fetch to carry ids**

Replace the `.select(...)` string in the assignments query with (adds `school_id` on the student and `id` on the exchange — nothing else changes):

```ts
      'id, last_reminded_at, student:users!student_id(email, full_name, school_id), form_templates!inner(name, deadline, exchanges!inner(id, name, archived_at, reminders_enabled, reminder_cadence)), submissions(status)',
```

- [ ] **Step 2: Track ids in the per-student buckets**

Replace the `perStudent` map declaration with:

```ts
  const perStudent = new Map<
    string,
    { name: string; forms: ReminderForm[]; assignmentIds: string[]; exchangeNames: Set<string>; exchangeIds: Set<string>; schoolId: string | null }
  >()
```

the bucket initialization with:

```ts
    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        forms: [],
        assignmentIds: [],
        exchangeNames: new Set<string>(),
        exchangeIds: new Set<string>(),
        schoolId: student.school_id ?? null,
      })
    }
```

and after the existing `if (exchange?.name) bucket.exchangeNames.add(exchange.name)` line add:

```ts
    if (exchange?.id) bucket.exchangeIds.add(exchange.id)
```

- [ ] **Step 3: Return the Resend status code from `sendEmail`**

Replace `sendEmail` with:

```ts
async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; errorCode: number | null }> {
  if (!RESEND_API_KEY) {
    console.warn('[send-reminders] RESEND_API_KEY not set — skipping reminder email')
    return { ok: false, errorCode: null }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    })
    if (!res.ok) {
      // Don't log `to` — it's student PII. Status + Resend's message is enough to debug.
      console.error('[send-reminders] Resend send failed:', res.status, await res.text())
      return { ok: false, errorCode: res.status }
    }
    return { ok: true, errorCode: null }
  } catch (err) {
    // A network/DNS error must not abort the per-student loop — return ok:false so
    // the rest of the cohort still gets reminded. No `to` in the log (PII).
    console.error('[send-reminders] Resend request error:', (err as Error).message)
    return { ok: false, errorCode: null }
  }
}
```

- [ ] **Step 4: Log each attempt in the send loop**

Replace the loop head (from `const anyOverdue…` through `sent++`) with:

```ts
  for (const [email, { name, forms, assignmentIds, exchangeNames, exchangeIds, schoolId }] of perStudent) {
    const anyOverdue = forms.some(f => f.overdue)
    const ref = dossierRef([...exchangeNames], false)
    const subject = anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`

    const result = await sendEmail(email, subject, buildEmail(name, [...exchangeNames], forms))
    // Audit every real attempt (skip when email is disabled entirely). The 429
    // signal here is the trigger for building the outbox worker — see the
    // architecture-scalability spec.
    if (RESEND_API_KEY) {
      const { error: logError } = await supabase.from('email_send_log').insert({
        recipient: email,
        kind: 'reminder cron email',
        status: result.ok ? 'sent' : 'error',
        error_code: result.errorCode,
        school_id: schoolId,
        exchange_id: exchangeIds.size === 1 ? [...exchangeIds][0] : null,
      })
      if (logError) console.error('[send-reminders] send-log insert failed:', logError.code)
    }
    if (!result.ok) continue
    sent++
```

(The stamping block below it is unchanged.)

- [ ] **Step 5: Deploy to staging and smoke-test**

```bash
set -a; source .env.staging; set +a
supabase functions deploy send-reminders --project-ref "$STAGING_PROJECT_REF"
curl -s -X POST "https://$STAGING_PROJECT_REF.supabase.co/functions/v1/send-reminders" -H "x-cron-secret: $STAGING_CRON_SECRET"
```

Expected: `{"students":0,"emailsSent":0}` (no assignments seeded; also proves the new code boots). Prod deploy happens in Task 11 after merge.

- [ ] **Step 6: Verify and commit**

Run: `pnpm test` (pacing tests must stay green — `pacing.ts` untouched).

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "feat: send-reminders logs every attempt to email_send_log"
```

---

### Task 11: Final gate, merge, prod deploy

- [ ] **Step 1: Full verification on the branch**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: zero errors/warnings, all tests pass. Use superpowers:verification-before-completion — no success claims without this output.

- [ ] **Step 2: Diff hygiene scan**

```bash
git diff main --stat
```

Confirm: only the files this plan names; no `.env.staging`, no stray PII files (subagent-broad-git-add risk).

- [ ] **Step 3: CHECKPOINT (Bjorn) — merge and push**

Requires explicit confirmation (deploys to production):

```bash
git checkout main && git pull && git merge --no-ff feature/architecture-scalability
pnpm lint && pnpm test && npx tsc --noEmit   # gate re-run on merged main
git push && git branch -d feature/architecture-scalability && git push origin --delete feature/architecture-scalability
```

- [ ] **Step 4: Deploy the edge function to prod**

```bash
supabase functions deploy send-reminders
```

(Default linked project = prod; `verify_jwt=false` comes from config.toml.)

- [ ] **Step 5: Post-deploy verification**

- MCP `get_advisors` on prod: zero new advisories.
- Next morning (or via a manual prod cron invoke if Bjorn wants immediate proof): `select kind, status, count(*) from email_send_log group by 1, 2;` on prod shows `reminder cron email` rows.
- Vercel prod deployment READY; prod site loads with real data; a fresh preview still shows staging data.

- [ ] **Step 6: Update memory + progress ledger**

Update the auto-memory phase entry (`project_architecture_scalability_review.md`: plan executed, staging ref, what's live) and `.superpowers/sdd/progress.md`. Also update `project_preview_deploy_workflow.md` (previews now hit staging — the reversal is EXECUTED) and note in `project_security_hardening.md` that the staging project now exists as W1's candidate test target.
