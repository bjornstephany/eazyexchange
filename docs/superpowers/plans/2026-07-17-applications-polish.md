# Applications Page Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-17-applications-polish-design.md`

**Goal:** Three usability fixes: student photos in application rows, a 150-character limit on the 14 open-ended "Student profile" questions, and dark readable reading text on the Applications page.

**Architecture:** `listApplications` gains an opt-in `{ withPhotos: true }` that batch-signs private photo paths with the admin client (same authorization-then-admin-sign pattern as `getApplicationForReview` in the same file). The character limit is data-driven — a `maxLength` property on the `AppField` catalog — enforced client-side (HTML `maxLength` + live counter) and server-side via a pure helper returning structured results. Text darkening is pure Tailwind class changes.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (storage signed URLs), Tailwind, vitest + @testing-library/react.

## Global Constraints

- **No migration, no RLS change, no storage-policy change** → `pnpm test:rls` NOT required for this feature.
- **No new admin-allowlist entry**: `actions/applications-review.ts` and `actions/apply.ts` already import `lib/supabase/admin` and are already allowlisted in `lib/supabase/__tests__/admin-allowlist.test.ts`. Do not add imports of `@/lib/supabase/admin` to any OTHER file.
- **`'use server'` files may only value-export async functions.** `export type …` is fine (erased at compile time); `export const` is a build error.
- **Expected outcomes are structured return values, never thrown errors** — prod redacts thrown Server Action messages. Over-limit rejection MUST be a structured return.
- **`photo_path` never ships to the browser** — only the signed URL does.
- **Never log student/parent PII.**
- Package manager is **pnpm**. Tests: `pnpm test` runs `vitest run`.
- `pnpm build` may fail locally because `.env.local` holds placeholders; if it fails ONLY on env, use `npx tsc --noEmit` as the local type gate (CI runs the real build).
- All work on branch **`feature/applications-polish`** (created in Task 1, Step 1). Never push to `main`.
- The public apply form (`components/ApplicationForm.tsx`) is bilingual via its local `T` table (EN + FR entries required for any new string). The organizer UI (`CandidaturesView`) uses next-intl, but no task adds organizer-facing copy — no message-catalog changes needed.

---

### Task 1: `maxLength` catalog + `overLimitApplicationFields` helper

**Files:**
- Modify: `lib/application-form.ts` (AppField interface ~line 3; profile section fields ~lines 91–104; new helper after `missingRequiredApplication` ~line 155)
- Test: `lib/__tests__/application-form.test.ts`

**Interfaces:**
- Consumes: existing `allApplicationFields(): AppField[]`.
- Produces: `AppField.maxLength?: number` (set to `150` on all 14 `profile`-section fields, nowhere else) and `overLimitApplicationFields(data: Record<string, string>): string[]` — ids of fields whose value length exceeds their `maxLength`, in catalog order. Tasks 2 and 3 import `overLimitApplicationFields` from `@/lib/application-form`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/application-form.test.ts` (add `overLimitApplicationFields` to the existing `../application-form` import):

```ts
describe('overLimitApplicationFields', () => {
  it('returns ids of answers longer than their maxLength', () => {
    expect(overLimitApplicationFields({ lived_abroad: 'x'.repeat(151), sports: 'x'.repeat(150) }))
      .toEqual(['lived_abroad'])
  })
  it('accepts values at exactly the limit, empty, and missing values', () => {
    expect(overLimitApplicationFields({ lived_abroad: 'x'.repeat(150) })).toEqual([])
    expect(overLimitApplicationFields({})).toEqual([])
  })
  it('ignores fields without a maxLength (addresses, allergy fields stay unlimited)', () => {
    expect(overLimitApplicationFields({
      father_address: 'x'.repeat(9000),
      food_requirements: 'x'.repeat(9000),
      other_allergies: 'x'.repeat(9000),
    })).toEqual([])
  })
  it('caps exactly the 14 profile textareas at 150', () => {
    const limited = allApplicationFields().filter(f => f.maxLength != null)
    expect(limited.map(f => f.id)).toEqual([
      'lived_abroad', 'countries_with_parents', 'countries_without_parents', 'sports',
      'activities', 'instruments', 'family_activities', 'spare_time', 'adjectives',
      'recharge', 'todo_list', 'ideal_partner', 'share_when_hosting', 'anything_else',
    ])
    expect(limited.every(f => f.maxLength === 150)).toBe(true)
  })
})
```

- [ ] **Step 2: Create the branch, run the test to verify it fails**

```bash
git checkout -b feature/applications-polish
pnpm vitest run lib/__tests__/application-form.test.ts
```

Expected: FAIL — `overLimitApplicationFields` is not exported.

- [ ] **Step 3: Implement**

In `lib/application-form.ts`:

(a) Add `maxLength` to the interface:

```ts
export interface AppField {
  id: string
  type: AppFieldType
  label: { en: string; fr: string }
  required?: boolean
  group?: 'father' | 'mother'
  options?: { value: string; label: { en: string; fr: string } }[]
  maxLength?: number
}
```

(b) Add `maxLength: 150` to **each of the 14 fields of the `profile` section only** (`lived_abroad`, `countries_with_parents`, `countries_without_parents`, `sports`, `activities`, `instruments`, `family_activities`, `spare_time`, `adjectives`, `recharge`, `todo_list`, `ideal_partner`, `share_when_hosting`, `anything_else`). Example for the first one — repeat the same `maxLength: 150` property on the other 13:

```ts
{ id: 'lived_abroad', type: 'textarea', label: L('If you have ever lived abroad, describe where and when', "Si vous avez déjà vécu à l'étranger, décrivez où et quand"), required: true, maxLength: 150 },
```

Do NOT touch the `parents` or `hosting` textareas (`father_address`, `mother_address`, `separation_housing_address`, `food_requirements`, `other_allergies`).

(c) Add the helper after `missingRequiredApplication` (before `applicantName`):

```ts
// Ids of fields whose answer exceeds their per-field maxLength. Pure server-side
// backstop of the client-side maxLength attribute; String() coercion mirrors
// hasOverlongAnswer (client payloads aren't runtime-typed).
export function overLimitApplicationFields(data: Record<string, string>): string[] {
  return allApplicationFields()
    .filter(f => f.maxLength != null && String(data[f.id] ?? '').length > f.maxLength)
    .map(f => f.id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run lib/__tests__/application-form.test.ts
```

Expected: PASS (all existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/application-form.ts lib/__tests__/application-form.test.ts
git commit -m "feat(apply): 150-char maxLength on profile fields + overLimitApplicationFields helper"
```

---

### Task 2: Server actions reject over-limit payloads with a structured result

**Files:**
- Modify: `actions/apply.ts` (`saveApplicationDraft` ~line 241, `submitApplication` ~line 255)
- Test: `actions/__tests__/applications.test.ts` (extend the existing `saveApplicationDraft` and `submitApplication` describes, ~lines 264 and 315)

**Interfaces:**
- Consumes: `overLimitApplicationFields(data)` from Task 1.
- Produces: `export type ApplyWriteResult = { ok: true } | { ok: false; overLimit: string[] }` in `actions/apply.ts`. `saveApplicationDraft(token, data)` and `submitApplication(token, data)` both now return `Promise<ApplyWriteResult>` instead of `Promise<void>`. All existing throws (expired link, locked, closed, missing-required, rate limits) are unchanged. Task 3 imports `submitApplication`/`saveApplicationDraft` with these return types.

- [ ] **Step 1: Write the failing tests**

In `actions/__tests__/applications.test.ts`, add inside the existing `describe('saveApplicationDraft', …)` block:

```ts
  it('rejects an over-limit profile answer with a structured result and writes nothing', async () => {
    const res = await saveApplicationDraft('tok', { lived_abroad: 'x'.repeat(151) })
    expect(res).toEqual({ ok: false, overLimit: ['lived_abroad'] })
    expect(scenario.updated).toBeNull()
  })
  it('returns ok:true after a successful draft save', async () => {
    scenario.application = { id: 'app-1', status: 'draft', resume_token_expires_at: null, exchange_id: 'ex-1' }
    const res = await saveApplicationDraft('tok', { first_name: 'A' })
    expect(res).toEqual({ ok: true })
  })
```

And inside the existing `describe('submitApplication', …)` block:

```ts
  it('rejects an over-limit profile answer with a structured result and writes nothing', async () => {
    const res = await submitApplication('tok', { ...completeAppData(), sports: 'x'.repeat(151) })
    expect(res).toEqual({ ok: false, overLimit: ['sports'] })
    expect(scenario.updated).toBeNull()
  })
  it('returns ok:true on a successful submission', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    const res = await submitApplication('tok', completeAppData())
    expect(res).toEqual({ ok: true })
  })
```

(`completeAppData()` fills every field with `'x'` — under every limit; the scenario harness and its `beforeEach` reset already exist in this file.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run actions/__tests__/applications.test.ts
```

Expected: FAIL — the four new tests get `undefined` instead of a result object.

- [ ] **Step 3: Implement**

In `actions/apply.ts`:

(a) Extend the import from `@/lib/application-form`:

```ts
import { missingRequiredApplication, overLimitApplicationFields, applicantName as buildApplicantName } from '@/lib/application-form'
```

(b) Add the type next to `StartApplicationResult` (type export is legal in a `'use server'` file):

```ts
// Structured result for the two draft-writing actions: expected validation
// outcomes must be return values, never throws (prod redacts thrown messages).
export type ApplyWriteResult = { ok: true } | { ok: false; overLimit: string[] }
```

(c) `saveApplicationDraft` — new signature and over-limit gate at the top (before any DB read; the check is pure), plus `return { ok: true }` at the end:

```ts
export async function saveApplicationDraft(token: string, data: Record<string, string>): Promise<ApplyWriteResult> {
  if (hasOverlongAnswer(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const overLimit = overLimitApplicationFields(data)
  if (overLimit.length > 0) return { ok: false, overLimit }
  const admin = createAdminClient()
  // …existing body unchanged…
  if (error) throw error
  return { ok: true }
}
```

(d) `submitApplication` — same pattern:

```ts
export async function submitApplication(token: string, data: Record<string, string>): Promise<ApplyWriteResult> {
  if (hasOverlongAnswer(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const overLimit = overLimitApplicationFields(data)
  if (overLimit.length > 0) return { ok: false, overLimit }

  const admin = createAdminClient()
  // …existing body unchanged (all throws stay throws)…
```

and at the very end of the function, after the organizer alert-email block:

```ts
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run actions/__tests__/applications.test.ts
```

Expected: PASS (all existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add actions/apply.ts actions/__tests__/applications.test.ts
git commit -m "feat(apply): saveApplicationDraft/submitApplication return structured over-limit results"
```

---

### Task 3: Apply form — maxLength attribute, live counter, over-limit surfacing

**Files:**
- Modify: `components/ApplicationForm.tsx`
- Test: `components/__tests__/ApplicationForm.test.tsx`

**Interfaces:**
- Consumes: `AppField.maxLength` + `overLimitApplicationFields` (Task 1); `ApplyWriteResult`-returning `saveApplicationDraft`/`submitApplication` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update mocks + write the failing tests**

In `components/__tests__/ApplicationForm.test.tsx`, the `@/actions/apply` mock must match the new return types or every existing submit test breaks — change the two mocks:

```ts
vi.mock('@/actions/apply', () => ({
  saveApplicationDraft: vi.fn(async () => ({ ok: true as const })),
  submitApplication: vi.fn(async () => ({ ok: true as const })),
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))
```

Then add these tests (the file's existing partial mock of `@/lib/application-form` only stubs `missingRequiredApplication`, so the real `overLimitApplicationFields` runs):

```tsx
  it('shows a live character counter on limited profile textareas', () => {
    renderForm({ initialData: { lived_abroad: 'abc' } })
    expect(screen.getByText('3/150')).toBeInTheDocument()
  })

  it('blocks submit client-side when an answer exceeds its limit', async () => {
    const user = userEvent.setup()
    renderForm({ initialData: { lived_abroad: 'x'.repeat(151) } })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/dépassent la limite/i)).toBeInTheDocument()
    expect(submitApplication).not.toHaveBeenCalled()
  })

  it('surfaces a server-side over-limit rejection without marking the form done', async () => {
    const user = userEvent.setup()
    vi.mocked(submitApplication).mockResolvedValueOnce({ ok: false, overLimit: ['sports'] })
    renderForm()
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/dépassent la limite/i)).toBeInTheDocument()
    expect(screen.queryByText(/ta candidature a été envoyée/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm vitest run components/__tests__/ApplicationForm.test.tsx
```

Expected: the 3 new tests FAIL (no counter, no over-limit message); all pre-existing tests still PASS (mocks updated).

- [ ] **Step 3: Implement**

In `components/ApplicationForm.tsx`:

(a) Import the helper (extend the existing `@/lib/application-form` import):

```ts
import { APPLICATION_SECTIONS, missingRequiredApplication, overLimitApplicationFields, parentGroupFields, type AppField } from '@/lib/application-form'
```

(b) Add `tooLong` to both `T` entries:

```ts
// in T.en:
tooLong: 'Some answers exceed the character limit.',
// in T.fr:
tooLong: 'Certaines réponses dépassent la limite de caractères.',
```

(c) Replace the textarea branch of `renderField` (the field wrapper div is already `flex flex-col`, so `self-end` right-aligns the counter):

```tsx
    if (f.type === 'textarea') {
      const len = (data[f.id] ?? '').length
      return (
        <>
          <Textarea id={f.id} value={data[f.id] ?? ''} maxLength={f.maxLength} aria-invalid={invalid || undefined} onChange={e => set(f.id, e.target.value)} className={`rounded-[10px] ${inputBorder}`} />
          {f.maxLength != null && (
            <span className={`self-end font-mono text-[11px] ${len > f.maxLength ? 'font-semibold text-[#C0392B]' : 'text-[#8A97B2]'}`}>
              {len}/{f.maxLength}
            </span>
          )}
        </>
      )
    }
```

(The red over-limit state is reachable only via pre-existing long drafts — `maxLength` blocks new typing but does not truncate an initial value.)

(d) Replace `onSubmit` — client pre-check plus structured-result handling:

```ts
  async function onSubmit() {
    const miss = missingRequiredApplication(data, { hasPhoto })
    const over = overLimitApplicationFields(data)
    const flagged = [...miss, ...over]
    setMissing(flagged)
    if (flagged.length) {
      setError(miss.length ? t.missing : t.tooLong)
      document.getElementById(`field-${flagged[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true); setError(null)
    try {
      const res = await submitApplication(token, data)
      if (!res.ok) {
        setMissing(res.overLimit)
        setError(t.tooLong)
        document.getElementById(`field-${res.overLimit[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        setSubmitting(false)
        return
      }
      clearResumeToken(slug); setDone(true)
    }
    catch (err: unknown) { setError(err instanceof Error ? err.message : t.unexpected); setSubmitting(false) }
  }
```

`autosave` and `onResend` stay as they are: they may now receive `{ ok: false }` and simply not persist — the red counter and the submit gate are the user-facing surface, and a rejected autosave loses nothing (state keeps the text).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run components/__tests__/ApplicationForm.test.tsx
```

Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationForm.tsx components/__tests__/ApplicationForm.test.tsx
git commit -m "feat(apply): maxLength + live counter on profile textareas, over-limit submit surfacing"
```

---

### Task 4: `listApplications` opt-in batch-signed photo URLs

**Files:**
- Modify: `actions/applications-review.ts` (`listApplications`, lines 30–55)
- Test: `actions/__tests__/list-applications.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` + `APPLICATION_PHOTO_BUCKET` (already imported in this file).
- Produces:

```ts
export type ApplicationListRow = {
  id: string
  status: string
  submitted_at: string | null
  data: Record<string, string>
  email: string
  photoUrl?: string | null   // present only when { withPhotos: true }
}
export async function listApplications(exchangeId: string, opts?: { withPhotos?: boolean }): Promise<ApplicationListRow[]>
```

Task 6 calls `listApplications(active.id, { withPhotos: true })`. Existing no-opts callers (`app/(organizer)/dashboard/page.tsx`, `app/(organizer)/exchanges/page.tsx`) are unaffected.

- [ ] **Step 1: Write the failing tests**

Rewrite `actions/__tests__/list-applications.test.ts`'s fixtures so rows are configurable and the admin mock can sign, keeping the three existing scope-check tests intact:

Replace the fixture block (lines 21–39: the `exchangeRow` declaration, `makeClient`, and the two supabase mocks — note line 12's old `createAdminClient: () => ({})` mock is replaced here too) with:

```ts
// The exchange row / application rows the mocked client returns — set per test.
let exchangeRow: { school_a_id: string; school_b_id: string | null } | null = null
let appRows: any[] = []

const createSignedUrls = vi.fn(async (paths: string[], _expiresIn: number) => ({
  data: paths.map(p => ({ path: p, signedUrl: `https://signed.example/${p}`, error: null })),
  error: null,
}))

function makeClient() {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: async () => ({ data: appRows, error: null }),
        maybeSingle: async () =>
          table === 'exchanges' ? { data: exchangeRow, error: null } : { data: null, error: null },
      }
      return builder
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
}))
```

(The `vi.mock('@/lib/supabase/admin', …)` at line 12 must be deleted — one mock per module.) Add a reset and the new tests:

```ts
beforeEach(() => {
  appRows = [{ id: 'app-1' }]
  createSignedUrls.mockClear()
})

describe('listApplications photos', () => {
  it('maps photo_path to a batch-signed URL and never returns the raw path', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    appRows = [
      { id: 'app-1', photo_path: 'app-1/photo.jpg' },
      { id: 'app-2', photo_path: null },
    ]
    const rows = await listApplications('ex-1', { withPhotos: true })
    expect(rows).toEqual([
      { id: 'app-1', photoUrl: 'https://signed.example/app-1/photo.jpg' },
      { id: 'app-2', photoUrl: null },
    ])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['app-1/photo.jpg'], 3600)
  })

  it('skips the storage call entirely when no listed row has a photo', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    appRows = [{ id: 'app-1', photo_path: null }]
    await listApplications('ex-1', { withPhotos: true })
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('the default call keeps its shape: no photoUrl key, no storage call', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    const rows = await listApplications('ex-1')
    expect(rows).toEqual([{ id: 'app-1' }])
    expect(createSignedUrls).not.toHaveBeenCalled()
  })
})
```

(`beforeEach` must be added to the `vitest` import line.)

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm vitest run actions/__tests__/list-applications.test.ts
```

Expected: 3 existing scope tests PASS; the first two new tests FAIL (`withPhotos` unknown / no `photoUrl` in result).

- [ ] **Step 3: Implement**

Replace `listApplications` in `actions/applications-review.ts` (keep the existing scope-check comment block; add the new type export above the function):

```ts
// Row shape shipped to the Candidatures view / dashboard rollups. photoUrl is
// present only when the caller asked for photos; photo_path itself never
// leaves the server — only the signed URL does.
export type ApplicationListRow = {
  id: string
  status: string
  submitted_at: string | null
  data: Record<string, string>
  email: string
  photoUrl?: string | null
}

export async function listApplications(
  exchangeId: string,
  opts?: { withPhotos?: boolean },
): Promise<ApplicationListRow[]> {
  const supabase = await createClient()
  const { profile } = await requireOrganizer()
  // Belt-and-suspenders with RLS (which already scopes rows to the caller's
  // school — proven by tests/rls/matrix.test.ts): refuse foreign exchange ids
  // outright so a future RLS refactor can never silently open this read.
  // Same shape as assertOrganizerInExchange in actions/students.ts.
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('school_a_id, school_b_id')
    .eq('id', exchangeId)
    .maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }

  if (!opts?.withPhotos) {
    const { data, error } = await supabase
      .from('applications')
      // Only the columns the Candidatures view + dashboard rollups consume (AppRow).
      // Avoids shipping the private resume_token / invite_token to the browser.
      .select('id, status, submitted_at, data, email')
      .eq('exchange_id', exchangeId)
      .neq('status', 'draft')
      .order('submitted_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ApplicationListRow[]
  }

  const { data, error } = await supabase
    .from('applications')
    .select('id, status, submitted_at, data, email, photo_path')
    .eq('exchange_id', exchangeId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as (ApplicationListRow & { photo_path: string | null })[]

  // Organizer authorization verified above; the application-photos bucket is
  // private with no per-user storage policy, so sign with the admin client —
  // one batched call for the whole list (same pattern as getApplicationForReview).
  const paths = rows.map(r => r.photo_path).filter((p): p is string => p !== null)
  const urlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const admin = createAdminClient()
    const { data: signed } = await admin.storage
      .from(APPLICATION_PHOTO_BUCKET)
      .createSignedUrls(paths, 3600)
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
    }
  }
  return rows.map(r => ({
    id: r.id, status: r.status, submitted_at: r.submitted_at, data: r.data, email: r.email,
    photoUrl: r.photo_path ? urlByPath.get(r.photo_path) ?? null : null,
  }))
}
```

(Explicit property mapping — not rest-destructuring — so no unused-variable lint risk; a path whose signing failed yields `photoUrl: null`, which Task 5's avatar renders as initials.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run actions/__tests__/list-applications.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add actions/applications-review.ts actions/__tests__/list-applications.test.ts
git commit -m "feat(applications): listApplications withPhotos option with batch-signed photo URLs"
```

---

### Task 5: `applicantInitials` helper + `ApplicantAvatar` component

**Files:**
- Modify: `lib/application-form.ts` (after `applicantName`, ~line 162)
- Create: `components/applications/ApplicantAvatar.tsx`
- Test: `lib/__tests__/application-form.test.ts`, Create: `components/__tests__/ApplicantAvatar.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `applicantInitials(data: Record<string, string> | null | undefined, email: string): string` in `@/lib/application-form`, and `ApplicantAvatar({ photoUrl, data, email }: { photoUrl: string | null; data: Record<string, string>; email: string })` in `@/components/applications/ApplicantAvatar`. Task 6 renders `<ApplicantAvatar photoUrl={a.photoUrl ?? null} data={a.data} email={a.email} />`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/application-form.test.ts` (add `applicantInitials` to the import):

```ts
describe('applicantInitials', () => {
  it('uses the first letters of first + last name, uppercased', () => {
    expect(applicantInitials({ first_name: 'zoé', last_name: 'martin' }, 'z@x.co')).toBe('ZM')
  })
  it('uses a single initial when only one name part exists', () => {
    expect(applicantInitials({ first_name: 'Zoé' }, 'z@x.co')).toBe('Z')
  })
  it('falls back to the first letter of the email when both names are empty', () => {
    expect(applicantInitials({}, 'zoe@example.com')).toBe('Z')
    expect(applicantInitials(null, 'zoe@example.com')).toBe('Z')
  })
})
```

Create `components/__tests__/ApplicantAvatar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'

describe('ApplicantAvatar', () => {
  it('renders the photo when a signed URL is present', () => {
    const { container } = render(
      <ApplicantAvatar photoUrl="https://signed.example/p.jpg" data={{ first_name: 'Zoé', last_name: 'Martin' }} email="z@x.co" />,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed.example/p.jpg')
  })
  it('falls back to initials when photoUrl is null', () => {
    const { container } = render(
      <ApplicantAvatar photoUrl={null} data={{ first_name: 'Zoé', last_name: 'Martin' }} email="z@x.co" />,
    )
    expect(screen.getByText('ZM')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
  it('falls back to the email initial when the row has no names', () => {
    render(<ApplicantAvatar photoUrl={null} data={{}} email="zoe@example.com" />)
    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run lib/__tests__/application-form.test.ts components/__tests__/ApplicantAvatar.test.tsx
```

Expected: FAIL — `applicantInitials` not exported; `ApplicantAvatar` module not found.

- [ ] **Step 3: Implement**

In `lib/application-form.ts`, after `applicantName`:

```ts
// Avatar fallback initials: first letter of first + last name; first letter of
// the email when both name parts are empty (legacy rows without a photo).
export function applicantInitials(data: Record<string, string> | null | undefined, email: string): string {
  const first = (data?.first_name ?? '').trim()
  const last = (data?.last_name ?? '').trim()
  const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
  return initials || email.charAt(0).toUpperCase()
}
```

Create `components/applications/ApplicantAvatar.tsx`:

```tsx
import { applicantInitials } from '@/lib/application-form'

// 28px round applicant avatar for list rows. Decorative (empty alt): the
// student's name is always rendered right next to it.
export function ApplicantAvatar({ photoUrl, data, email }: {
  photoUrl: string | null
  data: Record<string, string>
  email: string
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className="h-7 w-7 shrink-0 rounded-full border object-cover" />
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-muted-foreground">
      {applicantInitials(data, email)}
    </span>
  )
}
```

(Plain `<img>` with the eslint escape, exactly like the existing signed-URL photos in `ApplicationReadView.tsx` — signed Supabase URLs don't go through `next/image`.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run lib/__tests__/application-form.test.ts components/__tests__/ApplicantAvatar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/application-form.ts lib/__tests__/application-form.test.ts components/applications/ApplicantAvatar.tsx components/__tests__/ApplicantAvatar.test.tsx
git commit -m "feat(applications): ApplicantAvatar with initials fallback"
```

---

### Task 6: Wire photos into the Applications page rows

**Files:**
- Modify: `lib/dashboard/rollup.ts:20` (AppRow type)
- Modify: `app/(organizer)/applications/page.tsx:22-25`
- Modify: `components/applications/CandidaturesView.tsx` (student cell, ~line 316)

**Interfaces:**
- Consumes: `listApplications(id, { withPhotos: true })` → `ApplicationListRow[]` (Task 4); `ApplicantAvatar` (Task 5).
- Produces: `AppRow.photoUrl?: string | null` — optional, so every dashboard/rollup construction site of `AppRow` compiles unchanged.

- [ ] **Step 1: Extend AppRow**

In `lib/dashboard/rollup.ts` line 20:

```ts
export type AppRow = { id: string; status: string; submitted_at: string | null; data: Record<string, string>; email: string; photoUrl?: string | null }
```

- [ ] **Step 2: Pass photos from the page**

In `app/(organizer)/applications/page.tsx`, replace lines 22–25:

```ts
  const applications = await listApplications(active.id, { withPhotos: true })
  const apps: AppRow[] = applications.map(a => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email, photoUrl: a.photoUrl ?? null,
  }))
```

(The `(a: any)` annotation goes away — `listApplications` is now typed.)

- [ ] **Step 3: Render the avatar in the row**

In `components/applications/CandidaturesView.tsx`, add the import:

```ts
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'
```

and replace the student cell (line 316):

```tsx
              <span className="flex min-w-0 items-center gap-2.5">
                <ApplicantAvatar photoUrl={a.photoUrl ?? null} data={a.data} email={a.email} />
                <span className="truncate text-sm text-navy">{applicantName(a.data) || a.email}</span>
              </span>
```

(The grid column count is untouched — the avatar lives inside the existing student cell.)

- [ ] **Step 4: Verify — full unit suite + types**

```bash
pnpm vitest run
npx tsc --noEmit
```

Expected: all tests PASS; tsc clean (proves dashboard `AppRow` construction sites still compile).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/rollup.ts "app/(organizer)/applications/page.tsx" components/applications/CandidaturesView.tsx
git commit -m "feat(applications): student photo avatar in application rows"
```

---

### Task 7: Dark readable text + full gate

**Files:**
- Modify: `components/applications/CandidaturesView.tsx` (row cells, lines 317–319)
- Modify: `components/ApplicationReadView.tsx:24`

**Interfaces:** none — pure class changes.

- [ ] **Step 1: Darken the table reading cells**

In `components/applications/CandidaturesView.tsx`, the three data cells after the student cell change `text-muted-foreground` → `text-navy`:

```tsx
              <span className="text-sm text-navy">{a.data.grade ?? '—'}</span>
              <span className="text-sm text-navy">{a.data.native_language ?? '—'}</span>
              <span className="text-sm text-navy">{frShortDate(a.submitted_at)}</span>
```

Leave untouched (structural chrome, per spec): the mono uppercase header row, empty states, bulk-bar labels, "Deadline"/"Link" control labels, and the trailing `<span className="text-muted-foreground">›</span>` chevron.

- [ ] **Step 2: Darken the detail-view question labels**

In `components/ApplicationReadView.tsx` line 24:

```tsx
                <dt className="text-xs text-foreground">{f.label[lang]}</dt>
```

(Hierarchy is kept by size: labels stay `text-xs`, answers `text-sm`.)

- [ ] **Step 3: Run the full gate**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: lint clean, all tests PASS, build succeeds. If `pnpm build` fails ONLY on placeholder `.env.local` values, run `npx tsc --noEmit` instead (must be clean) — CI runs the real build. No `pnpm test:rls` (no migration/RLS/storage-policy change).

- [ ] **Step 4: Commit**

```bash
git add components/applications/CandidaturesView.tsx components/ApplicationReadView.tsx
git commit -m "fix(applications): dark readable text in rows and review labels"
```

---

## Completion

After Task 7, the branch is done: use superpowers:finishing-a-development-branch (review → PR; Bjorn merges with a merge commit). No merge-time steps — no migration, no env vars, no edge-function deploy.
