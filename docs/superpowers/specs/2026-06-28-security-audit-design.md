# EazyExchange Pre-Launch Security Audit — Design

**Date:** 2026-06-28
**Status:** Approved — ready to execute
**Type:** Security review (produces a findings report, not code changes)

## Context

The EazyExchange MVP is feature-complete (all `plan.md` phases done except the
final Vercel production deploy and end-to-end smoke test). Before real schools
and students — including minors' PII — are put on the app, we want a single
prioritized security findings report to triage from. This document is the audit
charter; the audit itself produces the report.

The app's security model is RLS-first: organizers may only access their own
school's data, students only their own assignments and submissions. The one
sanctioned RLS bypass is the service-role invite path in `actions/students.ts`.

## Goal

Produce one prioritized findings report covering the app-layer and DB-layer
trust boundaries, so the user can decide what to fix before rotating secrets and
deploying to production.

## Method

Manual full-app review by Claude. The codebase and live Supabase project state
are already available, so a whole-app review (not a diff-scoped review) gives the
best coverage. No automated branch-diff tooling is used because the working tree
is clean — there is no diff to review.

**No code changes are made during the audit.** Findings are reported; fixes are
planned separately after the user triages.

## Trust Boundaries In Scope

1. **Database / RLS**
   - Every RLS policy across all tables.
   - The `SECURITY DEFINER` helper functions (`my_role`, `my_school_id`,
     `template_school`, `assignment_school`, `assignment_student`,
     `submission_school`, `submission_student`, `has_assignment`,
     `update_updated_at`) — search_path pinning, EXECUTE grants.
   - The two trigger functions (`assign_students_to_new_template`,
     `assign_templates_to_new_enrollment`) — should not be RPC-callable.
   - Storage bucket policies.
   - Live Supabase security advisors (search_path mutable, anon/authenticated
     RPC EXECUTE, leaked-password protection disabled).

2. **Server actions** (`actions/*.ts`)
   - Every mutation verifies `getUser()` + role + school ownership.
   - IDOR check: can any caller-supplied ID (assignment, submission, template,
     exchange, student) be tampered to reach another school's or another
     student's data?

3. **Service-role path** (`actions/students.ts`)
   - The single place RLS is bypassed — confirm it cannot be abused to invite
     into or read from another school.

4. **Auth / session**
   - `app/auth/confirm/route.ts`: OTP verification, session cookie persistence,
     the open-redirect guard on `next`.
   - `lib/supabase/middleware.ts`: session handling and route protection.

5. **File handling**
   - Signed-URL generation for downloads (scope, expiry).
   - Storage path construction — path traversal / cross-tenant access.
   - Upload validation: file type and size limits.

6. **Email**
   - HTML injection / escaping in `lib/email.ts` and the `send-reminders` edge
     function (untrusted values: student name, form name, organizer note).

7. **Secrets**
   - Exposure surface; the known service-role JWT + Resend key exposure that
     must be rotated before a public deploy.

## Out of Scope

Infrastructure / DDoS, Vercel & Supabase project configuration, security headers
/ CSP, dependency / CVE scanning, and rate limiting. These may be promoted to a
later hardening pass after this audit.

## Deliverable

A findings report with each item ranked **Critical / High / Medium / Low**, and
for each: `file:line` (or DB object), the concrete risk, and the recommended fix.
Findings are grouped by severity, highest first. The report ends with a short
triage summary so the user can pick what to fix.

## Success Criteria

- Every trust boundary above is examined and explicitly accounted for in the
  report (including "no issue found" where that is the conclusion).
- Each finding is actionable: a developer can locate and fix it from the report
  alone.
- The user can triage from the report without re-reading the codebase.

## Next Step After Audit

The user triages the findings; selected fixes go through the normal
spec → plan → implementation cycle (a follow-up plan, not part of this audit).
