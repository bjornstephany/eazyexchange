# i18n consistency sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the three defect classes the i18n sweep found — hints that mix
two languages, dates hardcoded to `fr-FR` on localized surfaces, and message
catalogue rot — and add guards so they cannot come back.

**Architecture:** `lib/dates.ts` gains a locale-explicit API (`shortDate`,
`longDate`) with **no default locale**, so every call site must state which
language it is rendering; UI call sites pass the active locale (`useLocale()` on
the client, `getLocale()` on the server), French-email call sites pass the
literal `'fr'`. French legal artefacts stay `fr-FR` and gain a comment saying
why. The three mixed-language hints keep their French example but explain *why*
it is French. Catalogue hygiene is enforced by two new guards in the existing
parity test.

**Tech Stack:** Next.js 14 App Router, next-intl (5 locales: `en fr es it de`),
vitest + @testing-library/react, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-25-i18n-consistency-design.md`
**Branch:** `fix/i18n-consistency` (existing worktree, off `main` @ `4a04484`)

## Global Constraints

- **Package manager is pnpm**, never npm.
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- **Confirm the branch before every commit**: `git branch --show-current` must
  print `fix/i18n-consistency`.
- **French copy uses typographic apostrophes `’` (U+2019), never ASCII `'`.**
  This is the whole point of Task 6; do not regress it in any other task.
- Quote-character convention per locale (enforced by a guard in Task 6):
  | locale | convention |
  |---|---|
  | en | `“ ”` |
  | fr | `« … »` (inner spaces) |
  | es, it | `«…»` (no inner spaces) |
  | de | `„ “` |
- The **French example inside the three hints is load-bearing and never
  translated** — it is copied verbatim into a French document. Only the sentence
  around it changes.
- `messages/fr.json` is the reference catalogue: `messages/__tests__/parity.test.ts`
  asserts every other locale has the exact same key set. **Any key added or
  deleted must be added or deleted in all five files.**
- No migration, no RLS policy, no storage bucket is touched → `pnpm test:rls` is
  **not** required for this branch.
- Verification gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`.

## Measured reference values (Node 22 / ICU, same as CI)

These are the real `Intl.DateTimeFormat` outputs for `2026-09-18`, measured in
this repo. Use them for test assertions; do not guess.

| locale (BCP-47) | short | short + year | long |
|---|---|---|---|
| en (`en-GB`) | `18 Sept` | `18 Sept 2026` | `18 September 2026` |
| fr (`fr`) | `18 sept.` → stripped to `18 sept` | `18 sept. 2026` | `18 septembre 2026` |
| es (`es`) | `18 sept` | `18 sept 2026` | `18 de septiembre de 2026` |
| it (`it`) | `18 set` | `18 set 2026` | `18 settembre 2026` |
| de (`de`) | `18. Sept.` (period **kept**) | `18. Sept. 2026` | `18. September 2026` |

---

## Task 1: Locale-explicit date helpers

**Files:**
- Modify: `lib/dates.ts` (adds two exports; the old two stay until Task 4)
- Test: `lib/__tests__/dates.test.ts`

**Interfaces:**
- Consumes: `Locale` from `@/lib/i18n/config` (`'en' | 'fr' | 'es' | 'it' | 'de'`).
- Produces:
  ```ts
  export function shortDate(iso: string | null, locale: Locale, opts?: { year?: boolean }): string
  export function longDate(iso: string | null, locale: Locale): string
  ```
  Tasks 2–4 call exactly these signatures. There is **no default locale** — a
  default is what let the original bug spread silently.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/dates.test.ts` (leave the existing `frShortDate` /
`fullDate` describes in place — Task 4 removes them):

```ts
import { frShortDate, fullDate, shortDate, longDate } from '@/lib/dates'

describe('shortDate', () => {
  it('strips the trailing period in fr only', () => {
    expect(shortDate('2026-09-18', 'fr')).toBe('18 sept')
    // German conventionally keeps the period on an abbreviated month.
    expect(shortDate('2026-09-18', 'de')).toMatch(/\.$/)
    expect(shortDate('2026-09-18', 'de')).toContain('18.')
  })
  it('keeps a mid-string period when the year follows', () => {
    expect(shortDate('2026-09-18', 'fr', { year: true })).toBe('18 sept. 2026')
  })
  it('renders en day-month-first via en-GB, never month-first', () => {
    expect(shortDate('2026-09-18', 'en')).toMatch(/^18 Sep/)
    expect(shortDate('2026-09-18', 'en', { year: true })).toMatch(/^18 Sep\w* 2026$/)
  })
  it('renders es and it in their own language', () => {
    expect(shortDate('2026-09-18', 'es')).toBe('18 sept')
    expect(shortDate('2026-09-18', 'it')).toBe('18 set')
  })
  it('accepts a full timestamptz', () => {
    expect(shortDate('2026-09-18T12:00:00.000+00:00', 'fr', { year: true })).toBe('18 sept. 2026')
  })
  it('returns an empty string for null, empty and invalid input', () => {
    expect(shortDate(null, 'fr', { year: true })).toBe('')
    expect(shortDate('', 'de')).toBe('')
    expect(shortDate('not-a-date', 'en')).toBe('')
  })
})

describe('longDate', () => {
  it('formats each locale in its own language', () => {
    expect(longDate('2026-09-18', 'fr')).toBe('18 septembre 2026')
    expect(longDate('2026-09-18', 'de')).toBe('18. September 2026')
    expect(longDate('2026-09-18', 'it')).toBe('18 settembre 2026')
    expect(longDate('2026-09-18', 'es')).toBe('18 de septiembre de 2026')
    expect(longDate('2026-09-18', 'en')).toBe('18 September 2026')
  })
  it('accepts a full timestamptz', () => {
    expect(longDate('2026-09-18T12:00:00.000+00:00', 'fr')).toBe('18 septembre 2026')
  })
  it('returns an empty string for null, empty and invalid input', () => {
    expect(longDate(null, 'fr')).toBe('')
    expect(longDate('', 'fr')).toBe('')
    expect(longDate('not-a-date', 'fr')).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/__tests__/dates.test.ts`
Expected: FAIL — `shortDate is not a function` / import error.

- [ ] **Step 3: Implement the new helpers**

Replace the header of `lib/dates.ts` and append the two functions (keep
`frShortDate` and `fullDate` exactly as they are for now):

```ts
// Locale date helpers shared across UI and email. No React, no Supabase.

import type { Locale } from '@/lib/i18n/config'

// BCP-47 tag per app locale. `en` maps to en-GB so dates read day-month like
// the rest of the product (see lib/pdf/application-recap.tsx); every other
// locale uses its bare tag.
const BCP47: Record<Locale, string> = {
  en: 'en-GB', fr: 'fr', es: 'es', it: 'it', de: 'de',
}

function parse(iso: string | null): Date | null {
  if (!iso) return null
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? null : date
}

// "12 sept" style short date in the CALLER'S locale, or "12 sept. 2026" with
// { year: true }; empty string for null/invalid input. The locale is explicit
// and has no default on purpose — a default is how dates silently ended up
// French on every localized surface.
//
// The trailing-period strip is fr-only: French renders « 18 sept. » where the
// design wants « 18 sept », while German conventionally keeps the period on an
// abbreviated month, so stripping it there would be a new defect. Only a
// *trailing* period is stripped, so the abbreviation keeps its period when a
// year follows it.
export function shortDate(iso: string | null, locale: Locale, opts?: { year?: boolean }): string {
  const date = parse(iso)
  if (!date) return ''
  const formatted = new Intl.DateTimeFormat(BCP47[locale], {
    day: 'numeric', month: 'short', ...(opts?.year ? { year: 'numeric' } : {}),
  }).format(date)
  return locale === 'fr' ? formatted.replace(/\.$/, '') : formatted
}

// "12 septembre 2026" style long date in the caller's locale; empty string for
// null/invalid input. Used for tooltips where the year matters and space does not.
export function longDate(iso: string | null, locale: Locale): string {
  const date = parse(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat(BCP47[locale], { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/__tests__/dates.test.ts`
Expected: PASS — the new describes and the two legacy ones.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print fix/i18n-consistency
git add lib/dates.ts lib/__tests__/dates.test.ts
git commit -m "feat(i18n): locale-explicit shortDate/longDate helpers"
```

---

## Task 2: Six organizer client surfaces render dates in the active locale

**Files:**
- Modify: `components/dashboard/OverviewView.tsx` (3 call sites)
- Modify: `components/applications/InvitationPanel.tsx`
- Modify: `components/applications/CandidaturesView.tsx`
- Modify: `components/dashboard/StudentDrawer.tsx`
- Modify: `components/documents/DocDrawer.tsx`
- Modify: `components/settings/ProgramCard.tsx`
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: `shortDate(iso, locale, opts?)` and `longDate(iso, locale)` from
  `@/lib/dates` (Task 1); `useLocale()` from `next-intl`, which returns the
  active locale string inside `NextIntlClientProvider`.
- Produces: nothing new; these are leaf components.

All six are `'use client'` components already calling `useTranslations`, and all
six render inside the organizer layout's `NextIntlClientProvider`, so
`useLocale()` is available. Cast it once per component:
`const locale = useLocale() as Locale`.

- [ ] **Step 1: Write the failing test**

Add to `components/dashboard/__tests__/OverviewView.test.tsx` — import the German
catalogue at the top of the file, next to the existing imports:

```ts
import de from '@/messages/de.json'
```

and add this test inside the `describe('OverviewView — unified lifecycle table')`
block, right after the existing `'shows the response date, with the year, …'` test:

```tsx
  it('renders the response date in the active locale, not French', () => {
    renderWithIntl(<OverviewView {...base} />, { locale: 'de', messages: de })
    expect(screen.getByTitle('18. September 2026')).toHaveTextContent('18. Sept. 2026')
    expect(screen.queryByTitle('18 septembre 2026')).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/dashboard/__tests__/OverviewView.test.tsx`
Expected: FAIL — `Unable to find an element with the title: 18. September 2026`
(the component still formats `fr-FR`).

- [ ] **Step 3: Migrate `components/dashboard/OverviewView.tsx`**

Change the imports: drop `frShortDate` from the `@/lib/dashboard/rollup` import
list, and replace the `@/lib/dates` import:

```ts
import { useLocale, useTranslations } from 'next-intl'
import { longDate, shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```

(`useTranslations` is already imported from `next-intl` — extend that import
rather than adding a second one.)

Inside the component body, next to the existing `const tr = useTranslations…`
line, add:

```ts
  const locale = useLocale() as Locale
```

Then the three call sites:

```tsx
                      title={longDate(row.respondedAt, locale)}
                    >
                      {shortDate(row.respondedAt, locale, { year: true })}
```

```tsx
              {next ? t('dashboard.nextDeadlineSuffix', { date: shortDate(next, locale) }) : ''}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/dashboard/__tests__/OverviewView.test.tsx`
Expected: PASS — including the pre-existing French assertions, because
`renderWithIntl` defaults to `locale: 'fr'`.

- [ ] **Step 5: Migrate the other five components**

`components/applications/InvitationPanel.tsx`:

```ts
import { useLocale, useTranslations } from 'next-intl'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```
```tsx
  const locale = useLocale() as Locale
```
```tsx
        {deadline && <span>{t('panel.deadlineSuffix', { date: shortDate(deadline, locale) })}</span>}
```

`components/applications/CandidaturesView.tsx` — the import currently reads
`import { applicantStatusPill, frShortDate } from '@/lib/dashboard/rollup'`:

```ts
import { applicantStatusPill } from '@/lib/dashboard/rollup'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```
add `const locale = useLocale() as Locale` in the component body (extend the
existing `next-intl` import with `useLocale`), then:
```tsx
                  <span className="text-sm text-navy">{shortDate(a.submitted_at, locale)}</span>
```

`components/dashboard/StudentDrawer.tsx`:
```ts
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```
(delete the `frShortDate` import from `@/lib/dashboard/rollup`; if that import
line has no other names left, delete the line), add
`const locale = useLocale() as Locale`, then:
```tsx
          {subject.rollup.due ? t('dashboard.dueSuffix', { date: shortDate(subject.rollup.due, locale) }) : ''}
```

`components/documents/DocDrawer.tsx`: same import swap and `locale` line, then:
```tsx
{t('documents.drawer.deadlineChip', { date: shortDate(vm.deadline, locale) })}
```

`components/settings/ProgramCard.tsx`: same import swap and `locale` line, then:
```tsx
      ? [t('settings.program.stats.deadline', { date: shortDate(program.earliestDeadline, locale) })]
```

- [ ] **Step 6: Run the affected suites**

Run:
```bash
pnpm vitest run components/dashboard components/applications components/documents components/settings
```
Expected: PASS. The existing French assertions
(`components/settings/__tests__/SettingsView.test.tsx:200,222` → `date limite
dossiers 10 oct`; `components/applications/__tests__/InvitationPanel.test.tsx:25`
→ `date limite 1 sept`) stay green because `renderWithIntl` renders in `fr`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add components/dashboard/OverviewView.tsx components/applications/InvitationPanel.tsx \
        components/applications/CandidaturesView.tsx components/dashboard/StudentDrawer.tsx \
        components/documents/DocDrawer.tsx components/settings/ProgramCard.tsx \
        components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "fix(i18n): organizer surfaces format dates in the active locale"
```

---

## Task 3: Student surfaces and the students directory take a locale

**Files:**
- Modify: `lib/test/serverTranslations.ts` (mock gains `getLocale`)
- Modify: `components/student/DossierView.tsx` (replaces an inline `toLocaleDateString('fr-FR')`)
- Modify: `app/(student)/my-forms/[assignmentId]/page.tsx` (same)
- Modify: `lib/students/directory.ts` (`buildStudentVM` gains a `locale` param)
- Modify: `actions/students.ts:99-108` (passes the resolved locale)
- Test: `lib/students/__tests__/directory.test.ts`
- Test: `components/student/__tests__/DossierView.test.tsx` (no assertion changes; it exercises the new mock)

**Interfaces:**
- Consumes: `shortDate(iso, locale, opts?)` from `@/lib/dates`; `getLocale()`
  from `next-intl/server`.
- Produces:
  ```ts
  export function buildStudentVM(input: {…unchanged…}, t: T, locale: Locale): StudentVM
  ```
  The `locale` is a **third positional parameter, after the translator** — the
  `input` object stays exactly as it is. `actions/students.ts` is its only
  production caller.

- [ ] **Step 1: Write the failing test**

In `lib/students/__tests__/directory.test.ts`, change the `vm` helper (line ~34)
to pass a locale, and add a locale test. Replace the helper:

```ts
function vm(cellMap: CellMap, app: typeof application | null = application): StudentVM {
  return buildStudentVM({ student, application: app, templates, cellMap, avatarIndex: 0, today }, t, 'fr')
}
```

Add this test at the end of the `describe('buildStudentVM')` block:

```ts
  it('formats dueLabel in the caller locale', () => {
    const cellMap: CellMap = { 's1:t3': { assignmentId: 'a3', status: 'draft' } }
    const german = buildStudentVM(
      { student, application, templates, cellMap, avatarIndex: 0, today }, t, 'de',
    )
    expect(german.dueLabel).toContain('3. Okt.')
    expect(german.dueLabel).not.toContain('oct')
  })
```

The two other direct `buildStudentVM(` calls in this file (lines ~118 and ~129)
also need `, t, 'fr')` in place of `, t)`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/students/__tests__/directory.test.ts`
Expected: FAIL — TypeScript/runtime ignores the extra arg and `dueLabel` still
reads `Date limite 3 oct`, so `toContain('3. Okt.')` fails.

- [ ] **Step 3: Add the parameter to `lib/students/directory.ts`**

Imports — drop `frShortDate` from the `@/lib/dashboard/rollup` import and add:

```ts
import { rollupStudent, type CellMap, type Pill, type TemplateInfo } from '@/lib/dashboard/rollup'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```

Signature (line ~104) and the one call site (line ~189):

```ts
export function buildStudentVM(input: {
  student: { id: string; full_name: string; email: string }
  application: { id: string; data: Record<string, string>; photoUrl?: string | null } | null
  templates: DirectoryTemplate[]
  cellMap: CellMap
  avatarIndex: number
  today?: Date
}, t: T, locale: Locale): StudentVM {
```
```ts
    dueLabel: rollup.due ? t('organizer.students.dueLabel', { date: shortDate(rollup.due, locale) }) : null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/students/__tests__/directory.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass the locale from the server action**

In `actions/students.ts`, extend the `next-intl/server` import and replace the
`const tr = await getTranslations()` block (lines ~99-108):

```ts
import { getLocale, getTranslations } from 'next-intl/server'
```
```ts
  const dirTemplates = (templates ?? []) as DirectoryTemplate[]
  const [tr, locale] = await Promise.all([getTranslations(), getLocale()])
  const vms = students.map((s, i) =>
    buildStudentVM({
      student: s,
      application: appByStudent.get(s.id) ?? null,
      templates: dirTemplates,
      cellMap,
      avatarIndex: i,
    }, tr, locale as Locale)
  )
```

Add the type import at the top of the file:
```ts
import type { Locale } from '@/lib/i18n/config'
```

- [ ] **Step 6: Teach the server-translations test mock about `getLocale`**

`lib/test/serverTranslations.ts` — nine test files mock `next-intl/server` with
this object, and two of them (`DossierView.test.tsx`, and any future page test)
now render components that call `getLocale()`. Add it:

```ts
export const serverTranslationsMock = {
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: 'fr', messages: fr, namespace } as never),
  // Components under test render French by default, matching renderWithIntl.
  getLocale: async () => 'fr',
}
```

- [ ] **Step 7: Migrate the two student surfaces**

`components/student/DossierView.tsx` — delete the local `formatDate` helper
(lines 7-9) and its `fr-FR` call, import instead:

```ts
import { getLocale, getTranslations } from 'next-intl/server'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```

In the async component body, next to the two `getTranslations` awaits (line ~23),
add:

```ts
  const locale = (await getLocale()) as Locale
```

`formatDate(...)` is called in `TodoCard` (twice, lines ~36-37) and once at line
~76. `TodoCard` is a plain function component receiving props, so thread the
locale through it rather than reaching for a hook:

```tsx
function TodoCard({ item, showTag, t, c, locale }: {
  item: DossierItem; showTag: boolean; t: AppTranslator; c: AppTranslator; locale: Locale
}) {
```
```tsx
            {item.overdue
              ? t('dossier.card.overdue', { date: shortDate(item.deadline, locale) })
              : t('dossier.card.deadline', { date: shortDate(item.deadline, locale) })}
```
and at line ~76:
```tsx
{t('dossier.nextDeadline', { date: shortDate(nextDeadline, locale) })}
```
Every `<TodoCard … />` render in this file gains `locale={locale}`.

`app/(student)/my-forms/[assignmentId]/page.tsx` — extend the `next-intl/server`
import, add the two imports, and resolve the locale in the existing
`Promise.all` (lines 20-23):

```ts
import { getLocale, getTranslations } from 'next-intl/server'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
```
```ts
  const [{ template, submission }, t, locale] = await Promise.all([
    getAssignmentDetails(assignmentId),
    getTranslations('student'),
    getLocale(),
  ])
```
and line ~80:
```tsx
              {t('assignment.deadline', { date: shortDate(template.deadline, locale as Locale) })}
```

- [ ] **Step 8: Run the affected suites**

Run:
```bash
pnpm vitest run components/student lib/students actions/__tests__
```
Expected: PASS — `DossierView.test.tsx` keeps its French date assertions because
the mock resolves `'fr'`.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add lib/test/serverTranslations.ts components/student/DossierView.tsx \
        "app/(student)/my-forms/[assignmentId]/page.tsx" lib/students/directory.ts \
        actions/students.ts lib/students/__tests__/directory.test.ts
git commit -m "fix(i18n): student dossier, assignment page and directory take a locale"
```

---

## Task 4: French artefacts pass `'fr'` literally; retire the old API

**Files:**
- Modify: `lib/email.ts` (3 call sites)
- Modify: `lib/good-news-template.ts` (3 call sites)
- Modify: `lib/dates.ts` (delete `frShortDate`, `fullDate`)
- Modify: `lib/dashboard/rollup.ts` (delete the `frShortDate` import + re-export, delete `p()`)
- Modify: `lib/dashboard/__tests__/rollup.test.ts` (drop the moved-out cases)
- Modify: `lib/__tests__/dates.test.ts` (drop the legacy describes)
- Modify (comment only): `lib/forms/fillable/render.ts`, `lib/pdf/fillable-pdf.tsx`,
  `components/FillableForm.tsx`, `components/legal/LegalDocumentView.tsx`

**Interfaces:**
- Consumes: `shortDate(iso, locale, opts?)` from `@/lib/dates`.
- Produces: after this task `@/lib/dates` exports **only** `shortDate` and
  `longDate`; `@/lib/dashboard/rollup` no longer re-exports any date helper and
  no longer exports `p`.

- [ ] **Step 1: Point the French email builders at the new API**

`lib/email.ts` — replace the import and the three call sites. The literal `'fr'`
is the point: these are French emails and say so.

```ts
import { shortDate } from '@/lib/dates'
```
```ts
  const due = opts.deadline ? ` avant le <strong>${esc(shortDate(opts.deadline, 'fr'))}</strong>` : ''
```
```ts
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — date limite ${esc(shortDate(i.deadline, 'fr'))}` : ''}</li>`
```
(the last pattern appears twice — in `sendStudentReminderEmail` and
`sendChecklistEmail`; change both).

`lib/good-news-template.ts`:

```ts
import { shortDate } from '@/lib/dates'
```
```ts
  const period = blank(d.travel_start) || blank(d.travel_end)
    ? null
    : `du ${shortDate(d.travel_start, 'fr', { year: true })} au ${shortDate(d.travel_end, 'fr', { year: true })}`
```
```ts
    '{{confirmation_deadline}}': blank(d.confirmation_deadline)
      ? null
      : shortDate(d.confirmation_deadline, 'fr', { year: true }),
```

- [ ] **Step 2: Delete the old exports**

`lib/dates.ts` — delete the whole `frShortDate` function and the whole
`fullDate` function. Nothing else in the file changes.

`lib/dashboard/rollup.ts` — delete these three fragments:

```ts
import { frShortDate } from '@/lib/dates'          // line 4
```
```ts
// Re-export: dashboard components historically import frShortDate from here.
export { frShortDate }                              // lines 16-17
```
```ts
// French pluralization helper: 's' when n > 1, else ''.
export function p(n: number): string {              // lines 35-38
  return n > 1 ? 's' : ''
}
```
`p()` has no importers; ICU `plural` in the catalogues is the real mechanism.

- [ ] **Step 3: Drop the orphaned tests**

`lib/dashboard/__tests__/rollup.test.ts` — remove `frShortDate,` and `p,` from
the import list (lines 5 and 10), and delete these four cases from the
`describe('copy builders')` block (lines ~146-159): `'frShortDate strips the
dot'`, `'frShortDate accepts timestamptz input…'`, `'frShortDate guards invalid
dates'`, `'p pluralizes only above 1'`. Their coverage now lives in
`lib/__tests__/dates.test.ts`. If the `describe('copy builders')` block ends up
empty, delete the block too.

`lib/__tests__/dates.test.ts` — delete the `describe('frShortDate', …)` and
`describe('fullDate', …)` blocks and reduce the import to:

```ts
import { shortDate, longDate } from '@/lib/dates'
```

- [ ] **Step 4: Comment the four French legal artefacts**

These four deliberately stay on `fr-FR`: they render French documents whose
dates must be French regardless of who is looking at them. Add a one-line
comment above each so the next sweep does not "fix" them.

`lib/forms/fillable/render.ts` (above line 9):
```ts
// fr-FR on purpose: these formatters build French legal text inside a French
// document — the date's language does not follow the viewer's UI locale.
```
`lib/pdf/fillable-pdf.tsx` (above the `SIGNED_AT` const, line ~46) and
`components/FillableForm.tsx` (above the `SIGNED_AT` const, line ~25):
```ts
// fr-FR on purpose: the signature line is part of a French document, not UI chrome.
```
`components/legal/LegalDocumentView.tsx` (above line 22):
```ts
  // fr-FR on purpose: the legal documents themselves are French-only.
```

- [ ] **Step 5: Verify the whole suite**

Run:
```bash
pnpm vitest run
grep -rn "frShortDate\|fullDate(" --include=*.ts --include=*.tsx app components lib actions | grep -v node_modules
```
Expected: all tests PASS; the grep prints **only**
`supabase/functions/send-reminders/email-copy.ts` matches (its own local
`frShortDate`, unreachable from the `@/` alias — Phase 4, out of scope) and
nothing under `app/`, `components/`, `lib/` or `actions/`.
`lib/__tests__/student-reminder-email.test.ts:29` (`expect(html).toContain('10 oct')`)
must still pass — the email call sites pass `'fr'`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add lib/email.ts lib/good-news-template.ts lib/dates.ts lib/dashboard/rollup.ts \
        lib/dashboard/__tests__/rollup.test.ts lib/__tests__/dates.test.ts \
        lib/forms/fillable/render.ts lib/pdf/fillable-pdf.tsx components/FillableForm.tsx \
        components/legal/LegalDocumentView.tsx
git commit -m "refactor(i18n): retire frShortDate/fullDate, French emails pass 'fr' explicitly"
```

---

## Task 5: Hints say why their example is French

**Files:**
- Modify: `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `messages/__tests__/parity.test.ts` (one new assertion)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — `messages/fr.json` is deliberately **not** touched here
  (telling a French organizer to write in French is noise), so the parity key
  set is unchanged.

**Why:** `destination` and `absence_dates` are copied verbatim into French legal
text by `lib/forms/fillable/render.ts`; `payment_details` is substituted into
the French « Bonne nouvelle » email by `lib/good-news-template.ts`. A German
organizer who types German there produces a broken French document. The example
stays French in every locale; the sentence around it now explains why. This task
also clears the last two stray guillemets in `en`, which the Task 6 guard
requires.

- [ ] **Step 1: Write the failing test**

Add to `messages/__tests__/parity.test.ts`, inside the top-level `describe`:

```ts
  it('the French-example hints name the constraint in every non-fr locale', () => {
    const constraint: Record<string, string> = {
      en: 'written in French', es: 'en francés', it: 'in francese', de: 'auf Französisch',
    }
    for (const [locale, phrase] of Object.entries(constraint)) {
      const l = leaves(catalogs[locale])
      for (const key of ['destinationHint', 'absenceDatesHint', 'paymentDetailsHint']) {
        const value = l[`organizer.settings.programDetails.${key}`]
        expect(value, `${locale}.${key}`).toContain(phrase)
        // The French example itself is load-bearing and stays verbatim.
        expect(value, `${locale}.${key}`).toMatch(/le Minnesota|le jeudi 19 octobre 2026|chèque à l’ordre/)
      }
    }
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: FAIL — `en.destinationHint` does not contain `written in French`.

- [ ] **Step 3: Rewrite the six hint values**

Replace these exact values under `organizer.settings.programDetails` in each
file. Copy them character for character — the quote characters and the
typographic apostrophe `’` inside the French examples are both load-bearing.

`messages/en.json`:
```json
"destinationHint": "Written in French — copied word-for-word into the French exchange forms. E.g. “le Minnesota, USA”.",
"absenceDatesHint": "One day per line, written in French — copied word-for-word into the French absence form. E.g. “le jeudi 19 octobre 2026”.",
"paymentDetailsHint": "Payment link or instructions, written in French — copied word-for-word into the French acceptance email. E.g. “chèque à l’ordre de l’association”."
```

`messages/es.json`:
```json
"destinationHint": "Tal como aparecerá en los formularios, en francés — se copia literalmente en los formularios franceses. P. ej. «le Minnesota, USA»",
"absenceDatesHint": "Un día por línea, en francés — se copia literalmente en el formulario francés de ausencia. P. ej. «le jeudi 19 octobre 2026»",
"paymentDetailsHint": "Enlace de pago o modalidades, en francés — se copia literalmente en el correo francés de aceptación. P. ej. «chèque à l’ordre de l’association»"
```

`messages/it.json`:
```json
"destinationHint": "Come apparirà nei moduli, in francese — viene copiato alla lettera nei moduli francesi. Es. «le Minnesota, USA»",
"absenceDatesHint": "Un giorno per riga, in francese — viene copiato alla lettera nel modulo francese di assenza. Es. «le jeudi 19 octobre 2026»",
"paymentDetailsHint": "Link di pagamento o modalità, in francese — viene copiato alla lettera nell’e-mail francese di accettazione. Es. «chèque à l’ordre de l’association»"
```

`messages/de.json`:
```json
"destinationHint": "Auf Französisch — der Text wird unverändert in die französischen Austauschformulare übernommen. Z. B. „le Minnesota, USA“.",
"absenceDatesHint": "Ein Tag pro Zeile, auf Französisch — der Text wird unverändert in das französische Abwesenheitsformular übernommen. Z. B. „le jeudi 19 octobre 2026“.",
"paymentDetailsHint": "Zahlungslink oder Modalitäten, auf Französisch — der Text wird unverändert in die französische Zusage-E-Mail übernommen. Z. B. „chèque à l’ordre de l’association“."
```

Note the `es`/`it`/`de` `paymentDetailsHint` examples change language: they
previously showed a Spanish / Italian / German cheque instruction, which is
exactly the trap — that text lands verbatim in a French email.

- [ ] **Step 4: Clear the last two stray guillemets in `en`**

The Task 6 guard requires `en` to contain no `«`/`»`. Two `en` values outside the
hints still do. Replace them in `messages/en.json` (the French phrase « Bonne
nouvelle » is the email's actual name and stays — only the quote marks change):

```json
"maybeDesc": "“Maybe” replies to follow up with families.",
"goodNewsBlock.title": "“Bonne nouvelle” email is incomplete"
```
i.e. `organizer.dashboard.actionCards.maybeDesc` and
`organizer.applications.goodNewsBlock.title`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS — the new assertion plus every pre-existing parity check (key
sets, ICU args, no empties) still green.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add messages/en.json messages/es.json messages/it.json messages/de.json \
        messages/__tests__/parity.test.ts
git commit -m "fix(i18n): hints explain why their example must stay French"
```

---

## Task 6: Catalogue hygiene + two new guards

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Modify: `lib/good-news-template.ts` (`DEFAULT_GOOD_NEWS_BODY`)
- Modify: `components/dashboard/__tests__/OverviewView.test.tsx` (4 assertions)
- Modify: `components/applications/__tests__/InviteByEmailDialog.test.tsx` (1 assertion)
- Test: `messages/__tests__/parity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — key deletions only, applied identically to all five files
  so parity holds.

- [ ] **Step 1: Write the two failing guards**

Add to `messages/__tests__/parity.test.ts`, inside the top-level `describe`:

```ts
  // The five existing apostrophe guards (landing content, fillable definitions,
  // dossier sublines, lib/email.ts, the reminder edge function) never covered
  // the catalogues, which is how 14 ASCII apostrophes accumulated in fr.
  it('fr uses typographic apostrophes only', () => {
    const offenders = Object.entries(leaves(fr))
      .filter(([, v]) => /\p{L}'\p{L}/u.test(v))
      .map(([k]) => k)
    expect(offenders).toEqual([])
  })

  // Quote convention per locale. Deterministic, and it is the tell that catches
  // a French fragment pasted into a non-French value — the shape of the original
  // mixed-language bug. The French EXAMPLES inside the programDetails hints are
  // quoted with each locale's own marks, so they do not trip this.
  it('each locale uses its own quote characters', () => {
    for (const locale of ['en', 'de'] as const) {
      const offenders = Object.entries(leaves(catalogs[locale]))
        .filter(([, v]) => /[«»]/.test(v)).map(([k]) => k)
      expect(offenders, `${locale} must not use guillemets`).toEqual([])
    }
    for (const locale of ['fr', 'es', 'it'] as const) {
      const offenders = Object.entries(leaves(catalogs[locale]))
        .filter(([, v]) => /„/.test(v)).map(([k]) => k)
      expect(offenders, `${locale} must not use German quotes`).toEqual([])
    }
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: the apostrophe guard FAILS with 14 offending keys; the quote guard
PASSES (Task 5 already cleared `en` and `de`). If the quote guard fails, Task 5
was applied incompletely — fix that first.

- [ ] **Step 3: Fix the 14 ASCII apostrophes in `messages/fr.json`**

Replace `'` with `’` in exactly these 14 values (left column is the key path;
the replacement is the same string with typographic apostrophes):

| key | corrected value |
|---|---|
| `organizer.dataPrivacy.subtitle` | `Supprimez ou exportez les données d’une personne sur demande (RGPD).` |
| `organizer.dataPrivacy.exportError` | `L’export a échoué. Réessayez.` |
| `organizer.dashboard.overviewTitle` | `Vue d’ensemble` |
| `organizer.dashboard.progressLabel` | `Progression de l’échange` |
| `organizer.dashboard.autoReminderHint` | `Relances automatiques quotidiennes à l’approche de la date limite.` |
| `organizer.applications.invite.notOpenError` | `Ouvrez d’abord les candidatures et fixez une date limite.` |
| `organizer.applications.invite.tooManyError` | `Trop d’adresses (200 maximum par envoi).` |
| `organizer.applications.notePlaceholder` | `Note pour l’élève (facultatif)` |
| `apply.sections.hosting.title` | `Conditions d’accueil` |
| `apply.sections.profile.title` | `Profil de l’élève` |
| `apply.fields.lived_abroad.label` | `Si vous avez déjà vécu à l’étranger, décrivez où et quand` |
| `apply.fields.instruments.label` | `Jouez-vous d’un instrument ou chantez-vous ?` |
| `apply.fields.adjectives.label` | `Trois adjectifs qu’un ami proche utiliserait pour vous décrire` |
| `apply.fields.share_when_hosting.label` | `Que souhaiteriez-vous partager avec votre correspondant en l’accueillant ?` |

Two test files assert two of these strings verbatim and must be updated in the
same commit:
- `components/dashboard/__tests__/OverviewView.test.tsx` lines 28, 142, 147, 153:
  `"Vue d'ensemble"` → `'Vue d’ensemble'` (4 occurrences).
- `components/applications/__tests__/InviteByEmailDialog.test.tsx`: the
  `Ouvrez d'abord…` assertion → `Ouvrez d’abord…`.

- [ ] **Step 4: Fix the 3 ASCII apostrophes in the good-news default template**

`lib/good-news-template.ts`, inside `DEFAULT_GOOD_NEWS_BODY` — French copy in a
real outbound email, covered by no guard today. Only schools that never
customized their template are affected; customized rows in the DB are untouched.

```
Nous avons le plaisir de vous annoncer que la candidature de {{student_name}} pour l’échange {{exchange_name}} a été retenue !
```
```
Merci d’indiquer votre décision à l’aide du bouton ci-dessous.`
```

- [ ] **Step 5: Delete the 4 stale keys from all five catalogues**

Verified to have zero references in `app/`, `components/`, `lib/`, `actions/` or
`scripts/`. Delete each from `en`, `fr`, `es`, `it` **and** `de` — 20 entries in
total, or the parity key-set test fails:

- `organizer.dashboard.progressDossiers`
- `organizer.dashboard.progressCandidatures`
- `organizer.forms.pills.missingCount`
- `organizer.forms.pills.toVerifyCount`

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
pnpm vitest run messages components/dashboard components/applications lib/__tests__/good-news-template.test.ts
```
Expected: PASS, including the two new guards.

Then confirm the deletions really are dead:
```bash
grep -rn "progressDossiers\|progressCandidatures\|pills.missingCount\|pills.toVerifyCount" \
  --include=*.ts --include=*.tsx --include=*.mjs . | grep -v node_modules
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json \
        messages/__tests__/parity.test.ts lib/good-news-template.ts \
        components/dashboard/__tests__/OverviewView.test.tsx \
        components/applications/__tests__/InviteByEmailDialog.test.tsx
git commit -m "chore(i18n): catalogue hygiene — stale keys, apostrophes, quote + apostrophe guards"
```

---

## Task 7: The payment-grace banner speaks the organizer's language

**Files:**
- Modify: `components/billing/PaymentWarningBanner.tsx`
- Modify: `app/(organizer)/layout.tsx` (line ~84 render site + the translator)
- Test: `components/billing/__tests__/PaymentWarningBanner.test.tsx` (create)

**Interfaces:**
- Consumes: `organizer.billing.grace.body` and `organizer.billing.grace.cta` —
  both already exist, translated, in all five catalogues. **Zero transcription.**
- Produces:
  ```tsx
  export function PaymentWarningBanner({ body, cta }: { body: string; cta: string })
  ```

The banner is hardcoded English today and renders across the top of the
organizer shell in all five locales. It is a plain (non-`'use client'`)
component rendered from an async server layout, so it cannot call
`useTranslations`. Pass the two resolved strings down as props rather than
making it an async RSC — async-RSC-as-JSX breaks jsdom page tests.

- [ ] **Step 1: Write the failing test**

Create `components/billing/__tests__/PaymentWarningBanner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'

describe('PaymentWarningBanner', () => {
  it('renders the strings it is given, in any language', () => {
    render(<PaymentWarningBanner body="Mettez à jour votre carte." cta="Mettre à jour ma carte" />)
    expect(screen.getByText('Mettez à jour votre carte.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Mettre à jour ma carte' })
    expect(link).toHaveAttribute('href', '/billing/portal')
  })

  it('carries no hardcoded English copy', () => {
    const { container } = render(<PaymentWarningBanner body="Kartendaten aktualisieren." cta="Karte aktualisieren" />)
    expect(container.textContent).not.toContain('Your last payment failed')
    expect(container.textContent).not.toContain('Update payment')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/billing/__tests__/PaymentWarningBanner.test.tsx`
Expected: FAIL — the component takes no props and renders the English literals.

- [ ] **Step 3: Make the banner a pure presentational component**

Replace `components/billing/PaymentWarningBanner.tsx` entirely:

```tsx
import Link from 'next/link'

// Copy is resolved by the caller: this renders inside the organizer server
// layout, which already knows the locale, and a props hand-off keeps the
// component synchronous (async-RSC-as-JSX breaks jsdom page tests).
export function PaymentWarningBanner({ body, cta }: { body: string; cta: string }) {
  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
      {body}{' '}
      <Link href="/billing/portal" className="underline font-medium">{cta}</Link>
    </div>
  )
}
```

- [ ] **Step 4: Resolve the strings in the layout**

`app/(organizer)/layout.tsx` — add the import:

```ts
import { getTranslations } from 'next-intl/server'
```

Next to the existing `const locale = await resolveLocale()` line, add:

```ts
  const tBilling = await getTranslations('organizer.billing')
```

and change the render site (line ~84):

```tsx
          {showGrace && (
            <PaymentWarningBanner body={tBilling('grace.body')} cta={tBilling('grace.cta')} />
          )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run components/billing app/__tests__`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add components/billing/PaymentWarningBanner.tsx "app/(organizer)/layout.tsx" \
        components/billing/__tests__/PaymentWarningBanner.test.tsx
git commit -m "fix(i18n): translate the payment-grace banner"
```

---

## Task 8: `scripts/i18n-audit.mjs` (strike-able)

**Files:**
- Create: `scripts/i18n-audit.mjs`

**Interfaces:**
- Consumes: `messages/*.json` and the source tree; nothing imports it.
- Produces: advisory console output. **Not wired into `pnpm test`** — run it by
  hand when touching copy.

> The spec marks this section strike-able. If Bjorn struck it at review, skip
> this task entirely and go straight to Task 9.

- [ ] **Step 1: Write the script**

Create `scripts/i18n-audit.mjs`:

```js
#!/usr/bin/env node
// Advisory i18n catalogue audit. Not part of `pnpm test` — the checks that are
// deterministic enough to gate a build live in messages/__tests__/parity.test.ts.
// Run it when touching copy:  node scripts/i18n-audit.mjs
//
// Reports: keys no source file references, values identical to en (candidate
// untranslated strings), quote characters that break the per-locale convention,
// and ASCII apostrophes in fr.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const LOCALES = ['en', 'fr', 'es', 'it', 'de']
const SRC_DIRS = ['app', 'components', 'lib', 'actions']
const SRC_EXT = new Set(['.ts', '.tsx', '.mjs'])

function leaves(obj, prefix = '') {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.assign({}, ...Object.keys(obj).map((k) =>
      leaves(obj[k], prefix ? `${prefix}.${k}` : k)))
  }
  return { [prefix]: String(obj) }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SRC_EXT.has(extname(p))) out.push(p)
  }
  return out
}

const catalogs = Object.fromEntries(
  LOCALES.map((l) => [l, leaves(JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')))]))

const source = SRC_DIRS.flatMap((d) => walk(d)).map((f) => readFileSync(f, 'utf8')).join('\n')

// A key is "referenced" if the source mentions the full path or ANY suffix of
// it — components call t('settings.program.heading') under a namespace, so the
// leading segments are absent from the call site.
function referenced(path) {
  const parts = path.split('.')
  for (let i = 0; i < parts.length; i++) {
    if (source.includes(parts.slice(i).join('.'))) return true
  }
  return false
}

let findings = 0
const report = (title, items) => {
  if (items.length === 0) return
  findings += items.length
  console.log(`\n${title} (${items.length})`)
  for (const i of items) console.log(`  ${i}`)
}

report('Stale keys — no source reference (delete from ALL five catalogues)',
  Object.keys(catalogs.fr).filter((k) => !referenced(k)))

for (const locale of LOCALES.filter((l) => l !== 'en')) {
  report(`${locale}: values identical to en (check: loanword, or untranslated?)`,
    Object.keys(catalogs[locale]).filter((k) => catalogs[locale][k] === catalogs.en[k]))
}

const QUOTE_RULE = {
  en: [/[«»]/, 'guillemets (en uses “ ”)'],
  de: [/[«»]/, 'guillemets (de uses „ “)'],
  fr: [/„/, 'German quotes (fr uses « »)'],
  es: [/„/, 'German quotes (es uses « »)'],
  it: [/„/, 'German quotes (it uses « »)'],
}
for (const [locale, [re, label]] of Object.entries(QUOTE_RULE)) {
  report(`${locale}: wrong quote characters — ${label}`,
    Object.keys(catalogs[locale]).filter((k) => re.test(catalogs[locale][k])))
}

report('fr: ASCII apostrophes (use ’)',
  Object.keys(catalogs.fr).filter((k) => /\p{L}'\p{L}/u.test(catalogs.fr[k])))

console.log(findings === 0 ? '\ni18n audit: clean.' : `\ni18n audit: ${findings} advisory finding(s).`)
```

- [ ] **Step 2: Run it**

Run: `node scripts/i18n-audit.mjs`
Expected: the stale-key, quote and apostrophe sections are **empty** (Tasks 5
and 6 cleared them). The "identical to en" section will list roughly 17 `fr` /
8 `es` / 11 `it` / 11 `de` entries — those were each checked during the sweep
and are legitimate loanwords or symbols (Feedback, Parents, `PDF · JPG · PNG`,
German "Dashboard"/"Status"). Advisory output, not a failure.

If the stale-key section is *not* empty, the heuristic has found either a real
leftover or a false positive from a dynamically-composed key path — inspect
before deleting anything.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add scripts/i18n-audit.mjs
git commit -m "chore(i18n): commit the catalogue audit script as a maintenance tool"
```

---

## Task 9: Full gate

**Files:** none — verification only.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: clean (no new warnings).

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all green. Baseline before this branch was ~1676 tests; the count
moves by the handful of cases added and removed here.

If a single file fails once and passes on re-run, that is a parallel-session
race (see CLAUDE.md → Parallel Sessions), not a defect — re-run the one file
before debugging it.

- [ ] **Step 3: Type-check + build**

Run: `pnpm build`
Expected: clean build, ~31 pages. This is the step that catches a missed
`shortDate` call site — the old names no longer exist, so any leftover import
fails compilation.

- [ ] **Step 4: Confirm no locale-blind formatting came back**

Run:
```bash
grep -rn "toLocaleDateString\|Intl.DateTimeFormat" --include=*.ts --include=*.tsx \
  app components lib actions | grep -v node_modules
```
Expected: exactly five matches, each one intentional and commented —
`lib/dates.ts` (the two helpers), `lib/forms/fillable/render.ts`,
`lib/pdf/fillable-pdf.tsx`, `components/FillableForm.tsx`,
`components/legal/LegalDocumentView.tsx`. Anything else is a regression.

`pnpm test:rls` is **not** required: no migration, no RLS policy, no storage
bucket is touched by this branch.

- [ ] **Step 5: Report to Bjorn and stop**

Do **not** merge to `main`. Merging deploys to production and needs Bjorn's
explicit confirmation plus the browser pass below. Report: the gate output, the
task list status, and the browser-pass checklist as the remaining work.

---

## Browser pass — 5 languages (manual, on staging, before merge)

Previously-merged i18n work shipped without one. Required here for every page
this branch touches. Recipe: `reference_visual_check_via_staging_playwright`.

1. Organizer → Overview — the `respondedAt` cell and the next-deadline suffix
2. Organizer → Candidatures — `submitted_at` column and the invitation panel deadline
3. Organizer → Settings → Programme — the three hints **and** the deadline stat
4. Organizer → Fichiers → document drawer — deadline chip
5. Student → dossier (due dates) and an assignment page (deadline line)
6. The grace banner (Task 7)

---

## Flagged for Bjorn — not implemented

**`participationCostHint` is the same defect class as the three hints in Task 5
and is not in the spec's scope.** `{{participation_cost}}` is substituted into
the French « Bonne nouvelle » email by `lib/good-news-template.ts` exactly like
`{{payment_details}}`, yet its example is localized in every catalogue
(`en`: “€850 per student, flights and accommodation included”; `de`: „850 € pro
Schüler/in, Flug und Unterkunft inbegriffen“). A German organizer following that
hint types German into a French email. The spec enumerates three keys, so this
plan leaves the fourth alone — say the word and it is a four-line addition to
Task 5.
