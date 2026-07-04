# Redesign Phase 6 — Auth & Public Pages (screens 1a–1f) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the six existing auth/public/billing flows to the high-fidelity handoff design and migrate their copy to French (bilingual for the public application form), reusing every server action, route and auth flow unchanged.

**Architecture:** Pure presentational + copy pass. One new shared presentational primitive (`CenteredCard` / `AuthCard`) hosts the four centered-card screens (1a/1c/1e/1f); signup (1b) reuses the inner `AuthCard` inside a two-column grid; the public application form (1d) keeps its own 720px column with a header row and fixed bottom bar. No migration, no RLS change, no new server action → **additive**, so merge to `main` deploys to prod with **no `supabase db push`** (same shape as Phase 5).

**Tech Stack:** Next.js 14 App Router (client pages for auth/forms, server pages for public/billing shells), Tailwind + shadcn/ui, Supabase Auth, Vitest + Testing Library.

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include this section.

- **French copy is authoritative from the design HTML** `design_handoff_eazyexchange/Eazyexchange Pages Round 2.dc.html` (extracted to scratchpad during planning). Match words, accents and « » guillemets verbatim.
- **Apostrophes MUST be U+2019 (’), not ASCII (').** The shipped app (Phases 1–5) standardizes on U+2019; the final-review guard greps for ASCII apostrophes in FR strings. **The Write tool flattens U+2019 → ASCII on write** — so every code block below shows ASCII apostrophes, and every task that writes a file with FR apostrophes ends with a `python3` repair step that rewrites the specific FR substrings to U+2019 using `’` escapes (which survive Write). Do not skip the repair step.
- **Tokens:** reuse existing Tailwind/shadcn tokens and the Phase-1 fonts. Do NOT add global tokens. Where a token is missing at the shadcn layer, use a local Tailwind arbitrary value matching the hex. Key hexes: canvas `#EEF1F7`; card border `#E4E9F2`; input border `#C4CDE0`; primary blue `#2456E6` / hover `#1D48C7`; ink `#10203F`; secondary text `#5B6B8C`; label text `#42506E`; muted mono `#8A97B2`; danger text `#C0392B`; blue tint bg `#E6ECFD` / text `#1D48C7`; success bg `#DCF3E6` / text `#0F7A3D`. Radii: card 18px, inner 14px, input 10–11px, pill 999px. Card shadow `0 18px 40px -30px rgba(16,32,63,.25)`. Headings `font-display` (Schibsted Grotesk) `font-bold tracking-[-0.02em]`; micro-labels/status `font-mono` uppercase.
- **No PII in logs** (student/parent names, emails, submission contents). Preserve existing error semantics — only presentation (14px `#C0392B` in-card) and copy (French) change.
- **Staging discipline:** implementers stage only the named files (`git add <path> …`), never `git add -A`/`.` — the `app/apply` pages can leave untracked student artifacts. **Confirm `git diff --stat` shows NO migration file before merge.**
- **Plan-label reconciliation (billing 1f):** reuse the existing `PLAN_LABEL_FR` (`Essentiel`/`Association`/`Réseau`) + `planCapLabel` from `lib/billing/display.ts` — the current billing page already ships these and Phase 4 shipped them app-wide. The design HTML's `Starter`/`Growth`/`Scale` tier names are illustrative placeholders and are NOT used. The design's *layout* (3-col grid, middle plan pre-selected with a `POPULAIRE` pill) IS followed: the middle/pre-selected plan is `growth`.
- **1d file reconciliation:** the spec lists 1d as `apply/[slug]/page.tsx + ApplicationForm.tsx`, but in the code `apply/[slug]/page.tsx` renders `ApplicationStartForm` (the name/email intro) and `ApplicationForm` (the full multi-section form the 1d mockup depicts) renders on `app/apply/resume/[token]/page.tsx`. This plan restyles all four: `ApplicationForm` + resume page (Task 7) and `apply/[slug]` + `ApplicationStartForm` (Task 8).

---

## File Structure

**Create**
- `components/auth/AuthCard.tsx` — white card chrome (border, radius 18, floating shadow, `maxWidth`). Shared by `CenteredCard` and signup's two-column layout.
- `components/auth/CenteredCard.tsx` — full-height `#EEF1F7` viewport + `Logo` + centered `AuthCard`. Used by 1a/1c/1e/1f.
- `components/billing/PlanSelector.tsx` — client interactive plan grid (default `growth`) + primary CTA whose label/target follows the selection.
- Tests: `components/auth/__tests__/CenteredCard.test.tsx`, `components/auth/__tests__/AcceptInvitePage.test.tsx`, `components/__tests__/InviteResponseForm.test.tsx`, `components/billing/__tests__/PlanSelector.test.tsx`, `components/__tests__/ApplicationForm.test.tsx`, `components/__tests__/ApplicationStartForm.test.tsx`.

**Modify**
- `app/(auth)/login/page.tsx` (1a) + `app/(auth)/__tests__/login.test.tsx`
- `app/(auth)/signup/page.tsx` (1b) + `app/(auth)/__tests__/signup.test.tsx`
- `app/(auth)/accept-invite/page.tsx` (1c)
- `components/ApplicationForm.tsx` + `app/apply/resume/[token]/page.tsx` (1d full form)
- `app/apply/[slug]/page.tsx` + `components/ApplicationStartForm.tsx` (1d intro)
- `components/InviteResponseForm.tsx` + `app/invite/[token]/page.tsx` (1e)
- `app/billing/page.tsx` (1f)

**Delete**
- `app/(organizer)/exchanges/new/page.tsx` (dead redirect stub; superseded by `NewExchangeModal`, zero references). Note: the spec also names `NewExchangeForm.tsx` for deletion but that file does not exist (only `components/shell/NewExchangeModal.tsx`, which is kept).

**Reused unchanged** (do NOT edit): `components/brand/Logo.tsx`, `components/auth/GoogleButton.tsx`, `lib/application-form.ts`, `lib/billing/{limits,display,plans}.ts`, `actions/applications.ts` (`respondToInvitation`, `getInvitation`, `getApplicationDraft`, `startApplication`, `saveApplicationDraft`, `submitApplication`, `uploadApplicationPhoto`, `sendApplicationResumeLink`), `actions/student-context.ts` (`getStudentContext`), `lib/validation.ts`, `lib/uploads.ts`.

---

### Task 1: Shared `AuthCard` + `CenteredCard` primitive

**Files:**
- Create: `components/auth/AuthCard.tsx`
- Create: `components/auth/CenteredCard.tsx`
- Test: `components/auth/__tests__/CenteredCard.test.tsx`

**Interfaces:**
- Produces: `AuthCard({ maxWidth: number; className?: string; children: React.ReactNode })` — white card box, width capped at `maxWidth`px.
- Produces: `CenteredCard({ maxWidth: number; className?: string; children: React.ReactNode })` — viewport + Logo + AuthCard. `className` is forwarded to the inner AuthCard (so screens tune inner gap/padding).

- [ ] **Step 1: Write the failing test**

`components/auth/__tests__/CenteredCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CenteredCard } from '@/components/auth/CenteredCard'

describe('CenteredCard', () => {
  it('renders the logo wordmark and children inside a card at the given maxWidth', () => {
    const { container } = render(
      <CenteredCard maxWidth={460}><p>card body</p></CenteredCard>,
    )
    expect(screen.getByText('Eazyexchange')).toBeInTheDocument()
    expect(screen.getByText('card body')).toBeInTheDocument()
    const card = container.querySelector('[style*="max-width"]') as HTMLElement
    expect(card).toBeTruthy()
    expect(card.style.maxWidth).toBe('460px')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- CenteredCard`
Expected: FAIL — cannot resolve `@/components/auth/CenteredCard`.

- [ ] **Step 3: Write `AuthCard`**

`components/auth/AuthCard.tsx`:
```tsx
import { cn } from '@/lib/utils'

export function AuthCard({
  maxWidth,
  className,
  children,
}: {
  maxWidth: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{ maxWidth }}
      className={cn(
        'w-full rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-9 shadow-[0_18px_40px_-30px_rgba(16,32,63,0.25)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Write `CenteredCard`**

`components/auth/CenteredCard.tsx`:
```tsx
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from './AuthCard'

export function CenteredCard({
  maxWidth,
  className,
  children,
}: {
  maxWidth: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={maxWidth} className={className}>
        {children}
      </AuthCard>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- CenteredCard`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add components/auth/AuthCard.tsx components/auth/CenteredCard.tsx components/auth/__tests__/CenteredCard.test.tsx
git commit -m "feat(auth): CenteredCard + AuthCard primitive for Phase 6 auth screens"
```

---

### Task 2: 1a Login — restyle + FR error strings

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Test: `app/(auth)/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `CenteredCard` (Task 1), `GoogleButton`, `Button`, `Input`, `Label`.

- [ ] **Step 1: Update the test to assert French error copy**

Replace `app/(auth)/__tests__/login.test.tsx` with (assert on apostrophe-free fragments so byte encoding can't break the match):
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { vi } from 'vitest'
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import LoginPage from '@/app/(auth)/login/page'

describe('LoginPage error banner (French)', () => {
  it('surfaces the signup_failed message', async () => {
    window.history.pushState({}, '', '/login?error=signup_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/pas pu terminer la création/i)).toBeInTheDocument()
  })
  it('surfaces the invite_invalid message', async () => {
    window.history.pushState({}, '', '/login?error=invite_invalid')
    render(<LoginPage />)
    expect(await screen.findByText(/invitation est invalide ou a expiré/i)).toBeInTheDocument()
  })
  it('surfaces the oauth_failed message', async () => {
    window.history.pushState({}, '', '/login?error=oauth_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/connexion avec google a échoué/i)).toBeInTheDocument()
  })
  it('surfaces the not_invited message', async () => {
    window.history.pushState({}, '', '/login?error=not_invited')
    render(<LoginPage />)
    expect(await screen.findByText(/associer votre compte google à une invitation/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- login`
Expected: FAIL — page still renders English strings.

- [ ] **Step 3: Rewrite the login page** (apostrophes shown ASCII; Step 5 converts them to U+2019)

`app/(auth)/login/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'invite_invalid') {
      setError('Ce lien d\'invitation est invalide ou a expiré — demandez à votre organisateur de vous le renvoyer.')
    } else if (err === 'signup_failed') {
      setError('Nous n\'avons pas pu terminer la création de votre compte. Réessayez de vous inscrire.')
    } else if (err === 'oauth_failed') {
      setError('La connexion avec Google a échoué. Veuillez réessayer.')
    } else if (err === 'not_invited') {
      setError('Nous n\'avons pas pu associer votre compte Google à une invitation. Utilisez l\'adresse e-mail avec laquelle vous avez été invité, ou définissez un mot de passe depuis votre lien d\'invitation.')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  return (
    <CenteredCard maxWidth={460} className="flex flex-col gap-[22px]">
      <h3 className="m-0 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">Connexion</h3>
      <GoogleButton label="Continuer avec Google" />
      <div className="flex items-center gap-3.5 font-mono text-[13px] font-medium text-[#8A97B2]">
        <span className="flex-1 border-t border-[#E4E9F2]" />ou<span className="flex-1 border-t border-[#E4E9F2]" />
      </div>
      <form onSubmit={handleLogin} className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-semibold text-[#42506E]">E-mail</Label>
          <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="h-[50px] rounded-[11px] border-[#C4CDE0] text-base" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-sm font-semibold text-[#42506E]">Mot de passe</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
            className="h-[50px] rounded-[11px] border-[#C4CDE0] text-base" />
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading}
          className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-[17px] font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </CenteredCard>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- login`
Expected: PASS (4 tests).

- [ ] **Step 5: Repair apostrophes to U+2019, then verify**

```bash
python3 - <<'PY'
import pathlib
f = pathlib.Path("app/(auth)/login/page.tsx")
s = f.read_text()
for a, b in [("d'invitation", "d’invitation"), ("n'avons", "n’avons"), ("l'adresse", "l’adresse")]:
    s = s.replace(a, b)
f.write_text(s)
PY
grep -n "d'invitation\|n'avons\|l'adresse" "app/(auth)/login/page.tsx" && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
```
Expected: `apostrophes OK (U+2019)`. Re-run `pnpm test -- login` → still PASS (assertions are apostrophe-free).

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/login/page.tsx" "app/(auth)/__tests__/login.test.tsx"
git commit -m "feat(auth): restyle login (1a) + French error strings"
```

---

### Task 3: 1b Signup — two-column layout + French

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Test: `app/(auth)/__tests__/signup.test.tsx`

**Interfaces:**
- Consumes: `AuthCard` (Task 1), `Logo`, `GoogleButton`, `Button`, `Input`, `Label`, `normalizeEmail`/`isValidEmail`.

- [ ] **Step 1: Update the test to French labels**

Replace `app/(auth)/__tests__/signup.test.tsx` with:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => { signUp.mockClear() })

describe('SignupPage (French)', () => {
  it('submits signUp with name + school and shows the check-email state', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/établissement/i), 'Lincoln High')
    await user.type(screen.getByLabelText(/e-mail/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe', school_name: 'Lincoln High' })
    expect(await screen.findByText(/vérifiez votre e-mail/i)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/établissement/i), 'Lincoln')
    await user.type(screen.getByLabelText(/e-mail/i), 'a@b')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/adresse e-mail valide/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- signup`
Expected: FAIL — English labels not found.

- [ ] **Step 3: Rewrite the signup page** (apostrophe shown ASCII; Step 5 fixes it)

`app/(auth)/signup/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = fullName.trim()
    const school = schoolName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name || !school) { setError('Veuillez remplir tous les champs.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name, school_name: school },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
        <Logo href="/" />
        <AuthCard maxWidth={460} className="flex flex-col gap-3">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Vérifiez votre e-mail</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">Nous avons envoyé un lien de confirmation à votre adresse e-mail. Cliquez dessus pour finaliser la création de votre compte.</p>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EEF1F7] px-4 py-10">
      <div className="flex w-full max-w-[860px] flex-col items-center gap-[60px] md:flex-row md:items-center">
        <div className="flex w-full flex-col gap-5 md:w-[340px]">
          <Logo href="/" />
          <h3 className="m-0 font-display text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-[#10203F]">Organisez vos échanges scolaires sans tableur.</h3>
          <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">Candidatures, formulaires et dossiers élèves — au même endroit, pour les deux établissements.</p>
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">ESSAI GRATUIT · 1 ÉCHANGE</span>
        </div>
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <h3 className="m-0 mb-1 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Créer votre compte</h3>
          <GoogleButton intent="organizer_signup" next="/dashboard" label="S'inscrire avec Google" />
          <div className="flex items-center gap-3.5 font-mono text-xs font-medium text-[#8A97B2]">
            <span className="flex-1 border-t border-[#E4E9F2]" />ou<span className="flex-1 border-t border-[#E4E9F2]" />
          </div>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fullName" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
                <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="schoolName" className="text-[13px] font-semibold text-[#42506E]">Établissement</Label>
                <Input id="schoolName" value={schoolName} onChange={e => setSchoolName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[13px] font-semibold text-[#42506E]">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[13px] font-semibold text-[#42506E]">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="8 caractères minimum" className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            {error && <p className="text-sm text-[#C0392B]">{error}</p>}
            <Button type="submit" disabled={loading} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
              {loading ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>
        </AuthCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- signup`
Expected: PASS (2 tests).

- [ ] **Step 5: Repair apostrophe, verify**

```bash
python3 - <<'PY'
import pathlib
f = pathlib.Path("app/(auth)/signup/page.tsx")
s = f.read_text().replace("S'inscrire", "S’inscrire")
f.write_text(s)
PY
grep -n "S'inscrire" "app/(auth)/signup/page.tsx" && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
```
Expected: `apostrophes OK (U+2019)`.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/signup/page.tsx" "app/(auth)/__tests__/signup.test.tsx"
git commit -m "feat(auth): restyle signup (1b) two-column layout + French"
```

---

### Task 4: 1c Accept-invite — restyle + tutoiement + exchange pill

**Files:**
- Modify: `app/(auth)/accept-invite/page.tsx`
- Test: `components/auth/__tests__/AcceptInvitePage.test.tsx`

**Interfaces:**
- Consumes: `CenteredCard` (Task 1), `getStudentContext` from `@/actions/student-context` (returns `{ exchangeLabel: string | null, … }`, self-scoped, degrades to null), `GoogleButton`, `Button`, `Input`, `Label`.

- [ ] **Step 1: Write the failing test**

`components/auth/__tests__/AcceptInvitePage.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/student-context', () => ({
  getStudentContext: vi.fn(async () => ({ fullName: '', firstName: '', initials: '', exchangeLabel: 'Espagne · Automne 2026' })),
}))

import AcceptInvitePage from '@/app/(auth)/accept-invite/page'

describe('AcceptInvitePage (French)', () => {
  it('renders the tutoiement heading and CTA', async () => {
    render(<AcceptInvitePage />)
    expect(screen.getByText(/configure ton compte/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /parti/i })).toBeInTheDocument()
  })
  it('shows the exchange pill once getStudentContext resolves', async () => {
    render(<AcceptInvitePage />)
    expect(await screen.findByText(/Espagne · Automne 2026/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- AcceptInvitePage`
Expected: FAIL — cannot find `AcceptInvitePage` French copy.

- [ ] **Step 3: Rewrite the accept-invite page** (apostrophes ASCII; Step 5 fixes)

`app/(auth)/accept-invite/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getStudentContext } from '@/actions/student-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function AcceptInvitePage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [exchangeLabel, setExchangeLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Session was established server-side by /auth/confirm, so this self-scoped
  // read succeeds; the pill is decorative and degrades to nothing on failure.
  useEffect(() => {
    getStudentContext().then(ctx => setExchangeLabel(ctx.exchangeLabel)).catch(() => {})
  }, [])

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user }, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError || !user) {
      setError(updateError?.message ?? 'Ton lien d\'invitation est invalide ou a expiré — demande à ton organisateur de te le renvoyer.')
      setLoading(false)
      return
    }
    const { error: profileError } = await supabase.from('users').update({ full_name: fullName }).eq('id', user.id)
    if (profileError) { setError(profileError.message); setLoading(false); return }
    router.push('/my-forms')
    router.refresh()
  }

  return (
    <CenteredCard maxWidth={460} className="flex flex-col gap-[18px]">
      <div>
        {exchangeLabel && (
          <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{exchangeLabel}</span>
        )}
        <h3 className="m-0 mb-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">Configure ton compte</h3>
        <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">Dernière étape avant ton espace élève.</p>
      </div>
      <GoogleButton next="/my-forms" label="Continuer avec Google" />
      <div className="flex items-center gap-3.5 font-mono text-xs font-medium text-[#8A97B2]">
        <span className="flex-1 border-t border-[#E4E9F2]" />ou choisis un mot de passe<span className="flex-1 border-t border-[#E4E9F2]" />
      </div>
      <form onSubmit={handleAccept} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
          <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-[13px] font-semibold text-[#42506E]">Mot de passe</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="8 caractères minimum" className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Configuration…' : 'C\'est parti'}
        </Button>
      </form>
    </CenteredCard>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- AcceptInvitePage`
Expected: PASS (2 tests).

- [ ] **Step 5: Repair apostrophes, verify**

```bash
python3 - <<'PY'
import pathlib
f = pathlib.Path("app/(auth)/accept-invite/page.tsx")
s = f.read_text()
for a, b in [("d'invitation", "d’invitation"), ("C'est parti", "C’est parti")]:
    s = s.replace(a, b)
f.write_text(s)
PY
grep -n "d'invitation\|C'est parti" "app/(auth)/accept-invite/page.tsx" && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
```
Expected: `apostrophes OK (U+2019)`.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/accept-invite/page.tsx" components/auth/__tests__/AcceptInvitePage.test.tsx
git commit -m "feat(auth): restyle accept-invite (1c) tutoiement + exchange pill"
```

---

### Task 5: 1e Invite response — CenteredCard 520 + tutoiement

**Files:**
- Modify: `components/InviteResponseForm.tsx`
- Modify: `app/invite/[token]/page.tsx`
- Test: `components/__tests__/InviteResponseForm.test.tsx`

**Interfaces:**
- Consumes: `respondToInvitation(token, 'yes'|'no'|'maybe', note)` from `@/actions/applications`; `getInvitation(token)` returning `{ exchangeName, applicantName, status, expired }`; `CenteredCard` (Task 1), `Button`, `Textarea`.
- Produces: `InviteResponseForm({ token: string; firstName: string; exchangeName: string })` — **prop signature changes** (was `{ token }`); the page now derives `firstName` and passes `exchangeName` so the heading lives inside the card.

- [ ] **Step 1: Write the failing test**

`components/__tests__/InviteResponseForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const respond = vi.fn(async () => {})
vi.mock('@/actions/applications', () => ({ respondToInvitation: respond }))

import { InviteResponseForm } from '@/components/InviteResponseForm'

describe('InviteResponseForm (French)', () => {
  it('renders the personalized heading and accept CTA', () => {
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="Espagne · Automne 2026" />)
    expect(screen.getByText(/tu es invitée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /je veux participer/i })).toBeInTheDocument()
  })
  it('confirms after accepting', async () => {
    const user = userEvent.setup()
    render(<InviteResponseForm token="t" firstName="Léa" exchangeName="X" />)
    await user.click(screen.getByRole('button', { name: /je veux participer/i }))
    expect(respond).toHaveBeenCalledWith('t', 'yes', '')
    expect(await screen.findByText(/regarde ta boîte mail/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- InviteResponseForm`
Expected: FAIL — component has no `firstName`/`exchangeName` props and renders English.

- [ ] **Step 3: Rewrite `InviteResponseForm`** (apostrophes ASCII; Step 6 fixes)

`components/InviteResponseForm.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { respondToInvitation } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function InviteResponseForm({ token, firstName, exchangeName }: { token: string; firstName: string; exchangeName: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<'yes' | 'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try { await respondToInvitation(token, response, response === 'maybe' ? note : ''); setResult(response) }
    catch (e) { setError(e instanceof Error ? e.message : 'Une erreur est survenue.'); setBusy(false) }
  }

  if (result === 'yes') return <p className="text-[15px] leading-relaxed text-[#0F7A3D]">Parfait ! Regarde ta boîte mail pour le lien d\'activation de ton compte.</p>
  if (result === 'no') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci de nous avoir prévenus. Nous te souhaitons le meilleur.</p>
  if (result === 'maybe') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — nous avons noté ta réponse, l\'organisateur reviendra vers toi.</p>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">Candidature acceptée 🎉</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">{firstName ? `${firstName}, ` : ''}tu es invitée à l\'échange {exchangeName} !</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Ta candidature a été retenue. Veux-tu participer ?</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button disabled={busy} onClick={() => respond('yes')} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Oui, je veux participer</Button>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')} className="h-[50px] w-full rounded-[11px] border-[#C4CDE0] text-base font-semibold">Non merci</Button>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-[#E4E9F2] pt-[18px]">
        <Textarea placeholder="Si tu hésites, laisse une note (facultatif)" value={note} onChange={e => setNote(e.target.value)} className="min-h-16 rounded-[10px] border-[#C4CDE0]" />
        <Button variant="ghost" disabled={busy} onClick={() => respond('maybe')} className="self-start px-0 font-semibold text-[#5B6B8C] underline underline-offset-[3px] hover:bg-transparent hover:text-[#10203F]">Peut-être — j\'ai besoin de temps</Button>
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the invite page** (apostrophes ASCII; Step 6 fixes)

`app/invite/[token]/page.tsx`:
```tsx
import { getInvitation } from '@/actions/applications'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { CenteredCard } from '@/components/auth/CenteredCard'

// Reads live invitation state (accepted / already-answered) via the cookie-less
// admin client — force dynamic so the response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInvitation(token)

  if (!invite) return (
    <CenteredCard maxWidth={520}><p className="m-0 text-[15px] text-[#5B6B8C]">Ce lien d\'invitation n\'est pas valide.</p></CenteredCard>
  )
  if (invite.expired) return (
    <CenteredCard maxWidth={520}><p className="m-0 text-[15px] text-[#5B6B8C]">Cette invitation a expiré. Contacte ton organisateur pour en recevoir une nouvelle.</p></CenteredCard>
  )
  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return (
    <CenteredCard maxWidth={520}><p className="m-0 text-[15px] text-[#5B6B8C]">Cette invitation a déjà reçu une réponse.</p></CenteredCard>
  )
  const firstName = (invite.applicantName ?? '').trim().split(/\s+/)[0] ?? ''
  return (
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} firstName={firstName} exchangeName={invite.exchangeName} />
    </CenteredCard>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- InviteResponseForm`
Expected: PASS (2 tests).

- [ ] **Step 6: Repair apostrophes, verify**

```bash
python3 - <<'PY'
import pathlib
for path, pairs in {
  "components/InviteResponseForm.tsx": [("d'activation","d’activation"), ("l'organisateur","l’organisateur"), ("l'échange","l’échange"), ("j'ai","j’ai")],
  "app/invite/[token]/page.tsx": [("d'invitation","d’invitation"), ("n'est","n’est")],
}.items():
    p = pathlib.Path(path); s = p.read_text()
    for a, b in pairs: s = s.replace(a, b)
    p.write_text(s)
PY
grep -n "d'activation\|l'organisateur\|l'échange\|j'ai" components/InviteResponseForm.tsx; grep -n "d'invitation\|n'est" "app/invite/[token]/page.tsx"; echo "^ any output above = STILL ASCII, fix it"
```
Expected: no grep output (all converted).

- [ ] **Step 7: Commit**

```bash
git add components/InviteResponseForm.tsx "app/invite/[token]/page.tsx" components/__tests__/InviteResponseForm.test.tsx
git commit -m "feat(public): restyle invite response (1e) tutoiement + CenteredCard"
```

---

### Task 6: 1f Billing — CenteredCard 640 + plan grid (growth pre-selected)

**Files:**
- Create: `components/billing/PlanSelector.tsx`
- Modify: `app/billing/page.tsx`
- Test: `components/billing/__tests__/PlanSelector.test.tsx`

**Interfaces:**
- Consumes: `PLAN_KEYS`, `PlanKey` from `@/lib/billing/plans`; `PLAN_LABEL_FR`, `planCapLabel` from `@/lib/billing/display`; `hasActivePlan`, `isInGrace`, `PLAN_EXCHANGE_CAP` from `@/lib/billing/limits`; `CenteredCard` (Task 1).
- Produces: `PlanSelector()` — client grid, default selection `growth`, primary CTA `Continuer avec {PLAN_LABEL_FR[selected]}` linking to `/billing/checkout?plan={selected}`.

- [ ] **Step 1: Write the failing test**

`components/billing/__tests__/PlanSelector.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanSelector } from '@/components/billing/PlanSelector'

describe('PlanSelector', () => {
  it('pre-selects growth (Association) with a POPULAIRE pill', () => {
    render(<PlanSelector />)
    expect(screen.getByText('POPULAIRE')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continuer avec Association/i })).toBeInTheDocument()
  })
  it('updates the CTA when another plan is picked', async () => {
    const user = userEvent.setup()
    render(<PlanSelector />)
    await user.click(screen.getByText('Essentiel'))
    expect(screen.getByRole('link', { name: /continuer avec Essentiel/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- PlanSelector`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `PlanSelector`**

`components/billing/PlanSelector.tsx`:
```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PLAN_KEYS, type PlanKey } from '@/lib/billing/plans'
import { PLAN_LABEL_FR, planCapLabel } from '@/lib/billing/display'

export function PlanSelector() {
  const [selected, setSelected] = useState<PlanKey>('growth')
  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {PLAN_KEYS.map(key => {
          const active = key === selected
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`relative flex flex-col gap-1.5 rounded-[14px] border p-5 text-left ${active ? 'border-2 border-[#2456E6] bg-[#F7F9FE]' : 'border-[#C4CDE0] hover:border-[#2456E6]'}`}
            >
              {key === 'growth' && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-[#2456E6] px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-white">POPULAIRE</span>
              )}
              <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-[#10203F]">{PLAN_LABEL_FR[key]}</span>
              <span className="text-[13.5px] text-[#5B6B8C]">{planCapLabel(key)}</span>
            </button>
          )
        })}
      </div>
      <div className="flex gap-3">
        <Link href={`/billing/checkout?plan=${selected}`} className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">
          Continuer avec {PLAN_LABEL_FR[selected]}
        </Link>
        <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">
          Retour au tableau de bord
        </Link>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Rewrite the billing page** (apostrophes ASCII; Step 6 fixes)

`app/billing/page.tsx`:
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, isInGrace, PLAN_EXCHANGE_CAP } from '@/lib/billing/limits'
import { PLAN_LABEL_FR } from '@/lib/billing/display'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { PlanSelector } from '@/components/billing/PlanSelector'

export const dynamic = 'force-dynamic'

const capLabel = (n: number) => (n === Infinity ? 'illimités' : String(n))

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const { data: school } = await admin
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()

  const active = school ? hasActivePlan(school) : false
  const grace = school ? isInGrace(school) : false

  return (
    <CenteredCard maxWidth={640} className="flex flex-col gap-[22px]">
      <div>
        <h3 className="m-0 mb-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">Offres &amp; facturation</h3>
        {active && school?.plan ? (
          <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">
            Vous êtes sur l\'offre <span className="font-semibold text-[#10203F]">{PLAN_LABEL_FR[school.plan]}</span> ({capLabel(PLAN_EXCHANGE_CAP[school.plan])} échanges).
          </p>
        ) : (
          <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">Vous êtes en essai gratuit (1 échange). Choisissez une offre pour en créer davantage.</p>
        )}
      </div>

      {active && school?.plan ? (
        <div className="flex flex-col gap-4">
          {grace && <p className="m-0 text-sm text-[#C0392B]">Votre dernier paiement a échoué — mettez à jour votre carte pour conserver l\'accès.</p>}
          <div className="flex gap-3">
            <Link href="/billing/portal" className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">Gérer la facturation</Link>
            <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">Retour au tableau de bord</Link>
          </div>
        </div>
      ) : (
        <>
          <PlanSelector />
          {school?.stripe_customer_id && (
            <Link href="/billing/portal" className="text-center text-sm font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">Gérer la facturation</Link>
          )}
        </>
      )}
    </CenteredCard>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- PlanSelector`
Expected: PASS (2 tests).

- [ ] **Step 6: Repair apostrophes, verify**

```bash
python3 - <<'PY'
import pathlib
f = pathlib.Path("app/billing/page.tsx")
s = f.read_text()
for a, b in [("l'offre", "l’offre"), ("l'accès", "l’accès")]:
    s = s.replace(a, b)
f.write_text(s)
PY
grep -n "l'offre\|l'accès" app/billing/page.tsx && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
```
Expected: `apostrophes OK (U+2019)`.

- [ ] **Step 7: Commit**

```bash
git add components/billing/PlanSelector.tsx components/billing/__tests__/PlanSelector.test.tsx app/billing/page.tsx
git commit -m "feat(billing): restyle billing (1f) plan grid + growth pre-selected"
```

---

### Task 7: 1d Application form (full multi-section form) + resume page

**Files:**
- Modify: `components/ApplicationForm.tsx`
- Modify: `app/apply/resume/[token]/page.tsx`
- Test: `components/__tests__/ApplicationForm.test.tsx`

**Interfaces:**
- Consumes: `APPLICATION_SECTIONS`, `missingRequiredApplication`, `AppField` from `@/lib/application-form`; `saveApplicationDraft`, `submitApplication`, `uploadApplicationPhoto`, `sendApplicationResumeLink` from `@/actions/applications`; `getApplicationDraft(token)` returning `{ exchangeName, data, language, expired, submitted }`; `ALLOWED_UPLOAD_ACCEPT`; `Logo`, `Button`, `Input`, `Label`, `Textarea`.
- Produces: `ApplicationForm({ token: string; exchangeName: string; initialData: Record<string,string>; initialLanguage: 'en'|'fr' })` — **`exchangeName` prop added** (the header/pill/title move into the client component so they share the header row with the autosave indicator + EN/FR toggle).

- [ ] **Step 1: Write the failing test**

`components/__tests__/ApplicationForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/applications', () => ({
  saveApplicationDraft: vi.fn(async () => {}),
  submitApplication: vi.fn(async () => {}),
  uploadApplicationPhoto: vi.fn(async () => {}),
  sendApplicationResumeLink: vi.fn(async () => {}),
}))

import { ApplicationForm } from '@/components/ApplicationForm'

describe('ApplicationForm (1d)', () => {
  it('renders the FR header, exchange name and autosave indicator, and toggles to EN', async () => {
    const user = userEvent.setup()
    render(<ApplicationForm token="t" exchangeName="Échange Espagne" initialData={{}} initialLanguage="fr" />)
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByText('Candidature')).toBeInTheDocument()
    expect(screen.getByText('ENREGISTRÉ ✓')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
    expect(screen.getByText('SAVED ✓')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- ApplicationForm`
Expected: FAIL — component has no `exchangeName` prop / FR header.

- [ ] **Step 3: Rewrite `ApplicationForm`** (apostrophe in `T.fr.remind` shown ASCII; Step 5 fixes)

`components/ApplicationForm.tsx`:
```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { APPLICATION_SECTIONS, missingRequiredApplication, type AppField } from '@/lib/application-form'
import { saveApplicationDraft, submitApplication, uploadApplicationPhoto, sendApplicationResumeLink } from '@/actions/applications'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'

interface Props {
  token: string
  exchangeName: string
  initialData: Record<string, string>
  initialLanguage: 'en' | 'fr'
}

const T = {
  en: { intro: 'Fill out the form below — your answers are saved automatically, you can finish later.', saved: 'SAVED ✓', saving: 'SAVING…', badge: 'Application', photo: 'Recent photo', submit: 'Submit my application', later: 'Finish later', submitting: 'Sending…', missing: 'Please complete all required fields.', unexpected: 'An unexpected error occurred.', done: 'Thank you! Your application has been submitted.', remind: "We've emailed you a link to continue your application anytime.", yes: 'Yes', no: 'No' },
  fr: { intro: 'Remplis le formulaire ci-dessous — tes réponses sont enregistrées automatiquement, tu peux terminer plus tard.', saved: 'ENREGISTRÉ ✓', saving: 'ENREGISTREMENT…', badge: 'Candidature', photo: 'Photo récente', submit: 'Envoyer ma candidature', later: 'Terminer plus tard', submitting: 'Envoi…', missing: 'Veuillez remplir tous les champs obligatoires.', unexpected: 'Une erreur est survenue.', done: 'Merci ! Ta candidature a été envoyée.', remind: 'Nous t\'avons envoyé un e-mail avec un lien pour reprendre ta candidature.', yes: 'Oui', no: 'Non' },
}

export function ApplicationForm({ token, exchangeName, initialData, initialLanguage }: Props) {
  const [lang, setLang] = useState<'en' | 'fr'>(initialLanguage)
  const [data, setData] = useState<Record<string, string>>(initialData)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [remindSent, setRemindSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = T[lang]

  function set(id: string, value: string) {
    setData(prev => {
      const next = { ...prev, [id]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void autosave(next), 800)
      return next
    })
  }
  async function autosave(d: Record<string, string>) {
    setSaving(true)
    try { await saveApplicationDraft(token, d) } catch { /* transient; next edit retries */ } finally { setSaving(false) }
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function onFinishLater() {
    setReminding(true); setError(null)
    try {
      await saveApplicationDraft(token, data)
      await sendApplicationResumeLink(token)
      setRemindSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.unexpected)
    } finally { setReminding(false) }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.set('photo', file)
    try { await uploadApplicationPhoto(token, fd) } catch (err: unknown) { setError(err instanceof Error ? err.message : t.unexpected) }
  }

  async function onSubmit() {
    const missing = missingRequiredApplication(data)
    if (missing.length) { setError(t.missing); return }
    setSubmitting(true); setError(null)
    try { await submitApplication(token, data); setDone(true) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : t.unexpected); setSubmitting(false) }
  }

  if (done) return <p className="py-16 text-center text-[15px] text-[#10203F]">{t.done}</p>

  function renderField(f: AppField) {
    if (f.type === 'textarea') {
      return <Textarea id={f.id} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} className="rounded-[10px] border-[#C4CDE0]" />
    }
    if (f.type === 'yesno') {
      return (
        <div className="flex gap-4 text-sm text-[#10203F]">
          {['yes', 'no'].map(v => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === v} onChange={() => set(f.id, v)} />
              {v === 'yes' ? t.yes : t.no}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'radio') {
      return (
        <div className="flex flex-col gap-1.5 text-sm text-[#10203F]">
          {f.options!.map(o => (
            <label key={o.value} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === o.value} onChange={() => set(f.id, o.value)} />
              {o.label[lang]}
            </label>
          ))}
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return <Input id={f.id} type={inputType} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
  }

  const total = APPLICATION_SECTIONS.length
  return (
    <div className="pb-28">
      <header className="mb-[26px] flex items-center justify-between">
        <Logo href={null} />
        <div className="flex items-center gap-[18px]">
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">{saving ? t.saving : t.saved}</span>
          <div className="flex overflow-hidden rounded-[9px] border border-[#C4CDE0]">
            <button type="button" onClick={() => setLang('en')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'en' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>EN</button>
            <button type="button" onClick={() => setLang('fr')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'fr' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>FR</button>
          </div>
        </div>
      </header>

      <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{t.badge}</span>
      <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchangeName}</h1>
      <p className="m-0 mb-7 text-base leading-relaxed text-[#5B6B8C]">{t.intro}</p>

      <div className="flex flex-col gap-6 rounded-t-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        {APPLICATION_SECTIONS.map((section, i) => (
          <section key={section.id} className="flex flex-col gap-5">
            <div className="flex items-baseline gap-3 border-b border-[#E4E9F2] pb-3">
              <span className="font-mono text-xs font-semibold text-[#2456E6]">{i + 1}/{total}</span>
              <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-[#10203F]">{section.title[lang]}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.id === 'student' && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-[13.5px] font-semibold text-[#42506E]">{t.photo}</Label>
                  <input type="file" accept={ALLOWED_UPLOAD_ACCEPT} onChange={onPhoto} className="text-sm" />
                </div>
              )}
              {section.fields.map(f => (
                <div key={f.id} className={`flex flex-col gap-1.5 ${f.type === 'textarea' || f.type === 'radio' ? 'sm:col-span-2' : ''}`}>
                  <Label htmlFor={f.id} className="text-[13.5px] font-semibold text-[#42506E]">{f.label[lang]}{f.required && <span className="ml-1 text-[#C0392B]">*</span>}</Label>
                  {renderField(f)}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[#C0392B]">{error}</p>}
      {remindSent && <p className="mt-4 text-sm text-[#0F7A3D]">{t.remind}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-[#E4E9F2] bg-white">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-4">
          <Button variant="ghost" onClick={onFinishLater} disabled={reminding || submitting} className="font-semibold text-[#5B6B8C] hover:bg-transparent hover:text-[#10203F]">{reminding ? '…' : t.later}</Button>
          <Button onClick={onSubmit} disabled={submitting || reminding} className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">{submitting ? t.submitting : t.submit}</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the resume page** (apostrophes ASCII; Step 6 fixes)

`app/apply/resume/[token]/page.tsx`:
```tsx
import { getApplicationDraft } from '@/actions/applications'
import { ApplicationForm } from '@/components/ApplicationForm'

// Reads the live draft (autosaved answers + submitted/expired state) via the
// cookie-less admin client — force dynamic so it is never served from cache.
export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  if (!draft) return (
    <main className="mx-auto max-w-[720px] px-4 py-16"><p className="text-[15px] text-[#5B6B8C]">Ce lien de candidature n\'est pas valide.</p></main>
  )
  if (draft.expired) return (
    <main className="mx-auto max-w-[720px] px-4 py-16"><p className="text-[15px] text-[#5B6B8C]">Ce lien de candidature a expiré. Contacte l\'organisateur si tu dois encore compléter ta candidature.</p></main>
  )
  if (draft.submitted) return (
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
      <p className="text-[15px] text-[#0F7A3D]">Ta candidature a déjà été envoyée. Elle ne peut plus être modifiée — l\'organisateur reviendra vers toi.</p>
    </main>
  )
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <ApplicationForm token={token} exchangeName={draft.exchangeName} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} />
    </main>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- ApplicationForm`
Expected: PASS (1 test).

- [ ] **Step 6: Repair apostrophes, verify**

```bash
python3 - <<'PY'
import pathlib
for path, pairs in {
  "components/ApplicationForm.tsx": [("t'avons", "t’avons")],
  "app/apply/resume/[token]/page.tsx": [("n'est", "n’est"), ("l'organisateur", "l’organisateur")],
}.items():
    p = pathlib.Path(path); s = p.read_text()
    for a, b in pairs: s = s.replace(a, b)
    p.write_text(s)
PY
grep -n "t'avons" components/ApplicationForm.tsx; grep -n "n'est\|l'organisateur" "app/apply/resume/[token]/page.tsx"; echo "^ any output = STILL ASCII, fix it"
```
Expected: no grep output. NOTE: the English `T.en.remind` (`We've emailed…`) legitimately keeps its ASCII apostrophe — do NOT convert it.

- [ ] **Step 7: Commit**

```bash
git add components/ApplicationForm.tsx "app/apply/resume/[token]/page.tsx" components/__tests__/ApplicationForm.test.tsx
git commit -m "feat(public): restyle application form (1d) header + sections + sticky bar"
```

---

### Task 8: 1d application intro — apply/[slug] page + ApplicationStartForm

**Files:**
- Modify: `app/apply/[slug]/page.tsx`
- Modify: `components/ApplicationStartForm.tsx`
- Test: `components/__tests__/ApplicationStartForm.test.tsx`

**Interfaces:**
- Consumes: `startApplication(slug, { first_name, last_name, email, language })` from `@/actions/applications`; `createAdminClient`; `Logo`, `Button`, `Input`, `Label`.

- [ ] **Step 1: Write the failing test**

`components/__tests__/ApplicationStartForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/actions/applications', () => ({ startApplication: vi.fn(async () => ({ token: 'tok' })) }))

import { ApplicationStartForm } from '@/components/ApplicationStartForm'

describe('ApplicationStartForm', () => {
  it('starts in EN and switches the CTA to French', async () => {
    const user = userEvent.setup()
    render(<ApplicationStartForm slug="france-canada" />)
    expect(screen.getByRole('button', { name: /start my application/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'FR' }))
    expect(screen.getByRole('button', { name: /commencer ma candidature/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- ApplicationStartForm`
Expected: FAIL — old markup uses text buttons `EN` / `FR` without roles/styling asserted here, and the FR CTA label differs. (If it happens to pass on the CTA text, the segmented-toggle role assertion still fails until Step 3.)

- [ ] **Step 3: Rewrite `ApplicationStartForm`** (no FR apostrophes; still grep-guard in Step 6)

`components/ApplicationStartForm.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startApplication } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ApplicationStartForm({ slug }: { slug: string }) {
  const [lang, setLang] = useState<'en' | 'fr'>('en')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const fr = lang === 'fr'

  async function start() {
    setLoading(true); setError(null)
    try {
      const { token } = await startApplication(slug, { ...form, language: lang })
      router.push(`/apply/resume/${token}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : (fr ? 'Une erreur est survenue.' : 'Something went wrong')); setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <div className="flex overflow-hidden rounded-[9px] border border-[#C4CDE0]">
          <button type="button" onClick={() => setLang('en')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'en' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>EN</button>
          <button type="button" onClick={() => setLang('fr')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'fr' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>FR</button>
        </div>
      </div>
      <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">{fr ? 'Candidate à cet échange scolaire. Commence par renseigner tes informations ci-dessous.' : 'Apply to join this student exchange. Start by entering your details below.'}</p>
      <div className="flex flex-col gap-4 rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first_name" className="text-[13.5px] font-semibold text-[#42506E]">{fr ? 'Prénom' : 'First name'}</Label>
            <Input id="first_name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last_name" className="text-[13.5px] font-semibold text-[#42506E]">{fr ? 'Nom' : 'Last name'}</Label>
            <Input id="last_name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13.5px] font-semibold text-[#42506E]">E-mail</Label>
          <Input id="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          <p className="m-0 text-xs text-[#8A97B2]">{fr ? 'Tu pourras compléter ta candidature maintenant ou cliquer sur « Terminer plus tard » pour recevoir par e-mail un lien pour la reprendre.' : 'You can complete your application now, or click “Finish later” to email yourself a private link to continue.'}</p>
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button onClick={start} disabled={loading || !form.email || !form.first_name || !form.last_name} className="h-12 self-start rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? '…' : (fr ? 'Commencer ma candidature' : 'Start my application')}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the apply page** (apostrophe ASCII; Step 6 fixes)

`app/apply/[slug]/page.tsx`:
```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { Logo } from '@/components/brand/Logo'

// Reads live exchange state (application_open/deadline) via the cookie-less admin
// client, which is otherwise eligible for Next's Data Cache — force dynamic so the
// open/closed state is never served stale.
export const dynamic = 'force-dynamic'

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('name, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()

  const closed = !exchange || !exchange.application_open ||
    (exchange.application_deadline != null && new Date().toISOString().slice(0, 10) > exchange.application_deadline)

  if (!exchange) return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]"><p className="text-[15px] text-[#5B6B8C]">Ce lien de candidature n\'est pas valide.</p></main>
  )
  if (closed) return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchange.name}</h1>
      <p className="text-[15px] text-[#5B6B8C]">Les candidatures sont actuellement fermées pour cet échange.</p>
    </main>
  )
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <div className="mb-[26px]"><Logo href={null} /></div>
      <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">Candidature</span>
      <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchange.name}</h1>
      <ApplicationStartForm slug={slug} />
    </main>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- ApplicationStartForm`
Expected: PASS (1 test).

- [ ] **Step 6: Repair apostrophe, verify**

```bash
python3 - <<'PY'
import pathlib
f = pathlib.Path("app/apply/[slug]/page.tsx")
s = f.read_text().replace("n'est", "n’est")
f.write_text(s)
PY
grep -n "n'est" "app/apply/[slug]/page.tsx" && echo "STILL ASCII — FIX" || echo "apostrophes OK (U+2019)"
```
Expected: `apostrophes OK (U+2019)`.

- [ ] **Step 7: Commit**

```bash
git add "app/apply/[slug]/page.tsx" components/ApplicationStartForm.tsx components/__tests__/ApplicationStartForm.test.tsx
git commit -m "feat(public): restyle application intro (1d) apply/[slug] + start form"
```

---

### Task 9: Cleanup + full-branch gate

**Files:**
- Delete: `app/(organizer)/exchanges/new/page.tsx`

- [ ] **Step 1: Delete the dead exchanges/new redirect stub**

```bash
git rm "app/(organizer)/exchanges/new/page.tsx"
```
(Confirm no references first — expect zero output:)
```bash
grep -rn "exchanges/new" app components lib actions --include=*.ts --include=*.tsx | grep -v node_modules || echo "no references — safe to delete"
```

- [ ] **Step 2: Apostrophe audit across all Phase-6 files**

Run the guard. Any hit that is inside a **French** string must be fixed to U+2019 (re-run the relevant task's python repair). Hits inside **English** copy (e.g. `We've emailed`) or JS are expected and allowed:
```bash
grep -rnP "[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]" \
  "app/(auth)/login/page.tsx" "app/(auth)/signup/page.tsx" "app/(auth)/accept-invite/page.tsx" \
  components/ApplicationForm.tsx components/ApplicationStartForm.tsx components/InviteResponseForm.tsx \
  components/billing/PlanSelector.tsx app/billing/page.tsx \
  "app/apply/[slug]/page.tsx" "app/apply/resume/[token]/page.tsx" "app/invite/[token]/page.tsx" \
  || echo "no letter-apostrophe-letter hits at all"
```
Expected remaining hits: only `We've` in `components/ApplicationForm.tsx` `T.en.remind` (English — allowed). Everything else must be clean.

- [ ] **Step 3: Confirm no migration snuck in (additive gate)**

```bash
git diff --stat origin/main...HEAD -- supabase/migrations && echo "^ must be EMPTY — Phase 6 is additive, no supabase db push"
```
Expected: empty output.

- [ ] **Step 4: Full verification gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
pnpm build   # if .env.local placeholders block build locally, rely on tsc --noEmit + note it
```
Expected: lint clean (only the pre-existing `apple-icon` `<img>` warning); all tests green (prior suite + ~12 new/updated Phase-6 assertions); tsc clean; build passes (public apply/invite/billing pages compile as dynamic `ƒ`).

- [ ] **Step 5: Commit + update the SDD ledger**

```bash
git add "app/(organizer)/exchanges/new/page.tsx"
git commit -m "chore(cleanup): delete dead exchanges/new stub; Phase 6 gate green"
```
Then append a Phase-6 execution entry to `.superpowers/sdd/progress.md` (mark tasks complete, note gate results) and update `memory/project_redesign_phases.md` (Phase 6 status). These are scratch/memory files — do not stage app changes with them.

- [ ] **Step 6: Whole-branch review + merge (per subagent-driven-development / finishing-a-development-branch)**

Dispatch the opus final whole-branch review over the branch range. After it returns "ready to merge" and the user confirms (merge to `main` = Vercel prod deploy), merge `--no-ff`, re-run the gate on merged `main`, push. Additive deploy — **no `supabase db push`**.

---

## Self-Review

**Spec coverage:** 1a Login (Task 2) ✓; 1b Signup (Task 3) ✓; 1c Accept-invite (Task 4) ✓; 1d application form + intro (Tasks 7, 8) ✓; 1e Invite response (Task 5) ✓; 1f Billing (Task 6) ✓; `CenteredCard` primitive (Task 1) ✓; delete dead `exchanges/new` (Task 9) ✓; U+2019 discipline (per-task repair steps + Task 9 audit) ✓; additive/no-migration gate (Task 9 Step 3) ✓; tests per screen (each task) ✓. 1g explicitly out of scope; transactional emails stay English (no email files touched) ✓.

**Type consistency:** `CenteredCard`/`AuthCard` signature `{ maxWidth, className?, children }` used consistently across Tasks 1–6. `InviteResponseForm` prop change `{ token, firstName, exchangeName }` defined in Task 5 and consumed only by its own page (same task). `ApplicationForm` prop change adds `exchangeName`, defined in Task 7 and passed by the resume page (same task). `PlanSelector` default `growth` matches the design's pre-selected middle plan and the app's `DEFAULT_PLAN`.

**Reconciliations flagged for the final review:** (a) billing uses `PLAN_LABEL_FR` (Essentiel/Association/Réseau), not the design's Starter/Growth/Scale — intentional, matches shipped app; (b) 1d spans four files, not the two the spec listed; (c) 1c adds a client `getStudentContext()` fetch for the decorative exchange pill (reuses an existing action; degrades to no pill) — the only new data read in the phase, self-scoped and additive.
