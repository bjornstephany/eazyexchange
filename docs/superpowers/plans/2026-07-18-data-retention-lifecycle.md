# Data Retention Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GDPR enforcement layer for `docs/security/data-retention-policy.md` — one shared "erase a subject" primitive, an automated retention sweep (log-only first), organizer self-serve erasure, and organizer self-serve export.

**Architecture:** Erasure lives in one Next-side, service-role primitive (`lib/retention/erase.ts`) whose load-bearing invariant is *delete storage objects before DB rows* (SQL row deletes never free S3 bytes). The sweep is a **Next.js cron route** (`app/api/cron/retention-sweep/route.ts`) triggered by `pg_cron net.http_post` — it imports the same primitive, so the orphan-file-risk code has exactly one tested implementation. Retention durations live only in the pure `lib/retention/rules.ts`. Export is the read-side twin, running on the organizer's own RLS session.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS + Storage + service-role admin client), `pg_cron`/`pg_net`, vitest (+ `test:rls` real-Postgres matrix), `jszip` (new dep, export only).

## Global Constraints

- **Package manager is `pnpm`** (never npm).
- **Storage-before-rows is the single correctness invariant** of every erase path — gather paths → `storage.remove(...)` → delete rows. Unit-tested by asserting call order.
- **Never log student/parent PII** — audit/log payloads carry ids + counts only, never names, emails, or contents.
- **Service-role admin client (`@/lib/supabase/admin`) is allowlisted.** This change adds exactly two entries: `lib/retention/erase.ts` and `lib/retention/sweep.ts`. Update `lib/supabase/__tests__/admin-allowlist.test.ts` in the same task that introduces each file.
- **Expected outcomes are structured return values, never thrown** (prod redacts thrown Server Action messages). Only throw for genuinely unexpected failures. Auth preambles come from `lib/auth/require.ts` (`requireOrganizer()` — error strings `'Unauthenticated'`/`'Unauthorized'` are load-bearing).
- **Migrations: staging first, then prod via MCP `apply_migration`**; regen types → `npx tsc --noEmit`. Any migration/RLS/storage change ships with `tests/rls/` matrix cases in the same PR (`pnpm test:rls`).
- **Standard gate before any commit:** `pnpm lint && pnpm test && pnpm build` (+ `pnpm test:rls` for schema/RLS/storage tasks).
- **Erasure is irreversible.** The sweep ships with `RETENTION_ENFORCE` **off** (log-only). Manual erasure ships behind an explicit confirmation dialog.

---

## Deviations from the spec (read before starting)

These are conscious, approved implementation decisions where the spec's prose could not hold literally:

1. **Sweep is a Next.js cron route, not a Supabase edge function** (Bjorn's call, 2026-07-18). A Deno edge function cannot import the Next `@/lib/retention/erase.ts` primitive; a Next route can. Consequence: the enforce flag is a **Vercel env var `RETENTION_ENFORCE`** (flip = set to `1` + one redeploy) rather than a Supabase function secret, and the cron secret is a **Vercel env var `CRON_SECRET`** (independent from `send-reminders`' Supabase function secret of the same name).
2. **Two allowlist entries, not one.** The spec said `erase.ts` would be the only new allowlist entry; the Next-route choice means `lib/retention/sweep.ts` also imports the admin client (it fetches candidates and deletes service-role-only rows). Both are listed deliberately.
3. **Export's application photo uses the existing service-role signer.** The `application-photos` bucket has *no* organizer RLS storage policy (it is service-role-only — see `tests/rls/storage.test.ts`), so an organizer's RLS session cannot download the photo directly. Export reuses `lib/application-photos.ts`'s already-allowlisted `signApplicationPhotoUrls` for the photo only; everything else in export (DB rows + `documents`-bucket files) runs on the organizer RLS session as the spec requires.
4. **v1 scope — the two highest-irreversibility categories are deferred** (see "Deferred to a follow-up plan" at the end): automatic **student-account deletion** and **organizer-account deletion**. v1 implements every other category, including the headline uploaded-documents (rows + storage) purge, all under log-only-first so nothing deletes until counts are verified.

---

## File Structure

**Phase 1 — primitive + cascade**
- Create `supabase/migrations/20260718000001_retention_cascade.sql` — flip `applications.enrolled_user_id` FK to `ON DELETE SET NULL`; documents the FK audit.
- Create `lib/retention/erase.ts` — `eraseApplication`, `eraseStudent`, `purgeExchangeDocuments` (service-role; allowlisted).
- Create `lib/retention/__tests__/erase.test.ts` — storage-before-rows order + counts, storage/DB mocked.
- Modify `lib/supabase/__tests__/admin-allowlist.test.ts` — add `lib/retention/erase.ts`.
- Create `tests/rls/retention-cascade.test.ts` — real-Postgres proof the FK sets null, not blocks.
- Modify `lib/audit.ts` — add `subject.erased`, `retention.sweep` actions + `system` target type.

**Phase 2 — sweep**
- Create `lib/retention/rules.ts` — retention durations + `cutoff`/`isDue` (pure).
- Create `lib/retention/__tests__/rules.test.ts` — boundary math.
- Create `lib/retention/sweep.ts` — `runRetentionSweep(now, mode)` (service-role; allowlisted).
- Create `lib/retention/__tests__/sweep.test.ts` — log-only counts vs enforce deletes, mocked.
- Modify `lib/supabase/__tests__/admin-allowlist.test.ts` — add `lib/retention/sweep.ts`.
- Create `app/api/cron/retention-sweep/route.ts` — cron-secret gate → `runRetentionSweep` → audit.
- Create `app/api/cron/retention-sweep/__tests__/route.test.ts` — 401 without secret; runs + audits with it.
- Create `docs/security/retention-sweep-runbook.md` — pg_cron schedule + enforce-flip steps (no secrets committed).

**Phase 3 — erase action + UI**
- Modify `actions/retention.ts` (created in Phase 1? No — create here) — `getErasableSubjects`, `eraseSubject`.
- Create `actions/__tests__/retention-erase.test.ts` — scope check + primitive dispatch, mocked.
- Create `tests/rls/retention-access.test.ts` — organizer erases/lists only own school.
- Create `components/settings/DataPrivacyCard.tsx` — list + delete confirmation dialog.
- Create `components/settings/__tests__/DataPrivacyCard.test.tsx`.
- Modify `components/settings/SettingsView.tsx` + `app/(organizer)/settings/page.tsx` — new `donnees` section.
- Modify `messages/{en,fr,es,it,de}.json` — `organizer.settings.nav.donnees` + `organizer.dataPrivacy.*`.

**Phase 4 — export action + UI**
- Add dependency `jszip`.
- Modify `actions/retention.ts` — `exportSubject`.
- Create `actions/__tests__/retention-export.test.ts`.
- Modify `components/settings/DataPrivacyCard.tsx` — Export button + download.
- Modify `messages/{en,fr,es,it,de}.json` — `organizer.dataPrivacy.export*`.

---

## Phase / stage boundaries (CLAUDE.md session hygiene)

Natural `/clear` points: **after Phase 1**, **after Phase 2**, **after Phase 3**. Phases 3 and 4 are independent leaves once Phase 1 lands — either order. Each phase ends green (full gate) and is independently mergeable. At each boundary, commit and stop; resume prompt: *"Continue the data-retention plan at Phase N — docs/superpowers/plans/2026-07-18-data-retention-lifecycle.md, worktree `data-retention-lifecycle`."*

---

# PHASE 1 — Erase primitive + cascade migration

### Task 1: Cascade migration

**Files:**
- Create: `supabase/migrations/20260718000001_retention_cascade.sql`
- Test: `tests/rls/retention-cascade.test.ts`

**Interfaces:**
- Produces: `applications.enrolled_user_id` FK becomes `ON DELETE SET NULL`. Later tasks rely on `auth.admin.deleteUser(userId)` cascading `public.users` → all per-student operational rows without an FK block.

- [ ] **Step 1: Write the migration**

```sql
-- Retention / erasure cascade cleanup.
-- FK ON DELETE audit for subject erasure (see
-- docs/superpowers/specs/2026-07-18-data-retention-lifecycle-design.md):
--   Already ON DELETE CASCADE — no change needed:
--     submissions.assignment_id, document_uploads.submission_id,
--     field_answers.submission_id, assignments.student_id,
--     assignments.template_id, exchange_enrollments.user_id, feedback.user_id,
--     public.users.id -> auth.users.id.
--   => auth.admin.deleteUser(userId) cascades public.users and every per-student
--      operational row (assignments, submissions, field_answers,
--      document_uploads, enrollments) in a single delete.
--   Applications have NO child FKs pointing at applications.id, so an
--   application row deletes on its own.
--   Gap: applications.enrolled_user_id was ON DELETE NO ACTION, which BLOCKS
--   deleting an enrolled student's user row. Switch to SET NULL so a user
--   delete is never hard-blocked. (The erase primitive still deletes the linked
--   application explicitly to erase its data; SET NULL is the safety net for the
--   sweep path, where the application may already be purged.)

alter table public.applications
  drop constraint applications_enrolled_user_id_fkey,
  add constraint applications_enrolled_user_id_fkey
    foreign key (enrolled_user_id) references public.users(id) on delete set null;
```

- [ ] **Step 2: Write the failing RLS-suite test**

```ts
// tests/rls/retention-cascade.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect } from './db'

const sql = connect()
afterAll(async () => { await sql.end() })

describe('retention cascade migration', () => {
  it('deleting an enrolled student nulls applications.enrolled_user_id, not blocks', async () => {
    // Superuser connection; whole test runs in a rolled-back transaction.
    await expect(sql.begin(async (tx) => {
      const [school] = await tx`insert into schools (name) values ('cascade-test') returning id`
      // A user row requires an auth.users parent (users.id -> auth.users.id).
      const [au] = await tx`insert into auth.users (id, instance_id, aud, role, email)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                'authenticated', concat('cascade-', gen_random_uuid(), '@test')) returning id`
      await tx`insert into users (id, school_id, role, full_name, email)
        values (${au.id}, ${school.id}, 'student', 'Cascade Test', concat(${au.id}::text, '@t'))`
      const [ex] = await tx`insert into exchanges (name, year, school_a_id)
        values ('X', 2026, ${school.id}) returning id`
      const [app] = await tx`insert into applications
        (exchange_id, school_id, email, resume_token, status, enrolled_user_id)
        values (${ex.id}, ${school.id}, 'a@t', concat('rt-', gen_random_uuid()), 'enrolled', ${au.id})
        returning id`
      // Deleting the auth user cascades to public.users; the FK must SET NULL.
      await tx`delete from auth.users where id = ${au.id}`
      const [row] = await tx`select enrolled_user_id from applications where id = ${app.id}`
      expect(row.enrolled_user_id).toBeNull()
      throw new Error('__rollback__')
    })).rejects.toThrow('__rollback__')
  })
})
```

- [ ] **Step 3: Run it — expect FAIL** (before the migration is applied to the test DB the delete raises a foreign-key violation, not SET NULL).

Run: `pnpm exec supabase db reset` then `pnpm test:rls -- retention-cascade`
Expected: FAIL (FK `update or delete on table "users" violates foreign key constraint`).

- [ ] **Step 4: Apply the migration to the local/test DB, re-run**

Run: `pnpm exec supabase db reset` (re-applies all migrations incl. the new one) then `pnpm test:rls -- retention-cascade`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718000001_retention_cascade.sql tests/rls/retention-cascade.test.ts
git commit -m "feat(retention): cascade migration — enrolled_user_id ON DELETE SET NULL"
```

---

### Task 2: Audit action + target-type extensions

**Files:**
- Modify: `lib/audit.ts:3-17`

**Interfaces:**
- Produces: `AuditAction` gains `'subject.erased' | 'retention.sweep'`; `AuditTargetType` gains `'system'`. Consumed by Tasks 3-side callers (sweep route, erase action).

- [ ] **Step 1: Extend the union types**

In `lib/audit.ts`, add to `AuditAction` (after `'billing.grace_started'`):

```ts
  | 'billing.grace_started'
  | 'subject.erased'
  | 'retention.sweep'
```

and extend `AuditTargetType`:

```ts
export type AuditTargetType =
  | 'submission' | 'application' | 'user' | 'organizer_invite' | 'exchange' | 'school' | 'system'
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/audit.ts
git commit -m "feat(retention): audit actions subject.erased + retention.sweep"
```

---

### Task 3: `lib/retention/erase.ts` primitive

**Files:**
- Create: `lib/retention/erase.ts`
- Test: `lib/retention/__tests__/erase.test.ts`
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts:10-26`

**Interfaces:**
- Consumes: `createAdminClient` (`@/lib/supabase/admin`), `APPLICATION_PHOTO_BUCKET` (`@/lib/uploads`).
- Produces:
  - `eraseApplication(applicationId: string): Promise<{ applicationId: string; photosDeleted: number }>`
  - `eraseStudent(userId: string): Promise<{ userId: string; documentsDeleted: number; photosDeleted: number; applicationsDeleted: number }>`
  - `purgeExchangeDocuments(exchangeId: string): Promise<{ exchangeId: string; documentsDeleted: number }>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/retention/__tests__/erase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Records the order of side effects so we can assert storage-before-rows.
const calls: string[] = []

// Configurable per-table select results.
let selectResults: Record<string, any[]> = {}

function makeAdmin() {
  const storage = {
    from: (bucket: string) => ({
      remove: vi.fn(async (paths: string[]) => { calls.push(`storage.remove:${bucket}:${paths.length}`); return { data: paths, error: null } }),
    }),
  }
  const table = (name: string) => {
    const rows = selectResults[name] ?? []
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
      delete: () => ({
        eq: async () => { calls.push(`db.delete:${name}`); return { error: null } },
        in: async () => { calls.push(`db.delete:${name}`); return { error: null } },
      }),
    }
    return builder
  }
  return {
    storage,
    from: (name: string) => table(name),
    auth: { admin: { deleteUser: vi.fn(async (id: string) => { calls.push(`auth.deleteUser:${id}`); return { error: null } }) } },
  }
}

let admin: ReturnType<typeof makeAdmin>
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

beforeEach(() => {
  calls.length = 0
  selectResults = {}
  admin = makeAdmin()
})

describe('eraseApplication', () => {
  it('removes the photo BEFORE deleting the row and reports counts', async () => {
    selectResults.applications = [{ photo_path: 'app-1/photo.jpg' }]
    const { eraseApplication } = await import('@/lib/retention/erase')
    const res = await eraseApplication('app-1')
    expect(res).toEqual({ applicationId: 'app-1', photosDeleted: 1 })
    expect(calls).toEqual(['storage.remove:application-photos:1', 'db.delete:applications'])
  })

  it('skips storage when there is no photo', async () => {
    selectResults.applications = [{ photo_path: null }]
    const { eraseApplication } = await import('@/lib/retention/erase')
    const res = await eraseApplication('app-2')
    expect(res.photosDeleted).toBe(0)
    expect(calls).toEqual(['db.delete:applications'])
  })
})

describe('eraseStudent', () => {
  it('removes all storage before any DB delete, deletes app then auth user', async () => {
    selectResults.assignments = [{ id: 'a1' }]
    selectResults.submissions = [{ id: 's1' }]
    selectResults.document_uploads = [{ storage_path: 'a1/slot/doc.pdf' }]
    selectResults.applications = [{ id: 'app-9', photo_path: 'app-9/photo.jpg' }]
    const { eraseStudent } = await import('@/lib/retention/erase')
    const res = await eraseStudent('user-1')
    expect(res).toEqual({ userId: 'user-1', documentsDeleted: 1, photosDeleted: 1, applicationsDeleted: 1 })
    // Both storage removes precede both DB mutations.
    const firstDb = calls.findIndex(c => c.startsWith('db.') || c.startsWith('auth.'))
    const lastStorage = calls.map(c => c.startsWith('storage.')).lastIndexOf(true)
    expect(lastStorage).toBeLessThan(firstDb)
    expect(calls).toContain('storage.remove:documents:1')
    expect(calls).toContain('storage.remove:application-photos:1')
    expect(calls).toContain('db.delete:applications')
    expect(calls).toContain('auth.deleteUser:user-1')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

Run: `pnpm test -- erase`
Expected: FAIL (`Cannot find module '@/lib/retention/erase'`).

- [ ] **Step 3: Write `lib/retention/erase.ts`**

```ts
// lib/retention/erase.ts
// Service-role subject-erasure primitive (GDPR Art. 17). ON THE ADMIN ALLOWLIST.
//
// INVARIANT (load-bearing): delete storage objects BEFORE DB rows. Deleting a
// storage.objects row via SQL does not remove the S3 bytes — only the Storage
// API does — and once the DB rows are gone the paths are lost. This ordering is
// the single place the orphan-file bug can exist; it is unit-tested (erase.test.ts).
//
// Every function returns a PII-free summary (ids + counts only) for the caller
// to write to audit_log.

import { createAdminClient } from '@/lib/supabase/admin'
import { APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'

const DOCUMENTS_BUCKET = 'documents'

export type EraseApplicationResult = { applicationId: string; photosDeleted: number }
export type EraseStudentResult = {
  userId: string
  documentsDeleted: number
  photosDeleted: number
  applicationsDeleted: number
}
export type PurgeDocumentsResult = { exchangeId: string; documentsDeleted: number }

export async function eraseApplication(applicationId: string): Promise<EraseApplicationResult> {
  const admin = createAdminClient()

  // 1. Gather the storage path before deleting the row.
  const { data: app } = await admin
    .from('applications').select('photo_path').eq('id', applicationId).maybeSingle()

  // 2. Storage first.
  let photosDeleted = 0
  if (app?.photo_path) {
    await admin.storage.from(APPLICATION_PHOTO_BUCKET).remove([app.photo_path])
    photosDeleted = 1
  }

  // 3. DB row (no child FKs reference applications.id).
  await admin.from('applications').delete().eq('id', applicationId)

  return { applicationId, photosDeleted }
}

export async function eraseStudent(userId: string): Promise<EraseStudentResult> {
  const admin = createAdminClient()

  // 1. Gather EVERY storage path this student owns before any delete.
  const { data: assignments } = await admin.from('assignments').select('id').eq('student_id', userId)
  const assignmentIds = (assignments ?? []).map(a => a.id)

  let docPaths: string[] = []
  if (assignmentIds.length > 0) {
    const { data: subs } = await admin.from('submissions').select('id').in('assignment_id', assignmentIds)
    const submissionIds = (subs ?? []).map(s => s.id)
    if (submissionIds.length > 0) {
      const { data: uploads } = await admin
        .from('document_uploads').select('storage_path').in('submission_id', submissionIds)
      docPaths = (uploads ?? []).map(u => u.storage_path)
    }
  }

  const { data: apps } = await admin
    .from('applications').select('id, photo_path').eq('enrolled_user_id', userId)
  const photoPaths = (apps ?? []).map(a => a.photo_path).filter((p): p is string => !!p)

  // 2. Storage first — documents, then application photos.
  if (docPaths.length > 0) await admin.storage.from(DOCUMENTS_BUCKET).remove(docPaths)
  if (photoPaths.length > 0) await admin.storage.from(APPLICATION_PHOTO_BUCKET).remove(photoPaths)

  // 3. DB rows. Delete the linked application(s) explicitly to erase their data
  //    (and free the enrolled_user_id FK), then delete the auth user — which
  //    CASCADEs public.users -> assignments -> submissions -> field_answers /
  //    document_uploads and exchange_enrollments (see the cascade migration).
  await admin.from('applications').delete().eq('enrolled_user_id', userId)
  await admin.auth.admin.deleteUser(userId)

  return {
    userId,
    documentsDeleted: docPaths.length,
    photosDeleted: photoPaths.length,
    applicationsDeleted: (apps ?? []).length,
  }
}

// Purge every uploaded document (rows + storage) under one exchange, without
// touching students or their form answers. Used by the sweep for exchanges
// archived past the documents retention window.
export async function purgeExchangeDocuments(exchangeId: string): Promise<PurgeDocumentsResult> {
  const admin = createAdminClient()

  const { data: templates } = await admin.from('form_templates').select('id').eq('exchange_id', exchangeId)
  const templateIds = (templates ?? []).map(t => t.id)
  if (templateIds.length === 0) return { exchangeId, documentsDeleted: 0 }

  const { data: assignments } = await admin.from('assignments').select('id').in('template_id', templateIds)
  const assignmentIds = (assignments ?? []).map(a => a.id)
  if (assignmentIds.length === 0) return { exchangeId, documentsDeleted: 0 }

  const { data: subs } = await admin.from('submissions').select('id').in('assignment_id', assignmentIds)
  const submissionIds = (subs ?? []).map(s => s.id)
  if (submissionIds.length === 0) return { exchangeId, documentsDeleted: 0 }

  const { data: uploads } = await admin
    .from('document_uploads').select('id, storage_path').in('submission_id', submissionIds)
  const paths = (uploads ?? []).map(u => u.storage_path)
  const ids = (uploads ?? []).map(u => u.id)
  if (paths.length === 0) return { exchangeId, documentsDeleted: 0 }

  // Storage first, then rows.
  await admin.storage.from(DOCUMENTS_BUCKET).remove(paths)
  await admin.from('document_uploads').delete().in('id', ids)
  return { exchangeId, documentsDeleted: paths.length }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test -- erase`
Expected: PASS (all cases in `erase.test.ts`).

- [ ] **Step 5: Add to the admin allowlist**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, add to the `ALLOWLIST` array (keep it sorted — `.sort()` runs, but keep source tidy):

```ts
  'lib/rate-limit.ts',
  'lib/retention/erase.ts',
```

- [ ] **Step 6: Run the allowlist test — expect PASS**

Run: `pnpm test -- admin-allowlist`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/retention/erase.ts lib/retention/__tests__/erase.test.ts lib/supabase/__tests__/admin-allowlist.test.ts
git commit -m "feat(retention): erase.ts primitive (storage-first) + allowlist"
```

---

**Phase 1 gate:** `pnpm lint && pnpm test && pnpm build && pnpm test:rls`. All green → this is a `/clear` boundary. Resume prompt for Phase 2 below.

---

# PHASE 2 — Automated retention sweep (log-only first)

### Task 4: `lib/retention/rules.ts` (pure durations + math)

**Files:**
- Create: `lib/retention/rules.ts`
- Test: `lib/retention/__tests__/rules.test.ts`

**Interfaces:**
- Produces:
  - `RETENTION_DAYS: Record<RetentionCategory, number>` (the single source of truth).
  - `cutoff(now: Date, category: RetentionCategory): string` — ISO timestamp; rows older are due.
  - `isDue(now: Date, timestamp: string | null, category: RetentionCategory): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/retention/__tests__/rules.test.ts
import { describe, it, expect } from 'vitest'
import { RETENTION_DAYS, cutoff, isDue } from '@/lib/retention/rules'

const NOW = new Date('2026-07-18T03:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('retention rules', () => {
  it('cutoff subtracts the category window from now', () => {
    expect(cutoff(NOW, 'rateLimits')).toBe(daysAgo(7))
    expect(cutoff(NOW, 'abandonedDraftApplication')).toBe(daysAgo(90))
  })

  it('isDue is inclusive at the boundary and false for null', () => {
    expect(isDue(NOW, null, 'rateLimits')).toBe(false)
    expect(isDue(NOW, daysAgo(7), 'rateLimits')).toBe(true)   // exactly at cutoff
    expect(isDue(NOW, daysAgo(6), 'rateLimits')).toBe(false)  // one day too fresh
    expect(isDue(NOW, daysAgo(8), 'rateLimits')).toBe(true)
  })

  it('encodes the policy windows', () => {
    expect(RETENTION_DAYS.emailSendLog).toBe(365)
    expect(RETENTION_DAYS.auditLog).toBe(730)
    expect(RETENTION_DAYS.errorReportsResolved).toBe(90)
    expect(RETENTION_DAYS.rejectedApplicant).toBe(182)
    expect(RETENTION_DAYS.enrolledApplicationRow).toBe(182)
    expect(RETENTION_DAYS.enrolledFormAnswers).toBe(365)
    expect(RETENTION_DAYS.uploadedDocuments).toBe(91)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module`)

Run: `pnpm test -- rules`

- [ ] **Step 3: Write `lib/retention/rules.ts`**

```ts
// lib/retention/rules.ts
// Pure retention math — the SINGLE source of truth for how long each category
// is kept. No DB, no I/O. Given `now`, returns the cutoff timestamp; rows/
// subjects at or before the cutoff are due for deletion. Fully unit-tested.
// Month windows use whole-day approximations (6mo=182, 3mo=91, 12mo=365,
// 24mo=730) — retention floors, not exact calendar months.

export const RETENTION_DAYS = {
  abandonedDraftApplication: 90,  // applications.updated_at, status='draft'
  rejectedApplicant: 182,         // reviewed_at | responded_at; status rejected/declined
  enrolledApplicationRow: 182,    // applications.updated_at, status='enrolled'
  enrolledFormAnswers: 365,       // exchanges.archived_at
  uploadedDocuments: 91,          // exchanges.archived_at
  emailSendLog: 365,              // created_at
  auditLog: 730,                  // created_at
  errorReportsResolved: 90,       // last_seen_at, status='resolved'
  rateLimits: 7,                  // window_start
} as const

export type RetentionCategory = keyof typeof RETENTION_DAYS

const DAY_MS = 24 * 60 * 60 * 1000

export function cutoff(now: Date, category: RetentionCategory): string {
  return new Date(now.getTime() - RETENTION_DAYS[category] * DAY_MS).toISOString()
}

// Due when `timestamp` is at or before the category cutoff. Null is never due
// (age unknown).
export function isDue(now: Date, timestamp: string | null, category: RetentionCategory): boolean {
  if (!timestamp) return false
  return new Date(timestamp).getTime() <= now.getTime() - RETENTION_DAYS[category] * DAY_MS
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test -- rules`

- [ ] **Step 5: Commit**

```bash
git add lib/retention/rules.ts lib/retention/__tests__/rules.test.ts
git commit -m "feat(retention): pure retention rules (durations + cutoff/isDue)"
```

---

### Task 5: `lib/retention/sweep.ts` orchestration

**Files:**
- Create: `lib/retention/sweep.ts`
- Test: `lib/retention/__tests__/sweep.test.ts`
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`; `eraseApplication`, `purgeExchangeDocuments` (Task 3); `cutoff`, `isDue` (Task 4).
- Produces: `runRetentionSweep(now: Date, mode: 'log-only' | 'enforce'): Promise<Record<string, number>>` — a PII-free count per category. In `log-only` it deletes nothing.

- [ ] **Step 1: Write the failing test**

```ts
// lib/retention/__tests__/sweep.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const eraseApplication = vi.fn(async () => ({ applicationId: 'x', photosDeleted: 0 }))
const purgeExchangeDocuments = vi.fn(async () => ({ exchangeId: 'x', documentsDeleted: 3 }))
vi.mock('@/lib/retention/erase', () => ({ eraseApplication, purgeExchangeDocuments }))

// Minimal query-builder stub keyed by table. Each table yields fixed rows and a
// spy-able delete.
let tableRows: Record<string, any[]>
const deleteSpy = vi.fn()
function builderFor(name: string): any {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, lt: () => b, not: () => b, is: () => b,
    then: (resolve: any) => resolve({ data: tableRows[name] ?? [], error: null, count: (tableRows[name] ?? []).length }),
    delete: (_opts?: any) => ({
      in: async () => { deleteSpy(name); return { error: null, count: (tableRows[name] ?? []).length } },
      lt: async () => { deleteSpy(name); return { error: null, count: (tableRows[name] ?? []).length } },
      eq: async () => { deleteSpy(name); return { error: null, count: (tableRows[name] ?? []).length } },
    }),
  }
  return b
}
const admin = { from: (name: string) => builderFor(name) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const NOW = new Date('2026-07-18T03:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  tableRows = {}
})

describe('runRetentionSweep — log-only', () => {
  it('counts candidates but deletes nothing', async () => {
    tableRows.applications = [{ id: 'app-1', status: 'draft', updated_at: '2000-01-01', reviewed_at: null, responded_at: null }]
    const { runRetentionSweep } = await import('@/lib/retention/sweep')
    const summary = await runRetentionSweep(NOW, 'log-only')
    expect(summary.abandonedDraftApplication).toBeGreaterThanOrEqual(0)
    expect(eraseApplication).not.toHaveBeenCalled()
    expect(purgeExchangeDocuments).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })
})

describe('runRetentionSweep — enforce', () => {
  it('erases due draft applications via the primitive', async () => {
    tableRows.applications = [{ id: 'app-1', status: 'draft', updated_at: '2000-01-01', reviewed_at: null, responded_at: null }]
    const { runRetentionSweep } = await import('@/lib/retention/sweep')
    await runRetentionSweep(NOW, 'enforce')
    expect(eraseApplication).toHaveBeenCalledWith('app-1')
  })
})
```

> Note for the implementer: the stub above returns the *same* `tableRows.applications` for the draft / rejected / enrolled queries. That's fine — the assertions only check that log-only never mutates and enforce dispatches. Keep the production code's own `.eq('status', …)`/`.in('status', …)` filters (the real DB applies them); do not rely on the stub to filter.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test -- sweep`

- [ ] **Step 3: Write `lib/retention/sweep.ts`**

```ts
// lib/retention/sweep.ts
// Retention sweep orchestration. ON THE ADMIN ALLOWLIST (fetches candidates and
// deletes service-role-only rows). Pure durations come from ./rules; subject
// deletion goes through ./erase (storage-first). log-only counts; enforce
// deletes. Returns a PII-free count per category.

import { createAdminClient } from '@/lib/supabase/admin'
import { eraseApplication, purgeExchangeDocuments } from '@/lib/retention/erase'
import { cutoff, isDue } from '@/lib/retention/rules'

export type SweepMode = 'log-only' | 'enforce'
export type SweepSummary = Record<string, number>

type Admin = ReturnType<typeof createAdminClient>

async function purgeByAge(
  admin: Admin, mode: SweepMode, table: string, column: string, before: string,
): Promise<number> {
  if (mode === 'enforce') {
    const { count } = await admin.from(table as any).delete({ count: 'exact' }).lt(column, before)
    return count ?? 0
  }
  const { count } = await admin.from(table as any).select('*', { count: 'exact', head: true }).lt(column, before)
  return count ?? 0
}

async function submissionIdsForExchange(admin: Admin, exchangeId: string): Promise<string[]> {
  const { data: templates } = await admin.from('form_templates').select('id').eq('exchange_id', exchangeId)
  const templateIds = (templates ?? []).map((t: any) => t.id)
  if (templateIds.length === 0) return []
  const { data: assignments } = await admin.from('assignments').select('id').in('template_id', templateIds)
  const assignmentIds = (assignments ?? []).map((a: any) => a.id)
  if (assignmentIds.length === 0) return []
  const { data: subs } = await admin.from('submissions').select('id').in('assignment_id', assignmentIds)
  return (subs ?? []).map((s: any) => s.id)
}

export async function runRetentionSweep(now: Date, mode: SweepMode): Promise<SweepSummary> {
  const admin = createAdminClient()
  const summary: SweepSummary = {}

  // 1. Abandoned draft applications (via erase primitive).
  {
    const { data } = await admin.from('applications')
      .select('id').eq('status', 'draft').lt('updated_at', cutoff(now, 'abandonedDraftApplication'))
    const ids = (data ?? []).map((r: any) => r.id)
    summary.abandonedDraftApplication = ids.length
    if (mode === 'enforce') for (const id of ids) await eraseApplication(id)
  }

  // 2. Rejected / declined applicants (reviewed_at | responded_at).
  {
    const { data } = await admin.from('applications')
      .select('id, reviewed_at, responded_at').in('status', ['rejected', 'declined'])
    const due = (data ?? []).filter((r: any) =>
      isDue(now, r.reviewed_at ?? r.responded_at, 'rejectedApplicant'))
    summary.rejectedApplicant = due.length
    if (mode === 'enforce') for (const r of due) await eraseApplication(r.id)
  }

  // 3. Enrolled application rows.
  {
    const { data } = await admin.from('applications')
      .select('id').eq('status', 'enrolled').lt('updated_at', cutoff(now, 'enrolledApplicationRow'))
    const ids = (data ?? []).map((r: any) => r.id)
    summary.enrolledApplicationRow = ids.length
    if (mode === 'enforce') for (const id of ids) await eraseApplication(id)
  }

  // 4. Uploaded documents (rows + storage) for exchanges archived > 3mo.
  {
    const { data } = await admin.from('exchanges')
      .select('id').not('archived_at', 'is', null).lt('archived_at', cutoff(now, 'uploadedDocuments'))
    const exchangeIds = (data ?? []).map((r: any) => r.id)
    let docs = 0
    for (const id of exchangeIds) {
      if (mode === 'enforce') {
        docs += (await purgeExchangeDocuments(id)).documentsDeleted
      } else {
        const submissionIds = await submissionIdsForExchange(admin, id)
        if (submissionIds.length === 0) continue
        const { count } = await admin.from('document_uploads')
          .select('id', { count: 'exact', head: true }).in('submission_id', submissionIds)
        docs += count ?? 0
      }
    }
    summary.uploadedDocuments = docs
  }

  // 5. Enrolled form answers for exchanges archived > 12mo (field_answers only).
  {
    const { data } = await admin.from('exchanges')
      .select('id').not('archived_at', 'is', null).lt('archived_at', cutoff(now, 'enrolledFormAnswers'))
    const exchangeIds = (data ?? []).map((r: any) => r.id)
    let answers = 0
    for (const id of exchangeIds) {
      const submissionIds = await submissionIdsForExchange(admin, id)
      if (submissionIds.length === 0) continue
      if (mode === 'enforce') {
        const { count } = await admin.from('field_answers').delete({ count: 'exact' }).in('submission_id', submissionIds)
        answers += count ?? 0
      } else {
        const { count } = await admin.from('field_answers').select('id', { count: 'exact', head: true }).in('submission_id', submissionIds)
        answers += count ?? 0
      }
    }
    summary.enrolledFormAnswers = answers
  }

  // 6. Simple age-based, service-role-only row purges.
  summary.emailSendLog = await purgeByAge(admin, mode, 'email_send_log', 'created_at', cutoff(now, 'emailSendLog'))
  summary.auditLog = await purgeByAge(admin, mode, 'audit_log', 'created_at', cutoff(now, 'auditLog'))
  summary.rateLimits = await purgeByAge(admin, mode, 'rate_limits', 'window_start', cutoff(now, 'rateLimits'))

  // 7. Resolved error reports aged by last_seen_at.
  {
    const before = cutoff(now, 'errorReportsResolved')
    if (mode === 'enforce') {
      const { count } = await admin.from('error_reports').delete({ count: 'exact' })
        .eq('status', 'resolved').lt('last_seen_at', before)
      summary.errorReportsResolved = count ?? 0
    } else {
      const { count } = await admin.from('error_reports').select('id', { count: 'exact', head: true })
        .eq('status', 'resolved').lt('last_seen_at', before)
      summary.errorReportsResolved = count ?? 0
    }
  }

  // 8. Expired, unaccepted organizer invites.
  {
    const nowIso = now.toISOString()
    if (mode === 'enforce') {
      const { count } = await admin.from('organizer_invites').delete({ count: 'exact' })
        .is('accepted_at', null).lt('expires_at', nowIso)
      summary.expiredOrganizerInvites = count ?? 0
    } else {
      const { count } = await admin.from('organizer_invites').select('id', { count: 'exact', head: true })
        .is('accepted_at', null).lt('expires_at', nowIso)
      summary.expiredOrganizerInvites = count ?? 0
    }
  }

  return summary
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test -- sweep`

- [ ] **Step 5: Add to allowlist**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, add:

```ts
  'lib/retention/erase.ts',
  'lib/retention/sweep.ts',
```

- [ ] **Step 6: Run — expect PASS**

Run: `pnpm test -- admin-allowlist`

- [ ] **Step 7: Commit**

```bash
git add lib/retention/sweep.ts lib/retention/__tests__/sweep.test.ts lib/supabase/__tests__/admin-allowlist.test.ts
git commit -m "feat(retention): sweep orchestration (log-only / enforce) + allowlist"
```

---

### Task 6: Cron route handler

**Files:**
- Create: `app/api/cron/retention-sweep/route.ts`
- Test: `app/api/cron/retention-sweep/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `runRetentionSweep` (Task 5), `logAudit` (Task 2).
- Produces: `POST /api/cron/retention-sweep` — 401 unless `x-cron-secret` matches `process.env.CRON_SECRET`; else runs the sweep in the mode dictated by `process.env.RETENTION_ENFORCE` (`'1'` → enforce, else log-only), writes a `retention.sweep` audit row, returns `{ mode, summary }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/cron/retention-sweep/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runRetentionSweep = vi.fn(async () => ({ rateLimits: 2 }))
const logAudit = vi.fn(async () => {})
vi.mock('@/lib/retention/sweep', () => ({ runRetentionSweep }))
vi.mock('@/lib/audit', () => ({ logAudit }))

beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = 's3cret'; delete process.env.RETENTION_ENFORCE })

function req(secret?: string) {
  return new Request('http://x/api/cron/retention-sweep', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  })
}

describe('POST /api/cron/retention-sweep', () => {
  it('401s without the secret', async () => {
    const { POST } = await import('../route')
    const res = await POST(req() as any)
    expect(res.status).toBe(401)
    expect(runRetentionSweep).not.toHaveBeenCalled()
  })

  it('runs log-only by default and audits', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('s3cret') as any)
    expect(res.status).toBe(200)
    expect(runRetentionSweep).toHaveBeenCalledWith(expect.any(Date), 'log-only')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'retention.sweep' }))
  })

  it('runs enforce when RETENTION_ENFORCE=1', async () => {
    process.env.RETENTION_ENFORCE = '1'
    const { POST } = await import('../route')
    await POST(req('s3cret') as any)
    expect(runRetentionSweep).toHaveBeenCalledWith(expect.any(Date), 'enforce')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test -- retention-sweep/__tests__`

- [ ] **Step 3: Write `app/api/cron/retention-sweep/route.ts`**

```ts
// app/api/cron/retention-sweep/route.ts
// Daily retention sweep, triggered by pg_cron net.http_post (03:00 UTC — see
// docs/security/retention-sweep-runbook.md). Gated on a shared secret exactly
// like send-reminders: the route is public, so the secret is the only auth.
// Fails closed if CRON_SECRET is unset. Deletes nothing unless RETENTION_ENFORCE=1.

import { NextResponse } from 'next/server'
import { runRetentionSweep } from '@/lib/retention/sweep'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const mode = process.env.RETENTION_ENFORCE === '1' ? 'enforce' : 'log-only'
  const summary = await runRetentionSweep(new Date(), mode)

  // PII-free: ids/counts only.
  await logAudit({
    action: 'retention.sweep',
    actorUserId: null,
    actorSchoolId: null,
    targetType: 'system',
    targetId: null,
    metadata: { mode, ...summary },
  })

  return NextResponse.json({ mode, summary })
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test -- retention-sweep/__tests__`

- [ ] **Step 5: Write the runbook (no secrets in git)**

Create `docs/security/retention-sweep-runbook.md`:

```markdown
# Retention sweep runbook

The daily sweep is `POST /api/cron/retention-sweep` (Next route,
`lib/retention/sweep.ts`). It runs **log-only** until `RETENTION_ENFORCE=1`.

## Environment (Vercel Production)

- `CRON_SECRET` — shared secret the pg_cron job presents in `x-cron-secret`.
  Independent from send-reminders' Supabase function secret.
- `RETENTION_ENFORCE` — unset/`0` = log-only (default). `1` = actually delete.

## Schedule it (Supabase SQL editor, prod — run once)

Replace `<CRON_SECRET>` with the Vercel value; do NOT commit it.

    select cron.schedule('retention-sweep-daily', '0 3 * * *', $$
      select net.http_post(
        url := 'https://eazyexchange.com/api/cron/retention-sweep',
        headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
        body := '{}'::jsonb
      );
    $$);

03:00 UTC is clear of send-reminders (08:00) and keep-warm (*/5). `net.http_post`
fires async — pg_net does not block on the response, and the route may run up to
`maxDuration` (300s) on Vercel.

## Rollout

1. Deploy with `RETENTION_ENFORCE` off. Schedule the cron.
2. Each morning read the latest `audit_log` row where `action='retention.sweep'`
   — `metadata` holds `{ mode: 'log-only', <category>: <count>, ... }`.
3. When the would-delete counts look right across a full cycle, set
   `RETENTION_ENFORCE=1` in Vercel Production and redeploy. Re-check counts.
```

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/retention-sweep docs/security/retention-sweep-runbook.md
git commit -m "feat(retention): daily sweep cron route + runbook (log-only default)"
```

---

**Phase 2 gate:** `pnpm lint && pnpm test && pnpm build`. All green → `/clear` boundary.

---

# PHASE 3 — Organizer erasure (Settings)

### Task 7: `actions/retention.ts` — list + erase

**Files:**
- Create: `actions/retention.ts`
- Test: `actions/__tests__/retention-erase.test.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `requireOrganizer` (`@/lib/auth/require`), `eraseApplication`/`eraseStudent` (Task 3), `logAudit` (Task 2).
- Produces:
  - `type SubjectRef = { kind: 'student'; id: string } | { kind: 'application'; id: string }`
  - `type ErasableSubject = { kind: 'student' | 'application'; id: string; name: string; email: string; status: string | null }`
  - `getErasableSubjects(): Promise<ErasableSubject[]>` — RLS-scoped to caller's school.
  - `eraseSubject(ref: SubjectRef): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// actions/__tests__/retention-erase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const eraseStudent = vi.fn(async () => ({ userId: 'stu-1', documentsDeleted: 2, photosDeleted: 1, applicationsDeleted: 1 }))
const eraseApplication = vi.fn(async () => ({ applicationId: 'app-1', photosDeleted: 0 }))
const logAudit = vi.fn(async () => {})
vi.mock('@/lib/retention/erase', () => ({ eraseStudent, eraseApplication }))
vi.mock('@/lib/audit', () => ({ logAudit }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const requireOrganizer = vi.fn(async () => ({ user: { id: 'org-1' }, profile: { id: 'org-1', school_id: 'sch-1' } }))
vi.mock('@/lib/auth/require', () => ({ requireOrganizer }))

// createClient stub returning configurable maybeSingle data.
let found: any
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: found }) }), maybeSingle: async () => ({ data: found }) }) }) }),
  }),
}))

beforeEach(() => { vi.clearAllMocks(); found = { id: 'ok' } })

describe('eraseSubject', () => {
  it('erases an in-school student and audits', async () => {
    const { eraseSubject } = await import('@/actions/retention')
    const res = await eraseSubject({ kind: 'student', id: 'stu-1' })
    expect(res).toEqual({ ok: true })
    expect(eraseStudent).toHaveBeenCalledWith('stu-1')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'subject.erased', targetType: 'user', targetId: 'stu-1' }))
  })

  it('refuses a subject not visible to the caller (RLS returns null)', async () => {
    found = null
    const { eraseSubject } = await import('@/actions/retention')
    const res = await eraseSubject({ kind: 'application', id: 'other-school-app' })
    expect(res).toEqual({ ok: false, error: 'not_found' })
    expect(eraseApplication).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm test -- retention-erase`

- [ ] **Step 3: Write `actions/retention.ts`** (erase half; export added in Phase 4)

```ts
// actions/retention.ts
// Organizer-facing data-retention actions (GDPR Art. 15/17). Erasure verifies
// school scope on the RLS session, THEN calls the service-role erase primitive
// and audits. Note: actions/retention.ts does NOT import the admin client — it
// delegates privileged deletes to lib/retention/erase.ts (allowlisted).
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { eraseApplication, eraseStudent } from '@/lib/retention/erase'
import { logAudit } from '@/lib/audit'

export type SubjectRef =
  | { kind: 'student'; id: string }
  | { kind: 'application'; id: string }

export type ErasableSubject = {
  kind: 'student' | 'application'
  id: string
  name: string
  email: string
  status: string | null
}

export async function getErasableSubjects(): Promise<ErasableSubject[]> {
  await requireOrganizer()
  const supabase = await createClient()

  // RLS scopes both reads to the caller's school.
  const [{ data: students }, { data: apps }] = await Promise.all([
    supabase.from('users').select('id, full_name, email').eq('role', 'student').order('full_name'),
    supabase.from('applications').select('id, email, status, data').order('created_at', { ascending: false }),
  ])

  const out: ErasableSubject[] = []
  for (const s of students ?? []) {
    out.push({ kind: 'student', id: s.id, name: s.full_name ?? '', email: s.email ?? '', status: null })
  }
  for (const a of apps ?? []) {
    const d = (a.data ?? {}) as Record<string, string>
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ')
    out.push({ kind: 'application', id: a.id, name, email: a.email ?? '', status: a.status })
  }
  return out
}

export async function eraseSubject(ref: SubjectRef): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireOrganizer()
  const supabase = await createClient()

  if (ref.kind === 'student') {
    // Scope check: the student must be visible to the caller under RLS
    // (same school). RLS returns null for another school's row.
    const { data } = await supabase
      .from('users').select('id').eq('id', ref.id).eq('role', 'student').maybeSingle()
    if (!data) return { ok: false, error: 'not_found' }

    const summary = await eraseStudent(ref.id)
    await logAudit({
      action: 'subject.erased', actorUserId: profile.id, actorSchoolId: profile.school_id,
      targetType: 'user', targetId: ref.id, metadata: { ...summary },
    })
  } else {
    const { data } = await supabase
      .from('applications').select('id').eq('id', ref.id).maybeSingle()
    if (!data) return { ok: false, error: 'not_found' }

    const summary = await eraseApplication(ref.id)
    await logAudit({
      action: 'subject.erased', actorUserId: profile.id, actorSchoolId: profile.school_id,
      targetType: 'application', targetId: ref.id, metadata: { ...summary },
    })
  }

  revalidatePath('/settings')
  return { ok: true }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test -- retention-erase`

- [ ] **Step 5: Commit**

```bash
git add actions/retention.ts actions/__tests__/retention-erase.test.ts
git commit -m "feat(retention): organizer eraseSubject + getErasableSubjects (scope-checked)"
```

---

### Task 8: RLS matrix — retention access

**Files:**
- Create: `tests/rls/retention-access.test.ts`

**Interfaces:**
- Consumes: `tests/rls/db.ts` (`connect`, `runAs`, `writeOutcome`, `expectBlocked`), `tests/rls/seed.ts` (`seedFixtures`, `cleanupFixtures`, `Fixtures`).

This proves the *scope boundary* the action relies on: under RLS, school B's organizer cannot see or mutate school A's student/application rows (the action's `maybeSingle` returns null → `eraseSubject` refuses). The privileged delete itself is service-role and covered by `erase.test.ts`.

- [ ] **Step 1: Write the test**

```ts
// tests/rls/retention-access.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => { fx = await seedFixtures(sql) })
afterAll(async () => { if (fx) await cleanupFixtures(sql, fx); await sql.end() })

async function canRead(userId: string, table: string, id: string): Promise<boolean> {
  const rows = await runAs(sql, userId, (tx) =>
    tx.unsafe(`select 1 from ${table} where id = $1`, [id]))
  return rows.length === 1
}

describe('retention access — subject visibility for erasure', () => {
  it('school A organizer sees own student + application; school B organizer does not', async () => {
    expect(await canRead(fx.orgA, 'users', fx.studentA)).toBe(true)
    expect(await canRead(fx.orgA, 'applications', fx.applicationA)).toBe(true)
    expect(await canRead(fx.orgB, 'users', fx.studentA)).toBe(false)
    expect(await canRead(fx.orgB, 'applications', fx.applicationA)).toBe(false)
  })

  it('a student cannot read another student or any application', async () => {
    expect(await canRead(fx.studentB, 'users', fx.studentA)).toBe(false)
    expect(await canRead(fx.studentB, 'applications', fx.applicationA)).toBe(false)
  })

  it('no client persona can hard-delete a users row (deletes are service-role only)', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from users where id = ${fx.studentA}`))
    }
  })
})
```

- [ ] **Step 2: Run — expect PASS**

Run: `pnpm exec supabase db reset && pnpm test:rls -- retention-access`
Expected: PASS. (If the `users` delete surfaces as `0 rows` rather than `denied`, `expectBlocked` accepts both.)

- [ ] **Step 3: Commit**

```bash
git add tests/rls/retention-access.test.ts
git commit -m "test(retention): RLS matrix — cross-school subject visibility + delete deny"
```

---

### Task 9: `DataPrivacyCard` + Settings wiring

**Files:**
- Create: `components/settings/DataPrivacyCard.tsx`
- Test: `components/settings/__tests__/DataPrivacyCard.test.tsx`
- Modify: `components/settings/SettingsView.tsx:24`, `:29-34`, `:57-78`
- Modify: `app/(organizer)/settings/page.tsx:31-51`
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`

**Interfaces:**
- Consumes: `getErasableSubjects`, `eraseSubject`, `ErasableSubject` (Task 7).
- Produces: a `'donnees'` section in Settings rendering `DataPrivacyCard`.

- [ ] **Step 1: Add i18n keys** (all five files). English (`messages/en.json`) — add under `organizer.settings.nav`:

```json
"donnees": "Données & confidentialité"
```

and a new `organizer.dataPrivacy` block:

```json
"dataPrivacy": {
  "heading": "Données & confidentialité",
  "subtitle": "Supprimez ou exportez les données d'une personne sur demande (RGPD).",
  "students": "Élèves",
  "applicants": "Candidats",
  "empty": "Aucune personne pour le moment.",
  "delete": "Supprimer",
  "deleting": "Suppression…",
  "confirmTitle": "Supprimer définitivement ces données ?",
  "confirmBody": "Cette action est irréversible. Tous les formulaires, documents et informations de {name} seront définitivement effacés.",
  "confirmCancel": "Annuler",
  "confirmConfirm": "Supprimer définitivement",
  "deleteError": "La suppression a échoué. Réessayez.",
  "deleted": "Données supprimées."
}
```

> Use French copy in every locale file for now (the app ships FR-first; the other four locale files mirror the FR strings until translated — matches the existing `organizer.settings.*` state). Verify the surrounding JSON still parses.

- [ ] **Step 2: Write the failing component test**

```tsx
// components/settings/__tests__/DataPrivacyCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { DataPrivacyCard } from '../DataPrivacyCard'

const eraseSubject = vi.fn(async () => ({ ok: true }))
vi.mock('@/actions/retention', () => ({ eraseSubject: (...a: any[]) => eraseSubject(...a) }))

const messages = { organizer: { dataPrivacy: {
  heading: 'Données', subtitle: 's', students: 'Élèves', applicants: 'Candidats',
  empty: 'Aucune', delete: 'Supprimer', deleting: '…',
  confirmTitle: 'Supprimer ?', confirmBody: 'Irréversible {name}',
  confirmCancel: 'Annuler', confirmConfirm: 'Supprimer définitivement',
  deleteError: 'échec', deleted: 'ok',
} } }

function renderCard(subjects: any[]) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <DataPrivacyCard subjects={subjects} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('DataPrivacyCard', () => {
  it('lists subjects and erases after confirmation', async () => {
    renderCard([{ kind: 'student', id: 'stu-1', name: 'Alice', email: 'a@x', status: null }])
    expect(screen.getByText('Alice')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    // Confirmation required before the action fires.
    expect(eraseSubject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(eraseSubject).toHaveBeenCalledWith({ kind: 'student', id: 'stu-1' }))
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm test -- DataPrivacyCard`

- [ ] **Step 4: Write `components/settings/DataPrivacyCard.tsx`**

Follow the existing card idiom (see `components/settings/ProgramCard.tsx` / `TeamCard.tsx` for class conventions and the `@radix-ui/react-dialog` usage already in the tree). Complete component:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { eraseSubject } from '@/actions/retention'
import type { ErasableSubject } from '@/actions/retention'

export function DataPrivacyCard({ subjects }: { subjects: ErasableSubject[] }) {
  const t = useTranslations('organizer.dataPrivacy')
  const [pending, setPending] = useState<ErasableSubject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const students = subjects.filter(s => s.kind === 'student')
  const applicants = subjects.filter(s => s.kind === 'application')

  function confirmErase() {
    if (!pending) return
    const ref = { kind: pending.kind, id: pending.id } as const
    setError(null)
    startTransition(async () => {
      const res = await eraseSubject(ref)
      if (res.ok) setPending(null)
      else setError(t('deleteError'))
    })
  }

  const row = (s: ErasableSubject) => (
    <li key={`${s.kind}:${s.id}`} className="flex items-center justify-between gap-3 py-2.5 border-t first:border-t-0">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium text-foreground">{s.name || s.email}</div>
        <div className="truncate text-[12px] text-muted-foreground">{s.email}{s.status ? ` · ${s.status}` : ''}</div>
      </div>
      <button
        type="button" onClick={() => { setError(null); setPending(s) }}
        className="flex-none rounded-[9px] border px-3 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
      >
        {t('delete')}
      </button>
    </li>
  )

  return (
    <div className="rounded-[14px] border bg-card p-5 shadow-float">
      <h2 className="mb-1 font-display text-[16px] font-semibold">{t('heading')}</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">{t('subtitle')}</p>

      <div className="mb-3">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t('students')}</div>
        {students.length === 0
          ? <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
          : <ul>{students.map(row)}</ul>}
      </div>
      <div>
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t('applicants')}</div>
        {applicants.length === 0
          ? <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
          : <ul>{applicants.map(row)}</ul>}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-[14px] border bg-card p-5 shadow-float">
            <h3 className="mb-1 font-display text-[15px] font-semibold">{t('confirmTitle')}</h3>
            <p className="mb-4 text-[13px] text-muted-foreground">{t('confirmBody', { name: pending.name || pending.email })}</p>
            {error && <p className="mb-3 text-[12.5px] text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} disabled={isPending}
                className="rounded-[9px] border px-3 py-1.5 text-[13px] font-medium">
                {t('confirmCancel')}
              </button>
              <button type="button" onClick={confirmErase} disabled={isPending}
                className="rounded-[9px] bg-red-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
                {isPending ? t('deleting') : t('confirmConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm test -- DataPrivacyCard`

- [ ] **Step 6: Wire into Settings**

In `components/settings/SettingsView.tsx`:
- Extend `SectionKey`: `type SectionKey = 'compte' | 'equipe' | 'fact' | 'prog' | 'donnees'`.
- Add a `subjects` prop: extend `SettingsProps` with `subjects: ErasableSubject[]` (import the type from `@/actions/retention`) and import `DataPrivacyCard`.
- Add the nav entry (after the `prog` conditional entry):

```tsx
    { key: 'donnees', label: t('settings.nav.donnees') },
```

- Add the section body (after the `prog` block):

```tsx
          {section === 'donnees' && <DataPrivacyCard subjects={props.subjects} />}
```

In `app/(organizer)/settings/page.tsx`:
- Import `getErasableSubjects` from `@/actions/retention`.
- Before the `return`, add: `const subjects = await getErasableSubjects()`.
- Pass `subjects={subjects}` to `<SettingsView … />`.

- [ ] **Step 7: Update the SettingsView test**

`components/settings/__tests__/SettingsView.test.tsx` renders `SettingsView`; add a `subjects={[]}` prop wherever it constructs props so it keeps compiling. Run `pnpm test -- SettingsView`.

- [ ] **Step 8: Full-typecheck + gate**

Run: `npx tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add components/settings app/(organizer)/settings/page.tsx messages
git commit -m "feat(retention): Settings → Données & confidentialité (erase UI)"
```

---

**Phase 3 gate:** full gate + `pnpm test:rls`. Green → `/clear` boundary (or continue straight to Phase 4 — it is an independent leaf).

---

# PHASE 4 — Organizer export (Settings)

### Task 10: Add `jszip` + `exportSubject` action

**Files:**
- Modify: `package.json` (add `jszip`)
- Modify: `actions/retention.ts`
- Test: `actions/__tests__/retention-export.test.ts`

**Interfaces:**
- Consumes: `createClient` (organizer RLS session), `requireOrganizer`, `signApplicationPhotoUrls` (`@/lib/application-photos`, existing allowlisted signer — for the photo only), `JSZip`.
- Produces: `exportSubject(ref: SubjectRef): Promise<{ ok: true; filename: string; base64: string } | { ok: false; error: string }>` — a base64 `.zip` (`data.json` + files). Base64 so a Server Action can hand bytes to the client for download.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add jszip`
(Then confirm `pnpm audit --prod --audit-level high` is clean — jszip has no known high/critical advisories.)

- [ ] **Step 2: Write the failing test**

```ts
// actions/__tests__/retention-export.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'

vi.mock('@/lib/auth/require', () => ({ requireOrganizer: vi.fn(async () => ({ user: { id: 'org-1' }, profile: { id: 'org-1', school_id: 'sch-1' } })) }))
vi.mock('@/lib/application-photos', () => ({ signApplicationPhotoUrls: vi.fn(async () => new Map()) }))

// RLS client stub: an application row with two field answers, no photo.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const data = table === 'applications'
        ? { id: 'app-1', email: 'a@x', status: 'submitted', data: { first_name: 'Alice' }, photo_path: null, exchange_id: 'ex-1' }
        : null
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }), order: async () => ({ data: [] }) }) }) }
    },
  }),
}))

beforeEach(() => vi.clearAllMocks())

describe('exportSubject', () => {
  it('produces a zip containing data.json for an application', async () => {
    const { exportSubject } = await import('@/actions/retention')
    const res = await exportSubject({ kind: 'application', id: 'app-1' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const zip = await JSZip.loadAsync(Buffer.from(res.base64, 'base64'))
    const json = JSON.parse(await zip.file('data.json')!.async('string'))
    expect(json.email).toBe('a@x')
    expect(res.filename).toContain('.zip')
  })

  it('refuses a subject not visible under RLS', async () => {
    const { exportSubject } = await import('@/actions/retention')
    const res = await exportSubject({ kind: 'student', id: 'nope' })
    expect(res).toEqual({ ok: false, error: 'not_found' })
  })
})
```

> The stub returns `null` for the `users` table, so the student case naturally hits `not_found`.

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm test -- retention-export`

- [ ] **Step 4: Append `exportSubject` to `actions/retention.ts`**

Add imports at the top of `actions/retention.ts`:

```ts
import JSZip from 'jszip'
import { signApplicationPhotoUrls } from '@/lib/application-photos'
```

Append:

```ts
export type ExportResult =
  | { ok: true; filename: string; base64: string }
  | { ok: false; error: string }

// Build a portability package on the ORGANIZER'S RLS session (Art. 15/20). The
// only service-role touch is the application-photos signer (that bucket has no
// organizer storage policy); everything else — DB rows and documents-bucket
// files — is read as the organizer.
export async function exportSubject(ref: SubjectRef): Promise<ExportResult> {
  await requireOrganizer()
  const supabase = await createClient()
  const zip = new JSZip()

  if (ref.kind === 'application') {
    const { data: app } = await supabase
      .from('applications')
      .select('id, email, status, data, photo_path, exchange_id, created_at, submitted_at')
      .eq('id', ref.id).maybeSingle()
    if (!app) return { ok: false, error: 'not_found' }

    zip.file('data.json', JSON.stringify(app, null, 2))

    if (app.photo_path) {
      const signed = await signApplicationPhotoUrls([app.photo_path])
      const url = signed.get(app.photo_path)
      if (url) {
        const bytes = await (await fetch(url)).arrayBuffer()
        zip.file(`photo-${app.photo_path.split('/').pop()}`, bytes)
      }
    }
    return finishZip(zip, `export-application-${ref.id}`)
  }

  // Student: profile + every submission's field answers + document files.
  const { data: student } = await supabase
    .from('users').select('id, full_name, email').eq('id', ref.id).eq('role', 'student').maybeSingle()
  if (!student) return { ok: false, error: 'not_found' }

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, template_id, submissions(id, status, field_answers(field_id, value), document_uploads(storage_path, file_name))')
    .eq('student_id', ref.id)

  zip.file('data.json', JSON.stringify({ student, assignments: assignments ?? [] }, null, 2))

  // Document bytes via the organizer's own signed URLs (documents bucket allows
  // organizer SELECT by assignment school — see 20260625000001_storage_policies).
  for (const a of assignments ?? []) {
    for (const sub of (a as any).submissions ?? []) {
      for (const doc of sub.document_uploads ?? []) {
        const { data: signed } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 300)
        if (signed?.signedUrl) {
          const bytes = await (await fetch(signed.signedUrl)).arrayBuffer()
          zip.file(`documents/${doc.storage_path.split('/').pop()}`, bytes)
        }
      }
    }
  }
  return finishZip(zip, `export-student-${ref.id}`)
}

async function finishZip(zip: JSZip, base: string): Promise<ExportResult> {
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return { ok: true, filename: `${base}.zip`, base64: buf.toString('base64') }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm test -- retention-export`

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml actions/retention.ts actions/__tests__/retention-export.test.ts
git commit -m "feat(retention): organizer exportSubject (zip; RLS session + photo signer)"
```

---

### Task 11: Export button in `DataPrivacyCard`

**Files:**
- Modify: `components/settings/DataPrivacyCard.tsx`
- Modify: `components/settings/__tests__/DataPrivacyCard.test.tsx`
- Modify: `messages/{en,fr,es,it,de}.json`

**Interfaces:**
- Consumes: `exportSubject` (Task 10).

- [ ] **Step 1: Add i18n keys** — under `organizer.dataPrivacy` in all five files:

```json
"export": "Exporter",
"exporting": "Export…",
"exportError": "L'export a échoué. Réessayez."
```

- [ ] **Step 2: Extend the component test**

Add to `DataPrivacyCard.test.tsx`:

```tsx
it('exports a subject and triggers a download', async () => {
  const exportSubject = vi.fn(async () => ({ ok: true, filename: 'export-student-stu-1.zip', base64: 'AAAA' }))
  vi.doMock('@/actions/retention', () => ({ eraseSubject: vi.fn(), exportSubject }))
  const clickSpy = vi.fn()
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
    const el = origCreate(tag)
    if (tag === 'a') el.click = clickSpy
    return el
  })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
  const { DataPrivacyCard: Card } = await import('../DataPrivacyCard')
  render(
    <NextIntlClientProvider locale="fr" messages={{ organizer: { dataPrivacy: { ...messages.organizer.dataPrivacy, export: 'Exporter', exporting: '…', exportError: 'échec' } } }}>
      <Card subjects={[{ kind: 'student', id: 'stu-1', name: 'Alice', email: 'a@x', status: null }]} />
    </NextIntlClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Exporter' }))
  await waitFor(() => expect(clickSpy).toHaveBeenCalled())
  vi.restoreAllMocks()
})
```

> The exact spying approach may need adjusting to the harness; the load-bearing assertion is that clicking **Exporter** calls `exportSubject` and, on `ok`, builds and clicks a download anchor.

- [ ] **Step 3: Add the export handler + button**

In `DataPrivacyCard.tsx`, import `exportSubject`, add state `const [exportingId, setExportingId] = useState<string | null>(null)`, and a handler:

```tsx
  async function onExport(s: ErasableSubject) {
    setError(null); setExportingId(s.id)
    try {
      const res = await exportSubject({ kind: s.kind, id: s.id })
      if (!res.ok) { setError(t('exportError')); return }
      const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url; a.download = res.filename; a.click()
      URL.revokeObjectURL(url)
    } finally { setExportingId(null) }
  }
```

Add an **Exporter** button next to **Supprimer** in the `row` renderer:

```tsx
      <button type="button" onClick={() => onExport(s)} disabled={exportingId === s.id}
        className="flex-none rounded-[9px] border px-3 py-1.5 text-[12.5px] font-medium hover:bg-muted disabled:opacity-60">
        {exportingId === s.id ? t('exporting') : t('export')}
      </button>
```

(Update the `import type { ErasableSubject }` line to also import `exportSubject` from `@/actions/retention`.)

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm test -- DataPrivacyCard`

- [ ] **Step 5: Full gate**

Run: `npx tsc --noEmit && pnpm lint && pnpm test && pnpm build`

- [ ] **Step 6: Commit**

```bash
git add components/settings messages
git commit -m "feat(retention): export button + zip download in Données & confidentialité"
```

---

**Phase 4 gate:** full gate + `pnpm test:rls`. Green → feature branch complete.

---

## Rollout (all manual — the branch never touches prod)

1. **Migration:** apply `20260718000001_retention_cascade.sql` to **staging first**
   (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`),
   then prod via MCP `apply_migration` (name `retention_cascade`). Check MCP
   `list_migrations` — if the stamped version differs, `git mv` the file. Regen
   types (MCP `generate_typescript_types` → overwrite `types/supabase.ts`) →
   `npx tsc --noEmit`.
2. **Env (Vercel Production):** add `CRON_SECRET` (new random secret) and leave
   `RETENTION_ENFORCE` **unset** (log-only). Deploy.
3. **Schedule pg_cron** at 03:00 UTC per `docs/security/retention-sweep-runbook.md`
   (prod SQL editor; the secret is pasted, never committed).
4. **Watch** `audit_log` `action='retention.sweep'` would-delete counts across a
   real cycle. When they look right, set `RETENTION_ENFORCE=1` in Vercel and
   redeploy. Re-check counts.

## Merge-time steps (for the human, per CLAUDE.md)

- Merge each phase PR **with a merge commit**.
- The migration touches `supabase/migrations/`, RLS, and storage → the PR must be
  green on `pnpm test:rls`.
- `jszip` is a new prod dependency → the weekly `dependency-audit` workflow now
  covers it; no extra action beyond a clean `pnpm audit --prod` at merge.

---

## Deferred to a follow-up plan (explicit non-scope of v1)

These two categories are intentionally **not** implemented here — they are the
highest-irreversibility deletions, best turned on only after the log-only sweep's
counts are trusted:

1. **Automatic student-account deletion** (`users` + `auth.users`) once a
   student's last exchange is archived and no non-purged data remains. Needs a
   "no non-purged data remains" predicate over the other categories; wire it as a
   sweep category that calls `eraseStudent` (the primitive already exists and is
   tested). Retention row: policy §Retention constants, "Student account".
2. **Organizer-account deletion** (6 months after account closure + grace). Needs
   an account-closure flow (not yet in the product) and the reviewer/creator FKs
   (`applications.reviewer_id`, `submissions.reviewer_id`,
   `form_templates.created_by`, `organizer_invites.invited_by`, currently
   `NO ACTION`) reworked to `SET NULL` in a follow-up migration.

Everything else from the spec's retention table (abandoned drafts, rejected
applicants, enrolled application rows, uploaded documents rows+storage, enrolled
form answers, email_send_log, audit_log, error_reports, rate_limits, expired
organizer invites) ships in v1 under log-only-first.

## Spec-coverage self-check

- Automated sweep (Goal 1): Tasks 4–6 (rules, sweep, route) + rollout. Documents
  rows+storage covered (`purgeExchangeDocuments`). ✅
- On-request erasure (Goal 2): Tasks 3, 7, 9. ✅
- On-request export (Goal 3): Tasks 10–11. ✅
- Never orphan storage / never leak PII (Goal 4): `erase.ts` storage-first
  invariant (Task 3 test) + PII-free audit/log payloads throughout. ✅
- Shared primitive: `lib/retention/erase.ts`, used by both the sweep route and the
  erase action (Bjorn's Next-route decision makes this literal, not just design). ✅
- Cascade audit + `users→auth.users` confirmation: Task 1. ✅
- Allowlist: `erase.ts` (Task 3) + `sweep.ts` (Task 5) — deviation #2, deliberate. ✅
- test:rls matrix for new delete paths: Tasks 1 + 8. ✅
- Retention constants live only in `rules.ts`: Task 4. ✅
