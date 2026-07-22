# i18n Phase 3 — Student Portal + Apply Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the student portal and the whole anonymous application funnel under `next-intl` so every chrome string renders in five languages (en/fr/es/it/de), give students a language control, retire the ad-hoc `fr ? … : …` / `T[lang]` en-fr dictionaries, widen `applications.language` to all five codes, and seed `users.locale` from the application language at enrolment.

**Architecture:** Two new namespaces — `student` (portal chrome) and `apply` (funnel + application field labels, shared with the organizer's read-only review view). `NextIntlClientProvider` mounts in the already-dynamic `app/(student)/layout.tsx` (full catalog) and in each `force-dynamic` public funnel page (`/apply/[slug]`, `/apply/resume/[token]`, `/invite/[token]`) with a **`{ common, apply }` subset** so the anonymous funnel does not ship organizer copy. Anonymous locale comes from `resolveLocale()` (cookie → Accept-Language → `en`); once an application row exists its stored `language` is authoritative and wins on the resume page. `lib/application-form.ts` loses its inline `{ en, fr }` label maps: it keeps a locale-free schema (ids, types, required, option *values*) and gains `localizedApplicationSections(t)`, so the form, the organizer read view and the PDF recap all read the same `apply.fields.*` catalog. French is the verbatim source; `en` is the fallback; es/it/de are Sonnet-generated and gated by the existing key-parity test.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, `next-intl@^4` (no-i18n-routing mode, already installed in Phase 2), Tailwind, Vitest + Testing Library (jsdom), Supabase (Postgres + RLS), `@react-pdf/renderer`, pnpm.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Supported locales, exact order: `en`, `fr`, `es`, `it`, `de`. Default + missing-key fallback: `en`. Native names: `English`, `Français`, `Español`, `Italiano`, `Deutsch`. These live in `lib/i18n/config.ts` — import them, never re-declare.
- **French is the translation source** (existing hardcoded copy is authoritative, copied **verbatim** into `fr.json` — accents and typographic apostrophes `’` preserved exactly). `en` is written from the existing English half of the current `T` dictionaries where one exists, otherwise as the English chrome equivalent. `es`/`it`/`de` are generated **with Sonnet** (Haiku strips accents), then the accent/apostrophe guard is run. See `[[feedback_french_transcription_pitfalls]]`.
- **Translate app chrome only.** Organizer-authored content — exchange names, form/document template names and descriptions, info-card titles/bodies, review notes, student names/emails, fillable-document body text under `lib/forms/fillable/*` — renders **verbatim** and is never keyed. The fillable French legal/administrative documents are explicitly **out of scope**.
- **The root layout (`app/layout.tsx`) and the landing (`app/page.tsx` / `LandingPage`) stay static and locale-agnostic.** `pnpm build` must still mark `/` as `○` (prerendered), never `ƒ`. Every provider mount in this phase is inside a route that is already dynamic (`app/(student)/*` is auth-gated; the three funnel pages already declare `export const dynamic = 'force-dynamic'`).
- **Never log student/parent PII** (unchanged). Localization changes wording only. No new PII in test fixtures.
- **Production redacts thrown Server Action error messages** (opaque digest). Do not convert existing throw-based flows to structured returns in this phase — translate strings in place. The funnel's already-structured returns (`downloadApplicationRecap`'s `res.reason`, `respondToInvitation`'s `res.message`) stay structured.
- Auth preambles stay `requireUser()` / `requireStudent()` from `lib/auth/require.ts`; the strings `'Unauthenticated'` / `'Unauthorized'` are load-bearing for tests — **do not translate those two** (only `ErrorState`'s user-facing mapping of them).
- Key names are **English, semantic, camelCase leaf**; the value carries the language, the key never does. ICU for interpolation/plurals.
- Verifying Changes gate before any push: `pnpm lint && pnpm test && pnpm build`. This phase **touches `supabase/migrations/`**, so `pnpm test:rls` is also required.
- **`supabase/migrations/` is single-writer and this session holds the lock.** Migration order is non-negotiable: staging first (`set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`), then prod via MCP `apply_migration`, then reconcile the filename against MCP `list_migrations`, then regenerate types.

---

## File Structure

**New**
- `supabase/migrations/<ts>_applications_language_all_locales.sql` — widens the `applications.language` CHECK from `('en','fr')` to all five codes.
- `components/i18n/LanguageSwitcher.tsx` — the one shared language control (spec §UX), parameterised by what to do on change.
- `lib/application-form.labels.ts` — `localizedApplicationSections(t)` + the `AppTranslator` type; keeps `lib/application-form.ts` locale-free.
- `components/student/StudentLanguageMenu.tsx` — the student shell's language control (wraps `LanguageSwitcher`).
- `components/i18n/__tests__/LanguageSwitcher.test.tsx`, `lib/__tests__/application-form.labels.test.ts`, `app/(student)/__tests__/layout.intl.test.tsx`.

**Modified — infrastructure**
- `lib/i18n/messages.ts` — add `pickNamespaces()` and `namespaceTranslator()`.
- `types/db.ts` — `ApplicationLanguage` narrows to `Locale`.
- `types/supabase.ts` — regenerated verbatim after the migration.
- `actions/invitations.ts` — select `language`, seed `users.locale` at enrolment.
- `actions/apply.ts` — `'en' | 'fr'` → `Locale` throughout; new `setApplicationLanguage`; recap translator.
- `components/settings/LanguageSelect.tsx` — becomes a thin settings-card wrapper over `LanguageSwitcher`.

**Modified — extraction surfaces (copy → `messages`, literals → `t()`)**
- Student portal: `app/(student)/layout.tsx`, `error.tsx`, `loading.tsx`, `infos/page.tsx`, `my-forms/page.tsx`, `my-forms/[assignmentId]/page.tsx`; `components/student/{DossierView,InfoCardsView,StudentTabs,StudentTopBar}.tsx`; `lib/student/dossier.ts` (`dossierSubline`); `lib/submission-status.ts`.
- Student-facing shared forms: `components/{DataEntryForm,DocumentUploadForm,ExternalLinkCard,FillableForm}.tsx`.
- Shared system states: `components/{ErrorState,LoadingState}.tsx` (rendered under both portals — both already have a provider).
- Apply funnel: `components/{ApplyEntry,ApplicationStartForm,ApplicationForm,ApplicationPhotoUpload,ApplicationReadView,ApplicationRecapButton,InviteResponseForm}.tsx`; `app/apply/[slug]/page.tsx`, `app/apply/resume/[token]/page.tsx`, `app/invite/[token]/page.tsx`; `lib/application-form.ts`; `lib/pdf/application-recap.tsx`.
- `messages/{en,fr,es,it,de}.json` — new `student` and `apply` namespaces.
- Each surface's existing `__tests__/*` gains the `renderWithIntl` wrapper (from Phase 2, `lib/test/renderWithIntl.tsx`, defaults `locale="fr"` + `fr.json`).

---

## Namespace & key conventions (read once, applies to every extraction task)

- **`common`** (existing) — reuse `common.actions.*`, `common.states.*`, `common.errors.generic`. Add only genuinely cross-portal strings here.
- **`student`** — student-portal chrome, sub-keyed by area: `student.shell.*`, `student.dossier.*`, `student.infos.*`, `student.assignment.*`, `student.forms.*` (the shared data-entry / upload / external-link / fillable chrome), `student.states.*` (submission status badges).
- **`apply`** — the anonymous funnel and everything about an application's own field vocabulary: `apply.start.*`, `apply.welcome.*`, `apply.form.*`, `apply.photo.*`, `apply.recap.*`, `apply.page.*`, `apply.invite.*`, and the two structural maps `apply.sections.<sectionId>.title` and `apply.fields.<fieldId>.{label,options.<optionValue>}`.

Rules:
- **Do not key** organizer-authored/dynamic values. Only static chrome.
- ICU for plurals: `"{n, plural, one {# chose} other {# choses}}"`; call `t('key', { n })`.
- When the same French string already exists in `common`, reference it rather than re-adding under `student`/`apply`.

---

## Task 1: Widen the `applications.language` CHECK (staging → prod → types)

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_applications_language_all_locales.sql`
- Modify: `types/supabase.ts` (regenerated), `types/db.ts`
- Test: `tests/rls/matrix.test.ts`

**Interfaces:**
- Produces: `applications.language` accepting `'en'|'fr'|'es'|'it'|'de'`; `types/db.ts` exporting the narrowed column type as `Locale`.

> **This is the only session permitted to touch `supabase/migrations/`.** Do not start this task if another session is mid-migration.

- [ ] **Step 1: Write the migration file**

Name it with the current UTC timestamp, e.g. `supabase/migrations/20260722120000_applications_language_all_locales.sql`:

```sql
-- Widen applications.language from the original en/fr funnel toggle to the full
-- supported locale set (i18n Phase 3). The column keeps its 'en' default and its
-- not-null constraint; only the domain grows, so every existing row stays valid.
alter table applications
  drop constraint if exists applications_language_check;

alter table applications
  add constraint applications_language_check
  check (language in ('en', 'fr', 'es', 'it', 'de'));
```

> The original constraint was created inline by `20260629000001_applications.sql` (`language text not null default 'en' check (language in ('en','fr'))`), so Postgres auto-named it `applications_language_check`. `drop constraint if exists` makes the migration safe even if that name ever differed.

- [ ] **Step 2: Confirm the constraint name on staging before applying**

```bash
set -a; source .env.staging; set +a
psql "$STAGING_DB_URL" -c "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'applications'::regclass and contype = 'c';"
```

Expected: a row named `applications_language_check` defined as `CHECK ((language = ANY (ARRAY['en'::text, 'fr'::text])))`. If the name differs, edit the migration to drop that exact name before re-running.

> On WSL2 this may hang on IPv6 — see `[[reference_wsl2_supabase_db_push_ipv6]]`: resolve with `getent ahostsv4 <host>` and substitute the IPv4 address into the URL.

- [ ] **Step 3: Apply to staging FIRST**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Expected: the new migration applies; no other pending migrations appear (if others do, STOP — that is drift from another session).

- [ ] **Step 4: Verify on staging**

```bash
psql "$STAGING_DB_URL" -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'applications_language_check';"
```

Expected: `CHECK ((language = ANY (ARRAY['en'::text, 'fr'::text, 'es'::text, 'it'::text, 'de'::text])))`.

- [ ] **Step 5: Apply to prod via MCP**

Use the Supabase MCP `apply_migration` tool with `name = "applications_language_all_locales"` and the exact SQL from Step 1. **Never** `supabase db push` against prod.

- [ ] **Step 6: Reconcile the filename with the prod ledger**

Call MCP `list_migrations`. If the ledger stamped a version different from the local filename:

```bash
git mv supabase/migrations/<local-version>_applications_language_all_locales.sql \
       supabase/migrations/<ledger-version>_applications_language_all_locales.sql
```

Then confirm every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

- [ ] **Step 7: Regenerate DB types**

Call MCP `generate_typescript_types` and overwrite `types/supabase.ts` **verbatim** (never hand-edit it).

- [ ] **Step 8: Narrow the app-level type in `types/db.ts`**

`types/db.ts:81` currently reads `language: 'en' | 'fr'`. Replace it with the shared locale type, adding the import at the top of the file:

```ts
import type { Locale } from '@/lib/i18n/config'
```

```ts
  language: Locale
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors **only** where `'en' | 'fr'` is still hardcoded in `actions/apply.ts` and the funnel components — those are fixed in Tasks 8–9. Record the list; if any error appears outside `actions/apply.ts`, `components/Application*.tsx`, `components/ApplyEntry.tsx`, `lib/pdf/application-recap.tsx`, `lib/application-form*.ts`, investigate before moving on.

> Leaving `tsc` red across a task boundary is a deliberate, bounded exception here: the schema must land before the code that depends on it. Tasks 8 and 9 close it. Do not push in this state.

- [ ] **Step 10: Add the RLS/constraint matrix case**

Append to `tests/rls/matrix.test.ts`, in the same `describe` block that holds the existing `'student A can set their own locale'` case (around line 309):

```ts
  it('applications: accepts every supported locale and rejects an unsupported one', async () => {
    for (const locale of ['en', 'fr', 'es', 'it', 'de']) {
      expect(await asService(tx =>
        tx`update applications set language = ${locale} where id = ${fx.applicationA}`)).toBe(1)
    }
    await expect(asService(tx =>
      tx`update applications set language = 'pt' where id = ${fx.applicationA}`)).rejects.toThrow()
  })
```

> Read the surrounding cases first: use whatever service-role/actor helper and fixture-id naming that file already uses (`asService`/`fx.applicationA` here are the shapes to match, not necessarily the exact exported names). If no application fixture exists, add one to `tests/rls/seed.ts` alongside the existing student fixtures.

- [ ] **Step 11: Run the RLS matrix**

Run: `pnpm test:rls`
Expected: all green, including the new case. (Needs the local Supabase stack or `RLS_TEST_DB_URL` — see `docs/security/rls-testing.md`.)

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations types/supabase.ts types/db.ts tests/rls/matrix.test.ts tests/rls/seed.ts
git commit -m "feat(i18n): widen applications.language to all five locales"
```

---

## Task 2: Message-subset + standalone-translator helpers

**Files:**
- Modify: `lib/i18n/messages.ts`
- Test: `lib/i18n/__tests__/messages.test.ts`

**Interfaces:**
- Produces:
  - `AppTranslator = (key: string, values?: Record<string, string | number | Date>) => string` — the namespace-scoped translator type, shaped so next-intl's `useTranslations` / `getTranslations` **and** `namespaceTranslator` all satisfy it. Defined here because Tasks 6, 7 and 8 all consume it.
  - `pickNamespaces(messages, namespaces): AbstractIntlMessages` — a shallow subset of a catalog, so the public funnel ships only `common` + `apply` to the browser.
  - `namespaceTranslator(locale, namespace): Promise<AppTranslator>` — a **sync** translator usable outside React (the PDF recap renderer, plain server helpers).

- [ ] **Step 1: Write the failing test**

Append to `lib/i18n/__tests__/messages.test.ts`:

```ts
import { pickNamespaces, namespaceTranslator } from '@/lib/i18n/messages'

describe('pickNamespaces', () => {
  it('keeps only the requested top-level namespaces', () => {
    const picked = pickNamespaces(
      { common: { a: '1' }, organizer: { b: '2' }, apply: { c: '3' } },
      ['common', 'apply'],
    )
    expect(Object.keys(picked).sort()).toEqual(['apply', 'common'])
  })

  it('skips namespaces that are absent from the catalog', () => {
    const picked = pickNamespaces({ common: { a: '1' } }, ['common', 'apply'])
    expect(Object.keys(picked)).toEqual(['common'])
  })
})

describe('namespaceTranslator', () => {
  it('resolves a key inside the namespace for the given locale', async () => {
    const t = await namespaceTranslator('fr', 'common')
    expect(t('actions.save')).toBe('Enregistrer')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/i18n/__tests__/messages.test.ts`
Expected: FAIL — `pickNamespaces` / `namespaceTranslator` are not exported.

- [ ] **Step 3: Implement both helpers**

Append to `lib/i18n/messages.ts` (add `createTranslator` to the existing `next-intl` import, or add the import line if none exists):

```ts
import { createTranslator } from 'next-intl'

// A namespace-scoped translator. Both next-intl's `useTranslations` /
// `getTranslations` and our own `namespaceTranslator` are assignable to this,
// so helpers that need labels can take one without caring which produced it.
export type AppTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string

// Shallow subset of a catalog. The anonymous apply funnel mounts a provider on
// public pages; shipping the whole catalog there would push organizer copy into
// an unauthenticated bundle for no benefit.
export function pickNamespaces(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const out: Record<string, unknown> = {}
  for (const ns of namespaces) {
    if (ns in (messages as Record<string, unknown>)) {
      out[ns] = (messages as Record<string, unknown>)[ns]
    }
  }
  return out as AbstractIntlMessages
}

// A sync translator for code that runs outside React's request context — the
// PDF recap renderer and other pure helpers that take a locale as data.
export async function namespaceTranslator(
  locale: Locale,
  namespace: string,
): Promise<AppTranslator> {
  const messages = await loadMessages(locale)
  const t = createTranslator({ locale, messages, namespace })
  return (key, values) => t(key as never, values as never)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/i18n/__tests__/messages.test.ts`
Expected: PASS (all cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/messages.ts lib/i18n/__tests__/messages.test.ts
git commit -m "feat(i18n): namespace subset + standalone translator helpers"
```

---

## Task 3: Shared `LanguageSwitcher`

**Files:**
- Create: `components/i18n/LanguageSwitcher.tsx`, `components/i18n/__tests__/LanguageSwitcher.test.tsx`
- Modify: `components/settings/LanguageSelect.tsx`
- Test: `components/settings/__tests__/LanguageSelect.test.tsx` (must stay green unchanged)

**Interfaces:**
- Consumes: `LOCALES`, `LOCALE_NAMES`, `Locale`.
- Produces: `LanguageSwitcher({ current, onSelect, id?, className?, ariaLabel? })` — a controlled `<select>` of the five native names that calls `onSelect(next)` and disables itself while the promise is in flight. It owns **no** persistence: the caller decides between the profile action and the cookie. This is the spec's one shared control (§UX) and the settings card, the student menu (Task 5) and the funnel (Task 9) all use it.

- [ ] **Step 1: Write the failing test**

```tsx
// components/i18n/__tests__/LanguageSwitcher.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { LOCALE_NAMES } from '@/lib/i18n/config'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'

describe('LanguageSwitcher', () => {
  it('lists all five languages by native name and shows the current one', () => {
    renderWithIntl(<LanguageSwitcher current="fr" onSelect={vi.fn()} ariaLabel="Langue" />)
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    }
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('fr')
  })

  it('calls onSelect with the chosen locale', async () => {
    const onSelect = vi.fn(async () => {})
    renderWithIntl(<LanguageSwitcher current="fr" onSelect={onSelect} ariaLabel="Langue" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'de' } })
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith('de'))
  })

  it('disables the control while onSelect is in flight', async () => {
    let release: () => void = () => {}
    const onSelect = vi.fn(() => new Promise<void>(r => { release = r }))
    renderWithIntl(<LanguageSwitcher current="fr" onSelect={onSelect} ariaLabel="Langue" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'es' } })
    await vi.waitFor(() => expect(select.disabled).toBe(true))
    release()
    await vi.waitFor(() => expect(select.disabled).toBe(false))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/i18n/__tests__/LanguageSwitcher.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/i18n/LanguageSwitcher.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config'

interface Props {
  current: Locale
  /** What persisting a choice means here — profile write, cookie write, or both. */
  onSelect: (next: Locale) => void | Promise<void>
  id?: string
  className?: string
  ariaLabel?: string
}

// The single language control (spec §UX). Placement-agnostic and persistence-
// agnostic: organizer settings, the student shell menu and the anonymous apply
// funnel all render this and supply their own onSelect.
export function LanguageSwitcher({ current, onSelect, id, className, ariaLabel }: Props) {
  const [value, setValue] = useState<Locale>(current)
  const [busy, setBusy] = useState(false)

  async function handleChange(next: Locale) {
    setValue(next)
    setBusy(true)
    try {
      await onSelect(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={busy}
      onChange={(e) => void handleChange(e.target.value as Locale)}
      className={
        className ??
        'h-10 w-full max-w-xs rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:opacity-50 sm:w-auto'
      }
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>{LOCALE_NAMES[code]}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- components/i18n/__tests__/LanguageSwitcher.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewrite `components/settings/LanguageSelect.tsx` over the shared control**

Keep the exported name, the card chrome, the `lang-select` id and the two `organizer.settings.language.*` keys so the existing test passes untouched:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateLocale } from '@/actions/settings'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import type { Locale } from '@/lib/i18n/config'

export function LanguageSelect({ current }: { current: Locale }) {
  const t = useTranslations('organizer')
  const router = useRouter()

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <label htmlFor="lang-select" className="mb-1.5 block text-xs font-semibold text-foreground">
        {t('settings.language.label')}
      </label>
      <LanguageSwitcher
        id="lang-select"
        current={current}
        onSelect={async (next) => { await updateLocale(next); router.refresh() }}
      />
      <p className="mt-1 text-[11px] text-placeholder">{t('settings.language.hint')}</p>
    </div>
  )
}
```

- [ ] **Step 6: Run the settings tests unchanged**

Run: `pnpm test -- components/settings components/i18n && npx tsc --noEmit`
Expected: PASS — `LanguageSelect.test.tsx` is **not** edited; it passing over the new internals is the proof the refactor preserved behaviour. `tsc` still shows only the Task-1 funnel errors.

- [ ] **Step 7: Commit**

```bash
git add components/i18n components/settings/LanguageSelect.tsx
git commit -m "refactor(i18n): extract the shared LanguageSwitcher control"
```

---

## Extraction recipe (Tasks 4, 6, 7, 9, 10 all follow this)

> **Deliberate deviation from the full-inline-code rule, identical to Phase 2's.** Extraction is a mechanical per-surface transform over existing copy; transcribing every string into this plan would duplicate files the engineer already has open. Each extraction task therefore specifies (a) the **exhaustive file list**, (b) this recipe, (c) the **regression gate** — the surface's existing tests, re-run under `renderWithIntl`, with their verbatim French assertions **unchanged**. Task 4 carries a full worked example.

**Recipe for each file in the surface:**

1. **Identify** every static chrome string: headings, labels, buttons, placeholders, hints, empty states, badges, `aria-label`s, `alt`s, `title`s. **Skip** anything rendered from props/data (template names, exchange names, info-card bodies, review notes, student names, deadlines).
2. **Add keys** to `messages/fr.json` (value = the **exact existing French string, verbatim**) and `messages/en.json` (value = the existing English half of the file's `T` dictionary if it has one, otherwise the English chrome equivalent) under `student.<area>.…` / `apply.<area>.…`, or reuse `common.…`. es/it/de are deferred to Task 11.
3. **Replace** the literal with `t('area.key')`.
   - **Client component:** `const t = useTranslations('student')` (or `'apply'` / `'common'`) at the top.
   - **Server component / server action / server helper:** `const t = await getTranslations('student')` from `next-intl/server`.
   - A file needing two namespaces takes two hooks, conventionally `t` for its own and `c` for `common`.
4. **Delete** the now-dead `T = { en: …, fr: … }` object and any `const fr = lang === 'fr'` / `T[lang]` plumbing. No `'en' | 'fr'` union may survive this phase outside the DB row type (which is now `Locale`).
5. **Update the surface's `__tests__`:** switch `render(...)` → `renderWithIntl(...)`. Existing French-text assertions stay **unchanged** and must pass.
6. Run the surface's tests + `npx tsc --noEmit`, then commit.

**ICU note:** hand-built plurals (e.g. `${n} ${n > 1 ? 'choses' : 'chose'}`) become `"{n, plural, one {# chose} other {# choses}}"` with `t('key', { n })`. This is the one place to improve on the source rather than copy it.

---

## Task 4: Student portal — provider mount + shell + language control  ← worked example

**Files:**
- Modify: `app/(student)/layout.tsx`, `components/student/StudentTopBar.tsx`, `components/student/StudentTabs.tsx`
- Create: `components/student/StudentLanguageMenu.tsx`, `app/(student)/__tests__/layout.intl.test.tsx`
- Modify tests: `components/student/__tests__/StudentTopBar.test.tsx`
- Modify: `messages/en.json`, `messages/fr.json` (`student.shell.*`)

**Interfaces:**
- Consumes: `resolveLocale`, `loadMessages`, `LanguageSwitcher`, `updateLocale` (the existing `actions/settings.ts` action from Phase 2 — it validates the code and writes `users.locale`; it is role-agnostic, so a student may call it).
- Produces: a student subtree where `useTranslations` / `getTranslations` resolve; `StudentLanguageMenu` rendered inside the top-bar account menu.

> **Check `updateLocale` before reusing it.** Phase 2 wrote it with `getOrganizerCtx()`. If it is organizer-gated, change its preamble to `requireUser()` from `lib/auth/require.ts` (any authenticated user may set their own locale — RLS `"users update themselves"` already scopes the write to `auth.uid()`) and keep everything else identical. If it already uses `requireUser()`, leave it alone. Either way its existing test must stay green; add a case asserting a student can call it if you changed the preamble.

- [ ] **Step 1: Mount the provider in `app/(student)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages } from '@/lib/i18n/messages'
import { StudentTopBar } from '@/components/student/StudentTopBar'
import { StudentTabs } from '@/components/student/StudentTabs'
import { getStudentContext } from '@/actions/student-context'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (profile?.role !== 'student') redirect('/dashboard')

  const ctx = await getStudentContext()

  // resolveLocale() reads the same per-request cached profile fetched above, so
  // this adds no round-trip.
  const locale = await resolveLocale()
  const messages = await loadMessages(locale)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale} className="min-h-screen bg-background">
        <StudentTopBar initials={ctx.initials} exchangeLabel={ctx.exchangeLabel} locale={locale} />
        <StudentTabs />
        <main className="mx-auto max-w-[920px] px-7 pb-[70px] pt-[34px]">{children}</main>
      </div>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 2: Create `components/student/StudentLanguageMenu.tsx`**

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateLocale } from '@/actions/settings'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import type { Locale } from '@/lib/i18n/config'

// The student portal has no settings page, so the language control lives in the
// account menu (spec §UX). Writes users.locale — the same column and action the
// organizer settings card uses.
export function StudentLanguageMenu({ current }: { current: Locale }) {
  const t = useTranslations('student')
  const router = useRouter()

  return (
    <div className="border-b px-3 py-2">
      <label htmlFor="student-lang" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {t('shell.language')}
      </label>
      <LanguageSwitcher
        id="student-lang"
        current={current}
        onSelect={async (next) => { await updateLocale(next); router.refresh() }}
        className="h-8 w-full rounded-[7px] border px-2 text-[12.5px] focus:border-brand focus:outline-none disabled:opacity-50"
      />
    </div>
  )
}
```

- [ ] **Step 3: Extract `StudentTopBar.tsx` and render the menu**

Take a `locale: Locale` prop, add `const t = useTranslations('student')`, replace the two literals, and put `StudentLanguageMenu` above the sign-out button inside the dropdown:

```tsx
// signature
export function StudentTopBar({ initials, exchangeLabel, locale }: {
  initials: string; exchangeLabel: string | null; locale: Locale
}) {
  const t = useTranslations('student')
```
```tsx
// the account trigger
            aria-label={t('shell.account')}
```
```tsx
// the dropdown body
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-[11px] border bg-card p-1 shadow-float">
              <StudentLanguageMenu current={locale} />
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                {t('shell.signOut')}
              </button>
            </div>
          )}
```

Add the `import { StudentLanguageMenu } from '@/components/student/StudentLanguageMenu'` and `import type { Locale } from '@/lib/i18n/config'` lines.

- [ ] **Step 4: Extract `StudentTabs.tsx`**

The module-level `TABS` array cannot hold `t()` output — move it inside the component:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

export function StudentTabs() {
  const t = useTranslations('student')
  const pathname = usePathname()
  const tabs = [
    { href: '/my-forms', label: t('shell.tabs.dossier') },
    { href: '/infos', label: t('shell.tabs.infos') },
  ]
  return (
    <nav className="sticky top-[66px] z-10 flex gap-1 border-b bg-card px-7">
      {tabs.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-3 text-[13.5px] font-semibold ${
              active ? 'border-brand text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 5: Add the keys**

`messages/fr.json` → new top-level `"student"` namespace (place it after `"organizer"`):

```json
  "student": {
    "shell": {
      "account": "Compte",
      "signOut": "Se déconnecter",
      "language": "Langue",
      "tabs": { "dossier": "Mon dossier", "infos": "Infos" }
    }
  }
```

`messages/en.json` → the same shape:

```json
  "student": {
    "shell": {
      "account": "Account",
      "signOut": "Sign out",
      "language": "Language",
      "tabs": { "dossier": "My file", "infos": "Info" }
    }
  }
```

- [ ] **Step 6: Wrap the top-bar test**

In `components/student/__tests__/StudentTopBar.test.tsx`, switch `render(...)` → `renderWithIntl(...)` (`import { renderWithIntl } from '@/lib/test/renderWithIntl'`) and add the new required prop `locale="fr"` to every render call. Every existing French assertion (`Se déconnecter`, `Compte`) stays **unchanged**. Add a `next/navigation` `useRouter` mock returning `{ refresh: vi.fn(), push: vi.fn() }` if the file does not already have one — `StudentLanguageMenu` now renders inside the open menu.

- [ ] **Step 7: Write the provider contract test**

```tsx
// app/(student)/__tests__/layout.intl.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import fr from '@/messages/fr.json'

// A minimal consumer proving the provider makes `student` keys resolvable.
// The real StudentLayout is an async Server Component and is exercised by
// `pnpm build` + the manual smoke, not unit-rendered here.
function Probe() {
  const t = useTranslations('student')
  return <span>{t('shell.tabs.dossier')}</span>
}

describe('student intl provider', () => {
  it('resolves student keys under the provider (fr)', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <Probe />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Mon dossier')).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm test -- components/student "app/(student)" && npx tsc --noEmit`
Expected: green. `tsc` still shows only the Task-1 funnel errors.

- [ ] **Step 9: Commit**

```bash
git add "app/(student)/layout.tsx" "app/(student)/__tests__/layout.intl.test.tsx" components/student messages/en.json messages/fr.json actions/settings.ts
git commit -m "feat(i18n): mount intl provider in the student portal + language control"
```

---

## Task 5: `applications.language` seeds `users.locale` at enrolment

**Files:**
- Modify: `actions/invitations.ts`
- Test: `actions/__tests__/applications.test.ts` — this is where `respondToInvitation`'s happy path is already covered (there is **no** `invitations.test.ts`; `actions/__tests__/enrollment-checklist.test.ts` also exercises the action but focuses on the email fan-out). Extend the existing `respondToInvitation` describe block.

**Interfaces:**
- Consumes: `applications.language` (now `Locale`), `isLocale`, `DEFAULT_LOCALE`.
- Produces: the `users` row created by `respondToInvitation` carries `locale` = the application's funnel language.

> Rationale (spec §Data): the funnel language is the only signal we have about the family's language at account-creation time, and it is exactly the language they just filled 60 fields in. Seeding it means the student's first login is already correct without them touching a control.

- [ ] **Step 1: Write the failing test**

Add to the existing `respondToInvitation` describe block. Match the file's established admin-client mock shape — this is the assertion that matters:

```ts
  it('seeds users.locale from the application language', async () => {
    // Arrange the claimed application row with language 'de' (see the file's
    // existing happy-path arrangement for respondToInvitation('yes')).
    await respondToInvitation('tok', 'yes', '')
    expect(usersInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'student', locale: 'de' }),
    )
  })

  it('falls back to the default locale when the row carries an unsupported code', async () => {
    // Same arrangement, but the application row's language is 'pt'.
    await respondToInvitation('tok', 'yes', '')
    expect(usersInsert).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- actions/__tests__/applications.test.ts actions/__tests__/enrollment-checklist.test.ts`
Expected: FAIL — the insert has no `locale` key.

- [ ] **Step 3: Select the column**

In `actions/invitations.ts`, the claim query (around line 96) selects `'id, email, school_id, exchange_id, data'`. Add `language`:

```ts
    .select('id, email, school_id, exchange_id, data, language').maybeSingle()
```

- [ ] **Step 4: Seed the locale on the profile insert**

Add the import at the top of the file:

```ts
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
```

Then change the insert (around line 127):

```ts
    // The funnel language is the family's demonstrated language preference —
    // seed it so the student's first login is already in the right language.
    // A row predating the widened CHECK, or any junk, degrades to 'en'.
    const seededLocale = isLocale(claimed.language ?? '') ? claimed.language : DEFAULT_LOCALE
    const { error: profileError } = await admin.from('users').insert({
      id: userId, school_id: claimed.school_id, role: 'student' as const,
      email: claimed.email, full_name: '', locale: seededLocale,
    })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- actions/__tests__/invitations.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` unchanged from Task 1.

- [ ] **Step 6: Commit**

```bash
git add actions/invitations.ts actions/__tests__/invitations.test.ts
git commit -m "feat(i18n): seed users.locale from the application language at enrolment"
```

---

## Task 6: Extract the student portal views

**Files:**
- Modify: `components/student/DossierView.tsx`, `components/student/InfoCardsView.tsx`, `lib/student/dossier.ts`, `lib/submission-status.ts`
- Modify: `app/(student)/error.tsx`, `app/(student)/infos/page.tsx`, `app/(student)/my-forms/page.tsx`, `app/(student)/my-forms/[assignmentId]/page.tsx`
- Modify tests: `components/student/__tests__/DossierView.test.tsx`, `lib/student/__tests__/dossier.test.ts`
- Modify: `messages/{en,fr}.json` (`student.dossier.*`, `student.infos.*`, `student.assignment.*`, `student.states.*`)

**Interfaces:**
- Consumes: `useTranslations('student')` (client), `getTranslations('student')` (server).
- Produces:
  - `dossierSubline(dossier, t)` — takes the `student` translator; the pure dossier math is untouched.
  - `submissionStatusBadge(status, t)` replacing the `SUBMISSION_STATUS_BADGE` constant map; `BadgeVariant` and the variant values stay exactly as they are.

**Two files need signature changes rather than a plain literal swap:**

`lib/student/dossier.ts` — `dossierSubline` currently returns hardcoded French including a hand-built plural (`${n} ${n > 1 ? 'choses' : 'chose'}`). Convert:

```ts
import type { AppTranslator } from '@/lib/i18n/messages'

export function dossierSubline(dossier: Dossier, t: AppTranslator): string {
  if (dossier.total === 0) return t('dossier.subline.empty')
  const n = dossier.todoCount
  if (n > 0) return t('dossier.subline.todo', { n })
  if (dossier.reviewCount > 0) return t('dossier.subline.review')
  return t('dossier.subline.done')
}
```

with `student.dossier.subline.todo` in `fr.json` as `"Il te reste {n, plural, one {# chose} other {# choses}} à faire pour compléter ton dossier avant le départ."` and in `en.json` as `"You have {n, plural, one {# thing} other {# things}} left to complete your file before departure."` — the other three sublines are straight verbatim copies of the existing strings.

`lib/submission-status.ts` — replace the constant map with a function so labels come from the catalog while the variants stay data:

```ts
import type { SubmissionStatus } from '@/types/db'
import type { AppTranslator } from '@/lib/i18n/messages'

export type BadgeVariant = 'success' | 'info' | 'neutral' | 'danger'

const VARIANTS: Record<SubmissionStatus, BadgeVariant> = {
  approved: 'success', submitted: 'info', rejected: 'danger', draft: 'neutral',
}

// Single source of truth for how a submission status is shown to students (used
// by both the my-forms list and the assignment detail page). A status with no
// submission row yet is rendered as "not started" by the caller.
export function submissionStatusBadge(
  status: SubmissionStatus,
  t: AppTranslator,
): { label: string; variant: BadgeVariant } {
  return { label: t(`states.${status}`), variant: VARIANTS[status] }
}
```

`app/(student)/my-forms/[assignmentId]/page.tsx` is the **only** consumer (verified: it is the sole importer besides the definition). At line 52 replace

```tsx
  const cfg = status ? SUBMISSION_STATUS_BADGE[status as keyof typeof SUBMISSION_STATUS_BADGE] : null
```

with

```tsx
  const cfg = status ? submissionStatusBadge(status as SubmissionStatus, t) : null
```

where `const t = await getTranslations('student')` sits with the page's other awaits, and the import becomes `import { submissionStatusBadge } from '@/lib/submission-status'` plus `import type { SubmissionStatus } from '@/types/db'`.

- [ ] **Step 1: Apply the extraction recipe to the four view/page files and `app/(student)/error.tsx`.** `error.tsx` passes `label: 'Mon dossier'` to `ErrorState` — it is a Client Component, so use `useTranslations('student')` and `t('shell.tabs.dossier')` (the key added in Task 4). `DossierView` and `InfoCardsView` are Server Components → `await getTranslations('student')`.
- [ ] **Step 2: Convert `dossierSubline` and `submissionStatusBadge`** per the signatures above, and update every call site.
- [ ] **Step 3: Add all keys to `messages/{fr,en}.json`** under `student.dossier.*`, `student.infos.*`, `student.assignment.*`, `student.states.*`, verbatim French.
- [ ] **Step 4: Update the tests.** `DossierView.test.tsx` → `renderWithIntl`, French assertions unchanged. `lib/student/__tests__/dossier.test.ts` calls `dossierSubline(d)` — pass a translator: `const t = await namespaceTranslator('fr', 'student')` in a `beforeAll`, then `dossierSubline(d, t)`. The expected French strings stay **unchanged**; that is the proof of a faithful extraction.
- [ ] **Step 5:** Run `pnpm test -- components/student lib/student "app/(student)" && npx tsc --noEmit` → green (`tsc` still shows only the Task-1 funnel errors).
- [ ] **Step 6:** Commit:

```bash
git add components/student lib/student/dossier.ts lib/submission-status.ts "app/(student)" messages/en.json messages/fr.json
git commit -m "feat(i18n): extract student dossier, infos and assignment copy"
```

---

## Task 7: Extract the student-facing form + system-state components

**Files:**
- Modify: `components/DataEntryForm.tsx`, `components/DocumentUploadForm.tsx`, `components/ExternalLinkCard.tsx`, `components/FillableForm.tsx`, `components/ErrorState.tsx`, `components/LoadingState.tsx`
- Modify tests: `components/__tests__/{DataEntryForm,DocumentUploadForm,ExternalLinkCard,FillableForm,ErrorState,LoadingState}.test.tsx`
- Modify: `messages/{en,fr}.json` (`student.forms.*`, `common.states.*`, `common.errors.*`)

**Interfaces:**
- Consumes: `useTranslations` / `getTranslations`.
- Produces: no signature changes except `LoadingState` becoming `async`.

**Scoping notes unique to this task:**
- `FillableForm` and `ErrorState`/`LoadingState` render under **both** portals. Both portals now mount a provider (organizer since Phase 2, student since Task 4), so they are safe to extract. Put their strings in `common.*` when the wording is portal-neutral (`ErrorState`, `LoadingState`) and `student.forms.*` when it is student-voiced (tutoiement).
- **`FillableForm`: extract only the component's own chrome** — save/submit buttons, the read-only notice, signature-pad labels, validation hints. The **document body text from `lib/forms/fillable/*` is organizer-owned French content and is NOT keyed** (Global Constraints). If in doubt, a string that comes from a `FillableDefinition` stays verbatim.
- `ErrorState.friendlyMessage` maps thrown messages to user-facing French. Convert it to take the translator: `friendlyMessage(message, c)` returning `c('errors.unauthorized' | 'errors.sessionExpired' | 'errors.notFound' | 'errors.generic')`. **The `switch` still matches on the raw `'Unauthorized'` / `'Unauthenticated'` strings** — those are load-bearing and must not be translated (Global Constraints).
- `LoadingState` is a Server Component with one string. Make it `export async function LoadingState()` and `await getTranslations('common')`; its `loading.tsx` call sites need no change (async Server Components compose fine).

- [ ] **Step 1: Apply the recipe to all six files** with the scoping notes above.
- [ ] **Step 2: Convert `friendlyMessage` and `LoadingState`** per the notes.
- [ ] **Step 3: Wrap the six tests in `renderWithIntl`; keep every French assertion unchanged.** `LoadingState.test.tsx` renders an async Server Component — `render(await LoadingState())` inside the test, wrapped by `NextIntlClientProvider`; if the file's existing pattern differs, follow whatever the repo already does for async components (grep `await ` in `components/__tests__`).
- [ ] **Step 4:** Run `pnpm test -- components/__tests__ && npx tsc --noEmit` → green.
- [ ] **Step 5:** Commit:

```bash
git add components/DataEntryForm.tsx components/DocumentUploadForm.tsx components/ExternalLinkCard.tsx components/FillableForm.tsx components/ErrorState.tsx components/LoadingState.tsx components/__tests__ messages/en.json messages/fr.json
git commit -m "feat(i18n): extract student form and system-state copy"
```

---

## Task 8: Application field labels move into the `apply` catalog

**Files:**
- Modify: `lib/application-form.ts`
- Create: `lib/application-form.labels.ts`, `lib/__tests__/application-form.labels.test.ts`
- Modify: `components/ApplicationForm.tsx`, `components/ApplicationReadView.tsx`, `lib/pdf/application-recap.tsx`, `components/applications/ApplicationDetail.tsx`, `actions/apply.ts`
- Modify tests: `lib/__tests__/application-form.test.ts`, `lib/pdf/__tests__/application-recap.test.ts`, `components/__tests__/ApplicationReadView.test.tsx`
- Modify: `messages/{en,fr}.json` (`apply.sections.*`, `apply.fields.*`)

**Interfaces:**
- Consumes: `AppTranslator` from `lib/i18n/messages.ts` (Task 2).
- Produces:
  - `localizedApplicationSections(t: AppTranslator): LocalizedSection[]` where
    `LocalizedSection = { id: string; fields: LocalizedField[]; title: string }` and
    `LocalizedField = AppField & { label: string; options?: { value: string; label: string }[] }`.
  - `lib/application-form.ts` keeps `APPLICATION_SECTIONS`, `allApplicationFields`, `parentGroupFields`, `missingRequiredApplication`, `overLimitApplicationFields`, `applicantName`, `applicantInitials`, `parentRecipients` — now **locale-free**: `AppField` loses `label`, `options` becomes `{ value: string }[]`, `AppSection` loses `title`.
  - `recapSections(data, t: AppTranslator)` — the PDF content model, translator-driven instead of `language`-driven.

> **Why this shape:** the validation helpers (`missingRequiredApplication`, `overLimitApplicationFields`) run server-side on untrusted payloads and must stay pure and locale-free. Splitting the schema from its labels keeps them untouched while the three label-consuming surfaces — the funnel form, the organizer's read view, and the PDF — all read one catalog. It also means the organizer reviewing an application now sees field labels in **their** locale, which the old hardcoded `lang="fr"` prop could not do.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/application-form.labels.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { namespaceTranslator } from '@/lib/i18n/messages'
import { localizedApplicationSections } from '@/lib/application-form.labels'
import { APPLICATION_SECTIONS } from '@/lib/application-form'

describe('localizedApplicationSections', () => {
  let fr: (k: string) => string
  let de: (k: string) => string
  beforeAll(async () => {
    fr = await namespaceTranslator('fr', 'apply')
    de = await namespaceTranslator('de', 'apply')
  })

  it('mirrors the schema shape exactly', () => {
    const sections = localizedApplicationSections(fr)
    expect(sections.map(s => s.id)).toEqual(APPLICATION_SECTIONS.map(s => s.id))
    expect(sections[0].fields.map(f => f.id)).toEqual(APPLICATION_SECTIONS[0].fields.map(f => f.id))
  })

  it('resolves French section titles and field labels verbatim', () => {
    const sections = localizedApplicationSections(fr)
    expect(sections[0].title).toBe('Élève')
    const lastName = sections[0].fields.find(f => f.id === 'last_name')
    expect(lastName?.label).toBe('Nom')
  })

  it('resolves radio option labels keyed by option value', () => {
    const sex = localizedApplicationSections(fr)[0].fields.find(f => f.id === 'sex')
    expect(sex?.options?.map(o => [o.value, o.label])).toEqual([
      ['male', 'Garçon'], ['female', 'Fille'], ['other', 'Autre'],
    ])
  })

  it('renders in another locale without touching option values', () => {
    const sex = localizedApplicationSections(de)[0].fields.find(f => f.id === 'sex')
    expect(sex?.options?.map(o => o.value)).toEqual(['male', 'female', 'other'])
    expect(sex?.options?.[0].label).not.toBe('Garçon')
  })
})
```

> The `de` cases only pass once Task 11 has produced `de.json`. Until then `namespaceTranslator('de', …)` falls back to `en` via `loadMessages`, so `label !== 'Garçon'` still holds and the value assertion is locale-independent. Both cases are correct at every point in the sequence.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/__tests__/application-form.labels.test.ts`
Expected: FAIL — cannot resolve `@/lib/application-form.labels`.

- [ ] **Step 3: Strip labels out of `lib/application-form.ts`**

Change the three type declarations and the `L` helper, then mechanically delete every `label:`/`title:` entry:

```ts
export type AppFieldType = 'text' | 'textarea' | 'date' | 'email' | 'tel' | 'yesno' | 'radio'

// Locale-free schema. Labels live in the `apply` message catalog, keyed by id
// (see lib/application-form.labels.ts) — the server-side validation helpers
// below must never depend on a language.
export interface AppField {
  id: string
  type: AppFieldType
  required?: boolean
  group?: 'father' | 'mother'
  options?: { value: string }[]
  maxLength?: number
}

export interface AppSection {
  id: string
  fields: AppField[]
}
```

Delete the `const L = (en, fr) => ({ en, fr })` helper. Every entry loses its label:

```ts
      { id: 'last_name', type: 'text', required: true },
      { id: 'first_name', type: 'text', required: true },
      // …
      {
        id: 'sex', type: 'radio', required: true,
        options: [{ value: 'male' }, { value: 'female' }, { value: 'other' }],
      },
```

and each section header becomes `{ id: 'student', fields: [ … ] }`. **Do not change any id, type, `required`, `group`, `maxLength`, or option `value`** — the validation helpers and every stored answer depend on them.

- [ ] **Step 4: Create `lib/application-form.labels.ts`**

```ts
import { APPLICATION_SECTIONS, type AppField, type AppSection } from '@/lib/application-form'
import type { AppTranslator } from '@/lib/i18n/messages'

export type LocalizedField = AppField & {
  label: string
  options?: { value: string; label: string }[]
}
export type LocalizedSection = Omit<AppSection, 'fields'> & {
  title: string
  fields: LocalizedField[]
}

// The application schema with its `apply.*` catalog labels resolved. Every label
// consumer — the funnel form, the organizer read view and the PDF recap — goes
// through here, so there is exactly one place where a field id maps to a key.
export function localizedApplicationSections(t: AppTranslator): LocalizedSection[] {
  return APPLICATION_SECTIONS.map((section) => ({
    ...section,
    title: t(`sections.${section.id}.title`),
    fields: section.fields.map((field) => ({
      ...field,
      label: t(`fields.${field.id}.label`),
      options: field.options?.map((o) => ({
        value: o.value,
        label: t(`fields.${field.id}.options.${o.value}`),
      })),
    })),
  }))
}
```

- [ ] **Step 5: Populate the catalog**

Add to `messages/fr.json` a new top-level `"apply"` namespace containing `sections` and `fields`, transcribing **the exact French half** of every deleted `L(en, fr)` call — all 6 section titles, all 64 field labels, and every radio option label. Add the identical structure to `messages/en.json` with the **exact English half**. Nothing is reworded in this step; it is a pure move.

Shape:

```json
  "apply": {
    "sections": {
      "student": { "title": "Élève" },
      "parents": { "title": "Parents" }
    },
    "fields": {
      "last_name": { "label": "Nom" },
      "sex": {
        "label": "Genre",
        "options": { "male": "Garçon", "female": "Fille", "other": "Autre" }
      }
    }
  }
```

- [ ] **Step 6: Run the labels test**

Run: `pnpm test -- lib/__tests__/application-form.labels.test.ts`
Expected: PASS (4 tests). A failure here means a label was dropped or mistyped in the move — fix the catalog, never the test.

- [ ] **Step 7: Convert `lib/pdf/application-recap.tsx`**

Change `recapSections(data, language)` to `recapSections(data, t: AppTranslator)` and build its rows from `localizedApplicationSections(t)` instead of indexing `section.title[language]` / `f.label[language]`. Yes/no answers use `t('form.yes')` / `t('form.no')` (keys added in Task 9); any other language-derived literal in that file (headings, the photo caption) becomes a `t('recap.*')` key. `renderApplicationRecapPdf` takes the translator through in place of `language`.

- [ ] **Step 8: Convert the recap call site in `actions/apply.ts`**

Where `downloadApplicationRecap` computes `effectiveLanguage` and calls the renderer:

```ts
import { namespaceTranslator } from '@/lib/i18n/messages'
import { isLocale, DEFAULT_LOCALE } from '@/lib/i18n/config'
```
```ts
  // The caller's live language (the switcher on the confirmation screen) wins
  // over the stored one; both degrade to the default rather than throwing.
  const effectiveLocale = language && isLocale(language)
    ? language
    : isLocale(app.language) ? app.language : DEFAULT_LOCALE
  const t = await namespaceTranslator(effectiveLocale, 'apply')
```

and pass `t` where `effectiveLanguage` used to go. Widen the parameter to `language?: Locale`.

- [ ] **Step 9: Convert `components/ApplicationReadView.tsx`**

Make it an async Server Component, drop the `lang` prop, and localize `displayValue`:

```tsx
import { getTranslations } from 'next-intl/server'
import { localizedApplicationSections, type LocalizedField } from '@/lib/application-form.labels'
import type { AppTranslator } from '@/lib/i18n/messages'

// Stored tokens → display labels. Radio answers fall back to the raw string so
// legacy free-text values (pre-choice sex/pronoun answers) keep rendering.
function displayValue(f: LocalizedField, raw: string | undefined, t: AppTranslator): string {
  const v = raw?.trim() ?? ''
  if (!v) return '—'
  if (f.type === 'radio') return f.options?.find(o => o.value === v)?.label ?? v
  if (f.type === 'yesno') {
    if (v === 'yes') return t('form.yes')
    if (v === 'no') return t('form.no')
  }
  return v
}

export async function ApplicationReadView({ data, photoUrl }: {
  data: Record<string, string>
  photoUrl: string | null
}) {
  const t = await getTranslations('apply')
  const sections = localizedApplicationSections(t)
  // …same JSX, with section.title / f.label / displayValue(f, data[f.id], t),
  // and alt={t('recap.photoAlt')} on the <img>.
}
```

In `components/applications/ApplicationDetail.tsx:44`, drop the now-removed prop: `<ApplicationReadView data={application.data} photoUrl={photoUrl} />`.

- [ ] **Step 10: Point `ApplicationForm.tsx` at the localized sections**

Replace `APPLICATION_SECTIONS` with `localizedApplicationSections(t)` (where `const t = useTranslations('apply')`), and swap `section.title[lang]` → `section.title`, `f.label[lang]` → `f.label`, `o.label[lang]` → `o.label`. The rest of that file is Task 9.

- [ ] **Step 11: Update the three affected test files**

- `lib/__tests__/application-form.test.ts` — drop any assertion on `label`/`title` (they no longer exist on the schema); the validation-helper assertions stay untouched.
- `lib/pdf/__tests__/application-recap.test.ts` — `recapSections(ANSWERS, 'fr')` → `recapSections(ANSWERS, await namespaceTranslator('fr', 'apply'))` (hoist both translators into a `beforeAll`). **Every expected French/English string stays unchanged.**
- `components/__tests__/ApplicationReadView.test.tsx` — the component is async now: `renderWithIntl(await ApplicationReadView({ data, photoUrl }))`, and drop the `lang` prop. Mock `next-intl/server`'s `getTranslations` to the fr catalog, or follow whatever pattern `components/applications/__tests__` already uses for async server components (grep `getTranslations` there first).

- [ ] **Step 12: Run tests + typecheck**

Run: `pnpm test -- lib/__tests__ lib/pdf components/__tests__/ApplicationReadView.test.tsx components/applications && npx tsc --noEmit`
Expected: green. `tsc` errors should now be confined to `components/ApplyEntry.tsx`, `components/ApplicationStartForm.tsx`, `components/ApplicationForm.tsx`, `components/ApplicationPhotoUpload.tsx`, `components/ApplicationRecapButton.tsx` and the `'en' | 'fr'` signatures in `actions/apply.ts` — all closed by Task 9.

- [ ] **Step 13: Commit**

```bash
git add lib/application-form.ts lib/application-form.labels.ts lib/__tests__ lib/pdf components/ApplicationReadView.tsx components/ApplicationForm.tsx components/applications/ApplicationDetail.tsx components/__tests__/ApplicationReadView.test.tsx actions/apply.ts messages/en.json messages/fr.json
git commit -m "feat(i18n): move application field labels into the apply catalog"
```

---

## Task 9: Extract the apply funnel and retire the en/fr ternaries

**Files:**
- Modify: `components/ApplyEntry.tsx`, `components/ApplicationStartForm.tsx`, `components/ApplicationForm.tsx`, `components/ApplicationPhotoUpload.tsx`, `components/ApplicationRecapButton.tsx`
- Modify: `app/apply/[slug]/page.tsx`, `app/apply/resume/[token]/page.tsx`
- Modify: `actions/apply.ts`
- Modify tests: `components/__tests__/{ApplyEntry,ApplicationStartForm,ApplicationForm,ApplicationPhotoUpload,ApplicationRecapButton}.test.tsx`
- Modify: `messages/{en,fr}.json` (`apply.start.*`, `apply.welcome.*`, `apply.form.*`, `apply.photo.*`, `apply.recap.*`, `apply.page.*`)

**Interfaces:**
- Consumes: `resolveLocale`, `loadMessages`, `pickNamespaces`, `LanguageSwitcher`, `writeLocaleCookie`.
- Produces:
  - `setApplicationLanguage(token: string, locale: Locale): Promise<void>` in `actions/apply.ts` — persists the funnel language on the application row.
  - `startApplication(slug, { …, language: Locale })`, `peekApplicationDraft` returning `language: Locale`, `getApplicationDraft` returning `language: Locale`. **Every `'en' | 'fr'` union in this file and these components is deleted.**

**Locale model for the funnel (the decision this task implements):**
- `/apply/[slug]` — anonymous, no application row yet. Locale = `resolveLocale()` (cookie → `Accept-Language` → `en`). The switcher writes the `NEXT_LOCALE` cookie and `router.refresh()`es. `startApplication` stores that locale on the new row.
- `/apply/resume/[token]` — an application exists, so **its stored `language` is authoritative** (it survives a device change, which a cookie does not). The in-form switcher calls `setApplicationLanguage` *and* writes the cookie, then refreshes.
- Both pages already declare `export const dynamic = 'force-dynamic'`, so mounting a provider costs nothing and cannot touch the static landing.
- Providers on public pages get `pickNamespaces(messages, ['common', 'apply'])` — no organizer copy in an anonymous bundle.

- [ ] **Step 1: Add `setApplicationLanguage` to `actions/apply.ts`**

Place it beside `saveApplicationDraft` and follow that function's existing token-validation preamble exactly (same admin client, same expiry/status guard — read it first and mirror it):

```ts
// The applicant switched language mid-funnel. Persist it on the row so the
// choice survives a device change, and so the enrolment step (and Phase 4's
// emails) inherit the right locale. Silent no-op on a dead token: a language
// toggle must never surface a token error.
export async function setApplicationLanguage(token: string, locale: Locale): Promise<void> {
  if (!isLocale(locale)) return
  const admin = createAdminClient()
  await admin.from('applications')
    .update({ language: locale })
    .eq('resume_token', token)
    .in('status', ['draft'])
}
```

Then widen every `'en' | 'fr'` in the file to `Locale` (lines ~50, ~210, ~235, ~241, ~432, ~475) and replace the `app.language === 'fr' ? 'fr' : 'en'` coercions with `isLocale(app.language) ? app.language : DEFAULT_LOCALE`.

- [ ] **Step 2: Mount the provider on `app/apply/[slug]/page.tsx`**

Wrap the two returned `<main>` trees (the closed-state one and the form one) and extract the page's own French literals (`Candidature`, the closed line, and the `InvalidLinkState` title/body) into `apply.page.*`:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages, pickNamespaces } from '@/lib/i18n/messages'
```
```tsx
  const locale = await resolveLocale()
  const messages = pickNamespaces(await loadMessages(locale), ['common', 'apply'])
  const t = await getTranslations('apply')
  // …then wrap each returned tree:
  //   <NextIntlClientProvider locale={locale} messages={messages}>
  //     <div lang={locale}>…</div>
  //   </NextIntlClientProvider>
```

Do the same in `app/apply/resume/[token]/page.tsx`, except the locale comes from the row: `const locale = isLocale(draft.language) ? draft.language : await resolveLocale()`. Note `getApplicationDraft` runs before this, and `InvalidLinkState` on a dead token has no row — fall back to `resolveLocale()` there.

- [ ] **Step 3: Apply the extraction recipe to the five funnel components**

Delete every `T = { en: …, fr: … }` object, every `const fr = lang === 'fr'`, and every `lang`/`language` prop that existed only to index them:
- `ApplyEntry.tsx` — `View.welcome` drops `language`; the three ternaries become `t('welcome.title', { name })`, `t('welcome.body')`, `t('welcome.continue')`, `t('welcome.notYou')`. Use ICU for the optional name: `"Bon retour{name} !"` with `name` pre-formatted as `', Léa'` or `''` by the caller (keep the existing `, ` construction — it is punctuation, not copy).
- `ApplicationStartForm.tsx` — the `NOTICE` map becomes `apply.start.notices.{draft,submitted,closed,registered}`; the hardcoded EN/FR two-button toggle is replaced by `<LanguageSwitcher current={locale} onSelect={…} ariaLabel={t('start.languageLabel')} />` whose `onSelect` writes the cookie (`writeLocaleCookie(next)`) and `router.refresh()`es. `startApplication` is then called with `language: locale`, where `locale` is a new prop passed down from the page.
- `ApplicationForm.tsx` — same switcher, but `onSelect` calls `await setApplicationLanguage(token, next)`, `writeLocaleCookie(next)`, then `router.refresh()`. The `lang` state and the `initialLanguage` prop both disappear; `ApplicationPhotoUpload` loses its `lang` prop; `ApplicationRecapButton` keeps `language` **only** as the value handed to `downloadApplicationRecap` — retype it `Locale` and source it from the page's resolved locale.
- `ApplicationPhotoUpload.tsx`, `ApplicationRecapButton.tsx` — plain recipe; `ApplicationRecapButton`'s `t[res.reason]` lookup becomes `t(\`recap.errors.${res.reason}\`)`, keeping the structured-return contract intact.

Add `apply.form.yes` / `apply.form.no` here — Task 8's PDF and read view already reference them.

- [ ] **Step 4: Update the five test files**

`render(...)` → `renderWithIntl(...)`; drop `initialLanguage`/`lang`/`language` props that no longer exist; add a `useRouter` mock (`{ refresh: vi.fn(), push: vi.fn() }`) wherever the switcher now renders. **Every French assertion stays unchanged.** Any test asserting the EN/FR toggle buttons (`getByText('EN')`) is rewritten against the combobox: `expect(screen.getByRole('combobox')).toHaveValue('fr')`.

- [ ] **Step 5: Prove the ternaries are gone**

Run:
```bash
grep -rn "'en' | 'fr'\|=== 'fr' ?\|T\[lang\]\|T\[language\]" components app actions lib --include=*.ts --include=*.tsx | grep -v __tests__
```
Expected: **no output.** Any hit is an unretired ternary — fix it before committing.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm test -- components/__tests__ actions/__tests__ && npx tsc --noEmit`
Expected: green, and `npx tsc --noEmit` is now **fully clean** for the first time since Task 1.

- [ ] **Step 7: Commit**

```bash
git add components/ApplyEntry.tsx components/ApplicationStartForm.tsx components/ApplicationForm.tsx components/ApplicationPhotoUpload.tsx components/ApplicationRecapButton.tsx app/apply actions/apply.ts components/__tests__ messages/en.json messages/fr.json
git commit -m "feat(i18n): extract the apply funnel and retire the en/fr ternaries"
```

---

## Task 10: Extract the invite-response surface

**Files:**
- Modify: `components/InviteResponseForm.tsx`, `app/invite/[token]/page.tsx`, `components/InvalidLinkState.tsx` call sites
- Modify tests: `components/__tests__/InviteResponseForm.test.tsx` (create if absent — see Step 3)
- Modify: `messages/{en,fr}.json` (`apply.invite.*`)

**Interfaces:**
- Consumes: `resolveLocale`, `pickNamespaces`, `useTranslations('apply')`.
- Produces: no signature changes. `EXCHANGE_TERMS_RESPOND_PARENT` from `lib/exchange-terms.ts` is **legal copy** — key it under `apply.invite.terms` like any other chrome string (it is app-authored, not organizer-authored), preserving the French **verbatim**.

**Locale note:** this page is the funnel's tail and is reached from an emailed token, so there is no cookie guarantee. Resolve `locale` from the application row's `language` (the page already loads the application by token — add `language` to its select), falling back to `resolveLocale()`. Mount the provider with `pickNamespaces(messages, ['common', 'apply'])`, exactly as Task 9's pages do.

- [ ] **Step 1: Apply the recipe to `components/InviteResponseForm.tsx`.** Its three result messages, the accepted badge, the heading (ICU: `"{name} est invité·e à l’échange {exchange} !"` — `name` and `exchange` are data, interpolated not keyed), the confirm/decline/questions buttons, the textarea placeholder, and the catch-branch error line all become `apply.invite.*` keys. The `'Votre enfant '` fallback when `studentName` is empty is chrome → `apply.invite.yourChild`.
- [ ] **Step 2: Extract `app/invite/[token]/page.tsx`** page-level copy and mount the provider per the locale note above.
- [ ] **Step 3: Test.** If `components/__tests__/InviteResponseForm.test.tsx` does not exist, create one covering the three response outcomes: `renderWithIntl(<InviteResponseForm token="t" studentName="Léa" exchangeName="France-Canada" preselect={null} />)`, mock `@/actions/invitations`'s `respondToInvitation` to resolve `{ ok: true }`, click « Oui, nous confirmons », and assert the French confirmation text renders. If it exists, wrap it in `renderWithIntl` and keep its assertions.
- [ ] **Step 4:** Run `pnpm test -- components/__tests__/InviteResponseForm.test.tsx && npx tsc --noEmit` → green.
- [ ] **Step 5:** Commit:

```bash
git add components/InviteResponseForm.tsx app/invite components/__tests__/InviteResponseForm.test.tsx messages/en.json messages/fr.json
git commit -m "feat(i18n): extract the invite-response surface"
```

---

## Task 11: Translate `student` + `apply` to Spanish, Italian, German

**Files:**
- Modify: `messages/es.json`, `messages/it.json`, `messages/de.json`

**Interfaces:**
- Consumes: the now-complete `student` + `apply` namespaces of `messages/fr.json` (source) and `messages/en.json`. Produces: the same two namespaces added to the three existing catalogs, structurally identical.

> **Content deviation (same as Phase 2 Task 13):** the translated strings are *content*, generated at execution with **Sonnet** from the French source, preserving **every key path and every ICU placeholder/plural category exactly**. Do not translate ICU variable names or the `one`/`other` plural keywords — only the surrounding text. Native review is deferred (accepted risk, spec §Translation production).

- [ ] **Step 1: Generate the two namespaces** for `es`, `it`, `de` from `fr.json`'s `student` + `apply` with **Sonnet** (never Haiku — it strips accents), and merge them into the three existing catalog files without disturbing the `common`/`organizer` namespaces already there.

Watch for these, which are specific to this phase's copy:
- The student portal is written in **tutoiement**; keep the informal register in es (`tú`), it (`tu`), de (`du`).
- The invite-response surface (`apply.invite.*`) is **parent-facing vouvoiement** — keep it formal (`usted`, `Lei`, `Sie`). Do not homogenize the two registers.
- Application field labels (`apply.fields.*`) are form vocabulary — translate them as a set so `father_last_name` / `mother_last_name` stay parallel.
- `es`/`it` need gender agreement on the inclusive forms French writes as `invité·e` / `prévenu·e`; render them idiomatically rather than transliterating the middle dot.

- [ ] **Step 2: Run the accent/apostrophe guard** over the three files (the check used in the redesign and Phase 1/2 work). Confirm no accented character was stripped and that no straight `'` replaced a typographic `’` in the French source (the guard checks `fr.json`; the other locales must simply not be mangled).

- [ ] **Step 3: Sanity-load each locale**

Run: `pnpm test -- lib/i18n/__tests__/messages.test.ts lib/__tests__/application-form.labels.test.ts`
Expected: PASS — including the `de` cases in the labels test, which now exercise a real German catalog rather than the `en` fallback.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json messages/it.json messages/de.json
git commit -m "feat(i18n): translate student + apply catalogs to es/it/de"
```

---

## Task 12: Parity gate + full verification

**Files:**
- Modify: none expected (`messages/__tests__/parity.test.ts` from Phase 2 already covers every namespace generically)

- [ ] **Step 1: Run the parity gate**

Run: `pnpm test -- messages/__tests__/parity.test.ts`
Expected: PASS. A `${locale} has the exact same key set as fr` failure means a translation dropped or invented a key — **fix the offending catalog, never weaken the test.** An ICU-placeholder failure means a `{n}`/plural category was mistranslated.

- [ ] **Step 2: Full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all green. In the `pnpm build` route table, `/` must still be `○` (static). `/apply/[slug]`, `/apply/resume/[token]`, `/invite/[token]` stay `ƒ` (they already declared `force-dynamic`). If `/` flipped to `ƒ`, STOP — a provider or a server locale read leaked into the static tree.

> If `pnpm test` throws an unresolvable import or fails once and passes on re-run, that is a neighbouring session mid-write — re-run the single file before debugging it. If the run sweeps another worktree's tests, use `pnpm vitest run --exclude '**/.claude/**'` (see `[[reference_vitest_sweeps_worktree_tests]]`).

- [ ] **Step 3: RLS regression**

Run: `pnpm test:rls`
Expected: all green, including Task 1's `applications.language` case. Required because this phase touched `supabase/migrations/`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual dev smoke**

Run `pnpm dev` (the worktree's pinned port), then:
1. **Student portal** — log in as a test student (`[[reference_test_student_login_auth_templates]]`: set a password via SQL `crypt()` then `/login`). Open the account menu → switch through all five languages → confirm the tabs, dossier, infos, and an assignment detail page all re-render, and that the choice persists across a reload (written to `users.locale`).
2. **Apply funnel** — open `/apply/<slug>` anonymously, switch language on the start form, start an application, confirm the form renders in that language and the row's `language` matches; switch again mid-form and confirm the choice survives a reload of `/apply/resume/<token>` **in a different browser** (proving the row, not the cookie, is authoritative).
3. **Enrolment** — accept an invitation and confirm the created `users` row's `locale` equals the application's `language`.
4. **Organizer unchanged** — open an application in the organizer review view and confirm the field labels now follow the *organizer's* locale.
5. **Landing** — confirm anonymous `/` still respects the `NEXT_LOCALE` cookie (unchanged since Phase 1).

- [ ] **Step 6: Commit any fixes from the smoke**

```bash
git add -- <only the files you touched>
git commit -m "fix(i18n): phase 3 smoke-test corrections"
```

> **Never `git add -A` / `git add .`** — stage only named files (`[[feedback_subagent_broad_git_add_pii]]`).

---

## Final Verification (before PR)

- [ ] `pnpm lint` — clean.
- [ ] `pnpm test` — all green (i18n unit, `LanguageSwitcher`, every extracted surface under `renderWithIntl`, labels, recap, parity).
- [ ] `pnpm build` — succeeds; `/` still `○`; no unknown-key type errors.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `pnpm test:rls` — green (schema touched this phase).
- [ ] `grep -rn "'en' | 'fr'" components app actions lib --include=*.ts --include=*.tsx | grep -v __tests__` — **no output**.
- [ ] Migration applied to **staging first**, then prod via MCP `apply_migration`; local filename reconciled against MCP `list_migrations`; `types/supabase.ts` regenerated verbatim.
- [ ] Manual: five-language switch across the student portal and the apply funnel; `users.locale` seeded at enrolment; landing cookie behaviour unchanged.
- [ ] `git branch --show-current` reads `feature/i18n-phase3-student-apply` before every commit.

## PR notes

- One PR per phase (repo convention). Surfaces are committed independently, so the PR can be split at the student/funnel boundary if review prefers.
- Machine-quality es/it/de shipped without native review is the accepted, noted risk (spec §Translation production).
- The migration is **already applied to prod** by the time the PR opens (canonical workflow: staging → prod via MCP, ahead of merge). It is additive and backward-compatible — every pre-existing `'en'`/`'fr'` row stays valid, so `main` is safe both before and after the merge.
- Merge is Bjorn's. No edge-function deploy in this phase.

## Out of scope (Phase 4)

- `lib/email.ts` template localization, `pickEmailLocale`, the `emails` namespace, and the `send-reminders` edge function (which imports the same `messages/*.json`).
- Native-speaker review of es/it/de.
- Translating the fillable French administrative documents under `lib/forms/fillable/*` (organizer-owned content; deliberately verbatim).
