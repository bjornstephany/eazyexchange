# i18n Phase 2 — Organizer Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the whole organizer portal under `next-intl` so every chrome string renders in the logged-in organizer's chosen language (en/fr/es/it/de), and give organizers a Settings control that writes `users.locale` (the first writer of the column shipped in Phase 1).

**Architecture:** Install `next-intl` in **no-i18n-routing mode**. A server resolver `resolveLocale()` picks the active locale (profile → `NEXT_LOCALE` cookie → `Accept-Language` → `en`) riding the already-cached per-request auth lookup. `i18n/request.ts` feeds that locale + the merged JSON catalog to next-intl. `NextIntlClientProvider` mounts in the **already-dynamic** `app/(organizer)/layout.tsx` (never the root layout — that would force the statically-prerendered landing dynamic and regress cold-start perf). All organizer copy moves from hardcoded JSX/server strings into `messages/*.json` under two namespaces (`common`, `organizer`); components read it via `useTranslations` / `getTranslations`. French is the verbatim source of truth; en is the fallback; es/it/de are Sonnet-generated. A key-parity test gates completeness at CI.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, `next-intl@^4` (no-routing mode), Tailwind, Vitest + Testing Library (jsdom), Supabase (Postgres + RLS), pnpm.

## Global Constraints

- Package manager is **pnpm** (never npm). Add deps with `pnpm add`.
- Supported locales, exact order: `en`, `fr`, `es`, `it`, `de`. Default + missing-key fallback: `en`. Native names: `English`, `Français`, `Español`, `Italiano`, `Deutsch`. These already live in `lib/i18n/config.ts` (Phase 1) — import them, never re-declare.
- **French is the translation source** (existing hardcoded copy is authoritative, copied verbatim into `fr.json`). `en` is written as the English chrome equivalent. `es`/`it`/`de` are generated **with Sonnet** (Haiku strips accents), then the accent/apostrophe guard is run. See `[[feedback_french_transcription_pitfalls]]`.
- **Translate app chrome only.** Organizer-authored content — exchange names, form/field labels, terms text, rejection notes, school names, student names/emails — renders **verbatim** and is never keyed.
- **The root layout (`app/layout.tsx`) and the landing (`app/page.tsx` / `LandingPage`) stay static and locale-agnostic.** The provider and any server locale read live only in `app/(organizer)/layout.tsx` and below. `pnpm build` must still mark `/` as `○` (prerendered), never `ƒ`.
- **Never log student/parent PII** (unchanged). Localization changes wording only.
- **Production redacts thrown Server Action error messages** (opaque digest). Do not restructure the existing throw-based validation into structured returns in this phase — only translate the string in place. Expected-outcome refactors are out of scope.
- Auth preambles stay `requireOrganizer()` / `requireUser()` from `lib/auth/require.ts`; the strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing for tests — **do not translate those two**.
- Verifying Changes gate before any push: `pnpm lint && pnpm test && pnpm build`. No schema is touched in this phase, so `pnpm test:rls` is not required (the `users.locale` migration + its matrix case already shipped in Phase 1, PR #17).
- next-intl API specifics below are written for **v4 without-i18n-routing**. If the installed minor differs at execution, consult the current next-intl docs for the exact `getRequestConfig` / `NextIntlClientProvider` signatures and adapt — the shapes here are the contract, not the exact import paths.

---

## File Structure

**New infrastructure**
- `i18n/request.ts` — next-intl `getRequestConfig`; returns `{ locale, messages }` for the resolved locale. (Note: this path is what `createNextIntlPlugin` points at; keep it at repo root `i18n/`, distinct from `lib/i18n/`.)
- `lib/i18n/resolve.ts` — `resolveLocale(): Promise<Locale>` (4-tier server resolver).
- `lib/i18n/messages.ts` — `loadMessages(locale): Promise<Messages>` (dynamic import of the JSON, used by both `i18n/request.ts` and tests).
- `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json` — catalogs, namespaced `{ "common": {…}, "organizer": {…} }`.
- `global.d.ts` — augments next-intl's `Messages` type from `en.json` (type-safe keys; unknown key fails `pnpm build`).
- `lib/test/renderWithIntl.tsx` — test helper wrapping a component in `NextIntlClientProvider` with `messages/fr.json` at `locale="fr"` (so existing French-text assertions stay green after extraction).

**Modified integration points**
- `next.config.mjs` — wrap the config in `createNextIntlPlugin('./i18n/request.ts')`.
- `lib/supabase/request.ts` — add `locale` to the `Profile` type and the `getProfile` select (so `resolveLocale` reads it off the cached profile, zero extra round-trips).
- `app/(organizer)/layout.tsx` — mount `NextIntlClientProvider`; set `lang={locale}` on the shell wrapper.
- `actions/settings.ts` — new `updateLocale(locale: Locale)` action; localize `getBillingOverview` returned strings.

**Extraction surfaces (copy → `messages`, JSX/strings → `t()`)**
- `components/shell/*`, `components/dashboard/*`, `components/exchanges/*`, `components/forms/*`, `components/documents/*`, `components/students/*`, `components/settings/*` (+ new `LanguageSelect`), `app/(organizer)/**` pages/loading/error, and the organizer-facing returned strings in `actions/settings.ts` and `lib/billing/display.ts`.
- Each surface's existing `__tests__/*` files gain the `renderWithIntl` wrapper.

---

## Namespace & key conventions (read once, applies to every extraction task)

Two namespaces only:

- **`common`** — strings reused across ≥2 surfaces or generic UI verbs: `common.actions.save` (`Enregistrer`), `common.actions.cancel` (`Annuler`), `common.actions.delete` (`Supprimer`), `common.actions.newExchange` (`+ Nouvel échange`), `common.states.saved` (`✓ Modifications enregistrées`), `common.errors.generic` (`Une erreur est survenue.`), status labels, etc.
- **`organizer`** — everything surface-specific, sub-keyed by area: `organizer.dashboard.*`, `organizer.shell.*`, `organizer.exchanges.*`, `organizer.forms.*`, `organizer.documents.*`, `organizer.students.*`, `organizer.settings.*`, `organizer.applications.*`.

Rules:
- Key names are **English, semantic, camelCase leaf** (`emptyHeading`, not `aucunEchange`). The *value* is the localized string; the *key* never leaks language.
- ICU for interpolation/plurals: `"{count, plural, one {# élève} other {# élèves}}"`, `"Bonjour {name}"`. Use `t('key', { count })` / `t('key', { name })`.
- When the same French string appears in two areas, put it in `common` and reference it from both — DRY.
- **Do not key** organizer-authored/dynamic values (names, emails, exchange titles, deadlines rendered from data). Only static chrome.

---

## Task 1: Install next-intl + request config + catalog skeleton

**Files:**
- Modify: `package.json` (dep), `next.config.mjs`
- Create: `i18n/request.ts`, `lib/i18n/messages.ts`, `messages/en.json`, `messages/fr.json`, `global.d.ts`, `lib/test/renderWithIntl.tsx`
- Test: `lib/i18n/__tests__/messages.test.ts`

**Interfaces:**
- Produces:
  - `loadMessages(locale: Locale): Promise<AbstractIntlMessages>` — dynamic-imports `messages/<locale>.json`.
  - `renderWithIntl(ui, { locale?, messages? })` — RTL render wrapped in `NextIntlClientProvider` (defaults: `locale="fr"`, `messages = fr.json`).
  - `messages/en.json` + `messages/fr.json` each with a populated `common` namespace and an empty `organizer` object (surfaces fill it in later tasks).

- [ ] **Step 1: Install the dependency**

```bash
pnpm add next-intl
```

Expected: `next-intl@^4.x` added to `dependencies`.

- [ ] **Step 2: Create the two seed catalogs with the `common` namespace**

Create `messages/fr.json` (verbatim French — the source):

```json
{
  "common": {
    "actions": {
      "save": "Enregistrer",
      "cancel": "Annuler",
      "delete": "Supprimer",
      "newExchange": "+ Nouvel échange"
    },
    "states": {
      "saved": "✓ Modifications enregistrées",
      "loading": "Chargement…"
    },
    "errors": {
      "generic": "Une erreur est survenue."
    }
  },
  "organizer": {}
}
```

Create `messages/en.json` (English fallback — same shape):

```json
{
  "common": {
    "actions": {
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "newExchange": "+ New exchange"
    },
    "states": {
      "saved": "✓ Changes saved",
      "loading": "Loading…"
    },
    "errors": {
      "generic": "Something went wrong."
    }
  },
  "organizer": {}
}
```

> `es`/`it`/`de` are NOT created here — they arrive fully in Task 13. During Phase 2, the request config (Step 4) falls back so a missing `es/it/de` file never crashes the build; the parity test in Task 14 is the completeness gate.

- [ ] **Step 3: Create `lib/i18n/messages.ts`**

```ts
import type { AbstractIntlMessages } from 'next-intl'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'

// Dynamic-import a catalog. Falls back to the default locale (en) if a locale
// file does not exist yet (es/it/de land in Task 13).
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  try {
    return (await import(`@/messages/${locale}.json`)).default
  } catch {
    return (await import(`@/messages/${DEFAULT_LOCALE}.json`)).default
  }
}
```

- [ ] **Step 4: Create `i18n/request.ts`**

`resolveLocale` does not exist until Task 2 — seed this file now with a cookie/default read so the plugin wiring is testable, then Task 2 swaps in the full resolver.

```ts
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { loadMessages } from '@/lib/i18n/messages'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config'
import { LOCALE_COOKIE } from '@/lib/i18n/cookie'

export default getRequestConfig(async () => {
  // Interim resolver (cookie → default). Task 2 replaces this call with
  // resolveLocale() (profile-aware, 4-tier).
  const cookieVal = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale: Locale = cookieVal && isLocale(cookieVal) ? cookieVal : DEFAULT_LOCALE
  return { locale, messages: await loadMessages(locale) }
})
```

- [ ] **Step 5: Wrap `next.config.mjs` with the plugin**

```js
import createNextIntlPlugin from 'next-intl/plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: { dynamic: 180 },
  },
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
export default withNextIntl(nextConfig)
```

- [ ] **Step 6: Create `global.d.ts` (type-safe keys)**

```ts
import type en from '@/messages/en.json'

declare global {
  // Augments next-intl so useTranslations/getTranslations keys are checked
  // against the English catalog. Unknown keys fail `pnpm build`.
  interface IntlMessages extends Messages {}
}

type Messages = typeof en

export {}
```

> If `pnpm build` reports the augmentation interface name differs in the installed next-intl minor, follow the next-intl "Type-safe messages" doc for the exact declaration (`declare interface AppConfig { Messages: typeof en }` in newer minors). The contract is: unknown keys must fail the build.

- [ ] **Step 7: Create the test helper `lib/test/renderWithIntl.tsx`**

```tsx
import { render, type RenderOptions } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import fr from '@/messages/fr.json'
import type { Locale } from '@/lib/i18n/config'

export function renderWithIntl(
  ui: ReactElement,
  opts: { locale?: Locale; messages?: Record<string, unknown> } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { locale = 'fr', messages = fr, ...rest } = opts
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
    rest,
  )
}
```

- [ ] **Step 8: Write the failing test**

```ts
// lib/i18n/__tests__/messages.test.ts
import { describe, it, expect } from 'vitest'
import { loadMessages } from '@/lib/i18n/messages'

describe('loadMessages', () => {
  it('loads the French catalog with the common namespace', async () => {
    const fr = await loadMessages('fr')
    expect((fr as any).common.actions.save).toBe('Enregistrer')
  })
  it('falls back to en for a not-yet-created catalog', async () => {
    const es = await loadMessages('es')
    // es.json does not exist yet → falls back to en
    expect((es as any).common.actions.save).toBe('Save')
  })
})
```

- [ ] **Step 9: Run the test**

Run: `pnpm test -- lib/i18n/__tests__/messages.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Verify build wiring & landing still static**

Run: `pnpm build`
Expected: build succeeds; the route table still marks `/` as `○` (static). If `/` flipped to `ƒ`, STOP — the plugin must not force the landing dynamic (it should not; the provider is not mounted yet).

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.mjs i18n/request.ts lib/i18n/messages.ts messages/en.json messages/fr.json global.d.ts lib/test/renderWithIntl.tsx lib/i18n/__tests__/messages.test.ts
git commit -m "feat(i18n): install next-intl + request config + catalog skeleton"
```

---

## Task 2: Server locale resolver (`resolveLocale`)

**Files:**
- Create: `lib/i18n/resolve.ts`
- Modify: `lib/supabase/request.ts` (add `locale` to `Profile` + `getProfile` select), `i18n/request.ts` (use `resolveLocale`)
- Test: `lib/i18n/__tests__/resolve.test.ts`

**Interfaces:**
- Consumes: `getProfile` (now exposes `locale`), `cookies()`, `headers()`, `matchLocale` (Phase 1), `isLocale`, `DEFAULT_LOCALE`.
- Produces: `resolveLocale(): Promise<Locale>` — priority: (1) logged-in `profile.locale`; (2) `NEXT_LOCALE` cookie; (3) `Accept-Language` via `matchLocale`; (4) `DEFAULT_LOCALE`.

- [ ] **Step 1: Add `locale` to the cached profile**

In `lib/supabase/request.ts`, add `locale: Locale` to the `Profile` type and `locale` to the select list. Import `type Locale` from `@/lib/i18n/config`.

```ts
// Profile type — add:
  locale: Locale
// select string — add `locale`:
    .select('id, role, school_id, full_name, email, org_role, locale, schools(name, subscription_status, plan, grace_until)')
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/i18n/__tests__/resolve.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getProfile = vi.fn()
const cookieGet = vi.fn()
const headerGet = vi.fn()

vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => cookieGet(n) }),
  headers: async () => ({ get: (n: string) => headerGet(n) }),
}))

import { resolveLocale } from '@/lib/i18n/resolve'

describe('resolveLocale', () => {
  beforeEach(() => {
    getProfile.mockReset(); cookieGet.mockReset(); headerGet.mockReset()
    getProfile.mockResolvedValue(null); cookieGet.mockReturnValue(undefined); headerGet.mockReturnValue(null)
  })

  it('prefers the logged-in profile locale', async () => {
    getProfile.mockResolvedValue({ locale: 'de' })
    cookieGet.mockReturnValue({ value: 'fr' })
    expect(await resolveLocale()).toBe('de')
  })
  it('uses the NEXT_LOCALE cookie when anonymous', async () => {
    cookieGet.mockReturnValue({ value: 'es' })
    expect(await resolveLocale()).toBe('es')
  })
  it('negotiates Accept-Language when no cookie', async () => {
    headerGet.mockReturnValue('it-IT,it;q=0.9,en;q=0.8')
    expect(await resolveLocale()).toBe('it')
  })
  it('falls back to en', async () => {
    expect(await resolveLocale()).toBe('en')
  })
  it('ignores an unsupported profile locale and continues down the chain', async () => {
    getProfile.mockResolvedValue({ locale: 'pt' })
    cookieGet.mockReturnValue({ value: 'fr' })
    expect(await resolveLocale()).toBe('fr')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- lib/i18n/__tests__/resolve.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/resolve`.

- [ ] **Step 4: Implement `lib/i18n/resolve.ts`**

```ts
import { cookies, headers } from 'next/headers'
import { getProfile } from '@/lib/supabase/request'
import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from '@/lib/i18n/config'
import { LOCALE_COOKIE } from '@/lib/i18n/cookie'

export async function resolveLocale(): Promise<Locale> {
  // 1. Logged-in user — rides the per-request cached profile (no extra query).
  const profile = await getProfile()
  if (profile && isLocale(profile.locale)) return profile.locale

  // 2. Anonymous — NEXT_LOCALE cookie.
  const cookieVal = (await cookies()).get(LOCALE_COOKIE)?.value
  if (cookieVal && isLocale(cookieVal)) return cookieVal

  // 3. No cookie — negotiate Accept-Language.
  const accept = (await headers()).get('accept-language')
  const negotiated = matchLocale(accept?.split(',').map((p) => p.split(';')[0].trim()))
  if (negotiated) return negotiated

  // 4. Fallback.
  return DEFAULT_LOCALE
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- lib/i18n/__tests__/resolve.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Wire the resolver into `i18n/request.ts`**

Replace the interim cookie block from Task 1:

```ts
import { getRequestConfig } from 'next-intl/server'
import { loadMessages } from '@/lib/i18n/messages'
import { resolveLocale } from '@/lib/i18n/resolve'

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return { locale, messages: await loadMessages(locale) }
})
```

- [ ] **Step 7: Typecheck + full test run**

Run: `npx tsc --noEmit && pnpm test -- lib/i18n`
Expected: clean; all i18n tests green.

- [ ] **Step 8: Commit**

```bash
git add lib/i18n/resolve.ts lib/i18n/__tests__/resolve.test.ts lib/supabase/request.ts i18n/request.ts
git commit -m "feat(i18n): server locale resolver (profile/cookie/accept-language)"
```

---

## Task 3: Mount the provider in the organizer layout

**Files:**
- Modify: `app/(organizer)/layout.tsx`
- Test: `app/(organizer)/__tests__/layout.intl.test.tsx` (create) — asserts the provider wraps children with the resolved locale.

**Interfaces:**
- Consumes: `resolveLocale`, `loadMessages`.
- Produces: an organizer subtree where `useTranslations` / `getTranslations` resolve. `lang={locale}` set on the shell wrapper (the root `<html lang="en">` is untouched — a nested layout cannot render `<html>`).

- [ ] **Step 1: Mount `NextIntlClientProvider`**

In `app/(organizer)/layout.tsx`, resolve the locale + messages and wrap the returned tree. Set `lang` on a wrapper around `OrganizerShell`:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages } from '@/lib/i18n/messages'
// …existing imports…

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  // …existing auth/profile/exchange logic unchanged…

  const locale = await resolveLocale()
  const messages = await loadMessages(locale)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>
        <OrganizerShell
          exchanges={exchanges}
          activeExchangeId={active?.id ?? null}
          organizerName={profile.full_name}
          schoolName={school?.name ?? ''}
          atCap={atCap}
          isTrial={isTrial}
          remaining={remaining}
          orgRole={(profile.org_role ?? 'admin') as 'owner' | 'admin'}
        >
          {showGrace && <PaymentWarningBanner />}
          {children}
        </OrganizerShell>
      </div>
    </NextIntlClientProvider>
  )
}
```

> `resolveLocale()` calls the cached `getProfile()` already fetched above, so this adds no round-trip.

- [ ] **Step 2: Write the test**

```tsx
// app/(organizer)/__tests__/layout.intl.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useTranslations } from 'next-intl'
import fr from '@/messages/fr.json'

// A minimal consumer proving the provider makes `common` keys resolvable.
function Probe() {
  const t = useTranslations('common')
  return <button>{t('actions.save')}</button>
}

describe('organizer intl provider', () => {
  it('resolves common keys under the provider (fr)', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <Probe />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Enregistrer')).toBeInTheDocument()
  })
})
```

> The real `OrganizerLayout` is an async Server Component and is not unit-rendered here; its wiring is exercised by `pnpm build` (Step 4) and the manual dev check. This test guards that the catalog + provider contract holds.

- [ ] **Step 3: Run the test**

Run: `pnpm test -- app/(organizer)/__tests__/layout.intl.test.tsx`
Expected: PASS.

- [ ] **Step 4: Build — confirm organizer dynamic, landing still static**

Run: `pnpm build`
Expected: succeeds. `/` stays `○` (static); organizer routes stay `ƒ` (dynamic, as before). If `/` flipped to `ƒ`, STOP and revert — the provider leaked into the static tree.

- [ ] **Step 5: Commit**

```bash
git add "app/(organizer)/layout.tsx" "app/(organizer)/__tests__/layout.intl.test.tsx"
git commit -m "feat(i18n): mount NextIntlClientProvider in organizer layout"
```

---

## Task 4: Settings language control (first `users.locale` writer)

**Files:**
- Modify: `actions/settings.ts` (add `updateLocale`)
- Create: `components/settings/LanguageSelect.tsx`
- Modify: `components/settings/SettingsView.tsx` (render `LanguageSelect`)
- Test: `actions/__tests__/settings.locale.test.ts`, `components/settings/__tests__/LanguageSelect.test.tsx`

**Interfaces:**
- Consumes: `requireOrganizer` (via existing `getOrganizerCtx`), `LOCALES`, `LOCALE_NAMES`, `Locale`, `isLocale`.
- Produces: `updateLocale(locale: Locale): Promise<void>` — validates the code, writes `users.locale`, `revalidatePath('/', 'layout')` so the whole shell re-renders in the new language. `LanguageSelect` client component calls it and `router.refresh()`.

- [ ] **Step 1: Write the failing action test**

```ts
// actions/__tests__/settings.locale.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn(() => ({ eq: () => ({ error: null }) }))
const from = vi.fn(() => ({ update }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: 'admin', email: 'a@b.c', full_name: 'A' },
  }),
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { updateLocale } from '@/actions/settings'

describe('updateLocale', () => {
  beforeEach(() => { from.mockClear(); update.mockClear(); revalidatePath.mockClear() })

  it('writes a valid locale to users and revalidates the layout', async () => {
    await updateLocale('de')
    expect(from).toHaveBeenCalledWith('users')
    expect(update).toHaveBeenCalledWith({ locale: 'de' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('rejects an unsupported locale', async () => {
    await expect(updateLocale('pt' as never)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- actions/__tests__/settings.locale.test.ts`
Expected: FAIL — `updateLocale` is not exported.

- [ ] **Step 3: Implement `updateLocale` in `actions/settings.ts`**

Add near `updateProfile` (import `isLocale`, `type Locale` from `@/lib/i18n/config`):

```ts
export async function updateLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) throw new Error('Unsupported locale')
  const supabase = await createClient()
  const ctx = await getOrganizerCtx()
  const { error } = await supabase.from('users').update({ locale }).eq('id', ctx.userId)
  if (error) throw error
  // The active locale drives the whole organizer shell (server-resolved), so
  // bust the layout tree, not just /settings.
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 4: Run action test to verify it passes**

Run: `pnpm test -- actions/__tests__/settings.locale.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing `LanguageSelect` test**

```tsx
// components/settings/__tests__/LanguageSelect.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { LOCALE_NAMES } from '@/lib/i18n/config'

const updateLocale = vi.fn(async () => {})
vi.mock('@/actions/settings', () => ({ updateLocale: (l: string) => updateLocale(l) }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LanguageSelect } from '@/components/settings/LanguageSelect'

describe('LanguageSelect', () => {
  it('lists all five languages by native name and defaults to the current locale', () => {
    renderWithIntl(<LanguageSelect current="fr" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    }
    expect(select.value).toBe('fr')
  })

  it('calls updateLocale then refreshes on change', async () => {
    renderWithIntl(<LanguageSelect current="fr" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'de' } })
    await vi.waitFor(() => expect(updateLocale).toHaveBeenCalledWith('de'))
    expect(refresh).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test -- components/settings/__tests__/LanguageSelect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `components/settings/LanguageSelect.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateLocale } from '@/actions/settings'
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config'

export function LanguageSelect({ current }: { current: Locale }) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const [value, setValue] = useState<Locale>(current)
  const [busy, setBusy] = useState(false)

  async function onChange(next: Locale) {
    setValue(next); setBusy(true)
    try {
      await updateLocale(next)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <label htmlFor="lang-select" className="mb-1.5 block text-xs font-semibold text-foreground">
        {t('settings.language.label')}
      </label>
      <select
        id="lang-select"
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="h-10 w-full max-w-xs rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:opacity-50 sm:w-auto"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>{LOCALE_NAMES[code]}</option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-placeholder">{t('settings.language.hint')}</p>
    </div>
  )
}
```

- [ ] **Step 8: Add the two keys to `messages/en.json` + `messages/fr.json`**

Under `organizer`, add:

```jsonc
// fr.json → organizer
"settings": {
  "language": {
    "label": "Langue de l’interface",
    "hint": "S’applique à votre compte sur tous vos appareils."
  }
}
// en.json → organizer
"settings": {
  "language": {
    "label": "Interface language",
    "hint": "Applies to your account across all your devices."
  }
}
```

- [ ] **Step 9: Render `LanguageSelect` in `SettingsView.tsx`**

Import it and place it in the settings layout (near `ProfileCard`), passing the current locale. `SettingsView` must receive `locale` — thread it from the page:

- In `app/(organizer)/settings/page.tsx`, pass `locale={await resolveLocale()}` (import `resolveLocale`) to `<SettingsView … locale={locale} />`.
- In `components/settings/SettingsView.tsx`, add `locale: Locale` to props and render `<LanguageSelect current={locale} />`.

- [ ] **Step 10: Run tests + typecheck**

Run: `pnpm test -- components/settings actions/__tests__/settings.locale.test.ts && npx tsc --noEmit`
Expected: green; clean. (If `SettingsView`'s existing test breaks on the new required prop, pass a `locale="fr"` in that test's render.)

- [ ] **Step 11: Commit**

```bash
git add actions/settings.ts actions/__tests__/settings.locale.test.ts components/settings/LanguageSelect.tsx components/settings/__tests__/LanguageSelect.test.tsx components/settings/SettingsView.tsx "app/(organizer)/settings/page.tsx" messages/en.json messages/fr.json
git commit -m "feat(i18n): organizer settings language control writes users.locale"
```

---

## Extraction recipe (Tasks 5–12 all follow this)

> **Deliberate deviation from the full-inline-code rule.** Extraction is a *mechanical, per-surface* transform over thousands of lines of existing copy. Transcribing every string into this plan would be infeasible and would just duplicate files the engineer already has open. Instead each extraction task specifies: (a) the **exhaustive file list** for the surface, (b) the **recipe** below applied to every static string, (c) the **regression gate** (existing tests, re-run under `renderWithIntl`, keep their verbatim French assertions green). The worked example under Task 5 shows the transform end-to-end; every other file follows it identically.

**Recipe for each file in the surface:**

1. **Identify** every static chrome string (headings, labels, buttons, placeholders, hints, empty states, toasts, `aria-label`s, `title`s). **Skip** anything rendered from props/data (names, emails, exchange titles, deadlines, counts of user content) — those are organizer-authored and render verbatim.
2. **Add keys** to `messages/fr.json` (value = the **exact existing French string, verbatim** — copy accents/apostrophes as-is) and `messages/en.json` (value = the English chrome equivalent) under `organizer.<area>.…`, or `common.…` if shared. es/it/de are deferred to Task 13.
3. **Replace** the JSX literal with `t('area.key')`. For interpolation/plurals use ICU + `t('key', { count, name })`.
   - **Client component:** add `const t = useTranslations('organizer')` (or `'common'`) at the top.
   - **Server component / server action:** `const t = await getTranslations('organizer')` from `next-intl/server`.
4. **Update the surface's `__tests__`:** switch bare `render(...)` to `renderWithIntl(...)` (helper from Task 1; defaults to `locale="fr"` + `fr.json`). The existing assertions on French text stay **unchanged** and must pass — that is the proof the extraction preserved every string.
5. Run the surface's tests + `npx tsc --noEmit` (catches unknown keys via `global.d.ts`), then commit.

**ICU note for plurals already in the code** (e.g. hand-built `${n} élève${n > 1 ? 's' : ''}`): convert to `"{n, plural, one {# élève} other {# élèves}}"` and `t('key', { n })`. This is the one place to improve on the source, not merely copy it.

---

## Task 5: Extract `components/shell/*`  ← worked example

**Files (all static copy in each):**
- Modify: `components/shell/OrganizerShell.tsx`, `components/shell/RailIcons.tsx`, `components/shell/SessionSelector.tsx`, `components/shell/NewExchangeModal.tsx`, `components/shell/FeedbackModal.tsx` (leave `ShellUiContext.tsx` — no copy).
- Modify tests: `components/shell/__tests__/OrganizerShell.test.tsx`, `NewExchangeModal.test.tsx`, `FeedbackModal.test.tsx`, `RailPrefetch.test.tsx`.
- Modify: `messages/en.json`, `messages/fr.json` (`organizer.shell.*`, `common.*` for the nav/`+ Nouvel échange` already seeded).

**Interfaces:**
- Consumes: `useTranslations` (client). Produces: `organizer.shell.*` keys.

**Worked example — the nav rail labels in `OrganizerShell.tsx`:**

Before (hardcoded):
```tsx
const NAV = [
  { href: '/dashboard', label: 'Tableau de bord', icon: 'grid' },
  { href: '/exchanges', label: 'Échanges', icon: 'swap' },
  // …
]
```
After:
```tsx
const t = useTranslations('organizer')
const NAV = [
  { href: '/dashboard', label: t('shell.nav.dashboard'), icon: 'grid' },
  { href: '/exchanges', label: t('shell.nav.exchanges'), icon: 'swap' },
  // …
]
```
`messages/fr.json` → `organizer.shell.nav`: `{ "dashboard": "Tableau de bord", "exchanges": "Échanges", … }`.
`messages/en.json` → `organizer.shell.nav`: `{ "dashboard": "Dashboard", "exchanges": "Exchanges", … }`.

- [ ] **Step 1: Extract every static string in the five shell files** per the recipe. Reuse `common.actions.newExchange` for the “+ Nouvel échange” trigger.

- [ ] **Step 2: Wrap the shell tests in `renderWithIntl`**

Change `render(<OrganizerShell … />)` → `renderWithIntl(<OrganizerShell … />)` in each shell test; keep the French-text assertions verbatim. (Mocks like `useShellUi` stay.)

- [ ] **Step 3: Run tests + typecheck**

Run: `pnpm test -- components/shell && npx tsc --noEmit`
Expected: green (French assertions pass under the fr provider); tsc clean (no unknown keys).

- [ ] **Step 4: Commit**

```bash
git add components/shell messages/en.json messages/fr.json
git commit -m "feat(i18n): extract organizer shell copy"
```

---

## Task 6: Extract `components/dashboard/*`

**Files:**
- Modify: `EmptyDashboard.tsx`, `InviteModal.tsx`, `OverviewView.tsx`, `StatusPill.tsx`, `StudentDrawer.tsx`.
- Modify tests: `EmptyDashboard.test.tsx`, `InviteModal.test.tsx`, `OverviewView.test.tsx`, `StudentDrawer.test.tsx`.
- Modify: `messages/{en,fr}.json` (`organizer.dashboard.*`; status labels → `common.status.*`).

**Concrete worked example — `EmptyDashboard.tsx` (full before/after):**

Before → after body:
```tsx
'use client'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/Logo'
import { useShellUi } from '@/components/shell/ShellUiContext'
import { useTranslations } from 'next-intl'

export function EmptyDashboard() {
  const { openNewExchange } = useShellUi()
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  return (
    <div>
      <h3 className="mb-6 font-display text-[30px] font-bold tracking-tight text-navy">
        {t('dashboard.title')}
      </h3>
      <div className="flex flex-col items-center gap-4 rounded-[22px] border-2 border-dashed border-frame bg-[rgba(255,255,255,.5)] px-10 py-16 text-center">
        <Logo href={null} />
        <h4 className="font-display text-[24px] font-bold text-navy">{t('dashboard.emptyHeading')}</h4>
        <p className="max-w-[480px] text-[17px] leading-relaxed text-muted-foreground">
          {t('dashboard.emptyBody')}
        </p>
        <Button className="mt-2" onClick={openNewExchange}>{c('actions.newExchange')}</Button>
      </div>
    </div>
  )
}
```
`fr.json` → `organizer.dashboard`: `{ "title": "Tableau de bord", "emptyHeading": "Aucun échange pour l’instant", "emptyBody": "Créez votre premier échange pour inviter des élèves, assigner des formulaires et suivre les dossiers au même endroit." }`.
`en.json` → `organizer.dashboard`: `{ "title": "Dashboard", "emptyHeading": "No exchange yet", "emptyBody": "Create your first exchange to invite students, assign forms and track submissions all in one place." }`.

Its test `EmptyDashboard.test.tsx` becomes:
```tsx
import { renderWithIntl } from '@/lib/test/renderWithIntl'
// …
renderWithIntl(<EmptyDashboard />)
expect(screen.getByText('Tableau de bord')).toBeTruthy()
expect(screen.getByText(/Aucun .change pour l.instant/)).toBeTruthy()
// CTA button name assertion unchanged: /Nouvel .change/
```

- [ ] **Step 1: Apply the recipe to all five dashboard files.** Move `StatusPill` status labels to `common.status.*` (they recur on students/exchanges surfaces).
- [ ] **Step 2: Wrap the four dashboard tests in `renderWithIntl`; keep French assertions.**
- [ ] **Step 3:** Run `pnpm test -- components/dashboard && npx tsc --noEmit` → green.
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): extract dashboard copy"`.

---

## Task 7: Extract `components/exchanges/*`

**Files:**
- Modify: `ExchangesView.tsx`, `ReminderSettingsCard.tsx`.
- Modify tests: `ExchangesView.test.tsx`, `ReminderSettingsCard.test.tsx`.
- Modify: `messages/{en,fr}.json` (`organizer.exchanges.*`). The reminder pacing preset labels (`douce`/`normale`/`insistante` descriptions) are chrome → key them under `organizer.exchanges.reminders.*`.

- [ ] **Step 1: Apply the recipe to both files.**
- [ ] **Step 2: Wrap both tests in `renderWithIntl`; keep French assertions.**
- [ ] **Step 3:** `pnpm test -- components/exchanges && npx tsc --noEmit` → green.
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): extract exchanges copy"`.

---

## Task 8: Extract `components/forms/*`

**Files:**
- Modify: `AddFormPanel.tsx`, `DeleteTemplateButton.tsx`, `FormDrawer.tsx`, `FormsView.tsx`, `PageBanner.tsx`, `StatsCard.tsx`, `TemplateEditor.tsx`, `TemplateIcon.tsx`.
- Modify tests: `DeleteTemplateButton.test.tsx`, `FormsView.test.tsx`, `TemplateEditor.test.tsx`.
- Modify: `messages/{en,fr}.json` (`organizer.forms.*`).
- **Do NOT key** organizer-authored form/field labels, template names, or field placeholders that come from data — only the editor's own chrome (section titles, buttons, the field-type picker labels, validation hints).

- [ ] **Step 1: Apply the recipe to all eight files.** Reuse `common.actions.delete` / `common.actions.save` in `DeleteTemplateButton` / `TemplateEditor`.
- [ ] **Step 2: Wrap the three tests in `renderWithIntl`; keep French assertions.**
- [ ] **Step 3:** `pnpm test -- components/forms && npx tsc --noEmit` → green.
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): extract forms copy"`.

---

## Task 9: Extract `components/documents/*`

**Files:**
- Modify: `AddDocPanel.tsx`, `DocDrawer.tsx`, `DocsView.tsx`.
- Modify tests: `DocsView.test.tsx`.
- Modify: `messages/{en,fr}.json` (`organizer.documents.*`). Named document-slot labels authored by the organizer stay verbatim; only the panel/drawer chrome is keyed.

- [ ] **Step 1: Apply the recipe to all three files.**
- [ ] **Step 2: Wrap `DocsView.test.tsx` in `renderWithIntl`; keep French assertions.**
- [ ] **Step 3:** `pnpm test -- components/documents && npx tsc --noEmit` → green.
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): extract documents copy"`.

---

## Task 10: Extract `components/students/*`

**Files:**
- Modify: `StudentDetail.tsx`, `StudentsView.tsx`.
- Modify tests: `StudentsView.test.tsx`.
- Modify: `messages/{en,fr}.json` (`organizer.students.*`; per-submission status → reuse `common.status.*` from Task 6).
- **Never key** student names/emails/submission content — verbatim, and no PII in any test fixture beyond what already exists.

- [ ] **Step 1: Apply the recipe to both files.**
- [ ] **Step 2: Wrap `StudentsView.test.tsx` in `renderWithIntl`; keep French assertions.**
- [ ] **Step 3:** `pnpm test -- components/students && npx tsc --noEmit` → green.
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): extract students copy"`.

---

## Task 11: Extract `components/settings/*` + server-returned settings strings

**Files:**
- Modify: `BillingCard.tsx`, `ProfileCard.tsx`, `ProgramCard.tsx`, `SecurityCard.tsx`, `SettingsView.tsx`, `TeamCard.tsx`.
- Modify tests: `SettingsView.test.tsx`, `TeamCard.test.tsx`.
- Modify server strings: `actions/settings.ts` (`getBillingOverview` returned labels/notes; `updateProfile`/`changePassword` thrown validation strings), `lib/billing/display.ts` (`PLAN_LABEL_FR`, `PLAN_PRICE_FR`, `PLAN_DESC_FR`, `TRIAL_*`, `usageLine`).
- Modify: `messages/{en,fr}.json` (`organizer.settings.*`, `organizer.billing.*`).

**Client cards:** apply the standard recipe (`useTranslations('organizer')`).

**Server-returned strings (the part unique to this task):**
- `getBillingOverview` builds display strings server-side (`planLabel`, `desc`, `payment.note`, `usageLabel`). Convert with `const t = await getTranslations('organizer')` and pull from `organizer.billing.*`. The Stripe-derived pieces that interpolate card data use ICU: `t('billing.card', { brand, last4, exp })` → `"{brand} •••• {last4} — expire {exp}"`.
- `lib/billing/display.ts` currently exports `*_FR` constants. Replace their **call sites** in `getBillingOverview` with `t()` lookups keyed under `organizer.billing.plans.*`; keep the `display.ts` numeric/price helpers that are not language (or move the labels into the catalog and delete the `_FR` label maps if nothing else imports them — grep first).
- Thrown validation strings (`'Le nom ne peut pas être vide.'`, `'Le mot de passe actuel incorrect.'`, …): translate in place via `t('settings.errors.<name>')`. **Leave `'Unauthenticated'`/`'Unauthorized'` untouched.** (Reminder: prod redacts these; this keeps dev/behaviour consistent, not a user-facing guarantee.)

- [ ] **Step 1: Extract the six client cards** per recipe. `LanguageSelect` (Task 4) already lives here — leave it.
- [ ] **Step 2: Localize `getBillingOverview` + its `display.ts` label sources** using `getTranslations`. Update `actions/__tests__/*` billing tests: they assert French labels — wrap the expectation with the fr catalog values (which equal the old constants), so assertions stay green.
- [ ] **Step 3: Translate the thrown settings validation strings in place.**
- [ ] **Step 4: Wrap `SettingsView.test.tsx` + `TeamCard.test.tsx` in `renderWithIntl`; keep French assertions.** (`SettingsView` already got a `locale` prop in Task 4 — its test passes `locale="fr"`.)
- [ ] **Step 5:** `pnpm test -- components/settings actions/__tests__ && npx tsc --noEmit` → green.
- [ ] **Step 6:** Commit `git commit -m "feat(i18n): extract settings + billing display copy"`.

---

## Task 12: Extract `app/(organizer)/**` page-level copy

**Files:**
- Modify page/loading/error copy in: `app/(organizer)/error.tsx`, every `app/(organizer)/**/loading.tsx`, and any static headings/empty-states/metadata directly in the `page.tsx` server components (`dashboard`, `exchanges`, `forms`, `documents`, `students`, `applications`, and the nested `exchanges/[id]/**`, `forms/[formId]`, `submissions/[assignmentId]` pages).
- Modify: `messages/{en,fr}.json` (`organizer.pages.*`).

**How:** these are mostly **Server Components** — use `const t = await getTranslations('organizer')`. `error.tsx` is a **Client Component** (`'use client'`) — use `useTranslations`. `loading.tsx` skeletons usually have a visually-hidden label or none; key any visible text (e.g. `common.states.loading`).

- [ ] **Step 1: Sweep `app/(organizer)/**` for static strings** (headings passed to child views are often already in the client components extracted above — only key what literally lives in these files). Apply the recipe.
- [ ] **Step 2: Add/adjust tests** only where a page test exists; most page-level copy is covered by the child-component tests. Add a `getTranslations` mock only if a page test renders a server component directly (follow the existing pattern in `app/(organizer)/__tests__` if present).
- [ ] **Step 3:** `pnpm test && npx tsc --noEmit` → green (full suite, since this touches many pages).
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): extract organizer page-level copy"`.

---

## Task 13: Translate `common` + `organizer` to Spanish, Italian, German

**Files:**
- Create: `messages/es.json`, `messages/it.json`, `messages/de.json`.

**Interfaces:**
- Consumes: the complete `messages/fr.json` (source) + `messages/en.json`. Produces: three fully-translated catalogs, structurally identical to `fr.json`.

> **Content deviation (same as Phase 1 Task 4):** the translated strings are *content*, generated at execution with **Sonnet** from the French source (`messages/fr.json`), preserving **every key path and every ICU placeholder/plural category exactly**. Then run the accent/apostrophe guard used in the redesign/Phase-1 work over the three new files. Do not translate ICU variable names or plural keywords (`one`/`other`), only the surrounding text.

- [ ] **Step 1: Generate `es.json`, `it.json`, `de.json`** from `fr.json` with Sonnet, matching the shape byte-for-byte on structure (same keys, same ICU categories). German compound nouns and Italian/Spanish gender agreement are Sonnet's job; the parity test (Task 14) is the structural gate, native review is deferred (accepted risk, noted here).
- [ ] **Step 2: Run the accent/apostrophe guard** over the three files.
- [ ] **Step 3: Sanity-load each** — `pnpm test -- lib/i18n/__tests__/messages.test.ts` still green (now es/it/de exist and load directly, no fallback).
- [ ] **Step 4:** Commit `git commit -m "feat(i18n): translate organizer catalog to es/it/de"`.

---

## Task 14: Key-parity gate + all-locale smoke + final verification

**Files:**
- Create: `messages/__tests__/parity.test.ts`.

**Interfaces:**
- Consumes: all five catalogs, `LOCALES`.

- [ ] **Step 1: Write the key-parity + non-empty + ICU-placeholder test**

```ts
// messages/__tests__/parity.test.ts
import { describe, it, expect } from 'vitest'
import { LOCALES } from '@/lib/i18n/config'
import en from '@/messages/en.json'
import fr from '@/messages/fr.json'
import es from '@/messages/es.json'
import it from '@/messages/it.json'
import de from '@/messages/de.json'

const catalogs: Record<string, unknown> = { en, fr, es, it, de }

// Flatten to sorted "a.b.c" key paths.
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.keys(obj).sort().flatMap((k) =>
      keyPaths((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}
// Collect ICU {placeholders} in a string.
function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
}
function leaves(obj: unknown, prefix = ''): Record<string, string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.assign({}, ...Object.keys(obj).map((k) =>
      leaves((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k)))
  }
  return { [prefix]: String(obj) }
}

describe('message catalog parity', () => {
  const ref = keyPaths(fr)

  it('covers all five locales', () => {
    expect(LOCALES.every((l) => l in catalogs)).toBe(true)
  })

  for (const locale of LOCALES) {
    it(`${locale} has the exact same key set as fr`, () => {
      expect(keyPaths(catalogs[locale])).toEqual(ref)
    })
    it(`${locale} has no empty values`, () => {
      const vals = Object.values(leaves(catalogs[locale]))
      expect(vals.every((v) => v.trim().length > 0)).toBe(true)
    })
    it(`${locale} preserves every ICU placeholder from fr`, () => {
      const a = leaves(fr); const b = leaves(catalogs[locale])
      for (const key of Object.keys(a)) {
        expect(placeholders(b[key])).toEqual(placeholders(a[key]))
      }
    })
  }
})
```

- [ ] **Step 2: Run the parity test**

Run: `pnpm test -- messages/__tests__/parity.test.ts`
Expected: PASS. If a `${locale} same key set` case fails, a translation dropped/added a key — fix the offending catalog (do not weaken the test).

- [ ] **Step 3: Full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all green; `pnpm build` marks `/` as `○` (static) and organizer routes `ƒ`. `global.d.ts` type-checking means any un-added key already failed earlier — a clean build confirms no unknown keys remain.

- [ ] **Step 4: Manual dev smoke**

Run `pnpm dev`, log in as an organizer, open Settings → switch language through all five → confirm the shell, dashboard, forms, documents, students, and settings all re-render in the chosen language and the choice persists across reloads (written to `users.locale`). Confirm anonymous `/` still respects the `NEXT_LOCALE` cookie (unchanged from Phase 1).

- [ ] **Step 5: Commit**

```bash
git add messages/__tests__/parity.test.ts
git commit -m "test(i18n): key-parity + ICU-placeholder gate across five catalogs"
```

---

## Final Verification (before PR)

- [ ] `pnpm lint` — clean.
- [ ] `pnpm test` — all green (i18n unit, resolver, LanguageSelect, every extracted surface under `renderWithIntl`, parity).
- [ ] `pnpm build` — succeeds; `/` still `○` static; organizer routes `ƒ`; no unknown-key type errors.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Manual: five-language switch across the whole organizer portal + persistence via `users.locale`; anonymous landing cookie behaviour unchanged.
- [ ] No `pnpm test:rls` needed — no schema change this phase (`users.locale` + its matrix case shipped in Phase 1 / PR #17).

## PR notes

- Surfaces are committed independently (Tasks 5–12), so if review prefers, the PR can be split at the shell/dashboard boundary — but the spec convention is **one PR per phase**; default to a single PR.
- Machine-quality es/it/de shipped without native review is the accepted, noted risk (per spec §Translation production).
- Merge is Bjorn's (merge commit → CI unit→rls→deploy). No prod DB/edge-function steps in this phase.

## Out of scope (later phases)

- Student portal + apply-funnel extraction, retiring the `fr ? … : …` ternaries, widening `applications.language`, seeding `users.locale` on enrolment → **Phase 3**.
- `lib/email.ts` template + `send-reminders` edge-function localization, `pickEmailLocale`, the `emails` namespace → **Phase 4**.
- Unifying the landing switcher and the settings `LanguageSelect` into one shared `LanguageSwitcher` component (spec §UX aspiration) — deferred; Phase 2 keeps a settings-scoped control to avoid touching the static landing tree.
```