# Élèves Tab Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each student's application photo on the Élèves tab (list rows + detail panel), falling back to the existing colored-initials circle when there is no photo.

**Architecture:** Extract the batched signed-URL logic from `actions/applications-review.ts` into a new one-purpose helper `lib/application-photos.ts` (the only new service-role allowlist entry — and `actions/applications-review.ts` comes OFF the allowlist because photo signing was its only admin use). `getStudentsDirectory` then selects `photo_path` on its existing applications join, signs the paths in one batch, and ships `photoUrl` through `StudentVM` to the two avatar render sites.

**Tech Stack:** Next.js server actions, Supabase Storage signed URLs, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-18-eleves-tab-photos-design.md`

## Global Constraints

- Package manager is **pnpm**. Run tests as `pnpm vitest run <path>` per task; full gate is `pnpm lint` + `pnpm test` + `npx tsc --noEmit` (local `pnpm build` fails on placeholder env — CI runs the real build).
- **Execute in an isolated worktree** (branch `feature/eleves-photos`). This also avoids the known false-failure where the main checkout's `pnpm test` sweeps `.claude/worktrees/*` test copies.
- No migration, no RLS/policy/bucket change → `pnpm test:rls` NOT required.
- No new user-facing strings → no i18n catalog changes. Photos are decorative (`alt=""`) because the student's name always renders beside them.
- `lib/supabase/admin` imports are gated by `lib/supabase/__tests__/admin-allowlist.test.ts` (exact-equality list). This plan swaps one entry: **remove** `actions/applications-review.ts`, **add** `lib/application-photos.ts`. Say why in the Task 1 commit message.
- Never log student PII (no emails/names/photo paths in console output).
- Signed URLs use the existing convention: bucket `APPLICATION_PHOTO_BUCKET` (`lib/uploads.ts`), 3600 s expiry, one batched `createSignedUrls` call.

---

### Task 1: `signApplicationPhotoUrls` helper + allowlist swap + refactor `applications-review.ts`

**Files:**
- Create: `lib/application-photos.ts`
- Create: `lib/__tests__/application-photos.test.ts`
- Modify: `actions/applications-review.ts` (imports at lines 2, 7; the two signing blocks at lines 83–96 and 108–116)
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts` (ALLOWLIST array, lines 10–26)

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`, `APPLICATION_PHOTO_BUCKET` from `@/lib/uploads`.
- Produces: `signApplicationPhotoUrls(paths: string[]): Promise<Map<string, string>>` — batch-signs application photo storage paths (3600 s), returns path → signed URL; missing/failed entries are simply absent from the map; empty input short-circuits without touching storage. Tasks 3 uses this exact signature.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/application-photos.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createSignedUrls = vi.fn(async (paths: string[], _expiresIn: number) => ({
  data: paths.map(p => ({ path: p, signedUrl: `https://signed.example/${p}`, error: null })),
  error: null,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
}))

import { signApplicationPhotoUrls } from '@/lib/application-photos'

beforeEach(() => createSignedUrls.mockClear())

describe('signApplicationPhotoUrls', () => {
  it('returns an empty map without touching storage when there are no paths', async () => {
    const map = await signApplicationPhotoUrls([])
    expect(map.size).toBe(0)
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('signs all paths in ONE batched call (3600 s) and maps path → signed URL', async () => {
    const map = await signApplicationPhotoUrls(['app-1/photo.jpg', 'app-2/photo.jpg'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['app-1/photo.jpg', 'app-2/photo.jpg'], 3600)
    expect(map.get('app-1/photo.jpg')).toBe('https://signed.example/app-1/photo.jpg')
    expect(map.get('app-2/photo.jpg')).toBe('https://signed.example/app-2/photo.jpg')
  })

  it('omits entries whose signing failed instead of mapping null', async () => {
    createSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'app-1/photo.jpg', signedUrl: null, error: 'Object not found' }],
      error: null,
    })
    const map = await signApplicationPhotoUrls(['app-1/photo.jpg'])
    expect(map.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/__tests__/application-photos.test.ts`
Expected: FAIL — cannot resolve `@/lib/application-photos`.

- [ ] **Step 3: Write the helper**

Create `lib/application-photos.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'

// Batch-sign application photo storage paths (1 h expiry) with the
// service-role client: the application-photos bucket is private with no
// per-user storage policy, so every CALLER must have verified organizer
// scope on the rows before handing paths in. Returns path → signed URL;
// failed/missing entries are simply absent.
export async function signApplicationPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const urlByPath = new Map<string, string>()
  if (paths.length === 0) return urlByPath
  const admin = createAdminClient()
  const { data } = await admin.storage
    .from(APPLICATION_PHOTO_BUCKET)
    .createSignedUrls(paths, 3600)
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
  }
  return urlByPath
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/__tests__/application-photos.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Refactor `actions/applications-review.ts` onto the helper**

Both admin uses in this file are photo signing (verified: lines 89–92 and 112–115 are the only `createAdminClient` call sites). Replace them and drop the now-unused imports.

Delete line 2 (`import { createAdminClient } from '@/lib/supabase/admin'`) and line 7 (`import { APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'`), and add:

```ts
import { signApplicationPhotoUrls } from '@/lib/application-photos'
```

In `listApplications`, replace this block (lines 83–96):

```ts
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
```

with:

```ts
  // Organizer authorization verified above — signApplicationPhotoUrls uses the
  // service-role client (the bucket has no per-user storage policy).
  const paths = rows.map(r => r.photo_path).filter((p): p is string => p !== null)
  const urlByPath = await signApplicationPhotoUrls(paths)
```

In `getApplicationForReview`, replace this block (lines 108–116):

```ts
  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above; use admin to sign the URL
    // (the application-photos bucket has no per-user storage policy).
    const admin = createAdminClient()
    const { data } = await admin.storage.from(APPLICATION_PHOTO_BUCKET)
      .createSignedUrl(application.photo_path, 3600)
    photoUrl = data?.signedUrl ?? null
  }
```

with:

```ts
  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above (assertOrganizerOwnsApplication).
    const urls = await signApplicationPhotoUrls([application.photo_path])
    photoUrl = urls.get(application.photo_path) ?? null
  }
```

- [ ] **Step 6: Swap the allowlist entry**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, edit the `ALLOWLIST` array: remove the line `'actions/applications-review.ts',` and add `'lib/application-photos.ts',` (keep the array alphabetically ordered; it is `.sort()`ed anyway):

```ts
const ALLOWLIST = [
  'actions/apply.ts',
  'actions/invitations.ts',
  'actions/exchanges.ts',
  'actions/join.ts',
  'actions/settings.ts',
  'app/api/stripe/webhook/route.ts',
  'app/auth/callback/route.ts',
  'app/billing/checkout/route.ts',
  'app/billing/portal/route.ts',
  'lib/application-photos.ts',
  'lib/audit.ts',
  'lib/auth/provision.ts',
  'lib/email-log.ts',
  'lib/error-reporting.ts',
  'lib/rate-limit.ts',
].sort()
```

- [ ] **Step 7: Run the affected suites**

Run: `pnpm vitest run lib/__tests__/application-photos.test.ts lib/supabase/__tests__/admin-allowlist.test.ts actions/__tests__/list-applications.test.ts actions/__tests__/applications.test.ts`
Expected: all pass. (`list-applications.test.ts` mocks `@/lib/supabase/admin` at the module level, so the helper picks up the same mock; `applications.test.ts` covers `actions/apply.ts`, untouched.)

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/application-photos.ts lib/__tests__/application-photos.test.ts actions/applications-review.ts lib/supabase/__tests__/admin-allowlist.test.ts
git commit -m "refactor: extract signApplicationPhotoUrls; applications-review off the admin allowlist

Allowlist swap: photo signing was applications-review.ts's only service-role
use, so the one-purpose helper lib/application-photos.ts replaces it on the
allowlist (net-smaller admin surface, reused by the Élèves directory next)."
```

---

### Task 2: `StudentVM.photoUrl` passthrough in the directory view-model

**Files:**
- Modify: `lib/students/directory.ts` (StudentVM type at lines 34–52, `buildStudentVM` input type at lines 103–110, return object at lines 170–188)
- Modify: `lib/students/__tests__/directory.test.ts` (add one test)
- Modify: `components/students/__tests__/StudentsView.test.tsx` (fixture `base` at lines 16–32 needs the new required field)

**Interfaces:**
- Consumes: nothing new.
- Produces: `StudentVM.photoUrl: string | null` (required on the VM); `buildStudentVM` input `application` gains optional `photoUrl?: string | null` (absent/`null` application → VM `photoUrl` is `null`). Tasks 3 and 4 rely on exactly these names.

- [ ] **Step 1: Write the failing test**

In `lib/students/__tests__/directory.test.ts`, inside the existing `describe('buildStudentVM', …)` block, add:

```ts
  it('carries the application photoUrl through; null without a photo or application', () => {
    const cellMap: CellMap = { 's1:t1': { assignmentId: 'a1', status: 'approved' } }
    const withPhoto = buildStudentVM({
      student,
      application: { ...application, photoUrl: 'https://signed.example/app1/photo.jpg' },
      templates, cellMap, avatarIndex: 0, today,
    }, t)
    expect(withPhoto.photoUrl).toBe('https://signed.example/app1/photo.jpg')
    expect(vm(cellMap).photoUrl).toBeNull()
    expect(vm(cellMap, null).photoUrl).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/students/__tests__/directory.test.ts`
Expected: the new test FAILS (`photoUrl` is `undefined`, not the URL / not `null`). Pre-existing tests pass.

- [ ] **Step 3: Implement the passthrough**

In `lib/students/directory.ts`:

Add to `StudentVM` (after `avatarBg: string`, line 39):

```ts
  photoUrl: string | null
```

Change the `application` input type in `buildStudentVM` (line 105) from:

```ts
  application: { id: string; data: Record<string, string> } | null
```

to:

```ts
  application: { id: string; data: Record<string, string>; photoUrl?: string | null } | null
```

Add to the return object (after `avatarBg: AVATAR_BG[avatarIndex % AVATAR_BG.length],` line 175):

```ts
    photoUrl: application?.photoUrl ?? null,
```

- [ ] **Step 4: Fix the component-test fixture (required VM field)**

In `components/students/__tests__/StudentsView.test.tsx`, add `photoUrl: null` to the `base` fixture — in line 17, after `avatarBg: '#2456E6',`:

```ts
  id: 's1', name: 'Camille Laurent', firstName: 'Camille', initials: 'CL', avatarBg: '#2456E6', photoUrl: null,
```

(`second` spreads `base`, so it inherits the field.)

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run lib/students/__tests__/directory.test.ts components/students/__tests__/StudentsView.test.tsx`
Expected: all pass.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/students/directory.ts lib/students/__tests__/directory.test.ts components/students/__tests__/StudentsView.test.tsx
git commit -m "feat: StudentVM carries the application photoUrl"
```

---

### Task 3: `getStudentsDirectory` selects and signs the photos

**Files:**
- Modify: `actions/students.ts` (imports at lines 1–13; applications query at lines 67–72; `appByStudent` map at lines 79–82)

**Interfaces:**
- Consumes: `signApplicationPhotoUrls(paths: string[]): Promise<Map<string, string>>` from Task 1; the `photoUrl?: string | null` slot on `buildStudentVM`'s `application` input from Task 2.
- Produces: `getStudentsDirectory` now returns VMs whose `photoUrl` is the signed URL of the student's application photo (or `null`). No signature change.

- [ ] **Step 1: Wire the action**

In `actions/students.ts`, add to the imports:

```ts
import { signApplicationPhotoUrls } from '@/lib/application-photos'
```

In the `Promise.all` inside `getStudentsDirectory`, change the applications select (line 69) from:

```ts
      .select('id, enrolled_user_id, data')
```

to:

```ts
      .select('id, enrolled_user_id, data, photo_path')
```

Replace the `appByStudent` block (lines 79–82):

```ts
  const appByStudent = new Map<string, { id: string; data: Record<string, string> }>()
  for (const a of applications) {
    if (a.enrolled_user_id) appByStudent.set(a.enrolled_user_id, { id: a.id, data: a.data ?? {} })
  }
```

with:

```ts
  // Organizer scope verified above (assertOrganizerInExchange) — the helper
  // signs with the service-role client, one batched call for the page.
  const photoPaths = applications
    .map(a => a.photo_path)
    .filter((p): p is string => p !== null)
  const photoUrlByPath = await signApplicationPhotoUrls(photoPaths)

  const appByStudent = new Map<string, { id: string; data: Record<string, string>; photoUrl: string | null }>()
  for (const a of applications) {
    if (a.enrolled_user_id) {
      appByStudent.set(a.enrolled_user_id, {
        id: a.id,
        data: a.data ?? {},
        photoUrl: a.photo_path ? photoUrlByPath.get(a.photo_path) ?? null : null,
      })
    }
  }
```

(`buildStudentVM` already receives `appByStudent.get(s.id) ?? null` a few lines below — no further change needed.)

- [ ] **Step 2: Typecheck + regression run**

Run: `npx tsc --noEmit`
Expected: clean (proves the select's row type carries `photo_path` and the map matches Task 2's input type).

Run: `pnpm vitest run lib/students/__tests__/directory.test.ts lib/__tests__/application-photos.test.ts`
Expected: all pass. (No dedicated `getStudentsDirectory` unit test exists; the helper and VM tests cover both sides of this seam.)

- [ ] **Step 3: Commit**

```bash
git add actions/students.ts
git commit -m "feat: Élèves directory signs and ships application photo URLs"
```

---

### Task 4: Render the photo in the list rows and the detail avatar

**Files:**
- Modify: `components/students/StudentsView.tsx` (row avatar, lines 65–70)
- Modify: `components/students/StudentDetail.tsx` (header avatar, lines 35–40)
- Test: `components/students/__tests__/StudentsView.test.tsx` (one new test)

**Interfaces:**
- Consumes: `StudentVM.photoUrl: string | null` from Task 2.
- Produces: UI only — nothing downstream.

- [ ] **Step 1: Write the failing test**

In `components/students/__tests__/StudentsView.test.tsx`, add at the end of the `describe('StudentsView', …)` block:

```tsx
  it('renders the application photo in the row and the detail avatar; initials fall back', () => {
    const withPhoto = { ...base, photoUrl: 'https://signed.example/app1/photo.jpg' }
    const { container } = renderWithIntl(<StudentsView exchangeId="ex1" students={[withPhoto, second]} />)
    // First (selected) student → photo twice: list row + detail header. alt=""
    // (decorative — the name renders beside it), so query by src, not role.
    expect(container.querySelectorAll('img[src="https://signed.example/app1/photo.jpg"]')).toHaveLength(2)
    // Second student has no photo → initials circle remains.
    expect(screen.getByText('YB')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/students/__tests__/StudentsView.test.tsx`
Expected: the new test FAILS — 0 `<img>` elements found. Pre-existing tests pass.

- [ ] **Step 3: Implement both avatars**

In `components/students/StudentsView.tsx`, replace the row avatar (lines 65–70):

```tsx
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: s.avatarBg }}
                  >
                    {s.initials}
                  </span>
```

with:

```tsx
                  {s.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photoUrl} alt="" className="h-9 w-9 flex-none rounded-full border object-cover" />
                  ) : (
                    <span
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: s.avatarBg }}
                    >
                      {s.initials}
                    </span>
                  )}
```

In `components/students/StudentDetail.tsx`, replace the header avatar (lines 35–40):

```tsx
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ background: vm.avatarBg }}
          >
            {vm.initials}
          </span>
```

with:

```tsx
          {vm.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vm.photoUrl} alt="" className="h-14 w-14 flex-none rounded-full border object-cover" />
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
              style={{ background: vm.avatarBg }}
            >
              {vm.initials}
            </span>
          )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/students/__tests__/StudentsView.test.tsx`
Expected: all pass (including the 8 pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add components/students/StudentsView.tsx components/students/StudentDetail.tsx components/students/__tests__/StudentsView.test.tsx
git commit -m "feat: render application photos on the Élèves tab (rows + detail)"
```

---

### Task 5: Full gate

**Files:** none new — verification only.

- [ ] **Step 1: Run the full verification gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
```

Expected: lint clean, all vitest suites pass, tsc clean. (`pnpm test:rls` not required — no migration/RLS/bucket change. Local `pnpm build` is known-broken on placeholder env; CI runs the real build on the PR.)

- [ ] **Step 2: Commit any stragglers and hand off**

Nothing should be uncommitted; `git status` must be clean. Then follow superpowers:finishing-a-development-branch (PR against `main`; merge stays with Bjorn).
