# Landing — "Focus on what matters" close in the TimeSavings section

**Date:** 2026-07-18
**Status:** Approved, ready for planning

## Goal

Add an emotional value message to the landing page: the time Eazyexchange
saves organizers is time returned to **what matters most — their students'
experience and safety — not tracking down dossiers**.

This reframes the existing ROI argument (30 hours / ~300 € per exchange) in
human terms, landing as the closing note of the section that already makes the
numbers case.

## Placement

- **Section:** `TimeSavings` (`components/landing/TimeSavings.tsx`), rendered
  between `BenefitBlocks` and `CtaBand`.
- **Position:** left text column, a new emphasized line rendered **after** the
  existing `p2` paragraph (which currently ends the argument with "the first
  exchange is free"). The right-hand ROI card (hours / € rows + 0 € total) is
  **unchanged**.
- **Rationale:** numbers first (they earn the claim), human payoff last.

## Changes

### 1. Content — `lib/landing/content.ts`

Add one field to the `savings` object in the `LandingContent` interface and to
each of the 5 locale objects (fr, en, es, it, de):

```ts
savings: {
  // …existing eyebrow, title, p1, p2, cardTitle, rows, totalLabel, totalValue…
  focus: string
}
```

**Copy per locale:**

| Locale | Value |
|--------|-------|
| fr | `Ces heures, vous les rendez à ce qui compte vraiment : l’expérience et la sécurité de vos élèves — pas la course aux dossiers.` |
| en | `Those hours go back to what matters most — your students’ experience and safety, not chasing paperwork.` |
| es | `Esas horas vuelven a lo que de verdad importa: la experiencia y la seguridad de tus alumnos, no perseguir documentos.` |
| it | `Quelle ore tornano a ciò che conta davvero: l’esperienza e la sicurezza dei tuoi studenti, non la rincorsa ai documenti.` |
| de | `Diese Stunden fließen zurück in das, was am wichtigsten ist – das Erlebnis und die Sicherheit Ihrer Schüler, nicht das Hinterherjagen von Unterlagen.` |

Note: use typographic apostrophes (`’`) in fr/en/it to match surrounding
content style. French transcription care applies — verify accents and
apostrophes survive after authoring.

### 2. Render — `components/landing/TimeSavings.tsx`

After the `p2` paragraph (`components/landing/TimeSavings.tsx:15`), add the
`focus` line, styled to stand apart from the muted `#C3CEE6` body copy so it
reads as the payoff, not another paragraph:

- White text (`text-white`), medium weight, ~16.5px, relaxed leading.
- A thin green accent bar on the left using the section's existing accent
  `#7EE3A4` (the "temps gagné" green) — e.g. a left border + padding, or a
  small inline rule — to mark it as the closing statement.
- Constrained to the same `max-w-[480px]` as `p1`/`p2`, with top margin
  separating it from `p2`.

Exact Tailwind classes are an implementation detail; the requirement is:
visually distinct, clearly the last line of the left column, accent color
`#7EE3A4`.

## Out of scope (YAGNI)

- No new section or component.
- No image, illustration, or icon.
- No hero, CtaBand, or ROI-card changes.
- No changes to any other locale-driven surface.

## Verification

- `pnpm lint`
- `pnpm build` — confirms the `focus` field addition propagates cleanly through
  the `LandingContent` type to all 5 locale objects (a missing locale fails
  compile).
- Visual check of the rendered `TimeSavings` section (all 5 languages via the
  language switcher) — the line renders after the ROI paragraphs, distinct from
  body copy, accent visible.
- Check `components/landing/__tests__/` — if it snapshots or asserts on
  `savings` content, update expectations.

No migration, no RLS, no edge function involved.
