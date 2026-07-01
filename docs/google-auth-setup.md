# Google Auth — provider setup

"Continue with Google" is wired in the app (`app/auth/callback/route.ts` +
`components/auth/GoogleButton.tsx`). Before it works in a given environment you must
configure the provider in the Google Cloud and Supabase dashboards. These steps are
manual and are **not** performed by any migration or code.

## Deploy order (do this first)

**Apply the migration `20260701000001_schools_update_own_name.sql`
(`supabase db push`) BEFORE enabling the Google provider in Supabase.**

A new Google organizer is provisioned with an empty school name and is asked for it on
their first exchange, which `createExchange` persists via an UPDATE on their own `schools`
row. That UPDATE is allowed only by this migration's RLS policy. If the provider is enabled
before the migration is applied, a Google organizer can sign up but then cannot create any
exchange (the UPDATE is denied and the action throws) — they get stuck. Existing
email/password organizers are unaffected either way (their school name is already set, so
the UPDATE is skipped).

## 1. Google Cloud OAuth client

Google Cloud Console → **APIs & Services → Credentials** → **Create credentials → OAuth
client ID**:

- Application type: **Web application**
- Authorized redirect URI (this is Supabase's callback, not the app's):

  ```
  https://<project-ref>.supabase.co/auth/v1/callback
  ```

Copy the generated **Client ID** and **Client secret**.

## 2. Enable Google in Supabase

Supabase Dashboard → **Authentication → Providers → Google**:

- Toggle **Enabled**.
- Paste the **Client ID** and **Client secret** from step 1. Save.

## 3. Allow-list the app callback

Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs** — add the app
callback for every environment the button runs in:

```
https://<production-domain>/auth/callback
https://<vercel-preview-domain>/auth/callback   # any preview domains you use
http://localhost:3000/auth/callback             # local dev
```

The button builds `redirectTo` from `window.location.origin`, so each origin that serves
the app needs its own entry here.

## 4. Enable "link accounts with the same email" — load-bearing

Supabase Dashboard → **Authentication** settings → confirm automatic account linking for
the **same (confirmed) email** is enabled.

This is the assumption the **student** path depends on. An invited student's auth account
is created by their invite (keyed to the invited email) and confirmed when they click the
magic link. When they then choose "Continue with Google" with that same email, Supabase
links the Google identity into the existing invited account instead of creating a new one.

If a student uses a Google account whose email differs from the one they were invited
under, Google can't match the invite: the callback finds no invited profile and rejects
them with `?error=not_invited` (and deletes the orphan auth row). This is intended —
students remain invite-only. The message tells them to use the invited email or the
password path.

If this setting cannot be enabled on the current Supabase plan, the student Google path
will not work — flag it before relying on it.

## How the flows map to config

- **New organizer** (`/signup` → "Sign up with Google"): callback provisions a fresh
  organizer + school with an empty school name (captured later on the first-exchange form).
  Requires steps 1–3.
- **Returning organizer / student** (`/login` → "Continue with Google"): signs into the
  existing account. Requires steps 1–3; the student case also requires step 4.
- **Invited student setup** (`/accept-invite` → "Continue with Google", after the magic
  link): links Google to the invited account and fills their name from Google. Requires all
  four steps.

## Related

- Design: `docs/superpowers/specs/2026-07-01-google-auth-design.md`
- Plan: `docs/superpowers/plans/2026-07-01-google-auth.md`
- The `schools` UPDATE policy for the deferred school name lives in
  `supabase/migrations/20260701000001_schools_update_own_name.sql` — apply it with
  `supabase db push` at deploy time.
