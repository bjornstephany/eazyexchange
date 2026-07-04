# Phase 5 — Student space « Mon dossier » (redesign)

**Date:** 2026-07-04
**Design reference:** `Eazyexchange Espace Eleve.dc.html` + README §"Student app" and §2f (in `docs/Eazyexchange student exchange platform.zip`)
**Scope:** everything under `app/(student)/`. Part of the full-product FR redesign (Phase 5 of 8 — see memory `redesign-phases`).

## Goal

Bring the student-facing "Mon dossier" experience up to the redesigned, French, tutoiement design language — matching every other redesigned surface (Phases 1–4). Students land on a calm, encouraging dossier home that groups their pending work by status, shows overall progress and the next deadline, and lets them complete each form / upload each document. The functional flow already works (English, plain shadcn cards); this phase is a **visual + copy migration**, not a data-model change.

## Non-goals / out of scope

- **No data-model or RLS change.** Reuse the existing assignments / submissions / storage wiring untouched (`getMyAssignments`, `getAssignmentDetails`, `saveFormAnswers`, `recordDocumentUpload`, `submitDocumentAssignment`, signed-URL download). This flow is security-sensitive (student PII, storage RLS fixed live in Phase 3) — we restyle around it, we do not re-host it.
- **Generic loading (2a) and error (2b) screens stay on the shared `LoadingState` / `ErrorState`** for now; their redesign is Phase 7 (system states). Only the *student-specific* done/empty state (README 2f, and the two done states drawn in the Espace Eleve file) is in scope here.
- **Reminder / transactional emails stay English** (the `send-reminders` edge function still says "Complete your forms"). Frenchifying them is parked for the dedicated emails pass, per the cross-phase decision. No change here.
- No inline drawer/modal fill flow (see Decision 1).

## Approved decisions

1. **Fill flow = keep the separate route `app/(student)/my-forms/[assignmentId]`, redesigned in place** — *not* the prototype's inline drawer/modal. Rationale: (a) the rejection email deep-links to `/my-forms/[assignmentId]`, so that route must stay a real, cold-loadable page regardless; (b) the upload + data-entry wiring is security-sensitive and proven — restyle its wrapper, don't move it into an overlay; (c) consistent with how every organizer phase redesigned routes in place. The drawer remains a possible future fast-follow.
2. **Multi-exchange students** — the dossier home groups the checklist by **status** (À faire / En vérification / Validés) as designed, not by exchange. The top-bar session label shows the student's exchange (single-exchange is the realistic MVP case: one program per school pair). If a student ever has assignments across >1 exchange, degrade gracefully: still one greeting/header, and show the exchange name as a small mono tag on each card.
3. **Progress bar + « Prochaine échéance » = computed inline** on the home page from the assignments list. No shared rollup helper (none exists; one isn't warranted for these two derivations).
4. **`DataEntryForm` / `DocumentUploadForm` translated to French tutoiement in place** — they have no other consumer (organizer never renders them), so translating is safe and in-scope.

## Design tokens & vocabulary

Reuse the in-repo semantic tokens established in Phase 1 (all already defined): `bg-background` (#EEF1F7 canvas), `bg-card`, `text-navy` / `text-foreground`, `text-muted-foreground`, `bg-brand` / `bg-brand-hover` (primary blue), `bg-tint` / `text-tint-text` (blue tint), `bg-subtle`, `bg-hoverrow`, `text-placeholder`, `shadow-float`, `rounded-pill`, `font-display` (Schibsted Grotesk), `font-mono` (IBM Plex Mono), body IBM Plex Sans. Status pills reuse the existing `Badge` variants: `success` (validé), `info` (en vérification / envoyé), `danger` (à corriger / refusé), `neutral` (à faire / brouillon).

All copy **French, tutoiement**. Use the handoff strings verbatim (see each screen below). Apostrophes must be typographic U+2019 (`'`) — the recurring branch gotcha; never ASCII `'` in FR strings.

## Screens

### A. Student shell — top bar (`components/StudentNav.tsx` → redesigned, likely renamed `StudentTopBar`)

Replaces the current "logo + Sign out button" nav. Minimal top bar, full-width, `bg-card` + bottom border, height ~66px, content padded:
- **Left:** logo mark + "Eazyexchange" wordmark (reuse `components/brand/Logo`).
- **Right:** mono session label (the student's exchange name, e.g. « Espagne · Automne 2026 » styled as `font-mono` uppercase-ish micro-label, `text-muted-foreground`) + a round avatar button showing the student's initials (`bg-tint`/brand tone), opening a small dropdown menu with « Se déconnecter » — mirror the organizer shell's avatar-menu pattern (outside-click + Escape close, `aria-haspopup="menu"`).
- The content area below is a centered column (`max-w` ~900px per 2f) with generous top padding, on `bg-background`.

The layout (`app/(student)/layout.tsx`) resolves the data the top bar needs (student full name → derive prénom + initials; the student's exchange name for the session label) via a small server helper (e.g. `getStudentContext()`), and passes it to the top bar. Auth/role guard stays exactly as today (redirect non-students to `/dashboard`, unauthenticated to `/login`).

### B. Dossier home (`app/(student)/my-forms/page.tsx`)

Centered content column:
- **Mono kicker** `MON DOSSIER` (uppercase, letter-spaced, `text-muted-foreground`).
- **H1** `font-display` 30px « Bonjour {prénom}, » + subline (encouraging, tutoiement — use handoff copy).
- **Progress + next deadline row:** a full-width progress bar (track `bg-subtle`/#DDE3EF, fill `bg-brand`, ~10px) with a mono count « {envoyés} / {total} envoyés », where **envoyés = submitted + approved** (i.e. everything off the À-faire list; = `total − todoCount`), and a « Prochaine échéance » indicator showing the soonest deadline among non-approved assignments (or « … » when none). The bar fill = envoyés / total.
- **Checklist grouped into three status sections**, each with a mono section header + count:
  - **À faire · {todoCount}** — assignments with no submission, `draft`, or `rejected`. Rejected items carry an « À corriger » danger treatment and surface the organizer's `review_note`.
  - **En vérification · {reviewCount}** — `submitted` assignments (read-only; « On vérifie… »).
  - **Validés · {doneCount}** — `approved` assignments (✓, read-only).
  - Empty sections are omitted.
- **Checklist card** (per assignment): form/document title (`font-display`), status pill (Badge), due-date line (« Échéance … », or overdue treatment in danger when past & not approved), and a primary action button linking to `/my-forms/{assignmentId}`:
  - no submission → « Commencer »
  - `draft` → « Continuer »
  - `rejected` → « Corriger » (danger styling)
  - `submitted` / `approved` → no action (read-only), or a discreet « Voir » link.
  - When the student has >1 exchange, a small mono exchange-name tag on the card.

### C. Done / empty states (rendered by the home page when appropriate)

Two states from the Espace Eleve file, chosen by the dossier composition:
- **All submitted, nothing left to do** (À-faire empty, but not everything approved): « Tout est envoyé » — body « On vérifie tes dernières pièces — rien d'autre à faire pour l'instant. Tu recevras un message dès que c'est terminé. » Still show the progress bar + « En vérification » / « Validés » sections.
- **Everything approved** (README 2f — the complete dossier): blue-tint banner (`bg-tint`, `border`, `rounded`, generous padding) with a brand rounded square + white ✓, title « Ton dossier est complet » / « Tout est à jour », body « Toutes tes pièces sont validées — il ne te reste plus qu'à préparer ta valise. Bon voyage ! », plus the full progress bar at 100% + « {n} / {n} envoyés ».
- **No assignments at all** (organizer hasn't set anything up): a calm neutral message (tutoiement) rather than today's plain English text. (README 2f's "Tout est à jour" is for the all-done case; the never-assigned case gets its own gentle copy.)

### D. Fill / upload page (`app/(student)/my-forms/[assignmentId]/page.tsx` + `DataEntryForm` + `DocumentUploadForm`)

Same route, same server data (`getAssignmentDetails`, signed URL for PDF-to-sign), restyled + French:
- **Back link** « ← Mon dossier ».
- **Header:** title (`font-display`), optional description, « Échéance … » line, status Badge. Rejected → danger note box with the organizer's `review_note` (« Refusé par l'organisateur » → FR « À corriger »). Submitted → info note « Ta réponse est en cours de vérification. Tu seras prévenu·e dès qu'elle est validée. »
- **`DataEntryForm`** (data_entry): fields restyled to new inputs (44–50px, focus 2px brand border, required `*`), confidentiality note where relevant (« Tes réponses restent confidentielles… »), buttons « Enregistrer le brouillon » / « Envoyer », busy labels « Enregistrement… » / « Envoi… ». On submit → back to `/my-forms`.
- **`DocumentUploadForm`** (document_upload): dashed upload zone per slot (« Clique pour choisir un fichier », hint « PDF · JPG · PNG — 10 Mo max »), uploaded-file chip with replace, verification note « Ta pièce sera vérifiée par l'équipe du programme avant validation. », « Envoyer » disabled until all required slots filled with hint « Ajoute toutes les pièces requises pour envoyer. » Reuse `validateUploadFile` / `ALLOWED_UPLOAD_ACCEPT` and the existing storage upload path exactly.
- **PDF-to-sign** (`kind === 'pdf'`): keep the download link, FR « ⬇ Télécharger le document à signer » (already French in code).
- Read-only when `approved`/`submitted` (unchanged logic).

## Data & state

No new tables, columns, policies, or server actions for the core flow. Reuse:
- `getMyAssignments()` — already returns `form_templates(name, type, deadline, exchanges(name))` + `submissions(status, submitted_at, review_note)`. **Extension (read-only):** may need `form_templates.kind` and the exchange `year`/season for the label if not already selected; add fields to the existing `select`, no schema change.
- New small **read-only** server helper `getStudentContext()` (full name → prénom + initials, exchange label) for the top bar — reads `users.full_name` (self, RLS-safe) and the student's enrollment/exchange. No writes.
- Fill/submit: `getAssignmentDetails`, `saveFormAnswers`, `recordDocumentUpload`, `submitDocumentAssignment`, `createSignedUrl` — all unchanged.
- Progress counts + next deadline: derived client/server-side from the assignments array; pure functions, unit-testable.

## Error handling

Unchanged patterns: server-action throws surface as inline `text-destructive` messages inside the relevant card/form (reuse existing `err.message` handling in `DataEntryForm`/`DocumentUploadForm`). Page-level errors bubble to the student `error.tsx` (shared `ErrorState`, Phase 7). Auth/role redirects unchanged.

## Testing

- **Unit (vitest):** pure derivations — status→section bucketing (no-submission/draft/rejected → À faire; submitted → En vérification; approved → Validés), progress counts, next-deadline selection (soonest non-approved; none → null), overdue detection. Prénom/initials derivation from full name. FR copy strings assert U+2019 (grep guard for ASCII `'` in new FR strings, per branch history).
- **Component (vitest + testing-library):** dossier home renders the three sections with correct cards + actions per status; all-approved renders the complete-dossier banner and no À-faire section; never-assigned renders the calm empty copy. Fill page renders data-entry vs upload variants; rejected shows the note.
- **Live drive (user-gated, Phase-13-style):** real student magic-link session against prod — land on redesigned « Mon dossier », complete a data-entry form, upload a document, see status move À faire → En vérification, and confirm the rejection-email deep-link opens the restyled `[assignmentId]` page. (Single Supabase project points at prod; mutating steps need user go-ahead, per the auto-mode classifier lesson from Phase 4.)
- **Gates:** `pnpm lint`, `pnpm test`, `npx tsc --noEmit`, `pnpm build` all green before merge (the 4 Verifying-Changes gates).

## Build sequence (for the plan)

Rough order the implementation plan will detail: (1) `getStudentContext` helper + `getMyAssignments` select extension; (2) pure dossier-derivation lib + unit tests; (3) redesigned student top bar + layout wiring; (4) dossier home page (sections, cards, progress, next deadline) + done/empty states; (5) redesigned fill page + French `DataEntryForm`/`DocumentUploadForm`; (6) full gate + live drive + merge.

## Risks / watch-items

- **Apostrophe regression** (Tasks 2/4/8/11 of Phase 4 all hit it): every new FR string must use U+2019; add a grep check to the final review.
- **PII discipline:** no student name/email in logs; the top-bar helper reads self only.
- **Email deep-link parity:** the `[assignmentId]` route must stay cold-loadable (a student clicking the rejection email lands there directly) — don't make it depend on home-page state.
- **Deploy:** additive, no migration — merge to main = Vercel prod deploy (user-gated), no `supabase db push` needed. (Confirm no `send-reminders` change ships.)
