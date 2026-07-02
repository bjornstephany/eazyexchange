# Product Redesign — Phase 2: Dashboard Views (Aperçu / Échanges / Candid.)

**Date:** 2026-07-02
**Source of truth:** `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/Eazyexchange Dashboard.dc.html` (open in a browser with `support.js` alongside; the three views switch via the rail; the file's demo script defines the exact pills, funnel stages, action-card copy, drawer, and application-detail layout). Phase 1 (tokens + shell) is merged and deployed; see `2026-07-02-redesign-phase1-tokens-shell-design.md` for the phase list and locked cross-phase decisions.

**Scope decision (user question timed out; chosen per recommendation — revisit at spec review):**
"UI + phase + bulk" — the three views, student drawer, application detail,
`exchanges.phase` column + stepper, bulk accept/reject, exchange progress %.
**Deliberately out of scope:** « À revoir » (shortlist) status, manual
« Relancer » action (reminders stay automatic; the design's reminder line is
informational), « Marquer confirmé », the design's layout-B variant (implement
default layout A per handoff README), top-bar search (still deferred).

---

## 1 · Routes & information architecture

| Route | View | Notes |
|---|---|---|
| `/dashboard` | **Aperçu** (Vue d'ensemble) | Rewritten page; session-scoped via the `ee_active_exchange` cookie. |
| `/exchanges` | **Échanges** | NEW top-level page: billing state + exchange list. Owns the zero-exchange state. |
| `/applications` | **Candid.** (Candidatures) | NEW top-level page, session-scoped. `?id=<applicationId>` renders the full-page application detail sub-view. |

Rail changes (in `components/shell/OrganizerShell.tsx`):
- Aperçu → `/dashboard` (active: `pathname === '/dashboard'`)
- Échanges → `/exchanges` (active: `pathname === '/exchanges'` or `pathname.startsWith('/exchanges/')` minus applications) — **always visible**, even with zero exchanges (the view holds the upsell/empty state; drop the Phase-1 gating)
- Candid. → `/applications` (active: `pathname.startsWith('/applications')`) — visible only with an active session
- « + Inviter des élèves » keeps linking to `/exchanges/[activeId]#invite` (unchanged)

Redirects (old bookmarks keep working):
- `app/(organizer)/exchanges/[id]/applications/page.tsx` → `redirect('/applications')`
- `app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx` → `redirect('/applications?id=<applicationId>')`
- These two page trees are otherwise deleted; their UI is absorbed. A redirect
  cannot set the session cookie, so a bookmark for a non-active exchange lands
  on the active session's Candidatures — accepted transition behavior.
- `/exchanges/[id]` (forms area) is untouched (Phase 3); the Échanges view's
  exchange cards link to it («Gérer»-style link on each card).

## 2 · Data model & derivations

### Migration: `exchanges.phase`

```sql
alter table exchanges add column phase smallint not null default 1 check (phase in (1, 2));
```

- The existing "organizers update exchanges" RLS policy already permits
  organizer updates; **verify the before-update guard trigger from
  `20260630000003_review_findings_hardening.sql` allows `phase`** and amend it
  in the same migration if it is column-restrictive.
- New server action `setExchangePhase(exchangeId, phase: 1 | 2)` in
  `actions/exchanges.ts`: organizer-scoped (reuse `assertExchangeInScope`),
  validates `phase ∈ {1,2}`, updates, `revalidatePath('/dashboard')`.
- Phase drives: the Aperçu funnel/table/action cards/subline, and the top-bar
  pill « Phase 1 · Recrutement » / « Phase 2 · Préparation » (tint style).
  The organizer switches phase by clicking the stepper in the Aperçu right rail.

### Status mapping (pure functions, `lib/dashboard/rollup.ts`)

Application statuses today: `draft, submitted, rejected, accepted, declined, maybe, enrolling, enrolled` (invitation emails go out automatically on acceptance — matches the design's copy).

**Funnel Phase 1** (from non-draft applications of the active exchange):
- Reçues = all
- À examiner = `submitted`
- Acceptés = `accepted + maybe + declined + enrolling + enrolled`
- En attente = `accepted` (invited, no response yet)
- Confirmés = `enrolling + enrolled`

**Aperçu table Phase 1** — columns Élève / Candidature (submitted date, `12 sept` format) / Statut / Réponse:
- Statut pill: submitted → neutral « À examiner »; accepted → warn « En attente »; enrolling|enrolled → ok « Confirmé »; maybe → warn « Hésite »; declined → bad « A décliné »; rejected → bad « Refusé »
- Réponse: enrolling|enrolled → ok « Oui »; maybe → warn « Peut-être »; declined → bad « Non »; else plain « — »

**Funnel Phase 2** (per confirmed student — `enrolling|enrolled` — from their assignments + submissions in the active exchange):
- Confirmés = all confirmed students
- Formul. en attente = students with ≥1 `data_entry` assignment lacking a `submitted|approved` submission
- À vérifier = students with ≥1 submission in `submitted` (awaiting review)
- Docs manquants = students with ≥1 `document_upload` assignment lacking a `submitted|approved` submission
- En retard = students with ≥1 incomplete assignment past its `deadline`

**Aperçu table Phase 2** — columns Élève / Formulaires / Documents / Échéance / Statut:
- Formulaires: all data_entry complete → ok « Reçu »; none started → bad « Manquant »; else warn « En cours »
- Documents: all document_upload complete → ok « Complet »; any submitted awaiting review → info « À vérifier »; none → bad « Manquant »; else warn « En cours »
- Échéance: earliest incomplete assignment deadline (`10 oct` format); Statut: info « À vérifier » if any awaiting review, ok « Complet » if everything approved/submitted, bad « En retard » if late, else warn « Incomplet »

Pill palette (matches handoff `K()`): ok `#0F7A3D`/`#E4F5EA` ≈ existing `success`; warn; info = `tint`; bad = `danger`; neutral. Use the Phase-1 Tailwind tokens.

**Action cards (« À faire maintenant »)** — Phase 1: « N candidature(s) à examiner » (accent, CTA Examiner → filters table to À examiner), « N élève(s) hésite(nt) — à relancer » (warn, CTA filters to maybe; informational — no send action). Phase 2: « N dossier(s) à vérifier » (accent), « N élève(s) : documents manquants » (warn), « N élève(s) en retard » (bad). Empty state: « Tout est à jour ✓ — prochaine échéance le {date}. » (real earliest deadline; omit the date clause if none).

**Reminder line**: « Relance automatique demain 8h — N élève(s) relancé(s)… » per phase, N = En attente + Hésite (P1) or Docs manquants + Formul. en attente (P2). Informational only (the daily edge function does the sending).

**Progress bar** (right rail): P1 = « N / M candidatures traitées » (traitée = not `submitted`); P2 = « N / M dossiers validés » (all assignments complete).

**Exchange progress %** (Échanges cards): phase-1 exchange → % candidatures traitées; phase-2 → % dossiers validés; no applications/students → hide the bar, show « — ».

### Bulk actions (`actions/applications.ts`)

- `acceptApplications(ids: string[])`, `rejectApplications(ids: string[], note: string, sendEmail: boolean)` — server actions looping the existing single-item logic (ownership assertion per id; keep the invitation-email side effect). Return `{ succeeded: number; failed: number }`; partial failure surfaces as « N acceptées, M en échec » in the view. No new email templates.

## 3 · Components & files

New directories `components/dashboard/`, `components/exchanges/`, `components/applications/` (one clear responsibility per file):

**Aperçu** — `app/(organizer)/dashboard/page.tsx` (server: fetch applications + confirmed-student rollups + exchange.phase, compute via `lib/dashboard/rollup.ts`, pass serializable props):
- `OverviewView.tsx` (client): H1 « Vue d'ensemble » + phase-dependent subline; funnel card (clickable stage tiles — 22px count/11.5px label — toggling a filter; dismissible « Filtre : {stage} ✕ » chip); students table (mono uppercase 10px headers on `#FBFCFE`, 14px rows, status pills, chevron, hover `hoverrow-soft`; row click opens drawer); layout A: 344px right rail.
- Right rail: `PhaseStepper.tsx` (« Progression de l'échange », progress bar + label, two steps — click calls `setExchangePhase`, busy-disables), action cards + reminder line (part of `OverviewView` or a small `ActionCards.tsx`).
- `StudentDrawer.tsx` (client): slides from right (animation `drwIn` 30px/backdrop fade per handoff); header initials + name + stage pill + ✕; « Parcours » timeline (derived from application status per handoff logic); for confirmed students « Formulaires & documents · échéance {due} » checklist from real assignments (label + optional note + pill); reminder note line; footer actions — submitted: « Accepter & inviter » (primary) + « Refuser » (secondary, uses existing reject with its note/email semantics via a small confirm step); others: no actions (out-of-scope actions omitted). Esc/outside-click/✕ close.

**Échanges** — `app/(organizer)/exchanges/page.tsx` (server: exchanges + billing state + per-exchange progress):
- `ExchangesView.tsx`: H1 « Échanges » + « Suivez tous vos programmes d'échange — passés, en cours et à venir. »; billing block — trial: ★ banner « Essai gratuit — votre premier échange est offert » + 3 plan tiles (Starter 2 échanges / Growth 6, POPULAIRE / Scale illimités, prices per `/billing` page copy, CTA « Choisir {plan} » → `/billing/checkout?plan=`); subscribed: « Forfait {Plan} » card + « Gérer l'abonnement » → `/billing/portal`; « Vos échanges » card list (name, year badge, phase tag, dates/meta line, progress bar + pct label, link to `/exchanges/[id]`) + « + Nouvel échange » (opens the existing modal — needs `onNewExchange` reachable: expose the shell's modal via a lightweight client context `ShellUiContext` provided by `OrganizerShell`, consumed by `ExchangesView` and the 2e-style empty state); at-cap footer « Créez d'autres échanges en choisissant un forfait. » + « Choisir un forfait » → `/billing`.

**Candid.** — `app/(organizer)/applications/page.tsx` (server: session-scoped `listApplications`; `?id=` → `getApplicationForReview`):
- `CandidaturesView.tsx` (client): H1 « Candidatures » + subline with counts; segmented tabs (Toutes / À examiner / Acceptées / Refusées) with counts; selectable rows (checkbox column, header select-all) → bulk bar « {n} sélectionnée(s) » with « Accepter & inviter » / « Refuser » / « Annuler » (bulk actions above; busy states; result toast-line); table columns ✓ / Élève / Niveau 26-27 / Langue mat. / Reçue le / Statut / ›; row click → detail (`router.push('/applications?id=…')`). Niveau/Langue read from the application's `data` JSON fields (fall back « — »).
- `ApplicationDetail.tsx` (server-renderable): « ‹ Retour aux candidatures » + « ⎙ Imprimer la candidature » (print stylesheet: `data-noprint` on shell chrome — add to rail/top bar in `OrganizerShell` — content flows); header name + status pill + « Candidature · {exchange} · {year} »; sections from the application data per `APPLICATION_SECTIONS` (Élève, Parents (Père/Mère), Situation familiale, Conditions d'accueil, Profil de l'élève Q&A), photo if present; footer actions Accepter & inviter / Refuser (existing single actions + reject note flow — restyle the existing `ApplicationReviewActions`; `ApplicationReadView` may be reused/restyled where it fits).

**Shell tweaks** (`components/shell/`): rail hrefs/visibility per §1; top-bar pill shows the active exchange's phase label (layout passes `phase`); add `data-noprint` to rail + top bar; provide `ShellUiContext` (open-new-exchange-modal).

**Deletions**: old applications pages' UI (`exchanges/[id]/applications/**` beyond the redirect stubs). `ApplicationsCard` stays on `/exchanges/[id]` (the #invite anchor target).

## 4 · Copy

All Phase-2 view copy is French, verbatim from the handoff file (headings, sublines, funnel labels, pill labels, action-card copy, drawer timeline strings, tabs, bulk labels, plan-tile copy). The handoff demo's plan names («Essentiel/Association/Réseau») are stale exploration values — the README + `/billing` page govern: **Starter / Growth / Scale**. Dates render in French short form (`12 sept`, `10 oct`) via a small `lib/dashboard/format.ts` helper (fr-FR `Intl.DateTimeFormat`, no new dependency).

## 5 · Error handling

- Bulk actions: per-id failures don't abort the batch; the view reports « N acceptées, M en échec » (danger text) and refreshes.
- `setExchangePhase` failure: stepper reverts, inline danger text.
- `/applications?id=` for an out-of-scope/unknown id: the existing ownership assertion throws → render the standard error state (organizer `error.tsx`), not a crash.
- Zero-exchange: `/dashboard` and `/applications` show a lead-in to create an exchange (simple French line + button opening the modal via context — full 2e design lands in the system-states phase); `/exchanges` renders its designed empty/upsell state.

## 6 · Testing

- `lib/dashboard/rollup.ts`: exhaustive unit tests — funnel counts both phases, every pill mapping, late/deadline logic, progress %, empty inputs.
- Bulk actions: success, partial failure, ownership rejection (mock supabase per existing action-test patterns).
- Components: OverviewView filter toggle + chip dismiss + drawer open; CandidaturesView tab counts + select-all + bulk bar visibility; ExchangesView trial vs subscribed vs at-cap rendering.
- Redirect stubs; `setExchangePhase` validation.
- Migration applied via `supabase db push` (IPv4 pooler gotcha per memory) **before** merging code that reads `phase`.
- Full gates before merge: `pnpm lint`, `pnpm test`, `npx tsc --noEmit`, plus live drive of the three views (headless session-cookie method from Phase 1 verification).

## 7 · Rollout

Feature branch `redesign/phase-2-dashboard`. Suggested implementation order: rollup lib + migration → Aperçu → Échanges → Candid. + redirects → shell tweaks live throughout. Merge = production deploy; requires user confirmation. Old routes redirect; no data is destroyed.
