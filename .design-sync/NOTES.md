# design-sync notes — EazyExchange

Repo-specific gotchas for future syncs. Read this before re-running.

## What this repo is (and isn't)

EazyExchange is a **Next.js app, not a published design-system package** — no
`dist/`, no `main`/`exports`, `private: true`. So the converter runs in
synth-entry mode against a hand-written barrel:

- `.design-sync/entry.ts` re-exports the synced surface (`components/ui/*` +
  `components/brand/*`). **Adding a component to the sync means adding it here
  AND to `componentSrcMap` in config.json.**
- Scope was chosen with Bjorn on 2026-07-21: UI primitives + brand only. The rest
  of `components/` is app-coupled (server actions, Supabase, next-intl) and will
  not render standalone — do not sync it without a plan for stubbing.

## The three things that will bite you

1. **`next/link` breaks the whole bundle.** `components/brand/Logo.tsx` imports
   `next/link`, which drags in Next client-router internals referencing
   `process.env.__NEXT_*`. esbuild only defines `NODE_ENV`, so the rest survive
   and throw `ReferenceError: process is not defined` — killing the entire IIFE,
   so *every* component fails, not just Logo.
   Fix in place: `.design-sync/shims/next-link.tsx` (renders a plain `<a>`, drops
   Next-only nav props), wired via `paths` in `.design-sync/tsconfig.json`, which
   `cfg.tsconfig` points at. If another synced component ever imports a Next
   module (`next/image`, `next/navigation`), it needs the same treatment.

2. **Tailwind must be compiled BEFORE the converter runs.** Styling is utility
   classes; `app/globals.css` is only `@tailwind` directives, so shipping it
   directly leaves everything unstyled. `cfg.buildCmd` compiles
   `.design-sync/tailwind-input.css` → `.design-sync/.cache/compiled.css`
   (which `cssEntry` points at). The input `@import`s the real `app/globals.css`
   so the `:root` token block is never duplicated, and adds the three `--font-*`
   variables that `next/font` supplies at runtime in the app but nothing supplies
   outside Next.
   **Re-run `cfg.buildCmd` after editing any preview** — new utility classes in a
   preview don't exist in the CSS until Tailwind re-scans.

3. **The safelist is load-bearing, not an optimization.** Tailwind only emits
   utilities it sees used, so without the `safelist` in
   `.design-sync/tailwind.config.ts` the brand palette (`bg-tint`, `text-brand`,
   `shadow-float`, success/warn/danger…) is absent from the shipped CSS — and the
   design agent, following `conventions.md`, would write those classes and get
   silently unstyled output. If you add brand tokens to the root
   `tailwind.config.ts`, extend the safelist patterns too, then re-verify every
   class named in `conventions.md` against `ds-bundle/_ds_bundle.css`.

## Other decisions

- **Fonts are remote.** IBM Plex Sans / Schibsted Grotesk / IBM Plex Mono load via
  a `fonts.googleapis.com` `@import` at the top of the compiled CSS (Bjorn chose
  this over vendoring woff2). `[FONT_REMOTE]` in validate is therefore expected,
  not a warning to chase. Cards need network to render in the right font.
- **`guidelinesGlob` is deliberately `[]`.** The default glob swept
  `docs/*.md` — DEPLOY.md, stripe-billing-setup.md, LAUNCH_CHECKLIST.md — which
  document the env-var/secrets layout and have no business in a design project.
  Don't remove the empty override without checking what it would pick up.
- **Repo `tsconfig.json` excludes `.design-sync` and `.ds-sync`.** Previews import
  the bare specifier `'eazyexchange'` (resolved only by the preview compiler), so
  without the exclude `pnpm build` / `tsc --noEmit` fail. Keep it.
- **Compound sub-parts are `null` in `componentSrcMap`** (CardHeader, DialogContent,
  SelectItem, TableRow…) so they don't each get a card. They are still exported by
  the bundle (44 exports) because `entry.ts` re-exports them — previews compose
  them normally. Excluding from cards ≠ excluding from the bundle.
- **Card overrides**: Dialog is `cardMode: single` (Radix portals its content to
  `document.body`, so the trigger stays in the root to keep it non-empty); Logo,
  Badge, Card, Label, Skeleton, Textarea are `cardMode: column` (their stories are
  wider than a grid cell).

## Known render warns (expected — not new)

- `[FONT_REMOTE]` for the three brand families — by design, see above.
- `tokens: 1 missing` — below threshold, non-blocking.

## Re-sync risks (what can silently go stale)

- **`conventions.md` names ~45 utility classes and 38 component names.** They were
  all verified against the built artifacts on 2026-07-21. A token rename in
  `tailwind.config.ts`, or a safelist pattern that stops matching, makes those
  claims false without any error firing. Re-run the class/name verification before
  trusting the header.
- **The `next/link` shim mirrors an API surface it doesn't own.** If Next changes
  Link's props, the shim silently diverges. It only matters for Logo.
- **Preview content is hand-written French copy**, not pulled from the app's i18n
  files — it won't follow copy changes in `messages/*.json`.
- **Fabricated student data only** (Camille Rousseau, theo.m@example.org, …). Never
  replace it with real roster data — this app handles minors' PII.
- **Chromium/playwright pinning**: the machine cached `chromium-1217`, which is
  pinned by `playwright@1.59.0` (installed into `.ds-sync/`). A different cache
  build needs the matching playwright release or launch fails.
- Only `pnpm`-installed root `node_modules` was used (`--node-modules ./node_modules`).
