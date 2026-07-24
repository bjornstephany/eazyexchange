# Communication tab redesign — Infos, Modèles, Historique

Date: 2026-07-24
Branch: `feature/communication-redesign`

## Problem

The Communication page (`/communication`, organizer, active-exchange-scoped) has
three sub-tabs and two of them are wrong.

**Infos** renders every published info card as a live `<input>` + `<textarea>`
with Save and Supprimer always present, and the "add new" block at the bottom
uses *the identical* `rounded-xl border border-subtle px-[18px] py-4` shell. An
organizer cannot tell, at a glance, which blocks 24 families are already reading
and which one is the compose box. Every card is one stray keystroke from being
edited and one stray click from being deleted, with no confirmation.

**Modèles** edits exactly one email — the « Bonne nouvelle » acceptance mail —
and instructs the organizer, in the UI, to type `{{student_name}}` and
`{{exchange_name}}`. Exposing template syntax to a schoolteacher is not
acceptable.

**No record of what went out.** Info cards are published silently; the
« Bonne nouvelle » mail is sent silently. Nothing in the product answers "what
did we tell families, and when".

## Scope

In scope: the Infos sub-tab, the Modèles sub-tab, and a new Historique sub-tab.

Explicitly **out** of scope:

- Making the other ~14 emails in `lib/email.ts` (invitation, relance, checklist,
  rejet, setup…) visible or editable. Modèles stays a single-template surface.
- Any history of *automatic* email (the 08:00 cron relances, application
  confirmations, invitations). Historique covers only what this page owns:
  Infos and the « Bonne nouvelle » template.
- `Réglages auto` (reminder cadence) — untouched.

## 1. Infos

`components/communication/InfoCardsCard.tsx` splits into a list container plus
`InfoCardRow.tsx` and `InfoCardComposer.tsx`.

### Published card, at rest

No form controls exist in the DOM at rest — not disabled inputs, *no inputs*.

- Status line: `● Visible par les élèves · modifiée le 22 juil.` (falls back to
  `publiée le …` when `updated_at == created_at`).
- Title in display type, not an input.
- Body as a paragraph, `whitespace-pre-wrap`, clamped to ~4 lines with an
  « Afficher tout » toggle when longer.
- A single ghost `Modifier` at top-right.

### Edit mode

One card at a time (the list holds the editing card id; opening another closes
the first, confirming first if dirty).

- The card swaps to inputs and takes a brand-coloured border, so the thing being
  changed is unmistakable.
- `Enregistrer` (primary) and `Annuler` (ghost).
- `Supprimer` exists **only inside edit mode**, pushed right, danger-outline,
  and is two-step inline: « Supprimer ? Cette info disparaîtra du portail des
  élèves. » → `Confirmer` / `Annuler`. Inline, not `window.confirm` — the native
  dialog is untranslatable and untestable in jsdom.
- `Annuler` with unsaved changes also confirms inline.

Net effect: three deliberate acts to destroy something families are reading,
versus today's one click.

### Composer

- Collapsed to a dashed-outline, full-width `+ Ajouter une info` button that
  cannot be mistaken for a card.
- Expands to title + body + `Publier` / `Annuler`. The verb is **Publier**, not
  « Ajouter » — it names the consequence.
- On success it collapses back and the new card appears with its published
  marker.

### Archived exchange (`readOnly`)

No `Modifier`, no composer. Cards render exactly as at rest. The existing
`readOnlyNotice` string stays.

## 2. Modèles

`components/communication/GoodNewsCard.tsx`.

- The `placeholdersLabel` line and its two `<code>` chips are **deleted**.
- The header instead states when the mail fires: « Envoyé automatiquement aux
  parents lorsque vous acceptez une candidature. »
- Each of the two fields (Objet, Message) gets its own small `Insérer :` chip
  row — per-field rather than one shared toolbar, so there is never a question
  which field a chip lands in. Two chips: « Prénom et nom de l'élève »,
  « Nom du programme ».
- Insertion happens at the caret via `selectionStart`/`selectionEnd` on the
  element ref, replacing any selection, then restoring the caret after the
  inserted token.
- The body textarea loses `font-mono` — it is prose, not code.
- Reset-to-default, save, and the preview block keep their current behaviour and
  shape.

### Display transform

Insert-chips alone do not finish the job: inserting `{{student_name}}` still
leaves `{{student_name}}` sitting in the textarea. So the editor renders a
human-readable surface form while storage stays mustache.

```
toEditor('{{student_name}}')            → '[[Prénom et nom de l’élève]]'
toStored('[[Prénom et nom de l’élève]]') → '{{student_name}}'
```

- Pure functions in `lib/communication/tokens.ts`, unit-tested both directions
  and round-trip.
- **Storage format is unchanged.** `lib/good-news-template.ts`, `lib/email.ts`
  and every `good_news_subject` / `good_news_body` row already in prod are
  untouched. The transform lives only between the DB value and the editor's
  `value`/`onChange`.
- Labels are localized; storage is always mustache, so switching locale simply
  re-renders with the new label.
- `[[…]]` delimiters plus the exact localized label make accidental collision
  implausible; unmatched brackets degrade to literal text.

Result: an organizer never sees mustache anywhere in the product.

## 3. Historique (new sub-tab)

A fourth sub-tab alongside Infos / Modèles / Réglages auto. Exchange-scoped like
its siblings.

### Why not `audit_log`

`audit_log` already records `application.accepted`, but `lib/audit.ts` states its
invariant explicitly: *ids and action types only — never names, emails, notes or
contents*. Historique must show « Point de rendez-vous » and « Marie Dupont » to
be worth anything. Bending `audit_log` to carry labels would break a deliberate
rule. New table.

### Why not derive from existing timestamps

`exchange_info_cards` has only `created_at` / `updated_at`. Deriving history from
those gives at most two lines per card, re-edits overwrite each other, and
deleting a card erases it from history entirely — a log that quietly loses
entries, wrong in exactly the case someone consults it.

### Table

```sql
create table communication_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  exchange_id    uuid not null references exchanges(id) on delete cascade,
  actor_id       uuid references users(id) on delete set null,
  application_id uuid references applications(id) on delete cascade,
  kind           text not null check (kind in
                   ('info_published','info_updated','info_deleted','good_news_sent')),
  subject        text not null default '',   -- info card title, or applicant name
  status         text not null default 'ok' check (status in ('ok','failed'))
);
```

- `subject` is denormalized so a deleted info card keeps its record.
- `application_id` cascades, so erasing an application also erases the stored
  name — no orphan PII.
- `actor_id` is `on delete set null`, deliberately **not** `NO ACTION`, so it does
  not join the four FKs that already block auth-user deletion
  (`reference_deleting_auth_users_fk_block`).
- No `school_id`: derivable through `exchange_id`, and the RLS predicate joins
  `exchanges` anyway. Fewer FKs, fewer required indexes.

Indexes: `communication_events_exchange_idx on (exchange_id, created_at desc)`
(doubles as the `exchange_id` FK index), plus FK indexes on `actor_id` and
`application_id` to keep the `unindexed_fks` advisor at 0.

### RLS

Mirrors `exchange_info_cards` (`20260719173904`): non-recursive, referencing
`exchanges` plus the STABLE `my_role()` / `my_school_id()` helpers only, with
`(select …)` initplan wrappers per `20260705000004`.

- SELECT for organizers whose school is either side of the exchange.
- INSERT for the same set.
- Nothing for students.
- `revoke update, delete, truncate on communication_events from anon,
  authenticated` — append-only, same belt-and-braces as `audit_log`.

Writes go through the request-scoped client under RLS, so there is **no new
`lib/supabase/admin` import** and no change to
`lib/supabase/__tests__/admin-allowlist.test.ts`.

Retention: `communicationEvents: 365` in `lib/retention/rules.ts` plus a
`purgeByAge` line in `lib/retention/sweep.ts`, mirroring `emailSendLog`.

### Writes

`lib/communication/events.ts` exposes `recordCommunicationEvent()` — best-effort,
never throws, never rolls back the real action, same philosophy as
`logEmailSend`.

| Call site | Event |
|---|---|
| `addInfoCard` (`actions/exchanges.ts`) | `info_published`, `subject` = title |
| `updateInfoCard` | `info_updated`, `subject` = new title |
| `deleteInfoCard` | `info_deleted`, `subject` = title read **before** the delete |
| `reviewApplications` accept (`actions/applications-review.ts`) | `good_news_sent` per application, `subject` = `buildApplicantName(app.data)`, `status` from the send result |

### Behaviour change: awaiting the good-news send

Today the accept path is fire-and-forget:

```ts
void sendGoodNewsEmail({...}).catch(() => {})
```

so the send result never comes back. A history that records `status: 'ok'` for a
mail that bounced is worse than no history at all.

Change: `await` it, and have `sendGoodNewsEmail` return the boolean that the
internal `send()` helper already produces (`Promise<void>` → `Promise<boolean>`).

This does **not** serialize a bulk accept — the whole per-application body
already runs inside `Promise.all` over ids, so the Resend calls stay parallel. It
only makes the action wait for the slowest round-trip: on the order of a second
or two for a 20-candidate bulk accept, in exchange for a « ✗ Théo Leroy » line
that is actually true.

### View

`components/communication/HistoryCard.tsx`, fed by the last 200 events for the
active exchange (fetched in `app/(organizer)/communication/page.tsx` alongside
the existing loads).

Grouping is a pure function in `lib/communication/history.ts`:

- Day buckets, newest first, with a locale-aware date header.
- All `good_news_sent` events within a day collapse into one row:
  `✉ Bonne nouvelle envoyée · 4 familles`, stamped with the last event's time.
  Two separate accepts on the same day merging into one row is acceptable and
  arguably desirable.
- Info events stay one line each, with an icon, a verb, and the quoted subject.

Rendering:

- A collapsed good-news row shows `4 ✓ · 1 ✗` when any failed.
- Expanding names the families, failures in danger colour
  (« l'e-mail n'est pas parti »).
- No failure banner — at this volume the inline counts are loud enough.
- Empty state: « Rien n'a encore été envoyé ni publié pour ce programme. »
- Historique is read-only by nature, so it renders identically for archived
  exchanges — the tab stays available and the `readOnly` prop does not reach it.

### PII posture

`communication_events` stores applicant *names*, never email addresses.
Organizers already see these names in Élèves and Candidatures, so the tab
discloses nothing new. The table is an RLS-protected application table, not a log
sink — the CLAUDE.md "never log student/parent PII" rule targets logs, error
messages and analytics, and is not relaxed here. Deletion of the application
cascades the row away.

## Known edge cases

- **Multi-exchange students.** The `send-reminders` cron writes
  `exchange_id: null` when a student is enrolled in more than one exchange. Those
  rows are invisible to any exchange-scoped view. Out of scope here (cron mail is
  not in Historique at all), but recorded so it is not rediscovered later.
- **Retention purge.** After 365 days, events age out silently. Consistent with
  `email_send_log`; no UI affordance for it.

## Verification

- New i18n keys under `organizer.communication.history.*` and the reworked
  `communication.info.*` / `settings.goodNews.*` keys across all five locales.
  `messages/__tests__/parity.test.ts` enforces parity. FR transcription via
  sonnet (haiku strips accents), then the apostrophe guard.
- Unit: `lib/communication/__tests__/history.test.ts` (grouping),
  `lib/communication/__tests__/tokens.test.ts` (`toEditor` / `toStored`,
  round-trip, unmatched-bracket degradation).
- Component: `InfoCardRow` read → edit → delete-confirm, `InfoCardComposer`,
  `GoodNewsCard` caret insertion, `HistoryCard` render + expand.
- Action tests: an event lands on each of the four writes; `status: 'failed'`
  when the send returns false.
- `pnpm test:rls` matrix cases in the same PR, per CLAUDE.md: organizer of
  school A reads and inserts; organizer of an unrelated school denied; student
  denied; UPDATE and DELETE denied to everyone.
- Full gate: `pnpm lint`, `pnpm test`, `pnpm build`.
- Migration applied to **staging first**
  (`supabase db push --db-url "$STAGING_DB_URL"`), then prod via MCP
  `apply_migration`, then `list_migrations` ledger check and
  `generate_typescript_types` → `types/supabase.ts` → `npx tsc --noEmit`.
