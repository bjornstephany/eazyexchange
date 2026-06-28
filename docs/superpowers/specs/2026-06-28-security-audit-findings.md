# EazyExchange Pre-Launch Security Audit — Findings

**Date:** 2026-06-28
**Charter:** `2026-06-28-security-audit-design.md`
**Reviewer:** Claude (manual full-app review, app-layer + DB-layer)
**Method:** Static review of all RLS migrations, server actions, auth/session flow,
storage policies, the upload client, the edge function, plus live Supabase
security advisors.

> The core boundary in this app is **Postgres RLS**, because every authenticated
> browser holds the anon key and a user session — so it can call PostgREST
> (`/rest/v1/...`) and Storage directly, bypassing the Next.js server actions and
> the role-gated layouts entirely. Findings are therefore judged against what a
> user can do with the raw anon key + their JWT, not just through the UI.

---

## Summary

| # | Severity | Finding |
|---|----------|---------|
| C1 | **Critical** | Students can self-approve their own submissions (no `WITH CHECK` / status guard) |
| H1 | **High** | Child-table RLS (`form_fields`, `document_slots`, `assignments`) missing role check → students can tamper with school form config; server actions in `forms.ts` have no authz |
| H2 | **High** | `exchange_enrollments` SELECT + INSERT policies unscoped → cross-tenant read & write |
| H3 | **High** (operational) | Service-role JWT + Resend key were exposed; rotate before real data |
| M1 | Medium | No file upload validation (type / size / count) at client or bucket |
| M2 | Medium | `send-reminders` edge function has no cron-secret / JWT guard configured |
| M3 | Medium | `SECURITY DEFINER` helpers `my_role`, `my_school_id`, `update_updated_at` lack `set search_path` |
| L1 | Low | `anon`/`authenticated` hold `EXECUTE` on RLS helper & trigger functions |
| L2 | Low | `field_answers` / `document_uploads` don't verify field/slot belongs to the submission's template |
| L3 | Low | Leaked-password protection disabled |
| L4 | Low | `inviteStudent` lacks email validation; can orphan an auth user |
| L5 | Low | No server-side length/required validation on submitted answers |

---

## Critical

### C1 — Students can approve their own submissions

**Where:** `supabase/migrations/20260625000005_fix_rls_recursion.sql:86-88`
(policy `students manage own submissions`), schema `submissions`
(`20260624000001_initial_schema.sql:81-91`).

```sql
create policy "students manage own submissions" on submissions for all
  using (assignment_student(assignment_id) = auth.uid());
```

**Risk:** The policy is `FOR ALL` with only a `USING` clause and **no `WITH CHECK`**,
so a student may `UPDATE` their own submission row to arbitrary column values. The
only constraint on `status` is `check (status in ('draft','submitted','approved','rejected'))`
— it limits the *value*, not *who* may set it. From the browser console with the
anon key already present:

```js
supabase.from('submissions')
  .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewer_id: someOrganizerId })
  .eq('id', myReviewSubmissionId)
```

succeeds. The organizer dashboard reads `status`, so the student's form shows as
**approved** without any organizer ever seeing it. This defeats the entire
review/approval flow — the product's core value.

**Fix (recommendation):** Split the student submission policy so students can only
move status between `draft` and `submitted` and cannot write `reviewed_at`,
`reviewer_id`, `review_note`. A `BEFORE UPDATE` trigger is the most robust:
reject any student-initiated change that sets `status` to `approved`/`rejected` or
mutates the reviewer columns. (RLS `WITH CHECK` alone can gate the *new* status
value but not "old vs new" transitions cleanly, so the trigger is preferred.)

---

## High

### H1 — Students can tamper with their school's form config & assignments

**Where:**
- RLS: `20260625000005_fix_rls_recursion.sql:60-77` (`organizers manage fields`,
  `organizers manage slots`, `organizers manage assignments`).
- App: `actions/forms.ts` — `addField`, `removeField`, `addSlot`, `removeSlot`,
  `getTemplate` perform **no `getUser()` / role / ownership check** at all.

```sql
create policy "organizers manage fields" on form_fields for all
  using (template_school(template_id) = my_school_id());   -- no my_role() check
```

**Risk:** The "organizers manage…" policies on `form_fields`, `document_slots`, and
`assignments` check only that the row's template belongs to the caller's school —
**they never check `my_role() = 'organizer'`**. A student belongs to the same
school as the templates assigned to them, so a student can `INSERT` / `UPDATE` /
`DELETE` form fields, document slots, and assignments for *any* template in their
school (not even limited to their own assignments). Concretely a student can:
- delete every field/slot of a template → breaks the form for all same-school students;
- forge or delete `assignments` rows.

The `forms.ts` server actions compound this: they have no authorization guard, so
they rely entirely on the (permissive) RLS. Both layers fail together.

**Fix:** Add `my_role() = 'organizer' and` to each of the three "organizers
manage…" policies, **and** add `getUser()` + organizer-role + school-ownership
checks to the mutating actions in `forms.ts` (mirror the pattern already used in
`submissions.ts`'s `assertOrganizerOwnsAssignment`).

### H2 — `exchange_enrollments` policies are not tenant-scoped

**Where:** `20260624000002_rls_policies.sql:43-48`.

```sql
create policy "organizers read enrollments" on exchange_enrollments for select
  using (my_role() = 'organizer');
create policy "organizers insert enrollments" on exchange_enrollments for insert
  with check (my_role() = 'organizer');
```

**Risk:** Neither policy ties the row to the organizer's school or exchange. Any
organizer can:
- **Read every enrollment row in the database** (`user_id`, `exchange_id` across all
  schools) — cross-tenant enumeration of who is enrolled where.
- **Insert enrollments into any exchange for any user_id** — cross-tenant write.

Blast radius is currently limited by the auto-assign trigger (it only creates
assignments when the user's school matches the template's school) and by the
app-layer re-scoping in `getExchangeStudents`/`getExchangeGrid` — but RLS is the
boundary and it is broken. School-name leakage is also unrestricted
(`organizers read schools` is `my_role() = 'organizer'`), which is acceptable per
the migration's own note, but it means the enrollment IDs can be correlated.

**Fix:** Scope both policies to exchanges the organizer's school participates in,
e.g. `exists (select 1 from exchanges e where e.id = exchange_enrollments.exchange_id
and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id()))`, plus
`my_role() = 'organizer'`. Use a `SECURITY DEFINER` helper to avoid re-introducing
RLS recursion, consistent with the existing pattern.

### H3 — Exposed secrets must be rotated before launch (operational)

**Where:** Project memory `rotate_secrets_before_launch` — the service-role JWT and
Resend key `re_XJB2…` were shared in plaintext on 2026-06-27.

**Risk:** The **service-role key bypasses all RLS**. Anyone holding it has full
read/write to every school's data, including minors' PII. The Resend key allows
sending mail as the project. Both are currently valid.

**Fix:** Rotate the Supabase service-role key and the Resend API key, update the
Vercel/Supabase environment, and confirm no secret is committed to the repo or
baked into client bundles. Do this **before** any real student data is loaded.

---

## Medium

### M1 — No file-upload validation

**Where:** `components/DocumentUploadForm.tsx:29-47`; bucket created in
`20260625000001_storage_policies.sql:9-11` with no `file_size_limit` or
`allowed_mime_types`.

**Risk:** The client uploads any file with no type, size, or count restriction, and
the bucket enforces none either. A student can upload arbitrarily large or many
files (storage + bandwidth cost / abuse). Organizers later open the file via a
signed URL; a malicious HTML/SVG stored with that content-type can execute script
on the Storage origin when opened.

**Fix:** Enforce an allowlist of MIME types and a size cap both client-side (fast UX
feedback) and on the bucket (`file_size_limit`, `allowed_mime_types`) so the limit
can't be bypassed via direct upload. Consider forcing `content-disposition:
attachment` on download.

### M2 — `send-reminders` endpoint has no auth guard

**Where:** `supabase/functions/send-reminders/index.ts:101`; no `config.toml`
`verify_jwt` entry found.

**Risk:** The function authenticates nothing itself. If deployed with JWT
verification disabled (common for cron-only functions), it is publicly invokable —
an attacker can trigger reminder sends. Repeated triggers within a day are largely
idempotent (it stamps `last_reminded_at`), but the first call each day still emails
real students, and it's an email/cost abuse vector.

**Fix:** Require a shared cron secret (compare a header against an env var and
`401` otherwise), or confirm the function is deployed with `verify_jwt = true` and
invoked by the scheduler with a service token. Document the chosen approach.

### M3 — `SECURITY DEFINER` helpers without pinned `search_path`

**Where:** `20260624000002_rls_policies.sql:15-22` (`my_school_id`, `my_role`) and
`update_updated_at` (`20260624000001_initial_schema.sql:114`). Live advisor:
`function_search_path_mutable`.

**Risk:** These run as the table owner with a caller-controlled `search_path` and
reference `users` unqualified. If any role could create objects in a schema earlier
on the search path, it could shadow `users` and subvert `my_role`/`my_school_id` —
the foundation of every RLS policy. Supabase revokes `CREATE` from `public` by
default, so exploitability is low today, but the fix is trivial and the newer
helpers already do it.

**Fix:** Add `set search_path = public` (or `= ''` with fully-qualified names) to
all three functions, matching `20260625000005_fix_rls_recursion.sql`.
Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>

---

## Low

- **L1 — `EXECUTE` granted to `anon`/`authenticated` on helper & trigger functions**
  (advisor `0028`/`0029`). The trigger functions (`assign_students_to_new_template`,
  `assign_templates_to_new_enrollment`) cannot be usefully called via RPC (Postgres
  rejects direct calls to `returns trigger` functions), and the helpers only read
  based on `auth.uid()`, so impact is limited — but `REVOKE EXECUTE … FROM anon,
  authenticated` on all of them removes the exposed RPC surface.
  <https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable>

- **L2 — Foreign field/slot attachment.** `students manage own answers` /
  `…own uploads` (`20260625000005:95-104`) check only submission ownership, not that
  `field_id`/`slot_id` belongs to that submission's template. A student can attach
  an answer/upload referencing another template's field/slot to their own
  submission. Integrity only, no cross-tenant leak. Add a check that the field/slot
  shares the submission's template (or validate in the action).

- **L3 — Leaked-password protection disabled** (advisor). Enable HIBP check in
  Supabase Auth so invited users can't set a known-breached password.
  <https://supabase.com/docs/guides/auth/password-security>

- **L4 — `inviteStudent` email handling** (`actions/students.ts:33-56`). No format
  validation/normalization of `email`; if `inviteUserByEmail` succeeds but the
  profile `insert` then fails, an auth user is left without a profile row. Validate
  the email and consider cleaning up the auth user on profile-insert failure.

- **L5 — No server-side bounds on answers** (`saveFormAnswers`,
  `actions/submissions.ts:77-141`). Values aren't length-checked and required
  fields aren't enforced server-side, so oversized values can be stored. Add length
  caps and required-field validation in the action.

---

## Confirmed good (no action)

- Email HTML is escaped in both `lib/email.ts` and the edge function (`esc()`),
  closing injection via student name / form name / organizer note.
- `auth/confirm/route.ts` guards against open redirect on `next` and persists the
  session via `redirect()` (not a hand-built response).
- No student/parent PII is logged anywhere (app or edge function).
- Document downloads use short-lived (1h) signed URLs against a private bucket.
- The invite path uses `insert` (not `upsert`) with an explicit comment — prevents
  an organizer from hijacking an existing account by re-pointing its school/role.
- `recordDocumentUpload` validates the storage path stays within
  `<assignmentId>/<slotId>/` and rejects `..` traversal; the storage `WITH CHECK`
  policy independently enforces assignment ownership.
- Layouts are role-gated and middleware redirects unauthenticated users (UI-level,
  correct as defense-in-depth on top of RLS).

---

## Suggested triage order

1. **C1** and **H1** before anything else — both let a student bypass the core
   workflow with nothing but their own session.
2. **H2** (tenant isolation) and **H3** (rotate secrets) before loading real data.
3. **M1–M3** as part of the same hardening pass.
4. **L1–L5** opportunistically; **L3** is a one-click toggle.

Each fix that touches the database is a new migration (never a client-side
service-role workaround), per project convention.

---

## Remediation status (updated 2026-06-28)

| # | Status | Notes |
|---|--------|-------|
| C1 | ✅ Fixed | trigger `guard_submission_review` — migration `20260628000001`, merged to `main`, live in prod DB |
| H1 | ✅ Fixed | child-table role checks (`20260628000002`) + `forms.ts` authz guards; merged, live |
| H2 | ✅ Fixed | `exchange_in_my_school` scoping (`20260628000003`) + `user_in_my_school` user validation (`20260628000004`); merged, live |
| M3 | ✅ Fixed | `search_path` pinned on `my_role`/`my_school_id`/`update_updated_at` (`20260628000005`); advisor cleared |
| L1 | ◑ Partial | EXECUTE revoked on the 3 trigger functions (`20260628000006`); advisor cleared for those. The RLS **helper** functions must retain EXECUTE — PostgreSQL requires it to evaluate policies for `authenticated` (verified: revoking yields `permission denied for function my_role`). Their only exposure is the caller's own auth.uid()-scoped role/school (not sensitive). Fully clearing the remaining 0028/0029 advisor entries requires relocating the helpers to a non-exposed schema — a larger deferred change. |
| M1 | ✅ Fixed | `documents` bucket `allowed_mime_types` (PDF/JPEG/PNG/WebP, no SVG) + `file_size_limit` 10 MB (`20260628000007`); client validator `lib/uploads.ts`; organizer downloads forced to attachment disposition. Live in prod. |
| L3 | ⊘ Blocked (Pro-only) | Leaked-password (HIBP) protection is a Supabase Pro-tier feature; not togglable on the free plan. If staying on free, self-implement via the HIBP range API in the signup/password-set flow. |
| H3 | ☐ Pending | Rotate service-role + Resend keys before real student data — operational, at deploy time. |
| M2 | ◑ Fixed in source | `send-reminders` now requires an `x-cron-secret` header matching the `CRON_SECRET` env var (fail-closed). **Not yet enforced in prod:** the live function (v9) predates this and the cron is active without the header — enforced only after redeploy + setting `CRON_SECRET` + updating the cron header (see `cron-setup.sql`). |
| L2 | ✅ Fixed | `field_answers`/`document_uploads` student policies now `WITH CHECK` that the field/slot shares the submission's template (`20260628000008`, helpers `field_template`/`slot_template`/`submission_template`). Live; RLS test `l2_field_slot_scope.test.sql`. |
| L4 | ✅ Fixed | `inviteStudent` normalizes + validates the email and deletes the just-created auth user if the profile insert fails (no orphan). `lib/validation.ts`. |
| L5 | ✅ Fixed | `saveFormAnswers` caps answer length (`MAX_ANSWER_LENGTH` 5000) and enforces required fields server-side on submit. `lib/validation.ts`. |

**Not yet deployed to Vercel:** all the above DB migrations are live in the Supabase
project, but the app-code change (`forms.ts` guards, H1 defense-in-depth) deploys
only when `main` is pushed to `origin`.
