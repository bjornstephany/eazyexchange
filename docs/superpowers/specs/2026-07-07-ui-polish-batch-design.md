# UI polish batch — design

**Date:** 2026-07-07 (brainstormed from the 2026-07-06 walkthrough backlog)
**Source:** `docs/feedback-backlog-2026-07-06.md`, sub-project 2
**Scope exclusions:**
- The « Nouvel échange » items (field removals, creation UI) belong to sub-project 3 (collaborators).
- The exchange-coordinator testimonial stays **unchanged** (decided during brainstorming).

A batch of small, independent UI/copy fixes across the product. No schema
changes, no migrations, no new routes. Every item below is a locked decision.

---

## 1. Landing page

Files: `components/landing/LandingNav.tsx`, `HowItWorks.tsx`, `CtaBand.tsx`,
`lib/landing/content.ts`, `app/layout.tsx`.

### 1a. FR/EN switcher → discreet dropdown
Replace the current two-button toggle (`aria-pressed` pills) in `LandingNav`
with a quiet dropdown: a small globe icon + current language code («&nbsp;FR&nbsp;▾&nbsp;»),
opening a two-item menu (Français / English). Same `lang`/`setLanguage` state
mechanism; keyboard- and `aria`-accessible (button + menu roles, Escape closes).

### 1b. Steps: 4 → 5
Insert a new step 03 « Préparez » between Sélectionnez and Collectez:

- FR: `{ n: "03", title: "Préparez", body: "Créez vos demandes de documents et formulaires en quelques clics." }`
- EN: `{ n: "03", title: "Prepare", body: "Create your document and form requests in a few clicks." }`

Renumber Collectez/Validez (Collect/Validate) to 04/05. Section title becomes
« Cinq étapes, aucune relance oubliée. » / "Five steps, no follow-up forgotten."
Grid in `HowItWorks.tsx`: `lg:grid-cols-4` → `lg:grid-cols-5` (2-col at `sm`
unchanged).

### 1c. Automatic-reminders band → mini email preview
Replace the current grey banner (blue square with a ↻ glyph + one sentence)
with a two-column block:

- **Left:** blue mono eyebrow « Relances automatiques » / "Automatic reminders",
  then the existing `how.note` sentence.
- **Right:** a CSS-only fake reminder-email card — sender line (dot avatar +
  **EazyExchange**), subject « Il te manque 2 documents », two checklist lines
  (☐ Autorisation parentale, ☐ Copie du passeport) and a deadline pill
  (« Échéance : 15 mars »). EN equivalents ("You're missing 2 documents",
  Parental authorization, Passport copy, "Deadline: March 15").

All strings live in `content.ts` under a new `how.reminder` shape (eyebrow,
note, sender, subject, checklist items, deadline label). No images; pure
JSX/Tailwind. Columns stack on mobile.

### 1d. Copy changes
- EN features title: "The **whole** student file, in one place." → "The
  **entire** student file, in one place." FR stays « Tout le dossier de
  l'élève, au même endroit. » (« tout le » already carries "entire").
- CTA band FR: « Prêt à simplifier votre prochaine **session** ? » → « … votre
  prochain **échange** ? »; body « sur une session complète » → « sur un
  échange complet ».
- CTA band EN: "Ready to simplify your next **session**?" → "… your next
  **exchange**?"; body "across a full session" → "across a full exchange".

### 1e. Browser tab title
Root `app/layout.tsx` metadata title `'EazyExchange — Every student, cleared
for departure'` → `'EazyExchange'`. The landing page's own SEO title in
`app/page.tsx` is untouched, as are any per-page titles.

---

## 2. Login page

Files: `app/(auth)/login/page.tsx`, `components/auth/GoogleButton.tsx`.

### 2a. Layout reorder + separator copy
Today the Google button sits above « ou » with the email form below. Reorder to
the standard pattern so the requested copy reads correctly:

1. email/password form
2. separator « ou continuer avec »
3. Google button, relabeled from « Continuer avec Google » to just « Google »
   (the separator now says « continuer avec »; the Google logo stays). The
   signup page keeps its own current layout — only the shared
   `prompt: 'select_account'` change (2d) affects it.

### 2b. Labels → placeholders + icons
Remove the visible `Label`s. Each `Input` gets an inline placeholder
(« Adresse e-mail », « Mot de passe ») and a leading icon inside the field
(lucide `Mail` / `Lock`, muted color, input gets left padding). Labels remain
in the DOM as `sr-only` for accessibility; `id`/`htmlFor` wiring unchanged.

### 2c. Signup link
Below the form/Google block: « Pas encore de compte ?
[Créer un compte](/signup) » — muted sentence, link in brand blue.

### 2d. Google account picker
`GoogleButton`'s `signInWithOAuth` call gains
`queryParams: { prompt: 'select_account' }`. The component is shared, so login
**and** signup both always show Google's account chooser (decided: desired
everywhere).

---

## 3. Invite-students popup — inline close warning

File: `components/dashboard/InviteModal.tsx`.

Today, Fermer on the link step swaps the entire modal content for a separate
« Avez-vous copié le lien ? » screen (`confirmingClose` branch). Replace with an
inline warning in the same view:

- The link step stays rendered. On a close attempt (Fermer button, X, Escape,
  backdrop) when the link has **not** been copied, an amber warning strip
  appears above the buttons: « Vous ne reverrez plus ce lien — copiez-le avant
  de fermer. », and the primary button becomes « Fermer quand même » (a second
  activation closes for real).
- If the user has clicked Copier (`copied === true`), any close path closes
  immediately with no warning.
- The `confirmingClose` full-screen branch is deleted; the state variable can
  be repurposed for the inline strip.

---

## 4. Dashboard — « no active forms » action card

Files: `lib/dashboard/rollup.ts` (`actionCards`), `components/dashboard/OverviewView.tsx`,
plus the `/dashboard` page to pass template data through.

New card in the existing action-cards system, visible **while the exchange has
zero active templates** (all seeded standard templates start as drafts, so this
is the fresh-exchange state):

- Tone: `accent`. Title: « Aucun formulaire actif ». Body: « Préparez les
  documents et formulaires à demander aux familles. » CTA: « Préparer les
  formulaires » → `/forms`.
- Shown in both phases; disappears as soon as ≥ 1 template is `active`.
- `actionCards` (or its caller) gains an `activeTemplateCount` input — derive
  from the `templates` prop `OverviewView` already receives.

---

## 5. Formulaires + Documents — remove top-bar search & create button

Files: `components/shell/OrganizerShell.tsx`, `components/shell/ShellUiContext.tsx`,
`components/forms/FormsView.tsx`, `components/documents/DocsView.tsx`.

- Remove the top-bar search input and the blue create button (« + Nouveau
  formulaire » / « Demander un document ») on **both** the forms and documents
  pages. The **students** top-bar search stays.
- The pages' inline buttons (« + Ajouter un formulaire », add-document) remain
  the creation entry points — no functionality lost.
- Clean out the dead plumbing: `addRequestId` (context field + the
  `useEffect` listeners in FormsView/DocsView) and the forms/docs use of
  `listSearch` (client-side filtering + « Aucun résultat » empty states).
  `listSearch` itself stays for the students page.

---

## 6. Réglages — sidebar → profile menu

File: `components/shell/OrganizerShell.tsx`.

Remove « Réglages » from the sidebar rail. Add a « Réglages » item to the
existing avatar/profile dropdown, above « Se déconnecter » (same menu-item
styling, links to `/settings`). Route and settings pages unchanged.

---

## 7. Billing — sell the plans better

Files: `components/billing/PlanSelector.tsx`, `lib/billing/display.ts`.

Each plan card gains, under the price/cap:

- **Audience line** (semibold, small):
  - Starter : « Pour un jumelage unique »
  - Growth : « Pour plusieurs programmes en parallèle »
  - Scale : « Pour les grands établissements »
- **Shared feature bullets** (✓-prefixed, muted — identical across plans since
  only the cap differs; the cap line stays the highlighted differentiator):
  - Élèves et familles illimités
  - Formulaires et documents illimités
  - Relances automatiques par e-mail
  - Suivi des dossiers en temps réel

Strings live in `lib/billing/display.ts` next to the existing label/price
helpers. « POPULAIRE » badge and selection behavior unchanged.

---

## 8. Emails — wordmark color

File: `lib/email.ts`.

The « Eazy » span in the email HTML wordmark is green (`#3FA277`); change to
the design blue `#2456E6` (matches `--primary` / the app brand blue).

---

## Testing & verification

- Extend the existing unit tests alongside each change: `LandingPage.test`
  (5 steps, new reminder block, copy, dropdown), login page test (separator
  copy, signup link, `select_account` param), `InviteModal.test` (inline
  warning, copied → immediate close), dashboard rollup test (new action card
  threshold), shell test (no forms/docs top-bar controls, Réglages in profile
  menu), `PlanSelector` test (bullets/audience lines), email test (wordmark
  color).
- Gate: `pnpm lint`, `pnpm test`, `tsc --noEmit` (local build fails on
  placeholder env; per project convention).
- Visual spot-check on a Vercel preview deployment before merge.

## Delivery notes

- Pure UI batch: no migrations, no new env vars, no server actions beyond the
  dashboard data pass-through.
- This spec commits to the currently checked-out branch
  (`feature/application-resume-flow`) as docs, per the backlog's session-split
  note. Implementation runs later on its own branch, one execution at a time.
