# Phase 5 — Student space « Mon dossier » (redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate everything under `app/(student)/` to the redesigned, French (tutoiement) design language — a calm « Mon dossier » home that groups the checklist by status with progress + next deadline, plus a restyled fill/upload flow — with zero data-model, RLS, or server-action change.

**Architecture:** Pure derivation lib (`lib/student/dossier.ts`) turns the existing `getMyAssignments()` payload into a status-bucketed view model; a presentational `DossierView` renders it (server page = thin wrapper, so the view is unit-testable). A new `getStudentContext()` read feeds the redesigned top bar. The fill route `/my-forms/[assignmentId]` stays a real cold-loadable page (rejection emails deep-link it) and is restyled in place; `DataEntryForm`/`DocumentUploadForm` are translated to French in place (no other consumer). Storage/upload/submit wiring is reused untouched.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Supabase, Tailwind + shadcn/ui, vitest + @testing-library/react.

## Global Constraints

- **All new copy French, tutoiement.** Apostrophes MUST be typographic U+2019 (`’`), never ASCII `'` — this is the recurring branch regression (Phase 4 Tasks 2/4/8/11). Every FR string in a JSX/text position uses `’`.
- **No data-model, RLS, migration, or server-action change** for the core flow. Reuse untouched: `getMyAssignments`, `getAssignmentDetails`, `saveFormAnswers`, `recordDocumentUpload`, `submitDocumentAssignment`, `createSignedUrl`, `validateUploadFile`, `ALLOWED_UPLOAD_ACCEPT`, the storage upload path. Merge to main = Vercel prod deploy (user-gated); **no `supabase db push`**.
- **`/my-forms/[assignmentId]` must stay cold-loadable** — never make it depend on home-page state (rejection email lands a student there directly).
- **No student/parent PII in logs** (names, emails, submission contents). New reads are self-scoped only.
- **No `send-reminders` change ships** — transactional/reminder emails stay English (parked for the emails pass).
- **Reuse in-repo tokens only** (all already defined in `tailwind.config.ts`): `bg-background` (#EEF1F7), `bg-card`, `text-navy`, `text-foreground`, `text-muted-foreground`, `bg-brand`/`bg-brand-hover`, `bg-tint`/`text-tint-text`/`border-tint-border`, `bg-subtle`, `bg-hoverrow`, `text-placeholder`, `bg-success`/`text-success-text`, `bg-danger`/`text-danger-text`, `shadow-float`, `rounded-pill`, `font-display`, `font-mono`. Status pills reuse `Badge` variants `success`/`info`/`danger`/`neutral`.
- **Gates before merge (all green):** `pnpm lint`, `pnpm test`, `npx tsc --noEmit`, `pnpm build`.

---

## File Structure

**Create:**
- `lib/student/dossier.ts` — pure derivations: `bucketStatus`, `buildDossier`, `deriveName`, `dossierSubline`, types `RawAssignment`/`DossierItem`/`Dossier`.
- `lib/student/__tests__/dossier.test.ts` — unit tests for the above.
- `actions/student-context.ts` — `getStudentContext()` read-only helper (full name → prénom/initials; exchange label).
- `components/student/StudentTopBar.tsx` — redesigned top bar (client; avatar menu + sign out).
- `components/student/__tests__/StudentTopBar.test.tsx`.
- `components/student/DossierView.tsx` — presentational dossier home (sections, cards, progress, next deadline, done/empty banners).
- `components/student/__tests__/DossierView.test.tsx`.
- `components/__tests__/DataEntryForm.test.tsx`, `components/__tests__/DocumentUploadForm.test.tsx`.

**Modify:**
- `lib/submission-status.ts` — FR badge labels (student-only consumer; verified).
- `app/(student)/layout.tsx` — wire `getStudentContext` + `StudentTopBar`, centered 920px column.
- `app/(student)/my-forms/page.tsx` — thin server wrapper → `buildDossier` → `DossierView`.
- `app/(student)/my-forms/[assignmentId]/page.tsx` — restyle + French, same data.
- `components/DataEntryForm.tsx` — French copy + restyle, same logic.
- `components/DocumentUploadForm.tsx` — French copy + dashed upload zone, same logic.

**Delete:**
- `components/StudentNav.tsx` — replaced by `StudentTopBar`.

**Reuse untouched:** `actions/my-forms.ts`, `actions/submissions.ts`, `lib/uploads.ts`, `components/brand/Logo.tsx`, `components/ui/badge.tsx`, `components/ui/{input,textarea,label,select,button}.tsx`.

> Note: `getMyAssignments()` already selects everything the home needs (`form_templates(id, name, type, deadline, exchanges(name))` + `submissions(status, submitted_at, review_note)`). **No select extension is required** — the spec's "may need" did not materialize. Do not touch `actions/my-forms.ts`.

---

## Task 1: Dossier derivation lib + FR status labels

**Files:**
- Create: `lib/student/dossier.ts`
- Create: `lib/student/__tests__/dossier.test.ts`
- Modify: `lib/submission-status.ts`

**Interfaces:**
- Consumes: `SubmissionStatus` from `@/types/db`.
- Produces:
  - `bucketStatus(status: SubmissionStatus | null): 'todo' | 'review' | 'done'`
  - `buildDossier(assignments: RawAssignment[], now?: Date): Dossier`
  - `deriveName(fullName: string): { firstName: string; initials: string }`
  - `dossierSubline(d: Dossier): string`
  - types `RawAssignment`, `DossierItem`, `Dossier`, `DossierSection` (all exported).
  - `SUBMISSION_STATUS_BADGE` (existing export) relabelled to French.

- [ ] **Step 1: Write the failing test**

Create `lib/student/__tests__/dossier.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  bucketStatus, buildDossier, deriveName, dossierSubline,
  type RawAssignment,
} from '@/lib/student/dossier'

function raw(
  id: string,
  status: RawAssignment['submissions'] extends unknown ? string | null : never,
  deadline: string | null,
  exchange = 'Espagne 2026',
  type: 'data_entry' | 'document_upload' = 'document_upload',
): RawAssignment {
  return {
    id,
    assigned_at: '2026-01-01',
    form_templates: { id: `t-${id}`, name: `Pièce ${id}`, type, deadline, exchanges: { name: exchange } },
    submissions: status === null
      ? null
      : [{ status: status as never, submitted_at: '2026-06-01', review_note: status === 'rejected' ? 'Illisible' : null }],
  }
}

const NOW = new Date('2026-07-01T00:00:00Z')

describe('bucketStatus', () => {
  it('buckets no-submission / draft / rejected as todo', () => {
    expect(bucketStatus(null)).toBe('todo')
    expect(bucketStatus('draft')).toBe('todo')
    expect(bucketStatus('rejected')).toBe('todo')
  })
  it('buckets submitted as review and approved as done', () => {
    expect(bucketStatus('submitted')).toBe('review')
    expect(bucketStatus('approved')).toBe('done')
  })
})

describe('buildDossier', () => {
  const d = buildDossier([
    raw('a', null, '2026-07-10'),        // todo
    raw('b', 'draft', '2026-07-05'),     // todo (soonest)
    raw('c', 'rejected', '2026-06-20'),  // todo + overdue
    raw('d', 'submitted', '2026-07-08'), // review
    raw('e', 'approved', '2026-07-02'),  // done (deadline ignored for next)
  ], NOW)

  it('counts each section and sentCount = total - todoCount', () => {
    expect(d.total).toBe(5)
    expect(d.todoCount).toBe(3)
    expect(d.reviewCount).toBe(1)
    expect(d.doneCount).toBe(1)
    expect(d.sentCount).toBe(2) // submitted + approved
  })
  it('computes pct from sentCount/total', () => {
    expect(d.pct).toBe(40)
  })
  it('picks the soonest deadline among non-approved (todo+review)', () => {
    expect(d.nextDeadline).toBe('2026-07-05')
  })
  it('marks a past-deadline non-approved item overdue', () => {
    expect(d.todo.find(i => i.id === 'c')!.overdue).toBe(true)
    expect(d.todo.find(i => i.id === 'a')!.overdue).toBe(false)
  })
  it('never marks an approved item overdue', () => {
    expect(d.done[0].overdue).toBe(false)
  })
  it('detects multi-exchange', () => {
    expect(d.multiExchange).toBe(false)
    expect(buildDossier([raw('a', null, null, 'X'), raw('b', null, null, 'Y')], NOW).multiExchange).toBe(true)
  })
  it('handles an empty dossier', () => {
    const e = buildDossier([], NOW)
    expect(e.total).toBe(0)
    expect(e.pct).toBe(0)
    expect(e.nextDeadline).toBeNull()
  })
})

describe('deriveName', () => {
  it('splits prénom and two-letter initials', () => {
    expect(deriveName('Léa Dubois')).toEqual({ firstName: 'Léa', initials: 'LD' })
  })
  it('falls back to the whole name when single-word', () => {
    expect(deriveName('Léa')).toEqual({ firstName: 'Léa', initials: 'L' })
  })
})

describe('dossierSubline', () => {
  it('nudges toward remaining work with correct pluralization', () => {
    expect(dossierSubline(buildDossier([raw('a', null, '2026-07-10')], NOW))).toContain('1 chose')
    expect(dossierSubline(buildDossier([raw('a', null, '2026-07-10'), raw('b', null, '2026-07-11')], NOW))).toContain('2 choses')
  })
  it('confirms all sent when nothing is left to do but review pending', () => {
    expect(dossierSubline(buildDossier([raw('d', 'submitted', '2026-07-08')], NOW))).toContain('Tout est envoyé')
  })
  it('confirms complete when everything is approved', () => {
    expect(dossierSubline(buildDossier([raw('e', 'approved', null)], NOW))).toContain('toutes tes pièces sont validées')
  })
  it('has a gentle empty-dossier line', () => {
    expect(dossierSubline(buildDossier([], NOW))).toContain('Rien à remplir')
  })
  it('uses only typographic apostrophes (no ASCII) in every subline', () => {
    const lines = [
      dossierSubline(buildDossier([raw('a', null, '2026-07-10')], NOW)),
      dossierSubline(buildDossier([raw('d', 'submitted', '2026-07-08')], NOW)),
      dossierSubline(buildDossier([raw('e', 'approved', null)], NOW)),
      dossierSubline(buildDossier([], NOW)),
    ]
    for (const l of lines) expect(l).not.toMatch(/'/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/student/__tests__/dossier.test.ts`
Expected: FAIL — cannot resolve `@/lib/student/dossier`.

- [ ] **Step 3: Write the derivation lib**

Create `lib/student/dossier.ts`:

```ts
import type { SubmissionStatus } from '@/types/db'

export type DossierSection = 'todo' | 'review' | 'done'

type Sub = { status: SubmissionStatus; submitted_at: string | null; review_note: string | null }

// Raw assignment as returned by getMyAssignments(). PostgREST embeds the one
// submission per assignment as an array (occasionally as an object) — normalize.
export interface RawAssignment {
  id: string
  assigned_at: string
  form_templates: {
    id: string
    name: string
    type: 'data_entry' | 'document_upload'
    deadline: string | null
    exchanges: { name: string }
  }
  submissions: Sub | Sub[] | null
}

export interface DossierItem {
  id: string // assignment id
  name: string
  type: 'data_entry' | 'document_upload'
  deadline: string | null
  exchangeName: string
  status: SubmissionStatus | null
  reviewNote: string | null
  section: DossierSection
  overdue: boolean
}

export interface Dossier {
  items: DossierItem[]
  todo: DossierItem[]
  review: DossierItem[]
  done: DossierItem[]
  total: number
  todoCount: number
  reviewCount: number
  doneCount: number
  sentCount: number // submitted + approved = total − todoCount
  pct: number // 0–100, sentCount/total
  nextDeadline: string | null // soonest deadline among non-approved (todo+review)
  multiExchange: boolean
}

// no submission / draft / rejected → todo; submitted → review; approved → done
export function bucketStatus(status: SubmissionStatus | null): DossierSection {
  if (status === 'approved') return 'done'
  if (status === 'submitted') return 'review'
  return 'todo'
}

function firstSubmission(a: RawAssignment): Sub | null {
  const s = a.submissions
  return Array.isArray(s) ? (s[0] ?? null) : s
}

export function buildDossier(assignments: RawAssignment[], now: Date = new Date()): Dossier {
  const items: DossierItem[] = assignments.map(a => {
    const sub = firstSubmission(a)
    const status = sub?.status ?? null
    const section = bucketStatus(status)
    const deadline = a.form_templates.deadline
    const overdue =
      section !== 'done' && deadline != null && new Date(deadline).getTime() < now.getTime()
    return {
      id: a.id,
      name: a.form_templates.name,
      type: a.form_templates.type,
      deadline,
      exchangeName: a.form_templates.exchanges.name,
      status,
      reviewNote: sub?.review_note ?? null,
      section,
      overdue,
    }
  })

  const todo = items.filter(i => i.section === 'todo')
  const review = items.filter(i => i.section === 'review')
  const done = items.filter(i => i.section === 'done')
  const total = items.length
  const sentCount = total - todo.length
  const pct = total === 0 ? 0 : Math.round((sentCount / total) * 100)

  // ISO date strings sort chronologically lexicographically; [0] = soonest.
  const nextDeadline =
    [...todo, ...review]
      .map(i => i.deadline)
      .filter((d): d is string => d != null)
      .sort()[0] ?? null

  const multiExchange = new Set(items.map(i => i.exchangeName)).size > 1

  return {
    items, todo, review, done,
    total, todoCount: todo.length, reviewCount: review.length, doneCount: done.length,
    sentCount, pct, nextDeadline, multiExchange,
  }
}

// Prénom + two-letter initials from a full name (student top bar + greeting).
export function deriveName(fullName: string): { firstName: string; initials: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? fullName
  const initials = parts.slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
  return { firstName, initials }
}

// Encouraging subline under the greeting, driven by dossier composition.
export function dossierSubline(d: Dossier): string {
  if (d.total === 0) {
    return 'Rien à remplir pour l’instant — tes formulaires et documents apparaîtront ici.'
  }
  if (d.todoCount > 0) {
    const n = d.todoCount
    return `Il te reste ${n} ${n > 1 ? 'choses' : 'chose'} à faire pour compléter ton dossier avant le départ.`
  }
  if (d.reviewCount > 0) {
    return 'Tout est envoyé — on te prévient dès que la vérification est terminée.'
  }
  return 'Ton dossier est prêt — toutes tes pièces sont validées.'
}
```

- [ ] **Step 4: Relabel the status badge to French**

`lib/submission-status.ts` is student-only (both consumers are `app/(student)/…`; verified by grep). Replace the `SUBMISSION_STATUS_BADGE` object body:

```ts
export const SUBMISSION_STATUS_BADGE: Record<SubmissionStatus, { label: string; variant: BadgeVariant }> = {
  approved: { label: 'Validé', variant: 'success' },
  submitted: { label: 'En vérification', variant: 'info' },
  rejected: { label: 'À corriger', variant: 'danger' },
  draft: { label: 'Brouillon', variant: 'neutral' },
}
```

Leave the file's imports/types/comment intact.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test lib/student/__tests__/dossier.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add lib/student/dossier.ts lib/student/__tests__/dossier.test.ts lib/submission-status.ts
git commit -m "feat(student): dossier derivation lib + French status labels (phase 5)"
```

---

## Task 2: getStudentContext + redesigned top bar + layout

**Files:**
- Create: `actions/student-context.ts`
- Create: `components/student/StudentTopBar.tsx`
- Create: `components/student/__tests__/StudentTopBar.test.tsx`
- Modify: `app/(student)/layout.tsx`
- Delete: `components/StudentNav.tsx`

**Interfaces:**
- Consumes: `deriveName` (Task 1); `createClient` from `@/lib/supabase/server` and `@/lib/supabase/client`; `Logo` from `@/components/brand/Logo`.
- Produces:
  - `getStudentContext(): Promise<StudentContext>` where `StudentContext = { fullName: string; firstName: string; initials: string; exchangeLabel: string | null }`.
  - `StudentTopBar({ initials, exchangeLabel }: { initials: string; exchangeLabel: string | null })`.

- [ ] **Step 1: Write the failing test**

Create `components/student/__tests__/StudentTopBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
const signOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut } }) }))

import { StudentTopBar } from '@/components/student/StudentTopBar'

beforeEach(() => { push.mockClear(); refresh.mockClear(); signOut.mockClear() })

describe('StudentTopBar', () => {
  it('shows the exchange session label when present', () => {
    render(<StudentTopBar initials="LD" exchangeLabel="Espagne 2026" />)
    expect(screen.getByText('Espagne 2026')).toBeTruthy()
  })
  it('omits the label when null', () => {
    render(<StudentTopBar initials="LD" exchangeLabel={null} />)
    expect(screen.queryByText(/Espagne/)).toBeNull()
  })
  it('opens the avatar menu and signs out', async () => {
    render(<StudentTopBar initials="LD" exchangeLabel={null} />)
    expect(screen.queryByText('Se déconnecter')).toBeNull()
    fireEvent.click(screen.getByLabelText('Compte'))
    fireEvent.click(screen.getByText('Se déconnecter'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/student/__tests__/StudentTopBar.test.tsx`
Expected: FAIL — cannot resolve `@/components/student/StudentTopBar`.

- [ ] **Step 3: Write the top bar**

Create `components/student/StudentTopBar.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/brand/Logo'

export function StudentTopBar({ initials, exchangeLabel }: { initials: string; exchangeLabel: string | null }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b bg-card px-7">
      <Logo />
      <div className="flex items-center gap-3.5">
        {exchangeLabel && (
          <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {exchangeLabel}
          </span>
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Compte"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-tint font-mono text-[11px] font-semibold text-tint-text"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-[11px] border bg-card p-1 shadow-float">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/student/__tests__/StudentTopBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write getStudentContext**

Create `actions/student-context.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { deriveName } from '@/lib/student/dossier'

export interface StudentContext {
  fullName: string
  firstName: string
  initials: string
  exchangeLabel: string | null
}

export async function getStudentContext(): Promise<StudentContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  // Self read only — no PII logged.
  const { data: profile } = await supabase
    .from('users').select('full_name').eq('id', user.id).single<{ full_name: string }>()
  const fullName = profile?.full_name ?? ''
  const { firstName, initials } = deriveName(fullName)

  // Session label = the student's exchange (single-exchange is the MVP norm).
  // Read-only, self-scoped; degrade to null if unreadable/absent so the bar
  // still renders.
  const { data: enrollment } = await supabase
    .from('exchange_enrollments')
    .select('exchanges(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ exchanges: { name: string } | null }>()

  return { fullName, firstName, initials, exchangeLabel: enrollment?.exchanges?.name ?? null }
}
```

- [ ] **Step 6: Wire the layout and delete StudentNav**

Replace `app/(student)/layout.tsx` entirely:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StudentTopBar } from '@/components/student/StudentTopBar'
import { getStudentContext } from '@/actions/student-context'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') redirect('/dashboard')

  const ctx = await getStudentContext()

  return (
    <div className="min-h-screen bg-background">
      <StudentTopBar initials={ctx.initials} exchangeLabel={ctx.exchangeLabel} />
      <main className="mx-auto max-w-[920px] px-7 pb-[70px] pt-[34px]">{children}</main>
    </div>
  )
}
```

Then delete the old nav:

```bash
git rm components/StudentNav.tsx
```

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors (confirms no lingering `StudentNav` import).

- [ ] **Step 8: Commit**

```bash
git add actions/student-context.ts components/student/StudentTopBar.tsx components/student/__tests__/StudentTopBar.test.tsx app/(student)/layout.tsx
git commit -m "feat(student): redesigned top bar + getStudentContext + layout wiring (phase 5)"
```

---

## Task 3: Dossier home — DossierView + page wiring

**Files:**
- Create: `components/student/DossierView.tsx`
- Create: `components/student/__tests__/DossierView.test.tsx`
- Modify: `app/(student)/my-forms/page.tsx`

**Interfaces:**
- Consumes: `Dossier`, `DossierItem`, `dossierSubline` (Task 1); `Badge`; `buildDossier`, `RawAssignment`; `getMyAssignments`; `getStudentContext`.
- Produces: `DossierView({ dossier, firstName }: { dossier: Dossier; firstName: string })`.

- [ ] **Step 1: Write the failing test**

Create `components/student/__tests__/DossierView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DossierView } from '@/components/student/DossierView'
import { buildDossier, type RawAssignment } from '@/lib/student/dossier'

function raw(id: string, status: string | null, deadline: string | null, exchange = 'Espagne 2026'): RawAssignment {
  return {
    id, assigned_at: '2026-01-01',
    form_templates: { id: `t-${id}`, name: `Pièce ${id}`, type: 'document_upload', deadline, exchanges: { name: exchange } },
    submissions: status === null ? null : [{ status: status as never, submitted_at: '2026-06-01', review_note: status === 'rejected' ? 'Photo illisible' : null }],
  }
}
const NOW = new Date('2026-07-01T00:00:00Z')

describe('DossierView', () => {
  it('renders the three status sections with counts and per-status actions', () => {
    const d = buildDossier([
      raw('a', null, '2026-07-10'),
      raw('b', 'draft', '2026-07-05'),
      raw('c', 'rejected', '2026-06-20'),
      raw('d', 'submitted', '2026-07-08'),
      raw('e', 'approved', null),
    ], NOW)
    render(<DossierView dossier={d} firstName="Léa" />)
    expect(screen.getByText('Bonjour Léa,')).toBeTruthy()
    expect(screen.getByText('À faire · 3')).toBeTruthy()
    expect(screen.getByText('En vérification · 1')).toBeTruthy()
    expect(screen.getByText('Validés · 1')).toBeTruthy()
    expect(screen.getByText('Commencer')).toBeTruthy()   // no submission
    expect(screen.getByText('Continuer')).toBeTruthy()   // draft
    expect(screen.getByText('Corriger')).toBeTruthy()    // rejected
    expect(screen.getByText('Photo illisible')).toBeTruthy() // review note surfaced
    expect(screen.getByText('2 / 5 envoyés')).toBeTruthy()
  })

  it('shows the complete-dossier banner and no À-faire section when all approved', () => {
    const d = buildDossier([raw('a', 'approved', null), raw('b', 'approved', null)], NOW)
    render(<DossierView dossier={d} firstName="Léa" />)
    expect(screen.getByText('Ton dossier est complet')).toBeTruthy()
    expect(screen.queryByText(/À faire/)).toBeNull()
    expect(screen.getByText('2 / 2 envoyés')).toBeTruthy()
  })

  it('shows the all-sent banner when nothing is left to do but review pending', () => {
    const d = buildDossier([raw('a', 'submitted', '2026-07-08')], NOW)
    render(<DossierView dossier={d} firstName="Léa" />)
    expect(screen.getByText('Tout est envoyé')).toBeTruthy()
    expect(screen.queryByText(/À faire/)).toBeNull()
  })

  it('shows the gentle empty copy when nothing is assigned', () => {
    const d = buildDossier([], NOW)
    render(<DossierView dossier={d} firstName="Léa" />)
    expect(screen.getByText(/Rien à remplir/)).toBeTruthy()
    expect(screen.queryByText(/envoyés/)).toBeNull()
  })

  it('shows a mono exchange tag on cards only when multi-exchange', () => {
    const multi = buildDossier([raw('a', null, '2026-07-10', 'Espagne 2026'), raw('b', null, '2026-07-11', 'Italie 2026')], NOW)
    render(<DossierView dossier={multi} firstName="Léa" />)
    expect(screen.getByText('Espagne 2026')).toBeTruthy()
    expect(screen.getByText('Italie 2026')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/student/__tests__/DossierView.test.tsx`
Expected: FAIL — cannot resolve `@/components/student/DossierView`.

- [ ] **Step 3: Write DossierView**

Create `components/student/DossierView.tsx`:

```tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { dossierSubline, type Dossier, type DossierItem } from '@/lib/student/dossier'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function actionLabel(status: DossierItem['status']): string {
  if (status === 'rejected') return 'Corriger'
  if (status === 'draft') return 'Continuer'
  return 'Commencer'
}

function TodoCard({ item, showTag }: { item: DossierItem; showTag: boolean }) {
  const isFix = item.status === 'rejected'
  return (
    <div className={`flex items-center gap-4 rounded-[14px] border bg-card px-5 py-4 ${isFix ? 'border-[#F0C9C3]' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-display text-[15px] font-semibold text-navy">{item.name}</span>
          {isFix && <Badge variant="danger">À corriger</Badge>}
          {showTag && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-placeholder">{item.exchangeName}</span>
          )}
        </div>
        {isFix && item.reviewNote ? (
          <p className="mt-1 text-[12.5px] text-danger-text">{item.reviewNote}</p>
        ) : item.deadline ? (
          <p className={`mt-1 text-[12.5px] ${item.overdue ? 'font-medium text-danger-text' : 'text-muted-foreground'}`}>
            {item.overdue ? 'En retard — ' : 'Échéance '}{formatDate(item.deadline)}
          </p>
        ) : null}
      </div>
      <Link
        href={`/my-forms/${item.id}`}
        className={`flex-none rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-white ${
          isFix ? 'bg-danger-text hover:opacity-90' : 'bg-brand hover:bg-brand-hover'
        }`}
      >
        {actionLabel(item.status)}
      </Link>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  )
}

export function DossierView({ dossier, firstName }: { dossier: Dossier; firstName: string }) {
  const { total, todo, review, done, todoCount, reviewCount, doneCount, sentCount, pct, nextDeadline, multiExchange } = dossier
  const allApproved = total > 0 && doneCount === total
  const allSent = total > 0 && todoCount === 0 && reviewCount > 0

  return (
    <div>
      <div className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mon dossier</div>
      <h1 className="mb-1.5 font-display text-[30px] font-bold leading-[1.1] tracking-tight text-navy">Bonjour {firstName},</h1>
      <p className="mb-6 text-[14.5px] leading-relaxed text-muted-foreground">{dossierSubline(dossier)}</p>

      {total > 0 && (
        <>
          {allApproved && (
            <div className="mb-4 flex items-center gap-4 rounded-[16px] border border-tint-border bg-tint px-6 py-5">
              <div className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-[14px] bg-brand text-2xl font-bold text-white">✓</div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] font-semibold text-navy">Ton dossier est complet</div>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground">Toutes tes pièces sont validées — il ne te reste plus qu’à préparer ta valise. Bon voyage !</p>
              </div>
            </div>
          )}
          {allSent && (
            <div className="mb-4 flex items-center gap-4 rounded-[16px] border border-tint-border bg-tint px-6 py-5">
              <div className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-[14px] bg-brand text-2xl font-bold text-white">…</div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] font-semibold text-navy">Tout est envoyé</div>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground">On vérifie tes dernières pièces — rien d’autre à faire pour l’instant. Tu recevras un message dès que c’est terminé.</p>
              </div>
            </div>
          )}

          <div className="mb-7">
            <div className="flex items-center gap-3.5">
              <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-subtle">
                <div className="h-full rounded-pill bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="font-mono text-[12px] text-muted-foreground">{sentCount} / {total} envoyés</span>
            </div>
            {nextDeadline && (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Prochaine échéance · {formatDate(nextDeadline)}</p>
            )}
          </div>

          {todoCount > 0 && (
            <section className="mb-7">
              <SectionHeader>À faire · {todoCount}</SectionHeader>
              <div className="flex flex-col gap-2.5">
                {todo.map(item => <TodoCard key={item.id} item={item} showTag={multiExchange} />)}
              </div>
            </section>
          )}

          {reviewCount > 0 && (
            <section className="mb-7">
              <SectionHeader>En vérification · {reviewCount}</SectionHeader>
              <div className="flex flex-col gap-2.5">
                {review.map(item => (
                  <div key={item.id} className="flex items-center gap-3.5 rounded-[14px] border bg-card px-5 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="font-display text-[14px] font-semibold text-navy">{item.name}</span>
                      <span className="ml-2 text-[12.5px] text-muted-foreground">On vérifie — on te prévient dès que c’est validé.</span>
                    </span>
                    <Badge variant="info">En vérification</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}

          {doneCount > 0 && (
            <section className="mb-7">
              <SectionHeader>Validés · {doneCount}</SectionHeader>
              <div className="overflow-hidden rounded-[14px] border bg-card">
                {done.map(item => (
                  <div key={item.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
                    <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-success text-[12px] font-bold text-success-text">✓</span>
                    <span className="flex-1 text-[13.5px] text-foreground">{item.name}</span>
                    <span className="font-mono text-[11px] text-placeholder">validé</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/student/__tests__/DossierView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the home page**

Replace `app/(student)/my-forms/page.tsx` entirely:

```tsx
import { getMyAssignments } from '@/actions/my-forms'
import { getStudentContext } from '@/actions/student-context'
import { buildDossier, type RawAssignment } from '@/lib/student/dossier'
import { DossierView } from '@/components/student/DossierView'

export default async function MyFormsPage() {
  const [assignments, ctx] = await Promise.all([getMyAssignments(), getStudentContext()])
  const dossier = buildDossier(assignments as RawAssignment[])
  return <DossierView dossier={dossier} firstName={ctx.firstName} />
}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/student/DossierView.tsx components/student/__tests__/DossierView.test.tsx app/(student)/my-forms/page.tsx
git commit -m "feat(student): redesigned « Mon dossier » home with status sections + done/empty states (phase 5)"
```

---

## Task 4: Fill/upload page — restyle + French forms

**Files:**
- Modify: `app/(student)/my-forms/[assignmentId]/page.tsx`
- Modify: `components/DataEntryForm.tsx`
- Modify: `components/DocumentUploadForm.tsx`
- Create: `components/__tests__/DataEntryForm.test.tsx`
- Create: `components/__tests__/DocumentUploadForm.test.tsx`

**Interfaces:**
- Consumes: `getAssignmentDetails`, `saveFormAnswers`, `recordDocumentUpload`, `submitDocumentAssignment` (unchanged); `SUBMISSION_STATUS_BADGE` (FR, Task 1); `validateUploadFile`, `ALLOWED_UPLOAD_ACCEPT`; `Badge`, `Button`, `Input`, `Label`, `Textarea`, `Select`.
- Produces: same component prop signatures — `DataEntryForm({ assignmentId, fields, initialAnswers, readOnly })`, `DocumentUploadForm({ assignmentId, slots, initialUploads, readOnly })`. Only copy/markup change.

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/DataEntryForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/submissions', () => ({ saveFormAnswers: vi.fn().mockResolvedValue(undefined) }))
import { DataEntryForm } from '@/components/DataEntryForm'
import type { FormField } from '@/types/db'

const fields: FormField[] = [
  { id: 'f1', template_id: 't', label: 'Groupe sanguin', field_type: 'text', required: true, options: null, position: 0 } as unknown as FormField,
]

describe('DataEntryForm (French)', () => {
  it('renders French submit + draft labels and the confidentiality note', () => {
    render(<DataEntryForm assignmentId="a1" fields={fields} initialAnswers={{}} readOnly={false} />)
    expect(screen.getByText('Envoyer')).toBeTruthy()
    expect(screen.getByText('Enregistrer le brouillon')).toBeTruthy()
    expect(screen.getByText(/Tes réponses restent confidentielles/)).toBeTruthy()
  })
  it('hides the action buttons when read-only', () => {
    render(<DataEntryForm assignmentId="a1" fields={fields} initialAnswers={{}} readOnly={true} />)
    expect(screen.queryByText('Envoyer')).toBeNull()
  })
})
```

Create `components/__tests__/DocumentUploadForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ upload: vi.fn() }) } }) }))
vi.mock('@/actions/submissions', () => ({ recordDocumentUpload: vi.fn(), submitDocumentAssignment: vi.fn() }))
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import type { DocumentSlot } from '@/types/db'

const slots: DocumentSlot[] = [
  { id: 's1', template_id: 't', label: 'Passeport', description: null, required: true, position: 0 } as unknown as DocumentSlot,
]

describe('DocumentUploadForm (French)', () => {
  it('renders the French upload zone, verification note, and disabled submit + hint', () => {
    render(<DocumentUploadForm assignmentId="a1" slots={slots} initialUploads={[]} readOnly={false} />)
    expect(screen.getByText('Clique pour choisir un fichier')).toBeTruthy()
    expect(screen.getByText(/vérifiée par l’équipe du programme/)).toBeTruthy()
    expect(screen.getByText('Ajoute toutes les pièces requises pour envoyer.')).toBeTruthy()
    expect((screen.getByText('Envoyer').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test components/__tests__/DataEntryForm.test.tsx components/__tests__/DocumentUploadForm.test.tsx`
Expected: FAIL — French strings not present (components still English).

- [ ] **Step 3: Translate + restyle DataEntryForm**

Replace `components/DataEntryForm.tsx` entirely:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveFormAnswers } from '@/actions/submissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FormField } from '@/types/db'

interface Props {
  assignmentId: string
  fields: FormField[]
  initialAnswers: Record<string, string>
  readOnly: boolean
}

export function DataEntryForm({ assignmentId, fields, initialAnswers, readOnly }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [loading, setLoading] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function setValue(fieldId: string, value: string) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  async function handleSave(submit: boolean) {
    setLoading(submit ? 'submit' : 'draft')
    setError(null)
    try {
      await saveFormAnswers(assignmentId, answers, submit)
      if (submit) router.push('/my-forms')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement')
    } finally {
      setLoading(null)
    }
  }

  const inputClass = 'h-11 focus-visible:border-brand'

  return (
    <div className="space-y-6">
      {!readOnly && (
        <p className="rounded-[10px] bg-hoverrow px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Tes réponses restent confidentielles — elles ne sont partagées qu’avec ta famille d’accueil si nécessaire.
        </p>
      )}

      {fields.map(field => (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={field.id} className="text-[12px] font-semibold text-foreground">
            {field.label}
            {field.required && <span className="ml-1 text-danger-text">*</span>}
          </Label>
          {field.field_type === 'textarea' && (
            <Textarea
              id={field.id}
              value={answers[field.id] ?? ''}
              onChange={e => setValue(field.id, e.target.value)}
              disabled={readOnly}
              required={field.required}
              className="focus-visible:border-brand"
            />
          )}
          {(field.field_type === 'text' || field.field_type === 'date') && (
            <Input
              id={field.id}
              type={field.field_type === 'date' ? 'date' : 'text'}
              value={answers[field.id] ?? ''}
              onChange={e => setValue(field.id, e.target.value)}
              disabled={readOnly}
              required={field.required}
              className={inputClass}
            />
          )}
          {field.field_type === 'checkbox' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={answers[field.id] === 'true'}
                onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')}
                disabled={readOnly}
                className="h-4 w-4 rounded border-border"
              />
              {field.label}
            </label>
          )}
          {field.field_type === 'select' && field.options && (
            <Select
              value={answers[field.id] ?? ''}
              onValueChange={v => setValue(field.id, v)}
              disabled={readOnly}
            >
              <SelectTrigger id={field.id}>
                <SelectValue placeholder="Choisis une option" />
              </SelectTrigger>
              <SelectContent>
                {field.options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-danger-text">{error}</p>}

      {!readOnly && (
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={loading !== null}>
            {loading === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={loading !== null} className="bg-brand hover:bg-brand-hover">
            {loading === 'submit' ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Translate + restyle DocumentUploadForm**

Replace `components/DocumentUploadForm.tsx` entirely (logic identical — only copy + dashed upload zone markup change):

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { recordDocumentUpload, submitDocumentAssignment } from '@/actions/submissions'
import { validateUploadFile, ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { DocumentSlot } from '@/types/db'

interface Upload { slot_id: string; file_name: string; storage_path: string }

interface Props {
  assignmentId: string
  slots: DocumentSlot[]
  initialUploads: Upload[]
  readOnly: boolean
}

export function DocumentUploadForm({ assignmentId, slots, initialUploads, readOnly }: Props) {
  const [uploads, setUploads] = useState<Record<string, Upload>>(
    Object.fromEntries(initialUploads.map(u => [u.slot_id, u]))
  )
  const [uploading, setUploading] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleFileChange(slot: DocumentSlot, file: File) {
    const validationError = validateUploadFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setUploading(slot.id)
    setError(null)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_')
      const path = `${assignmentId}/${slot.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      await recordDocumentUpload(assignmentId, slot.id, path, file.name)
      setUploads(prev => ({ ...prev, [slot.id]: { slot_id: slot.id, file_name: file.name, storage_path: path } }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement')
    } finally {
      setUploading(null)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await submitDocumentAssignment(assignmentId)
      router.push('/my-forms')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi')
      setSubmitting(false)
    }
  }

  const requiredSlots = slots.filter(s => s.required)
  const allRequiredUploaded = requiredSlots.every(s => uploads[s.id])

  return (
    <div className="space-y-4">
      {slots.map(slot => {
        const upload = uploads[slot.id]
        const isUploading = uploading === slot.id

        return (
          <div key={slot.id} className="rounded-[14px] border bg-card p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[14px] font-semibold text-navy">
                  {slot.label}
                  {slot.required && <span className="ml-1 text-danger-text">*</span>}
                </p>
                {slot.description && (
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{slot.description}</p>
                )}
              </div>
              {upload && <Badge variant="info">Envoyé</Badge>}
            </div>

            {upload && (
              <p className="mb-2 flex items-center gap-2 rounded-[9px] bg-hoverrow px-3 py-2 text-[12.5px] text-foreground">
                <span aria-hidden>📄</span>{upload.file_name}
              </p>
            )}

            {!readOnly && (
              <label className="block cursor-pointer">
                <input
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_UPLOAD_ACCEPT}
                  disabled={isUploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileChange(slot, file)
                  }}
                />
                {upload ? (
                  <span className="inline-flex items-center gap-1.5 rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow">
                    {isUploading ? 'Téléversement…' : 'Remplacer le fichier'}
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-frame-dashed bg-hoverrow px-5 py-8 text-center hover:border-brand">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-tint text-xl font-bold text-tint-text" aria-hidden>↑</span>
                    <span className="text-[14px] font-semibold text-navy">{isUploading ? 'Téléversement…' : 'Clique pour choisir un fichier'}</span>
                    <span className="font-mono text-[11.5px] text-placeholder">PDF · JPG · PNG — 10 Mo max</span>
                  </span>
                )}
              </label>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <p className="text-[11.5px] leading-relaxed text-placeholder">
          Ta pièce sera vérifiée par l’équipe du programme avant validation.
        </p>
      )}

      {error && <p className="text-sm text-danger-text">{error}</p>}

      {!readOnly && (
        <Button
          onClick={handleSubmit}
          disabled={!allRequiredUploaded || submitting}
          className="mt-2 bg-brand hover:bg-brand-hover"
        >
          {submitting ? 'Envoi…' : 'Envoyer'}
        </Button>
      )}
      {!readOnly && !allRequiredUploaded && (
        <p className="text-[12.5px] text-muted-foreground">Ajoute toutes les pièces requises pour envoyer.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Restyle + translate the fill page**

Replace `app/(student)/my-forms/[assignmentId]/page.tsx` entirely (data-fetching logic unchanged):

```tsx
import { getAssignmentDetails } from '@/actions/submissions'
import { DataEntryForm } from '@/components/DataEntryForm'
import { DocumentUploadForm } from '@/components/DocumentUploadForm'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { SUBMISSION_STATUS_BADGE } from '@/lib/submission-status'
import { createClient } from '@/lib/supabase/server'

export default async function AssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const { template, submission } = await getAssignmentDetails(assignmentId)

  // PDF-to-sign templates: the family downloads the organizer's PDF, prints,
  // signs, and uploads it back into the slot below.
  let templatePdfUrl: string | null = null
  if (template.kind === 'pdf' && template.template_file_path) {
    const supabase = await createClient()
    const { data } = await supabase.storage
      .from('form-templates')
      .createSignedUrl(template.template_file_path, 3600)
    templatePdfUrl = data?.signedUrl ?? null
  }

  const status = submission?.status ?? null
  const readOnly = status === 'approved' || status === 'submitted'
  const cfg = status ? SUBMISSION_STATUS_BADGE[status as keyof typeof SUBMISSION_STATUS_BADGE] : null

  const initialAnswers: Record<string, string> = Object.fromEntries(
    (submission?.field_answers ?? []).map((a: { field_id: string; value: string }) => [a.field_id, a.value])
  )
  const initialUploads = submission?.document_uploads ?? []

  return (
    <div>
      <Link href="/my-forms" className="mb-4 inline-flex text-[13px] font-medium text-muted-foreground hover:text-foreground">
        ← Mon dossier
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">{template.name}</h1>
          {template.description && (
            <p className="mt-1 text-[14px] text-muted-foreground">{template.description}</p>
          )}
          {template.deadline && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              Échéance {new Date(template.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        {cfg && <Badge variant={cfg.variant}>{cfg.label}</Badge>}
      </div>

      {status === 'rejected' && submission?.review_note && (
        <div className="mb-6 rounded-[12px] border border-[#F0C9C3] bg-danger px-4 py-3">
          <p className="mb-1 text-sm font-semibold text-danger-text">À corriger</p>
          <p className="text-sm text-danger-text">{submission.review_note}</p>
        </div>
      )}

      {status === 'submitted' && (
        <p className="mb-6 rounded-[12px] border border-tint-border bg-tint px-4 py-3 text-sm text-tint-text">
          Ta réponse est en cours de vérification. Tu seras prévenu·e dès qu’elle est validée.
        </p>
      )}

      {template.type === 'data_entry' && (
        <DataEntryForm
          assignmentId={assignmentId}
          fields={template.form_fields ?? []}
          initialAnswers={initialAnswers}
          readOnly={readOnly}
        />
      )}

      {templatePdfUrl && (
        <p className="mb-6">
          <a
            href={templatePdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[9px] border border-frame-dashed bg-card px-4 py-2.5 text-[13px] font-semibold text-navy hover:bg-hoverrow"
          >
            ⬇ Télécharger le document à signer
          </a>
        </p>
      )}

      {template.type === 'document_upload' && (
        <DocumentUploadForm
          assignmentId={assignmentId}
          slots={template.document_slots ?? []}
          initialUploads={initialUploads}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test components/__tests__/DataEntryForm.test.tsx components/__tests__/DocumentUploadForm.test.tsx`
Expected: PASS.

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (If `field_answers` typing complains, the `{ field_id; value }` param annotation replaces the prior `any` — confirm `getAssignmentDetails`'s return shape still assigns cleanly; if it errors, keep `(a: any)` as in the original.)

- [ ] **Step 8: Commit**

```bash
git add app/(student)/my-forms/[assignmentId]/page.tsx components/DataEntryForm.tsx components/DocumentUploadForm.tsx components/__tests__/DataEntryForm.test.tsx components/__tests__/DocumentUploadForm.test.tsx
git commit -m "feat(student): restyle + French fill/upload page and forms (phase 5)"
```

---

## Task 5: Full gate + apostrophe guard + resume ledger + merge prep

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Modify: `/home/bjorn/.claude/projects/-home-bjorn-eazyexchange/memory/project_redesign_phases.md` (+ `MEMORY.md` pointer if needed)

- [ ] **Step 1: Apostrophe guard — no ASCII `'` in new FR strings**

Run:

```bash
grep -rnP "\b(l|d|n|t|qu|j|c|s|m)'[a-zA-Zàâäéèêëïîôöùûüç]" \
  app/\(student\) components/student components/DataEntryForm.tsx components/DocumentUploadForm.tsx lib/student lib/submission-status.ts \
  | grep -v "__tests__"
```

Expected: **no output**. Any hit is an ASCII apostrophe in an FR string — replace with `’`. (Test files legitimately use ASCII `'` in JS and are excluded.)

- [ ] **Step 2: Full gate**

Run each, all must be green:

```bash
pnpm lint
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: lint clean (pre-existing apple-icon `<img>` warning only); all tests pass (Phase-5 suites + prior suites); tsc clean; build succeeds.

- [ ] **Step 3: Update the resume ledger**

Append a Phase 5 block to `.superpowers/sdd/progress.md` following the existing format:

```markdown
---

Plan: docs/superpowers/plans/2026-07-04-redesign-phase5-espace-eleve.md
Branch: redesign/phase-5-espace-eleve
Started: 2026-07-04

## Tasks
- [x] Task 1: dossier derivation lib + FR status labels
- [x] Task 2: getStudentContext + top bar + layout
- [x] Task 3: DossierView home + page wiring
- [x] Task 4: fill/upload page + French forms
- [x] Task 5: gate + apostrophe guard + merge prep
```

(Mark tasks `[x]` as each completes during execution.)

- [ ] **Step 4: Update the redesign-phases memory**

Edit `project_redesign_phases.md`: move Phase 5 from "next" to done-pending-merge, note the additive/no-migration deploy and that the live drive is user-gated. Update the `MEMORY.md` one-liner hook to point "next = Phase 6".

- [ ] **Step 5: Commit docs + push branch (user-gated merge)**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(phase5): mark student space redesign complete in ledger"
```

Then hand off: this is additive (no `supabase db push`). Merging `redesign/phase-5-espace-eleve` → `main` = Vercel prod deploy — **user-gated**. Before merge, offer the **live drive** (real student magic-link session against prod):
1. Land on the redesigned « Mon dossier »; confirm greeting/prénom, exchange label, three status sections, progress + « Prochaine échéance ».
2. Complete a data-entry form → status moves À faire → En vérification.
3. Upload a document → same transition.
4. Open the rejection-email deep-link `/my-forms/[assignmentId]` cold → the restyled page loads.

Mutating steps need Bjorn's go-ahead (single Supabase project = prod).

---

## Self-Review

**Spec coverage:**
- Screen A (top bar / shell) → Task 2 (`StudentTopBar` + layout 920px column + `getStudentContext`). ✅
- Screen B (dossier home: kicker, greeting+subline, progress+next deadline, three status sections, cards with per-status actions, multi-exchange tag) → Task 1 (derivations) + Task 3 (`DossierView` + page). ✅
- Screen C (done/empty states: all-sent, all-approved complete banner, never-assigned) → Task 3 `DossierView` (`allApproved`, `allSent`, `total===0` branches). ✅
- Screen D (fill page + `DataEntryForm` + `DocumentUploadForm`, French, rejected/submitted notes, PDF-to-sign, read-only) → Task 4. ✅
- Approved decisions: (1) separate `[assignmentId]` route redesigned in place — Task 4; (2) group by status, exchange tag when multi — Tasks 1/3; (3) progress + next deadline computed inline — Task 1 `buildDossier`; (4) forms translated in place — Task 4. ✅
- Data & state: no schema/action change; `getStudentContext` read-only; pure unit-tested derivations — Tasks 1/2. ✅ (`getMyAssignments` needs no select change — noted in File Structure.)
- Testing: unit (bucketing, counts, next-deadline, overdue, prénom/initials, apostrophe guard) — Task 1; component (three sections, all-approved banner, never-assigned, form variants) — Tasks 2/3/4; gates + live drive — Task 5. ✅
- Risks: apostrophe grep guard (Task 5 Step 1); PII self-only reads; deep-link cold-loadable (Task 4 route independent of home state); no `send-reminders` change; additive deploy. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full file contents; no "similar to Task N".

**Type consistency:** `RawAssignment`/`Dossier`/`DossierItem`/`DossierSection`, `bucketStatus`, `buildDossier`, `deriveName`, `dossierSubline`, `getStudentContext`/`StudentContext`, `StudentTopBar({ initials, exchangeLabel })`, `DossierView({ dossier, firstName })`, `SUBMISSION_STATUS_BADGE` — names/signatures used identically across tasks. Form component prop signatures unchanged from the existing files.
