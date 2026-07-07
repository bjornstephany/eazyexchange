# Security hardening roadmap — design

**Date:** 2026-07-07
**Driver:** Dual goal — harden against real attackers *and* be ready for a customer
security review / SOC 2. Approach: one hardening effort, ranked deepest-value-first.
**Relationship to prior work:** The `2026-06-28-security-audit-findings.md` pre-launch
audit fixed point-in-time *bugs* (self-approval, un-scoped enrollment policies, unpinned
`search_path`, secret rotation, upload validation). This roadmap is complementary: it
builds **durable controls** — regression tests, dependency cadence, blast-radius
reduction, an audit trail, and review-readiness — so the posture stays good as the code
changes.

---

## Assessment that produced this roadmap

Attack surface mapped 2026-07-07 by reading every server action (~40), `middleware.ts`,
both auth routes, the Stripe webhook, all RLS migrations, storage bucket config, token
generation, email HTML, and the rate limiter.

**How authorization works (two realms):**

1. **Authenticated (organizers + students)** — Supabase Auth cookies. `middleware.ts`
   does a *redirect gate* only (locally-verified JWT via `getClaims()`). The real
   authorization lives in each server action: `getAuthUser()` → `getProfile()` → role
   check → school/exchange scope check → `assertExchangeWritable()`, all through the
   **RLS-enforced session client**. RLS is the actual boundary: school-scoped
   `SELECT`/`UPDATE` with `WITH CHECK`, non-recursive `STABLE SECURITY DEFINER` helpers
   (`my_role()`, `my_school_id()`) with pinned `search_path`.

2. **Anonymous, token-keyed** — the public application funnel, invitation responses, and
   organizer-invite acceptance. These run on the **service-role admin client (RLS
   bypassed)**, gated only by 24-byte crypto-random tokens + rate limits. **Here the code
   is the only authorization; there is no RLS backstop.**

**What was verified clean (no action needed):** No exploitable IDOR or missing-authz in
any action. All three storage buckets (`documents`, `application-photos`, `form-templates`)
are `public = false`. `check_rate_limit` RPC is revoked from `anon`/`authenticated`.
Tokens are `randomBytes(24)` base64url. Email HTML is consistently escaped (incl. the
organizer rejection note). Stripe webhook verifies the signature on the raw body. Google
OAuth enforces invite-only with orphan-account cleanup. Passwords get HIBP + policy checks
+ current-password reverification. PII-in-logs hygiene is deliberate.

**The structural weaknesses this roadmap addresses:**
- RLS is the *entire* security boundary but has **no automated regression test** — it is
  an invisible, unproven control that a refactor could silently break.
- `next@14.2.35` carries 15 advisories (5 high), including a still-unpatched
  Middleware/Proxy bypass on the auth-gate path.
- The service-role key bypasses RLS everywhere it is used, including anonymous public
  actions; there is no `.env.example` and no written rotation runbook (rotation has only
  happened once, reactively).
- Privileged actions leave only mutable, partial traces (`reviewer_id`) — no tamper-evident
  audit trail.
- A few read paths (e.g. `listApplications`) rely on RLS as their *sole* scope check.
- `enforceRateLimit` fails **open**; on a DB blip the mail-sending apply/resume paths lose
  their only cap → unlimited mail from the sending domain.

---

## Workstreams (ranked, deepest-value first)

### W1 — RLS regression test harness  *(code + SOC-2 evidence; effort: Med)*

**Goal:** Turn the invisible RLS boundary into a regression-guarded, demonstrable control.

**Approach:** Add an integration test suite that runs against a **real Postgres with the
migrations applied** (Supabase local stack via `supabase db start`, or a dedicated test
project) — not mocks. Seed two schools (A and B), an organizer + student in each, an
exchange, templates, applications, submissions, and storage rows per school.

**Assertions (the matrix a reviewer will ask for):** acting as school B's organizer/student,
attempting to read or write **school A's** rows must return zero rows / be rejected, for:
`exchanges`, `form_templates`, `form_fields`, `document_slots`, `assignments`,
`submissions`, `field_answers`, `document_uploads`, `applications`,
`exchange_enrollments`, `schools`, `feedback`, and `storage.objects` (all three buckets).
Include the positive cases (own-school access succeeds) so the test proves the policy is
not simply "deny all."

**Acceptance:** `pnpm test:rls` (or equivalent) spins up the DB, runs the matrix, and is
runnable in CI. A documented command a reviewer can watch pass. Decide during planning:
separate vitest project vs. a tagged suite; how CI provisions Postgres.

**Note:** This suite also covers the second half of W5 (it will fail if the RLS-only reads
ever regress), so W5's scope-check additions are belt-and-suspenders, not the primary guard.

### W2 — Upgrade Next.js + dependency cadence  *(code + process; effort: Low–Med)*

**Goal:** Clear the 5 high advisories (incl. the middleware/proxy bypass on the auth path)
and stop re-accumulating them.

**Approach:**
- Upgrade `next` and `eslint-config-next` off `14.2.35` to a patched release (evaluate
  latest 14.2.x vs. 15.x during planning). **Regression-test the fragile flows the code
  comments flag:** the `/auth/confirm` and `/auth/callback` cookie-flush-via-`redirect()`
  behavior, `middleware.ts` gating, and server-action cookie writes. These are the parts
  most likely to break across a major bump.
- Add a standing cadence: Dependabot/Renovate **or** a scheduled `pnpm audit` (e.g. weekly
  cron / CI check that fails on new high/critical). Document the triage rule in CLAUDE.md.

**Acceptance:** `pnpm audit --prod` shows 0 high/critical; auth + middleware flows verified
working post-upgrade; an automated recurring audit is configured.

### W3 — Shrink service-role blast radius + rotation runbook  *(code + process; effort: Low–Med)*

**Goal:** Reduce what a leaked `SUPABASE_SERVICE_ROLE_KEY` can reach, and make rotation a
15-minute drill instead of an incident.

**Approach:**
- **`.env.example`** — commit a values-free template of every required env var
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_APP_URL`), each with a one-line comment. Note the `NEXT_PUBLIC_APP_URL`
  must-be-non-sensitive gotcha inline.
- **Rotation runbook** — a short doc: how to rotate the service-role/publishable/Resend/Stripe
  keys, where each is set (Supabase, Vercel), and the order to avoid downtime. Reference the
  2026-06-28 rotation as the worked example.
- **Call-site reduction** — audit the ~10 `createAdminClient()` call sites. Classify each as
  (a) genuinely needs RLS bypass (account creation, cross-tenant webhook writes), or (b)
  could be a narrowly-scoped `anon`/`authenticated` policy or a `SECURITY DEFINER` RPC with a
  minimal grant. Migrate the (b) cases so the key's surface shrinks. Public read-by-slug/token
  lookups are the prime candidates. Each migration must keep the anonymous flow working and be
  covered by W1's tests where a policy is involved.

**Acceptance:** `.env.example` committed; rotation runbook committed; a written classification
of every admin-client call site with the reducible ones migrated (or explicitly justified).

### W4 — Immutable audit trail for privileged actions  *(code; effort: Med)*

**Goal:** Tamper-evident record of who did what to whom — a real detection/investigation
control and a table-stakes SOC-2 artifact.

**Approach:** An append-only `audit_log` table (`id`, `actor_user_id`, `actor_school_id`,
`action`, `target_type`, `target_id`, `metadata jsonb`, `created_at`). No `UPDATE`/`DELETE`
grant to any client role; writes go through the service-role client (or a `SECURITY DEFINER`
insert-only function). Log at minimum: submission approve/reject, application accept/reject,
collaborator invite/remove, exchange archive/restore, plan/subscription changes (from the
webhook). **PII rule:** store row IDs and action types, **never** student names, emails, or
submission contents (consistent with the no-PII-in-logs convention). Organizer-facing read
view is optional and out of scope for v1.

**Acceptance:** Migration adds the table + RLS (owner/admin read own-school rows; no client
writes); the named privileged actions write an entry; a test asserts entries are written and
are not client-mutable. Confirm during planning whether students should see their own
submission-decision history (leaning: no for v1).

### W5 — Defense-in-depth on anonymous flows  *(code; effort: Low)*

**Goal:** Small, concrete belt-and-suspenders on the highest-blast-radius surface.

**Approach:**
- **Fail-closed email limits:** `enforceRateLimit` currently returns (allows) on a DB error.
  For the *email-sending* keys specifically (`apply_email`, `resume_email`, and the
  organizer-invite send), a DB blip removing the cap means unlimited mail from the sending
  domain (reputation + cost). Add a fail-closed variant (or a secondary hard cap) for the
  mail-sending limits while leaving the form-entry limits fail-open for availability. Decide
  the exact policy during planning.
- **Explicit scope checks on RLS-only reads:** add `assertOrganizerInExchange` (or the
  equivalent school check) to `listApplications` and any sibling read that today relies on RLS
  as its sole scope guard, so a future RLS refactor can't silently open a cross-tenant read.

**Acceptance:** Mail-sending limits fail closed (or hard-capped) with a test; the identified
reads carry an app-level scope check in addition to RLS.

---

## Scope exclusions / non-goals

- **Not** re-auditing the point-in-time bugs already fixed in the 2026-06-28 audit.
- **Not** pursuing Supabase Pro-only features (e.g. built-in leaked-password protection —
  already self-implemented via HIBP).
- **No** full SOC 2 program (policies, vendor management, HR controls) — this roadmap covers
  the *technical* controls and evidence a customer review probes, not the compliance program.
- Organizer 2FA is **deferred** (tracked separately in the feedback-widget backlog).

## Build order

W1 → W2 → W3 → W4 → W5, as ranked. W1 and W2 are independent and could parallelize; W5's
second half depends on W1 existing (so its regressions are caught). W3's policy migrations,
where present, must be added to W1's matrix.
