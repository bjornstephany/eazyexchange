# Email polish — button theming, single response CTA, and the never-send-a-blank guard

**Date:** 2026-07-25
**Branch:** `feature/email-polish`
**Status:** approved, ready to implement

## Problem

Six unrelated-looking defects in the transactional email layer share one root: the
emails were written before the 2026-07 redesign and have never been audited as a
set.

1. The student application invitation's « Start my application » button is the
   pre-redesign green `#1F7A57`, not the brand blue.
2. The same email claims « It only takes a few minutes », which the two-step
   application no longer honours.
3. The organizer new-application alert's « Review applications » button is the
   same off-theme green.
4. **The « Bonne nouvelle » acceptance email goes out to families with literal
   `[à compléter]` in it.** Nothing checks the template before it is sent.
5. « Bonne nouvelle » offers three response buttons (oui / non / peut-être) that
   all land on the same page, which then asks the same question again.
6. The invite confirmation page tells parents their child will receive a link to
   « set up their access », which does not name anything the child recognizes.

Defect 4 is the only one with a blast radius beyond cosmetics: it is a real
message, to a real family, announcing their child's place on an exchange, with a
placeholder where the price and the deadline should be.

## What already exists

The onboarding overhaul (merged `c32255c`,
`docs/superpowers/specs/2026-07-24-onboarding-overhaul-design.md` §6) shipped the
storage and a pure helper for the guard, deliberately leaving the guard itself to
this branch:

- Three columns on `exchange_program_details` — `participation_cost` (text),
  `payment_details` (text), `confirmation_deadline` (date) — edited by the
  organizer in Réglages → Programme (`ProgramDetailsCard`). Travel dates were
  already there as `travel_start` / `travel_end`.
- `lib/exchange/good-news-fields.ts` — `GoodNewsValues`, `GoodNewsField`,
  `GOOD_NEWS_FIELD_ORDER`, `GOOD_NEWS_FIELD_LABELS`, `missingGoodNewsFields()`.
  Pure, unit-tested, and **currently imported by nothing but its own test.**

So no migration is needed. This branch consumes what is already stored.

## Non-goals

- No change to in-app button colours. The four off-theme greens fixed here are
  all in `lib/email.ts`; the one remaining `#1F7A57` in the app
  (`InviteResponseForm.tsx`, the « Oui, nous confirmons » button) came from the
  design handoff and stays until a designer says otherwise.
- No change to the email layout chrome — the dark-green body text `#1F3A30`,
  the `#E7F1EC` rule, the `#5C7268` footer. They read as neutral, not as brand
  colour, and recolouring them is a redesign, not an audit.
- No new migration, no RLS policy change.

## Design

### A. Button colours (defects 1, 3 + the audit)

The brand is `#2456E6` (`tailwind.config.ts:70`). An audit of every anchor-as-
button in the email layer finds exactly four survivors on the pre-redesign green
`#1F7A57`, all in `lib/email.ts`:

| Line | Email | Button |
|---|---|---|
| 105 | `sendRejectionEmail` | Update your submission |
| 125 | `sendApplicationResumeEmail` | Continue my application |
| 135 | `sendApplicationInviteEmail` | Start my application (defect 1) |
| 153 | `sendNewApplicationAlertEmail` | Review applications (defect 3) |

All four become `#2456E6`. Everything else in `lib/email.ts` and the
`send-reminders` edge function (`supabase/functions/send-reminders/email-copy.ts`)
is already brand blue.

Bjorn spotted two; the audit found two more. Fixing only the reported pair would
leave the rejection and resume emails as the odd ones out.

### B. Copy (defects 2, 6)

**Defect 2** — `lib/email.ts:134` drops « It only takes a few minutes — », keeping
« You can save and finish later on any device. »

**Defect 6** — « access » → « account », in all five locales, in three places:

- `apply.invite.resultYes` — the confirmation shown after a parent clicks yes.
- `apply.invite.alreadyConfirmedBody` — the same sentence on the same page when
  the other parent already confirmed. Changing one and not the other would leave
  the two halves of one page disagreeing.
- `sendStudentSetupEmail`'s button, « Créer mon accès » → « Créer mon compte »
  (`lib/email.ts:217`), so the email the child actually receives matches the
  promise the parent was given.

`components/__tests__/InviteResponseForm.test.tsx:25` asserts on the old French
string and moves with it.

### C. One response button (defect 5)

`sendGoodNewsEmail` currently renders three stacked buttons — `?r=yes`, `?r=no`,
`?r=maybe` — pointing at `/invite/<token>`, a page that presents all three
choices itself. The three buttons are removed in favour of a single brand-blue
button to `respondUrl` with no query string.

`GOOD_NEWS_BUTTONS` collapses from `{ yes, no, maybe }` to one label per
language: fr « Répondre à l'invitation », en « Respond to the invitation ». It
stays a system-controlled constant outside the organizer-editable body, for the
same reason as before: an organizer must not be able to break the response link.

**The `?r=` preselect handling in `app/invite/[token]/page.tsx` stays.** Every
acceptance email already delivered carries `?r=` links, and those inboxes do not
get rewritten. The parameter simply stops being generated.

`GoodNewsCard`'s preview swatch (`components/communication/GoodNewsCard.tsx:145-149`)
shows the same three buttons and becomes the same single blue one, or the
authoring preview lies about what gets sent.

### D. The guard (defect 4)

Three decisions, taken with Bjorn:

1. **Hard block.** A blocked accept writes nothing: the application stays
   `submitted`, no invite token is minted, no email is sent, no audit row, no
   communication event. There is no half-state to clean up and no family left
   accepted-but-unnotified.
2. **The template consumes the stored values**, rather than the organizer typing
   dates into Réglages and again into the template.
3. **The check runs on the rendered text**, not on the database row.

#### D.1 Tokens

`DEFAULT_GOOD_NEWS_BODY` in `lib/good-news-template.ts` replaces its four
placeholder lines with tokens:

```
• Dates du séjour : {{travel_dates}}
• Participation aux frais : {{participation_cost}}
• Adhésion / paiement : {{payment_details}}
• Passeport : vérifiez que celui de votre enfant est valide au-delà de la date de retour.
• Date limite de confirmation : {{confirmation_deadline}}
```

`renderGoodNews` gains an optional `details: GoodNewsValues | null`. Dates render
through `frShortDate`; `travel_dates` renders as a period (« du 12 avril 2027 au
26 avril 2027 ») and is treated as one value, matching `missingGoodNewsFields`,
which already counts a half-filled period as missing.

**A blank value leaves its token unsubstituted.** That is the mechanism the whole
guard rests on: nothing else needs to know which fields were empty, because the
evidence is in the output.

#### D.2 The check

A new pure export in `lib/good-news-template.ts`:

```ts
export function hasUnfilledPlaceholders(text: string): boolean
```

matching `/\{\{[^}]*\}\}|\[[^\]\n]{2,}\]/`. Two alternatives, two jobs: the
mustache branch catches a token whose value is missing; the bracket branch
catches an organizer who abandoned the tokens and typed their own `[à préciser]`
— which a database-only check would wave straight through.

Running on the rendered text rather than on `missingGoodNewsFields()` alone also
removes the false block that a database-only check would create: an organizer who
deleted the tokens and typed « du 12 au 26 avril » by hand sends fine, even
though all three columns are empty. The columns are one way to fill the email,
not the only way.

`missingGoodNewsFields()` is still used — but only to *explain* a block, never to
cause one.

**Accepted risk:** the bracket branch will refuse a body containing legitimate
bracketed prose. Judged acceptable because §D.4 surfaces the identical warning
live in the template editor, so an organizer sees it while typing rather than
discovering it against a candidate they were trying to accept. The alternative —
matching only the exact strings we ship — silently permits every hand-typed
placeholder, which is the actual reported defect.

#### D.3 Where it blocks

In `reviewApplications` (`actions/applications-review.ts`), which already hoists
one exchange read out of the per-application loop. One pre-flight per exchange,
before the loop:

- Extend the batch with one read of `exchange_program_details` for the batch's
  exchange ids.
- Per exchange, substitute the detail tokens into the stored subject + body and
  run `hasUnfilledPlaceholders`. Student and exchange names are **excluded from
  the scan** — a name is not a placeholder, and no name should be able to trigger
  or suppress the guard.
- Every accept for a blocked exchange returns blocked without touching the row.

Rejects are unaffected: they do not send this email.

Signatures become structured returns, because production replaces thrown server
action messages with an opaque digest and the organizer needs to be told which
fields are missing:

```ts
export type AcceptBlock = { missing: GoodNewsField[]; literal: boolean }

acceptApplication(id, opts?):  Promise<{ ok: true } | { ok: false; blocked: AcceptBlock }>
acceptApplications(ids):       Promise<{ succeeded: number; failed: number; blocked: AcceptBlock | null }>
```

`literal` distinguishes « you have not filled Réglages » from « your template has
hand-typed placeholders », which need different remedies and different links.
Genuine failures (not found, unauthorized, archived) keep throwing — they are
unexpected, and the existing `{ ok: false; error }` outcome path is unchanged.

A bulk accept of 30 candidates in a blocked exchange fails as one message, not as
30 individual failures.

#### D.4 Surfaces

- **`ApplicationReviewActions`** — on a blocked result, a persistent warning
  panel naming the missing values and linking to `/settings`.
- **`CandidaturesView`** — the same message for the bulk path.
- **`GoodNewsCard`** — the same warning **live in the editor**, above the
  preview, computed from the body being typed and the `programDetails` the
  settings page already loads and passes to `SettingsView`. This is what makes a
  hard block humane: the organizer is told at authoring time, not at accept time.

Field names in the UI go through new i18n keys
(`organizer.applications.review.goodNewsFields.*`) in all five locales. The
French-only `GOOD_NEWS_FIELD_LABELS` stays as-is for non-localized use — the
organizer UI is translated, and hard-coding French into it would regress the
i18n work.

## Testing

- **Pure** — `renderGoodNews` with complete / partial / null details; date
  formatting; `hasUnfilledPlaceholders` across the default body, a
  fully-substituted body, a hand-typed `[à préciser]`, and prose that must NOT
  trip it.
- **Action** — a blocked accept leaves `status = 'submitted'`, mints no invite
  token, sends no email and writes no audit row; an unblocked accept still does
  all four; a bulk accept reports the block once.
- **Component** — the blocked panel in `ApplicationReviewActions` and
  `CandidaturesView`; the live warning in `GoodNewsCard`.
- **Snapshot-ish** — the existing email tests assert on button colour and copy;
  they move with the change.

No RLS matrix cases: no new table, bucket, or policy. `pnpm test:rls` is still
run because `actions/applications-review.ts` changes shape.

## Files

| File | Change |
|---|---|
| `lib/email.ts` | 4 button colours; drop « a few minutes »; single good-news button; « Créer mon compte » |
| `lib/good-news-template.ts` | tokens in the default body; `details` param; `hasUnfilledPlaceholders` |
| `actions/applications-review.ts` | details read, per-exchange pre-flight, structured accept returns |
| `components/ApplicationReviewActions.tsx` | blocked panel |
| `components/applications/CandidaturesView.tsx` | blocked message on bulk accept |
| `components/communication/GoodNewsCard.tsx` | live warning; single preview button |
| `components/settings/SettingsView.tsx` | pass `programDetails` to `GoodNewsCard` |
| `messages/{en,fr,de,es,it}.json` | « account » copy ×2; new `goodNewsFields.*` + block messages |
| tests | as above |
