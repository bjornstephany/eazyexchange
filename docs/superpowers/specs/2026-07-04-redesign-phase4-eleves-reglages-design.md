# Product Redesign — Phase 4: Élèves + Réglages

**Date:** 2026-07-04
**Source of truth:** `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/Eazyexchange Eleves.dc.html` and `Eazyexchange Reglages.dc.html` (open in a browser with `support.js` alongside; the demo scripts define the exact copy, pills, chips, and layouts). Phases 1–3 are merged and deployed; cross-phase decisions (cookie session, per-phase French, hidden rail items) are locked in the Phase 1 spec.

**Scope decisions — ⚠️ taken autonomously (user was away during brainstorm); override any of these at spec review:**

- **Team roles = Propriétaire + Administrateur only.** Organizer invites, member list, pending/revoke ship this phase. « Lecture seule » is **deferred**: shipping a role select that stores "read-only" without RLS enforcement would be a false security promise, and enforcing it means touching every organizer policy (RLS is the most error-prone area). The role dropdowns from the design are therefore not rendered; the legend shows two cards instead of three. Full enforcement is a future phase.
  - *Alternatives considered:* (a) full owner/admin/read-only with RLS enforcement across all tables — too large and regression-prone to ride along; (b) store-but-don't-enforce — dishonest; (c) defer the whole section — leaves a designed section unbuilt for little savings.
- **Deferred rows in Compte:** the **2FA toggle** (a toggle without a TOTP enroll/verify flow is meaningless; full flow is its own project), **« Langue de l'interface »** select (no i18n infrastructure; app is mid-FR-migration), **« Changer la photo »** (the design itself renders initials avatars everywhere; needs a bucket + column for no visible payoff), and **e-mail change** (Supabase requires a confirmation round-trip; the field renders read-only with a hint). Password change **is** built.
- **Plan display names go French app-wide** (display-only; keys stay `starter/growth/scale`): Essai gratuit / **Essentiel** / **Association** / **Réseau** — applied in the new Facturation section *and* retrofitted to `ExchangesView` plan tiles + `/exchanges` page + `/billing` so no page contradicts another.
- **Prices: keep the app's current price points (in $).** The design shows 199 / 499 / 799 € **/an**; the app displays $299 / $499 / $599 and Stripe prices are env-configured (go-live pending). Currency/pricing is a business decision — **open question for the user**; code keeps `$299/$499/$599` until decided.
- **Archive** = `exchanges.archived_at` + a server-side write guard on mutating actions + UI affordances (« Archivé » pill, restore). Archiving does **not** free plan quota (the cap counts all owned exchanges — no archive-to-recreate loophole).
- **Status precedence on Élèves reuses `rollupStudent`** (dashboard's logic: À vérifier > Complet > En retard > Incomplet) rather than the demo script's (En retard first). Cross-page consistency with the Phase-2 dashboard wins; accepted deviation.
- **Submission review keeps the legacy page** (`/exchanges/[id]/submissions/[assignmentId]`). The handoff contains no review screen; checklist rows that have a submission deep-link to the legacy page. (Phase 3 note said "the designed review surface arrives with Élèves" — there is in fact no such design; the deep link is the resolution.)

---

## 1 · Routes & information architecture

| Route | View | Notes |
|---|---|---|
| `/students` | **Élèves** | NEW top-level page, session-scoped via `ee_active_exchange` cookie. Master-detail, client-side selection (no URL state). |
| `/settings` | **Réglages** | NEW top-level page. Left nav with client-side section state: Compte personnel / Équipe & rôles / Facturation / Programme. Facturation + Programme + team-management controls are owner-only. |
| `/join/[token]` | Organizer invite acceptance | NEW public page (mirrors the student `accept-invite` machinery). |

Rail (`OrganizerShell.tsx`): unhide **Élèves** → `/students` (between Docs and Réglages, requires an active exchange like Candid./Formul./Docs) and **Réglages** → `/settings` (always visible — settings exist without an exchange). New icons in `RailIcons.tsx` per the handoff markup (two dots; circle-with-dot).

Top bar:
- `/students`: page-scoped search « Rechercher un élève… » via the existing `shellUi.listSearch` mechanism (extend `listPage` to `'students'`) **plus** the « + Inviter des élèves » primary button (unlike forms/docs which swap it out) — per the Élèves design, which shows both. The invite button keeps its current target (`/exchanges/[id]#invite`).
- `/settings`: **no session selector, no phase pill, no search/CTA** — the top bar shows only the school name (per the Réglages design). Implemented as a pathname branch in `OrganizerShell`.

`/exchanges/[id]` stays as the invite / apply-link home (`#invite` anchor) — unchanged this phase.

## 2 · Data model

### Migration (one file, `20260704000001_phase4_eleves_reglages.sql`)

```sql
-- Organizer profile fields
alter table users
  add column phone text,
  add column title text,  -- « Fonction », e.g. Coordinatrice des échanges
  add column org_role text not null default 'admin' check (org_role in ('owner','admin'));

-- Backfill: earliest organizer per school becomes owner (must run BEFORE the
-- trigger function below is replaced, since the new version pins org_role).
update users u set org_role = 'owner'
where u.role = 'organizer' and u.id = (
  select x.id from users x
  where x.school_id = u.school_id and x.role = 'organizer'
  order by x.created_at, x.id limit 1);

-- Pin org_role in the existing immutability trigger (self-escalation guard):
-- guard_user_immutable_fields() gains `or new.org_role is distinct from old.org_role`.
-- (Ownership transfer is not a feature; service-role paths never change it either.)

-- Organizer invites (all writes via service-role server actions; owner checked in action)
create table organizer_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  email text not null,
  token text not null unique,
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index organizer_invites_school_idx on organizer_invites(school_id);
alter table organizer_invites enable row level security;
create policy "organizers read school invites" on organizer_invites for select
  using (my_role() = 'organizer' and school_id = my_school_id());
-- no INSERT/UPDATE/DELETE policies: service-role only.

-- Exchange archiving
alter table exchanges add column archived_at timestamptz;
```

Notes:
- `users.phone` / `users.title` are self-updatable through the existing « users update themselves » policy (RLS unchanged); `org_role` is pinned by the trigger, so that policy cannot escalate.
- New organizers created via `/signup` (self-registration creating a school) get `org_role='owner'` at insert; organizers created via invite acceptance get `'admin'`.
- Invite tokens follow the existing `lib/tokens.ts` + expiry conventions (same TTL as student invites; expired/revoked/accepted tokens rejected at acceptance).

### Cron (`send-reminders` edge function)

Skip assignments whose exchange is archived (join `exchanges.archived_at is null` into the candidate query). Deployed together with the migration at merge.

## 3 · Élèves page

### Data assembly

One server call per render, `getStudentsDirectory(exchangeId)` (`actions/students.ts`):
1. Enrolled students: reuse the `getExchangeGrid` query shape (enrollments → same-school student users, active templates, assignments + submission statuses as `CellMap`).
2. Applications for those students (`applications` where `enrolled_user_id in (…)`) → identity + parents from `data` jsonb.
3. Per student: `rollupStudent` (existing, `lib/dashboard/rollup.ts`) for the overall pill/due/late, plus a per-student checklist derived from **that student's assignments** (conditional pièces appear only for their assignees — counts are per-student, not the demo's global 8).

### List column (340px)

- H1 « Élèves » + subline `{N} élèves confirmés · {M} dossier(s) complet(s)`.
- Status chips with counts: **Tous / Complet / À vérifier / Incomplet / En retard** (kinds map to `rollupStudent().overall`; active chip = dark navy per demo). Chip filter combines with the top-bar search (accent-insensitive match on the student's name, mirroring the demo's `low()` normalizer).
- Sort: the demo's default « Par statut » (retard, incomplet, à vérifier, complet; alpha within a rank). The `tri`/`densité` design props are exploration aids — implement the defaults only.
- Rows: initials avatar (deterministic color from the demo's 10-color palette by index), name, one-line summary (« Dossier complet » / « n pièce(s) à vérifier » / « n pièce(s) attendue(s) » / « Échéance dépassée — n pièce(s) attendue(s) »), status dot. Selected row = 1.5px brand border + glow.
- Filter-empty state: « Aucun élève ne correspond au filtre. » Page-level empty (no enrolled students): centered note « Aucun élève confirmé pour cette session. » with a hint pointing to Candidatures. No active exchange → existing `EmptyDashboard`.

### Detail panel

- Header: avatar, name, overall status pill, subline `{Niveau} · {Classe} · {Langue}` (from application data, parts omitted when missing); actions **« Relancer »** (primary; disabled when the dossier is complete) and **« Candidature »** (ghost; links to `/applications?id={applicationId}`; not rendered if the student has no application row).
- **Identité** (label/value rows): Nom, Prénom, Date de naissance (dd/mm/yyyy), Niveau 26-27, Classe, Langue maternelle, E-mail, Téléphone ← application-data keys `last_name, first_name, date_of_birth, grade, french_class, native_language, email (fallback users.email), cell_phone`. Missing values render `—`. If the student has no application at all, the identity section shows name/e-mail from `users` and a muted note « Candidature introuvable pour cet élève. »
- **Parents**: PÈRE and MÈRE cards (name = `father_first_name + father_last_name`, tel, e-mail; `—` for missing fields; a card whose three fields are all empty is not rendered).
- **Dossier**: `Échéance {frShortDate(due)}` (hidden when no open deadline) · progress bar (color = overall pill kind) · `x/N pièces fournies` where *fourni* = approved and N = that student's assignment count · checklist rows: template name + group label (Formulaire for `kind in ('online','pdf')`, Document for `'doc'`) + status pill — approved → **Fourni** (ok), submitted → **À vérifier** (info), draft or rejected → **En cours** (warn), no submission → **Manquant** (bad). Rows with an existing submission link to the legacy review page.
- **Reminder note** (bottom box): complete → « Dossier complet — aucune relance prévue pour {prénom}. » Otherwise: « Relances automatiques par e-mail jusqu'à réception — {prénom} et ses parents reçoivent la liste des pièces attendues » + « (échéance du {date}) » when a deadline exists. *(Copy deviation: the demo's « Relance automatique demain 8h » is only true during the final week of the cron's pacing; the honest generic phrasing is used instead.)*

### Relancer

`remindStudent(exchangeId, studentId)`: factor Phase 3's per-template reminder core into a shared `remindAssignments(assignmentIds)` helper (same e-mail, same 24h per-assignment cooldown via `assignments.last_reminded_at`), applied to the student's incomplete assignments. Button flashes the result (« Relance envoyée » / « Déjà relancé récemment ») using the Phase 3 flash pattern.

## 4 · Réglages page

Left nav (222px, client state): Compte personnel · Équipe & rôles · Facturation* · Programme* (*owner-only: hidden for admins*). All data loads server-side in `page.tsx`; sections render from props.

### Compte personnel

- **Profil card**: initials avatar (no photo button) · fields **Nom complet** (`users.full_name`), **Adresse e-mail** (read-only, hint « Contactez le support pour changer d'adresse » ), **Téléphone** (`users.phone`), **Fonction** (`users.title`), **Établissement** (`schools.name`; editable — the existing column-grant migration already allows it) · « Enregistrer » via `updateProfile` server action → « ✓ Modifications enregistrées » flash (2.2s). *(Deviation: single Nom complet field instead of the demo's Prénom/Nom pair — `users.full_name` is one column used everywhere; splitting it is not worth the churn.)*
- **Sécurité card**: one row — « Mot de passe » + « Modifier le mot de passe » toggle revealing the 3-field panel (actuel / nouveau / confirmer). `changePassword` server action: verify the current password (`signInWithPassword`, rate-limited via the existing `rate_limits` machinery), check the new one against **HIBP** (new shared `lib/auth/hibp.ts`, k-anonymity range API — per the project decision that leaked-password protection is self-implemented on the free tier; fail-open on network error), then `updateUser({ password })`. Google-only accounts (no email identity): the button is replaced by « Connexion via Google — mot de passe non applicable ». The demo's « Dernière modification il y a 6 mois » subline is dropped (we don't track it). No 2FA row (deferred).

### Équipe & rôles

- Header + sub « Invitez des collègues à gérer vos échanges. Seul le propriétaire accède à la facturation. »
- **Invite row** (owner-only; admins see the list read-only): email input + « Inviter » (no role select — Administrateur implied). `inviteOrganizer`: validate email, reject existing members and pending invites, insert `organizer_invites` row, send a **French** invite e-mail (Resend, user content escaped) linking `/join/{token}`.
- **Member list**: every organizer `users` row of the school — initials avatar, name (+ VOUS pill on self), e-mail, « Propriétaire » navy pill on the owner. No per-member role dropdowns this phase.
- **Pending invites**: dashed-@ avatar rows with « Invitation envoyée » pill + « Révoquer » (owner-only; sets `revoked_at`).
- **Legend**: two cards — Propriétaire (« Tout gérer, y compris l'équipe et la facturation. ») and Administrateur (« Gérer élèves, candidatures, formulaires et documents. »).
- **`/join/[token]`** (public): validates the token (unknown/expired/revoked/accepted → French error page), shows school name + invited e-mail, collects full name + password (HIBP-checked), then a service-role action creates the auth user (e-mail pre-confirmed — link possession proves ownership) + `users` row (`role='organizer'`, `org_role='admin'`, inviter's `school_id`), stamps `accepted_at`, and signs the user in (mirror the student `accept-invite` session flow). Google sign-in works afterwards because the profile exists (the `/auth/callback` invite-only check passes).

### Facturation (owner-only)

- Plan card: FR plan pill (Essai gratuit / Essentiel / Association / Réseau), price (current $ points; trial = « 0 € », no per), description lines from the design, usage bar + label `{n} / {cap} échanges utilisés` (n = count of `school_a_id` exchanges — the exact number `createExchange` gates on; Réseau/scale → « {n} échange(s) actif(s) · échanges illimités », 6% bar).
- « Voir les forfaits » → `/billing`.
- **Moyen de paiement** row: when a Stripe customer with an active/grace subscription exists, fetch the default payment method server-side (brand + last4 + expiry, e.g. « Visa •••• 4421 — expire 08/27 ») and « Modifier » → `/billing/portal`; otherwise « Aucun moyen de paiement enregistré. » + « Ajouter une carte » → `/billing`.

### Programme (owner-only)

Operates on the **active session** (cookie), like every session-scoped page.

- Program card: exchange name, phase pill (or neutral « Archivé »), stats line `{X} élèves confirmés · {Y} candidatures · échéance dossiers {date}` (enrolled count, application count, earliest active-template deadline; parts omitted when absent).
- **Danger zone** (red-tinted card): « Archiver le programme » + explainer → confirm modal (copy per design: name, « passera en lecture seule… Vous pourrez le restaurer à tout moment. », ghost Annuler / red « Archiver le programme ») → `archiveExchange` sets `archived_at`. When archived, the zone shows « Restaurer » → `restoreExchange` (nulls it).

### Archived semantics

- **Write guard**: shared `assertExchangeWritable(exchangeId)` (throws « Programme archivé — lecture seule. ») called by every exchange-scoped mutating action: `setExchangePhase`, `setApplicationOpen`, template create/update/activate/delete/replace-file, field add/remove, `remindTemplate`/`remindStudent`, application review/invite/enroll actions, `approveSubmission`/`rejectSubmission`, and the student-side `saveFormAnswers`/`recordDocumentUpload`/`submitDocumentAssignment`. Reads stay open — dossiers remain consultable on every page.
- **UI**: session selector rows and the top-bar phase pill show « Archivé » (neutral) for archived exchanges; they remain selectable. `resolveActiveExchange`'s most-recent fallback prefers non-archived exchanges. Organizer pages render normally (server actions reject writes; primary CTAs on archived sessions are disabled where cheap — exhaustive CTA disabling is not required this phase). The redesigned student-space treatment of archived programs is Phase 5's problem; the server guard already protects writes.
- Cron skips archived exchanges (§2).

## 5 · Components & files

```
app/(organizer)/students/page.tsx        server assembly → StudentsView
app/(organizer)/settings/page.tsx        server assembly → SettingsView
app/join/[token]/page.tsx                invite acceptance (public)
components/students/StudentsView.tsx     client master-detail (list + chips + selection)
components/students/StudentDetail.tsx    detail panel
components/settings/SettingsView.tsx     section nav + section cards (Profile, Security, Team, Billing, Program)
lib/students/directory.ts               pure helpers: identity/parent extraction, checklist mapping,
                                         summary lines, chip counts/filter/sort (unit-tested)
lib/auth/hibp.ts                         k-anonymity range check (unit-tested, fetch mocked)
lib/exchange-guard.ts                    assertExchangeWritable
actions/students.ts                      getStudentsDirectory, remindStudent
actions/settings.ts                      updateProfile, changePassword, getTeam, inviteOrganizer,
                                         revokeOrganizerInvite, acceptOrganizerInvite,
                                         getBillingOverview, archiveExchange, restoreExchange
```

`actions/forms.ts`: factor the reminder core into `remindAssignments` (used by `remindTemplate` + `remindStudent`). `OrganizerShell`/`RailIcons`: new rail items, `/settings` top-bar branch, `listPage='students'`. Plan-label retrofit in `ExchangesView`, `/exchanges` page, `/billing` page. Organizer provisioning: the signup/confirm path sets `org_role='owner'` on the profile it creates (self-registration = school creation); invite acceptance sets `'admin'`.

## 6 · Error handling

- French user-facing errors via the established flash/inline patterns; owner-only actions re-check `org_role='owner'` **server-side** (UI hiding is not the security boundary).
- Invites: duplicate member / already-pending / invalid e-mail inline errors; `/join` token states (invalid, expired, revoked, already accepted) each get a clear French message; acceptance is idempotent-safe (token single-use via `accepted_at`).
- Password: wrong current password, confirmation mismatch, too short, HIBP hit (« Ce mot de passe apparaît dans des fuites de données connues — choisissez-en un autre. »). HIBP outage fails open.
- Archived guard errors surface through each page's existing error display; no student/parent PII in any log or error string (CLAUDE.md rule); all e-mail HTML escapes user-supplied content.

## 7 · Testing

- **Unit** (vitest): directory helpers (identity extraction incl. missing-application fallback, checklist pill mapping incl. rejected→En cours, chip counts, statut sort rank, accent-insensitive search); usage-label derivation per plan/trial; `assertExchangeWritable`; invite lifecycle (revoked/expired/accepted rejection); HIBP hit/miss/outage; password-action validation branches.
- **Component** (testing-library): StudentsView — chip filtering, search, selection, empty states, Relancer flash; SettingsView — section nav, owner vs admin gating, profile save flash, password panel toggle, archive modal confirm/cancel; realistic timestamptz fixtures (Phase 2 lesson).
- **Live drive before merge** (verification skill): invite a real colleague address end-to-end (accept → appears as member; revoke path), profile + password change, archive → verify a write is rejected + cron skip, restore; Élèves page against prod-shaped data; relance cooldown behavior.

## 8 · Rollout

Branch `redesign/phase-4-eleves-reglages`. The migration is additive and backward-compatible (defaults keep prod behavior unchanged until the UI lands: everyone stays effectively admin-equal except the backfilled owner, nothing is archived). Apply migration + deploy the updated edge function at merge time, same as Phases 2–3. Gates: `pnpm lint`, `pnpm test`, `tsc --noEmit` (local build has placeholder env), pre-push hook.

**Open questions for the user (do not block implementation start; affect copy only):**
1. Pricing display — adopt the design's € prices (199/499/799 €/an) or keep $299/$499/$599 until Stripe go-live decides currency?
2. The new organizer-invite e-mail is written in French (recipient is a colleague of a French organizer) while transactional student e-mails remain English pending the cross-phase decision — OK?
