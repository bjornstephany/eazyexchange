# EazyExchange Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auth-gated root (`/`) with a public marketing landing page that pitches EazyExchange and routes visitors to signup/login, structured so a later frontend agent can restyle and edit copy with minimal friction.

**Architecture:** All copy/data lives in one typed file (`lib/landing/content.ts`). Each page section is a small, presentational, server component under `components/landing/` that imports `landingContent` directly. `app/page.tsx` redirects logged-in users by role and renders the composed landing page for everyone else. `middleware.ts` is amended to treat `/` as a public route so logged-out visitors aren't bounced to `/login`.

**Tech Stack:** Next.js 14 (App Router, RSC), TypeScript, Tailwind, shadcn/ui (`Button`, `Card`, `Badge`), `lucide-react`, Vitest + Testing Library.

## Global Constraints

- Package manager is **pnpm** (not npm). Verify with `pnpm lint` and `pnpm test`.
- No new dependencies. Use only what's already in `package.json`.
- Styling uses **only** existing shadcn tokens/primitives — no raw hex values, no new global CSS. Neutral grayscale as currently themed.
- All user-facing copy lives in `lib/landing/content.ts`, never hardcoded in component JSX.
- Section components are server components (no `'use client'`), presentational, and read from `landingContent`.
- CTA destinations are exact: **Get started → `/signup`**, **Log in → `/login`**. (`/signup` does not exist yet and will 404 until a later sub-project; this is intentional.)
- Path alias `@/` maps to repo root (see `vitest.config.ts` / `tsconfig.json`).
- Test files live in a `__tests__/` directory beside the code, matching existing convention (e.g. `lib/__tests__/`, `actions/__tests__/`).

---

## File Structure

- Create: `lib/landing/content.ts` — typed copy/data for every section.
- Create: `components/landing/LandingNav.tsx` — top bar (brand + Log in / Get started).
- Create: `components/landing/Hero.tsx` — headline, subhead, two CTAs.
- Create: `components/landing/ProblemSolution.tsx` — pain → solution.
- Create: `components/landing/Features.tsx` — feature grid (icon + title + blurb).
- Create: `components/landing/HowItWorks.tsx` — numbered steps.
- Create: `components/landing/Pricing.tsx` — tiered pricing grid.
- Create: `components/landing/LandingFooter.tsx` — minimal footer.
- Modify: `app/page.tsx` — auth redirect + compose sections.
- Modify: `middleware.ts:16-19` — add `/` to public allowlist.
- Create: tests under `lib/landing/__tests__/`, `components/landing/__tests__/`, `app/__tests__/`.

---

## Task 1: Content data file

**Files:**
- Create: `lib/landing/content.ts`
- Test: `lib/landing/__tests__/content.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface CtaLink { label: string; href: string }`
  - `interface FeatureItem { icon: LucideIcon; title: string; description: string }`
  - `interface HowItWorksStep { number: number; title: string; description: string }`
  - `interface PricingTier { name: string; price: string; period: string; description: string; features: string[]; cta: CtaLink; highlighted: boolean }`
  - `interface LandingContent { nav: {...}; hero: {...}; problemSolution: {...}; features: {...}; howItWorks: {...}; pricing: {...}; footer: {...} }` (full shape below)
  - `export const landingContent: LandingContent` — the single data source every section imports.

- [ ] **Step 1: Write the failing test**

```ts
// lib/landing/__tests__/content.test.ts
import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'

describe('landingContent', () => {
  it('routes the primary CTAs to /signup and /login', () => {
    expect(landingContent.hero.primaryCta.href).toBe('/signup')
    expect(landingContent.hero.secondaryCta.href).toBe('/login')
    expect(landingContent.nav.getStarted.href).toBe('/signup')
    expect(landingContent.nav.login.href).toBe('/login')
  })

  it('every pricing tier has a /signup CTA and at least one feature', () => {
    expect(landingContent.pricing.tiers.length).toBeGreaterThanOrEqual(2)
    for (const tier of landingContent.pricing.tiers) {
      expect(tier.cta.href).toBe('/signup')
      expect(tier.features.length).toBeGreaterThan(0)
    }
  })

  it('exposes feature and step lists for rendering', () => {
    expect(landingContent.features.items.length).toBeGreaterThan(0)
    expect(landingContent.howItWorks.steps.length).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/landing/__tests__/content.test.ts`
Expected: FAIL — cannot resolve `@/lib/landing/content`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/landing/content.ts
import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  LayoutDashboard,
  BellRing,
  FileUp,
  CheckCircle2,
} from 'lucide-react'

export interface CtaLink {
  label: string
  href: string
}

export interface FeatureItem {
  icon: LucideIcon
  title: string
  description: string
}

export interface HowItWorksStep {
  number: number
  title: string
  description: string
}

export interface PricingTier {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: CtaLink
  highlighted: boolean
}

export interface LandingContent {
  nav: {
    brand: string
    login: CtaLink
    getStarted: CtaLink
  }
  hero: {
    headline: string
    subhead: string
    primaryCta: CtaLink
    secondaryCta: CtaLink
  }
  problemSolution: {
    problemTitle: string
    problemBody: string
    solutionTitle: string
    solutionBody: string
  }
  features: {
    title: string
    subtitle: string
    items: FeatureItem[]
  }
  howItWorks: {
    title: string
    subtitle: string
    steps: HowItWorksStep[]
  }
  pricing: {
    title: string
    subtitle: string
    // TIERS ARE PLACEHOLDERS — edit names/prices/features freely.
    tiers: PricingTier[]
    note: string
  }
  footer: {
    brand: string
    tagline: string
    links: CtaLink[]
    copyright: string
  }
}

const SIGNUP: CtaLink = { label: 'Get started', href: '/signup' }
const LOGIN: CtaLink = { label: 'Log in', href: '/login' }

export const landingContent: LandingContent = {
  nav: {
    brand: 'EazyExchange',
    login: LOGIN,
    getStarted: SIGNUP,
  },
  hero: {
    headline: 'Collect every exchange form, without the chasing.',
    subhead:
      'EazyExchange gives each student a clear checklist of forms and documents to complete — and gives you one dashboard to see who is done and who needs a nudge.',
    primaryCta: SIGNUP,
    secondaryCta: LOGIN,
  },
  problemSolution: {
    problemTitle: 'Chasing paperwork shouldn’t be your job',
    problemBody:
      'Before every trip, organizers lose hours emailing students and parents for the same forms, re-sending deadlines, and hunting through inboxes to figure out what’s still missing.',
    solutionTitle: 'A single place to collect it all',
    solutionBody:
      'Students get a personal checklist with deadlines and automatic reminders. You get a live completion dashboard — so you always know exactly where things stand.',
  },
  features: {
    title: 'Everything you need to run forms collection',
    subtitle: 'Built for exchange organizers, not paperwork.',
    items: [
      {
        icon: ClipboardList,
        title: 'Per-student checklists',
        description:
          'Each student sees exactly which forms and documents they owe, with clear deadlines.',
      },
      {
        icon: LayoutDashboard,
        title: 'Master dashboard',
        description:
          'Track completion across every student at a glance — drafts, submitted, approved.',
      },
      {
        icon: BellRing,
        title: 'Automated reminders',
        description:
          'Paced email reminders ramp up as deadlines approach, so you don’t have to nag.',
      },
      {
        icon: FileUp,
        title: 'Document collection',
        description:
          'Named upload slots make sure you get the right file for every requirement.',
      },
      {
        icon: CheckCircle2,
        title: 'Review & approve',
        description:
          'Approve good submissions or reject with a reason — students are notified instantly.',
      },
    ],
  },
  howItWorks: {
    title: 'How it works',
    subtitle: 'Set up in minutes and let the reminders do the rest.',
    steps: [
      {
        number: 1,
        title: 'Create your exchange',
        description: 'Name your program and link the two participating schools.',
      },
      {
        number: 2,
        title: 'Build your forms',
        description: 'Add data-entry forms and document-upload requirements from templates.',
      },
      {
        number: 3,
        title: 'Invite students',
        description: 'Invite students and parents by email — they get their checklist instantly.',
      },
      {
        number: 4,
        title: 'Track completion',
        description: 'Watch the dashboard fill in while automated reminders chase stragglers.',
      },
    ],
  },
  pricing: {
    title: 'Simple pricing',
    subtitle: 'Start free. Upgrade when your program grows.',
    note: 'Prices shown are placeholders — final pricing to be confirmed.',
    tiers: [
      {
        name: 'Free',
        price: '$0',
        period: '/ exchange',
        description: 'Everything you need to run a single small exchange.',
        features: [
          'Up to 25 students',
          '1 active exchange',
          'Form templates & document slots',
          'Automated reminders',
        ],
        cta: SIGNUP,
        highlighted: false,
      },
      {
        name: 'Pro',
        price: '$49',
        period: '/ month',
        description: 'For organizers running larger or multiple programs.',
        features: [
          'Unlimited students',
          'Multiple active exchanges',
          'Priority email support',
          'Everything in Free',
        ],
        cta: SIGNUP,
        highlighted: true,
      },
    ],
  },
  footer: {
    brand: 'EazyExchange',
    tagline: 'Form and document collection for student exchange organizers.',
    links: [LOGIN, SIGNUP],
    copyright: `© ${new Date().getFullYear()} EazyExchange. All rights reserved.`,
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/landing/__tests__/content.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/landing/content.ts lib/landing/__tests__/content.test.ts
git commit -m "feat(landing): typed content data source for landing page"
```

---

## Task 2: LandingNav component

**Files:**
- Create: `components/landing/LandingNav.tsx`
- Test: `components/landing/__tests__/LandingNav.test.tsx`

**Interfaces:**
- Consumes: `landingContent.nav` from Task 1.
- Produces: `export function LandingNav(): JSX.Element` (default-importable too — use a named export).

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/LandingNav.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingNav } from '@/components/landing/LandingNav'

describe('LandingNav', () => {
  it('shows the brand and links log in / get started correctly', () => {
    render(<LandingNav />)
    expect(screen.getByText('EazyExchange')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/LandingNav.test.tsx`
Expected: FAIL — cannot resolve `@/components/landing/LandingNav`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/LandingNav.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { landingContent } from '@/lib/landing/content'

export function LandingNav() {
  const { brand, login, getStarted } = landingContent.nav
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          {brand}
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={login.href}>{login.label}</Link>
          </Button>
          <Button asChild>
            <Link href={getStarted.href}>{getStarted.label}</Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/LandingNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/__tests__/LandingNav.test.tsx
git commit -m "feat(landing): nav bar component"
```

---

## Task 3: Hero component

**Files:**
- Create: `components/landing/Hero.tsx`
- Test: `components/landing/__tests__/Hero.test.tsx`

**Interfaces:**
- Consumes: `landingContent.hero` from Task 1.
- Produces: `export function Hero(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/Hero.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/landing/Hero'
import { landingContent } from '@/lib/landing/content'

describe('Hero', () => {
  it('renders the headline and both CTAs with correct hrefs', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { name: landingContent.hero.headline })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/Hero.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/Hero.tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { landingContent } from '@/lib/landing/content'

export function Hero() {
  const { headline, subhead, primaryCta, secondaryCta } = landingContent.hero
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        {headline}
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
        {subhead}
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href={primaryCta.href}>{primaryCta.label}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
        </Button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/Hero.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/Hero.tsx components/landing/__tests__/Hero.test.tsx
git commit -m "feat(landing): hero section"
```

---

## Task 4: ProblemSolution component

**Files:**
- Create: `components/landing/ProblemSolution.tsx`
- Test: `components/landing/__tests__/ProblemSolution.test.tsx`

**Interfaces:**
- Consumes: `landingContent.problemSolution` from Task 1.
- Produces: `export function ProblemSolution(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/ProblemSolution.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProblemSolution } from '@/components/landing/ProblemSolution'
import { landingContent } from '@/lib/landing/content'

describe('ProblemSolution', () => {
  it('renders the problem and solution headings', () => {
    render(<ProblemSolution />)
    const { problemTitle, solutionTitle } = landingContent.problemSolution
    expect(screen.getByRole('heading', { name: problemTitle })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: solutionTitle })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/ProblemSolution.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/ProblemSolution.tsx
import { landingContent } from '@/lib/landing/content'

export function ProblemSolution() {
  const { problemTitle, problemBody, solutionTitle, solutionBody } =
    landingContent.problemSolution
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{problemTitle}</h2>
          <p className="mt-4 text-muted-foreground">{problemBody}</p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{solutionTitle}</h2>
          <p className="mt-4 text-muted-foreground">{solutionBody}</p>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/ProblemSolution.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/ProblemSolution.tsx components/landing/__tests__/ProblemSolution.test.tsx
git commit -m "feat(landing): problem/solution section"
```

---

## Task 5: Features component

**Files:**
- Create: `components/landing/Features.tsx`
- Test: `components/landing/__tests__/Features.test.tsx`

**Interfaces:**
- Consumes: `landingContent.features` (with `FeatureItem[]`) from Task 1.
- Produces: `export function Features(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/Features.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Features } from '@/components/landing/Features'
import { landingContent } from '@/lib/landing/content'

describe('Features', () => {
  it('renders a card for every feature item', () => {
    render(<Features />)
    for (const item of landingContent.features.items) {
      expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument()
      expect(screen.getByText(item.description)).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/Features.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/Features.tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { landingContent } from '@/lib/landing/content'

export function Features() {
  const { title, subtitle, items } = landingContent.features
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.title}>
              <CardHeader>
                <Icon className="size-6 text-primary" aria-hidden />
                <CardTitle className="mt-2 text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">{item.description}</CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/Features.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/Features.tsx components/landing/__tests__/Features.test.tsx
git commit -m "feat(landing): features section"
```

---

## Task 6: HowItWorks component

**Files:**
- Create: `components/landing/HowItWorks.tsx`
- Test: `components/landing/__tests__/HowItWorks.test.tsx`

**Interfaces:**
- Consumes: `landingContent.howItWorks` (with `HowItWorksStep[]`) from Task 1.
- Produces: `export function HowItWorks(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/HowItWorks.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { landingContent } from '@/lib/landing/content'

describe('HowItWorks', () => {
  it('renders every step title', () => {
    render(<HowItWorks />)
    for (const step of landingContent.howItWorks.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/HowItWorks.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/HowItWorks.tsx
import { landingContent } from '@/lib/landing/content'

export function HowItWorks() {
  const { title, subtitle, steps } = landingContent.howItWorks
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
        </div>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.number}>
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                {step.number}
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/HowItWorks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/HowItWorks.tsx components/landing/__tests__/HowItWorks.test.tsx
git commit -m "feat(landing): how-it-works section"
```

---

## Task 7: Pricing component

**Files:**
- Create: `components/landing/Pricing.tsx`
- Test: `components/landing/__tests__/Pricing.test.tsx`

**Interfaces:**
- Consumes: `landingContent.pricing` (with `PricingTier[]`) from Task 1.
- Produces: `export function Pricing(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/Pricing.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pricing } from '@/components/landing/Pricing'
import { landingContent } from '@/lib/landing/content'

describe('Pricing', () => {
  it('renders each tier name and a signup CTA per tier', () => {
    render(<Pricing />)
    for (const tier of landingContent.pricing.tiers) {
      expect(screen.getByRole('heading', { name: tier.name })).toBeInTheDocument()
    }
    const ctas = screen.getAllByRole('link', { name: 'Get started' })
    expect(ctas.length).toBe(landingContent.pricing.tiers.length)
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/signup'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/Pricing.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/Pricing.tsx
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { landingContent } from '@/lib/landing/content'

export function Pricing() {
  const { title, subtitle, tiers, note } = landingContent.pricing
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:mx-auto lg:max-w-3xl">
        {tiers.map((tier) => (
          <Card key={tier.name} className={tier.highlighted ? 'border-primary shadow-md' : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{tier.name}</CardTitle>
                {tier.highlighted && <Badge>Popular</Badge>}
              </div>
              <p className="mt-2">
                <span className="text-3xl font-bold">{tier.price}</span>{' '}
                <span className="text-muted-foreground">{tier.period}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant={tier.highlighted ? 'default' : 'outline'}>
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">{note}</p>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/Pricing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/Pricing.tsx components/landing/__tests__/Pricing.test.tsx
git commit -m "feat(landing): pricing section"
```

---

## Task 8: LandingFooter component

**Files:**
- Create: `components/landing/LandingFooter.tsx`
- Test: `components/landing/__tests__/LandingFooter.test.tsx`

**Interfaces:**
- Consumes: `landingContent.footer` from Task 1.
- Produces: `export function LandingFooter(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/LandingFooter.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { landingContent } from '@/lib/landing/content'

describe('LandingFooter', () => {
  it('renders the brand and footer links', () => {
    render(<LandingFooter />)
    expect(screen.getByText(landingContent.footer.copyright)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/landing/__tests__/LandingFooter.test.tsx`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/landing/LandingFooter.tsx
import Link from 'next/link'
import { landingContent } from '@/lib/landing/content'

export function LandingFooter() {
  const { brand, tagline, links, copyright } = landingContent.footer
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{brand}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">{copyright}</p>
    </footer>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/landing/__tests__/LandingFooter.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/landing/LandingFooter.tsx components/landing/__tests__/LandingFooter.test.tsx
git commit -m "feat(landing): footer section"
```

---

## Task 9: Compose the landing page in `app/page.tsx`

Replaces the current redirect-only root. Logged-in users are redirected by role (unchanged behavior); everyone else sees the composed landing page.

**Files:**
- Modify: `app/page.tsx` (currently 12 lines — full replacement below)
- Test: `app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: all section components from Tasks 2–8; `createClient` from `@/lib/supabase/server`.
- Produces: default-exported async `RootPage` server component.

- [ ] **Step 1: Write the failing test**

```tsx
// app/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }))

let user: { id: string } | null
let role: string
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }),
    }),
  }),
}))

import RootPage from '@/app/page'

beforeEach(() => {
  redirect.mockClear()
  user = null
  role = 'organizer'
})

describe('RootPage', () => {
  it('redirects a logged-in organizer to /dashboard', async () => {
    user = { id: 'u1' }
    role = 'organizer'
    await RootPage()
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects a logged-in student to /my-forms', async () => {
    user = { id: 'u2' }
    role = 'student'
    await RootPage()
    expect(redirect).toHaveBeenCalledWith('/my-forms')
  })

  it('renders the landing page (no redirect) for logged-out visitors', async () => {
    user = null
    const result = await RootPage()
    expect(redirect).not.toHaveBeenCalled()
    expect(result).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/__tests__/page.test.tsx`
Expected: FAIL — current `app/page.tsx` redirects logged-out users to `/login`, so the third test fails (redirect called).

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingNav } from '@/components/landing/LandingNav'
import { Hero } from '@/components/landing/Hero'
import { ProblemSolution } from '@/components/landing/ProblemSolution'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Pricing } from '@/components/landing/Pricing'
import { LandingFooter } from '@/components/landing/LandingFooter'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()
    redirect(profile?.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <ProblemSolution />
        <Features />
        <HowItWorks />
        <Pricing />
      </main>
      <LandingFooter />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/__tests__/page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat(landing): render landing page at / for logged-out visitors"
```

---

## Task 10: Open `/` to the public in middleware

Today `middleware.ts` redirects every logged-out visitor (except `/login` and `/accept-invite`) to `/login`. This lets logged-out visitors reach `/`.

**Files:**
- Modify: `middleware.ts:16-19`
- Test: `app/__tests__/middleware.test.ts`

**Interfaces:**
- Consumes: `updateSession` from `@/lib/supabase/middleware` (mocked in test).
- Produces: unchanged `middleware` export; new behavior — `/` is public.

- [ ] **Step 1: Write the failing test**

```ts
// app/__tests__/middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

let user: { id: string } | null
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: async (request: NextRequest) => ({
    supabaseResponse: NextResponse.next({ request }),
    user,
  }),
}))

import { middleware } from '@/middleware'

beforeEach(() => { user = null })

function req(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
}

describe('middleware', () => {
  it('lets a logged-out visitor reach / (no redirect)', async () => {
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('still redirects a logged-out visitor on a gated route to /login', async () => {
    const res = await middleware(req('/dashboard'))
    expect(res.headers.get('location')).toContain('/login')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/__tests__/middleware.test.ts`
Expected: FAIL — first test fails because `/` currently redirects to `/login`.

- [ ] **Step 3: Write minimal implementation**

In `middleware.ts`, change the guard block (currently lines 16-20):

```ts
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/accept-invite')
  const isPublicRoute = pathname === '/'

  if (!user && !isAuthRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```

Leave the rest of the file unchanged. (A logged-in visitor at `/` is not an auth route, so it falls through to `return supabaseResponse`, and `app/page.tsx` performs the role-based redirect.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/__tests__/middleware.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts app/__tests__/middleware.test.ts
git commit -m "feat(landing): make / a public route in middleware"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the new landing tests and the pre-existing suite.

- [ ] **Step 3: Manual smoke check**

Run: `pnpm dev`, then:
- Visit `/` while logged out → landing page renders with all sections.
- Confirm "Get started" links to `/signup` (will 404 — expected until signup sub-project) and "Log in" to `/login`.
- Log in as an organizer → `/` redirects to `/dashboard`; as a student → `/my-forms`.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(landing): verification cleanup" || echo "nothing to commit"
```

---

## Notes / Out of Scope

- **Organizer self-signup (`/signup`)** is a separate sub-project. The CTAs link to `/signup` ahead of its existence — a 404 there is expected for now.
- **CLAUDE.md** still says "invite-only / no self-registration." Update it during the signup sub-project so docs and behavior change together.
- `pnpm build` fails locally because `.env.local` holds placeholders (see project memory); rely on `pnpm lint` + `pnpm test` locally. Build correctness is validated on Vercel deploy.
