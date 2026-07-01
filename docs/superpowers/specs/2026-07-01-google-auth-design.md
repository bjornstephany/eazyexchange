# Sign up / sign in with Google — Design

**Date:** 2026-07-01
**Status:** Approved, ready for implementation planning

## Goal

Add "Continue with Google" as a modern alternative to email/password auth, without
breaking two existing invariants:

- **Organizers self-register** — anyone may create an organizer account (and its school).
- **Students are invite-only** — a student account may exist only if an organizer invited
  them. No student self-registration.

Concretely:

- **Organizers** can both **sign up** and **sign in** with Google.
- **Students** can **sign in** with Google, and — after clicking their invite magic link —
  can **complete setup** with Google instead of choosing a password. They still cannot
  originate an account from Google alone.

## Background: how auth works today

- **Organizer signup:** `/signup` collects `full_name` + `school_name`, calls
  `supabase.auth.signUp` with those in `options.data`, and sends a confirmation email.
  `/auth/confirm` verifies the OTP (`type=signup`), then `provisionOrganizer` creates the
  `schools` row + `users` profile (role `organizer`).
- **Student invite:** organizer accepts an applicant → `respondToInvitation`
  (`actions/applications.ts`) calls `admin.auth.admin.inviteUserByEmail` (creates the auth
  account, email, no password) and inserts a `users` profile with `full_name = ''` +
  enrollment. Supabase emails a magic link to `/auth/confirm?type=invite&next=/accept-invite`.
  `/auth/confirm` establishes the session; `/accept-invite` sets `full_name` + password.
- **"Setup complete"** is inferred by middleware from a **non-empty `full_name`**. A student
  with `full_name = ''` is bounced to `/accept-invite`.
- **Email-link verification** flows through `app/auth/confirm/route.ts`, which handles
  `?token_hash=` + `type=` (the OTP/PKCE flow) and **must** `redirect()` via
  `next/navigation` so session cookies flush.
- `middleware.ts` lets **all `/auth/*` paths through untouched** (they run before a session
  is fully established).
- `schools.name` is `text NOT NULL`; the empty string `''` satisfies it and is used as the
  "name not yet set" sentinel. It is never displayed until an exchange exists.

## Key constraints Google OAuth imposes

1. **The OAuth handshake cannot distinguish invited student from stranger**, and carries **no
   school name**. All account-state decisions must therefore live in one server-side callback.
2. **Google never provides a school name.** New organizers are provisioned with `name = ''`
   and prompted for the real name later (see "Deferred school name").
3. **A student lands in the right account only if their Google email == their invited email.**
   Supabase auto-links a Google identity into an existing account when the email matches and is
   confirmed — the magic-link step is what confirms it. A mismatched Google email produces a new
   orphan account (→ rejected by the callback guard). The error message must explain this.
4. For students, **"sign up with Google" and "sign in with Google" are the same OAuth action.**
   The real gate is "does an invited profile exist for this email?"

## Architecture

### New route: `app/auth/callback/route.ts`

Parallel to `/auth/confirm` (which handles `?token_hash=` OTP links). This handles the OAuth
`?code=`. It exchanges the code for a session, then runs a single decision tree:

```
GET /auth/callback?code=&intent=&next=
  { data, error } = supabase.auth.exchangeCodeForSession(code)
  if error → redirect('/login?error=oauth_failed')
  user U = data.user

  profile = admin.from('users').select('id, role, full_name').eq('id', U.id).maybeSingle()

  IF profile exists:
    IF profile.role === 'student' AND profile.full_name is empty:
      // student completing setup via Google — Google identity auto-linked to invited account
      full_name = google name (user_metadata.full_name | name)
      admin.users.update({ full_name }).eq('id', U.id)   // marks setup complete
    dest = safeNext || (profile.role === 'organizer' ? '/dashboard' : '/my-forms')
    return redirect(dest)

  ELSE (no profile — brand-new Google user):
    IF intent === 'organizer_signup':
      result = provisionOrganizerFromOAuth(U)
      if !result.ok → redirect('/login?error=signup_failed')
      return redirect('/dashboard')
    ELSE:
      // uninvited student / stranger → enforce invite-only
      await supabase.auth.signOut()
      await admin.auth.admin.deleteUser(U.id).catch(() => {})   // delete orphan auth row
      return redirect('/login?error=not_invited')
```

`safeNext`: same open-redirect guard as `/auth/confirm` — only same-origin relative paths
(`next.startsWith('/') && !next.startsWith('//')`), else `/`.

### Intent passing — via `redirectTo`, no cookie

Intent rides in the `redirectTo` query string:

- `/signup` button → `…/auth/callback?intent=organizer_signup&next=/dashboard`
- `/login` button → `…/auth/callback` (no intent)
- `/accept-invite` button → `…/auth/callback?next=/my-forms` (no intent)

A forged `intent=organizer_signup` grants only an organizer account, which anyone can already
create via the signup form — **no security boundary is crossed**, so a query param (not a
signed cookie) is sufficient.

### Provisioning: `provisionOrganizerFromOAuth(user)` in `lib/auth/provision.ts`

Mirrors `provisionOrganizer` but sources data from the Google identity instead of signup
metadata:

- `full_name` ← `user_metadata.full_name` (fallback `user_metadata.name`, fallback `''`).
- `school_name` ← `''` (deferred; captured later).
- Idempotent (existing-profile check), same rollback-on-failure behavior as `provisionOrganizer`.

### Client entry points: shared `components/auth/GoogleButton.tsx`

Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` with a
`redirectTo` prop. Rendered on:

- **`/signup`** — creates a new organizer (intent set).
- **`/login`** — signs in an existing organizer or student.
- **`/accept-invite`** — the student is already signed in from the magic link; clicking Google
  runs OAuth with the same (now-confirmed) email → Supabase auto-links the identity into their
  existing account → callback fills their `full_name`. **No password required.** The password
  form remains as the alternative.

### Deferred school name capture

`provisionOrganizerFromOAuth` creates the school with `name = ''`. On the **new-exchange form**
(`app/(organizer)/exchanges/new/page.tsx`), when the organizer's own school name is still `''`,
show one extra **required** field, "Your school name", and persist it in `createExchange`
(`actions/exchanges.ts`). Organizers whose school name is already set do not see the field.

This captures the name exactly when it first becomes visible (the exchange header renders
`Your School ↔ Partner School · year`), next to the partner-school field they already fill. The
dashboard shows nothing until the first exchange exists, so the empty placeholder is never
displayed.

## Files

**New**

- `app/auth/callback/route.ts` — OAuth code exchange + decision tree.
- `components/auth/GoogleButton.tsx` — shared "Continue with Google" button.

**Modify**

- `lib/auth/provision.ts` — add `provisionOrganizerFromOAuth`.
- `app/(auth)/login/page.tsx` — add Google button; surface `error=oauth_failed` and
  `error=not_invited`.
- `app/(auth)/signup/page.tsx` — add Google button (organizer intent).
- `app/(auth)/accept-invite/page.tsx` — add Google option; setup can complete without a
  password.
- `app/(organizer)/exchanges/new/page.tsx` — conditional "Your school name" field.
- `actions/exchanges.ts` — persist deferred school name in `createExchange`.

**Unchanged**

- `middleware.ts` — already passes `/auth/*` through untouched; `/auth/callback` is covered.

## Error handling

Login page (`/login`) surfaces new `?error=` flags:

- `oauth_failed` — "We couldn't sign you in with Google. Please try again."
- `not_invited` — "We couldn't match your Google account to an invitation. Use the same email
  your organizer invited you with, or set a password from your invite link instead."
- Existing flags (`invite_invalid`, `signup_failed`) unchanged.

## Testing

Unit tests (vitest):

- **Callback decision tree** — existing organizer → `/dashboard`; existing student with empty
  `full_name` → name filled + `/my-forms`; no profile + `intent=organizer_signup` → provisioned
  + `/dashboard`; no profile + no intent → `signOut` + `deleteUser` + `/login?error=not_invited`;
  `exchangeCodeForSession` error → `/login?error=oauth_failed`; `next` open-redirect guard.
- **`provisionOrganizerFromOAuth`** — school (`name=''`) + profile (role organizer, name from
  Google) created; idempotent on existing profile; rollback on profile-insert failure.
- **`createExchange`** — persists the deferred "Your school name" when the org's school name is
  empty; leaves an already-set name untouched.

## Ops / configuration (manual, in dashboards)

1. **Google Cloud** → create OAuth **web** client → client id + secret.
2. **Supabase Auth** → enable **Google** provider; paste client id/secret; authorized redirect
   URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Supabase Auth** → add `${NEXT_PUBLIC_APP_URL}/auth/callback` to the redirect allow-list.
4. **Supabase Auth** → confirm **"link accounts with the same email"** is enabled — load-bearing
   for student auto-linking (constraint #3).

No new environment variables; reuses `NEXT_PUBLIC_APP_URL`.

## Out of scope

- Other OAuth providers (Apple, Microsoft, etc.).
- Manual identity linking (`linkIdentity`) / the linking-beta feature — not needed because
  auto-link-by-email handles the student case.
- Letting students originate accounts from Google (would break invite-only).
- A dedicated "school settings" page to rename a school outside exchange creation.
