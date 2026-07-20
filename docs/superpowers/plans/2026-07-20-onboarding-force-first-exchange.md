# Force First Exchange at Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force every organizer to create their first exchange — named, with ≥1 filled-in Info card — before they can reach the dashboard.

**Architecture:** Extend the existing 2-step onboarding wizard into 3 steps (school name → first exchange + guided Info cards → invite colleagues). A new `completeFirstExchange` server action creates the exchange and its cards atomically and enforces the ≥1-card rule server-side. The organizer layout's hard gate is extended to redirect any organizer whose school owns zero exchanges into onboarding, so both new signups and existing empty accounts are caught. No schema change — reuses `exchanges` and `exchange_info_cards`.

**Tech Stack:** Next.js 14 App Router, Server Actions, Supabase (RLS cookie client), React client components, Vitest + Testing Library.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Onboarding UI (`app/onboarding/`) is **hardcoded French** — it renders outside any `NextIntlClientProvider`. Use French literals; do **not** call `useTranslations`. No `messages/*.json` changes.
- Expected outcomes (empty name, plan cap, missing cards) must be **structured return values**, never thrown — Next.js redacts thrown Server Action messages in production. Only throw for genuinely unexpected failures.
- Server actions use `requireOrganizer()` from `lib/auth/require.ts`; never hand-roll auth. The error strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing.
- Never log student/parent PII (emails, names). No new `admin` (service-role) imports — the cookie/RLS client only.
- Verification before "done": `pnpm lint`, `pnpm test`, `pnpm build` all green. No migration → `pnpm test:rls` not required.
- Reuse existing constants: `EXCHANGE_INVALID_MESSAGE`, `EXCHANGE_LIMIT_MESSAGE` (`lib/billing/exchange-limit.ts`), `validateInfoCard`/`INFO_TITLE_MAX`/`INFO_BODY_MAX` (`lib/exchange/info-card.ts`), `ACTIVE_EXCHANGE_COOKIE` (`lib/exchange-session.ts`), `applySlug` (`lib/tokens.ts`), `canCreateExchange` (`lib/billing/limits.ts`).

---

## File Structure

- **Create** `lib/onboarding/first-exchange.ts` — pure helpers/types/constants: `FirstExchangeCard`, `CompleteFirstExchangeResult`, `ONBOARDING_CARD_PROMPTS`, `NO_CARDS_MESSAGE`, `CARD_INVALID_MESSAGE`, `filledCards()`.
- **Create** `lib/onboarding/gate.ts` — pure `mustOnboard(schoolName, ownedExchangeCount)`.
- **Create** `lib/onboarding/__tests__/first-exchange.test.ts`, `lib/onboarding/__tests__/gate.test.ts`.
- **Modify** `actions/onboarding.ts` — add `completeFirstExchange`.
- **Create** `actions/__tests__/onboarding-first-exchange.test.ts`.
- **Modify** `app/(organizer)/layout.tsx` — use `mustOnboard` for the redirect.
- **Modify** `app/onboarding/page.tsx` — count exchanges, pick `initialStep`, use `mustOnboard`.
- **Modify** `app/__tests__/onboarding-page.test.ts` — new supabase mock + step/gate cases.
- **Modify** `app/onboarding/OnboardingForm.tsx` — 3-step wizard + `initialStep` prop + exchange step UI.
- **Modify** `app/onboarding/__tests__/OnboardingForm.test.tsx` — exchange-step cases.

---

## Task 1: Pure onboarding helpers

**Files:**
- Create: `lib/onboarding/first-exchange.ts`
- Create: `lib/onboarding/gate.ts`
- Test: `lib/onboarding/__tests__/first-exchange.test.ts`
- Test: `lib/onboarding/__tests__/gate.test.ts`

**Interfaces:**
- Produces:
  - `type FirstExchangeCard = { title: string; body: string }`
  - `type CompleteFirstExchangeResult = { ok: true } | { ok: false; error: 'invalid' | 'limit' | 'noCards'; message: string }`
  - `const ONBOARDING_CARD_PROMPTS: readonly string[]` (5 French titles)
  - `const NO_CARDS_MESSAGE: string`, `const CARD_INVALID_MESSAGE: string`
  - `function filledCards(cards: FirstExchangeCard[]): FirstExchangeCard[]` — trims title+body, keeps only entries whose trimmed body is non-empty.
  - `function mustOnboard(schoolName: string, ownedExchangeCount: number): boolean`

- [ ] **Step 1: Write the failing tests**

Create `lib/onboarding/__tests__/first-exchange.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  filledCards,
  ONBOARDING_CARD_PROMPTS,
  type FirstExchangeCard,
} from '@/lib/onboarding/first-exchange'

describe('ONBOARDING_CARD_PROMPTS', () => {
  it('offers five non-empty French prompt titles', () => {
    expect(ONBOARDING_CARD_PROMPTS).toHaveLength(5)
    for (const p of ONBOARDING_CARD_PROMPTS) expect(p.trim().length).toBeGreaterThan(0)
  })
})

describe('filledCards', () => {
  const cards: FirstExchangeCard[] = [
    { title: 'Dates clés', body: '  Départ le 3 mai  ' },
    { title: 'Destination', body: '' },
    { title: '  Contact  ', body: '   ' },
  ]

  it('keeps only cards with a non-empty body and trims both fields', () => {
    expect(filledCards(cards)).toEqual([{ title: 'Dates clés', body: 'Départ le 3 mai' }])
  })

  it('returns an empty array when no card has a body', () => {
    expect(filledCards([{ title: 'Destination', body: '   ' }])).toEqual([])
  })
})
```

Create `lib/onboarding/__tests__/gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mustOnboard } from '@/lib/onboarding/gate'

describe('mustOnboard', () => {
  it('requires onboarding when the school name is blank', () => {
    expect(mustOnboard('', 3)).toBe(true)
  })
  it('requires onboarding when the school owns no exchange', () => {
    expect(mustOnboard('Lincoln High', 0)).toBe(true)
  })
  it('does not require onboarding once named with at least one exchange', () => {
    expect(mustOnboard('Lincoln High', 1)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- lib/onboarding`
Expected: FAIL — cannot resolve `@/lib/onboarding/first-exchange` / `@/lib/onboarding/gate`.

- [ ] **Step 3: Write the implementations**

Create `lib/onboarding/first-exchange.ts`:

```ts
// Pure helpers + shared contract for the onboarding "first exchange" step.
// Lives outside the 'use server' action module so values and types can be
// imported by both the action and the client form (a 'use server' file may
// export only async functions).

export type FirstExchangeCard = { title: string; body: string }

// completeFirstExchange returns this for expected outcomes instead of throwing
// (Next.js redacts thrown Server Action messages in production).
export type CompleteFirstExchangeResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'limit' | 'noCards'; message: string }

// Pre-filled, editable card titles shown in the onboarding exchange step.
export const ONBOARDING_CARD_PROMPTS: readonly string[] = [
  'Dates clés',
  'Destination',
  'Hébergement',
  'Contact organisateur',
  'À prévoir',
]

export const NO_CARDS_MESSAGE =
  'Renseignez au moins une information sur le programme.'

export const CARD_INVALID_MESSAGE =
  'Chaque information renseignée doit avoir un titre.'

// Trim both fields; keep only cards the organizer actually filled in (non-empty
// body). Cards left blank are dropped rather than created.
export function filledCards(cards: FirstExchangeCard[]): FirstExchangeCard[] {
  return cards
    .map(c => ({ title: c.title.trim(), body: c.body.trim() }))
    .filter(c => c.body.length > 0)
}
```

Create `lib/onboarding/gate.ts`:

```ts
// True when an organizer must be sent to /onboarding: either the school has no
// name yet, or the school owns no exchange. Shared by the organizer layout
// (hard gate) and the onboarding page (which step to show / bounce home).
export function mustOnboard(schoolName: string, ownedExchangeCount: number): boolean {
  return schoolName === '' || ownedExchangeCount === 0
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- lib/onboarding`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/first-exchange.ts lib/onboarding/gate.ts lib/onboarding/__tests__/
git commit -m "feat(onboarding): pure helpers for the first-exchange step and gate"
```

---

## Task 2: `completeFirstExchange` server action

**Files:**
- Modify: `actions/onboarding.ts`
- Test: `actions/__tests__/onboarding-first-exchange.test.ts`

**Interfaces:**
- Consumes (Task 1): `filledCards`, `NO_CARDS_MESSAGE`, `CARD_INVALID_MESSAGE`, `type FirstExchangeCard`, `type CompleteFirstExchangeResult`.
- Produces:
  - `async function completeFirstExchange(name: string, cards: FirstExchangeCard[]): Promise<CompleteFirstExchangeResult>` — creates the exchange (school_a = caller's school, auto year, `apply_slug`), inserts each filled card (`position` 0..n), sets `ACTIVE_EXCHANGE_COOKIE`, `revalidatePath('/', 'layout')`. Returns `{ ok:false, error:'invalid' }` for empty name / a filled card with no title, `'limit'` at the plan cap, `'noCards'` when no card has a body.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/onboarding-first-exchange.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  orgRole: 'owner' | 'admin'
  school: { subscription_status: string | null; plan: string | null; grace_until: string | null }
  exchangeCount: number
}

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: scenario.orgRole, email: 'a@b.c', full_name: 'A' },
  }),
}))

// Capture what got written.
const inserted: { exchanges: any[]; cards: any[] } = { exchanges: [], cards: [] }
const cookieSet = vi.fn()

function exchangesTable() {
  const b: any = {
    select: () => b,
    eq: () => b,
    // count query (head:true) is awaited directly:
    then: (resolve: (v: unknown) => unknown) => resolve({ count: scenario.exchangeCount, error: null }),
    // insert(...).select('id').single()
    insert: (row: any) => {
      inserted.exchanges.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'ex-new' }, error: null }) }) }
    },
  }
  return b
}
function schoolsTable() {
  const b: any = {
    select: () => b, eq: () => b,
    single: async () => ({ data: scenario.school, error: null }),
  }
  return b
}
function cardsTable() {
  return {
    insert: async (rows: any[]) => { inserted.cards.push(...rows); return { error: null } },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return exchangesTable()
      if (t === 'schools') return schoolsTable()
      if (t === 'exchange_info_cards') return cardsTable()
      throw new Error('unexpected table ' + t)
    },
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/tokens', () => ({ applySlug: (s: string) => 'slug-' + s.trim().toLowerCase().replace(/\s+/g, '-') }))

import { completeFirstExchange } from '@/actions/onboarding'

beforeEach(() => {
  inserted.exchanges = []
  inserted.cards = []
  cookieSet.mockClear()
  scenario = {
    orgRole: 'owner',
    school: { subscription_status: null, plan: null, grace_until: null }, // trial
    exchangeCount: 0,
  }
})

describe('completeFirstExchange', () => {
  it('creates the exchange, inserts only filled cards, and sets the active cookie', async () => {
    const res = await completeFirstExchange('  Espagne 2026  ', [
      { title: 'Dates clés', body: '  Départ le 3 mai ' },
      { title: 'Destination', body: '' },
      { title: 'Contact', body: 'Mme Dupont' },
    ])
    expect(res).toEqual({ ok: true })
    expect(inserted.exchanges).toEqual([
      { name: 'Espagne 2026', year: new Date().getFullYear(), school_a_id: 's1', school_b_id: null, apply_slug: 'slug-espagne-2026' },
    ])
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Départ le 3 mai', position: 0 },
      { exchange_id: 'ex-new', title: 'Contact', body: 'Mme Dupont', position: 1 },
    ])
    expect(cookieSet).toHaveBeenCalledWith('ee_active_exchange', 'ex-new', expect.objectContaining({ path: '/' }))
  })

  it('rejects an empty name without creating anything', async () => {
    const res = await completeFirstExchange('   ', [{ title: 'Dates', body: 'x' }])
    expect(res).toEqual({ ok: false, error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects when no card has a body', async () => {
    const res = await completeFirstExchange('Espagne', [
      { title: 'Dates', body: '' },
      { title: 'Destination', body: '   ' },
    ])
    expect(res).toEqual({ ok: false, error: 'noCards', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a filled card whose title was cleared', async () => {
    const res = await completeFirstExchange('Espagne', [{ title: '   ', body: 'Some info' }])
    expect(res).toEqual({ ok: false, error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('returns the limit outcome at the plan cap', async () => {
    scenario.exchangeCount = 1 // trial cap = 1
    const res = await completeFirstExchange('Espagne', [{ title: 'Dates', body: 'x' }])
    expect(res).toEqual({ ok: false, error: 'limit', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- actions/__tests__/onboarding-first-exchange.test.ts`
Expected: FAIL — `completeFirstExchange` is not exported from `@/actions/onboarding`.

- [ ] **Step 3: Add the action to `actions/onboarding.ts`**

Add these imports at the top of `actions/onboarding.ts` (keep the existing `createClient`, `requireOrganizer`, `revalidatePath` imports):

```ts
import { cookies } from 'next/headers'
import { applySlug } from '@/lib/tokens'
import { canCreateExchange } from '@/lib/billing/limits'
import { EXCHANGE_LIMIT_MESSAGE, EXCHANGE_INVALID_MESSAGE } from '@/lib/billing/exchange-limit'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { validateInfoCard } from '@/lib/exchange/info-card'
import {
  filledCards,
  NO_CARDS_MESSAGE,
  CARD_INVALID_MESSAGE,
  type FirstExchangeCard,
  type CompleteFirstExchangeResult,
} from '@/lib/onboarding/first-exchange'
```

Append this action to the end of `actions/onboarding.ts`:

```ts
// The forced onboarding step: create the school's first exchange together with
// at least one filled-in Info card. Mirrors createExchange's guards (name, plan
// cap, active-exchange cookie) but additionally requires >=1 card so students
// land on a non-empty /infos page. Structured returns for expected outcomes.
export async function completeFirstExchange(
  name: string,
  cards: FirstExchangeCard[],
): Promise<CompleteFirstExchangeResult> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()

  const trimmedName = (name ?? '').trim()
  if (!trimmedName) return { ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE }

  // Plan cap (trial = 1). At 0 exchanges this always passes; kept for parity
  // with createExchange so the rule lives in one shape.
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until')
    .eq('id', profile.school_id)
    .single()
  if (schoolError) throw schoolError

  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (school && !canCreateExchange(school, count ?? 0)) {
    return { ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE }
  }

  const filled = filledCards(cards)
  if (filled.length === 0) return { ok: false, error: 'noCards', message: NO_CARDS_MESSAGE }

  const validated: { title: string; body: string }[] = []
  for (const card of filled) {
    const v = validateInfoCard(card)
    if (!v.ok) return { ok: false, error: 'invalid', message: CARD_INVALID_MESSAGE }
    validated.push(v.value)
  }

  const { data: created, error: insertError } = await supabase
    .from('exchanges')
    .insert({
      name: trimmedName,
      year: new Date().getFullYear(),
      school_a_id: profile.school_id,
      school_b_id: null,
      apply_slug: applySlug(trimmedName),
    })
    .select('id')
    .single()
  if (insertError) throw insertError

  const cardRows = validated.map((c, i) => ({
    exchange_id: created.id, title: c.title, body: c.body, position: i,
  }))
  const { error: cardsError } = await supabase.from('exchange_info_cards').insert(cardRows)
  if (cardsError) throw cardsError

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, created.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- actions/__tests__/onboarding-first-exchange.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add actions/onboarding.ts actions/__tests__/onboarding-first-exchange.test.ts
git commit -m "feat(onboarding): completeFirstExchange action (exchange + required info cards)"
```

---

## Task 3: 3-step OnboardingForm with the exchange step

**Files:**
- Modify: `app/onboarding/OnboardingForm.tsx`
- Test: `app/onboarding/__tests__/OnboardingForm.test.tsx`

**Interfaces:**
- Consumes (Task 1/2): `completeFirstExchange`, `ONBOARDING_CARD_PROMPTS`, `type FirstExchangeCard`.
- Produces: `OnboardingForm` now accepts `{ initialStep?: 1 | 2 }` (default `1`). Step 1 = school name → step 2; step 2 = exchange name + 5 guided cards → step 3; step 3 = invite colleagues (unchanged) → `/dashboard`.

- [ ] **Step 1: Write the failing tests**

Replace the body of `app/onboarding/__tests__/OnboardingForm.test.tsx` with (keeps the existing 3 cases, adds exchange-step coverage and the `completeFirstExchange` mock):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const completeOnboarding = vi.fn()
const completeFirstExchange = vi.fn()
vi.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
  completeFirstExchange: (...a: unknown[]) => completeFirstExchange(...a),
}))
const inviteOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({ inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a) }))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

beforeEach(() => {
  push.mockReset()
  completeOnboarding.mockReset().mockResolvedValue(undefined)
  completeFirstExchange.mockReset().mockResolvedValue({ ok: true })
  inviteOrganizer.mockReset().mockResolvedValue(undefined)
})

describe('OnboardingForm', () => {
  it('walks name -> exchange -> invite, then reaches the dashboard', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()

    // Step 1: school name
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    // Step 2: exchange name + at least one filled card
    await user.type(await screen.findByLabelText('Nom du programme'), 'Espagne 2026')
    await user.type(screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA')!, 'Départ le 3 mai')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    expect(completeFirstExchange.mock.calls[0][0]).toBe('Espagne 2026')

    // Step 3: invite step (optional)
    expect(await screen.findByText(/Invitez vos collègues/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('shows the server error and stays on the exchange step when no card is filled', async () => {
    completeFirstExchange.mockResolvedValue({ ok: false, error: 'noCards', message: 'Renseignez au moins une information sur le programme.' })
    render(<OnboardingForm initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByText(/Renseignez au moins une information/)).toBeInTheDocument()
    expect(screen.queryByText(/Invitez vos collègues/)).not.toBeInTheDocument()
  })

  it('starts on the exchange step when initialStep is 2', async () => {
    render(<OnboardingForm initialStep={2} />)
    expect(screen.getByLabelText('Nom du programme')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).not.toBeInTheDocument()
  })

  it('sends an invite from the final step and lists it as sent', async () => {
    render(<OnboardingForm initialStep={2} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    await user.type(screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA')!, 'Info')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.type(await screen.findByPlaceholderText('adresse@etablissement.fr'), 'c@x.fr')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(inviteOrganizer).toHaveBeenCalledWith('c@x.fr'))
    expect(await screen.findByText('c@x.fr')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- app/onboarding/__tests__/OnboardingForm.test.tsx`
Expected: FAIL — no `initialStep` prop / no "Nom du programme" field / `completeFirstExchange` not wired.

- [ ] **Step 3: Rewrite `app/onboarding/OnboardingForm.tsx`**

Replace the whole file with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeOnboarding, completeFirstExchange } from '@/actions/onboarding'
import { inviteOrganizer } from '@/actions/settings'
import { ONBOARDING_CARD_PROMPTS, type FirstExchangeCard } from '@/lib/onboarding/first-exchange'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function OnboardingForm({ initialStep = 1 }: { initialStep?: 1 | 2 }) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 2: exchange + guided info cards
  const [exchangeName, setExchangeName] = useState('')
  const [cards, setCards] = useState<FirstExchangeCard[]>(
    ONBOARDING_CARD_PROMPTS.map(title => ({ title, body: '' })),
  )
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [exchangeBusy, setExchangeBusy] = useState(false)

  // Step 3: invite state
  const [email, setEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [sent, setSent] = useState<string[]>([])

  function setCard(i: number, patch: Partial<FirstExchangeCard>) {
    setCards(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  async function handleName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await completeOnboarding(new FormData(e.currentTarget))
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setLoading(false)
  }

  async function handleExchange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setExchangeBusy(true)
    setExchangeError(null)
    try {
      const result = await completeFirstExchange(exchangeName, cards)
      if (result.ok) { setStep(3); return }
      setExchangeError(result.message)
    } catch {
      setExchangeError('Une erreur est survenue. Réessayez.')
    } finally {
      setExchangeBusy(false)
    }
  }

  async function handleInvite() {
    setInviteBusy(true); setInviteError(null)
    try {
      await inviteOrganizer(email)
      setSent(prev => [...prev, email.trim()])
      setEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setInviteBusy(false)
  }

  if (step === 1) {
    return (
      <form onSubmit={handleName} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-[13px] font-semibold text-[#42506E]">Votre établissement</Label>
          <Input id="name" name="name" required className="h-11 rounded-[10px] border-[#C4CDE0]" />
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }

  if (step === 2) {
    return (
      <form onSubmit={handleExchange} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="m-0 font-display text-[17px] font-bold text-[#10203F]">Votre premier programme</h4>
          <p className="m-0 text-[14px] leading-relaxed text-[#5B6B8C]">
            Renseignez les informations clés — vos élèves les verront dès leur connexion.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exchange-name" className="text-[13px] font-semibold text-[#42506E]">Nom du programme</Label>
          <Input
            id="exchange-name"
            value={exchangeName}
            onChange={e => setExchangeName(e.target.value)}
            placeholder="Échange Espagne 2026"
            required
            className="h-11 rounded-[10px] border-[#C4CDE0]"
          />
        </div>
        <div className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-[#E1E7F0] p-3">
              <Input
                aria-label={`Titre ${i + 1}`}
                value={card.title}
                onChange={e => setCard(i, { title: e.target.value })}
                maxLength={120}
                className="h-9 rounded-[8px] border-[#C4CDE0] text-[13.5px] font-semibold"
              />
              <Textarea
                aria-label={`${card.title} — détails`}
                value={card.body}
                onChange={e => setCard(i, { body: e.target.value })}
                maxLength={2000}
                rows={2}
                placeholder="Ajoutez les détails (facultatif pour cette carte)…"
                className="rounded-[8px] border-[#C4CDE0] text-[14px]"
              />
            </div>
          ))}
          <p className="m-0 text-[12.5px] text-[#8A97B1]">Renseignez au moins une information.</p>
        </div>
        {exchangeError && <p className="text-sm text-[#C0392B]">{exchangeError}</p>}
        <Button type="submit" disabled={exchangeBusy} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
          {exchangeBusy ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h4 className="m-0 font-display text-[17px] font-bold text-[#10203F]">Invitez vos collègues (optionnel)</h4>
        <p className="m-0 text-[14px] leading-relaxed text-[#5B6B8C]">
          Ils pourront co-gérer vos échanges. Vous pourrez aussi les inviter plus tard depuis les Réglages.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleInvite() } }}
          placeholder="adresse@etablissement.fr"
          className="h-11 rounded-[10px] border-[#C4CDE0]"
        />
        <Button type="button" onClick={handleInvite} disabled={inviteBusy} className="h-11 flex-none rounded-[11px] bg-[#2456E6] px-5 text-base font-semibold hover:bg-[#1D48C7]">
          Inviter
        </Button>
      </div>
      {inviteError && <p className="text-sm text-[#C0392B]">{inviteError}</p>}
      {sent.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {sent.map(e => (
            <li key={e} className="rounded-[9px] bg-[#EEF1F7] px-3 py-2 text-[13.5px] text-[#42506E]">
              ✓ Invitation envoyée à <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-between">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')} className="text-[#5B6B8C]">
          Passer
        </Button>
        <Button type="button" onClick={() => router.push('/dashboard')} className="h-11 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          Continuer
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- app/onboarding/__tests__/OnboardingForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/OnboardingForm.tsx app/onboarding/__tests__/OnboardingForm.test.tsx
git commit -m "feat(onboarding): 3-step wizard with the required first-exchange step"
```

---

## Task 4: Wire the gate — page starting step + layout redirect

**Files:**
- Modify: `app/onboarding/page.tsx`
- Modify: `app/(organizer)/layout.tsx`
- Test: `app/__tests__/onboarding-page.test.ts`

**Interfaces:**
- Consumes (Task 1): `mustOnboard`.
- Consumes (Task 3): `OnboardingForm` `initialStep` prop.
- Produces: no new exports. Page bounces completed organizers to `/dashboard`; otherwise renders `OnboardingForm` at step 1 (blank school name) or step 2 (named, no exchange). Layout redirects any organizer where `mustOnboard(schoolName, ownedCount)` is true.

- [ ] **Step 1: Update the failing page test**

Replace the supabase mock and add cases in `app/__tests__/onboarding-page.test.ts`. Change the `createClient` mock and the "already set" case, and add two new cases:

Replace this line:

```ts
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
```

with:

```ts
let ownedExchangeCount = 0
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: ownedExchangeCount, error: null }),
      }),
    }),
  }),
}))
```

Add `ownedExchangeCount = 0` reset inside `beforeEach` (below the existing resets):

```ts
  ownedExchangeCount = 0
```

Replace the existing "already set → /dashboard" case with these three cases:

```ts
  it('redirects a fully-onboarded organizer (named + has exchange) to /dashboard', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    ownedExchangeCount = 2
    expect(await getRedirect()).toBe('/dashboard')
  })

  it('renders (no redirect) for a named school that owns no exchange', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: 'Lincoln High' } }
    ownedExchangeCount = 0
    await expect(OnboardingPage()).resolves.toBeTruthy() // renders at step 2
  })

  it('renders (no redirect) for a blank school name', async () => {
    profile = { role: 'organizer', school_id: 's-1', schools: { name: '' } }
    await expect(OnboardingPage()).resolves.toBeTruthy() // renders at step 1
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- app/__tests__/onboarding-page.test.ts`
Expected: FAIL — the page still redirects to `/dashboard` whenever the name is set (ignores exchange count) and does not yet query exchanges.

- [ ] **Step 3: Update `app/onboarding/page.tsx`**

Replace the whole file with:

```tsx
import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { createClient } from '@/lib/supabase/server'
import { mustOnboard } from '@/lib/onboarding/gate'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { OnboardingForm } from './OnboardingForm'

// Dedicated first-login setup: capture the school name (step 1) and force the
// school's first exchange with at least one Info card (step 2). The organizer
// layout gate bounces here while the school has no name or no exchange; once
// both exist this page redirects to the dashboard.
export default async function OnboardingPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const schoolName = profile.schools?.name ?? ''

  const supabase = await createClient()
  const { count } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  const ownedCount = count ?? 0

  if (!mustOnboard(schoolName, ownedCount)) redirect('/dashboard')

  // Blank name → start at the school-name step; named but no exchange → jump
  // straight to the first-exchange step.
  const initialStep = schoolName === '' ? 1 : 2

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Bienvenue sur Eazyexchange</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">Configurons votre programme en quelques étapes.</p>
        </div>
        <OnboardingForm initialStep={initialStep} />
      </AuthCard>
    </div>
  )
}
```

- [ ] **Step 4: Update the layout gate in `app/(organizer)/layout.tsx`**

Add the import near the other `lib` imports (e.g. after the `resolveActiveExchange` import):

```ts
import { mustOnboard } from '@/lib/onboarding/gate'
```

Then **remove** the existing name-only redirect:

```ts
  const school = profile?.schools ?? null
  // Hard gate: no organizer page renders with an empty school name. A fresh
  // organizer (email/password or Google) lands here and is sent to onboarding.
  if (school && school.name === '') redirect('/onboarding')
  const showGrace = school ? isInGrace(school as never) : false
```

Replace it with (drop the early redirect; keep `showGrace`):

```ts
  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false
```

Then, immediately **after** `ownedCount` is computed (the existing
`const ownedCount = rows.filter(e => e.school_a_id === profile.school_id).length`
line), add the consolidated hard gate:

```ts
  // Hard gate: no organizer page renders until the school is named AND owns at
  // least one exchange. Catches fresh signups and existing empty accounts.
  // ownedCount includes archived exchanges, so archiving your only exchange
  // does not re-trap you here.
  if (school && mustOnboard(school.name, ownedCount)) redirect('/onboarding')
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- app/__tests__/onboarding-page.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/page.tsx "app/(organizer)/layout.tsx" app/__tests__/onboarding-page.test.ts
git commit -m "feat(onboarding): gate the dashboard behind a first exchange"
```

---

## Task 5: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all green (new: 5 helper + 5 action + 4 form + updated page cases).

Note (known environment gotcha): a main-checkout `pnpm test` can sweep sibling
worktree tests. If failures come only from `.claude/worktrees/**`, re-run scoped
with `pnpm test -- --exclude '**/.claude/**'` and confirm this branch's own
tests pass. Do not "fix" unrelated worktree failures.

- [ ] **Step 3: Build (type check)**

Run: `pnpm build`
Expected: compiles with no type errors.

- [ ] **Step 4: Commit any incidental fixes** (only if Steps 1-3 required changes)

```bash
git add -A
git commit -m "chore(onboarding): verification fixes"
```

---

## Post-implementation notes (for the merge/PR step)

- No migration, no RLS change → `pnpm test:rls` not required; no `types/supabase.ts` regen.
- Manual smoke (preview/staging): (1) fresh signup → name → exchange step blocks "Continuer" with no card body filled, succeeds with one; (2) an existing organizer account whose school owns no exchange is redirected into onboarding at step 2; (3) students on that exchange see the created cards at `/infos`.
- Product edge (accepted): the "Nouvel échange" modal for 2nd+ exchanges still requires only a name — the card requirement is onboarding-only, by design.
