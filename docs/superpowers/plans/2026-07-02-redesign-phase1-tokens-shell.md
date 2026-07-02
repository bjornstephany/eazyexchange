# Redesign Phase 1: Design Tokens + Organizer Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the app's global design tokens (fonts, palette, radii, brand mark) to the design-handoff values and replace the organizer's horizontal nav with the designed shell: 82px navy icon rail, 66px top bar with a cookie-backed session selector, and a « Nouvel échange » modal replacing the `/exchanges/new` page.

**Architecture:** Remap the existing shadcn CSS variables and Tailwind theme in place so every page inherits the new look; add a small pure lib (`lib/exchange-session.ts`) + server action for the active-exchange cookie; new client components under `components/shell/` composed by `app/(organizer)/layout.tsx` (server component that fetches profile + exchanges and resolves the active one).

**Tech Stack:** Next.js 14 App Router, Tailwind + shadcn/ui (Dialog exists in `components/ui/dialog.tsx`), Supabase, vitest + @testing-library/react (jsdom, globals on).

**Spec:** `docs/superpowers/specs/2026-07-02-redesign-phase1-tokens-shell-design.md`
**Design reference:** unzip `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/` (README.md + `Eazyexchange Dashboard.dc.html` for the shell, `Eazyexchange Pages Round 2.dc.html` screen 1g for the modal).

## Global Constraints

- Package manager is **pnpm** (never npm).
- Verification before claiming done: `pnpm lint`, `pnpm test`, `npx tsc --noEmit` (NOT `pnpm build` — local `.env.local` has placeholders and build fails on env validation).
- **Never log student/parent PII.**
- All new shell/modal copy is **French, vouvoiement**, verbatim from this plan (it is copied from the handoff).
- Existing page copy stays English — do not translate page content in this phase.
- Work on branch `redesign/phase-1-tokens-shell`. Do NOT push or merge to `main` without explicit user confirmation.
- The Tailwind colors `ink`, `paper`, `cleared`, `boarding`, `stamp` belong to the current landing page — leave them untouched.

---

### Task 1: Design tokens — fonts, CSS variables, Tailwind theme

**Files:**
- Modify: `app/layout.tsx` (fonts)
- Modify: `app/globals.css` (`:root` block ~lines 98–142)
- Modify: `tailwind.config.ts`
- Delete: `app/fonts/GeistVF.woff`, `app/fonts/GeistMonoVF.woff`

**Interfaces:**
- Produces: Tailwind utilities used by every later task: colors `navy`, `rail`, `rail-inactive`, `brand`, `brand-hover`, `brand-accent`, `tint`, `tint-border`, `tint-text`, `success`, `success-text`, `warn`, `warn-text`, `danger`, `danger-text`, `subtle`, `hoverrow`, `hoverrow-soft`, `hint`, `placeholder`, `tertiary`, `track`, `frame`, `frame-dashed`; radii `rounded-card` (18px), `rounded-pill`; shadows `shadow-float`, `shadow-modal`; fonts `font-sans` (IBM Plex Sans), `font-display` (Schibsted Grotesk), `font-mono` (IBM Plex Mono).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b redesign/phase-1-tokens-shell
```

- [ ] **Step 2: Swap fonts in `app/layout.tsx`**

Replace the imports and font constants (lines 2–22). Schibsted Grotesk is a variable font — no `weight` array; IBM Plex fonts are static — weights required:

```tsx
import { IBM_Plex_Sans, Schibsted_Grotesk, IBM_Plex_Mono } from 'next/font/google'

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const display = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
  display: 'swap',
})
```

Leave `metadata` (English landing copy — phase 8) and the rest of the file unchanged.

- [ ] **Step 3: Delete unused Geist font files**

```bash
git rm app/fonts/GeistVF.woff app/fonts/GeistMonoVF.woff
```

(They are not imported anywhere — `grep -rn "GeistVF\|GeistMonoVF" app components lib` must return nothing; if it returns something, stop and investigate.)

- [ ] **Step 4: Replace the `:root` variables and delete `.dark` in `app/globals.css`**

In the `@layer base` block, replace the entire `:root { … }` with (HSL conversions of the handoff hex — background `#EEF1F7`, ink `#10203F`, primary `#2456E6`, secondary/muted fill `#F1F4F9`, muted-fg `#5B6B8C`, accent tint `#E6ECFD`/`#1D48C7`, destructive `#C0392B`, border `#E4E9F2`, input `#C4CDE0`):

```css
  :root {
    --background: 220 36% 95%;
    --foreground: 220 60% 15%;
    --card: 0 0% 100%;
    --card-foreground: 220 60% 15%;
    --popover: 0 0% 100%;
    --popover-foreground: 220 60% 15%;
    --primary: 224 79% 52%;
    --primary-foreground: 0 0% 100%;
    --secondary: 218 40% 96%;
    --secondary-foreground: 220 60% 15%;
    --muted: 218 40% 96%;
    --muted-foreground: 220 21% 45%;
    --accent: 224 85% 95%;
    --accent-foreground: 225 75% 45%;
    --destructive: 6 63% 46%;
    --destructive-foreground: 0 0% 100%;
    --border: 219 35% 92%;
    --input: 221 31% 82%;
    --ring: 224 79% 52%;
    --radius: 0.875rem;
  }
```

Delete the entire `.dark { … }` block (the design has no dark theme). Keep the `* { @apply border-border }` / `body` rules and all landing keyframes untouched.

- [ ] **Step 5: Add handoff tokens to `tailwind.config.ts`**

Inside `theme.extend.colors`, after the `stamp` entry, add:

```ts
      // Redesign tokens (design handoff, 2026-07)
      navy: "#10203F",
      rail: { DEFAULT: "#0E1B38", inactive: "#8595B8" },
      brand: { DEFAULT: "#2456E6", hover: "#1D48C7", accent: "#3B6EF6" },
      tint: { DEFAULT: "#E6ECFD", border: "#C8D6FA", text: "#1D48C7" },
      success: { DEFAULT: "#DCF3E6", text: "#0F7A3D" },
      warn: { DEFAULT: "#FCF0DB", text: "#9A6B15" },
      danger: { DEFAULT: "#FBE7E4", text: "#C0392B" },
      subtle: "#F1F4F9",
      hoverrow: { DEFAULT: "#F7F9FE", soft: "#FAFBFE" },
      hint: "#F5F7FC",
      placeholder: "#9AA6C0",
      tertiary: "#8A97B2",
      track: "#DDE3EF",
      frame: { DEFAULT: "#C4CDE0", dashed: "#D6DCEA" },
```

Inside `theme.extend.borderRadius`, add:

```ts
        card: "18px",
        pill: "999px",
```

Inside `theme.extend` (sibling of `colors`), add:

```ts
      boxShadow: {
        float: "0 18px 40px -30px rgba(16,32,63,.25)",
        modal: "0 40px 80px -40px rgba(6,12,28,.6)",
      },
```

- [ ] **Step 6: Verify**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: all pass (no test asserts the old palette; if one fails on a color/font assertion, fix that assertion to the new token — do not revert the token).

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/globals.css tailwind.config.ts
git commit -m "feat(design): swap global tokens to handoff palette + IBM Plex/Schibsted fonts"
```

---

### Task 2: Brand — mark, wordmark, favicon

**Files:**
- Create: `components/brand/Mark.tsx`
- Modify: `components/brand/Logo.tsx`
- Delete: `components/brand/GlobeMark.tsx`
- Modify: `app/icon.svg` (overwrite)
- Modify: `lib/email.ts` (brand casing only)
- Test: `components/brand/__tests__/Logo.test.tsx` (modify), `components/landing/__tests__/LandingNav.test.tsx` (assertion update if it names the logo)

**Interfaces:**
- Produces: `Mark({ variant?: 'light' | 'dark', className?: string })` — the two-circle brand mark; `dark` = white + `#3B6EF6` circles for the navy rail. `Logo({ className?, href? })` keeps its existing signature; accessible name becomes **"Eazyexchange home"**, wordmark text **"Eazyexchange"**.

- [ ] **Step 1: Update the Logo tests to the new brand (failing first)**

Replace the two content assertions in `components/brand/__tests__/Logo.test.tsx`:

```tsx
  it('links home with an accessible name by default', () => {
    render(<Logo />)
    const link = screen.getByRole('link', { name: 'Eazyexchange home' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows the wordmark text', () => {
    render(<Logo />)
    expect(screen.getByText('Eazyexchange')).toBeInTheDocument()
  })
```

(Keep the `href={null}` test as is.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test Logo`
Expected: FAIL — "Eazyexchange home" not found, "Eazyexchange" not found.

- [ ] **Step 3: Create `components/brand/Mark.tsx`**

Two overlapping circles per the handoff (`Eazyexchange Logo.dc.html`): navy top-left + blue bottom-right, blue multiplies over navy in the light variant; the dark (rail) variant is plain white + `#3B6EF6`, no blend. `isolation: 'isolate'` keeps the multiply from blending with the page background.

```tsx
export function Mark({
  variant = 'light',
  className,
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  const top = variant === 'dark' ? '#FFFFFF' : '#10203F'
  const bottom = variant === 'dark' ? '#3B6EF6' : '#2456E6'
  return (
    <svg
      viewBox="0 0 26 19"
      className={className}
      aria-hidden="true"
      style={{ isolation: 'isolate' }}
    >
      <circle cx="7.5" cy="7.5" r="7.5" fill={top} />
      <circle
        cx="18.5"
        cy="11.5"
        r="7.5"
        fill={bottom}
        style={variant === 'light' ? { mixBlendMode: 'multiply' } : undefined}
      />
    </svg>
  )
}
```

- [ ] **Step 4: Rewrite `components/brand/Logo.tsx`**

```tsx
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Mark } from './Mark'

export function Logo({
  className,
  href = '/',
}: {
  className?: string
  href?: string | null
}) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark className="h-5 w-7 shrink-0" />
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        Eazyexchange
      </span>
    </span>
  )
  if (href === null) return mark
  return (
    <Link href={href} aria-label="Eazyexchange home" className="inline-flex items-center">
      {mark}
    </Link>
  )
}
```

- [ ] **Step 5: Delete GlobeMark and fix stragglers**

```bash
git rm components/brand/GlobeMark.tsx
grep -rn "GlobeMark" app components lib
```

Expected: no matches (only `Logo.tsx` imported it). If `components/landing/__tests__/LandingNav.test.tsx` (or any other test) asserts the accessible name `EazyExchange home` or the split `Eazy`/`Exchange` wordmark, update those assertions to `Eazyexchange home` / `Eazyexchange`. Do NOT change landing copy strings in `lib/landing/content.ts` (phase 8).

- [ ] **Step 6: Overwrite `app/icon.svg` with the handoff favicon**

Navy rounded square, white + blue circles (favicon variant from `Eazyexchange Logo.dc.html`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#10203F"/>
  <circle cx="25" cy="25" r="13" fill="#FFFFFF"/>
  <circle cx="39" cy="39" r="13" fill="#3B6EF6"/>
</svg>
```

- [ ] **Step 7: Fix brand casing in `lib/email.ts`**

Change the two strings: default `FROM` fallback `'EazyExchange <onboarding@resend.dev>'` → `'Eazyexchange <onboarding@resend.dev>'`, and `ORG_FOOTER` `…on EazyExchange.` → `…on Eazyexchange.`. Run `pnpm test email` after — if an assertion checks the casing, update it.

- [ ] **Step 8: Run all tests, verify pass**

Run: `pnpm test && pnpm lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A components/brand app/icon.svg lib/email.ts components/landing/__tests__
git commit -m "feat(brand): two-circle mark, Eazyexchange wordmark, new favicon"
```

---

### Task 3: Active-exchange session — lib + cookie server action

**Files:**
- Create: `lib/exchange-session.ts`
- Create: `lib/__tests__/exchange-session.test.ts`
- Create: `actions/session.ts`
- Create: `actions/__tests__/session.test.ts`

**Interfaces:**
- Produces:
  - `ACTIVE_EXCHANGE_COOKIE = 'ee_active_exchange'` (const string)
  - `resolveActiveExchange<T extends { id: string }>(exchanges: T[], cookieValue: string | undefined): T | null` — `exchanges` MUST already be ordered most-recent-first (the layout query orders `created_at desc`); returns the cookie match, else the first element, else `null`.
  - `setActiveExchange(exchangeId: string): Promise<void>` — server action, sets the cookie (path `/`, httpOnly, sameSite lax, 1 year). It does NOT validate ownership — the layout validates on read by only matching the cookie against the school's own exchanges.

- [ ] **Step 1: Write failing tests `lib/__tests__/exchange-session.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

const exchanges = [
  { id: 'b', name: 'Espagne 2027' },
  { id: 'a', name: 'France–Canada 2026' },
]

describe('resolveActiveExchange', () => {
  it('returns the exchange matching the cookie', () => {
    expect(resolveActiveExchange(exchanges, 'a')?.id).toBe('a')
  })
  it('falls back to the most recent (first) exchange on a stale cookie', () => {
    expect(resolveActiveExchange(exchanges, 'deleted-id')?.id).toBe('b')
  })
  it('falls back to the most recent exchange when no cookie', () => {
    expect(resolveActiveExchange(exchanges, undefined)?.id).toBe('b')
  })
  it('returns null when there are no exchanges', () => {
    expect(resolveActiveExchange([], 'a')).toBeNull()
  })
  it('exports the cookie name', () => {
    expect(ACTIVE_EXCHANGE_COOKIE).toBe('ee_active_exchange')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test exchange-session`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/exchange-session.ts`**

```ts
export const ACTIVE_EXCHANGE_COOKIE = 'ee_active_exchange'

// `exchanges` must be ordered most-recent-first (created_at desc).
export function resolveActiveExchange<T extends { id: string }>(
  exchanges: T[],
  cookieValue: string | undefined
): T | null {
  if (exchanges.length === 0) return null
  return exchanges.find((e) => e.id === cookieValue) ?? exchanges[0]
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test exchange-session`
Expected: PASS (5 tests).

- [ ] **Step 5: Write failing test `actions/__tests__/session.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))

import { setActiveExchange } from '@/actions/session'

describe('setActiveExchange', () => {
  beforeEach(() => set.mockClear())

  it('sets the active-exchange cookie with safe attributes', async () => {
    await setActiveExchange('ex-123')
    expect(set).toHaveBeenCalledWith(
      'ee_active_exchange',
      'ex-123',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
    )
  })
})
```

- [ ] **Step 6: Run to verify fail**

Run: `pnpm test actions/__tests__/session`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `actions/session.ts`**

```ts
'use server'
import { cookies } from 'next/headers'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

export async function setActiveExchange(exchangeId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, exchangeId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
}
```

- [ ] **Step 8: Run to verify pass, then commit**

Run: `pnpm test exchange-session session`
Expected: PASS.

```bash
git add lib/exchange-session.ts lib/__tests__/exchange-session.test.ts actions/session.ts actions/__tests__/session.test.ts
git commit -m "feat(shell): active-exchange resolution + cookie server action"
```

---

### Task 4: Shell components — Rail, TopBar, SessionSelector

**Files:**
- Create: `components/shell/OrganizerShell.tsx`
- Create: `components/shell/RailIcons.tsx`
- Create: `components/shell/SessionSelector.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`

**Interfaces:**
- Consumes: `setActiveExchange` from `actions/session.ts` (Task 3); Tailwind tokens from Task 1; `Mark` from Task 2.
- Produces:
  ```ts
  export type ExchangeOption = { id: string; name: string; year: number }
  // components/shell/OrganizerShell.tsx ('use client')
  export function OrganizerShell(props: {
    exchanges: ExchangeOption[]
    activeExchangeId: string | null
    organizerName: string
    needsSchoolName: boolean   // consumed by Task 5's modal; accept + ignore it in this task
    children: React.ReactNode
  }): JSX.Element
  ```
  Internal callback contract for Task 5: `OrganizerShell` owns `const [newExchangeOpen, setNewExchangeOpen] = useState(false)` and passes `onNewExchange={() => setNewExchangeOpen(true)}` to `SessionSelector` and the zero-state button. Task 5 renders the modal from that same state.
- `SessionSelector` props: `{ exchanges: ExchangeOption[]; active: ExchangeOption; onNewExchange: () => void }`.

**Design values** (from `Eazyexchange Dashboard.dc.html`; use Tailwind tokens/arbitrary values):

- Shell: `flex h-screen overflow-hidden bg-background`; rail `w-[82px] flex-none bg-rail flex flex-col items-center py-[18px]`; right column `flex-1 flex flex-col min-w-0`; content `flex-1 overflow-auto px-7 pt-[26px] pb-10` wrapping `{children}` in `<div className="mx-auto max-w-6xl">` (transition aid for old pages; the dashboard phase removes it).
- Rail: `Mark variant="dark"` 26×19 top, margin-bottom 26px. Nav items: column `gap-1.5`; each item 62px wide, `rounded-[11px]`, `py-[9px]`, column layout `items-center gap-1.5`, label `font-mono text-[9px] font-medium`; inactive `text-rail-inactive hover:text-white hover:bg-white/5`, active `text-white bg-white/10`. Avatar pinned bottom via `mt-auto`: 36px circle `bg-white/10 text-white font-mono text-[11px]` with initials.
- Icons (`RailIcons.tsx`, faithful div/CSS recreations from the handoff):
  - `IconOverview` (Aperçu): 2×2 grid of 6px squares, `gap-[3px]`, each `bg-current rounded-[1.5px]`.
  - `IconExchanges` (Échanges): relative 20×12 box; two 12px circles `border-[1.5px] border-current rounded-full`, one left, one right with `bg-rail` overlapping.
  - `IconApplications` (Candid.): 14×17 box `border-[1.5px] border-current rounded-[2px]` containing two 1.5px horizontal `bg-current` lines (second at 70% width).
- Top bar: `h-[66px] flex-none bg-card border-b flex items-center justify-between px-7 gap-5`. Left: SessionSelector + year pill (`rounded-pill bg-tint text-tint-text font-mono text-[11px] font-semibold px-3 py-1`). Right: primary button `h-[38px] px-4 rounded-[9px] bg-brand hover:bg-brand-hover text-white text-[13px] font-semibold` with leading `+`.
- SessionSelector trigger: exchange name `font-display text-base font-semibold text-navy` + `▾` `text-placeholder text-xs`; panel: absolute, `bg-card rounded-[14px] border shadow-float p-2 min-w-[260px]`, one row per exchange (`name` + muted `year`, hover `bg-hoverrow`), divider, « + Nouvel échange » row in `text-brand font-semibold`.

**Behavior:**

- Active rail item from `usePathname()`: Aperçu ⇔ `pathname === '/dashboard'`; Candid. ⇔ `pathname.includes('/applications')`; Échanges ⇔ `pathname.startsWith('/exchanges/') && !pathname.includes('/applications')`.
- Rail items: Aperçu → `/dashboard` always shown. Échanges → `/exchanges/${activeExchangeId}` and Candid. → `/exchanges/${activeExchangeId}/applications` only rendered when `activeExchangeId` is non-null. **No other rail items in this phase** (Formul./Docs/Élèves/Réglages come later).
- Rail labels verbatim: `Aperçu`, `Échanges`, `Candid.`
- Avatar initials: first letter of the first two words of `organizerName`, uppercased (`'Marie Bernard' → 'MB'`; single word → first letter). Clicking toggles a small menu (`useState`, absolute-positioned card above the avatar) with one item « Se déconnecter » that runs the existing sign-out logic (from the old `OrganizerNav`): `supabase.auth.signOut()` then `router.push('/login')`, `router.refresh()`.
- SessionSelector select: `await setActiveExchange(id)`; close panel; then `pathname === '/dashboard' ? router.refresh() : router.push('/dashboard')`.
- Zero exchanges (`exchanges.length === 0`): left side of top bar shows only a primary button « + Nouvel échange » (calls `onNewExchange`) instead of selector + pill; no selector rendered.
- Top-bar right button: `<Link href={`/exchanges/${activeExchangeId}#invite`}>` labeled « + Inviter des élèves », only when `activeExchangeId` non-null.

- [ ] **Step 1: Write failing tests `components/shell/__tests__/OrganizerShell.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026 }]

describe('OrganizerShell', () => {
  it('renders the French rail items when an exchange is active', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
    expect(screen.getByText('Candid.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Inviter des élèves/ })).toHaveAttribute(
      'href',
      '/exchanges/ex1#invite'
    )
  })

  it('hides exchange-scoped items and offers creation when no exchanges exist', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('Échanges')).toBeNull()
    expect(screen.queryByText('Candid.')).toBeNull()
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
  })

  it('shows organizer initials and the session name', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test OrganizerShell`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/shell/RailIcons.tsx`**

```tsx
export function IconOverview() {
  return (
    <div className="grid grid-cols-[6px_6px] grid-rows-[6px_6px] gap-[3px]">
      <div className="rounded-[1.5px] bg-current" />
      <div className="rounded-[1.5px] bg-current" />
      <div className="rounded-[1.5px] bg-current" />
      <div className="rounded-[1.5px] bg-current" />
    </div>
  )
}

export function IconExchanges() {
  return (
    <div className="relative h-3 w-5">
      <div className="absolute left-0 top-0 h-3 w-3 rounded-full border-[1.5px] border-current" />
      <div className="absolute right-0 top-0 h-3 w-3 rounded-full border-[1.5px] border-current bg-rail" />
    </div>
  )
}

export function IconApplications() {
  return (
    <div className="flex h-[17px] w-[14px] flex-col justify-center gap-[2px] rounded-[2px] border-[1.5px] border-current px-[3px]">
      <div className="h-[1.5px] bg-current" />
      <div className="h-[1.5px] w-[70%] bg-current" />
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/shell/SessionSelector.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setActiveExchange } from '@/actions/session'
import type { ExchangeOption } from './OrganizerShell'
import { cn } from '@/lib/utils'

export function SessionSelector({
  exchanges,
  active,
  onNewExchange,
}: {
  exchanges: ExchangeOption[]
  active: ExchangeOption
  onNewExchange: () => void
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  async function select(id: string) {
    setOpen(false)
    if (id !== active.id) {
      await setActiveExchange(id)
      if (pathname === '/dashboard') router.refresh()
      else router.push('/dashboard')
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2"
        aria-expanded={open}
      >
        <span className="font-display text-base font-semibold text-navy">{active.name}</span>
        <span className="text-xs text-placeholder">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-[260px] rounded-[14px] border bg-card p-2 shadow-float">
          {exchanges.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => select(ex.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-sm hover:bg-hoverrow',
                ex.id === active.id && 'bg-subtle font-semibold'
              )}
            >
              <span>{ex.name}</span>
              <span className="text-muted-foreground">{ex.year}</span>
            </button>
          ))}
          <div className="my-1 border-t" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewExchange()
            }}
            className="w-full rounded-[9px] px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-hoverrow"
          >
            + Nouvel échange
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement `components/shell/OrganizerShell.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Mark } from '@/components/brand/Mark'
import { IconOverview, IconExchanges, IconApplications } from './RailIcons'
import { SessionSelector } from './SessionSelector'

export type ExchangeOption = { id: string; name: string; year: number }

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function RailItem({
  href,
  label,
  active,
  children,
}: {
  href: string
  label: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex w-[62px] flex-col items-center gap-1.5 rounded-[11px] py-[9px] font-mono text-[9px] font-medium',
        active ? 'bg-white/10 text-white' : 'text-rail-inactive hover:bg-white/5 hover:text-white'
      )}
    >
      {children}
      <span>{label}</span>
    </Link>
  )
}

export function OrganizerShell({
  exchanges,
  activeExchangeId,
  organizerName,
  needsSchoolName,
  children,
}: {
  exchanges: ExchangeOption[]
  activeExchangeId: string | null
  organizerName: string
  needsSchoolName: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newExchangeOpen, setNewExchangeOpen] = useState(false)
  const active = exchanges.find((e) => e.id === activeExchangeId) ?? null

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav className="flex w-[82px] flex-none flex-col items-center bg-rail py-[18px]">
        <div className="mb-[26px]">
          <Mark variant="dark" className="h-[19px] w-[26px]" />
        </div>
        <div className="flex w-full flex-col items-center gap-1.5">
          <RailItem href="/dashboard" label="Aperçu" active={pathname === '/dashboard'}>
            <IconOverview />
          </RailItem>
          {activeExchangeId && (
            <>
              <RailItem
                href={`/exchanges/${activeExchangeId}`}
                label="Échanges"
                active={pathname.startsWith('/exchanges/') && !pathname.includes('/applications')}
              >
                <IconExchanges />
              </RailItem>
              <RailItem
                href={`/exchanges/${activeExchangeId}/applications`}
                label="Candid."
                active={pathname.includes('/applications')}
              >
                <IconApplications />
              </RailItem>
            </>
          )}
        </div>
        <div className="relative mt-auto">
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-[11px] border bg-card p-1 shadow-float">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                Se déconnecter
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Compte"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 font-mono text-[11px] text-white"
          >
            {initials(organizerName)}
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[66px] flex-none items-center justify-between gap-5 border-b bg-card px-7">
          <div className="flex items-center gap-3.5">
            {active ? (
              <>
                <SessionSelector
                  exchanges={exchanges}
                  active={active}
                  onNewExchange={() => setNewExchangeOpen(true)}
                />
                <span className="rounded-pill bg-tint px-3 py-1 font-mono text-[11px] font-semibold text-tint-text">
                  {active.year}
                </span>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setNewExchangeOpen(true)}
                className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
              >
                <span className="text-base leading-none">+</span> Nouvel échange
              </button>
            )}
          </div>
          {activeExchangeId && (
            <Link
              href={`/exchanges/${activeExchangeId}#invite`}
              className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
            >
              <span className="text-base leading-none">+</span> Inviter des élèves
            </Link>
          )}
        </header>
        <main className="flex-1 overflow-auto px-7 pb-10 pt-[26px]">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
```

Note: `newExchangeOpen` / `needsSchoolName` are wired to the modal in Task 5 — in this task the state exists but no modal renders yet; that is expected and fine.

- [ ] **Step 6: Run to verify pass**

Run: `pnpm test OrganizerShell`
Expected: PASS (3 tests).

- [ ] **Step 7: Lint, typecheck, commit**

```bash
pnpm lint && npx tsc --noEmit
git add components/shell
git commit -m "feat(shell): organizer rail, top bar, session selector"
```

---

### Task 5: New-exchange modal, French action errors, `/exchanges/new` redirect

**Files:**
- Create: `components/shell/NewExchangeModal.tsx`
- Test: `components/shell/__tests__/NewExchangeModal.test.tsx`
- Modify: `components/shell/OrganizerShell.tsx` (render modal + `?new-exchange=1` auto-open)
- Modify: `actions/exchanges.ts` (`createExchange`: French errors, return id, set active cookie)
- Modify: `actions/__tests__/create-exchange.test.ts` (assertions + `next/headers` mock)
- Modify: `app/(organizer)/exchanges/new/page.tsx` (replace with redirect)
- Modify: `app/(organizer)/dashboard/page.tsx` (CTA href only)
- Delete: `components/NewExchangeForm.tsx`

**Interfaces:**
- Consumes: `OrganizerShell`'s `newExchangeOpen` state (Task 4); `createExchange` from `actions/exchanges.ts`; shadcn `Dialog` from `components/ui/dialog.tsx`.
- Produces: `NewExchangeModal({ open, onOpenChange, needsSchoolName }: { open: boolean; onOpenChange: (o: boolean) => void; needsSchoolName: boolean })`. `createExchange(formData)` now returns `Promise<void>` still, but sets the `ee_active_exchange` cookie to the created exchange and throws **French** error messages (exact strings below).

**Modal copy (verbatim, handoff screen 1g):** title « Nouvel échange »; subline « Un échange relie votre établissement à un partenaire, pour une session donnée. »; labels « Nom de l'échange » (placeholder `France–Canada 2026`), « Année », « Établissement partenaire » (placeholder `Lycée Victor Hugo`), conditional « Votre établissement »; buttons « Annuler » (ghost) and « Créer l'échange » (primary, busy label « Création… »).

- [ ] **Step 1: Write failing modal tests `components/shell/__tests__/NewExchangeModal.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))

import { NewExchangeModal } from '@/components/shell/NewExchangeModal'

describe('NewExchangeModal', () => {
  it('renders the French form', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName={false} />)
    expect(screen.getByText('Nouvel échange')).toBeInTheDocument()
    expect(screen.getByLabelText("Nom de l'échange")).toBeInTheDocument()
    expect(screen.getByLabelText('Année')).toBeInTheDocument()
    expect(screen.getByLabelText('Établissement partenaire')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).toBeNull()
    expect(screen.getByRole('button', { name: "Créer l'échange" })).toBeInTheDocument()
  })

  it('shows the school-name field when needed', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName />)
    expect(screen.getByLabelText('Votre établissement')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test NewExchangeModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/shell/NewExchangeModal.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExchange } from '@/actions/exchanges'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function NewExchangeModal({
  open,
  onOpenChange,
  needsSchoolName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  needsSchoolName: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createExchange(new FormData(e.currentTarget))
      onOpenChange(false)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
            Nouvel échange
          </DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            Un échange relie votre établissement à un partenaire, pour une session donnée.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom de l&apos;échange</Label>
            <Input id="name" name="name" placeholder="France–Canada 2026" required className="h-12" />
          </div>
          <div className="grid grid-cols-[150px_1fr] gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="year">Année</Label>
              <Input
                id="year"
                name="year"
                type="number"
                defaultValue={new Date().getFullYear()}
                required
                className="h-12"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school_b_name">Établissement partenaire</Label>
              <Input
                id="school_b_name"
                name="school_b_name"
                placeholder="Lycée Victor Hugo"
                required
                className="h-12"
              />
            </div>
          </div>
          {needsSchoolName && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school_a_name">Votre établissement</Label>
              <Input id="school_a_name" name="school_a_name" required className="h-12" />
            </div>
          )}
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
              {loading ? 'Création…' : "Créer l'échange"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test NewExchangeModal`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the modal into `OrganizerShell`**

In `components/shell/OrganizerShell.tsx`:

1. Add imports:

```tsx
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { NewExchangeModal } from './NewExchangeModal'
```

(merge `useEffect` into the existing `useState` import from `react`, and `useSearchParams` into the existing `next/navigation` import).

2. Inside the component, after the existing state, add the auto-open effect:

```tsx
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new-exchange') === '1') {
      setNewExchangeOpen(true)
      router.replace(pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
```

3. Render the modal as the last child of the root `div` (after the right column's closing tag):

```tsx
      <NewExchangeModal
        open={newExchangeOpen}
        onOpenChange={setNewExchangeOpen}
        needsSchoolName={needsSchoolName}
      />
```

- [ ] **Step 6: Update the failing `create-exchange` action tests first**

In `actions/__tests__/create-exchange.test.ts`:
- Add at the top, next to the existing mocks: `vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn() }) }))` — the action will set the active-exchange cookie.
- Change the two limit assertions from `/exchange limit/i` to `/limite d'échanges/i`.
- If other assertions match English validation strings (`/exchange name/i` etc.), update them to the French strings from Step 7.

Run: `pnpm test create-exchange`
Expected: FAIL (action still throws English and doesn't touch cookies — the mock addition is inert until Step 7, but the string assertions fail).

- [ ] **Step 7: Update `createExchange` in `actions/exchanges.ts`**

1. Add imports:

```ts
import { cookies } from 'next/headers'
import { ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
```

2. Replace the three user-facing error strings:
- `'Please provide an exchange name, year, and partner school name'` → `"Veuillez renseigner le nom de l'échange, l'année et l'établissement partenaire"`
- `'You have reached your plan’s exchange limit. Subscribe to add more.'` → `"Vous avez atteint la limite d'échanges de votre offre. Abonnez-vous pour en ajouter."`
- `'Please provide your school name'` → `"Veuillez renseigner le nom de votre établissement"`

(Leave `Unauthenticated` / `Unauthorized` / `No profile` — internal guards, not shown in UI.)

3. Make the final insert return the id and set the cookie. Replace the tail of the function:

```ts
  const { data: createdExchange, error } = await supabase
    .from('exchanges')
    .insert({
      name,
      year,
      school_a_id: profile.school_id,
      school_b_id: schoolBId,
      apply_slug: applySlug(name),
    })
    .select('id')
    .single()
  if (error) throw error

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_EXCHANGE_COOKIE, createdExchange.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/dashboard')
```

Note: the tests' supabase mock must now support `.insert().select().single()` on `exchanges` — check the existing mock chain in `create-exchange.test.ts` and extend it to return `{ data: { id: 'new-ex' }, error: null }` if it only mocks `.insert()`.

- [ ] **Step 8: Run to verify pass**

Run: `pnpm test create-exchange exchanges`
Expected: PASS.

- [ ] **Step 9: Replace the `/exchanges/new` page with a redirect and retire `NewExchangeForm`**

Replace the entire content of `app/(organizer)/exchanges/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function NewExchangePage() {
  redirect('/dashboard?new-exchange=1')
}
```

In `app/(organizer)/dashboard/page.tsx` line 34, change the CTA href (label stays English until the dashboard phase):

```tsx
          <Button asChild><Link href="/dashboard?new-exchange=1">New exchange</Link></Button>
```

Then:

```bash
git rm components/NewExchangeForm.tsx
grep -rn "NewExchangeForm" app components lib
```

Expected: no matches.

- [ ] **Step 10: Full verify + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add -A app/\(organizer\)/exchanges/new app/\(organizer\)/dashboard components/shell actions
git commit -m "feat(shell): new-exchange modal replaces /exchanges/new; French createExchange errors"
```

---

### Task 6: Wire the shell into the organizer layout + cleanup

**Files:**
- Modify: `app/(organizer)/layout.tsx`
- Modify: `app/(organizer)/exchanges/[id]/page.tsx` (add `id="invite"` anchor)
- Delete: `components/OrganizerNav.tsx`
- Test: existing suite (no test currently imports `OrganizerNav` — verify with grep)

**Interfaces:**
- Consumes: `OrganizerShell`, `ExchangeOption` (Task 4); `resolveActiveExchange`, `ACTIVE_EXCHANGE_COOKIE` (Task 3); existing `isInGrace`, `PaymentWarningBanner`.

- [ ] **Step 1: Rewrite `app/(organizer)/layout.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isInGrace } from '@/lib/billing/limits'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'
import { OrganizerShell, type ExchangeOption } from '@/components/shell/OrganizerShell'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name, school_id, schools(name, subscription_status, plan, grace_until)')
    .eq('id', user.id)
    .single<{
      role: string
      full_name: string
      school_id: string
      schools: {
        name: string
        subscription_status: string | null
        plan: string | null
        grace_until: string | null
      } | null
    }>()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false

  const { data: exchangeRows } = await supabase
    .from('exchanges')
    .select('id, name, year')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })
  const exchanges: ExchangeOption[] = exchangeRows ?? []

  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)

  return (
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId={active?.id ?? null}
      organizerName={profile.full_name}
      needsSchoolName={school?.name === ''}
    >
      {showGrace && <PaymentWarningBanner />}
      {children}
    </OrganizerShell>
  )
}
```

- [ ] **Step 2: Delete `OrganizerNav`**

```bash
git rm components/OrganizerNav.tsx
grep -rn "OrganizerNav" app components lib
```

Expected: no matches.

- [ ] **Step 3: Add the invite anchor**

In `app/(organizer)/exchanges/[id]/page.tsx`, find the students/invite section (the block containing "No students invited yet.", around line 57) and add `id="invite"` to its outermost `Card`/`section` element:

```tsx
<Card id="invite">
```

(adjust to whatever the actual wrapper element is — the goal is that `/exchanges/[id]#invite` scrolls to the invite UI).

- [ ] **Step 4: Full verification**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 5: Drive the app and look at it**

Use the project's dev server (`pnpm dev`) and verify with a real browser session (Chrome DevTools MCP per the WSL2 memory, or ask the user to check):
- `/dashboard` renders inside the navy rail + top bar; rail shows Aperçu/Échanges/Candid. in French; existing English page content displays inside.
- Session selector lists exchanges; switching sets the cookie and returns to `/dashboard`.
- « + Nouvel échange » from the selector opens the modal; creating an exchange lands on `/dashboard` with the new exchange active.
- `/exchanges/new` redirects to the dashboard with the modal open.
- Zero-exchange account (if available): top bar shows « + Nouvel échange », rail shows only Aperçu.
- Fonts/palette: headings in Schibsted Grotesk, blue primary buttons, `#EEF1F7` canvas everywhere (auth pages, student space).

- [ ] **Step 6: Commit**

```bash
git add app/\(organizer\) 
git commit -m "feat(shell): organizer layout renders the designed rail shell"
```

---

### Task 7: Finish the branch

- [ ] **Step 1: Re-run full verification** (`pnpm lint && pnpm test && npx tsc --noEmit`) — evidence before claiming done.
- [ ] **Step 2:** Use superpowers:finishing-a-development-branch — present merge/PR options to the user. **Do not merge or push to `main` without explicit user confirmation** (deploys to production).

---

## Self-review notes (already applied)

- Spec coverage: fonts ✓ (T1), colors/radii/shadows ✓ (T1), logo/favicon/wordmark ✓ (T2), email casing ✓ (T2), cookie + resolution ✓ (T3), rail/top bar/selector/zero-state ✓ (T4), modal + redirect + billing-gate error path ✓ (T5 — the gate surfaces as the French limit error inside the modal), layout wiring + OrganizerNav removal + invite anchor ✓ (T6), verification/rollout ✓ (T6–T7).
- Deliberately deferred per spec: top-bar search, Formul./Docs/Élèves/Réglages rail items, page content translation, system states, landing.
- Type consistency: `ExchangeOption { id, name, year }` used in T3 (generic `{ id }` superset), T4 (definition), T6 (consumer); cookie name via `ACTIVE_EXCHANGE_COOKIE` everywhere; `needsSchoolName` prop flows layout → shell → modal.
