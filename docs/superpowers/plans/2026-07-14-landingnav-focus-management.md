# LandingNav Focus Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proper focus management (focus-on-open, Tab/arrow-key trap, focus restore) and complete ARIA wiring to the language dropdown in `components/landing/LandingNav.tsx`.

**Architecture:** All behavior is hand-rolled inside the existing `LandingNav` component — a `triggerRef`, a `useId()` menu id, a focus-on-open effect keyed on `open`, focus-restore calls in the Escape handler and `pick()`, and an `onKeyDown` cycle handler on the menu container. No new dependencies, no new files besides one test file.

**Tech Stack:** React 18 (Next.js App Router client component), vitest + jsdom, @testing-library/react, @testing-library/user-event (all already installed — see `vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: ['./vitest.setup.ts']`, `globals: true`, alias `@` → repo root).

**Spec (binding):** `docs/superpowers/specs/2026-07-14-landingnav-focus-management-design.md`. Do not re-litigate its decisions — in particular the scoping to the **language dropdown** (there is no hamburger menu) and the deliberate **Tab-trap deviation from strict WAI-ARIA** (Tab cycles inside the menu instead of closing it; ArrowUp/ArrowDown do the same cycle).

## Global Constraints

- Allowed files ONLY: `components/landing/LandingNav.tsx` (modify) and `components/landing/__tests__/LandingNav.test.tsx` (new). Nothing else.
- No new dependencies. Tests use `@testing-library/react` + `@testing-library/user-event` (existing devDeps).
- French copy must keep every accent and typographic character exactly: `Français` (ç), `aria-label="Changer de langue"`, the `▾` glyph. Transcribe code blocks below verbatim.
- No redesign, no copy changes, no className changes — the component's markup below is byte-identical to today's except for the additions the spec names (`ref`, `id`, `aria-controls`, `tabIndex={-1}`, `onKeyDown`).
- Stage files by NAME (`git add <path> …`); `git add -A` / `git add .` are forbidden.
- Never push, merge, deploy, or send email.
- Package manager is **pnpm**.
- Verification gate (per CLAUDE.md): `pnpm lint`, `pnpm test`, `pnpm build`. Known local caveat: `.env.local` contains placeholders, so `pnpm build` can fail locally on env validation — if it fails **only** for missing/placeholder env vars, run `npx tsc --noEmit` instead and note that CI runs the real build. No migration/RLS is touched, so `pnpm test:rls` is not needed.

---

### Task 1: ARIA wiring, focus-on-open, focus restore

**Files:**
- Create: `components/landing/__tests__/LandingNav.test.tsx`
- Modify: `components/landing/LandingNav.tsx`

**Interfaces:**
- Consumes: `LandingNav` props (`nav: LandingContent['nav']`, `lang: Lang`, `setLanguage: (l: Lang) => void`) from `@/lib/landing/content`; `landingContent.fr.nav` fixture.
- Produces: `LandingNav.tsx` with `triggerRef` (`useRef<HTMLButtonElement>`), `menuId` (`useId()`), menu div `id={menuId}`, trigger `aria-controls={menuId}` + `ref={triggerRef}`, both menuitems `tabIndex={-1}`, a focus-on-open effect, and focus restore in the Escape handler and `pick()`. Task 2 relies on `menuRef` (existing), `triggerRef`, and the `tabIndex={-1}` menuitems exactly as written here.

- [ ] **Step 1: Write the failing tests**

Create `components/landing/__tests__/LandingNav.test.tsx` with exactly this content:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingNav } from '@/components/landing/LandingNav'
import { landingContent } from '@/lib/landing/content'

function setup() {
  const setLanguage = vi.fn()
  const user = userEvent.setup()
  render(<LandingNav nav={landingContent.fr.nav} lang="fr" setLanguage={setLanguage} />)
  const trigger = screen.getByRole('button', { name: /changer de langue/i })
  return { user, setLanguage, trigger }
}

describe('LandingNav language menu — focus management', () => {
  it('moves focus to the first menuitem when the menu opens', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('selecting a language calls setLanguage, closes the menu and restores focus to the trigger', async () => {
    const { user, trigger, setLanguage } = setup()
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(setLanguage).toHaveBeenCalledWith('en')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('wires aria-controls to the menu id and toggles aria-expanded', async () => {
    const { user, trigger } = setup()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(menu.id).not.toBe('')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on outside pointerdown without forcing focus back to the trigger', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm vitest run components/landing/__tests__/LandingNav.test.tsx`

Expected: tests 1 (“moves focus to the first menuitem…”), 3 (“selecting a language…”) and 4 (“wires aria-controls…”) FAIL with `toHaveFocus` / `toHaveAttribute('aria-controls', …)` assertion errors (the component compiles and renders — only the new focus/ARIA behavior is missing). Tests 2 (“closes on Escape…”) and 5 (“closes on outside pointerdown…”) may already PASS vacuously today: before focus-on-open exists, focus never leaves the trigger, so the Escape test’s `trigger` focus assertion holds trivially — it becomes a real restore test once Step 3 lands (focus is then on a menuitem when Escape fires); test 5 guards spec Decision 4 (outside-click close must NOT restore focus) against regressions from this task, not a missing feature. At least tests 1, 3 and 4 must fail before implementing.

- [ ] **Step 3: Implement the component changes**

Replace the entire content of `components/landing/LandingNav.tsx` with the following (changes vs. today: `useId` import, `triggerRef`, `menuId`, the focus-on-open effect, focus restore in `onKey` and `pick`, `ref`/`aria-controls` on the trigger, `id` on the menu div, `tabIndex={-1}` on both menuitems — everything else is byte-identical):

```tsx
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { Logo } from './Logo'
import type { Lang, LandingContent } from '@/lib/landing/content'

export function LandingNav({
  nav,
  lang,
  setLanguage,
}: {
  nav: LandingContent['nav']
  lang: Lang
  setLanguage: (l: Lang) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[0]?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointer(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(l: Lang) {
    setLanguage(l)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#EEF1F7] bg-white/[.86] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[18px] font-bold text-[#10203F]">Eazyexchange</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-7">
          <a
            href="#features"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.features}
          </a>
          <Link
            href="/login"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.login}
          </Link>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              ref={triggerRef}
              aria-label="Changer de langue"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[12px] font-semibold uppercase text-[#5B6B8C] hover:bg-[#F1F4F9] hover:text-[#10203F]"
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
              </svg>
              {lang}
              <span aria-hidden className="text-[9px]">▾</span>
            </button>
            {open && (
              <div
                role="menu"
                id={menuId}
                className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-[10px] border border-[#E4E9F2] bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => pick('fr')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'fr' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  Français
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => pick('en')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'en' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  English
                </button>
              </div>
            )}
          </div>
          <Link
            href="/signup"
            className="rounded-lg bg-[#10203F] px-[18px] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            {nav.demo}
          </Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm vitest run components/landing/__tests__/LandingNav.test.tsx`

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full unit suite (regression check on LandingPage tests)**

Run: `pnpm test`

Expected: all tests PASS — in particular `components/landing/__tests__/LandingPage.test.tsx` (its `fireEvent`-based menuitem clicks must keep working; `pick` still fires `setLanguage`).

- [ ] **Step 6: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/__tests__/LandingNav.test.tsx
git commit -m "feat(a11y): LandingNav language menu — focus on open, focus restore, aria-controls"
```

---

### Task 2: Keyboard cycling inside the menu (Tab trap + arrow keys)

**Files:**
- Modify: `components/landing/LandingNav.tsx` (state after Task 1)
- Modify: `components/landing/__tests__/LandingNav.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: from Task 1 — `menuRef: RefObject<HTMLDivElement>` (wrapper div around trigger + menu), `tabIndex={-1}` menuitems, the focus-on-open effect (first menuitem is focused when the menu opens), and the `setup()` helper in the test file (returns `{ user, setLanguage, trigger }`).
- Produces: `onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>)` attached as `onKeyDown` on the `role="menu"` div. Handles `Tab`, `Shift+Tab`, `ArrowDown`, `ArrowUp` with `preventDefault()` and wrapping cycle; all other keys (notably `Escape` and `Enter`) fall through untouched.

- [ ] **Step 1: Write the failing tests**

Append this describe block at the very end of `components/landing/__tests__/LandingNav.test.tsx` (after the closing `})` of the existing describe; no import changes needed):

```tsx
describe('LandingNav language menu — keyboard cycling', () => {
  it('traps Tab inside the menu, wrapping in both directions', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
  })

  it('moves focus between menuitems with ArrowDown and ArrowUp (wrapping)', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm vitest run components/landing/__tests__/LandingNav.test.tsx`

Expected: the 5 Task-1 tests PASS; the 2 new tests FAIL with `toHaveFocus` assertion errors (Tab currently escapes the menu into the Signup link because nothing handles it; arrows do nothing).

- [ ] **Step 3: Implement the keydown handler**

Three edits to `components/landing/LandingNav.tsx` (full final file below for verification):

Edit A — replace the react import line:

```tsx
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
```

Edit B — add this function directly after the `pick` function:

```tsx
  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const forward = (e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowDown'
    const backward = (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowUp'
    if (!forward && !backward) return
    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    )
    if (items.length === 0) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = forward ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
    items[next]?.focus()
  }
```

Edit C — add `onKeyDown={onMenuKeyDown}` to the `role="menu"` div:

```tsx
              <div
                role="menu"
                id={menuId}
                onKeyDown={onMenuKeyDown}
                className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-[10px] border border-[#E4E9F2] bg-white py-1 shadow-lg"
              >
```

Complete final `components/landing/LandingNav.tsx` after all three edits (transcribe verbatim if applying as a whole-file replace):

```tsx
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Logo } from './Logo'
import type { Lang, LandingContent } from '@/lib/landing/content'

export function LandingNav({
  nav,
  lang,
  setLanguage,
}: {
  nav: LandingContent['nav']
  lang: Lang
  setLanguage: (l: Lang) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[0]?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointer(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(l: Lang) {
    setLanguage(l)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const forward = (e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowDown'
    const backward = (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowUp'
    if (!forward && !backward) return
    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    )
    if (items.length === 0) return
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = forward ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#EEF1F7] bg-white/[.86] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[18px] font-bold text-[#10203F]">Eazyexchange</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-7">
          <a
            href="#features"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.features}
          </a>
          <Link
            href="/login"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.login}
          </Link>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              ref={triggerRef}
              aria-label="Changer de langue"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[12px] font-semibold uppercase text-[#5B6B8C] hover:bg-[#F1F4F9] hover:text-[#10203F]"
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
              </svg>
              {lang}
              <span aria-hidden className="text-[9px]">▾</span>
            </button>
            {open && (
              <div
                role="menu"
                id={menuId}
                onKeyDown={onMenuKeyDown}
                className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-[10px] border border-[#E4E9F2] bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => pick('fr')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'fr' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  Français
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => pick('en')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'en' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  English
                </button>
              </div>
            )}
          </div>
          <Link
            href="/signup"
            className="rounded-lg bg-[#10203F] px-[18px] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            {nav.demo}
          </Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `pnpm vitest run components/landing/__tests__/LandingNav.test.tsx`

Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full verification gate**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: lint clean, all tests PASS, build succeeds. If `pnpm build` fails **only** on missing/placeholder env vars (known local `.env.local` condition), run `npx tsc --noEmit` (expected: no errors) and note in the report that CI runs the real build.

- [ ] **Step 6: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/__tests__/LandingNav.test.tsx
git commit -m "feat(a11y): LandingNav language menu — Tab trap and arrow-key cycling"
```

---

## Spec coverage map (self-review)

| Spec requirement | Task |
| --- | --- |
| Focus first menuitem on open | Task 1 (effect + test 1) |
| Tab / Shift+Tab wrap (trap) | Task 2 (handler + test 1) |
| ArrowDown / ArrowUp cycle | Task 2 (handler + test 2) |
| Escape closes + restores focus to trigger | Task 1 (onKey + test 2) |
| Selection sets language, closes, restores focus | Task 1 (pick + test 3) |
| Outside pointerdown closes, no forced focus | Task 1 (unchanged behavior, guarded by test 5) |
| `aria-controls` / menu `id` via `useId()` | Task 1 (markup + test 4) |
| `tabIndex={-1}` on menuitems | Task 1 (markup; exercised by Task 2 tests) |
| `preventDefault` when handled | Task 2 handler |
| Existing LandingPage.test.tsx unaffected | Task 1 Step 5 (`pnpm test`) |
