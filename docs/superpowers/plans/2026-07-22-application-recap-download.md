# Application Recap Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an applicant download a PDF recap of their own application answers from the confirmation screen and from the resume link afterwards.

**Architecture:** A new server-only renderer (`lib/pdf/application-recap.tsx`) turns the flat answers map into a PDF by iterating `APPLICATION_SECTIONS`, reusing the fonts and `renderToBuffer` setup already used by `lib/pdf/fillable-pdf.tsx`. A new server action `downloadApplicationRecap(token)` in `actions/apply.ts` (anonymous resume-token trust model, same as the rest of that file) does rate-limit → row lookup → expiry → submitted check → optional photo download → render, and returns base64 bytes as a structured result. A small client component decodes the base64 and triggers an `<a download>`, mirroring the existing `DataPrivacyCard` export flow.

**Tech Stack:** Next.js 14 App Router + Server Actions, `@react-pdf/renderer` 4.5.1, Supabase (admin client + Storage), Vitest + Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-22-application-recap-download-design.md`

## Global Constraints

- Branch: `feature/application-recap-download`. Never push to `main` from this work.
- Package manager is **pnpm**, never npm.
- No schema change, no migration, no RLS work → `pnpm test:rls` is NOT triggered by this plan.
- Expected outcomes must be **structured return values**, never throws — production redacts thrown Server Action messages. Never branch client-side on `error.message`.
- **Never log student/parent PII** — no names, emails, or answer contents in `console.warn`/`console.error`.
- Bilingual copy lives in an inline `T` map inside the component / module (the funnel's existing convention), **not** next-intl.
- French copy uses typographic apostrophes (`’`, U+2019) and `«  »` guillemets, matching `components/ApplicationForm.tsx`. Never a straight `'`.
- `actions/apply.ts` is a `'use server'` module: it may **only export async functions**. Helpers must be module-private (see the existing `APPLICATION_CAP_PER_EXCHANGE` comment at `actions/apply.ts:29-31`).
- Verification gate before considering any task done: `pnpm lint`, `pnpm test`, `pnpm build`.
- When running the full suite from this repo, use `pnpm vitest run --exclude '**/.claude/**'` if other worktrees' tests get swept in.

---

### Task 1: The recap PDF renderer

Builds `lib/pdf/application-recap.tsx`. It exports two things: a **pure** content-model function `recapSections()` (which is where all the label/option/empty-answer logic lives, and where the interesting tests point) and the async `renderApplicationRecapPdf()` that lays that model out as a PDF.

Splitting it this way matters: assertions against raw PDF bytes are unreliable (compressed content streams, subset fonts), so the text-level rules are tested against the pure function and the renderer is only smoke-tested for a valid, non-trivial `%PDF` buffer.

**Files:**
- Create: `lib/pdf/application-recap.tsx`
- Test: `lib/pdf/__tests__/application-recap.test.ts`
- Read for reference (do not modify): `lib/pdf/fillable-pdf.tsx`, `lib/application-form.ts`

**Interfaces:**
- Consumes: `APPLICATION_SECTIONS`, `AppField` from `@/lib/application-form`; `notoSansRegular`, `notoSansBold`, `notoSansItalic` from `./fonts`.
- Produces:
  ```ts
  export type RecapRow = { label: string; value: string }
  export type RecapSection = { title: string; rows: RecapRow[] }
  export function recapSections(
    data: Record<string, string>,
    language: 'en' | 'fr',
  ): RecapSection[]
  export function renderApplicationRecapPdf(input: {
    exchangeName: string
    applicantName: string
    submittedAt: string | null
    data: Record<string, string>
    photoBytes: Uint8Array | null
    language: 'en' | 'fr'
  }): Promise<Buffer>
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/__tests__/application-recap.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { recapSections, renderApplicationRecapPdf } from '../application-recap'

// A 1x1 transparent PNG — smallest thing that exercises the real image path.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const ANSWERS: Record<string, string> = {
  first_name: 'Zoé', last_name: 'Dupont',
  native_language: 'français',
  smoking_home: 'no',
  own_room: 'yes',
  family_status: 'step_family',
  sports: '   ',            // whitespace only → must be skipped
  not_a_real_field: 'x',    // not in APPLICATION_SECTIONS → must be ignored
}

function rows(sections: ReturnType<typeof recapSections>) {
  return sections.flatMap(s => s.rows)
}

describe('recapSections', () => {
  it('uses the section + field labels of the requested language', () => {
    const fr = recapSections(ANSWERS, 'fr')
    expect(fr.map(s => s.title)).toContain('Élève')
    expect(rows(fr)).toContainEqual({ label: 'Prénom', value: 'Zoé' })

    const en = recapSections(ANSWERS, 'en')
    expect(en.map(s => s.title)).toContain('Student')
    expect(rows(en)).toContainEqual({ label: 'First name', value: 'Zoé' })
  })

  it('resolves yesno answers to their localized labels', () => {
    expect(rows(recapSections(ANSWERS, 'fr'))).toContainEqual(
      { label: 'Fume-t-on à la maison ?', value: 'Non' },
    )
    expect(rows(recapSections(ANSWERS, 'en'))).toContainEqual(
      { label: 'Does anyone smoke in the home?', value: 'No' },
    )
  })

  it('resolves radio answers through their option labels, not raw values', () => {
    expect(rows(recapSections(ANSWERS, 'fr'))).toContainEqual(
      { label: 'Situation familiale', value: 'Famille recomposée' },
    )
    expect(rows(recapSections(ANSWERS, 'en'))).toContainEqual(
      { label: 'Family status', value: 'Step-family' },
    )
    expect(rows(recapSections(ANSWERS, 'fr')).map(r => r.value)).not.toContain('step_family')
  })

  it('skips empty and whitespace-only answers, and ignores unknown keys', () => {
    const labels = rows(recapSections(ANSWERS, 'fr')).map(r => r.label)
    expect(labels).not.toContain('Sports pratiqués et heures par semaine')
    expect(rows(recapSections(ANSWERS, 'fr')).map(r => r.value)).not.toContain('x')
  })

  it('omits a section entirely when none of its fields are answered', () => {
    // ANSWERS has nothing from the "Student profile" / "Profil de l’élève" section.
    expect(recapSections(ANSWERS, 'fr').map(s => s.title)).not.toContain('Profil de l’élève')
  })

  it('returns no sections at all for an empty answers map', () => {
    expect(recapSections({}, 'fr')).toEqual([])
  })
})

describe('renderApplicationRecapPdf', () => {
  const base = {
    exchangeName: 'France-Minnesota 2026',
    applicantName: 'Zoé Dupont',
    submittedAt: '2026-07-19T10:00:00Z',
    data: ANSWERS,
    language: 'fr' as const,
  }

  it('renders a non-empty PDF without a photo', async () => {
    const buf = await renderApplicationRecapPdf({ ...base, photoBytes: null })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(3000)
  }, 30_000)

  it('renders a PDF with a PNG photo embedded', async () => {
    const buf = await renderApplicationRecapPdf({ ...base, photoBytes: new Uint8Array(PNG_1X1) })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(3000)
  }, 30_000)

  it('drops an unsupported image format instead of throwing', async () => {
    // WebP ("RIFF....WEBP") — @react-pdf embeds only PNG and JPEG.
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])
    const buf = await renderApplicationRecapPdf({ ...base, photoBytes: webp })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)

  it('renders when there are no answers and no submission date', async () => {
    const buf = await renderApplicationRecapPdf({
      ...base, data: {}, submittedAt: null, photoBytes: null,
    })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30_000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/pdf/__tests__/application-recap.test.ts`
Expected: FAIL — `Failed to resolve import "../application-recap"`.

- [ ] **Step 3: Write the renderer**

Create `lib/pdf/application-recap.tsx`:

```tsx
// Renders an applicant's own submitted answers to a PDF buffer, offered as a
// keepsake at the end of the funnel. Server-side only — imported by
// actions/apply.ts (downloadApplicationRecap).
//
// Layout is driven by iterating APPLICATION_SECTIONS: a question added to the
// funnel later shows up here automatically, with no second list to maintain.
// Separate module from fillable-pdf.tsx on purpose — that renderer walks a
// FillableDefinition block tree, which has nothing in common with a flat
// answers map.
import React from 'react'
import { Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { APPLICATION_SECTIONS, type AppField } from '@/lib/application-form'
import { notoSansRegular, notoSansBold, notoSansItalic } from './fonts'

// Same family/sources as fillable-pdf.tsx. Font.register is idempotent per
// family, so both modules loading in one process is harmless.
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: notoSansRegular },
    { src: notoSansBold, fontWeight: 700 },
    { src: notoSansItalic, fontStyle: 'italic' },
  ],
})
// French words must not be hyphen-broken mid-word.
Font.registerHyphenationCallback((word) => [word])

const T = {
  en: {
    title: 'Application summary',
    submitted: 'Submitted on',
    yes: 'Yes',
    no: 'No',
    footer: 'Your answers, as submitted via EazyExchange.',
  },
  fr: {
    title: 'Récapitulatif de ma candidature',
    submitted: 'Envoyée le',
    yes: 'Oui',
    no: 'Non',
    footer: 'Tes réponses, telles qu’envoyées via EazyExchange.',
  },
}

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 10.5, lineHeight: 1.45, paddingTop: 48, paddingBottom: 64, paddingHorizontal: 56, color: '#111' },
  header: { marginBottom: 18 },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#444' },
  meta: { fontSize: 9.5, color: '#777', marginTop: 2 },
  photo: { width: 96, height: 120, objectFit: 'cover', marginBottom: 18, borderWidth: 1, borderColor: '#ddd' },
  sectionTitle: { fontSize: 11.5, fontWeight: 700, marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  row: { marginBottom: 5 },
  label: { fontSize: 9, color: '#666', marginBottom: 1 },
  value: { fontSize: 10.5 },
  footer: { position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 8, color: '#777', textAlign: 'center' },
})

export type RecapRow = { label: string; value: string }
export type RecapSection = { title: string; rows: RecapRow[] }

// Resolves one field's stored value into display text. Empty (or
// whitespace-only) answers return '' and are dropped by the caller.
function answerText(field: AppField, raw: string | undefined, language: 'en' | 'fr'): string {
  const v = (raw ?? '').trim()
  if (v === '') return ''
  if (field.type === 'yesno') {
    if (v === 'yes') return T[language].yes
    if (v === 'no') return T[language].no
    return v
  }
  if (field.type === 'radio') {
    return field.options?.find(o => o.value === v)?.label[language] ?? v
  }
  return v
}

// Pure content model of the recap: the sections and rows the PDF will draw.
// Exported so the label/option/empty-answer rules are unit-testable without
// parsing PDF bytes. Keys in `data` that are not in APPLICATION_SECTIONS are
// ignored — the sections are the single source of truth for what a recap shows.
export function recapSections(
  data: Record<string, string>,
  language: 'en' | 'fr',
): RecapSection[] {
  return APPLICATION_SECTIONS
    .map(section => ({
      title: section.title[language],
      rows: section.fields
        .map(f => ({ label: f.label[language], value: answerText(f, data[f.id], language) }))
        .filter(r => r.value !== ''),
    }))
    .filter(s => s.rows.length > 0)
}

// @react-pdf embeds PNG and JPEG only. Sniff the magic bytes rather than trust
// an extension; anything else (e.g. WebP, which the photo bucket accepts) is
// dropped so a picky upload never costs the applicant their whole recap.
function imageFormat(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}

function formatSubmittedAt(iso: string, language: 'en' | 'fr'): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(new Date(iso))
}

export async function renderApplicationRecapPdf(input: {
  exchangeName: string
  applicantName: string
  submittedAt: string | null
  data: Record<string, string>
  photoBytes: Uint8Array | null
  language: 'en' | 'fr'
}): Promise<Buffer> {
  const { exchangeName, applicantName, submittedAt, data, photoBytes, language } = input
  const t = T[language]
  const sections = recapSections(data, language)
  const format = photoBytes ? imageFormat(photoBytes) : null

  const doc = (
    <Document title={t.title} author="EazyExchange">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{exchangeName}{applicantName ? ` — ${applicantName}` : ''}</Text>
          {submittedAt ? (
            <Text style={styles.meta}>{t.submitted} {formatSubmittedAt(submittedAt, language)}</Text>
          ) : null}
        </View>

        {photoBytes && format ? (
          <Image style={styles.photo} src={{ data: Buffer.from(photoBytes), format }} />
        ) : null}

        {sections.map((section, i) => (
          <View key={i}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map((row, j) => (
              <View key={j} style={styles.row} wrap={false}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer} fixed>{t.footer}</Text>
      </Page>
    </Document>
  )

  return await renderToBuffer(doc)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/pdf/__tests__/application-recap.test.ts`
Expected: PASS — 10 tests.

If the `<Image>` step fails on the `{ data, format }` shape, that is the only line worth debugging; do not fall back to a data-URI string (it re-encodes the bytes for no benefit).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/application-recap.tsx lib/pdf/__tests__/application-recap.test.ts
git commit -m "feat(pdf): render an application recap from the funnel's section definitions"
```

---

### Task 2: `downloadApplicationRecap` server action

Adds the anonymous, resume-token-gated action to `actions/apply.ts`, plus the one-field ripple on `getApplicationDraft` so the resume page knows which language to render the button in.

**Files:**
- Modify: `actions/apply.ts` (add imports at the top; add `language` to the submitted branch at `actions/apply.ts:201-203`; append the new action + its private helpers at the end of the file)
- Test: `actions/__tests__/apply-recap.test.ts`

**Interfaces:**
- Consumes: `renderApplicationRecapPdf` from `@/lib/pdf/application-recap` (Task 1); `enforceRateLimit`, `clientIp`, `tokenExpired`, `APPLICATION_PHOTO_BUCKET`, `applicantName as buildApplicantName` — all already imported by `actions/apply.ts`.
- Produces:
  ```ts
  export type RecapResult =
    | { ok: true; filename: string; pdf: string }   // pdf is base64
    | { ok: false; reason: 'not_found' | 'expired' | 'not_submitted' }
  export async function downloadApplicationRecap(token: string): Promise<RecapResult>
  ```
  and `getApplicationDraft(token)`'s submitted branch gains `language: 'en' | 'fr'`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/apply-recap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
}))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))
vi.mock('@/lib/rate-limit', () => ({
  clientIp: async () => '1.2.3.4',
  enforceRateLimit: vi.fn(async () => {}),
  enforceRateLimitStrict: vi.fn(async () => {}),
}))
// The real renderer is exercised by lib/pdf/__tests__/application-recap.test.ts;
// here it is stubbed so the action's control flow is what's under test.
const renderApplicationRecapPdf = vi.fn(async () => Buffer.from('%PDF-fake'))
vi.mock('@/lib/pdf/application-recap', () => ({
  renderApplicationRecapPdf: (input: unknown) => renderApplicationRecapPdf(input as never),
}))

let appRow: any
const download = vi.fn(async () => ({
  data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
  error: null,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: appRow, error: null }) }) }),
    }),
    storage: { from: () => ({ download }) },
  }),
}))

import { downloadApplicationRecap } from '../apply'
import { enforceRateLimit } from '@/lib/rate-limit'

const FUTURE = new Date(Date.now() + 1e9).toISOString()
const PAST = new Date(Date.now() - 1e9).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  renderApplicationRecapPdf.mockResolvedValue(Buffer.from('%PDF-fake'))
  download.mockResolvedValue({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    error: null,
  } as any)
  appRow = {
    status: 'submitted',
    data: { first_name: 'Zoé', last_name: 'Dupont-Léger' },
    language: 'fr',
    photo_path: null,
    submitted_at: '2026-07-19T10:00:00Z',
    resume_token_expires_at: FUTURE,
    exchanges: { name: 'France-Minnesota 2026' },
  }
})

describe('downloadApplicationRecap', () => {
  it('returns not_found for an unknown token', async () => {
    appRow = null
    expect(await downloadApplicationRecap('nope')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('returns expired once the resume token has lapsed', async () => {
    appRow.resume_token_expires_at = PAST
    expect(await downloadApplicationRecap('tok')).toEqual({ ok: false, reason: 'expired' })
  })

  it.each(['draft', 'invited'])('returns not_submitted for a %s application', async (status) => {
    appRow.status = status
    expect(await downloadApplicationRecap('tok')).toEqual({ ok: false, reason: 'not_submitted' })
  })

  it('returns base64 PDF bytes and an ASCII-folded filename on the happy path', async () => {
    const res = await downloadApplicationRecap('tok')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(Buffer.from(res.pdf, 'base64').toString()).toBe('%PDF-fake')
    expect(res.filename).toBe('candidature-zoe-dupont-leger.pdf')
  })

  it('rate-limits by client IP before touching the database', async () => {
    await downloadApplicationRecap('tok')
    expect(enforceRateLimit).toHaveBeenCalledWith('recap_ip:1.2.3.4', 20, 3600)
  })

  it('passes the row through to the renderer, normalizing the language', async () => {
    appRow.language = 'de'
    await downloadApplicationRecap('tok')
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({
      exchangeName: 'France-Minnesota 2026',
      applicantName: 'Zoé Dupont-Léger',
      submittedAt: '2026-07-19T10:00:00Z',
      language: 'en',
      photoBytes: null,
    }))
  })

  it('downloads the photo when photo_path is set and forwards the bytes', async () => {
    appRow.photo_path = 'app-1/photo.png'
    await downloadApplicationRecap('tok')
    expect(download).toHaveBeenCalledWith('app-1/photo.png')
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({
      photoBytes: new Uint8Array([1, 2, 3]),
    }))
  })

  it('still returns ok when the photo download fails', async () => {
    appRow.photo_path = 'app-1/photo.png'
    download.mockResolvedValue({ data: null, error: { message: 'gone' } } as any)
    const res = await downloadApplicationRecap('tok')
    expect(res.ok).toBe(true)
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({ photoBytes: null }))
  })

  it('falls back to a bare filename when the name is missing', async () => {
    appRow.data = {}
    const res = await downloadApplicationRecap('tok')
    expect(res.ok && res.filename).toBe('candidature.pdf')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run actions/__tests__/apply-recap.test.ts`
Expected: FAIL — `downloadApplicationRecap is not a function`.

- [ ] **Step 3: Add the import to `actions/apply.ts`**

Add one line to the import block at the top of `actions/apply.ts`, directly after the `getAppUrl` import (line 13):

```ts
import { renderApplicationRecapPdf } from '@/lib/pdf/application-recap'
```

(Static top-level import, matching `actions/fillable.ts:16`.)

- [ ] **Step 4: Add `language` to `getApplicationDraft`'s submitted branch**

In `actions/apply.ts`, replace this block (currently at lines 196–203):

```ts
  // Once submitted (or further along) the application is final — the resume link
  // can no longer reopen it. Return a marker only, never the PII, so the page
  // shows an "already submitted" notice instead of the form.
  // 'invited' (organizer-sent, untouched) and 'draft' both render the form.
  if (app.status !== 'draft' && app.status !== 'invited') {
    return { expired: false as const, submitted: true as const, exchangeName }
  }
```

with:

```ts
  // Once submitted (or further along) the application is final — the resume link
  // can no longer reopen it. Return a marker only, never the PII, so the page
  // shows an "already submitted" notice instead of the form. `language` is the
  // one non-marker field: it carries no PII and the page needs it to render the
  // recap-download button in the language the applicant applied in.
  // 'invited' (organizer-sent, untouched) and 'draft' both render the form.
  if (app.status !== 'draft' && app.status !== 'invited') {
    return {
      expired: false as const, submitted: true as const, exchangeName,
      language: app.language === 'fr' ? ('fr' as const) : ('en' as const),
    }
  }
```

- [ ] **Step 5: Append the action and its private helpers to `actions/apply.ts`**

Add at the **end** of `actions/apply.ts` (after `uploadApplicationPhoto`):

```ts
export type RecapResult =
  | { ok: true; filename: string; pdf: string /* base64 */ }
  | { ok: false; reason: 'not_found' | 'expired' | 'not_submitted' }

// ASCII-folded, lowercase, hyphenated name part for the download filename —
// « Dupont-Léger » → "dupont-leger". Not exported: a `'use server'` module may
// only export async functions.
function slugPart(value: string): string {
  return (value ?? '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function recapFilename(data: Record<string, string>): string {
  const parts = [slugPart(data.first_name ?? ''), slugPart(data.last_name ?? '')].filter(Boolean)
  return parts.length > 0 ? `candidature-${parts.join('-')}.pdf` : 'candidature.pdf'
}

// The applicant's own answers, back to the applicant, as a PDF they can keep.
//
// DELIBERATE PII EGRESS — read this next to getApplicationDraft above, which
// returns NO PII once status !== 'draft'. This action does the opposite on
// purpose: it returns the answers *because* they are submitted. The trust model
// is unchanged (the resume token is the applicant's own secret, and the token's
// expiry still gates it); it is simply a second, narrower door for the same
// person. It is not a mistake — do not "fix" it to match the branch above.
export async function downloadApplicationRecap(token: string): Promise<RecapResult> {
  // Same anonymous-token preamble as the other actions in this file.
  const ip = await clientIp()
  await enforceRateLimit(`recap_ip:${ip}`, 20, 3600)

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, language, photo_path, submitted_at, resume_token_expires_at, exchanges(name)')
    .eq('resume_token', token)
    .maybeSingle()
  // Structured returns, not throws: prod redacts thrown Server Action messages.
  if (!app) return { ok: false, reason: 'not_found' }
  if (tokenExpired(app.resume_token_expires_at)) return { ok: false, reason: 'expired' }
  // Only a submitted (or further-along) application has a recap.
  if (app.status === 'draft' || app.status === 'invited') return { ok: false, reason: 'not_submitted' }

  // A broken or unreadable upload must not cost the applicant their recap:
  // drop the photo and render the rest. Logged without PII.
  let photoBytes: Uint8Array | null = null
  if (app.photo_path) {
    try {
      const { data: blob, error } = await admin.storage
        .from(APPLICATION_PHOTO_BUCKET).download(app.photo_path)
      if (error || !blob) throw new Error('download failed')
      photoBytes = new Uint8Array(await blob.arrayBuffer())
    } catch {
      console.warn('[apply] recap photo unavailable — rendering without it')
      photoBytes = null
    }
  }

  const data = (app.data ?? {}) as Record<string, string>
  const pdf = await renderApplicationRecapPdf({
    exchangeName: app.exchanges?.name ?? '',
    applicantName: buildApplicantName(data),
    submittedAt: app.submitted_at,
    data,
    photoBytes,
    language: app.language === 'fr' ? 'fr' : 'en',
  })

  return { ok: true, filename: recapFilename(data), pdf: pdf.toString('base64') }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run actions/__tests__/apply-recap.test.ts`
Expected: PASS — 10 tests (the `it.each` counts as 2).

- [ ] **Step 7: Verify the `getApplicationDraft` ripple broke nothing**

Run: `pnpm vitest run actions/__tests__/apply-invited.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add actions/apply.ts actions/__tests__/apply-recap.test.ts
git commit -m "feat(apply): downloadApplicationRecap server action for the applicant's own PDF"
```

---

### Task 3: `ApplicationRecapButton` component

The client half: calls the action, decodes base64 to a Blob, triggers an `<a download>`. Styled with the funnel's literal hex palette (the public apply pages don't use the app shell's theme tokens — see `components/ApplicationForm.tsx`), not `components/ui/button`.

**Files:**
- Create: `components/ApplicationRecapButton.tsx`
- Test: `components/__tests__/ApplicationRecapButton.test.tsx`
- Read for reference (do not modify): `components/settings/DataPrivacyCard.tsx:30-40` (the base64 → Blob → `<a download>` flow this mirrors)

**Interfaces:**
- Consumes: `downloadApplicationRecap`, `RecapResult` from `@/actions/apply` (Task 2).
- Produces:
  ```ts
  export function ApplicationRecapButton(props: {
    token: string
    language: 'en' | 'fr'
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ApplicationRecapButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const downloadApplicationRecap = vi.fn(async (_token: string) => ({
  ok: true as const, filename: 'candidature-zoe-dupont.pdf', pdf: Buffer.from('%PDF-x').toString('base64'),
}))
vi.mock('@/actions/apply', () => ({
  downloadApplicationRecap: (token: string) => downloadApplicationRecap(token),
}))

import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'

let clickSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  downloadApplicationRecap.mockResolvedValue({
    ok: true, filename: 'candidature-zoe-dupont.pdf', pdf: Buffer.from('%PDF-x').toString('base64'),
  })
  clickSpy = vi.fn()
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
    const el = origCreate(tag)
    if (tag === 'a') el.click = clickSpy
    return el
  })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ApplicationRecapButton', () => {
  it('renders the French label by default', () => {
    render(<ApplicationRecapButton token="t" language="fr" />)
    expect(screen.getByRole('button', { name: /télécharger mes réponses/i })).toBeInTheDocument()
  })

  it('renders the English label', () => {
    render(<ApplicationRecapButton token="t" language="en" />)
    expect(screen.getByRole('button', { name: /download my answers/i })).toBeInTheDocument()
  })

  it('downloads the PDF with the server-supplied filename', async () => {
    render(<ApplicationRecapButton token="tok-1" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    await waitFor(() => expect(downloadApplicationRecap).toHaveBeenCalledWith('tok-1'))
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
  })

  it('disables the button and shows a preparing label while in flight', async () => {
    let resolve!: (v: any) => void
    downloadApplicationRecap.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByRole('button', { name: /préparation…/i })).toBeDisabled()
    resolve({ ok: true, filename: 'a.pdf', pdf: '' })
    await waitFor(() => expect(screen.getByRole('button', { name: /télécharger mes réponses/i })).toBeEnabled())
  })

  it('renders an inline message for an expired link instead of downloading', async () => {
    downloadApplicationRecap.mockResolvedValueOnce({ ok: false, reason: 'expired' } as any)
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByText(/ce lien a expiré/i)).toBeInTheDocument()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('renders an inline message for an unknown link', async () => {
    downloadApplicationRecap.mockResolvedValueOnce({ ok: false, reason: 'not_found' } as any)
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByText(/n’est plus valide/i)).toBeInTheDocument()
  })

  it('renders a generic retry line when the action throws', async () => {
    downloadApplicationRecap.mockRejectedValueOnce(new Error('digest-abc123'))
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByText(/le téléchargement a échoué/i)).toBeInTheDocument()
    // Never surface the raw (redacted) error text.
    expect(screen.queryByText(/digest-abc123/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/__tests__/ApplicationRecapButton.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/ApplicationRecapButton"`.

- [ ] **Step 3: Write the component**

Create `components/ApplicationRecapButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import { downloadApplicationRecap } from '@/actions/apply'

// Bilingual copy inline, matching ApplicationForm's `T` convention — the public
// apply funnel does not go through next-intl.
const T = {
  en: {
    label: 'Download my answers (PDF)',
    preparing: 'Preparing…',
    not_found: 'This link is no longer valid — ask your organizer for a new one.',
    expired: 'This link has expired — ask your organizer for a new one.',
    not_submitted: 'Your application has not been submitted yet.',
    unexpected: 'The download failed. Please try again.',
  },
  fr: {
    label: 'Télécharger mes réponses (PDF)',
    preparing: 'Préparation…',
    not_found: 'Ce lien n’est plus valide — demande un nouveau lien à ton organisateur.',
    expired: 'Ce lien a expiré — demande un nouveau lien à ton organisateur.',
    not_submitted: 'Ta candidature n’a pas encore été envoyée.',
    unexpected: 'Le téléchargement a échoué. Réessaie.',
  },
}

export function ApplicationRecapButton({ token, language }: { token: string; language: 'en' | 'fr' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = T[language]

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const res = await downloadApplicationRecap(token)
      if (!res.ok) {
        // Structured reason, never a thrown message (prod redacts those).
        setError(t[res.reason])
        return
      }
      const bytes = Uint8Array.from(atob(res.pdf), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(t.unexpected)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-[11px] border border-[#C4CDE0] bg-white px-5 py-3 text-[14px] font-semibold text-[#10203F] hover:bg-[#F4F7FC] disabled:opacity-60"
      >
        <DownloadIcon aria-hidden size={16} strokeWidth={1.75} />
        {busy ? t.preparing : t.label}
      </button>
      {error && <p className="m-0 text-[13px] text-[#C0392B]">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/__tests__/ApplicationRecapButton.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationRecapButton.tsx components/__tests__/ApplicationRecapButton.test.tsx
git commit -m "feat(apply): ApplicationRecapButton downloads the applicant's recap PDF"
```

---

### Task 4: Wire the two call sites

Puts the button on the confirmation screen and on the resume link's "already submitted" screen.

**Files:**
- Modify: `components/ApplicationForm.tsx` (import at line ~5; the `done` early return at line 99)
- Modify: `app/apply/resume/[token]/page.tsx` (the `draft.submitted` branch, lines 25–30)
- Modify: `components/__tests__/ApplicationForm.test.tsx` (the `vi.mock('@/actions/apply', …)` factory at lines 5–10)

**Interfaces:**
- Consumes: `ApplicationRecapButton` from `@/components/ApplicationRecapButton` (Task 3); `getApplicationDraft`'s submitted branch now carrying `language` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Add the recap action to the existing ApplicationForm test mock**

`components/__tests__/ApplicationForm.test.tsx` mocks `@/actions/apply` with an explicit factory. `ApplicationRecapButton` imports `downloadApplicationRecap` from that same module, so add it to the factory. Replace lines 5–10:

```tsx
vi.mock('@/actions/apply', () => ({
  saveApplicationDraft: vi.fn(async () => ({ ok: true as const })),
  submitApplication: vi.fn(async () => ({ ok: true as const })),
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))
```

with:

```tsx
vi.mock('@/actions/apply', () => ({
  saveApplicationDraft: vi.fn(async () => ({ ok: true as const })),
  submitApplication: vi.fn(async () => ({ ok: true as const })),
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
  sendApplicationResumeLink: vi.fn(async () => {}),
  downloadApplicationRecap: vi.fn(async () => ({ ok: true as const, filename: 'c.pdf', pdf: '' })),
}))
```

- [ ] **Step 2: Add the failing assertion for the confirmation screen**

In `components/__tests__/ApplicationForm.test.tsx`, add this test inside the `describe('ApplicationForm', …)` block, right after the existing `'clears the stored resume token on successful submit'` test:

```tsx
  it('offers the recap download on the confirmation screen', async () => {
    const user = userEvent.setup()
    renderForm({ exchangeName: 'X' })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/ta candidature a été envoyée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /télécharger mes réponses/i })).toBeInTheDocument()
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run components/__tests__/ApplicationForm.test.tsx`
Expected: FAIL on the new test — `Unable to find an accessible element with the role "button" and name /télécharger mes réponses/i`. The pre-existing tests must still pass.

- [ ] **Step 4: Grow the `done` branch in `ApplicationForm.tsx`**

Add the import after line 5 (`import { ApplicationPhotoUpload } …`):

```tsx
import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'
```

Then replace line 99:

```tsx
  if (done) return <p className="py-16 text-center text-[15px] text-[#10203F]">{t.done}</p>
```

with:

```tsx
  if (done) return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <p className="m-0 text-[15px] text-[#10203F]">{t.done}</p>
      <ApplicationRecapButton token={token} language={lang} />
    </div>
  )
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run components/__tests__/ApplicationForm.test.tsx`
Expected: PASS — all tests including the new one.

- [ ] **Step 6: Add the button to the resume page's submitted branch**

In `app/apply/resume/[token]/page.tsx`, add the import after line 3:

```tsx
import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'
```

Then replace the `draft.submitted` branch (lines 25–30):

```tsx
  if (draft.submitted) return (
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
      <p className="text-[15px] text-[#0F7A3D]">Ta candidature a déjà été envoyée. Elle ne peut plus être modifiée — l’organisateur reviendra vers toi.</p>
    </main>
  )
```

with:

```tsx
  if (draft.submitted) return (
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
      <p className="mb-6 text-[15px] text-[#0F7A3D]">Ta candidature a déjà été envoyée. Elle ne peut plus être modifiée — l’organisateur reviendra vers toi.</p>
      <div className="flex justify-start">
        <ApplicationRecapButton token={token} language={draft.language} />
      </div>
    </main>
  )
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `draft.language` errors here, Task 2 Step 4 was not applied — go back and apply it.

- [ ] **Step 8: Full verification gate**

Run: `pnpm lint && pnpm vitest run --exclude '**/.claude/**' && pnpm build`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add components/ApplicationForm.tsx components/__tests__/ApplicationForm.test.tsx "app/apply/resume/[token]/page.tsx"
git commit -m "feat(apply): offer the recap download on the confirmation and resume screens"
```

---

## Manual smoke check (after Task 4, before opening a PR)

Not a test step — a five-minute confirmation that the real renderer produces something a parent would want to keep, which no unit test can judge.

1. `pnpm dev`, run through the apply funnel locally (or `pnpm seed` for a demo exchange with a submitted application), upload a JPEG photo.
2. Submit; click « Télécharger mes réponses (PDF) » on the confirmation screen. Open the PDF: header, photo, every answered field under its section, accents intact (no `?` boxes), no orphaned section titles.
3. Reload the resume link — the "already submitted" screen shows the button and it downloads the same PDF.
4. Switch the funnel to EN before submitting and confirm the PDF comes out in English.

## Out of scope (do not build)

- Any schema change, migration, or RLS policy → `pnpm test:rls` is not part of this work.
- Organizer-side recap download (they already have `PrintButton` on the application detail page).
- Emailing the recap.
- Any change to what a *draft* application exposes.
