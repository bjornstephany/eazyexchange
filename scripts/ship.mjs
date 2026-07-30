#!/usr/bin/env node
/**
 * `pnpm ship` — verify a branch completely, in a real browser, against a real
 * database.
 *
 * VERIFY ONLY. It runs the gate, prints a verdict, and touches git not at all:
 * no merge, no push, no deploy. A command that can deploy is a command that can
 * deploy by accident.
 *
 *   1. refuse to run unless the Supabase URL is local
 *   2. refuse to run unless the local stack is up
 *   3. refuse to run unless this worktree has been seeded
 *   4. refuse to run if the smoke's port is already bound
 *   5. lint · test:rls · tsc · test · build · smoke   (cheapest first)
 *   6. verdict
 *
 * Ring 2 of three. Ring 1 is the pre-push hook, ring 3 is CI — and ring 3 is
 * the copy that enforces, because both local rings are bypassable by a human.
 */
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import { readEnvFile } from './lib/env-file.mjs'
import { resolvePort } from './lib/port.mjs'
import { stackIsUp } from './lib/stack.mjs'
import { SHIP_STEPS, runSteps } from './lib/ship-steps.mjs'
import { isLocalSupabaseUrl, LOCAL_API_URL } from './lib/local-target.mjs'
import { checkSeedManifest, SEED_MANIFEST_FILE } from './lib/seed-manifest.mjs'

const step = (msg) => process.stdout.write(`\n  ▸ ${msg}\n`)
const die = (title, ...lines) => {
  process.stderr.write(`\n  ✗ ${title}\n${lines.map((l) => `    ${l}\n`).join('')}\n`)
  process.exit(1)
}

const started = Date.now()
const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`

// --- 1. the guard -----------------------------------------------------------

const env = readEnvFile('.env.local')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL

if (!isLocalSupabaseUrl(supabaseUrl)) {
  die(
    'Refusing to ship-check: .env.local does not point at a local database.',
    `NEXT_PUBLIC_SUPABASE_URL = ${supabaseUrl ?? '(unset)'}`,
    '',
    'The smoke suite submits forms and approves them. It must never be aimed at',
    'a real project, and .env.prod exists on this machine.',
    `Set NEXT_PUBLIC_SUPABASE_URL=${LOCAL_API_URL} in .env.local`,
    '(see .env.example for the full local block).',
  )
}

// --- 2. the stack -----------------------------------------------------------

if (!(await stackIsUp())) {
  die(
    'The local Supabase stack is down.',
    'test:rls and the smoke suite both need it.',
    '',
    'Start Docker Desktop on Windows, wait for it to report Running,',
    'then re-run `pnpm ship`.',
  )
}
step('Supabase local — up')

// --- 3. the seeded world ----------------------------------------------------

// Without this the run gets all the way to the smoke step — three minutes in,
// after lint, RLS, types, unit and a full production build — and then fails
// FOUR specs at once with "No .seed-manifest.json". That reads like four broken
// tests rather than one missing prerequisite, and it has cost real time more
// than once. Fail here instead, in under a millisecond, with the command that
// fixes it. What counts as usable, and why, is in lib/seed-manifest.mjs.
const seed = checkSeedManifest(
  existsSync(SEED_MANIFEST_FILE) ? readFileSync(SEED_MANIFEST_FILE, 'utf8') : null,
)
if (!seed.ok) die(seed.title, ...seed.lines)
step('Seed manifest — present')

// --- 4. the port ------------------------------------------------------------

const port = resolvePort(existsSync('.wtport') ? readFileSync('.wtport', 'utf8') : null)
// localhost, matching playwright.config.ts: Next resolves middleware redirect
// hosts to localhost, so the bundle must be built for the origin the browser
// will actually use or every client-side navigation goes cross-origin.
const baseUrl = `http://localhost:${port}`

const portIsFree = (p) =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(p, '127.0.0.1')
  })

if (!(await portIsFree(port))) {
  die(
    `Port ${port} is already bound.`,
    'The smoke suite serves the production build on this worktree’s pinned port',
    '(.wtport), and something is already there — almost always `pnpm dev` in',
    'this same worktree.',
    '',
    `Stop it (Ctrl+C in that terminal), then re-run \`pnpm ship\`.`,
  )
}
step(`Smoke port ${port} — free`)

// --- 5. the gate ------------------------------------------------------------

// NEXT_PUBLIC_* are inlined at build time, so the bundle the smoke drives has
// to be built with the URL it will actually be served on.
const childEnv = { ...process.env, NEXT_PUBLIC_APP_URL: baseUrl }

const result = runSteps(SHIP_STEPS, (s) => {
  step(`${s.label} — running (${elapsed()} elapsed)`)
  return spawnSync(s.cmd, s.args, { stdio: 'inherit', env: childEnv }).status ?? 1
})

// --- 6. the verdict ---------------------------------------------------------

if (!result.ok) {
  const failed = result.failed
  const extra =
    failed.key === 'smoke'
      ? [
          '',
          'The failing spec, its trace and its screenshots are in the report:',
          '  pnpm exec playwright show-report',
          'Re-run one spec interactively with:',
          `  ${failed.hint}`,
          '',
          'If chromium failed to launch, install it:',
          '  pnpm exec playwright install --with-deps chromium',
        ]
      : ['', 'Reproduce it with:', `  ${failed.hint}`]

  die(`${failed.label} failed — the branch is NOT ready. (${elapsed()})`, ...extra)
}

process.stdout.write(
  `\n  ✓ Ship gate passed in ${elapsed()}.\n` +
    `    lint · RLS · types · unit · build · smoke — all green.\n\n` +
    `    Nothing was pushed, merged or deployed: that is still yours to do.\n\n`,
)
