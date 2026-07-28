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
  LOCAL_SERVICE_KEY,
  LOCAL_STUDIO_URL,
} from './lib/local-target.mjs'

const SEED_SCHOOL = 'Lycée Démo (seed)'

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
    "Local development must not read or write real users' records.",
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
      die(
        'supabase db reset failed.',
        'Run it directly to see the failing migration:',
        '  pnpm exec supabase db reset',
      )
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

  // The service key, not the anon key: RLS on `schools` routes through
  // school_paired_with_mine(), which anon has no EXECUTE grant on — so an anon
  // read 403s, worldExists() reads false, and every `pnpm dev` would wipe and
  // rebuild the world a parallel session is mid-click in. This is the local
  // stack's published demo key and the query is a single existence check.
  const worldExists = async () => {
    try {
      const res = await fetch(
        `${LOCAL_API_URL}/rest/v1/schools?select=id&limit=1&name=eq.${encodeURIComponent(SEED_SCHOOL)}`,
        { headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}` } },
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
