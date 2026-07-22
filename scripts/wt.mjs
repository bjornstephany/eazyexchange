#!/usr/bin/env node
/**
 * pnpm wt <slug> — create an isolated worktree for one Claude session.
 *
 * One session = one worktree = one branch. See CLAUDE.md § Parallel Sessions.
 *
 * Creates ../eazyexchange-<slug> on branch <prefix>/<slug> off origin/main,
 * links the env files in, installs deps, and pins a deterministic dev port so
 * two worktrees can never race for 3000.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim()
const ENV_FILES = ['.env.local', '.env.staging']

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts })
}

function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...opts }).trim()
}

/** Stable port per slug: same worktree always gets the same port, 3100–3899. */
function portFor(slug) {
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 3100 + (h % 800)
}

const slug = process.argv[2]
const prefix = process.argv[3] ?? 'feature'

if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('usage: pnpm wt <slug> [branch-prefix]   (slug: lowercase, dashes)')
  console.error('example: pnpm wt recap-pdf        -> feature/recap-pdf')
  console.error('         pnpm wt bad-total fix    -> fix/bad-total')
  process.exit(1)
}

const branch = `${prefix}/${slug}`
const dir = path.join(path.dirname(ROOT), `eazyexchange-${slug}`)
const port = portFor(slug)

if (existsSync(dir)) {
  console.error(`✗ ${dir} already exists. Open a session there, or remove it first:`)
  console.error(`  git worktree remove ${dir}`)
  process.exit(1)
}

// Branch off the freshest main we can reach. WSL2 DNS flakiness is not fatal.
let base = 'origin/main'
try {
  execFileSync('git', ['fetch', 'origin', 'main'], { cwd: ROOT, stdio: 'pipe' })
} catch {
  base = 'main'
  console.warn('⚠ could not fetch origin — branching off local main instead')
}

const branchExists = (() => {
  try {
    execFileSync('git', ['rev-parse', '--verify', branch], { cwd: ROOT, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

console.log(`→ worktree ${dir}`)
if (branchExists) {
  console.log(`→ reusing existing branch ${branch}`)
  run('git', ['worktree', 'add', dir, branch])
} else {
  run('git', ['worktree', 'add', '-b', branch, dir, base])
}

// Env files live only in the main checkout; link so every worktree shares them.
for (const f of ENV_FILES) {
  const src = path.join(ROOT, f)
  if (!existsSync(src)) {
    console.warn(`⚠ ${f} not found in the main checkout — skipped`)
    continue
  }
  symlinkSync(src, path.join(dir, f))
  console.log(`→ linked ${f}`)
}

writeFileSync(path.join(dir, '.wtport'), `${port}\n`)
console.log(`→ dev port pinned to ${port}`)

console.log('→ pnpm install')
run('pnpm', ['install', '--silent'], { cwd: dir })

const head = capture('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir })

console.log(`
✓ ready — ${branch} @ ${head}

  Open a NEW Claude session there (do not reuse this one):

    cd ${dir} && claude

  Dev server runs on http://localhost:${port} (pnpm dev).
  When it is merged:  git worktree remove ${dir}
`)
