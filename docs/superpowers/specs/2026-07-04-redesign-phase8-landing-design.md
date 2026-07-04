# Phase 8 — Landing page (bilingual FR/EN) — Design

**Date:** 2026-07-04
**Phase:** 8 of 8 (final) of the full-product redesign (`docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/`).
**Design reference:** `design_handoff_eazyexchange/Eazyexchange.dc.html` (rendered default = final) + README "Screens — Marketing".
**Route:** `app/page.tsx`.

## Goal

Replace the current legacy "departures-board / boarding-pass" English landing (built on legacy `ink/paper/cleared/boarding/stamp` tokens) with the design-system marketing page: white background, Schibsted Grotesk / IBM Plex type, accent blue `#2456E6`, and a **bilingual FR/EN** toggle (default **FR**, persisted client-side).

This is the final phase of the redesign. Like Phases 5–7 it is **additive** — no migration, no RLS, no server-action change → merge = Vercel prod deploy, **no `supabase db push`**.

## Decisions (user-approved 2026-07-04)

1. **i18n mechanism = client state + `localStorage`.** Landing content is a client component holding `lang` state (default `'fr'`), hydrated from / persisted to `localStorage['ee_lang']`. No URL/route change, no cookie, no SSR-per-language. Faithful to the design's own client-toggle logic. The `app/page.tsx` server wrapper keeps the existing auth-redirect.
2. **No pricing section on the landing.** Follow the rendered design: pricing lives in-app at `/billing` (redesigned Phase 6). The unused `pricing`/`Tarifs` dict key and the `stats` block are dropped (YAGNI — neither is rendered in the handoff markup).
3. **Tailwind config untouched.** Legacy `ink/paper/cleared/boarding/stamp` colors stay defined (`FormBuilder.tsx` and `app/layout.tsx` still consume some). This phase only stops the *landing* from using them. Full legacy-token removal is out of scope → backlog.

## Design tokens (from handoff README)

- Canvas: **white `#fff`** (landing only; the app uses `#EEF1F7`).
- Ink / navy text: `#10203F`. Secondary text `#5B6B8C`. Tertiary/mono microcopy `#8A97B2` / `#9AA6C0` / `#42506E`.
- **Accent blue `#2456E6`** (primary CTAs, eyebrows, step tops). `hover` = `filter:brightness(1.06)`.
- Borders: cards `#E4E9F2`; hairlines `#EEF1F7` / `#F1F4F9` / `#F4F6FB`. Subtle fills `#FBFCFE` / `#F5F7FC` / `#F1F4F9`.
- Status pills (product mock): complete `#0F7A3D`/`#E4F5EA` · pending `#9A6A0B`/`#FBF0D9` · review `#1D48C7`/`#E6ECFD` · missing `#C0392B`/`#FBE7E4`.
- Type: Headings **Schibsted Grotesk** 700 (H1 56px / H2 34px / 38px, letter-spacing −0.02–0.025em) → map to `font-display`. Body **IBM Plex Sans** 400–600 → `font-sans`. Micro-labels **IBM Plex Mono** 500–600 uppercase, letter-spacing .08–.14em → `font-mono`. All three are already wired via `next/font` in `app/layout.tsx` (`--font-display/sans/mono`) — no font work needed.
- Radii: cards 14–16px · nav CTA/buttons 8–9px · toggle pill 8px (inner segments 6px). Shadows: hero mock `0 30px 70px -34px rgba(16,32,63,.4)`.

Prefer Tailwind design-system utilities where they map cleanly (`text-navy`, `font-display`, etc.); use arbitrary values (`bg-[#2456E6]`, `text-[#5B6B8C]`) for the exact hex values above where no token exists. **Do not** use `cleared/boarding/stamp/paper` classes anywhere in the new landing.

## Architecture

```
app/page.tsx                       (server component — unchanged behavior)
  ├─ getUser() → redirect /dashboard | /my-forms for logged-in users
  ├─ export const metadata (FR title + description)
  └─ <LandingPage />

components/landing/LandingPage.tsx  (NEW — 'use client')
  ├─ const [lang, setLang] = useState<'fr'|'en'>('fr')
  ├─ useEffect: hydrate lang from localStorage['ee_lang'] on mount
  ├─ setLanguage(l): setLang(l) + localStorage.setItem('ee_lang', l)
  ├─ const t = landingContent[lang]
  └─ renders: <LandingNav>, <Hero>, <Features>, <HowItWorks>,
              <Testimonial>, <CtaBand>, <LandingFooter>
     — each section receives the slice of `t` it needs (+ nav receives lang/setLanguage)
```

**Hydration note:** SSR renders `lang='fr'` (the default). On mount, `useEffect` reads `localStorage` and, if a stored value differs, updates state — this is a client-only correction after paint, avoiding a hydration-mismatch error (do **not** read `localStorage` during render). This is acceptable for a marketing page; the default-FR first paint is correct for the vast majority (French organizers).

Sections stay **presentational** (pure functions of their props), so they remain independently testable. `LandingPage` owns all state.

## Content dictionary — `lib/landing/content.ts`

Rewrite the file to a typed bilingual dictionary. Copy strings **verbatim** from `Eazyexchange.dc.html`'s `dict()` (French uses U+2019 `'` apostrophes — see Apostrophes note).

```ts
export type Lang = 'fr' | 'en'

export interface LandingContent {
  nav: { features: string; login: string; demo: string }
  hero: {
    eyebrow: string; title: string; sub: string
    ctaPrimary: string; note: string; trust: string
    mock: {
      title: string; countLabel: string; cols: string[]
      rows: { name: string; app: MockStatus; forms: MockStatus; docs: MockStatus; status: MockStatus }[]
      statusLabels: Record<MockStatus, string>
    }
  }
  features: { eyebrow: string; title: string; pillars: { tag: string; title: string; body: string }[] }
  how: { eyebrow: string; title: string; steps: { n: string; title: string; body: string }[]; note: string }
  testimonial: { quote: string; name: string; org: string }
  cta: { title: string; body: string; primary: string }
  footerTag: string
}

export type MockStatus = 'complete' | 'pending' | 'review' | 'missing'
export const landingContent: Record<Lang, LandingContent> = { fr: {...}, en: {...} }
```

Full copy (both languages) is in `Eazyexchange.dc.html` lines 160–251. Notable strings:

| key | FR | EN |
|---|---|---|
| hero.title | Arrêtez de courir après les dossiers. | Stop chasing down student files. |
| hero.ctaPrimary / cta.primary / nav.demo | Démarrer gratuitement | Start free |
| hero.note | Premier échange offert · sans carte bancaire | First exchange free · no credit card |
| nav.login | Connexion | Log in |
| features.title | Tout le dossier de l'élève, au même endroit. | The whole student file, in one place. |
| how.title | Quatre étapes, aucune relance oubliée. | Four steps, not a single missed follow-up. |
| cta.title | Prêt à simplifier votre prochaine session ? | Ready to simplify your next session? |

Pillars: Candidatures / Formulaires / Documents (Applications / Forms / Documents). Steps 01–04: Envoyez·Sélectionnez·Collectez·Validez (Send·Review·Collect·Approve). Mock rows (identical in both langs): Camille Laurent (all complete), Yanis Benali (forms pending / docs missing / status pending), Léa Moreau (docs review / status review), Tom Rousseau (forms+docs missing), Inès Garcia (all complete). Status labels FR: Complet/En attente/À vérifier/Manquant.

**Deleted from content.ts:** all legacy interfaces/exports (`FeatureItem` w/ lucide icons, `PricingTier`, `ManifestRow`, English-only `landingContent`), the `stats` block, and the `pricing`/`Tarifs` nav key.

## Section specs

All sections inside a `max-width:1180px` column, `padding:0 40px` (`.wrap`). Responsive: 40px→24px side padding under ~640px.

### LandingNav (`components/landing/LandingNav.tsx`) — client-friendly presentational
- Sticky, `top:0 z-40`, `bg-white/[.86] backdrop-blur-[12px]`, bottom border `#EEF1F7`, height 70px.
- Left: logo mark (two circles — navy `#10203F` top-left 18px + accent `#2456E6` bottom-right 18px, `mix-blend-multiply`) + wordmark "Eazyexchange" (Schibsted 700 18px).
- Right (gap 28): **Fonctionnalités** link → `#features` (smooth-scroll anchor); **Connexion** link → `/login`; **FR/EN toggle** (`#F1F4F9` pill, 3px pad, two mono 12px segments — active = navy bg white text, inactive = transparent `#5B6B8C`; calls `setLanguage`); **Démarrer gratuitement** button → `/signup` (navy `#10203F` bg, white, radius 8, `10px 18px`).
- Props: `t.nav`, `lang`, `setLanguage`. Uses `next/link` for `/login` and `/signup`; the anchor is a plain `<a href="#features">`.
- Mobile (<720px): hide the text nav links, keep logo + toggle + CTA (condensed). Keep it simple — no hamburger menu.

### Hero (`Hero.tsx`)
- Grid `1fr 1.05fr` gap 56, padding `80px 40px 72px`. Stacks to 1-col under ~900px (mock below copy).
- Left: mono eyebrow (accent) → H1 56px Schibsted (`leading-[1.04]`, tracking −.025em) → sub 18px `#5B6B8C` max-width 480 → row: blue CTA button *Démarrer gratuitement* → `/signup` + note 13px `#5B6B8C` → trust line 13px `#8A97B2`.
- Right: **product mock** card (white, border `#E4E9F2`, radius 16, shadow `0 30px 70px -34px rgba(16,32,63,.4)`): header row (accent dot + `mock.title` + mono `mock.countLabel`), column-header row (5 mono uppercase 10px cols), then 5 data rows — each `row.name` + 4 status pills derived from `statusLabels`/status→color map. Grid template `1.35fr .95fr 1.05fr 1.05fr .95fr`. The status→{fg,bg} map lives in the component (not the dict), keyed by `MockStatus`.

### Features (`Features.tsx`)
- Padding `24px 40px 72px`. `id="features"` anchor target. Mono eyebrow → H2 34px → 3-col grid gap 24 (→1-col mobile). Each pillar card: border `#E4E9F2`, radius 14, padding 30, bg `#FBFCFE`; mono `{01·tag}` (accent) → title 21px Schibsted → body 15px `#5B6B8C`. Numbering `01/02/03` computed from index.

### HowItWorks (`HowItWorks.tsx`)
- Padding `0 40px 80px`. Mono eyebrow → H2 34px → 4-col grid gap 24 (→2-col ~640px →1-col mobile). Each step: `border-top:2px solid #2456E6`, pad-top 18; mono `st.n` `#9AA6C0` → title 18px Schibsted → body 14px `#5B6B8C`. Then the **auto-reminder note**: flex row, bg `#F5F7FC`, border `#E4E9F2`, radius 14, pad `22px 26px` — 40px accent square with `↻` glyph + `how.note` 15px.

### Testimonial (`Testimonial.tsx` — NEW)
- Full-bleed band bg `#F5F7FC`, top+bottom border `#EEF1F7`. Inner `.wrap` padding `64px 40px`, centered. Quote 27px Schibsted 500 (`"…"`, max-width 760, tracking −.01em) → inline avatar (40px gradient `135deg accent→#10203F`) + name 14px / org 13px `#8A97B2` (left-aligned beside avatar).

### CtaBand (`CtaBand.tsx` — NEW)
- Full-bleed band bg `#10203F`. Inner `.wrap` padding `80px 40px`, centered. H2 38px white → body 17px `#9FB0D6` max-width 520 → blue CTA button *Démarrer gratuitement* → `/signup` (radius 9, `16px 32px`).

### LandingFooter (`LandingFooter.tsx`)
- `.wrap` flex space-between, padding `28px 40px`. Left: small logo (26×19, circles 15px) + wordmark 14px. Right: `footerTag` 13px `#8A97B2`. Stacks/centers on mobile.

## `app/page.tsx` changes

- Keep the server component + auth `getUser()` → redirect logic **unchanged**.
- Replace the `bg-paper text-ink` shell + 7 imported sections with a single `<LandingPage />`.
- Add `export const metadata` (FR): `title: 'Eazyexchange — La plateforme des organisateurs d'échanges scolaires'`, `description` from `footerTag`/`heroSub`. (Marketing SEO; page defaults to FR.)

## CTA / link map

| element | destination |
|---|---|
| Nav *Fonctionnalités* | `#features` (anchor, smooth scroll) |
| Nav *Connexion* | `/login` |
| Nav *Démarrer gratuitement* | `/signup` |
| Hero primary CTA | `/signup` |
| CtaBand primary CTA | `/signup` |

`/signup` and `/login` are the existing routes; logged-in users never see the landing (server redirect).

## Deletions

- `components/landing/ProblemSolution.tsx` (+ test)
- `components/landing/Pricing.tsx` (+ test)
- `components/landing/BoardingManifest.tsx`
- Legacy exports/interfaces in `lib/landing/content.ts` (full rewrite).

## Testing (vitest + RTL, `vitest.config.ts`)

Rewrite `components/landing/__tests__/*` to the new copy + add coverage:

1. **Dict parity** (`content.test.ts`): `fr` and `en` have identical key shape (same nav keys, same number of pillars=3 / steps=4 / mock rows=5, same `statusLabels` keys). Guards against a missed translation.
2. **LandingPage toggle**: renders FR by default; clicking **EN** switches visible copy (e.g. H1 → "Stop chasing…") and writes `localStorage['ee_lang']='en'`; on remount with stored `en`, renders EN.
3. **CTAs**: hero + CtaBand + nav *Démarrer* link to `/signup`; nav *Connexion* → `/login`; nav *Fonctionnalités* href = `#features`.
4. Per-section presentational tests (Hero/Features/HowItWorks/Testimonial/CtaBand/LandingFooter/LandingNav) assert their FR copy renders and required elements exist.
5. Do **not** unit-test the `app/page.tsx` redirect (Supabase server client) — existing pattern; covered by the untouched logic.

`app/__tests__/page.test.tsx` currently tests the landing render — update it to the new structure (or assert it delegates to `LandingPage`).

## Verifying (before merge)

Per CLAUDE.md "Verifying Changes": `pnpm lint` · `pnpm test` (vitest run) · `pnpm build` (tsc + build). All must be green. Plus:

- **Apostrophe/accent audit** (Phase 6/7 lesson): the FR copy is dense with U+2019 `'` and accented chars. The Write tool silently converts U+2019→ASCII `'` and haiku strips accents. After writing every FR-string file, run the robust guard — verify apostrophe bytes are U+2019 in the dict and no accents were stripped. Any FR-transcription subagent work must use **Sonnet**, not haiku.
- **Browser spot-check** (optional, user-gated): load `/` — verify FR default, EN toggle + persistence across reload, `#features` scroll, CTAs, responsive stacking. No live-drive harness needed (public page, no auth/mutation).

## Out of scope / backlog

- Full removal of legacy `cleared/boarding/stamp/paper` Tailwind tokens (blocked by `FormBuilder.tsx` / `app/layout.tsx` consumers).
- URL/SSR-per-language i18n, `hreflang`, sitemap, OG images.
- Transactional/reminder-email French migration (tracked separately as the redesign's open cross-phase item).
- Any pricing/plans content on the landing.

## Build approach

Small, self-contained, additive UI phase → implement via **subagent-driven-development** (consistent with Phases 5–7): FR transcription on **Sonnet**, controller runs the apostrophe/accent guard after each FR file, opus final review before merge. Branch `redesign/phase-8-landing`; merge `--no-ff` to `main` after the Verifying gate is green (= prod deploy, no db push).
