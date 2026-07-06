# UI Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a batch of small, independent UI/copy fixes across the landing page, login, invite modal, dashboard, forms/docs shell, billing, and email — no schema changes, no migrations, no new routes.

**Architecture:** Pure presentation/copy edits plus one derived-count pass-through on the dashboard. All strings that already live in dedicated content/display modules stay there; new strings join them. Every change extends an existing unit test.

**Tech Stack:** Next.js 14 App Router, React client components, Tailwind, shadcn/ui, Vitest + Testing Library, Resend (email HTML).

## Global Constraints

- Package manager is **pnpm** (never npm).
- **French copy uses typographic apostrophes** `’` (U+2019), never `'`. This is asserted by `lib/landing/__tests__/content.test.ts`. Non-breaking spaces before `?`/`:` and inside labels use `&nbsp;` in JSX.
- **No migrations, no new env vars, no new routes.** Server-action surface is unchanged except the dashboard already passes `templates`.
- **Email HTML must escape all user-supplied values** (already done via `esc()` — do not regress).
- **Never log student/parent PII.**
- Verify each task with: `pnpm lint`, `pnpm test` (vitest), `npx tsc --noEmit`. `pnpm build` fails locally on placeholder env — use `tsc --noEmit` for type-checking per project convention.
- This work runs on its own branch, one execution at a time. Commit after each task.

---

### Task 1: Landing content — 5 steps, reminder shape, copy changes

**Files:**
- Modify: `lib/landing/content.ts`
- Test: `lib/landing/__tests__/content.test.ts`

**Interfaces:**
- Produces: `LandingContent['how']` now has shape `{ eyebrow: string; title: string; steps: {n,title,body}[]; reminder: { eyebrow: string; note: string; sender: string; subject: string; checklist: string[]; deadline: string } }`. The old `how.note: string` field is **removed** (its sentence moves into `how.reminder.note`). `how.steps` now has **5** entries. Task 2's `HowItWorks` consumes `how.reminder` and renders 5 steps.

- [ ] **Step 1: Update the `how` type in the `LandingContent` interface**

In `lib/landing/content.ts`, replace the `how` line in the interface (currently):
```ts
  how: { eyebrow: string; title: string; steps: { n: string; title: string; body: string }[]; note: string }
```
with:
```ts
  how: {
    eyebrow: string
    title: string
    steps: { n: string; title: string; body: string }[]
    reminder: {
      eyebrow: string
      note: string
      sender: string
      subject: string
      checklist: string[]
      deadline: string
    }
  }
```

- [ ] **Step 2: Rewrite the FR `how` block (5 steps + reminder)**

In the `fr` object, replace the entire `how: { … }` block with:
```ts
    how: {
      eyebrow: "Comment ça marche",
      title: "Cinq étapes, aucune relance oubliée.",
      steps: [
        { n: "01", title: "Envoyez", body: "Diffusez la candidature via un lien unique." },
        { n: "02", title: "Sélectionnez", body: "Étudiez les candidats et acceptez ou refusez." },
        { n: "03", title: "Préparez", body: "Créez vos demandes de documents et formulaires en quelques clics." },
        { n: "04", title: "Collectez", body: "Recevez formulaires et documents des élèves acceptés." },
        { n: "05", title: "Validez", body: "Vérifiez et validez le dossier complet." },
      ],
      reminder: {
        eyebrow: "Relances automatiques",
        note: "À chaque étape, les élèves sont relancés automatiquement — avec la liste précise de ce qui manque et des échéances claires.",
        sender: "EazyExchange",
        subject: "Il te manque 2 documents",
        checklist: ["Autorisation parentale", "Copie du passeport"],
        deadline: "Échéance : 15 mars",
      },
    },
```

- [ ] **Step 3: Rewrite the EN `how` block (5 steps + reminder)**

In the `en` object, replace the entire `how: { … }` block with:
```ts
    how: {
      eyebrow: "How it works",
      title: "Five steps, no follow-up forgotten.",
      steps: [
        { n: "01", title: "Send", body: "Share the application via a unique link." },
        { n: "02", title: "Review", body: "Review applicants and accept or decline." },
        { n: "03", title: "Prepare", body: "Create your document and form requests in a few clicks." },
        { n: "04", title: "Collect", body: "Receive forms and documents from accepted students." },
        { n: "05", title: "Approve", body: "Check and approve the completed file." },
      ],
      reminder: {
        eyebrow: "Automatic reminders",
        note: "At every step, students are reminded automatically — with the exact list of what’s missing and clear deadlines.",
        sender: "EazyExchange",
        subject: "You’re missing 2 documents",
        checklist: ["Parental authorization", "Passport copy"],
        deadline: "Deadline: March 15",
      },
    },
```

- [ ] **Step 4: Apply the EN features-title copy change**

In the `en` object, `features.title` currently:
```ts
      title: "The whole student file, in one place.",
```
change to:
```ts
      title: "The entire student file, in one place.",
```
(FR `features.title` « Tout le dossier de l’élève, au même endroit. » stays unchanged.)

- [ ] **Step 5: Apply the CTA copy changes (both languages)**

In the `fr` object, `cta`:
```ts
    cta: {
      title: "Prêt à simplifier votre prochain échange ?",
      body: "Votre premier échange est offert — testez Eazyexchange sur un échange complet. Sans carte bancaire, sans engagement.",
      primary: "Démarrer gratuitement",
    },
```
In the `en` object, `cta`:
```ts
    cta: {
      title: "Ready to simplify your next exchange?",
      body: "Your first exchange is on us — try Eazyexchange across a full exchange. No credit card, no commitment.",
      primary: "Start free",
    },
```

- [ ] **Step 6: Update the content test for 5 steps and the reminder shape**

In `lib/landing/__tests__/content.test.ts`, change the two `how.steps` length assertions from `4` to `5`:
```ts
    expect(fr.how.steps).toHaveLength(5)
    expect(en.how.steps).toHaveLength(5)
```
Then add, inside the first `it('fr and en share the same shape', …)` block, before its closing brace:
```ts
    expect(Object.keys(fr.how.reminder).sort()).toEqual(Object.keys(en.how.reminder).sort())
    expect(fr.how.reminder.checklist).toHaveLength(2)
    expect(en.how.reminder.checklist).toHaveLength(2)
```

- [ ] **Step 7: Run the content test**

Run: `pnpm test -- lib/landing/__tests__/content.test.ts`
Expected: PASS (shape + apostrophe tests green).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (If `HowItWorks.tsx` errors on `how.note`, that is fixed in Task 2 — you may see it here; proceed to Task 2 before committing if so. To keep this task self-contained, temporarily leave `how.note` out and accept the transient tsc error, or run Task 2's HowItWorks edit in the same commit. Recommended: commit content.ts + test here and immediately do Task 2.)

- [ ] **Step 9: Commit**

```bash
git add lib/landing/content.ts lib/landing/__tests__/content.test.ts
git commit -m "feat(landing): 5-step how-it-works content + reminder-preview strings + CTA/features copy"
```

---

### Task 2: Landing components — language dropdown, 5-col steps, reminder preview

**Files:**
- Modify: `components/landing/LandingNav.tsx`
- Modify: `components/landing/HowItWorks.tsx`
- Test: `components/landing/__tests__/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `how.reminder` and 5-entry `how.steps` from Task 1; existing `nav`, `lang`, `setLanguage` props.
- `CtaBand.tsx` needs **no change** — its copy comes from `content.ts` (Task 1).

- [ ] **Step 1: Replace the language toggle with a dropdown in `LandingNav`**

Rewrite `components/landing/LandingNav.tsx` in full:
```tsx
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo'
import type { Lang, LandingContent } from '@/lib/landing/content'

export function LandingNav({
  nav,
  lang,
  setLanguage,
}: {
  nav: LandingContent['nav']
  lang: Lang
  setLanguage: (l: Lang) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(l: Lang) {
    setLanguage(l)
    setOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#EEF1F7] bg-white/[.86] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[18px] font-bold text-[#10203F]">Eazyexchange</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-7">
          <a
            href="#features"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.features}
          </a>
          <Link
            href="/login"
            className="hidden text-[14px] font-medium text-[#42506E] hover:text-[#10203F] sm:inline"
          >
            {nav.login}
          </Link>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Changer de langue"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[12px] font-semibold uppercase text-[#5B6B8C] hover:bg-[#F1F4F9] hover:text-[#10203F]"
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
              </svg>
              {lang}
              <span aria-hidden className="text-[9px]">▾</span>
            </button>
            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-[10px] border border-[#E4E9F2] bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick('fr')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'fr' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  Français
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick('en')}
                  className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[#F1F4F9] ${lang === 'en' ? 'font-semibold text-[#10203F]' : 'text-[#5B6B8C]'}`}
                >
                  English
                </button>
              </div>
            )}
          </div>
          <Link
            href="/signup"
            className="rounded-lg bg-[#10203F] px-[18px] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            {nav.demo}
          </Link>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Rewrite `HowItWorks` — 5-col grid + reminder preview block**

Rewrite `components/landing/HowItWorks.tsx` in full:
```tsx
import type { LandingContent } from '@/lib/landing/content'

export function HowItWorks({ how }: { how: LandingContent['how'] }) {
  return (
    <section className="mx-auto max-w-[1180px] px-6 pb-20 sm:px-10">
      <p className="mb-4 font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-[#2456E6]">
        {how.eyebrow}
      </p>
      <h2 className="mb-10 max-w-[640px] font-display text-[34px] font-bold leading-[1.1] tracking-[-.02em] text-[#10203F]">
        {how.title}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {how.steps.map((st) => (
          <div key={st.n} className="border-t-2 border-[#2456E6] pt-[18px]">
            <p className="mb-3.5 font-mono text-[13px] font-semibold text-[#9AA6C0]">{st.n}</p>
            <h3 className="mb-2 font-display text-[18px] font-semibold text-[#10203F]">{st.title}</h3>
            <p className="text-[14px] leading-[1.55] text-[#5B6B8C]">{st.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid items-center gap-8 rounded-[16px] border border-[#E4E9F2] bg-[#F5F7FC] px-[30px] py-[28px] md:grid-cols-2">
        <div>
          <p className="mb-2.5 font-mono text-[12px] font-semibold uppercase tracking-[.12em] text-[#2456E6]">
            {how.reminder.eyebrow}
          </p>
          <p className="max-w-[420px] text-[15px] font-medium leading-[1.55] text-[#10203F]">
            {how.reminder.note}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#E4E9F2] bg-white p-[18px] shadow-[0_10px_30px_-18px_rgba(16,32,63,.4)]">
          <div className="flex items-center gap-2.5 border-b border-[#EEF1F7] pb-3">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#2456E6] text-[12px] font-bold text-white" aria-hidden>
              E
            </span>
            <span className="font-display text-[14px] font-bold text-[#10203F]">{how.reminder.sender}</span>
          </div>
          <p className="mt-3 text-[14px] font-semibold text-[#10203F]">{how.reminder.subject}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {how.reminder.checklist.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-[#5B6B8C]">
                <span aria-hidden className="text-[14px] leading-none text-[#9AA6C0]">☐</span>
                {item}
              </li>
            ))}
          </ul>
          <span className="mt-4 inline-block rounded-full bg-[#EEF3FF] px-3 py-1 font-mono text-[11px] font-semibold text-[#2456E6]">
            {how.reminder.deadline}
          </span>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Update the LandingPage tests for the dropdown + 5 steps**

In `components/landing/__tests__/LandingPage.test.tsx`, replace the second test (`switches to English and persists the choice`) with:
```ts
  it('switches to English via the language dropdown and persists the choice', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /changer de langue/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Stop chasing')
    expect(window.localStorage.getItem('ee_lang')).toBe('en')
  })

  it('the language menu opens and lists both languages', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /changer de langue/i }))
    expect(screen.getByRole('menuitem', { name: 'Français' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'English' })).toBeInTheDocument()
  })
```
Leave the other tests (French default, hydrate stored, CTA links, features anchor) unchanged.

- [ ] **Step 4: Run the landing tests**

Run: `pnpm test -- components/landing/__tests__/LandingPage.test.tsx lib/landing/__tests__/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS (no `how.note` reference remains).

- [ ] **Step 6: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/HowItWorks.tsx components/landing/__tests__/LandingPage.test.tsx
git commit -m "feat(landing): quiet language dropdown, 5-col steps, reminder-email preview block"
```

---

### Task 3: Browser tab title

**Files:**
- Modify: `app/layout.tsx:27`

- [ ] **Step 1: Shorten the root metadata title**

In `app/layout.tsx`, change:
```ts
  title: 'EazyExchange — Every student, cleared for departure',
```
to:
```ts
  title: 'EazyExchange',
```
Leave `description`, `metadataBase`, and `app/page.tsx`'s own SEO title untouched.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "chore(landing): shorten browser tab title to EazyExchange"
```

---

### Task 4: Login page reorder + placeholders/icons + signup link; Google account picker

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `components/auth/GoogleButton.tsx`
- Test: `app/(auth)/__tests__/login.test.tsx`
- Test: `components/auth/__tests__/GoogleButton.test.tsx`

**Interfaces:**
- `GoogleButton` gains `queryParams: { prompt: 'select_account' }` on its `signInWithOAuth` options; shared by login and signup.

- [ ] **Step 1: Add the account-picker param to `GoogleButton`**

In `components/auth/GoogleButton.tsx`, change the `signInWithOAuth` call:
```ts
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
```
to:
```ts
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
```

- [ ] **Step 2: Assert the picker param in the GoogleButton test**

In `components/auth/__tests__/GoogleButton.test.tsx`, add inside the first `it` block (after the existing `redirectTo` assertion):
```ts
    expect(arg.options.queryParams).toEqual({ prompt: 'select_account' })
```

- [ ] **Step 3: Run the GoogleButton test**

Run: `pnpm test -- components/auth/__tests__/GoogleButton.test.tsx`
Expected: PASS.

- [ ] **Step 4: Rewrite the login page (form-first, placeholders + icons, signup link)**

Rewrite `app/(auth)/login/page.tsx` in full:
```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Lock } from 'lucide-react'
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
      setError('Ce lien d’invitation est invalide ou a expiré — demandez à votre organisateur de vous le renvoyer.')
    } else if (err === 'signup_failed') {
      setError('Nous n’avons pas pu terminer la création de votre compte. Réessayez de vous inscrire.')
    } else if (err === 'oauth_failed') {
      setError('La connexion avec Google a échoué. Veuillez réessayer.')
    } else if (err === 'not_invited') {
      setError('Nous n’avons pas pu associer votre compte Google à une invitation. Utilisez l’adresse e-mail avec laquelle vous avez été invité, ou définissez un mot de passe depuis votre lien d’invitation.')
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

      <form onSubmit={handleLogin} className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="sr-only">Adresse e-mail</Label>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8A97B2]" />
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="Adresse e-mail"
              className="h-[50px] rounded-[11px] border-[#C4CDE0] pl-11 text-base" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="sr-only">Mot de passe</Label>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8A97B2]" />
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Mot de passe"
              className="h-[50px] rounded-[11px] border-[#C4CDE0] pl-11 text-base" />
          </div>
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading}
          className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-[17px] font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <div className="flex items-center gap-3.5 font-mono text-[13px] font-medium text-[#8A97B2]">
        <span className="flex-1 border-t border-[#E4E9F2]" />ou continuer avec<span className="flex-1 border-t border-[#E4E9F2]" />
      </div>
      <GoogleButton label="Google" />

      <p className="text-center text-sm text-[#5B6B8C]">
        Pas encore de compte&nbsp;?{' '}
        <Link href="/signup" className="font-semibold text-[#2456E6] hover:underline">Créer un compte</Link>
      </p>
    </CenteredCard>
  )
}
```

- [ ] **Step 5: Add login-page tests for the separator copy and signup link**

In `app/(auth)/__tests__/login.test.tsx`, add a new `describe` block after the existing one:
```ts
describe('LoginPage layout', () => {
  it('shows the "ou continuer avec" separator and a Google button labelled Google', () => {
    window.history.pushState({}, '', '/login')
    render(<LoginPage />)
    expect(screen.getByText(/ou continuer avec/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument()
  })
  it('links to the signup page', () => {
    window.history.pushState({}, '', '/login')
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: /Créer un compte/i })).toHaveAttribute('href', '/signup')
  })
})
```

- [ ] **Step 6: Run the login tests**

Run: `pnpm test -- "app/(auth)/__tests__/login.test.tsx"`
Expected: PASS. (The existing error-banner tests still pass — the email/password inputs still carry `id`/`htmlFor` wiring and the error `<p>` is unchanged.)

- [ ] **Step 7: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(auth)/login/page.tsx" components/auth/GoogleButton.tsx "app/(auth)/__tests__/login.test.tsx" components/auth/__tests__/GoogleButton.test.tsx
git commit -m "feat(auth): login form-first with icon placeholders + signup link; Google account picker"
```

---

### Task 5: Invite modal — inline close warning

**Files:**
- Modify: `components/dashboard/InviteModal.tsx`
- Test: `components/dashboard/__tests__/InviteModal.test.tsx`

**Interfaces:**
- The `confirmingClose` full-screen branch is deleted. The link step stays rendered; an amber strip appears inline on a close attempt when the link has not been copied. State variable `confirmingClose` is renamed `showCloseWarning`.

- [ ] **Step 1: Replace the confirming-close branch with an inline strip**

In `components/dashboard/InviteModal.tsx`:

(a) Rename the state (line 29):
```ts
  const [confirmingClose, setConfirmingClose] = useState(false)
```
→
```ts
  const [showCloseWarning, setShowCloseWarning] = useState(false)
```

(b) Update the reset effect (line ~38) — change `setConfirmingClose(false)` to `setShowCloseWarning(false)`.

(c) Replace `requestClose` (currently lines 65-71):
```ts
  function requestClose() {
    if (step === 'link' && !confirmingClose) {
      setConfirmingClose(true)
      return
    }
    close()
  }
```
with:
```ts
  function requestClose() {
    if (step === 'link' && !copied && !showCloseWarning) {
      setShowCloseWarning(true)
      return
    }
    close()
  }
```

(d) Update `copy()` so a successful copy clears the warning (append `setShowCloseWarning(false)` in the try after `setCopied(true)`):
```ts
  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setShowCloseWarning(false)
    } catch {
      /* best-effort: field is selectable for manual copy */
    }
  }
```

(e) Delete the entire `confirmingClose ?` branch of the render (currently lines 114-132, the `<> … Avez-vous copié le lien ? … </>` block) so the ternary collapses from three-way to two-way: `step === 'deadline' ? (…deadline…) : (…link…)`. That is, change:
```tsx
        {step === 'deadline' ? (
          <>
            … deadline …
          </>
        ) : confirmingClose ? (
          <>
            … Avez-vous copié le lien ? full-screen branch …
          </>
        ) : (
          <>
            … link step …
          </>
        )}
```
to a two-branch ternary (`step === 'deadline' ? (…) : (…link…)`), and inside the **link** branch replace the footer (currently lines 158-162):
```tsx
            <div className="mt-1.5 flex justify-end">
              <Button type="button" onClick={requestClose}>
                Fermer
              </Button>
            </div>
```
with an inline warning strip above the button:
```tsx
            {showCloseWarning && (
              <div className="mt-3 rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">
                Vous ne reverrez plus ce lien — copiez-le avant de fermer.
              </div>
            )}
            <div className="mt-1.5 flex justify-end">
              <Button type="button" onClick={requestClose}>
                {showCloseWarning ? 'Fermer quand même' : 'Fermer'}
              </Button>
            </div>
```

- [ ] **Step 2: Rewrite the InviteModal close tests**

In `components/dashboard/__tests__/InviteModal.test.tsx`, replace the last two tests (`closing from the link step shows a warning, then closes on confirm` and `cancelling the warning keeps the modal on the link step`) with:
```ts
  it('closing the link step without copying shows an inline warning, then closes on the second attempt', async () => {
    const onOpenChange = setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await screen.findByDisplayValue(/\/apply\/france-canada$/)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.getByText(/Vous ne reverrez plus ce lien/)).toBeInTheDocument()
    // The link stays visible (inline warning, not a separate screen).
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer quand même' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes immediately without warning once the link is copied', async () => {
    const onOpenChange = setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await screen.findByDisplayValue(/\/apply\/france-canada$/)

    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    await screen.findByRole('button', { name: /Copié/ })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
```

- [ ] **Step 3: Run the InviteModal test**

Run: `pnpm test -- components/dashboard/__tests__/InviteModal.test.tsx`
Expected: PASS.

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS (no `confirmingClose` reference remains).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/InviteModal.tsx components/dashboard/__tests__/InviteModal.test.tsx
git commit -m "feat(invite): inline close warning on the link step instead of a separate screen"
```

---

### Task 6: Dashboard — "no active forms" action card

**Files:**
- Modify: `lib/dashboard/rollup.ts` (`ActionCard` type + `actionCards`)
- Modify: `components/dashboard/OverviewView.tsx`
- Test: `lib/dashboard/__tests__/rollup.test.ts`
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- `ActionCard` gains an optional `href?: string`. When set, `OverviewView` renders the CTA as a link (to `href`) instead of a filter button.
- `actionCards(phase, apps, rollups, activeTemplateCount?: number)` — the new 4th param. When `activeTemplateCount === 0`, a card `{ title: 'Aucun formulaire actif', …, filterKey: 'noforms', href: '/forms' }` is prepended. `undefined` (existing 3-arg callers) never shows it.
- `OverviewView` derives `activeTemplateCount` from its existing `templates` prop (which `getExchangeGrid` already filters to `status='active'`, so `templates.length` is the active count). The `/dashboard` page needs **no change**.

- [ ] **Step 1: Extend the `ActionCard` type**

In `lib/dashboard/rollup.ts`, change the type (line 18):
```ts
export type ActionCard = { title: string; desc: string; cta: string; tone: 'accent' | 'warn' | 'bad'; filterKey: string }
```
to:
```ts
export type ActionCard = { title: string; desc: string; cta: string; tone: 'accent' | 'warn' | 'bad'; filterKey: string; href?: string }
```

- [ ] **Step 2: Prepend the no-forms card in `actionCards`**

In `lib/dashboard/rollup.ts`, change the `actionCards` signature and add the card at the top (before the `if (phase === 1)` block):
```ts
export function actionCards(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[], activeTemplateCount?: number): ActionCard[] {
  const cards: ActionCard[] = []
  if (activeTemplateCount === 0) {
    cards.push({
      title: 'Aucun formulaire actif',
      desc: 'Préparez les documents et formulaires à demander aux familles.',
      cta: 'Préparer les formulaires', tone: 'accent', filterKey: 'noforms', href: '/forms',
    })
  }
  if (phase === 1) {
```
Leave the rest of the function body unchanged (both the phase-1 early `return cards` and the phase-2 fall-through already build on this `cards` array).

- [ ] **Step 3: Add rollup tests for the new card**

In `lib/dashboard/__tests__/rollup.test.ts`, inside the `describe('copy builders', …)` block, add:
```ts
  it('prepends the no-active-forms card when activeTemplateCount is 0 (phase 1)', () => {
    const cards = actionCards(1, [app('submitted')], [], 0)
    expect(cards[0].title).toBe('Aucun formulaire actif')
    expect(cards[0].href).toBe('/forms')
    expect(cards.some(c => c.title === '1 candidature à examiner')).toBe(true)
  })
  it('prepends the no-active-forms card when activeTemplateCount is 0 (phase 2)', () => {
    expect(actionCards(2, [], [], 0).map(c => c.title)).toEqual(['Aucun formulaire actif'])
  })
  it('omits the no-active-forms card when at least one template is active', () => {
    expect(actionCards(1, [], [], 3)).toEqual([])
    expect(actionCards(2, [], [])).toEqual([])
  })
```

- [ ] **Step 4: Run the rollup test**

Run: `pnpm test -- lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS (existing 3-arg `actionCards` assertions stay green because `activeTemplateCount` is `undefined`).

- [ ] **Step 5: Pass `activeTemplateCount` and render href cards in `OverviewView`**

In `components/dashboard/OverviewView.tsx`:

(a) Change the `actionCards` call (line 92):
```ts
  const cards = actionCards(phase, apps, rollups)
```
→
```ts
  const cards = actionCards(phase, apps, rollups, templates.length)
```

(b) In the action-card render (the `cards.map((card) => …)` block, lines 256-270), replace the fixed filter `<button>` with a conditional link/button. Change the inner CTA element from:
```tsx
                  <button
                    type="button"
                    onClick={() => setFilter(card.filterKey)}
                    className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                  >
                    {card.cta}
                  </button>
```
to:
```tsx
                  {card.href ? (
                    <Link
                      href={card.href}
                      className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                    >
                      {card.cta}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFilter(card.filterKey)}
                      className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                    >
                      {card.cta}
                    </button>
                  )}
```

(c) Add the `Link` import at the top of the file:
```ts
import Link from 'next/link'
```

- [ ] **Step 6: Add an OverviewView test for the no-forms card**

In `components/dashboard/__tests__/OverviewView.test.tsx`, add inside `describe('OverviewView phase 1', …)`:
```ts
  it('shows the no-active-forms card linking to /forms when there are no active templates', () => {
    render(<OverviewView {...base} phase={1} templates={[]} />)
    expect(screen.getByText('Aucun formulaire actif')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer les formulaires' })).toHaveAttribute('href', '/forms')
  })
```
(The `base` fixture already has `templates: []`, so the card appears; the assertion is explicit for clarity.)

- [ ] **Step 7: Run the OverviewView test + type-check + lint**

Run: `pnpm test -- components/dashboard/__tests__/OverviewView.test.tsx && npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/dashboard/rollup.ts components/dashboard/OverviewView.tsx lib/dashboard/__tests__/rollup.test.ts components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): no-active-forms action card linking to /forms"
```

---

### Task 7: Forms + Documents — remove top-bar search & create button, delete dead plumbing

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`
- Modify: `components/shell/ShellUiContext.tsx`
- Modify: `components/forms/FormsView.tsx`
- Modify: `components/documents/DocsView.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`
- Test: `components/forms/__tests__/FormsView.test.tsx`

**Interfaces:**
- `ShellUi` loses `addRequestId` and `requestAdd`; keeps `openNewExchange`, `listSearch`, `setListSearch` (students search still uses `listSearch`).
- `FormsView` and `DocsView` no longer consume `useShellUi` — they drive their own `showAdd` from their inline add buttons only.

- [ ] **Step 1: Trim `ShellUiContext`**

Rewrite `components/shell/ShellUiContext.tsx` in full:
```tsx
'use client'
import { createContext, useContext } from 'react'

export type ShellUi = {
  openNewExchange: () => void
  // Contextual top-bar search (set by the shell on /students, consumed by the
  // students list view as a client-side filter).
  listSearch: string
  setListSearch: (q: string) => void
}

export const ShellUiContext = createContext<ShellUi>({
  openNewExchange: () => {},
  listSearch: '',
  setListSearch: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
```

- [ ] **Step 2: Remove the forms/docs top bar and `addRequestId` from `OrganizerShell`**

In `components/shell/OrganizerShell.tsx`:

(a) Delete the `addRequestId` state (line 89): remove `const [addRequestId, setAddRequestId] = useState(0)`.

(b) Simplify `listPage` (lines 94-96) — forms/docs no longer need it; keep only students detection. Replace:
```ts
  const listPage = pathname.startsWith('/forms') ? 'forms'
    : pathname.startsWith('/documents') ? 'docs'
    : pathname.startsWith('/students') ? 'students' : null
  const isSettings = pathname.startsWith('/settings')
```
with:
```ts
  const isStudents = pathname.startsWith('/students')
  const isSettings = pathname.startsWith('/settings')
```

(c) Update the `shellUi` memo (lines 110-116):
```ts
  const shellUi = useMemo<ShellUi>(() => ({
    openNewExchange: handleNewExchange,
    listSearch,
    setListSearch,
  }), [handleNewExchange, listSearch])
```

(d) In the header, change the students-search condition (line 241) from `listPage === 'students'` to `isStudents`, and **delete** the entire forms/docs block (lines 250-267, the `{!isSettings && active && (listPage === 'forms' || listPage === 'docs') && ( … )}` block). The header's search region becomes only:
```tsx
          {!isSettings && active && isStudents && (
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Rechercher un élève…"
              className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
            />
          )}
```

- [ ] **Step 3: Drop the shell-search plumbing from `FormsView`**

In `components/forms/FormsView.tsx`:

(a) Change the imports at the top — remove `useEffect`, `useRef` if now unused (keep `useState`), and remove the `useShellUi` import:
```ts
import { useState } from 'react'
```
(delete `import { useShellUi } from '@/components/shell/ShellUiContext'`).

(b) Delete the shell hook, the ref, and the effect (lines 21-32):
```ts
  const { listSearch, addRequestId } = useShellUi()
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastAddRequest = useRef(addRequestId)

  // Top-bar « + Nouveau formulaire » bumps addRequestId → open the panel.
  useEffect(() => {
    if (addRequestId !== lastAddRequest.current) {
      lastAddRequest.current = addRequestId
      setShowAdd(true)
    }
  }, [addRequestId])
```
→
```ts
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
```

(c) Remove the search filter (lines 34-35):
```ts
  const q = listSearch.trim().toLowerCase()
  const visible = q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates
```
→
```ts
  const visible = templates
```
(Keep `visible` as the mapped variable so the JSX `visible.map(...)` and the count line stay unchanged.)

(d) Delete the empty-result line (lines 120-122):
```tsx
        {visible.length === 0 && q && (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat pour «&nbsp;{listSearch.trim()}&nbsp;»</p>
        )}
```
(remove entirely).

- [ ] **Step 4: Drop the shell-search plumbing from `DocsView`**

In `components/documents/DocsView.tsx`, apply the exact same shape of edits:

(a) Imports:
```ts
import { useState } from 'react'
```
(delete `useEffect`, `useRef`, and the `import { useShellUi } from '@/components/shell/ShellUiContext'`).

(b) Replace lines 22-32:
```ts
  const { listSearch, addRequestId } = useShellUi()
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const lastAddRequest = useRef(addRequestId)

  useEffect(() => {
    if (addRequestId !== lastAddRequest.current) {
      lastAddRequest.current = addRequestId
      setShowAdd(true)
    }
  }, [addRequestId])
```
→
```ts
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
```

(c) Replace lines 34-35:
```ts
  const q = listSearch.trim().toLowerCase()
  const visible = q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates
```
→
```ts
  const visible = templates
```

(d) Delete the empty-result line (lines 117-119):
```tsx
        {visible.length === 0 && q && (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat pour «&nbsp;{listSearch.trim()}&nbsp;»</p>
        )}
```

- [ ] **Step 5: Update the OrganizerShell tests (forms/docs top bar gone)**

In `components/shell/__tests__/OrganizerShell.test.tsx`, replace the two tests `shows the contextual search + CTA on /forms instead of the invite button` and `shows the documents CTA on /documents` with:
```ts
  it('shows no top-bar search or create button on /forms', () => {
    renderShell({ pathname: '/forms' })
    expect(screen.queryByPlaceholderText('Rechercher un formulaire…')).toBeNull()
    expect(screen.queryByRole('button', { name: /Nouveau formulaire/ })).toBeNull()
  })

  it('shows no top-bar search or create button on /documents', () => {
    renderShell({ pathname: '/documents' })
    expect(screen.queryByPlaceholderText('Rechercher un document…')).toBeNull()
    expect(screen.queryByRole('button', { name: /Demander un document/ })).toBeNull()
  })
```
Leave the `/students` search test and the `/dashboard` no-search test unchanged.

- [ ] **Step 6: Update the FormsView tests (no shell provider, no search test)**

In `components/forms/__tests__/FormsView.test.tsx`:

(a) Remove the `ShellUiContext` import (line 3) and rewrite `renderWith` (lines 29-35) to render directly without a provider:
```ts
function renderWith(ui: React.ReactElement) {
  return render(ui)
}
```

(b) Delete the test `filters by the shell search and shows the empty-result line` (lines 46-50) entirely.

(c) In `shows Supprimer only for custom templates` (lines 75-84), replace the inline `ShellUiContext.Provider` rerender with a plain rerender:
```ts
  it('shows Supprimer only for custom templates', () => {
    const { rerender } = renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />)
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    rerender(<FormsView exchangeId="ex1" templates={[vm({ standard_key: null })]} studentCount={2} />)
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })
```

(The `DocsView.test.tsx` renders `<DocsView />` directly with no provider and has no search test, so it needs **no change** — it will still pass once `DocsView` stops reading context.)

- [ ] **Step 7: Run the affected tests**

Run: `pnpm test -- components/shell/__tests__/OrganizerShell.test.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx`
Expected: PASS.

- [ ] **Step 8: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS (no unused `useEffect`/`useRef`/`useShellUi`/`addRequestId` remain; `isStudents` is used).

- [ ] **Step 9: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/ShellUiContext.tsx components/forms/FormsView.tsx components/documents/DocsView.tsx components/shell/__tests__/OrganizerShell.test.tsx components/forms/__tests__/FormsView.test.tsx
git commit -m "refactor(shell): drop forms/docs top-bar search + create button and dead addRequestId plumbing"
```

---

### Task 8: Réglages — move from sidebar rail to profile menu

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`

**Interfaces:**
- The rail's `Réglages` `RailItem` is removed. A `Réglages` link is added to the avatar dropdown above `Se déconnecter`. Route and settings pages unchanged.

- [ ] **Step 1: Remove the Réglages rail item**

In `components/shell/OrganizerShell.tsx`, delete the rail item (lines 179-181):
```tsx
          <RailItem href="/settings" label="Réglages" active={pathname.startsWith('/settings')}>
            <IconSettings />
          </RailItem>
```
Then remove `IconSettings` from the import on line 8 (it is now unused): change
```ts
import { IconOverview, IconExchanges, IconApplications, IconForms, IconDocs, IconStudents, IconSettings } from './RailIcons'
```
to
```ts
import { IconOverview, IconExchanges, IconApplications, IconForms, IconDocs, IconStudents } from './RailIcons'
```

- [ ] **Step 2: Add Réglages to the avatar dropdown**

In the profile dropdown menu (lines 184-194), add a `Réglages` link above the sign-out button:
```tsx
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-[11px] border bg-card p-1 shadow-float">
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="block w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                Réglages
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
              >
                Se déconnecter
              </button>
            </div>
          )}
```
(`Link` is already imported at the top of `OrganizerShell.tsx`.)

- [ ] **Step 3: Update the shell tests (Réglages now in the profile menu)**

In `components/shell/__tests__/OrganizerShell.test.tsx`, replace the two tests `rail contains Élèves and Réglages when an exchange is active` and `Réglages stays visible with zero exchanges but Élèves does not` with:
```ts
  it('rail contains Élèves but not Réglages when an exchange is active', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByRole('link', { name: /Élèves/ })).toHaveAttribute('href', '/students')
    expect(screen.queryByRole('link', { name: /Réglages/ })).toBeNull()
  })

  it('Réglages lives in the profile menu and links to /settings', () => {
    renderShell({ pathname: '/dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }))
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
  })
```

- [ ] **Step 4: Run the shell test**

Run: `pnpm test -- components/shell/__tests__/OrganizerShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS (no unused `IconSettings`).

- [ ] **Step 6: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/__tests__/OrganizerShell.test.tsx
git commit -m "feat(shell): move Réglages from the sidebar rail into the profile menu"
```

---

### Task 9: Billing — audience line + shared feature bullets on plan cards

**Files:**
- Modify: `lib/billing/display.ts`
- Modify: `components/billing/PlanSelector.tsx`
- Test: `components/billing/__tests__/PlanSelector.test.tsx`

**Interfaces:**
- Produces `PLAN_AUDIENCE_FR: Record<PlanKey, string>` and `PLAN_FEATURE_BULLETS_FR: string[]` in `display.ts`, consumed by `PlanSelector`.

- [ ] **Step 1: Add the audience + bullets strings to `display.ts`**

In `lib/billing/display.ts`, add after the existing `PLAN_DESC_FR` block:
```ts
// Audience line shown on each plan card (semibold, under the cap).
export const PLAN_AUDIENCE_FR: Record<PlanKey, string> = {
  starter: 'Pour un jumelage unique',
  growth: 'Pour plusieurs programmes en parallèle',
  scale: 'Pour les grands établissements',
}

// Shared feature bullets — identical across plans (only the cap differs).
export const PLAN_FEATURE_BULLETS_FR: string[] = [
  'Élèves et familles illimités',
  'Formulaires et documents illimités',
  'Relances automatiques par e-mail',
  'Suivi des dossiers en temps réel',
]
```

- [ ] **Step 2: Render the audience line + bullets in each plan card**

In `components/billing/PlanSelector.tsx`:

(a) Extend the import (line 5):
```ts
import { PLAN_LABEL_FR, PLAN_PRICE_FR, planCapLabel, PLAN_AUDIENCE_FR, PLAN_FEATURE_BULLETS_FR } from '@/lib/billing/display'
```

(b) Inside the card `<button>`, after the cap `<span>` (`{planCapLabel(key)}`), add the audience line and bullet list:
```tsx
              <span className="text-[13.5px] text-[#5B6B8C]">{planCapLabel(key)}</span>
              <span className="mt-1.5 text-[13px] font-semibold text-[#10203F]">{PLAN_AUDIENCE_FR[key]}</span>
              <ul className="mt-2 flex flex-col gap-1.5">
                {PLAN_FEATURE_BULLETS_FR.map(f => (
                  <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-[#5B6B8C]">
                    <span aria-hidden className="mt-[1px] text-[#2456E6]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
```

- [ ] **Step 3: Add PlanSelector assertions for the audience line + a bullet**

In `components/billing/__tests__/PlanSelector.test.tsx`, add:
```ts
  it('shows an audience line for each plan and the shared feature bullets', () => {
    render(<PlanSelector />)
    expect(screen.getByText('Pour un jumelage unique')).toBeInTheDocument()
    expect(screen.getByText('Pour plusieurs programmes en parallèle')).toBeInTheDocument()
    expect(screen.getByText('Pour les grands établissements')).toBeInTheDocument()
    // Bullets are identical across the three cards → one per plan.
    expect(screen.getAllByText('Relances automatiques par e-mail')).toHaveLength(3)
  })
```

- [ ] **Step 4: Run the PlanSelector test + display test**

Run: `pnpm test -- components/billing/__tests__/PlanSelector.test.tsx lib/billing/__tests__/display.test.ts`
Expected: PASS (existing display tests unaffected — only new exports added).

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/billing/display.ts components/billing/PlanSelector.tsx components/billing/__tests__/PlanSelector.test.tsx
git commit -m "feat(billing): audience line + shared feature bullets on plan cards"
```

---

### Task 10: Emails — wordmark color to brand blue

**Files:**
- Modify: `lib/email.ts:30`
- Test: `lib/__tests__/email.forms.test.ts`

- [ ] **Step 1: Recolor the "Eazy" wordmark span**

In `lib/email.ts`, inside `layout()` (line 30), change:
```ts
        <span style="color: #3FA277;">Eazy</span>Exchange
```
to:
```ts
        <span style="color: #2456E6;">Eazy</span>Exchange
```

- [ ] **Step 2: Assert the wordmark color in the email test**

In `lib/__tests__/email.forms.test.ts`, add to the `describe('forms emails', …)` block:
```ts
  it('renders the wordmark in brand blue, not green', async () => {
    await sendTemplateReminderEmail({
      to: 's@x.fr', studentName: 'Léa', templateName: 'Passeport', exchangeName: 'Espagne', deadline: null,
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('<span style="color: #2456E6;">Eazy</span>Exchange')
    expect(call.html).not.toContain('#3FA277')
  })
```

- [ ] **Step 3: Run the email test**

Run: `pnpm test -- lib/__tests__/email.forms.test.ts`
Expected: PASS.

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/__tests__/email.forms.test.ts
git commit -m "fix(email): recolor Eazy wordmark to brand blue #2456E6"
```

---

### Task 11: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: lint clean, all vitest suites PASS, tsc clean.

- [ ] **Step 2: Confirm no stray references remain**

Run: `grep -rn "how.note\|addRequestId\|requestAdd\|confirmingClose\|#3FA277" components/ lib/ app/`
Expected: no matches (all removed/renamed).

- [ ] **Step 3: Visual spot-check note**

Per the spec, do a visual spot-check on a Vercel preview deployment before merge (landing dropdown + 5 steps + reminder preview; login layout; invite inline warning; dashboard no-forms card; forms/docs top bar gone; Réglages in profile menu; billing cards; a real reminder email's wordmark). This is a manual, user-gated step — surface it in the handoff, do not attempt to deploy.

---

## Self-Review

**Spec coverage:**
- §1a language dropdown → Task 2 Step 1. §1b 5 steps → Task 1 (content) + Task 2 (grid). §1c reminder preview → Task 1 (strings) + Task 2 (HowItWorks block). §1d copy → Task 1 Steps 4-5. §1e tab title → Task 3. ✓
- §2a login reorder + separator → Task 4 Step 4. §2b placeholders/icons/sr-only → Task 4 Step 4. §2c signup link → Task 4 Step 4. §2d Google `select_account` → Task 4 Step 1. ✓
- §3 invite inline warning → Task 5. ✓
- §4 no-active-forms card → Task 6. ✓
- §5 forms/docs top-bar removal + dead plumbing → Task 7. ✓
- §6 Réglages → profile menu → Task 8. ✓
- §7 billing audience + bullets → Task 9. ✓
- §8 email wordmark → Task 10. ✓
- Testing/verification → per-task tests + Task 11. ✓
- Excluded (as specified): «Nouvel échange» field/creation items (sub-project 3), testimonial unchanged. ✓

**Type consistency:** `ActionCard.href` defined in Task 6 Step 1, consumed in Task 6 Step 5. `actionCards` 4th param `activeTemplateCount` defined and consumed consistently. `ShellUi` shape (Task 7) matches all consumers after edits (FormsView/DocsView drop the hook; students search keeps `listSearch`). `how.reminder` shape defined in Task 1, consumed in Task 2. `PLAN_AUDIENCE_FR`/`PLAN_FEATURE_BULLETS_FR` names match between display.ts and PlanSelector.

**Placeholder scan:** No TBD/TODO; every code step shows full replacement code; every test step shows the assertion.
