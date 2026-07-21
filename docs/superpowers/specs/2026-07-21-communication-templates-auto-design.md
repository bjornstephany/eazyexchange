# Communication tab — Templates & Auto reminders

**Date:** 2026-07-21
**Status:** Approved (design)

## Problem

The Communication tab shipped as a 4-sub-tab shell with only *Infos* wired
(`project_communication_infos_tab`, PR #31). *Modèles*, *Annonces* and
*Réglages auto* all render a "Coming soon." placeholder.

Meanwhile two settings that are unambiguously *communication* settings live in
Settings → Programme, where organizers do not look for them:

- **Reminder settings** (`ReminderSettingsCard`) — automatic-reminder on/off plus
  the douce/normale/insistante cadence.
- **Good-news email template** (`GoodNewsCard`) — the authorable « Bonne
  nouvelle » acceptance email sent to parents.

Settings → Programme has become a catch-all. Communication is the tab that
promises "everything you communicate to students and parents" and delivers one
sub-tab out of four.

## Goals

1. Wire the *Modèles / Templates* sub-tab with the good-news email template.
2. Wire the *Réglages auto / Auto reminders* sub-tab with the reminder settings.
3. Delete the empty *Annonces* sub-tab, so no "Coming soon." placeholder remains.
4. Leave Settings → Programme holding only genuine program metadata.

## Non-goals

- **No renaming.** The *Infos* sub-tab keeps its name, on the organizer side and
  in the student portal (`/infos`). An earlier draft of this work proposed
  renaming it to "Announcements"; that was explicitly dropped.
- No new template kinds. « Bonne nouvelle » is the only authorable template
  today and the tab renders exactly that one card.
- No template list/editor scaffolding for hypothetical future templates.
- No changes to how any email is composed or sent.
- No schema change, no RLS change, no new bucket.

## Design

### Sub-tab layout

`components/communication/CommunicationView.tsx` goes from four sub-tabs to
three, and the `comingSoon` branch is deleted entirely:

| Sub-tab | `SubTab` key | Content |
| --- | --- | --- |
| Infos | `infos` | `InfoCardsCard` (unchanged) |
| Modèles / Templates | `modeles` | `GoodNewsCard` |
| Réglages auto / Auto reminders | `auto` | `ReminderSettingsCard` |

The `annonces` key is removed from the `SubTab` union and the `tabs` array.
All three sub-tabs remain scoped to the active exchange and pass the existing
`archived` prop down as `readOnly`, exactly as *Infos* does today.

`CommunicationProps` gains the fields the two new cards need, on top of the
existing `exchangeId` / `archived` / `infoCards`: `exchangeName`,
`remindersEnabled`, `reminderCadence`, `goodNewsSubject`, `goodNewsBody`.
(`exchangeName` is required by `GoodNewsCard` to render its live preview.)

### Component moves

- `components/settings/GoodNewsCard.tsx` → `components/communication/GoodNewsCard.tsx`.
  It is now Communication-owned. Content unchanged.
- `ReminderSettingsCard` **stays** at `components/exchanges/ReminderSettingsCard.tsx`.
  It already lives outside `components/settings/` and is imported by absolute
  path; moving it would churn a file for no structural gain.

### i18n

Translation **keys keep their current namespaces** — `organizer.settings.goodNews.*`
and `organizer.exchanges.reminders.*`. The keys are internal identifiers; renaming
them would touch five locale files for zero user-visible change.

Two keys are **deleted from all five locales** (`en`, `fr`, `es`, `it`, `de`):

- `organizer.communication.tabs.annonces`
- `organizer.communication.comingSoon`

`messages/__tests__/parity.test.ts` enforces cross-locale key parity, so a
partial deletion fails the suite.

### Server data

New export in `actions/settings.ts`, placed next to `getProgramInfo` and reusing
the existing `getScopedExchange` helper (school-A-or-B check, throws
`'Unauthorized'`):

```ts
export type CommunicationSettings = {
  exchangeName: string
  remindersEnabled: boolean
  reminderCadence: ReminderCadence
  goodNewsSubject: string
  goodNewsBody: string
}

export async function getCommunicationSettings(
  exchangeId: string,
): Promise<CommunicationSettings>
```

Defaulting is carried over verbatim from `getProgramInfo`:

- `reminders_enabled ?? true`
- `(reminder_cadence ?? 'normale') as ReminderCadence`
- `good_news_subject?.trim() || DEFAULT_GOOD_NEWS_SUBJECT`
- `good_news_body?.trim() || DEFAULT_GOOD_NEWS_BODY`

It issues a single row read and none of the three count queries
(`enrolled`, `applications`, earliest deadline) that `getProgramInfo` runs for
the Settings header — those are not displayed anywhere in Communication.

`app/(organizer)/communication/page.tsx` resolves the active exchange as it does
today, then fetches both payloads in parallel:

```ts
const [infoCards, comms] = await Promise.all([
  getInfoCards(active.id),
  getCommunicationSettings(active.id),
])
```

and passes them to `CommunicationView`.

### Writes

Unchanged. `updateReminderSettings` (`actions/exchanges.ts`) and
`updateGoodNewsTemplate` (`actions/settings.ts`) each take an `exchangeId` and
run their own scope check; the cards call them exactly as before.

### Settings cleanup

Settings → Programme keeps `ProgramCard` and `ProgramDetailsCard` only. The
`ReminderSettingsCard` and `GoodNewsCard` imports and renders are removed from
`components/settings/SettingsView.tsx`.

`ProgramInfo` in `actions/settings.ts` sheds the four fields no longer read by
any consumer — `remindersEnabled`, `reminderCadence`, `goodNewsSubject`,
`goodNewsBody` — and `getProgramInfo`'s `select` drops the matching columns
(`reminders_enabled`, `reminder_cadence`, `good_news_subject`, `good_news_body`).
`SettingsProps` and `app/(organizer)/settings/page.tsx` follow.

Confirmed complete consumer list before the change: `SettingsView.tsx`,
`app/(organizer)/settings/page.tsx`, and the two test files named below. Nothing
else reads these fields.

## Error handling

No new error surfaces.

- `ReminderSettingsCard` saves optimistically and rolls the toggle/cadence back
  on a thrown error.
- `GoodNewsCard` branches on the structured `{ ok, message }` return of
  `updateGoodNewsTemplate` — never on `error.message`, per the production
  error-redaction rule.
- `getCommunicationSettings` throws `'Unauthorized'` at the page level, the same
  behaviour `getProgramInfo` has today on the Settings route.
- Archived programs: `readOnly` hides the save controls in both cards, as now.

## Testing

**New**

- `components/communication/__tests__/CommunicationView.test.tsx` — renders
  exactly three sub-tabs; no "Annonces" tab label and no "Coming soon." text
  present; selecting *Modèles* shows the good-news editor; selecting *Réglages
  auto* shows the reminder toggle; `archived` propagates read-only into all
  three sub-tabs.
- `actions/__tests__/settings.communication.test.ts` — `getCommunicationSettings`
  returns stored values; applies each default (`reminders_enabled` null → `true`,
  `reminder_cadence` null → `'normale'`, blank good-news fields → the
  `DEFAULT_GOOD_NEWS_*` constants); rejects with `'Unauthorized'` for an exchange
  outside the caller's school. Mirrors the mock harness in
  `actions/__tests__/settings.program.test.ts`.

**Updated**

- `components/settings/__tests__/SettingsView.test.tsx` — fixture drops the four
  removed fields; new assertion that the Programme section renders neither the
  good-news editor nor the reminder toggle.
- `actions/__tests__/settings.program.test.ts` — the `remindersEnabled` /
  `reminderCadence` assertions are removed (they now live in the new file).

**Unchanged**

- `components/exchanges/__tests__/ReminderSettingsCard.test.tsx`
- `actions/__tests__/settings-good-news.test.ts`, `lib/__tests__/email.good-news.test.ts`,
  `lib/__tests__/good-news-template.test.ts` — neither the card's behaviour nor
  the send path changes.

**Gate:** `pnpm lint`, `pnpm test`, `pnpm build`. `pnpm test:rls` is **not**
required — no migration, RLS policy, or storage bucket is touched.

## Risks

- **Discoverability.** Organizers who learned where the reminder settings live
  must relearn. Accepted: these settings moved once before
  (`project_reminder_settings_move`, PR #28) and Communication is their
  semantically correct home. No redirect or in-app pointer is added — nothing
  deep-links to those cards.
- **Concurrent branches.** This work is specced on an isolated worktree off
  `origin/main`. Another session is concurrently working on
  `feature/instant-activation`, which also touches `ProgramDetailsCard` in
  Settings → Programme. Expect a merge reconciliation in `SettingsView.tsx`;
  the two changes are additive there (that branch edits the program-details
  card, this one removes two unrelated siblings).
