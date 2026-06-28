# EazyExchange Landing Page — Design Spec

**Date:** 2026-06-28
**Status:** Approved (design); pending implementation plan
**Scope:** Public marketing landing page only. Organizer self-signup is a separate sub-project (see "Out of Scope").

## Goal

Replace the current auth-gated root (`/`) with a public marketing landing page that pitches EazyExchange to exchange organizers and drives them to sign up. The page must be built so a dedicated frontend/UI agent can later apply a real visual direction and edit copy with minimal friction.

## Context

- Today `/` is gated: `middleware.ts` bounces any logged-out visitor to `/login`, and `app/page.tsx` redirects logged-in users to `/dashboard` or `/my-forms` by role.
- The product is moving away from invite-only — organizers will self-serve (signup flow built next).
- Stack: Next.js 14 App Router, Tailwind, shadcn/ui, `lucide-react`. Theme is neutral grayscale via shadcn CSS-variable tokens in `app/globals.css`. No brand color defined yet — intentionally deferred.

## Guiding Principle: built for handoff

Three concerns are kept strictly separate so a later frontend agent can restyle without touching content or structure:

1. **Content/copy** — all text and data live in one typed file, `lib/landing/content.ts`. Editing copy never requires touching components.
2. **Structure** — each section is a small, self-contained presentational component under `components/landing/`. Any one can be rebuilt in isolation.
3. **Styling** — only existing shadcn tokens (`globals.css` CSS variables) + Tailwind theme + shadcn primitives. No magic hex values, no new dependencies. Changing brand color/type/spacing happens in the tokens, and the whole page follows.

This pass is deliberately **visually restrained** (neutral, clean, token-based) so it reads as a solid scaffold, not a half-formed brand. The real visual direction is deferred to the dedicated agent, and deferral is made cheap.

## Routing & Access

- **`/` becomes the public landing page.**
  - Logged-out visitor → render the landing page.
  - Logged-in visitor → redirect to `/dashboard` (organizer) or `/my-forms` (student/parent), preserving today's behavior so organizers never see marketing.
- **Middleware:** add `/` to the public allowlist in `middleware.ts` so logged-out visitors are not redirected to `/login`. Surgical change to the `isAuthRoute` / `!user` guard around `middleware.ts:16-18`. All other routes stay gated exactly as they are now. `/auth/*` handling is untouched.
- **CTAs:**
  - Primary: **Get started → `/signup`** (route built in the next sub-project; the link is correct from day one and will 404 until then — acceptable for this pass).
  - Secondary: **Log in → `/login`** (exists today).

## File Layout

```
lib/landing/content.ts          ← all copy/data, typed (nav, hero, problem/solution,
                                   features, steps, pricing tiers, footer)
components/landing/
  LandingNav.tsx                ← logo + Log in / Get started
  Hero.tsx
  ProblemSolution.tsx
  Features.tsx
  HowItWorks.tsx
  Pricing.tsx
  LandingFooter.tsx
app/page.tsx                    ← auth check (redirect logged-in users) + compose sections
```

Section components are presentational and read their data from `content.ts` (passed as props or imported directly — to be decided in the plan; default: import directly for simplicity).

## Sections (in order)

1. **Nav** (`LandingNav`) — product name/logo, "Log in" link, "Get started" button.
2. **Hero** — headline, subhead, primary CTA (Get started) + secondary CTA (Log in).
3. **Problem / Solution** — frames the pain (organizers chasing students/parents to complete forms before a trip) and how EazyExchange solves it.
4. **Features** — icon + title + blurb each, using `lucide-react`:
   - Per-student form checklists with deadlines
   - Master completion dashboard
   - Automated, paced reminders
   - Document collection (named upload slots)
   - Review: approve / reject submissions
5. **How it works** — 4 steps: create an exchange → build form templates → invite students → track completion.
6. **Pricing** — tiered comparison grid (e.g. Free + Paid). Tier names, prices, and feature lists are **placeholders in `content.ts`, clearly marked as editable**. Each tier CTA → `/signup`.
7. **Footer** (`LandingFooter`) — product name, copyright, Log in / Get started links.

Copy: real, decent first-draft text (not lorem ipsum) so the page is usable immediately; all of it lives in `content.ts`.

## Styling

- Mobile-first responsive; clean spacing and a readable type scale.
- Uses only existing shadcn primitives (`Button`, `Card`, `Badge`) and tokens. Neutral grayscale as currently themed.
- No new dependencies, no new global CSS beyond what tokens already provide.

## Testing & Verification

- Component tests (Vitest + Testing Library, already configured):
  - Each section renders its content from `content.ts`.
  - Hero/nav/pricing CTAs link to `/signup`; "Log in" links to `/login`.
  - Root behavior: logged-in user is redirected by role (mock the Supabase client as existing tests do).
- Run before completion: `pnpm lint`, `pnpm test`.
- Manual check: logged-out `/` shows the landing page; logged-in `/` still redirects.

## Out of Scope (YAGNI)

- **Organizer self-signup flow** (`/signup`, auth, `users`/`schools` writes, RLS) — separate sub-project, brainstormed next. The landing CTA links to `/signup` ahead of its existence.
- Separate `/features`, `/pricing`, `/about` routes — single page for MVP; sections are already components, so splitting later is cheap.
- FAQ, testimonials / social proof, blog, dark-mode toggle, analytics/marketing tracking.

## Follow-up note

CLAUDE.md states the product is invite-only with no self-registration. That assumption is changing. Update CLAUDE.md as part of the signup sub-project (not this one), so docs and behavior land together.
