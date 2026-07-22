# Data Retention Lifecycle — Design Spec

**Date:** 2026-07-18
**Status:** Approved design, ready for implementation plan
**Related:** `docs/security/data-retention-policy.md` (the policy this enforces)

## Problem

EazyExchange holds personal data about minors (student names/emails, application
answers, uploaded documents that can include ID/medical/travel papers) and their
parents. GDPR imposes two hard obligations the app cannot currently meet:

- **Storage limitation (Art. 5(1)(e))** — data kept only as long as needed. Today
  nothing is ever deleted; there is no retention enforcement at all.
- **Right to erasure / access (Art. 17, 15)** — no way to delete or export one
  subject's data on request. No subject-erasure action exists in the codebase
  (`removeOrganizer` and `deleteTemplate` are the only delete actions today).

This project builds the enforcement layer for `data-retention-policy.md`: an
automated retention sweep, organizer-triggered erasure, and organizer-triggered
data export.

## Goals

1. Automatically purge data past its retention window (DB rows **and** storage
   objects), per the policy schedule.
2. Let an organizer completely erase one student/applicant on request.
3. Let an organizer export one subject's data as a portability package.
4. Never orphan storage objects; never leak PII into logs.

## Non-goals

- Student self-service export/erasure (organizer is the controller; deferred).
- A processor-side admin console (organizer self-serve covers the model).
- Changing the leaked-password gap (tracked separately in the policy §9).
- Any prod deletion running unsupervised on first ship (see log-only rollout).

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Scope | All three: automated sweep + on-request erasure + export |
| Retention durations | Policy defaults (see §Retention constants) |
| Sweep rollout | Log-only first, flip to enforce via a config flag |
| Erasure trigger | Organizer self-serve, in Settings |
| Export trigger | Organizer-triggered package, in Settings |
| UI home | Organizer Settings → "Données & confidentialité" section |
| Sweep mechanism | Supabase Edge Function + `pg_cron` (mirrors `send-reminders`) |

## Architecture

Everything is built around **one shared primitive: "completely erase one
subject."** The sweep applies it to rows matching retention rules; organizer
erasure applies it to one chosen subject. Export is its read-side twin.

### The storage-deletion constraint (the reason for the mechanism)

Deleting a `storage.objects` row via SQL does **not** remove the file bytes in
S3 — only the Storage API (service-role client) does. A pure-`pg_cron`/SQL sweep
would silently orphan every document and photo. Therefore erasure logic lives in
TypeScript with the service-role client, and the sweep runs as an edge function
(not pure SQL).

### Trust-model split

- **Erasure + sweep** use the service-role admin client (they delete across
  schools / bypass RLS to reach storage + `auth.users`). `lib/retention/erase.ts`
  is added to the admin allowlist — the **only** new allowlist entry.
- **Export** runs on the organizer's own RLS session: organizers already have
  read access to their school's rows and, per `20260625000001_storage_policies`,
  their school's files. Export therefore does **not** touch the service role.

## Components

### 1. `lib/retention/erase.ts` (service-role, on admin allowlist)

The shared primitive. Subject-scoped functions:

- `eraseApplication(applicationId)` — deletes the `applications` row + its
  `application-photos` object (from `applications.photo_path`).
- `eraseStudent(userId)` — deletes, for one student:
  - storage objects: all `documents`-bucket files under their assignments +
    their `application-photos` object (if a linked application exists);
  - DB rows: `users` (+ `auth.users` via `auth.admin.deleteUser`),
    `exchange_enrollments`, `assignments → submissions → field_answers →
    document_uploads`, and the linked `applications` row.

**Invariant — order is load-bearing:** gather storage paths → delete storage
objects via the Storage API → delete DB rows. Storage first, because once the
rows are gone the paths are lost. This is the single place the orphan-file bug
can exist, and it is unit-tested here.

Each call returns a PII-free summary (counts + subject id) for the caller to log
to `audit_log`.

### 2. Schema migration — cascade cleanup

Audit the FK chains under `applications`, `submissions`, and `assignments`; add
`ON DELETE CASCADE` where missing so DB erasure is one delete per subject rather
than hand-ordered deletes. Confirm `public.users → auth.users` delete behavior so
`auth.admin.deleteUser` and profile deletion stay consistent (avoid a dangling
profile or a blocked auth delete).

No new tables: `audit_log` already exists for logging sweep/erase counts.

### 3. `retention-sweep` edge function + `pg_cron`

- `supabase/functions/retention-sweep/rules.ts` — **pure, vitest-tested** (mirrors
  `send-reminders/pacing.ts`). Given `now` + the retention constants, returns the
  set of subjects/rows due for deletion. **Retention durations live here and
  only here.**
- `supabase/functions/retention-sweep/index.ts` — fetches candidates, then:
  - **enforce mode** → calls the `erase.ts` primitive per subject / deletes the
    due operational rows;
  - **log-only mode** → writes would-delete counts to `audit_log`, deletes
    nothing.
- Mode flag: Supabase function secret `RETENTION_ENFORCE` (default off /
  log-only). Flip with one `supabase secrets set` — no redeploy, no code change.
- `pg_cron` daily at **03:00 UTC** (clear of `send-reminders` 08:00 and the
  keep-warm `*/5` job).

### 4. Organizer Settings → "Données & confidentialité"

New section on the Settings page (alongside Programme). Lists the school's
students + applicants, each with:

- **Delete** → confirmation dialog (irreversible, stated plainly) → new server
  action `eraseSubject(ref)` in `actions/retention.ts`: `requireOrganizer`,
  verify the subject belongs to the caller's school, call `lib/retention/
  erase.ts`, write an `audit_log` entry. Target erasure within 30 days of a
  request (this makes it immediate).
- **Export** → server action assembling a `.zip`: `data.json` (application
  answers + `field_answers`) plus the subject's actual files (documents + photo).
  Reads on the organizer's RLS session; no service role.

## Retention constants (policy defaults)

Encoded in `retention-sweep/rules.ts`:

| Category | Trigger | Retention |
|---|---|---|
| Abandoned draft application (never submitted) | `applications.updated_at` | 90 days |
| Rejected / declined applicant | `reviewed_at` / `responded_at` | 6 months |
| Accepted → enrolled: raw `applications` row | enrollment | 6 months after enroll |
| Enrolled student form answers | `exchanges.archived_at` | 12 months after archive |
| **Uploaded documents** (rows + storage) | `exchanges.archived_at` | 3 months after archive |
| Student account (`users` + `auth.users`) | last exchange archived | when no non-purged data remains |
| `email_send_log` | `created_at` | 12 months |
| `audit_log` | `created_at` | 24 months |
| `error_reports` | resolved | 90 days after `status='resolved'` |
| `rate_limits` | `window_start` | 7 days |
| Expired tokens (resume/invite/organizer_invites) | expiry | delete row once expired |
| Organizer account | account closure + grace | 6 months after closure |

## Testing

- `rules.ts` — pure unit tests for due-ness math (mirrors `pacing.ts`), including
  boundary dates.
- `lib/retention/erase.ts` — removes rows **and** issues storage deletes
  (orphan-file guard), storage mocked; verifies storage-before-rows order.
- **`test:rls`** — organizer can erase/export only their own school's subjects;
  students and other schools cannot. New delete paths ship with matrix cases
  (CLAUDE.md requirement).
- `admin-allowlist.test.ts` — add `lib/retention/erase.ts`.
- Standard gate: `pnpm lint && pnpm test && pnpm build` (+ `pnpm test:rls`).

## Rollout (all manual — the branch/loop never touches prod)

1. Migration → **staging first** (`supabase db push --db-url "$STAGING_DB_URL"`),
   then prod via MCP `apply_migration`; regen types → `tsc --noEmit`.
2. Deploy `retention-sweep` via CLI (`supabase functions deploy retention-sweep`),
   `verify_jwt` consistent with `send-reminders`.
3. Schedule `pg_cron` at 03:00 UTC.
4. Ship with `RETENTION_ENFORCE` **off** → watch `audit_log` would-delete counts
   across a real cycle → flip to enforce once verified.

## Build order

1. `lib/retention/erase.ts` primitive + schema/cascade migration.
2. Sweep: `rules.ts` + edge function + `pg_cron`, log-only.
3. Settings erase action + UI.
4. Settings export action + UI.

(3 and 4 are independent leaves once the primitive exists.)

## Risks

- **Orphaned storage objects** — the top correctness risk; contained to `erase.ts`
  and its test.
- **Cascade surprises** — a missing/incorrect `ON DELETE CASCADE` either blocks a
  delete or leaves stragglers; the migration audits every chain.
- **Irreversible deletion** — mitigated by log-only-first rollout and the
  explicit confirmation dialog on manual erasure.
- **Session hygiene** — this is a multi-stage feature; expect `/clear` boundaries
  between spec → plan → execution per CLAUDE.md.
