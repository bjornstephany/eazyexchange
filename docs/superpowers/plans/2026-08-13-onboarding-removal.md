# Onboarding Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the forced `/onboarding` flow so a confirmed organizer lands directly on `/dashboard` with an empty state and creates their first exchange through the normal `NewExchangeModal`.

**Architecture:** Pure unwiring. The onboarding route (`app/onboarding/page.tsx`) is deleted and the hard gate in `app/(organizer)/layout.tsx` is removed; the three redirect targets that pointed at `/onboarding` are repointed at `/dashboard`. Every onboarding *module* (form, combobox, actions, `lib/onboarding/*`) stays on disk, unreferenced and still unit-tested, so the flow can be re-wired later without archaeology. Two small UI hardenings are needed because `schools.name` is now permanently blank for new accounts.

**Tech Stack:** Next.js 14+ App Router (Server Components), TypeScript, Vitest + @testing-library/react, Playwright (smoke), next-intl, pnpm.

## Global Constraints

- Package manager is **pnpm**, never npm.
- **No migration and no RLS change** in this plan, so `pnpm test:rls` is not required.
- Verification gate before considering work complete: `pnpm lint`, `pnpm test`, `pnpm build`.
- Run vitest with `--exclude '**/.claude/**'` when running the whole suite, so a neighbouring worktree's tests are not swept in.
- **Never `git add -A` / `git add .`** — stage only the files named in each task.
- **Confirm the branch before every commit** (`git branch --show-current` must print `feature/remove-onboarding-steps`).
- Parked modules must be **kept on disk and left byte-for-byte unchanged**: `app/onboarding/OnboardingForm.tsx`, `app/onboarding/SchoolCombobox.tsx`, `app/onboarding/__tests__/OnboardingForm.test.tsx`, `actions/onboarding.ts`, `actions/__tests__/onboarding.test.ts`, `actions/__tests__/onboarding-first-exchange.test.ts`, `actions/__tests__/search-schools.test.ts`, `lib/onboarding/gate.ts`, `lib/onboarding/draft.ts`, `lib/onboarding/first-exchange.ts`, `lib/onboarding/__tests__/*`. Their tests must keep passing untouched — that is the proof the parked code still works.
- User-facing copy is French and lives in `messages/*.json`. **This plan adds no new copy and no new message keys.**
- Do not touch `NewExchangeModal`, `createExchange`, `EmptyDashboard`, or the onboarding tour.

---

## Deviations from the spec (verified against the code)

The spec `docs/superpowers/specs/2026-08-13-onboarding-removal-design.md` is accurate about the unwiring but understates the test and UI work. These were verified by reading the files, and the plan below covers them:

1. **The spec's "Tests that must change" list is incomplete.** Two more tests assert `/onboarding` and will go red:
   - `app/(auth)/signup/__tests__/actions.test.ts:77` — `expect(arg.options.emailRedirectTo).toBe('https://app.test/onboarding')`
   - `app/(auth)/signup/__tests__/page.order.test.tsx:57,59` — `toMatchObject({ intent: 'organizer_signup', next: '/onboarding' })`

   Covered by Task 2.

2. **`tests/smoke/signup.spec.ts` needs two assertions changed, not one.** The spec names only line 75 (the URL); line 76 also asserts `page.getByText(/établissement/i)`, which is onboarding step 1 copy and does not exist on `/dashboard`. Covered by Task 5.

3. **The spec files two UI behaviors under "Consequences" as if already true; neither is.** They are required code changes:
   - `components/shell/OrganizerShell.tsx:200` renders `{schoolName}` bare — there is **no** fallback to `organizerName`. Covered by Task 3.
   - `components/settings/ProfileCard.tsx` renders the locked school-name row **unconditionally** (`fields` array, lines 49–57) *and* the avatar subtitle (lines 69–71). Neither is skipped when the value is empty. Covered by Task 4.

Everything else in the spec checked out, including its claim that each organizer page already survives `active === null` (`app/(organizer)/settings/page.tsx:36–43` guards both `getProgramInfo` and `getProgramDetails` behind `if (active)`).

---

## File Structure

**Deleted**

| Path | Why |
| --- | --- |
| `app/onboarding/page.tsx` | The route itself. Deleting only `page.tsx` (not the directory) is what makes `/onboarding` 404 while the parked components stay on disk. |
| `app/__tests__/onboarding-page.test.ts` | Imports the deleted page; asserts only redirect behavior that no longer exists. |

**Modified**

| Path | Responsibility after the change |
| --- | --- |
| `app/(organizer)/layout.tsx` | Organizer shell. Loses the `mustOnboard` gate and its import; keeps the auth, role and approval gates. |
| `app/robots.ts` | Crawl-surface record. Loses the now-dead `/onboarding` disallow entry. |
| `app/(auth)/signup/actions.ts` | `emailRedirectTo` → `/dashboard`; two stale comments corrected. |
| `app/(auth)/signup/page.tsx` | `GoogleButton next` → `/dashboard`. |
| `components/shell/OrganizerShell.tsx` | `/settings` header falls back to the organizer's name when the school name is blank. |
| `components/settings/ProfileCard.tsx` | Skips the school-name field *and* the avatar subtitle when the school name is blank. |
| `tests/smoke/signup.spec.ts` | Post-confirmation assertion targets `/dashboard` + the empty-dashboard heading. |
| `app/(auth)/signup/__tests__/actions.test.ts` | Asserts `/dashboard`. |
| `app/(auth)/signup/__tests__/page.order.test.tsx` | Asserts `next: '/dashboard'`. |
| `app/__tests__/confirm.test.ts` | Stale `/onboarding` fixture + comment. |
| `components/shell/__tests__/OrganizerShell.test.tsx` | New blank-school header case; `renderShell` gains a `schoolName` override. |
| `components/settings/__tests__/SettingsView.test.tsx` | New blank-school ProfileCard cases. |
| `lib/auth/provision.ts`, `app/auth/confirm/route.ts`, `actions/settings.ts`, `lib/tour/steps.ts`, `lib/exchange/travel-dates.ts`, `app/(auth)/__tests__/signup.test.tsx`, `lib/auth/__tests__/provision.test.ts` | Comment-only corrections (Task 6). ProfileCard's own stale comment is rewritten in Task 4, not here. |

**Untouched, kept on disk** — every path in the Global Constraints parking list.

---

### Task 1: Delete the route and remove the gate

The existing `app/__tests__/seo-crawl-surface.test.ts` is the enforcing test for both halves of this task: its `'disallows nothing that is not a real route'` case derives route segments from the filesystem (a directory only counts as a segment if it contains a `page.tsx`) and fails when `robots.ts` disallows a path with no page behind it. So deleting `page.tsx` makes it go red, and removing the robots entry makes it green — a real red/green cycle with no new test to write.

**Files:**
- Delete: `app/onboarding/page.tsx`
- Delete: `app/__tests__/onboarding-page.test.ts`
- Modify: `app/(organizer)/layout.tsx:10` (import) and `app/(organizer)/layout.tsx:69-73` (the gate)
- Modify: `app/robots.ts` (one array entry)
- Test (existing, unmodified): `app/__tests__/seo-crawl-surface.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `/onboarding` no longer resolves. `lib/onboarding/gate.ts`'s `mustOnboard(schoolName: string, ownedExchangeCount: number): boolean` keeps its export and its own unit test, but has **zero callers** after this task.

- [ ] **Step 1: Delete the route file and its route-level test**

```bash
git rm app/onboarding/page.tsx app/__tests__/onboarding-page.test.ts
```

Delete **only** these two. `app/onboarding/OnboardingForm.tsx`, `app/onboarding/SchoolCombobox.tsx` and `app/onboarding/__tests__/OnboardingForm.test.tsx` stay — the directory survives without a `page.tsx`, which is exactly what makes the segment disappear from the crawl surface while the components remain importable.

- [ ] **Step 2: Run the crawl-surface test to verify it now fails**

Run:

```bash
pnpm vitest run app/__tests__/seo-crawl-surface.test.ts
```

Expected: FAIL on `'disallows nothing that is not a real route'`, with `expected [ '/onboarding' ] to deeply equal []` (or `[ 'onboarding' ]` — the assertion strips the leading slash). The other cases in the file still pass.

- [ ] **Step 3: Remove the `/onboarding` entry from robots.ts**

In `app/robots.ts`, delete the single line from the `disallow` array:

```ts
        '/onboarding',
```

The surrounding entries (`'/accept-invite',` above it and `'/billing',` below it) are unchanged; do not reorder or reformat the rest of the array.

- [ ] **Step 4: Run the crawl-surface test to verify it passes**

Run:

```bash
pnpm vitest run app/__tests__/seo-crawl-surface.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Remove the gate from the organizer layout**

In `app/(organizer)/layout.tsx`, delete the import on line 10:

```ts
import { mustOnboard } from '@/lib/onboarding/gate'
```

Then delete the gate block (lines 69–73 before the import removal shifts them), which currently reads:

```ts
  // Hard gate: no organizer page renders until the school is named AND owns at
  // least one exchange. Catches fresh signups and existing empty accounts.
  // ownedCount includes archived exchanges, so archiving your only exchange
  // does not re-trap you here.
  if (school && mustOnboard(school.name, ownedCount)) redirect('/onboarding')
```

Two things to be careful about, both easy to get wrong:

- **Keep the `redirect` import.** It is still used three times above, for `/login`, `shellDestination(...)` and `/pending`.
- **Keep `ownedCount`.** It looks orphaned once the gate goes, but the four lines below it still read it:

```ts
  const cap = school ? exchangeCap(school as never) : TRIAL_EXCHANGE_CAP
  const atCap = ownedCount >= cap
```

- [ ] **Step 6: Verify the layout still type-checks and the layout test passes**

Run:

```bash
npx tsc --noEmit
pnpm vitest run "app/(organizer)/__tests__/layout.intl.test.tsx"
```

Expected: `tsc` prints nothing (exit 0); the layout test PASSes.

If `tsc` reports a `TS2307` about a module under `.next/types`, that is a stale build cache, not real breakage — run `rm -rf .next` and re-run.

- [ ] **Step 7: Confirm the parked modules are untouched and still pass**

Run:

```bash
pnpm vitest run lib/onboarding actions/__tests__/onboarding.test.ts actions/__tests__/onboarding-first-exchange.test.ts actions/__tests__/search-schools.test.ts app/onboarding/__tests__/OnboardingForm.test.tsx
```

Expected: PASS, with **no file edits needed**. `actions/__tests__/onboarding-first-exchange.test.ts` now covers unreachable code — that is the point of parking, so do not delete or skip it.

- [ ] **Step 8: Confirm the branch, then commit**

```bash
git branch --show-current
```

Expected: `feature/remove-onboarding-steps`. If it prints anything else, stop and report.

```bash
git add app/robots.ts "app/(organizer)/layout.tsx"
git commit -m "feat(onboarding): delete the /onboarding route and its hard gate"
```

(`git rm` in Step 1 already staged the two deletions.)

---

### Task 2: Repoint the two signup redirect targets at /dashboard

Both call sites already have tests asserting `/onboarding`, so this task is test-first by editing those assertions to the new expectation and watching them fail.

**Files:**
- Modify: `app/(auth)/signup/actions.ts:82`
- Modify: `app/(auth)/signup/page.tsx:198`
- Test: `app/(auth)/signup/__tests__/actions.test.ts:77`
- Test: `app/(auth)/signup/__tests__/page.order.test.tsx:57,59`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: the post-confirmation destination is `/dashboard`, which Task 5's smoke test asserts end-to-end.

- [ ] **Step 1: Update both assertions to the new destination**

In `app/(auth)/signup/__tests__/actions.test.ts`, change line 77 from:

```ts
    expect(arg.options.emailRedirectTo).toBe('https://app.test/onboarding')
```

to:

```ts
    expect(arg.options.emailRedirectTo).toBe('https://app.test/dashboard')
```

In `app/(auth)/signup/__tests__/page.order.test.tsx`, change the test name and assertion (lines 57 and 59) from:

```tsx
  it('keeps intent=organizer_signup and next=/onboarding on the signup Google button', () => {
    render(<SignupPage />)
    expect(googleProps[0]).toMatchObject({ intent: 'organizer_signup', next: '/onboarding' })
  })
```

to:

```tsx
  it('keeps intent=organizer_signup and next=/dashboard on the signup Google button', () => {
    render(<SignupPage />)
    expect(googleProps[0]).toMatchObject({ intent: 'organizer_signup', next: '/dashboard' })
  })
```

Leave the three-line comment above that test (about `app/auth/callback/route.ts` deleting orphan auth rows) exactly as it is — it documents the `intent` prop, which is unchanged and still load-bearing.

- [ ] **Step 2: Run both tests to verify they fail**

Run:

```bash
pnpm vitest run "app/(auth)/signup/__tests__/actions.test.ts" "app/(auth)/signup/__tests__/page.order.test.tsx"
```

Expected: two FAILures —
`expected 'https://app.test/onboarding' to be 'https://app.test/dashboard'` and
`expected { … next: '/onboarding' } to match object { … next: '/dashboard' }`.

- [ ] **Step 3: Repoint the email confirmation redirect**

In `app/(auth)/signup/actions.ts`, replace the two-line comment and the `emailRedirectTo` line (lines 74–82) — currently:

```ts
  // Full name is all provisionOrganizer reads. The establishment is captured at
  // /onboarding step 1, where it is validated against school_registry.
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
    },
  })
```

with:

```ts
  // Full name is all provisionOrganizer reads. The establishment is no longer
  // captured anywhere: the /onboarding flow that collected it was removed on
  // 2026-08-13, so schools.name stays blank and the organizer goes straight to
  // the (empty) dashboard to create their first exchange.
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  })
```

- [ ] **Step 4: Repoint the Google button**

In `app/(auth)/signup/page.tsx`, change line 198 from:

```tsx
          <GoogleButton intent="organizer_signup" next="/onboarding" label="Google" />
```

to:

```tsx
          <GoogleButton intent="organizer_signup" next="/dashboard" label="Google" />
```

`intent="organizer_signup"` must stay — `app/auth/callback/route.ts` signs out and deletes the orphan auth row of any Google user without it.

- [ ] **Step 5: Run both tests to verify they pass**

Run:

```bash
pnpm vitest run "app/(auth)/signup/__tests__/actions.test.ts" "app/(auth)/signup/__tests__/page.order.test.tsx" "app/(auth)/__tests__/signup.test.tsx"
```

Expected: PASS, all three files.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add "app/(auth)/signup/actions.ts" "app/(auth)/signup/page.tsx" "app/(auth)/signup/__tests__/actions.test.ts" "app/(auth)/signup/__tests__/page.order.test.tsx"
git commit -m "feat(signup): send confirmed organizers to /dashboard instead of /onboarding"
```

---

### Task 3: OrganizerShell header falls back to the organizer's name

`components/shell/OrganizerShell.tsx:199-200` renders the school name as the header title on `/settings`. With no capture path, that is an empty `<span>` for every new account — a blank header bar. Fall back to `organizerName`, which is already a prop in scope (destructured at line 51).

**Files:**
- Modify: `components/shell/OrganizerShell.tsx:199-200`
- Modify: `components/shell/__tests__/OrganizerShell.test.tsx` (`renderShell` helper, lines 31–43; new test after line 173)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature change. `OrganizerShell`'s props are unchanged — `schoolName: string` and `organizerName: string` both stay required.

- [ ] **Step 1: Give `renderShell` a `schoolName` override**

In `components/shell/__tests__/OrganizerShell.test.tsx`, replace the helper (lines 31–43) — currently:

```tsx
function renderShell({ pathname = '/dashboard' }: { pathname?: string } = {}) {
  mockPathname = pathname
  return renderWithIntl(
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId="ex1"
      organizerName="Marie Bernard"
      schoolName="Lycée Mistral"
    >
      <p>page</p>
    </OrganizerShell>
  )
}
```

with:

```tsx
function renderShell(
  { pathname = '/dashboard', schoolName = 'Lycée Mistral' }:
    { pathname?: string; schoolName?: string } = {},
) {
  mockPathname = pathname
  return renderWithIntl(
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId="ex1"
      organizerName="Marie Bernard"
      schoolName={schoolName}
    >
      <p>page</p>
    </OrganizerShell>
  )
}
```

Every existing caller passes either nothing or `{ pathname }`, so the default keeps them all green.

- [ ] **Step 2: Write the failing test**

Add this immediately after the existing `'shows the school name and no session controls on /settings'` test (which ends at line 173):

```tsx
  // Since the /onboarding flow was removed there is no capture path for
  // schools.name, so it is blank for every account created after 2026-08-13.
  // An empty header title reads as a broken shell; fall back to the organizer.
  it('falls back to the organizer name in the /settings header when the school is blank', () => {
    renderShell({ pathname: '/settings', schoolName: '' })
    const header = document.querySelector('header')!
    expect(header.textContent).toContain('Marie Bernard')
  })
```

Scoping the assertion to `<header>` matters: `organizerName` also appears in the sidebar account menu, so a bare `getByText` would pass without the fallback ever running.

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx -t 'falls back to the organizer name'
```

Expected: FAIL — the header renders an empty title span, so `header.textContent` does not contain `Marie Bernard`.

- [ ] **Step 4: Add the fallback**

In `components/shell/OrganizerShell.tsx`, change line 200 from:

```tsx
              <span className="font-display text-base font-semibold text-navy">{schoolName}</span>
```

to:

```tsx
              {/* schools.name has had no capture path since /onboarding was
                  removed (2026-08-13), so it is blank on every new account.
                  The organizer's own name beats an empty header bar. */}
              <span className="font-display text-base font-semibold text-navy">{schoolName || organizerName}</span>
```

- [ ] **Step 5: Run the whole shell test file to verify it passes**

Run:

```bash
pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx
```

Expected: PASS. In particular the pre-existing `'shows the school name and no session controls on /settings'` must still pass — with a non-empty `schoolName` the `||` short-circuits to it.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add components/shell/OrganizerShell.tsx components/shell/__tests__/OrganizerShell.test.tsx
git commit -m "fix(shell): fall back to the organizer name when the school name is blank"
```

---

### Task 4: ProfileCard skips the school-name row when blank

`components/settings/ProfileCard.tsx` renders the school name twice: as the avatar subtitle (lines 69–71) and as a locked, disabled, hinted input in the `fields` array (lines 52–56). With a permanently blank value, that is an empty subtitle plus a labelled empty box whose hint tells the organizer to contact support to change a value they can't see. Skip both.

**Files:**
- Modify: `components/settings/ProfileCard.tsx:45-57` (comment + `fields` array), `:69-71` (subtitle)
- Test: `components/settings/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature change. `ProfileCard`'s prop stays `profile: { fullName: string; email: string; schoolName: string }` — `schoolName` remains required and non-nullable; the empty string is the blank signal, matching `app/(organizer)/settings/page.tsx:51` which already passes `profile.schools?.name ?? ''`.

- [ ] **Step 1: Write the failing tests**

In `components/settings/__tests__/SettingsView.test.tsx`, add this `describe` block at the end of the file:

```tsx
// Since /onboarding was removed (2026-08-13) nothing writes schools.name, so it
// is '' for every new account. A labelled, disabled, permanently-empty input
// with a "contact support to change it" hint is worse than no row at all.
describe('SettingsView — blank school name', () => {
  const blank = { ...baseProps, profile: { ...baseProps.profile, schoolName: '' } }

  it('omits the locked school-name field entirely', () => {
    render(<SettingsView {...blank} />)
    expect(screen.queryByLabelText('Établissement')).toBeNull()
    expect(
      screen.queryByText(/L’établissement est défini à la création du compte/)
    ).toBeNull()
  })

  it('still renders the other profile fields', () => {
    render(<SettingsView {...blank} />)
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Marie Blanchet')
    expect(screen.getByLabelText('Adresse e-mail')).toBeDisabled()
  })

  it('keeps rendering the field when a school name exists', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByLabelText('Établissement')).toHaveValue('Lycée Frédéric Mistral')
  })
})
```

Note the typographic apostrophe (U+2019, `’`) in the hint regex — `messages/fr.json:61` uses it, and a straight `'` will not match.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm vitest run components/settings/__tests__/SettingsView.test.tsx -t 'blank school name'
```

Expected: the first case FAILs (`queryByLabelText('Établissement')` finds the input rather than returning `null`). The second and third cases already pass — that is fine and intentional; they are the regression guards for what must *not* change.

- [ ] **Step 3: Make the field conditional**

In `components/settings/ProfileCard.tsx`, replace the comment and `fields` array (lines 45–57) — currently:

```tsx
  // The school name is read-only for every organizer, in every country: it is
  // set once at account creation (from school_registry in France) and there is
  // deliberately no client write path to schools.name. Changing establishment
  // is a rare, support-worthy event.
  const fields: { key: 'fullName' | 'email' | 'schoolName'; label: string; value: string; disabled?: boolean; hint?: string }[] = [
    { key: 'fullName', label: t('settings.profile.fullNameLabel'), value: fullName },
    { key: 'email', label: t('settings.profile.emailLabel'), value: profile.email, disabled: true, hint: t('settings.profile.emailHint') },
    {
      key: 'schoolName', label: t('settings.profile.schoolNameLabel'),
      value: profile.schoolName, disabled: true,
      hint: t('settings.profile.schoolNameLockedHint'),
    },
  ]
```

with:

```tsx
  // The school name is read-only for every organizer, in every country: there
  // is deliberately no client write path to schools.name, and the only writer
  // (the claim_school RPC, called from /onboarding step 1) lost its caller when
  // the onboarding flow was removed on 2026-08-13. So it is populated only on
  // accounts created before that date, and blank on every account since — the
  // row is skipped rather than rendered as a labelled, permanently-empty box.
  const fields: { key: 'fullName' | 'email' | 'schoolName'; label: string; value: string; disabled?: boolean; hint?: string }[] = [
    { key: 'fullName', label: t('settings.profile.fullNameLabel'), value: fullName },
    { key: 'email', label: t('settings.profile.emailLabel'), value: profile.email, disabled: true, hint: t('settings.profile.emailHint') },
    ...(profile.schoolName
      ? [{
          key: 'schoolName' as const, label: t('settings.profile.schoolNameLabel'),
          value: profile.schoolName, disabled: true,
          hint: t('settings.profile.schoolNameLockedHint'),
        }]
      : []),
  ]
```

The `as const` on `key` is load-bearing: without it the spread element widens to `string` and fails to match the annotated element type.

- [ ] **Step 4: Make the avatar subtitle conditional**

In the same file, replace the subtitle (lines 69–71) — currently:

```tsx
          <div className="mt-0.5 text-[13px] text-tertiary">
            {profile.schoolName}
          </div>
```

with:

```tsx
          {profile.schoolName ? (
            <div className="mt-0.5 text-[13px] text-tertiary">{profile.schoolName}</div>
          ) : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm vitest run components/settings/__tests__/SettingsView.test.tsx
npx tsc --noEmit
```

Expected: the whole file PASSes — including the pre-existing `'renders H1, subline and the profile fields'` case, which asserts `getByLabelText('Établissement')` with a populated name. `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add components/settings/ProfileCard.tsx components/settings/__tests__/SettingsView.test.tsx
git commit -m "fix(settings): skip the locked school-name row when the school is unnamed"
```

---

### Task 5: Point the signup smoke test at the empty dashboard

`tests/smoke/signup.spec.ts` walks a real signup through the confirmation link. Both of its post-confirmation assertions are onboarding-specific.

**Files:**
- Modify: `tests/smoke/signup.spec.ts:73-77`
- Modify: `app/__tests__/confirm.test.ts:40,43`

**Interfaces:**
- Consumes: Task 2's `/dashboard` redirect target (the smoke test asserts it end-to-end) and Task 1's deleted gate (without it, `/dashboard` would bounce back to `/onboarding`). **Run Tasks 1 and 2 before this one.**
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Update the smoke assertions**

In `tests/smoke/signup.spec.ts`, replace lines 73–77 — currently:

```ts
  // Allowlisted means set_initial_user_status() approves on insert, so there is
  // no /pending stop: the account goes straight to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 })
  await expect(page.getByText(/établissement/i).first()).toBeVisible()
})
```

with:

```ts
  // Allowlisted means set_initial_user_status() approves on insert, so there is
  // no /pending stop; and there is no onboarding gate any more (removed
  // 2026-08-13), so the account goes straight to an empty dashboard.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 })
  // Positive assertion, deliberately: a thrown page still returns 200 with an
  // empty shell, so only asserting the URL would pass on a broken render.
  await expect(page.getByText(/Aucun échange/i).first()).toBeVisible()
})
```

`Aucun échange pour l’instant` is `messages/fr.json:420` (`organizer.dashboard.emptyHeading`), rendered by `components/dashboard/EmptyDashboard.tsx:19`. The regex stops short of the apostrophe on purpose.

- [ ] **Step 2: Fix the stale `/onboarding` fixture in the confirm test**

`app/__tests__/confirm.test.ts` feeds `/onboarding` in as a `next` value. The test passes either way (the assertion is that `/pending` overrides whatever `next` says), but the fixture and its comment now describe a route that does not exist. Replace lines 40–44 — currently:

```ts
  // `next` points at /onboarding, which the approval gate bounces anyway.
  it('overrides next with /pending for a signup that landed pending', async () => {
    provisionOrganizer.mockResolvedValueOnce({ ok: true, status: 'pending' })
    const dest = await getRedirect('token_hash=h&type=signup&next=/onboarding')
    expect(dest).toBe('/pending')
  })
```

with:

```ts
  // `next` points at /dashboard, which the approval gate bounces anyway.
  it('overrides next with /pending for a signup that landed pending', async () => {
    provisionOrganizer.mockResolvedValueOnce({ ok: true, status: 'pending' })
    const dest = await getRedirect('token_hash=h&type=signup&next=/dashboard')
    expect(dest).toBe('/pending')
  })
```

- [ ] **Step 3: Verify the confirm test passes**

Run:

```bash
pnpm vitest run app/__tests__/confirm.test.ts
```

Expected: PASS.

- [ ] **Step 4: Verify the smoke spec at least parses**

Run:

```bash
npx tsc --noEmit
```

Expected: nothing printed. The Playwright suite itself needs a seeded local stack and is run by `pnpm ship`; it is exercised in Task 7, not here.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add tests/smoke/signup.spec.ts app/__tests__/confirm.test.ts
git commit -m "test: point the signup smoke at the empty dashboard"
```

---

### Task 6: Correct the comments that still describe /onboarding as live

Seven files carry comments asserting that the establishment is captured at "/onboarding step 1" or that the flow exists. None affect behavior, but each is a false statement that a future reader would act on. This task is comment-only — **no executable line changes**.

**Files:**
- Modify: `lib/auth/provision.ts:42`
- Modify: `app/auth/confirm/route.ts:35`
- Modify: `actions/settings.ts:48`
- Modify: `lib/tour/steps.ts:21`
- Modify: `lib/exchange/travel-dates.ts:2,10`
- Modify: `app/(auth)/__tests__/signup.test.tsx:44`
- Modify: `lib/auth/__tests__/provision.test.ts:88`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Record the before-state so the diff can be checked**

Run:

```bash
pnpm vitest run lib/auth/__tests__/provision.test.ts "app/(auth)/__tests__/signup.test.tsx" app/__tests__/confirm.test.ts
```

Expected: PASS. This is the baseline — the same command must give the same result in Step 3.

- [ ] **Step 2: Rewrite each comment**

Each block below is an exact find-and-replace. Match the "currently" text verbatim, including indentation.

**`lib/auth/provision.ts:42-45`** — currently:

```ts
// The school is always created blank. /onboarding step 1 names it through
// claim_school(), which re-validates the pick against school_registry; signup
// deliberately asks for nothing but the name, and signup_allowlist (checked
// before this function is ever reached) is what keeps fake schools out.
```

replace with:

```ts
// The school is always created blank, and now stays that way. /onboarding step
// 1 was the only thing that ever named it — via claim_school(), which
// re-validated the pick against school_registry — and it was removed on
// 2026-08-13, so claim_school() survives as an RPC with no caller. Signup asks
// for nothing but the name, and signup_allowlist (checked before this function
// is ever reached) is what keeps fake schools out.
```

**`app/auth/confirm/route.ts:35-36`** — currently:

```ts
        // A self-signup lands pending: `next` points at /onboarding, which the
        // approval gate would bounce anyway. Go straight to the holding page.
```

replace with:

```ts
        // A self-signup lands pending: `next` points at /dashboard, which the
        // approval gate would bounce anyway. Go straight to the holding page.
```

**`actions/settings.ts:47-48`** — currently:

```ts
// from school_registry via claim_school(); every other country's name is typed
// once at onboarding. Both change only through support.
```

replace with:

```ts
// came from school_registry via claim_school(), and every other country's name
// was typed once at onboarding — but that flow was removed on 2026-08-13, so
// nothing sets the name any more. Both change only through support.
```

**`lib/tour/steps.ts:20-22`** — currently:

```ts
// Order is deliberately NOT sidebar order. Candidatures comes first because it
// is where onboarding drops the organizer and where their real work starts;
// Aperçu comes late because a progress rollup means nothing until students
```

replace with:

```ts
// Order is deliberately NOT sidebar order. Candidatures comes first because it
// is where an organizer's real work starts; Aperçu comes late because a
// progress rollup means nothing until students
```

Watch the line break: the original third line ends mid-sentence with `until students` and continues on the next line with `exist.` — leave that continuation line alone.

**`lib/exchange/travel-dates.ts:1-2`** — currently:

```ts
// The one travel-date ordering rule, shared by every surface that writes
// exchange_program_details: onboarding's first-exchange step, Réglages →
```

replace with:

```ts
// The one travel-date ordering rule, shared by every surface that writes
// exchange_program_details: Réglages →
```

**`lib/exchange/travel-dates.ts:9-10`** — currently:

```ts
// Null when the pair is fine OR when either date is still blank — required-ness
// is each caller's own rule (onboarding demands both, Réglages allows neither).
```

replace with:

```ts
// Null when the pair is fine OR when either date is still blank — required-ness
// is each caller's own rule (Réglages allows neither). Onboarding's
// first-exchange step demanded both; it was removed on 2026-08-13 and
// lib/onboarding/first-exchange.ts is parked, unreferenced.
```

**`app/(auth)/__tests__/signup.test.tsx:43-46`** — currently:

```tsx
  // Creating an account asks for the three things an account needs. The
  // establishment is captured at /onboarding step 1, which validates it against
  // the registry. Asserting absence is the point — re-adding a field would
  // otherwise slip through every other test in this file.
```

replace with:

```tsx
  // Creating an account asks for the three things an account needs. The
  // establishment is not captured anywhere: the /onboarding step that collected
  // it was removed on 2026-08-13. Asserting absence is the point — re-adding a
  // field would otherwise slip through every other test in this file.
```

**`lib/auth/__tests__/provision.test.ts:88-90`** — currently:

```ts
  // The school is created blank on every path. /onboarding step 1 names it
  // through claim_school(), which re-validates against school_registry — so
  // provisioning has no school to resolve and no registry to read.
```

replace with:

```ts
  // The school is created blank on every path, and nothing names it any more:
  // /onboarding step 1 was the only writer (through claim_school()) and was
  // removed on 2026-08-13. Provisioning has no school to resolve and no
  // registry to read.
```

- [ ] **Step 3: Verify nothing executable moved**

Run:

```bash
pnpm vitest run lib/auth/__tests__/provision.test.ts "app/(auth)/__tests__/signup.test.tsx" app/__tests__/confirm.test.ts
npx tsc --noEmit
```

Expected: identical PASS output to Step 1; `tsc` prints nothing.

Then eyeball the diff and confirm every changed line begins with `//` (or is inside a `{/* */}` block):

```bash
git diff -U0 -- lib/auth/provision.ts app/auth/confirm/route.ts actions/settings.ts lib/tour/steps.ts lib/exchange/travel-dates.ts "app/(auth)/__tests__/signup.test.tsx" lib/auth/__tests__/provision.test.ts
```

If any added or removed line is executable code, revert it — this task changes comments only.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add lib/auth/provision.ts app/auth/confirm/route.ts actions/settings.ts lib/tour/steps.ts lib/exchange/travel-dates.ts "app/(auth)/__tests__/signup.test.tsx" lib/auth/__tests__/provision.test.ts
git commit -m "docs: correct the comments that still describe /onboarding as live"
```

---

### Task 7: Full verification gate

Everything above ran targeted tests. This task runs the whole gate and confirms nothing elsewhere regressed.

**Files:** none modified (unless the gate turns something up).

**Interfaces:**
- Consumes: Tasks 1–6, all committed.
- Produces: a branch ready for the browser pass and merge.

- [ ] **Step 1: Confirm no live reference to /onboarding survives**

Run:

```bash
grep -rn "/onboarding" --include=*.ts --include=*.tsx --include=*.mjs . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.claude
```

Expected: **only** hits inside the parked modules and their tests (`app/onboarding/`, `actions/onboarding.ts`, `actions/__tests__/onboarding*.ts`, `actions/__tests__/search-schools.test.ts`, `lib/onboarding/`) plus the historical-context comments written in Task 6, and `scripts/reset-account.mjs`'s prose description of the signup cycle.

Anything else — a `redirect('/onboarding')`, an `href`, a `next=`, an `emailRedirectTo` — is a missed call site: fix it and re-run.

Note that `onboarding@resend.dev` in `lib/email.ts:9`, `scripts/smoke-email.mjs:31` and `supabase/functions/send-reminders/index.ts:29` is a Resend sender address and has nothing to do with this feature. It does not match `/onboarding` and must not be touched.

- [ ] **Step 2: Run the full gate**

```bash
pnpm lint
```

Expected: no errors.

```bash
pnpm vitest run --exclude '**/.claude/**'
```

Expected: the whole suite PASSes.

If a single file fails once and passes on re-run, that is a neighbouring session mid-write, not a regression — re-run the single file before debugging it.

```bash
pnpm build
```

Expected: build succeeds. `/onboarding` must be absent from the route list it prints.

- [ ] **Step 3: Run the Playwright smoke suite**

```bash
pnpm ship
```

Expected: PASS, including `tests/smoke/signup.spec.ts`. This needs a seeded local Supabase stack — `pnpm ship` refuses an unseeded worktree in about 750ms, in which case run `pnpm seed` first.

- [ ] **Step 4: Commit anything the gate forced**

Only if Steps 1–3 required a fix:

```bash
git branch --show-current
git add <the specific files you changed>
git commit -m "fix: <what the gate caught>"
```

- [ ] **Step 5: Report the manual browser checks to Bjorn**

These cannot be automated from here; list them for him rather than claiming them done:

1. Fresh signup on an allowlisted address → confirmation link → lands on `/dashboard` showing `EmptyDashboard` ("Aucun échange pour l'instant") → « Nouvel échange » → exchange created → `OverviewView`.
2. `/settings` on an account with a blank school name → the header shows the organizer's name, and the Compte card has no « Établissement » row.
3. `/onboarding` returns 404.
4. `/settings` on a **pre-2026-08-13** account that does have a school name → the header and the « Établissement » row both still show it (the Task 3 and Task 4 changes must not regress populated accounts).

Do **not** merge to `main` without Bjorn's confirmation — merging deploys to production.
