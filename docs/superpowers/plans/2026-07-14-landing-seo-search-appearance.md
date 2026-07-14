# Landing SEO & Search Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EazyExchange present correctly in Google search results and link-share previews — untruncated title, a declared logo (structured data + robust raster favicon), and Open Graph share cards — plus a Search Console runbook so Bjorn can accelerate indexing.

**Architecture:** Purely additive edits to the public landing page's metadata and the App Router icon/OG file-convention routes, reusing the existing `next/og` `ImageResponse` pattern from `app/apple-icon.tsx` and the exact brand tile. Structured-data JSON is a pure, unit-tested function injected as an inline `<script>`. No schema, RLS, auth, or data-fetch changes; the landing page stays synchronous and prerenderable.

**Tech Stack:** Next.js 15.5.20 App Router, `next/og` (`ImageResponse`), TypeScript, Vitest, Tailwind (unchanged), schema.org JSON-LD.

## Global Constraints

- **No migration, no RLS change, no storage bucket** → `pnpm test:rls` is **not** required for this work.
- **The landing page (`app/page.tsx`) must stay synchronous and free of auth/DB reads** — this is what lets Next prerender it so anonymous visitors pay no cold start. JSON-LD is static markup only.
- **Brand tile reused verbatim** (matches `app/apple-icon.tsx` / `app/icon.svg`): `viewBox="0 0 64 64"`, navy rounded rect `rect width=64 height=64 rx=14 fill="#10203F"`, white circle `cx=25 cy=25 r=13 fill="#FFFFFF"`, blue circle `cx=39 cy=39 r=13 fill="#3B6EF6"`.
- **Chosen title (verbatim):** `Eazyexchange — Gérez les dossiers d'échanges scolaires` (~54 chars; must keep the phrase `échanges scolaires`; keep ≤ 60 chars).
- **Canonical base URL expression (verbatim, matches `app/sitemap.ts` / `app/robots.ts` / `app/layout.tsx`):** `process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'`. Do **not** use `getAppUrl()` here — that returns preview/localhost hosts; SEO metadata must be canonical.
- **Package manager is `pnpm`.**
- **Work on a branch** `feature/landing-seo` (multi-step, multi-file — per the project Git workflow). Do not push/merge; that's Bjorn's step.
- **Final gate for every task:** `pnpm lint && pnpm test && pnpm build` all green.

---

### Task 1: Untruncated title + Open Graph / Twitter metadata

**Files:**
- Modify: `app/page.tsx` (the `metadata` export)
- Test: `app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `metadata` export on `app/page.tsx` with `.title` (string, the chosen title), `.description`, `.openGraph`, `.twitter`. The OG/Twitter **image** is supplied later by file convention (Task 2) — no image URL is hand-written here.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `app/__tests__/page.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest'
import RootPage, { metadata } from '@/app/page'
import { LandingPage } from '@/components/landing/LandingPage'

describe('RootPage metadata', () => {
  it('has a title short enough to survive Google truncation, keeping the key phrase', () => {
    const title = metadata.title as string
    expect(typeof title).toBe('string')
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title).toContain('échanges scolaires')
  })

  it('declares Open Graph and a large-image Twitter card', () => {
    expect(metadata.openGraph).toBeDefined()
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.twitter).toBeDefined()
    expect((metadata.twitter as { card?: string }).card).toBe('summary_large_image')
  })
})

// Unchanged from the original test — RootPage still returns <LandingPage/> after
// this task. Task 4 rewrites this spec when RootPage gains the JSON-LD fragment.
describe('RootPage', () => {
  it('renders the landing page unconditionally', () => {
    const result = RootPage()
    expect(result.type).toBe(LandingPage)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- app/__tests__/page.test.tsx`
Expected: FAIL — current title is 66 chars (`>60`) and `metadata.openGraph`/`twitter` are undefined. The `RootPage` render spec passes (unchanged behaviour).

- [ ] **Step 3: Rewrite `app/page.tsx` metadata**

Replace the file's top (imports + `metadata`) so the title/description are defined once (DRY) and reused across `openGraph`/`twitter`. Leave `RootPage` as-is for now (Task 4 wraps it):

```tsx
import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

const title = "Eazyexchange — Gérez les dossiers d'échanges scolaires"
const description =
  'Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: baseUrl,
    siteName: 'EazyExchange',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

// No auth calls here — the logged-in redirect happens in middleware.ts. Keeping
// this component synchronous and dependency-free is what lets Next prerender the
// landing page so anonymous visitors never pay a function cold start.
export default function RootPage() {
  return <LandingPage />
}
```

- [ ] **Step 4: Run the page tests to verify they pass**

Run: `pnpm test -- app/__tests__/page.test.tsx`
Expected: PASS — both new metadata specs and the unchanged `RootPage` render spec.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat(seo): shorten landing title, add Open Graph + Twitter metadata"
```

---

### Task 2: Open Graph / Twitter share image

**Files:**
- Create: `app/opengraph-image.tsx`
- Create: `app/twitter-image.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: file-convention routes at `/opengraph-image` and `/twitter-image` (1200×630 PNG). Next auto-wires `og:image` and `twitter:image` onto every page under `app/` (including `/`), complementing Task 1's metadata. No code imports these.

- [ ] **Step 1: Create `app/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og'

export const alt = "EazyExchange — Gérez les dossiers d'échanges scolaires"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Same brand tile as app/apple-icon.tsx / app/icon.tsx, rendered larger.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#10203F"/><circle cx="25" cy="25" r="13" fill="#FFFFFF"/><circle cx="39" cy="39" r="13" fill="#3B6EF6"/></svg>`

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#10203F',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <img
          width={140}
          height={140}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(tile)}`}
          alt=""
        />
        <div style={{ marginTop: 48, fontSize: 68, fontWeight: 700, letterSpacing: -1 }}>
          EazyExchange
        </div>
        <div style={{ marginTop: 20, fontSize: 36, color: '#9DB2D9', maxWidth: 900 }}>
          Gérez les dossiers d’échanges scolaires — complets, à temps, sans relances.
        </div>
      </div>
    ),
    { ...size },
  )
}
```

- [ ] **Step 2: Create `app/twitter-image.tsx` (re-export, DRY)**

```tsx
export { default, alt, size, contentType } from './opengraph-image'
```

- [ ] **Step 3: Verify the routes build**

Run: `pnpm build`
Expected: PASS. In the route list, `○ /opengraph-image` and `○ /twitter-image` appear. (These `ImageResponse` routes have no vitest test — they mirror `app/apple-icon.tsx`, which also has none; `pnpm build` compiling them is the gate. Post-deploy, Bjorn validates the rendered card in a share debugger per the runbook.)

- [ ] **Step 4: Commit**

```bash
git add app/opengraph-image.tsx app/twitter-image.tsx
git commit -m "feat(seo): add generated Open Graph / Twitter share image"
```

---

### Task 3: Robust raster favicon

**Files:**
- Create: `app/icon.tsx`
- Delete: `app/icon.svg`

**Interfaces:**
- Consumes: nothing.
- Produces: a raster favicon served at `/icon` (192×192 PNG). This URL is also referenced by the JSON-LD `logo` in Task 4, so the path `/icon` returning `image/png` is a contract Task 4 depends on.

Rationale: Google's search-result favicon prefers a square raster that is a multiple of 48px (192 = 48×4, and ≥112 so it also qualifies as the Organization logo). SVG-only is laggy for new domains. Replacing (not adding alongside) avoids an App Router `icon.svg`/`icon.tsx` name collision. **Honest note for the reviewer:** this makes the favicon *eligible/robust*; the reason it isn't showing yet is new-domain crawl lag, which Task 5 (Search Console) addresses.

- [ ] **Step 1: Delete the SVG favicon**

```bash
git rm app/icon.svg
```

- [ ] **Step 2: Create `app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

// Same brand tile as app/apple-icon.tsx.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#10203F"/><circle cx="25" cy="25" r="13" fill="#FFFFFF"/><circle cx="39" cy="39" r="13" fill="#3B6EF6"/></svg>`

export default function Icon() {
  return new ImageResponse(
    (
      <img
        width={192}
        height={192}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(tile)}`}
        alt=""
      />
    ),
    { ...size },
  )
}
```

- [ ] **Step 3: Verify the favicon builds and is a raster PNG route**

Run: `pnpm build`
Expected: PASS, and the route list shows `○ /icon` (no longer a static `icon.svg`). The emitted `<link rel="icon">` will carry `type="image/png"`.

- [ ] **Step 4: Commit**

```bash
git add app/icon.tsx
git commit -m "feat(seo): ship raster (PNG) favicon for Google search results"
```

---

### Task 4: Organization structured data (JSON-LD)

**Files:**
- Create: `lib/seo/structured-data.ts`
- Create: `lib/seo/__tests__/structured-data.test.ts`
- Modify: `app/page.tsx` (wrap render output with the JSON-LD `<script>`)
- Test: `app/__tests__/page.test.tsx` (already updated in Task 1; the "RootPage render" spec now passes)

**Interfaces:**
- Consumes: the `/icon` raster route from Task 3 (used as `logo`); the canonical base URL expression.
- Produces: `organizationJsonLd(baseUrl: string): Record<string, unknown>` — a schema.org `Organization` object with `@context`, `@type: 'Organization'`, `name`, `alternateName`, `url`, `logo`, `description`.

- [ ] **Step 1: Write the failing test for the data function**

Create `lib/seo/__tests__/structured-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { organizationJsonLd } from '@/lib/seo/structured-data'

describe('organizationJsonLd', () => {
  const ld = organizationJsonLd('https://eazyexchange.com')

  it('is a schema.org Organization', () => {
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('Organization')
  })

  it('carries the brand name and canonical url', () => {
    expect(ld.name).toBe('EazyExchange')
    expect(ld.url).toBe('https://eazyexchange.com')
  })

  it('declares an absolute raster logo Google can crawl', () => {
    expect(ld.logo).toBe('https://eazyexchange.com/icon')
  })

  it('has a non-empty description', () => {
    expect(typeof ld.description).toBe('string')
    expect((ld.description as string).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- lib/seo/__tests__/structured-data.test.ts`
Expected: FAIL with "Cannot find module '@/lib/seo/structured-data'".

- [ ] **Step 3: Create `lib/seo/structured-data.ts`**

```ts
// schema.org Organization block for the public landing page. Injected as an
// inline <script type="application/ld+json"> so Google can attribute a name and
// logo to the domain (search-result logo + future knowledge panel). Pure and
// synchronous — no data fetch — so the landing page stays prerenderable.
export function organizationJsonLd(baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'EazyExchange',
    alternateName: 'Eazyexchange',
    url: baseUrl,
    // Raster PNG favicon route (app/icon.tsx) — a real image Google can fetch.
    logo: `${baseUrl}/icon`,
    description:
      'Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.',
  }
}
```

- [ ] **Step 4: Run the data test to verify it passes**

Run: `pnpm test -- lib/seo/__tests__/structured-data.test.ts`
Expected: PASS (4 specs).

- [ ] **Step 5: Wire the JSON-LD into `app/page.tsx`**

Update the import block and `RootPage` (keep the `metadata` block from Task 1 unchanged):

```tsx
import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import { organizationJsonLd } from '@/lib/seo/structured-data'
```

```tsx
// No auth calls here — the logged-in redirect happens in middleware.ts. Keeping
// this component synchronous and dependency-free is what lets Next prerender the
// landing page so anonymous visitors never pay a function cold start. The
// JSON-LD below is static markup, not a data fetch.
export default function RootPage() {
  const jsonLd = organizationJsonLd(baseUrl)
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  )
}
```

(`baseUrl` is already defined at module top from Task 1.)

- [ ] **Step 6: Update the render spec in `app/__tests__/page.test.tsx`**

`RootPage` now returns a fragment, so `result.type === LandingPage` is no longer
true. Replace the `describe('RootPage', ...)` block (leave the
`describe('RootPage metadata', ...)` block from Task 1 untouched) with one that
asserts both the landing page and the JSON-LD are rendered:

```tsx
describe('RootPage', () => {
  it('renders the landing page with Organization JSON-LD', () => {
    const result = RootPage()
    const children = ([] as unknown[]).concat(result.props.children)
    expect(children.some((c) => (c as { type?: unknown })?.type === LandingPage)).toBe(true)
    const script = children.find(
      (c) => (c as { props?: { type?: string } })?.props?.type === 'application/ld+json',
    )
    expect(script).toBeDefined()
  })
})
```

- [ ] **Step 7: Run the full page test suite to verify everything passes**

Run: `pnpm test -- app/__tests__/page.test.tsx`
Expected: PASS — metadata specs plus the updated render spec, which finds both `LandingPage` and the `application/ld+json` script among the fragment's children.

- [ ] **Step 8: Commit**

```bash
git add lib/seo/structured-data.ts lib/seo/__tests__/structured-data.test.ts app/page.tsx app/__tests__/page.test.tsx
git commit -m "feat(seo): add Organization JSON-LD declaring name and logo"
```

---

### Task 5: Google Search Console runbook

**Files:**
- Create: `docs/seo/search-console.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Create `docs/seo/search-console.md`**

```markdown
# Google Search Console runbook (eazyexchange.com)

Search Console is the single biggest lever for two of the search complaints:
ranking for the brand word "eazyexchange" and getting the favicon/logo to show.
Code (title, structured data, raster favicon, Open Graph) removes the blockers
and hands Google correct signals; Search Console is how you tell Google to
re-crawl now and how the brand/logo signals surface fastest. These steps are
manual (they need DNS + Google account access) — they are not automated.

## One-time setup

1. Go to https://search.google.com/search-console and add a **Domain** property
   for `eazyexchange.com` (domain property, not URL-prefix — it covers www and
   all paths).
2. Google shows a **TXT record** to add for verification. Add it in
   **Cloudflare → DNS** (this project's DNS is at Cloudflare, grey-cloud):
   type `TXT`, name `@`, value = the string Google gives. Save, then click
   **Verify** in Search Console (DNS can take a few minutes to propagate).
3. Under **Sitemaps**, submit: `https://eazyexchange.com/sitemap.xml`.

## After each production deploy that changes SEO metadata

1. Open **URL Inspection**, enter `https://eazyexchange.com/`, and click
   **Request Indexing**. Repeat for `https://eazyexchange.com/signup`.
2. This forces a re-crawl so the new `<title>`, JSON-LD, and PNG favicon are
   picked up sooner than the natural crawl cadence.

## Expectations (be patient)

- **Brand ranking** for the bare word "eazyexchange" climbs over days/weeks as
  Google builds trust in a new domain (live since ~2026-07-05). No code or
  Search Console action forces a #1 result immediately; requesting indexing and
  accruing any inbound links is the accelerant.
- **The favicon/logo** in search results typically lags several crawls behind
  indexing even once the raster favicon and Organization JSON-LD are live.
  Confirm the favicon is fetchable at `https://eazyexchange.com/icon` and valid
  in the Rich Results Test; then wait for re-crawl.

## Verification tools

- **Rich Results Test:** https://search.google.com/test/rich-results — paste the
  homepage URL; confirm the `Organization` block parses with a `logo`.
- **Share preview:** paste `https://eazyexchange.com` into any link debugger
  (e.g. a Slack/LinkedIn message draft) and confirm the Open Graph card renders
  the navy image with the wordmark.
```

- [ ] **Step 2: Commit**

```bash
git add docs/seo/search-console.md
git commit -m "docs(seo): Google Search Console verification + indexing runbook"
```

---

## Final verification

- [ ] **Run the full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: lint clean, all vitest suites pass, build succeeds with `/icon`, `/opengraph-image`, and `/twitter-image` in the route list.

- [ ] **Confirm the served head locally (optional sanity check)**

Run: `pnpm build && pnpm start` then in another shell:
`curl -s http://localhost:3000 | grep -iE '<title>|og:|twitter:|application/ld|rel="icon"'`
Expected: the new ~54-char title, `og:*` + `twitter:*` tags, an `application/ld+json` script, and a `rel="icon"` with `type="image/png"`.

- [ ] **Hand-off note for Bjorn (not code):** after merge + prod deploy, run the `docs/seo/search-console.md` runbook (verify domain, submit sitemap, request indexing) — that is what accelerates ranking and the favicon.

## Self-review notes

- **Spec coverage:** title fix → Task 1; Organization JSON-LD → Task 4; raster favicon → Task 3; OG image + tags → Tasks 1+2; Search Console runbook → Task 5. All five spec parts covered.
- **`test:rls`:** correctly omitted — no migration/RLS/bucket touched.
- **Type/name consistency:** `organizationJsonLd(baseUrl)` defined in Task 4 and consumed only there; `/icon` route produced in Task 3 and referenced as `logo` in Task 4; `baseUrl` defined once in `app/page.tsx` (Task 1) and reused in Task 4.
- **Prerenderability preserved:** `app/page.tsx` stays synchronous; JSON-LD is static markup.
