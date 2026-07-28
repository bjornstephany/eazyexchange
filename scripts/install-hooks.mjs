#!/usr/bin/env node
/**
 * Copy scripts/hooks/pre-push into the repository's hooks directory.
 *
 * Two things worth knowing:
 *
 *  - Hooks live in the COMMON git dir (`git rev-parse --git-common-dir`), which
 *    every worktree shares. Installing from a worktree therefore installs for
 *    the main checkout too. That is the behaviour we want — one gate, one copy.
 *  - We stay with .git/hooks rather than switching to core.hooksPath, which is
 *    a global-ish setting this repo has no other reason to claim.
 *
 * Run by `pnpm wt` (new worktrees) and by pnpm's `prepare` lifecycle (fresh
 * clones). Silent and successful when there is nothing to do.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const SOURCE = 'scripts/hooks/pre-push'

// Not a git checkout (a tarball, a Docker build context): nothing to install.
let commonDir
try {
  commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  process.exit(0)
}

// Run from somewhere other than the repo root (a nested install): leave it.
if (!existsSync(SOURCE)) process.exit(0)

const hooksDir = path.resolve(commonDir, 'hooks')
mkdirSync(hooksDir, { recursive: true })
const dest = path.join(hooksDir, 'pre-push')

const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null
const canonical = readFileSync(SOURCE, 'utf8')
if (current !== canonical) {
  copyFileSync(SOURCE, dest)
  console.log(`→ pre-push hook installed into ${dest}`)
}
chmodSync(dest, 0o755)
