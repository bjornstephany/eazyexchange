# Tour auto-start & the deadline `DateField`

*2026-07-29 — design*

Two independent changes, one branch. Neither touches the database.

1. The guided tour starts by itself for a new organizer, and its first and last
   steps say so cheerfully.
2. The two deadline pickers on the Candidatures tab stop closing when the
   organizer changes month.

---

## Part 1 — The tour starts by itself

### Today

`users.tour_state` starts at `pending`. Onboarding redirects to `/applications`,
where `TourInviteCard` offers « Découvrez EazyExchange en 2 minutes » with
*Commencer* and *Plus tard*. A new organizer therefore meets the tour as one
more thing to decide about, on a screen that already has a primary call to
action of its own.

### Change

The tour opens on its own. The card disappears.

**Trigger.** `TourProvider` gains a mount-once effect: when `initialState` is
`pending`, it calls `start()`.

- It must be an effect, not render-time work. `start()` performs the tour's only
  DOM read — `anchorPresent` — and that read is meaningless before mount and
  unsafe during SSR.
- A `useRef` guard limits it to one firing per mount.
- It reads `initialState`, never the mutating `tourState`. Reading the latter
  would let an optimistic write retrigger the effect.
- It fires on any organizer page, not only `/applications`. There is now no
  fallback UI, so a pending organizer who lands somewhere else — a bookmark, a
  deep link from an email — must still get the tour.

**The two-step guard.** If `visibleStepIndices` resolves to only the two
unanchored steps (`welcome`, `finish`), do not auto-start, and leave the state
`pending`.

`OrganizerShell` renders the four session-scoped tabs only when an exchange is
reachable. Without one, the tour would say « voici un tour rapide de vos
onglets » and then « c'est tout », with no onglets in between. Onboarding forces
a first exchange, so this does not fire for a fresh signup; it only means that
in the degenerate case the tour waits for a visit where it has something to
show, instead of burning its one chance.

**Deletions.**

- `components/tour/TourInviteCard.tsx`
- its render in `components/shell/OrganizerShell.tsx`
- `dismissInvite` from `TourContextValue` and from the provider
- `organizer.shell.tour.invite.*` from all five message files

*Passer* and Escape still write `dismissed`, and `canAdvanceTourState` still
refuses downgrades, so a tour that is dismissed or completed never auto-starts
again. The account-menu entry keeps it replayable forever.

The apostrophe guard in `messages/__tests__/tour-apostrophes.test.ts` asserts the
block holds more than 20 strings. Removing the four `invite.*` keys takes it from
26 to 22, so the guard keeps working unchanged.

### Copy

Only the welcome and finish **titles** change. The six tab steps are reference
copy — the tour is replayable, and an organizer who replays it is looking
something up, not being welcomed again.

| locale | `steps.welcome.title` | `steps.finish.title` |
|---|---|---|
| fr | Bienvenue dans EazyExchange ! 🎉 | C’est parti ! 🚀 |
| en | Welcome to EazyExchange! 🎉 | You're all set! 🚀 |
| es | ¡Te damos la bienvenida a EazyExchange! 🎉 | ¡Todo listo! 🚀 |
| it | Benvenuto in EazyExchange! 🎉 | Tutto pronto! 🚀 |
| de | Willkommen bei EazyExchange! 🎉 | Alles bereit! 🚀 |

French keeps the space before `!`, matching the five existing exclamations in
`fr.json`. « C’est parti » uses the typographic apostrophe the guard requires
(`’`, U+2019 — the table above is exact, copy it verbatim).
Spanish avoids « Bienvenido/a » — the phrasing above does not gender the reader.

Both bodies stay verbatim. The welcome body already ends with « Vous pouvez
l'interrompre à tout moment et le reprendre depuis le menu de votre compte »,
and that sentence matters more now that the tour arrives uninvited.

### Tests

- `visibleStepIndices` returning two steps does not auto-start.
- `initialState: 'pending'` with all anchors present opens the tour on mount.
- `initialState: 'dismissed'` and `'completed'` do not.
- The effect fires once, not once per render.

---

## Part 2 — `DateField`

### The bug

On the Candidatures tab, clicking the month arrow in the deadline picker changes
the month and closes the calendar. Continuing means re-opening it for every
month.

Both deadline fields are native `<input type="date">`:

- `components/applications/OpenApplicationsDialog.tsx` — inside a Radix dialog
- `components/applications/InvitationPanel.tsx` — in the panel under the grid

The popup is browser chrome, not our DOM, so we cannot observe it, cannot test
it, and cannot rely on it behaving the same across browsers. The exact trigger
was not reproduced, and deliberately so: the chosen fix does not depend on
knowing it.

### Change

Own the calendar. A `DateField` component renders the month grid inside a Radix
Popover — already a dependency, already used by `TourSpotlight`. Month arrows
mutate local state and nothing else, so there is no longer anything that *can*
close the calendar when the month changes.

**`lib/date/calendar.ts`** — pure, no DOM, unit-tested:

- `monthGrid(year, month)` → weeks of `YYYY-MM-DD` strings, with `null` for the
  leading and trailing blanks
- `firstDayOfWeek(locale)` → `0` for `en`, `1` for `fr`, `es`, `it`, `de`
- `weekdayLabels(locale)` and `monthLabel(locale, year, month)`, via
  `Intl.DateTimeFormat`

ISO strings are assembled by hand — `` `${y}-${pad(m + 1)}-${pad(d)}` `` — and
never through `toISOString()`. `toISOString` converts to UTC first, which west of
Greenwich turns « 1er septembre » into `2026-08-31`. The deadline is a calendar
date, not an instant, and the code should never hold it as one.

**`components/ui/date-field.tsx`**:

```
DateField({ value, onChange, disabled, id, ariaLabelledBy, className })
```

- `value` is `'YYYY-MM-DD'` or `''`; `onChange` only ever receives a real date.
- Trigger: `<button type="button">` styled like `Input`, showing the date
  formatted for the active locale, or a placeholder when empty. A `<button>`
  with an `id` still pairs with `<Label htmlFor>`.
- Content: a `‹ septembre 2026 ›` header, a weekday row, and the day grid.
- **The arrows change `viewMonth` and nothing else** — no `onChange`, no close.
- A day click calls `onChange` once and closes.
- Escape and outside-click close, via Radix defaults.
- `viewMonth` seeds from `value`, or from today when empty, each time the
  popover opens.

**Call sites.** Both deadline inputs are replaced. `disabled={saving}` stays on
both: our popover closes on selection anyway, so disabling no longer races the
picker. The `if (!next) return` clearing guards in `changeDeadline` and
`chooseDeadline` become unreachable — `DateField` cannot emit `''` — but they
stay, because both functions are also the persistence path and the guard
documents why an empty deadline must never be written.

The dialog call site nests a Popover inside a Radix Dialog. That is the one
integration risk: the popover must portal above the dialog overlay, and Escape
must close the popover before the dialog. It gets checked in a browser rather
than assumed.

### Tests

`lib/date/__tests__/calendar.test.ts`:

- grid shape, and month boundaries at both ends
- February 2028, a leap year
- ISO assembly under a non-UTC `TZ`, which is the regression test for
  `toISOString`
- first day of week and weekday labels per locale

`components/ui/__tests__/date-field.test.tsx` — the reported bug, written down:

- open the popover, click `‹` twice: the popover is **still open**, the month
  label changed, and `onChange` was never called
- click a day: `onChange` fires once with the right ISO string, and the popover
  closes

### Out of scope

The other native date inputs — `LibraryDrawer`, the template editors — keep
`<input type="date">` for now. One `BACKLOG.md` line to migrate them once
`DateField` has proven itself on the two fields where the problem was actually
reported.

---

## Verification

`pnpm lint`, `pnpm test`, `pnpm build`. No migration, so no `pnpm test:rls`.

By hand, in a browser: a fresh signup lands on `/applications` with the tour
already open on « Bienvenue dans EazyExchange ! 🎉 »; and in both deadline
pickers — panel and dialog — the month arrows page through months with the
calendar staying open.
