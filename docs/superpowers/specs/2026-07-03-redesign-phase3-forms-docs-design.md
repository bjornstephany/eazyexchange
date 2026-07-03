# Product Redesign — Phase 3: Formulaires + Documents

**Date:** 2026-07-03
**Source of truth:** `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/Eazyexchange Formulaires.dc.html` and `Eazyexchange Docs.dc.html` (open in a browser with `support.js` alongside; the demo scripts define the exact copy, pills, add-panel tiles, and drawer layouts). Phases 1–2 are merged and deployed; see `2026-07-02-redesign-phase1-tokens-shell-design.md` for the phase list and locked cross-phase decisions (cookie session, per-phase French, hidden rail items).

**Scope decisions (user-approved):**
- **In:** the two pages + drawers; draft→active template lifecycle; conditional per-student docs; PDF template import; contextual top-bar search as a client-side list filter; manual « Relancer les familles »; auto-send checklist email at Phase 2 opening; standard library auto-provisioned at exchange creation (+ backfill).
- **Out:** « Tout télécharger » (ZIP of a pièce's uploads — the drawer button is simply not rendered this phase); « Aperçu élève » (drawer secondary for online forms — deferred to Phase 5 when the redesigned student rendering exists; the drawer's question list covers the need meanwhile); redesign of the submission-review surface (Phase 4 Élèves); student-space redesign (Phase 5, except the minimal PDF download link below); French migration of the daily cron reminder email (cross-phase open item).

---

## 1 · Routes & information architecture

| Route | View | Notes |
|---|---|---|
| `/forms` | **Formulaires** | NEW top-level page, session-scoped via `ee_active_exchange` cookie. Templates with `kind in ('online','pdf')`. |
| `/forms/[templateId]` | Edit form | Restyled builder (metadata + fields for online; metadata + replace-PDF for pdf). |
| `/documents` | **Documents** | NEW top-level page, session-scoped. Templates with `kind = 'doc'`. |
| `/documents/[templateId]` | Edit pièce | Metadata only (name, description, deadline, condition label). |

Rail (`components/shell/OrganizerShell.tsx`): unhide **Formul.** → `/forms` and **Docs** → `/documents` between Candid. and the avatar (Élèves/Réglages stay hidden until Phase 4). Active states: `pathname.startsWith('/forms')` / `pathname.startsWith('/documents')`. Icons per the handoff rail markup (`RailIcons.tsx` additions).

Old routes:
- `/exchanges/[id]/forms/new` → `redirect('/forms')`; `/exchanges/[id]/forms/[formId]` → `redirect('/forms/<formId>')` (redirect can't set the session cookie — same accepted transition behavior as Phase 2).
- `/exchanges/[id]` is **slimmed** to the exchange header + `ApplicationsCard` (still the `#invite` anchor target until Phase 4). The per-student × per-template grid and the « New form » button are deleted. `getExchangeGrid` **stays** — `/dashboard` consumes it for the Phase-2 rollups.
- `/exchanges/[id]/submissions/[assignmentId]` (review page) **stays as-is**: « À vérifier » rows in the doc drawer link to it. The designed review surface arrives with Élèves (Phase 4).

## 2 · Data model

### Migration (one file)

```sql
alter table form_templates
  add column kind text not null default 'doc' check (kind in ('online','pdf','doc')),
  add column status text not null default 'active' check (status in ('draft','active')),
  add column audience text not null default 'all' check (audience in ('all','conditional')),
  add column standard_key text,
  add column condition_label text,
  add column template_file_path text;
alter table form_templates alter column deadline drop not null;
-- coherence checks:
--   kind='online' ⇔ type='data_entry'; kind in ('pdf','doc') ⇔ type='document_upload'
--   status='active' ⇒ deadline is not null
--   audience='conditional' ⇒ kind='doc'
create unique index on form_templates (exchange_id, standard_key) where standard_key is not null;
alter table exchanges add column phase2_checklist_sent_at timestamptz;
```

Backfill existing rows: `kind` from `type` (`data_entry`→`online`, `document_upload`→`doc`), `status='active'`, `audience='all'` (the column defaults do this) — prod behavior is unchanged until the UI lands.

### Trigger changes (same migration)

- `assign_students_to_new_template` (AFTER INSERT): only assign when `new.status='active' and new.audience='all'`.
- NEW AFTER UPDATE trigger: when `status` transitions draft→active on an `audience='all'` template, assign every enrolled same-school student (same body, `on conflict do nothing`).
- `assign_templates_to_new_enrollment`: add `ft.status='active' and ft.audience='all'` to the join filter. **New enrollees are not auto-added to conditional docs** — the organizer chooses.
- Conditional activation does not use triggers: the server action inserts assignments for the chosen student ids.

### Storage

New private bucket `form-templates` (mime `application/pdf`, 10 MB cap, mirroring `20260628000007_documents_bucket_limits.sql`). Path `{school_id}/{template_id}.pdf`. Policies: organizers read/write within their school prefix; students read a file iff they hold an assignment to the template that references it. Drafts are invisible to students by construction (no assignments ⇒ the existing `students read assigned templates` row policy already excludes them).

### Standard library

Canonical definition in `lib/forms/standard-library.ts` (pure data + a `seedStandardTemplates(supabase, exchangeId, schoolId, userId)` helper called from `createExchange`). All items created as **Brouillon**. Content verbatim from the handoff demos:

**Forms** (`/forms`):
| key | kind | name | fields |
|---|---|---|---|
| `sante` | pdf | Formulaire de santé | Groupe sanguin · Allergies connues · Traitements en cours · Régime alimentaire particulier · Vaccins à jour · Médecin traitant · Personne à prévenir (1) · Personne à prévenir (2) · Autorisation de soins d'urgence |
| `decharge` | pdf | Décharge de responsabilité | Autorisation de participation au programme · Décharge de responsabilité · Autorisation de déplacement / transport · Assurance responsabilité civile · Signature — représentant légal 1 · Signature — représentant légal 2 |
| `photo` | pdf | Consentement photo | Photos de groupe pendant le séjour · Publication sur les réseaux sociaux · Site & supports de l'établissement · Presse locale / partenaires · Signature du représentant légal |
| `accueil` | online | Conditions d'accueil | Frères / sœurs au domicile (text) · Animaux domestiques (text) · Spécificités alimentaires (text) · Allergies au domicile (text) · Langue(s) parlée(s) en famille (text) · Tabac au domicile (checkbox) · Chambre individuelle (checkbox) · Échange mixte accepté (checkbox) |

Descriptions per the demo (e.g. sante: « Antécédents médicaux, allergies, traitements en cours et contacts d'urgence. »).

**PDF "fields" are informational**: they list what families fill on paper, shown in the drawer as « Champs à renseigner ». Store them as `form_fields` rows (label + `field_type='text'`, required) on the `type='document_upload'` template — schema-legal, and the student flow ignores `form_fields` for upload templates. The single upload slot of every pdf/doc template is auto-created (label = template name).

**Docs** (`/documents`), all `kind='doc'` with one slot:
| key | audience | name | description |
|---|---|---|---|
| `passeport` | all | Passeport | Copie du passeport en cours de validité (valide 6 mois après le retour). |
| `ast` | all | AST — autorisation de sortie du territoire | Formulaire CERFA 15646 signé par un titulaire de l'autorité parentale, avec copie de sa pièce d'identité. |
| `idp1` | all | Pièce d'identité parent 1 | Carte d'identité ou passeport du représentant légal signataire de l'AST. |
| `idp2` | all | Pièce d'identité parent 2 | Carte d'identité ou passeport du second représentant légal, le cas échéant. |
| `livret` | conditional (« si parents divorcés ») | Livret de famille | Pages parents + enfant, demandé uniquement en cas de séparation pour justifier l'autorité parentale. |
| `medical2` | conditional (« si avis médical requis ») | Formulaire médical complémentaire | Complément demandé lorsque le formulaire de santé signale un traitement ou une allergie sévère. |

**Backfill:** the migration inserts this same set (SQL snapshot; drafts, so triggers stay silent) for every existing exchange that lacks the `standard_key`s. Standard items cannot be deleted; « Supprimer » is custom-only.

## 3 · Derivations (`lib/forms/rollup.ts`, pure + unit-tested)

Per template, from its assignments + submissions:
- **total** = assignment count (reflects audience).
- **Forms « reçus »** = submissions in `submitted|approved`. Card label « {done} / {total} reçus » + bar; drafts show « Pas encore envoyé » (no bar).
- **Docs**: fourni = `approved`; à vérifier = `submitted`; en cours = `draft`; à refaire = `rejected`; manquant = no submission. Card label « {fourni} / {total} fourni(s) »; attention pill priority: **Brouillon** (warn, draft template) > « N manquant(s) » (bad, N = total − fourni − à vérifier) > « N à vérifier » (info) > « Complet » (ok).
- **Drawer rows** (docs): only students *not* fourni are listed (pills: Manquant bad / En cours warn / À vérifier info / À refaire bad); collapsed rest row « + N élève(s) — pièce fournie et validée ». À vérifier rows link to the existing review page.
- **Stats cards** — Formulaires: actifs count · « Élèves concernés » (enrolled student count) · static third stat value « Phase 2 » label « Demandés en » · bar « Réponses reçues {Σdone} / {Σtotal} » over active forms. Documents: « Documents demandés » (all listed) · « Élèves concernés » · « Pièces à vérifier » (Σ submitted) · bar « Pièces reçues {Σfourni} / {Σtotal} » over active docs.
- Banner (docs): « … jusqu'à l'échéance du {frShortDate(earliest active doc deadline)}. » — omit the deadline clause when none. Reuse `lib/dashboard/format.ts#frShortDate` (accepts timestamptz; realistic timestamps in test fixtures — Phase 2 lesson).

## 4 · Server actions (`actions/forms.ts`)

All organizer-scoped (existing `assertOrganizer*` helpers), throwing French messages surfaced inline.

- `createDraftTemplate({ kind: 'online'|'pdf'|'doc', name, audience?, conditionLabel?, deadline?, file? })` — creates the draft (+ auto slot for pdf/doc; uploads the PDF to `form-templates` when provided). Returns id.
- `updateTemplate(id, { name, description, deadline, conditionLabel })` + `replaceTemplateFile(id, file)`.
- `activateTemplate(id, { studentIds? })` — validates: deadline set (« Ajoutez une échéance avant d'activer »); pdf has a file; online has ≥1 field; conditional has ≥1 chosen student. Sets `status='active'`; conditional → inserts the chosen assignments. If the exchange is already Phase 2, emails the newly assigned students for this item.
- `deleteTemplate(id)` — custom only (`standard_key is null`); UI confirms (cascades student submissions).
- `remindTemplate(id)` — manual relance: emails students holding an incomplete assignment (no `submitted|approved` submission) for this template, **skipping anyone with `last_reminded_at` < 24 h**; updates `last_reminded_at` (keeps the daily cron paced); returns `{ reminded, skipped, failed }` → « N relancé(s), M en échec ».
- `setExchangePhase(…, 2)` (existing action, extended): if `phase2_checklist_sent_at is null`, send each enrolled student one checklist email of their active incomplete items, then stamp it. Toggling 1↔2 never re-spams.
- Page data: `getFormsPage()` / `getDocumentsPage()` — active-session templates + rollup inputs, computed via `lib/forms/rollup.ts`, serializable props.

**Emails** (in `lib/email.ts`; French, tutoiement, user content HTML-escaped, no PII in logs): (a) relance « {name}, il manque … » per template; (b) Phase-2 checklist listing pending items + deadlines + login link; (c) activation-in-Phase-2 notice (reuses the relance template). The Deno cron function is untouched.

## 5 · Components

New `components/forms/` and `components/documents/`, Phase-2 pattern (server page fetches/computes → client view renders). Copy verbatim from the handoff files; tokens/typography from Phase 1.

- **FormsView** (client): H1 « Formulaires » + subline; stats card; navy banner « Les formulaires actifs sont envoyés automatiquement aux familles à l'ouverture de la Phase 2, avec relance jusqu'à réception. »; « Vos formulaires · N » + secondary « + Ajouter un formulaire »; card list (42px icon navy/blue, name, type pill « PDF · à signer » neutral / « Formulaire en ligne » info, mono STANDARD/PERSONNALISÉ, description, 150px progress or « Pas encore envoyé », Actif ok / Brouillon warn pill, « Aperçu » / « Modifier » buttons). List layout only (the demo's Grille prop is an exploration variant — implement the default).
- **AddFormPanel** (inline dashed panel): two tiles per design (« Importer un PDF » / « Créer un formulaire en ligne »); clicking a tile flips the panel to a short inline form — name (required), échéance (optional), PDF file (required for pdf) — « Créer le brouillon » creates the draft and opens its drawer.
- **FormDrawer** (460px right drawer, `drwIn`/`bdIn` animations, Esc/outside/✕ close — mirror `StudentDrawer`): header icon + name + type/status pills; description; pdf → hatched placeholder block « modèle PDF · aperçu du document »; « Champs à renseigner » / « Questions du formulaire » list; empty-fields dashed notice per demo; footer: « Modifier le modèle » (primary → `/forms/[id]`), « Télécharger » (pdf only, signed URL; « Aperçu élève » is out of scope — see scope decisions), draft → « Activer » primary variant, custom → « Supprimer » danger.
- **DocsView / AddDocPanel / DocDrawer**: same vocabulary. Add tiles « Obligatoire pour tous » / « Selon la situation » (second asks an optional condition label); cards with req pill (« Obligatoire » info / condition text neutral), attention pill, « Détail » / « Modifier »; drawer with chips « PDF · JPG · PNG » · « 10 Mo max » · « Échéance {frShortDate} », « Suivi par élève » rows + collapsed rest, draft empty-state notice + « Choisir les élèves & activer » (inline `StudentPicker` checkbox list of enrolled students for conditional; « Activer » directly for `audience='all'`), active → « Relancer les familles » primary; custom → « Supprimer ».
- **Edit pages** `/forms/[id]`, `/documents/[id]`: token-styled, French, functional-plain (no designed reference): metadata form (name/description/échéance/condition), online → restyled `FormBuilder` (French labels; existing add/remove field actions), pdf → replace-file. Existing `FormBuilder` is rewritten in place (French + tokens), not duplicated.
- **Shell**: top-bar right side becomes page-aware — `/forms` → search « Rechercher un formulaire… » + primary « + Nouveau formulaire »; `/documents` → « Rechercher un document… » + « Demander un document »; elsewhere « + Inviter des élèves » (unchanged). `ShellUiContext` gains `{ listSearch, setListSearch, requestAdd, addRequestId }` — the shell input writes `listSearch` (cleared on route change); the page CTA bumps `addRequestId`; views filter client-side on name match and open the add panel on `addRequestId` change.
- **Student side (minimal)**: on the my-forms submission page, a `kind='pdf'` template renders a « Télécharger le document à signer » link (signed URL from `template_file_path`) above its upload slot. Nothing else changes until Phase 5.

## 6 · Error handling

- Action errors → inline 14px danger text in the panel/drawer that triggered them (existing pattern).
- Activation validation messages are specific (échéance manquante, PDF manquant, aucune question, aucun élève choisi).
- Upload: client-side type/size check before the storage call; bucket limits enforce server-side.
- Relance partial failure → « N relancé(s), M en échec » (danger when M>0).
- Search with no matches → « Aucun résultat pour “{q}” ».
- Zero-exchange session → same lead-in as `/dashboard` (line + button opening the new-exchange modal via `ShellUiContext`).
- `/forms/[id]` for an out-of-scope id → existing ownership assertion throws → organizer `error.tsx`.

## 7 · Testing

- `lib/forms/rollup.ts`: counts, every pill mapping, attention priority, stats aggregation, empty inputs, timestamptz fixtures.
- `lib/forms/standard-library.ts`: seeding shape (10 items, keys, kinds, fields), idempotence guard.
- Actions (mocked supabase, existing patterns): create/activate validations, conditional assignment insertion, delete guard on `standard_key`, relance cooldown + partial failure, phase-2 checklist stamp guard.
- Components: FormsView add flow + drawer open + search filter; DocsView attention pills + student picker + relance state.
- Redirect stubs; migration applied via `supabase db push` (IPv4 pooler gotcha) **before** merging code that reads the columns.
- Gates before merge: `pnpm lint`, `pnpm test`, `npx tsc --noEmit`, plus a live drive: both pages, create + activate one custom form and one conditional doc, PDF round-trip (upload template → student download link), manual relance.

## 8 · Rollout

Feature branch `redesign/phase-3-forms-docs`. Order: migration + standard library + rollup lib → `/forms` (view, panel, drawer, edit page) → `/documents` (same) → shell/search/rail + redirects + slim exchange page → emails (relance, phase-2 checklist) → student PDF link. Migration is backwards-compatible (backfill mirrors current behavior); merge = production deploy, requires user confirmation after gates + live drive.
