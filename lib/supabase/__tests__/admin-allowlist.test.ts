import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

// D1/D2 (multi-tenancy spec): RLS is the isolation layer; the service-role
// client (lib/supabase/admin — bypasses RLS) may only be imported from this
// reviewed allowlist. A new import is a design decision, not a convenience:
// prefer a scoped RLS policy; if the service role is genuinely required,
// extend this list deliberately in the same change and say why in the commit.
const ALLOWLIST = [
  'actions/apply.ts',
  'actions/applications-review.ts',
  'actions/invitations.ts',
  'actions/exchanges.ts',
  'actions/join.ts',
  'actions/settings.ts',
  'app/api/stripe/webhook/route.ts',
  'app/auth/callback/route.ts',
  'app/billing/checkout/route.ts',
  'app/billing/portal/route.ts',
  'lib/audit.ts',
  'lib/auth/provision.ts',
  'lib/email-log.ts',
  'lib/rate-limit.ts',
].sort()

// vitest runs with cwd = repo root (where vitest.config.ts lives); avoid
// __dirname, which is unreliable under vitest's ESM transform.
const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'actions', 'lib', 'components']
const ROOT_FILES = ['middleware.ts']
// Matches only static `import … from '…/supabase/admin'`. Assumes the app's
// static-import convention (verified: no dynamic `import()` of the admin client
// exists today) — a dynamic import would slip past this guard.
const IMPORT_RE = /from\s+['"][^'"]*supabase\/admin['"]/

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('service-role admin-client allowlist', () => {
  it('only allowlisted files import lib/supabase/admin', () => {
    const candidates = [
      ...SCAN_DIRS.flatMap((d) => tsFiles(join(ROOT, d))),
      ...ROOT_FILES.map((f) => join(ROOT, f)).filter((p) => existsSync(p)),
    ]
    const importers = candidates
      .filter((f) => IMPORT_RE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      .sort()
    expect(importers).toEqual(ALLOWLIST)
  })
})
