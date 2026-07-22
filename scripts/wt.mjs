#!/usr/bin/env node
/**
 * pnpm wt — finish setting up the worktree the session is CURRENTLY in.
 *
 * The worktree itself is created by the EnterWorktree tool, which switches the
 * running session into it (one session = one worktree = one branch, without
 * having to start a second session). EnterWorktree gives you the directory and
 * the branch; this script adds the three things it does not know about:
 *
 *   1. .env.local / .env.staging  — symlinked from the main checkout, which is
 *      the only place they exist (they are gitignored, so a fresh worktree has
 *      none and every server action fails with a placeholder-env 500).
 *   2. .wtport                    — a deterministic dev port, so two worktrees
 *      can never race for 3000 and leave you testing the wrong branch.
 *   3. node_modules               — a worktree starts empty.
 *
 * Run it once, from inside the worktree, right after EnterWorktree.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ENV_FILES = ['.env.local', '.env.staging']

function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()
}

/** Stable port per worktree name: same worktree always gets the same port. */
function portFor(name) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 3100 + (h % 800)
}

const here = capture('git', ['rev-parse', '--show-toplevel'])
const gitDir = capture('git', ['rev-parse', '--absolute-git-dir'])
const commonDir = path.resolve(capture('git', ['rev-parse', '--git-common-dir']))

// In the main checkout the git dir IS the common dir; in a worktree it is
// <common>/worktrees/<name>. Refuse to run in the main checkout: symlinking
// .env.local onto itself and pinning a non-3000 port there would be wrong.
if (gitDir === commonDir) {
  console.error('✗ not in a worktree — this is the main checkout.')
  console.error('  Use the EnterWorktree tool first, then run `pnpm wt` inside it.')
  process.exit(1)
}

const mainCheckout = path.dirname(commonDir)
const name = path.basename(here)
const port = portFor(name)
const branch = capture('git', ['branch', '--show-current']) || '(detached)'

for (const f of ENV_FILES) {
  const src = path.join(mainCheckout, f)
  const dest = path.join(here, f)
  if (existsSync(dest)) {
    console.log(`→ ${f} already present`)
    continue
  }
  if (!existsSync(src)) {
    console.warn(`⚠ ${f} not found in ${mainCheckout} — skipped`)
    continue
  }
  symlinkSync(src, dest)
  console.log(`→ linked ${f}`)
}

writeFileSync(path.join(here, '.wtport'), `${port}\n`)
console.log(`→ dev port pinned to ${port}`)

console.log('→ pnpm install')
execFileSync('pnpm', ['install', '--silent'], { stdio: 'inherit', cwd: here })

console.log(`
✓ ready — ${branch} in ${here}

  Keep working in THIS session. Dev server: http://localhost:${port} (pnpm dev).
  When the branch is merged, leave with the ExitWorktree tool (remove).
`)
