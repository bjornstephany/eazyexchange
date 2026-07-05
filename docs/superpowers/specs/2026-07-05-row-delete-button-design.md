# Row-level « Supprimer » button on forms & documents

**Date:** 2026-07-05
**Status:** Approved

## Problem

Organizers can only delete a form/document template from inside its preview
drawer (`FormDrawer` / `DocDrawer`), reached via the row's "Aperçu"/"Détail"
button. There is no delete affordance on the list row itself. Organizers expect
to remove a template directly from the list, next to "Modifier".

## Scope

UI-only. The backend already exists:

- `deleteTemplate(id)` in `actions/forms.ts` performs full cleanup — deletes the
  template row (DB cascade removes assignments/submissions/fields/slots), removes
  families' uploaded files from the `documents` storage bucket, removes the
  template PDF from `form-templates`, and **throws for standard templates**
  (`standard_key` non-null).
- A "Supprimer" button already exists inside `FormDrawer` and `DocDrawer`, using
  `window.confirm` and shown only when `standard_key === null`.

No server action changes, no migration, no storage changes.

## Design

### Shared component

Create `components/forms/DeleteTemplateButton.tsx` — a `'use client'` component
used by both `FormsView` and `DocsView` (`DocsView` already imports from
`components/forms`, so one component serves both families).

**Props:**

- `templateId: string`
- `confirmText: string` — passed by the caller so wording matches the existing
  drawers: forms say *« ce modèle »*, documents say *« cette pièce »*.

**Behavior:**

1. On click, `window.confirm(confirmText)`. On cancel, do nothing.
2. On confirm: set a local `busy` state (button disabled, label →
   *« Suppression… »*), call `deleteTemplate(templateId)`, then
   `router.refresh()` (via `useRouter` from `next/navigation`) so the deleted
   row disappears.
3. On error: `window.alert(message)` and clear `busy`. The action's error
   messages are generic (no PII), so alerting them is safe.

**Styling** (subtle bordered danger button, sized to match "Modifier"):

```
rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-hoverrow
```

### Wiring into the rows

In both `FormsView.tsx` and `DocsView.tsx`, inside the existing
`<div className="flex flex-none gap-2">` button group, render the delete button
immediately **after** the "Modifier" link, and only for custom templates:

```tsx
{t.standard_key === null && (
  <DeleteTemplateButton templateId={t.id} confirmText={/* family-specific */} />
)}
```

- Forms confirm text: `Supprimer ce modèle ? Les réponses déjà envoyées par les
  élèves seront définitivement supprimées.`
- Documents confirm text: `Supprimer cette pièce ? Les fichiers déjà envoyés par
  les familles seront définitivement supprimés.`

(Both strings already exist verbatim in the respective drawers — reuse them.)

`standard_key` is already present on `TemplateVM` (the row uses it today to show
the STANDARD/PERSONNALISÉ label), so no data-layer change is needed.

### Left unchanged

The drawer "Supprimer" buttons stay. The row button is an additional shortcut to
the same action.

## Testing

Extend the existing `components/forms/__tests__/FormsView.test.tsx` and
`components/documents/__tests__/DocsView.test.tsx` (mock `@/actions/forms` and
`window.confirm`):

1. « Supprimer » renders for a custom template (`standard_key === null`).
2. « Supprimer » is absent for a standard template (`standard_key` non-null).
3. Confirm → `deleteTemplate` called with the template id.
4. Cancel (`window.confirm` returns false) → `deleteTemplate` not called.

## Out of scope

- Styled/in-app confirmation modal (native `window.confirm` chosen for
  consistency with the existing drawer delete).
- Any change to what/how the server deletes.
- Removing or altering the drawer delete buttons.
