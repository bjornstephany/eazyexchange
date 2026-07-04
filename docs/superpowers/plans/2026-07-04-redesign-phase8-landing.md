# Phase 8 — Landing page (bilingual FR/EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy departures-board landing with the design-system marketing page (white bg, Schibsted/Plex type, accent `#2456E6`), bilingual FR/EN via a client-state toggle persisted to `localStorage`.

**Architecture:** `app/page.tsx` stays a server component (auth redirect + FR metadata) and renders a new client `LandingPage` that owns `lang` state and passes a `t` dictionary slice to presentational sections. Content lives in a typed `{ fr, en }` dictionary. No routing, no migration — additive.

**Tech Stack:** Next.js App Router, React client component (`useState`/`useEffect`), Tailwind (arbitrary hex values + `font-display/sans/mono`), vitest + React Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-redesign-phase8-landing-design.md`.
- **French copy uses U+2019 (`’`) apostrophes.** The Write tool downgrades U+2019→ASCII `'`; after writing FR-string files (`lib/landing/content.ts`, `app/page.tsx`) run `perl -CSD -i -pe "s/'/\x{2019}/g" <file>` then verify. Delimit FR string values with double quotes so bare apostrophes are valid.
- **Never use legacy `cleared/boarding/stamp/paper` classes** in the new landing. Tailwind config is NOT modified.
- Accent blue `#2456E6`; navy `#10203F`; secondary text `#5B6B8C`; see spec "Design tokens".
- CTAs: *Démarrer gratuitement* → `/signup`; *Connexion* → `/login`; *Fonctionnalités* → `#features`.
- Verifying gate before merge: `pnpm lint` · `pnpm test` · `pnpm build`, all green, + apostrophe/accent audit.

---

### Task 1: Bilingual content dictionary

**Files:**
- Modify (full rewrite): `lib/landing/content.ts`
- Test: `lib/landing/__tests__/content.test.ts` (create)

**Interfaces:**
- Produces: `type Lang = 'fr' | 'en'`; `type MockStatus`; `interface LandingContent`; `const landingContent: Record<Lang, LandingContent>`.

- [ ] **Step 1: Write `lib/landing/content.ts`** (full replacement — delete all legacy interfaces/exports)

```ts
export type Lang = 'fr' | 'en'
export type MockStatus = 'complete' | 'pending' | 'review' | 'missing'

export interface MockRow {
  name: string
  app: MockStatus
  forms: MockStatus
  docs: MockStatus
  status: MockStatus
}

export interface LandingContent {
  nav: { features: string; login: string; demo: string }
  hero: {
    eyebrow: string
    title: string
    sub: string
    ctaPrimary: string
    note: string
    trust: string
    mock: {
      title: string
      countLabel: string
      cols: string[]
      rows: MockRow[]
      statusLabels: Record<MockStatus, string>
    }
  }
  features: { eyebrow: string; title: string; pillars: { tag: string; title: string; body: string }[] }
  how: { eyebrow: string; title: string; steps: { n: string; title: string; body: string }[]; note: string }
  testimonial: { quote: string; name: string; org: string }
  cta: { title: string; body: string; primary: string }
  footerTag: string
}

const rows: MockRow[] = [
  { name: "Camille Laurent", app: "complete", forms: "complete", docs: "complete", status: "complete" },
  { name: "Yanis Benali", app: "complete", forms: "pending", docs: "missing", status: "pending" },
  { name: "Léa Moreau", app: "complete", forms: "complete", docs: "review", status: "review" },
  { name: "Tom Rousseau", app: "complete", forms: "missing", docs: "missing", status: "missing" },
  { name: "Inès Garcia", app: "complete", forms: "complete", docs: "complete", status: "complete" },
]

export const landingContent: Record<Lang, LandingContent> = {
  fr: {
    nav: { features: "Fonctionnalités", login: "Connexion", demo: "Démarrer gratuitement" },
    hero: {
      eyebrow: "Pour les organisateurs d'échanges scolaires",
      title: "Arrêtez de courir après les dossiers.",
      sub: "Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.",
      ctaPrimary: "Démarrer gratuitement",
      note: "Premier échange offert · sans carte bancaire",
      trust: "Adopté par les organisateurs d'échanges partout en France.",
      mock: {
        title: "Session · Automne 2026",
        countLabel: "5 élèves",
        cols: ["Élève", "Candidature", "Formulaires", "Documents", "Statut"],
        rows,
        statusLabels: { complete: "Complet", pending: "En attente", review: "À vérifier", missing: "Manquant" },
      },
    },
    features: {
      eyebrow: "Ce que vous gérez",
      title: "Tout le dossier de l'élève, au même endroit.",
      pillars: [
        { tag: "Candidatures", title: "Candidatures", body: "Collectez et suivez chaque candidature du premier contact à la sélection, sans tableur." },
        { tag: "Formulaires", title: "Formulaires", body: "Des formulaires en ligne que les familles remplissent correctement du premier coup, avec validation automatique." },
        { tag: "Documents", title: "Documents", body: "Passeports, autorisations parentales, visas : demandés, reçus, vérifiés et validés sans effort." },
      ],
    },
    how: {
      eyebrow: "Comment ça marche",
      title: "Quatre étapes, aucune relance oubliée.",
      steps: [
        { n: "01", title: "Envoyez", body: "Diffusez la candidature via un lien unique." },
        { n: "02", title: "Sélectionnez", body: "Étudiez les candidats et acceptez ou refusez." },
        { n: "03", title: "Collectez", body: "Recevez formulaires et documents des élèves acceptés." },
        { n: "04", title: "Validez", body: "Vérifiez et validez le dossier complet." },
      ],
      note: "À chaque étape, les élèves sont relancés automatiquement — avec la liste précise de ce qui manque et des échéances claires.",
    },
    testimonial: {
      quote: "Avant, je passais mes soirées à relancer les familles. Aujourd'hui, je vois d'un coup d'œil quels dossiers sont complets.",
      name: "Coordinatrice d'échanges",
      org: "Association d'échanges scolaires",
    },
    cta: {
      title: "Prêt à simplifier votre prochaine session ?",
      body: "Votre premier échange est offert — testez Eazyexchange sur une session complète. Sans carte bancaire, sans engagement.",
      primary: "Démarrer gratuitement",
    },
    footerTag: "La plateforme des organisateurs d'échanges scolaires.",
  },
  en: {
    nav: { features: "Features", login: "Log in", demo: "Start free" },
    hero: {
      eyebrow: "For school exchange program organizers",
      title: "Stop chasing down student files.",
      sub: "Eazyexchange centralizes your students' applications, forms, and documents — so every file is complete, on time, without endless follow-ups.",
      ctaPrimary: "Start free",
      note: "First exchange free · no credit card",
      trust: "Trusted by exchange organizers across France.",
      mock: {
        title: "Session · Fall 2026",
        countLabel: "5 students",
        cols: ["Student", "Application", "Forms", "Documents", "Status"],
        rows,
        statusLabels: { complete: "Complete", pending: "Pending", review: "Review", missing: "Missing" },
      },
    },
    features: {
      eyebrow: "What you manage",
      title: "The whole student file, in one place.",
      pillars: [
        { tag: "Applications", title: "Applications", body: "Collect and track every application from first contact to selection — no spreadsheet." },
        { tag: "Forms", title: "Forms", body: "Online forms families fill out correctly the first time, with automatic validation." },
        { tag: "Documents", title: "Documents", body: "Passports, parental consent, visas: requested, received, checked, and approved effortlessly." },
      ],
    },
    how: {
      eyebrow: "How it works",
      title: "Four steps, not a single missed follow-up.",
      steps: [
        { n: "01", title: "Send", body: "Share the application via a unique link." },
        { n: "02", title: "Review", body: "Review applicants and accept or decline." },
        { n: "03", title: "Collect", body: "Receive forms and documents from accepted students." },
        { n: "04", title: "Approve", body: "Check and approve the completed file." },
      ],
      note: "At every step, students are reminded automatically — with the exact list of what's missing and clear deadlines.",
    },
    testimonial: {
      quote: "I used to spend my evenings chasing families. Now I can see at a glance which files are complete.",
      name: "Exchange Coordinator",
      org: "School exchange association",
    },
    cta: {
      title: "Ready to simplify your next session?",
      body: "Your first exchange is on us — try Eazyexchange across a full session. No credit card, no commitment.",
      primary: "Start free",
    },
    footerTag: "The platform for school exchange organizers.",
  },
}
```

- [ ] **Step 2: Apostrophe fix** — `perl -CSD -i -pe "s/'/\x{2019}/g" lib/landing/content.ts`, then `grep -c "’" lib/landing/content.ts` (expect ≥ 8) and confirm no bare `'` remains in values.
- [ ] **Step 3: Write parity test** `lib/landing/__tests__/content.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'

describe('landingContent', () => {
  it('fr and en share the same shape', () => {
    const { fr, en } = landingContent
    expect(Object.keys(fr.nav).sort()).toEqual(Object.keys(en.nav).sort())
    expect(fr.features.pillars).toHaveLength(3)
    expect(en.features.pillars).toHaveLength(3)
    expect(fr.how.steps).toHaveLength(4)
    expect(en.how.steps).toHaveLength(4)
    expect(fr.hero.mock.rows).toHaveLength(5)
    expect(en.hero.mock.rows).toHaveLength(5)
    expect(Object.keys(fr.hero.mock.statusLabels).sort())
      .toEqual(Object.keys(en.hero.mock.statusLabels).sort())
  })
  it('fr copy uses typographic apostrophes', () => {
    expect(landingContent.fr.features.title).toContain('’')
  })
})
```

- [ ] **Step 4:** `pnpm test lib/landing/__tests__/content.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(landing): bilingual FR/EN content dictionary`.

---

### Task 2: Logo + presentational sections

**Files (create):** `components/landing/Logo.tsx`, and rewrite `Hero.tsx`, `Features.tsx`, `HowItWorks.tsx`, `LandingNav.tsx`, `LandingFooter.tsx`; create `Testimonial.tsx`, `CtaBand.tsx`.
**Delete:** `components/landing/ProblemSolution.tsx`, `Pricing.tsx`, `BoardingManifest.tsx` and their `__tests__/*` (Features/Hero/HowItWorks/LandingFooter/LandingNav/ProblemSolution/Pricing tests all reference old props — remove all seven; new coverage is the Task 3 integration test).

**Interfaces:**
- `Logo({ size }: { size?: 'nav' | 'footer' })`.
- Each section takes exactly its dict slice: `Hero({ hero })`, `Features({ features })`, `HowItWorks({ how })`, `Testimonial({ testimonial })`, `CtaBand({ cta })`, `LandingNav({ nav, lang, setLanguage })`, `LandingFooter({ footerTag })`.

- [ ] **Step 1: `Logo.tsx`**

```tsx
export function Logo({ size = 'nav' }: { size?: 'nav' | 'footer' }) {
  const d = size === 'footer' ? { w: 26, h: 19, c: 15 } : { w: 30, h: 22, c: 18 }
  return (
    <span className="relative inline-block" style={{ width: d.w, height: d.h }} aria-hidden>
      <span className="absolute left-0 top-0 rounded-full bg-[#10203F]" style={{ width: d.c, height: d.c }} />
      <span className="absolute bottom-0 right-0 rounded-full bg-[#2456E6]" style={{ width: d.c, height: d.c, mixBlendMode: 'multiply' }} />
    </span>
  )
}
```

- [ ] **Step 2: `LandingNav.tsx`**

```tsx
import Link from 'next/link'
import { Logo } from './Logo'
import type { Lang, LandingContent } from '@/lib/landing/content'

export function LandingNav({ nav, lang, setLanguage }: {
  nav: LandingContent['nav']; lang: Lang; setLanguage: (l: Lang) => void
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#EEF1F7] bg-white/[.86] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[18px] font-bold text-[#10203F]">Eazyexchange</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-7">
          <a href="#features" className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline">{nav.features}</a>
          <Link href="/login" className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline">{nav.login}</Link>
          <div className="flex gap-0.5 rounded-lg bg-[#F1F4F9] p-[3px]">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLanguage(l)} aria-pressed={lang === l}
                className={`rounded-md px-3.5 py-1.5 font-mono text-[12px] font-semibold uppercase transition-colors ${lang === l ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>
                {l}
              </button>
            ))}
          </div>
          <Link href="/signup" className="rounded-lg bg-[#10203F] px-[18px] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110">{nav.demo}</Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: `Hero.tsx`**

```tsx
import Link from 'next/link'
import type { LandingContent, MockStatus } from '@/lib/landing/content'

const STATUS_STYLE: Record<MockStatus, { fg: string; bg: string }> = {
  complete: { fg: '#0F7A3D', bg: '#E4F5EA' },
  pending: { fg: '#9A6A0B', bg: '#FBF0D9' },
  review: { fg: '#1D48C7', bg: '#E6ECFD' },
  missing: { fg: '#C0392B', bg: '#FBE7E4' },
}

export function Hero({ hero }: { hero: LandingContent['hero'] }) {
  const { mock } = hero
  const cols = 'grid-cols-[1.35fr_.95fr_1.05fr_1.05fr_.95fr]'
  return (
    <section className="mx-auto grid max-w-[1180px] items-center gap-14 px-6 pb-[72px] pt-20 sm:px-10 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <p className="mb-[22px] font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">{hero.eyebrow}</p>
        <h1 className="mb-[22px] font-display text-[40px] font-bold leading-[1.04] tracking-[-.025em] text-[#10203F] sm:text-[56px]">{hero.title}</h1>
        <p className="mb-8 max-w-[480px] text-[18px] leading-[1.6] text-[#5B6B8C]">{hero.sub}</p>
        <div className="flex flex-wrap items-center gap-3.5">
          <Link href="/signup" className="rounded-[9px] bg-[#2456E6] px-[26px] py-[15px] text-[15px] font-semibold text-white transition hover:brightness-110">{hero.ctaPrimary}</Link>
          <span className="text-[13px] font-medium text-[#5B6B8C]">{hero.note}</span>
        </div>
        <p className="mt-[26px] text-[13px] font-medium text-[#8A97B2]">{hero.trust}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#E4E9F2] bg-white shadow-[0_30px_70px_-34px_rgba(16,32,63,.4)]">
        <div className="flex items-center justify-between border-b border-[#EEF1F7] bg-[#FBFCFE] px-5 py-[15px]">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2456E6]" />
            <span className="text-[13px] font-semibold text-[#10203F]">{mock.title}</span>
          </div>
          <span className="font-mono text-[11px] font-medium text-[#8A97B2]">{mock.countLabel}</span>
        </div>
        <div className={`grid ${cols} gap-2 border-b border-[#F1F4F9] px-4 py-3`}>
          {mock.cols.map((c) => (
            <span key={c} className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-[#9AA6C0]">{c}</span>
          ))}
        </div>
        {mock.rows.map((row) => (
          <div key={row.name} className={`grid ${cols} items-center gap-2 border-b border-[#F4F6FB] px-4 py-[13px]`}>
            <span className="text-[13px] font-semibold text-[#10203F]">{row.name}</span>
            {([row.app, row.forms, row.docs, row.status] as MockStatus[]).map((s, i) => (
              <span key={i} className="inline-flex justify-self-start whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-semibold"
                style={{ background: STATUS_STYLE[s].bg, color: STATUS_STYLE[s].fg }}>
                {mock.statusLabels[s]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: `Features.tsx`**

```tsx
import type { LandingContent } from '@/lib/landing/content'

export function Features({ features }: { features: LandingContent['features'] }) {
  return (
    <section id="features" className="mx-auto max-w-[1180px] scroll-mt-20 px-6 pb-[72px] pt-6 sm:px-10">
      <p className="mb-4 font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">{features.eyebrow}</p>
      <h2 className="mb-11 max-w-[640px] font-display text-[34px] font-bold leading-[1.1] tracking-[-.02em] text-[#10203F]">{features.title}</h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {features.pillars.map((p, i) => (
          <div key={p.title} className="rounded-[14px] border border-[#E4E9F2] bg-[#FBFCFE] p-[30px]">
            <p className="mb-[18px] font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-[#2456E6]">{String(i + 1).padStart(2, '0')} · {p.tag}</p>
            <h3 className="mb-2.5 font-display text-[21px] font-semibold text-[#10203F]">{p.title}</h3>
            <p className="text-[15px] leading-[1.6] text-[#5B6B8C]">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: `HowItWorks.tsx`** (note glyph via `&#8635;` to avoid encoding issues)

```tsx
import type { LandingContent } from '@/lib/landing/content'

export function HowItWorks({ how }: { how: LandingContent['how'] }) {
  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-20 sm:px-10">
      <p className="mb-4 font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">{how.eyebrow}</p>
      <h2 className="mb-10 max-w-[640px] font-display text-[34px] font-bold leading-[1.1] tracking-[-.02em] text-[#10203F]">{how.title}</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {how.steps.map((st) => (
          <div key={st.n} className="border-t-2 border-[#2456E6] pt-[18px]">
            <p className="mb-3.5 font-mono text-[13px] font-semibold text-[#9AA6C0]">{st.n}</p>
            <h3 className="mb-2 font-display text-[18px] font-semibold text-[#10203F]">{st.title}</h3>
            <p className="text-[14px] leading-[1.55] text-[#5B6B8C]">{st.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center gap-4 rounded-[14px] border border-[#E4E9F2] bg-[#F5F7FC] px-[26px] py-[22px]">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[#2456E6] text-[18px] font-semibold text-white" aria-hidden>&#8635;</span>
        <p className="max-w-[820px] text-[15px] font-medium leading-[1.5] text-[#10203F]">{how.note}</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: `Testimonial.tsx`** (quotes via `&ldquo;`/`&rdquo;`)

```tsx
import type { LandingContent } from '@/lib/landing/content'

export function Testimonial({ testimonial }: { testimonial: LandingContent['testimonial'] }) {
  return (
    <section className="border-y border-[#EEF1F7] bg-[#F5F7FC]">
      <div className="mx-auto max-w-[1180px] px-6 py-16 text-center sm:px-10">
        <p className="mx-auto mb-6 max-w-[760px] font-display text-[27px] font-medium leading-[1.45] tracking-[-.01em] text-[#10203F]">&ldquo;{testimonial.quote}&rdquo;</p>
        <div className="inline-flex items-center gap-3">
          <span className="h-10 w-10 rounded-full bg-[linear-gradient(135deg,#2456E6,#10203F)]" aria-hidden />
          <div className="text-left">
            <p className="text-[14px] font-semibold text-[#10203F]">{testimonial.name}</p>
            <p className="text-[13px] text-[#8A97B2]">{testimonial.org}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 7: `CtaBand.tsx`**

```tsx
import Link from 'next/link'
import type { LandingContent } from '@/lib/landing/content'

export function CtaBand({ cta }: { cta: LandingContent['cta'] }) {
  return (
    <section className="bg-[#10203F]">
      <div className="mx-auto max-w-[1180px] px-6 py-20 text-center sm:px-10">
        <h2 className="mb-3.5 font-display text-[38px] font-bold leading-[1.1] tracking-[-.02em] text-white">{cta.title}</h2>
        <p className="mx-auto mb-[30px] max-w-[520px] text-[17px] leading-[1.6] text-[#9FB0D6]">{cta.body}</p>
        <Link href="/signup" className="inline-block rounded-[9px] bg-[#2456E6] px-8 py-4 text-[16px] font-semibold text-white transition hover:brightness-110">{cta.primary}</Link>
      </div>
    </section>
  )
}
```

- [ ] **Step 8: `LandingFooter.tsx`**

```tsx
import { Logo } from './Logo'
import type { LandingContent } from '@/lib/landing/content'

export function LandingFooter({ footerTag }: { footerTag: LandingContent['footerTag'] }) {
  return (
    <footer className="mx-auto flex max-w-[1180px] flex-col items-center gap-3 px-6 py-7 text-center sm:flex-row sm:justify-between sm:px-10 sm:text-left">
      <div className="flex items-center gap-2.5">
        <Logo size="footer" />
        <span className="font-display text-[14px] font-semibold text-[#10203F]">Eazyexchange</span>
      </div>
      <span className="text-[13px] text-[#8A97B2]">{footerTag}</span>
    </footer>
  )
}
```

- [ ] **Step 9: Delete** legacy files: `git rm components/landing/{ProblemSolution,Pricing,BoardingManifest}.tsx components/landing/__tests__/{ProblemSolution,Pricing,Features,Hero,HowItWorks,LandingFooter,LandingNav}.test.tsx`.
- [ ] **Step 10:** `npx tsc --noEmit` → no errors from these files (they're not yet wired; `app/page.tsx` still imports old names — that breaks tsc until Task 4; acceptable mid-task). Commit `feat(landing): design-system sections + logo`.

---

### Task 3: LandingPage client wrapper + integration test

**Files:** Create `components/landing/LandingPage.tsx`, `components/landing/__tests__/LandingPage.test.tsx`.

**Interfaces:**
- Consumes: all Task 2 sections + `landingContent`, `Lang`.
- Produces: `export function LandingPage()` (client, no props).

- [ ] **Step 1: `LandingPage.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { landingContent, type Lang } from '@/lib/landing/content'
import { LandingNav } from './LandingNav'
import { Hero } from './Hero'
import { Features } from './Features'
import { HowItWorks } from './HowItWorks'
import { Testimonial } from './Testimonial'
import { CtaBand } from './CtaBand'
import { LandingFooter } from './LandingFooter'

export function LandingPage() {
  const [lang, setLang] = useState<Lang>('fr')

  useEffect(() => {
    const stored = window.localStorage.getItem('ee_lang')
    if (stored === 'fr' || stored === 'en') setLang(stored)
  }, [])

  const setLanguage = (l: Lang) => {
    setLang(l)
    try { window.localStorage.setItem('ee_lang', l) } catch { /* private mode */ }
  }

  const t = landingContent[lang]

  return (
    <div className="min-h-screen bg-white font-sans text-[#10203F]">
      <LandingNav nav={t.nav} lang={lang} setLanguage={setLanguage} />
      <main>
        <Hero hero={t.hero} />
        <Features features={t.features} />
        <HowItWorks how={t.how} />
        <Testimonial testimonial={t.testimonial} />
        <CtaBand cta={t.cta} />
      </main>
      <LandingFooter footerTag={t.footerTag} />
    </div>
  )
}
```

- [ ] **Step 2: `LandingPage.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LandingPage } from '@/components/landing/LandingPage'

describe('LandingPage', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders French by default', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Arrêtez')
  })

  it('switches to English and persists the choice', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /^en$/i }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Stop chasing')
    expect(window.localStorage.getItem('ee_lang')).toBe('en')
  })

  it('hydrates the stored language on mount', () => {
    window.localStorage.setItem('ee_lang', 'en')
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Stop chasing')
  })

  it('primary CTAs link to /signup and login link to /login', () => {
    render(<LandingPage />)
    const ctas = screen.getAllByRole('link', { name: /Démarrer gratuitement/i })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    ctas.forEach((l) => expect(l.getAttribute('href')).toBe('/signup'))
    expect(screen.getByRole('link', { name: /Connexion/i }).getAttribute('href')).toBe('/login')
  })

  it('features nav link targets the #features anchor', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: /Fonctionnalités/i }).getAttribute('href')).toBe('#features')
  })
})
```

- [ ] **Step 3:** `pnpm test components/landing/__tests__/LandingPage.test.tsx` → PASS. Commit `feat(landing): LandingPage client wrapper with FR/EN toggle`.

---

### Task 4: Wire `app/page.tsx` + metadata, verify whole page

**Files:** Modify `app/page.tsx`; update `app/__tests__/page.test.tsx` if it references old landing structure.

- [ ] **Step 1: Rewrite `app/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: "Eazyexchange — La plateforme des organisateurs d'échanges scolaires",
  description:
    "Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.",
}

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()
    redirect(profile?.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  return <LandingPage />
}
```

- [ ] **Step 2: Apostrophe fix** on `app/page.tsx` — `perl -CSD -i -pe "s/'/\x{2019}/g" app/page.tsx` (only the two metadata strings contain `'`), then verify `grep "d’échanges" app/page.tsx` matches.
- [ ] **Step 3:** Inspect `app/__tests__/page.test.tsx`; if it asserts old landing copy/structure, update it to assert the redirect behavior or the presence of `LandingPage` (French H1 "Arrêtez"). If it only mocks Supabase + checks redirect, leave it.
- [ ] **Step 4: Full verify:** `pnpm lint` (clean bar pre-existing apple-icon warning) · `pnpm test` (all green) · `pnpm build` (tsc + build pass; `/` stays dynamic ƒ due to `getUser()`).
- [ ] **Step 5: Apostrophe/accent audit** across new files: `grep -rnP "[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]" lib/landing/content.ts app/page.tsx` returns nothing (all apostrophes are U+2019, not ASCII); confirm accented chars intact (`grep -c "é" lib/landing/content.ts`).
- [ ] **Step 6: Commit** `feat(landing): wire design-system bilingual landing + FR metadata`.

---

## Self-Review

- **Spec coverage:** nav/hero/features/how/testimonial/cta/footer → Task 2; bilingual toggle + localStorage → Task 3; dict + parity → Task 1; auth redirect + metadata + deletions → Tasks 2/4. No pricing (dropped per decision). ✔
- **Placeholders:** none — all code is complete.
- **Type consistency:** `LandingContent` slices consumed by sections match Task 1 definitions; `MockStatus` used in Hero matches dict; `setLanguage: (l: Lang) => void` consistent nav↔LandingPage. ✔
- **Apostrophe risk** addressed in Global Constraints + Task 1 Step 2 + Task 4 Step 2/5.

## Post-implementation (user-gated)

Verifying gate green → `finishing-a-development-branch`: merge `--no-ff` to `main` + push (= prod deploy, **no db push**). Requires Bjorn's confirmation. Optional browser spot-check of `/` first (FR default, EN toggle+persist, `#features` scroll, responsive).
