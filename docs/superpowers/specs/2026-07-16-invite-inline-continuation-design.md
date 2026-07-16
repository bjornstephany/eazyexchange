# In-page continuation after invitation acceptance

**Date:** 2026-07-16
**Status:** Approved design, pre-implementation

## Problem

When a student clicks « Oui, je veux participer » on `/invite/[token]`, the app
creates their account and sends a **second email** (Supabase auth invite via
`inviteUserByEmail`). The page tells them « Regarde ta boîte mail » and the
student must return to their inbox, click the activation link, pass through
`/auth/confirm`, and only then land on `/accept-invite` to set their name and
password. The email round-trip is friction, and it depends on Supabase auth
SMTP (rate-limited on the free tier; default-template gotchas on staging).

## Goal

Clicking « Oui » signs the student in immediately and redirects them straight
to `/accept-invite` in the same browser session. No second email, ever.

## Why this is safe

The `/invite/[token]` link is delivered by Resend to the applicant's own email
address (`sendInvitationEmail` in the review flow). Possessing the token
already proves mailbox access — exactly the trust the Supabase activation link
re-establishes today. Token expiry (`invite_token_expires_at`) still bounds the
window and is still checked on every path.

## Design

### 1. Session minting in `respondToInvitation('yes')` (`actions/invitations.ts`)

Replace `admin.auth.admin.inviteUserByEmail(email, …)` with:

1. `admin.auth.admin.createUser({ email, email_confirm: true })` — creates the
   auth account, sends nothing. The existing choreography is unchanged: claim
   `accepted/maybe → enrolling` first; insert `users` profile row (empty
   `full_name`) and `exchange_enrollments`; roll back account + release claim
   on failure; finalize `enrolling → enrolled`.
2. `admin.auth.admin.generateLink({ type: 'magiclink', email })` → returns
   `properties.hashed_token` without sending an email.
3. `verifyOtp({ type: 'magiclink', token_hash })` on the **cookie-aware server
   client** (`lib/supabase/server`) — the same primitive `/auth/confirm` uses.
   Server actions may write cookies, so the session is established in-action.
4. The client (`InviteResponseForm`) does `router.push('/accept-invite')` on
   success. Middleware already admits a session with empty `full_name` to
   `/accept-invite`.

**Magiclink, not invite-type link:** `generateLink({ type: 'invite' })` only
works for non-existent users. Magiclink works for existing users too, so the
same minting step serves the retry branch: a double-click or retry that finds
status already `enrolling`/`enrolled` also mints a session and redirects,
instead of today's silent no-op that strands the student.

Session-mint failure *after* enrollment succeeded (rare — fresh generated hash)
returns a distinct structured error telling the student to click « Oui » again;
the retry lands in the claim-fail branch, which now signs them in.

The enrollment checklist email (Resend, best-effort) is unchanged.

### 2. Abandoned-setup recovery (`app/invite/[token]/page.tsx`)

New state for the invite page. When status is `enrolled` or `enrolling` and the
token is **not** expired:

- If setup is incomplete (`enrolled_user_id` → `users.full_name` empty, or no
  `enrolled_user_id` yet): show a « Reprendre la configuration de ton compte »
  button that calls a new action which validates the token + expiry, mints a
  session the same way (steps 2–3 above), and redirects to `/accept-invite`.
- If setup is complete: show « Ton compte est déjà actif » with a link to
  `/login`.

`getInvitation` is extended to report enough state to render this (e.g.
`setupComplete: boolean | null`). Expired tokens keep today's dead-end — the
student contacts their organizer.

The `declined`/`maybe`-answered dead-ends are unchanged.

### 3. Structured returns instead of thrown errors

`respondToInvitation` currently throws for **expected** outcomes (expired
invite, already answered, email exists) and `InviteResponseForm` displays
`e.message` — which production redacts to an opaque digest (documented gotcha;
see `lib/billing/exchange-limit.ts` for the house pattern). Since the action is
being rewritten:

- `respondToInvitation` (and the new resume action) return
  `{ ok: true } | { ok: false, error: <message key or string> }` for all
  expected outcomes. Throwing remains only for genuinely unexpected failures.
- `InviteResponseForm` branches on the returned value, never on `error.message`.
- Error strings shown to students stay in French, consistent with the page.

### 4. Removals

- `inviteUserByEmail` call and its `redirectTo` — students no longer receive
  any Supabase auth email.
- The « Parfait ! Regarde ta boîte mail… » success copy (replaced by the
  redirect).

### Unchanged

- `/accept-invite` page (name + password / Google button) — reused as-is.
- « Non merci » / « Peut-être » paths.
- DB schema — **no migration**, so no `test:rls` run required.
- `/auth/confirm` and `/auth/callback` routes (still used by organizer flows
  and Google OAuth).

## Testing

- `actions/__tests__`: rewrite `respondToInvitation` 'yes' coverage —
  `createUser`/`generateLink`/`verifyOtp` mocked; rollback on profile/enrollment
  failure still deletes the auth user and releases the claim; retry branch
  mints a session; session-mint failure returns the structured retry error;
  structured returns for expired / already-answered / email-exists.
- New resume action: token validation, expiry, setup-complete vs incomplete.
- `components/__tests__/InviteResponseForm.test.tsx`: « Oui » success triggers
  `router.push('/accept-invite')`; structured errors render; no check-your-email
  copy remains.
- Invite page state tests: recovery state renders for enrolled+incomplete,
  login link for enrolled+complete, expired stays dead-ended.
- Gate: `pnpm lint && pnpm test && pnpm build`.

## Decisions log

- **Setup UX:** redirect to existing `/accept-invite` (not inline, not merged
  single screen) — zero new setup UI, one seamless flow. (Bjorn, 2026-07-16)
- **Backup activation email:** dropped entirely — redundant once the session is
  minted in-page; removes the Supabase SMTP dependency. (Bjorn, 2026-07-16)
- **Mechanism:** magiclink `generateLink` + server-side `verifyOtp`, chosen over
  invite-type links for idempotent retry/recovery on existing users.
