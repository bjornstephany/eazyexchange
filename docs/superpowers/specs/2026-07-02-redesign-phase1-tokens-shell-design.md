# Product Redesign — Phase 1: Design Tokens + Organizer Shell

**Date:** 2026-07-02
**Source of truth:** `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/` (high-fidelity design handoff; README.md inside is the master reference). Referenced below as "the handoff".

## Context: the full redesign, decomposed

The handoff is a complete redesign of the product: new visual language, a new
organizer information architecture (dark icon rail + session top bar replacing
the exchange-centric page navigation), a student space, redesigned auth/public
pages, system states, and a bilingual landing page — with **all product copy in
French** (vouvoiement for organizers, tutoiement for students).

It is too large for one spec. Agreed decomposition (each phase = its own
spec → plan → implementation cycle; order follows the handoff README):

1. **Phase 1 (this spec):** design tokens + brand + organizer shell (rail,
   top bar, session selector, new-exchange modal).
2. Dashboard views (Aperçu / Échanges / Candid.) — `Eazyexchange Dashboard.dc.html`.
   Absorbs `exchanges/[id]/applications` into the Candid. view.
3. Formulaires + Docs pages — `Eazyexchange Formulaires.dc.html`, `Eazyexchange Docs.dc.html`.
4. Élèves directory + Réglages — `Eazyexchange Eleves.dc.html`, `Eazyexchange Reglages.dc.html`.
5. Student space « Mon dossier » — `Eazyexchange Espace Eleve.dc.html`.
6. Auth + public pages (login, signup, accept-invite, apply, invite response,
   billing) — `Eazyexchange Pages Round 2.dc.html` screens 1a–1f.
7. System states (loading, error, expired link, billing return, empty states) —
   `Eazyexchange System States.dc.html` screens 2a–2f.
8. Landing page (bilingual FR/EN) — `Eazyexchange.dc.html`.

**Cross-phase decisions (agreed):**

- **Transition routing:** during migration, rail items deep-link into today's
  exchange-scoped pages for the active session; rail items whose destinations
  don't exist yet (Docs, Élèves, Réglages) are hidden until their phase ships.
  Old pages render inside the new shell with their current layouts.
- **French copy migrates per phase:** each phase ships its screens in French
  using the handoff's exact strings; not-yet-redesigned pages stay English
  until their phase. Interim mixed language is accepted. (Open item for a
  later phase: transactional/reminder emails are currently English.)
- **Session state is cookie-scoped:** routes stay clean (`/dashboard`, later
  `/forms`, `/students`…); a cookie holds the active exchange id. No
  URL-embedded exchange segment.
- **Token strategy:** remap the existing shadcn/Tailwind theme in place
  (Approach A) — the whole app inherits the new palette/type at once;
  redesigned screens land on top. Consequence accepted: the live landing
  page's fonts shift before its own redesign phase.

---

## Phase 1 scope

Two deliverables, separately committable:

1. **Design tokens + brand** — global theme swap.
2. **Organizer shell** — rail + top bar + session selector + new-exchange
   modal, replacing `OrganizerNav` and the `/exchanges/new` page.

Out of scope: every page's content/layout (later phases), student shell,
search field in the top bar (deferred to the dashboard phase — no search
backend exists; a dead input on a live product is worse than its absence),
system states, landing.

## 1 · Design tokens + brand

### Fonts (`app/layout.tsx`)

Replace Instrument Sans / Space Grotesk / Space Mono with, via
`next/font/google` on the existing CSS variables:

- `--font-sans`: **IBM Plex Sans** 400/500/600 (body/UI)
- `--font-display`: **Schibsted Grotesk** 700 (headings; letter-spacing
  −0.02em applied at usage sites)
- `--font-mono`: **IBM Plex Mono** 500/600 (microcopy, uppercase labels,
  letter-spacing .08–.14em at usage sites)

No `tailwind.config.ts` fontFamily change needed. Delete unused
`app/fonts/GeistVF.woff` + `GeistMonoVF.woff`.

### Colors (`app/globals.css` + `tailwind.config.ts`)

Rewrite `:root` shadcn variables (HSL equivalents of the handoff hex):

| Variable | Value |
|---|---|
| `--background` | `#EEF1F7` (app canvas) |
| `--foreground` | `#10203F` (ink) |
| `--card` / `--popover` | `#FFFFFF` |
| `--primary` | `#2456E6`, foreground white |
| `--secondary` | `#F1F4F9` (subtle fill), foreground `#10203F` |
| `--muted` | `#F1F4F9`, `--muted-foreground` `#5B6B8C` |
| `--accent` | `#E6ECFD` (blue tint bg), foreground `#1D48C7` |
| `--destructive` | `#C0392B`, foreground white |
| `--border` | `#E4E9F2` |
| `--input` | `#C4CDE0` |
| `--ring` | `#2456E6` |

Drop the `.dark` block — the design has no dark theme (the rail's navy is a
component color, not a theme).

Add named Tailwind colors for handoff-specific tokens:

- `rail` `#0E1B38` · `rail-inactive` `#8595B8`
- `navy` `#10203F` (the design's "ink" — named `navy` because `ink` is
  already taken by the landing's legacy palette, which stays untouched
  along with `paper/cleared/boarding/stamp` until the landing phase)
- `primary-hover` `#1D48C7` · `accent-blue` `#3B6EF6`
- `tint` bg `#E6ECFD` / border `#C8D6FA` / text `#1D48C7`
- `success` bg `#DCF3E6` / text `#0F7A3D`
- `warn` bg `#FCF0DB` / text `#9A6B15`
- `danger` bg `#FBE7E4` / text `#C0392B`
- `hover-row` `#F7F9FE` · `hover-row-soft` `#FAFBFE` · `hint-bg` `#F5F7FC`
- `placeholder` `#9AA6C0` · `tertiary` `#8A97B2`
- `track` `#DDE3EF` · `frame-border` `#C4CDE0` · `frame-dashed` `#D6DCEA`

### Radii & shadows

`--radius` scale per handoff: cards 18px, inner containers 14–16px, inputs
10–11px, buttons 9–11px, pills 999px. Map via existing `lg/md/sm` plus
explicit `rounded-card` (18px) and `rounded-pill`. Named shadows:
`shadow-float: 0 18px 40px -30px rgba(16,32,63,.25)` and
`shadow-modal: 0 40px 80px -40px rgba(6,12,28,.6)`.

### Logo & favicon (`components/brand/`)

Replace `GlobeMark` with the handoff mark (`Eazyexchange Logo.dc.html`):

- Two overlapping circles — navy `#10203F` top-left + blue `#2456E6`
  bottom-right with `mix-blend-mode: multiply`. Pure CSS/SVG, no assets.
- Dark-rail variant: white + `#3B6EF6` circles, **no wordmark**.
- Wordmark: "Eazyexchange" Schibsted Grotesk 700 (casing changes from
  today's "EazyExchange" — this is the handoff's brand casing; update all
  wordmark usages, including email templates' visible brand name where
  trivial, but email redesign itself is out of scope).
- Favicon: navy rounded square, white + blue circles, as `app/icon.svg`
  (replaces the current favicon).

### Effect on existing pages

Every screen immediately inherits new type, blue palette, and canvas color
while keeping its layout. This is intended. The landing page keeps its
bespoke palette classes but changes fonts.

## 2 · Organizer shell

### Structure

`app/(organizer)/layout.tsx` (server component) fetches the organizer's
profile + school's exchanges, resolves the active exchange, and renders:

```
┌──────┬──────────────────────────────────────────────┐
│ Rail │ TopBar (66px white)                          │
│ 82px │ « {Session} ▾ » + phase pill   [+ Inviter…]  │
│ navy ├──────────────────────────────────────────────┤
│      │ content (scroll, padding 26px 28px 40px)     │
└──────┴──────────────────────────────────────────────┘
```

New components in `components/shell/`:

- **`OrganizerShell`** — grid wrapper (server-compatible; receives resolved
  data as props).
- **`Rail`** (client) — `#0E1B38`; logo mark top; items 62px wide, radius 11,
  icon + 9px IBM Plex Mono label, inactive `#8595B8`, active white on
  `rgba(255,255,255,.1)`. Phase 1 items and destinations:
  - Aperçu → `/dashboard`
  - Échanges → `/exchanges/[activeId]`
  - Candid. → `/exchanges/[activeId]/applications`
  - Formul. / Docs / Élèves / Réglages: **not rendered** until their
    phases. (Formul. is included here because today's forms list *is* the
    exchange detail page — a Formul. item would duplicate Échanges'
    destination.)
  - Organizer initials avatar pinned bottom; menu with « Se déconnecter »
    (reuses existing sign-out logic from `OrganizerNav`).
  - Exact rail markup/values: `Eazyexchange Dashboard.dc.html`.
- **`TopBar`** — session selector left; right: primary « + Inviter des
  élèves » linking to the active exchange's invite section. No search field
  in Phase 1.
- **`SessionSelector`** (client) — « {Exchange name} ▾ » + phase pill;
  dropdown lists the school's exchanges + « + Nouvel échange » (opens
  modal). Selecting an exchange calls a server action that sets the cookie
  and refreshes.
- **`NewExchangeModal`** — shadcn Dialog styled per handoff screen 1g
  (560px, radius 18, padding 34×38, `shadow-modal`): H3 « Nouvel échange »,
  sub « Un échange relie votre établissement à un partenaire, pour une
  session donnée. », fields Nom de l'échange (placeholder
  « France–Canada 2026 »), grid 150px/1fr Année (default current year) +
  Établissement partenaire (placeholder « Lycée Victor Hugo »), conditional
  « Votre établissement » when `needsSchoolName`, footer ghost « Annuler » +
  primary « Créer l'échange ». Reuses the existing `createExchange` server
  action and billing limit gate (`lib/billing/limits.ts`): limit-reached
  renders the existing upgrade CTA inside the modal.

`OrganizerNav.tsx` is deleted. `NewExchangeForm.tsx`'s page wrapper is
retired; its form logic is absorbed by the modal.

### Active-session state

- Cookie `ee_active_exchange` = exchange id; set only via server action.
- Resolution in the layout: cookie value present **and** matches one of the
  school's exchanges (RLS-scoped query) → use it; otherwise most recently
  created exchange; otherwise none (zero-exchange state). Never trust the
  cookie value directly in queries.
- After `createExchange` succeeds in the modal: set cookie to the new
  exchange, close, `router.refresh()`.

### Routing changes

- `app/(organizer)/exchanges/new/page.tsx` → server redirect to
  `/dashboard?new-exchange=1`; the shell auto-opens the modal when that
  param is present (then cleans the URL). Old links/bookmarks keep working.
- All other routes unchanged.

### Zero-exchange state

Selector replaced by a « + Nouvel échange » top-bar button; exchange-scoped
rail items (Échanges, Candid.) hidden. The full designed empty
state (handoff 2e) ships in the system-states phase.

### Copy

All shell chrome is French per the handoff (vouvoiement). Pages inside the
shell keep their current English until their phase.

### Interactions (handoff « Interactions & Behavior »)

Primary hover `#1D48C7`; white buttons hover `#F5F7FC`; busy states swap
labels (« Création… ») and disable; errors as 14px `#C0392B` text inside
the modal. No entrance animations.

## Error handling

- Stale/foreign cookie → silent fallback (most recent exchange).
- `createExchange` validation + billing-limit errors surface inline in the
  modal; no new error pathways.
- Auth, middleware, RLS, emails untouched.

## Testing

- Update existing vitest suites referencing `OrganizerNav` or the
  `exchanges/new` page.
- New unit tests: active-exchange resolution (valid cookie / stale cookie /
  no cookie / zero exchanges), cookie server action, `/exchanges/new`
  redirect behavior, modal billing-gate rendering.
- Verification before merge: `pnpm lint`, `pnpm test`, `tsc --noEmit`
  (local build has placeholder env), plus driving the app to see the shell
  live.

## Rollout

Feature branch; separate commits for (1) tokens+brand and (2) shell, so the
global token swap is independently revertable. Merge to `main`
(= production deploy) only after verification passes and user confirms.
