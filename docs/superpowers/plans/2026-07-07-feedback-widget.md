# Feedback Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give organizers a discreet in-dashboard widget to send suggestions/bug reports, persisting each to a new `feedback` table (source of truth) and pinging Bjorn by email.

**Architecture:** New `feedback` table with an INSERT-only RLS policy for `authenticated` (organizer gate lives in the server action, not RLS). A `submitFeedback` server action validates input, inserts via the normal server client, and fires a best-effort Resend notification (`sendFeedbackNotificationEmail`). UI is a rail item in `OrganizerShell` opening a `FeedbackModal` styled after `NewExchangeModal`, returning a structured `{ ok }` result (never throws for expected failures, per the prod-redaction convention).

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (Postgres + RLS), Resend, Tailwind + shadcn/ui, Vitest + Testing Library.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Gate before every commit: `pnpm lint`, `pnpm test`, `tsc --noEmit` (local `pnpm build` fails on placeholder env — use `tsc --noEmit` instead).
- **Never throw for expected failures** in server actions — prod redacts thrown Server Action messages. Return `{ ok: false, error: string }`.
- **Always HTML-escape** every interpolated value in email HTML (use the existing `esc()` helper).
- RLS `auth.uid()` must be wrapped as `(select auth.uid())` (STABLE/initplan convention).
- **Never log student/parent PII.** This widget is organizer-only (adult); organizer name/school in the email is fine. Still never log the message body or email address.
- All new French UI copy uses proper typographic apostrophes/quotes (`’`, `«  »`) exactly as written in this plan.
- New table needs indexes on both FK columns (`unindexed_fks` advisor convention).

---

### Task 1: `feedback` table migration

**Files:**
- Create: `supabase/migrations/20260707000002_feedback.sql`

> **Migration number:** `20260707000001` is already claimed by the parallel
> email-controls plan (`docs/superpowers/plans/2026-07-07-email-controls-acceptance-terms.md`).
> This feedback migration is `20260707000002` to avoid a version collision.

**Interfaces:**
- Produces: table `feedback(id, user_id, school_id, type, message, page_path, status, created_at)`; INSERT-only RLS policy `"users insert own feedback"` for role `authenticated` with check `user_id = (select auth.uid())`. No SELECT/UPDATE/DELETE policies (service-role triage only).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260707000002_feedback.sql`:

```sql
-- Organizer feedback (suggestions + bug reports). Source of truth for a future
-- automated triage loop; each insert also pings Bjorn by email (best-effort).
--
-- INSERT-only for authenticated users; the row is stamped with the caller's own
-- auth uid via the RLS with-check. The organizer-role gate lives in the
-- submitFeedback server action, not here — consistent with other organizer
-- actions. No SELECT/UPDATE/DELETE policies: status transitions
-- (new -> reviewed -> done) are made with the service role only (Studio/MCP).

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  school_id uuid not null references schools(id),
  type text not null check (type in ('suggestion','bug')),
  message text not null check (char_length(message) between 1 and 2000),
  page_path text,
  status text not null default 'new' check (status in ('new','reviewed','done')),
  created_at timestamptz not null default now()
);

create index feedback_user_idx on feedback(user_id);
create index feedback_school_idx on feedback(school_id);

alter table feedback enable row level security;

-- Single INSERT policy: an authenticated user may only insert rows stamped with
-- their own uid. (select auth.uid()) per the initplan/STABLE convention.
create policy "users insert own feedback" on feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()));
```

- [ ] **Step 2: Verify the SQL parses locally**

The DB is not applied here (a prod-data review gate governs pushes). Sanity-check the file byte-for-byte against Task 1's block and confirm it is saved at the exact path. No command to run.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260707000002_feedback.sql
git commit -m "feat: feedback table + insert-only RLS policy"
```

**Note for later:** applying this migration to prod (`supabase db push`) is a manual, out-of-band step gated by the usual review — NOT part of code execution. Do not run it during this plan.

---

### Task 2: `sendFeedbackNotificationEmail` helper

**Files:**
- Modify: `lib/email.ts` (append a new exported helper after `sendOrganizerInviteEmail`, around line 223)
- Test: `lib/__tests__/feedback-email.test.ts`

**Interfaces:**
- Consumes: existing `esc()`, `layout()`, `send()` helpers in `lib/email.ts` (module-private; the new helper lives in the same file so it can call them).
- Produces: `export async function sendFeedbackNotificationEmail(opts: { type: 'suggestion' | 'bug'; schoolName: string; organizerName: string; pagePath: string | null; message: string }): Promise<void>` — sends to `process.env.FEEDBACK_EMAIL`; returns (no send) if that env var is unset.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/feedback-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendFeedbackNotificationEmail } from '@/lib/email'

describe('sendFeedbackNotificationEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
    process.env.FEEDBACK_EMAIL = 'bjorn@example.com'
  })

  it('escapes HTML in message, school, and organizer name; sends to FEEDBACK_EMAIL', async () => {
    await sendFeedbackNotificationEmail({
      type: 'bug',
      schoolName: 'Lycée <Mistral>',
      organizerName: 'Marie <B>',
      pagePath: '/dashboard',
      message: 'Le bouton <script> ne marche pas',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const { to, subject, html } = sendMock.mock.calls[0][0]
    expect(to).toBe('bjorn@example.com')
    expect(subject).toBe('Nouveau feedback (bug) — Lycée <Mistral>')
    expect(html).toContain('Lycée &lt;Mistral&gt;')
    expect(html).toContain('Marie &lt;B&gt;')
    expect(html).toContain('Le bouton &lt;script&gt; ne marche pas')
    expect(html).not.toContain('<script>')
  })

  it('does nothing when FEEDBACK_EMAIL is unset', async () => {
    delete process.env.FEEDBACK_EMAIL
    await sendFeedbackNotificationEmail({
      type: 'suggestion',
      schoolName: 'S',
      organizerName: 'N',
      pagePath: null,
      message: 'hi',
    })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/__tests__/feedback-email.test.ts`
Expected: FAIL — `sendFeedbackNotificationEmail` is not exported from `@/lib/email`.

- [ ] **Step 3: Add the helper**

Append to `lib/email.ts` (after `sendOrganizerInviteEmail`, at end of file):

```ts
export async function sendFeedbackNotificationEmail(opts: {
  type: 'suggestion' | 'bug'
  schoolName: string
  organizerName: string
  pagePath: string | null
  message: string
}): Promise<void> {
  const to = process.env.FEEDBACK_EMAIL
  // Optional, Bjorn-only var: the row is the source of truth, so skip silently.
  if (!to) return

  const typeLabel = opts.type === 'bug' ? 'Bug' : 'Suggestion'
  const path = opts.pagePath ? esc(opts.pagePath) : '—'
  const message = esc(opts.message).replace(/\n/g, '<br>')
  const html = layout(`
    <p><strong>${typeLabel}</strong> — ${esc(opts.schoolName)}</p>
    <p style="font-size:13px;color:#5C7268;">De ${esc(opts.organizerName)} · page ${path}</p>
    <p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${message}</p>
  `, ORG_FOOTER)
  await send(to, `Nouveau feedback (${opts.type}) — ${opts.schoolName}`, html, 'feedback notification email')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/__tests__/feedback-email.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/__tests__/feedback-email.test.ts
git commit -m "feat: sendFeedbackNotificationEmail helper"
```

---

### Task 3: `submitFeedback` server action

**Files:**
- Create: `actions/feedback.ts`
- Test: `actions/__tests__/feedback.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `getProfile` from `@/lib/supabase/request` (returns `Profile | null` with `id`, `role`, `school_id`, `full_name`, and `schools: { name } | null`), `sendFeedbackNotificationEmail` from `@/lib/email` (Task 2).
- Produces: `export async function submitFeedback(input: { type: string; message: string; pagePath?: string | null }): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/feedback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let profile: any
let insertError: unknown
let calls: { inserted: any; fromTables: string[] }

function makeClient() {
  calls = { inserted: null, fromTables: [] }
  return {
    from(table: string) {
      calls.fromTables.push(table)
      if (table === 'feedback') {
        return { insert: async (row: any) => { calls.inserted = row; return { error: insertError ?? null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

const getProfile = vi.fn(async () => profile)
const sendFeedbackNotificationEmail = vi.fn(async () => {})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('@/lib/email', () => ({
  sendFeedbackNotificationEmail: (...args: unknown[]) => sendFeedbackNotificationEmail(...args),
}))

import { submitFeedback } from '../feedback'

const organizer = {
  id: 'u1', role: 'organizer', school_id: 's1', full_name: 'Marie Bernard',
  schools: { name: 'Lycée Mistral' },
}

beforeEach(() => {
  profile = organizer
  insertError = null
  getProfile.mockClear()
  sendFeedbackNotificationEmail.mockClear()
})

describe('submitFeedback', () => {
  it('rejects a non-organizer without inserting', async () => {
    profile = { ...organizer, role: 'student' }
    const result = await submitFeedback({ type: 'bug', message: 'x', pagePath: '/my-forms' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects when there is no profile', async () => {
    profile = null
    const result = await submitFeedback({ type: 'bug', message: 'x' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects an invalid type', async () => {
    const result = await submitFeedback({ type: 'praise', message: 'x' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects an empty (whitespace-only) message', async () => {
    const result = await submitFeedback({ type: 'suggestion', message: '   ' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects a message longer than 2000 chars', async () => {
    const result = await submitFeedback({ type: 'suggestion', message: 'a'.repeat(2001) })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('inserts the expected payload (trimmed message, ids from profile) and returns ok', async () => {
    const result = await submitFeedback({ type: 'bug', message: '  broken button  ', pagePath: '/dashboard' })
    expect(result).toEqual({ ok: true })
    expect(calls.inserted).toEqual({
      user_id: 'u1',
      school_id: 's1',
      type: 'bug',
      message: 'broken button',
      page_path: '/dashboard',
    })
    expect(sendFeedbackNotificationEmail).toHaveBeenCalledTimes(1)
  })

  it('truncates an over-long pagePath to 300 chars', async () => {
    await submitFeedback({ type: 'bug', message: 'x', pagePath: '/' + 'a'.repeat(500) })
    expect(calls.inserted.page_path).toHaveLength(300)
  })

  it('coerces a missing pagePath to null', async () => {
    await submitFeedback({ type: 'suggestion', message: 'x' })
    expect(calls.inserted.page_path).toBeNull()
  })

  it('still returns ok when the notification email throws', async () => {
    sendFeedbackNotificationEmail.mockRejectedValueOnce(new Error('resend down'))
    const result = await submitFeedback({ type: 'suggestion', message: 'idea' })
    expect(result).toEqual({ ok: true })
    expect(calls.inserted).not.toBeNull()
  })

  it('returns an error (never throws) when the insert fails', async () => {
    insertError = { message: 'db down' }
    const result = await submitFeedback({ type: 'bug', message: 'x' })
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- actions/__tests__/feedback.test.ts`
Expected: FAIL — cannot find module `../feedback`.

- [ ] **Step 3: Write the action**

Create `actions/feedback.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/request'
import { sendFeedbackNotificationEmail } from '@/lib/email'

type FeedbackResult = { ok: true } | { ok: false; error: string }

const GENERIC_ERROR = 'Une erreur est survenue. Veuillez réessayer.'

export async function submitFeedback(input: {
  type: string
  message: string
  pagePath?: string | null
}): Promise<FeedbackResult> {
  // Organizer-only surface. Gate in the action (not RLS), like other org actions.
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') {
    return { ok: false, error: GENERIC_ERROR }
  }

  const type = input.type
  if (type !== 'suggestion' && type !== 'bug') {
    return { ok: false, error: GENERIC_ERROR }
  }

  const message = (input.message ?? '').trim()
  if (message.length < 1 || message.length > 2000) {
    return { ok: false, error: 'Votre message doit faire entre 1 et 2000 caractères.' }
  }

  const pagePath = input.pagePath ? input.pagePath.slice(0, 300) : null

  const supabase = await createClient()
  const { error } = await supabase.from('feedback').insert({
    user_id: profile.id,
    school_id: profile.school_id,
    type,
    message,
    page_path: pagePath,
  })
  if (error) {
    // Expected DB failure (RLS/constraint/outage): return, never throw.
    return { ok: false, error: GENERIC_ERROR }
  }

  // Best-effort notification. The row is already saved and is the source of
  // truth — a Resend outage must not surface an error or lose the feedback.
  try {
    await sendFeedbackNotificationEmail({
      type,
      schoolName: profile.schools?.name ?? '',
      organizerName: profile.full_name ?? '',
      pagePath,
      message,
    })
  } catch {
    console.error('[feedback] notification email failed')
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- actions/__tests__/feedback.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add actions/feedback.ts actions/__tests__/feedback.test.ts
git commit -m "feat: submitFeedback server action"
```

---

### Task 4: `FeedbackModal` component + rail icon

**Files:**
- Modify: `components/shell/RailIcons.tsx` (add `IconFeedback` after `IconSettings`)
- Create: `components/shell/FeedbackModal.tsx`
- Test: `components/shell/__tests__/FeedbackModal.test.tsx`

**Interfaces:**
- Consumes: `submitFeedback` from `@/actions/feedback` (Task 3); shadcn `Dialog*`, `Textarea`, `Button`, `Label`; `cn` from `@/lib/utils`.
- Produces: `export function FeedbackModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`; `export function IconFeedback()` in `RailIcons.tsx`.

- [ ] **Step 1: Add the rail icon**

Append to `components/shell/RailIcons.tsx` (after `IconSettings`). A speech-bubble (message-square) glyph matching the existing outline style:

```tsx
export function IconFeedback() {
  return (
    <div className="relative h-4 w-4 rounded-[3px] rounded-bl-none border-[1.5px] border-current">
      <div className="absolute -bottom-[3px] left-[2px] h-[4px] w-[4px] rotate-45 border-b-[1.5px] border-l-[1.5px] border-current bg-rail" />
    </div>
  )
}
```

- [ ] **Step 2: Write the failing test**

Create `components/shell/__tests__/FeedbackModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const submitFeedback = vi.fn()
vi.mock('@/actions/feedback', () => ({ submitFeedback: (...args: unknown[]) => submitFeedback(...args) }))

import { FeedbackModal } from '@/components/shell/FeedbackModal'

describe('FeedbackModal', () => {
  beforeEach(() => {
    submitFeedback.mockReset()
  })

  it('renders both type pills and the textarea', () => {
    render(<FeedbackModal open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Suggestion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bug ou problème' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…')).toBeInTheDocument()
  })

  it('shows the merci state and closes on a successful submit', async () => {
    vi.useFakeTimers()
    submitFeedback.mockResolvedValueOnce({ ok: true })
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FeedbackModal open onOpenChange={onOpenChange} />)

    await user.type(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…'), 'Une idée')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText(/Merci !/)).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(1600)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    vi.useRealTimers()
  })

  it('shows the structured error inline and keeps the dialog open', async () => {
    submitFeedback.mockResolvedValueOnce({ ok: false, error: 'Votre message doit faire entre 1 et 2000 caractères.' })
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<FeedbackModal open onOpenChange={onOpenChange} />)

    await user.type(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…'), 'x')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('Votre message doit faire entre 1 et 2000 caractères.')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('disables the submit button while the request is in flight', async () => {
    let resolve!: (v: { ok: true }) => void
    submitFeedback.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<FeedbackModal open onOpenChange={() => {}} />)

    await user.type(screen.getByPlaceholderText('Décrivez votre idée ou le problème rencontré…'), 'idea')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(screen.getByRole('button', { name: 'Envoi…' })).toBeDisabled()
    resolve({ ok: true })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Envoi…' })).toBeNull())
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- components/shell/__tests__/FeedbackModal.test.tsx`
Expected: FAIL — cannot find module `@/components/shell/FeedbackModal`.

- [ ] **Step 4: Write the modal**

Create `components/shell/FeedbackModal.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { submitFeedback } from '@/actions/feedback'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type FeedbackType = 'suggestion' | 'bug'

export function FeedbackModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [type, setType] = useState<FeedbackType>('suggestion')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  // Reset every time the dialog opens.
  useEffect(() => {
    if (open) {
      setType('suggestion')
      setMessage('')
      setError(null)
      setLoading(false)
      setSent(false)
    }
  }, [open])

  // Auto-close shortly after the merci state appears.
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => onOpenChange(false), 1500)
    return () => clearTimeout(t)
  }, [sent, onOpenChange])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await submitFeedback({
        type,
        message,
        pagePath: typeof window !== 'undefined' ? window.location.pathname : null,
      })
      if (result.ok) {
        setSent(true)
        return
      }
      setError(result.error)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  const pill = (value: FeedbackType, label: string) => (
    <button
      type="button"
      onClick={() => setType(value)}
      className={cn(
        'rounded-pill px-4 py-1.5 text-[13px] font-semibold',
        type === value ? 'bg-brand text-white' : 'bg-subtle text-muted-foreground hover:bg-hoverrow'
      )}
    >
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
            Une suggestion ? Un problème ?
          </DialogTitle>
        </DialogHeader>
        {sent ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-muted px-3.5 py-6 text-center text-sm text-foreground"
          >
            Merci ! Votre message a bien été envoyé.
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <div className="flex gap-2.5">
              {pill('suggestion', 'Suggestion')}
              {pill('bug', 'Bug ou problème')}
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décrivez votre idée ou le problème rencontré…"
              maxLength={2000}
              required
              className="min-h-[130px]"
            />
            {error && <p className="text-sm text-danger-text">{error}</p>}
            <div className="mt-1.5 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- components/shell/__tests__/FeedbackModal.test.tsx`
Expected: PASS (all four tests).

- [ ] **Step 6: Commit**

```bash
git add components/shell/RailIcons.tsx components/shell/FeedbackModal.tsx components/shell/__tests__/FeedbackModal.test.tsx
git commit -m "feat: FeedbackModal component + rail icon"
```

---

### Task 5: Wire the Feedback rail item into `OrganizerShell`

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`
- Modify: `components/shell/__tests__/OrganizerShell.test.tsx` (add the mock + a test)

**Interfaces:**
- Consumes: `FeedbackModal` (Task 4), `IconFeedback` (Task 4).
- Produces: a « Feedback » rail button above the profile-menu block that opens `FeedbackModal`.

**Note on shape:** the existing `RailItem` renders a `next/link`. Feedback opens a modal, not a route — so it is a `<button>` styled to match `RailItem`, not a `RailItem`. Mirror `RailItem`'s classes exactly (the inactive branch) so it reads identically in the rail.

- [ ] **Step 1: Add the FeedbackModal mock and a failing test**

In `components/shell/__tests__/OrganizerShell.test.tsx`, add this mock next to the existing `vi.mock` calls (after the `@/actions/exchanges` mock on line 14):

```tsx
vi.mock('@/components/shell/FeedbackModal', () => ({
  FeedbackModal: ({ open }: { open: boolean }) => (open ? <div>feedback-modal-open</div> : null),
}))
```

Then add this test inside the `describe('OrganizerShell', ...)` block:

```tsx
it('shows a Feedback rail button that opens the feedback modal', () => {
  render(
    <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
      <p>page</p>
    </OrganizerShell>
  )
  expect(screen.queryByText('feedback-modal-open')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Feedback/ }))
  expect(screen.getByText('feedback-modal-open')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/shell/__tests__/OrganizerShell.test.tsx`
Expected: FAIL — no button named `Feedback` (and the modal mock resolves once the import is added).

- [ ] **Step 3: Wire the modal into the shell**

In `components/shell/OrganizerShell.tsx`:

3a. Add `IconFeedback` to the RailIcons import (line 8):

```tsx
import { IconOverview, IconExchanges, IconApplications, IconForms, IconDocs, IconStudents, IconSettings, IconFeedback } from './RailIcons'
```

3b. Add the FeedbackModal import after the `NewExchangeModal` import (line 10):

```tsx
import { FeedbackModal } from './FeedbackModal'
```

3c. Add feedback modal state next to `newExchangeOpen` (line 85):

```tsx
  const [feedbackOpen, setFeedbackOpen] = useState(false)
```

3d. In the bottom `<div ref={menuRef} className="relative mt-auto">` block, add the Feedback button just above it so it sits between the nav rail items and the profile menu. Replace this line (line 183):

```tsx
        <div ref={menuRef} className="relative mt-auto">
```

with:

```tsx
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="mt-auto flex w-[62px] flex-col items-center gap-1.5 rounded-[11px] py-[9px] font-mono text-[9px] font-medium text-rail-inactive hover:bg-white/5 hover:text-white"
        >
          <IconFeedback />
          <span>Feedback</span>
        </button>
        <div ref={menuRef} className="relative mt-2.5">
```

(Note: `mt-auto` moves from the profile-menu div to the Feedback button so the button + menu group together at the bottom; the profile div's top margin becomes `mt-2.5` for spacing.)

3e. Add the modal render next to `<NewExchangeModal .../>` at the end (after line 282, before the final closing `</div>`):

```tsx
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- components/shell/__tests__/OrganizerShell.test.tsx`
Expected: PASS (existing tests + the new Feedback test).

- [ ] **Step 5: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: lint clean, all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/__tests__/OrganizerShell.test.tsx
git commit -m "feat: Feedback rail item wired into OrganizerShell"
```

---

## Post-execution (out of band, NOT part of code execution)

- Apply the migration to prod: `supabase db push` (gated by the usual review; do not run during plan execution).
- Set `FEEDBACK_EMAIL` in the Vercel prod environment (optional var; unset ⇒ email silently skipped, row still saved). It is Bjorn-only and intentionally not in CLAUDE.md's required-env list.

## Spec Coverage Check

- Data model / migration → Task 1 (table, checks, indexes, INSERT-only RLS with `(select auth.uid())`).
- Non-organizer blocked in the action, not RLS → Task 3 (role gate) + test.
- Server action steps 1–5 (getProfile+role, validation, insert, swallow email failure, structured result) → Task 3 + tests.
- Notification email (`FEEDBACK_EMAIL`, subject, escaped body, skip-if-unset) → Task 2 + tests.
- UI rail item above profile menu, message-square icon, French label → Task 4 (icon) + Task 5 (placement).
- Modal (title, pills default Suggestion, textarea+placeholder+maxLength, Envoyer/Envoi…, merci state + auto-close, inline errors, captures `window.location.pathname`) → Task 4 + tests.
- Testing across `actions/__tests__`, `lib`, `components/shell/__tests__` → Tasks 2–5.
- Out-of-scope items (student widget, in-app triage, attachments, rate limiting) → not built, correctly absent.
