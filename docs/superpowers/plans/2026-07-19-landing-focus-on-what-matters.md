# Landing "Focus on what matters" close — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a translated "these saved hours go back to your students' experience and safety, not chasing dossiers" closing line to the landing page's TimeSavings section.

**Architecture:** The landing page is a single content-driven component tree. All copy lives in `lib/landing/content.ts` as five typed `LandingContent` locale objects (fr, en, es, it, de); components render from those. We add one field, `savings.focus`, to the interface and every locale, then render it as an emphasized closing line in `TimeSavings.tsx`. No new component, section, or asset.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Package manager is **pnpm** (never npm).
- The `LandingContent` interface is shared by all 5 locale objects — any added field must be present in **fr, en, es, it, de** or `pnpm build` fails compile.
- **French copy must use typographic apostrophes (`’`), never ASCII (`'`)** between letters — enforced by `lib/landing/__tests__/content.test.ts` (regex `/\p{L}'\p{L}/u` walks the whole `fr` tree). Applies to `l’expérience`.
- Section accent green is `#7EE3A4`; muted body copy is `#C3CEE6` — both already used in `components/landing/TimeSavings.tsx`.
- Verify before done: `pnpm lint`, `pnpm test`, `pnpm build`. No migration / RLS / edge function involved, so `pnpm test:rls` is not required.

---

### Task 1: Add the `focus` field to content (interface + 5 locales)

**Files:**
- Modify: `lib/landing/content.ts` (interface `savings` block at ~line 92; each locale `savings` object at ~lines 298, 510, 722, 934, 1146)
- Test: `lib/landing/__tests__/content.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LandingContent['savings']` gains `focus: string`. `TimeSavings.tsx` (Task 2) reads `savings.focus`.

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe('landingContent', …)` in `lib/landing/__tests__/content.test.ts` (after the last existing test, before the closing `})`):

```ts
it('every locale has a non-empty savings.focus line', () => {
  for (const [code, content] of Object.entries(landingContent)) {
    expect(content.savings.focus, `${code}.savings.focus`).toBeTruthy()
    expect(content.savings.focus.trim().length, `${code}.savings.focus`).toBeGreaterThan(10)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/landing/__tests__/content.test.ts`
Expected: FAIL — TypeScript error / `content.savings.focus` is `undefined` (property does not exist).

- [ ] **Step 3: Add `focus` to the interface**

In `lib/landing/content.ts`, the `savings` block of the `LandingContent` interface (~line 92) currently ends:

```ts
    totalLabel: string
    totalValue: string
  }
```

Change to:

```ts
    totalLabel: string
    totalValue: string
    focus: string
  }
```

- [ ] **Step 4: Add `focus` to all 5 locale objects**

Each locale's `savings` object ends with `totalLabel` / `totalValue`. Add `focus` right after `totalValue` in each. Use the exact strings below (note typographic `’` in fr/en/it).

`fr` (~line 309):

```ts
    totalValue: '0 €',
    focus: 'Ces heures, vous les rendez à ce qui compte vraiment : l’expérience et la sécurité de vos élèves — pas la course aux dossiers.',
```

`en` (~line 510 block):

```ts
    focus: 'Those hours go back to what matters most — your students’ experience and safety, not chasing paperwork.',
```

`es` (~line 722 block):

```ts
    focus: 'Esas horas vuelven a lo que de verdad importa: la experiencia y la seguridad de tus alumnos, no perseguir documentos.',
```

`it` (~line 934 block):

```ts
    focus: 'Quelle ore tornano a ciò che conta davvero: l’esperienza e la sicurezza dei tuoi studenti, non la rincorsa ai documenti.',
```

`de` (~line 1146 block):

```ts
    focus: 'Diese Stunden fließen zurück in das, was am wichtigsten ist – das Erlebnis und die Sicherheit Ihrer Schüler, nicht das Hinterherjagen von Unterlagen.',
```

Add each after that locale's `totalValue: …,` line, matching the surrounding indentation. Keep the existing `totalValue` value for each locale (it is `'0 €'` in every locale — do not change it).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- lib/landing/__tests__/content.test.ts`
Expected: PASS — including the existing `fr copy uses typographic apostrophes everywhere` test (confirms the fr `focus` string used `l’expérience`, not `l'expérience`).

- [ ] **Step 6: Commit**

```bash
git add lib/landing/content.ts lib/landing/__tests__/content.test.ts
git commit -m "feat(landing): add savings.focus copy for all 5 locales"
```

---

### Task 2: Render the focus line in TimeSavings

**Files:**
- Modify: `components/landing/TimeSavings.tsx:15`

**Interfaces:**
- Consumes: `savings.focus` (string) from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Add the rendered line**

In `components/landing/TimeSavings.tsx`, the left column currently ends with the `p2` paragraph:

```tsx
          <p className="mb-3 max-w-[480px] text-[15.5px] leading-[1.65] text-[#C3CEE6]">{savings.p1}</p>
          <p className="max-w-[480px] text-[15.5px] leading-[1.65] text-[#C3CEE6]">{savings.p2}</p>
        </div>
```

Insert the focus line after the `p2` paragraph, still inside the same `<div>`:

```tsx
          <p className="mb-3 max-w-[480px] text-[15.5px] leading-[1.65] text-[#C3CEE6]">{savings.p1}</p>
          <p className="max-w-[480px] text-[15.5px] leading-[1.65] text-[#C3CEE6]">{savings.p2}</p>
          <p className="mt-5 max-w-[480px] border-l-2 border-[#7EE3A4] pl-4 text-[16.5px] font-medium leading-[1.55] text-white">
            {savings.focus}
          </p>
        </div>
```

Rationale for the styling: `text-white` + `font-medium` + larger `16.5px` lifts it above the muted `#C3CEE6` body copy; the `border-l-2 border-[#7EE3A4]` accent bar marks it as the closing payoff. Same `max-w-[480px]` as `p1`/`p2`.

- [ ] **Step 2: Type-check and build**

Run: `pnpm build`
Expected: PASS — no type errors; `savings.focus` resolves on all locales.

- [ ] **Step 3: Visual check**

Run: `pnpm dev`, open the landing page, scroll to the dark "Le calcul / Récupérez 30 heures" section.
Expected: the new white line renders below the two grey paragraphs, with a green vertical accent bar on its left. Switch languages via the nav switcher (fr/en/es/it/de) and confirm the line renders and reads correctly in each.

- [ ] **Step 4: Commit**

```bash
git add components/landing/TimeSavings.tsx
git commit -m "feat(landing): render savings.focus close in TimeSavings"
```

---

### Task 3: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all three pass. If `pnpm test` sweeps sibling worktree tests (known repo hazard), scope with `--exclude '**/.claude/**'` and confirm the landing/content suites are green.

- [ ] **Step 2: Confirm no stray changes**

Run: `git status`
Expected: clean tree (Task 1 and Task 2 already committed); only the two intended commits ahead of origin.
