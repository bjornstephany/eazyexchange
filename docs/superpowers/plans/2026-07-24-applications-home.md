# Applications-as-Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/applications` a usable landing page — blank with one CTA before anything exists, tracking grid with a minimised invitation panel afterwards — and strip the invite flow out of Overview.

**Architecture:** The invite flow moves from `components/dashboard/InviteModal.tsx` (two steps, Overview-only) to a new one-screen `OpenApplicationsDialog` on the Applications page. The paste-emails box is extracted into a shared `InviteByEmailForm` so the dialog and the existing `InviteByEmailDialog` have one implementation. `CandidaturesView` keeps sole ownership of the open/deadline state and gains an empty-state branch; the old control bar becomes a collapsed `<details>` panel below the grid. Overview loses the modal and points at `/applications` instead.

**Tech Stack:** Next.js 14 App Router, React client components, next-intl (5 locales), Tailwind, shadcn/ui, vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-24-applications-home-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- Branch is `feature/applications-home` in worktree `.claude/worktrees/feature+applications-home`. Confirm with `git branch --show-current` before every commit. Never `git add -A` or `git add .` — stage only the named files.
- Every message key added or removed must land in **all five** catalogs (`messages/en.json`, `fr.json`, `de.json`, `es.json`, `it.json`) in the **same commit**, or `messages/__tests__/parity.test.ts` fails. Parity checks: identical key sets (fr is the reference), no empty values, identical ICU argument sets.
- French strings are written by hand with real accents and the straight apostrophe `'` used elsewhere in `fr.json` (e.g. `"Ouvrez d'abord les candidatures"`). Never let a subagent transcribe French.
- Component tests render through `renderWithIntl` from `@/lib/test/renderWithIntl`, which uses the **French** catalog. All test assertions are French strings.
- No migration, no RLS policy, no storage bucket is touched by this plan, so `pnpm test:rls` is **not** required.
- Final gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`.
- Run vitest as `pnpm exec vitest run --exclude '**/.claude/**' <path>` when running a single file, so a sibling session's worktree tests are not swept in.

---

### Task 1: New message keys in five locales

Adds only the keys the new components need. The Overview copy changes (`startBody`, `inviteCta`, `prepareFormsCta`) land in Task 7 together with the code that renders them — changing them here would leave an intermediate commit whose button text contradicts its behaviour.

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/de.json`, `messages/es.json`, `messages/it.json`
- Test: `messages/__tests__/parity.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: nothing.
- Produces: message keys `organizer.applications.empty.{title,body,cta}`, `organizer.applications.openDialog.{title,description,deadlineLabel,saving,methodHeading,lockedHint,linkHeading,emailHeading,done}`, `organizer.applications.panel.{summaryOpen,summaryClosed,deadlineSuffix}`. `deadlineSuffix` takes one ICU argument, `{date}`.

- [ ] **Step 1: Add the three blocks to `messages/en.json`**

Insert inside the `organizer.applications` object, immediately **after** the `"emptyState"` line and before `"countSummary"`:

```json
      "empty": {
        "title": "Invite your students to apply",
        "body": "Set a deadline, then share the application link or let us email your students. Applications open as soon as you save.",
        "cta": "Invite your students to apply"
      },
      "openDialog": {
        "title": "Invite your students to apply",
        "description": "Choose a deadline. Applications open as soon as you pick one.",
        "deadlineLabel": "Application deadline",
        "saving": "Opening…",
        "methodHeading": "How do you want to invite?",
        "lockedHint": "Choose a deadline to unlock these.",
        "linkHeading": "Share a link",
        "emailHeading": "Or let us send the emails",
        "done": "Done"
      },
      "panel": {
        "summaryOpen": "Applications open",
        "summaryClosed": "Applications closed",
        "deadlineSuffix": " · deadline {date}"
      },
```

- [ ] **Step 2: Add the same blocks to `messages/fr.json`**

Same position (after `"emptyState"` inside `organizer.applications`):

```json
      "empty": {
        "title": "Invitez vos élèves à postuler",
        "body": "Fixez une date limite, puis partagez le lien de candidature ou laissez-nous écrire à vos élèves. Les candidatures ouvrent dès l'enregistrement.",
        "cta": "Inviter vos élèves à postuler"
      },
      "openDialog": {
        "title": "Inviter vos élèves à postuler",
        "description": "Choisissez une date limite. Les candidatures ouvrent aussitôt.",
        "deadlineLabel": "Date limite des candidatures",
        "saving": "Ouverture…",
        "methodHeading": "Comment souhaitez-vous inviter ?",
        "lockedHint": "Choisissez une date limite pour débloquer ces options.",
        "linkHeading": "Partager un lien",
        "emailHeading": "Ou laissez-nous envoyer les e-mails",
        "done": "Terminé"
      },
      "panel": {
        "summaryOpen": "Candidatures ouvertes",
        "summaryClosed": "Candidatures fermées",
        "deadlineSuffix": " · date limite {date}"
      },
```

- [ ] **Step 3: Add the same blocks to `messages/de.json`**

```json
      "empty": {
        "title": "Laden Sie Ihre Schüler zur Bewerbung ein",
        "body": "Legen Sie eine Frist fest und teilen Sie dann den Bewerbungslink, oder lassen Sie uns Ihre Schüler anschreiben. Die Bewerbungen öffnen sofort nach dem Speichern.",
        "cta": "Schüler zur Bewerbung einladen"
      },
      "openDialog": {
        "title": "Schüler zur Bewerbung einladen",
        "description": "Wählen Sie eine Frist. Die Bewerbungen werden sofort geöffnet.",
        "deadlineLabel": "Bewerbungsfrist",
        "saving": "Wird geöffnet…",
        "methodHeading": "Wie möchten Sie einladen?",
        "lockedHint": "Wählen Sie eine Frist, um diese Optionen freizuschalten.",
        "linkHeading": "Einen Link teilen",
        "emailHeading": "Oder lassen Sie uns die E-Mails senden",
        "done": "Fertig"
      },
      "panel": {
        "summaryOpen": "Bewerbungen offen",
        "summaryClosed": "Bewerbungen geschlossen",
        "deadlineSuffix": " · Frist {date}"
      },
```

- [ ] **Step 4: Add the same blocks to `messages/es.json`**

```json
      "empty": {
        "title": "Invite a sus alumnos a postularse",
        "body": "Fije una fecha límite y luego comparta el enlace de candidatura o deje que escribamos a sus alumnos. Las candidaturas se abren al guardar.",
        "cta": "Invitar a sus alumnos a postularse"
      },
      "openDialog": {
        "title": "Invitar a sus alumnos a postularse",
        "description": "Elija una fecha límite. Las candidaturas se abrirán de inmediato.",
        "deadlineLabel": "Fecha límite de las candidaturas",
        "saving": "Abriendo…",
        "methodHeading": "¿Cómo desea invitar?",
        "lockedHint": "Elija una fecha límite para desbloquear estas opciones.",
        "linkHeading": "Compartir un enlace",
        "emailHeading": "O deje que enviemos los correos",
        "done": "Listo"
      },
      "panel": {
        "summaryOpen": "Candidaturas abiertas",
        "summaryClosed": "Candidaturas cerradas",
        "deadlineSuffix": " · fecha límite {date}"
      },
```

- [ ] **Step 5: Add the same blocks to `messages/it.json`**

```json
      "empty": {
        "title": "Invita i tuoi studenti a candidarsi",
        "body": "Imposta una scadenza, poi condividi il link di candidatura o lascia che scriviamo noi ai tuoi studenti. Le candidature si aprono al salvataggio.",
        "cta": "Invita i tuoi studenti a candidarsi"
      },
      "openDialog": {
        "title": "Invita i tuoi studenti a candidarsi",
        "description": "Scegli una scadenza. Le candidature si apriranno subito.",
        "deadlineLabel": "Scadenza delle candidature",
        "saving": "Apertura…",
        "methodHeading": "Come vuoi invitare?",
        "lockedHint": "Scegli una scadenza per sbloccare queste opzioni.",
        "linkHeading": "Condividere un link",
        "emailHeading": "Oppure lascia che inviamo noi le e-mail",
        "done": "Fatto"
      },
      "panel": {
        "summaryOpen": "Candidature aperte",
        "summaryClosed": "Candidature chiuse",
        "deadlineSuffix": " · scadenza {date}"
      },
```

- [ ] **Step 6: Run the parity test**

Run: `pnpm exec vitest run --exclude '**/.claude/**' messages/__tests__/parity.test.ts`
Expected: PASS — all locales share the key set, no empty values, `{date}` present in every `deadlineSuffix`.

- [ ] **Step 7: Run the accent/mojibake guard**

Run: `grep -nP '[\x{FFFD}]|Ã©|Ã¨|Ã |Ã§' messages/*.json`
Expected: **no output** (exit 1). Any hit means a string was written with broken encoding — fix it before committing.

Run: `grep -c 'é' messages/fr.json`
Expected: a number well above 100 — confirms the French catalog was not accent-stripped.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json messages/fr.json messages/de.json messages/es.json messages/it.json
git commit -m "i18n(applications): keys for the empty state, open-applications dialog and invitation panel"
```

---

### Task 2: Extract tab logic to `lib/applications/tabs.ts`

`app/(organizer)/applications/page.tsx` is a server component and must validate `?tab=` before passing it down. It cannot cleanly import from a `'use client'` module, so the tab vocabulary moves to a plain module both sides can import. Pure refactor — no behaviour change.

**Files:**
- Create: `lib/applications/tabs.ts`
- Create: `lib/applications/__tests__/tabs.test.ts`
- Modify: `components/applications/CandidaturesView.tsx:15-38` (delete the moved declarations, import them instead)

**Interfaces:**
- Consumes: `AppRow` from `@/lib/dashboard/rollup`.
- Produces:
  - `export type TabKey = 'all' | 'invited' | 'toreview' | 'awaiting' | 'accepted' | 'rejected' | 'declined'`
  - `export const TAB_KEYS: TabKey[]`
  - `export function parseTab(raw: string | undefined): TabKey`
  - `export function matchesTab(a: AppRow, key: TabKey): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/applications/__tests__/tabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TAB_KEYS, parseTab, matchesTab } from '@/lib/applications/tabs'
import type { AppRow } from '@/lib/dashboard/rollup'

function app(status: string): AppRow {
  return { id: 'x', status, submitted_at: '2026-09-01', responded_at: null, data: {}, email: 'a@b.fr' }
}

describe('parseTab', () => {
  it('accepts every declared tab key', () => {
    for (const key of TAB_KEYS) expect(parseTab(key)).toBe(key)
  })
  it('falls back to all for unknown, empty and missing values', () => {
    expect(parseTab('nope')).toBe('all')
    expect(parseTab('')).toBe('all')
    expect(parseTab(undefined)).toBe('all')
  })
})

describe('matchesTab', () => {
  it('puts every status in exactly one non-all tab', () => {
    const statuses = ['invited', 'draft', 'submitted', 'accepted', 'maybe', 'enrolling', 'enrolled', 'rejected', 'declined']
    for (const status of statuses) {
      const hits = TAB_KEYS.filter(k => k !== 'all' && matchesTab(app(status), k))
      expect(hits).toHaveLength(1)
    }
  })
  it('keeps declined out of the rejected tab', () => {
    expect(matchesTab(app('declined'), 'rejected')).toBe(false)
    expect(matchesTab(app('declined'), 'declined')).toBe(true)
  })
  it('all matches everything', () => {
    expect(matchesTab(app('draft'), 'all')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --exclude '**/.claude/**' lib/applications/__tests__/tabs.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/applications/tabs"`.

- [ ] **Step 3: Create the module**

Create `lib/applications/tabs.ts`:

```ts
import type { AppRow } from '@/lib/dashboard/rollup'

export type TabKey = 'all' | 'invited' | 'toreview' | 'awaiting' | 'accepted' | 'rejected' | 'declined'

export const TAB_KEYS: TabKey[] = ['all', 'invited', 'toreview', 'awaiting', 'accepted', 'rejected', 'declined']

// `?tab=` is a user-editable URL segment: anything unknown falls back to the
// default tab rather than rendering a grid that silently matches nothing.
export function parseTab(raw: string | undefined): TabKey {
  return TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : 'all'
}

// Every status belongs to exactly one non-"all" tab. "rejected" is the
// organizer saying no; "declined" is the student saying no — conflating them
// (as the old REJECTED_STATUSES did) made a student who dropped out look
// refused. "awaiting" is organizer-accepted with no student reply yet;
// "accepted" means the student confirmed.
export function matchesTab(a: AppRow, key: TabKey): boolean {
  switch (key) {
    case 'all': return true
    case 'invited': return a.status === 'invited' || a.status === 'draft'
    case 'toreview': return a.status === 'submitted'
    case 'awaiting': return a.status === 'accepted' || a.status === 'maybe'
    case 'accepted': return a.status === 'enrolling' || a.status === 'enrolled'
    case 'rejected': return a.status === 'rejected'
    case 'declined': return a.status === 'declined'
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --exclude '**/.claude/**' lib/applications/__tests__/tabs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Point `CandidaturesView` at the new module**

In `components/applications/CandidaturesView.tsx`, delete lines 15-38 — the `TabKey` type alias, the `TAB_KEYS` const, the `matchesTab` function and its comment block — but **keep** the `SELECTABLE` const and its comment. Then add this import next to the other `@/lib` imports (after the `applicantName` import):

```tsx
import { TAB_KEYS, matchesTab, type TabKey } from '@/lib/applications/tabs'
```

After the edit, the region between the imports and `export function CandidaturesView` must read exactly:

```tsx
// Invited/started rows are organizer-sent invitations still in the funnel; they
// are shown for tracking but never bulk-selectable for accept/reject.
const SELECTABLE = (a: AppRow) => a.status !== 'invited' && a.status !== 'draft'
```

- [ ] **Step 6: Run the existing view test unchanged**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/CandidaturesView.test.tsx`
Expected: PASS (9 tests) — this is the regression signal for the move.

- [ ] **Step 7: Commit**

```bash
git add lib/applications/tabs.ts lib/applications/__tests__/tabs.test.ts components/applications/CandidaturesView.tsx
git commit -m "refactor(applications): move tab vocabulary to lib/applications/tabs so the server can validate ?tab="
```

---

### Task 3: Extract `InviteByEmailForm`

Two consumers will need the paste box: the existing `InviteByEmailDialog` and the new `OpenApplicationsDialog`. The form owns the textarea, the send call and the result/error rendering; consumers own only layout. `InviteByEmailDialog.test.tsx` stays **byte-identical** and must keep passing — that is the regression signal.

**Files:**
- Create: `components/applications/InviteByEmailForm.tsx`
- Modify: `components/applications/InviteByEmailDialog.tsx` (whole file)
- Test: `components/applications/__tests__/InviteByEmailDialog.test.tsx` (existing, **do not edit**)

**Interfaces:**
- Consumes: `sendApplicationInvitations` from `@/actions/applications-review`, which returns `{ ok: false; notOpen: true } | { ok: false; tooMany: true } | { ok: true; sent: number; skippedExchange: number; skippedElsewhere: number; invalid: number }`.
- Produces: `export function InviteByEmailForm(props: { exchangeId: string; disabled?: boolean; resetKey?: unknown; children?: React.ReactNode }): JSX.Element`. `children` renders to the **left** of the send button in the action row, so a consumer can place its own Close button there. `resetKey` clears the box whenever its value changes.

- [ ] **Step 1: Create the form component**

Create `components/applications/InviteByEmailForm.tsx`:

```tsx
'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { sendApplicationInvitations } from '@/actions/applications-review'
import { Button } from '@/components/ui/button'

// Shared by InviteByEmailDialog (its own modal, reached from the invitation
// panel) and OpenApplicationsDialog (section ② of the open-applications
// screen). Owns the paste box, the send call and the result/error rendering;
// consumers own only the surrounding layout and may slot their own buttons to
// the left of Send via `children`.
export function InviteByEmailForm({
  exchangeId,
  disabled = false,
  resetKey,
  children,
}: {
  exchangeId: string
  disabled?: boolean
  resetKey?: unknown
  children?: ReactNode
}) {
  const t = useTranslations('organizer.applications.invite')
  const [emails, setEmails] = useState('')
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Consumers pass a changing resetKey (their `open` flag) to clear the box
  // between uses, so a stale summary never greets the next opening.
  useEffect(() => {
    setEmails('')
    setSending(false)
    setSummary(null)
    setError(null)
  }, [resetKey])

  async function submit() {
    if (!emails.trim() || sending) return
    setSending(true); setError(null); setSummary(null)
    try {
      const res = await sendApplicationInvitations(exchangeId, emails)
      if (!res.ok) {
        setError('notOpen' in res ? t('notOpenError') : t('tooManyError'))
        return
      }
      setSummary(t('result', {
        sent: res.sent, skipped: res.skippedExchange + res.skippedElsewhere, invalid: res.invalid,
      }))
      setEmails('')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <textarea
        value={emails}
        disabled={disabled}
        onChange={(e) => setEmails(e.target.value)}
        placeholder={t('placeholder')}
        rows={6}
        className="w-full rounded-[10px] border px-3 py-2 text-sm disabled:bg-subtle disabled:text-muted-foreground"
      />
      {error && (
        <div className="rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">{error}</div>
      )}
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      <div className="mt-1.5 flex items-center justify-end gap-3">
        {children}
        <Button type="button" disabled={disabled || !emails.trim() || sending} onClick={submit}>
          {sending ? t('sending') : t('sendCta')}
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Rewrite `InviteByEmailDialog` around it**

Replace the entire contents of `components/applications/InviteByEmailDialog.tsx` with:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InviteByEmailForm } from '@/components/applications/InviteByEmailForm'

export function InviteByEmailDialog({
  exchangeId, open, onOpenChange,
}: {
  exchangeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('organizer.applications.invite')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">{t('title')}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">{t('description')}</DialogDescription>
        </DialogHeader>
        <InviteByEmailForm exchangeId={exchangeId} resetKey={open}>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
            {t('close')}
          </Button>
        </InviteByEmailForm>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Run the untouched dialog test**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/InviteByEmailDialog.test.tsx`
Expected: PASS (2 tests). If `getByText('Envoyer les invitations')` now fails, the send button was moved out of the form — revert and keep it inside.

- [ ] **Step 4: Run the view test that mounts the dialog**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/CandidaturesView.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add components/applications/InviteByEmailForm.tsx components/applications/InviteByEmailDialog.tsx
git commit -m "refactor(applications): extract InviteByEmailForm so two dialogs share one send path"
```

---

### Task 4: `OpenApplicationsDialog`

The one-screen replacement for `InviteModal`: pick a deadline (which opens applications immediately), then copy the link or paste addresses. Sections ① and ② stay inert until applications are actually open, because the apply URL 404s and `sendApplicationInvitations` returns `{ ok: false, notOpen: true }` before that.

**Files:**
- Create: `components/applications/OpenApplicationsDialog.tsx`
- Create: `components/applications/__tests__/OpenApplicationsDialog.test.tsx`

**Interfaces:**
- Consumes: `setApplicationOpen(exchangeId: string, open: boolean, deadline: string | null): Promise<void>` from `@/actions/exchanges`; `InviteByEmailForm` from Task 3; keys from Task 1.
- Produces: `export function OpenApplicationsDialog(props: { exchangeId: string; applySlug: string; open: boolean; onOpenChange: (open: boolean) => void; onOpened: (deadline: string) => void }): JSX.Element`. `onOpened` fires once, right after `setApplicationOpen` resolves, with the chosen `YYYY-MM-DD` deadline.

- [ ] **Step 1: Write the failing test**

Create `components/applications/__tests__/OpenApplicationsDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({
  setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a),
}))
const send = vi.fn()
vi.mock('@/actions/applications-review', () => ({
  sendApplicationInvitations: (...a: unknown[]) => send(...a),
}))

import { OpenApplicationsDialog } from '@/components/applications/OpenApplicationsDialog'

function setup(onOpened = vi.fn(), onOpenChange = vi.fn()) {
  renderWithIntl(
    <OpenApplicationsDialog
      exchangeId="ex1"
      applySlug="france-canada"
      open
      onOpenChange={onOpenChange}
      onOpened={onOpened}
    />
  )
  return { onOpened, onOpenChange }
}

beforeEach(() => {
  setApplicationOpen.mockClear()
  send.mockReset()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('OpenApplicationsDialog', () => {
  it('locks both invite methods until a deadline is chosen', () => {
    setup()
    expect(screen.getByText('Choisissez une date limite pour débloquer ces options.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copier' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Envoyer les invitations' })).toBeDisabled()
  })

  it('choosing a deadline opens applications and unlocks both methods', async () => {
    const { onOpened } = setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-01'))
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('2026-09-01'))
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copier' })).toBeEnabled())
    expect(screen.queryByText('Choisissez une date limite pour débloquer ces options.')).toBeNull()
  })

  it('never persists an empty deadline', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '' } })
    expect(setApplicationOpen).not.toHaveBeenCalled()
  })

  it('sends pasted addresses once applications are open', async () => {
    send.mockResolvedValue({ ok: true, sent: 2, skippedExchange: 0, skippedElsewhere: 0, invalid: 0 })
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalled())
    const box = screen.getByPlaceholderText(/marie@ecole\.fr/)
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.change(box, { target: { value: 'a@x.co\nb@x.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer les invitations' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('ex1', 'a@x.co\nb@x.co'))
    await screen.findByText('2 envoyée·s · 0 déjà dans la liste · 0 invalide·s')
  })

  it('shows Cancel before opening and Terminé after, and both close the dialog', async () => {
    const { onOpenChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('button', { name: 'Terminé' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await screen.findByRole('button', { name: 'Terminé' })
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
  })

  it('carries no copy-before-closing warning — the link lives on in the panel', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await screen.findByRole('button', { name: 'Terminé' })
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/OpenApplicationsDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/applications/OpenApplicationsDialog"`.

- [ ] **Step 3: Create the component**

Create `components/applications/OpenApplicationsDialog.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { setApplicationOpen } from '@/actions/exchanges'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InviteByEmailForm } from '@/components/applications/InviteByEmailForm'

// One screen: pick a deadline — which opens applications on the spot — then
// invite by copying the link or by pasting addresses. Both methods stay inert
// until that first call resolves: before it, /apply/<slug> 404s and
// sendApplicationInvitations refuses with { ok: false, notOpen: true }.
//
// There is deliberately no "copy the link before closing" warning here. The old
// InviteModal needed one because it showed the link exactly once; this link
// lives permanently in the invitation panel under the grid.
export function OpenApplicationsDialog({
  exchangeId, applySlug, open, onOpenChange, onOpened,
}: {
  exchangeId: string
  applySlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpened: (deadline: string) => void
}) {
  const t = useTranslations('organizer.applications.openDialog')
  const ta = useTranslations('organizer.applications')
  const c = useTranslations('common')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [opened, setOpened] = useState(false)
  const [copied, setCopied] = useState(false)

  // Reset transient state each time the dialog is opened.
  useEffect(() => {
    if (open) { setDeadline(''); setSaving(false); setOpened(false); setCopied(false) }
  }, [open])

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function chooseDeadline(next: string) {
    // Clearing a date input fires onChange with ''. Persisting that would close
    // the funnel behind the organizer's back — ignore it, same rule as the panel.
    if (!next) return
    setDeadline(next)
    setSaving(true)
    try {
      await setApplicationOpen(exchangeId, true, next)
      setOpened(true)
      onOpened(next)
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
    } catch {
      /* best-effort: the field is selectable for manual copy */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">{t('title')}</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="open-applications-deadline">{t('deadlineLabel')}</Label>
          <Input
            id="open-applications-deadline"
            type="date"
            value={deadline}
            disabled={saving}
            onChange={(e) => chooseDeadline(e.target.value)}
            className="h-12"
          />
        </div>

        <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('methodHeading')}
        </p>
        {!opened && (
          <p className="text-[13px] text-muted-foreground">{saving ? t('saving') : t('lockedHint')}</p>
        )}

        <div className={opened ? 'flex flex-col gap-4' : 'flex flex-col gap-4 opacity-50'}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="open-applications-link">{t('linkHeading')}</Label>
            <div className="flex gap-2">
              <Input
                id="open-applications-link"
                readOnly
                disabled={!opened}
                value={applyUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-12"
              />
              <Button type="button" variant="outline" disabled={!opened} onClick={copy} className="h-12 whitespace-nowrap">
                {copied ? ta('copiedCta') : ta('copyCta')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-navy">{t('emailHeading')}</span>
            <InviteByEmailForm exchangeId={exchangeId} disabled={!opened} resetKey={open} />
          </div>
        </div>

        <div className="mt-1.5 flex justify-end">
          {opened ? (
            <Button type="button" onClick={() => onOpenChange(false)}>{t('done')}</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">
              {c('actions.cancel')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/OpenApplicationsDialog.test.tsx`
Expected: PASS (6 tests).

If `getByRole('textbox', { name: '' })` is ambiguous because the read-only link `Input` is also a textbox, replace that one assertion with `expect(screen.getByPlaceholderText(/marie@ecole\.fr/)).toBeDisabled()` — the paste box is the only element carrying that placeholder.

- [ ] **Step 5: Commit**

```bash
git add components/applications/OpenApplicationsDialog.tsx components/applications/__tests__/OpenApplicationsDialog.test.tsx
git commit -m "feat(applications): one-screen open-applications dialog (deadline + link + emails)"
```

---

### Task 5: `InvitationPanel`

The old control bar, relocated under the grid as a collapsed native `<details>`. Purely presentational: `CandidaturesView` stays the sole owner of the open/deadline state and the `setApplicationOpen` calls, so there is exactly one source of truth for the empty-state gate.

**Files:**
- Create: `components/applications/InvitationPanel.tsx`
- Create: `components/applications/__tests__/InvitationPanel.test.tsx`

**Interfaces:**
- Consumes: `frShortDate(iso: string | null, opts?: { year?: boolean }): string` from `@/lib/dates`; keys from Task 1 plus the existing `organizer.applications.{stateOpen,stateClosed,deadlineLabel,linkLabel,copyCta,copiedCta}` and `organizer.applications.invite.openCta`.
- Produces:
  - `export type InvitationControls = { open: boolean; deadline: string; saving: boolean; onToggleOpen: () => void; onDeadlineChange: (next: string) => void }`
  - `export function InvitationPanel(props: { applyUrl: string; controls: InvitationControls; onInviteByEmail: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `components/applications/__tests__/InvitationPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { InvitationPanel, type InvitationControls } from '@/components/applications/InvitationPanel'

function controls(over: Partial<InvitationControls> = {}): InvitationControls {
  return {
    open: true,
    deadline: '2026-09-01',
    saving: false,
    onToggleOpen: vi.fn(),
    onDeadlineChange: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('InvitationPanel', () => {
  it('summarises the state and the deadline in the collapsed line', () => {
    renderWithIntl(<InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls()} onInviteByEmail={vi.fn()} />)
    expect(screen.getByText('Candidatures ouvertes')).toBeInTheDocument()
    expect(screen.getByText(/date limite 1 sept\./)).toBeInTheDocument()
  })

  it('says closed when applications are closed', () => {
    renderWithIntl(<InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls({ open: false })} onInviteByEmail={vi.fn()} />)
    expect(screen.getByText('Candidatures fermées')).toBeInTheDocument()
  })

  it('starts collapsed', () => {
    const { container } = renderWithIntl(
      <InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls()} onInviteByEmail={vi.fn()} />
    )
    expect(container.querySelector('details')?.open).toBe(false)
  })

  it('forwards the toggle and the deadline change to its owner', () => {
    const onToggleOpen = vi.fn()
    const onDeadlineChange = vi.fn()
    renderWithIntl(
      <InvitationPanel
        applyUrl="https://x.fr/apply/s"
        controls={controls({ onToggleOpen, onDeadlineChange })}
        onInviteByEmail={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ouvert' }))
    expect(onToggleOpen).toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-10-01' } })
    expect(onDeadlineChange).toHaveBeenCalledWith('2026-10-01')
  })

  it('exposes the apply link and the invite-by-email entry point', () => {
    const onInviteByEmail = vi.fn()
    renderWithIntl(
      <InvitationPanel applyUrl="https://x.fr/apply/s" controls={controls()} onInviteByEmail={onInviteByEmail} />
    )
    expect(screen.getByDisplayValue('https://x.fr/apply/s')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inviter par e-mail' }))
    expect(onInviteByEmail).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/InvitationPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/applications/InvitationPanel"`.

- [ ] **Step 3: Create the component**

Create `components/applications/InvitationPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { frShortDate } from '@/lib/dates'
import { Button } from '@/components/ui/button'

export type InvitationControls = {
  open: boolean
  deadline: string
  saving: boolean
  onToggleOpen: () => void
  onDeadlineChange: (next: string) => void
}

// The invitation controls, parked under the tracking grid so they stop
// competing with it. Native <details>/<summary>: the disclosure is keyboard-
// and screen-reader-correct without a line of state. The open/deadline state
// itself stays with CandidaturesView, which needs it for the empty-state gate.
export function InvitationPanel({
  applyUrl, controls, onInviteByEmail,
}: {
  applyUrl: string
  controls: InvitationControls
  onInviteByEmail: () => void
}) {
  const t = useTranslations('organizer.applications')
  const { open, deadline, saving, onToggleOpen, onDeadlineChange } = controls
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* best-effort: field is selectable for manual copy */
    }
  }

  return (
    <details className="mt-5 rounded-[11px] border bg-card px-4 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-tint-text' : 'bg-muted-foreground'}`} />
        <span className="font-medium text-navy">
          {open ? t('panel.summaryOpen') : t('panel.summaryClosed')}
        </span>
        {deadline && <span>{t('panel.deadlineSuffix', { date: frShortDate(deadline) })}</span>}
        <span className="ml-auto text-tertiary">⌄</span>
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3">
        <button
          type="button"
          disabled={saving}
          onClick={onToggleOpen}
          className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${
            open ? 'bg-tint text-tint-text' : 'bg-subtle text-muted-foreground'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-tint-text' : 'bg-muted-foreground'}`} />
          {open ? t('stateOpen') : t('stateClosed')}
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span id="candidatures-deadline-label">{t('deadlineLabel')}</span>
          <input
            aria-labelledby="candidatures-deadline-label"
            type="date"
            value={deadline}
            disabled={saving}
            onChange={(e) => onDeadlineChange(e.target.value)}
            className="h-[34px] rounded-[8px] border px-2.5 text-[13px]"
          />
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          <label htmlFor="candidatures-invite-link" className="text-[12.5px] text-muted-foreground whitespace-nowrap">
            {t('linkLabel')}
          </label>
          <input
            id="candidatures-invite-link"
            type="text"
            readOnly
            value={applyUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-[34px] w-[220px] max-w-full rounded-[8px] border bg-subtle px-2.5 text-[13px] text-muted-foreground"
          />
          <button
            type="button"
            onClick={copyLink}
            className="h-[34px] whitespace-nowrap rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white"
          >
            {copied ? t('copiedCta') : t('copyCta')}
          </button>
          <Button type="button" variant="outline" onClick={onInviteByEmail} className="h-[34px] whitespace-nowrap text-[12.5px]">
            {t('invite.openCta')}
          </Button>
        </div>
      </div>
    </details>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/InvitationPanel.test.tsx`
Expected: PASS (5 tests).

Note on the collapsed-state assertions: jsdom keeps `<details>` children in the DOM regardless of the `open` attribute, so Testing Library finds the controls whether expanded or not. That is why the "starts collapsed" test reads `details.open` directly rather than querying for hidden text.

- [ ] **Step 5: Commit**

```bash
git add components/applications/InvitationPanel.tsx components/applications/__tests__/InvitationPanel.test.tsx
git commit -m "feat(applications): collapsed invitation panel for below the grid"
```

---

### Task 6: Rewire `CandidaturesView` and the page

Adds the empty-state branch, moves the bar below the grid as `InvitationPanel`, mounts `OpenApplicationsDialog`, and lets `?tab=` pick the initial tab.

**Files:**
- Modify: `components/applications/CandidaturesView.tsx`
- Modify: `app/(organizer)/applications/page.tsx`
- Test: `components/applications/__tests__/CandidaturesView.test.tsx`

**Interfaces:**
- Consumes: `OpenApplicationsDialog` (Task 4), `InvitationPanel` + `InvitationControls` (Task 5), `parseTab` + `TabKey` (Task 2).
- Produces: `CandidaturesView` gains an optional prop `initialTab?: TabKey` (defaults to `'all'`). All other props are unchanged.

- [ ] **Step 1: Write the failing tests**

Append these five tests inside the existing `describe('CandidaturesView', …)` block in `components/applications/__tests__/CandidaturesView.test.tsx`, just before its closing `})`:

```tsx
  it('shows only the invite CTA when applications never opened and nobody applied', () => {
    renderWithIntl(<CandidaturesView apps={[]} exchangeName="Espagne" exchangeId="ex1" applicationOpen={false} applicationDeadline={null} applySlug="espagne-2026" />)
    expect(screen.getByRole('heading', { name: 'Invitez vos élèves à postuler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inviter vos élèves à postuler' })).toBeInTheDocument()
    expect(screen.queryByText('Candidatures ouvertes')).toBeNull()
    expect(screen.queryByText('Candidatures fermées')).toBeNull()
    expect(screen.queryByRole('button', { name: /Toutes/ })).toBeNull()
  })

  it('keeps the grid and the panel once applications are open, even with nobody yet', () => {
    renderWithIntl(<CandidaturesView apps={[]} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    expect(screen.queryByRole('heading', { name: 'Invitez vos élèves à postuler' })).toBeNull()
    expect(screen.getByText('Candidatures ouvertes')).toBeInTheDocument()
  })

  it('existing applications suppress the empty state even if applications never opened', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen={false} applicationDeadline={null} applySlug="espagne-2026" />)
    expect(screen.queryByRole('heading', { name: 'Invitez vos élèves à postuler' })).toBeNull()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
  })

  it('opening applications from the dialog leaves the empty state without unmounting the dialog', async () => {
    renderWithIntl(<CandidaturesView apps={[]} exchangeName="Espagne" exchangeId="ex1" applicationOpen={false} applicationDeadline={null} applySlug="espagne-2026" />)
    fireEvent.click(screen.getByRole('button', { name: 'Inviter vos élèves à postuler' }))
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    // The dialog survives the flip and reaches its opened state…
    expect(await screen.findByRole('button', { name: 'Terminé' })).toBeInTheDocument()
    // …and the page behind it is now the grid with its panel.
    expect(screen.getByText('Candidatures ouvertes')).toBeInTheDocument()
  })

  it('honours initialTab', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" initialTab="rejected" />)
    expect(screen.getByText('r@r.fr')).toBeInTheDocument()
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/CandidaturesView.test.tsx`
Expected: FAIL — the empty-state heading is not found, `initialTab` is not a known prop.

- [ ] **Step 3: Add the imports and the new state to `CandidaturesView`**

In `components/applications/CandidaturesView.tsx`, add these imports alongside the existing component imports:

```tsx
import { InvitationPanel, type InvitationControls } from '@/components/applications/InvitationPanel'
import { OpenApplicationsDialog } from '@/components/applications/OpenApplicationsDialog'
```

Add `initialTab` to the props destructuring and the prop type:

```tsx
export function CandidaturesView({
  apps,
  exchangeName,
  exchangeId,
  applicationOpen,
  applicationDeadline,
  applySlug,
  initialTab,
}: {
  apps: AppRow[]
  exchangeName: string
  exchangeId: string
  applicationOpen: boolean
  applicationDeadline: string | null
  applySlug: string
  initialTab?: TabKey
}) {
```

Change the tab state initialiser and add the dialog state — replace:

```tsx
  const [tab, setTab] = useState<TabKey>('all')
```

with:

```tsx
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'all')
```

and add, next to the other `useState` calls:

```tsx
  const [openDialog, setOpenDialog] = useState(false)
```

Delete the now-unused `copied` state and the `copyLink` function (lines 61 and 105-113 of the original file) — both moved into `InvitationPanel`.

- [ ] **Step 4: Add the gate, the controls object and the opened handler**

Immediately after the `changeDeadline` function, add:

```tsx
  // An organizer who has opened applications must keep seeing the link and the
  // deadline even before anyone applies — hence all three conditions, not just
  // an empty list. `deadline` is '' exactly when applicationDeadline was null.
  const neverOpened = apps.length === 0 && !open && !deadline

  function handleOpened(next: string) {
    setOpen(true)
    setDeadline(next)
  }

  const controls: InvitationControls = {
    open,
    deadline,
    saving: savingState,
    onToggleOpen: toggleOpen,
    onDeadlineChange: changeDeadline,
  }
```

- [ ] **Step 5: Restructure the return**

Replace the whole `return ( … )` block. The outer fragment matters: `OpenApplicationsDialog` is mounted **outside** the `neverOpened` branch so that opening applications — which flips `neverOpened` — cannot unmount the dialog mid-flow and strand the organizer before they have copied a link or sent an email.

The new structure is:

```tsx
  return (
    <>
      {neverOpened ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">
            {tr('organizer.applications.empty.title')}
          </h1>
          <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">
            {tr('organizer.applications.empty.body')}
          </p>
          <button
            type="button"
            onClick={() => setOpenDialog(true)}
            className="mt-6 flex h-[42px] items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            {tr('organizer.applications.empty.cta')}
          </button>
        </div>
      ) : (
        <div>
          {/* heading + subtitle: unchanged from the original lines 178-183 */}
          {/* tab bar: unchanged from the original lines 233-251 */}
          {/* bulk bar: unchanged from the original lines 253-315 */}
          {/* bulk result: unchanged from the original lines 317-321 */}
          {/* grid card: unchanged from the original lines 323-365 */}
          <InvitationPanel applyUrl={applyUrl} controls={controls} onInviteByEmail={() => setInviteOpen(true)} />
        </div>
      )}
      <OpenApplicationsDialog
        exchangeId={exchangeId}
        applySlug={applySlug}
        open={openDialog}
        onOpenChange={setOpenDialog}
        onOpened={handleOpened}
      />
      <InviteByEmailDialog exchangeId={exchangeId} open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
```

Concretely: keep the original JSX from the `<h1>` through the closing `</div>` of the grid card verbatim, delete the old control-bar `<div className="flex flex-wrap items-center gap-4 bg-card border rounded-[11px] px-4 py-2.5 mb-5"> … </div>` (original lines 185-231) entirely, and put `<InvitationPanel …/>` after the grid card instead.

- [ ] **Step 5b: Run the view tests**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/applications/__tests__/CandidaturesView.test.tsx`
Expected: PASS (14 tests — the 9 originals plus the 5 new ones). The original deadline/toggle tests now exercise the controls through `InvitationPanel`; they pass unchanged because jsdom keeps `<details>` children queryable.

- [ ] **Step 6: Wire `?tab=` in the page**

Replace `app/(organizer)/applications/page.tsx` with:

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { listApplications, getApplicationForReview } from '@/actions/applications-review'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { parseTab } from '@/lib/applications/tabs'
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import { ApplicationDetail } from '@/components/applications/ApplicationDetail'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import type { AppRow } from '@/lib/dashboard/rollup'

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ id?: string; tab?: string }> }) {
  const { id, tab } = await searchParams
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  if (id) {
    const { application, photoUrl } = await getApplicationForReview(id)
    return <ApplicationDetail application={application} photoUrl={photoUrl} exchangeName={active.name} year={active.year} />
  }

  const applications = await listApplications(active.id, { withPhotos: true })
  const apps: AppRow[] = applications.map(a => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at,
    data: a.data ?? {}, email: a.email, photoUrl: a.photoUrl ?? null,
  }))
  return (
    <CandidaturesView
      apps={apps}
      exchangeName={active.name}
      exchangeId={active.id}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
      applySlug={active.apply_slug}
      initialTab={parseTab(tab)}
    />
  )
}
```

This is an async server component; it has no jsdom test (rendering async RSC as JSX breaks under jsdom). `pnpm build` in Task 9 is its type and compile check.

- [ ] **Step 7: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/applications/CandidaturesView.tsx components/applications/__tests__/CandidaturesView.test.tsx "app/(organizer)/applications/page.tsx"
git commit -m "feat(applications): blank-with-one-CTA empty state, invitation panel under the grid, ?tab= deep link"
```

---

### Task 7: Overview cleanups (B5, B6, B7, B9)

Removes the prepare-forms CTA, shortens the start copy, turns the remaining CTA into a link to `/applications`, deletes the now-unreachable `InviteModal`, and gives the lifecycle table a column gap.

**Files:**
- Modify: `components/dashboard/OverviewView.tsx`
- Delete: `components/dashboard/InviteModal.tsx`
- Delete: `components/dashboard/__tests__/InviteModal.test.tsx`
- Modify: `components/dashboard/__tests__/OverviewView.test.tsx`
- Modify: `messages/en.json`, `messages/fr.json`, `messages/de.json`, `messages/es.json`, `messages/it.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `organizer.dashboard.prepareFormsCta` and the whole `organizer.dashboard.inviteModal` block no longer exist. `organizer.dashboard.inviteCta` now reads "Go to Applications".

- [ ] **Step 1: Update the five catalogs**

In each of `messages/{en,fr,de,es,it}.json`, inside `organizer.dashboard`:
1. **Delete** the entire `"inviteModal": { … }` object.
2. **Delete** the `"prepareFormsCta"` line.
3. **Replace** the `"startBody"` and `"inviteCta"` values as follows.

| locale | `startBody` | `inviteCta` |
|---|---|---|
| en | `Start your exchange by inviting your students to apply.` | `Go to Applications` |
| fr | `Commencez votre échange en invitant vos élèves à postuler.` | `Aller aux candidatures` |
| de | `Starten Sie Ihren Austausch, indem Sie Ihre Schüler zur Bewerbung einladen.` | `Zu den Bewerbungen` |
| es | `Empiece su intercambio invitando a sus alumnos a postularse.` | `Ir a las candidaturas` |
| it | `Inizia il tuo scambio invitando i tuoi studenti a candidarsi.` | `Vai alle candidature` |

- [ ] **Step 2: Update `OverviewView.tsx`**

Delete the import at line 22:

```tsx
import { InviteModal } from '@/components/dashboard/InviteModal'
```

Delete the state at line 65:

```tsx
  const [inviteOpen, setInviteOpen] = useState(false)
```

Add the column gap at line 36 — replace:

```tsx
const GRID = 'grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px]'
```

with:

```tsx
// gap-x-5 is load-bearing, not decoration: without it the Application column's
// status pill sits flush against the Forms column's em-dash placeholder.
const GRID = 'grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px] gap-x-5'
```

Replace the comment block at lines 78-83 with just its still-true half:

```tsx
  // Directly-invited students (rows > 0) must see the table even if applications
  // never opened — hence the rows.length guard.
  const neverOpened = !applicationOpen && applicationDeadline == null && rows.length === 0
```

Replace the empty-state CTA row (original lines 122-136, the `<div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">` block and everything inside it) with a single link:

```tsx
          <Link
            href="/applications"
            className="mt-6 flex h-[42px] items-center rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            {t('dashboard.inviteCta')}
          </Link>
```

Finally, change the closing fragment (original lines 289-294) — drop the `InviteModal` render:

```tsx
      <StudentDrawer subject={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Delete the modal and its test**

```bash
git rm components/dashboard/InviteModal.tsx components/dashboard/__tests__/InviteModal.test.tsx
```

- [ ] **Step 4: Update `OverviewView.test.tsx`**

Delete the `InviteModal` mock (lines 9-11) and the now-unused `NextIntlClientProvider` / `fr` imports (lines 3-4).

Delete these three tests outright: `'CTA opens the invite modal'`, `'empty state offers both CTAs: invite (primary) and prepare forms & documents (link to /forms)'`, and `'keeps the invite modal mounted when opening applications flips neverOpened'`.

Add this test in their place:

```tsx
  it('empty state offers exactly one CTA: a link to the Applications page', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('link', { name: 'Aller aux candidatures' })).toHaveAttribute('href', '/applications')
    expect(screen.queryByRole('link', { name: /Préparer les formulaires & documents/ })).toBeNull()
    expect(screen.getByText('Commencez votre échange en invitant vos élèves à postuler.')).toBeInTheDocument()
  })

  it('gives the lifecycle table a column gap so the pill never touches the next column', () => {
    const { container } = renderWithIntl(<OverviewView {...base} />)
    const header = container.querySelector('.grid-cols-\\[1\\.7fr_1\\.15fr_1fr_1fr_1fr_22px\\]')
    expect(header?.className).toContain('gap-x-5')
  })
```

- [ ] **Step 5: Run the dashboard tests**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/dashboard/__tests__`
Expected: PASS. `OverviewView.test.tsx` now has 15 tests; `InviteModal.test.tsx` is gone.

If the `.grid-cols-…` selector proves awkward to escape, replace the second test's query with `container.querySelector('[class*="1.7fr"]')` — the intent is only to assert `gap-x-5` reaches the rendered grid.

- [ ] **Step 6: Run the parity test**

Run: `pnpm exec vitest run --exclude '**/.claude/**' messages/__tests__/parity.test.ts`
Expected: PASS — the removals landed in all five catalogs.

- [ ] **Step 7: Confirm nothing still references the deleted keys**

Run: `grep -rn "inviteModal\|prepareFormsCta\|InviteModal" --include=*.ts --include=*.tsx --include=*.json app components lib messages actions`
Expected: **no output**.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/__tests__/OverviewView.test.tsx messages/en.json messages/fr.json messages/de.json messages/es.json messages/it.json
git commit -m "feat(dashboard): point the start CTA at Applications, drop the prepare-forms CTA and the invite modal, space the lifecycle grid"
```

---

### Task 8: Deep-link the Review action card (B8)

**Files:**
- Modify: `lib/dashboard/rollup.ts:308-314`
- Test: `lib/dashboard/__tests__/rollup.test.ts`
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: the existing `ActionCard` type — `{ title: string; desc: string; cta: string; tone: 'accent' | 'warn' | 'bad'; filterKey: string; href?: string }`. No signature change; `OverviewView`'s existing `card.href ? <Link> : <button>` branch renders it as a link with no further edit.
- Produces: the `toreview` card now carries `href: '/applications?tab=toreview'`.

- [ ] **Step 1: Write the failing test**

Add to `lib/dashboard/__tests__/rollup.test.ts` inside `describe('lifecycleActionCards', …)`:

```ts
  it('deep-links the to-review card to the Applications page, To review tab', () => {
    const cards = lifecycleActionCards([app('submitted')], [], 3, t)
    expect(cards.map(c => c.filterKey)).toEqual(['toreview'])
    expect(cards[0].href).toBe('/applications?tab=toreview')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --exclude '**/.claude/**' lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `expected undefined to be '/applications?tab=toreview'`.

- [ ] **Step 3: Add the href**

In `lib/dashboard/rollup.ts`, replace the to-review card push:

```ts
  const a = apps.filter(x => x.status === 'submitted').length
  if (a > 0) {
    cards.push({
      title: t('organizer.dashboard.actionCards.toReviewTitle', { n: a }),
      desc: t('organizer.dashboard.actionCards.toReviewDesc'),
      cta: t('organizer.dashboard.actionCards.toReviewCta'), tone: 'accent', filterKey: 'toreview',
      // Reviewing happens on the Applications page, not by filtering the table
      // behind this card. filterKey stays as the React key.
      href: '/applications?tab=toreview',
    })
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run --exclude '**/.claude/**' lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the Overview test that clicked it as a button**

In `components/dashboard/__tests__/OverviewView.test.tsx`, the test `'action card click applies its filter'` clicks `getByRole('button', { name: 'Examiner' })`, which is now a link. Replace that whole test with:

```tsx
  it('the review card is a deep link to the Applications page, not a table filter', () => {
    renderWithIntl(<OverviewView {...base} />)
    expect(screen.getByRole('link', { name: 'Examiner' })).toHaveAttribute('href', '/applications?tab=toreview')
    expect(screen.queryByRole('button', { name: 'Examiner' })).toBeNull()
  })

  it('filter-style action cards still filter the table', () => {
    renderWithIntl(<OverviewView {...base} />)
    // `base` is late with missing docs, so the « Relancer » card is a button.
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(screen.getByRole('button', { name: /Filtre :/ })).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run the dashboard tests**

Run: `pnpm exec vitest run --exclude '**/.claude/**' components/dashboard/__tests__`
Expected: PASS (16 tests in `OverviewView.test.tsx`).

- [ ] **Step 7: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): Review deep-links to Applications, To review tab"
```

---

### Task 9: Full gate

**Files:** none modified unless a gate step fails.

- [ ] **Step 1: Confirm the branch**

Run: `git branch --show-current`
Expected: `feature/applications-home`. If it is anything else, **stop and report** — do not commit.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. Unused-import warnings in `OverviewView.tsx` or `CandidaturesView.tsx` mean a Task 6/7 deletion was incomplete — remove the dead import.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: all tests pass. If a single file fails once and passes on re-run, that is a neighbouring session mid-write, not a real failure — re-run that file alone before debugging.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: build succeeds. This is the only check on `app/(organizer)/applications/page.tsx`.

If the build fails with a shifting ENOENT filename under `.next/`, orphaned `next-server` workers from an earlier failed build are racing the directory: find them by their `/proc/<pid>/cwd` pointing at this worktree and kill those PIDs specifically — never `pkill -f "next build"`.

- [ ] **Step 5: Final accent guard**

Run: `grep -nP '[\x{FFFD}]|Ã©|Ã¨|Ã |Ã§' messages/*.json`
Expected: **no output**.

- [ ] **Step 6: Review the diff for stray files**

Run: `git diff --stat main...HEAD`
Expected: only the files named in Tasks 1-8, plus the spec and this plan. No `.env*`, no `types/supabase.ts`, no student data.

- [ ] **Step 7: Report**

Report to Bjorn: the gate results verbatim (test counts, build outcome), and that the browser check is still outstanding — the empty state, the one-screen dialog, the collapsed panel and the B9 spacing are all visual and no jsdom test proves they look right. Merging to `main` needs his confirmation.

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| A1 landing page (no-op, parallel session) | — (stated in Task 6 notes and the spec) |
| A2 empty state + gate | 6 |
| A3 `OpenApplicationsDialog` | 4 |
| A3 shared `InviteByEmailForm` | 3 |
| A4 `InvitationPanel` | 5 |
| State ownership in `CandidaturesView` | 6 |
| Deep-linkable `?tab=` | 2 (parse) + 6 (wire) |
| B5 remove prepare-forms CTA | 7 |
| B6 shorten `startBody` | 7 |
| B7 `inviteCta` → link | 7 |
| B8 review card href | 8 |
| B9 grid gap | 7 |
| Copy in five locales | 1 (adds) + 7 (edits/removals) |
| Testing | each task + 9 |

**Deviations from the spec, deliberate:**
- The spec's key list did not include `openDialog.lockedHint`; it was added so the muted sections explain themselves rather than looking broken.
- The spec named `panel.deadlineSuffix`; the plan keeps that name.
- The mockup showed `[Cancel] [Done]` side by side. The plan renders one contextual button — Cancel before applications open, Terminé after — because after opening there is nothing left to cancel and two buttons that both close would be a coin flip. Flag this to Bjorn at review.
- `lib/applications/tabs.ts` (Task 2) was not in the spec's file list. It exists because the spec's `?tab=` validation happens in a server component that should not import from a `'use client'` module.

**Type consistency:** `InvitationControls` is defined in Task 5 and consumed in Task 6 with the same five fields. `InviteByEmailForm`'s `{ exchangeId, disabled, resetKey, children }` is defined in Task 3 and used with exactly those names in Tasks 3 and 4. `TabKey` / `parseTab` are defined in Task 2 and consumed in Task 6. `onOpened(deadline: string)` is defined in Task 4 and implemented as `handleOpened(next: string)` in Task 6.
