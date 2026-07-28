import { existsSync, readFileSync } from 'node:fs'

// .seed-manifest.json is the contract between `pnpm seed` and everything that
// needs to log in as one of its accounts — the /dev page and, here, the smoke
// suite. Reading it (rather than hardcoding a password) means the suite
// exercises the real authentication path with the real credentials.
export type SeedAccount = {
  email: string
  name: string
  role: 'organizer' | 'student'
  note: string
  highlight: boolean
  smoke?: boolean
}

export type SeedManifest = {
  version: number
  password: string
  school: string
  exchange: string
  accounts: SeedAccount[]
}

export const ORGANIZER_EMAIL = 'orga@seed.example.com'
// The two reserved students (scripts/seed-cast.mjs SMOKE_STUDENTS). One per
// Playwright worker, so no two specs ever contend on the same dossier.
export const SMOKE_STUDENT_A = 'smoke-01@seed.example.com'
export const SMOKE_STUDENT_B = 'smoke-02@seed.example.com'
// exchanges.apply_slug, set by scripts/seed-demo.mjs.
export const APPLY_SLUG = 'demo-2026'
export const SEED_DOMAIN = 'seed.example.com'

export function readManifest(): SeedManifest {
  if (!existsSync('.seed-manifest.json')) {
    throw new Error(
      'No .seed-manifest.json — the local world has not been built. Run `pnpm dev --reseed`.',
    )
  }
  return JSON.parse(readFileSync('.seed-manifest.json', 'utf8')) as SeedManifest
}

export function account(email: string): SeedAccount {
  const found = readManifest().accounts.find((a) => a.email === email)
  if (!found) {
    throw new Error(`${email} is not in the seed manifest. Run \`pnpm dev --reseed\`.`)
  }
  return found
}

/** The twenty human-facing students; the reserved pair is excluded. */
export function humanStudentCount(): number {
  return readManifest().accounts.filter((a) => a.role === 'student' && !a.smoke).length
}
