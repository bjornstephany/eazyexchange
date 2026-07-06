# Frictionless same-device application resume

**Date:** 2026-07-06
**Status:** Approved — ready for implementation plan

## Problem

A public applicant fills in name/email at `/apply/[slug]`, clicks **Start**, and is
dropped onto the full form at `/apply/resume/[token]`. Their answers autosave
server-side, but the only key to the draft is the `resume_token` in the URL. To get
back later they must click **Finish later**, which emails the link on demand.

Three problems with this:

1. **Dead-end risk.** An applicant who closes the tab without clicking "Finish later"
   permanently loses access to a half-filled draft — there is no recovery path.
2. **Friction.** "Finish later" is a manual step; the resume link should just be
   available without the applicant having to remember to mail it to themselves.
3. **Clunky round-trip.** "Check your email for a link to continue" is a poor primary
   return path — especially on the *same device*, which is how applicants actually
   come back.

"Finish later" was made opt-in originally to avoid mail-bombing an arbitrary typed
address. That rationale is thin: a bot can click the button too, and the real
protection is the existing rate limits (3 emails/hr per address, 10/hr per IP).
Auto-emailing on start is no less safe than today.

## Usage assumption (decided)

Applicants return **mostly on the same device** they started on. Reopening the tab or
bookmark should "just work"; email is only a backup for when the device-local path
fails (cleared storage, incognito, switched device).

## Design — Approach A: device-remembered resume + silent email safety net

### 1. Starting an application

`/apply/[slug]` still shows the name/email start form for first-timers. On **Start my
application**:

- `startApplication` runs as today (creates the `draft` row + `resume_token`) **and now
  also sends the resume email**, fire-and-forget (`void sendApplicationResumeEmail(...)
  .catch(() => {})`) so a mail failure never blocks entry into the form. The existing
  per-email and per-IP rate limits already gate this call; no new abuse surface and no
  new limits needed.
- The client stashes the returned token in `localStorage` under a per-slug key
  `eazyapply:<slug>`, then navigates to `/apply/resume/<token>` as before.

### 2. Returning to `/apply/[slug]` — the "welcome back" path

The apply page gains a small **client wrapper** (the page stays a server component that
passes `slug` down). On mount the wrapper reads `localStorage["eazyapply:<slug>"]`:

- **No stored token** → render the normal start form (`ApplicationStartForm`, unchanged).
- **Stored token present** → call a new lightweight server action
  `peekApplicationDraft(token)` returning `{ live, firstName, language }` (only those —
  never the full draft PII). Show a brief neutral loading state while it resolves.
  - **`live: true`** → render a **Welcome-back** screen:
    - Greeting with first name (e.g. « Bon retour, Léa — reprends là où tu t'es arrêtée »),
      in the draft's stored `language`.
    - One prominent **Continue** button → navigates to `/apply/resume/<token>`.
    - A quiet text link « Ce n'est pas toi ? Commencer une nouvelle candidature » that
      clears the stored token and reveals the start form. This is the only "start fresh"
      affordance — there is deliberately **no** prominent "Start over" button.
  - **`live: false`** (submitted / expired / not found) → clear the stale `localStorage`
    key and render the start form.

### 3. The form — `/apply/resume/[token]`

- **Remove the "Finish later" button.** The fixed bottom bar becomes just **Submit**.
- Add a calm, permanent reassurance line near the save indicator, e.g.
  « Progression enregistrée automatiquement. Nous t'avons envoyé un lien par e-mail au
  cas où tu changes d'appareil. » (EN equivalent in the `T` table).
- Keep a subtle **"Resend link" / « Renvoyer le lien »** text action that reuses the
  existing `sendApplicationResumeLink` server action (still rate-limited) — for the rare
  "I cleared my browser / want it on my laptop" case.
- On successful submit, clear `localStorage["eazyapply:<slug>"]`. The form is keyed by
  `token` and doesn't know the slug today, so: extend `getApplicationDraft` to also
  return the exchange's `apply_slug` (it already joins `exchanges`), and thread that
  `slug` from the resume page into `ApplicationForm` as a prop. The localStorage key is
  slug-based because the revisit lookup at `/apply/[slug]` only knows the slug.

### 4. Server / data changes

- `startApplication`: add the fire-and-forget `sendApplicationResumeEmail` call after the
  insert succeeds. Return value unchanged (`{ token }`). No schema change.
- **New** `peekApplicationDraft(token)` server action: returns
  `{ live: boolean, firstName: string | null, language: 'en' | 'fr' }`. Reuses the same
  status/expiry logic as `getApplicationDraft` (live == status `draft` && not expired).
  Ships only a first name to the browser — the welcome screen *is* the shared-device
  consent gate, and a first name is the minimum it needs.
- `sendApplicationResumeLink` and `getApplicationDraft` are unchanged.
- **No migration.**

### 5. Edge cases

- **Shared / library computer:** the welcome screen always asks before continuing — it
  never silently loads a stranger's form. "Not you?" is the exit that clears the key.
- **Finished on another device:** the stored token now points to a submitted draft →
  `peek` returns `live: false` → start form shown, stale key cleared.
- **Expired draft:** same as above — `live: false`, key cleared, start form shown.
- **Email send fails on start:** silent; the same-device `localStorage` return still
  works, and "Resend link" is available from the form.
- **Second applicant on the same device** (siblings, shared phone): handled by the
  "Not you? Start a new application" escape hatch.

## Testing

- **Unit** (`actions/applications`): `peekApplicationDraft` returns `live` correctly for
  draft / submitted / expired / missing tokens and never leaks full PII;
  `startApplication` now fires the resume email (assert the email function is called),
  still bounded by the existing rate-limit tests.
- **Component** (`ApplicationForm`): no "Finish later" button; reassurance line rendered;
  "Resend link" calls `sendApplicationResumeLink`; `localStorage` key cleared on submit.
- **Component** (new welcome-back wrapper): stored live token → renders welcome screen,
  Continue navigates to the resume URL, "Not you?" clears the key and shows the start
  form; stored stale token → start form with key cleared; no token → start form.

## Out of scope

- Cross-device accounts / magic-code auth (email backup is sufficient for the
  same-device primary case).
- Any change to the organizer review, invitation, or enrollment flows.
- Recovering drafts server-side via an organizer UI.
