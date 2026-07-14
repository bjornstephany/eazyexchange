# Landing SEO & Search Appearance

**Date:** 2026-07-14
**Status:** Approved (design)
**Scope:** Additive metadata/asset changes to the public landing page + a Search
Console runbook. No schema migration, no RLS change, no auth surface.

## Problem

Three complaints about how EazyExchange appears in Google, diagnosed against
what production actually serves:

1. **"eazyexchange" does not rank on page 1.** The homepage *is* indexed
   (`eazyexchange.com` finds it), but the bare brand word does not rank yet.
   Root cause is new-domain authority + crawl lag (domain live ~2026-07-05),
   **not** a code defect. Code can only remove blockers and hand Google correct
   signals; ranking is time + trust.
2. **The truncated text in results is the `<title>`, not the description.**
   Production serves
   `Eazyexchange — La plateforme des organisateurs d'échanges scolaires`
   (66 chars). Google truncates titles at ~600px (~55–60 chars), so
   `…d'échanges scolaires` is chopped. Fully code-fixable.
3. **The logo does not appear** — two distinct surfaces:
   - **Google search favicon:** only an SVG favicon is shipped; Google supports
     SVG but is laggy/picky for new domains, and no `Organization` structured
     data declares a logo.
   - **Link-share previews:** no Open Graph image or tags at all, so shares in
     WhatsApp/LinkedIn/Slack/iMessage render no card.

## Current state (verified in prod)

- `app/layout.tsx` — English `title`/`description`, `metadataBase` set to
  `NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'`. No `openGraph`/`twitter`.
- `app/page.tsx` — French `title` (the 66-char one above) + French description.
  Prerendered, dependency-free (must stay synchronous for cold-start avoidance).
- `app/icon.svg` — brand tile: navy `#10203F` rounded rect, white circle
  `(25,25) r13`, blue `#3B6EF6` circle `(39,39) r13`, `viewBox 0 0 64 64`.
- `app/apple-icon.tsx` — 180×180 PNG via `next/og` `ImageResponse`, same tile.
- `app/robots.ts` / `app/sitemap.ts` — `/` and `/signup` public; everything
  else disallowed. Correct; no change needed.
- No JSON-LD anywhere; no `opengraph-image`/`twitter-image`.

## Design

Five parts. Brand palette and tile geometry reused verbatim from
`app/apple-icon.tsx` so every asset stays visually identical.

### 1. Title fix — `app/page.tsx`

Replace the `title` with (chosen: option B):

```
Eazyexchange — Gérez les dossiers d'échanges scolaires
```

~54 chars, brand-first (aids brand-name ranking), keyword phrase
*"échanges scolaires"* survives truncation. `description` unchanged.

### 2. Organization structured data (JSON-LD) — landing page

Inject a `<script type="application/ld+json">` on the landing page declaring a
schema.org `Organization`:

- `name` / `alternateName`: `"EazyExchange"` (+ `"Eazyexchange"`).
- `url`: the canonical base URL.
- `description`: the French one-liner.
- `logo`: **absolute** URL to a raster PNG logo (see part 3 — reuse the raster
  favicon endpoint / asset; must be a real crawlable raster image, not the SVG).
- `sameAs`: omitted/empty until social profiles exist.

Base URL derives from `NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'`
(same fallback already used across the app) so the block is correct in prod and
harmless on previews. Keep the landing page synchronous/prerenderable — the
script is static markup, no data fetch.

### 3. Robust raster favicon

Ship a **square raster icon (≥48px, PNG or ICO)** meeting Google's
search-favicon guidance, in addition to the existing SVG, generated from the
same brand tile (reuse the `apple-icon.tsx` `ImageResponse` approach or a static
asset — exact file mechanics decided in the plan; App Router icon-file naming
must not collide with `icon.svg`). The raster asset doubles as the JSON-LD
`logo` target from part 2 (or a dedicated logo PNG if cleaner).

**Honest caveat (carry into the plan, not a TODO):** the dominant reason the
favicon is absent is new-domain crawl lag. This change makes the favicon
*eligible/robust*; part 5 (Search Console) is what actually accelerates it.

### 4. Open Graph + Twitter card + generated image

- `app/opengraph-image.tsx` — 1200×630 PNG via `next/og` `ImageResponse`:
  brand tile + "EazyExchange" wordmark + short French tagline, on brand navy.
  Reuse for Twitter (`twitter-image.tsx` or the same file) — a `summary_large_image`.
- Add `openGraph` (title, description, url, siteName, image, `locale: 'fr_FR'`,
  `type: 'website'`) and `twitter` (`card: 'summary_large_image'`, title,
  description, image) to metadata. `metadataBase` is already set, so relative
  image paths resolve absolute.

### 5. Search Console runbook — `docs/seo/search-console.md`

Step-by-step (Bjorn-executed, out of code's reach):

1. Add the **domain property** `eazyexchange.com` in Google Search Console.
2. Verify via **Cloudflare DNS TXT** (DNS is at Cloudflare per project notes).
3. Submit `https://eazyexchange.com/sitemap.xml`.
4. **URL Inspection → Request Indexing** on `/` (and `/signup`).
5. After the deploy, re-request indexing so the new title/JSON-LD/favicon are
   re-crawled; note favicon/logo can take several crawls to surface.

## Out of scope / expectations

- Ranking #1 for the bare word "eazyexchange" is **not** guaranteed by any code
  change — it needs weeks of crawl + trust (and any inbound links). Parts 1–5
  give Google every correct signal and remove the blockers; that is the ceiling
  of what code delivers here.
- `robots.ts` / `sitemap.ts` are already correct — untouched.
- No new social profiles are created; `sameAs` stays empty.

## Verification

- `pnpm lint`, `pnpm test`, `pnpm build` (build catches `ImageResponse`/type
  breakage).
- Extend `app/__tests__/page.test.tsx`:
  - assert the rendered/metadata `title` length ≤ 60 chars,
  - assert the JSON-LD `Organization` block is present with a `logo`,
  - assert `openGraph`/`twitter` metadata fields exist.
- No migration, no RLS, no storage bucket → **`test:rls` not required.**
- Manual post-deploy: fetch prod `<head>` for the new tags; validate JSON-LD in
  Google's Rich Results Test; preview the OG card via a share-debugger.

## Files

- `app/page.tsx` — title; JSON-LD injection (or a small extracted component).
- `app/opengraph-image.tsx` (new); optional `app/twitter-image.tsx` (new).
- Raster favicon asset/route (new).
- `app/layout.tsx` and/or `app/page.tsx` — `openGraph`/`twitter` metadata.
- `app/__tests__/page.test.tsx` — new assertions.
- `docs/seo/search-console.md` (new).
