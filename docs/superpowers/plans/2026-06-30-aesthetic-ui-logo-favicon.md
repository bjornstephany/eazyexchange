# Aesthetic UI, Logo & Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EazyExchange's stock monochrome shadcn theme, missing logo, and default favicon with a deliberate pastel-green "globe + travel path" brand applied across the whole product.

**Architecture:** Token-first. Fix the broken design-token wiring once (HSL-triplet tokens consumed by `tailwind.config.ts`), introduce brand components (`Logo`, `GlobeMark`) and icon files, extend the `Badge` with status variants, then sweep every screen off hard-coded `slate-*` utilities onto the semantic tokens. Visual sweeps are verified by `pnpm build` + a no-remaining-`slate-*` grep + manual browser spot-check; logic (logo rendering, badge variants) is verified by Vitest.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v3.4, shadcn/ui, Inter (next/font), Vitest + Testing Library, Resend (email HTML).

## Global Constraints

- Package manager is **pnpm** — never npm. (CLAUDE.md)
- Verification gate before any push: `pnpm lint`, `pnpm test`, `pnpm build` all pass. (CLAUDE.md)
- Never log student/parent PII; always escape user content in email HTML. (CLAUDE.md) — this plan does not change escaping; keep `esc()` calls intact.
- Personality: calm & trustworthy. Logo = direction **B** (open line globe + two pins + dotted flight-path arc). Wordmark "**Eazy**Exchange" — "Eazy" in sage, "Exchange" in ink. Typeface stays **Inter**.
- **Brand mark color = pastel Sage 500 `#3FA277`** (and Sage 400 `#7CCBA6` accent). **Primary action/button color = deep Sage `#1F7A57`** (token `--primary`) — deliberately darker than the mark so white button text meets WCAG AA (≈5.3:1). Do not use `#3FA277` for white text.
- Tokens are **HSL channel triplets** (e.g. `157 60% 30%`), because `tailwind.config.ts` wraps them as `hsl(var(--token))`. Never put `oklch(...)` or hex in a token value.
- This is **visual only** — no copy, IA, routing, data, or RLS changes.
- Dark mode is **out of scope** to QA; update the `.dark` token block for completeness but do not build/test a dark theme.

## Color Token Reference (HSL triplets)

Use these exact values wherever tokens are set.

| Token | Triplet | ~Hex | Notes |
|-------|---------|------|-------|
| `--background` | `150 33% 97%` | `#F4FAF7` | mist page bg |
| `--foreground` | `158 30% 17%` | `#1F3A30` | ink (all body text) |
| `--card` / `--popover` | `0 0% 100%` | `#FFFFFF` | |
| `--card-foreground` / `--popover-foreground` | `158 30% 17%` | `#1F3A30` | |
| `--primary` | `157 60% 30%` | `#1F7A57` | deep sage, AA for white text |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--secondary` | `148 45% 94%` | `#EAF7F0` | mint 50 |
| `--secondary-foreground` | `157 60% 26%` | `#1A6A4B` | |
| `--muted` | `148 45% 94%` | `#EAF7F0` | |
| `--muted-foreground` | `153 11% 40%` | `#5C7268` | secondary text |
| `--accent` | `151 52% 91%` | `#DCF3E8` | mint 100 |
| `--accent-foreground` | `157 60% 26%` | `#1A6A4B` | |
| `--destructive` | `11 61% 47%` | `#C0492F` | clay |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--border` / `--input` | `146 23% 93%` | `#E7F1EC` | |
| `--ring` | `154 44% 44%` | `#3FA277` | sage 500 |
| `--radius` | `0.625rem` | — | unchanged |

## slate-* → token migration map (for sweep tasks)

| Hard-coded class | Replace with |
|------------------|--------------|
| `text-slate-900`, `text-slate-700` | `text-foreground` |
| `text-slate-600`, `text-slate-500`, `text-slate-400` | `text-muted-foreground` |
| `text-slate-300` (icons/dividers) | `text-border` |
| `bg-white` (cards/navs) | `bg-card` |
| `bg-slate-50`, `bg-slate-100` | `bg-muted` |
| `hover:bg-slate-50`, `hover:bg-slate-100` | `hover:bg-muted` |
| `border-slate-200`, `border-slate-300`, `border-slate-100` | `border-border` |
| status colors (green/red/amber text+bg on student/submission state) | `<Badge variant="...">` (Task 5) |

## File Structure

- **Create:** `components/brand/GlobeMark.tsx` (the SVG mark), `components/brand/Logo.tsx` (mark + wordmark, optional link), `components/brand/__tests__/Logo.test.tsx`, `app/icon.svg` (static favicon tile), `app/apple-icon.tsx` (180×180 PNG via ImageResponse).
- **Modify:** `app/globals.css` (tokens + remove dead import), `components/ui/badge.tsx` (+status variants), `components/landing/LandingNav.tsx`, `components/landing/LandingFooter.tsx`, `components/OrganizerNav.tsx`, `components/StudentNav.tsx`, `components/landing/__tests__/LandingNav.test.tsx`, `lib/email.ts` (branded layout), plus the screen/component files listed in the sweep tasks.
- **Delete:** `app/favicon.ico` (default Next icon; replaced by `app/icon.svg`).

---

### Task 1: Fix token wiring + install pastel-green palette

**Files:**
- Modify: `app/globals.css:1-94`

**Interfaces:**
- Produces: working semantic Tailwind tokens — `bg-primary` (deep sage), `bg-card`, `bg-muted` (mint), `text-muted-foreground`, `border-border`, `ring` (sage). All later tasks rely on these.

- [ ] **Step 1: Replace the import header and `:root`/`.dark` token blocks.** Edit `app/globals.css` so the top reads exactly:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}

@layer base {
  :root {
    --background: 150 33% 97%;
    --foreground: 158 30% 17%;
    --card: 0 0% 100%;
    --card-foreground: 158 30% 17%;
    --popover: 0 0% 100%;
    --popover-foreground: 158 30% 17%;
    --primary: 157 60% 30%;
    --primary-foreground: 0 0% 100%;
    --secondary: 148 45% 94%;
    --secondary-foreground: 157 60% 26%;
    --muted: 148 45% 94%;
    --muted-foreground: 153 11% 40%;
    --accent: 151 52% 91%;
    --accent-foreground: 157 60% 26%;
    --destructive: 11 61% 47%;
    --destructive-foreground: 0 0% 100%;
    --border: 146 23% 93%;
    --input: 146 23% 93%;
    --ring: 154 44% 44%;
    --radius: 0.625rem;
  }
  .dark {
    --background: 158 30% 8%;
    --foreground: 150 33% 97%;
    --card: 158 28% 12%;
    --card-foreground: 150 33% 97%;
    --popover: 158 28% 12%;
    --popover-foreground: 150 33% 97%;
    --primary: 152 43% 64%;
    --primary-foreground: 158 30% 12%;
    --secondary: 158 20% 18%;
    --secondary-foreground: 150 33% 97%;
    --muted: 158 20% 18%;
    --muted-foreground: 152 15% 65%;
    --accent: 158 20% 18%;
    --accent-foreground: 150 33% 97%;
    --destructive: 11 55% 52%;
    --destructive-foreground: 0 0% 100%;
    --border: 158 20% 20%;
    --input: 158 20% 20%;
    --ring: 154 44% 44%;
  }
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

(This removes the dead `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` lines, the `.theme` block, and the unused chart/sidebar tokens. `tailwindcss-animate` is still loaded via `tailwind.config.ts` plugins. The previous `outline-ring/50` on `*` is dropped — it relied on the removed import syntax; focus rings come from `ring` utilities on components.)

- [ ] **Step 2: Verify the build compiles with the new tokens.**

Run: `pnpm build`
Expected: build completes (it may still fail on placeholder Supabase env per the local setup — if so, run `pnpm exec tsc --noEmit` instead and confirm no CSS/type errors). No "invalid value" CSS warnings.

- [ ] **Step 3: Verify tokens render.** Run `pnpm dev`, open `http://localhost:3000`, and confirm in DevTools that a primary button's `background-color` computes to roughly `rgb(31 122 87)` (deep sage), not black or transparent.

Expected: primary buttons are deep sage; page background is faint mint.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(ui): pastel-green design tokens, fix HSL token wiring"
```

---

### Task 2: Brand components — GlobeMark + Logo

**Files:**
- Create: `components/brand/GlobeMark.tsx`
- Create: `components/brand/Logo.tsx`
- Test: `components/brand/__tests__/Logo.test.tsx`

**Interfaces:**
- Produces:
  - `GlobeMark({ className?: string }): JSX.Element` — the open globe+path SVG (brand greens hard-coded).
  - `Logo({ className?: string; href?: string | null }): JSX.Element` — mark + "EazyExchange" wordmark. `href` defaults to `'/'` and wraps in a `next/link` with accessible name `"EazyExchange home"`; `href={null}` renders the bare mark (no link).

- [ ] **Step 1: Write the failing test** — `components/brand/__tests__/Logo.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from '@/components/brand/Logo'

describe('Logo', () => {
  it('links home with an accessible name by default', () => {
    render(<Logo />)
    const link = screen.getByRole('link', { name: 'EazyExchange home' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows the wordmark text', () => {
    render(<Logo />)
    expect(screen.getByText('Eazy')).toBeInTheDocument()
    expect(screen.getByText('Exchange')).toBeInTheDocument()
  })

  it('renders no link when href is null', () => {
    render(<Logo href={null} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- Logo`
Expected: FAIL — cannot resolve `@/components/brand/Logo`.

- [ ] **Step 3: Create `GlobeMark.tsx`:**

```tsx
export function GlobeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="17" stroke="#3FA277" strokeWidth="3" />
      <ellipse cx="24" cy="24" rx="7.5" ry="17" stroke="#3FA277" strokeWidth="2.2" />
      <path d="M7.5 24h33M11 16h26M11 32h26" stroke="#3FA277" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
      <path d="M13 28C20 12 28 12 35 20" stroke="#7CCBA6" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 6.5" />
      <circle cx="13" cy="28" r="4" fill="#3FA277" />
      <circle cx="35" cy="20" r="4" fill="#7CCBA6" />
    </svg>
  )
}
```

- [ ] **Step 4: Create `Logo.tsx`:**

```tsx
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { GlobeMark } from './GlobeMark'

export function Logo({
  className,
  href = '/',
}: {
  className?: string
  href?: string | null
}) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <GlobeMark className="h-7 w-7 shrink-0" />
      <span className="text-lg font-bold tracking-tight text-foreground">
        <span className="text-primary">Eazy</span>Exchange
      </span>
    </span>
  )
  if (href === null) return mark
  return (
    <Link href={href} aria-label="EazyExchange home" className="inline-flex items-center">
      {mark}
    </Link>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- Logo`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add components/brand/
git commit -m "feat(ui): add GlobeMark and Logo brand components"
```

---

### Task 3: Favicon + app icon

**Files:**
- Create: `app/icon.svg`
- Create: `app/apple-icon.tsx`
- Delete: `app/favicon.ico`

**Interfaces:**
- Produces: a sage rounded-tile favicon (white simplified globe) served by Next at `/icon.svg` and a 180×180 PNG apple-touch icon. No code consumes these; Next wires them via file conventions.

- [ ] **Step 1: Create `app/icon.svg`** (tile mark — simplified globe, no path dashes, holds at 16px):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="11" fill="#3FA277"/>
  <circle cx="24" cy="24" r="12.5" stroke="#fff" stroke-width="2.6"/>
  <ellipse cx="24" cy="24" rx="5.5" ry="12.5" stroke="#fff" stroke-width="2.2"/>
  <path d="M12 24h24M14.5 18.5h19M14.5 29.5h19" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Create `app/apple-icon.tsx`** (rasterizes the tile to PNG at build):

```tsx
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="11" fill="#3FA277"/><circle cx="24" cy="24" r="12.5" stroke="#fff" stroke-width="2.6"/><ellipse cx="24" cy="24" rx="5.5" ry="12.5" stroke="#fff" stroke-width="2.2"/><path d="M12 24h24M14.5 18.5h19M14.5 29.5h19" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`

export default function AppleIcon() {
  return new ImageResponse(
    (
      <img
        width={180}
        height={180}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(tile)}`}
        alt=""
      />
    ),
    { ...size },
  )
}
```

- [ ] **Step 3: Delete the default favicon.**

Run: `git rm app/favicon.ico`
Expected: file removed.

- [ ] **Step 4: Verify icons build and serve.** Run `pnpm dev`, then:
  - Visit `http://localhost:3000/icon.svg` → the sage globe tile renders.
  - Visit `http://localhost:3000/apple-icon` → a 180×180 PNG of the tile renders.
  - Confirm the browser tab shows the green tile (hard refresh).

Expected: both routes return the brand tile; tab favicon is the green globe.

- [ ] **Step 5: Commit**

```bash
git add app/icon.svg app/apple-icon.tsx
git commit -m "feat(ui): brand favicon and apple-touch icon, drop default favicon"
```

---

### Task 4: Brand the shared chrome (navs + footer)

**Files:**
- Modify: `components/landing/LandingNav.tsx`
- Modify: `components/landing/LandingFooter.tsx`
- Modify: `components/OrganizerNav.tsx`
- Modify: `components/StudentNav.tsx`
- Modify: `components/landing/__tests__/LandingNav.test.tsx`

**Interfaces:**
- Consumes: `Logo` from Task 2; tokens from Task 1.

- [ ] **Step 1: Update `LandingNav.tsx`** — replace the text brand link with `<Logo />`. Change:

```tsx
        <Link href="/" className="text-lg font-semibold">
          {brand}
        </Link>
```
to:
```tsx
        <Logo />
```
and add `import { Logo } from '@/components/brand/Logo'` at the top. Leave the login/getStarted buttons unchanged. (`brand` from `landingContent.nav` is now unused here — that's fine; the field stays in content for the footer.)

- [ ] **Step 2: Update `LandingNav.test.tsx`** — the wordmark text is now split across spans, so `getByText('EazyExchange')` no longer matches. Replace that single assertion:

```tsx
    expect(screen.getByText('EazyExchange')).toBeInTheDocument()
```
with:
```tsx
    expect(screen.getByRole('link', { name: 'EazyExchange home' })).toHaveAttribute('href', '/')
```
Keep the other two assertions (Log in / Get started) as-is.

- [ ] **Step 3: Update `OrganizerNav.tsx`** — replace `<span className="font-semibold text-slate-900">EazyExchange</span>` with `<Logo />`, add the import, and apply the migration map to the rest: `bg-white` → `bg-card`, the active link `text-slate-900` → `text-foreground`, inactive `text-slate-500 hover:text-slate-900` → `text-muted-foreground hover:text-foreground`.

- [ ] **Step 4: Update `StudentNav.tsx`** — replace `<span className="font-semibold text-slate-900">EazyExchange</span>` with `<Logo />`, add the import, and `bg-white` → `bg-card`.

- [ ] **Step 5: Update `LandingFooter.tsx`** — read the file; replace any text brand with `<Logo href={null} />` (or `<Logo />` if it links home) and apply the migration map to any `slate-*` classes present.

- [ ] **Step 6: Run tests + lint.**

Run: `pnpm test -- LandingNav` then `pnpm lint`
Expected: PASS; no lint errors.

- [ ] **Step 7: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/LandingFooter.tsx components/OrganizerNav.tsx components/StudentNav.tsx components/landing/__tests__/LandingNav.test.tsx
git commit -m "feat(ui): use Logo in nav/footer chrome, migrate slate to tokens"
```

---

### Task 5: Badge status variants

**Files:**
- Modify: `components/ui/badge.tsx`
- Test: `components/ui/__tests__/badge.test.tsx` (create)

**Interfaces:**
- Produces: `Badge` gains `variant` values `success | info | neutral | danger` (in addition to existing `default | secondary | destructive | outline`). Mapping for screens: approved/all-done → `success`; submitted/in-progress → `info`; draft/not-started → `neutral`; overdue/rejected → `danger`.

- [ ] **Step 1: Write the failing test** — `components/ui/__tests__/badge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge status variants', () => {
  it('applies the success variant classes', () => {
    render(<Badge variant="success">All done</Badge>)
    const el = screen.getByText('All done')
    expect(el.className).toContain('bg-[hsl(151_52%_91%)]')
  })

  it('applies the danger variant classes', () => {
    render(<Badge variant="danger">Overdue</Badge>)
    expect(screen.getByText('Overdue').className).toContain('bg-[hsl(8_60%_94%)]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- badge`
Expected: FAIL — `success` not assignable / class not present.

- [ ] **Step 3: Add the variants** in `components/ui/badge.tsx` — inside the `variants.variant` object, after `outline`, add:

```tsx
        success:
          "border-transparent bg-[hsl(151_52%_91%)] text-[hsl(157_60%_26%)]",
        info:
          "border-transparent bg-[hsl(210_70%_94%)] text-[hsl(211_55%_42%)]",
        neutral:
          "border-transparent bg-muted text-muted-foreground",
        danger:
          "border-transparent bg-[hsl(8_60%_94%)] text-[hsl(11_61%_42%)]",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- badge`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/badge.tsx components/ui/__tests__/badge.test.tsx
git commit -m "feat(ui): add success/info/neutral/danger badge variants"
```

---

### Task 6: Sweep — landing sections

**Files (apply migration map; replace status/ad-hoc colors with tokens or `<Badge>`):**
- Modify: `components/landing/Hero.tsx`, `ProblemSolution.tsx`, `Features.tsx`, `HowItWorks.tsx`, `Pricing.tsx`

**Interfaces:** Consumes Task 1 tokens, Task 5 badges.

- [ ] **Step 1: Apply the migration map** to each file above. Example — in `Pricing.tsx` a highlighted tier border like `border-slate-300` → `border-border`, muted copy `text-slate-500` → `text-muted-foreground`, section bg `bg-slate-50` → `bg-muted`. Keep all `bg-primary`/`text-primary-foreground` button usage as-is (now sage). For the highlighted pricing tier accent, use `border-primary` / `ring-1 ring-primary`.

- [ ] **Step 2: Confirm no hard-coded slate remains in landing.**

Run: `grep -rnE "(slate|gray|zinc|neutral)-[0-9]" components/landing` (exclude `__tests__`)
Expected: no matches.

- [ ] **Step 3: Run landing tests + lint.**

Run: `pnpm test -- landing && pnpm lint`
Expected: PASS (tests assert content/links, not colors).

- [ ] **Step 4: Visual check.** `pnpm dev` → `http://localhost:3000` → confirm hero, features, pricing read as calm pastel-green; primary CTAs are deep sage.

- [ ] **Step 5: Commit**

```bash
git add components/landing
git commit -m "style(landing): migrate to pastel-green tokens"
```

---

### Task 7: Sweep — organizer screens

**Files (apply migration map + `<Badge>` for status):**
- Modify: `app/(organizer)/layout.tsx`, `app/(organizer)/dashboard/page.tsx`, `app/(organizer)/exchanges/[id]/page.tsx`, `.../students/page.tsx`, `.../applications/page.tsx`, `.../applications/[applicationId]/page.tsx`, `.../forms/[formId]/page.tsx`, `.../submissions/[assignmentId]/page.tsx`
- Modify: `components/ApplicationsCard.tsx`, `ApplicationReadView.tsx`, `ApplicationReviewActions.tsx`, `SubmissionReview.tsx`, `FormBuilder.tsx`, `InviteStudentForm.tsx`

**Interfaces:** Consumes Task 1 tokens, Task 5 badges. Target look = the approved dashboard mockup (white `bg-card` cards on `bg-background`, `border-border`, deep-sage primary buttons, progress bars in sage, status pills via `<Badge>`).

- [ ] **Step 1: Apply the migration map** across the files above. For submission/student/application status indicators, replace ad-hoc colored text/badges with `<Badge variant="success|info|neutral|danger">` per the Task 5 mapping. For any progress bar fill, use `bg-primary` on a `bg-muted` track. Cards: wrap content in `bg-card border border-border rounded-lg` where raw `bg-white` blocks exist.

- [ ] **Step 2: Confirm no hard-coded slate remains.**

Run: `grep -rnE "(slate|gray|zinc|neutral)-[0-9]" "app/(organizer)" components/Application*.tsx components/SubmissionReview.tsx components/FormBuilder.tsx components/InviteStudentForm.tsx`
Expected: no matches.

- [ ] **Step 3: Lint + build/typecheck.**

Run: `pnpm lint` (and `pnpm exec tsc --noEmit`)
Expected: PASS.

- [ ] **Step 4: Visual check.** Sign in as an organizer; spot-check dashboard, an exchange detail, a submission review, and applications list. Confirm badges/colors match the mockup.

- [ ] **Step 5: Commit**

```bash
git add "app/(organizer)" components/Application*.tsx components/SubmissionReview.tsx components/FormBuilder.tsx components/InviteStudentForm.tsx
git commit -m "style(organizer): migrate screens to pastel-green tokens + status badges"
```

---

### Task 8: Sweep — student + public funnel screens

**Files (apply migration map + `<Badge>`):**
- Modify: `app/(student)/layout.tsx`, `app/(student)/my-forms/page.tsx`, `app/(student)/my-forms/[assignmentId]/page.tsx`
- Modify: `app/apply/[slug]/page.tsx`, `app/apply/resume/[token]/page.tsx`, `app/invite/[token]/page.tsx`
- Modify: `components/DataEntryForm.tsx`, `DocumentUploadForm.tsx`, `ApplicationForm.tsx`, `ApplicationStartForm.tsx`, `InviteResponseForm.tsx`

**Interfaces:** Consumes Task 1 tokens, Task 5 badges.

- [ ] **Step 1: Apply the migration map** across the files above, using `<Badge>` for per-form status on the my-forms list.

- [ ] **Step 2: Confirm no hard-coded slate remains.**

Run: `grep -rnE "(slate|gray|zinc|neutral)-[0-9]" "app/(student)" app/apply app/invite components/DataEntryForm.tsx components/DocumentUploadForm.tsx components/ApplicationForm.tsx components/ApplicationStartForm.tsx components/InviteResponseForm.tsx`
Expected: no matches.

- [ ] **Step 3: Lint + typecheck.**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Visual check.** Open the public apply page and a student my-forms view; confirm calm pastel-green styling and legible status badges.

- [ ] **Step 5: Commit**

```bash
git add "app/(student)" app/apply app/invite components/DataEntryForm.tsx components/DocumentUploadForm.tsx components/ApplicationForm.tsx components/ApplicationStartForm.tsx components/InviteResponseForm.tsx
git commit -m "style(student,public): migrate screens to pastel-green tokens + status badges"
```

---

### Task 9: Sweep — auth screens + shared state components

**Files (apply migration map):**
- Modify: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/accept-invite/page.tsx`
- Modify: `components/ErrorState.tsx`, `components/LoadingState.tsx`, `components/ui/dialog.tsx`, `components/ui/select.tsx`

**Interfaces:** Consumes Task 1 tokens, Task 2 `Logo`.

- [ ] **Step 1: Add `<Logo />`** to the top of each auth page (login/signup/accept-invite) above the form card, and apply the migration map. For `dialog.tsx`/`select.tsx`, replace any literal `slate-*` overlay/border classes with `border-border` / `bg-popover` / `text-muted-foreground` as appropriate (these are shadcn primitives — match the original intent).

- [ ] **Step 2: Confirm no hard-coded slate remains.**

Run: `grep -rnE "(slate|gray|zinc|neutral)-[0-9]" "app/(auth)" components/ErrorState.tsx components/LoadingState.tsx components/ui/dialog.tsx components/ui/select.tsx`
Expected: no matches.

- [ ] **Step 3: Run auth tests + lint.**

Run: `pnpm test -- login signup && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)" components/ErrorState.tsx components/LoadingState.tsx components/ui/dialog.tsx components/ui/select.tsx
git commit -m "style(auth): brand auth screens + migrate shared components to tokens"
```

---

### Task 10: Brand the email templates

**Files:**
- Modify: `lib/email.ts` (the `layout()` helper at lines ~26-35, and the inline button/note colors in `sendRejectionEmail`)

**Interfaces:** Consumes the brand colors as literal hex (email HTML can't use CSS vars). Keep all `esc()` calls and the FROM/PII-safe logging unchanged.

- [ ] **Step 1: Update the `layout()` helper** so the header is the wordmark in brand colors and the rule/footer use brand-tinted neutrals. Replace the `layout` function body with:

```ts
function layout(body: string, footer = "You're receiving this because you have forms to complete for a student exchange."): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1F3A30;">
      <h2 style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px;">
        <span style="color: #3FA277;">Eazy</span>Exchange
      </h2>
      ${body}
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">${footer}</p>
    </div>
  `
}
```

- [ ] **Step 2: Update the rejection email button** — in `sendRejectionEmail`, change the CTA button background from `#0f172a` to the deep sage `#1F7A57` (white text stays). Leave the red note box (`#fef2f2` / `#b91c1c`) as-is — it semantically signals "changes needed". Search `lib/email.ts` for any other `#0f172a` button backgrounds and change them to `#1F7A57` too.

- [ ] **Step 3: Run the email tests.**

Run: `pnpm test -- email`
Expected: PASS (existing `email.application.test.ts` asserts content/escaping, not colors).

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts
git commit -m "feat(email): brand email templates with pastel-green wordmark + sage CTA"
```

---

### Task 11: Final verification + accessibility pass

**Files:** none (verification only; small fixes if needed).

- [ ] **Step 1: Full no-slate sweep.**

Run: `grep -rnE "(slate|gray|zinc|neutral)-[0-9]" app components | grep -v __tests__`
Expected: no matches (or only deliberate, justified ones — none expected).

- [ ] **Step 2: Full gate.**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all PASS. (If `pnpm build` fails only on placeholder Supabase env, substitute `pnpm exec tsc --noEmit` and note it.)

- [ ] **Step 3: Contrast (WCAG AA).** Verify in DevTools or a contrast checker:
  - Body/ink text `#1F3A30` on `#F4FAF7` / white → must be ≥ 4.5:1 (passes, ~12:1).
  - White on primary button `#1F7A57` → must be ≥ 4.5:1 (≈5.3:1, passes).
  - `info` badge `#3071B8`-range text on `#E3F0FB`, `success` `#1A6A4B` on `#DCF3E8`, `danger` `#C0492F`@42% on `#FBE6E3` → each ≥ 4.5:1.

  If any fails, darken the foreground triplet by ~6–8% L and re-check. Record the final values.

- [ ] **Step 4: Cross-surface visual spot-check.** `pnpm dev` → landing, organizer dashboard, a student form, login, public apply, and the browser-tab favicon. Confirm one coherent calm-pastel-green identity.

- [ ] **Step 5: Commit any contrast fixes**

```bash
git add app/globals.css components/ui/badge.tsx
git commit -m "fix(ui): ensure WCAG AA contrast on brand colors"
```

---

## Self-Review

**Spec coverage:**
- Color system → Task 1 (tokens) + reference table. ✓
- Logo direction B + wordmark → Task 2. ✓
- Favicon (tile) + apple icon → Task 3. ✓
- Token-wiring risk (HSL vs oklch vs dead import) → resolved in Task 1 (dead import confirmed missing; standardize on HSL triplets). ✓
- Apply across landing/organizer/student/public/auth → Tasks 6–9. ✓
- Shared chrome with Logo → Task 4. ✓
- Status badge palette → Task 5, used in Tasks 7–8. ✓
- Email branding (escaping preserved) → Task 10. ✓
- AA contrast (sage too light for white text) → resolved by using deep `#1F7A57` for `--primary` from the start (Task 1) + verified in Task 11. ✓
- Dark mode out of scope but tokens updated → Task 1 `.dark` block. ✓
- Test updates (LandingNav brand assertion) → Task 4 Step 2. ✓
- Verification gate (lint/test/build) → every task + Task 11. ✓

**Placeholder scan:** No TBD/TODO; sweep tasks carry an explicit migration map + concrete examples + grep verification rather than per-line diffs (appropriate for a mechanical class-rename across ~33 files; the grep gate makes completion objective).

**Type consistency:** `Logo` prop `href?: string | null` is used consistently (Task 2 def, Task 4 `href={null}`). Badge variant names `success|info|neutral|danger` defined in Task 5 and referenced identically in Tasks 7–8. Token names match `tailwind.config.ts` color keys.
