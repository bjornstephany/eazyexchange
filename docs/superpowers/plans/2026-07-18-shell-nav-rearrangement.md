# Shell navigation rearrangement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move « Réglages » into the left rail as a gear tab, reduce the profile-circle dropdown to « Se déconnecter » only, and move the Feedback button to the top-right of the header.

**Architecture:** Pure client-component rearrangement inside the organizer shell. `OrganizerShell.tsx` renders the rail, the profile dropdown, and the header; all three moves happen there. The feedback icon gains a light-background variant in `RailIcons.tsx` so it reads on the white header. No routes, server actions, data model, RLS, or migrations are touched.

**Tech Stack:** Next.js 14 App Router (client component), React, Tailwind CSS, next-intl (French UI copy), Vitest + Testing Library.

## Global Constraints

- Package manager is **pnpm** (never npm).
- UI copy comes from `next-intl` translation keys — never hardcode French strings in components. Reuse existing keys: `shell.accountMenu.settings` (« Réglages »), `shell.accountMenu.signOut` (« Se déconnecter »), `shell.nav.feedback` (« Feedback »).
- Verifying Changes gate before done: `pnpm lint`, `pnpm test`, `pnpm build`.
- This is a small, self-contained UI change → per CLAUDE.md git workflow it may be committed straight to `main` after the gate passes; no branch required. Commit automatically once tested.

---

### Task 1: Rearrange the shell — gear rail tab, sign-out-only menu, header Feedback

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`
- Modify: `components/shell/RailIcons.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`

**Interfaces:**
- Consumes: existing `RailItem` local component, `IconSettings` and `IconFeedback` from `./RailIcons`, `isSettings` (`pathname.startsWith('/settings')`), `feedbackOpen`/`setFeedbackOpen` state, `handleSignOut`, `FeedbackModal`, `useTranslations('organizer')` as `t`.
- Produces: no new exported symbols. `RailIcons.tsx` gains an exported `IconFeedbackLight` component: `() => JSX.Element` (same shape as `IconFeedback` but with the tail-mask corner using `bg-card` instead of `bg-rail`, so it renders correctly on the light header).

- [ ] **Step 1: Update the existing tests to the new layout**

In `components/shell/__tests__/OrganizerShell.test.tsx`, **replace** the two tests at lines 192–203 (the `'rail contains Élèves but not Réglages…'` and `'Réglages lives in the profile menu…'` tests) with these three tests:

```tsx
  it('rail contains a Réglages gear tab linking to /settings', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByRole('link', { name: /Réglages/ })).toHaveAttribute('href', '/settings')
  })

  it('Réglages gear tab is visible even with no exchanges', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Réglages/ })).toHaveAttribute('href', '/settings')
  })

  it('profile menu contains only Se déconnecter, not Réglages', () => {
    renderShell({ pathname: '/dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }))
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Réglages' })).toBeNull()
  })
```

Then **replace** the last test (lines 205–214, `'shows a Feedback rail button…'`) with:

```tsx
  it('shows a Feedback button in the header that opens the feedback modal', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText('feedback-modal-open')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Feedback/ }))
    expect(screen.getByText('feedback-modal-open')).toBeInTheDocument()
  })
```

Note: the new `'profile menu contains only Se déconnecter…'` test clicks the account trigger button whose accessible name is `'Compte'` (`t('shell.accountMenu.trigger')`) — unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- OrganizerShell`
Expected: FAIL — the new `Réglages`-as-link and header-Feedback assertions fail because Réglages is still in the menu and Feedback is still in the rail.

- [ ] **Step 3: Add the light-background feedback icon**

In `components/shell/RailIcons.tsx`, add below the existing `IconFeedback`:

```tsx
export function IconFeedbackLight() {
  return (
    <div className="relative h-4 w-4 rounded-[3px] rounded-bl-none border-[1.5px] border-current">
      <div className="absolute -bottom-[3px] left-[2px] h-[4px] w-[4px] rotate-45 border-b-[1.5px] border-l-[1.5px] border-current bg-card" />
    </div>
  )
}
```

- [ ] **Step 4: Replace the Feedback rail button with the Réglages gear (pinned bottom, above profile)**

In `components/shell/OrganizerShell.tsx`, update the icon import to include `IconSettings` and `IconFeedbackLight`, and drop `IconFeedback`:

```tsx
import { IconOverview, IconExchanges, IconApplications, IconForms, IconDocs, IconStudents, IconSettings, IconFeedbackLight } from './RailIcons'
```

The rail currently has, between the tab group `</div>` and the profile `menuRef` div, a Feedback `<button>` carrying `mt-auto` (which pushes it + the profile circle to the bottom). **Delete that entire Feedback `<button>` block** (`<button type="button" onClick={() => setFeedbackOpen(true)} className="mt-auto …">` … `</button>`) and put the Réglages gear in its place, keeping the `mt-auto` so the gear is pinned at the bottom of the rail, directly above the profile circle:

```tsx
        <div className="mt-auto">
          <RailItem href="/settings" label={t('shell.accountMenu.settings')} active={isSettings}>
            <IconSettings />
          </RailItem>
        </div>
```

The Réglages gear lives outside the `{active && ( … )}` conditional, so it renders for every organizer whether or not an exchange is active. Leave the profile `menuRef` div as-is (`className="relative mt-2.5"`) — the gear wrapper now carries `mt-auto`.

- [ ] **Step 5: Remove Réglages from the profile dropdown**

In `components/shell/OrganizerShell.tsx`, inside the `{menuOpen && ( … )}` dropdown panel, delete the `<Link href="/settings" …>{t('shell.accountMenu.settings')}</Link>` element, leaving only the « Se déconnecter » button. If the `Link` import from `next/link` is now unused elsewhere in the file, keep it only if still referenced (it is still used by `RailItem`), so leave the import as-is.

- [ ] **Step 6: Add the Feedback button to the header top-right**

In `components/shell/OrganizerShell.tsx`, the header is a `justify-between` row whose right side currently holds only the students search input. Wrap the right side in a flex group and append the Feedback button. Replace the existing conditional search block:

```tsx
          {!isSettings && active && isStudents && (
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder={t('shell.studentSearch.placeholder')}
              className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
            />
          )}
```

with:

```tsx
          <div className="flex items-center gap-3">
            {!isSettings && active && isStudents && (
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t('shell.studentSearch.placeholder')}
                className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
              />
            )}
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="flex h-[38px] items-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              <IconFeedbackLight />
              <span>{t('shell.nav.feedback')}</span>
            </button>
          </div>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test -- OrganizerShell`
Expected: PASS — all tests green, including the three new Réglages tests and the header-Feedback test.

- [ ] **Step 8: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all pass. (`pnpm build` catches any type error from the import change.)

- [ ] **Step 9: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/RailIcons.tsx components/shell/__tests__/OrganizerShell.test.tsx
git commit -m "feat(shell): gear rail tab, sign-out-only menu, header feedback"
```

---

## Notes for the implementer

- Do **not** delete the `IconFeedback` export from `RailIcons.tsx` blindly — grep first (`grep -rn IconFeedback components app`). If nothing else references it after this change, removing it is fine; if unsure, leave it. `IconFeedbackLight` is the one the header uses.
- The `initials()` helper, `SessionSelector`, `NewExchangeModal`, and `FeedbackModal` are untouched.
- Student shell (`components/student/StudentTopBar.tsx`) is out of scope — do not touch it.
