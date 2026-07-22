#!/usr/bin/env node
/**
 * `pnpm dev` wrapper: honours the per-worktree port pinned in `.wtport`.
 *
 * Without this, two worktrees both ask for 3000 and the second silently lands
 * on 3001 — so you end up testing the wrong branch. `pnpm wt` writes `.wtport`;
 * the main checkout has none and keeps 3000.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const port = existsSync('.wtport') ? readFileSync('.wtport', 'utf8').trim() : '3000'
const args = process.argv.slice(2)

const hasPortFlag = args.some((a) => a === '-p' || a === '--port' || a.startsWith('--port='))
const next = hasPortFlag ? ['dev', ...args] : ['dev', '--port', port, ...args]

// spawnSync (not execFileSync) so Ctrl+C exits quietly instead of throwing.
const { status } = spawnSync('next', next, { stdio: 'inherit' })
process.exit(status ?? 0)
