# Multi-language (i18n) support — design

**Date:** 2026-07-14
**Status:** Approved architecture; Phase 1 ready to plan.

## Goal

Make all of EazyExchange available in **English, French, Spanish, Italian, German**.

- **Landing page:** language chosen via a dropdown (anonymous visitors).
- **Organizer & student portals:** language chosen in settings, stored on the account.
- **Emails** (and the `send-reminders` edge function) render in the recipient's language.

## Decisions (locked)

| Decision | Choice |
|---|---|
| URL routing | **No locale prefix.** Locale comes from a cookie (anonymous) or the user's profile (logged in). URLs stay clean. |
| Pre-preference email language | The **triggering organizer's** language drives student/parent emails until that person sets their own; then their own wins. |
| Translation scope | **App chrome + email boilerplate only.** Organizer-authored content (exchange names, form/field labels, terms text, rejection notes) renders **verbatim**. |
| Ultimate default / missing-key fallback | **English.** |
| Library | **next-intl** in no-routing (cookie/profile) mode. |
| Profile storage | `users.locale` — the `users` table holds both organizers and students. |

## Non-goals

- Translating organizer-authored content (separate future project if ever wanted).
- Per-language SEO / locale-prefixed marketing URLs (a future option; not now).
- Right-to-left languages (all five are LTR).

---

## Architecture

### Supported locales

`en`, `fr`, `es`, `it`, `de`. **French is the source language** — the existing hardcoded copy is authoritative; the other four are translations of it. `en` is the default and the missing-key fallback.

A single module owns the list and types:

```
lib/i18n/config.ts
  export const LOCALES = ['en', 'fr', 'es', 'it', 'de'] as const
  export type Locale = (typeof LOCALES)[number]
  export const DEFAULT_LOCALE: Locale = 'en'
  export const LOCALE_NAMES: Record<Locale, string> =
    { en: 'English', fr: 'Français', es: 'Español', it: 'Italiano', de: 'Deutsch' }
  export function isLocale(x: string): x is Locale
```

### Active-locale resolution

One resolver, used by every server entry point, in priority order:

1. **Logged-in user** → `users.locale`.
2. **Anonymous** → `NEXT_LOCALE` cookie.
3. **No cookie** → `Accept-Language` negotiated against `LOCALES`.
4. **Fallback** → `DEFAULT_LOCALE` (`en`).

```
lib/i18n/resolve.ts
  export async function resolveLocale(): Promise<Locale>
    // reads Supabase user → users.locale; else cookies(); else headers()
```

This is wired into next-intl's request config:

```
i18n/request.ts        // getRequestConfig → { locale, messages }
```

`resolveLocale()` calls `getAuthUser()` (already cached per request via the perf-round-trips work), so the profile lookup is cheap and shared.

### Message catalogs

```
messages/
  en.json   fr.json   es.json   it.json   de.json
```

Namespaced by surface so each phase edits a bounded slice:

```
{
  "common":    { … },   // buttons, generic labels, shared system messages
  "landing":   { … },   // Phase 1
  "organizer": { … },   // Phase 2
  "student":   { … },   // Phase 3
  "apply":     { … },   // Phase 3
  "emails":    { … }     // Phase 4 — ALSO imported by the edge function
}
```

- Type-safe keys: a `global.d.ts` augments next-intl's `Messages` type from `en.json`, so an unknown key fails `pnpm build`.
- ICU used for interpolation and plurals (e.g. `"{count, plural, one {# form} other {# forms}}"`).
- The `emails` namespace is plain, ICU-free-enough JSON so the Deno edge function can key-lookup it directly (see below).

### Reading messages

- **Server Components / Server Actions:** `getTranslations('namespace')` from next-intl/server.
- **Client Components:** `useTranslations('namespace')`, provided by `NextIntlClientProvider`.
- **Provider placement — NOT the root layout.** `app/layout.tsx` must stay static and locale-agnostic: the marketing landing (`app/page.tsx`) is deliberately statically prerendered to kill anonymous cold starts (perf-cold-starts work), and a root provider that reads a server-resolved locale would force the whole tree — landing included — to render dynamically. The provider therefore mounts in the **already-dynamic portal layouts** (`app/(organizer)/layout.tsx`, `app/(student)/layout.tsx`) and any dynamic public route that needs it (apply funnel), each setting the resolved locale on `<html lang>` / a wrapper.
- **The landing is the exception:** it stays a client-side dictionary (`lib/landing/content.ts`), statically prerendered, selecting its language from the `NEXT_LOCALE` cookie on the client. It does not use next-intl. This is intentional — it is the only surface where preserving the static prerender outweighs unifying on one runtime.

---

## Data / schema changes

### `users.locale`

Migration `supabase/migrations/<ts>_users_locale.sql`:

```sql
alter table users
  add column locale text not null default 'en'
  check (locale in ('en','fr','es','it','de'));
```

- **RLS:** no new policy — the existing `"users update themselves" … using (id = auth.uid())` (migration `20260624000002`) already permits a user to update their own `locale`. No column grants restrict `users`. Add an RLS-matrix case asserting a user can set their own `locale` and **cannot** set another user's.
- Follows the canonical schema workflow in `CLAUDE.md`: apply to **staging first** (`supabase db push --db-url "$STAGING_DB_URL"`), then prod via MCP `apply_migration`; then `generate_typescript_types` → overwrite `types/supabase.ts` → `npx tsc --noEmit`.

### `applications.language` widened

Currently constrained to `'en' | 'fr'`. Widen the CHECK to all five codes (Phase 3). It stays the applicant's chosen funnel language and **seeds `users.locale`** when the applicant enrols. RLS-matrix: none new; update any test that hardcodes the two-value domain.

---

## UX — where language is chosen

- **Landing** (`components/landing/*`): a `LanguageSwitcher` in the nav (and/or footer). Selecting a language sets the `NEXT_LOCALE` cookie and refreshes. Options show native names from `LOCALE_NAMES`.
- **Organizer** (`app/(organizer)/settings`): a language `<select>` wired through `actions/settings.ts` → `users.locale`.
- **Student:** there is no student settings page today. Add a compact language control in the student shell/menu (`components/student/*` / `app/(student)/layout.tsx`) → `users.locale`.
- **Apply funnel** (`components/ApplyEntry.tsx`, `components/ApplicationStartForm.tsx`): a language selector at the start replaces the current ad-hoc `fr ? … : …` en/fr toggle; the choice is stored on the application (Phase 3).

`LanguageSwitcher` is one shared client component parameterised by "what to do on change" (set cookie vs. call the profile action), so the three placements reuse it.

---

## Emails + edge function

### `lib/email.ts`

- Each template function takes a `locale: Locale` and pulls subject/body from the `emails` catalog namespace via a small server-side `t(locale, key, vars)` (next-intl's core formatter, or a thin wrapper over the same JSON).
- **Recipient-locale resolution** (a shared helper `pickEmailLocale`):
  1. enrolled student's `users.locale`, else
  2. the application's `language`, else
  3. the **triggering organizer's** `users.locale`, else
  4. `en`.
- HTML escaping of user-supplied values is preserved. No student PII in logs (unchanged).

### `send-reminders` edge function (Deno)

- Imports the shared `messages/*.json` (`emails` namespace) and a tiny `t(locale, key, vars)` doing key lookup + `{var}` interpolation — no next-intl runtime in Deno.
- Same `pickEmailLocale` logic (reimplemented against the row data it already fetches).
- Deploy remains manual: `supabase functions deploy send-reminders` (keep `verify_jwt:false`).

---

## Translation production

- **French is the source** (extracted from existing strings). `en`, `es`, `it`, `de` are produced from it.
- Generate with **Sonnet**, not Haiku (logged lesson: Haiku strips accents), then run the accent/apostrophe guard used in the redesign work.
- A **key-parity test** asserts all five catalogs share exactly the same key set — a missing translation fails CI, never reaches production.
- Native-speaker review is desirable eventually; shipping machine-quality translations first is an accepted risk, noted per phase.

---

## Phased rollout

The architecture above is decided once here. Each phase is a separate spec → plan → build → review → PR (repo convention; mirrors the redesign phases). Extraction is mechanical per surface.

**Phase 1 — Foundation + landing (detailed below; build now).**
Client-side five-language landing + the shared foundation (locale config, `NEXT_LOCALE` cookie, `users.locale` schema). No next-intl yet — the landing stays a static client dictionary, so nothing server-rendered exists to resolve a locale.

**Phase 2 — Organizer portal.** Install `next-intl`; add the server locale resolver (`resolveLocale()` — 4-tier order) and `i18n/request.ts`; mount `NextIntlClientProvider` in `app/(organizer)/layout.tsx` (already dynamic). Extract all `app/(organizer)/*` + `components/{dashboard,exchanges,forms,documents,students,settings,shell}` copy into the `organizer`/`common` namespaces; add the settings language control (first writer of `users.locale`).

**Phase 3 — Student portal + apply funnel.** Extract `app/(student)/*` + `components/student/*` and the apply funnel; add the student language control; retire the en/fr ternaries; widen `applications.language`; seed `users.locale` on enrolment.

**Phase 4 — Emails + edge function.** Localize `lib/email.ts` templates and `send-reminders`; wire `pickEmailLocale`; `emails` namespace in all five languages.

---

## Phase 1 — Foundation + landing (build scope)

**Key constraint discovered during planning:** the landing is *already* a client-side dictionary (`lib/landing/content.ts`, en/fr) rendered by the statically-prerendered `LandingPage` client component, with a switcher already in `LandingNav`. Phase 1 therefore **extends** that (2→5 languages) rather than extracting into next-intl — and it introduces **no next-intl and no server resolver**, both of which would force the static landing dynamic if wired into the root layout. Those arrive in Phase 2 with the first server-rendered surface. The detailed task breakdown lives in `docs/superpowers/plans/2026-07-14-i18n-phase1-foundation-landing.md`.

### Deliverables

1. **Shared config + cookie**
   - `lib/i18n/config.ts` (`LOCALES`, `Locale`, `DEFAULT_LOCALE` = `en`, `LOCALE_NAMES`, `isLocale`).
   - `lib/i18n/cookie.ts` — `NEXT_LOCALE` name + client `readLocaleCookie()`/`writeLocaleCookie()`.

2. **Five-language landing**
   - `lib/landing/content.ts`: `Lang` → shared `Locale`; `landingContent` extended to all five (es/it/de translated from fr via Sonnet + accent guard).
   - `LandingPage.tsx`: persistence moves from `ee_lang` localStorage to the `NEXT_LOCALE` cookie so the choice carries into `/apply`, `/signup`, etc. Stays a static client component.
   - `LandingNav.tsx`: switcher renders all five from `LOCALE_NAMES`.

3. **Schema foundation**
   - `users.locale` migration (staging → prod per `CLAUDE.md`), types regenerated, `tsc --noEmit` clean. First *consumed* in Phase 2.
   - RLS-matrix case: self-update of `locale` allowed; cross-user denied.

### Tests (Phase 1)

- `lib/i18n/config` + `cookie` unit tests (locale narrowing; cookie round-trip; unsupported values ignored).
- Landing content **parity test**: all five entries share the exact shape as `fr`, no empty strings, es/it/de differ from en.
- `LandingPage` honors the `NEXT_LOCALE` cookie; `LandingNav` renders five options and calls `setLanguage`.
- `pnpm test:rls`: `users.locale` self-update allowed; cross-user update denied.
- `pnpm build` confirms `/` is still statically prerendered (no dynamic root layout introduced).

### Verifying Changes (Phase 1)

`pnpm lint && pnpm test && pnpm build`, plus `pnpm test:rls` (schema touched). New column ships with its matrix case in the same PR. Staging-first migration apply per `CLAUDE.md`.

### Out of scope for Phase 1

next-intl, `resolveLocale()`, `i18n/request.ts`, message JSON catalogs, portal/student/apply/email surfaces (Phases 2–4). The organizer settings control is the first writer of `users.locale`, in Phase 2.

---

## Risks & mitigations

- **Volume of extraction** (~130 files across phases) → phased, bounded namespaces; key-parity + type-safe keys catch omissions at CI, not in prod.
- **Translation quality** → Sonnet + accent/apostrophe guard; native review deferred (accepted risk, noted per phase).
- **Edge function drift** (separate Deno runtime) → it imports the *same* `messages/*.json`; the `emails` namespace is kept ICU-simple so a plain key-lookup suffices.
- **Locale resolution cost** → `resolveLocale()` rides the already-cached per-request auth lookup; no extra round-trip.
- **PII** → email localization changes wording only; no student PII enters logs (unchanged rule).
