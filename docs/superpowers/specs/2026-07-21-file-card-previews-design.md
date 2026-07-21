# Design — Document & fillable-form previews on the Fichiers cards

**Date:** 2026-07-21
**Status:** Approved (brainstorm), ready for planning
**Branch:** `feature/file-card-previews`

## Problem

Every card on the organizer Fichiers tab (`components/forms/TemplateCard.tsx`) has an
A4-proportioned preview zone. Two of the four preview modes fail to show anything
meaningful:

| Card kind | Preview today | Verdict |
|---|---|---|
| `pdf` **with** `template_file_path` | Real page-1 thumbnail via `TemplateThumbnail` → pdf.js | Works |
| `pdf` **without** a file | Dashed « PDF à joindre » | Correct as-is |
| `online` | CSS mini-page of the template's real field labels | Works |
| `fillable` | Same CSS mini-page — but the four standard fillable entries ship `fields: []`, so it renders **three blank grey skeleton lines** | **Broken** |
| `doc` | One hard-coded grey placeholder | **Broken** — Passeport, ESTA and every custom document look identical |

Organizers cannot tell their document cards apart at a glance, and the four
signable forms — the app's flagship content — present as empty.

## Goals

1. Each `doc` card shows a cartoon/sticker illustration of what that document *is*.
2. Each `fillable` card shows a recognisable mini-page of the actual document.
3. No schema change, no new translation keys, no change to the three modes that
   already work.

## Non-goals

- The student-side `DossierView`. Students see the same documents there and would
  plausibly benefit, but this change stays scoped to the organizer Fichiers tab.
  Deliberate deferral, not an oversight.
- Replacing the working `pdf` thumbnail pipeline or the `online` field paper.
- Any organizer-facing configuration of illustrations (see Alternatives).

## Decision 1 — Documents get keyword-matched cartoon stickers

### Visual style

Filled-colour cartoon/sticker SVGs (chosen from three mocked options: emoji,
flat-line house style, cartoon). Warmer than the surrounding UI by design — these
cards are also the ones organizers scan fastest.

### `lib/forms/doc-illustration.ts` (new — pure, no React, no Supabase)

Same module conventions as `lib/forms/card.ts`: pure functions, unit-tested in
`lib/forms/__tests__/`.

```ts
export type IllustrationKey =
  | 'passport' | 'passport-parent' | 'id-card' | 'photo' | 'insurance'
  | 'medical' | 'travel-auth' | 'ticket' | 'bank' | 'address-proof'
  | 'school-record' | 'generic'

export function docIllustrationKey(
  tpl: Pick<TemplateVM, 'standard_key' | 'name'>,
): IllustrationKey
```

Resolution order, first hit wins:

1. **`standard_key`** — exact map for library entries:
   `passeport → 'passport'`, `passeport-parent → 'passport-parent'`,
   `esta → 'travel-auth'`.
2. **Keyword match on `name`**, normalized: lowercased and accent-stripped
   (`String.prototype.normalize('NFD')` + combining-mark strip) so « identité »
   and « identite » both match. Keywords are French **and** English per entry.
3. **`'generic'`** fallback.

Keyword table (FR + EN, non-exhaustive, extended by the plan):

| Key | Keywords |
|---|---|
| `passport` | passeport, passport |
| `id-card` | carte d'identite, cni, identite, id card, identity |
| `photo` | photo, photographie, portrait, picture |
| `insurance` | assurance, mutuelle, insurance, coverage |
| `medical` | medical, sante, vaccin, vaccination, carnet de sante, health |
| `travel-auth` | esta, visa, autorisation de voyage, travel authorization |
| `ticket` | billet, vol, avion, ticket, flight, boarding |
| `bank` | rib, iban, bancaire, bank |
| `address-proof` | domicile, justificatif de domicile, address, residence |
| `school-record` | bulletin, releve de notes, scolarite, transcript, report card |

Order matters where keywords overlap (`passeport-parent`'s `standard_key` is
checked before the generic `passeport` keyword; the table is evaluated in a fixed
declared order, not object-key order).

### `components/forms/DocIllustration.tsx` (new)

One presentational component switching on `IllustrationKey`, rendering inline SVG.
No state, no data fetching. `aria-hidden="true"` — the enclosing card button
already carries `aria-label={vm.name}`, so the illustration must not add a second
announcement.

SVGs contain **no text**, which is why this feature needs no new translation keys
and no five-locale sweep. The existing translated caption
(`organizer.templateCard.docPlaceholder`) stays beneath the sticker.

### `previewMode` change

`'doc-placeholder'` is renamed `'doc-sticker'` in `lib/forms/card.ts`. The inline
placeholder JSX in `TemplateCard.tsx` is deleted and replaced by `<DocIllustration>`.

## Decision 2 — Fillable forms get a CSS mini-page from their definition

`FillableDefinition` (`lib/forms/fillable/types.ts`) already holds the complete
document: real title, real French legal paragraphs, `blank` runs, `field` blocks
and `signature` blocks. The preview derives from that rather than from a rendered PDF.

### `lib/forms/fillable-preview.ts` (new — pure)

```ts
export type PreviewBlock =
  | { p: 'kicker'; text: string }
  | { p: 'title'; text: string }
  | { p: 'paragraph'; runs: PreviewRun[] }
  | { p: 'signatures'; labels: string[] }

export type PreviewRun = { t: 'text'; text: string } | { t: 'blank' }

export function fillablePreviewBlocks(
  def: FillableDefinition,
  resolved: ResolvedVariables,
): PreviewBlock[]
```

Behaviour:

- Takes the leading `heading` blocks (level 2 → kicker, level 1 → title) and the
  first **two** `paragraph` blocks, then one `signatures` row built from
  `signatureBlocks(def)` (max two labels).
- `var` runs are substituted from `resolved`; a **missing** variable degrades to
  a `{ t: 'blank' }` run rather than throwing or emitting a raw token name. Draft
  templates with incomplete `exchange_program_details` therefore still preview.
- Total emitted paragraph text is capped (character budget) so the content cannot
  overflow the fixed-aspect A4 zone regardless of definition length.

### `components/forms/FillablePaper.tsx` (new)

Renders `PreviewBlock[]` at thumbnail scale: kicker, centred bold title, justified
micro-paragraphs with underlined inline blanks, and a bordered signature row.
Presentational only.

### Variable resolution — server-side, once per page

`getTemplatesPage()` in `actions/forms.ts` — the single loader already backing this
page — fetches the exchange's `exchange_program_details` row **once** alongside its
existing template query, calls `resolveVariables()`
(`lib/forms/fillable/render.ts`), and returns `resolvedVars` next to `templates`
(not inside them). The page then threads it:

```
page → FichiersView → TemplateCard (kind === 'fillable' only) → FillablePaper
```

`resolvedVars` is passed as an **optional prop**, deliberately *not* added to
`TemplateVM`. Adding a field to `TemplateVM` would churn fixtures across five
existing test files for data that only fillable cards consume.

### `previewMode` change

A new `'fillable-paper'` mode is returned for `kind === 'fillable'`, so
`'online-paper'` narrows back to meaning only `kind === 'online'`.

## Resulting preview-mode table

```
online   → 'online-paper'    (unchanged — real field labels)
fillable → 'fillable-paper'  (NEW — mini-page from the definition)
doc      → 'doc-sticker'     (NEW — keyword-matched cartoon SVG)
pdf      → 'pdf-file' | 'pdf-missing'  (unchanged)
```

## Files touched

**New**

- `lib/forms/doc-illustration.ts`
- `lib/forms/fillable-preview.ts`
- `components/forms/DocIllustration.tsx`
- `components/forms/FillablePaper.tsx`
- `lib/forms/__tests__/doc-illustration.test.ts`
- `lib/forms/__tests__/fillable-preview.test.ts`

**Modified**

- `lib/forms/card.ts` — `PreviewMode` union + `previewMode()`
- `components/forms/TemplateCard.tsx` — wire both new modes, delete placeholder JSX
- `components/forms/FichiersView.tsx` — accept and forward `resolvedVars`
- `actions/forms.ts` — `getTemplatesPage()` also returns `resolvedVars`
- `lib/forms/__tests__/card.test.ts` — new modes
- `components/forms/__tests__/TemplateCard.test.tsx` — sticker + paper rendering

**Untouched:** all migrations, RLS, `messages/*.json`, `TemplateThumbnail.tsx`,
`DossierView`, every drawer.

## Testing

`lib/forms/__tests__/doc-illustration.test.ts`

- `standard_key` wins over a conflicting name keyword
- `passeport-parent` resolves to `'passport-parent'`, not `'passport'`
- accent-insensitive: « Carte d'identité » and "carte d'identite" both → `'id-card'`
- English name ("Insurance certificate") → `'insurance'`
- unknown name → `'generic'`
- empty / whitespace name → `'generic'` (no crash)

`lib/forms/__tests__/fillable-preview.test.ts` — run against the four **real**
definitions (`decharge`, `absence`, `engagement`, `medical`):

- each yields a non-empty title and at least one paragraph
- `blank` runs survive into the output as `{ t: 'blank' }`
- a fully-empty `ResolvedVariables` produces blanks, never a thrown error or a raw
  variable token
- the character budget holds for the longest definition
- signature labels are capped at two

`lib/forms/__tests__/card.test.ts` — `previewMode` returns `'fillable-paper'` for
fillable, `'doc-sticker'` for doc, and is unchanged for online/pdf.

`components/forms/__tests__/TemplateCard.test.tsx` — a `doc` card renders a
sticker (and the illustration carries no accessible name); a `fillable` card
renders paper content rather than skeleton lines.

Gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`. `pnpm test:rls` is not
required — no migration, no RLS policy, no storage bucket is touched.

## Alternatives considered

**Documents — organizer picks the illustration manually.** Rejected: needs an
`illustration_key` column plus a picker in the template editor, and adds a setup
step per document. Contradicts the project rule against making users configure
things a heuristic can infer.

**Documents — standard library only (3 illustrations + generic).** Rejected:
deterministic and mismatch-proof, but most real-world documents are custom-named,
so the majority of cards would stay generic — which is the bug being fixed.

**Fillable — render the real PDF page 1.** Rejected. It is the most literal reading
of « the first page of the form », and it reuses the existing pdf.js pipeline, but
it needs a new server action generating a blank preview PDF per template, pays PDF
generation plus pdf.js decode on every card, and fails or renders gappy on draft
templates whose program details are incomplete. Both options were mocked at true
card size (≈150px wide) during brainstorming and are visually indistinguishable at
that scale.

## Known limitations

- Keyword lists ship French + English only. An organizer working in German, Spanish
  or Italian who names a document in their own language falls back to the generic
  sticker — degraded, never wrong. Extend from real usage rather than speculatively.
- The fillable preview approximates the PDF's typography; it is not the PDF. Only
  observable if a user zooms the card, which the UI does not offer.
- Custom `doc` templates whose names are ambiguous ("Document 1") get the generic
  sticker. Acceptable: identical to today's behaviour for those cards only.
