# Automatic email controls + acceptance-email terms — design

Sub-project 4 of the 2026-07-06 feedback backlog
(`docs/feedback-backlog-2026-07-06.md`). Brainstormed and approved 2026-07-06/07.

## Problem

1. Automatic reminder pacing is hardcoded in the `send-reminders` edge function
   (weekly while a form's deadline is >7 days out, then daily in the final week
   and while overdue). Organizers cannot turn reminders off or change their
   rhythm, per exchange or at all.
2. The acceptance email carries no notice of the exchange's terms. Bjorn wants
   « by clicking accept you acknowledge… » wording so accepting is an explicit
   acknowledgment, not just an RSVP.
3. Incidental: both touched emails (`sendInvitationEmail` and the edge
   function's reminder email) still use pre-redesign English copy/styling while
   the rest of the product is French.

## Locked decisions

- **Control depth:** per-exchange named presets + a master on/off switch. No
  numeric knobs, no per-template schedules.
- **UI placement:** a « Rappels automatiques » card on the exchange detail page
  (`app/(organizer)/exchanges/[id]/page.tsx`). Not in Réglages (school-scoped,
  being moved by sub-project 2) and not in exchange creation (being redesigned
  by sub-project 3).
- **Storage:** two typed, CHECK-constrained columns on `exchanges` (approach A;
  jsonb and a separate settings table were rejected as unvalidated / overkill).
- **Terms placement:** both the acceptance email AND the respond page
  (`/invite/[token]`), where the actual accept click happens.
- **Terms source:** fixed app copy, identical for every exchange. No
  per-exchange editing.
- **Acknowledgment recording:** stamp `applications.terms_acknowledged_at` when
  the applicant clicks « Oui ».
- **French conversion in scope:** both the acceptance email and the automatic
  reminder email are rewritten in French as part of this work.
- Manual « Relancer » (`remindStudent`) is untouched and keeps working even
  when automatic reminders are off for the exchange.

## 1. Data model

One migration:

```sql
alter table exchanges
  add column reminders_enabled boolean not null default true,
  add column reminder_cadence text not null default 'normale'
    check (reminder_cadence in ('douce', 'normale', 'insistante'));

alter table applications
  add column terms_acknowledged_at timestamptz;
```

- Defaults reproduce today's behavior → no backfill; existing exchanges keep
  the current weekly→daily pacing.
- Deploy-order safe: the edge function treats absent/unknown values as
  `normale` + enabled, so migration and function deploy can land in either
  order.
- RLS: covered by the existing `organizers update exchanges` policy
  (`20260630000002`); the `guard_exchange_immutable_schools` trigger only
  guards the school columns and does not interfere.

## 2. Reminder presets

The daily 08:00 UTC cron is unchanged; presets only change the per-assignment
due gate inside the function.

| Preset | Far from deadline | Final stretch | Overdue |
|---|---|---|---|
| `douce` | every 7 days | every 7 days | every 7 days |
| `normale` (current behavior) | every 7 days | daily, last 7 days | daily |
| `insistante` | every 3 days | daily, last 14 days | daily |

Off (`reminders_enabled = false`) = no automatic reminder emails for that
exchange's assignments.

## 3. Edge function changes (`supabase/functions/send-reminders/`)

- The existing select's join gains columns:
  `exchanges(archived_at, reminders_enabled, reminder_cadence)`.
- Per row: skip when `reminders_enabled` is false; otherwise resolve the preset
  to `{ farIntervalDays, finalStretchDays }` and gate with the generalized
  `isDue(daysLeft, lastRemindedAt, preset)`. Unknown/missing cadence falls back
  to `normale` rather than failing the run. The 0.5-day stamp tolerance is
  kept.
- Per-student grouping across exchanges is unchanged: each assignment is gated
  by its own exchange's cadence; whatever is due the same morning still lands
  in one grouped email.
- **Extract the pure pacing logic into
  `supabase/functions/send-reminders/pacing.ts`** (preset map + `isDue`, no
  Deno globals) imported by `index.ts` — this makes it unit-testable under
  vitest.
- Email HTML rewritten in French, reusing the tone and brand styling of
  `sendStudentReminderEmail` in `lib/email.ts` (« Il manque encore ces éléments
  à ton dossier pour X… », blue #2456E6 button to `/my-forms`, French footer).
  Subject: `Rappel : ton dossier pour <exchange>`; when at least one listed
  form is overdue, the subject is instead
  `Action requise : ton dossier pour <exchange>`.
- Deploy note: `pnpm supabase functions deploy send-reminders` is a manual step
  alongside `supabase db push`.

## 4. Organizer UI — « Rappels automatiques » card

On the exchange detail page (`exchanges/[id]`):

- Toggle: Activés / Désactivés.
- When enabled, three radio choices with one-line descriptions:
  - **Douce** — « un rappel par semaine, sans accélération »
  - **Normale** — « hebdomadaire, puis quotidien la dernière semaine » (défaut)
  - **Insistante** — « tous les 3 jours, puis quotidien les 2 dernières
    semaines »
- Saves via a new server action `updateReminderSettings(exchangeId, enabled,
  cadence)` in `actions/exchanges.ts`:
  - validates `cadence` against the allow-list,
  - authz like `setApplicationOpen` (organizer-in-exchange, writable exchange),
  - updates the two columns, `revalidatePath` the exchange page.
- Archived exchanges: card read-only (consistent with other write actions
  gated by `assertExchangeWritable`).

## 5. Acceptance-email terms

- **Shared copy:** new `lib/exchange-terms.ts` exporting the fixed French terms
  sentence used by both surfaces so wording can never drift. Draft:

  > « En acceptant l'invitation, tu confirmes — et tes parents confirment —
  > avoir pris connaissance des conditions de l'échange communiquées par
  > l'établissement (participation aux frais, accueil du correspondant, règles
  > de vie pendant le séjour). »

  **SHIP GATE: this wording must be reviewed with Mom before the feature is
  deployed to production.** The implementation may land behind that review, but
  no prod deploy until the copy is approved.
- **Acceptance email** (`sendInvitationEmail` in `lib/email.ts`): rewritten in
  French — « Bonne nouvelle — ta candidature pour <exchange> a été retenue ! »,
  button « Répondre à l'invitation », then the terms notice as a smaller
  paragraph beneath the button. Gets its own French footer constant; the shared
  English `APP_FOOTER` is left untouched because the other application emails
  that use it (resume, confirmation, rejection) are out of scope here.
- **Respond page** (`components/InviteResponseForm.tsx`): small muted text
  directly under « Oui, je veux participer », lead-in adapted: « En cliquant
  sur "Oui, je veux participer", tu reconnais… » + the shared sentence body.
- **Recording:** in `respondToInvitation(token, 'yes')`
  (`actions/applications.ts`), the existing atomic claim UPDATE
  (`accepted/maybe → enrolling`) additionally sets
  `terms_acknowledged_at = now()`. If account creation later fails and the
  claim is released back to `accepted`, the timestamp is **kept** — it records
  that the acknowledgment click happened. `no` / `maybe` never set it; a retry
  after release simply overwrites the timestamp with the newer click.

## 6. Testing

Vitest, following existing patterns (`actions/__tests__/`, `lib/__tests__/`,
`components/__tests__/`):

- `pacing.ts` unit tests: interval math for all three presets (far /
  final-stretch / overdue), first-reminder (`last_reminded_at IS NULL`), the
  0.5-day tolerance, unknown cadence → `normale` fallback.
- `updateReminderSettings`: cadence allow-list rejection, non-organizer
  rejected, archived exchange rejected, happy path updates both columns.
- `respondToInvitation`: `yes` stamps `terms_acknowledged_at`, `no`/`maybe`
  don't.
- `sendInvitationEmail`: French copy present, terms sentence present, escaping
  still covered.
- `InviteResponseForm`: terms notice rendered next to the accept button.

Verification before merge: `pnpm lint`, `pnpm test`, `tsc --noEmit` (local
build fails on placeholder env), plus the standard preview live-drive: flip
cadence on a test exchange and confirm the card persists; accept an invite on
preview and confirm the timestamp lands.

## Error handling summary

- Server action rejects invalid cadence values; DB CHECK is the backstop.
- Edge function: unknown stored cadence → `normale`; a single bad row never
  aborts the cron run (existing per-student error isolation kept).
- Email send failures remain non-fatal to the caller (existing `send()`
  semantics).

## Out of scope

- Per-student pausing, custom numeric cadences, per-template schedules.
- Any change to manual « Relancer ».
- Reminder-time-of-day control (cron stays at 08:00 UTC).
- Per-exchange editable terms text (fixed app copy only).
