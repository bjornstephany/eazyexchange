# i18n Phase 1 — Foundation + Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a five-language (en/fr/es/it/de) marketing landing selectable from the nav dropdown, plus the shared locale foundation (config + `NEXT_LOCALE` cookie + `users.locale` schema) that later phases build on — without regressing the landing's static prerender.

**Architecture:** The landing stays a client-side dictionary (`lib/landing/content.ts`) rendered by the statically-prerendered `LandingPage` client component; we widen it from 2→5 languages and switch its persistence from the `ee_lang` localStorage key to a shared, server-readable `NEXT_LOCALE` cookie. A new `lib/i18n/config.ts` owns the canonical locale list/types/names used by this phase and every later one. `next-intl` and the server-side locale resolver are **not** introduced here — they arrive in Phase 2 with the first server-rendered surface (organizer portal layout), which is already dynamic and so pays no prerender cost. A `users.locale` column lands now as foundation (first consumed by Phase 2's settings control).

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Vitest + Testing Library (jsdom), Supabase (Postgres + RLS), pnpm.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Supported locales, in this exact order: `en`, `fr`, `es`, `it`, `de`. Default + missing-key fallback: `en`.
- Native language display names: `English`, `Français`, `Español`, `Italiano`, `Deutsch`.
- The landing (`app/page.tsx` / `LandingPage`) MUST remain statically prerenderable — no server-side cookie/header reads in the root layout or landing tree.
- Organizer-authored content is never translated; this phase only touches app-chrome copy (landing marketing text).
- Schema workflow (from CLAUDE.md): write migration locally → apply to **staging first** (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`) → apply to prod via MCP `apply_migration` → `list_migrations` and `git mv` if the stamped version differs → MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit`.
- New column ships with its RLS-matrix case in the same PR; `pnpm test:rls` must pass.
- Verifying Changes gate before any push: `pnpm lint && pnpm test && pnpm build` (+ `pnpm test:rls` because schema is touched).
- French is the translation source; generate es/it/de with Sonnet (Haiku strips accents), then run the accent/apostrophe guard.

---

## File Structure

- **Create** `lib/i18n/config.ts` — canonical `LOCALES`, `Locale` type, `DEFAULT_LOCALE`, `LOCALE_NAMES`, `isLocale()`. Imported by the landing now and by all later phases.
- **Create** `lib/i18n/cookie.ts` — `LOCALE_COOKIE` name constant + client-side `readLocaleCookie()` / `writeLocaleCookie()`. (Server read helper deferred to Phase 2.)
- **Create** `lib/i18n/__tests__/config.test.ts`, `lib/i18n/__tests__/cookie.test.ts`.
- **Modify** `lib/landing/content.ts` — replace the local `Lang` union with the shared `Locale`; extend `landingContent` from `{ fr, en }` to all five locales.
- **Modify** `components/landing/LandingPage.tsx` — read/write `NEXT_LOCALE` cookie instead of `ee_lang` localStorage; default via `DEFAULT_LOCALE`.
- **Modify** `components/landing/LandingNav.tsx` — render all five languages from `LOCALE_NAMES`.
- **Create/Modify** `components/landing/__tests__/…` — LandingPage cookie behavior; LandingNav renders five options.
- **Create** `supabase/migrations/<ts>_users_locale.sql` — `users.locale` column.
- **Modify** `types/supabase.ts` (regenerated) — narrowing in `types/db.ts` if needed.
- **Modify/Create** RLS matrix test for `users.locale` (follow the file layout in `docs/security/rls-testing.md`).

---

## Task 1: Shared locale config

**Files:**
- Create: `lib/i18n/config.ts`
- Test: `lib/i18n/__tests__/config.test.ts`

**Interfaces:**
- Produces:
  - `LOCALES: readonly ['en','fr','es','it','de']`
  - `type Locale = 'en'|'fr'|'es'|'it'|'de'`
  - `DEFAULT_LOCALE: Locale` (`'en'`)
  - `LOCALE_NAMES: Record<Locale, string>`
  - `isLocale(x: string): x is Locale`

- [ ] **Step 1: Write the failing test**

```ts
// lib/i18n/__tests__/config.test.ts
import { describe, it, expect } from 'vitest'
import { LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, isLocale } from '@/lib/i18n/config'

describe('i18n config', () => {
  it('lists the five supported locales in order', () => {
    expect(LOCALES).toEqual(['en', 'fr', 'es', 'it', 'de'])
  })
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })
  it('has a native display name for every locale', () => {
    expect(LOCALES.every((l) => LOCALE_NAMES[l].length > 0)).toBe(true)
    expect(LOCALE_NAMES.de).toBe('Deutsch')
  })
  it('narrows valid codes and rejects others', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('pt')).toBe(false)
    expect(isLocale('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/i18n/__tests__/config.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/config`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/i18n/config.ts
export const LOCALES = ['en', 'fr', 'es', 'it', 'de'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  de: 'Deutsch',
}

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/i18n/__tests__/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/config.ts lib/i18n/__tests__/config.test.ts
git commit -m "feat(i18n): shared locale config (en/fr/es/it/de)"
```

---

## Task 2: NEXT_LOCALE cookie helpers (client)

**Files:**
- Create: `lib/i18n/cookie.ts`
- Test: `lib/i18n/__tests__/cookie.test.ts`

**Interfaces:**
- Consumes: `Locale`, `isLocale` (Task 1).
- Produces:
  - `LOCALE_COOKIE = 'NEXT_LOCALE'`
  - `readLocaleCookie(): Locale | null` — parses `document.cookie`, returns a valid `Locale` or `null`.
  - `writeLocaleCookie(locale: Locale): void` — sets `NEXT_LOCALE`, `path=/`, `max-age=31536000`, `SameSite=Lax`. Not httpOnly (client + landing must read it; no secret).

- [ ] **Step 1: Write the failing test**

```ts
// lib/i18n/__tests__/cookie.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { LOCALE_COOKIE, readLocaleCookie, writeLocaleCookie } from '@/lib/i18n/cookie'

describe('locale cookie', () => {
  beforeEach(() => {
    // jsdom: clear cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      if (name) document.cookie = `${name}=; max-age=0; path=/`
    })
  })

  it('uses the shared NEXT_LOCALE name', () => {
    expect(LOCALE_COOKIE).toBe('NEXT_LOCALE')
  })
  it('round-trips a valid locale', () => {
    writeLocaleCookie('es')
    expect(document.cookie).toContain('NEXT_LOCALE=es')
    expect(readLocaleCookie()).toBe('es')
  })
  it('returns null when unset', () => {
    expect(readLocaleCookie()).toBeNull()
  })
  it('ignores an unsupported cookie value', () => {
    document.cookie = 'NEXT_LOCALE=pt; path=/'
    expect(readLocaleCookie()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/i18n/__tests__/cookie.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/cookie`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/i18n/cookie.ts
import { isLocale, type Locale } from '@/lib/i18n/config'

export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
  if (!match) return null
  const value = decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1))
  return isLocale(value) ? value : null
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/i18n/__tests__/cookie.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/cookie.ts lib/i18n/__tests__/cookie.test.ts
git commit -m "feat(i18n): client NEXT_LOCALE cookie helpers"
```

---

## Task 3: Landing dictionary uses shared Locale + cookie persistence

**Files:**
- Modify: `lib/landing/content.ts` (line 1: `export type Lang = 'fr' | 'en'`; and the `landingContent` record type)
- Modify: `components/landing/LandingPage.tsx` (localStorage `ee_lang` → cookie)
- Modify: `components/landing/LandingNav.tsx` (prop type `Lang` → `Locale`)
- Test: `components/landing/__tests__/LandingPage.locale.test.tsx`

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE` (Task 1); `readLocaleCookie`, `writeLocaleCookie` (Task 2).
- Produces: `landingContent: Record<Locale, LandingContent>` (all five keys populated after Task 4). LandingPage now persists the chosen locale to `NEXT_LOCALE`.

> Note: this task rewires the type + persistence and keeps `es/it/de` filled with the **English** content as a temporary stand-in so the record typechecks and the app runs; Task 4 replaces those three with real translations. This keeps each task independently green.

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/LandingPage.locale.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingPage } from '@/components/landing/LandingPage'
import { landingContent } from '@/lib/landing/content'

describe('LandingPage locale selection', () => {
  beforeEach(() => {
    document.cookie = 'NEXT_LOCALE=; max-age=0; path=/'
  })

  it('renders all five locales in the dictionary', () => {
    expect(Object.keys(landingContent).sort()).toEqual(['de', 'en', 'es', 'fr', 'it'])
  })

  it('honors the NEXT_LOCALE cookie on mount', () => {
    document.cookie = 'NEXT_LOCALE=en; path=/'
    render(<LandingPage />)
    // English nav login label from the existing en content
    expect(screen.getByText(landingContent.en.nav.login)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/landing/__tests__/LandingPage.locale.test.tsx`
Expected: FAIL — `landingContent` has only `fr`/`en`, and LandingPage reads localStorage not the cookie.

- [ ] **Step 3: Update `lib/landing/content.ts` typing**

Replace the top of the file:

```ts
// lib/landing/content.ts  (line 1)
import type { Locale } from '@/lib/i18n/config'
export type Lang = Locale
```

Change the export type of the record:

```ts
export const landingContent: Record<Locale, LandingContent> = {
  fr: { /* …unchanged… */ },
  en: { /* …unchanged… */ },
  // Temporary English stand-ins — replaced with real translations in Task 4.
  es: { /* copy of the en object */ },
  it: { /* copy of the en object */ },
  de: { /* copy of the en object */ },
}
```

(Duplicate the existing `en` object literal into `es`, `it`, `de` verbatim for now.)

- [ ] **Step 4: Rewire `LandingPage.tsx` to the cookie**

```tsx
// components/landing/LandingPage.tsx — replace the useState/useEffect/setLanguage block
import { readLocaleCookie, writeLocaleCookie } from '@/lib/i18n/cookie'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
// …
export function LandingPage() {
  const [lang, setLang] = useState<Lang>(DEFAULT_LOCALE)

  useEffect(() => {
    const stored = readLocaleCookie()
    if (stored) setLang(stored)
  }, [])

  const setLanguage = (l: Lang) => {
    setLang(l)
    writeLocaleCookie(l)
  }
  // …rest unchanged (t = landingContent[lang], JSX)…
}
```

Remove the old `window.localStorage` `ee_lang` read/write entirely.

- [ ] **Step 5: Update `LandingNav.tsx` prop types**

Change the `lang: Lang` / `setLanguage: (l: Lang) => void` prop types to use `Locale` (import from `@/lib/i18n/config`). Leave the button markup for Task 4.

- [ ] **Step 6: Run tests**

Run: `pnpm test -- components/landing/__tests__/LandingPage.locale.test.tsx`
Expected: PASS (2 tests). Also run existing landing tests: `pnpm test -- components/landing` → all green.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/landing/content.ts components/landing/LandingPage.tsx components/landing/LandingNav.tsx components/landing/__tests__/LandingPage.locale.test.tsx
git commit -m "feat(i18n): landing uses shared Locale + NEXT_LOCALE cookie"
```

---

## Task 4: Translate landing copy to Spanish, Italian, German

**Files:**
- Modify: `lib/landing/content.ts` (`es`, `it`, `de` entries)
- Test: `lib/landing/__tests__/content.parity.test.ts`

**Interfaces:**
- Consumes: `landingContent` shape (Task 3), `LOCALES` (Task 1).
- Produces: fully-translated `es`/`it`/`de` entries.

> **Content note (deliberate deviation from inline-code rule):** the actual translated strings are *content*, not logic. Generate them at execution with **Sonnet** from the French source, preserving the exact `LandingContent` shape and every interpolation, then run the accent/apostrophe guard. The parity test below is the gate that they are complete and structurally identical. Do NOT translate the mock student names (`rows` in `content.ts`) — they are illustrative data, left as-is across locales.

- [ ] **Step 1: Write the failing parity test**

```ts
// lib/landing/__tests__/content.parity.test.ts
import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'
import { LOCALES } from '@/lib/i18n/config'

// Recursively collect the "shape" (key paths) of an object, ignoring array
// element values but capturing array lengths, so every locale must match.
function shape(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) return [`${path}[]:${v.length}`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))]
  if (v && typeof v === 'object') return Object.keys(v).sort().flatMap((k) => shape((v as Record<string, unknown>)[k], `${path}.${k}`))
  return [`${path}`]
}

describe('landing content parity', () => {
  const reference = shape(landingContent.fr)

  it('covers all five locales', () => {
    expect(LOCALES.every((l) => l in landingContent)).toBe(true)
  })

  for (const locale of LOCALES) {
    it(`${locale} has the exact same shape as fr`, () => {
      expect(shape(landingContent[locale])).toEqual(reference)
    })
    it(`${locale} has no empty strings`, () => {
      const empties = shape(landingContent[locale]).length // structural
      expect(empties).toBeGreaterThan(0)
      const flat = JSON.stringify(landingContent[locale])
      expect(flat).not.toContain('""')
    })
  }

  it('es/it/de differ from en (were actually translated)', () => {
    for (const locale of ['es', 'it', 'de'] as const) {
      expect(JSON.stringify(landingContent[locale])).not.toEqual(JSON.stringify(landingContent.en))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/landing/__tests__/content.parity.test.ts`
Expected: FAIL on the last test — `es/it/de` still equal `en` (stand-ins from Task 3).

- [ ] **Step 3: Produce the translations**

Generate `es`, `it`, `de` `LandingContent` objects from the French (`landingContent.fr`) with Sonnet, matching the shape exactly. Keep `cols`/`statusLabels`/`checklist` arrays the same length. Replace the three stand-in entries in `lib/landing/content.ts`. Run the accent/apostrophe guard used in the redesign work over the edited file.

- [ ] **Step 4: Run tests**

Run: `pnpm test -- lib/landing/__tests__/content.parity.test.ts`
Expected: PASS (all shape/parity/non-empty/differs assertions).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/landing/content.ts lib/landing/__tests__/content.parity.test.ts
git commit -m "feat(i18n): translate landing copy to es/it/de"
```

---

## Task 5: Five-language nav switcher

**Files:**
- Modify: `components/landing/LandingNav.tsx` (the language dropdown button list around lines 87–129)
- Test: `components/landing/__tests__/LandingNav.switcher.test.tsx`

**Interfaces:**
- Consumes: `Locale`, `LOCALES`, `LOCALE_NAMES` (Task 1); `lang` / `setLanguage` props (already typed `Locale` after Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/__tests__/LandingNav.switcher.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LandingNav } from '@/components/landing/LandingNav'
import { landingContent } from '@/lib/landing/content'
import { LOCALE_NAMES } from '@/lib/i18n/config'

describe('LandingNav language switcher', () => {
  const nav = landingContent.en.nav

  it('offers all five languages by native name', () => {
    render(<LandingNav nav={nav} lang="en" setLanguage={() => {}} />)
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('calls setLanguage with the chosen locale', () => {
    const spy = vi.fn()
    render(<LandingNav nav={nav} lang="en" setLanguage={spy} />)
    fireEvent.click(screen.getByText(LOCALE_NAMES.de))
    expect(spy).toHaveBeenCalledWith('de')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/landing/__tests__/LandingNav.switcher.test.tsx`
Expected: FAIL — only `Français`/`English` render.

- [ ] **Step 3: Replace the hardcoded two-button list with a mapped list**

In `components/landing/LandingNav.tsx`, import `LOCALES`, `LOCALE_NAMES` from `@/lib/i18n/config`, and replace the two hardcoded `<button>` entries (Français / English) with:

```tsx
{LOCALES.map((code) => (
  <button
    key={code}
    type="button"
    onClick={() => { setLanguage(code); /* keep existing close-dropdown handler */ }}
    className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === code ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
  >
    {LOCALE_NAMES[code]}
  </button>
))}
```

Keep the trigger button showing `{lang}` (or switch to `{LOCALE_NAMES[lang]}` if preferred) and its existing `aria-label="Changer de langue"`.

- [ ] **Step 4: Run tests**

Run: `pnpm test -- components/landing/__tests__/LandingNav.switcher.test.tsx`
Expected: PASS (2 tests). Re-run existing `components/landing` tests → green.

- [ ] **Step 5: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/__tests__/LandingNav.switcher.test.tsx
git commit -m "feat(i18n): five-language landing nav switcher"
```

---

## Task 6: `users.locale` schema foundation

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_users_locale.sql`
- Modify: `types/supabase.ts` (regenerated), `types/db.ts` (only if the narrowing alias needs the new column)
- Test: RLS matrix case (add to the existing `users` matrix per `docs/security/rls-testing.md`)

**Interfaces:**
- Produces: `users.locale text not null default 'en'`, CHECK ∈ five codes. First consumed by Phase 2 (organizer settings).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/<ts>_users_locale.sql
alter table users
  add column locale text not null default 'en'
  check (locale in ('en', 'fr', 'es', 'it', 'de'));
```

- [ ] **Step 2: Add the failing RLS matrix case**

Add to the users RLS matrix (mirror the existing self-update cases): a user CAN update their own `locale`; a user CANNOT update another user's `locale` (row not visible / update affects 0 rows). Follow the exact harness pattern in `docs/security/rls-testing.md` and the existing `users` cases.

- [ ] **Step 3: Run the matrix to verify the new case fails (column absent locally)**

Run: `pnpm test:rls`
Expected: FAIL — `locale` column does not exist yet on the test DB.

- [ ] **Step 4: Apply to staging first**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Expected: migration applies to staging. (If db push refuses due to pre-existing ledger drift, note it and proceed — see the multi-tenancy memory; the authoritative apply is prod via MCP.)

- [ ] **Step 5: Apply to prod via MCP + reconcile ledger**

Use MCP `apply_migration` (`name` = `users_locale`). Then MCP `list_migrations`; if the stamped version differs from the filename, `git mv` the local file to the stamped version.

- [ ] **Step 6: Regenerate types**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim. Adjust `types/db.ts` only if compile requires it.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Run the matrix to verify it passes**

Run: `pnpm test:rls`
Expected: PASS — self-update allowed, cross-user update denied.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/ types/supabase.ts types/db.ts <rls matrix test file>
git commit -m "feat(i18n): add users.locale column + RLS matrix case"
```

---

## Final Verification (before PR)

- [ ] `pnpm lint` — clean.
- [ ] `pnpm test` — all green (config, cookie, landing locale, content parity, nav switcher).
- [ ] `pnpm test:rls` — green (users.locale self-update / cross-user deny).
- [ ] `pnpm build` — succeeds; `app/page.tsx` still statically prerendered (no dynamic root layout introduced). Confirm build output marks `/` as static (`○`/prerendered), not dynamic (`ƒ`).
- [ ] Manual: run `pnpm dev`, open `/`, switch through all five languages, reload → choice persists via `NEXT_LOCALE` cookie.

## Out of scope (later phases)

- next-intl install, server locale resolver (`resolveLocale`), `i18n/request.ts`, provider in portal layouts → **Phase 2**.
- Organizer settings language control (first writer of `users.locale`) → **Phase 2**.
- Student portal control + apply-funnel unification + `applications.language` widen → **Phase 3**.
- Email + `send-reminders` localization → **Phase 4**.
