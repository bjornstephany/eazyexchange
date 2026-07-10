# Instant Tab Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make switching between the six organizer rail tabs paint instantly in production, with content-shaped skeletons (never the branded splash) on the rare cache miss.

**Architecture:** Enable Next 15's client router cache for dynamic pages (`experimental.staleTimes.dynamic: 180`) and prefetch the six always-visible rail links (`prefetch={true}`), so tab payloads are already client-side when clicked. Replace the route-group splash with per-tab `loading.tsx` skeletons; re-export the splash at the three deep child segments so detail pages keep today's behavior. Existing freshness mechanisms (`revalidatePath` in server actions, `SessionSelector` revalidation, `ReturnPoller.refresh`) are untouched and load-bearing; an audit task verifies their coverage.

**Tech Stack:** Next.js 15.5.20 (App Router), React, Tailwind, Vitest + Testing Library (jsdom, `globals: true` — no test imports of `describe/it/expect` needed).

**Spec:** `docs/superpowers/specs/2026-07-10-instant-tab-switching-design.md`

## Global Constraints

- Package manager is **pnpm**. No new dependencies.
- All user-visible copy is **French** (skeletons: `aria-label="Chargement"`).
- Work on branch `feature/instant-tab-switching` (created in Task 1, Step 1).
- `pnpm build` fails locally (placeholder `.env.local`); use `npx tsc --noEmit` locally — the real build runs in CI.
- Locked decisions from the spec: `staleTimes.dynamic: 180`; only the six rail links get `prefetch={true}` (the `/settings` dropdown link keeps the default); cold entry to `/dashboard` shows the dashboard skeleton, not the splash; deeper pages (`exchanges/[id]`, `forms/[templateId]`, `documents/[templateId]`) keep the splash.
- Stage files by name (`git add <paths>`) — never `git add -A`.

---

### Task 1: Router-cache config + rail prefetch

**Files:**
- Modify: `next.config.mjs` (whole file — currently an empty config)
- Modify: `components/shell/OrganizerShell.tsx:51-52` (the `<Link>` inside `RailItem`)
- Test: `components/shell/__tests__/RailPrefetch.test.tsx` (create)

**Interfaces:**
- Consumes: existing `OrganizerShell` props (unchanged).
- Produces: no exports consumed by later tasks. `RailItem`'s `<Link>` carries `prefetch={true}`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/instant-tab-switching
```

- [ ] **Step 2: Write the failing test**

Create `components/shell/__tests__/RailPrefetch.test.tsx`. It is a separate file from `OrganizerShell.test.tsx` because it mocks `next/link` (the real one doesn't render `prefetch` to the DOM); the existing file's tests must keep using the real `next/link`.

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))
vi.mock('@/components/shell/FeedbackModal', () => ({
  FeedbackModal: () => null,
}))
// Expose the prefetch prop as a DOM attribute so it can be asserted.
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }: any) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, archived: false }]

describe('rail prefetch', () => {
  it('every rail tab prefetches its full payload', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    for (const label of ['Aperçu', 'Échanges', 'Candid.', 'Formul.', 'Docs', 'Élèves']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-prefetch', 'true')
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test components/shell/__tests__/RailPrefetch.test.tsx`
Expected: FAIL — `data-prefetch` is `"undefined"`, not `"true"`.

- [ ] **Step 4: Implement**

In `components/shell/OrganizerShell.tsx`, add `prefetch` to the `RailItem` link (only this link — not the `/settings` link in the avatar menu):

```tsx
    <Link
      href={href}
      prefetch={true}
```

Replace `next.config.mjs` entirely with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Client router cache: dynamic pages stay reusable for 3 min after a
    // visit; the rail's prefetch={true} entries get the 5-min static window.
    // Own mutations stay fresh via revalidatePath in server actions.
    staleTimes: { dynamic: 180 },
  },
}

export default nextConfig
```

- [ ] **Step 5: Run tests to verify they pass (including the untouched shell suite)**

Run: `pnpm test components/shell`
Expected: PASS, all files.

- [ ] **Step 6: Commit**

```bash
git add next.config.mjs components/shell/OrganizerShell.tsx components/shell/__tests__/RailPrefetch.test.tsx
git commit -m "feat: prefetch rail tabs + enable dynamic router-cache reuse (staleTimes 180s)"
```

---

### Task 2: Skeleton primitive

**Files:**
- Create: `components/ui/skeleton.tsx`
- Test: `components/ui/__tests__/skeleton.test.tsx` (create)

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `export function Skeleton(props: React.HTMLAttributes<HTMLDivElement>)` — a `div` with `animate-pulse rounded-md bg-subtle` merged with `props.className`. Task 3 imports it as `import { Skeleton } from '@/components/ui/skeleton'`.

- [ ] **Step 1: Write the failing test**

Create `components/ui/__tests__/skeleton.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from '@/components/ui/skeleton'

describe('Skeleton', () => {
  it('renders a shimmer block and merges caller classes', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('animate-pulse')
    expect(el.className).toContain('h-4')
    expect(el.className).toContain('w-32')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/ui/__tests__/skeleton.test.tsx`
Expected: FAIL — cannot resolve `@/components/ui/skeleton`.

- [ ] **Step 3: Implement**

Create `components/ui/skeleton.tsx` (shadcn-style, matches the house `components/ui/*` idiom):

```tsx
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-subtle', className)} {...props} />
}

export { Skeleton }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/ui/__tests__/skeleton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/skeleton.tsx components/ui/__tests__/skeleton.test.tsx
git commit -m "feat: add Skeleton primitive"
```

---

### Task 3: Per-tab loading skeletons + deep-route splash re-exports

**Files:**
- Create: `app/(organizer)/dashboard/loading.tsx`
- Create: `app/(organizer)/exchanges/loading.tsx`
- Create: `app/(organizer)/applications/loading.tsx`
- Create: `app/(organizer)/forms/loading.tsx`
- Create: `app/(organizer)/documents/loading.tsx`
- Create: `app/(organizer)/students/loading.tsx`
- Create: `app/(organizer)/exchanges/[id]/loading.tsx`
- Create: `app/(organizer)/forms/[templateId]/loading.tsx`
- Create: `app/(organizer)/documents/[templateId]/loading.tsx`
- Test: `app/__tests__/organizer-loading-skeletons.test.tsx` (create)

**Interfaces:**
- Consumes: `Skeleton` from `@/components/ui/skeleton` (Task 2); `LoadingState` from `@/components/LoadingState` (existing).
- Produces: nine default-export React components; nothing else consumes them (Next.js wires `loading.tsx` automatically).

**Why the three `[id]`/`[templateId]` files exist:** a segment-level `loading.tsx` cascades to child segments. Without them, `exchanges/[id]`, `forms/[templateId]` and `documents/[templateId]` would show the parent's list skeleton; the spec locks these deep pages to the existing splash. Each re-exports the splash explicitly. (`app/(organizer)/loading.tsx` — the splash — stays untouched and still covers `/settings` and any future sibling route.)

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/organizer-loading-skeletons.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardLoading from '@/app/(organizer)/dashboard/loading'
import ExchangesLoading from '@/app/(organizer)/exchanges/loading'
import ApplicationsLoading from '@/app/(organizer)/applications/loading'
import FormsLoading from '@/app/(organizer)/forms/loading'
import DocumentsLoading from '@/app/(organizer)/documents/loading'
import StudentsLoading from '@/app/(organizer)/students/loading'
import ExchangeDetailLoading from '@/app/(organizer)/exchanges/[id]/loading'
import FormDetailLoading from '@/app/(organizer)/forms/[templateId]/loading'
import DocDetailLoading from '@/app/(organizer)/documents/[templateId]/loading'

const skeletons = [
  ['dashboard', DashboardLoading],
  ['exchanges', ExchangesLoading],
  ['applications', ApplicationsLoading],
  ['forms', FormsLoading],
  ['documents', DocumentsLoading],
  ['students', StudentsLoading],
] as const

describe('rail tab skeletons', () => {
  it.each(skeletons)('%s renders an accessible shimmer, not the splash', (_name, Loading) => {
    const { container, unmount } = render(<Loading />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Chargement')
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeNull()
    unmount()
  })
})

describe('deep-route loading keeps the splash', () => {
  it.each([
    ['exchanges/[id]', ExchangeDetailLoading],
    ['forms/[templateId]', FormDetailLoading],
    ['documents/[templateId]', DocDetailLoading],
  ] as const)('%s renders the branded splash', (_name, Loading) => {
    const { unmount } = render(<Loading />)
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeInTheDocument()
    unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/__tests__/organizer-loading-skeletons.test.tsx`
Expected: FAIL — cannot resolve the nine `loading` modules.

- [ ] **Step 3: Implement the six tab skeletons**

Skeletons render inside the shell's `<main className="flex-1 overflow-auto px-7 pb-10 pt-[26px]">`, so they add no page padding. Shapes mirror each view's real layout (per spec: neutral shimmer only, no text, no pixel-perfection).

`app/(organizer)/dashboard/loading.tsx` (mirrors `OverviewView`: header, stat/funnel tiles, roster grid):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1180px]">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[14px]" />
    </div>
  )
}
```

`app/(organizer)/exchanges/loading.tsx` (mirrors `ExchangesView`: header, card list):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function ExchangesLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1040px]">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
        ))}
      </div>
    </div>
  )
}
```

`app/(organizer)/applications/loading.tsx` (mirrors `CandidaturesView`: header, toolbar card, table rows):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function ApplicationsLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1180px]">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-4 h-4 w-96 max-w-full" />
      <Skeleton className="mb-5 h-12 rounded-[11px]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-[9px]" />
        ))}
      </div>
    </div>
  )
}
```

`app/(organizer)/forms/loading.tsx` (mirrors `FormsView`: header, card grid):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function FormsLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1040px]">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-[14px]" />
        ))}
      </div>
    </div>
  )
}
```

`app/(organizer)/documents/loading.tsx` (mirrors `DocsView` — same shape as forms):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DocumentsLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1040px]">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-[14px]" />
        ))}
      </div>
    </div>
  )
}
```

`app/(organizer)/students/loading.tsx` (mirrors `StudentsView`: header, table rows):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function StudentsLoading() {
  return (
    <div role="status" aria-label="Chargement" className="max-w-[1180px]">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-[9px]" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the three deep-route splash files**

All three files have identical content except the function name.

`app/(organizer)/exchanges/[id]/loading.tsx`:

```tsx
import { LoadingState } from '@/components/LoadingState'

// The parent segment's loading.tsx is a list skeleton; detail pages keep the
// branded splash (spec: deeper pages are out of skeleton scope).
export default function ExchangeDetailLoading() {
  return <LoadingState />
}
```

`app/(organizer)/forms/[templateId]/loading.tsx`:

```tsx
import { LoadingState } from '@/components/LoadingState'

// The parent segment's loading.tsx is a list skeleton; detail pages keep the
// branded splash (spec: deeper pages are out of skeleton scope).
export default function FormDetailLoading() {
  return <LoadingState />
}
```

`app/(organizer)/documents/[templateId]/loading.tsx`:

```tsx
import { LoadingState } from '@/components/LoadingState'

// The parent segment's loading.tsx is a list skeleton; detail pages keep the
// branded splash (spec: deeper pages are out of skeleton scope).
export default function DocumentDetailLoading() {
  return <LoadingState />
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test app/__tests__/organizer-loading-skeletons.test.tsx`
Expected: PASS (9 assertions across the two describes).

- [ ] **Step 6: Commit**

```bash
git add "app/(organizer)/dashboard/loading.tsx" "app/(organizer)/exchanges/loading.tsx" "app/(organizer)/applications/loading.tsx" "app/(organizer)/forms/loading.tsx" "app/(organizer)/documents/loading.tsx" "app/(organizer)/students/loading.tsx" "app/(organizer)/exchanges/[id]/loading.tsx" "app/(organizer)/forms/[templateId]/loading.tsx" "app/(organizer)/documents/[templateId]/loading.tsx" app/__tests__/organizer-loading-skeletons.test.tsx
git commit -m "feat: content-shaped loading skeletons for the six rail tabs (splash kept on detail routes)"
```

---

### Task 4: Freshness audit (verification task — expected no-op)

**Files:**
- Read: `actions/*.ts` (all 8 files with `revalidatePath` calls), any client component calling `router.push` after a data write.
- Modify: only if a gap is found — add the missing `revalidatePath('<path>')` call next to the mutation, in the same style as the file's existing calls.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: an audit verdict recorded in the task report/commit; zero or more `revalidatePath` additions.

**Why:** with `staleTimes.dynamic: 180`, a cached tab is only refreshed early if a server action revalidates it. Any mutation whose result shows on a tab it doesn't revalidate would look stale for up to 3–5 min.

- [ ] **Step 1: List every mutation and its revalidation set**

```bash
grep -n "revalidatePath" actions/*.ts
```

For each exported mutating action, note which rail tabs display its result. The matrix to verify (result surface → required paths):

| Mutation (action file) | Must revalidate |
|---|---|
| accept/reject application (`applications.ts`) | `/applications`, `/dashboard`, `/students` |
| create/update/archive exchange (`exchanges.ts`) | `/exchanges`, `/dashboard` (and the layout's exchange list — a `revalidatePath('/', 'layout')` or per-path calls) |
| create/update/delete form template, assignment (`forms.ts`) | `/forms`, `/dashboard` |
| document template changes (`forms.ts` or `students.ts` — locate via grep) | `/documents`, `/dashboard` |
| approve/reject submission (`submissions.ts`) | `/dashboard`, `/students`, student-side `/my-forms` |
| invite/remove student (`students.ts`) | `/students`, `/dashboard` |
| settings/profile changes (`settings.ts`) | `/settings` + any tab showing the changed value |
| active-exchange switch (`session.ts`) | whole tree (already does — verified during brainstorming) |

A path counts as covered if the action revalidates it directly, revalidates an ancestor with `'layout'` scope, or the flow always goes through a full `redirect()`.

- [ ] **Step 2: Check client-side navigations after writes**

```bash
grep -rn "router.push" components app --include="*.tsx" | grep -v __tests__
```

For each hit, confirm the pushed route doesn't display data written immediately before the push *outside* a server action (server-action writes are covered by their own `revalidatePath`). Known-safe: `ReturnPoller` uses `router.refresh()`; sign-out pushes to `/login` then refreshes.

- [ ] **Step 3: Fix any gap found**

Add the missing call next to the mutation, matching the file's existing style, e.g.:

```ts
revalidatePath('/students')
```

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm test`
Expected: PASS (same count as before this task, plus nothing broken).

- [ ] **Step 5: Commit (only if Step 3 changed files)**

```bash
git add actions/<changed-file>.ts
git commit -m "fix: revalidate <tab> after <mutation> (freshness audit)"
```

If no gaps: record "audit clean — no changes" in the task report; no commit.

---

### Task 5: Gate, PR, preview verification

**Files:** none created; runs the verification gate and opens the PR.

**Interfaces:**
- Consumes: all previous tasks merged into the branch.
- Produces: a green gate, a pushed branch, an open PR. **Merging requires Bjorn's confirmation** (CLAUDE.md: merges deploy prod via CI).

- [ ] **Step 1: Full local gate**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: lint clean, all tests pass, no type errors. (`pnpm build` runs in CI — it fails locally on placeholder envs.)

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feature/instant-tab-switching
gh pr create --title "Instant organizer tab switching" --body "$(cat <<'EOF'
Router-cache reuse for dynamic pages (staleTimes.dynamic 180s) + prefetch={true} on the six rail tabs + content-shaped loading skeletons (splash kept for detail routes and /settings). Freshness audit of revalidatePath coverage included.

Spec: docs/superpowers/specs/2026-07-10-instant-tab-switching-design.md
Plan: docs/superpowers/plans/2026-07-10-instant-tab-switching.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Preview verification (staging-backed)**

On the PR's Vercel preview (log in as `demo-organizer@example.com`; preview URLs are SSO-protected for curl — use the browser or vercel MCP `web_fetch`):

1. Click all six rail tabs twice each — revisits paint instantly, no splash, no skeleton.
2. Hard-reload, then immediately click an unvisited tab — instant (prefetched) or brief skeleton; never the splash.
3. Make an edit (e.g. toggle a setting or accept an application on staging data), switch tabs — the change is visible immediately.
4. Open `exchanges/[id]` (a session detail) — the branded splash still appears on a cold load.

Note: prefetching is disabled in `pnpm dev`; only skeletons are observable locally. Cache behavior must be verified on the preview.

- [ ] **Step 4: Hand off for merge**

Report gate + preview results to Bjorn and wait for merge confirmation. After merge, CI (unit → rls → deploy) ships prod; spot-check prod tabs once the deploy is READY.
