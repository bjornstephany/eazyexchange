# Reminder Apostrophe Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the typographic apostrophe (’ U+2019) in all French reminder/email copy with unit tests, extracting the cron email's copy builders into a pure module so they become testable.

**Architecture:** Three independent surfaces get a two-layer guard (generic negative regex `/\p{L}'\p{L}/u` on rendered output + a few positive `’` pins): (1) the `send-reminders` edge function — its private copy builders move byte-identical into a new pure module `email-copy.ts` (same precedent as `pacing.ts`/`filter.ts`) and get a new test file; (2) the five French senders in `lib/email.ts` — new test file using the existing Resend-mock pattern; (3) `lib/landing/content.ts` — the existing test's single-string apostrophe check becomes a recursive whole-`fr`-tree guard. No product copy changes anywhere (spec audit: zero existing ASCII-apostrophe bugs).

**Tech Stack:** TypeScript, vitest (`pnpm test`), Deno edge function (`supabase/functions/send-reminders/`), Resend mock via `vi.mock('resend', …)`.

**Spec:** `docs/superpowers/specs/2026-07-13-reminder-apostrophe-tests-design.md` (binding).

## Global Constraints

- French copy must keep every accent and typographic apostrophe (’ U+2019) intact — transcribe strings **exactly**, byte-for-byte. Past subagents have silently stripped accents; do not retype copy, copy-paste it from this plan.
- The extraction from `supabase/functions/send-reminders/index.ts` is a **pure move**: byte-identical template literals apart from exactly two mechanical changes — `${APP_URL}` → `${appUrl}` inside `buildEmail`, and the two inline subject lines absorbed into `buildSubject`.
- Test fixtures must be **apostrophe-free** (subjects interpolate exchange names unescaped; an apostrophe in a fixture would false-positive the guard).
- The guard regex is `/\p{L}'\p{L}/u` everywhere (ASCII apostrophe between two letters). Positive pins use `toContain('’')`-style assertions on stable strings.
- `email-copy.ts` must stay pure: no Deno globals, no imports.
- No product copy changes, no migration, no RLS change, no env vars, no new routes. `pnpm test:rls` is NOT triggered.
- Stage files by NAME (`git add <path> …`). Never `git add -A` / `git add .`.
- NEVER: push, merge, apply prod migrations, deploy edge functions, change Vercel config, send email.
- `tsconfig.json` excludes `supabase/functions` — tsc will not check the new edge-fn module; its tests are the check (same as `filter.ts`/`pacing.ts`).

---

### Task 1: Extract cron email copy builders into `email-copy.ts` + tests

**Files:**
- Create: `supabase/functions/send-reminders/email-copy.ts`
- Create: `supabase/functions/send-reminders/email-copy.test.ts`
- Modify: `supabase/functions/send-reminders/index.ts` (delete lines 44–95; add import; rewire the send loop at lines 209–214)

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces (used by `index.ts`):
  - `export type ReminderForm = { name: string; deadline: string; overdue: boolean }`
  - `export function buildSubject(exchangeNames: string[], anyOverdue: boolean): string`
  - `export function buildEmail(studentName: string, exchangeNames: string[], forms: ReminderForm[], appUrl: string): string`

- [x] **Step 1: Write the failing test**

Create `supabase/functions/send-reminders/email-copy.test.ts` with exactly this content (extensionless import, matching `filter.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { buildSubject, buildEmail, type ReminderForm } from './email-copy'

const APP_URL = 'https://app.test'

// ASCII apostrophe between two letters = French typography regression (copy
// must use the typographic ’). Markup quotes and &#39;-escaped user input
// never sit between two letters, so they cannot false-positive.
const ASCII_APOSTROPHE = /\p{L}'\p{L}/u

// Fixtures are deliberately apostrophe-free: buildSubject interpolates the
// exchange name UNESCAPED, so an apostrophe-bearing fixture would trip the
// guard. Escaping behavior has its own dedicated test below.
const form = (over: Partial<ReminderForm> = {}): ReminderForm => ({
  name: 'Passeport',
  deadline: '2026-10-10',
  overdue: false,
  ...over,
})

describe('buildSubject', () => {
  it('names the exchange when there is exactly one', () => {
    expect(buildSubject(['Espagne 2026'], false)).toBe('Rappel : ton dossier pour Espagne 2026')
  })

  it('switches to « Action requise » when anything is overdue', () => {
    expect(buildSubject(['Espagne 2026'], true)).toBe('Action requise : ton dossier pour Espagne 2026')
  })

  it('falls back to generic wording — with a typographic apostrophe — for multi-exchange', () => {
    expect(buildSubject(['Espagne 2026', 'Canada 2027'], false)).toBe('Rappel : ton dossier d’échange')
  })
})

describe('buildEmail', () => {
  it('greets the student, names the exchange, lists forms with French short dates', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form()], APP_URL)
    expect(html).toContain('Bonjour Yanis,')
    expect(html).toContain('ton dossier pour <strong>Espagne 2026</strong>')
    expect(html).toContain('Passeport')
    expect(html).toContain('10 oct') // frShortDate; tolerate the locale's trailing period
  })

  it('falls back to a bare greeting when the student has no name', () => {
    expect(buildEmail('', ['Espagne 2026'], [form()], APP_URL)).toContain('Bonjour,')
  })

  it('uses generic multi-exchange wording with a typographic apostrophe', () => {
    const html = buildEmail('Yanis', ['Espagne 2026', 'Canada 2027'], [form()], APP_URL)
    expect(html).toContain('à ton dossier d’échange :')
  })

  it('flags overdue forms', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form({ overdue: true })], APP_URL)
    expect(html).toContain('en retard — échéance')
  })

  it('keeps the typographic apostrophe in the footer', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form()], APP_URL)
    expect(html).toContain('ton dossier d’échange scolaire est en cours de préparation')
  })

  it('links to the passed appUrl', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form()], APP_URL)
    expect(html).toContain('href="https://app.test/my-forms"')
  })

  it('escapes user-supplied content (behavior carried over from index.ts)', () => {
    const html = buildEmail('<Yanis>', ['Espagne <2026>'], [form({ name: 'AST <sortie>' })], APP_URL)
    expect(html).toContain('&lt;Yanis&gt;')
    expect(html).toContain('Espagne &lt;2026&gt;')
    expect(html).toContain('AST &lt;sortie&gt;')
    expect(html).not.toContain('<Yanis>')
  })
})

describe('ASCII-apostrophe guard across the rendered matrix', () => {
  const oneForm = [form()]
  const twoForms = [form(), form({ name: 'Autorisation de sortie', deadline: '2026-11-02' })]

  for (const exchangeNames of [['Espagne 2026'], ['Espagne 2026', 'Canada 2027']]) {
    for (const formSet of [oneForm, twoForms]) {
      for (const overdue of [false, true]) {
        const label = `${exchangeNames.length} exchange(s) × ${formSet.length} form(s) × overdue=${overdue}`
        it(`subject and body are ASCII-apostrophe-free: ${label}`, () => {
          const rendered = formSet.map(f => ({ ...f, overdue }))
          expect(buildSubject(exchangeNames, overdue)).not.toMatch(ASCII_APOSTROPHE)
          expect(buildEmail('Yanis', exchangeNames, rendered, APP_URL)).not.toMatch(ASCII_APOSTROPHE)
        })
      }
    }
  }
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run supabase/functions/send-reminders/email-copy.test.ts`
Expected: FAIL — cannot resolve `./email-copy` (module does not exist yet).

- [x] **Step 3: Create the pure module (byte-identical move)**

Create `supabase/functions/send-reminders/email-copy.ts` with exactly this content. `esc`, `frDateFormat`, `frShortDate`, `dossierRef` and the `buildEmail` body are moved **verbatim** from `index.ts` lines 44–95; the only deltas are the two documented in Global Constraints.

```ts
// email-copy.ts — pure French copy builders for the send-reminders cron email.
//
// Extracted from index.ts so the copy is unit-testable under vitest (index.ts
// itself cannot be imported there: Deno.serve, `npm:` import specifier,
// top-level Deno.env.get). Same testability pattern as ./pacing.ts and
// ./filter.ts. Keep this module pure: no Deno globals, no imports.
//
// French typography rule: user-facing copy uses the typographic apostrophe (’),
// never the ASCII quote (') — email-copy.test.ts enforces this.

export type ReminderForm = { name: string; deadline: string; overdue: boolean }

// Escape untrusted values before embedding them in email HTML.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// French short date («10 oct.»), matching the tone of lib/email.ts (which uses
// frShortDate — not importable here: Deno can't resolve the @/ alias).
const frDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
function frShortDate(isoDate: string): string {
  return frDateFormat.format(new Date(`${isoDate}T00:00:00Z`))
}

// « ton dossier pour X » when everything due this morning belongs to one
// exchange (the normal case); generic wording for the rare multi-exchange email.
function dossierRef(exchangeNames: string[], html: boolean): string {
  if (exchangeNames.length === 1) {
    const name = exchangeNames[0]
    return html ? `ton dossier pour <strong>${esc(name)}</strong>` : `ton dossier pour ${name}`
  }
  return 'ton dossier d’échange'
}

// Subject line for one student's reminder email (absorbed from the inline
// subject construction in index.ts's send loop).
export function buildSubject(exchangeNames: string[], anyOverdue: boolean): string {
  const ref = dossierRef(exchangeNames, false)
  return anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`
}

export function buildEmail(studentName: string, exchangeNames: string[], forms: ReminderForm[], appUrl: string): string {
  const greeting = studentName ? `Bonjour ${esc(studentName)},` : 'Bonjour,'
  const items = forms
    .map(f => {
      const due = esc(frShortDate(f.deadline))
      const label = f.overdue
        ? `<span style="color: #b91c1c;">en retard — échéance ${due}</span>`
        : `échéance ${due}`
      return `<li style="margin-bottom: 6px;"><strong>${esc(f.name)}</strong> — ${label}</li>`
    })
    .join('')
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1F3A30;">
      <h2 style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px;"><span style="color: #3FA277;">Eazy</span>Exchange</h2>
      <p>${greeting}</p>
      <p>Il manque encore ${forms.length === 1 ? 'cet élément' : 'ces éléments'} à ${dossierRef(exchangeNames, true)} :</p>
      <ul style="padding-left: 18px;">${items}</ul>
      <p><a href="${appUrl}/my-forms" style="display: inline-block; background: #2456E6; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Compléter mon dossier</a></p>
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.</p>
    </div>
  `
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run supabase/functions/send-reminders/email-copy.test.ts`
Expected: PASS — 3 (buildSubject) + 7 (buildEmail) + 8 (guard matrix) = 18 tests.

- [x] **Step 5: Rewire `index.ts` to use the module**

Three edits to `supabase/functions/send-reminders/index.ts`:

**Edit 5a** — add the import (Deno needs the `.ts` extension). Replace:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { shouldRemind } from './filter.ts'
import { planFairShare } from './fair-share.ts'
import { fetchAllPages } from './fetch-all.ts'
```

with:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { shouldRemind } from './filter.ts'
import { planFairShare } from './fair-share.ts'
import { fetchAllPages } from './fetch-all.ts'
import { buildEmail, buildSubject, type ReminderForm } from './email-copy.ts'
```

**Edit 5b** — delete the moved block (currently lines 44–95): everything from

```ts
type ReminderForm = { name: string; deadline: string; overdue: boolean }
```

down to and including the closing of `buildEmail`:

```ts
      <p style="font-size: 12px; color: #5C7268;">Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.</p>
    </div>
  `
}
```

(i.e. delete `type ReminderForm`, `esc`, the `frDateFormat` const + `frShortDate`, `dossierRef`, `buildEmail`, and their comment lines. Do NOT delete the `APP_URL` const near the top — it is still used — and do NOT touch `sendEmail`.)

**Edit 5c** — in the send loop, replace:

```ts
    const anyOverdue = forms.some(f => f.overdue)
    const ref = dossierRef([...exchangeNames], false)
    const subject = anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`

    const result = await sendEmail(email, subject, buildEmail(name, [...exchangeNames], forms))
```

with:

```ts
    const anyOverdue = forms.some(f => f.overdue)
    const subject = buildSubject([...exchangeNames], anyOverdue)

    const result = await sendEmail(email, subject, buildEmail(name, [...exchangeNames], forms, APP_URL))
```

- [x] **Step 6: Verify the move is byte-identical**

Confirm the moved literals match the originals (the deleted block vs the new module):

Run: `git diff supabase/functions/send-reminders/index.ts | grep '^-' | grep '’'`
Expected: exactly 2 lines — the `return 'ton dossier d’échange'` fallback and the `Tu reçois cet e-mail car ton dossier d’échange scolaire…` footer line. Both must appear byte-identical in `email-copy.ts` (verify: each line, minus the leading `-`, is found by `grep -F` in the new file).

Run: `grep -cF 'ton dossier d’échange' supabase/functions/send-reminders/email-copy.ts`
Expected: `2` (dossierRef fallback + footer sentence).

Run: `grep -n -e 'dossierRef' -e 'frShortDate' -e 'function esc(' supabase/functions/send-reminders/index.ts`
Expected: no output (all moved out; `buildSubject`/`buildEmail` remain only as import + call sites).

Also sanity-check the edge function still type-checks under Deno **if** deno is installed (tsc excludes `supabase/functions`, so this is the only static check available):

Run: `command -v deno >/dev/null && deno check supabase/functions/send-reminders/index.ts || echo "deno not installed — skipped (vitest is the gate)"`
Expected: either a clean `deno check` or the skip message. If deno reports errors in the rewired imports/calls, fix them.

- [x] **Step 7: Run the full send-reminders test directory**

Run: `pnpm vitest run supabase/functions/send-reminders/`
Expected: PASS — email-copy, filter, pacing, fair-share, fetch-all tests all green.

- [x] **Step 8: Commit**

```bash
git add supabase/functions/send-reminders/email-copy.ts supabase/functions/send-reminders/email-copy.test.ts supabase/functions/send-reminders/index.ts
git commit -m "test: extract send-reminders copy builders, lock French apostrophes (cron email)"
```

---

### Task 2: Apostrophe guard for the French senders in `lib/email.ts`

**Files:**
- Create: `lib/__tests__/email-french-copy.test.ts`

**Interfaces:**
- Consumes: `sendStudentReminderEmail`, `sendTemplateReminderEmail`, `sendPhase2ChecklistEmail`, `sendInvitationEmail`, `sendOrganizerInviteEmail` from `@/lib/email` (existing exports — no production change in this task).
- Produces: nothing (test-only).

- [ ] **Step 1: Write the test file**

Create `lib/__tests__/email-french-copy.test.ts` with exactly this content (same Resend-mock pattern as `lib/__tests__/student-reminder-email.test.ts`, which stays untouched — it owns escaping/content, this file owns typography):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import {
  sendStudentReminderEmail,
  sendTemplateReminderEmail,
  sendPhase2ChecklistEmail,
  sendInvitationEmail,
  sendOrganizerInviteEmail,
} from '@/lib/email'

// ASCII apostrophe between two letters = French typography regression (copy
// must use the typographic ’). Markup quotes and &#39;-escaped user input
// never sit between two letters, so they cannot false-positive.
const ASCII_APOSTROPHE = /\p{L}'\p{L}/u

// Fixtures are deliberately apostrophe-free: subjects interpolate names
// UNESCAPED, so an apostrophe-bearing fixture would trip the guard. Escaping
// behavior stays covered by lib/__tests__/student-reminder-email.test.ts.

function lastSend(): { subject: string; html: string } {
  expect(sendMock).toHaveBeenCalledTimes(1)
  return sendMock.mock.calls[0][0]
}

describe('French email copy uses typographic apostrophes only', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('sendStudentReminderEmail (manual « Relancer », per student)', async () => {
    await sendStudentReminderEmail({
      to: 'x@y.fr', studentName: 'Yanis', exchangeName: 'Espagne 2026',
      items: [
        { name: 'Passeport', deadline: '2026-10-10' },
        { name: 'Autorisation de sortie', deadline: null },
      ],
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    // STUDENT_FOOTER — positive pin proving the guard scans real ’ copy.
    expect(html).toContain('d’échange scolaire')
  })

  it('sendTemplateReminderEmail (manual « Relancer », per template)', async () => {
    await sendTemplateReminderEmail({
      to: 'x@y.fr', studentName: 'Yanis', templateName: 'Passeport',
      exchangeName: 'Espagne 2026', deadline: '2026-10-10',
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(html).toContain('d’échange scolaire') // STUDENT_FOOTER
  })

  it('sendPhase2ChecklistEmail', async () => {
    await sendPhase2ChecklistEmail({
      to: 'x@y.fr', studentName: 'Yanis', exchangeName: 'Espagne 2026',
      items: [{ name: 'Passeport', deadline: '2026-10-10' }],
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(subject).toContain('c’est parti')
    expect(html).toContain('qu’il reste')
  })

  it('sendInvitationEmail (application accepted)', async () => {
    await sendInvitationEmail({
      to: 'x@y.fr', applicantName: 'Yanis', exchangeName: 'Espagne 2026',
      respondUrl: 'https://app.test/respond/tok123',
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(html).toContain('l’invitation') // button label
  })

  it('sendOrganizerInviteEmail', async () => {
    await sendOrganizerInviteEmail({
      to: 'c@lycee.fr', inviterName: 'Marie Dupont', schoolName: 'Lycée Mistral',
      joinUrl: 'https://app.test/join/tok123',
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(html).toContain('vous invite à rejoindre')
  })
})
```

- [ ] **Step 2: Run the new file — it must pass immediately**

(The spec's audit found zero existing ASCII-apostrophe bugs, so unlike a classic TDD red step, these tests pass against current production copy. The "red" proof is Step 3.)

Run: `pnpm vitest run lib/__tests__/email-french-copy.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 3: Prove the guard actually bites (temporary mutation)**

Temporarily change `STUDENT_FOOTER` in `lib/email.ts` from `d’échange` to `d'échange` (ASCII), re-run:

Run: `pnpm vitest run lib/__tests__/email-french-copy.test.ts`
Expected: FAIL — the student-reminder and template-reminder tests fail on both the negative guard and the positive pin.

Then **revert the mutation** (restore `d’échange`) and re-run:
Expected: PASS — 5 tests. Verify with `git diff lib/email.ts` → empty diff.

- [ ] **Step 4: Commit**

```bash
git add lib/__tests__/email-french-copy.test.ts
git commit -m "test: apostrophe guard for French senders in lib/email.ts"
```

---

### Task 3: Whole-fr-tree apostrophe guard for the landing content

**Files:**
- Modify: `lib/landing/__tests__/content.test.ts:21-23` (replace the single-string apostrophe test)

**Interfaces:**
- Consumes: `landingContent` from `@/lib/landing/content` (existing export).
- Produces: nothing (test-only).

- [ ] **Step 1: Replace the apostrophe test with a recursive guard**

In `lib/landing/__tests__/content.test.ts`, replace exactly this block:

```ts
  it('fr copy uses typographic apostrophes', () => {
    expect(landingContent.fr.features.title).toContain('’')
  })
```

with:

```ts
  it('fr copy uses typographic apostrophes everywhere', () => {
    // ASCII apostrophe between two letters = French typography regression
    // (copy must use ’). Walk every string in the fr tree — this includes the
    // mock reminder email (fr.how.reminder), the original UI-polish leftover.
    // The en tree is not scanned: ASCII apostrophes are legitimate English.
    const ASCII_APOSTROPHE = /\p{L}'\p{L}/u
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        expect(node, `landingContent.fr${path} contains an ASCII apostrophe`).not.toMatch(ASCII_APOSTROPHE)
      } else if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`))
      } else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
      }
    }
    walk(landingContent.fr, '')
    // Positive pin: proves the walk visits real ’ copy (guard stays honest).
    expect(landingContent.fr.features.title).toContain('’')
  })
```

(Everything else in the file — the shape test — stays untouched.)

- [ ] **Step 2: Run the file — it must pass immediately**

(The spec's recursive fr-tree scan verified the content is clean today; red proof is Step 3.)

Run: `pnpm vitest run lib/landing/__tests__/content.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 3: Prove the guard bites (temporary mutation)**

The fr `how.reminder` strings contain no apostrophes today, so mutate the pinned string instead: in `lib/landing/content.ts`, temporarily change `fr.features.title` from `"Tout le dossier de l’élève, au même endroit."` to `"Tout le dossier de l'élève, au même endroit."` (ASCII '), re-run:

Run: `pnpm vitest run lib/landing/__tests__/content.test.ts`
Expected: FAIL — the walk assertion fails naming `landingContent.fr.features.title` (and the positive pin fails too).

Then **revert the mutation** and re-run:
Expected: PASS — 2 tests. Verify with `git diff lib/landing/content.ts` → empty diff.

- [ ] **Step 4: Commit**

```bash
git add lib/landing/__tests__/content.test.ts
git commit -m "test: lock typographic apostrophes across all landing fr copy"
```

---

## Final verification (after all tasks)

Per CLAUDE.md "Verifying Changes":

- [ ] `pnpm lint` — expected: no errors.
- [ ] `pnpm test` — expected: full suite green (all pre-existing tests plus the 23 new cases: 18 in email-copy.test.ts, 5 in email-french-copy.test.ts; content.test.ts still has 2).
- [ ] `pnpm build` — expected: clean; if placeholder `.env.local` blocks the build locally, `npx tsc --noEmit` substitutes for the type pass (expected: no output). Note tsc does not cover `supabase/functions/` (excluded) — the vitest run is that module's gate.
- [ ] `git log --stat -3` — confirm only the five planned files changed (`email-copy.ts`, `email-copy.test.ts`, `index.ts`, `email-french-copy.test.ts`, `content.test.ts`); no stray files staged (PII rule).

No `pnpm test:rls` needed (no migrations/RLS/storage changes).

**Merge-time note for the PR description** (spec decision 9): the `index.ts` refactor is behavior-neutral but leaves the deployed edge function older than the repo until the next manual `supabase functions deploy send-reminders` (optional, no urgency; a redeploy of this function is already pending from earlier work).
