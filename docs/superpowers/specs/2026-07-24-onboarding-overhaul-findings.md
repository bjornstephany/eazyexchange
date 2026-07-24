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

- **`{{ .SiteURL }}` checked and cleared.** Prod Auth `site_url` is
  `https://eazyexchange.com`, and `https://eazyexchange.com/**` is in the
  redirect allow list. The fallback link resolves to a real host on a real route.

### Actual mechanism: an organizer↔student redirect loop

Found by code inspection after both dashboard-level suspects were eliminated.
**Not yet observed live** — see "Confidence" below.

`getProfile()` (`lib/supabase/request.ts:40`) returns `null` whenever the `users`
row is not readable by the request's RLS-scoped client: `.single()` yields
`{ data: null }` for zero rows *and* for any error, and the error is discarded.
A null profile then satisfies **both** of these guards at once:

| File | Line | Guard | With `profile === null` |
|---|---|---|---|
| `app/(organizer)/layout.tsx` | 20 | `if (profile?.role !== 'organizer') redirect('/my-forms')` | fires |
| `app/(student)/layout.tsx` | 15 | `if (profile?.role !== 'student') redirect('/dashboard')` | fires |

So `/dashboard` → `/my-forms` → `/dashboard` → … until the browser aborts with
`ERR_TOO_MANY_REDIRECTS`, which presents as **a blank tab**. `/onboarding` joins
the same loop through its own line 18 (`!profile || role !== 'organizer'` →
`/my-forms`).

Why a fresh signup is the case that hits it: `/auth/confirm` provisions the
`users` row with the **admin** client (`provisionOrganizer`), then immediately
redirects to `/dashboard`, where `getProfile()` reads it back through the
**user's** client. Any lag or RLS visibility gap on that first read produces
exactly the null profile above. This also explains why the symptom is specific to
confirming an email rather than to ordinary logins.

Note this is a **general** defect, not an onboarding-only one: any authenticated
user whose profile row is briefly unreadable gets a blank tab instead of an error.

- **Fix owner: code, in this branch.** No dashboard step is required for the
  blank tab. The loop needs one side to stop bouncing — the natural fix is for
  the null-profile case to be handled explicitly (sign out to `/login`, or render
  an error) rather than being folded into "not my role, try the other shell".
  Task 10 owns the entry redirects and is the right home for it.

### Confidence

- **Proven by code:** the two guards above are both satisfied by a null profile,
  so the loop is unavoidable once `getProfile()` returns null. This is a
  certainty about the code, not a hypothesis.
- **Not proven:** that a null profile is what actually happens after a real
  signup confirmation on prod. That last link is inference. Confirming it needs
  either a real prod signup (staging cannot send email) or an `error_reports` /
  Vercel log check for a burst of redirects around a signup.
- The spec's §1 anticipated a "session hiccup" sending the organizer to
  `/login`. The real fallthrough is `/my-forms`, and it loops instead of landing.

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

- **Task 10 grows a second job:** break the organizer↔student redirect loop by
  handling `profile === null` explicitly, instead of letting it fall through
  both role guards. This is the blank-tab fix and it is code, not configuration.
  Worth a regression test that pins a null profile to a terminal destination.

- **Task 11 manual steps shrink to one.** Not "replace `{{ .ConfirmationURL }}`"
  (already done) and not the Site URL (verified correct). Only: edit the prod
  confirmation template's fallback link `next=/dashboard` → `next=/onboarding`,
  so it matches the three code paths Task 10 repoints.

---

## Staging verification (Task 11, Step 3) — 2026-07-24

Run against **staging** (`loygdbjdyciipvdcpvmr`) with a purpose-made organizer
(`onboarding-check@example.com`, named school + no exchange = step 2), driven
with Playwright. The demo seed was deliberately **not** touched — the plan's
Task 1 Step 2 deletes the seeded exchanges, which would disrupt any sibling
session using staging. The test user, its school and its exchange were deleted
afterwards; staging is back to how it was found.

| # | Check | Verdict |
|---|---|---|
| 1 | Step 2 shows four inputs only, no « Informations complémentaires », no card textareas | **PASS** (exactly 4 inputs found) |
| 2 | Return-before-departure shows the error immediately and disables « Continuer » | **PASS**, and it clears + re-enables once fixed |
| 3 | Typing, closing the tab, reopening `/onboarding` restores the text | **PASS** (name, destination and both dates restored) |
| 4 | « Continuer » lands on `/applications` with no intermediate screen | **PASS** — observed navigation sequence was `/applications`, nothing else |
| 5 | Réglages → Programme shows, saves and reloads the three acceptance-email fields | **PASS** (values survived a full reload) |

No hydration warnings and no browser console errors on any page. The dev
overlay's « 1 Issue » badge is the pre-existing multiple-lockfiles workspace
warning, unrelated to this branch.

### ⚠️ `pnpm dev` points at PRODUCTION, not staging

The plan's Task 1 Step 3 says to start the dev server with a bare `pnpm dev` and
drive it "against staging". **It is not against staging.** `.env.local` — which
`pnpm wt` links into every worktree — holds the **prod** project
(`rgisrqlbcjdoetoybaqd`); `.env.staging` is a separate file the dev server does
not read. Following that step literally would have created the test organizer,
school and exchange **in production**.

It surfaced only as a confusing « Invalid login credentials »: the test user had
been made on staging, and the browser was talking to prod.

To actually drive staging, export the staging values over the prod ones (shell
env beats `.env.local` in Next.js):

```bash
set -a; source .env.staging; set +a
env NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    NEXT_PUBLIC_APP_URL=http://localhost:3293 \
    pnpm dev
```

Two smaller traps in the same area: the Supabase **MCP tools are wired to prod**,
so they cannot be used to set up staging fixtures; and `psql` is not installed in
this environment, so the plan's `psql "$STAGING_DB_URL"` snippets do not run —
use a small `@supabase/supabase-js` script with the staging service-role key,
executed from inside the worktree so `node_modules` resolves.

### Out of scope, but observed

The **login** page still routes organizers to `/dashboard`, so a returning
mid-onboarding organizer goes `/login → /dashboard → /onboarding`. Task 10 fixed
the three *confirmation* paths; this is the same wasted hop on the login path
(`app/(auth)/login/page.tsx`, the `router.push` after `signInWithPassword`).
Harmless today because the layout gate catches it — and, since `bbbca13`, no
longer able to loop — but it is the identical pattern the spec's §1 argues
against. Worth a backlog line rather than a scope grab here.

## Manual steps (Bjorn only)

- [ ] **Supabase → Authentication → Email Templates → Confirm signup.** The
      template does **not** need the `{{ .ConfirmationURL }}` replacement the
      plan anticipated — it is already token-only (see the Item 1 verdict). The
      one change still wanted is the fallback link's destination, so it matches
      the three code paths Task 10 repointed:

      from: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
      to:   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding

      Low urgency: `/dashboard` still works, it just costs the extra hop.

- [ ] **Prod smoke:** fresh `/signup` → confirm → lands on `/onboarding` →
      finish → lands on `/applications`. Prod's `users` table is empty, so this
      starts clean. This is also the only way to close out the blank-tab
      question — the loop is fixed by construction, but that a real signup was
      producing the null profile remains inference.
