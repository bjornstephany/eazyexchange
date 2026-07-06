# Collaborators + Nouvel échange redesign — design

**Date:** 2026-07-07 (brainstormed from the 2026-07-06 feedback backlog, sub-project 3
plus the « Nouvel échange » items of sub-project 2)
**Status:** Approved design, ready for planning.

## Context: most of "collaborators" already exists

The phase-4 Réglages redesign (merged + deployed 2026-07-04) already shipped a
complete team system. Discovered during this brainstorm — the backlog assumed the
feature didn't exist:

- **Réglages « Équipe & rôles » card** (`components/settings/TeamCard.tsx`): invite
  by email (owner-only), member list with Propriétaire/Administrateur badges,
  pending invites with « Révoquer ».
- **Backend** (`actions/settings.ts`, `actions/join.ts`): `organizer_invites` table
  (token, 14-day expiry, revocation), custom French Resend email
  (`sendOrganizerInviteEmail`), `/join/[token]` acceptance page creating a
  pre-confirmed account with HIBP password check and rate limiting, rollback on
  partial failure.
- **Role model:** `users.org_role` = `owner` (self-registered founder, set by
  `lib/auth/provision.ts`) or `admin` (invitees, set by `acceptOrganizerInvite`),
  pinned by a DB trigger. `assertOwner` gates invites, revocation and sensitive
  settings actions. Admins are otherwise full school-wide equals (existing RLS
  scopes by `school_id`).

**Decision: keep this system exactly as-is** — owner/admin roles, owner-only team
management, token+Resend invite flow. (An earlier "fully symmetric management"
answer was given before the existing owner model was discovered and is superseded.)

## Goal

Fill the gaps the backlog actually needs:

1. Removing an **active** collaborator (today only pending invites can be revoked).
2. Onboarding asks whether to add a collaborator.
3. Adding collaborators is part of exchange creation.
4. « Nouvel échange » redesign: single name field — drop the partner-school and
   year inputs, stop creating phantom partner-school rows.

## Locked decisions

1. Collaborators are full school-wide equals (existing RLS, no permission changes).
2. Owner-only team management, per the deployed model. The new remove action is
   owner-only too; the owner can never be removed, so a school always has one.
3. One account = one school; an email that already has any EazyExchange account
   cannot be invited (existing `email_exists` handling in `/join` acceptance).
4. « Nouvel échange » collects **one field: « Nom de l'échange »**. `year` defaults
   server-side to the current year (DB column stays NOT NULL). The partner-school
   input is removed — the app never needs data about the other school.
5. **`exchanges.school_b_id` becomes nullable**; `createExchange` stops creating a
   phantom partner-school row per exchange (those rows pollute `schools`, which is
   also the billing/customer table). Existing exchanges keep their partner rows.

### Why school_b is safe to make optional (verified)

`school_b` is already a phantom: `createExchange` always creates a fresh empty
school and organizer signup always creates a new school, so no user can ever belong
to school B — every `or school_b_id = my_school_id()` branch in policies and scope
checks is dead in practice and simply never matches null. The immutability guard
trigger (20260630000003) uses `is distinct from` (null-safe). SQL tests insert
explicit `school_b_id`, which stays legal.

## Data model

One migration, no RLS changes:

```sql
alter table exchanges alter column school_b_id drop not null;
```

## Server-side changes

### `removeOrganizer(userId)` — new, in `actions/settings.ts`

Follows the file's conventions (`getOrganizerCtx`, `assertOwner`, thrown French
messages consumed by the client card, rate limiting not needed — owner-gated).

- Guards: caller is owner; target exists, `role='organizer'`, `org_role='admin'`,
  same school. (Owner removal is impossible by construction.)
- Admin client, before deletion, reassigns every FK the target may hold to the
  caller: `form_templates.created_by`, `submissions.reviewer_id`,
  `applications.reviewer_id`, `organizer_invites.invited_by`. (These are the only
  four `references users(id)` columns an organizer can hold; verified against all
  migrations.)
- `admin.auth.admin.deleteUser(userId)` — the profile row cascades.
- `revalidatePath('/settings')`.

No "resend invite" action: revoking a pending invite and inviting again already
covers that path.

### `createExchange` — slimmed (`actions/exchanges.ts`)

- Input: `name` only (non-empty after trim, else the existing structured
  `invalid` result). `year: new Date().getFullYear()`. Insert `school_b_id: null`;
  delete the partner-school `schools` insert block.
- New optional input: collaborator emails from the modal. After the exchange is
  created, each is sent via the existing `inviteOrganizer` logic **best-effort**:
  invite failures never fail the creation and are returned in the result
  (`{ ok: true, inviteErrors?: { email, message }[] }`) for inline display before
  the redirect. Guard: emails are only processed when the caller is the owner
  (mirrors `assertOwner`; silently skipped otherwise — the UI never offers it to
  admins).

## UI

1. **TeamCard « Retirer »** (owner view only, active admin rows): button opening a
   confirm dialog — « {name} perdra l'accès à tous les échanges de votre
   établissement. » — then `removeOrganizer`. Errors surface in the card's existing
   inline error slot.
2. **Onboarding, two steps** (`app/onboarding`): step 1 = existing school-name form,
   unchanged and still mandatory. Step 2 = « Invitez vos collègues (optionnel) » —
   email input + « Inviter » calling `inviteOrganizer` (the onboarding user is
   always the freshly-provisioned owner), invited addresses listed as sent, and a
   prominent « Passer » / « Continuer » to the dashboard. No new gate.
3. **Nouvel échange modal** (`components/shell/NewExchangeModal.tsx`), redesigned:
   - Single « Nom de l'échange » field, placeholder « Espagne 2026 ».
   - For owners only: a collapsed « + Inviter un collaborateur (optionnel) »
     affordance expanding to an email input whose entries accumulate as removable
     chips; submitted together with the exchange. (`org_role` reaches the modal via
     the organizer layout → `OrganizerShell` props.)
   - One primary « Créer l'échange » button. If some invites fail, the exchange is
     still created; failures show inline before redirecting.
4. **Exchange detail header** (`app/(organizer)/exchanges/[id]/page.tsx`): when
   `school_b` is null show « {name} · {year} »; legacy exchanges keep
   « A ↔ B · year ». Any other `school_b?.name` display sites get the same
   null-fallback.

## Edge cases

- Email already a member / already invited → existing French errors from
  `inviteOrganizer` (unchanged).
- Modal chips duplicate an email → dedupe client-side before submit.
- Removing an admin who authored templates or reviews → FK reassignment above;
  nothing dangles, no NOT NULL violations.
- `/join` acceptance is password-only (no Google button) — unchanged, acceptable;
  a Google identity can be linked later by the user if ever needed. Out of scope.
- Collaborator emails never appear in logs (same PII discipline as students).

## Testing

- **Actions:** `removeOrganizer` — happy path incl. FK reassignment order (reassign
  before delete), guards (non-owner caller, owner target, cross-school, student
  target, unknown id). `createExchange` — name-only validation, `school_b_id: null`,
  year default, best-effort invites (failure doesn't fail creation; admin caller's
  emails skipped).
- **Components:** TeamCard (Retirer visible only to owner on admin rows; confirm
  flow; error surface), NewExchangeModal (single field; chips add/remove/dedupe;
  owner-only visibility of the invite section; inviteErrors display), onboarding
  step 2 (invite + skip).
- **SQL tests:** unchanged and expected green.
- **Gate:** `pnpm lint` + `pnpm test` + `tsc --noEmit`, then one live-drive on the
  Vercel preview: create an exchange with a collaborator chip → invite email →
  `/join` acceptance → co-manage → remove the collaborator from Réglages.

## Out of scope

- Per-exchange permissions or more role tiers.
- Multi-school membership for one account.
- Partner-school accounts / cross-school collaboration (`school_b` stays for legacy
  display only).
- Google sign-in on `/join`.
- Reminder-email controls, 2FA, feedback widget (other sub-projects).
