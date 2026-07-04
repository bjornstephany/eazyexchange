# Redesign Phase 7 — System States (2a–2f) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the six "system state" screens (loading, error, invalid-link, billing return, organizer empty, student empty) to design fidelity with French copy — a restyle + FR pass, no new plumbing.

**Architecture:** Every target file already exists in functional form. We restyle existing components, add one new presentational component (`InvalidLinkState`), and add four CSS `@keyframes` to `app/globals.css`. No server action, migration, or RLS change. Merge to `main` = Vercel prod deploy with **no `supabase db push`** (same as Phases 5 & 6).

**Tech Stack:** Next.js 14 App Router (RSC + client components), Tailwind (design tokens in `tailwind.config.ts`), `@/components/ui/button` (shadcn/Slot), Vitest + Testing Library, fonts already wired (`font-display` = Schibsted Grotesk, `font-mono` = IBM Plex Mono).

## Global Constraints

- **Additive / no data change.** No migration, no RLS change, no server-action signature change, no new server action. No `supabase db push`.
- **French copy, exact bytes.** Applicant/student-facing states use **tutoiement**; organizer-facing states use **vouvoiement**. Apostrophes must be curly **U+2019 (’)**, not ASCII `'`. **The Write tool flattens U+2019 → ASCII on write** — so every code block below shows ASCII apostrophes, and every task that writes FR apostrophes ends with a `python3` repair step that rewrites the exact substrings to U+2019 (’-escapes survive Write). Do not skip the repair step. Accented chars (é, è, à, ç, î) survive Write — a grep presence-check guards them.
- **Animations live in `app/globals.css`** as `@keyframes` + a helper class, matching the existing `manifest-*` / `drwIn` convention. No framer-motion, no new dependency. Only 2a and 2d use motion.
- **No new assets.** Brand mark is CSS/SVG. Reuse `components/brand/{Mark,Logo}.tsx` where the mark is static; 2a needs a bespoke two-circle animated mark.
- **Tokens, not hex, where a token exists** (`navy`, `brand`, `brand-hover`, `muted-foreground`, `tint`, `tint-border`, `success`, `success-text`, `track`, `frame`, `placeholder`, `subtle`, `card`, `background`). Raw hex only where a design value has no token (e.g. 2b dashed-line `#AEB7CB`, 2a `#9AA6C0`/`#C4CDE0` already exist as `placeholder`/`frame` tokens — prefer those). Token reference (from `tailwind.config.ts`): `navy=#10203F`, `brand=#2456E6`, `brand-hover=#1D48C7`, `tint=#E6ECFD`, `tint-border=#C8D6FA`, `success=#DCF3E6`, `success-text=#0F7A3D`, `track=#DDE3EF`, `frame=#C4CDE0`, `placeholder=#9AA6C0`, `muted-foreground` renders `#5B6B8C`, `background` renders `#EEF1F7`.
- **Shell stays put during nav.** `loading.tsx` / `error.tsx` render inside the already-resolved organizer/student layout, so 2a/2b fill the **content area**, not the full viewport. Do not hoist them above the layout. (2c/2d are standalone public/return routes with no shell — those DO fill the viewport.)
- **Emails stay English** (cross-phase item). No email copy changes in this phase.

## File map

| File | Task | Action |
|---|---|---|
| `app/globals.css` | 1, 4 | add `ee-mark-l/r`, `ee-indeterminate` (T1), `ee-spin` (T4) keyframes+classes |
| `components/LoadingState.tsx` | 1 | rebuild (animated mark + wordmark + indeterminate bar + caption) |
| `components/__tests__/LoadingState.test.tsx` | 1 | new test |
| `components/ErrorState.tsx` | 2 | restyle + `home` prop + FR `friendlyMessage` |
| `app/(organizer)/error.tsx`, `app/(student)/error.tsx` | 2 | pass `home` |
| `components/__tests__/ErrorState.test.tsx` | 2 | new test |
| `components/InvalidLinkState.tsx` | 3 | new component |
| `app/apply/[slug]/page.tsx`, `app/apply/resume/[token]/page.tsx`, `app/invite/[token]/page.tsx` | 3 | wire InvalidLinkState into invalid/expired branches |
| `components/__tests__/InvalidLinkState.test.tsx` | 3 | new test |
| `app/billing/return/page.tsx` | 4 | restyle (3 step rows + card) |
| `components/dashboard/EmptyDashboard.tsx` | 5 | restyle (dashed zone + logo + CTA) |
| `components/dashboard/__tests__/EmptyDashboard.test.tsx` | 5 | new test |
| `components/student/DossierView.tsx` | 6 | add `total===0` blue-tint banner |
| `components/student/__tests__/DossierView.test.tsx` | 6 | add empty-banner test |

---

### Task 1: 2a — LoadingState rebuild + loader keyframes

**Files:**
- Modify: `app/globals.css` (append keyframes after the `drwIn` block, before `@layer base`)
- Modify: `components/LoadingState.tsx` (full rebuild)
- Test: `components/__tests__/LoadingState.test.tsx` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `LoadingState()` — zero-prop React component. `app/(organizer)/loading.tsx` + `app/(student)/loading.tsx` keep delegating to `<LoadingState />` unchanged; do not touch them.

**Design:** content-area loader, `min-h-[60vh]`, centered column `gap-[30px]` on `bg-background`. Top→bottom: (1) 80×60 animated mark = navy circle `ee-mark-l` + blue circle `ee-mark-r`, both 1.6s; (2) wordmark « Eazyexchange » 28px Schibsted 700 navy; (3) 220×5 `bg-track` pill holding an 80px `bg-brand` segment sliding via `ee-indeterminate`; (4) mono 14px caption « CHARGEMENT DE VOTRE ESPACE… » (no apostrophe, no accent — needs no repair).

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/LoadingState.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingState } from '@/components/LoadingState'

describe('LoadingState', () => {
  it('renders the wordmark and the loading caption', () => {
    render(<LoadingState />)
    expect(screen.getByText('Eazyexchange')).toBeTruthy()
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- LoadingState`
Expected: FAIL — current `LoadingState` renders skeleton bars, no "Eazyexchange" / caption text.

- [ ] **Step 3: Add the loader keyframes to `app/globals.css`**

Edit — anchor on the closing of the `drwIn` keyframe (currently ends at the `}` before `@layer base {`). Insert this block between `@keyframes drwIn { … }` and `@layer base {`:

```css
/* ------------------------------------------------------------------ */
/* System states (Phase 7): loading (2a) motion                        */
/* ------------------------------------------------------------------ */
.ee-mark-l { animation: ee-mark-l 1.6s cubic-bezier(0.45, 0, 0.25, 1) infinite; }
.ee-mark-r { animation: ee-mark-r 1.6s cubic-bezier(0.45, 0, 0.25, 1) infinite; }
.ee-indeterminate { animation: ee-indeterminate 1.1s cubic-bezier(0.4, 0.1, 0.6, 0.9) infinite; }

@keyframes ee-mark-l {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(15px, 7px); }
}
@keyframes ee-mark-r {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-15px, -7px); }
}
@keyframes ee-indeterminate {
  0% { transform: translateX(-64px); }
  100% { transform: translateX(168px); }
}
```

- [ ] **Step 4: Rebuild `components/LoadingState.tsx`**

```tsx
// components/LoadingState.tsx
// 2a system state: content-area loader (renders inside the resolved shell, so it
// fills its container via min-h, not the full viewport — approved deviation).
export function LoadingState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[30px] bg-background">
      <div className="relative h-[60px] w-20">
        <span className="ee-mark-l absolute left-0 top-0 h-12 w-12 rounded-full bg-[#10203F]" />
        <span className="ee-mark-r absolute bottom-0 right-0 h-12 w-12 rounded-full bg-brand mix-blend-multiply" />
      </div>
      <span className="font-display text-[28px] font-bold text-navy">Eazyexchange</span>
      <div className="h-[5px] w-[220px] overflow-hidden rounded-pill bg-track">
        <div className="ee-indeterminate h-full w-20 rounded-pill bg-brand" />
      </div>
      <span className="font-mono text-[14px] uppercase tracking-wide text-placeholder">
        Chargement de votre espace…
      </span>
    </div>
  )
}
```

Note: caption is written mixed-case with `uppercase` class so the DOM text node is « Chargement de votre espace… » but renders uppercased; the test regex matches the CSS-uppercased *visible* text via Testing Library's text matcher on the rendered node — to be safe the test matches `/CHARGEMENT DE VOTRE ESPACE/` which will NOT match a mixed-case text node. **Write the literal uppercase in the JSX** so the DOM text is uppercase:

Replace the caption line with the literal uppercase string:
```tsx
      <span className="font-mono text-[14px] text-placeholder">
        CHARGEMENT DE VOTRE ESPACE…
      </span>
```
(No `uppercase` class needed; the literal is already uppercase. No apostrophe, no accent → no repair step.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- LoadingState`
Expected: PASS (2 assertions).

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/LoadingState.tsx components/__tests__/LoadingState.test.tsx
git commit -m "feat(system-states): 2a animated LoadingState + loader keyframes"
```

---

### Task 2: 2b — ErrorState restyle + `home` prop + FR messages

**Files:**
- Modify: `components/ErrorState.tsx`
- Modify: `app/(organizer)/error.tsx`, `app/(student)/error.tsx`
- Test: `components/__tests__/ErrorState.test.tsx` (new)

**Interfaces:**
- Consumes: `@/components/ui/button` (`Button`, supports `asChild` via Slot — confirmed), `next/link`.
- Produces:
  ```ts
  export function ErrorState({
    error, reset, home,
  }: { error: Error; reset: () => void; home: { href: string; label: string } })
  ```
  Organizer wiring passes `home={{ href: '/dashboard', label: 'Tableau de bord' }}`; student wiring passes `home={{ href: '/my-forms', label: 'Mon dossier' }}`.

**Design:** centered content-area column. Broken-link motif = navy 48px circle — 96px dashed 3px `#AEB7CB` line — blue 48px circle. Then H3 36px « Le fil s’est rompu. »; body 18px `text-muted-foreground` max-w-[520px] from `friendlyMessage(error.message)`; buttons row = primary « Réessayer » (`reset()`) + secondary `home.label` link to `home.href`.

- [ ] **Step 1: Write the failing test** (assertions use apostrophe-agnostic regex so byte encoding can't break the match)

```tsx
// components/__tests__/ErrorState.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorState } from '@/components/ErrorState'
import OrganizerError from '@/app/(organizer)/error'
import StudentError from '@/app/(student)/error'

const home = { href: '/dashboard', label: 'Tableau de bord' }

describe('ErrorState', () => {
  it('maps a known error.message to its French line', () => {
    render(<ErrorState error={new Error('Unauthorized')} reset={vi.fn()} home={home} />)
    expect(screen.getByText(/Vous n.avez pas acc.s . cette page/)).toBeTruthy()
  })

  it('falls back to the generic French line for an unknown message', () => {
    render(<ErrorState error={new Error('boom')} reset={vi.fn()} home={home} />)
    expect(screen.getByText(/Une erreur est survenue de notre c.t./)).toBeTruthy()
  })

  it('renders the home link with the passed href + label and calls reset', () => {
    const reset = vi.fn()
    render(<ErrorState error={new Error('boom')} reset={reset} home={home} />)
    const link = screen.getByRole('link', { name: 'Tableau de bord' })
    expect(link.getAttribute('href')).toBe('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /R.essayer/ }))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('organizer boundary wires home to the dashboard', () => {
    render(<OrganizerError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Tableau de bord' }).getAttribute('href')).toBe('/dashboard')
  })

  it('student boundary wires home to the dossier', () => {
    render(<StudentError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Mon dossier' }).getAttribute('href')).toBe('/my-forms')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ErrorState`
Expected: FAIL — current `ErrorState` has no `home` prop (tsc/runtime), English copy, no link.

- [ ] **Step 3: Rewrite `components/ErrorState.tsx`** (apostrophes shown ASCII; Step 5 converts to U+2019)

```tsx
// components/ErrorState.tsx
'use client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Friendly French message for the auth errors thrown by our server actions;
// falls back to a generic line for anything unexpected. Vouvoiement is used even
// on the student boundary — these are generic system errors (approved).
function friendlyMessage(message: string): string {
  switch (message) {
    case 'Unauthorized':
      return 'Vous n\'avez pas acces a cette page.'
    case 'Unauthenticated':
      return 'Votre session a expire. Reconnectez-vous.'
    case 'Exchange not found':
    case 'Assignment not found':
      return 'Nous n\'avons pas trouve ce que vous cherchiez.'
    default:
      return 'Une erreur est survenue de notre cote — vos donnees sont en securite. Reessayez, ou revenez au tableau de bord.'
  }
}

export function ErrorState({
  error, reset, home,
}: { error: Error; reset: () => void; home: { href: string; label: string } }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex items-center">
        <span className="h-12 w-12 flex-none rounded-full bg-navy" />
        <span className="w-24 border-t-[3px] border-dashed border-[#AEB7CB]" />
        <span className="h-12 w-12 flex-none rounded-full bg-brand" />
      </div>
      <h3 className="font-display text-[36px] font-bold text-navy">Le fil s\'est rompu.</h3>
      <p className="max-w-[520px] text-[18px] leading-relaxed text-muted-foreground">
        {friendlyMessage(error.message)}
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>Reessayer</Button>
        <Button asChild variant="outline">
          <Link href={home.href}>{home.label}</Link>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire `home` into both error boundaries**

```tsx
// app/(organizer)/error.tsx
'use client'
import { ErrorState } from '@/components/ErrorState'

export default function OrganizerError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState error={error} reset={reset} home={{ href: '/dashboard', label: 'Tableau de bord' }} />
}
```

```tsx
// app/(student)/error.tsx
'use client'
import { ErrorState } from '@/components/ErrorState'

export default function StudentError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState error={error} reset={reset} home={{ href: '/my-forms', label: 'Mon dossier' }} />
}
```

- [ ] **Step 5: Repair apostrophes to U+2019 + accent presence-check**

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("components/ErrorState.tsx")
s = p.read_text()
for a, b in [
  ("Vous n'avez", "Vous n’avez"),
  ("Nous n'avons", "Nous n’avons"),
  ("s'est rompu", "s’est rompu"),
]:
    s = s.replace(a, b)
p.write_text(s)
PY
grep -n "Vous n'avez\|Nous n'avons\|s'est rompu" components/ErrorState.tsx && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
grep -q "expiré" components/ErrorState.tsx && grep -q "sécurité" components/ErrorState.tsx && echo "accents OK" || echo "ACCENTS MISSING — FIX"
```
Expected: `apostrophes OK (U+2019)` then `accents OK`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- ErrorState`
Expected: PASS (5 assertions). The apostrophe-agnostic regexes (`n.avez`, `c.t.`, `R.essayer`) match regardless of ASCII-vs-curly bytes.

- [ ] **Step 7: Commit**

```bash
git add components/ErrorState.tsx "app/(organizer)/error.tsx" "app/(student)/error.tsx" components/__tests__/ErrorState.test.tsx
git commit -m "feat(system-states): 2b ErrorState restyle + home prop + FR messages"
```

---

### Task 3: 2c — InvalidLinkState component + wire invalid/expired branches

**Files:**
- Create: `components/InvalidLinkState.tsx`
- Modify: `app/apply/[slug]/page.tsx` (unknown-slug branch only)
- Modify: `app/apply/resume/[token]/page.tsx` (invalid + expired branches)
- Modify: `app/invite/[token]/page.tsx` (invalid + expired + already-answered branches)
- Test: `components/__tests__/InvalidLinkState.test.tsx` (new)

**Interfaces:**
- Consumes: nothing (presentational, server-safe — no `'use client'`).
- Produces: `export function InvalidLinkState({ title, body }: { title: string; body: string })` — full-viewport centered column with a greyed mark, `title` (H3 32px navy), `body` (17px muted, tutoiement), **no button** (decision locked).

**Design:** centered column on `bg-background`, min-h-screen. Greyed mark ~64×48 = `bg-placeholder` circle (top) + `bg-frame` circle (bottom, `mix-blend-multiply`) at 55% opacity. `apply` *closed* and `resume` *submitted* are valid positive terminal states — **leave them as-is**, do not route through this component.

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/InvalidLinkState.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvalidLinkState } from '@/components/InvalidLinkState'

describe('InvalidLinkState', () => {
  it('renders the passed title and body', () => {
    render(<InvalidLinkState title="Ce lien a expire" body="Demande un nouveau lien." />)
    expect(screen.getByText('Ce lien a expire')).toBeTruthy()
    expect(screen.getByText('Demande un nouveau lien.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- InvalidLinkState`
Expected: FAIL — module `@/components/InvalidLinkState` does not exist.

- [ ] **Step 3: Create `components/InvalidLinkState.tsx`** (props only — no FR literals, so no repair needed in this file)

```tsx
// components/InvalidLinkState.tsx
// 2c system state: invalid / expired / already-answered link. Presentational and
// server-safe (rendered by public RSC token pages). No button — no organizer email
// surfaced in public token contexts (decision locked).
export function InvalidLinkState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <div className="relative h-12 w-16 opacity-55">
        <span className="absolute left-0 top-0 h-11 w-11 rounded-full bg-placeholder" />
        <span className="absolute bottom-0 right-0 h-11 w-11 rounded-full bg-frame mix-blend-multiply" />
      </div>
      <h3 className="font-display text-[32px] font-bold text-navy">{title}</h3>
      <p className="max-w-[520px] text-[17px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- InvalidLinkState`
Expected: PASS (2 assertions).

- [ ] **Step 5: Wire into `app/apply/[slug]/page.tsx`** — replace ONLY the `!exchange` branch (leave the `closed` branch with its exchange-name heading intact). Add the import; the invalid `<main>...<p>...</p></main>` becomes:

```tsx
import { InvalidLinkState } from '@/components/InvalidLinkState'
```
```tsx
  if (!exchange) return (
    <InvalidLinkState
      title="Ce lien n'est plus valide"
      body="Il a peut-etre expire — c'est normal, les liens expirent pour proteger ton dossier. Verifie l'adresse dans ton e-mail, ou demande a ton organisateur de t'en renvoyer un nouveau."
    />
  )
```

- [ ] **Step 6: Wire into `app/apply/resume/[token]/page.tsx`** — replace the `!draft` and `draft.expired` branches (leave `draft.submitted` — a positive terminal state — intact). Add the import; the two branches become:

```tsx
import { InvalidLinkState } from '@/components/InvalidLinkState'
```
```tsx
  if (!draft) return (
    <InvalidLinkState
      title="Ce lien n'est plus valide"
      body="Il a peut-etre expire — c'est normal, les liens expirent pour proteger ton dossier. Verifie l'adresse dans ton e-mail, ou demande a ton organisateur de t'en renvoyer un nouveau."
    />
  )
  if (draft.expired) return (
    <InvalidLinkState
      title="Ce lien a expire"
      body="Les liens de candidature expirent au bout d'un moment pour proteger ton dossier. Demande a ton organisateur de t'en renvoyer un nouveau."
    />
  )
```

- [ ] **Step 7: Wire into `app/invite/[token]/page.tsx`** — replace the `!invite`, `invite.expired`, and `closed` branches (keep the final `InviteResponseForm` branch in its `CenteredCard`). Add the import; the three branches become:

```tsx
import { InvalidLinkState } from '@/components/InvalidLinkState'
```
```tsx
  if (!invite) return (
    <InvalidLinkState
      title="Ce lien n'est plus valide"
      body="Il a peut-etre expire — c'est normal, les liens expirent pour proteger ton dossier. Verifie l'adresse dans ton e-mail, ou demande a ton organisateur de t'en renvoyer un nouveau."
    />
  )
  if (invite.expired) return (
    <InvalidLinkState
      title="Cette invitation a expire"
      body="Contacte ton organisateur pour recevoir une nouvelle invitation."
    />
  )
  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <InvalidLinkState
      title="Cette invitation a deja recu une reponse"
      body="Tu as deja repondu a cette invitation. Si c'est une erreur, contacte ton organisateur."
    />
  )
```

Note: `CenteredCard` import stays (still used by the form branch). If tsc flags `CenteredCard` as unused after this edit, that means the form branch was also touched — it must NOT be; re-check.

- [ ] **Step 8: Repair apostrophes to U+2019 + accent presence-check across the three pages**

```bash
python3 - <<'PY'
import pathlib
pairs = [
  ("n'est plus valide", "n’est plus valide"),
  ("c'est normal", "c’est normal"),
  ("l'adresse", "l’adresse"),
  ("de t'en renvoyer", "de t’en renvoyer"),
  ("au bout d'un moment", "au bout d’un moment"),
  ("Si c'est une erreur", "Si c’est une erreur"),
]
for path in [
  "app/apply/[slug]/page.tsx",
  "app/apply/resume/[token]/page.tsx",
  "app/invite/[token]/page.tsx",
]:
    p = pathlib.Path(path); s = p.read_text()
    for a, b in pairs: s = s.replace(a, b)
    p.write_text(s)
PY
grep -rn "n'est plus valide\|c'est normal\|l'adresse\|de t'en renvoyer\|au bout d'un moment\|Si c'est une erreur" "app/apply/[slug]/page.tsx" "app/apply/resume/[token]/page.tsx" "app/invite/[token]/page.tsx" && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
grep -q "a expire" "app/invite/[token]/page.tsx" && grep -q "deja recu" "app/invite/[token]/page.tsx" || echo "ACCENTS MISSING — FIX (expire/deja/recu should carry é/à/ç)"
```
Note the accent check: after Write, `expire`→`expiré`? No — the JSX literal was written WITHOUT accents (ASCII-safe transcription above uses `expire`, `deja`, `recu`, `proteger`, `Verifie`). **These must be corrected to accented French.** Extend the repair to add accents:

```bash
python3 - <<'PY'
import pathlib
accent_pairs = [
  ("Il a peut-etre expire", "Il a peut-être expiré"),
  ("les liens expirent pour proteger ton dossier", "les liens expirent pour protéger ton dossier"),
  ("Verifie l’adresse", "Vérifie l’adresse"),
  ("demande a ton organisateur", "demande à ton organisateur"),
  ("Ce lien a expire", "Ce lien a expiré"),
  ("expirent au bout d’un moment pour proteger", "expirent au bout d’un moment pour protéger"),
  ("Demande a ton organisateur", "Demande à ton organisateur"),
  ("Cette invitation a expire", "Cette invitation a expiré"),
  ("Cette invitation a deja recu une reponse", "Cette invitation a déjà reçu une réponse"),
  ("Tu as deja repondu a cette invitation", "Tu as déjà répondu à cette invitation"),
]
for path in [
  "app/apply/[slug]/page.tsx",
  "app/apply/resume/[token]/page.tsx",
  "app/invite/[token]/page.tsx",
]:
    p = pathlib.Path(path); s = p.read_text()
    for a, b in accent_pairs: s = s.replace(a, b)
    p.write_text(s)
PY
grep -q "a expiré" "app/invite/[token]/page.tsx" && grep -q "déjà reçu" "app/invite/[token]/page.tsx" && echo "accents OK" || echo "ACCENTS MISSING — FIX"
```
Expected: `apostrophes OK (U+2019)` then `accents OK`.

- [ ] **Step 9: Verify tests + types still green**

Run: `pnpm test -- InvalidLinkState && npx tsc --noEmit`
Expected: InvalidLinkState PASS; tsc clean (no unused `CenteredCard`, no unused old imports).

- [ ] **Step 10: Commit**

```bash
git add components/InvalidLinkState.tsx components/__tests__/InvalidLinkState.test.tsx "app/apply/[slug]/page.tsx" "app/apply/resume/[token]/page.tsx" "app/invite/[token]/page.tsx"
git commit -m "feat(system-states): 2c InvalidLinkState + wire invalid/expired link branches"
```

---

### Task 4: 2d — Billing return restyle + spinner keyframe

**Files:**
- Modify: `app/globals.css` (append `ee-spin` keyframe+class after the `ee-indeterminate` keyframe from Task 1)
- Modify: `app/billing/return/page.tsx` (JSX only — server data logic + `ReturnPoller` unchanged)

**Interfaces:**
- Consumes: `@/components/brand/Logo`, `./ReturnPoller` (both already imported). No new import.
- Produces: nothing consumed downstream.

**Design (presentational — approved):** centered on `bg-background`: `Logo`, then white card 560px (radius 18, padding 34×40, `shadow-float`) with 3 step rows (gap 26px): (1) ✓ green disc « Paiement reçu »; (2) spinner « Activation de votre abonnement… »; (3) empty ring @55% opacity « Redirection vers le tableau de bord ». Below the card: mono 14px « Vous serez redirigé automatiquement — ne fermez pas cette page. » **No unit test** (visual only — matches spec Testing section). No ASCII apostrophes in this copy; accents (`reçu`, `redirigé`) are guarded.

- [ ] **Step 1: Add the `ee-spin` keyframe to `app/globals.css`**

Edit — anchor on the closing `}` of the `@keyframes ee-indeterminate` block (added in Task 1). Insert immediately after it:

```css
.ee-spin { animation: ee-spin 0.9s linear infinite; }

@keyframes ee-spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 2: Restyle `app/billing/return/page.tsx`** — replace ONLY the returned JSX (keep the imports, `export const dynamic`, and the entire `getUser`→school→`hasActivePlan`→`redirect` block above the `return`). New `return`:

```tsx
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      <div className="w-full max-w-[560px] rounded-[18px] bg-card px-10 py-[34px] shadow-float">
        <div className="flex flex-col gap-[26px]">
          <div className="flex items-center gap-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-success text-[15px] font-bold text-success-text">✓</span>
            <span className="text-[15px] font-semibold text-navy">Paiement recu</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="ee-spin h-9 w-9 flex-none rounded-full border-[3.5px] border-tint-border border-t-brand" />
            <span className="text-[15px] font-semibold text-navy">Activation de votre abonnement…</span>
          </div>
          <div className="flex items-center gap-4 opacity-55">
            <span className="h-9 w-9 flex-none rounded-full border-2 border-frame" />
            <span className="text-[15px] font-semibold text-navy">Redirection vers le tableau de bord</span>
          </div>
        </div>
      </div>
      <p className="font-mono text-[14px] text-placeholder">
        Vous serez redirige automatiquement — ne fermez pas cette page.
      </p>
      <ReturnPoller />
    </div>
  )
```

- [ ] **Step 3: Accent presence-check + repair**

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("app/billing/return/page.tsx")
s = p.read_text()
for a, b in [("Paiement recu", "Paiement reçu"), ("Vous serez redirige", "Vous serez redirigé")]:
    s = s.replace(a, b)
p.write_text(s)
PY
grep -q "Paiement reçu" app/billing/return/page.tsx && grep -q "redirigé automatiquement" app/billing/return/page.tsx && echo "accents OK" || echo "ACCENTS MISSING — FIX"
```
Expected: `accents OK`.

- [ ] **Step 4: Verify build compiles the page + types clean**

Run: `npx tsc --noEmit`
Expected: clean (no unused imports; `Logo`/`ReturnPoller`/`dynamic` all still used).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/billing/return/page.tsx
git commit -m "feat(system-states): 2d billing return restyle + spinner keyframe"
```

---

### Task 5: 2e — Organizer empty dashboard restyle

**Files:**
- Modify: `components/dashboard/EmptyDashboard.tsx`
- Test: `components/dashboard/__tests__/EmptyDashboard.test.tsx` (new)

**Interfaces:**
- Consumes: `@/components/ui/button` (`Button`), `@/components/brand/Logo` (`Logo`), `@/components/shell/ShellUiContext` (`useShellUi` → `{ openNewExchange }`). Keeps `'use client'`.
- Produces: `EmptyDashboard()` — zero-prop client component (unchanged behavior: CTA calls `openNewExchange`).

**Design:** page H3 30px navy « Tableau de bord » at top, then a 2px dashed `border-frame` zone (radius 22, padding 64×40, `bg-[rgba(255,255,255,.5)]`), centered column inside: `Logo` (static lockup), title 24px « Aucun échange pour l’instant », body 17px `text-muted-foreground` max-w-[480px], primary « + Nouvel échange » → `openNewExchange`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/dashboard/__tests__/EmptyDashboard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const openNewExchange = vi.fn()
vi.mock('@/components/shell/ShellUiContext', () => ({
  useShellUi: () => ({ openNewExchange }),
}))

import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

describe('EmptyDashboard', () => {
  it('renders the empty-state title and heading', () => {
    render(<EmptyDashboard />)
    expect(screen.getByText('Tableau de bord')).toBeTruthy()
    expect(screen.getByText(/Aucun .change pour l.instant/)).toBeTruthy()
  })

  it('CTA opens the new-exchange modal', () => {
    render(<EmptyDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /Nouvel .change/ }))
    expect(openNewExchange).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- EmptyDashboard`
Expected: FAIL — no « Tableau de bord » heading in the current component.

- [ ] **Step 3: Rewrite `components/dashboard/EmptyDashboard.tsx`** (apostrophe/accents shown ASCII-safe; Step 5 repairs)

```tsx
// components/dashboard/EmptyDashboard.tsx
'use client'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/Logo'
import { useShellUi } from '@/components/shell/ShellUiContext'

export function EmptyDashboard() {
  const { openNewExchange } = useShellUi()
  return (
    <div>
      <h3 className="mb-6 font-display text-[30px] font-bold tracking-tight text-navy">Tableau de bord</h3>
      <div className="flex flex-col items-center gap-4 rounded-[22px] border-2 border-dashed border-frame bg-[rgba(255,255,255,.5)] px-10 py-16 text-center">
        <Logo href={null} />
        <h4 className="font-display text-[24px] font-bold text-navy">Aucun echange pour l\'instant</h4>
        <p className="max-w-[480px] text-[17px] leading-relaxed text-muted-foreground">
          Creez votre premier echange pour inviter des eleves, assigner des formulaires et suivre les dossiers au meme endroit.
        </p>
        <Button className="mt-2" onClick={openNewExchange}>+ Nouvel echange</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- EmptyDashboard`
Expected: PASS (apostrophe/accent-agnostic regexes match). Continue — copy still needs its final bytes.

- [ ] **Step 5: Repair apostrophe + accents**

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("components/dashboard/EmptyDashboard.tsx")
s = p.read_text()
for a, b in [
  ("Aucun echange pour l'instant", "Aucun échange pour l’instant"),
  ("Creez votre premier echange pour inviter des eleves, assigner des formulaires et suivre les dossiers au meme endroit.",
   "Créez votre premier échange pour inviter des élèves, assigner des formulaires et suivre les dossiers au même endroit."),
  ("+ Nouvel echange", "+ Nouvel échange"),
]:
    s = s.replace(a, b)
p.write_text(s)
PY
grep -n "l'instant" components/dashboard/EmptyDashboard.tsx && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
grep -q "Aucun échange pour l’instant" components/dashboard/EmptyDashboard.tsx && grep -q "élèves" components/dashboard/EmptyDashboard.tsx && echo "accents OK" || echo "ACCENTS MISSING — FIX"
```
Expected: `apostrophes OK (U+2019)` then `accents OK`.

- [ ] **Step 6: Re-run test (bytes changed) + commit**

```bash
pnpm test -- EmptyDashboard
git add components/dashboard/EmptyDashboard.tsx components/dashboard/__tests__/EmptyDashboard.test.tsx
git commit -m "feat(system-states): 2e organizer empty dashboard restyle"
```
Expected: test PASS.

---

### Task 6: 2f — Student empty dossier banner

**Files:**
- Modify: `components/student/DossierView.tsx` (add `total === 0` branch after the header)
- Test: `components/student/__tests__/DossierView.test.tsx` (add one test; existing tests stay green)

**Interfaces:**
- Consumes: unchanged `Dossier` shape from `@/lib/student/dossier` (no data change). The existing empty case already renders the header + `dossierSubline` (« Rien à remplir… ») — we ADD a banner below it.
- Produces: no signature change (`DossierView({ dossier, firstName })`).

**Design:** after the existing header block (kicker « MON DOSSIER » + « Bonjour {firstName}, » + subline), render the 2f blue-tint banner when `total === 0`: `bg-tint` / `border-tint-border`, radius 22, padding 30×34, a 66px `bg-brand-hover` rounded-18 square with white ✓, title 22px « Tout est à jour », body 16px tutoiement. **No progress bar** (the existing `total > 0` gate already covers this — the banner sits before that block).

- [ ] **Step 1: Add the failing test** (append inside the existing `describe('DossierView', …)` block)

```tsx
  it('renders the "up to date" banner and no progress bar when nothing is assigned', () => {
    const d = buildDossier([], NOW)
    render(<DossierView dossier={d} firstName="Léa" />)
    expect(screen.getByText(/Tout est . jour/)).toBeTruthy()  // accent-agnostic (à)
    expect(screen.queryByText(/envoyés/)).toBeNull()          // no progress row
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- DossierView`
Expected: the new test FAILS (no « Tout est à jour » text); the 5 existing tests still PASS.

- [ ] **Step 3: Add the `total === 0` branch to `DossierView.tsx`** — insert immediately AFTER the header `<p …>{dossierSubline(dossier)}</p>` line and BEFORE the `{total > 0 && (` block (apostrophes/accents shown ASCII-safe; Step 5 repairs):

```tsx
      {total === 0 && (
        <div className="flex items-center gap-4 rounded-[22px] border border-tint-border bg-tint px-[34px] py-[30px]">
          <div className="flex h-[66px] w-[66px] flex-none items-center justify-center rounded-[18px] bg-brand-hover text-2xl font-bold text-white">✓</div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[22px] font-semibold text-navy">Tout est a jour</div>
            <p className="mt-1 text-[16px] leading-relaxed text-foreground">
              Aucun formulaire ne t\'attend pour l\'instant. On te previendra par e-mail des qu\'il y a du nouveau — profite de ta journee.
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm test -- DossierView`
Expected: all 6 PASS — the new assertion (`/Tout est . jour/`) is accent-agnostic so it matches the ASCII-safe literal from Step 3; the 5 existing tests stay green.

- [ ] **Step 5: Repair apostrophes + accents**

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("components/student/DossierView.tsx")
s = p.read_text()
for a, b in [
  ("Tout est a jour", "Tout est à jour"),
  ("Aucun formulaire ne t'attend pour l'instant. On te previendra par e-mail des qu'il y a du nouveau — profite de ta journee.",
   "Aucun formulaire ne t’attend pour l’instant. On te préviendra par e-mail dès qu’il y a du nouveau — profite de ta journée."),
]:
    s = s.replace(a, b)
p.write_text(s)
PY
grep -n "t'attend\|l'instant\|qu'il" components/student/DossierView.tsx && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
grep -q "Tout est à jour" components/student/DossierView.tsx && grep -q "préviendra" components/student/DossierView.tsx && echo "accents OK" || echo "ACCENTS MISSING — FIX"
```
Expected: `apostrophes OK (U+2019)` then `accents OK`. (The `grep -n` on existing `l'instant` in `dossierSubline` lives in `lib/student/dossier.ts`, NOT this file — so no false hit here.)

- [ ] **Step 6: Re-run tests (bytes changed) + commit**

```bash
pnpm test -- DossierView
git add components/student/DossierView.tsx components/student/__tests__/DossierView.test.tsx
git commit -m "feat(system-states): 2f student empty dossier banner"
```
Expected: 6/6 PASS.

---

### Task 7: Whole-phase verification gate + ledger/memory update

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append Phase 7 execution entry)
- Modify: `/home/bjorn/.claude/projects/-home-bjorn-eazyexchange/memory/project_redesign_phases.md` + `MEMORY.md` line (Phase 7 → DONE)

**Interfaces:** none (bookkeeping + gates only). No new test.

- [ ] **Step 1: Full verifying gate**

Run each; all must be green before merge:
```bash
pnpm lint
pnpm test
npx tsc --noEmit
pnpm build
```
Expected: lint clean (pre-existing `apple-icon` `<img>` warning is the only allowed warning); all tests PASS; tsc clean; build succeeds.

- [ ] **Step 2: Apostrophe-byte audit on every changed FR file**

```bash
for f in components/ErrorState.tsx components/dashboard/EmptyDashboard.tsx components/student/DossierView.tsx "app/apply/[slug]/page.tsx" "app/apply/resume/[token]/page.tsx" "app/invite/[token]/page.tsx" app/billing/return/page.tsx; do
  # flag an ASCII apostrophe sitting between two letters inside a quoted FR word (e.g. l'instant)
  grep -nP "[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]" "$f" && echo "^^ ASCII apostrophe in $f — REPAIR" || true
done
echo "audit done"
```
Expected: no `^^ ASCII apostrophe` lines. (JSX attribute apostrophes like `don't` don't exist in these files; any hit is real FR copy to repair.)

- [ ] **Step 3: Live drive (manual, post-build)** — record results in the ledger entry:
  - Force an error boundary (throw in an organizer page) → 2b renders « Le fil s’est rompu. » + « Tableau de bord » link; repeat under `/my-forms` → « Mon dossier » link.
  - Hit a bad/expired token (`/invite/bogus`, `/apply/resume/bogus`, `/apply/unknown-slug`) → 2c greyed template with the mapped copy.
  - Zero-exchange organizer at `/dashboard` → 2e dashed empty zone + CTA opens the new-exchange modal.
  - No-assignment student at `/my-forms` → 2f « Tout est à jour » banner, no progress bar.
  - Slow nav → 2a animated loader; `/billing/return` (pre-activation) → 2d card with spinner.

- [ ] **Step 4: Update the SDD ledger** — append to `.superpowers/sdd/progress.md`:

```markdown
---

Plan: docs/superpowers/plans/2026-07-04-redesign-phase7-system-states.md
Branch: redesign/phase-7-system-states
Started: 2026-07-04

## Tasks
- [x] Task 1: 2a LoadingState + loader keyframes
- [x] Task 2: 2b ErrorState restyle + home prop + FR messages
- [x] Task 3: 2c InvalidLinkState + wire invalid/expired branches
- [x] Task 4: 2d billing return restyle + spinner keyframe
- [x] Task 5: 2e organizer empty dashboard restyle
- [x] Task 6: 2f student empty dossier banner
- [x] Task 7: whole-phase gate green (lint/test/tsc/build), apostrophe audit clean, live-drive confirmed
```
(Fill in real gate/live-drive results + any deferred minors after execution.)

- [ ] **Step 5: Update auto-memory** — set the Phase 7 line in `project_redesign_phases.md` (and its `MEMORY.md` pointer) to reflect Phase 7 PLAN→EXECUTED, and note Phase 8 (landing) as NEXT. Follow the memory-file format.

- [ ] **Step 6: Finish the branch** — invoke `superpowers:finishing-a-development-branch`. Merging to `main` = Vercel prod deploy with **no `supabase db push`** (additive/no-migration, same as Phase 6). User-gated.

---

## Self-review (author checklist — done)

**Spec coverage:** 2a→T1, 2b→T2, 2c→T3, 2d→T4, 2e→T5, 2f→T6; keyframes (`ee-mark-l/r`, `ee-indeterminate`, `ee-spin`)→T1+T4; testing matrix (LoadingState caption, ErrorState mapping+home wiring, InvalidLinkState title/body, DossierView total===0, EmptyDashboard behavior)→T1/T2/T3/T6/T5; French/apostrophe guard→every FR task + T7 audit; verifying gates→T7. Locked decisions honored: 2c no button; 2f keeps Phase-5 done-state copy (untouched) + adds the empty case; 2d presentational; apply-closed & resume-submitted left as positive terminal states.

**Placeholder scan:** none — every code step carries full code; every FR string has a concrete repair map.

**Type consistency:** `ErrorState` `home: { href; label }` shape identical across component + both boundaries + test; `InvalidLinkState({ title, body })` identical across component, three call sites, and test; `useShellUi().openNewExchange` name matches existing context.

## Deferred / accepted minors (for final review, non-blocking)

- 2a is a content-area (not full-viewport) loader — approved deviation (renders inside the resolved shell).
- Loader/spinner animations are not gated behind `prefers-reduced-motion` (a functional loader/spinner reads as broken when frozen) — accepted.
- `friendlyMessage` uses vouvoiement even on the student error boundary — accepted (generic system errors).
- 2f done-state banners (`allApproved`/`allSent`) keep Phase-5 copy; optional visual alignment to the 2f 66px-tile spec is polish, not required.
- 2a caption uses `text-placeholder` (#9AA6C0); the spec annotated #8A97B2 — negligible, class name preferred over raw hex per Global Constraints.
