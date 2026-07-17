# Student Application Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gender and pronouns become radio choices, photos of any size are auto-compressed in the browser, and submitted applicants see a read-only recap of their answers via their resume link.

**Architecture:** All changes ride the existing anonymous apply funnel. Field changes are pure catalog edits in `lib/application-form.ts` (answers live in the `applications.data` JSON column — **no migration, no RLS change**). Photo compression is a new client-side helper used by `ApplicationPhotoUpload` before the existing server action. The recap reuses `ApplicationReadView` from the submitted branch of `getApplicationDraft`.

**Tech Stack:** Next.js 14 App Router + Server Actions, Supabase (admin client), vitest + @testing-library/react (jsdom), Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-16-student-application-updates-design.md`

## Global Constraints

- Branch: `feature/student-application-updates` (create from up-to-date `main` at execution start; verify branch before every commit — concurrent sessions exist).
- Package manager: **pnpm**. Gate before declaring any task done: `pnpm test` (targeted file), and before the final push: `pnpm lint && pnpm test && npx tsc --noEmit`.
- `git add` **named files only** — never `-A` or directories (PII risk).
- No database migration, no storage-bucket change, no edit to `lib/supabase/admin` imports.
- Bilingual copy is verbatim from this plan (EN/FR pairs) — do not paraphrase, keep French accents and « » exactly as written.
- Field id `sex` is **kept** (legacy data); new value set `male` / `female` / `other`. Pronoun values: `he_him` / `she_her`. No "other" pronoun option.
- `docs/superpowers/specs/2026-07-16-student-application-updates-design.md` names the submitted-branch function `getResumeState`; the real function is `getApplicationDraft` in `actions/apply.ts` — use the real name.

---

### Task 1: Gender + pronoun choices in the field catalog

**Files:**
- Modify: `lib/application-form.ts` (fields at lines 30–31; validation at lines 121–155)
- Test: `lib/__tests__/application-form.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sex` field is `type: 'radio'` with options `male`/`female`/`other`; new field `gender_other` (`type: 'text'`, `required: false`) directly after `sex`; `pronouns` is `type: 'radio'` with options `he_him`/`she_her`. `missingRequiredApplication(data, opts)` additionally returns `'gender_other'` when `data.sex === 'other'` and `gender_other` is empty. Tasks 2 and 3 rely on these exact ids and values.

- [ ] **Step 1: Write the failing tests**

Append to the `application catalog` describe block in `lib/__tests__/application-form.test.ts`:

```ts
  it('offers gender and pronouns as radio choices', () => {
    const byId = Object.fromEntries(allApplicationFields().map(f => [f.id, f]))
    expect(byId.sex.type).toBe('radio')
    expect(byId.sex.options!.map(o => o.value)).toEqual(['male', 'female', 'other'])
    expect(byId.sex.label.fr).toBe('Genre')
    expect(byId.pronouns.type).toBe('radio')
    expect(byId.pronouns.options!.map(o => o.value)).toEqual(['he_him', 'she_her'])
    expect(byId.gender_other.type).toBe('text')
    expect(byId.gender_other.required).toBeFalsy()
  })
```

Append to the `required catalog` describe block, inside the existing test `leaves parent fields and the conditional separation address out of the flat required list`, extend the id list:

```ts
    for (const id of [...FATHER_IDS, ...MOTHER_IDS, 'separation_housing_address', 'gender_other']) {
```

Append to the `missingRequiredApplication` describe block:

```ts
  it('requires gender_other only when gender is "other"', () => {
    expect(missingRequiredApplication(completeData({ sex: 'other', gender_other: '' }), { hasPhoto: true }))
      .toContain('gender_other')
    expect(missingRequiredApplication(completeData({ sex: 'other', gender_other: 'male → female' }), { hasPhoto: true }))
      .not.toContain('gender_other')
    expect(missingRequiredApplication(completeData({ sex: 'female', gender_other: '' }), { hasPhoto: true }))
      .not.toContain('gender_other')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/__tests__/application-form.test.ts`
Expected: FAIL — `byId.sex.type` is `'text'`, `byId.gender_other` is undefined.

- [ ] **Step 3: Implement the catalog change**

In `lib/application-form.ts`, replace lines 30–31:

```ts
      { id: 'sex', type: 'text', label: L('Sex', 'Sexe'), required: true },
      { id: 'pronouns', type: 'text', label: L('Pronouns', 'Pronoms'), required: true },
```

with:

```ts
      {
        id: 'sex', type: 'radio', label: L('Gender', 'Genre'), required: true,
        options: [
          { value: 'male', label: L('Male', 'Garçon') },
          { value: 'female', label: L('Female', 'Fille') },
          { value: 'other', label: L('Other', 'Autre') },
        ],
      },
      { id: 'gender_other', type: 'text', label: L('Please specify (e.g. male → female)', 'Précisez (ex. garçon → fille)') },
      {
        id: 'pronouns', type: 'radio', label: L('Pronouns', 'Pronoms'), required: true,
        options: [
          { value: 'he_him', label: L('He/him', 'Il') },
          { value: 'she_her', label: L('She/her', 'Elle') },
        ],
      },
```

In `missingRequiredApplication`, after the `separation_housing_address` block (lines 144–148), add:

```ts
  // The gender "specify" field only applies when gender is "other"; the field
  // is hidden from the form otherwise.
  if ((data.sex ?? '').trim() === 'other' && empty('gender_other')) {
    missing.push('gender_other')
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/__tests__/application-form.test.ts`
Expected: PASS (all, including untouched parent-group cases — `completeData()` fills every field so the new conditional stays quiet there).

Also run: `pnpm test actions/__tests__/applications.test.ts`
Expected: PASS (`completeAppData()` fills `gender_other` like every other field).

- [ ] **Step 5: Commit**

```bash
git add lib/application-form.ts lib/__tests__/application-form.test.ts
git commit -m "feat(apply): gender and pronouns become radio choices"
```

---

### Task 2: Conditional "Précisez" field in the form UI

**Files:**
- Modify: `components/ApplicationForm.tsx` (lines 118, 163–174)
- Test: `components/__tests__/ApplicationForm.test.tsx`

**Interfaces:**
- Consumes: Task 1's `gender_other` field and `sex === 'other'` convention.
- Produces: the form hides `gender_other` unless the `Autre` radio is selected, and marks it with the required asterisk when shown (same treatment as `separation_housing_address`).

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/ApplicationForm.test.tsx`:

```tsx
  it('hides the gender specify field until "Autre" is selected', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByText(/précisez/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Autre' }))
    expect(screen.getByText(/précisez/i)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Fille' }))
    expect(screen.queryByText(/précisez/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/__tests__/ApplicationForm.test.tsx`
Expected: FAIL — `Précisez` is always rendered (field exists in the catalog after Task 1).

- [ ] **Step 3: Implement the conditional rendering**

In `components/ApplicationForm.tsx`:

After line 118 (`const showSeparation = …`), add:

```tsx
  const showGenderOther = data.sex === 'other'
```

In the field loop (line 164), extend the skip:

```tsx
                if (f.id === 'separation_housing_address' && !showSeparation) return null
                if (f.id === 'gender_other' && !showGenderOther) return null
```

On the asterisk condition (line 169), include the new conditional field:

```tsx
                      {(f.required || f.id === 'separation_housing_address' || f.id === 'gender_other') && <span className="ml-1 text-[#C0392B]">*</span>}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/__tests__/ApplicationForm.test.tsx`
Expected: PASS (all — the existing separation test still passes; radio names `Autre`, `Fille` are unique to the gender field).

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationForm.tsx components/__tests__/ApplicationForm.test.tsx
git commit -m "feat(apply): conditional gender specify field in the form"
```

---

### Task 3: Read view maps stored values to labels

**Files:**
- Modify: `components/ApplicationReadView.tsx`
- Create: `components/__tests__/ApplicationReadView.test.tsx`

**Interfaces:**
- Consumes: Task 1's option sets (`sex`, `pronouns`, plus existing `family_status`).
- Produces: `ApplicationReadView` renders option labels for `radio` fields (raw-string fallback for legacy free-text answers) and Yes/No — Oui/Non for `yesno` fields. Props unchanged (`data`, `photoUrl`, `lang`) — the organizer usage in `components/applications/ApplicationDetail.tsx:44` keeps working untouched. Task 6 renders this component for applicants.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ApplicationReadView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationReadView } from '@/components/ApplicationReadView'

describe('ApplicationReadView', () => {
  it('maps radio values to their labels in the requested language', () => {
    render(<ApplicationReadView data={{ family_status: 'step_family', sex: 'female' }} photoUrl={null} lang="fr" />)
    expect(screen.getByText('Famille recomposée')).toBeInTheDocument()
    expect(screen.getByText('Fille')).toBeInTheDocument()
  })

  it('falls back to the raw string for legacy free-text answers', () => {
    render(<ApplicationReadView data={{ sex: 'F', pronouns: 'she' }} photoUrl={null} lang="fr" />)
    expect(screen.getByText('F')).toBeInTheDocument()
    expect(screen.getByText('she')).toBeInTheDocument()
  })

  it('renders yes/no answers as Oui/Non in French and Yes/No in English', () => {
    const { unmount } = render(<ApplicationReadView data={{ smoking_home: 'yes', own_room: 'no' }} photoUrl={null} lang="fr" />)
    expect(screen.getByText('Oui')).toBeInTheDocument()
    expect(screen.getByText('Non')).toBeInTheDocument()
    unmount()
    render(<ApplicationReadView data={{ smoking_home: 'yes' }} photoUrl={null} lang="en" />)
    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('renders an em dash for missing answers', () => {
    render(<ApplicationReadView data={{}} photoUrl={null} lang="fr" />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/__tests__/ApplicationReadView.test.tsx`
Expected: FAIL — raw values `step_family` / `yes` are rendered, labels are not found.

- [ ] **Step 3: Implement the mapping**

In `components/ApplicationReadView.tsx`, change the import and add a helper above the component:

```tsx
import { APPLICATION_SECTIONS, type AppField } from '@/lib/application-form'

// Stored tokens → display labels. Radio answers fall back to the raw string so
// legacy free-text values (pre-choice sex/pronoun answers) keep rendering.
function displayValue(f: AppField, raw: string | undefined, lang: 'en' | 'fr'): string {
  const v = raw?.trim() ?? ''
  if (!v) return '—'
  if (f.type === 'radio') return f.options?.find(o => o.value === v)?.label[lang] ?? v
  if (f.type === 'yesno') {
    if (v === 'yes') return lang === 'fr' ? 'Oui' : 'Yes'
    if (v === 'no') return lang === 'fr' ? 'Non' : 'No'
  }
  return v
}
```

and replace the `<dd>` line:

```tsx
                <dd className="text-sm text-foreground whitespace-pre-wrap">{data[f.id]?.trim() || '—'}</dd>
```

with:

```tsx
                <dd className="text-sm text-foreground whitespace-pre-wrap">{displayValue(f, data[f.id], lang)}</dd>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/__tests__/ApplicationReadView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationReadView.tsx components/__tests__/ApplicationReadView.test.tsx
git commit -m "feat(apply): read view renders option labels instead of stored tokens"
```

---

### Task 4: Browser image-compression helper

**Files:**
- Create: `lib/image-compression.ts`
- Create: `lib/__tests__/image-compression.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `targetDimensions(width: number, height: number, maxEdge?: number): { width: number; height: number }` (pure, tested) and `compressImage(file: File): Promise<File>` (DOM-dependent; throws `Error('image-too-large')` when it can neither re-encode nor fall back). Task 5 calls `compressImage` and branches on that exact error message.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/image-compression.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { targetDimensions, MAX_EDGE_PX } from '../image-compression'

describe('targetDimensions', () => {
  it('leaves small images untouched', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 })
    expect(targetDimensions(MAX_EDGE_PX, MAX_EDGE_PX)).toEqual({ width: MAX_EDGE_PX, height: MAX_EDGE_PX })
  })
  it('scales a landscape image down to the max edge, preserving ratio', () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: 2000, height: 1500 })
  })
  it('scales a portrait image down to the max edge, preserving ratio', () => {
    expect(targetDimensions(3000, 4000)).toEqual({ width: 1500, height: 2000 })
  })
  it('rounds to whole pixels', () => {
    expect(targetDimensions(4032, 3024)).toEqual({ width: 2000, height: 1500 })
    const r = targetDimensions(3333, 2222)
    expect(Number.isInteger(r.width) && Number.isInteger(r.height)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/__tests__/image-compression.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `lib/image-compression.ts`:

```ts
// Client-side photo downscaling for the application funnel. The photo travels
// through a server action, so the encoded output must stay well under the
// 4 MB server-action body limit (next.config.mjs) — a ≤2000 px JPEG at 0.85
// is typically 300 KB–1 MB regardless of the input size.

export const MAX_EDGE_PX = 2000
export const JPEG_QUALITY = 0.85
// When the browser cannot decode/re-encode the file, the original may pass
// through as-is only below this — it still has to fit the request body.
export const FALLBACK_MAX_BYTES = 3 * 1024 * 1024

export function targetDimensions(
  width: number, height: number, maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  if (width <= maxEdge && height <= maxEdge) return { width, height }
  const scale = maxEdge / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export async function compressImage(file: File): Promise<File> {
  try {
    // imageOrientation: 'from-image' bakes EXIF rotation into the pixels.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = targetDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unsupported')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('encode failed')
    const base = file.name.replace(/\.[^.]*$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    if (file.size <= FALLBACK_MAX_BYTES) return file
    throw new Error('image-too-large')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/__tests__/image-compression.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/image-compression.ts lib/__tests__/image-compression.test.ts
git commit -m "feat(apply): browser image-compression helper for applicant photos"
```

---

### Task 5: Photo card compresses, accepts any size, image-only accept list

**Files:**
- Modify: `components/ApplicationPhotoUpload.tsx`
- Modify: `lib/uploads.ts`
- Modify: `next.config.mjs`
- Test: `components/__tests__/ApplicationPhotoUpload.test.tsx`

**Interfaces:**
- Consumes: Task 4's `compressImage` and its `'image-too-large'` error message.
- Produces: new export `ALLOWED_PHOTO_ACCEPT` in `lib/uploads.ts` (`'image/jpeg,image/png,image/webp'` — no PDF); the photo card uploads the **compressed** file through the unchanged `uploadApplicationPhoto` server action. `MAX_UPLOAD_BYTES` and `validateUploadFile` stay untouched for document uploads (and as the server action's backstop).

- [ ] **Step 1: Write the failing tests**

In `components/__tests__/ApplicationPhotoUpload.test.tsx`, add the compression mock below the existing `@/actions/apply` mock (compression is DOM-heavy; jsdom has no `createImageBitmap`):

```tsx
const compressMock = vi.fn(async (f: File) => f)
vi.mock('@/lib/image-compression', () => ({
  compressImage: (f: File) => compressMock(f),
}))
```

Append inside the `describe` block:

```tsx
  it('compresses the picked file before uploading it', async () => {
    const small = new File(['tiny'], 'me.png', { type: 'image/png' })
    compressMock.mockResolvedValueOnce(small)
    renderCard()
    pickFile()
    expect(await screen.findByRole('img')).toBeInTheDocument()
    expect(compressMock).toHaveBeenCalledTimes(1)
    const fd = vi.mocked(uploadApplicationPhoto).mock.calls[0][1] as FormData
    expect(fd.get('photo')).toBe(small)
  })

  it('shows the dedicated message when the image cannot be processed', async () => {
    compressMock.mockRejectedValueOnce(new Error('image-too-large'))
    renderCard()
    pickFile()
    expect(await screen.findByText(/ne peut pas être traitée/i)).toBeInTheDocument()
    expect(uploadApplicationPhoto).not.toHaveBeenCalled()
  })

  it('advertises automatic resizing instead of a size cap', () => {
    renderCard()
    expect(screen.getByText(/redimensionnée automatiquement/i)).toBeInTheDocument()
    expect(screen.queryByText(/10 Mo max/i)).not.toBeInTheDocument()
  })

  it('offers only image types in the file picker (no PDF)', () => {
    renderCard()
    expect(screen.getByLabelText('Photo récente')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test components/__tests__/ApplicationPhotoUpload.test.tsx`
Expected: new tests FAIL (no compression call, old hint text, accept includes `application/pdf`); existing tests still pass.

- [ ] **Step 3: Implement**

In `lib/uploads.ts`, append after `APPLICATION_PHOTO_BUCKET`:

```ts
// Photo picker accept list — images only. ALLOWED_UPLOAD_ACCEPT above is for
// document slots and includes PDF, which is wrong for a portrait photo.
export const ALLOWED_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
```

In `components/ApplicationPhotoUpload.tsx`:

Replace the imports of `ALLOWED_UPLOAD_ACCEPT` and add the compressor:

```tsx
import { ALLOWED_PHOTO_ACCEPT } from '@/lib/uploads'
import { compressImage } from '@/lib/image-compression'
```

Replace the `T` copy table (both `hint` values change, one new key `tooLarge`):

```tsx
const T = {
  en: { label: "Recent photo", choose: "Choose a photo", replace: "Replace the photo", hint: "Any photo — it will be resized automatically.", uploading: "Uploading…", failed: "Upload failed. Please try again.", tooLarge: "This image can't be processed. Try a smaller photo (JPEG or PNG).", required: "A photo is required to submit your application." },
  fr: { label: "Photo récente", choose: "Choisir une photo", replace: "Remplacer la photo", hint: "N’importe quelle photo — elle sera redimensionnée automatiquement.", uploading: "Envoi…", failed: "L’envoi a échoué. Réessaie.", tooLarge: "Cette image ne peut pas être traitée. Essaie une photo plus petite (JPEG ou PNG).", required: "Une photo est requise pour envoyer ta candidature." },
}
```

Replace the body of `onFile` with:

```tsx
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.set('photo', compressed)
      await uploadApplicationPhoto(token, fd)
      setPreview(URL.createObjectURL(compressed))
      onUploaded()
    } catch (err: unknown) {
      setError(err instanceof Error && err.message === 'image-too-large' ? t.tooLarge : t.failed)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
```

On the hidden input (line 63), swap the accept list:

```tsx
        <input ref={inputRef} type="file" accept={ALLOWED_PHOTO_ACCEPT} aria-label={t.label} onChange={onFile} className="hidden" />
```

In `next.config.mjs`, add to the config object (sibling of `experimental.staleTimes`):

```js
  experimental: {
    // Client router cache: dynamic pages stay reusable for 3 min after a
    // visit; the rail's prefetch={true} entries get the 5-min static window.
    // Own mutations stay fresh via revalidatePath in server actions.
    staleTimes: { dynamic: 180 },
    // Applicant photos travel through a server action; compressed output is
    // ≤ ~1 MB, this is headroom (Vercel caps request bodies at ~4.5 MB).
    serverActions: { bodySizeLimit: '4mb' },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test components/__tests__/ApplicationPhotoUpload.test.tsx`
Expected: PASS (all 10 — the pre-existing upload/failure tests run through the pass-through compression mock).

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationPhotoUpload.tsx components/__tests__/ApplicationPhotoUpload.test.tsx lib/uploads.ts next.config.mjs
git commit -m "feat(apply): auto-compress applicant photos in the browser"
```

---

### Task 6: Read-only recap on the resume link after submission

**Files:**
- Modify: `actions/apply.ts` (`getApplicationDraft`, lines 161–194)
- Modify: `app/apply/resume/[token]/page.tsx`
- Test: `actions/__tests__/applications.test.ts` (`getApplicationDraft` describe, lines 276–289)

**Interfaces:**
- Consumes: Task 3's `ApplicationReadView` (props `data`, `photoUrl`, `lang`).
- Produces: `getApplicationDraft`'s submitted branch returns `{ expired: false, submitted: true, exchangeName, data, language, photoUrl, submittedAt }`. Expiry semantics unchanged: the expired branch (checked first) still returns the bare marker with **no PII**.

- [ ] **Step 1: Update/write the failing tests**

In `actions/__tests__/applications.test.ts`, replace the existing test `returns a submitted marker (no PII) once the application is no longer a draft` (lines 283–288) with:

```ts
  it('returns the answers read-only once the application is submitted (recap)', async () => {
    scenario.application = { status: 'submitted', data: { first_name: 'A' }, language: 'fr', photo_path: 'app-1/photo.jpg', exchange_id: 'ex-1', resume_token_expires_at: null, submitted_at: '2026-07-01T10:00:00Z' }
    const res = await getApplicationDraft('tok') as any
    expect(res.submitted).toBe(true)
    expect(res.data).toEqual({ first_name: 'A' })
    expect(res.language).toBe('fr')
    expect(res.photoUrl).toContain('app-1/photo.jpg')
    expect(res.submittedAt).toBe('2026-07-01T10:00:00Z')
  })
  it('still hides PII behind an expired link even when submitted', async () => {
    scenario.application = { status: 'submitted', data: { first_name: 'A' }, language: 'fr', photo_path: null, exchange_id: 'ex-1', resume_token_expires_at: PAST }
    const res = await getApplicationDraft('tok') as any
    expect(res.expired).toBe(true)
    expect(res.data).toBeUndefined()
    expect(res.photoUrl).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: FAIL — recap test gets `res.data` undefined (submitted branch returns the bare marker today). The expired test passes already.

- [ ] **Step 3: Implement the action change**

In `actions/apply.ts`, `getApplicationDraft`:

Add `submitted_at` to the select (line 165):

```ts
    .select('status, data, language, photo_path, submitted_at, resume_token_expires_at, exchanges(name, apply_slug)')
```

Hoist the signed-URL block above the submitted branch and return the recap. Replace lines 174–194 (from the `// Once submitted…` comment through the final `return`) with:

```ts
  // Signed URL for the applicant photo (the application-photos bucket is
  // private; 1 h outlives any editing or reading session). Serves both a
  // returning draft and the read-only recap below.
  let photoUrl: string | null = null
  if (app.photo_path) {
    const { data: signed } = await admin.storage.from(APPLICATION_PHOTO_BUCKET)
      .createSignedUrl(app.photo_path, 3600)
    photoUrl = signed?.signedUrl ?? null
  }
  // Once submitted (or further along) the application is final — the resume
  // link can no longer reopen it, but (while the token lives) it shows a
  // read-only recap of what was sent.
  if (app.status !== 'draft') {
    return {
      expired: false as const, submitted: true as const, exchangeName,
      data: app.data ?? {}, language: app.language, photoUrl,
      submittedAt: app.submitted_at,
    }
  }
  return {
    expired: false as const, submitted: false as const,
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, photoUrl, exchangeName,
    slug: app.exchanges?.apply_slug ?? '',
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the recap on the resume page**

In `app/apply/resume/[token]/page.tsx`, add the import:

```tsx
import { ApplicationReadView } from '@/components/ApplicationReadView'
```

Replace the `if (draft.submitted) return (…)` block with:

```tsx
  if (draft.submitted) {
    const lang = draft.language === 'fr' ? 'fr' : 'en'
    const t = lang === 'fr'
      ? { sent: 'Candidature envoyée', on: 'le', note: 'Elle ne peut plus être modifiée — voici un récapitulatif de tes réponses. L’organisateur reviendra vers toi.' }
      : { sent: 'Application submitted', on: 'on', note: 'It can no longer be edited — here is a recap of your answers. The organizer will get back to you.' }
    const date = draft.submittedAt
      ? new Date(draft.submittedAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null
    return (
      <main className="mx-auto max-w-[720px] px-4 py-16">
        <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
        <p className="text-[15px] text-[#0F7A3D]">{t.sent}{date ? ` ${t.on} ${date}` : ''}. {t.note}</p>
        <div className="mt-8">
          <ApplicationReadView data={(draft.data ?? {}) as Record<string, string>} photoUrl={draft.photoUrl} lang={lang} />
        </div>
      </main>
    )
  }
```

- [ ] **Step 6: Full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: lint clean, full suite green, no type errors (the `draft.submitted` narrowing gives the page `data` / `language` / `photoUrl` / `submittedAt`).

- [ ] **Step 7: Commit**

```bash
git add actions/apply.ts app/apply/resume/[token]/page.tsx actions/__tests__/applications.test.ts
git commit -m "feat(apply): read-only recap on the resume link after submission"
```

---

## Verification (end of plan)

1. `pnpm lint && pnpm test && npx tsc --noEmit` — all green (this is the CLAUDE.md gate; `pnpm build` fails locally on placeholder envs, `tsc --noEmit` replaces it).
2. No `pnpm test:rls` needed — no migration, no RLS/storage change (verify `git diff main --stat` touches no `supabase/` file).
3. Manual spot-check on a preview deploy (staging-backed): start an application, pick a large (>10 MB) phone photo — it uploads within seconds and previews; complete + submit with gender **Autre** (specify required) — then reopen the resume link: read-only recap with labels (`Fille`/`Oui`), not tokens.
4. Hand off via superpowers:finishing-a-development-branch (PR; merge stays with Bjorn).
