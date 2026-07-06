# Product feedback backlog — 2026-07-06 walkthrough

Bjorn's full-app review, decomposed into sub-projects. Each gets its own
spec → plan → execution cycle. **Sub-project 1 is specced**
(`docs/superpowers/specs/2026-07-06-application-dedupe-mandatory-fields-design.md`);
the rest are unstarted.

## 1. Student application process (SPECCED)

- Bug: same email can create a second application (cross-device/incognito) → server
  dedupe + unique index. Rejection is final. All fields mandatory (at-least-one-
  complete-parent rule; conditional separation address). Photo required + nicer
  upload card. See the spec for locked decisions.

## Parallel brainstorming — session split (added 2026-07-06)

Run one Claude Code session per line, all in this directory. Paste the prompt
verbatim; each session reads this file and brainstorms only its own scope.
Boundary rule: **the « Nouvel échange » items below belong to Session B (#3)**,
not the polish batch — collaborators-in-exchange-creation redesigns that form
anyway. Sessions commit their spec (a distinct new file each) to the currently
checked-out branch; that's fine, they're docs.

- **Session A:** « Read docs/feedback-backlog-2026-07-06.md and brainstorm
  sub-project 2 (UI polish batch) with superpowers:brainstorming. Skip the
  Nouvel échange items — they belong to sub-project 3. »
- **Session B:** « Read docs/feedback-backlog-2026-07-06.md and brainstorm
  sub-project 3 (collaborators) with superpowers:brainstorming. Include the
  Nouvel échange redesign items from sub-project 2 (field removals, UI). »
- **Session C:** « Read docs/feedback-backlog-2026-07-06.md and brainstorm
  sub-project 4 (automatic email controls + acceptance-email terms) with
  superpowers:brainstorming. »
- **Session D:** « Read docs/feedback-backlog-2026-07-06.md and brainstorm
  sub-projects 5 and 6 (organizer 2FA, then the feedback widget) with
  superpowers:brainstorming — two small specs, one after the other. »

Sub-project 1 is already specced; its next step is a separate session:
« Write the implementation plan for
docs/superpowers/specs/2026-07-06-application-dedupe-mandatory-fields-design.md
with writing-plans » .

Parallelize brainstorming/specs only — run **plans and executions one at a
time** (they edit real code in this shared checkout and would trample each
other; the application work also needs its specific branch checked out).

## 2. UI polish batch (many small items, one pass)

**Landing page**
- FR/EN switcher: toggle → discreet dropdown.
- Copy: "The whole student file, in one place" → "The **entire** student file, in one place".
- Improve "the 4 steps" — consider a 5th step "add documents and forms".
- The automatic-email section below the steps is ugly — redesign.
- Update the exchange-coordinator testimonial.
- Copy: "Ready to simplify your next **session**?" → "…your next **exchange**?".
- Browser tab title: drop the "— Every student …" suffix.

**Login page**
- « ou » → « ou continuer avec ».
- Remove email/password labels → placeholder labels inside the fields, mail icon
  for email, lock icon for password.
- Add "Don't have an account? Create an account" linking to signup.
- (From Google question) Consider `prompt: 'select_account'` so Google always
  shows the account picker.

**Invite students popup**
- No separate warning popup on « Fermer » — inline the warning in the same popup.

**Nouvel échange**
- Improve the UI generally.
- Remove « Nom de l'établissement » field (exchange name ≈ partner school name).
- Consider removing « Année ».

**Dashboard (aperçu)**
- After creating an exchange with no forms yet: CTA to create the first
  documents/form requests.

**Formulaires page**
- Remove the search box.
- Remove the blue « + Nouveau formulaire » button (top right).

**Réglages**
- Remove from the sidebar; put it in the profile menu next to « Se déconnecter ».

**Billing**
- More information about each plan to sell them better.

**Emails**
- "Eazy" in the EazyExchange logo/wordmark should match the design's blue.

## 3. Collaborators (new feature, likely schema)

- Onboarding should ask whether to add a collaborator.
- Adding collaborators should be part of exchange creation.
- Needs design: multiple organizers per school/exchange, invites, permissions.

## 4. Automatic email controls (medium feature)

- Organizers should easily decide when and how often reminders go out, and modify
  their choices (today: hardcoded weekly→daily pacing in the `send-reminders`
  edge function).
- Acceptance email: add a "terms of exchange" notice ("by clicking accept you
  acknowledge …") — wording to be reviewed with Mom before shipping.

## 5. 2FA for organizers (medium feature)

- Supabase MFA (TOTP) for organizer accounts. Self-contained.

## 6. Feedback widget (small feature)

- Suggestion/bug form integrated into the dashboard.

## Answered questions (no work needed)

- Google signup skipped the account chooser because the browser had one Google
  session / prior consent — normal OAuth; `prompt: 'select_account'` forces the
  picker (listed under polish).
- Google-signup users have no password by design; the reset-password flow can
  set one later.
