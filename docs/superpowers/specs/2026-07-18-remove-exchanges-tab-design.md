# Remove the Exchanges tab; show dossier completion in the exchange dropdown

**Date:** 2026-07-18
**Status:** Approved by Bjorn (design conversation, 2026-07-18)

## Problem

The Exchanges rail tab (`/exchanges`) duplicates what the top-left exchange
dropdown already does (pick an exchange) and what the dashboard already shows
(completion progress). Its only unique content left is the per-exchange
automatic-reminder settings on `/exchanges/[id]` — everything else moved to
Aperçu / Candidatures earlier. Remove the tab, surface per-exchange completion
in the dropdown instead, and rehome the reminder settings.

## Decisions (made with Bjorn)

1. **Reminder settings move to Settings → Programme** (not a dropdown link,
   not the dashboard).
2. **Dropdown row layout:** name + year stay on the first line; a muted second
   line shows « 12 / 18 dossiers validés » (same wording as the dashboard).
3. **Counts are fetched lazily** on first dropdown open via a server action —
   never in the organizer layout, which runs on every navigation.
4. **Programme section opens to all organizers** so admins keep the
   reminder-settings capability they have today; archive/restore stays
   owner-only.
5. **Back-navigation from submission review** becomes history-back
   (`router.back()`).

## Design

### 1. Dropdown completion counts

New server action in `actions/exchanges.ts`:

```ts
export type ExchangeProgressSummary = {
  done: number
  total: number
  kind: 'dossiers' | 'candidatures'
} | null

export async function getExchangeProgressSummaries():
  Promise<Record<string, ExchangeProgressSummary>>
```

- Auth: `requireOrganizer()`; covers every exchange visible to the caller's
  school (same `school_a_id`/`school_b_id` scope as `getExchanges`).
- Per exchange it reuses the exact logic the deleted `/exchanges` page used:
  `listApplications` + `getExchangeGrid` → `rollupStudent` per student →
  `exchangeProgress`. Numbers therefore always match the dashboard.
- Returns `null` for an exchange with nothing to count (`total === 0`).
- Returns raw `{ done, total, kind }`, not a formatted label — the client
  formats with the existing i18n keys, so no locale round-trip in the action.

`SessionSelector` changes:

- On first open (`open` transitions to true, no data yet), call the action
  once; cache the result in component state for the lifetime of the mount.
  No spinner — rows render immediately, second lines appear when data lands.
- Staleness is accepted: counts refresh only on a full page load (remount),
  not after in-session approvals. The dropdown is a navigation aid, not a
  live dashboard.
- Second line: muted small text under the name row, using existing keys
  `organizer.dashboard.progressDossiers` (`{done} / {total} dossiers validés`)
  or `organizer.dashboard.progressCandidatures` per `kind`. No new
  translation keys.
- `null` summary or fetch failure → no second line for that row (fail quiet;
  the dropdown must never break switching).
- Archived exchanges show counts like any other row.

### 2. Remove the tab and the orphaned pages

- `components/shell/OrganizerShell.tsx`: remove the Exchanges `RailItem` and
  its `pathname.startsWith('/exchanges/')` active-state logic. Remove the
  `IconExchanges` import (and the icon itself from `RailIcons.tsx` if nothing
  else uses it).
- Delete `app/(organizer)/exchanges/page.tsx`,
  `app/(organizer)/exchanges/[id]/page.tsx`,
  `components/exchanges/ExchangesView.tsx` and its test.
- **Keep** `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx`
  — still reached from the Documents drawer (`DocDrawer`) and Student detail
  (`StudentDetail`). On that page no rail item is active (same as `/settings`
  today).
- i18n (all 5 locales: en/fr/es/it/de): remove `organizer.shell.nav.exchanges`
  and the `organizer.exchanges.*` page block (title/subtitle/listLabel/
  emptyState). Keys used elsewhere (e.g. `progressDossiers`) stay.
- Stale revalidations: remove `revalidatePath('/exchanges')` from
  `actions/applications-review.ts` and `actions/forms.ts`. In
  `actions/exchanges.ts` the reminder-settings revalidation of
  `/exchanges/${exchangeId}` retargets to `/settings`.
- `app/robots.ts`: keep the `/exchanges` disallow (submission-review URLs
  still live under it).

### 3. Reminder settings in Settings → Programme

- `SettingsView` Programme section renders `ReminderSettingsCard` above the
  existing archive zone, for the active exchange; `readOnly` when archived.
- Visibility change: the Programme section (tab + content) becomes visible to
  **all organizers**. Inside it, the archive/restore zone renders only for
  owners (`archiveExchange`/`restoreExchange` server actions already enforce
  owner). The billing section stays owner-only, untouched.
- `actions/settings.ts` `getProgramInfo` relaxes from
  `getOrganizerCtx({ orgRole: 'owner' })` to any organizer — it exposes
  nothing sensitive (name, year, enrolled/application counts, earliest
  deadline). It additionally returns `reminders_enabled` and
  `reminder_cadence` so the settings page needs no extra query.
- `app/(organizer)/settings/page.tsx` fetches program info for every
  organizer (active-exchange resolution moves out of the `isOwner` branch;
  billing fetch stays inside it).

### 4. Back-navigation from submission review

- `components/SubmissionReview.tsx`: after approve/reject, `router.back()`
  instead of `router.push('/exchanges/${exchangeId}')`. The actions'
  `revalidatePath` calls keep the origin lists (Documents / Student detail)
  fresh on return.
- `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx`: the
  back link becomes a client history-back control (small client component or
  reuse of an existing back pattern), since the static link target is gone.
  The `exchangeId` prop of `SubmissionReview` disappears if nothing else
  needs it.

## Error handling

- Summary fetch failure in the dropdown: swallow, render rows without second
  lines. Never block exchange switching.
- `getExchangeProgressSummaries` computes per-exchange summaries
  independently; one bad exchange yields `null` for that row, not a thrown
  action.

## Testing

- `OrganizerShell` / `RailPrefetch` tests: no Exchanges rail item; prefetch
  list updated.
- New `SessionSelector` test: opens dropdown → action called once → second
  lines render from mocked summaries; failure path renders rows without
  second lines.
- Unit test for `getExchangeProgressSummaries` shape if practical with the
  existing action-test patterns; otherwise its logic is already covered via
  `exchangeProgress`/`rollupStudent` unit tests.
- Settings: Programme section renders for a non-owner (without archive zone),
  reminder card wired with `readOnly` for archived.
- Delete `ExchangesView` test with the component.
- i18n completeness check across the 5 locales (existing message-parity test
  if present).

## Out of scope

- No migration, no RLS change, no edge-function change.
- No redesign of the dropdown beyond the second line.
- Submission-review URL structure stays under `/exchanges/[id]/submissions/`
  (renaming the route is not worth the churn).
