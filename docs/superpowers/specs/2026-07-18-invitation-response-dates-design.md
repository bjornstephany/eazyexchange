# Invitation response dates on the Overview

**Date:** 2026-07-18
**Status:** Approved (design)

## Problem

After a student replies to an invitation, organizers can see *that* a student
accepted, declined, or is hesitating (the Candidature pill on the Overview page),
but not *when*. Organizers need to know the date each student accepted or declined.

## Goal

On the organizer Overview page (`/dashboard`), show the response date as a small
muted line directly under the Candidature pill, for every student who has actually
replied to their invitation.

Out of scope: the Candidatures page (`/applications`), the Échanges page, exports,
and any dedicated "who responded when" report. Overview only.

## The rule

Show the date **whenever `applications.responded_at` is set.** That single
condition yields exactly the desired behavior with no special-casing per status:

| Situation | `responded_at` | Date shown? |
|---|---|---|
| Student clicked Oui → Accepté (`enrolling`/`enrolled`) | set | yes |
| Student clicked Non → Décliné (`declined`) | set | yes |
| Student clicked Peut-être (`maybe`) | set | yes |
| Organizer accepted, student not yet replied (`accepted`) | null | no |
| Awaiting organizer review (`submitted`) | null | no |
| Organizer rejected (`rejected`) | null (uses `reviewed_at`) | no |

`responded_at` is written only by `respondToInvitation` on a yes/no/maybe click
(`actions/invitations.ts`), so it is the authoritative response timestamp. No new
column, no migration, no RLS change (organizers already read `applications`), and
therefore no `test:rls` gate.

## Data flow

Three hops carry `responded_at` from the DB to the view.

### 1. `listApplications` (`actions/applications-review.ts`)

Add `responded_at` to **both** `.select(...)` column lists (the default branch and
the `withPhotos` branch). The column set is deliberately minimal today; this adds
one non-sensitive timestamp. In the `withPhotos` branch, also include
`responded_at` in the returned mapped object.

### 2. `AppRow` type + map sites

In `lib/dashboard/rollup.ts`, add to `AppRow`:

```ts
responded_at: string | null
```

Populate it at the three sites that build `AppRow[]`:

- `app/(organizer)/dashboard/page.tsx` — `responded_at: a.responded_at`
- `app/(organizer)/exchanges/page.tsx` — `responded_at: a.responded_at`
- `app/(organizer)/applications/page.tsx` — `responded_at: a.responded_at`

Only the dashboard renders it; the other two carry the field so the shared type
stays consistent (making the field required, not optional, keeps the three sites
honest).

### 3. `buildLifecycleRows` (`lib/dashboard/rollup.ts`)

Add `respondedAt: string | null` to **both** `LifecycleRow` variants
(`applicant` and `enrolled`).

- **Applicant rows:** `respondedAt: a.responded_at`.
- **Enrolled rows:** read from the confirmed application already matched by email.
  The enrolled branch currently does an email match only when the profile name is
  empty (the name fallback). Compute the match unconditionally so the response date
  is available regardless of whether the name needed the fallback:

  ```ts
  const match = apps.find(
    a => CONFIRMED_STATUSES.includes(a.status) && normEmail(a.email) === normEmail(s.email)
  )
  // name fallback reuses `match`; respondedAt = match?.responded_at ?? null
  ```

  A directly-invited enrolled student with no application row gets `null` — correct
  (no funnel response event to date).

## View (`components/dashboard/OverviewView.tsx`)

In the Candidature cell of both the funnel table and wherever the candidature pill
renders, keep the `StatusPill`, then conditionally render a second line:

```tsx
<span className="flex flex-col gap-0.5">
  <StatusPill pill={row.candidature} />
  {row.respondedAt && (
    <span className="text-[11px] text-muted-foreground">
      {frShortDate(row.respondedAt, { year: true })}
    </span>
  )}
</span>
```

The exact wrapper markup follows the existing cell structure; the point is: pill on
top, muted date line below when `respondedAt` is present. No label prefix — the date
alone, matching the approved mockup.

## Date helper (`lib/dates.ts`)

Extend `frShortDate` with an optional options argument, backward-compatible with
every existing call:

```ts
export function frShortDate(iso: string | null, opts?: { year?: boolean }): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', ...(opts?.year ? { year: 'numeric' } : {}),
  }).format(date)
  return formatted.replace(/\.$/, '')
}
```

Result with `{ year: true }`: e.g. `12 juil. 2026` (the mid-string period is kept;
only a *trailing* period is stripped). Acceptance/decline dates are archival and can
cross years, so the year is included here even though most in-app uses omit it.

## Testing

- `lib/dashboard/__tests__/rollup.test.ts`: `respondedAt` flows through — an
  applicant row (`declined` and `maybe`) exposes `app.responded_at`; an enrolled row
  exposes the matched confirmed app's `responded_at`; an enrolled student with no
  matching app gets `null`; an `accepted`-but-unreplied applicant gets `null`.
- `lib/__tests__/dates.test.ts` (new file — none exists today): `frShortDate(iso, { year: true })`
  includes the year; the no-arg call is unchanged.
- `components/dashboard/__tests__/OverviewView.test.tsx`: the muted date line renders
  under the pill when `respondedAt` is set, and is absent when it is null.

## Verifying Changes

`pnpm lint`, `pnpm test`, `pnpm build`. No migration, RLS, or storage changes, so
`test:rls` is not required.
