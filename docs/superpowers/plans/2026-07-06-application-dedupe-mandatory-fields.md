# Application Dedupe, Mandatory Fields & Photo Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-06-application-dedupe-mandatory-fields-design.md`

**Goal:** One email = one application per exchange (DB-backed, structured results), every application field mandatory to submit (with the at-least-one-complete-parent rule and a conditional separation-address field), and a styled photo-upload card that is required to submit.

**Architecture:** `startApplication` gains a pre-insert lookup on `(exchange_id, email)` plus a unique-index backstop whose `23505` maps to the same structured `{ existing }` result; the mandatory-field policy lives entirely in `lib/application-form.ts` (`missingRequiredApplication`) and is enforced client-side (highlight + submit gate) and server-side (`submitApplication`, which also checks `photo_path`); the bare photo `<input type="file">` is replaced by a new `ApplicationPhotoUpload` client component.

**Tech Stack:** Next.js 14 App Router Server Actions, Supabase (service-role admin client, Storage signed URLs, SQL migration), Resend (existing `sendApplicationResumeEmail`), Tailwind + shadcn/ui, Vitest + Testing Library.

## Global Constraints

- **Branch:** work directly on `feature/application-resume-flow` (this stacks on the unmerged resume-flow work). Never push to `main` in this plan.
- **Package manager is pnpm.** Run a single test file with `pnpm vitest run <path>`; full suite `pnpm test`; lint `pnpm lint`; typecheck `npx tsc --noEmit` (NOT `pnpm build` — local `.env.local` has placeholders so the build fails for unrelated reasons).
- **Structured results, never thrown errors, for expected `startApplication` outcomes** — prod redacts Server Action error messages, so the client must branch on returned values.
- **Never expose an existing draft's resume token on-screen.** Typing an email is not proof of owning it; the email inbox is the only recovery channel.
- **Rejection is final and never advertised:** a rejected email gets the same `{ existing: 'submitted' }` response as a submitted one.
- **FR copy verbatim from the spec:**
  - draft notice: « Une candidature est déjà en cours avec cette adresse — nous t’avons renvoyé le lien pour continuer par e-mail. »
  - submitted notice: « Une candidature a déjà été envoyée avec cette adresse e-mail. »
  - parent helper: « Remplissez au moins un parent en entier. » / "Fill in at least one parent completely."
- **`ALLOWED_UPLOAD_ACCEPT` unchanged** (from `lib/uploads.ts`). No photo cropper, no drag-and-drop.
- **Never log student/parent PII** (emails, names, answers) anywhere.
- **`git add` only the exact files named in each commit step** — never `git add -A` (untracked student PDFs = PII risk).
- **Do NOT run `supabase db push` / `mcp apply_migration` during execution.** The migration is applied at rollout, after the manual prod-duplicate review (see Rollout section). Prod is known to contain at least one repro duplicate.
- Autosave of partial drafts stays untouched — mandatory means *can't submit*, not *can't save*.

---

### Task 1: Migration — draft-duplicate cleanup + unique index

**Files:**
- Create: `supabase/migrations/20260706000001_applications_unique_email.sql`

**Interfaces:**
- Consumes: `applications` table (`supabase/migrations/20260629000001_applications.sql` — columns `id, exchange_id, email, status, created_at`).
- Produces: unique index `applications_exchange_email_unique` on `(exchange_id, email)`. Task 2's `23505` handling relies on this index existing in any environment where the code runs against real Postgres.

There is no local Supabase stack, so this task is write + commit only; the migration is *applied* at rollout (see Rollout section). SQL semantics to verify by reading: only `draft` rows are ever deleted; duplicate submitted+ rows make `CREATE UNIQUE INDEX` fail, which is the intended manual-review tripwire.

- [ ] **Step 1: Write the migration**

```sql
-- One email = one application per exchange (spec 2026-07-06).
--
-- Cleanup before the unique index: among rows sharing (exchange_id, email),
-- delete only DRAFT rows — a draft is superseded by any newer draft and by any
-- submitted+ row (the real application). Duplicate submitted+ rows are NEVER
-- deleted here: if any exist, the CREATE UNIQUE INDEX below fails and the
-- migration aborts, forcing the manual review the spec requires. Review prod
-- data by hand before pushing this migration (known to contain >= 1 duplicate).

delete from applications a
where a.status = 'draft'
  and exists (
    select 1 from applications b
    where b.exchange_id = a.exchange_id
      and b.email = a.email
      and b.id <> a.id
      and (
        b.status <> 'draft'
        or b.created_at > a.created_at
        or (b.created_at = a.created_at and b.id > a.id)
      )
  );

-- Unconditional (no status frees the email): rejection is final, and a
-- submitted application permanently claims its address for this exchange.
-- startApplication maps the 23505 from a two-tab insert race to the same
-- structured { existing } response it returns from its pre-insert check.
create unique index applications_exchange_email_unique
  on applications (exchange_id, email);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260706000001_applications_unique_email.sql
git commit -m "feat: unique (exchange_id, email) index on applications + draft-duplicate cleanup"
```

---

### Task 2: `startApplication` dedupe — server action + start-form UI

One task on purpose: changing the action's return type breaks `ApplicationStartForm`'s compile, so server + client land in a single commit that always typechecks.

**Files:**
- Modify: `actions/applications.ts:44-103` (`startApplication`)
- Modify: `components/ApplicationStartForm.tsx`
- Test: `actions/__tests__/applications.test.ts`
- Test: `components/__tests__/ApplicationStartForm.test.tsx`

**Interfaces:**
- Consumes: `normalizeEmail`, `enforceRateLimit` (existing gates run unchanged, *before* the existing-row lookup), `sendApplicationResumeEmail({ to, exchangeName, resumeUrl })`, `resumeExpiry(deadline)` (module-local helper, unchanged).
- Produces: `export type StartApplicationResult = { token: string } | { existing: 'draft' | 'submitted' }` and `startApplication(slug, input): Promise<StartApplicationResult>`. Nothing else in this file changes in this task.

- [ ] **Step 1: Update the test harness mocks in `actions/__tests__/applications.test.ts`**

Three mock changes so the new paths are testable:

(a) Extend the `scenario` type (top of file) with two fields:

```ts
let scenario: {
  exchange: any | null
  application: any | null
  applicationQueue: any[]          // consumed first by applications maybeSingle (for race tests)
  inserted: any
  insertError: any | null          // injected error for applications inserts
  updated: any
  enrollError: any | null
  deletedProfileUserId: string | null
  deletedAuthUserId: string | null
  rateLimitAllowed: boolean
}
```

(b) In `builder(table)`, replace the `insert:` and `maybeSingle:` members:

```ts
    insert: (row: any) => {
      scenario.inserted = { table, row }
      const error = table === 'exchange_enrollments' ? (scenario.enrollError ?? null)
        : table === 'applications' ? (scenario.insertError ?? null) : null
      return {
        error,
        // startApplication chains .select('id').single() on the insert
        select: () => ({ single: async () => ({ data: error ? null : { ...row, id: 'app-1' }, error }) }),
        // respondToInvitation awaits the insert directly for { error }
        then: (resolve: any) => resolve({ error }),
      }
    },
```

```ts
    maybeSingle: async () => ({
      data: table === 'applications' && scenario.applicationQueue.length > 0
        ? scenario.applicationQueue.shift()
        : rowFor(table),
      error: null,
    }),
```

(c) In the top-level `beforeEach`, initialize the new fields:

```ts
    inserted: null, updated: null, insertError: null, applicationQueue: [],
```

- [ ] **Step 2: Write the failing server tests**

Add inside `describe('startApplication', ...)`. The default scenario has a draft application, which would now trip the dedupe path — so this describe gets its own `beforeEach` clearing it, and the fresh-email tests keep passing untouched:

```ts
  beforeEach(() => { scenario.application = null })

  it('with an existing draft: no insert, resume email re-sent to the existing token, token never returned', async () => {
    scenario.application = { id: 'app-9', status: 'draft', resume_token: 'tok-existing' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'draft' })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).toHaveBeenCalledTimes(1)
    expect((sendApplicationResumeEmail as any).mock.calls[0][0].resumeUrl).toContain('tok-existing')
    // keeps the re-sent link alive
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.resume_token_expires_at).toBeTruthy()
  })

  it('with a submitted application: { existing: "submitted" }, no insert, no email', async () => {
    scenario.application = { id: 'app-9', status: 'submitted', resume_token: 'tok-existing' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'submitted' })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })

  it('with a rejected application: same neutral "submitted" response (rejection is final, never advertised)', async () => {
    scenario.application = { id: 'app-9', status: 'rejected', resume_token: 'tok-existing' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'submitted' })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })

  it('maps a 23505 insert race to the winning row status', async () => {
    // Pre-check misses (null), insert hits the unique index, re-read finds the winner.
    scenario.applicationQueue = [null, { status: 'submitted' }]
    scenario.insertError = { code: '23505', message: 'duplicate key' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'submitted' })
  })

  it('maps a 23505 race against a draft winner to { existing: "draft" }', async () => {
    scenario.applicationQueue = [null, { status: 'draft', resume_token: 'tok-winner' }]
    scenario.insertError = { code: '23505', message: 'duplicate key' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ existing: 'draft' })
  })

  it('rate limit still fires before the resend path (no email even when a draft exists)', async () => {
    scenario.application = { id: 'app-9', status: 'draft', resume_token: 'tok-existing' }
    scenario.rateLimitAllowed = false
    await expect(startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' }))
      .rejects.toThrow('Too many attempts')
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run — verify the new tests fail**

Run: `pnpm vitest run actions/__tests__/applications.test.ts`
Expected: the 6 new tests FAIL (current code inserts unconditionally and returns `{ token }`); pre-existing tests PASS.

- [ ] **Step 4: Implement in `actions/applications.ts`**

Add the exported result type right above `startApplication`, and replace the function body from the exchange lookup down. The rate limits and exchange/closed/archived guards stay exactly as they are.

```ts
export type StartApplicationResult = { token: string } | { existing: 'draft' | 'submitted' }

export async function startApplication(
  slug: string,
  input: { email: string; first_name: string; last_name: string; language: 'en' | 'fr' },
): Promise<StartApplicationResult> {
```

After `await assertExchangeWritable(admin, exchange.id)` and before `const token = randomToken()`, insert:

```ts
  // One email = one application per exchange. Any existing row blocks a new
  // insert. Structured results, not thrown errors: prod redacts Server Action
  // error messages, and the client must branch on the outcome.
  const { data: existing } = await admin
    .from('applications')
    .select('id, status, resume_token')
    .eq('exchange_id', exchange.id)
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    if (existing.status !== 'draft') {
      // Includes rejected: rejection is final and the public screen never
      // advertises it — same neutral "already submitted" outcome.
      return { existing: 'submitted' }
    }
    // Typing an email is not proof of owning it: never return the existing
    // token. The inbox is the only recovery channel — re-send the resume link
    // (already capped by the 3/hr-per-email limit above) and keep it alive.
    await admin.from('applications')
      .update({ resume_token_expires_at: resumeExpiry(exchange.application_deadline) })
      .eq('id', existing.id)
    void sendApplicationResumeEmail({
      to: email,
      exchangeName: exchange.name,
      resumeUrl: `${APP_URL}/apply/resume/${existing.resume_token}`,
    }).catch(() => {})
    return { existing: 'draft' }
  }
```

Then replace the insert's `if (error) throw error` with:

```ts
  if (error) {
    // Two tabs raced past the pre-check; the unique index rejected the loser.
    // Map to the same structured response by re-reading the winning row (the
    // winner's own request already sent the resume email).
    if ((error as { code?: string }).code === '23505') {
      const { data: winner } = await admin
        .from('applications')
        .select('status')
        .eq('exchange_id', exchange.id)
        .eq('email', email)
        .maybeSingle()
      return { existing: winner?.status === 'draft' ? 'draft' : 'submitted' }
    }
    throw error
  }
```

- [ ] **Step 5: Run — verify server tests pass**

Run: `pnpm vitest run actions/__tests__/applications.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 6: Write the failing start-form tests**

In `components/__tests__/ApplicationStartForm.test.tsx`, add `import { startApplication } from '@/actions/applications'` below the existing imports, then add:

```tsx
  async function fillAndStart(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/first name/i), 'Léa')
    await user.type(screen.getByLabelText(/last name/i), 'Martin')
    await user.type(screen.getByLabelText(/e-mail/i), 'lea@example.com')
    await user.click(screen.getByRole('button', { name: /start my application/i }))
  }

  it('shows the "draft in progress" notice, stores nothing, does not navigate', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ existing: 'draft' })
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    await fillAndStart(user)
    expect(await screen.findByText(/already in progress with this email/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(readResumeToken('france-canada')).toBeNull()
  })

  it('shows the "already submitted" notice', async () => {
    vi.mocked(startApplication).mockResolvedValueOnce({ existing: 'submitted' })
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    await fillAndStart(user)
    expect(await screen.findByText(/already been submitted with this email/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
```

- [ ] **Step 7: Run — verify they fail**

Run: `pnpm vitest run components/__tests__/ApplicationStartForm.test.tsx`
Expected: the 2 new tests FAIL (component destructures `{ token }` and crashes / navigates); the 2 pre-existing tests PASS.

- [ ] **Step 8: Implement in `components/ApplicationStartForm.tsx`**

Add the notice copy above the component (module scope):

```tsx
const NOTICE = {
  draft: {
    en: 'An application is already in progress with this email address — we’ve re-sent you the link by email so you can continue.',
    fr: 'Une candidature est déjà en cours avec cette adresse — nous t’avons renvoyé le lien pour continuer par e-mail.',
  },
  submitted: {
    en: 'An application has already been submitted with this email address.',
    fr: 'Une candidature a déjà été envoyée avec cette adresse e-mail.',
  },
} as const
```

Add state next to `error`:

```tsx
  const [notice, setNotice] = useState<'draft' | 'submitted' | null>(null)
```

Replace the `start` function:

```tsx
  async function start() {
    setLoading(true); setError(null); setNotice(null)
    try {
      const res = await startApplication(slug, { ...form, language: lang })
      if ('token' in res) {
        storeResumeToken(slug, res.token)
        router.push(`/apply/resume/${res.token}`)
        return
      }
      setNotice(res.existing)
      setLoading(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : (fr ? 'Une erreur est survenue.' : 'Something went wrong')); setLoading(false)
    }
  }
```

Render the notice as an informational panel (not error-red), directly above the existing `{error && ...}` line:

```tsx
        {notice && <p className="m-0 rounded-[10px] bg-[#E6ECFD] px-4 py-3 text-sm leading-relaxed text-[#1D48C7]">{NOTICE[notice][lang]}</p>}
```

- [ ] **Step 9: Run both test files — verify all pass**

Run: `pnpm vitest run actions/__tests__/applications.test.ts components/__tests__/ApplicationStartForm.test.tsx components/__tests__/ApplyEntry.test.tsx`
Expected: PASS (ApplyEntry's mock returns `{ token: 'tok-new' }`, still a valid member of the union).

- [ ] **Step 10: Commit**

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts components/ApplicationStartForm.tsx components/__tests__/ApplicationStartForm.test.tsx
git commit -m "feat: one email one application — startApplication dedupe with structured results"
```

---

### Task 3: Mandatory-field policy in `lib/application-form.ts`

**Files:**
- Modify: `lib/application-form.ts`
- Test: `lib/__tests__/application-form.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (later tasks rely on these exact signatures):
  - `missingRequiredApplication(data: Record<string, string>, opts?: { hasPhoto?: boolean }): string[]` — returns field ids; includes the literal string `'photo'` iff `opts?.hasPhoto === false`; parent-group and conditional-address rules baked in.
  - `parentGroupFields(group: 'father' | 'mother'): AppField[]` — the 8 fields of a parent group (used by Task 6 for helper-text highlighting).
  - All fields in the `student`, `hosting`, and `profile` sections plus `family_status` now carry `required: true`; `father_*`/`mother_*` and `separation_housing_address` do NOT.

- [ ] **Step 1: Write the failing tests**

Replace the `describe('missingRequiredApplication', ...)` block in `lib/__tests__/application-form.test.ts` with the following (keep the `application catalog` describe as is), and add `parentGroupFields` to the import list from `'../application-form'`:

```ts
function completeData(overrides: Record<string, string> = {}): Record<string, string> {
  const data: Record<string, string> = {}
  for (const f of allApplicationFields()) data[f.id] = 'x'
  data.family_status = 'married'
  data.separation_housing_address = ''
  return { ...data, ...overrides }
}

const FATHER_IDS = [
  'father_last_name', 'father_first_name', 'father_nationality', 'father_native_language',
  'father_cell_phone', 'father_email', 'father_address', 'father_occupation',
]
const MOTHER_IDS = [
  'mother_last_name', 'mother_first_name', 'mother_nationality', 'mother_native_language',
  'mother_cell_phone', 'mother_email', 'mother_address', 'mother_occupation',
]

function emptied(ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map(id => [id, '']))
}

describe('required catalog', () => {
  it('marks every student, hosting, and profile field plus family_status required', () => {
    const required = requiredApplicationFieldIds()
    expect(required).toEqual(expect.arrayContaining(['native_language', 'pronouns', 'pets', 'smoking_home', 'sports', 'anything_else', 'family_status']))
  })
  it('leaves parent fields and the conditional separation address out of the flat required list', () => {
    const required = requiredApplicationFieldIds()
    for (const id of [...FATHER_IDS, ...MOTHER_IDS, 'separation_housing_address']) {
      expect(required).not.toContain(id)
    }
  })
  it('exposes the parent groups', () => {
    expect(parentGroupFields('father').map(f => f.id)).toEqual(FATHER_IDS)
    expect(parentGroupFields('mother').map(f => f.id)).toEqual(MOTHER_IDS)
  })
})

describe('missingRequiredApplication', () => {
  it('lists required fields with empty/whitespace answers', () => {
    const missing = missingRequiredApplication({ first_name: 'Ana', last_name: '  ' })
    expect(missing).toContain('last_name')
    expect(missing).not.toContain('first_name')
  })
  it('accepts a fully complete application', () => {
    expect(missingRequiredApplication(completeData(), { hasPhoto: true })).toEqual([])
  })
  it('previously optional fields now block submit when empty', () => {
    const missing = missingRequiredApplication(completeData({ sports: '', pets: ' ' }), { hasPhoto: true })
    expect(missing).toEqual(expect.arrayContaining(['sports', 'pets']))
  })
  it('accepts a complete mother alone (father fully empty)', () => {
    expect(missingRequiredApplication(completeData(emptied(FATHER_IDS)), { hasPhoto: true })).toEqual([])
  })
  it('rejects a half-filled father even when the mother is complete', () => {
    const missing = missingRequiredApplication(
      completeData(emptied(FATHER_IDS.slice(4))), { hasPhoto: true })
    expect(missing).toEqual(expect.arrayContaining(FATHER_IDS.slice(4)))
  })
  it('rejects when both parent groups are fully empty, flagging both', () => {
    const missing = missingRequiredApplication(completeData(emptied([...FATHER_IDS, ...MOTHER_IDS])), { hasPhoto: true })
    expect(missing).toEqual(expect.arrayContaining(['father_last_name', 'mother_last_name']))
  })
  it('requires family_status', () => {
    expect(missingRequiredApplication(completeData({ family_status: '' }), { hasPhoto: true })).toContain('family_status')
  })
  it('requires separation_housing_address only for separated / step_family', () => {
    expect(missingRequiredApplication(completeData({ family_status: 'separated' }), { hasPhoto: true }))
      .toContain('separation_housing_address')
    expect(missingRequiredApplication(completeData({ family_status: 'step_family' }), { hasPhoto: true }))
      .toContain('separation_housing_address')
    expect(missingRequiredApplication(completeData({ family_status: 'married' }), { hasPhoto: true }))
      .not.toContain('separation_housing_address')
    expect(missingRequiredApplication(
      completeData({ family_status: 'separated', separation_housing_address: '12 rue X' }), { hasPhoto: true }))
      .not.toContain('separation_housing_address')
  })
  it('requires the photo only when the caller says none exists', () => {
    expect(missingRequiredApplication(completeData(), { hasPhoto: false })).toEqual(['photo'])
    expect(missingRequiredApplication(completeData(), { hasPhoto: true })).toEqual([])
    expect(missingRequiredApplication(completeData())).toEqual([])
  })
})
```

- [ ] **Step 2: Run — verify the new tests fail**

Run: `pnpm vitest run lib/__tests__/application-form.test.ts`
Expected: FAIL — `parentGroupFields` not exported, required flags missing, opts parameter unknown.

- [ ] **Step 3: Implement**

In `lib/application-form.ts`:

(a) Add `required: true` to every field in the `student` section (`native_language`, `nationality`, `sex`, `pronouns`, `grade`, `french_class`, `cell_phone` — the other four already have it), every field in the `hosting` section (all 10), every field in the `profile` section (all 14), and to `family_status`. Do NOT add it to any `father_*`/`mother_*` field or to `separation_housing_address`. Example of the pattern (apply to each listed field):

```ts
      { id: 'native_language', type: 'text', label: L('Native language', 'Langue maternelle'), required: true },
```

(b) Replace `missingRequiredApplication` and add `parentGroupFields` right below `requiredApplicationFieldIds`:

```ts
export function parentGroupFields(group: 'father' | 'mother'): AppField[] {
  return allApplicationFields().filter(f => f.group === group)
}

export function missingRequiredApplication(
  data: Record<string, string>,
  opts?: { hasPhoto?: boolean },
): string[] {
  const empty = (id: string) => (data[id] ?? '').trim() === ''
  const missing = requiredApplicationFieldIds().filter(empty)

  // Parents: at least one parent (father or mother) filled in completely; a
  // partially filled group is invalid either way. The missing ids are the
  // empty fields of every group that needs attention.
  const father = parentGroupFields('father')
  const mother = parentGroupFields('mother')
  const fatherEmpty = father.filter(f => empty(f.id)).map(f => f.id)
  const motherEmpty = mother.filter(f => empty(f.id)).map(f => f.id)
  const fatherPartial = fatherEmpty.length > 0 && fatherEmpty.length < father.length
  const motherPartial = motherEmpty.length > 0 && motherEmpty.length < mother.length
  if (fatherPartial) missing.push(...fatherEmpty)
  if (motherPartial) missing.push(...motherEmpty)
  if (fatherEmpty.length === father.length && motherEmpty.length === mother.length) {
    missing.push(...fatherEmpty, ...motherEmpty)
  }

  // Where the exchange partner will be housed only applies when the family is
  // separated / recomposed; the field is hidden from the form otherwise.
  const fs = (data.family_status ?? '').trim()
  if ((fs === 'separated' || fs === 'step_family') && empty('separation_housing_address')) {
    missing.push('separation_housing_address')
  }

  // The photo lives on the applications row (photo_path), not in `data`;
  // callers that know whether one exists say so explicitly.
  if (opts?.hasPhoto === false) missing.push('photo')

  return missing
}
```

- [ ] **Step 4: Run — verify tests pass**

Run: `pnpm vitest run lib/__tests__/application-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the neighbors that consume this module**

Run: `pnpm vitest run actions/__tests__/applications.test.ts components/__tests__/ApplicationForm.test.tsx`
Expected: PASS — `submitApplication`'s existing missing-fields test still throws (more fields required, same outcome); the ApplicationForm test mocks `missingRequiredApplication` to `[]`.

- [ ] **Step 6: Commit**

```bash
git add lib/application-form.ts lib/__tests__/application-form.test.ts
git commit -m "feat: mandatory application fields — parent-group rule, conditional separation address, photo flag"
```

---

### Task 4: Server-side submit enforcement (photo + full policy)

**Files:**
- Modify: `actions/applications.ts:192-235` (`submitApplication`)
- Test: `actions/__tests__/applications.test.ts`

**Interfaces:**
- Consumes: `missingRequiredApplication(data, { hasPhoto })` from Task 3.
- Produces: `submitApplication` unchanged in signature; it now selects `photo_path` and validates *after* loading the row so the photo can be checked. Error message for missing fields stays `'Please complete all required fields before submitting.'`.

- [ ] **Step 1: Write the failing tests**

In `actions/__tests__/applications.test.ts`:

(a) The success path exercises the fire-and-forget confirmation email, whose mock must return a promise (`.catch` is chained on it). In the `vi.mock('@/lib/email', ...)` factory, change the two submit-path mocks:

```ts
  sendApplicationResumeEmail: vi.fn().mockResolvedValue(undefined),
  sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendNewApplicationAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendInvitationEmail: vi.fn(), sendApplicationRejectionEmail: vi.fn(),
```

(b) Add below the existing imports:

```ts
import { allApplicationFields } from '@/lib/application-form'

function completeAppData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (const f of allApplicationFields()) data[f.id] = 'x'
  data.email = 'a@b.co'
  data.family_status = 'married'
  return data
}
```

(c) Extend `describe('submitApplication', ...)`:

```ts
  it('rejects a complete submission that has no photo', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: null }
    await expect(submitApplication('tok', completeAppData())).rejects.toThrow('required')
    expect(scenario.updated).toBeNull()
  })
  it('submits a complete application that has a photo', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    await submitApplication('tok', completeAppData())
    expect(scenario.updated.table).toBe('applications')
    expect(scenario.updated.row.status).toBe('submitted')
  })
```

- [ ] **Step 2: Run — verify they fail**

Run: `pnpm vitest run actions/__tests__/applications.test.ts`
Expected: the no-photo test FAILS (current code never checks `photo_path`, so the complete data submits). The with-photo test may pass already — that's fine; the pair pins the boundary.

- [ ] **Step 3: Implement**

In `submitApplication`, (a) delete the two validation lines at the top (`const missing = ...` / `if (missing.length > 0) ...` — keep `hasOverlongAnswer`), (b) add `photo_path` to the row select:

```ts
    .select('id, status, email, exchange_id, school_id, resume_token_expires_at, photo_path')
```

and (c) insert the validation right after the `if (app.status !== 'draft')` guard:

```ts
  // Server-side backstop of the client submit gate — same policy, including
  // the photo (which lives on the row, not in `data`).
  const missing = missingRequiredApplication(data, { hasPhoto: app.photo_path != null })
  if (missing.length > 0) throw new Error('Please complete all required fields before submitting.')
```

- [ ] **Step 4: Run — verify tests pass**

Run: `pnpm vitest run actions/__tests__/applications.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add actions/applications.ts actions/__tests__/applications.test.ts
git commit -m "feat: submitApplication enforces full mandatory policy incl. required photo"
```

---

### Task 5: `ApplicationPhotoUpload` component

**Files:**
- Create: `components/ApplicationPhotoUpload.tsx`
- Test: `components/__tests__/ApplicationPhotoUpload.test.tsx`

**Interfaces:**
- Consumes: `uploadApplicationPhoto(token, formData): Promise<{ path: string }>` (existing action, unchanged), `ALLOWED_UPLOAD_ACCEPT` from `lib/uploads.ts`, shadcn `Button`.
- Produces: `ApplicationPhotoUpload({ token, initialPhotoUrl, lang, invalid, onUploaded }: { token: string; initialPhotoUrl: string | null; lang: 'en' | 'fr'; invalid: boolean; onUploaded: () => void })`. Renders with wrapper `id="field-photo"` (Task 6 scrolls to it).

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/ApplicationPhotoUpload.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/actions/applications', () => ({
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
}))

import { ApplicationPhotoUpload } from '@/components/ApplicationPhotoUpload'
import { uploadApplicationPhoto } from '@/actions/applications'

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no createObjectURL; the component previews the picked file with it.
  ;(URL as any).createObjectURL = vi.fn(() => 'blob:preview')
})

function renderCard(over: Partial<Parameters<typeof ApplicationPhotoUpload>[0]> = {}) {
  return render(
    <ApplicationPhotoUpload token="t" initialPhotoUrl={null} lang="fr" invalid={false} onUploaded={() => {}} {...over} />,
  )
}

// The real file input is visually hidden (the styled button proxies it), so
// tests drive it via fireEvent.change on its aria-label.
function pickFile() {
  const file = new File(['x'], 'me.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Photo récente'), { target: { files: [file] } })
}

describe('ApplicationPhotoUpload', () => {
  it('shows the placeholder and "Choisir une photo" before any upload', () => {
    renderCard()
    expect(screen.getByRole('button', { name: /choisir une photo/i })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the existing photo and "Remplacer la photo" when one was already uploaded', () => {
    renderCard({ initialPhotoUrl: 'https://signed.example/photo.jpg' })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/photo.jpg')
    expect(screen.getByRole('button', { name: /remplacer la photo/i })).toBeInTheDocument()
  })

  it('uploads the picked file, then shows the preview and switches to "Remplacer"', async () => {
    const onUploaded = vi.fn()
    renderCard({ onUploaded })
    pickFile()
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:preview')
    expect(uploadApplicationPhoto).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /remplacer la photo/i })).toBeInTheDocument()
  })

  it('shows the uploading state while the action is in flight', async () => {
    let resolveUpload!: (v: { path: string }) => void
    vi.mocked(uploadApplicationPhoto).mockImplementationOnce(
      () => new Promise(res => { resolveUpload = res }),
    )
    renderCard()
    pickFile()
    expect(await screen.findByRole('button', { name: /envoi…/i })).toBeDisabled()
    resolveUpload({ path: 'app-1/photo.png' })
    expect(await screen.findByRole('button', { name: /remplacer la photo/i })).toBeEnabled()
  })

  it('surfaces an upload failure and keeps the placeholder', async () => {
    vi.mocked(uploadApplicationPhoto).mockRejectedValueOnce(new Error('boom'))
    renderCard()
    pickFile()
    expect(await screen.findByText(/l’envoi a échoué/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the required-field message when invalid', () => {
    renderCard({ invalid: true })
    expect(screen.getByText(/une photo est requise/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — verify they fail**

Run: `pnpm vitest run components/__tests__/ApplicationPhotoUpload.test.tsx`
Expected: FAIL — module `@/components/ApplicationPhotoUpload` does not exist.

- [ ] **Step 3: Implement**

Create `components/ApplicationPhotoUpload.tsx`:

```tsx
'use client'
import { useRef, useState } from 'react'
import { uploadApplicationPhoto } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'

const T = {
  en: { label: 'Recent photo', choose: 'Choose a photo', replace: 'Replace the photo', hint: 'JPEG, PNG or WebP — 10 MB max.', uploading: 'Uploading…', failed: 'Upload failed. Please try again.', required: 'A photo is required to submit your application.' },
  fr: { label: 'Photo récente', choose: 'Choisir une photo', replace: 'Remplacer la photo', hint: 'JPEG, PNG ou WebP — 10 Mo max.', uploading: 'Envoi…', failed: 'L’envoi a échoué. Réessaie.', required: 'Une photo est requise pour envoyer ta candidature.' },
}

interface Props {
  token: string
  initialPhotoUrl: string | null
  lang: 'en' | 'fr'
  invalid: boolean
  onUploaded: () => void
}

export function ApplicationPhotoUpload({ token, initialPhotoUrl, lang, invalid, onUploaded }: Props) {
  const [preview, setPreview] = useState<string | null>(initialPhotoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = T[lang]

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    const fd = new FormData()
    fd.set('photo', file)
    try {
      await uploadApplicationPhoto(token, fd)
      setPreview(URL.createObjectURL(file))
      onUploaded()
    } catch {
      setError(t.failed)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div id="field-photo" className={`flex items-center gap-5 rounded-[14px] border bg-[#FAFBFE] px-5 py-4 ${invalid ? 'border-[#C0392B]' : 'border-[#E4E9F2]'}`}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob / signed Supabase URL, next/image adds nothing
        <img src={preview} alt={t.label} className="h-24 w-24 shrink-0 rounded-full border border-[#E4E9F2] object-cover" />
      ) : (
        <span aria-hidden className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#EDF1F8]">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8A97B2" strokeWidth="1.5">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13.5px] font-semibold text-[#42506E]">{t.label}<span className="ml-1 text-[#C0392B]">*</span></span>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="h-10 self-start rounded-[10px] border-[#C4CDE0] px-4 text-sm font-semibold text-[#10203F]">
          {uploading ? t.uploading : preview ? t.replace : t.choose}
        </Button>
        <input ref={inputRef} type="file" accept={ALLOWED_UPLOAD_ACCEPT} aria-label={t.label} onChange={onFile} className="hidden" />
        <p className="m-0 text-xs text-[#8A97B2]">{t.hint}</p>
        {error && <p className="m-0 text-xs text-[#C0392B]">{error}</p>}
        {invalid && !error && <p className="m-0 text-xs text-[#C0392B]">{t.required}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run — verify tests pass**

Run: `pnpm vitest run components/__tests__/ApplicationPhotoUpload.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ApplicationPhotoUpload.tsx components/__tests__/ApplicationPhotoUpload.test.tsx
git commit -m "feat: styled required photo-upload card for the application form"
```

---

### Task 6: Wire the form — photo card, missing-field highlights, conditional field, photoUrl plumbing

**Files:**
- Modify: `components/ApplicationForm.tsx` (full rewrite below)
- Modify: `actions/applications.ts:105-130` (`getApplicationDraft` — add `photoUrl`)
- Modify: `app/apply/resume/[token]/page.tsx:33` (pass `initialPhotoUrl`)
- Test: `components/__tests__/ApplicationForm.test.tsx`
- Test: `actions/__tests__/applications.test.ts`

**Interfaces:**
- Consumes: `ApplicationPhotoUpload` (Task 5), `missingRequiredApplication(data, { hasPhoto })` + `parentGroupFields` (Task 3).
- Produces: `ApplicationForm` gains required prop `initialPhotoUrl: string | null`; `getApplicationDraft` for a live draft additionally returns `photoUrl: string | null` (1-hour signed URL when `photo_path` is set).

- [ ] **Step 1: Write the failing `getApplicationDraft` test**

In `actions/__tests__/applications.test.ts`, the `adminClient.storage` mock must learn to sign URLs. Replace the `storage:` line of `adminClient` with:

```ts
  storage: { from: () => ({
    upload: async () => ({ data: { path: 'app-1/photo.png' }, error: null }),
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
  }) },
```

Add to `describe('getApplicationDraft slug', ...)`:

```ts
  it('returns a signed photo URL for a draft that already has a photo', async () => {
    scenario.application = { status: 'draft', data: {}, language: 'en', photo_path: 'app-1/photo.jpg', resume_token_expires_at: null, exchanges: { name: 'X', apply_slug: 'x' } }
    const res = await getApplicationDraft('tok') as any
    expect(res.photoUrl).toBe('https://signed.example/app-1/photo.jpg')
  })
  it('returns a null photo URL when no photo was uploaded yet', async () => {
    scenario.application = { status: 'draft', data: {}, language: 'en', photo_path: null, resume_token_expires_at: null, exchanges: { name: 'X', apply_slug: 'x' } }
    const res = await getApplicationDraft('tok') as any
    expect(res.photoUrl).toBeNull()
  })
```

- [ ] **Step 2: Run — verify they fail**

Run: `pnpm vitest run actions/__tests__/applications.test.ts`
Expected: the two new tests FAIL (`photoUrl` undefined).

- [ ] **Step 3: Implement `getApplicationDraft` photoUrl**

In `actions/applications.ts`, replace the final `return` of `getApplicationDraft` with:

```ts
  // Signed URL so a returning draft shows its already-uploaded photo (the
  // application-photos bucket is private; 1 h outlives any editing session).
  let photoUrl: string | null = null
  if (app.photo_path) {
    const { data: signed } = await admin.storage.from(PHOTO_BUCKET)
      .createSignedUrl(app.photo_path, 3600)
    photoUrl = signed?.signedUrl ?? null
  }
  return {
    expired: false as const, submitted: false as const,
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, photoUrl, exchangeName,
    slug: (app as any).exchanges?.apply_slug ?? '',
  }
```

Run: `pnpm vitest run actions/__tests__/applications.test.ts` — Expected: PASS.

- [ ] **Step 4: Update the ApplicationForm tests (failing)**

Replace the whole of `components/__tests__/ApplicationForm.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/applications', () => ({
  saveApplicationDraft: vi.fn(async () => {}),
  submitApplication: vi.fn(async () => {}),
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))
// Route the validation through a controllable mock so tests don't have to
// populate all ~50 required fields.
const missingMock = vi.fn((..._args: any[]) => [] as string[])
vi.mock('@/lib/application-form', async (orig) => {
  const actual = await (orig() as Promise<any>)
  return { ...actual, missingRequiredApplication: (...args: any[]) => missingMock(...args) }
})

import { ApplicationForm } from '@/components/ApplicationForm'
import { sendApplicationResumeLink, submitApplication } from '@/actions/applications'
import { storeResumeToken, readResumeToken } from '@/lib/apply-storage'

beforeEach(() => { vi.clearAllMocks(); missingMock.mockReturnValue([]); localStorage.clear() })

function renderForm(over: Partial<Parameters<typeof ApplicationForm>[0]> = {}) {
  return render(
    <ApplicationForm token="t" slug="s" exchangeName="Échange Espagne" initialData={{}} initialLanguage="fr" initialPhotoUrl={null} {...over} />,
  )
}

describe('ApplicationForm', () => {
  it('renders header + submit, has no "Finish later" button, and shows the reassurance line', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminer plus tard/i })).not.toBeInTheDocument()
    expect(screen.getByText(/lien par e-mail/i)).toBeInTheDocument()
    expect(screen.getByText('ENREGISTRÉ ✓')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
  })

  it('"Resend link" re-emails the resume link', async () => {
    const user = userEvent.setup()
    renderForm({ exchangeName: 'X' })
    await user.click(screen.getByRole('button', { name: /renvoyer le lien/i }))
    expect(sendApplicationResumeLink).toHaveBeenCalledWith('t')
  })

  it('clears the stored resume token on successful submit', async () => {
    const user = userEvent.setup()
    storeResumeToken('s', 't')
    renderForm({ exchangeName: 'X' })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/ta candidature a été envoyée/i)).toBeInTheDocument()
    expect(readResumeToken('s')).toBeNull()
  })

  it('renders the photo upload card and the parent helper text', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /choisir une photo/i })).toBeInTheDocument()
    expect(screen.getByText('Remplissez au moins un parent en entier.')).toBeInTheDocument()
  })

  it('blocks submit and flags the photo when validation reports it missing', async () => {
    const user = userEvent.setup()
    missingMock.mockReturnValue(['photo'])
    renderForm()
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/veuillez remplir tous les champs obligatoires/i)).toBeInTheDocument()
    expect(screen.getByText(/une photo est requise/i)).toBeInTheDocument()
    expect(submitApplication).not.toHaveBeenCalled()
    // validation was asked about the photo
    expect(missingMock).toHaveBeenCalledWith(expect.any(Object), { hasPhoto: false })
  })

  it('hides the separation housing address until family status is separated / step-family', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByText(/adresse où sera accueilli le correspondant/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Séparé' }))
    expect(screen.getByText(/adresse où sera accueilli le correspondant/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run — verify the new tests fail**

Run: `pnpm vitest run components/__tests__/ApplicationForm.test.tsx`
Expected: the 3 new tests FAIL (`initialPhotoUrl` unknown prop is tolerated by JSX spread, but no photo card, no helper text, address always visible). The 3 legacy tests PASS.

- [ ] **Step 6: Rewrite `components/ApplicationForm.tsx`**

Full replacement (keeps autosave, resend, done-state, language toggle exactly as before; adds photo card, `missing` highlighting, conditional field, parent helper, "none" hint):

```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { APPLICATION_SECTIONS, missingRequiredApplication, parentGroupFields, type AppField } from '@/lib/application-form'
import { saveApplicationDraft, submitApplication, sendApplicationResumeLink } from '@/actions/applications'
import { ApplicationPhotoUpload } from '@/components/ApplicationPhotoUpload'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { clearResumeToken } from '@/lib/apply-storage'

interface Props {
  token: string
  slug: string
  exchangeName: string
  initialData: Record<string, string>
  initialLanguage: 'en' | 'fr'
  initialPhotoUrl: string | null
}

const T = {
  en: { intro: 'Fill out the form below — your answers are saved automatically as you go.', noneHint: 'Every field is required — if a question doesn’t apply to you, answer "none".', saved: 'SAVED ✓', saving: 'SAVING…', badge: 'Application', submit: 'Submit my application', resend: 'Resend link', reassure: 'Progress saved automatically. We emailed you a link in case you switch devices.', submitting: 'Sending…', missing: 'Please complete all required fields.', unexpected: 'An unexpected error occurred.', done: 'Thank you! Your application has been submitted.', remind: "We've emailed you a link to continue your application anytime.", yes: 'Yes', no: 'No', parentHelper: 'Fill in at least one parent completely.' },
  fr: { intro: 'Remplis le formulaire ci-dessous — tes réponses sont enregistrées automatiquement au fur et à mesure.', noneHint: 'Tous les champs sont obligatoires — si une question ne te concerne pas, indique « aucun ».', saved: 'ENREGISTRÉ ✓', saving: 'ENREGISTREMENT…', badge: 'Candidature', submit: 'Envoyer ma candidature', resend: 'Renvoyer le lien', reassure: 'Progression enregistrée automatiquement. Nous t’avons envoyé un lien par e-mail au cas où tu changes d’appareil.', submitting: 'Envoi…', missing: 'Veuillez remplir tous les champs obligatoires.', unexpected: 'Une erreur est survenue.', done: 'Merci ! Ta candidature a été envoyée.', remind: 'Nous t’avons envoyé un e-mail avec un lien pour reprendre ta candidature.', yes: 'Oui', no: 'Non', parentHelper: 'Remplissez au moins un parent en entier.' },
}

const PARENT_FIELD_IDS = [...parentGroupFields('father'), ...parentGroupFields('mother')].map(f => f.id)

export function ApplicationForm({ token, slug, exchangeName, initialData, initialLanguage, initialPhotoUrl }: Props) {
  const [lang, setLang] = useState<'en' | 'fr'>(initialLanguage)
  const [data, setData] = useState<Record<string, string>>(initialData)
  const [hasPhoto, setHasPhoto] = useState(initialPhotoUrl != null)
  const [missing, setMissing] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [remindSent, setRemindSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = T[lang]

  function set(id: string, value: string) {
    setMissing(prev => (prev.includes(id) ? prev.filter(m => m !== id) : prev))
    setData(prev => {
      const next = { ...prev, [id]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void autosave(next), 800)
      return next
    })
  }
  async function autosave(d: Record<string, string>) {
    setSaving(true)
    try { await saveApplicationDraft(token, d) } catch { /* transient; next edit retries */ } finally { setSaving(false) }
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function onResend() {
    setReminding(true); setError(null)
    try {
      await saveApplicationDraft(token, data)
      await sendApplicationResumeLink(token)
      setRemindSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.unexpected)
    } finally { setReminding(false) }
  }

  async function onSubmit() {
    const miss = missingRequiredApplication(data, { hasPhoto })
    setMissing(miss)
    if (miss.length) {
      setError(t.missing)
      document.getElementById(`field-${miss[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true); setError(null)
    try { await submitApplication(token, data); clearResumeToken(slug); setDone(true) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : t.unexpected); setSubmitting(false) }
  }

  if (done) return <p className="py-16 text-center text-[15px] text-[#10203F]">{t.done}</p>

  function renderField(f: AppField) {
    const invalid = missing.includes(f.id)
    const inputBorder = invalid ? 'border-[#C0392B]' : 'border-[#C4CDE0]'
    if (f.type === 'textarea') {
      return <Textarea id={f.id} value={data[f.id] ?? ''} aria-invalid={invalid || undefined} onChange={e => set(f.id, e.target.value)} className={`rounded-[10px] ${inputBorder}`} />
    }
    if (f.type === 'yesno') {
      return (
        <div className={`flex gap-4 text-sm text-[#10203F] ${invalid ? 'rounded-[10px] border border-[#C0392B] p-2' : ''}`}>
          {['yes', 'no'].map(v => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === v} onChange={() => set(f.id, v)} />
              {v === 'yes' ? t.yes : t.no}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'radio') {
      return (
        <div className={`flex flex-col gap-1.5 text-sm text-[#10203F] ${invalid ? 'rounded-[10px] border border-[#C0392B] p-2' : ''}`}>
          {f.options!.map(o => (
            <label key={o.value} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === o.value} onChange={() => set(f.id, o.value)} />
              {o.label[lang]}
            </label>
          ))}
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return <Input id={f.id} type={inputType} value={data[f.id] ?? ''} aria-invalid={invalid || undefined} onChange={e => set(f.id, e.target.value)} className={`h-[46px] rounded-[10px] ${inputBorder}`} />
  }

  const showSeparation = data.family_status === 'separated' || data.family_status === 'step_family'
  const parentsInvalid = missing.some(id => PARENT_FIELD_IDS.includes(id))
  const total = APPLICATION_SECTIONS.length
  return (
    <div className="pb-28">
      <header className="mb-[26px] flex items-center justify-between">
        <Logo href={null} />
        <div className="flex items-center gap-[18px]">
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">{saving ? t.saving : t.saved}</span>
          <div className="flex overflow-hidden rounded-[9px] border border-[#C4CDE0]">
            <button type="button" onClick={() => setLang('en')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'en' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>EN</button>
            <button type="button" onClick={() => setLang('fr')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'fr' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>FR</button>
          </div>
        </div>
      </header>

      <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{t.badge}</span>
      <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchangeName}</h1>
      <p className="m-0 mb-1 text-base leading-relaxed text-[#5B6B8C]">{t.intro}</p>
      <p className="m-0 mb-7 text-[13px] leading-relaxed text-[#8A97B2]">{t.noneHint}</p>

      <div className="flex flex-col gap-6 rounded-t-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        {APPLICATION_SECTIONS.map((section, i) => (
          <section key={section.id} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 border-b border-[#E4E9F2] pb-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold text-[#2456E6]">{i + 1}/{total}</span>
                <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-[#10203F]">{section.title[lang]}</span>
              </div>
              {section.id === 'parents' && (
                <p className={`m-0 text-[13px] ${parentsInvalid ? 'font-semibold text-[#C0392B]' : 'text-[#8A97B2]'}`}>{t.parentHelper}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.id === 'student' && (
                <div className="sm:col-span-2">
                  <ApplicationPhotoUpload
                    token={token}
                    initialPhotoUrl={initialPhotoUrl}
                    lang={lang}
                    invalid={missing.includes('photo')}
                    onUploaded={() => { setHasPhoto(true); setMissing(prev => prev.filter(id => id !== 'photo')) }}
                  />
                </div>
              )}
              {section.fields.map(f => {
                if (f.id === 'separation_housing_address' && !showSeparation) return null
                return (
                  <div key={f.id} id={`field-${f.id}`} className={`flex flex-col gap-1.5 ${f.type === 'textarea' || f.type === 'radio' ? 'sm:col-span-2' : ''}`}>
                    <Label htmlFor={f.id} className="text-[13.5px] font-semibold text-[#42506E]">
                      {f.label[lang]}
                      {(f.required || f.id === 'separation_housing_address') && <span className="ml-1 text-[#C0392B]">*</span>}
                    </Label>
                    {renderField(f)}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[#C0392B]">{error}</p>}
      {remindSent && <p className="mt-4 text-sm text-[#0F7A3D]">{t.remind}</p>}
      <p className="mt-4 text-[13px] leading-relaxed text-[#8A97B2]">{t.reassure}</p>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#E4E9F2] bg-white">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-4">
          <button type="button" onClick={onResend} disabled={reminding || submitting} className="text-[13px] font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F] disabled:opacity-50">{reminding ? '…' : t.resend}</button>
          <Button onClick={onSubmit} disabled={submitting || reminding} className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">{submitting ? t.submitting : t.submit}</Button>
        </div>
      </div>
    </div>
  )
}
```

Notes on what changed vs the old file: `uploadApplicationPhoto` import and the `onPhoto` handler and the old `photo` label key are gone (the card owns uploading); `t.photo` removed from both language tables; everything else in the layout is verbatim.

- [ ] **Step 7: Pass the photo URL through the resume page**

In `app/apply/resume/[token]/page.tsx`, replace the final `<ApplicationForm ...>` line with:

```tsx
      <ApplicationForm token={token} slug={draft.slug} exchangeName={draft.exchangeName} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} initialPhotoUrl={draft.photoUrl} />
```

- [ ] **Step 8: Run — verify component + action tests pass**

Run: `pnpm vitest run components/__tests__/ApplicationForm.test.tsx components/__tests__/ApplicationPhotoUpload.test.tsx actions/__tests__/applications.test.ts`
Expected: PASS (all).

- [ ] **Step 9: Commit**

```bash
git add components/ApplicationForm.tsx components/__tests__/ApplicationForm.test.tsx actions/applications.ts actions/__tests__/applications.test.ts app/apply/resume/\[token\]/page.tsx
git commit -m "feat: photo upload card, missing-field highlights, conditional separation address in application form"
```

---

### Task 7: Full verification sweep

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append ledger entry)

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors (warnings pre-existing at most). Fix anything introduced by this plan and amend the relevant commit—or make a `fix:` commit—before proceeding.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all suites PASS (baseline was 410+ tests; this plan adds ~25).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Do not use `pnpm build` — placeholder envs break it locally.)

- [ ] **Step 4: Append the ledger entry to `.superpowers/sdd/progress.md`**

```markdown
---

Plan: docs/superpowers/plans/2026-07-06-application-dedupe-mandatory-fields.md
Branch: feature/application-resume-flow (stacked on resume-flow, unmerged)
Started: <date>

## Tasks
- [ ] Task 1: Migration — draft-duplicate cleanup + unique (exchange_id, email) index (written, NOT applied — prod review gate)
- [ ] Task 2: startApplication dedupe (server + start-form structured results)
- [ ] Task 3: Mandatory-field policy in lib/application-form.ts
- [ ] Task 4: Server-side submit enforcement (photo + full policy)
- [ ] Task 5: ApplicationPhotoUpload component
- [ ] Task 6: Form wiring (photo card, highlights, conditional field, photoUrl)
- [ ] Task 7: Verification sweep
```

(Check off tasks as they were actually completed, with commit ranges, matching the ledger's existing style.)

- [ ] **Step 5: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: progress ledger for application dedupe + mandatory fields"
```

---

## Rollout (manual, after execution — NOT part of task execution)

Ordering matters because Vercel previews share the **prod** database (decision 2026-07-06):

1. **Manual prod duplicate review** (spec requirement; prod has ≥1 known repro duplicate). Via Supabase MCP `execute_sql`:
   ```sql
   select exchange_id, email, count(*) as n,
          array_agg(status order by created_at) as statuses,
          array_agg(id::text order by created_at) as ids
   from applications
   group by exchange_id, email
   having count(*) > 1;
   ```
   - Only-draft duplicate groups → the migration's delete handles them; nothing to do.
   - Any group with ≥2 submitted+ rows → resolve by hand (decide which row is the real application) **before** pushing the migration, otherwise `create unique index` aborts (by design).
2. **Apply the migration** (`supabase db push`, or MCP `apply_migration`). WSL2 gotcha: if `db push` hangs at "Initialising login role...", use the IPv4 session-pooler `--db-url`. Note: prod code (without the dedupe branch) will briefly surface a redacted 500 instead of creating a duplicate if someone re-enters an existing email — acceptable, and strictly better than silent duplicates.
3. **One preview live-drive** covering resume flow (Stage 1) + dedupe + mandatory fields + photo card together on the branch's Vercel Preview URL: fresh email → draft; same email again from incognito → « déjà en cours » + resume email received; submit blocked until all fields + photo present; conditional address appears for « Séparé »; submitted email re-entry → « déjà été envoyée ».
4. Merge to `main` only after the Verifying Changes gate and Bjorn's confirmation (`superpowers:finishing-a-development-branch`).

## Self-Review (completed)

- **Spec coverage:** dedupe pre-check + structured results (Task 2), DB backstop + cleanup (Task 1), 23505 race mapping (Task 2), the two apply-page messages FR/EN (Task 2), mandatory Student/Hosting/Profile fields (Task 3), at-least-one-complete-parent + helper text (Tasks 3/6), required `family_status` + conditional hidden `separation_housing_address` (Tasks 3/6), autosave untouched (Task 6 keeps `saveApplicationDraft` unvalidated), server-side submit validation + mandatory photo (Task 4), upload card with placeholder/preview/button-relabel/hint/spinner/required-marker (Task 5), welcome-back interplay (unchanged code path; live-drive step 3), branch & one-migration rollout (Global Constraints + Rollout).
- **Placeholder scan:** none — every code step carries the full code.
- **Type consistency:** `StartApplicationResult` union consumed via `'token' in res`; `missingRequiredApplication(data, opts?)` called with `{ hasPhoto }` in Task 4 (server) and Task 6 (client), bare in legacy call sites (valid — optional param); `parentGroupFields` name identical in Tasks 3 and 6; `ApplicationPhotoUpload` props identical in Tasks 5 and 6; `photoUrl` produced in Task 6 Step 3 and consumed in Step 7.
