# Block Duplicate Applications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refuse a second application from an email that already has an application anywhere in the school, at the *start* of the funnel, instead of only at the final invite-acceptance click.

**Architecture:** Broaden the existence check in `startApplication` (and add a defensive re-check in `submitApplication`) to look for a prior application by the same email in any *other* exchange of the same school; return a new structured `registered` outcome that the two client forms render as a neutral "already registered — log in" message. No schema, RLS, or storage changes.

**Tech Stack:** Next.js 14 App Router server actions, TypeScript, Supabase admin client, Vitest.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Expected outcomes are **structured return values, never throws** — prod redacts thrown Server Action messages to an opaque digest.
- **Never log student/parent PII** (emails, names) — no new logging in these paths.
- Scope of the duplicate check is **per-school** (`school_id = exchange.school_a_id`), not global.
- No `supabase/migrations/`, RLS, or storage buckets are touched → `pnpm test:rls` is **not** required.
- The working tree already contains an in-progress edit (invalid-email → `{ invalidEmail: true }` structured return + a start-form copy tweak) in `actions/apply.ts`, `components/ApplicationStartForm.tsx`, and `actions/__tests__/applications.test.ts`. This plan builds on top of those uncommitted edits and commits them as part of Tasks 1 and 3.
- Login route is `/login` (`app/(auth)/login`).

---

### Task 1: Block cross-exchange duplicates in `startApplication`

**Files:**
- Modify: `actions/apply.ts` (the `StartApplicationResult` type ~`:42-46`, and `startApplication` between the same-exchange block `:100` and the cap check `:102`)
- Test: `actions/__tests__/applications.test.ts` (mock builder + scenario + one new test)

**Interfaces:**
- Consumes: `createAdminClient()` admin Supabase client; `exchange` (has `id`, `school_a_id`); normalized `email`.
- Produces: `StartApplicationResult` gains a `{ registered: true }` member (consumed by Task 3).

- [ ] **Step 1: Extend the test mock to support the by-email duplicate query, then write the failing test**

In `actions/__tests__/applications.test.ts`, add a `crossExchangeApp` field to the `scenario` type. Find the type block (starts `let scenario: {`) and add this line just before the closing `}` (next to `userProfile`):

```typescript
  crossExchangeApp: any | null   // routes the by-email duplicate-guard maybeSingle (school_id+email, no exchange_id)
```

In the `builder(table)` object, add `neq` and `limit` next to `eq`/`order`. Replace this line:

```typescript
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    order: () => b,
```

with:

```typescript
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    neq: (col: string, val: any) => { b._filters['neq_' + col] = val; return b },
    limit: () => b,
    order: () => b,
```

Replace the whole `maybeSingle` property in `builder` (currently):

```typescript
    maybeSingle: async () => ({
      data: table === 'applications' && scenario.applicationQueue.length > 0
        ? scenario.applicationQueue.shift()
        : rowFor(table),
      error: null,
    }),
```

with:

```typescript
    maybeSingle: async () => {
      if (table === 'applications') {
        // The duplicate-guard query filters school_id + email but NOT exchange_id
        // (it uses .neq('exchange_id', …) → recorded as neq_exchange_id). Route it
        // to crossExchangeApp so it can hit/miss independently of the queue and of
        // the same-exchange lookup (which sets _filters.exchange_id).
        const f = b._filters
        if (f.school_id !== undefined && f.email !== undefined && f.exchange_id === undefined) {
          return { data: scenario.crossExchangeApp, error: null }
        }
        if (scenario.applicationQueue.length > 0) return { data: scenario.applicationQueue.shift(), error: null }
        return { data: scenario.application, error: null }
      }
      return { data: rowFor(table), error: null }
    },
```

In the `beforeEach` scenario reset, add `crossExchangeApp: null,` next to `userProfile: null,`.

Now add the failing test inside `describe('startApplication', …)`, after the `'an existing draft is still resumable past the cap'` test:

```typescript
  it('blocks a second application when the email already applied to another exchange in the school', async () => {
    scenario.crossExchangeApp = { id: 'app-other' }
    const res = await startApplication('slug', { email: 'a@b.co', first_name: 'A', last_name: 'B', language: 'en' })
    expect(res).toEqual({ registered: true })
    expect(scenario.inserted).toBeNull()
    expect(sendApplicationResumeEmail).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: FAIL — the new test errors (`startApplication` returns a `{ token }` instead of `{ registered: true }`, because the cross-exchange check does not exist yet). Existing tests still pass.

- [ ] **Step 3: Add the `registered` member to the result type**

In `actions/apply.ts`, the `StartApplicationResult` type currently reads (working-tree state, invalidEmail already present):

```typescript
export type StartApplicationResult =
  | { token: string }
  | { existing: 'draft' | 'submitted' }
  | { closed: true }
  | { invalidEmail: true }
```

Change it to:

```typescript
export type StartApplicationResult =
  | { token: string }
  | { existing: 'draft' | 'submitted' }
  | { closed: true }
  | { invalidEmail: true }
  | { registered: true }
```

- [ ] **Step 4: Add the cross-exchange existence check**

In `startApplication`, immediately AFTER the same-exchange `if (existing) { … }` block (the one that ends with `return { existing: 'draft' }`, around `:100`) and BEFORE the per-exchange cap comment/check (`// Per-exchange sanity cap …`), insert:

```typescript
  // One email = one application across this whole school. A prior row in ANY
  // other exchange of the same school means this person is already in the funnel
  // (typically already enrolled elsewhere) — refuse the second application up
  // front instead of letting them fill everything out and only hit email_exists
  // at « Oui ». At this point the same-exchange lookup above already returned, so
  // any match here is necessarily a different exchange. Structured result, not a
  // throw: the client renders a neutral "already registered — log in" message.
  const { data: elsewhere } = await admin
    .from('applications')
    .select('id')
    .eq('school_id', exchange.school_a_id)
    .eq('email', email)
    .neq('exchange_id', exchange.id)
    .limit(1)
    .maybeSingle()
  if (elsewhere) return { registered: true }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: PASS — all `startApplication` tests green, including the new one. The two `23505` race tests still pass unchanged (their queue is only consumed by the same-exchange lookups; the cross query reads `crossExchangeApp`, which is `null`).

- [ ] **Step 6: Commit**

```bash
git add actions/apply.ts actions/__tests__/applications.test.ts
git commit -m "feat(apply): block cross-exchange duplicate applications at start

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Defensive backstop in `submitApplication`

**Files:**
- Modify: `actions/apply.ts` (`ApplyWriteResult` type ~`:46`, and `submitApplication` before the final update ~`:290-292`)
- Test: `actions/__tests__/applications.test.ts` (one new test in `describe('submitApplication', …)`)

**Interfaces:**
- Consumes: `crossExchangeApp` mock routing and `neq`/`limit` builder methods added in Task 1.
- Produces: `ApplyWriteResult` gains a `{ ok: false; registered: true }` member (consumed by Task 4).

- [ ] **Step 1: Write the failing test**

In `actions/__tests__/applications.test.ts`, inside `describe('submitApplication', …)`, add after the `'returns ok:true on a successful submission'` test:

```typescript
  it('blocks submission when the email meanwhile applied to another exchange (race backstop)', async () => {
    scenario.application = { id: 'app-1', status: 'draft', email: 'a@b.co', exchange_id: 'ex-1', school_id: 's-1', resume_token_expires_at: null, photo_path: 'app-1/photo.jpg' }
    scenario.crossExchangeApp = { id: 'app-other' }
    const res = await submitApplication('tok', completeAppData())
    expect(res).toEqual({ ok: false, registered: true })
    expect(scenario.updated).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: FAIL — `submitApplication` currently submits (returns `{ ok: true }` and sets `scenario.updated`) because the backstop does not exist.

- [ ] **Step 3: Add the `registered` member to `ApplyWriteResult`**

In `actions/apply.ts`, `ApplyWriteResult` currently reads:

```typescript
export type ApplyWriteResult = { ok: true } | { ok: false; overLimit: string[] }
```

Change it to:

```typescript
export type ApplyWriteResult =
  | { ok: true }
  | { ok: false; overLimit: string[] }
  | { ok: false; registered: true }
```

- [ ] **Step 4: Add the backstop check**

In `submitApplication`, AFTER the `await assertExchangeWritable(admin, app.exchange_id)` line (the last check before the final `const { error } = await admin.from('applications').update({ … status: 'submitted' … })`), insert:

```typescript
  // Race backstop for the start-time duplicate guard: if this email started this
  // draft and THEN entered the funnel in another exchange of the school (a
  // parallel session), block here rather than letting the eventual « Oui » hit
  // email_exists. Same per-school rule as startApplication; the same-exchange row
  // being submitted is excluded by .neq('exchange_id', …).
  const { data: elsewhere } = await admin
    .from('applications')
    .select('id')
    .eq('school_id', app.school_id)
    .eq('email', app.email)
    .neq('exchange_id', app.exchange_id)
    .limit(1)
    .maybeSingle()
  if (elsewhere) return { ok: false, registered: true }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test actions/__tests__/applications.test.ts`
Expected: PASS — the new backstop test and all existing `submitApplication` tests are green (existing tests leave `crossExchangeApp` at its `null` default, so the backstop never fires).

- [ ] **Step 6: Commit**

```bash
git add actions/apply.ts actions/__tests__/applications.test.ts
git commit -m "feat(apply): add submit-time backstop for cross-exchange duplicates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Handle `registered` on the application start form

**Files:**
- Modify: `components/ApplicationStartForm.tsx`

**Interfaces:**
- Consumes: `startApplication` returning `{ registered: true }` (Task 1).
- Produces: user-facing neutral message + `/login` link. No test harness for this component → verified by `pnpm build`.

- [ ] **Step 1: Add the `registered` notice copy**

In `components/ApplicationStartForm.tsx`, the `NOTICE` object ends with the `closed` entry. Add a `registered` entry so it reads:

```typescript
  closed: {
    en: 'Applications are closed for this exchange.',
    fr: 'Les candidatures sont fermées pour cet échange.',
  },
  registered: {
    en: 'This email is already registered for an exchange. If you already have an account, log in to continue.',
    fr: 'Cette adresse e-mail est déjà associée à une candidature. Si tu as déjà un compte, connecte-toi pour continuer.',
  },
} as const
```

- [ ] **Step 2: Widen the `notice` state type**

Change:

```typescript
  const [notice, setNotice] = useState<'draft' | 'submitted' | 'closed' | null>(null)
```

to:

```typescript
  const [notice, setNotice] = useState<'draft' | 'submitted' | 'closed' | 'registered' | null>(null)
```

- [ ] **Step 3: Handle the `registered` result in `start()`**

In `start()`, immediately AFTER the `if ('invalidEmail' in res) { … }` block and BEFORE `setNotice(res.existing)`, insert:

```typescript
      if ('registered' in res) {
        setNotice('registered')
        setLoading(false)
        return
      }
```

- [ ] **Step 4: Render the login link under the notice**

Replace the notice render line:

```tsx
        {notice && <p className="m-0 rounded-[10px] bg-[#E6ECFD] px-4 py-3 text-sm leading-relaxed text-[#1D48C7]">{NOTICE[notice][lang]}</p>}
```

with:

```tsx
        {notice && (
          <div className="rounded-[10px] bg-[#E6ECFD] px-4 py-3 text-sm leading-relaxed text-[#1D48C7]">
            <p className="m-0">{NOTICE[notice][lang]}</p>
            {notice === 'registered' && (
              <a href="/login" className="mt-1 inline-block font-semibold underline">{fr ? 'Se connecter' : 'Log in'}</a>
            )}
          </div>
        )}
```

- [ ] **Step 5: Verify types + build**

Run: `pnpm build`
Expected: PASS — no TypeScript errors. This also resolves the pre-existing `ApplicationStartForm.tsx` type error, since `res` now narrows cleanly to `{ existing: … }` at `setNotice(res.existing)` after the `token`/`closed`/`invalidEmail`/`registered` guards.

- [ ] **Step 6: Commit**

```bash
git add components/ApplicationStartForm.tsx
git commit -m "feat(apply): show 'already registered — log in' on the start form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Handle the `registered` backstop at submit

**Files:**
- Modify: `components/ApplicationForm.tsx` (the `T` copy object `:22-25`, and `onSubmit` `:80-92`)

**Interfaces:**
- Consumes: `submitApplication` returning `{ ok: false; registered: true }` (Task 2).
- Produces: user-facing error message. No test harness for this component → verified by `pnpm build`.

- [ ] **Step 1: Add the `registered` copy to both languages**

In `components/ApplicationForm.tsx`, in the `T` object, add a `registered` key to each language. In the `en` object add (e.g. right after `unexpected: 'An unexpected error occurred.',`):

```typescript
registered: 'This email is already registered for an exchange. Please log in to your account instead.',
```

In the `fr` object add (right after `unexpected: 'Une erreur est survenue.',`):

```typescript
registered: 'Cette adresse e-mail est déjà associée à une candidature. Connecte-toi à ton compte.',
```

- [ ] **Step 2: Handle the `registered` branch in `onSubmit`**

Replace the current `if (!res.ok) { … }` block:

```tsx
      const res = await submitApplication(token, data)
      if (!res.ok) {
        setMissing(res.overLimit)
        setError(t.tooLong)
        document.getElementById(`field-${res.overLimit[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        setSubmitting(false)
        return
      }
```

with:

```tsx
      const res = await submitApplication(token, data)
      if (!res.ok) {
        if ('registered' in res) {
          setError(t.registered)
          setSubmitting(false)
          return
        }
        setMissing(res.overLimit)
        setError(t.tooLong)
        document.getElementById(`field-${res.overLimit[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        setSubmitting(false)
        return
      }
```

- [ ] **Step 3: Verify types + build**

Run: `pnpm build`
Expected: PASS — no TypeScript errors. Inside the `!res.ok` block, `'registered' in res` narrows the union so `res.overLimit` is only accessed on the `overLimit` member.

- [ ] **Step 4: Commit**

```bash
git add components/ApplicationForm.tsx
git commit -m "feat(apply): surface the cross-exchange backstop at submit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final Verification

Run the full gate and confirm all green before considering the work complete:

- [ ] `pnpm lint` → no errors
- [ ] `pnpm test` → full suite passes
- [ ] `pnpm build` → type-check + build succeed

`pnpm test:rls` is not required (no migration, RLS, or storage changes).

## Coverage map (spec → task)

- Spec §Rule / per-school scope, cross-exchange block at start → Task 1
- Spec §Changes #1 (`startApplication` type + logic) → Task 1
- Spec §Changes #2 (`submitApplication` backstop) → Task 2
- Spec §Changes #3 (`ApplicationStartForm` registered message + `/login`, fix invalidEmail type error) → Task 3
- Spec §Changes #4 (tests) → Tasks 1 & 2 (server tests); client components verified via build
- Spec: submit backstop client surface (`ApplicationForm`) → Task 4
