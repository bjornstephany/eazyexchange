# i18n consistency sweep — design

**Branch:** `fix/i18n-consistency` (worktree, off `main` @ `4a04484`)
**Date:** 2026-07-25
**Status:** design approved in-session; awaiting spec review

## Why

A date rendered as « le jeudi 19 octobre 2026 » inside an otherwise non-French
UI — two languages in one string. A full sweep of date/number/currency
formatting and single-language literals found that this was one instance of
three separate defect classes, plus a set of catalogue-hygiene gaps the parity
test does not cover.

The sweep's full findings, including the parts deliberately left out of this
branch, are recorded in **Appendix A** so a later session does not have to
re-derive them.

## Scope

In: §1 mixed-language hints, §2 locale-blind date formatting, §3 catalogue
hygiene, plus one strike-able addition (§4).

Deferred, by decision: the auth/onboarding surfaces, server-action result
messages, the root-layout `lang`/metadata problem, and all of Phase 4
(emails + `send-reminders`). See Appendix A.

---

## §1 — Hints that mix two languages

`messages/*.json` → `organizer.settings.programDetails.*Hint`. Three keys carry
a French example inside an otherwise translated sentence:

| key | example held in all 5 locales |
|---|---|
| `destinationHint` | « le Minnesota, USA » |
| `absenceDatesHint` | « le jeudi 19 octobre 2026 » |
| `paymentDetailsHint` | « chèque à l'ordre de l'association » |

**The French example is correct and stays.** Each of these three values is
copied *verbatim* into a French artefact:

- `destination` and `absence_dates` → `lib/forms/fillable/render.ts`, which
  builds French legal text (« … se rendra dans le Minnesota, USA »). The
  article is load-bearing.
- `payment_details` → `{{payment_details}}` in `lib/good-news-template.ts`,
  substituted into the French « Bonne nouvelle » email.

A German organizer who types German there produces a broken French document.
So the fix is not to translate the example — it is to **say why it is French**.

### Change

For `en`, `es`, `it`, `de` only, rewrite the hint to name the constraint. `fr`
is left untouched: telling a French organizer to write in French is noise.

```
en: One day per line, written in French — it is copied word-for-word into the
    French absence form. E.g. “le jeudi 19 octobre 2026”.
de: Ein Tag pro Zeile, auf Französisch — der Text wird unverändert in das
    französische Formular übernommen. Z. B. „le jeudi 19 octobre 2026“.
```

…and the equivalent for `es`/`it`, and for the other two keys (the French
document is the absence form, the exchange forms, and the acceptance email
respectively).

### Quote characters

Rewriting these six values also removes the only stray guillemets in `en` and
`de`. Target convention per locale, applied here and enforced in §3:

| locale | convention |
|---|---|
| en | `“ ”` |
| fr | `« … »` (with inner spaces) |
| es, it | `« … »` (no inner spaces — matches their existing usage) |
| de | `„ “` |

**French transcription note:** `fr` is not being edited in §1, so no French
transcription is required for this section. The `es`/`it`/`de` rewrites are.

---

## §2 — Date formatting hardcoded to `fr-FR` on localized surfaces

`lib/dates.ts` exports `frShortDate` and `fullDate`, both pinned to `fr-FR`.
Six organizer components and one pure helper feed off them, every one of which
renders inside a localized shell. Two further student-facing sites bypass the
helpers and call `toLocaleDateString('fr-FR')` inline. Ten call sites in total,
plus six in the French emails.

### API change

```ts
// lib/dates.ts
export function shortDate(iso: string | null, locale: Locale, opts?: { year?: boolean }): string
export function longDate(iso: string | null, locale: Locale): string
```

- Both take an explicit `Locale` — **no default**. A default would let a new
  call site silently reintroduce exactly this bug; email call sites pass
  `'fr'` literally, which is honest about why they are French.
- BCP-47 mapping: `en → 'en-GB'` (day-month order, matching the rest of the
  product and `lib/pdf/application-recap.tsx:91`); every other locale uses its
  bare tag.
- **The trailing-period strip becomes `fr`-only.** It exists because `fr-FR`
  renders « 18 sept. » and the design wants « 18 sept »; German conventionally
  keeps the period on an abbreviated month, so stripping it there would be a
  new defect.
- The old names are removed outright, along with the `frShortDate` re-export in
  `lib/dashboard/rollup.ts:17`. Consumers import from `@/lib/dates` directly.

### Call sites

| file | source of locale |
|---|---|
| `components/dashboard/OverviewView.tsx` (×3) | `useLocale()` — client |
| `components/applications/InvitationPanel.tsx` | `useLocale()` — client |
| `components/applications/CandidaturesView.tsx` | `useLocale()` — client |
| `components/dashboard/StudentDrawer.tsx` | `useLocale()` — client |
| `components/documents/DocDrawer.tsx` | `useLocale()` — client |
| `components/settings/ProgramCard.tsx` | `useLocale()` — client |
| `components/student/DossierView.tsx` | `getLocale()` — server; replaces an inline `toLocaleDateString('fr-FR')` |
| `app/(student)/my-forms/[assignmentId]/page.tsx` | `getLocale()` — server; replaces an inline `toLocaleDateString('fr-FR')` |
| `lib/students/directory.ts` | pure helper; already takes a translator — gains a `locale` parameter alongside it |
| `lib/email.ts` (×3), `lib/good-news-template.ts` (×3) | literal `'fr'` — French emails, Phase 4 |

### Deliberately left on `fr-FR` (French legal artefacts, not UI chrome)

`lib/forms/fillable/render.ts`, `lib/pdf/fillable-pdf.tsx`,
`components/FillableForm.tsx` (`SIGNED_AT`), `components/legal/LegalDocumentView.tsx`.
These render French documents whose dates must be French regardless of who is
looking at them. Each gets a one-line comment saying so, so the next sweep does
not "fix" them.

### Already correct — no change

`components/communication/HistoryCard.tsx`, `components/communication/InfoCardRow.tsx`,
`lib/pdf/application-recap.tsx` all format against the active locale today.

---

## §3 — Catalogue hygiene

`messages/__tests__/parity.test.ts` already enforces identical key sets,
matching ICU argument sets, and no empty values across all five locales, and it
passes. **There are no missing keys.** What it does not catch:

1. **4 stale keys × 5 locales = 20 dead entries.** Zero references anywhere in
   `app/`, `components/`, `lib/`, `actions/`:
   - `organizer.dashboard.progressDossiers`
   - `organizer.dashboard.progressCandidatures`
   - `organizer.forms.pills.missingCount`
   - `organizer.forms.pills.toVerifyCount`

   Delete from all five catalogues.

2. **Dead code:** `p()` in `lib/dashboard/rollup.ts:36` — an exported French
   pluralization helper (`n > 1 ? 's' : ''`) with no importers. Delete. ICU
   `plural` in the catalogues is the real mechanism.

3. **14 ASCII apostrophes in `messages/fr.json`** — « Vue d'ensemble », « Profil
   de l'élève », « Trop d'adresses… » and 11 others. The repo has apostrophe
   guards for landing content, fillable definitions, dossier sublines,
   `lib/email.ts` and the reminder edge function — but **none for the message
   catalogues**, which is why these accumulated. Fix all 14.

4. **3 ASCII apostrophes in `lib/good-news-template.ts`** `DEFAULT_TEMPLATE`
   (« l'échange », « d'indiquer », « l'aide ») — French copy in a real
   outbound email, covered by no guard. Fix. Only affects schools that have not
   customized their template; customized rows in the DB are untouched.

### New guards, in `messages/__tests__/parity.test.ts`

- **`fr` contains no ASCII apostrophe between two letters** (`/\p{L}'\p{L}/u`),
  matching the regex the five existing guards already use.
- **Quote-character convention per locale**: `en` and `de` contain no `«`/`»`;
  `fr`, `es`, `it` contain no `„`. Deterministic, and it is the tell that
  catches a French fragment pasted into a non-French value — the shape of the
  original bug.

No stale-key guard: detecting an unused key requires scanning source for
dynamically-composed key paths, which produces false failures. Handled instead
by the audit script below.

### `scripts/i18n-audit.mjs`

The throwaway script that found everything here, committed as a maintenance
tool: stale keys, values identical to `en`, quote-character usage per locale,
and ASCII apostrophes in `fr`. Advisory output, not wired into `pnpm test` —
run it when touching copy. *Strike this if you would rather not carry another
script.*

---

## §4 — Recommended addition (strike at review)

`components/billing/PaymentWarningBanner.tsx` is **hardcoded English** —
"Your last payment failed — update your card to keep your plan. / Update
payment" — and renders across the top of the organizer shell in all five
locales (`app/(organizer)/layout.tsx:84`).

`organizer.billing.grace.body` and `organizer.billing.grace.cta` already exist,
translated, in all five catalogues. The fix is a swap with **zero
transcription**. It is the same defect class as §1 (wrong-language string on a
localized surface) at the lowest cost in the sweep, which is why it is proposed
despite §3-the-bucket being out of scope.

Implementation: the banner is rendered from a server layout already inside
`NextIntlClientProvider`. Prefer passing the two resolved strings down as props
from the layout over making the component an async RSC — async-RSC-as-JSX
breaks jsdom page tests (see the billing-upgrade-path notes).

---

## Testing

- `lib/__tests__/dates.test.ts` — rewritten for `shortDate`/`longDate` across
  all five locales, asserting the `fr`-only period strip and `en → en-GB` day
  ordering. Null/empty/invalid guards retained.
- `lib/dashboard/__tests__/rollup.test.ts` — the four `frShortDate` cases move
  out (the re-export is gone); the file keeps its rollup coverage.
- `messages/__tests__/parity.test.ts` — two new guards (§3).
- Existing component tests touching the nine call sites are updated for the
  renamed helper; `renderWithIntl` already defaults to `fr`, so their
  assertions do not move.
- `lib/__tests__/student-reminder-email.test.ts:29` asserts `'10 oct'` — stays
  green because the email call sites pass `'fr'`.

**No migration, no RLS change, no storage change** — `pnpm test:rls` is not
required for this branch.

### Gate

`pnpm lint`, `pnpm test`, `pnpm build` before merge.

### Browser pass — 5 languages

Previously-merged i18n work shipped without one. Required here, on staging, for
every page this branch touches:

1. Organizer → Overview (respondedAt cell + next-deadline suffix)
2. Organizer → Candidatures (submitted_at) + the invitation panel deadline
3. Organizer → Settings → Programme (the three hints **and** the deadline stat)
4. Organizer → Fichiers → document drawer (deadline chip)
5. Student → dossier (due dates) and an assignment page (deadline line)
6. The grace banner, if §4 survives review

---

## Appendix A — found, deliberately not in this branch

Recorded so this does not need re-deriving.

**Auth and onboarding are entirely outside i18n.** There is no
`app/(auth)/layout.tsx` and no `NextIntlClientProvider` anywhere under it.
~40 hardcoded French strings across `login`, `signup`, `accept-invite`,
`/join/[token]`, `components/auth/JoinForm.tsx`; ~20 more across
`app/onboarding/{page,OnboardingForm,SchoolCombobox}.tsx`. A German visitor
gets a German landing page and a French signup form. Also hardcoded French:
`components/FormBuilder.tsx` (~8), `components/forms/TemplateEditor.tsx`
(2 paragraphs), `app/billing/return/page.tsx` (3).

**Server-action result messages are hardcoded French** (~40) across
`lib/billing/exchange-limit.ts`, `exchange-notice.ts`, `lib/forms/activate.ts`,
`template-result.ts`, `lib/team/invite.ts`, `lib/invite-response.ts`,
`lib/auth/hibp.ts`, `lib/auth/require.ts`, `lib/exchange-guard.ts`,
`lib/exchange/travel-dates.ts`, `lib/onboarding/first-exchange.ts`,
`DETAIL_LABELS` in `lib/forms/fillable/types.ts`, and
`GOOD_NEWS_FIELD_LABELS`. Localizing these means the structured return carries
a **key**, not a string — an architectural change touching every action file
and its tests. The largest single item in the sweep.

**Root layout is locale-blind.** `app/layout.tsx:34` hardcodes
`<html lang="en">` on every page in every locale; root `metadata` is English,
`app/page.tsx` overrides it with French only, and `lib/seo/structured-data.ts`
is French only. Partly mitigated inside the organizer area by
`<div lang={locale}>` at `app/(organizer)/layout.tsx:73`. Left out because it
touches SEO while landing rankings are in flight.

**Phase 4 stays deferred.** `lib/email.ts` is French-only except
`GOOD_NEWS_BUTTON: Record<'en'|'fr'>`; `good-news-template.ts` and
`invite-emails.ts` are French; `supabase/functions/send-reminders/email-copy.ts`
is French with its own local `fr-FR` formatter and its own `esc`. Separate
delivery surface, own test rig, and a manual `supabase functions deploy`.
Worth knowing when it is picked up: `applications.language` already stores a
per-applicant `'en' | 'fr'`, so the routing data exists.

**Not a problem — no action.** Currency is already locale-correct: the € figures
live in the catalogues (`€199` in `en`, `199 €` in `fr`/`de`), so no
`Intl.NumberFormat` is needed. There is no `toFixed` anywhere, no decimal
number is rendered, and percentages are CSS widths. Roughly 17 `fr` / 8 `es` /
11 `it` / 11 `de` values are identical to `en`; each was checked and they are
legitimate loanwords or symbols (Feedback, Parents, `PDF · JPG · PNG`, German
"Dashboard"/"Status").
