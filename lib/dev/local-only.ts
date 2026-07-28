import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SeedAccount = {
  email: string
  name: string
  role: 'organizer' | 'student'
  note: string
  highlight: boolean
  // Reserved for the automated smoke suite (scripts/seed-cast.mjs
  // SMOKE_STUDENTS). Clicking one by hand is harmless but its dossier is
  // rewritten by the next `pnpm ship`.
  smoke?: boolean
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
    return JSON.parse(
      readFileSync(join(process.cwd(), '.seed-manifest.json'), 'utf8'),
    ) as SeedManifest
  } catch {
    return null
  }
}
