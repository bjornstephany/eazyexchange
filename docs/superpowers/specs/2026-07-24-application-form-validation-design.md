# Application form: `french_class` rename + real email/phone validation

**Date:** 2026-07-24
**Branch:** `fix/application-form-validation`

## Problem

Two unrelated defects in the anonymous application funnel, fixed together because
they touch the same three files.

### 1. Nobody understands « Classe de français 26-27 »

The field id is `french_class` (`lib/application-form.ts:46`), required, rendered
in all five locales as some translation of "French class in 26-27".

It is a verbatim transcription from the sample the whole funnel was modeled on:
`docs/exampleSchoolFiles/Application.pdf`, the *AGESSIA Edina 2026-27 exchange
application*. Edina is a high school in Minnesota. On a US application, "French
class in 26-27" asks **which level of French-language course the American student
will be taking** (French 3, French 4, AP French) — the language-level signal a US
organizer matches students on.

Transcribed into EazyExchange, where the applicant is a French student, "your
French class" is meaningless. Two pieces of evidence that the field is already
broken in practice:

- The students directory never displays it under its own label. It renders as
  « Classe » (`lib/students/directory.ts:157`), and the test fixtures use
  `'1re G2'` — the codebase has already silently reinterpreted the field as
  "which class/section is the student in".
- The single application row in production reads
  `grade: "Terminal", french_class: "io"`. Someone typed two junk letters to get
  past a required field they could not answer.

`grade`'s label hardcodes the year too (« Niveau 26-27 »), in five locales, in
the applications table header, and in the students directory. It goes stale in
twelve months.

### 2. There is no format validation on the application form

`ApplicationForm.onSubmit` is a plain button handler, not a form submit. The
`type="email"` / `type="tel"` attributes at `ApplicationForm.tsx:152` therefore
never trigger native validation — they only select the mobile keyboard. The only
check any field gets is non-empty (`missingRequiredApplication`).

The three email fields inside `data` (`email`, `father_email`, `mother_email`)
are never validated at entry. They are filtered at *send* time by a duplicate
regex, `looksLikeEmail` (`lib/application-form.ts:204`), which is a copy of
`isValidEmail` from `lib/validation.ts`.

Consequence: a parent typing `marie@gmial` submits cleanly, passes
`looksLikeEmail`, and the acceptance email goes nowhere. Per the email-log
runbook, **one bad recipient fails the entire Resend send** — so one typo can
black-hole the good-news email for the other parent too.

## Decisions

| Question | Decision |
|---|---|
| `french_class` | Repurpose as the student's class/section — what the app already displays it as |
| Field id | Rename `french_class` → `class_group` |
| Hardcoded `26-27` | Drop the year from `grade` and `class_group` everywhere |
| Phone strictness | Permissive + normalize (8–15 digits, optional `+`), no new dependency |
| Email strictness | Tighten the existing shared regex, apply it to the application fields |
| Shared helper | Extend `lib/validation.ts` in place — do not create a new module |

## Design

### Labels

| locale | `grade` | `class_group` |
|---|---|---|
| fr | Niveau | Classe |
| en | Grade | Class group |
| es | Curso | Clase |
| it | Livello | Classe |
| de | Klassenstufe | Klasse |

No parenthetical example: next to « Niveau », the bare word « Classe » is
unambiguous to a French student in a way the old label never was.

The year is dropped in all four places it appears:

- `apply.fields.grade.label` and `apply.fields.class_group.label` (5 locales)
- `applications.tableHeader.level` (`messages/*.json:453`, 5 locales)
- the hardcoded `'Niveau 26-27'` at `lib/students/directory.ts:156`

`lib/students/directory.ts:157` and `:168` read `data.class_group`.

That identity block uses hardcoded French labels while the rest of the same
function uses `t()`. Pre-existing inconsistency; **not** fixed here.

**No data migration.** The one production row holds `french_class: "io"`; after
the rename it renders `—`. Not worth a migration for one junk value.

### Validators — `lib/validation.ts`

Two new exports:

```ts
export function normalizePhone(raw: string): string   // strips space . - / ( ) and NBSP only
export function isValidPhone(raw: string): boolean    // /^\+?\d{8,15}$/ on the normalized value
```

Stripping *only separators* — never all non-digits — is what makes
`06AB123456` and `call me on 0612345678` fail while `+1 (612) 555-0143` passes.
**Values are stored exactly as typed**; normalization exists for the check only.

Accepts: `06 12 34 56 78`, `06.12.34.56.78`, `0612345678`, `06-12-34-56-78`,
`+33 6 12 34 56 78`, `+33612345678`, `0033 6 12 34 56 78`, `+49 151 23456789`,
`+1 (612) 555-0143`.

Rejects: `io`, `n/a`, `0612` (4 digits), a 16-digit number, `06AB123456`.

`isValidEmail` is rewritten from its one-line regex into an explicit check:
exactly one `@`, no whitespace anywhere, non-empty local part with no leading,
trailing or doubled dot, 2+ domain labels with none empty or hyphen-edged, TLD
2+ letters.

The local part stays byte-permissive. An ASCII allowlist would reject
`josé@gmail.com`, which is legal and does occur in France — that would be a
regression, not a tightening.

Newly rejected (accepted today): `jean@gmail.`, `jean@gmail.c`,
`jean..dup@gmail.com`, `.jean@gmail.com`, `jean@.gmail.com`.
Still accepted: `jean.dupont@gmail.com`, `marie+ex@lycee-victor-hugo.fr`,
`a@b.co`, `josé@gmail.com`.

Not caught, deliberately: `jean@gmial.com`. Typo detection against a table of
common French domains was considered and dropped — it warns rather than blocks,
so it is a separate feature, not validation.

> **Blast radius.** `isValidEmail` has five existing callers: `app/(auth)/signup/page.tsx`,
> `lib/team/invite.ts`, `lib/invite-emails.ts`, `components/shell/NewExchangeModal.tsx`,
> `actions/apply.ts`. The tightening reaches all of them. It only ever rejects
> *more* malformed input, so this is intended — but a parallel session is
> building an email-paste box on `lib/invite-emails.ts` and needs to know the
> semantics moved under it.

### Application wiring — `lib/application-form.ts`

One new pure function:

```ts
export function invalidFormatApplicationFields(data: Record<string, string>): string[]
```

Returns the ids of **non-empty** `email` / `tel` fields whose value fails its
validator. Non-empty only, for two reasons: emptiness is
`missingRequiredApplication`'s job, and the optional parent group must not light
up red when left blank.

`looksLikeEmail` is deleted; `parentRecipients` imports `isValidEmail`.

### Where it runs

- **Client** — `ApplicationForm.onSubmit` folds the result into the existing
  `flagged` list, reusing the red border and scroll-to-first-offender that
  already work for missing/overlong fields. New message key `apply.form.badFormat`
  (5 locales).
- **Server** — `submitApplication` returns a structured
  `{ ok: false, invalidFormat: string[] }`. Not a throw: production redacts
  thrown Server Action messages, and this is an expected outcome.
- **`saveApplicationDraft` does not validate.** Drafts are partial by design;
  validating them would break autosave.

## Testing

- `lib/__tests__/validation.test.ts` — the full accept/reject tables above for
  both `isValidPhone` and the tightened `isValidEmail`.
- `lib/__tests__/application-form.test.ts` — `invalidFormatApplicationFields`
  flags bad values, ignores empty optional parent fields, ignores fields that
  are neither `email` nor `tel`.
- `lib/__tests__/application-form.labels.test.ts` and
  `messages/__tests__/parity.test.ts` — catch any locale missed by the rename.
- `components/__tests__/ApplicationForm.test.tsx` — submitting with a malformed
  phone stays on the form and flags the field.
- `lib/students/__tests__/directory.test.ts`,
  `components/students/__tests__/StudentsView.test.tsx` — fixtures move to
  `class_group` and « Niveau ».

No migration, no RLS policy change, no storage change — `pnpm test:rls` is not
required for this branch.

## Out of scope

- Typo detection on common email domains (`gmial` → `gmail`).
- `libphonenumber-js` subscriber-level phone validation. It needs a country hint
  the funnel does not collect (`nationality` is free text), so it would default
  to FR and false-reject legitimate foreign numbers on a form whose applicants
  are by definition international.
- Deriving the school year from the exchange dates. The directory has no
  exchange in scope at that point; real work for a cosmetic gain.
- Internationalizing the hardcoded French labels in
  `lib/students/directory.ts`'s identity block.
