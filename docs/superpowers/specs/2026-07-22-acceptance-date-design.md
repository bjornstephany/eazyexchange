# Acceptance date on the Aperçu

**Date:** 2026-07-22
**Status:** Approved, not built

## Problem

Organizers can see *that* a student accepted to join the exchange — the green
« Accepté » pill in the Candidature column of the Aperçu — but not *when*. They
need the acceptance date to track how the cohort filled up and to chase the
students who accepted long ago but never started their dossier.

## Goal

Show the date the student/parent said yes, next to the green « Accepté » pill in
the Candidature column of the Aperçu table.

## Data source

`applications.responded_at`. Already written by `respondToInvitation`
(`actions/invitations.ts:64`) the moment the invitee clicks Oui / Non /
Peut-être. **No migration, no new column, no RLS change.**

## Which rows show a date

The date renders only when the row means *joined* — application status
`enrolling` or `enrolled` (the two statuses `candidaturePill` maps to the green
« Accepté »).

Deliberately excluded:

| Case | Pill | Why no date |
| --- | --- | --- |
| status `accepted` | « Accepté (en attente) » | The student has not replied yet — `responded_at` is null. |
| status `maybe` | « Peut-être » | `responded_at` is set, but it is a *response* date, not an acceptance. Showing it would make the column mean two different things. |
| status `declined` | « Décliné » | Same as above. |
| Enrolled student with no application row | « Accepté » (`candidaturePill(null)`) | Nothing to read. Pill renders alone. |
| Any row where `responded_at` is null | any | Pill renders alone. |

## Rendering

The Candidature cell becomes a horizontal flex row: the existing `StatusPill`,
then — only when a date exists — a muted date span to its right.

```
Candidature
───────────────────
( Accepté )  18 juil
( Accepté )  2 juil
( Accepté )
( À examiner )
```

- Date span: `text-[11.5px] text-muted-foreground`, matching the funnel-tile
  sublabel size already used in `OverviewView`.
- Format: `frShortDate` from `lib/dates.ts` (« 18 juil »), the same helper the
  rest of the dashboard uses. It is hard-coded `fr-FR`; that is pre-existing
  behaviour and this change does not alter it.
- `title` attribute carries the full date including the year, so hovering
  disambiguates across program years. Add a `fullDate(iso)` helper next to
  `frShortDate` in `lib/dates.ts`: `Intl.DateTimeFormat('fr-FR', { day:
  'numeric', month: 'long', year: 'numeric' })`, empty string for null/invalid
  input, mirroring `frShortDate`'s guards.
- The pill itself is untouched — it keeps its colour weight for at-a-glance
  scanning, and the date reads as secondary metadata.

## Changes

### 1. `actions/applications-review.ts`

`listApplications` selects only the columns `AppRow` consumes. Add
`responded_at` to **both** select lists (the `!opts?.withPhotos` branch and the
`withPhotos` branch) and to the `ApplicationListRow` type. `responded_at` is not
a secret — it is a timestamp about the person the organizer already sees.

### 2. `app/(organizer)/dashboard/page.tsx`

Add `responded_at: a.responded_at` to the `apps` mapping that builds `AppRow[]`.

### 3. `lib/dashboard/rollup.ts`

- `AppRow` gains `responded_at: string | null`.
- New exported pure helper:

  ```ts
  // ISO timestamp of the moment the invitee accepted to join, or null when the
  // row has no acceptance to date (see the spec table).
  export function acceptedOn(status: string, respondedAt: string | null): string | null
  ```

  Returns `respondedAt` when `status` is `enrolling` or `enrolled` and
  `respondedAt` is non-null; `null` otherwise.

- Both `LifecycleRow` variants gain `acceptedOn: string | null`.
- `buildLifecycleRows` fills it:
  - applicant rows — from their own `app`;
  - enrolled rows — from the email-matched application. The existing name-merge
    at the `apps.find(...)` call already performs that lookup; **reuse that
    single lookup**, do not add a second scan. This means the lookup must be
    hoisted out of the `if (!name)` branch so it runs for every enrolled row.

### 4. `components/dashboard/OverviewView.tsx`

The Candidature `<span>` (currently just `<StatusPill pill={row.candidature} />`)
becomes:

```tsx
<span className="flex items-center gap-2">
  <StatusPill pill={row.candidature} />
  {row.acceptedOn && (
    <span className="text-[11.5px] text-muted-foreground" title={fullDate(row.acceptedOn)}>
      {frShortDate(row.acceptedOn)}
    </span>
  )}
</span>
```

The Candidature column is the second `GRID` track (`1.15fr` in
`grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px]`) and should already have room; no
grid change expected, to be confirmed visually.

`fullDate` must be added to the `lib/dates.ts` unit tests alongside
`frShortDate`'s.

## Testing

`lib/dashboard/__tests__/` — unit tests for `acceptedOn`:

- `enrolled` + timestamp → the timestamp
- `enrolling` + timestamp → the timestamp
- `accepted` + null → null
- `maybe` + timestamp → null
- `declined` + timestamp → null
- `enrolled` + null → null

`buildLifecycleRows`:

- an enrolled student whose email matches a confirmed application inherits that
  application's `responded_at` as `acceptedOn`
- an enrolled student with no matching application gets `acceptedOn: null`
- the existing name-merge behaviour is unchanged by hoisting the lookup (the
  current tests cover this; they must stay green)

`components/dashboard/__tests__/` — render test on `OverviewView`:

- a row with `acceptedOn` renders the formatted date beside the pill
- a row without it renders the pill alone

## Out of scope

- The Candidatures page (`/applications`), the `StudentDrawer`, and the Élèves
  tab keep their current display.
- No change to how or when `responded_at` is written.
- No localization fix for `frShortDate`.
