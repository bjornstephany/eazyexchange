# Single-tab signup confirmation via 6-digit code

**Date:** 2026-07-23
**Status:** Approved (design) — ready for implementation plan
**Branch:** `feature/single-tab-signup-confirm`

## Problem

When an organizer signs up, they submit the form in **Tab A** and land on a static
"Vérifiez votre e-mail" dead-end. They then open their email and click the confirmation
link, which opens a **new Tab B** (`/auth/confirm` → verify OTP → provision → `/dashboard`).
**Tab A is orphaned** — a stale screen the user must abandon. The user should continue in
the original tab, not in a freshly-spawned one.

## Approach (chosen)

Replace the magic-link-driven second tab with a **6-digit code entered in the original
tab**. The confirmation email carries a code (`{{ .Token }}`); the "check your email"
screen becomes a code-entry field in Tab A; verifying the code mints the session and
provisions the organizer **in place**, then advances to `/dashboard`. There is no second
tab to orphan, and it works cross-device (read the code on a phone, type it on the
desktop).

The existing `/auth/confirm` link is **retained in the email as a subordinate fallback**
(rescues anyone who closes Tab A); the code is the primary, dominant CTA.

## Scope

- **Organizer signup** — the target. Gets the code flow. ✅
- **Password reset** — no such flow exists today. Out of scope; a "password reset flow
  (with code entry)" line is added to `BACKLOG.md` as future work.
- **Student/parent invite** — the parent receives the email asynchronously (often days
  later, another device); there is no original tab open and waiting, so single-tab
  continuity solves nothing. **Left unchanged.**

## Feasibility (confirmed)

Prod already runs **custom SMTP (Resend) for Supabase auth emails**, and email templates
are editable via the Management API `PATCH .../config/auth` (the same mechanism already
used to customize the invite template — see memory
`project-invite-email-template-config`). Surfacing `{{ .Token }}` in the "Confirm signup"
template is therefore a known, applyable config change.

## Components

### 1. Email template (Supabase config — not code)

Edit the **"Confirm signup"** template to prominently show the 6-digit `{{ .Token }}`
code, keeping the existing `/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`
link as a small fallback below it. Apply via the Management API (Supabase PAT; project ref
`rgisrqlbcjdoetoybaqd`; Cloudflare blocks python-urllib UA — use `curl -A curl/8.0`).

Document the template change in a short runbook note. **Caveat:** staging uses Supabase
default templates and sends no email, so this is a **prod-only, manually-verified** change
— it cannot be exercised on previews.

### 2. Signup page — `app/(auth)/signup/page.tsx`

Replace the static "Vérifiez votre e-mail" submitted-state block with a **code-entry step**
rendered in the same tab:

- Shows the target email so the user knows where to look.
- A 6-digit code input + submit button.
- A "renvoyer le code" link with a ~30–60s client cooldown.
- A "recommencer" escape hatch back to the form.
- No navigation away — the user stays in Tab A throughout.

Copy stays in French, matching the file's current hardcoded-FR convention. i18n extraction
of the auth surface is a separate workstream and out of scope here.

### 3. Server action — `confirmSignupCode(email, code)`

Colocated at `app/(auth)/signup/actions.ts`.

1. `verifyOtp({ email, token: code, type: 'signup' })` on the **SSR server client**
   (`lib/supabase/server`) → writes session cookies to the cookie store, exactly as
   `/auth/confirm` does. *(Implementation note: if Supabase rejects `type: 'signup'` for a
   plain 6-digit token, fall back to `type: 'email'`; confirm against the live project.)*
2. On success, call the existing `provisionOrganizer(data.user)` (unchanged, idempotent).
3. End with `redirect('/dashboard')` from the action so the session cookies **flush** — a
   returned value would not guarantee the flush; `redirect()` does. This mirrors the
   documented cookie-persistence requirement of `app/auth/confirm/route.ts`.
4. Expected failures (wrong code, expired code, provision failure) return **structured**
   `{ ok: false, error: 'invalid_code' | 'expired' | 'provision_failed' }` — never thrown,
   so prod Server Action error redaction does not swallow them. The page renders the
   message inline and allows retry.

### 4. Resend action — `resendSignupCode(email)`

Wraps `supabase.auth.resend({ type: 'signup', email })`; structured return; relies on
Supabase rate limits plus the client-side cooldown.

### 5. `/auth/confirm` route — untouched

The fallback link and every other flow (invite) keep working exactly as today. No
regression surface there.

## Error handling & edge cases

- **Wrong / expired code** → inline error, stay on the step, offer resend.
- **`user_repeated_signup`** (email already has a confirmed account → Supabase sends
  nothing, anti-enumeration): the code never arrives; behaves like any bad code, resend
  no-ops. No worse than today, and the fallback link is likewise inert — consistent.
- **User abandons Tab A** → the retained fallback link still lands them on `/dashboard` the
  old way.
- **Provisioning idempotency** → `provisionOrganizer` is idempotent, so code-then-link (or
  the reverse) causes no double-provisioning.

## Tests

- Extend `app/(auth)/__tests__/signup.test.tsx`: after submit, the code step renders and
  shows the email; submitting calls the action; a structured error renders inline.
- New unit test for `confirmSignupCode`, mirroring `app/__tests__/confirm.test.ts` mock
  style: success → redirect to `/dashboard` + `provisionOrganizer` called once; wrong code
  → structured error, no provision; provision failure → structured error.
- New unit test for `resendSignupCode`.

## Out of scope

- Building a password-reset flow (backlogged).
- Any change to the student/parent invite flow.
- i18n extraction of the signup/auth surface.

## Manual verification (prod, post-deploy)

Because staging cannot send the email, verify on prod with a fresh `+alias`:
sign up → confirm the code arrives → enter it in the original tab → land on `/dashboard`
without a second tab. Confirm the fallback link still works from a fresh signup.
