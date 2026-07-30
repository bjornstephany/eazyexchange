import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'

// The remote URLs come from scripts/__tests__/local-target.test.mjs — the same
// cases isLocalSupabaseUrl is proven against, now asserted through ship itself.
//
// HAZARD: if the guard ever regressed, ship would fall through to `pnpm lint`,
// `pnpm test` … from inside `pnpm test`. The timeout is what bounds that; a
// regression shows up here as a timeout, loudly, rather than as a fork bomb.
const run = (url) =>
  spawnSync('node', ['scripts/ship.mjs'], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url },
  })

describe('pnpm ship — the local-database guard', () => {
  it.each([
    'https://rgisrqlbcjdoetoybaqd.supabase.co',
    'https://loygdbjdyciipvdcpvmr.supabase.co',
    'https://127.0.0.1.evil.com',
    'http://192.168.1.10:54321',
  ])('refuses %s', (url) => {
    const r = run(url)
    expect(r.status, r.stdout + r.stderr).toBe(1)
    expect(r.stderr).toContain('does not point at a local database')
    // It must print the offending value so the reader can see what is wrong.
    expect(r.stderr).toContain(url)
  })

  it('starts nothing before refusing — no lint, no build, no server', () => {
    const r = run('https://rgisrqlbcjdoetoybaqd.supabase.co')
    expect(r.stdout).not.toContain('Lint')
    expect(r.stdout).not.toContain('Production build')
    expect(r.stdout).not.toContain('Supabase local — up')
    // …and it checks nothing else either. This one is worth pinning: the seed
    // guard is a filesystem read against the CWD, so ordering it before the
    // database guard would let a manifest-less worktree be judged before we
    // know the run is even aimed somewhere safe.
    expect(r.stdout).not.toContain('Seed manifest')
  })
}, 30_000)
