# Fichiers Card Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two broken preview modes on the organizer Fichiers cards — one identical grey placeholder for every `doc`, and blank skeleton lines for every `fillable` — with keyword-matched cartoon stickers and a real mini-page of the document.

**Architecture:** Two new pure modules under `lib/forms/` (a sticker matcher and a preview-block deriver) plus two new presentational components under `components/forms/`. `previewMode()` in `lib/forms/card.ts` gains `'doc-sticker'` and `'fillable-paper'`. Fillable variables are resolved server-side once per page in `getTemplatesPage()` and threaded down as an optional prop — deliberately *not* added to `TemplateVM`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, next-intl, Vitest + Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-21-file-card-previews-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- **No migration, no RLS, no storage change** in this plan. `pnpm test:rls` is not required.
- **No new translation keys.** All SVGs are text-free; the existing
  `organizer.templateCard.docPlaceholder` caption is reused as-is. Do not touch
  `messages/*.json`.
- Pure modules under `lib/forms/` must import **no React and no Supabase** — same
  rule as the existing `lib/forms/card.ts` and `lib/forms/rollup.ts`.
- Never index a `Record<string, …>` with a runtime-supplied key without an
  own-property guard (`Object.prototype.hasOwnProperty.call`). A prototype key
  such as `constructor` returning a function has caused a production 500 in this
  repo before.
- Illustration SVGs carry `aria-hidden="true"`. The enclosing card `<button>`
  already has `aria-label={vm.name}`; a second accessible name is a defect.
- `tsconfig` target is **ES2017** — do not use `Object.hasOwn`.
- Verification gate before the branch is considered done: `pnpm lint`,
  `pnpm test`, `pnpm build`.

## Spec correction adopted in this plan

The spec says the fillable preview takes "level 2 → kicker, level 1 → title".
Checking the four real definitions shows that rule is wrong:

| Definition | Heading order |
|---|---|
| `decharge` | level 2 (« ÉCHANGE : … ») **then** level 1 |
| `absence` | level 1 first, a level 2 much later |
| `engagement` | level 1 first, no level 2 |
| `medical` | level 1 (« MEDICAL AUTHORISATION ») **then** level 2 |

Applying the spec's rule literally would give `medical` the kicker
« Autorisation médicale » *below* its title and give `absence` a kicker from an
unrelated mid-document heading. The rule implemented here instead is:

- **title** = the first heading with `level === 1` (treat a missing `level` as 1);
  if no level-1 heading exists, the first heading of any level.
- **kicker** = the last heading appearing *before* the title, if any.
- headings after the title are ignored.

This yields the right result for all four definitions and is what Task 3's tests assert.

---

### Task 1: Document sticker matcher (pure)

**Files:**
- Create: `lib/forms/doc-illustration.ts`
- Test: `lib/forms/__tests__/doc-illustration.test.ts`

**Interfaces:**
- Consumes: `TemplateVM` from `@/lib/forms/rollup` (type only).
- Produces:
  - `type IllustrationKey = 'passport' | 'passport-parent' | 'id-card' | 'photo' | 'insurance' | 'medical' | 'travel-auth' | 'ticket' | 'bank' | 'address-proof' | 'school-record' | 'generic'`
  - `docIllustrationKey(tpl: Pick<TemplateVM, 'standard_key' | 'name'>): IllustrationKey`
  - `normalizeName(name: string): string`

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/doc-illustration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { docIllustrationKey, normalizeName } from '@/lib/forms/doc-illustration'

const tpl = (name: string, standard_key: string | null = null) => ({ name, standard_key })

describe('normalizeName', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeName('  Carte d’Identité ')).toBe('carte d’identite')
  })
})

describe('docIllustrationKey — standard library', () => {
  it('maps the three library documents', () => {
    expect(docIllustrationKey(tpl('Passeport de l’élève', 'passeport'))).toBe('passport')
    expect(docIllustrationKey(tpl('Passeport du parent', 'passeport-parent'))).toBe('passport-parent')
    expect(docIllustrationKey(tpl('ESTA', 'esta'))).toBe('travel-auth')
  })

  it('standard_key wins over a conflicting name keyword', () => {
    // Name says "photo", the library key says parent passport — key must win.
    expect(docIllustrationKey(tpl('Photo du passeport', 'passeport-parent'))).toBe('passport-parent')
  })

  it('ignores an unknown standard_key and falls through to the name', () => {
    expect(docIllustrationKey(tpl('Attestation d’assurance', 'not-a-key'))).toBe('insurance')
  })

  it('is not fooled by a prototype-valued standard_key', () => {
    expect(docIllustrationKey(tpl('Document divers', 'constructor'))).toBe('generic')
    expect(docIllustrationKey(tpl('Document divers', '__proto__'))).toBe('generic')
  })
})

describe('docIllustrationKey — custom names', () => {
  it.each([
    ['Passeport', 'passport'],
    ['Copy of passport', 'passport'],
    ['Photo d’identité', 'photo'],
    ['Carte d’identité', 'id-card'],
    ['carte d’identite', 'id-card'],
    ['CNI recto-verso', 'id-card'],
    ['Attestation d’assurance', 'insurance'],
    ['Insurance certificate', 'insurance'],
    ['Carnet de santé', 'medical'],
    ['Certificat de vaccination', 'medical'],
    ['Billet d’avion', 'ticket'],
    ['Flight confirmation', 'ticket'],
    ['RIB', 'bank'],
    ['Justificatif de domicile', 'address-proof'],
    ['Bulletin scolaire', 'school-record'],
    ['Visa étudiant', 'travel-auth'],
  ] as const)('%s → %s', (name, expected) => {
    expect(docIllustrationKey(tpl(name))).toBe(expected)
  })

  it('accent-insensitive: both spellings of identité agree', () => {
    expect(docIllustrationKey(tpl('Carte d’identité'))).toBe(
      docIllustrationKey(tpl('Carte d’identite')),
    )
  })

  it('photo wins over identité so « Photo d’identité » is a photo', () => {
    expect(docIllustrationKey(tpl('Photo d’identité'))).toBe('photo')
  })

  it('matches on word boundaries, not bare substrings', () => {
    // « bénévolat » contains "vol"; it must not become a plane ticket.
    expect(docIllustrationKey(tpl('Attestation de bénévolat'))).toBe('generic')
  })

  it('falls back to generic', () => {
    expect(docIllustrationKey(tpl('Document 1'))).toBe('generic')
    expect(docIllustrationKey(tpl(''))).toBe('generic')
    expect(docIllustrationKey(tpl('   '))).toBe('generic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/doc-illustration.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/forms/doc-illustration"`.

- [ ] **Step 3: Write the implementation**

Create `lib/forms/doc-illustration.ts`:

```ts
// Which cartoon sticker a `doc` card shows. Pure — no React, no Supabase,
// same conventions as lib/forms/card.ts. Resolution order is fixed:
// standard_key (library entries) → accent-stripped, word-boundary keyword
// match on the organizer's free-text name → 'generic'. A miss degrades to
// the generic sticker; it is never wrong, only unspecific.
import type { TemplateVM } from '@/lib/forms/rollup'

export type IllustrationKey =
  | 'passport' | 'passport-parent' | 'id-card' | 'photo' | 'insurance'
  | 'medical' | 'travel-auth' | 'ticket' | 'bank' | 'address-proof'
  | 'school-record' | 'generic'

// form_templates.standard_key → sticker. Exact; wins over any name keyword.
// A Map (not a Record) so a prototype-valued key can never resolve.
const BY_STANDARD_KEY = new Map<string, IllustrationKey>([
  ['passeport', 'passport'],
  ['passeport-parent', 'passport-parent'],
  ['esta', 'travel-auth'],
])

// Evaluated IN ORDER — first entry with a matching keyword wins. Order is
// load-bearing where vocabularies overlap:
//   'photo' precedes 'id-card'  → « Photo d'identité » is a photo, not a card
//   'passport' precedes 'photo' → « Photo du passeport » is a passport
// Keywords are written already-normalized (lowercase, accent-free) and are
// matched on word boundaries, so "vol" cannot fire inside "bénévolat".
const KEYWORDS: readonly (readonly [IllustrationKey, readonly string[]])[] = [
  ['travel-auth', ['esta', 'visa', 'autorisation de voyage', 'travel authorization', 'travel authorisation']],
  ['passport', ['passeport', 'passport']],
  ['photo', ['photo', 'photographie', 'portrait', 'picture']],
  ['id-card', ['cni', 'identite', 'id card', 'identity card', 'identity']],
  ['insurance', ['assurance', 'mutuelle', 'insurance', 'coverage']],
  ['medical', ['carnet de sante', 'sante', 'vaccin', 'vaccination', 'medical', 'medicale', 'health']],
  ['ticket', ['billet', 'avion', 'vol', 'ticket', 'flight', 'boarding']],
  ['bank', ['rib', 'iban', 'bancaire', 'bank']],
  ['address-proof', ['justificatif de domicile', 'domicile', 'address', 'residence']],
  ['school-record', ['bulletin', 'releve de notes', 'scolarite', 'transcript', 'report card']],
]

// Compiled once at module load: /\bkeyword\b/ over the normalized name.
const MATCHERS: readonly (readonly [IllustrationKey, readonly RegExp[]])[] =
  KEYWORDS.map(([key, words]) => [
    key,
    words.map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)),
  ])

// Lowercase + strip diacritics so « identité » and "identite" both match.
// Typographic apostrophes are left alone — no keyword contains one.
export function normalizeName(name: string): string {
  // Escape the combining-mark range explicitly — never paste raw combining
  // characters into source, they are invisible and survive copy/paste badly.
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export function docIllustrationKey(
  tpl: Pick<TemplateVM, 'standard_key' | 'name'>,
): IllustrationKey {
  const byKey = tpl.standard_key ? BY_STANDARD_KEY.get(tpl.standard_key) : undefined
  if (byKey) return byKey

  const name = normalizeName(tpl.name ?? '')
  if (name === '') return 'generic'
  for (const [key, patterns] of MATCHERS) {
    if (patterns.some((re) => re.test(name))) return key
  }
  return 'generic'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/doc-illustration.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/doc-illustration.ts lib/forms/__tests__/doc-illustration.test.ts
git commit -m "feat(forms): keyword matcher picking a sticker per document template"
```

---

### Task 2: Document sticker component + wire into the card

**Files:**
- Create: `components/forms/DocIllustration.tsx`
- Modify: `lib/forms/card.ts` (rename `'doc-placeholder'` → `'doc-sticker'`)
- Modify: `components/forms/TemplateCard.tsx` (replace the placeholder JSX)
- Test: `lib/forms/__tests__/card.test.ts` (update), `components/forms/__tests__/TemplateCard.test.tsx` (update)

**Interfaces:**
- Consumes: `IllustrationKey`, `docIllustrationKey` from Task 1.
- Produces: `<DocIllustration illustration={key} />` — a 64×64 inline SVG,
  `aria-hidden`, `data-testid="doc-illustration"`, `data-illustration={key}`.

- [ ] **Step 1: Update the failing tests**

In `lib/forms/__tests__/card.test.ts`, replace the existing doc case:

```ts
  it('doc shows the illustrative placeholder', () => {
    expect(previewMode(vm({ kind: 'doc', template_file_path: null }))).toBe('doc-placeholder')
  })
```

with:

```ts
  it('doc shows the cartoon sticker', () => {
    expect(previewMode(vm({ kind: 'doc', template_file_path: null }))).toBe('doc-sticker')
  })
```

In `components/forms/__tests__/TemplateCard.test.tsx`, append inside `describe('TemplateCard', …)`:

```ts
  it('doc card renders the sticker matching its standard_key', () => {
    renderWithIntl(<TemplateCard vm={vm({
      kind: 'doc', standard_key: 'passeport', name: 'Passeport de l’élève',
      template_file_path: null,
    })} onOpen={() => {}} />)
    expect(screen.getByTestId('doc-illustration')).toHaveAttribute('data-illustration', 'passport')
    expect(screen.getByText('À téléverser')).toBeInTheDocument()
  })

  it('custom doc card falls back to a keyword match on its name', () => {
    renderWithIntl(<TemplateCard vm={vm({
      kind: 'doc', standard_key: null, name: 'Attestation d’assurance',
      template_file_path: null,
    })} onOpen={() => {}} />)
    expect(screen.getByTestId('doc-illustration')).toHaveAttribute('data-illustration', 'insurance')
  })

  it('the sticker adds no accessible name beyond the card label', () => {
    renderWithIntl(<TemplateCard vm={vm({
      kind: 'doc', standard_key: 'passeport', name: 'Passeport de l’élève',
      template_file_path: null,
    })} onOpen={() => {}} />)
    expect(screen.getByTestId('doc-illustration')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByLabelText('Passeport de l’élève')).toHaveLength(1)
  })
```

> Note: the caption asserted above is the existing French value of
> `organizer.templateCard.docPlaceholder`. If `messages/fr.json` holds a
> different string, assert that string — do **not** edit the message file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/forms/__tests__/card.test.ts components/forms/__tests__/TemplateCard.test.tsx`
Expected: FAIL — `card.test.ts` expects `'doc-sticker'` but receives `'doc-placeholder'`; `TemplateCard.test.tsx` fails with `Unable to find an element by: [data-testid="doc-illustration"]`.

- [ ] **Step 3: Create the sticker component**

Create `components/forms/DocIllustration.tsx`:

```tsx
import type { IllustrationKey } from '@/lib/forms/doc-illustration'

// Cartoon/sticker artwork for the `doc` card preview zone. Presentational
// only — no state, no data. Every sticker is a text-free 64×64 inline SVG, so
// this component needs no translations. aria-hidden is deliberate: the
// enclosing card button already carries aria-label={vm.name}, and a second
// accessible name would make every doc card announce itself twice.
const NAVY = '#1B3A7A'
const NAVY_DARK = '#12295C'
const MAROON = '#7A2E3C'
const MAROON_DARK = '#5E2230'
const GOLD = '#FFC93C'
const BRAND = '#2456E6'
const BRAND_PALE = '#EAF0FE'
const GREEN = '#34B36B'
const INK = '#A9BBDE'
const SKIN = '#F0C9A8'
const RED = '#D8465A'
const PAPER = '#F4F6FC'

// Gold globe + ruled lines shared by both passport booklets.
function BookletFace() {
  return (
    <>
      <circle cx="34" cy="26" r="9.5" fill="none" stroke={GOLD} strokeWidth="2.2" />
      <path
        d="M34 16.5c-4.5 4.5-4.5 14.5 0 19M34 16.5c4.5 4.5 4.5 14.5 0 19M25 22h18M25 30h18"
        stroke={GOLD} strokeWidth="1.5" fill="none"
      />
      <rect x="26" y="42" width="17" height="3" rx="1.5" fill={GOLD} />
      <rect x="29" y="48" width="11" height="2.4" rx="1.2" fill={GOLD} opacity=".6" />
    </>
  )
}

const ART: Record<IllustrationKey, React.ReactNode> = {
  passport: (
    <>
      <rect x="14" y="7" width="37" height="50" rx="5" fill={NAVY} />
      <rect x="14" y="7" width="6" height="50" rx="3" fill={NAVY_DARK} />
      <BookletFace />
    </>
  ),
  'passport-parent': (
    <>
      <rect x="14" y="7" width="37" height="50" rx="5" fill={MAROON} />
      <rect x="14" y="7" width="6" height="50" rx="3" fill={MAROON_DARK} />
      <circle cx="34" cy="25" r="7" fill={SKIN} />
      <path d="M23 47c2.5-7 7-10.5 11-10.5S42.5 40 45 47z" fill={SKIN} />
      <rect x="26" y="50" width="17" height="2.6" rx="1.3" fill={GOLD} opacity=".8" />
    </>
  ),
  'id-card': (
    <>
      <rect x="5" y="15" width="54" height="34" rx="5" fill={BRAND_PALE} />
      <rect x="5" y="15" width="54" height="8" rx="5" fill={BRAND} />
      <rect x="5" y="19" width="54" height="4" fill={BRAND} />
      <circle cx="21" cy="34" r="6.5" fill={NAVY} />
      <path d="M13 45c1.8-4.6 4.8-7 8-7s6.2 2.4 8 7z" fill={NAVY} />
      <rect x="34" y="30" width="19" height="3" rx="1.5" fill={INK} />
      <rect x="34" y="37" width="13" height="3" rx="1.5" fill={INK} />
    </>
  ),
  photo: (
    <>
      <rect x="9" y="9" width="46" height="46" rx="4" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="14" y="14" width="36" height="27" fill={BRAND_PALE} />
      <circle cx="32" cy="24" r="6" fill={NAVY} />
      <path d="M20 41c2.6-6.6 7-10 12-10s9.4 3.4 12 10z" fill={NAVY} />
      <rect x="14" y="46" width="20" height="3" rx="1.5" fill={INK} />
    </>
  ),
  insurance: (
    <>
      <path d="M32 6l20 7v17c0 12-8.4 22-20 28-11.6-6-20-16-20-28V13z" fill={BRAND} />
      <path d="M23 32.5l6.5 6.5L42 25" stroke="#fff" strokeWidth="4" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  medical: (
    <>
      <rect x="9" y="7" width="46" height="50" rx="5" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="26" y="16" width="12" height="30" rx="2.5" fill={RED} />
      <rect x="17" y="25" width="30" height="12" rx="2.5" fill={RED} />
    </>
  ),
  'travel-auth': (
    <>
      <rect x="6" y="14" width="52" height="36" rx="5" fill={BRAND_PALE} />
      <rect x="6" y="14" width="52" height="9" rx="5" fill={BRAND} />
      <rect x="6" y="18" width="52" height="5" fill={BRAND} />
      <circle cx="24" cy="36" r="10" fill={GREEN} />
      <path d="M19.5 36.5l3.5 3.5 6.5-7.5" stroke="#fff" strokeWidth="2.8" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <rect x="38" y="31" width="14" height="3" rx="1.5" fill={INK} />
      <rect x="38" y="38" width="10" height="3" rx="1.5" fill={INK} />
    </>
  ),
  ticket: (
    <>
      <path d="M6 20a4 4 0 014-4h44a4 4 0 014 4v6a6 6 0 000 12v6a4 4 0 01-4 4H10a4 4 0 01-4-4v-6a6 6 0 000-12z"
        fill={GOLD} />
      <path d="M40 16v32" stroke="#fff" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M14 34l16-8-3.5 8 3.5 8z" fill={NAVY} />
      <rect x="45" y="27" width="8" height="2.6" rx="1.3" fill={NAVY} opacity=".55" />
      <rect x="45" y="34" width="8" height="2.6" rx="1.3" fill={NAVY} opacity=".55" />
    </>
  ),
  bank: (
    <>
      <rect x="5" y="15" width="54" height="34" rx="5" fill={NAVY} />
      <rect x="5" y="22" width="54" height="7" fill={NAVY_DARK} />
      <rect x="12" y="34" width="11" height="8" rx="2" fill={GOLD} />
      <rect x="28" y="37" width="24" height="3" rx="1.5" fill="#fff" opacity=".55" />
    </>
  ),
  'address-proof': (
    <>
      <rect x="13" y="24" width="38" height="33" rx="4" fill={PAPER} stroke={INK} strokeWidth="2" />
      <path d="M8 27L32 7l24 20z" fill={BRAND} />
      <rect x="27" y="38" width="10" height="19" rx="2" fill={BRAND} opacity=".55" />
      <rect x="18" y="34" width="7" height="6" rx="1.5" fill={INK} opacity=".7" />
      <rect x="39" y="34" width="7" height="6" rx="1.5" fill={INK} opacity=".7" />
    </>
  ),
  'school-record': (
    <>
      <rect x="11" y="7" width="42" height="50" rx="5" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="18" y="17" width="20" height="3.4" rx="1.7" fill={NAVY} />
      <rect x="18" y="26" width="28" height="3" rx="1.5" fill={INK} />
      <rect x="18" y="33" width="22" height="3" rx="1.5" fill={INK} />
      <path d="M32 39l3.1 6.3 7 1-5 4.9 1.2 6.9-6.3-3.3-6.3 3.3 1.2-6.9-5-4.9 7-1z" fill={GOLD} />
    </>
  ),
  generic: (
    <>
      <path d="M14 7h24l12 12v38a3 3 0 01-3 3H14a3 3 0 01-3-3V10a3 3 0 013-3z" fill="#fff"
        stroke={INK} strokeWidth="2" />
      <path d="M38 7v12h12" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="18" y="28" width="25" height="3" rx="1.5" fill={INK} />
      <rect x="18" y="36" width="25" height="3" rx="1.5" fill={INK} />
      <rect x="18" y="44" width="16" height="3" rx="1.5" fill={INK} />
    </>
  ),
}

export function DocIllustration({ illustration }: { illustration: IllustrationKey }) {
  return (
    <svg
      width="74" height="74" viewBox="0 0 64 64"
      aria-hidden="true" focusable="false"
      data-testid="doc-illustration" data-illustration={illustration}
    >
      {ART[illustration]}
    </svg>
  )
}
```

> `ART` is indexed only by the `IllustrationKey` union returned from Task 1 —
> never by a raw runtime string — so the own-property guard is not needed here.

- [ ] **Step 4: Rename the preview mode**

In `lib/forms/card.ts`, change the union and the doc branch:

```ts
export type PreviewMode = 'pdf-file' | 'pdf-missing' | 'online-paper' | 'doc-sticker'
```

```ts
  if (t.kind === 'doc') return 'doc-sticker'
```

Also update the comment above `previewMode` so « an illustrative placeholder for
docs » reads « a cartoon sticker matched to the document for docs ».

- [ ] **Step 5: Wire the card**

In `components/forms/TemplateCard.tsx`, add the imports:

```tsx
import { DocIllustration } from './DocIllustration'
import { docIllustrationKey } from '@/lib/forms/doc-illustration'
```

Replace this whole block:

```tsx
        {mode === 'doc-placeholder' && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5">
            <div aria-hidden="true" className="flex h-[60px] w-[46px] flex-none flex-col items-center justify-center gap-1 rounded bg-rail">
              <div className="h-4 w-4 rounded-full border-2 border-white/60" />
              <div className="h-[3px] w-6 rounded-sm bg-white/60" />
            </div>
            <span className="text-[10px] font-medium text-placeholder">{t('templateCard.docPlaceholder')}</span>
          </div>
        )}
```

with:

```tsx
        {mode === 'doc-sticker' && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5">
            <DocIllustration illustration={docIllustrationKey(vm)} />
            <span className="text-[10px] font-medium text-placeholder">{t('templateCard.docPlaceholder')}</span>
          </div>
        )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run lib/forms components/forms`
Expected: PASS. If any other suite referenced `'doc-placeholder'`, update that
reference to `'doc-sticker'` — the string is a preview-mode identifier, not a
translation key.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/forms/DocIllustration.tsx components/forms/TemplateCard.tsx \
  lib/forms/card.ts lib/forms/__tests__/card.test.ts \
  components/forms/__tests__/TemplateCard.test.tsx
git commit -m "feat(forms): cartoon stickers on document cards"
```

---

### Task 3: Fillable preview blocks (pure)

**Files:**
- Create: `lib/forms/fillable-preview.ts`
- Test: `lib/forms/__tests__/fillable-preview.test.ts`

**Interfaces:**
- Consumes: `FillableDefinition`, `Block`, `Run` from `@/lib/forms/fillable/types`;
  `signatureBlocks`, `ResolvedVariables` from `@/lib/forms/fillable/render`;
  `FILLABLE_DEFINITIONS` from `@/lib/forms/fillable`.
- Produces:
  - `type PreviewRun = { t: 'text'; text: string } | { t: 'blank' }`
  - `type PreviewBlock = { p: 'kicker'; text: string } | { p: 'title'; text: string } | { p: 'paragraph'; runs: PreviewRun[] } | { p: 'signatures'; labels: string[] }`
  - `fillablePreviewBlocks(def: FillableDefinition, resolved: ResolvedVariables): PreviewBlock[]`
  - `fillablePreviewFor(standardKey: string | null, resolved: ResolvedVariables): PreviewBlock[]`

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/fillable-preview.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fillablePreviewBlocks, fillablePreviewFor, type PreviewBlock } from '@/lib/forms/fillable-preview'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import type { ResolvedVariables } from '@/lib/forms/fillable/render'

const KEYS = ['decharge', 'absence', 'famille', 'medical'] as const

// Everything a definition could ask for, so "fully resolved" tests have no gaps.
const FULL: ResolvedVariables = {
  exchange_name: 'France–Canada 2026', today: '21 juillet 2026',
  destination: 'Vancouver', travel_period: 'du 12 mars au 2 avril 2026',
  travel_period_en: 'from 12 March to 2 April 2026',
  chaperones_et: 'Mme Dupont et M. Martin', chaperones_ou: 'Mme Dupont ou M. Martin',
  chaperones_or_en: 'Mme Dupont or M. Martin',
  association_name: 'Les Amis du Lycée', sending_school_name: 'Lycée Victor Hugo',
  receiving_school_name: 'Vancouver High', proviseur_name: 'Mme Bernard',
  sending_city: 'Poitiers', absence_dates: '12 et 13 mars',
}

const titleOf = (blocks: PreviewBlock[]) =>
  blocks.find((b): b is Extract<PreviewBlock, { p: 'title' }> => b.p === 'title')
const paragraphsOf = (blocks: PreviewBlock[]) =>
  blocks.filter((b): b is Extract<PreviewBlock, { p: 'paragraph' }> => b.p === 'paragraph')
const textLength = (blocks: PreviewBlock[]) =>
  paragraphsOf(blocks).reduce((n, p) =>
    n + p.runs.reduce((m, r) => m + (r.t === 'text' ? r.text.length : 0), 0), 0)

describe.each(KEYS)('fillablePreviewBlocks — %s (real definition)', (key) => {
  const def = FILLABLE_DEFINITIONS[key]

  it('produces a non-empty title', () => {
    const title = titleOf(fillablePreviewBlocks(def, FULL))
    expect(title).toBeDefined()
    expect(title!.text.length).toBeGreaterThan(3)
  })

  it('produces at least one and at most two paragraphs', () => {
    const paras = paragraphsOf(fillablePreviewBlocks(def, FULL))
    expect(paras.length).toBeGreaterThanOrEqual(1)
    expect(paras.length).toBeLessThanOrEqual(2)
  })

  it('caps total paragraph text so the A4 zone cannot overflow', () => {
    expect(textLength(fillablePreviewBlocks(def, FULL))).toBeLessThanOrEqual(420)
  })

  it('emits at most two signature labels', () => {
    const sig = fillablePreviewBlocks(def, FULL)
      .find((b): b is Extract<PreviewBlock, { p: 'signatures' }> => b.p === 'signatures')
    expect(sig).toBeDefined()
    expect(sig!.labels.length).toBeGreaterThanOrEqual(1)
    expect(sig!.labels.length).toBeLessThanOrEqual(2)
  })

  it('never leaks a raw variable token when nothing is resolved', () => {
    const blocks = fillablePreviewBlocks(def, {})
    const all = [
      ...blocks.filter((b) => b.p === 'title' || b.p === 'kicker').map((b) => (b as { text: string }).text),
      ...paragraphsOf(blocks).flatMap((p) => p.runs.map((r) => (r.t === 'text' ? r.text : ''))),
    ].join(' ')
    for (const v of def.variables) expect(all).not.toContain(v)
    expect(all).not.toContain('undefined')
    expect(all).not.toContain('{{')
  })

  it('degrades an unresolved variable to a blank rather than throwing', () => {
    expect(() => fillablePreviewBlocks(def, {})).not.toThrow()
  })
})

describe('fillablePreviewBlocks — heading selection', () => {
  it('decharge: the level-2 heading before the title becomes the kicker', () => {
    const blocks = fillablePreviewBlocks(FILLABLE_DEFINITIONS.decharge, FULL)
    expect(blocks[0]).toEqual({ p: 'kicker', text: 'ÉCHANGE : France–Canada 2026' })
    expect(titleOf(blocks)!.text).toBe('DÉCHARGE DE RESPONSABILITÉ')
  })

  it('medical: the level-2 heading AFTER the title is ignored, not used as a kicker', () => {
    const blocks = fillablePreviewBlocks(FILLABLE_DEFINITIONS.medical, FULL)
    expect(blocks.some((b) => b.p === 'kicker')).toBe(false)
    expect(titleOf(blocks)!.text).toBe('MEDICAL AUTHORISATION')
  })

  it('absence: a title-first definition yields no kicker', () => {
    const blocks = fillablePreviewBlocks(FILLABLE_DEFINITIONS.absence, FULL)
    expect(blocks.some((b) => b.p === 'kicker')).toBe(false)
    expect(titleOf(blocks)!.text).toBe('Demande d’absence du Lycée')
  })
})

describe('fillablePreviewBlocks — runs', () => {
  it('keeps blanks as blanks and substitutes resolved variables', () => {
    const runs = paragraphsOf(fillablePreviewBlocks(FILLABLE_DEFINITIONS.decharge, FULL))[0].runs
    expect(runs.some((r) => r.t === 'blank')).toBe(true)
    const text = runs.map((r) => (r.t === 'text' ? r.text : '')).join('')
    expect(text).toContain('Les Amis du Lycée')
  })

  it('turns a missing variable into a blank', () => {
    const runs = paragraphsOf(fillablePreviewBlocks(FILLABLE_DEFINITIONS.decharge, {}))[0].runs
    expect(runs.filter((r) => r.t === 'blank').length).toBeGreaterThan(0)
  })
})

describe('fillablePreviewFor', () => {
  it('resolves a known standard_key', () => {
    expect(fillablePreviewFor('decharge', FULL).length).toBeGreaterThan(0)
  })

  it('returns an empty list for null, unknown, and prototype keys', () => {
    expect(fillablePreviewFor(null, FULL)).toEqual([])
    expect(fillablePreviewFor('nope', FULL)).toEqual([])
    expect(fillablePreviewFor('constructor', FULL)).toEqual([])
    expect(fillablePreviewFor('__proto__', FULL)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/fillable-preview.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/forms/fillable-preview"`.

- [ ] **Step 3: Write the implementation**

Create `lib/forms/fillable-preview.ts`:

```ts
// Thumbnail-sized derivation of a fillable document, used by the Fichiers card
// preview. Pure — no React, no Supabase, no PDF. The card is ~150px wide, so
// this deliberately takes only the document's head: kicker, title, the first
// couple of paragraphs, and one signature row.
//
// Heading rule (NOT simply "level 2 = kicker"): the four real definitions
// disagree about heading order — decharge puts a level-2 kicker BEFORE its
// level-1 title, while medical puts a level-2 subtitle AFTER it. So the title
// is the first level-1 heading and the kicker is whatever heading precedes it.
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import type { Block, FillableDefinition, Run } from '@/lib/forms/fillable/types'
import { signatureBlocks, type ResolvedVariables } from '@/lib/forms/fillable/render'

export type PreviewRun = { t: 'text'; text: string } | { t: 'blank' }

export type PreviewBlock =
  | { p: 'kicker'; text: string }
  | { p: 'title'; text: string }
  | { p: 'paragraph'; runs: PreviewRun[] }
  | { p: 'signatures'; labels: string[] }

const MAX_PARAGRAPHS = 2
const MAX_SIGNATURES = 2
// Character budget for all paragraph text combined. Sized so the longest
// definition still fits the fixed aspect-[210/260] preview zone.
const CHAR_BUDGET = 420
// A rendered blank occupies roughly this many characters of line width.
const BLANK_COST = 12

type Heading = Extract<Block, { b: 'heading' }>

const headingLevel = (b: Heading): 1 | 2 => b.level ?? 1

export function fillablePreviewBlocks(
  def: FillableDefinition,
  resolved: ResolvedVariables,
): PreviewBlock[] {
  const out: PreviewBlock[] = []

  const headings = def.blocks
    .map((b, i) => ({ b, i }))
    .filter((x): x is { b: Heading; i: number } => x.b.b === 'heading')

  const title = headings.find((h) => headingLevel(h.b) === 1) ?? headings[0]
  const kicker = title
    ? [...headings].reverse().find((h) => h.i < title.i)
    : undefined

  if (kicker) {
    const text = headingText(kicker.b.runs, resolved)
    if (text) out.push({ p: 'kicker', text })
  }
  if (title) {
    const text = headingText(title.b.runs, resolved)
    if (text) out.push({ p: 'title', text })
  }

  let budget = CHAR_BUDGET
  let taken = 0
  for (const b of def.blocks.slice(title ? title.i + 1 : 0)) {
    if (taken >= MAX_PARAGRAPHS || budget <= 0) break
    if (b.b !== 'paragraph') continue
    const runs = trimRuns(previewRuns(b.runs, resolved), budget)
    if (runs.length === 0) continue
    out.push({ p: 'paragraph', runs })
    budget -= runsLength(runs)
    taken += 1
  }

  const labels = signatureBlocks(def).slice(0, MAX_SIGNATURES).map((s) => s.roleLabel)
  if (labels.length > 0) out.push({ p: 'signatures', labels })

  return out
}

// Guarded lookup: standard_key comes from the database, so a prototype-valued
// key must not resolve to Object.prototype.constructor and crash the render.
export function fillablePreviewFor(
  standardKey: string | null,
  resolved: ResolvedVariables,
): PreviewBlock[] {
  if (!standardKey) return []
  if (!Object.prototype.hasOwnProperty.call(FILLABLE_DEFINITIONS, standardKey)) return []
  return fillablePreviewBlocks(FILLABLE_DEFINITIONS[standardKey], resolved)
}

// Headings collapse to plain text; an unresolved variable simply vanishes
// (a heading with an underline blank in it reads as a mistake, not a form).
function headingText(runs: Run[], resolved: ResolvedVariables): string {
  return runs
    .map((r) => {
      if (r.t === 'text') return r.text
      if (r.t === 'var') return resolved[r.name] ?? ''
      return ''
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

// Paragraph runs keep their blanks — those underlines are what make the
// preview read as a form. An unresolved variable becomes a blank too, so a
// draft with incomplete program details previews instead of leaking a token.
function previewRuns(runs: Run[], resolved: ResolvedVariables): PreviewRun[] {
  const out: PreviewRun[] = []
  const pushText = (text: string) => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.t === 'text') last.text += text
    else out.push({ t: 'text', text })
  }
  for (const r of runs) {
    if (r.t === 'text') pushText(r.text)
    else if (r.t === 'blank') out.push({ t: 'blank' })
    else {
      const v = resolved[r.name]
      if (v) pushText(v)
      else out.push({ t: 'blank' })
    }
  }
  return out
}

function runsLength(runs: PreviewRun[]): number {
  return runs.reduce((n, r) => n + (r.t === 'text' ? r.text.length : BLANK_COST), 0)
}

function trimRuns(runs: PreviewRun[], budget: number): PreviewRun[] {
  const out: PreviewRun[] = []
  let left = budget
  for (const r of runs) {
    if (left <= 0) break
    if (r.t === 'blank') {
      out.push(r)
      left -= BLANK_COST
      continue
    }
    if (r.text.length <= left) {
      out.push(r)
      left -= r.text.length
      continue
    }
    // -1 so the appended ellipsis stays inside the budget the caller granted.
    out.push({ t: 'text', text: r.text.slice(0, Math.max(0, left - 1)).trimEnd() + '…' })
    left = 0
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/fillable-preview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/fillable-preview.ts lib/forms/__tests__/fillable-preview.test.ts
git commit -m "feat(forms): derive a thumbnail preview from a fillable definition"
```

---

### Task 4: Fillable paper component + wire into the card

**Files:**
- Create: `components/forms/FillablePaper.tsx`
- Modify: `lib/forms/card.ts` (add `'fillable-paper'`)
- Modify: `components/forms/TemplateCard.tsx` (new optional `resolvedVars` prop)
- Test: `lib/forms/__tests__/card.test.ts` (update), `components/forms/__tests__/TemplateCard.test.tsx` (update)

**Interfaces:**
- Consumes: `PreviewBlock`, `fillablePreviewFor` from Task 3; `ResolvedVariables`.
- Produces:
  - `<FillablePaper blocks={PreviewBlock[]} />` — `data-testid="fillable-paper"`;
    renders the existing skeleton when `blocks` is empty.
  - `TemplateCard` gains an optional prop:
    `{ vm: TemplateVM; resolvedVars?: ResolvedVariables; onOpen: () => void }`.

- [ ] **Step 1: Update the failing tests**

In `lib/forms/__tests__/card.test.ts`, replace the online case with one that
covers both kinds:

```ts
  it('online renders the paper mini-page regardless of status', () => {
    expect(previewMode(vm({ kind: 'online', template_file_path: null }))).toBe('online-paper')
    expect(previewMode(vm({ kind: 'online', status: 'draft', template_file_path: null }))).toBe('online-paper')
  })

  it('fillable renders its own document mini-page, not the online field paper', () => {
    expect(previewMode(vm({ kind: 'fillable', template_file_path: null }))).toBe('fillable-paper')
    expect(previewMode(vm({ kind: 'fillable', status: 'draft', template_file_path: null }))).toBe('fillable-paper')
  })
```

In `components/forms/__tests__/TemplateCard.test.tsx`, append:

```ts
  it('fillable card renders the document title and a signature label', () => {
    renderWithIntl(<TemplateCard
      vm={vm({ kind: 'fillable', standard_key: 'decharge', name: 'Décharge de responsabilité', template_file_path: null })}
      resolvedVars={{ exchange_name: 'France–Canada 2026', association_name: 'Les Amis du Lycée' }}
      onOpen={() => {}}
    />)
    expect(screen.getByTestId('fillable-paper')).toBeInTheDocument()
    expect(screen.getByText('DÉCHARGE DE RESPONSABILITÉ')).toBeInTheDocument()
    expect(screen.getByText('ÉCHANGE : France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Représentant légal 1')).toBeInTheDocument()
  })

  it('fillable card still renders with no resolved variables (draft exchange)', () => {
    renderWithIntl(<TemplateCard
      vm={vm({ kind: 'fillable', standard_key: 'decharge', name: 'Décharge', status: 'draft', template_file_path: null })}
      onOpen={() => {}}
    />)
    expect(screen.getByText('DÉCHARGE DE RESPONSABILITÉ')).toBeInTheDocument()
  })

  it('fillable card with an unknown standard_key degrades to the skeleton', () => {
    renderWithIntl(<TemplateCard
      vm={vm({ kind: 'fillable', standard_key: null, name: 'Formulaire maison', template_file_path: null })}
      onOpen={() => {}}
    />)
    expect(screen.getByTestId('fillable-paper-skeleton')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/forms/__tests__/card.test.ts components/forms/__tests__/TemplateCard.test.tsx`
Expected: FAIL — `previewMode` returns `'online-paper'` for fillable, and
`data-testid="fillable-paper"` is not found.

- [ ] **Step 3: Create the paper component**

Create `components/forms/FillablePaper.tsx`:

```tsx
import type { PreviewBlock } from '@/lib/forms/fillable-preview'

// « Paper » mini-page for fillable documents: the definition's real title and
// opening paragraphs at thumbnail scale, with inline blanks drawn as brand
// underlines and a signature row at the foot. Presentational only — all
// derivation lives in lib/forms/fillable-preview.ts.
//
// Text is intentionally sub-legible (≈4.3px): at card size the goal is that
// the card reads as a dense legal document, not that anyone reads it.
export function FillablePaper({ blocks }: { blocks: PreviewBlock[] }) {
  if (blocks.length === 0) return <PaperSkeleton />

  return (
    <div data-testid="fillable-paper" className="flex h-full flex-col overflow-hidden">
      {blocks.map((block, i) => {
        if (block.p === 'kicker') {
          return (
            <div key={i} className="mb-0.5 truncate text-[4.6px] font-bold uppercase tracking-[.4px] text-tertiary">
              {block.text}
            </div>
          )
        }
        if (block.p === 'title') {
          return (
            <div key={i} className="mb-1.5 line-clamp-2 text-center text-[6.2px] font-extrabold leading-tight text-navy">
              {block.text}
            </div>
          )
        }
        if (block.p === 'paragraph') {
          return (
            <p key={i} className="mb-1 text-justify text-[4.3px] leading-[1.5] text-muted-foreground">
              {block.runs.map((run, j) =>
                run.t === 'text'
                  ? <span key={j}>{run.text}</span>
                  : <span key={j} aria-hidden="true" className="inline-block w-[22px] border-b border-brand align-baseline" />
              )}
            </p>
          )
        }
        return (
          <div key={i} className="mt-auto flex gap-1.5 border-t border-frame pt-1">
            {block.labels.map((label) => (
              <div key={label} className="min-w-0 flex-1">
                <div className="truncate text-[4px] text-placeholder">{label}</div>
                <div aria-hidden="true" className="h-2 rounded-[1px] border border-frame" />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// Shown when no definition matches the template's standard_key — the same
// neutral lines the card used before this feature existed.
function PaperSkeleton() {
  return (
    <div data-testid="fillable-paper-skeleton" aria-hidden="true" className="flex flex-col gap-1.5">
      <div className="h-1.5 w-4/5 rounded-sm bg-background" />
      <div className="h-1.5 w-3/5 rounded-sm bg-background" />
      <div className="h-1.5 w-4/6 rounded-sm bg-background" />
    </div>
  )
}
```

- [ ] **Step 4: Add the preview mode**

In `lib/forms/card.ts`:

```ts
export type PreviewMode = 'pdf-file' | 'pdf-missing' | 'online-paper' | 'fillable-paper' | 'doc-sticker'
```

and narrow the online branch — `previewMode` must now read:

```ts
export function previewMode(t: Pick<TemplateVM, 'kind' | 'template_file_path'>): PreviewMode {
  if (t.kind === 'fillable') return 'fillable-paper'
  if (t.kind === 'online') return 'online-paper'
  if (t.kind === 'doc') return 'doc-sticker'
  return t.template_file_path ? 'pdf-file' : 'pdf-missing'
}
```

- [ ] **Step 5: Wire the card**

In `components/forms/TemplateCard.tsx`, add the imports:

```tsx
import { FillablePaper } from './FillablePaper'
import { fillablePreviewFor } from '@/lib/forms/fillable-preview'
import type { ResolvedVariables } from '@/lib/forms/fillable/render'
```

Change the signature:

```tsx
export function TemplateCard({ vm, resolvedVars, onOpen }: {
  vm: TemplateVM
  resolvedVars?: ResolvedVariables
  onOpen: () => void
}) {
```

Add the new branch immediately after the `online-paper` branch:

```tsx
        {mode === 'fillable-paper' && (
          <FillablePaper blocks={fillablePreviewFor(vm.standard_key, resolvedVars ?? {})} />
        )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run lib/forms components/forms`
Expected: PASS.

> If an existing `TemplateCard` or `FichiersView` test asserted the old blank
> skeleton for a fillable template, update it to assert the new paper — the
> blank skeleton was the bug this task fixes.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/forms/FillablePaper.tsx components/forms/TemplateCard.tsx \
  lib/forms/card.ts lib/forms/__tests__/card.test.ts \
  components/forms/__tests__/TemplateCard.test.tsx
git commit -m "feat(forms): render fillable documents on their card preview"
```

---

### Task 5: Resolve program variables server-side and thread them down

**Files:**
- Modify: `actions/forms.ts` — `getTemplatesPage()` returns `resolvedVars`
- Modify: `app/(organizer)/forms/page.tsx` — pass it through
- Modify: `components/forms/FichiersView.tsx` — accept and forward it
- Test: `components/forms/__tests__/FichiersView.test.tsx` (update)

**Interfaces:**
- Consumes: `resolveVariables`, `ResolvedVariables`, `ProgramDetailsValues`.
- Produces: `getTemplatesPage()`'s return type gains `resolvedVars: ResolvedVariables`;
  `FichiersView` gains an optional `resolvedVars?: ResolvedVariables` prop.

Until this task lands, every fillable card previews with blanks where its
program variables belong. Tasks 3 and 4 are correct without it — this is what
makes the preview show the real exchange name, destination and dates.

- [ ] **Step 1: Write the failing test**

In `components/forms/__tests__/FichiersView.test.tsx`, append inside the top-level
`describe`:

```ts
  it('forwards resolved program variables to fillable cards', () => {
    renderWithIntl(<FichiersView
      exchangeId="ex-1"
      templates={[vm({
        id: 'f1', kind: 'fillable', standard_key: 'decharge',
        name: 'Décharge de responsabilité', template_file_path: null,
      })]}
      enrolledStudents={[]}
      resolvedVars={{ exchange_name: 'France–Canada 2026' }}
    />)
    expect(screen.getByText('ÉCHANGE : France–Canada 2026')).toBeInTheDocument()
  })
```

> Reuse whatever `vm()` factory and render helper that file already defines. If
> it has none, copy the `vm()` factory from
> `components/forms/__tests__/TemplateCard.test.tsx` verbatim.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/FichiersView.test.tsx`
Expected: FAIL — TypeScript rejects the unknown `resolvedVars` prop, and the
kicker text is not found.

- [ ] **Step 3: Return the resolved variables from the loader**

In `actions/forms.ts`, **extend the existing import on line 14** rather than
adding a second statement for the same module (`no-duplicate-imports`). It
currently reads:

```ts
import { missingDetailLabels } from '@/lib/forms/fillable/render'
```

Change it to:

```ts
import { missingDetailLabels, resolveVariables, type ResolvedVariables } from '@/lib/forms/fillable/render'
```

`ProgramDetailsValues` is already imported on line 15 for the activation gate —
do not import it again.

In `getTemplatesPage()`, add `resolvedVars: ResolvedVariables` to the declared
return type, then fetch the details row in the existing `Promise.all` so it
costs no extra round trip:

```ts
  const [{ data: templates }, { data: enrollments }, { data: details }] = await Promise.all([
    supabase
      .from('form_templates')
      .select('id, kind, status, audience, name, description, deadline, standard_key, condition_label, template_file_path, external_url, form_fields(label, "order")')
      .eq('exchange_id', exchangeId)
      .eq('school_id', schoolId)
      .order('created_at'),
    supabase.from('exchange_enrollments').select('user_id').eq('exchange_id', exchangeId),
    supabase
      .from('exchange_program_details').select('*')
      .eq('exchange_id', exchangeId).maybeSingle<ProgramDetailsValues>(),
  ])
```

Then extend the return statement:

```ts
  return {
    templates: vms,
    studentCount: enrolledStudents.length,
    enrolledStudents,
    exchangeName: exchange.name,
    resolvedVars: resolveVariables({ exchangeName: exchange.name, details: details ?? null }),
  }
```

- [ ] **Step 4: Thread it through the page and the view**

In `app/(organizer)/forms/page.tsx`:

```tsx
  const { templates, enrolledStudents, resolvedVars } = await getTemplatesPage(active.id)
  return (
    <FichiersView exchangeId={active.id} templates={templates}
      enrolledStudents={enrolledStudents} resolvedVars={resolvedVars} />
  )
```

In `components/forms/FichiersView.tsx`, add the import:

```tsx
import type { ResolvedVariables } from '@/lib/forms/fillable/render'
```

extend the props:

```tsx
export function FichiersView({
  exchangeId, templates, enrolledStudents, resolvedVars,
}: {
  exchangeId: string
  templates: TemplateVM[]
  enrolledStudents: { id: string; full_name: string }[]
  resolvedVars?: ResolvedVariables
}) {
```

and pass it on **both** `TemplateCard` call sites (the Formulaires grid and the
Documents grid) — the Documents grid ignores it, but keeping the two call sites
identical stops them drifting:

```tsx
            <TemplateCard key={tpl.id} vm={tpl} resolvedVars={resolvedVars} onOpen={() => setOpenId(tpl.id)} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run components/forms lib/forms actions`
Expected: PASS.

> `getTemplatesPage`'s return shape changed, so any test that mocks it must
> also return `resolvedVars`. If a suite fails with `resolvedVars is undefined`,
> add `resolvedVars: {}` to that mock's return value.

- [ ] **Step 6: Run the full gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: lint clean, all suites pass, no type errors, build succeeds.

> If `pnpm test` reports failures from files under `.claude/worktrees/`, those
> belong to a sibling worktree, not this change. Re-run scoped:
> `pnpm vitest run --exclude '**/.claude/**'`.

- [ ] **Step 7: Commit**

```bash
git add actions/forms.ts app/\(organizer\)/forms/page.tsx \
  components/forms/FichiersView.tsx components/forms/__tests__/FichiersView.test.tsx
git commit -m "feat(forms): resolve program variables once for fillable previews"
```

---

## Manual verification (after Task 5)

`pnpm dev`, sign in as an organizer, open **Fichiers**:

1. Each document card under « Documents demandés » shows a distinct sticker;
   Passeport, Passeport parent and ESTA differ from each other.
2. Add a custom document named « Attestation d'assurance » from the library or
   the editor — it shows the shield, not the generic page.
3. Each of the four fillable forms shows a readable-looking mini document with
   its real title, not grey lines.
4. With program details filled in (Réglages → Programme), the Décharge card's
   kicker shows the real exchange name and its first paragraph shows the real
   association and destination.
5. Attached-PDF cards still show their real page-1 thumbnail — this change must
   not have disturbed `TemplateThumbnail`.

## Out of scope

Student-side `DossierView`, the `pdf` and `online` preview modes, any schema or
RLS change, and any organizer-facing control over which sticker a document gets.
