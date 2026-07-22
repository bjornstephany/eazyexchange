# Move automatic reminder settings into Settings → Programme

**Date:** 2026-07-18
**Status:** Approved

## Problem

The per-exchange automatic-reminder settings (on/off toggle + cadence
douce/normale/insistante) live on the exchange detail page
`/exchanges/[id]`, which otherwise carries nothing but the exchange name
header — its former invite/application controls already moved to the
Overview CTA and the Candidatures page. Settings is the natural home for
this configuration, and the near-empty detail page should go away.

## Decisions (Bjorn-approved)

1. **Destination:** Settings → **Programme** section, made visible to
   **all organizers** (today owner-only). The archive/restore danger zone
   inside it stays owner-only in the UI; server-side owner checks on
   `archiveExchange` / `restoreExchange` already enforce it regardless.
2. **Exchange detail page:** delete `/exchanges/[id]`'s index page.
   Exchange cards on `/exchanges` switch the active exchange and go to
   the dashboard (same pattern as the shell's `SessionSelector`).
   Subroutes (`/exchanges/[id]/submissions|forms|applications`) are
   untouched.

## Changes

### 1. Settings — Programme section

- `components/settings/SettingsView.tsx`
  - Sidebar entry `prog` gates on `props.program` only (drop
    `props.isOwner`).
  - Section renders `ProgramCard` followed by `ReminderSettingsCard`
    (component reused unchanged from
    `components/exchanges/ReminderSettingsCard.tsx`), fed from
    `ProgramInfo`:
    `exchangeId={program.id}`,
    `initialEnabled={program.remindersEnabled}`,
    `initialCadence={program.reminderCadence}`,
    `readOnly={program.archived}`.
- `components/settings/ProgramCard.tsx`
  - New prop `isOwner: boolean`; the archive/restore danger zone (and its
    modal) renders only when `isOwner`.
- `actions/settings.ts`
  - `getProgramInfo`: relax `getOrganizerCtx({ orgRole: 'owner' })` to
    `getOrganizerCtx()` (any organizer). `archiveExchange` /
    `restoreExchange` keep their owner requirement.
  - `ProgramInfo` gains `remindersEnabled: boolean` and
    `reminderCadence: ReminderCadence` (type imported from
    `actions/exchanges`), read from the scoped exchange row it already
    fetches (defaults: enabled `?? true`, cadence `?? 'normale'`, same as
    the old exchange page). The shared `getScopedExchange` helper's
    select list gains `reminders_enabled, reminder_cadence` (harmless for
    its other callers, archive/restore).
- `app/(organizer)/settings/page.tsx`
  - Fetch `getProgramInfo` for **all** organizers (move it out of the
    `isOwner` branch; billing stays owner-only).
- `actions/exchanges.ts`
  - `updateReminderSettings`: `revalidatePath('/exchanges/${id}')` →
    `revalidatePath('/settings')`.
- i18n: no new strings. The card keeps its existing
  `organizer.exchanges.reminders.*` keys (present in all 5 locales);
  Programme section keys already exist.

### 2. Exchanges list — cards switch the active exchange

- `components/exchanges/ExchangesView.tsx`
  - `ExchangeCard` changes from `<Link href="/exchanges/[id]">` to a
    `<button>` that `await setActiveExchange(id)` (from
    `actions/session`) then `router.push('/dashboard')`.
- `app/(organizer)/exchanges/[id]/page.tsx` — **deleted**. The `[id]`
  folder and its `loading.tsx` stay for the subroutes. Stale bookmarks to
  `/exchanges/<id>` 404 — accepted (internal page).
- Rail nav (`OrganizerShell`) active-state logic is untouched; it still
  matches the surviving subroutes.

## Not changing

- `ReminderSettingsCard` internals (optimistic save, cadence options).
- `updateReminderSettings` auth (any organizer, in-scope + writable).
- Reminder pacing engine (`send-reminders` edge function).
- No DB migration; no RLS change → `test:rls` not required.

## Tests

- `ExchangesView` tests: card renders as a button; clicking calls
  `setActiveExchange` with the exchange id and navigates to `/dashboard`.
- `SettingsView` tests: Programme section visible to non-owner when a
  program exists; reminder card rendered inside it; danger zone hidden
  for non-owner, shown for owner.
- `actions/settings` tests: `getProgramInfo` succeeds for a non-owner
  organizer; returns `remindersEnabled` / `reminderCadence` (incl.
  defaults when columns are null).
- `ReminderSettingsCard` tests: unchanged.

## Verification gate

`pnpm lint` · `pnpm test` · `npx tsc --noEmit` (placeholder env makes
`pnpm build` fail locally per project memory).
