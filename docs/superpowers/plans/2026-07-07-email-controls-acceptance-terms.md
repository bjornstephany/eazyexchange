# Automatic Email Controls + Acceptance-Email Terms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-06-email-controls-acceptance-terms-design.md` (sub-project 4 of the 2026-07-06 feedback backlog)

**Goal:** Per-exchange automatic-reminder controls (on/off + three named cadence presets) driving the `send-reminders` edge function, plus a fixed French terms notice on the acceptance email and respond page with the acknowledgment stamped on `applications.terms_acknowledged_at` — and French rewrites of both touched emails.

**Architecture:** One additive migration (two CHECK-constrained columns on `exchanges`, one timestamp on `applications`). The edge function's pacing math is extracted into a pure `pacing.ts` module (unit-testable under vitest, no Deno globals) and generalized over presets. A new server action `updateReminderSettings` + a client card on the exchange detail page expose the controls. Terms copy lives in one shared module (`lib/exchange-terms.ts`) consumed by both the email and the respond page.

**Tech Stack:** Next.js 14 App Router (Server Actions), Supabase (Postgres + RLS, Deno edge function), Resend (raw REST in the edge function, SDK in `lib/email.ts`), Tailwind + existing design tokens, Vitest + Testing Library.

## Global Constraints

- **French copy uses typographic apostrophes (`’`) and « » guillemets** — copy every French string from this plan verbatim, byte for byte. Never substitute ASCII `'`.
- **Escape all user-supplied content in email HTML** via the existing `esc()` helpers (both in `lib/email.ts` and the edge function).
- **Never log student/parent PII** (emails, names, submission contents).
- Package manager is **pnpm**. Tests: `pnpm test` (vitest). Types: `npx tsc --noEmit` (NOT `pnpm build` — local `.env.local` has placeholders). Lint: `pnpm lint`.
- `tsconfig.json` **excludes `supabase/functions`**, so files there are not type-checked by `tsc --noEmit`; vitest still picks up `*.test.ts` files there (default include). `pacing.ts` must contain **no Deno globals** and **no `@/` path aliases** (Deno resolves neither).
- Deno imports need explicit extensions: `index.ts` imports `./pacing.ts` (with `.ts`); the vitest test imports `./pacing` (without).
- The migration is **NOT pushed to the database during this plan** and the edge function is **NOT deployed** — both are deploy steps listed in Task 9. **SHIP GATE: the terms wording must be reviewed with Mom before any production deploy.** Code may land behind that review.
- `'use server'` files may only export async functions (+ type-only exports). Keep `REMINDER_CADENCES` as a non-exported const; export only the `ReminderCadence` type.
- Manual « Relancer » (`remindStudent` / `sendTemplateReminderEmail`) and the shared English `APP_FOOTER` in `lib/email.ts` are untouched.
- Commit after each task (tests green first). Stage **only the files named in the task** — never `git add -A`.

---

### Task 1: Migration — reminder settings columns + terms timestamp

**Files:**
- Create: `supabase/migrations/20260707000001_reminder_settings_and_terms.sql`

**Interfaces:**
- Produces: `exchanges.reminders_enabled boolean not null default true`, `exchanges.reminder_cadence text not null default 'normale'` (CHECK: `douce | normale | insistante`), `applications.terms_acknowledged_at timestamptz null`. Later tasks read/write these exact column names.
- Consumes: existing `organizers update exchanges` RLS policy (migration `20260630000002`) — already covers the new columns; the `guard_exchange_immutable_schools` trigger only guards school columns. No policy changes needed.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260707000001_reminder_settings_and_terms.sql`:

```sql
-- Sub-project 4: per-exchange automatic-reminder controls + acceptance terms.
--
-- exchanges.reminders_enabled / reminder_cadence: master switch + named preset
-- read by the send-reminders edge function. Defaults reproduce the current
-- behavior (weekly, then daily during the final week and while overdue), so
-- existing exchanges need no backfill and keep today's pacing.
--
-- applications.terms_acknowledged_at: stamped when an invited applicant clicks
-- « Oui, je veux participer » — records the explicit terms acknowledgment.
-- Deliberately kept if the enrollment claim is later released: the click happened.

alter table exchanges
  add column reminders_enabled boolean not null default true,
  add column reminder_cadence text not null default 'normale'
    check (reminder_cadence in ('douce', 'normale', 'insistante'));

alter table applications
  add column terms_acknowledged_at timestamptz;
```

- [ ] **Step 2: Sanity-check the SQL**

Run: `pnpm test`
Expected: full suite passes (the migration file isn't executed by tests — this confirms nothing else broke). Do **NOT** run `supabase db push` (deploy step, Task 9).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260707000001_reminder_settings_and_terms.sql
git commit -m "feat: reminder-settings columns on exchanges + applications.terms_acknowledged_at"
```

---

### Task 2: Extract pure pacing logic into `pacing.ts` (TDD)

**Files:**
- Create: `supabase/functions/send-reminders/pacing.ts`
- Test: `supabase/functions/send-reminders/pacing.test.ts`

**Interfaces:**
- Produces (Task 3 imports these from `./pacing.ts`):
  - `type ReminderCadence = 'douce' | 'normale' | 'insistante'`
  - `type PacingPreset = { farIntervalDays: number; finalStretchDays: number }`
  - `const PRESETS: Record<ReminderCadence, PacingPreset>`
  - `function resolvePreset(cadence: unknown): PacingPreset` — unknown/missing → `PRESETS.normale`
  - `function isDue(daysLeft: number, lastRemindedAt: string | null, preset: PacingPreset): boolean`
- Preset semantics (from the spec):

| Preset | Far from deadline | Final stretch | Overdue |
|---|---|---|---|
| `douce` | every 7 days | every 7 days | every 7 days |
| `normale` (current behavior) | every 7 days | daily, last 7 days | daily |
| `insistante` | every 3 days | daily, last 14 days | daily |

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/send-reminders/pacing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PRESETS, resolvePreset, isDue } from './pacing'

const DAY_MS = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

describe('resolvePreset', () => {
  it('resolves each named cadence', () => {
    expect(resolvePreset('douce')).toBe(PRESETS.douce)
    expect(resolvePreset('normale')).toBe(PRESETS.normale)
    expect(resolvePreset('insistante')).toBe(PRESETS.insistante)
  })
  it('falls back to normale for unknown or missing values', () => {
    expect(resolvePreset('weekly')).toBe(PRESETS.normale)
    expect(resolvePreset(null)).toBe(PRESETS.normale)
    expect(resolvePreset(undefined)).toBe(PRESETS.normale)
  })
})

describe('isDue — first reminder', () => {
  it('is always due when never reminded', () => {
    expect(isDue(30, null, PRESETS.douce)).toBe(true)
    expect(isDue(-3, null, PRESETS.normale)).toBe(true)
  })
})

describe('isDue — douce (weekly, no acceleration)', () => {
  it('far from deadline: weekly', () => {
    expect(isDue(30, ago(7.2), PRESETS.douce)).toBe(true)
    expect(isDue(30, ago(5), PRESETS.douce)).toBe(false)
  })
  it('stays weekly in the final week and while overdue', () => {
    expect(isDue(2, ago(1.2), PRESETS.douce)).toBe(false)
    expect(isDue(2, ago(7.2), PRESETS.douce)).toBe(true)
    expect(isDue(-10, ago(1.2), PRESETS.douce)).toBe(false)
    expect(isDue(-10, ago(7.2), PRESETS.douce)).toBe(true)
  })
})

describe('isDue — normale (current behavior)', () => {
  it('far from deadline: weekly', () => {
    expect(isDue(8, ago(7.2), PRESETS.normale)).toBe(true)
    expect(isDue(8, ago(5), PRESETS.normale)).toBe(false)
  })
  it('daily in the last 7 days and while overdue', () => {
    expect(isDue(7, ago(1.2), PRESETS.normale)).toBe(true)
    expect(isDue(-1, ago(1.2), PRESETS.normale)).toBe(true)
  })
  it('0.5-day stamp tolerance: a just-under-24h gap still counts as a day', () => {
    expect(isDue(3, ago(0.6), PRESETS.normale)).toBe(true)
    expect(isDue(3, ago(0.4), PRESETS.normale)).toBe(false)
  })
})

describe('isDue — insistante (every 3 days, daily last 14)', () => {
  it('far from deadline: every 3 days', () => {
    expect(isDue(20, ago(2.6), PRESETS.insistante)).toBe(true)
    expect(isDue(20, ago(2.4), PRESETS.insistante)).toBe(false)
  })
  it('daily within 14 days of the deadline and while overdue', () => {
    expect(isDue(14, ago(0.6), PRESETS.insistante)).toBe(true)
    expect(isDue(-2, ago(0.6), PRESETS.insistante)).toBe(true)
  })
  it('15 days out is still on the 3-day interval', () => {
    expect(isDue(15, ago(0.6), PRESETS.insistante)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- supabase/functions/send-reminders/pacing.test.ts`
Expected: FAIL — cannot resolve `./pacing`.

- [ ] **Step 3: Implement `pacing.ts`**

Create `supabase/functions/send-reminders/pacing.ts`:

```ts
// Pure pacing logic for send-reminders. No Deno globals and no path aliases —
// imported by index.ts (Deno, as './pacing.ts') and unit-tested under vitest
// (pacing.test.ts). tsconfig excludes supabase/functions, so vitest is the
// only automated check on this file.
//
// A preset answers two questions: how often may we remind while the deadline
// is far away, and how close to the deadline (in days) do reminders switch to
// daily? Overdue assignments count as "past the deadline", i.e. inside the
// final stretch whenever the preset has one.
//   douce      — every 7 days, never accelerates
//   normale    — every 7 days, daily during the last 7 days and while overdue
//   insistante — every 3 days, daily during the last 14 days and while overdue

export type ReminderCadence = 'douce' | 'normale' | 'insistante'

export type PacingPreset = {
  farIntervalDays: number
  // Days before the deadline where reminders become daily (overdue included).
  // 0 = never accelerate.
  finalStretchDays: number
}

export const PRESETS: Record<ReminderCadence, PacingPreset> = {
  douce: { farIntervalDays: 7, finalStretchDays: 0 },
  normale: { farIntervalDays: 7, finalStretchDays: 7 },
  insistante: { farIntervalDays: 3, finalStretchDays: 14 },
}

// Unknown/missing cadence must never abort a cron run — fall back to normale.
export function resolvePreset(cadence: unknown): PacingPreset {
  return PRESETS[cadence as ReminderCadence] ?? PRESETS.normale
}

const DAY_MS = 24 * 60 * 60 * 1000

// Whether a reminder is due given whole days until the deadline (negative =
// overdue) and when we last reminded.
export function isDue(daysLeft: number, lastRemindedAt: string | null, preset: PacingPreset): boolean {
  const inFinalStretch = preset.finalStretchDays > 0 && daysLeft <= preset.finalStretchDays
  const minIntervalDays = inFinalStretch ? 1 : preset.farIntervalDays
  if (!lastRemindedAt) return true
  const elapsedDays = (Date.now() - new Date(lastRemindedAt).getTime()) / DAY_MS
  // Tolerance: the cron fires at a fixed 08:00 but last_reminded_at is stamped
  // a few seconds later, so consecutive runs are elapsed-wise just under 24h
  // apart. Without the 0.5-day slack a `>= 1` daily gate would skip every
  // other day.
  return elapsedDays >= minIntervalDays - 0.5
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- supabase/functions/send-reminders/pacing.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-reminders/pacing.ts supabase/functions/send-reminders/pacing.test.ts
git commit -m "feat: extract reminder pacing presets into pure, tested pacing.ts"
```

---

### Task 3: Edge function — preset gating, off switch, French email

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (full replacement below)

**Interfaces:**
- Consumes: `resolvePreset`, `isDue` from `./pacing.ts` (Task 2); `exchanges.reminders_enabled` / `reminder_cadence` columns (Task 1).
- Produces: nothing consumed by later tasks. Behavior: skips assignments whose exchange has `reminders_enabled = false`; gates each assignment by its own exchange's preset; per-student grouping across exchanges unchanged; email fully French.
- Subject rule (locked in spec, one-exchange case): `Rappel : ton dossier pour <exchange>`, or `Action requise : ton dossier pour <exchange>` when at least one listed form is overdue. Decision made here for the rare multi-exchange grouped email: fall back to the generic `Rappel : ton dossier d’échange` / `Action requise : ton dossier d’échange` (a single subject can't name two exchanges).

There is no Deno CLI locally and this file is excluded from `tsc` — vitest (pacing tests) plus careful transcription is the check; the real verification is the preview live-drive in Task 9.

- [ ] **Step 1: Replace `index.ts` with the version below**

Full new content of `supabase/functions/send-reminders/index.ts`:

```ts
// send-reminders — paced reminder emails for forms that still need student action.
//
// Runs on a daily cron (see supabase/cron-setup.sql). Pacing is per exchange:
// organizers pick a cadence preset ('douce' | 'normale' | 'insistante') or turn
// automatic reminders off entirely (exchanges.reminders_enabled = false). The
// interval math lives in ./pacing.ts (pure, unit-tested under vitest).
// "Needs action" = no submission, or status 'draft' / 'rejected'. The first
// reminder fires on the first run after creation (last_reminded_at IS NULL).
//
// Each run groups every due form per student into one French email, sends it,
// then stamps last_reminded_at on those assignments so the next run respects
// the cadence.
//
// Deno runtime. Uses the service-role key (bypasses RLS) and the Resend REST API.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolvePreset, isDue } from './pacing.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Prefer an explicitly-set secret key (SERVICE_KEY = an sb_secret_… key) so this
// keeps working after the legacy service_role key is deactivated. Falls back to
// the auto-injected legacy key during the migration window.
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'EazyExchange <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000'
// Shared secret the daily pg_cron job must present. Gating on this is independent
// of the platform JWT check: the anon key is public, so verify_jwt alone would
// let anyone trigger a reminder blast. Fail closed if it isn't configured.
const CRON_SECRET = Deno.env.get('CRON_SECRET')

const DAY_MS = 24 * 60 * 60 * 1000

type ReminderForm = { name: string; deadline: string; overdue: boolean }

// Whole days from now until an ISO date (UTC). Negative when the date is past.
function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00Z`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

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

function buildEmail(studentName: string, exchangeNames: string[], forms: ReminderForm[]): string {
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
      <p><a href="${APP_URL}/my-forms" style="display: inline-block; background: #2456E6; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Compléter mon dossier</a></p>
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.</p>
    </div>
  `
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[send-reminders] RESEND_API_KEY not set — skipping reminder email')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    })
    if (!res.ok) {
      // Don't log `to` — it's student PII. Status + Resend's message is enough to debug.
      console.error('[send-reminders] Resend send failed:', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    // A network/DNS error must not abort the per-student loop — return false so
    // the rest of the cohort still gets reminded. No `to` in the log (PII).
    console.error('[send-reminders] Resend request error:', (err as Error).message)
    return false
  }
}

Deno.serve(async (req) => {
  // Only the scheduled cron job (which presents the shared secret) may run this.
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Pull every assignment with its form deadline, reminder state, exchange
  // reminder settings, and latest submission status. Cadence and "needs
  // action" are filtered in code.
  const { data: rows, error } = await supabase
    .from('assignments')
    .select(
      'id, last_reminded_at, student:users!student_id(email, full_name), form_templates!inner(name, deadline, exchanges!inner(name, archived_at, reminders_enabled, reminder_cadence)), submissions(status)',
    )

  if (error) {
    console.error('[send-reminders] query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // Group due forms per student email, tracking which assignment ids to stamp
  // and which exchanges are involved (for the subject/body wording).
  const perStudent = new Map<
    string,
    { name: string; forms: ReminderForm[]; assignmentIds: string[]; exchangeNames: Set<string> }
  >()

  for (const row of (rows ?? []) as any[]) {
    // submissions is one-to-one with assignments, so PostgREST returns it as an
    // object (not an array). Handle both shapes defensively.
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status: string | undefined = submission?.status
    if (status === 'approved' || status === 'submitted') continue

    const exchange = row.form_templates?.exchanges
    if (exchange?.archived_at) continue
    // Master switch: the organizer turned automatic reminders off for this
    // exchange. Manual « Relancer » is unaffected (it lives in the app).
    if (exchange?.reminders_enabled === false) continue

    const deadline: string | undefined = row.form_templates?.deadline
    if (!deadline) continue

    const daysLeft = daysUntil(deadline)
    // Unknown/missing cadence resolves to 'normale' — never fail the run on it.
    const preset = resolvePreset(exchange?.reminder_cadence)
    if (!isDue(daysLeft, row.last_reminded_at, preset)) continue

    const student = row.student
    if (!student?.email) continue

    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        forms: [],
        assignmentIds: [],
        exchangeNames: new Set<string>(),
      })
    }
    const bucket = perStudent.get(student.email)!
    bucket.forms.push({ name: row.form_templates.name, deadline, overdue: daysLeft < 0 })
    bucket.assignmentIds.push(row.id)
    if (exchange?.name) bucket.exchangeNames.add(exchange.name)
  }

  const nowIso = new Date().toISOString()
  let sent = 0
  for (const [email, { name, forms, assignmentIds, exchangeNames }] of perStudent) {
    const anyOverdue = forms.some(f => f.overdue)
    const ref = dossierRef([...exchangeNames], false)
    const subject = anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`

    const ok = await sendEmail(email, subject, buildEmail(name, [...exchangeNames], forms))
    if (!ok) continue
    sent++

    // Stamp only after a successful send so a failed email retries next run.
    const { error: stampError } = await supabase
      .from('assignments')
      .update({ last_reminded_at: nowIso })
      .in('id', assignmentIds)
    if (stampError) {
      console.error('[send-reminders] failed to stamp last_reminded_at:', stampError)
    }
  }

  return new Response(
    JSON.stringify({ students: perStudent.size, emailsSent: sent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
```

- [ ] **Step 2: Verify the suite still passes**

Run: `pnpm test`
Expected: PASS — including the Task 2 pacing tests, which cover all logic this file now delegates to.

- [ ] **Step 3: Self-check the diff against the spec**

Run: `git diff supabase/functions/send-reminders/index.ts`
Check: (a) select string includes `exchanges!inner(name, archived_at, reminders_enabled, reminder_cadence)`; (b) `reminders_enabled === false` → skip (strict `=== false` so a missing column in an un-migrated DB behaves as enabled); (c) subjects read `Rappel : ton dossier pour <name>` / `Action requise : …`; (d) all French strings use `’` (grep the file for a lone ASCII `'` inside French words — there must be none).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "feat: per-exchange reminder presets + off switch in send-reminders, French email"
```

---

### Task 4: Shared terms copy + French acceptance email (TDD)

**Files:**
- Create: `lib/exchange-terms.ts`
- Modify: `lib/email.ts` (`sendInvitationEmail` + new `APP_FOOTER_FR` constant + one import)
- Test: `lib/__tests__/email.invitation.test.ts` (new file)

**Interfaces:**
- Produces (consumed by Task 6's component and this task's email):
  - `EXCHANGE_TERMS_BODY: string` — the shared sentence body
  - `EXCHANGE_TERMS_EMAIL: string` — email lead-in + body
  - `EXCHANGE_TERMS_RESPOND: string` — respond-page lead-in + body
- `sendInvitationEmail` signature is **unchanged**: `(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string }) => Promise<void>` (callers in `actions/applications.ts` keep working untouched).
- The English `APP_FOOTER` constant stays exactly as is (other application emails still use it).

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/email.invitation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendInvitationEmail } from '@/lib/email'
import { EXCHANGE_TERMS_EMAIL } from '@/lib/exchange-terms'

describe('sendInvitationEmail (French acceptance email + terms)', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('French copy, terms notice below the button, escaped user content', async () => {
    await sendInvitationEmail({
      to: 'x@y.fr', applicantName: '<Léa>', exchangeName: 'Espagne <2026>',
      respondUrl: 'https://app.test/invite/tok123',
    })
    const { subject, html } = sendMock.mock.calls[0][0]
    expect(subject).toBe('Bonne nouvelle — ta candidature pour Espagne <2026> a été retenue !')
    expect(html).toContain('Bonjour &lt;Léa&gt;,')
    expect(html).toContain('Espagne &lt;2026&gt;')
    expect(html).not.toContain('<Léa>')
    expect(html).toContain('Répondre à l’invitation')
    expect(html).toContain('https://app.test/invite/tok123')
    expect(html).toContain(EXCHANGE_TERMS_EMAIL)
    expect(html).toContain('Tu reçois cet e-mail car tu as candidaté')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- lib/__tests__/email.invitation.test.ts`
Expected: FAIL — cannot resolve `@/lib/exchange-terms`.

- [ ] **Step 3: Create `lib/exchange-terms.ts`**

```ts
// Fixed French terms notice for invited applicants — identical for every
// exchange (no per-exchange editing). Used verbatim by BOTH the acceptance
// email (lib/email.ts) and the respond page (components/InviteResponseForm.tsx)
// so the wording can never drift between the two surfaces.
//
// SHIP GATE: this wording must be reviewed before any production deploy — see
// docs/superpowers/specs/2026-07-06-email-controls-acceptance-terms-design.md.

// Shared sentence body — completes « … tu confirmes / tu reconnais … ».
export const EXCHANGE_TERMS_BODY =
  'avoir pris connaissance des conditions de l’échange communiquées par l’établissement (participation aux frais, accueil du correspondant, règles de vie pendant le séjour).'

// Acceptance email variant.
export const EXCHANGE_TERMS_EMAIL =
  `En acceptant l’invitation, tu confirmes — et tes parents confirment — ${EXCHANGE_TERMS_BODY}`

// Respond page variant (where the actual accept click happens).
export const EXCHANGE_TERMS_RESPOND =
  `En cliquant sur « Oui, je veux participer », tu reconnais — et tes parents reconnaissent — ${EXCHANGE_TERMS_BODY}`
```

- [ ] **Step 4: Rewrite `sendInvitationEmail` in `lib/email.ts`**

Add the import at the top of `lib/email.ts` (with the other imports):

```ts
import { EXCHANGE_TERMS_EMAIL } from '@/lib/exchange-terms'
```

Directly below the existing `const ORG_FOOTER = …` line, add:

```ts
// French footer for the acceptance email only. The English APP_FOOTER stays:
// the other application emails (resume, confirmation, rejection) still use it
// and are out of scope here.
const APP_FOOTER_FR = 'Tu reçois cet e-mail car tu as candidaté (ou as été invité·e à candidater) à un échange scolaire.'
```

Replace the whole existing `sendInvitationEmail` function with:

```ts
export async function sendInvitationEmail(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string }): Promise<void> {
  const greeting = opts.applicantName ? `Bonjour ${esc(opts.applicantName)},` : 'Bonjour,'
  const html = layout(`
    <p>${greeting}</p>
    <p>Bonne nouvelle — ta candidature pour <strong>${esc(opts.exchangeName)}</strong> a été retenue ! Dis-nous si tu veux participer :</p>
    <p><a href="${opts.respondUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Répondre à l’invitation</a></p>
    <p style="font-size:12px;color:#5C7268;">${EXCHANGE_TERMS_EMAIL}</p>
  `, APP_FOOTER_FR)
  await send(opts.to, `Bonne nouvelle — ta candidature pour ${opts.exchangeName} a été retenue !`, html, 'invitation email')
}
```

(Button is `#2456E6` blue — the color every redesigned French student-facing email uses; the old green `#1F7A57` was pre-redesign.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- lib/__tests__/email.invitation.test.ts lib/__tests__/email.application.test.ts`
Expected: both PASS (`email.application.test.ts` only asserts the no-key no-op contract, which is unchanged).

- [ ] **Step 6: Commit**

```bash
git add lib/exchange-terms.ts lib/email.ts lib/__tests__/email.invitation.test.ts
git commit -m "feat: French acceptance email with shared exchange-terms notice"
```

---

### Task 5: Stamp `terms_acknowledged_at` on the « Oui » claim (TDD)

**Files:**
- Modify: `actions/applications.ts` (the atomic claim UPDATE inside `respondToInvitation`, around line 468)
- Test: `actions/__tests__/applications.test.ts` (harness + 2 new tests in the existing `respondToInvitation` describe)

**Interfaces:**
- Consumes: `applications.terms_acknowledged_at` column (Task 1).
- Behavior contract: only `response === 'yes'` sets the stamp, on the claim UPDATE (`accepted/maybe → enrolling`). If account creation later fails and the claim is released back to `accepted`, the timestamp is kept (the release UPDATE only touches `status`, so this needs no code — but don't "clean it up"). A retried « Oui » simply overwrites it with the newer click.

- [ ] **Step 1: Extend the test harness to record every update**

In `actions/__tests__/applications.test.ts`:

In the `scenario` type declaration (top of file), after the `updated: any` line, add:

```ts
  updates: any[]                   // every update in call order (updated = last)
```

In `builder()`'s `update:` method, replace the line `scenario.updated = { table, row }` with:

```ts
      scenario.updated = { table, row }
      scenario.updates.push({ table, row })
```

In the `beforeEach` scenario initializer, change `inserted: null, updated: null, insertError: null, applicationQueue: [],` to:

```ts
    inserted: null, updated: null, updates: [], insertError: null, applicationQueue: [],
```

- [ ] **Step 2: Add the failing tests**

Append inside the existing `describe('respondToInvitation', …)` block:

```ts
  it('on Yes stamps terms_acknowledged_at on the claim', async () => {
    await respondToInvitation('inv-1', 'yes', '')
    const claim = scenario.updates.find(u => u.table === 'applications' && u.row.status === 'enrolling')
    expect(claim?.row.terms_acknowledged_at).toBeTruthy()
  })
  it('No and Maybe never set terms_acknowledged_at', async () => {
    await respondToInvitation('inv-1', 'no', '')
    expect(scenario.updated.row.terms_acknowledged_at).toBeUndefined()
    await respondToInvitation('inv-1', 'maybe', '')
    expect(scenario.updated.row.terms_acknowledged_at).toBeUndefined()
  })
```

- [ ] **Step 3: Run to verify the new test fails**

Run: `pnpm test -- actions/__tests__/applications.test.ts`
Expected: FAIL — `on Yes stamps terms_acknowledged_at on the claim` (stamp undefined). The No/Maybe test already passes; all pre-existing tests still pass.

- [ ] **Step 4: Implement the stamp**

In `actions/applications.ts`, inside `respondToInvitation`, find the claim UPDATE:

```ts
  const { data: claimed } = await admin
    .from('applications')
    .update({ ...base, status: 'enrolling' })
```

and change the update payload to:

```ts
  const { data: claimed } = await admin
    .from('applications')
    // Clicking « Oui » is the explicit terms acknowledgment (the respond page
    // shows the notice right under the button). Stamped at claim time and
    // deliberately KEPT if the claim is later released back to 'accepted' —
    // it records that the acknowledgment click happened. A retry overwrites
    // it with the newer click.
    .update({ ...base, status: 'enrolling', terms_acknowledged_at: new Date().toISOString() })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- actions/__tests__/applications.test.ts`
Expected: PASS (all, including the pre-existing enroll-failure rollback tests).

- [ ] **Step 6: Commit**

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts
git commit -m "feat: stamp applications.terms_acknowledged_at when the applicant clicks Oui"
```

---

### Task 6: Terms notice on the respond page (TDD)

**Files:**
- Modify: `components/InviteResponseForm.tsx`
- Test: `components/__tests__/InviteResponseForm.test.tsx` (1 new test)

**Interfaces:**
- Consumes: `EXCHANGE_TERMS_RESPOND` from `@/lib/exchange-terms` (Task 4).
- Component props unchanged.

- [ ] **Step 1: Add the failing test**

In `components/__tests__/InviteResponseForm.test.tsx`, add to the imports:

```ts
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'
```

and append inside the `describe` block:

```ts
  it('shows the terms notice directly under the accept button', () => {
    render(<InviteResponseForm token="t" firstName="" exchangeName="X" />)
    expect(screen.getByText(EXCHANGE_TERMS_RESPOND)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- components/__tests__/InviteResponseForm.test.tsx`
Expected: FAIL — text not found.

- [ ] **Step 3: Render the notice**

In `components/InviteResponseForm.tsx`, add the import:

```ts
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'
```

In the button stack, insert the notice **between the « Oui » button and the « Non merci » button**, so the block reads:

```tsx
      <div className="flex flex-col gap-2.5">
        <Button disabled={busy} onClick={() => respond('yes')} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Oui, je veux participer</Button>
        <p className="m-0 text-[12.5px] leading-normal text-[#5B6B8C]">{EXCHANGE_TERMS_RESPOND}</p>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')} className="h-[50px] w-full rounded-[11px] border-[#C4CDE0] text-base font-semibold">Non merci</Button>
      </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- components/__tests__/InviteResponseForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/InviteResponseForm.tsx components/__tests__/InviteResponseForm.test.tsx
git commit -m "feat: terms acknowledgment notice under the accept button on /invite"
```

---

### Task 7: `updateReminderSettings` server action (TDD)

**Files:**
- Modify: `actions/exchanges.ts` (new action at the end of the file + type export)
- Test: `actions/__tests__/exchanges.test.ts` (harness tweak + new describe)

**Interfaces:**
- Consumes: `assertExchangeInScope` (private helper already in the file), `assertExchangeWritable` from `@/lib/exchange-guard` (already imported), columns from Task 1.
- Produces (Task 8's component imports these):
  - `export type ReminderCadence = 'douce' | 'normale' | 'insistante'` (type-only export — legal in a `'use server'` file; the `REMINDER_CADENCES` const must NOT be exported)
  - `export async function updateReminderSettings(exchangeId: string, enabled: boolean, cadence: ReminderCadence): Promise<void>` — throws `'Invalid cadence'`, `'Unauthenticated'`, `'Unauthorized'`, or the guard's `ARCHIVED_ERROR` (`'Programme archivé — lecture seule.'`).

- [ ] **Step 1: Extend the test harness for archived state**

In `actions/__tests__/exchanges.test.ts`:

Change the scenario declaration to:

```ts
let scenario: { role: string; school: string; exchangeSchools: [string, string]; archived: boolean; updated: any }
```

In `makeClient()`, change the `maybeSingle` to include `archived_at` (read by both `assertExchangeInScope` and `assertExchangeWritable`):

```ts
        maybeSingle: async () => table === 'exchanges'
          ? { data: {
              school_a_id: scenario.exchangeSchools[0], school_b_id: scenario.exchangeSchools[1],
              archived_at: scenario.archived ? '2026-01-01T00:00:00Z' : null,
            } }
          : { data: null },
```

Change the `beforeEach` to:

```ts
beforeEach(() => { scenario = { role: 'organizer', school: 's-1', exchangeSchools: ['s-1', 's-2'], archived: false, updated: null } })
```

Change the import line to also pull the new action:

```ts
import { setApplicationOpen, updateReminderSettings } from '../exchanges'
```

- [ ] **Step 2: Add the failing tests**

Append at the end of the file:

```ts
describe('updateReminderSettings', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(updateReminderSettings('ex-1', true, 'normale')).rejects.toThrow('Unauthorized')
  })
  it('rejects an out-of-scope organizer', async () => {
    scenario.exchangeSchools = ['s-8', 's-9']
    await expect(updateReminderSettings('ex-1', true, 'normale')).rejects.toThrow('Unauthorized')
  })
  it('rejects a cadence outside the allow-list', async () => {
    await expect(updateReminderSettings('ex-1', true, 'daily' as any)).rejects.toThrow('Invalid cadence')
  })
  it('rejects an archived exchange', async () => {
    scenario.archived = true
    await expect(updateReminderSettings('ex-1', false, 'douce')).rejects.toThrow('archivé')
  })
  it('updates both columns for an in-scope organizer', async () => {
    await updateReminderSettings('ex-1', false, 'insistante')
    expect(scenario.updated).toEqual({ reminders_enabled: false, reminder_cadence: 'insistante' })
  })
})
```

- [ ] **Step 3: Run to verify the new tests fail (and old ones pass)**

Run: `pnpm test -- actions/__tests__/exchanges.test.ts`
Expected: the 2 `setApplicationOpen` tests PASS (harness change is compatible); the 5 new tests FAIL (`updateReminderSettings` not exported).

- [ ] **Step 4: Implement the action**

Append at the end of `actions/exchanges.ts`:

```ts
// Cadence allow-list. NOT exported: a 'use server' file may only export async
// functions (plus type-only exports). The DB CHECK constraint is the backstop.
const REMINDER_CADENCES = ['douce', 'normale', 'insistante'] as const
export type ReminderCadence = (typeof REMINDER_CADENCES)[number]

export async function updateReminderSettings(
  exchangeId: string, enabled: boolean, cadence: ReminderCadence,
): Promise<void> {
  if (!REMINDER_CADENCES.includes(cadence)) throw new Error('Invalid cadence')
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  await assertExchangeInScope(supabase, exchangeId)
  await assertExchangeWritable(supabase, exchangeId)

  const { error } = await supabase
    .from('exchanges')
    .update({ reminders_enabled: enabled, reminder_cadence: cadence })
    .eq('id', exchangeId)
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- actions/__tests__/exchanges.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add actions/exchanges.ts actions/__tests__/exchanges.test.ts
git commit -m "feat: updateReminderSettings server action (cadence allow-list, archived guard)"
```

---

### Task 8: « Rappels automatiques » card on the exchange page (TDD)

**Files:**
- Create: `components/exchanges/ReminderSettingsCard.tsx`
- Modify: `app/(organizer)/exchanges/[id]/page.tsx`
- Test: `components/exchanges/__tests__/ReminderSettingsCard.test.tsx`

**Interfaces:**
- Consumes: `updateReminderSettings` + `type ReminderCadence` from `@/actions/exchanges` (Task 7). `getExchange` already returns `select('*')`, so `reminders_enabled`, `reminder_cadence`, and `archived_at` flow to the page with no action change.
- Produces: `ReminderSettingsCard({ exchangeId: string; initialEnabled: boolean; initialCadence: ReminderCadence; readOnly: boolean })`.

- [ ] **Step 1: Write the failing tests**

Create `components/exchanges/__tests__/ReminderSettingsCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/exchanges', () => ({ updateReminderSettings: vi.fn(async () => {}) }))

import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'
import { updateReminderSettings } from '@/actions/exchanges'

describe('ReminderSettingsCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the three presets with the saved one selected', () => {
    render(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="normale" readOnly={false} />)
    expect(screen.getByText('Rappels automatiques')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /normale/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /douce/i })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /insistante/i })).toBeInTheDocument()
  })

  it('saves a cadence change', async () => {
    const user = userEvent.setup()
    render(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="normale" readOnly={false} />)
    await user.click(screen.getByRole('radio', { name: /insistante/i }))
    expect(updateReminderSettings).toHaveBeenCalledWith('ex-1', true, 'insistante')
  })

  it('turning reminders off hides the presets and saves', async () => {
    const user = userEvent.setup()
    render(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="douce" readOnly={false} />)
    await user.click(screen.getByRole('button', { name: 'Désactivés' }))
    expect(updateReminderSettings).toHaveBeenCalledWith('ex-1', false, 'douce')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('archived: read-only, nothing saved', async () => {
    const user = userEvent.setup()
    render(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="normale" readOnly />)
    expect(screen.getByText(/lecture seule/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Désactivés' }))
    expect(updateReminderSettings).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test -- components/exchanges/__tests__/ReminderSettingsCard.test.tsx`
Expected: FAIL — cannot resolve `@/components/exchanges/ReminderSettingsCard`.

- [ ] **Step 3: Implement the card**

Create `components/exchanges/ReminderSettingsCard.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { updateReminderSettings, type ReminderCadence } from '@/actions/exchanges'

const CADENCES: { value: ReminderCadence; label: string; description: string }[] = [
  { value: 'douce', label: 'Douce', description: 'un rappel par semaine, sans accélération' },
  { value: 'normale', label: 'Normale', description: 'hebdomadaire, puis quotidien la dernière semaine' },
  { value: 'insistante', label: 'Insistante', description: 'tous les 3 jours, puis quotidien les 2 dernières semaines' },
]

export function ReminderSettingsCard({ exchangeId, initialEnabled, initialCadence, readOnly }: {
  exchangeId: string
  initialEnabled: boolean
  initialCadence: ReminderCadence
  readOnly: boolean
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [cadence, setCadence] = useState<ReminderCadence>(initialCadence)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Optimistic save: flip the UI immediately, roll back on failure.
  async function save(nextEnabled: boolean, nextCadence: ReminderCadence) {
    const prev = { enabled, cadence }
    setEnabled(nextEnabled); setCadence(nextCadence)
    setBusy(true); setError(null)
    try { await updateReminderSettings(exchangeId, nextEnabled, nextCadence) }
    catch (err) {
      setEnabled(prev.enabled); setCadence(prev.cadence)
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  const disabled = busy || readOnly

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-[15px] font-bold tracking-[-.01em] text-foreground">Rappels automatiques</div>
          <p className="m-0 mt-1 text-[12.5px] leading-normal text-muted-foreground">
            Des e-mails de rappel sont envoyés aux élèves dont le dossier est incomplet. La relance manuelle reste disponible même si les rappels sont désactivés.
          </p>
        </div>
        <div className="flex flex-none rounded-[9px] border p-0.5" role="group" aria-label="Rappels automatiques">
          <button
            type="button" disabled={disabled} onClick={() => save(true, cadence)}
            className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${enabled ? 'bg-tint text-tint-text' : 'text-muted-foreground hover:bg-hoverrow'}`}
          >
            Activés
          </button>
          <button
            type="button" disabled={disabled} onClick={() => save(false, cadence)}
            className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${!enabled ? 'bg-subtle text-foreground' : 'text-muted-foreground hover:bg-hoverrow'}`}
          >
            Désactivés
          </button>
        </div>
      </div>

      {enabled && (
        <div className="mt-4 flex flex-col gap-2">
          {CADENCES.map(c => (
            <label
              key={c.value}
              className={`flex items-start gap-3 rounded-xl border px-[18px] py-3 ${cadence === c.value ? 'border-tint-text/40 bg-tint/40' : 'border-subtle'} ${disabled ? 'opacity-70' : 'cursor-pointer'}`}
            >
              <input
                type="radio" name="reminder-cadence" value={c.value}
                checked={cadence === c.value} disabled={disabled}
                onChange={() => save(true, c.value)}
                className="mt-1"
              />
              <span>
                <span className="font-display text-[13.5px] font-semibold text-foreground">{c.label}</span>
                <span className="block text-[12.5px] text-muted-foreground">{c.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {readOnly && <p className="mt-3 text-[12.5px] text-muted-foreground">Programme archivé — lecture seule.</p>}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run the component tests**

Run: `pnpm test -- components/exchanges/__tests__/ReminderSettingsCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the card into the exchange detail page**

Replace the full content of `app/(organizer)/exchanges/[id]/page.tsx` with:

```tsx
import { getExchange, type ReminderCadence } from '@/actions/exchanges'
import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'

// Invite + application controls now live on the Aperçu CTA/modal and the
// Candidatures page. This route carries the exchange header + per-exchange
// automatic-reminder settings.
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const exchange = await getExchange(id)

  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">
        {exchange.school_a?.name} ↔ {exchange.school_b?.name} · {exchange.year}
      </p>
      <h1 className="font-display text-2xl font-semibold">{exchange.name}</h1>

      <div className="mt-6 max-w-[620px]">
        <ReminderSettingsCard
          exchangeId={exchange.id}
          initialEnabled={exchange.reminders_enabled ?? true}
          initialCadence={(exchange.reminder_cadence ?? 'normale') as ReminderCadence}
          readOnly={Boolean(exchange.archived_at)}
        />
      </div>
    </div>
  )
}
```

(`?? true` / `?? 'normale'` keep the page working before the migration is pushed — same defaults as the DB.)

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm lint && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add components/exchanges/ReminderSettingsCard.tsx components/exchanges/__tests__/ReminderSettingsCard.test.tsx "app/(organizer)/exchanges/[id]/page.tsx"
git commit -m "feat: Rappels automatiques card on the exchange detail page"
```

---

### Task 9: Docs, final gate, and the deploy checklist

**Files:**
- Modify: `CLAUDE.md` (Automated Reminders section)

**Interfaces:** none — documentation + verification only.

- [ ] **Step 1: Update the Automated Reminders section of `CLAUDE.md`**

Replace the paragraph under `## Automated Reminders` with:

```markdown
A Supabase Edge Function (`send-reminders`) runs daily at 08:00 via cron. Pacing is per exchange: organizers pick a preset on the exchange detail page — `douce` (weekly, never accelerates), `normale` (weekly, then daily during the final week and while overdue — the default) or `insistante` (every 3 days, then daily during the final 2 weeks and while overdue) — or turn automatic reminders off entirely (`exchanges.reminders_enabled`). Interval math lives in `supabase/functions/send-reminders/pacing.ts` (pure, vitest-tested). Pacing is tracked per assignment via `assignments.last_reminded_at`; manual « Relancer » ignores these settings. Rejection notifications are sent immediately when an organizer rejects a submission. Deploying edge-function changes is manual: `supabase functions deploy send-reminders`.
```

- [ ] **Step 2: Final verification (whole branch)**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green. Also scan `git diff main --stat` for unexpected files (no PII, no stray artifacts).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: per-exchange reminder presets in Automated Reminders section"
```

- [ ] **Step 4: STOP — hand back for review + deploy gates (do not execute)**

Not part of implementation; recorded here so nothing is forgotten at merge time:

1. **SHIP GATE:** terms wording in `lib/exchange-terms.ts` reviewed with Mom **before any prod deploy**. Code may merge behind this gate but must not ship to production until approved.
2. **Deploy order:** `supabase db push` (migration `20260707000001`) **before** `supabase functions deploy send-reminders`. The new function selects the new columns, so PostgREST would 400 if the function ships first. The old function keeps today's behavior in the gap; defaults mean no backfill. (WSL2 note: if `db push` hangs at "Initialising login role", use the IPv4 session pooler `--db-url`.)
3. **Preview live-drive** (Vercel preview URL, not prod): flip the cadence + off switch on a test exchange and confirm persistence after reload; verify the card is read-only on an archived exchange; accept an invite and confirm `terms_acknowledged_at` landed (`select terms_acknowledged_at from applications where …` via MCP) and the acceptance email + respond page show the terms notice in French.
4. Merge via `superpowers:finishing-a-development-branch` (user confirmation required before anything reaches `main`/prod).
```
