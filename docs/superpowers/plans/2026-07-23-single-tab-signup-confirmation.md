# Single-tab Signup Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orphaned-second-tab organizer signup confirmation with a 6-digit code the user enters in the original tab, minting the session and provisioning the organizer in place before advancing to `/dashboard`.

**Architecture:** After `supabase.auth.signUp`, the signup page swaps its static "check your email" screen for a code-entry step in the same tab. A new server action `confirmSignupCode` verifies the OTP on the SSR server client (writing session cookies), calls the existing idempotent `provisionOrganizer`, and `redirect()`s to `/dashboard` so the cookies flush — mirroring `app/auth/confirm/route.ts`. A `resendSignupCode` action wraps `supabase.auth.resend`. The email-link fallback (`/auth/confirm`) and the entire student invite flow stay untouched. The "Confirm signup" email template gains a prominent `{{ .Token }}` code (a prod-only Management-API config change documented as a runbook note).

**Tech Stack:** Next.js 14 App Router (client component + colocated server actions), Supabase Auth (`verifyOtp` / `resend` email OTP), Tailwind, Vitest + Testing Library.

## Global Constraints

- **French copy only.** The signup surface is hardcoded FR (no i18n extraction — out of scope). All new user-facing strings are French, using typographic apostrophes (`’`) not straight ones.
- **Structured returns for expected failures; never throw.** Prod redacts thrown Server Action error messages. Expected outcomes (wrong/expired code, provision failure, resend failure) are structured `{ ok: false, error: ... }` return values. Only genuinely unexpected failures may throw.
- **Cookie flush requires `redirect()`.** `verifyOtp` persists the session through the `next/headers` cookie store; those writes only flush when Next handles a `redirect()` from `next/navigation`. A returned value would not flush the session. This is the same requirement documented in `app/auth/confirm/route.ts`.
- **`provisionOrganizer` is unchanged and idempotent.** Do not modify `lib/auth/provision.ts`. Code-then-link (or the reverse) must not double-provision — the existing early-return on an existing `users` row already guarantees this.
- **`/auth/confirm` route stays untouched.** It remains the email-link fallback and the student invite path. No edits to `app/auth/confirm/route.ts`.
- **pnpm** is the package manager. Verification commands: `pnpm lint`, `pnpm test`, `pnpm build`.
- **Never `git add -A`/`git add .`** — stage only the named files. Confirm the branch is `feature/single-tab-signup-confirm` before every commit.
- **Test runs sweep sibling worktrees.** If a test failure references a file outside this feature (e.g. `StudentsView`, `parity`, `exchange-color`, shell components), it is a neighbor session's in-flight work — re-run the single file you own before debugging. Scope test runs to your files.

---

### Task 1: Signup confirmation server actions

Two colocated server actions: `confirmSignupCode` (verify OTP → provision → redirect) and `resendSignupCode` (wrap `supabase.auth.resend`). Both return structured results for expected failures. The success path of `confirmSignupCode` never returns — it `redirect()`s.

**Files:**
- Create: `app/(auth)/signup/actions.ts`
- Test: `app/(auth)/signup/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (SSR cookie client — `verifyOtp`/`resend` write session cookies); `provisionOrganizer` from `@/lib/auth/provision` (unchanged, idempotent, returns `{ ok: true } | { ok: false; reason: string }`); `redirect` from `next/navigation`.
- Produces:
  - `type ConfirmSignupResult = { ok: false; error: 'invalid_code' | 'expired' | 'provision_failed' }`
  - `type ResendSignupResult = { ok: true } | { ok: false; error: 'resend_failed' }`
  - `confirmSignupCode(email: string, code: string): Promise<ConfirmSignupResult>` — on success it `redirect('/dashboard')` (returns `never`), so callers only receive a value on failure.
  - `resendSignupCode(email: string): Promise<ResendSignupResult>`

- [ ] **Step 1: Write the failing tests**

Create `app/(auth)/signup/__tests__/actions.test.ts`. Mock style mirrors `app/__tests__/confirm.test.ts` (redirect throws a sentinel so the test can read the destination):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

let verifyResult: { data: { user: unknown }; error: { message?: string; code?: string } | null }
let resendResult: { error: { message?: string } | null }
const verifyOtp = vi.fn(async () => verifyResult)
const resend = vi.fn(async () => resendResult)
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp, resend } }),
}))

const provisionOrganizer = vi.fn(async (_u: unknown) => ({ ok: true }) as { ok: boolean; reason?: string })
vi.mock('@/lib/auth/provision', () => ({ provisionOrganizer: (u: unknown) => provisionOrganizer(u) }))

import { confirmSignupCode, resendSignupCode } from '@/app/(auth)/signup/actions'

async function catchRedirect(fn: () => Promise<unknown>): Promise<string> {
  try { await fn() } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

beforeEach(() => {
  redirect.mockClear(); provisionOrganizer.mockClear(); verifyOtp.mockClear(); resend.mockClear()
  verifyResult = { data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } }, error: null }
  resendResult = { error: null }
})

describe('confirmSignupCode', () => {
  it('verifies the code, provisions, and redirects to /dashboard', async () => {
    const dest = await catchRedirect(() => confirmSignupCode('a@b.com', '123456'))
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'signup' })
    expect(provisionOrganizer).toHaveBeenCalledTimes(1)
    expect(dest).toBe('/dashboard')
  })

  it('returns invalid_code and does not provision on a bad code', async () => {
    verifyResult = { data: { user: null }, error: { message: 'Token has invalid format' } }
    const res = await confirmSignupCode('a@b.com', '000000')
    expect(res).toEqual({ ok: false, error: 'invalid_code' })
    expect(provisionOrganizer).not.toHaveBeenCalled()
  })

  it('returns expired when the code has expired', async () => {
    verifyResult = { data: { user: null }, error: { message: 'Token has expired', code: 'otp_expired' } }
    const res = await confirmSignupCode('a@b.com', '000000')
    expect(res).toEqual({ ok: false, error: 'expired' })
  })

  it('returns provision_failed when provisioning fails', async () => {
    provisionOrganizer.mockResolvedValueOnce({ ok: false, reason: 'profile_insert_failed' })
    const res = await confirmSignupCode('a@b.com', '123456')
    expect(res).toEqual({ ok: false, error: 'provision_failed' })
  })
})

describe('resendSignupCode', () => {
  it('resends the signup code', async () => {
    const res = await resendSignupCode('a@b.com')
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' })
    expect(res).toEqual({ ok: true })
  })

  it('returns resend_failed on error', async () => {
    resendResult = { error: { message: 'rate limited' } }
    const res = await resendSignupCode('a@b.com')
    expect(res).toEqual({ ok: false, error: 'resend_failed' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- app/\(auth\)/signup/__tests__/actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/(auth)/signup/actions'`.

- [ ] **Step 3: Write the implementation**

Create `app/(auth)/signup/actions.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { provisionOrganizer } from '@/lib/auth/provision'

export type ConfirmSignupResult = {
  ok: false
  error: 'invalid_code' | 'expired' | 'provision_failed'
}
export type ResendSignupResult = { ok: true } | { ok: false; error: 'resend_failed' }

// Confirms the 6-digit signup code IN the original tab. verifyOtp writes the
// session cookies to the SSR cookie store (exactly as app/auth/confirm/route.ts
// does), we provision the organizer (idempotent), then redirect() so the cookie
// writes flush onto the response — a returned value would not flush the session.
// Expected failures are structured returns, never thrown, so prod Server Action
// error redaction cannot swallow them.
//
// Implementation note: `type: 'signup'` is the documented type for a signup
// confirmation OTP. If the live project rejects it for a plain 6-digit token,
// fall back to `type: 'email'` (verify against prod during manual verification).
export async function confirmSignupCode(email: string, code: string): Promise<ConfirmSignupResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
  if (error || !data.user) {
    const expired = error?.code === 'otp_expired' || /expire/i.test(error?.message ?? '')
    return { ok: false, error: expired ? 'expired' : 'invalid_code' }
  }
  const result = await provisionOrganizer(data.user)
  if (!result.ok) return { ok: false, error: 'provision_failed' }
  redirect('/dashboard')
}

// Re-sends the signup confirmation email (carrying a fresh code). Relies on
// Supabase's own rate limits plus the client-side cooldown on the page.
export async function resendSignupCode(email: string): Promise<ResendSignupResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { ok: false, error: 'resend_failed' }
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- app/\(auth\)/signup/__tests__/actions.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/(auth)/signup/actions.ts` or its test. (Ignore pre-existing errors in unrelated sibling-worktree files.)

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/signup/actions.ts" "app/(auth)/signup/__tests__/actions.test.ts"
git commit -m "feat(signup): confirmSignupCode + resendSignupCode server actions"
```

---

### Task 2: Signup page code-entry step

Replace the static "Vérifiez votre e-mail" submitted state with an in-place 6-digit code-entry step: shows the target email, a numeric code input, a Confirmer button wired to `confirmSignupCode`, a "Renvoyer le code" link with a client cooldown, and a "Recommencer" escape hatch back to the form. No navigation away from the tab.

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Test: `app/(auth)/__tests__/signup.test.tsx`

**Interfaces:**
- Consumes: `confirmSignupCode`, `resendSignupCode` from `./actions` (Task 1). `confirmSignupCode` resolves to a value only on failure (`{ ok: false, error }`); on success it navigates server-side.
- Produces: no exports consumed by other tasks (leaf UI).

- [ ] **Step 1: Write the failing tests**

Edit `app/(auth)/__tests__/signup.test.tsx`. Add mocks for the server actions (importing the real module would pull in `next/headers` and fail in jsdom), update the existing post-submit assertion to expect the code step, and add two new tests. Full updated file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

const confirmSignupCode = vi.fn(async (_email: string, _code: string) => ({ ok: false, error: 'invalid_code' as const }))
const resendSignupCode = vi.fn(async (_email: string) => ({ ok: true as const }))
vi.mock('@/app/(auth)/signup/actions', () => ({ confirmSignupCode, resendSignupCode }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => { signUp.mockClear(); confirmSignupCode.mockClear(); resendSignupCode.mockClear() })

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
  await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
  await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
}

describe('SignupPage (French)', () => {
  it('does not render an Établissement field', () => {
    render(<SignupPage />)
    expect(screen.queryByLabelText(/établissement/i)).toBeNull()
  })

  it('submits signUp with only the full name and shows the code step', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(await screen.findByLabelText(/code de confirmation/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/^e-mail/i), 'a@b')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/adresse e-mail valide/i)).toBeInTheDocument()
  })

  it('submits the 6-digit code to confirmSignupCode', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)
    await user.type(await screen.findByLabelText(/code de confirmation/i), '123456')
    await user.click(screen.getByRole('button', { name: /confirmer/i }))
    expect(confirmSignupCode).toHaveBeenCalledWith('jane@example.com', '123456')
  })

  it('renders a structured error inline when the code is wrong', async () => {
    confirmSignupCode.mockResolvedValueOnce({ ok: false, error: 'invalid_code' })
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)
    await user.type(await screen.findByLabelText(/code de confirmation/i), '000000')
    await user.click(screen.getByRole('button', { name: /confirmer/i }))
    expect(await screen.findByText(/code incorrect/i)).toBeInTheDocument()
  })
})
```

Note: the email-field matcher is `/^e-mail/i` (anchored) so it does not also match the "Vérifiez votre e-mail" heading text — though `getByLabelText` only matches labelled controls, anchoring keeps intent explicit.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- app/\(auth\)/__tests__/signup.test.tsx`
Expected: FAIL — the code step (`/code de confirmation/i` label) does not exist yet; the two new tests and the updated post-submit assertion fail.

- [ ] **Step 3: Implement the code-entry step**

Rewrite `app/(auth)/signup/page.tsx`. Changes from the current file: add `useEffect` import; import the two actions; add `confirmEmail`, `code`, `codeError`, `verifying`, `cooldown`, `resendNote` state; on successful `signUp` store the normalized email and start the cooldown; replace the `if (submitted)` block with the code-entry step; add the three handlers and the cooldown effect. Full file:

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { confirmSignupCode, resendSignupCode } from './actions'

const RESEND_COOLDOWN = 45

const CODE_ERRORS: Record<'invalid_code' | 'expired' | 'provision_failed', string> = {
  invalid_code: 'Code incorrect. Vérifiez les 6 chiffres et réessayez.',
  expired: 'Ce code a expiré. Demandez-en un nouveau.',
  provision_failed: 'Une erreur est survenue lors de la création de votre compte. Réessayez.',
}

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [resendNote, setResendNote] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!submitted) return
    const t = setInterval(() => setCooldown(c => (c <= 0 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [submitted])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = fullName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name) { setError('Veuillez remplir tous les champs.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    setConfirmEmail(cleanEmail)
    setCooldown(RESEND_COOLDOWN)
    setSubmitted(true)
    setLoading(false)
  }

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault()
    setCodeError(null)
    if (code.length !== 6) { setCodeError('Saisissez le code à 6 chiffres.'); return }
    setVerifying(true)
    const res = await confirmSignupCode(confirmEmail, code)
    // Success redirects server-side; only failures resolve to a value here.
    if (res && !res.ok) {
      setCodeError(CODE_ERRORS[res.error] ?? CODE_ERRORS.invalid_code)
      setVerifying(false)
    }
  }

  async function handleResend() {
    setCodeError(null)
    setResendNote(null)
    const res = await resendSignupCode(confirmEmail)
    if (res.ok) {
      setResendNote('Un nouveau code a été envoyé.')
      setCooldown(RESEND_COOLDOWN)
    } else {
      setCodeError('Impossible de renvoyer le code pour le moment. Réessayez dans un instant.')
    }
  }

  function handleRestart() {
    setSubmitted(false)
    setCode('')
    setCodeError(null)
    setResendNote(null)
    setVerifying(false)
    setCooldown(0)
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
        <Logo href="/" />
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Vérifiez votre e-mail</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Nous avons envoyé un code à 6 chiffres à{' '}
            <span className="font-semibold text-[#10203F]">{confirmEmail}</span>. Saisissez-le
            ci-dessous pour finaliser la création de votre compte.
          </p>
          <form onSubmit={handleConfirmCode} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code" className="text-[13px] font-semibold text-[#42506E]">Code de confirmation</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="h-11 rounded-[10px] border-[#C4CDE0] text-center font-mono text-lg tracking-[0.4em]"
              />
            </div>
            {codeError && <p className="text-sm text-[#C0392B]">{codeError}</p>}
            <Button type="submit" disabled={verifying || code.length !== 6} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
              {verifying ? 'Vérification…' : 'Confirmer'}
            </Button>
          </form>
          <div className="flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="font-medium text-[#2456E6] hover:underline disabled:cursor-not-allowed disabled:text-[#8A97B2] disabled:no-underline"
            >
              {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : 'Renvoyer le code'}
            </button>
            <button type="button" onClick={handleRestart} className="font-medium text-[#8A97B2] hover:text-[#42506E] hover:underline">
              Recommencer
            </button>
          </div>
          {resendNote && <p className="m-0 text-[13px] font-medium text-[#22A06B]">{resendNote}</p>}
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EEF1F7] px-4 py-10">
      <div className="flex w-full max-w-[860px] flex-col items-center gap-[60px] md:flex-row md:items-center">
        <div className="flex w-full flex-col gap-5 md:w-[340px]">
          <Logo href="/" />
          <h3 className="m-0 font-display text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-[#10203F]">Organisez vos échanges scolaires facilement.</h3>
          <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">Candidatures, formulaires et dossiers élèves — au même endroit, pour les deux établissements.</p>
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">ESSAI GRATUIT · 1 ÉCHANGE</span>
        </div>
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <h3 className="m-0 mb-1 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Créer votre compte</h3>
          <GoogleButton intent="organizer_signup" next="/dashboard" label="S’inscrire avec Google" />
          <div className="flex items-center gap-3.5 font-mono text-xs font-medium text-[#8A97B2]">
            <span className="flex-1 border-t border-[#E4E9F2]" />ou<span className="flex-1 border-t border-[#E4E9F2]" />
          </div>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
              <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
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
          <p className="m-0 text-center text-xs leading-[1.5] text-[#8A97B2]">
            En créant un compte, vous acceptez nos{' '}
            <Link href="/legal/cgu" className="font-medium text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
              CGU
            </Link>{' '}
            et notre{' '}
            <Link href="/legal/confidentialite" className="font-medium text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
              Politique de confidentialité
            </Link>
            .
          </p>
        </AuthCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- app/\(auth\)/__tests__/signup.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `app/(auth)/signup/page.tsx`. (Ignore pre-existing errors in unrelated sibling-worktree files.)

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/signup/page.tsx" "app/(auth)/__tests__/signup.test.tsx"
git commit -m "feat(signup): single-tab 6-digit code confirmation step"
```

---

### Task 3: Confirm-signup email template runbook note

The email template change (surfacing `{{ .Token }}` in the "Confirm signup" template) is a **prod-only Management-API config change, not code** — it cannot run on staging (default templates, no email). The committable deliverable is a runbook note in `docs/DEPLOY.md`, placed next to the existing "Invite email template" section, so the manual step is documented for the post-deploy apply.

**Files:**
- Modify: `docs/DEPLOY.md` (insert a new subsection after the "Invite email template" section, before "### Other manual dashboard steps (pointers)")

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Add the runbook subsection**

In `docs/DEPLOY.md`, immediately before the line `### Other manual dashboard steps (pointers)`, insert:

```markdown
### Confirm signup email template (6-digit code, single-tab flow)

Organizer signup confirmation is a **6-digit code entered in the original tab**
(`app/(auth)/signup/page.tsx` → `confirmSignupCode`), not a link that opens a new
tab. The **Confirm signup** template MUST surface `{{ .Token }}` as the dominant
CTA, keeping the `/auth/confirm` link only as a small fallback for anyone who
closes the signup tab:

​```html
<h2>Confirmez votre inscription</h2>
<p>Votre code de confirmation :</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0;">{{ .Token }}</p>
<p>Saisissez ce code dans l’onglet où vous vous êtes inscrit·e.</p>
<hr style="border:none;border-top:1px solid #E4E9F2;margin:24px 0;">
<p style="font-size:13px;color:#8A97B2;">
  Vous avez fermé cet onglet ?
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">Confirmez ici</a>.
</p>
​```

Apply via the Management API (Supabase PAT in `$SUPABASE_PAT`; Cloudflare blocks
the python-urllib UA, so force a curl UA). The confirmation template field is
`mailer_templates_confirmation_content`:

​```bash
curl -A curl/8.0 -X PATCH \
  "https://api.supabase.com/v1/projects/rgisrqlbcjdoetoybaqd/config/auth" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"mailer_templates_confirmation_content": "<the HTML above, JSON-escaped>"}'
​```

- **Prod-only, manually verified:** staging uses Supabase default templates and
  sends no email, so this change cannot be exercised on previews.
- **Fallback stays load-bearing:** the `/auth/confirm?...&type=signup` link must
  remain in the template — it is the escape hatch for a closed signup tab, and it
  is exercised by `app/auth/confirm/route.ts` (unchanged).
- **`type: 'signup'` caveat:** if `confirmSignupCode`'s `verifyOtp({ type: 'signup' })`
  is rejected for a plain 6-digit token on the live project, switch it to
  `type: 'email'` (see the note in `app/(auth)/signup/actions.ts`).
```

(The `​` zero-width characters shown before the triple backticks above are only to
keep this plan's fenced block intact — when editing `docs/DEPLOY.md`, write plain
```` ``` ```` fences with no zero-width prefix.)

- [ ] **Step 2: Verify the section reads correctly**

Run: `grep -n "Confirm signup email template" docs/DEPLOY.md`
Expected: one match, inside section 5's manual-steps area, before "Other manual dashboard steps (pointers)".

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): confirm-signup 6-digit code email template runbook"
```

---

## Final verification (after all tasks)

- [ ] **Full gate.** Run in order; all must pass:
  - `pnpm lint`
  - `pnpm test` — the whole suite. If a failure references a file outside this feature (sibling-worktree churn), re-run only the two files you own: `pnpm test -- app/\(auth\)/signup/__tests__/actions.test.ts app/\(auth\)/__tests__/signup.test.tsx`.
  - `pnpm build`
- [ ] **No RLS/migration surface.** This feature adds no migration, table, bucket, or RLS policy — `pnpm test:rls` is not required.

## Manual verification (prod, post-deploy — cannot run on staging)

Staging sends no email, so this is prod-only with a fresh `+alias`:

1. Apply the "Confirm signup" template change (Task 3 runbook) via the Management API.
2. Sign up at `/signup` with `you+code1@…` → confirm the 6-digit code email arrives.
3. Enter the code in the **same tab** → land on `/dashboard` with no second tab spawned.
4. Fresh signup `you+code2@…` → instead of the code, click the fallback `/auth/confirm` link → confirm it still lands on `/dashboard` (regression check on the untouched route).
5. On the code step, exercise "Renvoyer le code" (cooldown resets) and "Recommencer" (returns to the form).

## Self-Review (completed against the spec)

- **Component 1 (email template):** Task 3. ✅
- **Component 2 (signup page code step — email shown, 6-digit input, resend w/ cooldown, recommencer, no navigation):** Task 2. ✅
- **Component 3 (`confirmSignupCode`: verifyOtp on SSR client → provisionOrganizer → `redirect('/dashboard')`; structured `invalid_code`/`expired`/`provision_failed`):** Task 1. ✅
- **Component 4 (`resendSignupCode` wrapping `auth.resend`, structured return):** Task 1. ✅
- **Component 5 (`/auth/confirm` untouched):** enforced by Global Constraints; no task modifies it. ✅
- **Tests (extend `signup.test.tsx`; new `confirmSignupCode` + `resendSignupCode` unit tests mirroring `confirm.test.ts`):** Tasks 1 & 2. ✅
- **Out of scope (password reset, invite flow, i18n):** untouched. The BACKLOG "password reset flow (with code entry)" line was already added with the spec commit — verified present, no task needed. ✅
- **Placeholder scan:** none — every code/test/doc step carries full content.
- **Type consistency:** `ConfirmSignupResult` / `ResendSignupResult` names and the `invalid_code | expired | provision_failed` union match between Task 1 (definition) and Task 2 (`CODE_ERRORS` keys + mock return types).
```
