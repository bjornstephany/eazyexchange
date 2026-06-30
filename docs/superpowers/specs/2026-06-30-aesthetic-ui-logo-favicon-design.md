# EazyExchange — Aesthetic UI, Logo & Favicon

**Date:** 2026-06-30
**Status:** Design approved (visual direction); ready for implementation planning

## Goal

Give EazyExchange a deliberate, cohesive visual identity and apply it across the
whole product. Today the app uses the stock shadcn monochrome (zero-chroma)
palette, has no logo (the nav renders the plain text "EazyExchange"), and ships
the default Next.js favicon. We are replacing all three.

## Decisions (locked)

- **Scope:** Full product redesign — brand layer + every screen (landing,
  organizer dashboard/exchanges/forms/submissions/applications, student
  my-forms, auth, apply funnel, invite).
- **Personality:** Calm & trustworthy. Clean, professional, reassuring.
- **Logo:** Direction **B — "Globe + travel path"**. An open mark (no container):
  a line-drawn globe (meridian + equator + latitude lines) with two location
  pins joined by a dotted flight-path arc. Pairs with the wordmark
  "**Eazy**Exchange" — "Eazy" in sage, "Exchange" in ink.
- **Typeface:** Keep **Inter** (already loaded). No new font.

## Color System (pastel green)

A sage-green primary with a mint accent on near-white, mint-tinted surfaces.
Source hex values below; the implementation must emit them in whatever single
token format actually drives the components (see "Token wiring" risk). HSL
triplets are provided for the `hsl(var(--x))` path.

| Role | Name | Hex | HSL triplet |
|------|------|-----|-------------|
| Primary / actions | Sage 600 | `#3FA277` | `154 44% 44%` |
| Primary hover | Sage 700 | `#2F8F6B` | `156 50% 37%` |
| Accent | Sage 400 | `#7CCBA6` | `152 43% 64%` |
| Accent soft | Mint 200 | `#B9E6D0` | `151 47% 81%` |
| Muted surface | Mint 50 | `#EAF7F0` | `148 45% 94%` |
| Page background | Mist | `#F4FAF7` | `150 33% 97%` |
| Card | White | `#FFFFFF` | `0 0% 100%` |
| Border | Edge | `#E7F1EC` | `146 23% 93%` |
| Foreground / ink | Ink | `#1F3A30` | `158 30% 17%` |
| Muted text | Slate-green | `#5C7268` | `153 11% 40%` |
| Destructive / overdue | Clay | `#C0492F` | `11 61% 47%` |

**Status badge palette** (used on student/submission status):
- All done / approved → text `#2F8F6B` on `#DCF3E8`
- Submitted / in-progress → text `#3071B8` on `#E3F0FB` (calm blue, deliberately
  distinct from brand green so "approved" reads as the success state)
- Draft / not started → text `#6B7B74` on `#EFF1F0`
- Overdue / rejected → text `#C0492F` on `#FBE6E3`

Dark mode: the app currently ships an unused `.dark` block. **Out of scope** — we
keep a `.dark` block updated to greens for completeness but do not build/QA a dark
theme in this effort.

## Logo & Favicon Assets

The mark is an **open** line drawing, which thins out badly below ~24px. So:

- **Full logo (`<Logo />` React component):** the open globe+path mark + wordmark.
  Used in landing nav, app navs, auth screens, email header. SVG, `currentColor`
  where sensible so it inherits state, but brand greens hard-coded for the mark.
- **App icon / favicon:** a **sage rounded tile with a simplified white globe**
  (meridian + equator + latitude lines) and two white pins — the path dashes are
  dropped at small sizes. This is the tile shown in the mockups and holds at 16px.
- Files (Next.js App Router conventions, in `app/`):
  - `app/icon.svg` — tile mark (browsers/modern favicon)
  - `app/apple-icon.png` — 180×180 tile
  - `app/favicon.ico` — replace the default; multi-size (32/16) tile
  - Optionally `app/opengraph-image.tsx` later (out of scope unless trivial).
- A single source SVG for each mark lives in the repo (e.g. `components/brand/`)
  so the React `<Logo />` and the static icon files stay visually identical.

## Architecture / How It's Applied

This is a token-first redesign: change the design tokens once, then sweep screens
to use semantic tokens (and fix any hard-coded grays) rather than restyling each
component ad hoc.

1. **Token layer (`app/globals.css` + `tailwind.config.ts`):**
   Replace the zero-chroma `:root` tokens with the palette above. Resolve the
   token-format conflict (below) so `bg-primary`, `text-muted-foreground`,
   `border-border`, `bg-card`, `ring`, etc. all render the new colors. Set
   `--radius` to keep the current soft rounding (0.625rem) — it suits "calm".

2. **Brand components (`components/brand/`):** new `Logo` (full) and a small
   `BrandMark` (tile) used by nav components and auth/landing headers.

3. **Shared chrome:** update `components/landing/LandingNav.tsx`,
   `LandingFooter.tsx`, `OrganizerNav.tsx`, `StudentNav.tsx` to use `<Logo />`.

4. **Screen sweep** — apply tokens + the dashboard look-and-feel (soft cards,
   sage primary buttons, mint-tinted page bg, the status-badge palette, progress
   bars) across:
   - Landing sections (Hero, ProblemSolution, Features, HowItWorks, Pricing)
   - Organizer: dashboard, exchanges (list/new/detail), forms (new/detail),
     submissions review, applications (list/detail)
   - Student: my-forms (list + detail), data-entry & document-upload forms
   - Auth: login, signup, accept-invite
   - Public funnel: apply, apply/resume, invite
   - Shared: `Badge` variants, `ErrorState`, `LoadingState`, `Card`, `Button`,
     `Input`, `Select`, `Table`, `Dialog`

5. **Email HTML:** update the Resend templates' header/accent to the brand (logo
   wordmark + sage), keeping the existing escaping of user content intact.

## Token Wiring (the key risk)

`tailwind.config.ts` declares colors as `hsl(var(--border))` etc. — implying the
CSS vars should be **HSL channel triplets**. But `app/globals.css` currently
defines them as full `oklch(...)` values, and also does `@import "shadcn/tailwind.css"`.
Only one path actually paints the shipped components. Before doing the screen
sweep, the implementer must:

1. Determine which definition is authoritative (inspect a rendered component's
   computed color; test by changing one token).
2. Consolidate to **one** source of truth. Recommended: keep the local
   `tailwind.config.ts` HSL-wrapper approach, define vars as HSL triplets (table
   above), and remove/neutralize whichever competing definition is dead — or, if
   the `shadcn/tailwind.css` oklch path is authoritative, set vars as full color
   values there and align `tailwind.config.ts`. Do **not** leave both live.
3. Verify with `pnpm build` + a visual check that `bg-primary` is sage, not black.

## Testing & Verification

- Existing component/landing tests (`*.test.tsx`) assert content/links, not
  colors, so they should keep passing; update any that assert the old brand text
  vs. a logo element (e.g. `LandingNav.test.tsx` checks the brand link — keep an
  accessible name like "EazyExchange home" on the `<Logo>` link).
- Add a light test that the `<Logo />` renders an accessible label and links to `/`.
- Run the full gate before any push: `pnpm lint`, `pnpm test`, `pnpm build`.
- Manual: spot-check dashboard, a student form, login, and the public apply page
  in the browser; confirm favicon shows the tile in a real tab.
- Accessibility: verify sage-on-white text and white-on-sage button text meet
  WCAG AA contrast (Sage 600 `#3FA277` on white is ~2.5:1 — **too low for body
  text**; use Ink for text and reserve sage for fills/large/non-text. Button text
  is white on Sage 600 ≈ 2.6:1, also borderline — darken button fill toward Sage
  700 `#2F8F6B` for AA on the default button). Confirm during implementation and
  adjust the two action greens if needed.

## Out of Scope (YAGNI)

- Dark theme build/QA (tokens updated but not productized).
- Marketing OG/social images beyond a basic icon.
- Animation/motion system beyond existing `tw-animate-css`.
- Any copy/IA changes — visual only.

## Open Items to Confirm During Implementation

- Final AA-compliant value for the primary action green (likely Sage 700 fill).
- Whether `favicon.ico` regeneration needs a tool (e.g. sharp/resvg) or a checked-in binary.
