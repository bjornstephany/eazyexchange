# Onboarding overhaul — reproduction findings

**Date:** 2026-07-24
**Environment:** production auth config (read-only Management API GET), plus a
code read of the three confirmation paths on `feature/onboarding-overhaul`.

## Item 1 verdict — the blank tab

- Signup email template body (prod, `rgisrqlbcjdoetoybaqd`), verbatim:

```html
<h2>Confirmez votre inscription</h2>
<p>Votre code de confirmation :</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0;">{{ .Token }}</p>
<p>Saisissez ce code dans l’onglet où vous vous êtes inscrit·e.</p>
<hr style="border:none;border-top:1px solid #E4E9F2;margin:24px 0;">
<p style="font-size:13px;color:#8A97B2;">
  Vous avez fermé cet onglet ?
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">Confirmez ici</a>.
</p>
```

  Subject: `Votre code de confirmation EazyExchange`

- Contains `{{ .ConfirmationURL }}`: **no**
- Contains `{{ .Token }}`: **yes**

- **Conclusion: hypothesis wrong.** The spec's §1 table claims the email
  confirmation link goes through Supabase's broken `GET /auth/v1/verify` with
  `emailRedirectTo`. It does not, and has not since the single-tab signup
  confirmation work shipped 2026-07-23 (`262b824`): the template's only link is
  the fallback « Confirmez ici », and it already uses the **working**
  `POST`/`token_hash` flow into `app/auth/confirm/route.ts`. `GET /verify` is
  eliminated as the blank-tab cause — that code path is no longer reachable from
  the signup email.

- **Traced the fallback link end to end; it does not blank either.**
  `/auth/confirm?token_hash=…&type=signup&next=/dashboard` → `verifyOtp` →
  `provisionOrganizer` → `redirect('/dashboard')` →
  `app/(organizer)/layout.tsx:52` → `mustOnboard('', 0)` is true →
  `redirect('/onboarding')`. `provisionOrganizer` always inserts a school (empty
  name sentinel, `lib/auth/provision.ts`), so `profile.schools` is never null and
  the `school &&` guard on that line cannot silently skip the gate for a fresh
  signup. The organizer does reach onboarding, via one wasted hop.

- **New top suspect, unverified: `{{ .SiteURL }}`.** It is the one part of that
  link neither code nor this read covers. If prod's Auth **Site URL** is stale or
  points anywhere other than `https://eazyexchange.com`, the fallback link
  resolves to a dead host and the tab is blank — which matches the symptom far
  better than anything in the code path above. Session memory already flags this
  setting as load-bearing (`project_supabase_site_url_prod`). Confirm with the
  same endpoint, reading `site_url`, before writing any fix.

- **Fix owner: Supabase dashboard (manual, Bjorn)** — but for a different reason
  than the spec predicted. See "Consequences" below.

## Item 7 verdict — the « Continuer » flash

**Not yet reproduced.** Task 1 Step 1 contradicted the spec, and the plan
instructs stopping to report at that point rather than continuing into Steps 2–5.
Steps 2–3 (staging repro in a browser) are unattended-able and unaffected by the
Item 1 result — they can run as soon as the §1 rewrite is settled.

- Navigation sequence observed after clicking Continuer: _not yet run_
- Intermediate screen seen: _not yet run_
- Conclusion: _pending_

## Consequences for the plan

- **Spec §1 needs a correction before Task 10 is written.** Its table row 2
  ("Email confirmation link | Supabase `GET /auth/v1/verify`, `emailRedirectTo`
  = `${NEXT_PUBLIC_APP_URL}/dashboard`") describes a flow that no longer exists.
  What is still true, and verified in code today:

  | Path | Actually today | File |
  |---|---|---|
  | 6-digit code | `confirmSignupCode` → `verifyOtp` → `provisionOrganizer` → `/dashboard` | `app/(auth)/signup/page.tsx` |
  | Email fallback link | `/auth/confirm?token_hash=…&type=signup&**next=/dashboard**` | prod email template |
  | Google | `GoogleButton intent="organizer_signup" **next="/dashboard"**` | `app/(auth)/signup/page.tsx:187` |
  | (vestigial) | `emailRedirectTo: ${NEXT_PUBLIC_APP_URL}/dashboard` | `app/(auth)/signup/page.tsx:56` |

  So §1's *prescription* survives intact — all three paths still aim at
  `/dashboard` and still launder a fresh signup through a page it is guaranteed
  to bounce off. Only §1's *diagnosis* of the blank tab was wrong.

- **Task 10: proceed as planned**, repointing all three at `/onboarding`. It is
  justified by the wasted-hop argument alone and does not depend on the blank-tab
  cause. Note the third path is the template's `next=/dashboard`, which is
  dashboard configuration, not code.

- **Task 8: unaffected by Item 1.** It still needs the Item 7 repro before the
  server-side-redirect decision can be made.

- **Task 11 manual steps change.** Not "replace `{{ .ConfirmationURL }}`" — that
  is already done. Instead:
  1. Verify prod Auth **Site URL** is `https://eazyexchange.com` (blank-tab
     suspect above).
  2. Edit the confirmation template's fallback link `next=/dashboard` →
     `next=/onboarding`, so it matches the three code paths Task 10 repoints.
