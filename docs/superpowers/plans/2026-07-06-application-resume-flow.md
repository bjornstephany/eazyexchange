# Frictionless Same-Device Application Resume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a public applicant return to a half-filled application on the same device with zero friction — no "Finish later" click, no email round-trip — while keeping an auto-emailed link as a cross-device safety net.

**Architecture:** On start, `startApplication` fire-and-forget emails the resume link *and* the client stores the `resume_token` in `localStorage` (key `eazyapply:<slug>`). Revisiting `/apply/[slug]` reads that key and, via a new read-only server action `peekApplicationDraft`, shows a "welcome back" screen (Continue + a quiet "Not you?" reset) instead of the blank start form. The "Finish later" button is removed; the form gains a permanent reassurance line and a subtle "Resend link", and clears the stored token on submit.

**Tech Stack:** Next.js App Router (server components + `'use server'` actions), React client components, Supabase (service-role admin client for public token paths), Vitest + Testing Library (jsdom), Tailwind.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **No database migration** — zero schema change in this feature.
- **Never log student/parent PII** (emails, names, answers) in logs or errors.
- Emails after a committed state are **fire-and-forget**: `void sendX(...).catch(() => {})` — a mail failure must never block the flow.
- localStorage key format is exactly **`eazyapply:<slug>`** (centralized in `lib/apply-storage.ts` — never hand-build it elsewhere).
- French copy uses **tutoiement** and the **typographic apostrophe `’` (U+2019)**, written as plain JS string values (single-quoted) so the apostrophe needs no escaping.
- Local `pnpm build` fails on placeholder `.env.local` — the build is the **Vercel** gate. Local verification is `pnpm lint`, `pnpm test`, `npx tsc --noEmit`.
- `peekApplicationDraft` returns **only** `{ live, firstName, language }` — never the full draft PII.

---

### Task 1: localStorage helper (`lib/apply-storage.ts`)

A tiny, SSR-safe module that owns the `eazyapply:<slug>` key. All three client components go through it, so the prefix lives in exactly one place.

**Files:**
- Create: `lib/apply-storage.ts`
- Test: `lib/__tests__/apply-storage.test.ts`

**Interfaces:**
- Produces:
  - `resumeStorageKey(slug: string): string`
  - `storeResumeToken(slug: string, token: string): void`
  - `readResumeToken(slug: string): string | null`
  - `clearResumeToken(slug: string): void`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/apply-storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resumeStorageKey, storeResumeToken, readResumeToken, clearResumeToken } from '@/lib/apply-storage'

describe('apply-storage', () => {
  beforeEach(() => localStorage.clear())

  it('builds the per-slug key', () => {
    expect(resumeStorageKey('france-canada')).toBe('eazyapply:france-canada')
  })

  it('stores, reads back, and clears a token', () => {
    storeResumeToken('france-canada', 'tok-123')
    expect(readResumeToken('france-canada')).toBe('tok-123')
    clearResumeToken('france-canada')
    expect(readResumeToken('france-canada')).toBeNull()
  })

  it('returns null for a slug that was never stored', () => {
    expect(readResumeToken('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/apply-storage.test.ts`
Expected: FAIL — cannot resolve `@/lib/apply-storage`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/apply-storage.ts
// Owns the single localStorage key that lets an applicant resume on the same
// device without the email round-trip. SSR-safe: no-ops when window is absent.

export function resumeStorageKey(slug: string): string {
  return `eazyapply:${slug}`
}

export function storeResumeToken(slug: string, token: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(resumeStorageKey(slug), token) } catch { /* storage disabled */ }
}

export function readResumeToken(slug: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(resumeStorageKey(slug)) } catch { return null }
}

export function clearResumeToken(slug: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(resumeStorageKey(slug)) } catch { /* storage disabled */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/apply-storage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/apply-storage.ts lib/__tests__/apply-storage.test.ts
git commit -m "feat: add apply-storage helper for same-device resume token"
```

---

### Task 2: `peekApplicationDraft` action + `apply_slug` on `getApplicationDraft`

Adds a read-only, PII-minimal "is this stored token still a live draft?" action for the welcome-back screen, and threads the exchange slug through `getApplicationDraft` so the form can clear its localStorage key on submit.

**Files:**
- Modify: `actions/applications.ts` (add `peekApplicationDraft`; extend `getApplicationDraft` select + return)
- Test: `actions/__tests__/applications.test.ts` (add import + tests)

**Interfaces:**
- Consumes: existing `tokenExpired(expiresAt)`, `createAdminClient()`.
- Produces:
  - `peekApplicationDraft(token: string): Promise<{ live: boolean; firstName: string | null; language: 'en' | 'fr' }>`
  - `getApplicationDraft` live-branch return now also includes `slug: string`.

- [ ] **Step 1: Write the failing tests**

Add to the existing import line at the top of `actions/__tests__/applications.test.ts` (which today imports from `'../applications'`): add `peekApplicationDraft`. Then append this describe block to the file:

```typescript
describe('peekApplicationDraft', () => {
  it('reports a live draft with its first name and language (no other PII)', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'Léa', last_name: 'Martin', email: 'a@b.co' }, language: 'fr', resume_token_expires_at: null }
    const res = await peekApplicationDraft('tok')
    expect(res).toEqual({ live: true, firstName: 'Léa', language: 'fr' })
  })
  it('reports not-live for a submitted application and leaks no name', async () => {
    scenario.application = { status: 'submitted', data: { first_name: 'Léa' }, language: 'fr', resume_token_expires_at: null }
    const res = await peekApplicationDraft('tok')
    expect(res).toEqual({ live: false, firstName: null, language: 'fr' })
  })
  it('reports not-live for an expired resume token', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'Léa' }, language: 'en', resume_token_expires_at: PAST }
    const res = await peekApplicationDraft('tok')
    expect(res.live).toBe(false)
    expect(res.firstName).toBeNull()
  })
  it('reports not-live for a missing token', async () => {
    scenario.application = null
    const res = await peekApplicationDraft('tok')
    expect(res).toEqual({ live: false, firstName: null, language: 'en' })
  })
})

describe('getApplicationDraft slug', () => {
  it('returns the exchange apply_slug for a live draft', async () => {
    scenario.application = { status: 'draft', data: { first_name: 'A' }, language: 'en', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: null, exchanges: { name: 'France-Canada', apply_slug: 'france-canada' } }
    const res = await getApplicationDraft('tok') as any
    expect(res.slug).toBe('france-canada')
  })
})
```

> Note: the shared `builder` mock returns `rowFor('applications')` for `.maybeSingle()`, so setting `scenario.application.exchanges` makes the embedded `exchanges(...)` join resolve.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run actions/__tests__/applications.test.ts -t "peekApplicationDraft"`
Expected: FAIL — `peekApplicationDraft` is not exported.

- [ ] **Step 3: Implement the action and extend getApplicationDraft**

In `actions/applications.ts`, change the `getApplicationDraft` select to include `apply_slug`:

```typescript
    .select('status, data, language, photo_path, resume_token_expires_at, exchanges(name, apply_slug)')
```

and add `slug` to its live-branch return (the final `return { … }`):

```typescript
  return {
    expired: false as const, submitted: false as const,
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, exchangeName,
    slug: (app as any).exchanges?.apply_slug ?? '',
  }
```

Then add the new action right after `getApplicationDraft`:

```typescript
// Read-only "is this stored token still a live draft?" for the same-device
// welcome-back screen. Ships only a first name + language to the browser — never
// the rest of the draft PII. No rate limit: the caller already holds the token
// (it was in their own localStorage); nothing is emailed or enumerable.
export async function peekApplicationDraft(
  token: string,
): Promise<{ live: boolean; firstName: string | null; language: 'en' | 'fr' }> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, language, resume_token_expires_at')
    .eq('resume_token', token)
    .maybeSingle()
  const language: 'en' | 'fr' = (app?.language === 'fr' ? 'fr' : 'en')
  if (!app || tokenExpired(app.resume_token_expires_at) || app.status !== 'draft') {
    return { live: false, firstName: null, language }
  }
  const first = (app.data as Record<string, unknown> | null)?.first_name
  return { live: true, firstName: typeof first === 'string' ? first : null, language }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run actions/__tests__/applications.test.ts`
Expected: PASS (existing tests + 5 new).

- [ ] **Step 5: Commit**

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts
git commit -m "feat: add peekApplicationDraft + expose apply_slug on getApplicationDraft"
```

---

### Task 3: Auto-send the resume email on start (fire-and-forget safety net)

Flip `startApplication` from "never emails" to "always emails the resume link, fire-and-forget". This is the cross-device backup; the existing per-email/per-IP rate limits already gate it, so no new limits.

**Files:**
- Modify: `actions/applications.ts` (`startApplication`)
- Test: `actions/__tests__/applications.test.ts` (invert the existing "does not email" test)

**Interfaces:**
- Consumes: existing `sendApplicationResumeEmail({ to, exchangeName, resumeUrl })`, `APP_URL`.
- Produces: `startApplication` return type unchanged (`{ token: string }`).

- [ ] **Step 1: Update the test to assert the new behavior**

In `actions/__tests__/applications.test.ts`, inside `describe('startApplication')`, **replace** the existing test:

```typescript
  it('does not email a resume link on start (only "Finish later" does that)', async () => {
    await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
```

with:

```typescript
  it('fire-and-forget emails the resume link on start (cross-device safety net)', async () => {
    await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(sendApplicationResumeEmail).toHaveBeenCalledTimes(1)
    const arg = (sendApplicationResumeEmail as any).mock.calls[0][0]
    expect(arg.to).toBe('a@b.co')
    expect(arg.resumeUrl).toContain('/apply/resume/')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run actions/__tests__/applications.test.ts -t "cross-device safety net"`
Expected: FAIL — `sendApplicationResumeEmail` called 0 times.

- [ ] **Step 3: Implement the fire-and-forget send**

In `startApplication`, replace the comment block that currently reads:

```typescript
  // No resume email is sent here: the applicant continues straight to the form.
  // A resume link is only emailed if they explicitly click "Finish later"
  // (sendApplicationResumeLink), so we never mail a link they didn't ask for.
  return { token }
```

with:

```typescript
  // Silent cross-device safety net: email the resume link the moment they start,
  // fire-and-forget so a mail hiccup never blocks entry into the form. The
  // same-device return path is localStorage (client-side); this covers cleared
  // storage / a different device. Already gated by the rate limits above.
  void sendApplicationResumeEmail({
    to: email,
    exchangeName: exchange.name,
    resumeUrl: `${APP_URL}/apply/resume/${token}`,
  }).catch(() => {})

  return { token }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run actions/__tests__/applications.test.ts`
Expected: PASS (all, including the inverted test).

- [ ] **Step 5: Commit**

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts
git commit -m "feat: auto-email resume link on application start (fire-and-forget)"
```

---

### Task 4: `ApplicationStartForm` stores the token on start

After a successful start, persist the token to localStorage before navigating, so a same-device revisit can resume.

**Files:**
- Modify: `components/ApplicationStartForm.tsx`
- Test: `components/__tests__/ApplicationStartForm.test.tsx` (new)

**Interfaces:**
- Consumes: `storeResumeToken(slug, token)` (Task 1); existing `startApplication(slug, input) → { token }`.

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/ApplicationStartForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/actions/applications', () => ({
  startApplication: vi.fn(async () => ({ token: 'tok-xyz' })),
}))

import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { readResumeToken } from '@/lib/apply-storage'

describe('ApplicationStartForm', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

  it('stores the resume token for the slug and navigates on start', async () => {
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    await user.type(screen.getByLabelText(/first name/i), 'Léa')
    await user.type(screen.getByLabelText(/last name/i), 'Martin')
    await user.type(screen.getByLabelText(/e-mail/i), 'lea@example.com')
    await user.click(screen.getByRole('button', { name: /start my application/i }))

    expect(readResumeToken('france-canada')).toBe('tok-xyz')
    expect(push).toHaveBeenCalledWith('/apply/resume/tok-xyz')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run components/__tests__/ApplicationStartForm.test.tsx`
Expected: FAIL — `readResumeToken('france-canada')` is `null` (token not stored yet).

- [ ] **Step 3: Implement the store-on-start**

In `components/ApplicationStartForm.tsx`, add the import:

```typescript
import { storeResumeToken } from '@/lib/apply-storage'
```

and in `start()`, store the token before navigating:

```typescript
      const { token } = await startApplication(slug, { ...form, language: lang })
      storeResumeToken(slug, token)
      router.push(`/apply/resume/${token}`)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run components/__tests__/ApplicationStartForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationStartForm.tsx components/__tests__/ApplicationStartForm.test.tsx
git commit -m "feat: store resume token on start for same-device resume"
```

---

### Task 5: `ApplyEntry` welcome-back wrapper + wire into apply page

New client component that reads the stored token, peeks it, and shows a "welcome back" screen (Continue + a quiet "Not you?" reset) when it points to a live draft — otherwise the normal start form. The apply page renders it in place of `ApplicationStartForm`.

**Files:**
- Create: `components/ApplyEntry.tsx`
- Modify: `app/apply/[slug]/page.tsx` (swap `ApplicationStartForm` → `ApplyEntry`)
- Test: `components/__tests__/ApplyEntry.test.tsx` (new)

**Interfaces:**
- Consumes: `readResumeToken(slug)`, `clearResumeToken(slug)` (Task 1); `peekApplicationDraft(token)` (Task 2); renders `ApplicationStartForm` (Task 4).
- Produces: `ApplyEntry({ slug }: { slug: string })`.

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/ApplyEntry.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/actions/applications', () => ({
  peekApplicationDraft: vi.fn(),
  startApplication: vi.fn(async () => ({ token: 'tok-new' })),
}))

import { ApplyEntry } from '@/components/ApplyEntry'
import { peekApplicationDraft } from '@/actions/applications'
import { storeResumeToken, readResumeToken } from '@/lib/apply-storage'

describe('ApplyEntry', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

  it('shows the start form when no token is stored', async () => {
    render(<ApplyEntry slug="france-canada" />)
    expect(await screen.findByRole('button', { name: /start my application/i })).toBeInTheDocument()
    expect(peekApplicationDraft).not.toHaveBeenCalled()
  })

  it('shows a welcome-back screen for a stored live draft', async () => {
    storeResumeToken('france-canada', 'tok-live')
    ;(peekApplicationDraft as any).mockResolvedValue({ live: true, firstName: 'Léa', language: 'en' })
    render(<ApplyEntry slug="france-canada" />)

    expect(await screen.findByText(/welcome back, léa/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(push).toHaveBeenCalledWith('/apply/resume/tok-live')
  })

  it('"Not you?" clears the stored token and reveals the start form', async () => {
    storeResumeToken('france-canada', 'tok-live')
    ;(peekApplicationDraft as any).mockResolvedValue({ live: true, firstName: 'Léa', language: 'en' })
    render(<ApplyEntry slug="france-canada" />)

    await userEvent.click(await screen.findByRole('button', { name: /not you/i }))
    expect(readResumeToken('france-canada')).toBeNull()
    expect(await screen.findByRole('button', { name: /start my application/i })).toBeInTheDocument()
  })

  it('drops a stale (not-live) token and shows the start form', async () => {
    storeResumeToken('france-canada', 'tok-old')
    ;(peekApplicationDraft as any).mockResolvedValue({ live: false, firstName: null, language: 'en' })
    render(<ApplyEntry slug="france-canada" />)

    expect(await screen.findByRole('button', { name: /start my application/i })).toBeInTheDocument()
    await waitFor(() => expect(readResumeToken('france-canada')).toBeNull())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run components/__tests__/ApplyEntry.test.tsx`
Expected: FAIL — cannot resolve `@/components/ApplyEntry`.

- [ ] **Step 3: Implement `ApplyEntry`**

```tsx
// components/ApplyEntry.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { peekApplicationDraft } from '@/actions/applications'
import { readResumeToken, clearResumeToken } from '@/lib/apply-storage'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { Button } from '@/components/ui/button'

type View =
  | { kind: 'loading' }
  | { kind: 'start' }
  | { kind: 'welcome'; token: string; firstName: string | null; language: 'en' | 'fr' }

export function ApplyEntry({ slug }: { slug: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const router = useRouter()

  useEffect(() => {
    const token = readResumeToken(slug)
    if (!token) { setView({ kind: 'start' }); return }
    let cancelled = false
    peekApplicationDraft(token)
      .then(res => {
        if (cancelled) return
        if (res.live) {
          setView({ kind: 'welcome', token, firstName: res.firstName, language: res.language })
        } else {
          clearResumeToken(slug)
          setView({ kind: 'start' })
        }
      })
      .catch(() => { if (!cancelled) setView({ kind: 'start' }) })
    return () => { cancelled = true }
  }, [slug])

  if (view.kind === 'loading') {
    return <p className="text-[15px] text-[#8A97B2]">…</p>
  }
  if (view.kind === 'start') {
    return <ApplicationStartForm slug={slug} />
  }

  const fr = view.language === 'fr'
  const name = view.firstName ? `, ${view.firstName}` : ''
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        <h2 className="m-0 mb-1.5 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          {fr ? `Bon retour${name} !` : `Welcome back${name}!`}
        </h2>
        <p className="m-0 mb-6 text-[15px] text-[#5B6B8C]">
          {fr ? 'Reprends ta candidature là où tu t’es arrêté·e.' : 'Pick up your application where you left off.'}
        </p>
        <Button
          onClick={() => router.push(`/apply/resume/${view.token}`)}
          className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]"
        >
          {fr ? 'Continuer ma candidature' : 'Continue my application'}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => { clearResumeToken(slug); setView({ kind: 'start' }) }}
        className="self-start text-[13px] font-medium text-[#8A97B2] underline underline-offset-2 hover:text-[#5B6B8C]"
      >
        {fr ? 'Ce n’est pas toi ? Commencer une nouvelle candidature' : 'Not you? Start a new application'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into the apply page**

In `app/apply/[slug]/page.tsx`, change the import:

```typescript
import { ApplyEntry } from '@/components/ApplyEntry'
```

(remove the `ApplicationStartForm` import) and in the final open-state `return`, replace `<ApplicationStartForm slug={slug} />` with:

```tsx
      <ApplyEntry slug={slug} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run components/__tests__/ApplyEntry.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add components/ApplyEntry.tsx app/apply/[slug]/page.tsx components/__tests__/ApplyEntry.test.tsx
git commit -m "feat: welcome-back screen for same-device application resume"
```

---

### Task 6: `ApplicationForm` — remove "Finish later", add reassurance + resend, clear on submit

Drop the "Finish later" button; add a permanent reassurance line and a subtle "Resend link" (reusing `sendApplicationResumeLink`); accept a `slug` prop and clear the stored token on successful submit. Thread `slug` in from the resume page.

**Files:**
- Modify: `components/ApplicationForm.tsx`
- Modify: `app/apply/resume/[token]/page.tsx` (pass `slug`)
- Test: `components/__tests__/ApplicationForm.test.tsx`

**Interfaces:**
- Consumes: `clearResumeToken(slug)` (Task 1); `getApplicationDraft(...).slug` (Task 2); existing `sendApplicationResumeLink`, `saveApplicationDraft`, `submitApplication`.
- Produces: `ApplicationForm` prop type gains `slug: string`.

- [ ] **Step 1: Update the test file**

In `components/__tests__/ApplicationForm.test.tsx`, add a mock that lets submit proceed without filling every required field, add the `apply-storage` import, and add two tests. Replace the whole file with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/applications', () => ({
  saveApplicationDraft: vi.fn(async () => {}),
  submitApplication: vi.fn(async () => {}),
  uploadApplicationPhoto: vi.fn(async () => {}),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))
// Let onSubmit proceed in the clear-on-submit test without populating all 50 fields.
vi.mock('@/lib/application-form', async (orig) => {
  const actual = await (orig() as Promise<any>)
  return { ...actual, missingRequiredApplication: () => [] }
})

import { ApplicationForm } from '@/components/ApplicationForm'
import { sendApplicationResumeLink } from '@/actions/applications'
import { storeResumeToken, readResumeToken } from '@/lib/apply-storage'

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('ApplicationForm', () => {
  it('renders header + submit, has no "Finish later" button, and shows the reassurance line', async () => {
    const user = userEvent.setup()
    render(<ApplicationForm token="t" slug="s" exchangeName="Échange Espagne" initialData={{}} initialLanguage="fr" />)
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminer plus tard/i })).not.toBeInTheDocument()
    expect(screen.getByText(/lien par e-mail/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
  })

  it('"Resend link" re-emails the resume link', async () => {
    const user = userEvent.setup()
    render(<ApplicationForm token="t" slug="s" exchangeName="X" initialData={{}} initialLanguage="fr" />)
    await user.click(screen.getByRole('button', { name: /renvoyer le lien/i }))
    expect(sendApplicationResumeLink).toHaveBeenCalledWith('t')
  })

  it('clears the stored resume token on successful submit', async () => {
    const user = userEvent.setup()
    storeResumeToken('s', 't')
    render(<ApplicationForm token="t" slug="s" exchangeName="X" initialData={{}} initialLanguage="fr" />)
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/ta candidature a été envoyée/i)).toBeInTheDocument()
    expect(readResumeToken('s')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run components/__tests__/ApplicationForm.test.tsx`
Expected: FAIL — `slug` is not a prop; "Finish later" still present; no reassurance text; "Renvoyer le lien" not found.

- [ ] **Step 3: Implement the ApplicationForm changes**

In `components/ApplicationForm.tsx`:

(a) Add the import:

```typescript
import { clearResumeToken } from '@/lib/apply-storage'
```

(b) Add `slug` to `Props`:

```typescript
interface Props {
  token: string
  slug: string
  exchangeName: string
  initialData: Record<string, string>
  initialLanguage: 'en' | 'fr'
}
```

(c) Update the `T` copy table — in the `en` object replace `later: 'Finish later',` with `resend: 'Resend link', reassure: 'Progress saved automatically. We emailed you a link in case you switch devices.',` and in the `fr` object replace `later: 'Terminer plus tard',` with `resend: 'Renvoyer le lien', reassure: 'Progression enregistrée automatiquement. Nous t’avons envoyé un lien par e-mail au cas où tu changes d’appareil.',`

(d) Update the component signature to destructure `slug`:

```typescript
export function ApplicationForm({ token, slug, exchangeName, initialData, initialLanguage }: Props) {
```

(e) Rename `onFinishLater` to `onResend` (same body) and clear the token in `onSubmit` after success. Replace:

```typescript
  async function onFinishLater() {
    setReminding(true); setError(null)
    try {
      await saveApplicationDraft(token, data)
      await sendApplicationResumeLink(token)
      setRemindSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.unexpected)
    } finally { setReminding(false) }
  }
```

with:

```typescript
  async function onResend() {
    setReminding(true); setError(null)
    try {
      await saveApplicationDraft(token, data)
      await sendApplicationResumeLink(token)
      setRemindSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.unexpected)
    } finally { setReminding(false) }
  }
```

and in `onSubmit`, replace `try { await submitApplication(token, data); setDone(true) }` with:

```typescript
    try { await submitApplication(token, data); clearResumeToken(slug); setDone(true) }
```

(f) Add the reassurance line just above the closing `</div>` of the sections card region — insert it right after the block `{remindSent && <p ...>{t.remind}</p>}`:

```tsx
      <p className="mt-4 text-[13px] leading-relaxed text-[#8A97B2]">{t.reassure}</p>
```

(g) Replace the fixed bottom bar's left button. Change:

```tsx
          <Button variant="ghost" onClick={onFinishLater} disabled={reminding || submitting} className="font-semibold text-[#5B6B8C] hover:bg-transparent hover:text-[#10203F]">{reminding ? '…' : t.later}</Button>
```

to:

```tsx
          <button type="button" onClick={onResend} disabled={reminding || submitting} className="text-[13px] font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F] disabled:opacity-50">{reminding ? '…' : t.resend}</button>
```

- [ ] **Step 4: Thread `slug` in from the resume page**

In `app/apply/resume/[token]/page.tsx`, pass `slug` to the form (the draft now carries it from Task 2):

```tsx
    <ApplicationForm token={token} slug={draft.slug} exchangeName={draft.exchangeName} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run components/__tests__/ApplicationForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add components/ApplicationForm.tsx app/apply/resume/[token]/page.tsx components/__tests__/ApplicationForm.test.tsx
git commit -m "feat: replace Finish-later with auto-resume reassurance + resend, clear token on submit"
```

---

### Task 7: Full verification gate + manual live-drive notes

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
```

Expected: lint clean (only the pre-existing `apple-icon` `<img>` warning is acceptable); all tests pass; `tsc` exits 0. (Do **not** run `pnpm build` locally — it fails on placeholder `.env.local`; the build is the Vercel gate.)

- [ ] **Step 2: Fix any failures, re-run until green, then record the manual live-drive checklist**

The localStorage/welcome-back and auto-email paths are only fully observable in a browser. Note these for the user's manual live-drive (they require a real Supabase + Resend env, which local `.env.local` lacks):

1. Open `/apply/<slug>` → fill name/email → **Start** → lands on the form; a resume email arrives (safety net).
2. Type a few answers (autosave), **close the tab**, reopen `/apply/<slug>` → **"Welcome back, <name>"** with **Continue** (no re-entry of name/email).
3. **Continue** → returns to the form with answers intact.
4. **"Not you? Start a new application"** → clears and shows the blank start form.
5. Submit the application → success screen; reopening `/apply/<slug>` now shows the **blank start form** (token cleared).
6. On a second device / after clearing site data → the **emailed** link still resumes the draft.
7. "Resend link" on the form → a fresh resume email arrives.

- [ ] **Step 3: Commit any fixes** (skip if Step 1 was already green)

```bash
git add -A
git commit -m "test: verification gate for application resume flow"
```

---

## Self-Review

**Spec coverage:**
- Auto-email on start → Task 3. ✅
- localStorage token store on start → Task 4 (via Task 1 helper). ✅
- Welcome-back screen with Continue + "Not you?" (no Start-over button) → Task 5. ✅
- `peekApplicationDraft` returns only `{ live, firstName, language }` → Task 2. ✅
- Remove "Finish later"; reassurance line; "Resend link"; clear on submit → Task 6. ✅
- `getApplicationDraft` returns `apply_slug`, threaded to the form → Tasks 2 + 6. ✅
- Shared-computer PII gate (ask-first welcome, "Not you?" exit) → Task 5. ✅
- Edge cases (submitted/expired → not-live → clear + start form) → Task 2 logic + Task 5 tests. ✅
- No migration → honored (Global Constraints). ✅

**Placeholder scan:** none — every code step contains real code; no TBD/TODO.

**Type consistency:** `peekApplicationDraft → { live, firstName, language }` used identically in Tasks 2 and 5. `storeResumeToken`/`readResumeToken`/`clearResumeToken`/`resumeStorageKey` names consistent across Tasks 1, 4, 5, 6. `ApplicationForm` `slug` prop added in Task 6 and supplied by the resume page in the same task. `getApplicationDraft().slug` defined in Task 2, consumed in Task 6.
