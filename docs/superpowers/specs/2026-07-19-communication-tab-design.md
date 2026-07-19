# Communication tab — Design Spec

**Date:** 2026-07-19
**Status:** Approved (design). Next: per-phase implementation plans (writing-plans skill).

## Goal

Give organizers one home — a new **Communication** rail tab — for everything to
do with communicating with students and parents:

1. **Infos** — author the "key information" cards students read.
2. **Modèles** — edit the wording of the student/parent-facing automated emails.
3. **Annonces** — compose and send an ad-hoc broadcast to the participants of
   the active exchange, with a history of what was sent.
4. **Réglages auto** — control automatic reminders (on/off + cadence).

Everything is scoped to the **active exchange** (the existing
`ACTIVE_EXCHANGE_COOKIE` session, resolved via `resolveActiveExchange`), matching
the rest of the organizer app.

This spec supersedes the placement decisions of
`docs/superpowers/plans/2026-07-18-exchange-key-info.md` (which is unbuilt): the
`exchange_info_cards` table and student-side "Infos" tab from that plan are
reused wholesale, but the **organizer authoring UI moves from Settings → Programme
into the Communication tab**. The reminder on/off + cadence controls likewise
**move out of Settings → Programme** into the Communication tab.

## Non-goals (YAGNI)

- No scheduled/queued announcements — **send-now only** in v1.
- No 5-language management of email/announcement **content**. The student portal
  is not internationalized (hardcoded French); template and announcement bodies
  are single-language free text the organizer types. Only the Communication-tab
  **UI chrome** is translated across the 5 organizer locales.
- No rich-text/HTML editor. Templates expose **fixed text slots**; announcements
  are plain text (auto-linkified). The email layout, colors, real action links,
  and dynamic blocks stay system-controlled.
- No editing of organizer-facing/system emails (new-application alert, organizer
  invite, feedback notification).
- No in-app student inbox — announcements are delivered by email only.

## Architecture overview

- **New rail tab** `Communication` in `components/shell/OrganizerShell.tsx`,
  placed between **Students** and the **Settings** gear, at route `/communication`.
- **New route group page** `app/(organizer)/communication/page.tsx` — a server
  page that resolves the active exchange, loads data for each sub-tab, and renders
  a client `CommunicationView` with sub-tabs **Infos · Modèles · Annonces ·
  Réglages auto** (same tabbed-panel pattern as `components/settings/SettingsView.tsx`).
- All new tables use **RLS as the isolation layer** — no service-role/admin
  client. Organizer access is scoped to their school's exchanges; students get
  read-only access only where they need it (info cards).
- **Never throw for expected outcomes.** Validation failures return structured
  results with a stable error **code**; the client maps the code to a translated
  string. Only auth guards throw the load-bearing `'Unauthenticated'` /
  `'Unauthorized'` strings.
- Server actions split by trust model and use the shared preambles
  (`requireOrganizer()` / `requireStudent()` from `lib/auth/require.ts`);
  exchange scope via the existing private `assertExchangeInScope` in
  `actions/exchanges.ts`; archived-write gate via `assertExchangeWritable`
  (`lib/exchange-guard.ts`).
- Email content is always HTML-escaped (`esc`) before sending (email-injection
  rule). Recipient emails / student PII are never logged.

## Build strategy — four sequential phases

One design spec (this doc), **four sequential implementation plans / PRs**, each
independently shippable. Build in this order:

1. **Communication shell + Infos**
2. **Réglages auto** (move reminder settings)
3. **Annonces** (broadcast)
4. **Modèles** (editable templates — touches the edge function)

Each phase gets its own writing-plans plan and its own PR. Per CLAUDE.md session
hygiene, treat each phase boundary as a `/clear` point.

---

## Phase 1 — Communication shell + Infos

### Data model
Reuse the `exchange_info_cards` table exactly as specified in the key-info plan
(`id, exchange_id, title, body, position, created_at, updated_at`; FK index; RLS:
organizers of either side of the exchange full R/W, enrolled students read-only).
Ship it with the `test:rls` matrix cases from that plan.

### Organizer side
- New rail tab + `/communication` page + `CommunicationView` client shell with the
  four sub-tabs. Phase 1 only wires the **Infos** sub-tab; the others render a
  simple "coming soon"/empty frame until their phase lands (or are added tab-by-tab
  — implementer's choice, but the shell exists from Phase 1).
- **Infos** sub-tab hosts the info-card editor. Reuse the key-info plan's
  `lib/exchange/info-card.ts` (pure `validateInfoCard`, `INFO_TITLE_MAX = 120`,
  `INFO_BODY_MAX = 2000`) and the `getInfoCards`/`addInfoCard`/`updateInfoCard`/
  `deleteInfoCard` server actions in `actions/exchanges.ts` — unchanged from the
  key-info plan. Only the component location differs: the editor
  (`InfoCardsCard`-equivalent) renders inside `CommunicationView`, not
  `SettingsView`, and the page load happens in the communication page, not the
  settings page.

### Student side
- New student-side **Infos** tab exactly as the key-info plan specifies:
  `components/student/StudentTabs.tsx` (hardcoded French: "Mon dossier", "Infos"),
  rendered in `app/(student)/layout.tsx`; `actions/student-info.ts`
  (`getStudentInfoCards`); `lib/student/linkify.tsx` (`segmentText` + `Linkified`);
  `components/student/InfoCardsView.tsx`; `app/(student)/infos/page.tsx`.

### i18n
Organizer chrome keys (rail label `shell.nav.communication`, sub-tab labels,
info-card strings) added to all 5 locale files with parity tests. Student strings
hardcoded French.

---

## Phase 2 — Réglages auto (move reminder settings)

- **Move** `ReminderSettingsCard` rendering out of `SettingsView` (`prog` section)
  into `CommunicationView`'s **Réglages auto** sub-tab. The action
  `updateReminderSettings` and the `exchanges.reminders_enabled` /
  `reminders_cadence` columns are unchanged; only the host component/page moves.
- Remove the reminder card from Settings → Programme; Programme keeps the rest
  (`ProgramCard`, data). Update `app/(organizer)/settings/page.tsx` to stop passing
  reminder data if it is no longer needed there, and load it in the communication
  page instead.
- Update the affected tests (`SettingsView.test.tsx`, and add a
  `CommunicationView` reminder test).
- No migration.

---

## Phase 3 — Annonces (broadcast)

### Data model
New table **`announcements`**:
```
id              uuid pk
exchange_id     uuid not null references exchanges(id) on delete cascade
subject         text not null   check (char_length between 1 and 200)
body            text not null   check (char_length between 1 and 5000)
audience        text not null   check (audience in ('all','incomplete','approved'))
sent_by         uuid not null references users(id)
sent_at         timestamptz not null default now()
recipient_count int not null default 0
```
FK index on `exchange_id`. RLS: organizers of the exchange's school full R/W;
**no student access** (delivery is by email). Ships with `test:rls` matrix cases
(cross-tenant deny read/insert; own-school allow; student deny).

### Recipients
Participants of the **active exchange**, filtered by `audience`:
- `all` — every enrolled participant.
- `incomplete` — participants with at least one non-approved/incomplete dossier.
- `approved` — participants whose dossier is fully approved.

The audience→recipient resolution is a pure helper
(`lib/communication/audience.ts`, unit-tested) fed the exchange's assignment/
submission rows; the server action supplies the data.

### Send path
- `actions/announcements.ts` (organizer trust model): `sendAnnouncement(exchangeId,
  { subject, body, audience })` — `requireOrganizer` → `assertExchangeInScope` →
  `assertExchangeWritable` → validate (structured result) → resolve recipients →
  loop synchronously calling `lib/email.ts` `send()` (schools ≤ ~30 students, no
  queue needed) → respect the existing rate limiter → record per-recipient sends in
  `email_send_log` → insert one `announcements` row with `recipient_count`.
- Body is plain text: HTML-escaped, newlines preserved, URLs auto-linkified, then
  wrapped in the standard `layout()` from `lib/email.ts`. A new
  `sendAnnouncementEmail` helper in `lib/email.ts` renders it.
- `getAnnouncements(exchangeId)` returns the history for the active exchange.

### UI
`Annonces` sub-tab: compose form (subject, message textarea, audience radio with
live recipient counts) + **Envoyer maintenant** button + a history list
(subject · recipient_count · date). Validation errors mapped from codes to
translated strings.

---

## Phase 4 — Modèles (editable templates)

### Scope
Editable set (student/parent-facing only): **invitation** ("bonne nouvelle"),
**form_reminder**, **checklist**, **submission_rejection**.

### Data model
New table **`email_templates`**:
```
id            uuid pk
exchange_id   uuid not null references exchanges(id) on delete cascade
kind          text not null check (kind in
                ('invitation','form_reminder','checklist','submission_rejection'))
subject       text
greeting      text
body          text
button_label  text
updated_at    timestamptz not null default now()
unique (exchange_id, kind)
```
FK index on `exchange_id`. A row exists **only when customized**. RLS: organizers
of the exchange's school full R/W; **no student access** (templates are consumed
server-side / edge-side, never read by the browser as a student). The edge
function reads via the service-role client it already uses. Ships with `test:rls`
matrix cases.

### Editable slots per kind
The dynamic parts stay system-controlled; per kind the editable slots are:
- **invitation**, **submission_rejection** (app-sent, single-exchange): `subject`,
  `greeting`, `body`, `button_label`. Variables `{prenom}` / `{echange}` are
  auto-filled; the real action link is system-injected into the button.
- **form_reminder**, **checklist**: `subject`, `greeting`, and the **intro
  paragraph** only. The missing-items list and the button remain system-rendered
  (they are dynamic).

### Resolution
A shared notion "custom row for (exchange, kind) → else code default", where the
code defaults are today's `lib/email.ts` strings extracted into named default
constants so app and edge function share the same fallback text.
- **App-sent** (`invitation` via `actions/apply.ts`; `submission_rejection` via
  `actions/applications-review.ts`): read the override by `exchange_id`, else
  default. Clean — always exactly one exchange.
- **Edge-function-sent** (`form_reminder`, `checklist` in
  `supabase/functions/send-reminders`): a reminder email can aggregate a student's
  overdue items across multiple exchanges. **Resolution rule (approved):** if all
  of the student's overdue items belong to a single exchange, use that exchange's
  custom template; if they span exchanges, use the code default. The edge function
  gains a small template fetch (by `exchange_id`) with default fallback; the pure
  Deno rendering in `email-copy.ts` is parameterized on the resolved
  subject/greeting/intro.

### UI
`Modèles` sub-tab: a list of the 4 templates; selecting one opens its editable
slots with a **live preview** (rendered via the same layout as the real email,
with sample `{prenom}`/`{echange}` values), a **Réinitialiser** (reset to default =
delete the custom row), and **Enregistrer** (upsert). Empty slots fall back to the
default at render time, so a partially-customized template still works.

### Rollout note
This phase deploys the `send-reminders` edge function
(`supabase functions deploy send-reminders`) after the migration + app changes —
call it out in the phase's PR merge-time steps.

---

## Cross-cutting requirements

- **Migrations:** staging-first (`supabase db push --db-url "$STAGING_DB_URL"`),
  then prod via MCP `apply_migration`, then MCP `generate_typescript_types` →
  overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit`. Reconcile the
  filename version against `list_migrations`.
- **Verifying Changes gate** before any push (every phase): `pnpm lint`,
  `pnpm test`, `pnpm build`; plus `pnpm test:rls` for phases that touch
  migrations/RLS (Phases 1, 3, 4).
- **i18n parity:** every new organizer string in all 5 locale files;
  `messages/__tests__/parity.test.ts` must stay green. Student strings hardcoded
  French.
- **PII:** never log recipient emails, names, or submission contents in the
  announcement/reminder send paths.
- **Autonomy stops at the PR** for each phase; Bjorn merges with a merge commit
  and runs any listed merge-time steps (edge-function deploy for Phase 4).

## Testing summary

| Phase | Unit | RLS matrix | Migration |
|---|---|---|---|
| 1 Infos | `validateInfoCard`, `segmentText` | `exchange_info_cards` | yes |
| 2 Réglages auto | reminder card render/move | — | no |
| 3 Annonces | `audience` resolver, validation | `announcements` | yes |
| 4 Modèles | template resolution + defaults, per-kind slot rendering | `email_templates` | yes |

## Open items resolved during design

- Placement → **new top-level rail tab**, absorbing reminder settings + info-card
  authoring from Programme.
- Announcement recipients → **active exchange, with status filters** (all /
  incomplete / approved).
- Template edit depth → **fixed text slots, system-controlled layout**.
- Editable templates → **student/parent-facing set** (invitation, form_reminder,
  checklist, submission_rejection).
- Template scope → **per-exchange** (override → code default).
- Announcement timing → **send-now only**, with history.
- Reminder-template ambiguity across exchanges → **single-exchange custom, else
  default**.
