# Service-role (`createAdminClient`) call sites — classification

Rule of the audit (2026-07-07 hardening spec, W3): every call site is either
(a) **genuinely needs the RLS bypass**, or (b) **reducible** to the session
client / a narrow `SECURITY DEFINER` RPC. Reducible sites were migrated; the
rest are justified here. Additional rule adopted for RPCs: **nothing beyond a
first name goes onto the anon-callable surface** — token-keyed reads that
return more PII stay behind service-role server actions so PII never becomes
directly PostgREST-callable.

| Call site | Class | Status / justification |
|---|---|---|
| `lib/rate-limit.ts` (check_rate_limit RPC) | a | RPC execute deliberately revoked from anon/authenticated; service role is the only caller |
| `lib/auth/provision.ts` | a | signup creates school + profile before any session exists (auth.admin) |
| `app/auth/callback/route.ts` | a | invite-only enforcement: deletes orphan Google auth users (auth.admin) |
| `app/api/stripe/webhook/route.ts` | a | cross-tenant billing writes; client UPDATE on schools is revoked by design |
| `app/billing/checkout/route.ts`, `app/billing/portal/route.ts` | a | write `stripe_customer_id` on schools (client UPDATE revoked) |
| `app/billing/page.tsx` | b | **migrated** → session client (own profile + own school, RLS covers) |
| `app/billing/return/page.tsx` | b | **migrated** → session client |
| `actions/settings.ts` getBillingOverview | b | **migrated** → session client for the school read |
| `actions/settings.ts` inviteOrganizer / revokeOrganizerInvite / removeOrganizer | a | organizer_invites has no client policies (deliberate); removeOrganizer needs auth.admin.deleteUser |
| `actions/exchanges.ts` createExchange (collaborator invites) | a | same organizer_invites rationale |
| `actions/join.ts` | a | anonymous token claim + auth.admin.createUser |
| `actions/apply.ts` startApplication / saveApplicationDraft / submitApplication / uploadApplicationPhoto | a | token is the only auth; multi-table writes + auth.admin + storage |
| `actions/invitations.ts` respondToInvitation | a | token is the only auth; multi-table writes + auth.admin + storage |
| `actions/apply.ts` sendApplicationResumeLink | a | reads the applicant email to send mail; must stay behind the rate-limited action |
| `actions/apply.ts` getApplicationDraft | a | returns the full draft PII + signs a storage URL — stays off the anon RPC surface by the first-name rule |
| `actions/invitations.ts` getInvitation | a | returns applicant full name — same rule |
| `actions/applications-review.ts` getApplicationForReview | a | signs an application-photos URL (bucket has no organizer storage policy; authz is asserted in code first) |
| `actions/apply.ts` peekApplicationDraft | b | **migrated** → anon RPC `peek_application_draft` (Task 13) |
| `app/apply/[slug]/page.tsx` | b | **migrated** → anon RPC `get_apply_page_exchange` (Task 13) |

Review checklist for future code: a new `createAdminClient()` call needs a row
in this table (class + justification) in the same PR.
