# Exchanges Page Billing Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the billing/pricing block from the organizer Exchanges page, move the `+ Nouvel échange` button to the bottom with a silent at-cap redirect to `/billing`, and add prices to the `/billing` tier selector.

**Architecture:** Pure frontend change. `ExchangesView` loses its `billing` prop and all billing-block rendering; the create button becomes a modal-opener when under cap and a `/billing` link when at cap. `PlanSelector` on `/billing` gains a price line per tier from the existing `PLAN_PRICE_FR` map. No server actions, billing logic, or schema change.

**Tech Stack:** Next.js 14 App Router, React, Tailwind, Vitest + Testing Library, pnpm.

## Global Constraints

- Package manager is **pnpm** (never npm).
- French UI copy — preserve exact accented strings; escape apostrophes in JSX as `&apos;`.
- `createExchange`'s server-side cap enforcement is the real backstop and MUST NOT be touched.
- Grace/payment-failure warning is already global (`PaymentWarningBanner` in `app/(organizer)/layout.tsx`) — do not re-add it to the Exchanges page.
- Verification gate before done: `pnpm lint`, `pnpm test`, `pnpm build` all green.

---

### Task 1: Add prices to the `/billing` tier selector

**Files:**
- Modify: `components/billing/PlanSelector.tsx`
- Test: `components/billing/__tests__/PlanSelector.test.tsx`

**Interfaces:**
- Consumes: `PLAN_PRICE_FR` from `@/lib/billing/display` — `Record<PlanKey, string>`, e.g. `{ starter: '199 €', growth: '499 €', scale: '799 €' }`.
- Produces: nothing new (visual-only change).

- [ ] **Step 1: Add the failing test**

Add this test inside the `describe('PlanSelector', …)` block in `components/billing/__tests__/PlanSelector.test.tsx`:

```tsx
  it('shows the yearly price for each tier', () => {
    render(<PlanSelector />)
    expect(screen.getByText('199 €')).toBeInTheDocument()
    expect(screen.getByText('499 €')).toBeInTheDocument()
    expect(screen.getByText('799 €')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- PlanSelector`
Expected: FAIL — the new test cannot find text `199 €` (prices not rendered yet). Existing PlanSelector tests still pass.

- [ ] **Step 3: Add the price line to each tier**

In `components/billing/PlanSelector.tsx`, add the import and render a price line between the tier label and the cap label.

Update the import line:

```tsx
import { PLAN_LABEL_FR, PLAN_PRICE_FR, planCapLabel } from '@/lib/billing/display'
```

Inside the tier `<button>`, between the label span and the cap span, insert the price line so the block reads:

```tsx
              <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-[#10203F]">{PLAN_LABEL_FR[key]}</span>
              <span className="text-[15px] font-semibold text-[#10203F]">{PLAN_PRICE_FR[key]} <span className="text-[13px] font-normal text-[#5B6B8C]">/ an</span></span>
              <span className="text-[13.5px] text-[#5B6B8C]">{planCapLabel(key)}</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- PlanSelector`
Expected: PASS (all PlanSelector tests).

- [ ] **Step 5: Commit**

```bash
git add components/billing/PlanSelector.tsx components/billing/__tests__/PlanSelector.test.tsx
git commit -m "feat: show yearly prices on billing tier selector"
```

---

### Task 2: Strip billing block from Exchanges page and rewire the create button

**Files:**
- Modify: `components/exchanges/ExchangesView.tsx` (full rewrite of the file — new version below)
- Modify: `app/(organizer)/exchanges/page.tsx:53-65` (stop computing/passing `billing`)
- Test: `components/exchanges/__tests__/ExchangesView.test.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `useShellUi` from `@/components/shell/ShellUiContext` — provides `openNewExchange: () => void` (has a safe no-op default, so no provider needed in tests).
- Produces: `ExchangesView` now takes props `{ exchangesData: ExchangeCardData[]; atCap: boolean }` — the `billing` prop and `BillingBlock` type are removed. `ExchangeCardData` is unchanged: `{ id: string; name: string; year: number; phase: 1 | 2; pct: number | null; pctLabel: string }`.

- [ ] **Step 1: Rewrite the test file to the new contract**

Replace the entire contents of `components/exchanges/__tests__/ExchangesView.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { ExchangesView } from '@/components/exchanges/ExchangesView'

const ex = { id: 'e1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, pct: 40, pctLabel: '2 / 5 candidatures traitées' }

describe('ExchangesView', () => {
  it('renders no billing block', () => {
    render(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.queryByText(/Essai gratuit/)).toBeNull()
    expect(screen.queryByText('POPULAIRE')).toBeNull()
    expect(screen.queryByText(/Forfait/)).toBeNull()
  })
  it('exchange card shows name, phase tag and progress', () => {
    render(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('under cap: create button opens the modal (no /billing link)', () => {
    render(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nouvel échange/ })).toBeNull()
  })
  it('at cap: create button is a silent link to /billing', () => {
    render(<ExchangesView exchangesData={[ex]} atCap />)
    expect(screen.queryByRole('button', { name: /Nouvel échange/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nouvel échange/ })).toHaveAttribute('href', '/billing')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ExchangesView`
Expected: FAIL — `ExchangesView` still requires the `billing` prop (TypeScript/runtime), and the at-cap link still reads "Choisir un forfait".

- [ ] **Step 3: Rewrite `ExchangesView.tsx`**

Replace the entire contents of `components/exchanges/ExchangesView.tsx` with:

```tsx
'use client'
import Link from 'next/link'
import { useShellUi } from '@/components/shell/ShellUiContext'

export type ExchangeCardData = {
  id: string
  name: string
  year: number
  phase: 1 | 2
  pct: number | null
  pctLabel: string
}

const PHASE_LABEL: Record<1 | 2, string> = {
  1: 'Phase 1 · Recrutement',
  2: 'Phase 2 · Préparation',
}

function ExchangeCard({ exchange }: { exchange: ExchangeCardData }) {
  const { id, name, year, phase, pct, pctLabel } = exchange
  return (
    <Link
      href={`/exchanges/${id}`}
      className="bg-card border rounded-[14px] p-5 hover:bg-hoverrow-soft flex flex-col"
    >
      <div className="flex items-center gap-2.5">
        <span className="font-display text-base font-bold text-navy">{name}</span>
        <span className="rounded-pill bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {year}
        </span>
        <span className="rounded-pill bg-tint text-tint-text px-2.5 py-0.5 font-mono text-[11px]">
          {PHASE_LABEL[phase]}
        </span>
      </div>
      <div className="text-[13px] text-muted-foreground mt-1">{pctLabel}</div>
      {pct !== null && (
        <>
          <div className="h-[8px] rounded-pill bg-track mt-2.5">
            <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">{pct}%</div>
        </>
      )}
    </Link>
  )
}

const CREATE_BTN =
  'rounded-[9px] bg-brand text-white hover:bg-brand-hover px-4 h-[38px] flex items-center justify-center text-[13px] font-semibold'

export function ExchangesView({
  exchangesData,
  atCap,
}: {
  exchangesData: ExchangeCardData[]
  atCap: boolean
}) {
  const { openNewExchange } = useShellUi()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">Échanges</h1>
        <p className="text-sm text-muted-foreground">
          Suivez tous vos programmes d&apos;échange — passés, en cours et à venir.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          Vos échanges
        </span>

        <div className="flex flex-col gap-3">
          {exchangesData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              Aucun échange pour l&apos;instant — créez le premier.
            </p>
          ) : (
            exchangesData.map((exchange) => <ExchangeCard key={exchange.id} exchange={exchange} />)
          )}
        </div>

        <div className="flex justify-start pt-1">
          {atCap ? (
            <Link href="/billing" className={CREATE_BTN}>
              + Nouvel échange
            </Link>
          ) : (
            <button type="button" onClick={openNewExchange} className={CREATE_BTN}>
              + Nouvel échange
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Remove the `billing` computation and prop in the page**

In `app/(organizer)/exchanges/page.tsx`, delete the billing block (currently lines ~49-60) and its now-unused imports, and drop `billing` from the render.

Remove this import line:

```tsx
import { hasActivePlan, isInGrace, exchangeCap, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
```

and replace it with (drop `hasActivePlan`/`isInGrace`, keep the cap helpers):

```tsx
import { exchangeCap, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
```

Remove these now-unused imports entirely:

```tsx
import { ExchangesView, type ExchangeCardData, type BillingBlock } from '@/components/exchanges/ExchangesView'
import { PLAN_LABEL_FR } from '@/lib/billing/display'
```

Replace the `ExchangesView` import with (no `BillingBlock`):

```tsx
import { ExchangesView, type ExchangeCardData } from '@/components/exchanges/ExchangesView'
```

Delete the entire billing block — this comment and the `let billing … ` statement through its closing brace:

```tsx
  // isInGrace is checked first: hasActivePlan(school) is also true while a
  // school is in its post-failure grace window (it delegates to isInGrace
  // internally), so the grace branch must take priority or it becomes
  // unreachable and a failed payment silently renders as "active".
  let billing: BillingBlock = { kind: 'trial' }
  if (school) {
    if (isInGrace(school as never)) {
      billing = { kind: 'grace' }
    } else if (hasActivePlan(school as never) && school.plan) {
      billing = { kind: 'active', planLabel: PLAN_LABEL_FR[school.plan as keyof typeof PLAN_LABEL_FR] ?? school.plan }
    }
  }

```

Change the final render line from:

```tsx
  return <ExchangesView billing={billing} exchangesData={exchangesData} atCap={atCap} />
```

to:

```tsx
  return <ExchangesView exchangesData={exchangesData} atCap={atCap} />
```

Note: `school` is still used by the `atCap` computation (`exchangeCap(school as never)`), so keep the `const school = profile.schools ?? null` line and the `ownedCount`/`atCap` lines intact.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- ExchangesView`
Expected: PASS (all four tests).

- [ ] **Step 6: Full verification gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all green. `pnpm build` confirms no dangling references to `BillingBlock`, `PlanTiles`, or the removed imports.

- [ ] **Step 7: Commit**

```bash
git add components/exchanges/ExchangesView.tsx components/exchanges/__tests__/ExchangesView.test.tsx "app/(organizer)/exchanges/page.tsx"
git commit -m "feat: clean exchanges page, silent at-cap redirect to /billing"
```

---

## Self-Review

**Spec coverage:**
- Remove billing block (trial banner + tiles + active bar + grace) → Task 2 (rewrite drops all of it; grace stays global per constraint). ✅
- `+ Nouvel échange` at the bottom → Task 2 (button rendered after the list). ✅
- Under cap opens modal; at cap silent `/billing` redirect, same label, no hint → Task 2 (button vs Link, both `+ Nouvel échange`). ✅
- `createExchange` enforcement untouched → not modified in any task. ✅
- Add prices to `/billing` tiers → Task 1. ✅
- Test updates for both components → Tasks 1 & 2. ✅

**Placeholder scan:** No TBD/TODO; all code blocks are complete. ✅

**Type consistency:** `ExchangesView` props `{ exchangesData, atCap }` match the page's render call and the test renders; `ExchangeCardData` unchanged; `PLAN_PRICE_FR` signature matches `display.ts`. ✅
