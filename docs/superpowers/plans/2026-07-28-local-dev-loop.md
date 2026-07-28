# Local Dev Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm dev` boots a running app against a **local** Supabase database populated with 20 fake students across every form state, with a `/dev` page that signs you into the organizer or any student portal in one click — and refuses to boot at all against a non-local database.

**Architecture:** Four independent pieces. (1) The seed's cast moves out of `scripts/seed-demo.mjs` into a pure data module so it can be tested without executing the seed, and grows to 20 students. (2) The seed writes `.seed-manifest.json`, the contract everything else reads. (3) `scripts/dev.mjs` becomes a short idempotent sequence — guard, start stack, apply migrations, seed if empty, boot Next — built on small tested helpers in `scripts/lib/`. (4) `app/dev/` renders the manifest as one-click sign-in buttons behind two independent server-side guards.

**Tech Stack:** Node 22 ESM (`.mjs`, no TypeScript in `scripts/`), Next.js 14 App Router, Supabase CLI 2.107 via `pnpm exec`, `@supabase/supabase-js` + `@supabase/ssr`, Vitest (jsdom), Tailwind + shadcn/ui.

## Global Constraints

- Package manager is **pnpm**, never npm. Scripts run as `pnpm <script>`; the Supabase CLI is a devDependency reached only as `pnpm exec supabase` (it is **not** on `PATH`).
- `scripts/` is plain ESM JavaScript (`.mjs`). No TypeScript, no build step, no new runtime dependencies.
- Files under `scripts/` are **not** in `tsconfig.json`'s `include`, so they are never type-checked. Do not import a `.mjs` module from `.ts`/`.tsx` app code — it will fail `tsc --noEmit` under `strict`.
- Never log student/parent PII. Seeded names are fake and safe to print; this rule still governs any code that could later see real data.
- All work happens on branch `feature/local-dev-loop` in its worktree. Confirm with `git branch --show-current` before every commit. Never `git add -A` or `git add .` — stage only named files.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- No migration is added by this plan, so `pnpm test:rls` is not triggered.
- Verification commands: `pnpm lint`, `pnpm test`, `pnpm build`.
- The local stack's fixed values (identical on every machine, safe to hardcode):
  - API `http://127.0.0.1:54321` · DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres` · Studio `http://127.0.0.1:54323` · Inbox `http://127.0.0.1:54324`
  - anon JWT: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`
  - service-role JWT: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU`
- Seed identity constants (already in `scripts/seed-demo.mjs`): domain `seed.example.com`, school `Lycée Démo (seed)`, exchange `Échange Démo 2026`, password `demo1234` (overridable via `SEED_PASSWORD`).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/seed-cast.mjs` | **Create.** Pure data: `STUDENTS`, `APPLICANTS`, `TEMPLATES`, `SHAPES`. No side effects, so tests can import it. |
| `scripts/lib/local-target.mjs` | **Create.** `isLocalSupabaseUrl(url)` and the local stack's fixed URLs. |
| `scripts/lib/env-file.mjs` | **Create.** `parseEnv(text)` / `readEnvFile(path)` — reads `.env.local` before Next boots. |
| `scripts/lib/port.mjs` | **Create.** `resolvePort(raw)` — `.wtport` contents → a port string. |
| `scripts/lib/manifest.mjs` | **Create.** `buildManifest({...})` — the `.seed-manifest.json` shape. |
| `scripts/seed-demo.mjs` | **Modify.** Import the cast, write the manifest, print a roster derived from data rather than hardcoded. |
| `scripts/dev.mjs` | **Modify.** Grows from a port wrapper into the self-healing sequence. |
| `lib/dev/local-only.ts` | **Create.** `isDevQuickAccessEnabled()` — the app-side guard (TypeScript; deliberately independent of `scripts/lib/local-target.mjs`). |
| `app/dev/page.tsx` | **Create.** Server component: guard, read manifest, render sign-in buttons. |
| `app/dev/actions.ts` | **Create.** `devSignIn(email)` server action: guard, ordinary password sign-in, redirect by role. |
| `middleware.ts` | **Modify.** Add `/dev` to `isPublicRoute`. |
| `.env.example` | **Modify.** Document the local-stack defaults. |
| `.gitignore` | **Modify.** Ignore `.seed-manifest.json`. |

**Deliberate duplication:** `scripts/lib/local-target.mjs` (ESM, for scripts) and `lib/dev/local-only.ts` (TypeScript, for the app) both decide "is this Supabase URL local". They are not shared because `scripts/` is excluded from `tsconfig.json` and importing `.mjs` from `.tsx` breaks `tsc --noEmit`. Each has its own tests. This is a two-line predicate; the cross-language plumbing to share it would cost more than it saves.

---

## Task 1: Extract the seed cast and grow it to 20 students

**Files:**
- Create: `scripts/seed-cast.mjs`
- Create: `scripts/__tests__/seed-cast.test.mjs`
- Modify: `scripts/seed-demo.mjs` (remove the inline `STUDENTS`/`APPLICANTS`/`TEMPLATES`/`SHAPES` blocks at lines ~143–200; import them instead; replace the hardcoded roster in the closing `console.log`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STUDENTS: Array<{ slug: string, name: string, shape: string }>` — 20 entries
  - `APPLICANTS: Array<{ slug: string, name: string, status: string }>` — 9 entries, unchanged
  - `TEMPLATES: Array<{ key: string, name: string, kind: 'fillable'|'pdf', deadline: number }>` — 6 entries, unchanged
  - `SHAPES: Record<string, Array<string|null>>` — every value has exactly 6 entries, one per template
  - `HIGHLIGHTS: string[]` — four student slugs worth surfacing first in `/dev`
  - `SHAPE_LABELS: Record<string, string>` — one short French label per shape, consumed by Task 2's manifest and the seed's closing report

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/seed-cast.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { STUDENTS, APPLICANTS, TEMPLATES, SHAPES, HIGHLIGHTS, SHAPE_LABELS } from '../seed-cast.mjs'

describe('seed cast', () => {
  it('has 20 students', () => {
    expect(STUDENTS).toHaveLength(20)
  })

  it('gives every student a unique slug and email-safe name', () => {
    const slugs = STUDENTS.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of STUDENTS) {
      expect(s.slug).toMatch(/^eleve-\d{2}$/)
      expect(s.name.trim()).not.toBe('')
    }
  })

  it('references only shapes that exist', () => {
    for (const s of STUDENTS) {
      expect(SHAPES, `shape "${s.shape}" used by ${s.slug}`).toHaveProperty(s.shape)
    }
  })

  it('uses every defined shape at least once', () => {
    const used = new Set(STUDENTS.map((s) => s.shape))
    for (const name of Object.keys(SHAPES)) {
      expect(used, `shape "${name}" is defined but unused`).toContain(name)
    }
  })

  it('gives every shape exactly one entry per template', () => {
    for (const [name, statuses] of Object.entries(SHAPES)) {
      expect(statuses, `shape "${name}"`).toHaveLength(TEMPLATES.length)
    }
  })

  it('uses only statuses the submissions table accepts', () => {
    const allowed = new Set(['draft', 'submitted', 'approved', 'rejected', null])
    for (const [name, statuses] of Object.entries(SHAPES)) {
      for (const s of statuses) {
        expect(allowed, `shape "${name}" has status "${s}"`).toContain(s)
      }
    }
  })

  it('includes deliberate layout landmines', () => {
    expect(STUDENTS.some((s) => s.name.length >= 30)).toBe(true)
    expect(STUDENTS.some((s) => /[àâäéèêëïîôöùûüçÿœ]/i.test(s.name))).toBe(true)
  })

  it('labels every shape', () => {
    for (const name of Object.keys(SHAPES)) {
      expect(SHAPE_LABELS, `shape "${name}" has no label`).toHaveProperty(name)
      expect(SHAPE_LABELS[name].trim()).not.toBe('')
    }
  })

  it('highlights four students that exist', () => {
    expect(HIGHLIGHTS).toHaveLength(4)
    for (const slug of HIGHLIGHTS) {
      expect(STUDENTS.map((s) => s.slug)).toContain(slug)
    }
  })

  it('keeps the nine applicants', () => {
    expect(APPLICANTS).toHaveLength(9)
    expect(new Set(APPLICANTS.map((a) => a.status))).toEqual(
      new Set(['invited', 'draft', 'submitted', 'rejected', 'accepted', 'declined']),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/seed-cast.test.mjs`
Expected: FAIL — `Failed to resolve import "../seed-cast.mjs"`.

- [ ] **Step 3: Create the cast module**

Create `scripts/seed-cast.mjs`:

```js
// The cast the demo seed builds. Pure data, no side effects — `seed-demo.mjs`
// executes on import, so anything that wants to inspect the world without
// building it (tests, the /dev page's expectations) reads this instead.

// Forms the exchange asks for. Deadlines are spread on purpose: one already
// past (so "overdue" is reachable), one in three days (so the final-week
// reminder pacing is reachable), the rest comfortably ahead.
export const TEMPLATES = [
  { key: 'medical', name: 'Autorisation médicale', kind: 'fillable', deadline: 14 },
  { key: 'decharge', name: 'Décharge de responsabilité', kind: 'fillable', deadline: 14 },
  { key: 'absence', name: "Demande d'absence", kind: 'fillable', deadline: 3 },
  { key: 'famille', name: "Engagement de famille d'accueil", kind: 'fillable', deadline: 21 },
  { key: 'passeport', name: 'Copie du passeport', kind: 'pdf', deadline: -4 },
  { key: 'esta', name: 'Autorisation ESTA', kind: 'pdf', deadline: 30 },
]

// Which submission status each shape gives the Nth form, in TEMPLATES order.
// `null` = the student never opened it, so no submission row exists at all —
// which is also what makes the past-deadline form (index 4) read as overdue.
export const SHAPES = {
  untouched: [null, null, null, null, null, null],
  'all-approved': ['approved', 'approved', 'approved', 'approved', 'approved', 'approved'],
  'all-submitted': ['submitted', 'submitted', 'submitted', 'submitted', 'submitted', 'submitted'],
  mixed: ['approved', 'submitted', 'draft', null, 'approved', null],
  'one-rejected': ['approved', 'rejected', 'submitted', 'approved', null, null],
  'half-done': ['approved', 'approved', 'draft', null, null, null],
  overdue: [null, null, null, null, null, 'draft'],
  // Opened the first form once and stopped — what the reminder pacing targets.
  'just-started': ['draft', null, null, null, null, null],
  // Five approved, the sixth never opened. The organizer's most common real
  // state: chasing one last document. No other shape produces it.
  'one-missing': ['approved', 'approved', 'approved', 'approved', 'approved', null],
  // Real progress everywhere except the form whose deadline has passed.
  'overdue-partial': ['approved', 'submitted', null, null, null, 'draft'],
}

// Enrolled students, each pinned to one completion shape so every state the
// organizer dashboard can render is on screen at once.
//
// Two names are deliberate layout landmines: eleve-13 is long enough to overflow
// a table cell or a sidebar, and eleve-14 carries accents and a combining
// diacritic. Encoding and truncation bugs should surface here, not from a real
// family's name.
export const STUDENTS = [
  { slug: 'eleve-01', name: 'Camille Bernard', shape: 'untouched' },
  { slug: 'eleve-02', name: 'Louis Moreau', shape: 'untouched' },
  { slug: 'eleve-03', name: 'Emma Petit', shape: 'all-approved' },
  { slug: 'eleve-04', name: 'Hugo Lefebvre', shape: 'all-submitted' },
  { slug: 'eleve-05', name: 'Léa Roux', shape: 'mixed' },
  { slug: 'eleve-06', name: 'Gabriel Fournier', shape: 'mixed' },
  { slug: 'eleve-07', name: 'Chloé Girard', shape: 'one-rejected' },
  { slug: 'eleve-08', name: 'Raphaël Bonnet', shape: 'half-done' },
  { slug: 'eleve-09', name: 'Alice Dupont', shape: 'half-done' },
  { slug: 'eleve-10', name: 'Noah Lambert', shape: 'overdue' },
  { slug: 'eleve-11', name: 'Jade Mercier', shape: 'overdue' },
  { slug: 'eleve-12', name: 'Arthur Vincent', shape: 'all-approved' },
  { slug: 'eleve-13', name: 'Marie-Ambre de La Rochefoucauld-Montmorency', shape: 'just-started' },
  { slug: 'eleve-14', name: 'Loïc Nguyên-Öztürk', shape: 'all-submitted' },
  { slug: 'eleve-15', name: 'Sarah Benali', shape: 'one-missing' },
  { slug: 'eleve-16', name: 'Tom Rousseau', shape: 'overdue-partial' },
  { slug: 'eleve-17', name: 'Anaïs Leclerc', shape: 'overdue-partial' },
  { slug: 'eleve-18', name: 'Yanis Barbier', shape: 'just-started' },
  { slug: 'eleve-19', name: 'Clara Renaud', shape: 'one-missing' },
  { slug: 'eleve-20', name: 'Malo Guérin', shape: 'one-rejected' },
]

// Surfaced first on /dev — one student per interesting extreme, so the common
// cases are one click away without scrolling the roster.
export const HIGHLIGHTS = ['eleve-01', 'eleve-05', 'eleve-10', 'eleve-15']

// Applicants who have NOT been enrolled — the funnel side of the app.
export const APPLICANTS = [
  { slug: 'cand-invite', name: 'Sacha Blanc', status: 'invited' },
  { slug: 'cand-draft-1', name: 'Manon Faure', status: 'draft' },
  { slug: 'cand-draft-2', name: 'Théo Garnier', status: 'draft' },
  { slug: 'cand-soumis-1', name: 'Inès Chevalier', status: 'submitted' },
  { slug: 'cand-soumis-2', name: 'Nathan Robin', status: 'submitted' },
  { slug: 'cand-soumis-3', name: 'Lina Marchand', status: 'submitted' },
  { slug: 'cand-refuse', name: 'Enzo Perrin', status: 'rejected' },
  { slug: 'cand-accepte', name: 'Zoé Dumont', status: 'accepted' },
  { slug: 'cand-decline', name: 'Adam Leroy', status: 'declined' },
]

// One-line English descriptions, keyed by shape — used by the /dev roster and
// the seed's closing report so the two never drift.
export const SHAPE_LABELS = {
  untouched: 'rien commencé',
  'all-approved': 'tout validé',
  'all-submitted': 'tout soumis, rien relu',
  mixed: 'états mélangés',
  'one-rejected': 'un formulaire refusé',
  'half-done': 'à moitié fait',
  overdue: 'en retard',
  'just-started': 'un brouillon commencé',
  'one-missing': 'il manque un formulaire',
  'overdue-partial': 'en retard, mais avancé',
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/__tests__/seed-cast.test.mjs`
Expected: PASS — 10 tests.

- [ ] **Step 5: Point `seed-demo.mjs` at the cast**

In `scripts/seed-demo.mjs`, add the import directly below the existing `import { createClient } from '@supabase/supabase-js'` line:

```js
import { STUDENTS, APPLICANTS, TEMPLATES, SHAPES, SHAPE_LABELS } from './seed-cast.mjs'
```

Then **delete** the four inline declarations that this replaces — the blocks beginning `const STUDENTS = [`, `const APPLICANTS = [`, `const TEMPLATES = [` and `const SHAPES = {`, together with their explanatory comments (they moved to `seed-cast.mjs` verbatim).

- [ ] **Step 6: Replace the hardcoded roster in the closing report**

At the end of `scripts/seed-demo.mjs`, the report hardcodes `eleve-01 … eleve-12` and an eight-line legend. Replace the `Logins (password: …)` block and the legend that follows it with a derived version:

```js
const roster = STUDENTS.map((s) => `  ${s.slug}  ${s.name} — ${SHAPE_LABELS[s.shape]}`).join('\n')

console.log(`
Seeded ${where}.

  School      ${SCHOOL_NAME}
  Exchange    ${EXCHANGE_NAME}  (phase 2, applications open)
  Apply page  /apply/demo-2026
  Forms       ${templates.length}  (one overdue, one due in 3 days)
  Students    ${STUDENTS.length} enrolled, every completion state covered
  Applicants  ${applicationCount} rows — invited / draft / submitted / rejected / accepted / declined / enrolled

Logins (password: ${PASSWORD})
  organizer     ${email('orga')}       owner
  collaborator  ${email('orga-2')}     admin

${roster}
${isLocal(url) ? '\n  All email lands in Inbucket: http://127.0.0.1:54324\n' : ''}`)
```

- [ ] **Step 7: Run the seed end to end**

Run: `pnpm seed`
Expected: completes without error and reports `Students    20 enrolled`. The roster lists `eleve-01` through `eleve-20`.

If it fails on `trg_guard_submission_review`, a new shape is asking the service role to write a review column directly — check that the new shapes only use `draft`/`submitted`/`approved`/`rejected`/`null`, which the existing review pass already handles.

- [ ] **Step 8: Commit**

```bash
git add scripts/seed-cast.mjs scripts/__tests__/seed-cast.test.mjs scripts/seed-demo.mjs
git commit -m "$(cat <<'EOF'
feat(seed): extract the cast and grow it to 20 students

The cast lived inside seed-demo.mjs, which executes on import — so nothing
could assert on it without building the whole world. It moves to a pure data
module with tests covering the invariants that used to fail only at runtime:
every referenced shape exists, every shape has one entry per template, and
every status is one the submissions table accepts.

Eight new students and three new shapes: just-started (one draft, what the
reminder pacing targets), one-missing (five approved and one never opened —
chasing a last document, which no existing shape produced) and overdue-partial.
Two names are deliberate layout landmines so overflow and encoding bugs surface
in the seed rather than from a real family.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The seed writes `.seed-manifest.json`

**Files:**
- Create: `scripts/lib/manifest.mjs`
- Create: `scripts/__tests__/manifest.test.mjs`
- Modify: `scripts/seed-demo.mjs` (write the file just before the closing report)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `STUDENTS`, `SHAPE_LABELS`, `HIGHLIGHTS` from Task 1.
- Produces: `buildManifest({ password, domain, school, exchange, students, highlights, labels }) => Manifest`, and the on-disk shape every later task reads:

```json
{
  "version": 1,
  "password": "demo1234",
  "school": "Lycée Démo (seed)",
  "exchange": "Échange Démo 2026",
  "accounts": [
    { "email": "orga@seed.example.com", "name": "Claire Organisatrice", "role": "organizer", "note": "owner", "highlight": true },
    { "email": "eleve-01@seed.example.com", "name": "Camille Bernard", "role": "student", "note": "rien commencé", "highlight": true }
  ]
}
```

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/manifest.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { buildManifest } from '../lib/manifest.mjs'

const base = {
  password: 'demo1234',
  domain: 'seed.example.com',
  school: 'Lycée Démo (seed)',
  exchange: 'Échange Démo 2026',
  students: [
    { slug: 'eleve-01', name: 'Camille Bernard', shape: 'untouched' },
    { slug: 'eleve-05', name: 'Léa Roux', shape: 'mixed' },
  ],
  highlights: ['eleve-05'],
  labels: { untouched: 'rien commencé', mixed: 'états mélangés' },
}

describe('buildManifest', () => {
  it('puts both organizers first, then the students', () => {
    const m = buildManifest(base)
    expect(m.accounts.map((a) => a.role)).toEqual(['organizer', 'organizer', 'student', 'student'])
  })

  it('builds addresses from slug and domain', () => {
    const m = buildManifest(base)
    expect(m.accounts.map((a) => a.email)).toEqual([
      'orga@seed.example.com',
      'orga-2@seed.example.com',
      'eleve-01@seed.example.com',
      'eleve-05@seed.example.com',
    ])
  })

  it('labels each student with their shape', () => {
    const m = buildManifest(base)
    const lea = m.accounts.find((a) => a.email.startsWith('eleve-05'))
    expect(lea.note).toBe('états mélangés')
    expect(lea.name).toBe('Léa Roux')
  })

  it('marks highlighted students and both organizers', () => {
    const m = buildManifest(base)
    const highlighted = m.accounts.filter((a) => a.highlight).map((a) => a.email)
    expect(highlighted).toContain('orga@seed.example.com')
    expect(highlighted).toContain('eleve-05@seed.example.com')
    expect(highlighted).not.toContain('eleve-01@seed.example.com')
  })

  it('falls back to the shape name when no label exists', () => {
    const m = buildManifest({
      ...base,
      students: [{ slug: 'eleve-09', name: 'X', shape: 'brand-new' }],
      highlights: [],
    })
    expect(m.accounts.at(-1).note).toBe('brand-new')
  })

  it('carries the password, world names and a version', () => {
    const m = buildManifest(base)
    expect(m).toMatchObject({ version: 1, password: 'demo1234', school: 'Lycée Démo (seed)', exchange: 'Échange Démo 2026' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/manifest.test.mjs`
Expected: FAIL — `Failed to resolve import "../lib/manifest.mjs"`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/manifest.mjs`:

```js
// The contract between the seed and everything that wants to log in as one of
// its accounts. Written to .seed-manifest.json (gitignored) so the /dev page can
// list accounts without querying the database — which keeps it clear of the
// service-role client and the admin import allowlist entirely.

export function buildManifest({ password, domain, school, exchange, students, highlights, labels }) {
  const highlighted = new Set(highlights)
  const at = (slug) => `${slug}@${domain}`

  return {
    version: 1,
    password,
    school,
    exchange,
    accounts: [
      { email: at('orga'), name: 'Claire Organisatrice', role: 'organizer', note: 'owner', highlight: true },
      { email: at('orga-2'), name: 'Marc Collaborateur', role: 'organizer', note: 'admin', highlight: false },
      ...students.map((s) => ({
        email: at(s.slug),
        name: s.name,
        role: 'student',
        note: labels[s.shape] ?? s.shape,
        highlight: highlighted.has(s.slug),
      })),
    ],
  }
}
```

> The two organizer display names are copied from the `createAuthUser` calls at `scripts/seed-demo.mjs:273-274` — `'Claire Organisatrice'` and `'Marc Collaborateur'`. If those ever change, this file follows them, not the other way round.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/__tests__/manifest.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the manifest from the seed**

In `scripts/seed-demo.mjs`, add to the imports:

```js
import { writeFileSync } from 'node:fs'
import { buildManifest } from './lib/manifest.mjs'
import { HIGHLIGHTS } from './seed-cast.mjs'   // merge into the existing seed-cast import
```

Then, immediately **before** the closing `console.log` report, write the file:

```js
// The /dev page reads this instead of querying the database.
writeFileSync(
  '.seed-manifest.json',
  JSON.stringify(
    buildManifest({
      password: PASSWORD,
      domain: SEED_DOMAIN,
      school: SCHOOL_NAME,
      exchange: EXCHANGE_NAME,
      students: STUDENTS,
      highlights: HIGHLIGHTS,
      labels: SHAPE_LABELS,
    }),
    null,
    2,
  ) + '\n',
)
```

- [ ] **Step 6: Ignore the manifest**

Append to `.gitignore`, under the existing `# local env files` group:

```
# written by `pnpm seed`; lists local test accounts
.seed-manifest.json
```

- [ ] **Step 7: Verify it lands**

Run: `pnpm seed && node -e "const m=require('./.seed-manifest.json'); console.log(m.accounts.length, m.accounts.filter(a=>a.highlight).length)"`
Expected: `22 5` — 2 organizers + 20 students, of which 4 highlighted students plus the owner organizer.

Run: `git status --short`
Expected: `.seed-manifest.json` does **not** appear.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/manifest.mjs scripts/__tests__/manifest.test.mjs scripts/seed-demo.mjs .gitignore
git commit -m "$(cat <<'EOF'
feat(seed): write .seed-manifest.json listing the accounts created

The /dev quick-access page needs to know which accounts exist. Querying for
them would mean a service-role client in a page component and an entry in the
admin import allowlist — a real security decision for a convenience feature.
Writing a gitignored manifest instead keeps the page to a file read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Script helpers — local-target, env-file, port

**Files:**
- Create: `scripts/lib/local-target.mjs`, `scripts/lib/env-file.mjs`, `scripts/lib/port.mjs`
- Create: `scripts/__tests__/local-target.test.mjs`, `scripts/__tests__/env-file.test.mjs`, `scripts/__tests__/port.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isLocalSupabaseUrl(url: string | undefined) => boolean`
  - `LOCAL_API_URL`, `LOCAL_STUDIO_URL`, `LOCAL_INBOX_URL`, `LOCAL_ANON_KEY`, `LOCAL_SERVICE_KEY` (string constants)
  - `parseEnv(text: string) => Record<string, string>`
  - `readEnvFile(path: string) => Record<string, string>` (returns `{}` when absent)
  - `resolvePort(raw: string | null | undefined) => string`

- [ ] **Step 1: Write the failing tests**

Create `scripts/__tests__/local-target.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { isLocalSupabaseUrl } from '../lib/local-target.mjs'

describe('isLocalSupabaseUrl', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://127.0.0.1:54321/',
    'https://localhost',
    'http://[::1]:54321',
  ])('accepts %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true)
  })

  it.each([
    'https://rgisrqlbcjdoetoybaqd.supabase.co',
    'https://loygdbjdyciipvdcpvmr.supabase.co',
    'https://127.0.0.1.evil.com',
    'https://localhost.attacker.net',
    'http://192.168.1.10:54321',
  ])('rejects %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false)
  })

  it.each([undefined, null, '', 'not a url', '127.0.0.1:54321'])('rejects %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false)
  })
})
```

Create `scripts/__tests__/env-file.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { parseEnv, readEnvFile } from '../lib/env-file.mjs'

describe('parseEnv', () => {
  it('reads plain assignments', () => {
    expect(parseEnv('A=1\nB=two')).toEqual({ A: '1', B: 'two' })
  })

  it('skips blanks and comments', () => {
    expect(parseEnv('# note\n\nA=1\n   # indented\nB=2')).toEqual({ A: '1', B: '2' })
  })

  it('strips surrounding quotes', () => {
    expect(parseEnv(`A="quoted"\nB='single'`)).toEqual({ A: 'quoted', B: 'single' })
  })

  it('keeps = inside a value', () => {
    expect(parseEnv('JWT=abc.def=ghi')).toEqual({ JWT: 'abc.def=ghi' })
  })

  it('ignores lines with no =', () => {
    expect(parseEnv('JUNK\nA=1')).toEqual({ A: '1' })
  })

  it('takes the last assignment when a key repeats', () => {
    expect(parseEnv('A=1\nA=2')).toEqual({ A: '2' })
  })
})

describe('readEnvFile', () => {
  it('returns an empty object when the file is missing', () => {
    expect(readEnvFile('/nonexistent/.env.local')).toEqual({})
  })
})
```

Create `scripts/__tests__/port.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { resolvePort } from '../lib/port.mjs'

describe('resolvePort', () => {
  it('defaults to 3000 when there is no pinned port', () => {
    expect(resolvePort(null)).toBe('3000')
    expect(resolvePort(undefined)).toBe('3000')
    expect(resolvePort('')).toBe('3000')
  })

  it('uses a pinned port, trimming whitespace', () => {
    expect(resolvePort('3407')).toBe('3407')
    expect(resolvePort('  3407\n')).toBe('3407')
  })

  it('falls back to 3000 on anything that is not a port', () => {
    expect(resolvePort('abc')).toBe('3000')
    expect(resolvePort('3407; rm -rf /')).toBe('3000')
    expect(resolvePort('7')).toBe('3000')
    expect(resolvePort('999999')).toBe('3000')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run scripts/__tests__/local-target.test.mjs scripts/__tests__/env-file.test.mjs scripts/__tests__/port.test.mjs`
Expected: FAIL — three unresolved imports.

- [ ] **Step 3: Write the implementations**

Create `scripts/lib/local-target.mjs`:

```js
// The local Supabase stack's fixed coordinates. `supabase start` prints these
// and they are identical on every machine, so hardcoding them costs nothing and
// means the zero-config path needs no env file at all.
export const LOCAL_API_URL = 'http://127.0.0.1:54321'
export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const LOCAL_STUDIO_URL = 'http://127.0.0.1:54323'
export const LOCAL_INBOX_URL = 'http://127.0.0.1:54324'

export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Host-equality, never substring matching: "https://127.0.0.1.evil.com" contains
// "127.0.0.1" and must not pass. Anything unparseable is not local.
export function isLocalSupabaseUrl(url) {
  if (!url) return false
  let hostname
  try {
    ;({ hostname } = new URL(url))
  } catch {
    return false
  }
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
}
```

Create `scripts/lib/env-file.mjs`:

```js
import { existsSync, readFileSync } from 'node:fs'

// A minimal .env reader. Next.js loads .env.local for the app, but this wrapper
// runs before Next boots and @next/env does not resolve under pnpm's strict
// node_modules layout — so the handful of variables the wrapper needs are
// parsed here. Deliberately not a full dotenv: no interpolation, no multi-line
// values, no export prefixes. If a value ever needs those, use dotenv instead of
// growing this.
export function parseEnv(text) {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

export function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
}
```

Create `scripts/lib/port.mjs`:

```js
// `pnpm wt` pins a per-worktree port in .wtport. Without it two worktrees both
// ask for 3000 and the second silently lands on 3001 — so you end up testing the
// wrong branch. Anything that is not a plausible port falls back to 3000 rather
// than being passed through to a shell.
export function resolvePort(raw) {
  const trimmed = String(raw ?? '').trim()
  return /^\d{2,5}$/.test(trimmed) && Number(trimmed) >= 1024 ? trimmed : '3000'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run scripts/__tests__/local-target.test.mjs scripts/__tests__/env-file.test.mjs scripts/__tests__/port.test.mjs`
Expected: PASS — all three files green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/local-target.mjs scripts/lib/env-file.mjs scripts/lib/port.mjs scripts/__tests__/local-target.test.mjs scripts/__tests__/env-file.test.mjs scripts/__tests__/port.test.mjs
git commit -m "$(cat <<'EOF'
feat(scripts): helpers for the self-healing dev wrapper

isLocalSupabaseUrl compares hostnames rather than matching substrings, so
https://127.0.0.1.evil.com does not read as local. resolvePort refuses anything
that is not a plausible port instead of forwarding it to a spawn. A minimal
.env reader exists because the wrapper runs before Next boots and @next/env
does not resolve under pnpm's strict node_modules layout.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Point local development at the local stack

**Files:**
- Modify: `.env.local` (**untracked** — edited on disk, never committed)
- Create: `.env.prod` (**untracked** — the archived production values)
- Modify: `.env.example`

**Interfaces:**
- Consumes: the constants from `scripts/lib/local-target.mjs` (Task 3), transcribed as literal values.
- Produces: an `.env.local` for which `isLocalSupabaseUrl(NEXT_PUBLIC_SUPABASE_URL)` is true — the precondition Task 5's guard enforces.

> **This task edits gitignored files, so most of it cannot be verified by a reviewer reading the diff.** Only `.env.example` is committed. Run the verification step and paste its output.

- [ ] **Step 1: Archive the production values**

Run from the **main checkout** (`/home/bjorn/eazyexchange`), not the worktree — `.env.local` is a symlink inside worktrees and `cp` must copy the real file:

```bash
cd /home/bjorn/eazyexchange
cp .env.local .env.prod
grep -c . .env.prod
```

Expected: a non-zero line count. `.env.prod` is already ignored by the `.env*` rule in `.gitignore`.

> The name matters. Do **not** call it `.env.production` — Next.js auto-loads that filename during `next build`, which would silently rebuild against production.

- [ ] **Step 2: Rewrite `.env.local` for the local stack**

Edit `/home/bjorn/eazyexchange/.env.local` so it reads exactly:

```bash
# Local Supabase stack (`supabase start`). These values are identical on every
# machine — see `pnpm exec supabase status`. Production credentials live in
# .env.prod, which nothing auto-loads; production access goes through the
# Supabase MCP tools and the Vercel dashboard.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Overridden per worktree by `pnpm dev` from .wtport. Kept set because
# app/(auth)/signup/page.tsx interpolates it with no fallback, so an unset value
# would inline the string "undefined/onboarding" into a local build.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# No RESEND_API_KEY on purpose: seeded addresses are @seed.example.com, which
# Resend rejects with a 422 that fails the entire batch. Sends degrade to console
# warnings. Supabase auth email still works and lands in the local inbox on
# :54324. Real email rendering is checked with scripts/smoke-email.mjs or on
# staging — never from a laptop.
EMAIL_FROM=EazyExchange <contact@eazyexchange.com>
```

Then copy the five `STRIPE_*` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` lines from `.env.prod` verbatim and append them — they are already test-mode keys (`sk_test` / `pk_test`), verified. Do **not** copy `RESEND_API_KEY` or `VERCEL_OIDC_TOKEN`.

- [ ] **Step 3: Verify the swap**

```bash
cd /home/bjorn/eazyexchange
grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local
grep -c '^RESEND_API_KEY=' .env.local || echo "RESEND_API_KEY absent — correct"
grep -oE 'sk_(test|live)|pk_(test|live)' .env.local | sort -u
grep -oE 'supabase\.co' .env.local || echo "no remote Supabase host — correct"
git status --short | grep -E '\.env' || echo "no env file is staged — correct"
```

Expected: URL is `http://127.0.0.1:54321`; `RESEND_API_KEY absent`; only `sk_test`/`pk_test`; `no remote Supabase host`; `no env file is staged`.

- [ ] **Step 4: Confirm every worktree inherited it**

```bash
readlink -f /home/bjorn/eazyexchange/.claude/worktrees/*/.env.local 2>/dev/null
```

Expected: each path resolves to `/home/bjorn/eazyexchange/.env.local`. If any worktree has a real file instead of a symlink, re-run `pnpm wt` inside it.

- [ ] **Step 5: Document the local defaults in `.env.example`**

`.env.example` is the authoritative, commented list of every required variable. Add a section at the top, above the existing content:

```bash
# ---------------------------------------------------------------------------
# LOCAL DEVELOPMENT
#
# `pnpm dev` refuses to boot unless NEXT_PUBLIC_SUPABASE_URL is a local host —
# pointing local development at production is not a discipline to maintain but
# an action the tool declines. Use these values verbatim; they are the same on
# every machine (`pnpm exec supabase status`).
#
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon JWT, from `supabase status`>
#   SUPABASE_SERVICE_ROLE_KEY=<local service-role JWT, from `supabase status`>
#
# Leave RESEND_API_KEY unset locally: seeded addresses are @seed.example.com,
# which Resend rejects with a 422 that fails the whole batch. Sends degrade to
# console warnings; Supabase auth email lands in the local inbox on :54324.
#
# Deliberately targeting a remote project (rare): `pnpm dev --remote`.
# ---------------------------------------------------------------------------
```

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
docs(env): document the local-stack defaults for development

.env.local pointed at the production Supabase project, so every local click
read and wrote real users' records and no test world could exist locally. The
file now targets the local stack; production values moved to .env.prod, which
nothing auto-loads.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Self-healing `pnpm dev`

**Files:**
- Modify: `scripts/dev.mjs` (currently 20 lines — a port-aware `next dev` wrapper)

**Interfaces:**
- Consumes: `resolvePort` (Task 3), `readEnvFile` (Task 3), `isLocalSupabaseUrl` + `LOCAL_*` constants (Task 3), the seed from Tasks 1–2.
- Produces: the `pnpm dev` contract — flags `--remote`, `--reseed`, `--reset`, and any other argument forwarded to `next dev`.

- [ ] **Step 1: Write the replacement**

Replace the entire contents of `scripts/dev.mjs`:

```js
#!/usr/bin/env node
/**
 * `pnpm dev` — boot a working app, not just a web server.
 *
 * Every step is idempotent and near-instant once satisfied, so the common case
 * (everything already up) costs about a second. The sequence:
 *
 *   1. resolve the worktree's pinned port
 *   2. refuse to boot against a non-local database   ← the point of all this
 *   3. start the Supabase stack if it is down
 *   4. apply any pending migrations
 *   5. seed if the world is absent
 *   6. boot Next with the port's own app URL
 *
 * Flags: --remote (skip 2-5), --reseed (rebuild the world), --reset (drop the
 * database, re-migrate, reseed). Anything else is forwarded to `next dev`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readEnvFile } from './lib/env-file.mjs'
import { resolvePort } from './lib/port.mjs'
import {
  isLocalSupabaseUrl,
  LOCAL_API_URL,
  LOCAL_ANON_KEY,
  LOCAL_INBOX_URL,
  LOCAL_STUDIO_URL,
} from './lib/local-target.mjs'

const argv = process.argv.slice(2)
const take = (flag) => {
  const i = argv.indexOf(flag)
  if (i === -1) return false
  argv.splice(i, 1)
  return true
}
const remote = take('--remote')
const reseed = take('--reseed')
const reset = take('--reset')

const step = (msg) => process.stdout.write(`  ▸ ${msg}\n`)
const die = (title, ...lines) => {
  process.stderr.write(`\n  ✗ ${title}\n${lines.map((l) => `    ${l}\n`).join('')}\n`)
  process.exit(1)
}

// Runs a command, streaming its output. Returns its exit status.
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1
// Runs a command quietly, returning { status, stdout, stderr }.
const runQuiet = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// --- 1. port ----------------------------------------------------------------

const port = resolvePort(existsSync('.wtport') ? readFileSync('.wtport', 'utf8') : null)

// --- 2. the guard -----------------------------------------------------------

const env = readEnvFile('.env.local')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL

if (!remote && !isLocalSupabaseUrl(supabaseUrl)) {
  die(
    'Refusing to start: .env.local does not point at a local database.',
    `NEXT_PUBLIC_SUPABASE_URL = ${supabaseUrl ?? '(unset)'}`,
    '',
    'Local development must not read or write real users\' records.',
    `Set NEXT_PUBLIC_SUPABASE_URL=${LOCAL_API_URL} in .env.local`,
    '(see .env.example for the full local block).',
    '',
    'If you genuinely mean to target a remote project: pnpm dev --remote',
  )
}

// --- 3. the stack -----------------------------------------------------------

async function stackIsUp() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(`${LOCAL_API_URL}/rest/v1/`, {
      headers: { apikey: LOCAL_ANON_KEY },
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

if (!remote) {
  if (await stackIsUp()) {
    step('Supabase local — up')
  } else {
    step('Supabase local — down, starting (first run pulls images, be patient)')
    if (run('pnpm', ['exec', 'supabase', 'start']) !== 0) {
      die(
        'Could not start the local Supabase stack.',
        'The usual cause is Docker Desktop not running on Windows — WSL reaches',
        'the daemon through a socket it does not control.',
        '',
        'Start Docker Desktop, wait for it to report Running, then re-run pnpm dev.',
      )
    }
  }

  // --- 4. migrations --------------------------------------------------------

  if (reset) {
    step('Resetting the local database (--reset)')
    if (run('pnpm', ['exec', 'supabase', 'db', 'reset']) !== 0) {
      die('supabase db reset failed.', 'Run it directly to see the failing migration:', '  pnpm exec supabase db reset')
    }
  } else {
    // Idempotent and ~1.7s when there is nothing to apply, so it runs
    // unconditionally rather than diffing the ledger first.
    const up = runQuiet('pnpm', ['exec', 'supabase', 'migration', 'up', '--local'])
    if (up.status !== 0) {
      process.stderr.write(up.stdout + up.stderr)
      die(
        'Pending migrations failed to apply.',
        'Inspect with:  pnpm exec supabase migration up --local',
        'Rebuild from scratch with:  pnpm dev --reset',
      )
    }
    step(up.stdout.includes('up to date') ? 'Migrations — up to date' : 'Migrations — applied pending')
  }

  // --- 5. the seeded world --------------------------------------------------

  async function worldExists() {
    try {
      const res = await fetch(
        `${LOCAL_API_URL}/rest/v1/schools?select=id&limit=1&name=eq.${encodeURIComponent('Lycée Démo (seed)')}`,
        { headers: { apikey: LOCAL_ANON_KEY, Authorization: `Bearer ${LOCAL_ANON_KEY}` } },
      )
      if (!res.ok) return false
      return (await res.json()).length > 0
    } catch {
      return false
    }
  }

  // Seeding WIPES and rebuilds. Auto-seeding only when the world is absent
  // matters because every worktree shares this one stack: a reseed here would
  // destroy the state a parallel session is mid-click in. Rebuilding is only
  // ever the explicit flag.
  const needsSeed = reseed || reset || !(await worldExists())
  if (needsSeed) {
    step(reseed || reset ? 'Seeding — rebuilding the world' : 'Seeding — no world found, building one')
    if (run('node', ['scripts/seed-demo.mjs']) !== 0) {
      die('Seeding failed.', 'Run it directly to see why:  pnpm seed')
    }
  } else {
    step('Seed — world present (rebuild with --reseed)')
  }
}

// --- 6. boot ----------------------------------------------------------------

const appUrl = `http://localhost:${port}`
const manifest = existsSync('.seed-manifest.json')
  ? JSON.parse(readFileSync('.seed-manifest.json', 'utf8'))
  : null
const students = manifest?.accounts.filter((a) => a.role === 'student').length ?? 0

process.stdout.write(
  `\n  ${appUrl}\n` +
    (remote ? '  (--remote: local stack checks skipped)\n' : '') +
    (students ? `\n  Quick access  ${appUrl}/dev   ·   ${students} students seeded\n` : '') +
    (remote ? '' : `  Inbox         ${LOCAL_INBOX_URL}\n  Studio        ${LOCAL_STUDIO_URL}\n`) +
    '\n',
)

const hasPortFlag = argv.some((a) => a === '-p' || a === '--port' || a.startsWith('--port='))
const next = hasPortFlag ? ['dev', ...argv] : ['dev', '--port', port, ...argv]

// spawnSync (not execFileSync) so Ctrl+C exits quietly instead of throwing.
const { status } = spawnSync('next', next, {
  stdio: 'inherit',
  // Worktrees run on pinned ports, but NEXT_PUBLIC_APP_URL in .env.local is the
  // 3000 default — so without this override every generated link in a worktree
  // points at the wrong dev server.
  env: { ...process.env, NEXT_PUBLIC_APP_URL: appUrl },
})
process.exit(status ?? 0)
```

- [ ] **Step 2: Verify the guard rejects a remote URL**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://rgisrqlbcjdoetoybaqd.supabase.co node scripts/dev.mjs
echo "exit: $?"
```

Expected: the refusal message, `exit: 1`, and **no dev server**.

- [ ] **Step 3: Verify the happy path**

```bash
pnpm dev
```

Expected: `Supabase local — up`, `Migrations — up to date`, `Seed — world present`, then the banner with the port, `/dev` URL, student count, inbox and studio. The app answers on that port. Stop it with Ctrl+C and confirm it exits without a stack trace.

- [ ] **Step 4: Verify `--remote` still boots**

```bash
timeout 20 pnpm dev --remote
```

Expected: skips the stack/migration/seed steps, prints `(--remote: local stack checks skipped)`, boots Next.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS, including the four new script test files.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev.mjs
git commit -m "$(cat <<'EOF'
feat(dev): make `pnpm dev` self-healing and refuse non-local databases

Starting work meant six manual steps — check the stack, start it, apply
migrations, seed, boot, log in — and getting one wrong meant testing against
the wrong database. `pnpm dev` now does all of them, each idempotent, and
refuses to boot at all unless NEXT_PUBLIC_SUPABASE_URL is a local host. Aiming
local development at production stops being a discipline to maintain and
becomes an action the tool declines; `--remote` remains for the deliberate case.

Auto-seeding is deliberately non-destructive: every worktree shares one local
stack, so an unprompted reseed would wipe the state a parallel session is
mid-click in. Rebuilding is only ever --reseed or --reset.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The `/dev` quick-access page

**Files:**
- Create: `lib/dev/local-only.ts`
- Create: `lib/dev/__tests__/local-only.test.ts`
- Create: `app/dev/actions.ts`
- Create: `app/dev/page.tsx`
- Create: `app/dev/__tests__/page.test.tsx`
- Modify: `middleware.ts:20-32` (the `isPublicRoute` expression)

**Interfaces:**
- Consumes: `.seed-manifest.json` written in Task 2 — `{ version, password, school, exchange, accounts: Array<{ email, name, role, note, highlight }> }`.
- Produces:
  - `isDevQuickAccessEnabled(): boolean`
  - `readSeedManifest(): Manifest | null`
  - `devSignIn(email: string): Promise<void>` — a server action that always ends in a `redirect()`: to the account's home on success, back to `/dev?error=…` on failure. It returns `void` deliberately: React types a `<form action>` as returning `void | Promise<void>`, so returning a `{ error }` object fails `tsc --noEmit` under `strict`.

- [ ] **Step 1: Write the failing guard test**

Create `lib/dev/__tests__/local-only.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { isDevQuickAccessEnabled } from '../local-only'

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
  vi.unstubAllEnvs()
})

describe('isDevQuickAccessEnabled', () => {
  it('is enabled in development against a local database', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    expect(isDevQuickAccessEnabled()).toBe(true)
  })

  it('is disabled in production even against a local database', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })

  it('is disabled in development against a remote database', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://rgisrqlbcjdoetoybaqd.supabase.co')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })

  it('does not accept a hostname that merely contains a local one', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://127.0.0.1.evil.com')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })

  it('is disabled when the URL is missing or unparseable', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(isDevQuickAccessEnabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not a url')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/dev/__tests__/local-only.test.ts`
Expected: FAIL — cannot resolve `../local-only`.

- [ ] **Step 3: Write the guard**

Create `lib/dev/local-only.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SeedAccount = {
  email: string
  name: string
  role: 'organizer' | 'student'
  note: string
  highlight: boolean
}

export type SeedManifest = {
  version: number
  password: string
  school: string
  exchange: string
  accounts: SeedAccount[]
}

// Two independent conditions, both required. Either alone would be enough; both
// means a misconfigured build cannot expose the quick-access route. Host
// equality, never substring matching — https://127.0.0.1.evil.com is not local.
//
// Deliberately duplicated from scripts/lib/local-target.mjs rather than shared:
// scripts/ is excluded from tsconfig.json, so importing the .mjs here would
// break `tsc --noEmit`. Both copies have their own tests.
export function isDevQuickAccessEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return false
  let hostname: string
  try {
    ;({ hostname } = new URL(url))
  } catch {
    return false
  }
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

// Written by `pnpm seed`. Absent is an ordinary state — it means the world has
// not been built yet — so this returns null rather than throwing.
export function readSeedManifest(): SeedManifest | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), '.seed-manifest.json'), 'utf8')) as SeedManifest
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run lib/dev/__tests__/local-only.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Write the server action**

Create `app/dev/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isDevQuickAccessEnabled, readSeedManifest } from '@/lib/dev/local-only'

// Not an authentication bypass. This performs exactly the sign-in that /login
// performs — signInWithPassword through the normal SSR client — with the typing
// done for you. If this route ever reached production it would be a login form
// that no real account can satisfy, because no real account has the seed
// password. The guards below make that moot regardless.
//
// Returns void and always ends in a redirect: React types a <form action> as
// returning void | Promise<void>, so handing back an { error } object fails
// `tsc --noEmit`. Failures come back as a query parameter instead.
export async function devSignIn(email: string): Promise<void> {
  if (!isDevQuickAccessEnabled()) redirect('/')

  const fail = (reason: string) => redirect(`/dev?error=${encodeURIComponent(reason)}`)

  const manifest = readSeedManifest()
  // Only addresses the seed itself created. Without this the action would be an
  // oracle for testing the seed password against arbitrary accounts.
  const account = manifest?.accounts.find((a) => a.email === email)
  if (!account || !manifest) fail('Compte inconnu — relancez `pnpm seed`.')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: account!.email,
    password: manifest!.password,
  })
  if (error) fail(error.message)

  redirect(account!.role === 'organizer' ? '/dashboard' : '/my-forms')
}
```

- [ ] **Step 6: Write the page**

Create `app/dev/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { isDevQuickAccessEnabled, readSeedManifest, type SeedAccount } from '@/lib/dev/local-only'
import { devSignIn } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accès rapide (local)', robots: { index: false, follow: false } }

function AccountButton({ account }: { account: SeedAccount }) {
  const signIn = devSignIn.bind(null, account.email)
  return (
    <form action={signIn}>
      <button
        type="submit"
        className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{account.name}</span>
          <span className="block truncate text-sm text-slate-500">{account.email}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{account.note}</span>
      </button>
    </form>
  )
}

export default async function DevPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!isDevQuickAccessEnabled()) notFound()

  const { error } = await searchParams
  const manifest = readSeedManifest()
  if (!manifest) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <h1 className="font-display text-2xl font-bold text-slate-900">Accès rapide</h1>
        <p className="mt-4 text-slate-600">
          Aucun jeu de données trouvé. Lancez <code className="rounded bg-slate-100 px-1.5 py-0.5">pnpm seed</code>{' '}
          puis rechargez cette page.
        </p>
      </main>
    )
  }

  const organizers = manifest.accounts.filter((a) => a.role === 'organizer')
  const students = manifest.accounts.filter((a) => a.role === 'student')
  const highlighted = students.filter((s) => s.highlight)
  const rest = students.filter((s) => !s.highlight)

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="font-display text-2xl font-bold text-slate-900">Accès rapide</h1>
      <p className="mt-1 text-sm text-slate-500">
        {manifest.school} · {manifest.exchange} · {students.length} élèves · local uniquement
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">Organisateurs</h2>
      <div className="mt-3 flex flex-col gap-2">
        {organizers.map((a) => <AccountButton key={a.email} account={a} />)}
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">Élèves — cas courants</h2>
      <div className="mt-3 flex flex-col gap-2">
        {highlighted.map((a) => <AccountButton key={a.email} account={a} />)}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-slate-600">Tous les élèves ({students.length})</summary>
        <div className="mt-3 flex flex-col gap-2">
          {rest.map((a) => <AccountButton key={a.email} account={a} />)}
        </div>
      </details>

      <p className="mt-10 text-sm text-slate-500">
        <a className="underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">Boîte mail locale</a>
        {' · '}
        <a className="underline" href="http://127.0.0.1:54323" target="_blank" rel="noreferrer">Supabase Studio</a>
        {' · '}
        <span>Remettre à zéro : <code className="rounded bg-slate-100 px-1.5 py-0.5">pnpm dev --reseed</code></span>
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Pour être organisateur et élève en même temps, utilisez deux profils de navigateur.
      </p>
    </main>
  )
}
```

- [ ] **Step 7: Write the page guard test**

Create `app/dev/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({ notFound, redirect: vi.fn() }))
vi.mock('../actions', () => ({ devSignIn: vi.fn() }))

const manifest = {
  version: 1,
  password: 'demo1234',
  school: 'Lycée Démo (seed)',
  exchange: 'Échange Démo 2026',
  accounts: [
    { email: 'orga@seed.example.com', name: 'Claire Organisatrice', role: 'organizer', note: 'owner', highlight: true },
    { email: 'eleve-01@seed.example.com', name: 'Camille Bernard', role: 'student', note: 'rien commencé', highlight: true },
  ],
}

vi.mock('@/lib/dev/local-only', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dev/local-only')>()),
  readSeedManifest: () => manifest,
}))

afterEach(() => {
  vi.unstubAllEnvs()
  notFound.mockClear()
})

async function render() {
  const { default: DevPage } = await import('../page')
  return DevPage({ searchParams: Promise.resolve({}) })
}

describe('/dev guard', () => {
  it('404s in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('404s against a remote database', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://rgisrqlbcjdoetoybaqd.supabase.co')
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders locally in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    await expect(render()).resolves.toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 8: Run the page tests**

Run: `pnpm exec vitest run app/dev/__tests__/page.test.tsx`
Expected: PASS — 3 tests.

If module-level env caching makes the stubs ineffective, add `vi.resetModules()` in `afterEach` — `render()` already uses a dynamic `import` so each case re-evaluates the module.

- [ ] **Step 9: Let `/dev` through the middleware**

In `middleware.ts`, add `/dev` to the `isPublicRoute` expression, directly after the `pathname === '/'` line:

```ts
  const isPublicRoute =
    pathname === '/' ||
    // Local-only quick-access page. Public so it renders with no session AND
    // while logged in as someone else — switching accounts is its whole job.
    // It guards itself: app/dev/page.tsx 404s outside development or against a
    // non-local database.
    pathname.startsWith('/dev') ||
    // CGU / CGV / confidentialité / mentions légales. These are linked from the
```

- [ ] **Step 10: Verify in the browser**

```bash
pnpm dev
```

Then check, at the port the banner printed:

1. `/dev` lists 2 organizers, 4 highlighted students, and 16 more behind the disclosure.
2. Clicking the organizer lands on `/dashboard` showing 20 students.
3. Open a second browser profile, click `Camille Bernard` → `/my-forms` with nothing started.
4. `Noah Lambert` shows an overdue form; `Sarah Benali` shows five approved and one missing.
5. `Marie-Ambre de La Rochefoucauld-Montmorency` does not break the dashboard table layout.

- [ ] **Step 11: Commit**

```bash
git add lib/dev/local-only.ts lib/dev/__tests__/local-only.test.ts app/dev/actions.ts app/dev/page.tsx app/dev/__tests__/page.test.tsx middleware.ts
git commit -m "$(cat <<'EOF'
feat(dev): one-click sign-in to the organizer and student portals

Reaching a given app state meant typing credentials for whichever seeded
account happened to be in the right shape. /dev lists them from the seed
manifest and signs you in on click.

It is not an authentication bypass: the action performs exactly the
signInWithPassword that /login performs, restricted to addresses the seed
itself created. Two independent server-side guards gate it — NODE_ENV and a
host-equality check on the Supabase URL — so a misconfigured build cannot
expose it, and were it ever served in production it would be a login form no
real account can satisfy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full-gate verification

**Files:** none — this task only runs the gate and reports.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors. If it flags the raw `http://127.0.0.1:54324` anchors in `app/dev/page.tsx`, keep them — they are deliberately absolute, cross-origin links to the local stack, not app routes.

- [ ] **Step 2: Types**

Run: `pnpm exec tsc --noEmit`
Expected: clean. `scripts/**` is outside `tsconfig.json`'s `include` and is not checked; if an error points there, an `.mjs` module is being imported from `.ts`/`.tsx` — break that import.

- [ ] **Step 3: Tests**

Run: `pnpm test`
Expected: PASS, including all six new test files (`seed-cast`, `manifest`, `local-target`, `env-file`, `port`, `local-only`, `app/dev/page`).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: succeeds. `/dev` appears in the route list as a dynamic route (`ƒ`), never static — `export const dynamic = 'force-dynamic'` guarantees the guard runs per request rather than being baked in at build time.

- [ ] **Step 5: Cold-start proof**

The headline claim is that a stopped stack becomes a populated app with one command. Prove it:

```bash
pnpm exec supabase stop
pnpm dev
```

Expected: the stack starts, migrations apply, the world seeds, the banner prints, and `/dev` signs you into the dashboard — with no other command typed. Note the elapsed time.

- [ ] **Step 6: Guard proof**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://rgisrqlbcjdoetoybaqd.supabase.co node scripts/dev.mjs; echo "exit: $?"
```

Expected: refusal, `exit: 1`, no server.

- [ ] **Step 7: Confirm nothing secret is staged**

```bash
git branch --show-current
git log --oneline main..HEAD
git diff main..HEAD --stat
git diff main..HEAD | grep -iE 'sk_(test|live)|whsec_|re_[A-Za-z0-9]|sbp_|sb_secret_' || echo "no secrets in the diff — correct"
```

Expected: branch is `feature/local-dev-loop`; six commits; no `.env.local`, `.env.prod` or `.seed-manifest.json` in the diff; `no secrets in the diff`.

The local-stack JWTs in `scripts/lib/local-target.mjs` are the demo keys Supabase publishes and prints on every `supabase start` — identical on every machine, worthless anywhere else. They are not caught by the grep above and are intentionally committed.

- [ ] **Step 8: Report**

Report to Bjorn: the gate results, the cold-start time from Step 5, and anything observed in Step 10 of Task 6 that looked wrong. Merging to `main` needs his confirmation — do not merge unprompted.

---

## Notes for the executor

**Read before starting:** `docs/superpowers/specs/2026-07-28-local-dev-loop-design.md` (the spec this implements) and `CLAUDE.md` (project rules, especially Git Workflow and Parallel Sessions).

**Task 4 is the odd one out.** It edits gitignored files, so almost nothing about it is reviewable from the diff. Run its verification step verbatim and paste the output rather than summarising it.

**If `pnpm seed` fails partway through**, it is safe to re-run: every run wipes and rebuilds the seeded world, touching only the seed school and `@seed.example.com` auth users.

**If a test fails once and passes on re-run**, that is a parallel session mid-write, not a bug. Re-run the single file before debugging it.

**Do not merge to `main`.** The final merge needs the full gate green *and* Bjorn's explicit go-ahead.
