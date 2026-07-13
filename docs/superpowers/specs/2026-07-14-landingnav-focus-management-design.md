# LandingNav focus management — design spec

**Date:** 2026-07-14
**Item:** landingnav-focus-management (deferred "T2 LandingNav focus mgmt" from the
2026-07-07 UI-polish batch)
**Scope guard:** small a11y polish. No redesign, no copy changes, no new routes, no
new dependencies.

## Reality check (what the "mobile menu" actually is)

`components/landing/LandingNav.tsx` has **no hamburger/mobile menu**. On small
screens the Features/Login links are simply hidden (`hidden … sm:inline`); the only
popup in the nav is the **language dropdown** (globe button → `role="menu"` with two
`role="menuitem"` buttons, Français / English), rendered at every viewport width.
The "focus trap/restore for the mobile landing nav" item therefore means: proper
focus management for this language dropdown. There is no fullscreen overlay, so
scroll-locking is out of scope (nothing to lock).

## What exists today

- Open/close state (`open` in `useState`), toggled by the trigger button.
- Outside `pointerdown` closes the menu; document-level `Escape` closes it.
- Trigger has `aria-label="Changer de langue"`, `aria-haspopup="menu"`,
  `aria-expanded={open}`.
- Menu has `role="menu"`; items have `role="menuitem"`.

## What is missing (the gap this spec closes)

1. Focus does not move into the menu on open — it stays on the trigger.
2. No keyboard navigation inside the menu: Tab walks out of it into the Signup
   link while the menu stays open; ArrowUp/ArrowDown do nothing (screen readers
   announce `role="menu"` and users expect arrow-key movement).
3. Focus is not restored to the trigger when the menu closes via Escape or after
   selecting a language (once focus is inside the menu).
4. Trigger lacks `aria-controls`; the menu has no `id`.

## Behavior specification

All changes live inside `LandingNav.tsx` (hand-rolled — no focus-trap dependency;
nothing in the repo consumes one, and the menu has exactly two static items).

**Open:**
- Clicking/activating the trigger opens the menu and moves focus to the **first
  menuitem** (Français).

**While open (keydown handled on the menu container, `preventDefault` when handled):**
- `Tab` → focus next menuitem, wrapping (trap: focus cycles within the menu).
- `Shift+Tab` → focus previous menuitem, wrapping.
- `ArrowDown` → same as Tab; `ArrowUp` → same as Shift+Tab (ARIA menu semantics).
- `Escape` (existing document-level handler) → close **and restore focus to the
  trigger button**.
- Selecting a menuitem (`pick`) → set language, close, **restore focus to the
  trigger button** (existing behavior + focus restore).
- Outside `pointerdown` → close, **no** forced focus move (the user deliberately
  clicked elsewhere; yanking focus back would be hostile).

**Markup/ARIA additions:**
- `const menuId = useId()`; menu div gets `id={menuId}`, trigger gets
  `aria-controls={menuId}`.
- Both menuitem buttons get `tabIndex={-1}` (per the ARIA menu pattern, items are
  focused programmatically, not part of the page tab order).

**Implementation sketch:**
- Add `triggerRef` (`useRef<HTMLButtonElement>`).
- Focus-on-open: in an effect keyed on `open`, query
  `menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')` and
  focus the first. The same NodeList drives the cycle math in the container's
  `onKeyDown` (index of `document.activeElement`, ±1 modulo length).
- `pick(l)` and the Escape branch call `triggerRef.current?.focus()` after
  `setOpen(false)`.

## Test approach

New file `components/landing/__tests__/LandingNav.test.tsx` (dedicated file; keeps
`LandingPage.test.tsx` about page composition). Render `LandingNav` directly with
`landingContent.fr.nav`, `lang="fr"`, and a `vi.fn()` `setLanguage`. Use
`@testing-library/user-event` (already a devDependency) so Tab/keyboard events go
through real focus semantics in jsdom. Cases:

1. Opening the menu moves focus to the first menuitem.
2. `Tab` cycles Français → English → Français (wrap); `Shift+Tab` cycles reverse.
3. `ArrowDown`/`ArrowUp` move focus between the items.
4. `Escape` closes the menu and returns focus to the trigger.
5. Clicking a menuitem calls `setLanguage`, closes the menu, and returns focus to
   the trigger.
6. Trigger `aria-controls` matches the menu `id`; `aria-expanded` toggles
   false → true → false.

Existing `LandingPage.test.tsx` tests (which click menuitems via `fireEvent`) are
unaffected: menuitems remain clickable and `pick` still fires `setLanguage`.

## Verification

`pnpm lint`, `pnpm test`, `pnpm build` (per CLAUDE.md). No migration, no RLS, no
`pnpm test:rls` needed.

**Files:**
- `components/landing/LandingNav.tsx` (modify)
- `components/landing/__tests__/LandingNav.test.tsx` (new)

(No overlap with open loop-PR #11's files: `lib/landing/__tests__/content.test.ts`,
`lib/__tests__/email-french-copy.test.ts`, `supabase/functions/send-reminders/*`
are all untouched.)

## Decisions made for you

1. **Scope = the language dropdown, not a hamburger menu.** The brief says "mobile
   landing nav", but no mobile menu exists — the dropdown is the only popup in
   `LandingNav` and appears at all widths. Alternative: build a hamburger menu
   first — rejected as redesign-level scope creep for an a11y polish item.
2. **Hand-rolled trap, no dependency.** No focus-trap library exists in the repo
   and CLAUDE.md forbids adding what nothing else consumes; two static items don't
   justify one.
3. **Tab/Shift-Tab cycle inside the menu (trap) *in addition to* ArrowUp/ArrowDown.**
   The strict WAI-ARIA menu-button pattern says Tab should *close* a menu, but the
   item as written explicitly asks for a Tab trap; arrows are kept because
   `role="menu"` sets that expectation for screen-reader users. Both keys doing the
   same cycle is harmless and matches the requested behavior.
4. **Focus restores to the trigger only on Escape and on item selection**, not on
   outside-click close — moving focus after a deliberate click elsewhere would be
   worse for users.
5. **Menuitems get `tabIndex={-1}`** (ARIA menu pattern) so the page tab order is
   never polluted; all movement is programmatic.
6. **Skipped:** `Home`/`End` keys and "ArrowDown on the closed trigger opens the
   menu" (optional pattern extras with near-zero value for a two-item menu).
7. **Desktop resize while open: no special handling.** The trigger is visible at
   every breakpoint, so nothing disappears or reflows out from under the open menu.
8. **`useId()` for the menu id** rather than a hard-coded string, so the component
   stays safe if ever rendered twice.
9. **Tests in a new `LandingNav.test.tsx` with `user-event`** rather than extending
   `LandingPage.test.tsx` with `fireEvent` — focus behavior needs real
   keyboard/focus simulation, and a dedicated file keeps the page test about
   composition.
