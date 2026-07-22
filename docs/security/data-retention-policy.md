# Data Retention & Deletion Policy — EazyExchange

**Status:** Durations confirmed (defaults accepted 2026-07-18). Enforcement
mechanism designed in `docs/superpowers/specs/2026-07-18-data-retention-lifecycle-design.md`.
Remaining `⟨DECISION⟩` markers below are sub-processor DPA/region confirmations, not durations.
**Last updated:** 2026-07-18
**Owner:** Bjorn (data controller for the SaaS; each school is an independent controller for its own students' data).

---

## 1. Why this exists

EazyExchange collects **personal data about minors** (student names, emails,
application answers, uploaded documents that can include ID, medical and travel
papers) and about their parents. Under the GDPR (the product and its users are
in the EU/France) this triggers two hard obligations:

- **Storage limitation (Art. 5(1)(e))** — personal data may be kept only as long
  as necessary for the purpose it was collected for. "We might need it someday"
  is not a purpose.
- **Right to erasure (Art. 17)** — a data subject (or a parent, for a minor) can
  ask for their data to be deleted, and we must be able to do it.

France's CNIL treats data about minors as requiring heightened care and data
minimisation. This policy defines, per data category, **how long we keep it and
how it gets deleted** so those obligations are met by default and not by memory.

## 2. Roles

- **EazyExchange (Bjorn)** is the data **processor** for student/parent data
  (we host it on behalf of schools) and the **controller** for organizer
  account and billing data.
- **Each school** is the **controller** for its own students' data and decides
  the ultimate lawful basis for collecting it. This policy is the processor-side
  default; a school contract can shorten (never silently lengthen) these periods.

## 3. Data inventory & classification

Mapped to the live schema so the deletion jobs have concrete targets.

| Category | Where it lives | Sensitivity | Contains minor PII? |
|---|---|---|---|
| Student/organizer identity | `users` (`full_name`, `email`), `auth.users` | Medium | Yes (students) |
| Application answers | `applications.data` (jsonb), `applications.email`, `.invite_response_note` | **High** | Yes |
| Application photo | `applications.photo_path` → `application-photos` bucket | **High** (biometric-adjacent) | Yes |
| Form field answers | `field_answers.value`, `submissions.review_note` | **High** | Yes |
| Uploaded documents | `document_uploads` + `documents` storage bucket | **Highest** (may hold ID / medical / passport) | Yes |
| Enrollment links | `assignments`, `exchange_enrollments` | Low (references) | Indirect |
| Invite/resume tokens | `applications.resume_token/invite_token`, `organizer_invites.token` | Medium (access grants) | No |
| Email delivery log | `email_send_log.recipient` | Medium (email addresses) | Yes |
| Security audit trail | `audit_log` (actor ids, `metadata` jsonb) | Medium | Indirect |
| Error reports | `error_reports.message/stack` | Low (PII-free by policy) | Should be none |
| Product feedback | `feedback.message` | Low–Medium | Possibly |
| Rate-limit counters | `rate_limits.key` | Low (may embed hashed email/IP) | No |
| Billing | `schools.stripe_*` | Low (IDs only; invoices live at Stripe) | No |

## 4. Retention schedule

Durations marked `⟨DECISION⟩` below were **confirmed as-is on 2026-07-18** (defaults
accepted). They are encoded in `retention-sweep/rules.ts` per the enforcement spec.

### 4.1 Application data (the anonymous funnel)

| State | Trigger | Retention | Rationale |
|---|---|---|---|
| Abandoned draft (never submitted) | `updated_at` | `⟨DECISION: 90 days⟩` after last activity, then hard-delete | Resume tokens already expire; no reason to keep an incomplete minor's data |
| Rejected / declined applicant | `reviewed_at` / `responded_at` | `⟨DECISION: 6 months⟩` after decision, then hard-delete | Short window for the applicant to contest; not selected = no ongoing purpose |
| Accepted → enrolled | `enrolled_user_id` set | Converts to the "enrolled student" lifecycle below; the raw `applications` row is deleted `⟨DECISION: 6 months⟩` after enrollment once data is carried into the student record | Avoid duplicate copies of the same PII |

### 4.2 Enrolled students — submissions & documents

| Data | Trigger | Retention | Rationale |
|---|---|---|---|
| Form answers (`submissions`, `field_answers`) | `exchanges.archived_at` | `⟨DECISION: 12 months⟩` after the exchange is archived, then hard-delete | Covers post-trip admin/incident window, then purge |
| **Uploaded documents** (`document_uploads` + storage objects) | `exchanges.archived_at` | `⟨DECISION: 3 months⟩` after archived (shorter than answers on purpose) | Highest-sensitivity data — passports/medical should not linger post-trip |
| Student account (`users` + `auth.users`) | last exchange archived | Deleted when the student has no remaining non-purged data | No standing reason to keep a minor's login after their exchange ends |

> **Recommendation:** offer organizers a **"purge documents now"** action once a
> trip is confirmed complete, rather than waiting for the timer. Least data held
> is least risk.

### 4.3 Operational & security data

| Data | Retention | Rationale |
|---|---|---|
| `email_send_log` | `⟨DECISION: 12 months⟩` | Deliverability debugging; then purge (holds recipient emails) |
| `audit_log` | `⟨DECISION: 24 months⟩` | Security/forensics need a longer tail than operational data |
| `error_reports` | `⟨DECISION: 90 days⟩` after `status='resolved'` | Debugging only; must stay PII-free regardless |
| `rate_limits` | Purge rows with `window_start` older than `⟨DECISION: 7 days⟩` | Pure counters; nothing to retain |
| `feedback` | `⟨DECISION: 24 months⟩` | Product signal; delete on account closure too |
| Expired tokens (`resume/invite/organizer_invites`) | Hard-delete the row once expired | Access grants; no reason to keep dead tokens |

### 4.4 Organizer accounts & billing

| Data | Retention | Rationale |
|---|---|---|
| Organizer `users` / `auth.users` | While subscription active; delete `⟨DECISION: 6 months⟩` after account closure + grace period | Business relationship duration |
| `schools.stripe_*` IDs | While subscription active; retained for the accounting period after closure | Billing continuity |
| Invoices / payment records | **Held by Stripe, not us.** French commercial law requires ~10 yrs; that obligation sits with Stripe as the record-keeper | We store only opaque IDs, no card or invoice data |

## 5. How deletion actually happens (technical)

Retention is worthless if it's manual. Proposed mechanism, reusing existing infra:

1. **Daily retention sweep** — a scheduled job (mirror the existing
   `send-reminders` edge function + cron pattern, or `pg_cron`) that runs the
   rules above. It runs with the service role (already walled off per the admin
   allowlist) because it must delete across schools.
2. **DB rows** — most children cascade via FK (`submissions → field_answers /
   document_uploads`, `applications → …`). Verify each cascade before relying on
   it; add `ON DELETE CASCADE` where missing.
3. **Storage objects do NOT cascade** — deleting a `document_uploads` row does
   **not** delete the file in the `documents` bucket, nor does deleting an
   `applications` row delete its `application-photos` object. The sweep must
   explicitly delete storage objects **before/alongside** the DB rows, or orphan
   files leak. This is the single most likely bug in implementation — call it out
   in the build and cover it in the RLS/retention test matrix.
4. **Hard delete, not soft delete** — for erasure to be real, rows and files are
   removed, not flagged. (A short-lived soft-delete tombstone is acceptable only
   if it too is purged on schedule.)
5. **Idempotent + logged** — each sweep writes an `audit_log` entry (counts only,
   **no PII**) so we can prove deletions happened.

## 6. Right to erasure (on request)

When a parent/student asks for deletion ahead of the schedule:

- The **school organizer** can delete a student and their submissions from the
  dashboard (already partially supported — confirm coverage of storage objects).
- For a full **"erase me"** request, run the same delete path as the sweep,
  scoped to one subject, and confirm both DB rows and storage objects are gone.
- Log the fulfilled request (no PII) in `audit_log`.
- **Target: fulfil within 30 days** (GDPR Art. 12).

## 7. Access & portability (on request)

A data subject can ask for a copy of their data. Provide an export of that
student's `applications.data`, `field_answers`, and their uploaded documents.
(Not yet built — noted as a gap in §9.)

## 8. Sub-processors (where the data physically sits)

- **Supabase** — Postgres (encrypted at rest + in transit) and Storage. Region
  and DPA to be recorded here: `⟨DECISION: confirm region + DPA on file⟩`.
- **Resend** — transactional email; sees recipient email + names in message
  bodies. DPA: `⟨DECISION: confirm⟩`.
- **Vercel** — hosting/compute; PII transits functions but is not stored there.
- **Stripe** — billing; no student PII.

Each must have a Data Processing Agreement on file before a real school onboards.

## 9. Known gaps (as of this draft)

- **No retention sweep is implemented yet** — everything above is policy without
  enforcement until the §5 job ships.
- **Storage-object deletion** on student/application removal is the top
  correctness risk to verify.
- **Leaked-password protection is OFF** (Supabase HIBP check is Pro-tier; the
  self-implemented HIBP-range check was scoped but never shipped) — not a
  retention issue, but a related account-security gap worth closing.
- **No self-service data export** for access/portability requests.
- **Minor consent basis** — who consents for a minor (parent vs school) should be
  nailed down in the school onboarding contract, not just here.

## 10. Review

Revisit this policy on any new PII-bearing table/bucket, before the first real
school onboards, and at least annually.
