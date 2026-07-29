# Tour auto-start & deadline `DateField` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The guided tour opens by itself for a new organizer and greets them cheerfully; the two deadline pickers on the Candidatures tab stop closing when the organizer changes month.

**Architecture:** Two independent tracks on one branch. Track A (Tasks 1–2) adds a mount-once effect to `TourProvider`, deletes the invitation card, and edits eight message strings. Track B (Tasks 3–5) replaces both native `<input type="date">` deadline fields with a `DateField` built on Radix Popover, backed by pure calendar-grid helpers.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, `@radix-ui/react-popover` (already a dependency), next-intl, Tailwind, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-29-tour-autostart-and-datefield-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm. Verification is `pnpm lint`, `pnpm test`, `pnpm build`. No migration in this plan, so no `pnpm test:rls`.
- Work happens on branch `feature/tour-autostart-datefield` in this worktree. **Confirm with `git branch --show-current` before every commit.** Never `git add -A` or `git add .` — stage only the files named in the task.
- All five message files change together: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`. A key added to one must be added to all five.
- **French copy uses the typographic apostrophe `’` (U+2019), never `'`.** `messages/__tests__/tour-apostrophes.test.ts` enforces this for the tour block. French also keeps a space before `!` — « Bienvenue dans EazyExchange ! » — matching the five existing exclamations in `fr.json`.
- **Never call `toISOString()` on a calendar date.** It converts to UTC first, which turns « 1er septembre » into `2026-08-31` west of Greenwich. Calendar dates are assembled as strings from local parts.
- Never log student/parent PII.
- Trust `tsc --noEmit` (run by `pnpm build`) over editor diagnostics — this is a worktree and the LSP reports phantom errors here.

**Spec drift, deliberate:** the spec named the new helper file `lib/date/calendar.ts`. This plan uses `lib/calendar.ts` instead, because a `lib/date/` directory sitting next to the existing `lib/dates.ts` is a trap for whoever reaches for an import next. Locale *formatting* helpers go into the existing `lib/dates.ts`, which already owns the private BCP-47 table.

---

## File Structure

**Track A — tour**

| File | Responsibility |
|---|---|
| `components/tour/TourProvider.tsx` | modify — add the auto-start effect, drop `dismissInvite` |
| `components/tour/TourInviteCard.tsx` | **delete** |
| `components/shell/OrganizerShell.tsx` | modify — drop the import and the render |
| `messages/{fr,en,es,it,de}.json` | modify — drop `tour.invite.*`, retitle `welcome` and `finish` |
| `components/tour/__tests__/TourProvider.test.tsx` | modify — invitation tests become auto-start tests |

**Track B — date field**

| File | Responsibility |
|---|---|
| `lib/calendar.ts` | new — pure calendar-grid math, no Intl beyond a locale table |
| `lib/__tests__/calendar.test.ts` | new |
| `lib/dates.ts` | modify — add `monthLabel` and `weekdayLabels` beside `longDate` |
| `lib/__tests__/dates.test.ts` | modify — cover the two new helpers |
| `components/ui/date-field.tsx` | new — Radix Popover + month grid |
| `components/ui/__tests__/date-field.test.tsx` | new — the regression test for the reported bug |
| `messages/{fr,en,es,it,de}.json` | modify — add `common.dateField.*` |
| `components/applications/InvitationPanel.tsx` | modify — swap the input |
| `components/applications/OpenApplicationsDialog.tsx` | modify — swap the input |
| `components/applications/__tests__/{InvitationPanel,OpenApplicationsDialog,CandidaturesView}.test.tsx` | modify — drive the new field |
| `BACKLOG.md` | modify — one line for the remaining native date inputs |

---

### Task 1: The tour opens by itself

**Files:**
- Modify: `components/tour/TourProvider.tsx`
- Modify: `components/shell/OrganizerShell.tsx:17` (import) and `:260` (render)
- Delete: `components/tour/TourInviteCard.tsx`
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json` — remove `organizer.shell.tour.invite`
- Test: `components/tour/__tests__/TourProvider.test.tsx`

**Interfaces:**
- Consumes: `visibleStepIndices(isPresent)` from `@/lib/tour/steps`, already imported by `TourProvider`.
- Produces: `TourContextValue` **loses** `dismissInvite`. Remaining members are unchanged: `tourState`, `plan`, `cursor`, `start`, `next`, `prev`, `skip`, `finish`.

- [ ] **Step 1: Rewrite the invitation tests as auto-start tests**

In `components/tour/__tests__/TourProvider.test.tsx`, delete the `startTour` helper (line 65) and replace the entire `describe('the invitation card', …)` block (lines 72–106) with the block below. Leave the mocks, `renderShell`, `bubble` and `beforeEach` untouched.

```tsx
describe('the tour opens by itself', () => {
  it('opens for an organizer who has never seen it, without being asked', () => {
    renderShell()
    expect(bubble().getByText('Bienvenue dans EazyExchange')).toBeInTheDocument()
  })

  it('opens wherever they land, not only on /applications', () => {
    renderShell({ pathname: '/students' })
    expect(bubble().getByText('Bienvenue dans EazyExchange')).toBeInTheDocument()
  })

  it('does not open again once dismissed', () => {
    renderShell({ tourState: 'dismissed' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open once completed', () => {
    renderShell({ tourState: 'completed' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not reopen once skipped, even after a route change', () => {
    // initialState is still 'pending' — the server has not re-rendered — so the
    // only thing standing between the organizer and an infinite tour is the ref.
    const { navigateTo } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }))
    navigateTo('/students')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open a tour that would be nothing but welcome and finish', () => {
    // No sidebar, so no data-tour anchors at all: every anchored step filters
    // out and only the two unanchored ones remain. Not worth an interruption,
    // and the state stays pending so a later visit can still offer it.
    renderWithIntl(
      <TourProvider initialState="pending"><p>page</p></TourProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

Then remove `startTour()` from the six places that call it — every test inside `describe('walking the tour', …)` and the one inside `describe('missing anchors', …)`. Those shells all render with `tourState: 'pending'`, so the tour is already open by the time the test body runs. Do **not** touch `describe('the account menu entry', …)`: it renders with `'completed'`, which does not auto-start, and its `Visite guidée` click is still the thing under test.

Finally, add the `TourProvider` import next to the existing `OrganizerShell` import (line 26):

```tsx
import { OrganizerShell } from '@/components/shell/OrganizerShell'
import { TourProvider } from '@/components/tour/TourProvider'
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm vitest run components/tour/__tests__/TourProvider.test.tsx
```

Expected: FAIL. The four auto-start tests fail because nothing opens the tour on mount; the `walking the tour` tests fail on `Unable to find role="button"` / missing bubble text for the same reason.

- [ ] **Step 3: Add the auto-start effect**

In `components/tour/TourProvider.tsx`, delete `dismissInvite` from the `TourContextValue` type (the last member, with its two comment lines):

```tsx
  /** Terminer on the last step — closes and records 'completed'. */
  finish: () => void
}
```

Delete its definition — the `const dismissInvite = …` line, which sits between `skip` and `next` — and remove `dismissInvite` from the `useMemo` value object and its dependency array:

```tsx
  const value = useMemo<TourContextValue>(() => ({
    tourState, plan, cursor, start, next, prev, skip, finish,
  }), [tourState, plan, cursor, start, next, prev, skip, finish])
```

Then insert this effect immediately after the `prev` definition, before the `// Drive the router from the step` comment:

```tsx
  // The tour opens by itself for an organizer who has never seen it. There is
  // no invitation to accept any more, so this is the only way most of them will
  // ever meet it.
  //
  // An effect rather than render-time work: start() performs the tour's only DOM
  // read, which is meaningless before mount and unsafe during SSR. The ref keeps
  // it to a single firing — including under StrictMode's double-invoke, where
  // the ref object survives.
  //
  // It reads initialState, never tourState: tourState is what start() will move,
  // so watching it would arm this effect against its own result.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current) return
    if (initialState !== 'pending') return
    // Only welcome and finish are on screen — no reachable exchange, so the
    // shell renders none of the session-scoped tabs. « Voici un tour de vos
    // onglets » followed by « c'est tout » is worse than no tour, so leave the
    // state pending and let a later visit, one with an exchange, spend it.
    if (visibleStepIndices(anchorPresent).length <= 2) return
    autoStarted.current = true
    start()
    // start() is re-created when the pathname changes, which is exactly when a
    // shell that had no tabs might have grown some. Re-running then is the point.
  }, [initialState, start])
```

- [ ] **Step 4: Delete the invitation card and its render**

```bash
git rm components/tour/TourInviteCard.tsx
```

In `components/shell/OrganizerShell.tsx`, delete line 17:

```tsx
import { TourInviteCard } from '@/components/tour/TourInviteCard'
```

and delete line 260, so the block reads:

```tsx
        <main className="flex-1 overflow-auto px-7 pb-10 pt-[26px]">
          <div className="mx-auto max-w-6xl">
            <ShellUiContext.Provider value={shellUi}>
              {children}
            </ShellUiContext.Provider>
          </div>
        </main>
```

- [ ] **Step 5: Remove the invite copy from all five message files**

Delete the whole `"invite": { … }` object under `organizer.shell.tour` in each of `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`. In every file it sits between `"menuItem"` and `"controls"`. Keep `menuItem`, `controls` and `steps` exactly as they are, and mind the trailing comma on `"menuItem"`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm vitest run components/tour messages lib/tour
```

Expected: PASS. `tour-apostrophes.test.ts` still passes — the block drops from 26 strings to 22 and its floor is 20.

- [ ] **Step 7: Type-check and lint**

```bash
pnpm lint && npx tsc --noEmit
```

Expected: clean. If `tsc` reports `dismissInvite` still referenced somewhere, grep for it — the only two consumers were the provider and the deleted card.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feature/tour-autostart-datefield
git add components/tour/TourProvider.tsx components/tour/TourInviteCard.tsx \
        components/tour/__tests__/TourProvider.test.tsx \
        components/shell/OrganizerShell.tsx \
        messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "feat: open the guided tour by itself for a new organizer

The invitation card asked a new organizer to decide about the tour on a
screen that already had a primary call to action of its own. The tour now
opens on mount for anyone still on tour_state 'pending', wherever they
land, and the card is gone.

It stays its hand when the only steps on screen would be welcome and
finish — no reachable exchange means no tabs to show — and leaves the
state pending so a later visit can spend it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A cheerful welcome and sign-off

**Files:**
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `components/tour/__tests__/TourProvider.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the file states it leaves.
- Produces: nothing consumed downstream. Only the six tab steps' copy is guaranteed unchanged for later tasks.

- [ ] **Step 1: Update the tests to expect the new titles**

In `components/tour/__tests__/TourProvider.test.tsx`, four assertions read `'Bienvenue dans EazyExchange'`. Change every one to `'Bienvenue dans EazyExchange ! 🎉'`. They are in:

- `describe('the tour opens by itself')` — two of them, added in Task 1
- `describe('walking the tour')` — the `opens on the welcome step` test and the `goes back` test
- `describe('the account menu entry')` — the `replays the tour` test

That is five call sites in total; change all five.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm vitest run components/tour/__tests__/TourProvider.test.tsx
```

Expected: FAIL with `Unable to find an element with the text: Bienvenue dans EazyExchange ! 🎉`.

- [ ] **Step 3: Apply the copy, five locales**

Only the two **titles** change. Both bodies, and all six tab steps, stay exactly as they are — the tour is replayable, and someone replaying it is looking something up, not being welcomed again.

`messages/fr.json` — `organizer.shell.tour.steps`:

```json
"welcome": { "title": "Bienvenue dans EazyExchange ! 🎉" }
"finish":  { "title": "C’est parti ! 🚀" }
```

The apostrophe in « C’est » is U+2019. Copy it from this line; a straight `'` fails `tour-apostrophes.test.ts`.

`messages/en.json`:

```json
"welcome": { "title": "Welcome to EazyExchange! 🎉" }
"finish":  { "title": "You're all set! 🚀" }
```

`messages/es.json`:

```json
"welcome": { "title": "¡Te damos la bienvenida a EazyExchange! 🎉" }
"finish":  { "title": "¡Todo listo! 🚀" }
```

Spanish deliberately avoids « Bienvenido/a » — this phrasing does not gender the reader.

`messages/it.json`:

```json
"welcome": { "title": "Benvenuto in EazyExchange! 🎉" }
"finish":  { "title": "Tutto pronto! 🚀" }
```

`messages/de.json`:

```json
"welcome": { "title": "Willkommen bei EazyExchange! 🎉" }
"finish":  { "title": "Alles bereit! 🚀" }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm vitest run components/tour messages
```

Expected: PASS.

- [ ] **Step 5: Confirm the accents and apostrophes survived**

```bash
node -e "for (const l of ['fr','en','es','it','de']) { const s = require('./messages/'+l+'.json').organizer.shell.tour.steps; console.log(l, JSON.stringify([s.welcome.title, s.finish.title])) }"
```

Expected: French shows `C’est parti`, Spanish shows both `¡`, German shows no mangled characters. If any accent came back stripped, the edit was made by a tool that does not preserve UTF-8 — redo that file by hand.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feature/tour-autostart-datefield
git add messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json \
        components/tour/__tests__/TourProvider.test.tsx
git commit -m "feat: greet a new organizer, rather than announce a tour

The first and last steps now open with an exclamation and an emoji in all
five locales. The six tab steps stay factual: the tour is replayable, and
someone replaying it is looking something up.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Calendar helpers

**Files:**
- Create: `lib/calendar.ts`
- Modify: `lib/dates.ts`
- Test: `lib/__tests__/calendar.test.ts` (create), `lib/__tests__/dates.test.ts` (modify)

**Interfaces:**
- Consumes: `Locale` from `@/lib/i18n/config` (`'en' | 'fr' | 'es' | 'it' | 'de'`).
- Produces, from `@/lib/calendar`:
  - `toISODate(year: number, month: number, day: number): string` — `month` is 0-based, matching `Date`
  - `parseISODate(value: string): { year: number; month: number; day: number } | null`
  - `daysInMonth(year: number, month: number): number`
  - `firstDayOfWeek(locale: Locale): 0 | 1`
  - `monthGrid(locale: Locale, year: number, month: number): (string | null)[][]`
  - `shiftMonth(year: number, month: number, delta: number): { year: number; month: number }`
  - `todayISO(): string`
- Produces, from `@/lib/dates` (added to the existing exports `shortDate`, `longDate`):
  - `monthLabel(locale: Locale, year: number, month: number): string`
  - `weekdayLabels(locale: Locale): string[]` — seven short names, already rotated so index 0 is the locale's first day of the week

- [ ] **Step 1: Write the failing calendar tests**

Create `lib/__tests__/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  daysInMonth, firstDayOfWeek, monthGrid, parseISODate, shiftMonth, toISODate,
} from '@/lib/calendar'

describe('toISODate', () => {
  it('pads month and day', () => {
    expect(toISODate(2026, 0, 1)).toBe('2026-01-01')
    expect(toISODate(2026, 8, 30)).toBe('2026-09-30')
    expect(toISODate(2026, 11, 25)).toBe('2026-12-25')
  })
})

describe('parseISODate', () => {
  it('reads a well-formed date', () => {
    expect(parseISODate('2026-09-01')).toEqual({ year: 2026, month: 8, day: 1 })
  })

  it('refuses everything else, including the empty string', () => {
    for (const bad of ['', '2026-9-1', '26-09-01', 'yesterday', '2026-13-01', '2026-02-30']) {
      expect(parseISODate(bad), bad).toBeNull()
    }
  })

  it('accepts 29 February in a leap year and refuses it otherwise', () => {
    expect(parseISODate('2028-02-29')).toEqual({ year: 2028, month: 1, day: 29 })
    expect(parseISODate('2027-02-29')).toBeNull()
  })
})

describe('daysInMonth', () => {
  it('knows the short months and the leap years', () => {
    expect(daysInMonth(2026, 8)).toBe(30)   // September
    expect(daysInMonth(2027, 1)).toBe(28)   // February, common year
    expect(daysInMonth(2028, 1)).toBe(29)   // February, leap year
  })
})

describe('firstDayOfWeek', () => {
  it('starts the week on Monday everywhere but English', () => {
    expect(firstDayOfWeek('en')).toBe(0)
    for (const l of ['fr', 'es', 'it', 'de'] as const) expect(firstDayOfWeek(l)).toBe(1)
  })
})

describe('monthGrid', () => {
  // 1 September 2026 is a Tuesday; the month has 30 days.
  it('pads the first week to the locale first day', () => {
    const fr = monthGrid('fr', 2026, 8)
    expect(fr[0]).toEqual([
      null, '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ])
    const en = monthGrid('en', 2026, 8)
    expect(en[0]).toEqual([
      null, null, '2026-09-01', '2026-09-02',
      '2026-09-03', '2026-09-04', '2026-09-05',
    ])
  })

  it('returns whole weeks, so the grid is rectangular', () => {
    for (const [y, m] of [[2026, 8], [2026, 1], [2028, 1], [2026, 10]] as const) {
      const weeks = monthGrid('fr', y, m)
      for (const week of weeks) expect(week).toHaveLength(7)
      expect(weeks.flat().filter(Boolean)).toHaveLength(daysInMonth(y, m))
    }
  })

  it('holds every day of the month exactly once, in order', () => {
    const days = monthGrid('fr', 2026, 8).flat().filter(Boolean)
    expect(days[0]).toBe('2026-09-01')
    expect(days[days.length - 1]).toBe('2026-09-30')
  })

  it('does not drift with the viewer timezone', () => {
    // The regression test for toISOString(), which converts to UTC first and
    // turns 1 September into 31 August west of Greenwich.
    const original = process.env.TZ
    try {
      for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz
        expect(toISODate(2026, 8, 1), tz).toBe('2026-09-01')
        expect(monthGrid('fr', 2026, 8)[0]![1], tz).toBe('2026-09-01')
      }
    } finally {
      process.env.TZ = original
    }
  })
})

describe('shiftMonth', () => {
  it('steps within a year', () => {
    expect(shiftMonth(2026, 8, 1)).toEqual({ year: 2026, month: 9 })
    expect(shiftMonth(2026, 8, -1)).toEqual({ year: 2026, month: 7 })
  })

  it('rolls the year over at both ends', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm vitest run lib/__tests__/calendar.test.ts
```

Expected: FAIL with `Failed to resolve import "@/lib/calendar"`.

- [ ] **Step 3: Write `lib/calendar.ts`**

```ts
// Calendar-grid math for DateField. String-first on purpose: a deadline is a
// calendar date, not an instant, and the moment it becomes a Date in UTC terms
// it starts drifting by a day for half the planet. Nothing here calls
// toISOString(), and nothing here should.
//
// `month` is 0-based throughout, matching Date, so the two never have to be
// mentally converted at a call site.

import type { Locale } from '@/lib/i18n/config'

const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` from calendar parts, by string arithmetic only. */
export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. The local-parts Date
  // constructor never converts, so this is safe.
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Parses `YYYY-MM-DD`, strictly. Returns null for anything else — including the
 * empty string, a two-digit year, and 30 February — so a caller can treat a
 * non-null result as a real day.
 */
export function parseISODate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  if (month < 0 || month > 11) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

/**
 * 0 for Sunday, 1 for Monday. Intl.Locale.prototype.getWeekInfo would answer
 * this, but it is not in every browser the app supports, and the answer for
 * five known locales fits in one line.
 */
export function firstDayOfWeek(locale: Locale): 0 | 1 {
  return locale === 'en' ? 0 : 1
}

/**
 * The month as whole weeks of ISO date strings, with null in the cells that
 * belong to the neighbouring months. Whole weeks so the grid is rectangular and
 * the renderer needs no special case for the first and last rows.
 */
export function monthGrid(locale: Locale, year: number, month: number): (string | null)[][] {
  const lead = (new Date(year, month, 1).getDay() - firstDayOfWeek(locale) + 7) % 7
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth(year, month) }, (_, i) => toISODate(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Steps the view month by `delta`, rolling the year over at both ends. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const m = month + delta
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
}

/** Today as a calendar date in the viewer's own timezone. */
export function todayISO(): string {
  const now = new Date()
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate())
}
```

- [ ] **Step 4: Run them to verify they pass**

```bash
pnpm vitest run lib/__tests__/calendar.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing tests for the two formatters**

Append to `lib/__tests__/dates.test.ts`, and add `monthLabel` and `weekdayLabels` to the existing import from `@/lib/dates` at the top of that file:

```ts
describe('monthLabel', () => {
  it('names the month and year in the caller locale', () => {
    expect(monthLabel('fr', 2026, 8)).toBe('septembre 2026')
    expect(monthLabel('de', 2026, 8)).toBe('September 2026')
  })

  it('rolls with the month index, which is 0-based', () => {
    expect(monthLabel('fr', 2026, 0)).toBe('janvier 2026')
    expect(monthLabel('fr', 2026, 11)).toBe('décembre 2026')
  })
})

describe('weekdayLabels', () => {
  it('starts on Monday for French', () => {
    const days = weekdayLabels('fr')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('lun.')
    expect(days[6]).toBe('dim.')
  })

  it('starts on Sunday for English', () => {
    const days = weekdayLabels('en')
    expect(days[0]).toBe('Sun')
    expect(days[6]).toBe('Sat')
  })
})
```

- [ ] **Step 6: Run them to verify they fail**

```bash
pnpm vitest run lib/__tests__/dates.test.ts
```

Expected: FAIL — `monthLabel is not a function` (or a TypeScript import error under `tsc`).

- [ ] **Step 7: Add the two formatters to `lib/dates.ts`**

Append to `lib/dates.ts`, below `longDate`. They live here rather than in `lib/calendar.ts` because this file already owns the private `BCP47` table, and locale formatting is its job.

```ts
// "septembre 2026" in the caller's locale, for a calendar header. `month` is
// 0-based, matching Date and lib/calendar.
export function monthLabel(locale: Locale, year: number, month: number): string {
  return new Intl.DateTimeFormat(BCP47[locale], { month: 'long', year: 'numeric' })
    .format(new Date(year, month, 1))
}

// The seven short weekday names, already rotated so index 0 is the locale's own
// first day of the week — Monday everywhere but English. Rotating here keeps the
// renderer a plain map over the array, with no offset arithmetic in the markup.
export function weekdayLabels(locale: Locale): string[] {
  const fmt = new Intl.DateTimeFormat(BCP47[locale], { weekday: 'short' })
  const first = firstDayOfWeek(locale)
  // 7 January 2024 was a Sunday, so +i walks Sunday through Saturday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(2024, 0, 7 + ((first + i) % 7))))
}
```

Add the import at the top of `lib/dates.ts`, below the existing `Locale` import:

```ts
import { firstDayOfWeek } from '@/lib/calendar'
```

- [ ] **Step 8: Run them to verify they pass**

```bash
pnpm vitest run lib/__tests__/dates.test.ts lib/__tests__/calendar.test.ts && npx tsc --noEmit
```

Expected: PASS, and a clean type-check.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # must print feature/tour-autostart-datefield
git add lib/calendar.ts lib/dates.ts lib/__tests__/calendar.test.ts lib/__tests__/dates.test.ts
git commit -m "feat: add calendar-grid helpers for a date picker

lib/calendar.ts is string-first and never calls toISOString(), which
converts to UTC first and turns 1 September into 31 August west of
Greenwich; a test pins that under three timezones. The two locale
formatters go into lib/dates.ts, which already owns the BCP-47 table.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `DateField`

**Files:**
- Create: `components/ui/date-field.tsx`
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json` — add `common.dateField`
- Test: `components/ui/__tests__/date-field.test.tsx` (create)

**Interfaces:**
- Consumes: `toISODate`, `parseISODate`, `monthGrid`, `shiftMonth`, `todayISO` from `@/lib/calendar`; `longDate`, `monthLabel`, `weekdayLabels` from `@/lib/dates`; `cn` from `@/lib/utils`; `Locale` from `@/lib/i18n/config`.
- Produces:
  ```tsx
  DateField(props: {
    value: string                      // 'YYYY-MM-DD', or '' for none
    onChange: (next: string) => void   // only ever called with a real 'YYYY-MM-DD'
    disabled?: boolean
    id?: string                        // lands on the trigger button, for <Label htmlFor>
    ariaLabelledBy?: string            // lands on the trigger button
    className?: string                 // merged into the trigger
  }): JSX.Element
  ```

- [ ] **Step 1: Add the three copy keys to all five message files**

Add a `dateField` object inside the existing top-level `common` block of each file, after `status`:

`messages/fr.json`:
```json
"dateField": {
  "placeholder": "Choisir une date",
  "prevMonth": "Mois précédent",
  "nextMonth": "Mois suivant"
}
```

`messages/en.json`:
```json
"dateField": {
  "placeholder": "Pick a date",
  "prevMonth": "Previous month",
  "nextMonth": "Next month"
}
```

`messages/es.json`:
```json
"dateField": {
  "placeholder": "Elegir una fecha",
  "prevMonth": "Mes anterior",
  "nextMonth": "Mes siguiente"
}
```

`messages/it.json`:
```json
"dateField": {
  "placeholder": "Scegliere una data",
  "prevMonth": "Mese precedente",
  "nextMonth": "Mese successivo"
}
```

`messages/de.json`:
```json
"dateField": {
  "placeholder": "Datum wählen",
  "prevMonth": "Vorheriger Monat",
  "nextMonth": "Nächster Monat"
}
```

- [ ] **Step 2: Write the failing component tests**

Create `components/ui/__tests__/date-field.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { DateField } from '@/components/ui/date-field'

// Opens the popover and hands back the onChange spy. Default value puts the
// view on September 2026, a month whose 1st is a Tuesday.
function open(value = '2026-09-10') {
  const onChange = vi.fn()
  renderWithIntl(<DateField value={value} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: value ? '10 septembre 2026' : 'Choisir une date' }))
  return onChange
}

describe('the trigger', () => {
  it('shows the date in the caller locale', () => {
    renderWithIntl(<DateField value="2026-09-01" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '1 septembre 2026' })).toBeInTheDocument()
  })

  it('shows a placeholder when there is no date yet', () => {
    renderWithIntl(<DateField value="" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choisir une date' })).toBeInTheDocument()
  })

  it('carries the id and the external label, so <Label htmlFor> still pairs', () => {
    renderWithIntl(
      <>
        <span id="lbl">Date limite</span>
        <DateField value="" onChange={vi.fn()} id="fld" ariaLabelledBy="lbl" />
      </>,
    )
    expect(screen.getByLabelText('Date limite')).toHaveAttribute('id', 'fld')
  })
})

describe('paging through months', () => {
  // The reported bug: the calendar used to close on every month change, so
  // reaching next June meant re-opening it nine times.
  it('keeps the calendar open, and reports nothing, while the month changes', () => {
    const onChange = open()
    expect(screen.getByText('septembre 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByText('août 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByText('juillet 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(screen.getByText('août 2026')).toBeInTheDocument()

    // Still open, and still nothing persisted.
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rolls the year over', () => {
    open('2026-01-10')
    expect(screen.getByText('janvier 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByText('décembre 2025')).toBeInTheDocument()
  })
})

describe('picking a day', () => {
  it('reports the ISO date once and closes', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: '15' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-09-15')
    expect(screen.queryByRole('button', { name: 'Mois suivant' })).not.toBeInTheDocument()
  })

  it('reports the month on screen, not the month the value came from', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith('2026-10-03')
  })

  it('opens on today when there is no value yet', () => {
    const onChange = vi.fn()
    renderWithIntl(<DateField value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choisir une date' }))
    const now = new Date()
    expect(screen.getByText(
      new Intl.DateTimeFormat('fr', { month: 'long', year: 'numeric' }).format(now),
    )).toBeInTheDocument()
  })
})

describe('disabled', () => {
  it('cannot be opened', () => {
    renderWithIntl(<DateField value="2026-09-10" onChange={vi.fn()} disabled />)
    const trigger = screen.getByRole('button', { name: '10 septembre 2026' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('button', { name: 'Mois suivant' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

```bash
pnpm vitest run components/ui/__tests__/date-field.test.tsx
```

Expected: FAIL with `Failed to resolve import "@/components/ui/date-field"`.

- [ ] **Step 4: Write `components/ui/date-field.tsx`**

```tsx
'use client'
import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/config'
import { longDate, monthLabel, weekdayLabels } from '@/lib/dates'
import { monthGrid, parseISODate, shiftMonth, todayISO } from '@/lib/calendar'

// A calendar the app owns, replacing <input type="date">.
//
// The native picker is browser chrome: we cannot observe it, cannot test it,
// and cannot stop it closing itself — which it did on every month change,
// turning "pick a date nine months out" into nine re-opens. Here the month
// arrows move a piece of local state and nothing else, so there is no longer
// anything that *can* close the calendar while the organizer is looking for a
// month.
//
// The value is a 'YYYY-MM-DD' string in and out, never a Date. onChange is only
// ever called with a real day, so a caller cannot receive '' the way a cleared
// native input used to emit it.
export function DateField({
  value, onChange, disabled, id, ariaLabelledBy, className,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
  ariaLabelledBy?: string
  className?: string
}) {
  const locale = useLocale() as Locale
  const t = useTranslations('common.dateField')
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => viewFor(value))

  // The month to show: the one the value is in, or the current one when empty.
  function viewFor(v: string) {
    const parsed = parseISODate(v)
    if (parsed) return { year: parsed.year, month: parsed.month }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }

  // Re-seed on every open rather than once on mount: an organizer who pages to
  // 2027, closes without picking, and re-opens expects to be back at their
  // deadline, not wherever they wandered off to.
  function handleOpenChange(next: boolean) {
    if (next) setView(viewFor(value))
    setOpen(next)
  }

  const weeks = monthGrid(locale, view.year, view.month)
  const today = todayISO()

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-labelledby={ariaLabelledBy}
          className={cn(
            'flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-left text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          {value ? longDate(value, locale) : t('placeholder')}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // Above the dialog this field is sometimes used inside (z-50), below
          // the guided tour's dim layer (z-60 and up) — a tour in progress
          // swallows clicks anyway, and nothing should float over its wash.
          className="z-[55] w-[272px] rounded-[13px] border bg-card p-3 shadow-float"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={t('prevMonth')}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              ‹
            </button>
            <span className="font-display text-[13.5px] font-semibold capitalize text-navy">
              {monthLabel(locale, view.year, view.month)}
            </span>
            <button
              type="button"
              aria-label={t('nextMonth')}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {weekdayLabels(locale).map((label) => (
              <span
                key={label}
                aria-hidden
                className="flex h-7 items-center justify-center font-mono text-[10.5px] uppercase tracking-wide text-tertiary"
              >
                {label.slice(0, 2)}
              </span>
            ))}
            {weeks.flat().map((iso, i) =>
              iso === null ? (
                <span key={`blank-${i}`} className="h-8" />
              ) : (
                <button
                  key={iso}
                  type="button"
                  aria-pressed={iso === value}
                  onClick={() => {
                    onChange(iso)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-[8px] text-[13px] tabular-nums',
                    iso === value
                      ? 'bg-brand font-semibold text-white'
                      : 'text-foreground hover:bg-hoverrow',
                    iso === today && iso !== value && 'font-semibold text-brand',
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              ),
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
```

- [ ] **Step 5: Run them to verify they pass**

```bash
pnpm vitest run components/ui/__tests__/date-field.test.tsx
```

Expected: PASS.

If instead every test fails with `ResizeObserver is not defined`, jsdom is missing the shim Radix's positioning needs. The existing tour tests render `Popover.Content` and pass, so this should not happen — but if it does, add a noop stub to `vitest.setup.ts` beside the `IntersectionObserver` one already there, rather than changing the component.

- [ ] **Step 6: Type-check and lint**

```bash
pnpm lint && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feature/tour-autostart-datefield
git add components/ui/date-field.tsx components/ui/__tests__/date-field.test.tsx \
        messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "feat: add DateField, a calendar the app owns

The native date picker is browser chrome: unobservable, untestable, and
free to close itself, which it did on every month change. DateField puts
the month grid in a Radix popover, where the arrows move local state and
nothing else — so there is no longer anything that can close the calendar
while the organizer is looking for a month. The regression test is the
reported bug, written down.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Swap both deadline fields

**Files:**
- Modify: `components/applications/InvitationPanel.tsx:67-74`
- Modify: `components/applications/OpenApplicationsDialog.tsx:89-96`
- Modify: `BACKLOG.md`
- Test: `components/applications/__tests__/InvitationPanel.test.tsx`, `components/applications/__tests__/OpenApplicationsDialog.test.tsx`, `components/applications/__tests__/CandidaturesView.test.tsx`

**Interfaces:**
- Consumes: `DateField` from `@/components/ui/date-field`, with the props listed in Task 4.
- Produces: no new exports. `InvitationControls` is unchanged — `onDeadlineChange(next: string)` keeps its signature; it simply can no longer receive `''`.

- [ ] **Step 1: Update the three test files to drive the new field**

These tests currently reach the native input with `fireEvent.change`. A `DateField` is opened and clicked instead.

In `components/applications/__tests__/InvitationPanel.test.tsx`, replace the deadline half of `forwards the toggle and the deadline change to its owner`:

```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Ouvert' }))
    expect(onToggleOpen).toHaveBeenCalled()
    // The controls hand it 2026-09-01, so the calendar opens on September 2026.
    fireEvent.click(screen.getByLabelText('Date limite'))
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    expect(onDeadlineChange).toHaveBeenCalledWith('2026-09-20')
```

In `components/applications/__tests__/CandidaturesView.test.tsx`, replace `changing the deadline calls setApplicationOpen with the current open state`:

```tsx
  it('changing the deadline calls setApplicationOpen with the current open state', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByLabelText('Date limite'))
    fireEvent.click(screen.getByRole('button', { name: '20' }))
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-20')
  })
```

and **delete** the test named `clearing the deadline is ignored (never persists a null deadline)`. There is no longer a way to clear the field: `DateField` cannot emit `''`. The invariant it guarded now lives one level down, pinned by the `DateField` tests that assert `onChange` is only ever called with a real ISO date. The `if (!next) return` guard in `changeDeadline` stays in the code — it is also the persistence path, and the guard records why an empty deadline must never be written.

In `components/applications/__tests__/OpenApplicationsDialog.test.tsx`, three surviving tests call `fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })` — `choosing a deadline opens applications and unlocks both methods`, `sends pasted addresses once applications are open`, and `shows Cancel before opening and Terminé after`. Replace each call with:

```tsx
    fireEvent.click(screen.getByLabelText('Date limite des candidatures'))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
```

Two assertions name the old literal date, both inside `choosing a deadline opens applications and unlocks both methods`: `expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-01')` and `expect(onOpened).toHaveBeenCalledWith('2026-09-01')`. Change both to expect the first of the **current** month — the dialog opens with no value, so the calendar shows today's month. Compute it once at the top of the file:

```tsx
const now = new Date()
const FIRST_OF_THIS_MONTH =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
```

and use `FIRST_OF_THIS_MONTH` in those assertions.

Also **delete** the test named `never persists an empty deadline`, for the same reason as above.

Finally, the first test asserts `expect(screen.getByRole('textbox', { name: '' })).toBeDisabled()` — that is the apply-link input, not the date field, and it still holds. Leave it.

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm vitest run components/applications
```

Expected: FAIL. `getByLabelText('Date limite')` still resolves to the native input, so clicking it opens nothing and `getByRole('button', { name: '20' })` finds no element.

- [ ] **Step 3: Swap the panel field**

In `components/applications/InvitationPanel.tsx`, add the import beside the existing `Button` one:

```tsx
import { DateField } from '@/components/ui/date-field'
```

and replace the `<input type="date">` at lines 67–74 with:

```tsx
          <DateField
            ariaLabelledBy="candidatures-deadline-label"
            value={deadline}
            disabled={saving}
            onChange={onDeadlineChange}
            className="h-[34px] w-auto min-w-[150px] rounded-[8px] text-[13px]"
          />
```

- [ ] **Step 4: Swap the dialog field**

In `components/applications/OpenApplicationsDialog.tsx`, add the import beside the existing `Input` one:

```tsx
import { DateField } from '@/components/ui/date-field'
```

and replace the `<Input type="date">` at lines 89–96 with:

```tsx
          <DateField
            id="open-applications-deadline"
            value={deadline}
            disabled={saving}
            onChange={chooseDeadline}
            className="h-12"
          />
```

`Input` is still used by this file for the apply-link field, so leave its import alone.

- [ ] **Step 5: Run them to verify they pass**

```bash
pnpm vitest run components/applications
```

Expected: PASS.

- [ ] **Step 6: Add the backlog line**

Append one line to the **Queue** section of `BACKLOG.md`:

```markdown
- Migrate the remaining native `<input type="date">` fields (LibraryDrawer, template editors) to `components/ui/date-field` — the Candidatures deadlines moved 2026-07-29.
```

- [ ] **Step 7: Full verification**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all three clean. `pnpm test:rls` is not needed — this plan touches no migration, RLS policy or storage bucket.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feature/tour-autostart-datefield
git add components/applications/InvitationPanel.tsx \
        components/applications/OpenApplicationsDialog.tsx \
        components/applications/__tests__/InvitationPanel.test.tsx \
        components/applications/__tests__/OpenApplicationsDialog.test.tsx \
        components/applications/__tests__/CandidaturesView.test.tsx \
        BACKLOG.md
git commit -m "fix: keep the deadline calendar open while changing month

Both Candidatures deadline fields move off <input type=\"date\"> to
DateField. Paging through months now happens inside our own popover, so
the calendar stays put instead of closing on every arrow click.

The two tests that fed the field an empty string go with it — DateField
cannot emit one. That invariant is now pinned in the DateField tests; the
guard in changeDeadline stays, because it is also the persistence path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification, before merging

`pnpm dev` (port 3566 in this worktree, against the local stack) and check by hand:

1. **The tour.** Sign up fresh, or reset an organizer with
   `update public.users set tour_state = 'pending' where email = '…'`, then load
   `/applications`. The tour should already be open on « Bienvenue dans
   EazyExchange ! 🎉 ». Walk it to « C'est parti ! 🚀 ». Reload: it must not
   re-open. Replay it from the account menu.
2. **The panel picker.** `/applications` → open the invitation panel → click the
   deadline → page back and forth several months. The calendar must stay open the
   whole time. Pick a day and confirm it persists across a reload.
3. **The dialog picker.** The one integration risk in this plan. From an exchange
   with applications never opened, hit « Ouvrir les candidatures » and open the
   deadline field **inside the dialog**. Confirm: the calendar draws above the
   dialog, not behind it; the arrows work; Escape closes the calendar and leaves
   the dialog open; a second Escape closes the dialog.
4. **One non-French locale**, German or Spanish, on the same two pickers — the
   month name, the weekday row and the first day of the week should all be right.
