# Spec: reminder-apostrophe-tests — lock French typographic apostrophes in reminder email copy

**Date:** 2026-07-13
**Backlog one-liner:** «add unit-test assertions locking the French apostrophes (’) in the reminder email copy (UI-polish leftover)»
**Origin:** UI-polish batch (2026-07-07) review Minor T1 left undone: "reminder apostrophe strings unasserted".

## Problem

French user-facing copy must use the typographic apostrophe (’ U+2019), never the
ASCII quote ('). Past subagent work has regressed accents/apostrophes (see
`feedback_french_transcription_pitfalls`). The reminder email copy is produced in
three places, and only fragments of it are covered by apostrophe assertions today:

1. **`supabase/functions/send-reminders/index.ts`** — the daily cron email
   (subject, body, footer). Copy builders (`buildEmail`, `dossierRef`, subject
   construction) are **module-private** and the file cannot be imported under
   vitest (`Deno.serve`, `npm:` import specifier, top-level `Deno.env.get`).
   Zero copy tests exist for it.
2. **`lib/email.ts`** — French email senders: `sendStudentReminderEmail`
   (manual «Relancer» per student), `sendTemplateReminderEmail` (per template),
   `sendPhase2ChecklistEmail`, `sendInvitationEmail`, `sendOrganizerInviteEmail`,
   plus the French footers (`STUDENT_FOOTER`, `APP_FOOTER_FR`,
   `ORGANIZER_FOOTER`). Existing test
   `lib/__tests__/student-reminder-email.test.ts` asserts escaping/content but
   never apostrophes.
3. **`lib/landing/content.ts`** — the landing page's mock reminder email
   (`how.reminder` block, added by UI-polish T1). The existing test
   `lib/landing/__tests__/content.test.ts` asserts a ’ in exactly one string
   (`fr.features.title`); the reminder block — the actual T1 leftover — is
   unasserted.

**Audit result (2026-07-13):** no existing ASCII-apostrophe bug in any French
copy. `grep -nP "[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]"` over `send-reminders/index.ts` and
`lib/email.ts` hits only English copy ("You're receiving…", "it's", "we're" —
legitimate); a recursive scan of `landingContent.fr` string values is clean.
So this item is **tests + a behavior-neutral testability extraction only**; no
product copy changes.

## Approach

Two-layer guard, per surface:

- **Generic negative guard** — rendered output must not match
  `/\p{L}'\p{L}/u` (ASCII apostrophe between two letters). Resilient to future
  copy edits: any new French sentence typed with `'` fails, but markup,
  attributes, and `esc()`-encoded user input (`'` → `&#39;`) never
  false-positive.
- **A few positive assertions** — known stable strings must contain ’
  (e.g. footer `d’échange`, phase-2 `c’est parti`) so the guard is proven live
  (a regression that deleted the copy along with the apostrophe would still be
  caught, and the regex itself is exercised against real ’ content).

Guard fixtures use apostrophe-free input values (student/exchange/form names):
subjects interpolate the exchange name **unescaped**, so an apostrophe in a
fixture would false-positive the subject guard. Escaping behavior stays covered
by the existing escaping tests (and one carried into the new edge-fn test).

### 1. Edge function: extract copy builders into a pure module

Follow the repo's established pattern (`filter.ts`, `pacing.ts`, `fair-share.ts`
were all extracted from `index.ts` precisely for vitest testability).

**New `supabase/functions/send-reminders/email-copy.ts`** (pure — no Deno
globals, no imports):

```ts
export type ReminderForm = { name: string; deadline: string; overdue: boolean }
export function buildSubject(exchangeNames: string[], anyOverdue: boolean): string
export function buildEmail(studentName: string, exchangeNames: string[], forms: ReminderForm[], appUrl: string): string
```

Move — byte-identical, this is a move not a rewrite — `esc`, `frDateFormat`/
`frShortDate`, `dossierRef`, `ReminderForm`, and the `buildEmail` body from
`index.ts` into it. `esc`, `frShortDate`, and `dossierRef` stay module-private
(nothing else needs them; tests reach both `dossierRef` branches through
`buildEmail`/`buildSubject`). Two signature adaptations, both mechanical:

- `buildEmail` gains an `appUrl` parameter replacing the module-level `APP_URL`
  env constant (the one Deno dependency in the moved code).
- `buildSubject` absorbs the two inline subject lines from the serve loop:
  `anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`` with
  `ref = dossierRef(exchangeNames, false)`.

**`index.ts`** then imports `{ buildSubject, buildEmail, type ReminderForm }
from './email-copy.ts'` (Deno needs the extension), deletes the moved code, and
in the loop calls `buildSubject([...exchangeNames], anyOverdue)` and
`buildEmail(name, [...exchangeNames], forms, APP_URL)`. No behavior change:
identical HTML and subjects for identical inputs.

**New `supabase/functions/send-reminders/email-copy.test.ts`** (vitest picks up
`supabase/functions/**/*.test.ts` already; import `./email-copy` extensionless
like `filter.test.ts` does). Assertions:

- Single exchange: subject `Rappel : ton dossier pour Espagne 2026`; body
  contains `ton dossier pour <strong>Espagne 2026</strong>`.
- Multi-exchange: subject/body fall back to `ton dossier d’échange`
  (positive ’ assertion).
- Overdue: subject starts `Action requise :`; body contains
  `en retard — échéance`.
- Footer contains `ton dossier d’échange scolaire` (positive ’).
- Deadline rendering: `2026-10-10` → contains `10 oct` (frShortDate; assert
  without the trailing period, matching the existing lib test's tolerance).
- Link uses the passed `appUrl` + `/my-forms`.
- Escaping preserved: `<Yanis>` renders as `&lt;Yanis&gt;`, never raw.
- Apostrophe guard: for a matrix of rendered outputs (1 form / 2 forms ×
  overdue / not × 1 exchange / 2 exchanges — subject AND body),
  `expect(out).not.toMatch(/\p{L}'\p{L}/u)`.

### 2. `lib/email.ts` French senders: new copy-focused test file

**New `lib/__tests__/email-french-copy.test.ts`**, same Resend mock pattern as
`lib/__tests__/student-reminder-email.test.ts` (mock `resend`, capture
`{ subject, html }`, set `RESEND_API_KEY`). For each of
`sendStudentReminderEmail`, `sendTemplateReminderEmail`,
`sendPhase2ChecklistEmail`, `sendInvitationEmail`, `sendOrganizerInviteEmail`
(apostrophe-free fixtures):

- Generic guard on both `subject` and `html`:
  `not.toMatch(/\p{L}'\p{L}/u)`.
- Positive ’ assertions on stable strings:
  - student reminder + template reminder html: `d’échange` (STUDENT_FOOTER);
  - phase-2 subject: `c’est parti` and html: `qu’il reste`;
  - invitation html: `l’invitation` (button label).

The existing `student-reminder-email.test.ts` is left untouched (it covers
escaping/content; the new file owns typography).

### 3. Landing mock reminder (the original T1 leftover)

Extend `lib/landing/__tests__/content.test.ts`: replace the single-string
apostrophe test with a recursive walk of **all** `landingContent.fr` string
values asserting `not.toMatch(/\p{L}'\p{L}/u)`, keeping the existing positive
`fr.features.title` `toContain('’')`. This locks `fr.how.reminder.*` (and every
other fr string) in ~10 lines. The `en` tree is not scanned (English ASCII
apostrophes would be legitimate, though en currently uses ’ too).

## Files

**Files:**
- `supabase/functions/send-reminders/email-copy.ts` — new; pure copy-builder module extracted verbatim from `index.ts`.
- `supabase/functions/send-reminders/index.ts` — remove moved code; import from `./email-copy.ts`; call `buildSubject`/`buildEmail(..., APP_URL)`.
- `supabase/functions/send-reminders/email-copy.test.ts` — new; copy + apostrophe tests for the cron email.
- `lib/__tests__/email-french-copy.test.ts` — new; apostrophe guard + positives for the French senders in `lib/email.ts`.
- `lib/landing/__tests__/content.test.ts` — extend fr apostrophe test to a recursive fr-tree guard.

No product copy changes. No migration, no RLS, no env vars, no new routes —
`pnpm test:rls` not triggered.

## Verification

`pnpm lint`, `pnpm test`, `pnpm build` (locally `npx tsc --noEmit` substitutes
for build's type pass if placeholder env blocks `pnpm build`). Note
`tsconfig.json` excludes `supabase/functions` — the new edge-fn module is not
tsc-checked (vitest only transpiles it), same as `filter.ts`/`pacing.ts`; its
tests are the check.

Extraction must be verifiably behavior-neutral: the implementer should diff the
moved template literals against the originals (byte-identical apart from the
`appUrl` parameter substitution).

## Decisions made for you

1. **Test the edge-fn copy via extraction into a pure module, not a
   source-scan test.** Alternatives: (a) a test that reads `index.ts` source
   and regex-scans it — rejected: comments and English text false-positive,
   and string-literal parsing by regex is fragile; (b) leave the cron email
   untested — rejected: it is *the* reminder email the backlog item names.
   Extraction follows the explicit repo precedent (`filter.ts` was extracted
   from this same file for testability, commit 4cb41fc).
2. **Guard style: generic negative regex `/\p{L}'\p{L}/u` on rendered output,
   plus a few positive ’ assertions — not full-string snapshots.** Snapshots
   would break on every legitimate copy edit; the negative guard survives
   rewording while catching any ASCII-apostrophe regression; the positives
   keep the guard honest. Mirrors the existing repo pattern
   (`lib/student/__tests__/dossier.test.ts` uses `not.toMatch(/'/)`; the
   letter-adjacent variant is needed here because HTML output could
   legitimately contain `'` in markup contexts).
3. **Scope: all French-language emails in `lib/email.ts`, not only the
   reminder family.** The guard is one shared helper; covering
   `sendInvitationEmail`/`sendOrganizerInviteEmail` costs ~10 lines and closes
   the same regression class. English-copy senders are excluded (ASCII `'` is
   correct there).
4. **Landing `how.reminder` included via a whole-fr-tree recursive guard.**
   The memory/plan trail shows UI-polish leftover "T1 reminder apostrophe
   strings unasserted" referred to the landing mock reminder, while the
   backlog one-liner says "reminder email copy" — covering both readings is
   cheap and unambiguous. Whole-tree beats block-specific: verified clean
   today, and it prevents the next fr copy edit anywhere on the landing page
   from regressing.
5. **No copy fix specced.** The audit found zero ASCII-apostrophe bugs in
   French copy (grep evidence in Problem section), so the brief's
   "minimal fix" branch does not apply.
6. **`sendRejectionEmail` (submission rejection) is currently English copy**
   ("Hi… Your submission… needs some changes"), unlike the rest of the
   student-facing product which is French. Not an apostrophe bug, and
   translating it is a product copy change — out of scope here. **Flag:**
   candidate backlog item «translate sendRejectionEmail (submission rejection)
   to French like the other student emails».
7. **Exports kept minimal** (`buildSubject`, `buildEmail`, `ReminderForm`);
   `esc`/`frShortDate`/`dossierRef` stay private to `email-copy.ts` — both
   `dossierRef` branches are reachable through the exported builders.
8. **Fixtures must not contain apostrophes** (subjects interpolate names
   unescaped; an apostrophe-bearing fixture would false-positive the guard).
   Escaping coverage remains separate.
9. **Merge-time note:** the `index.ts` refactor is behavior-neutral but leaves
   the deployed edge function older than the repo until the next manual
   `supabase functions deploy send-reminders`. No urgency — identical
   behavior — but the PR should list the redeploy as an optional merge-time
   step so drift doesn't surprise a future debugging session.

## Out of scope

- Translating `sendRejectionEmail` or the other English application emails
  (resume, confirmation, application-rejection) — see decision 6.
- Non-breaking-space / other French typography rules (only apostrophes are in
  the backlog item).
- Scanning `landingContent.en` or React component JSX copy.
