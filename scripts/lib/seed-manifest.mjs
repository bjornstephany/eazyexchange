// Reading `.seed-manifest.json` back. The sibling `manifest.mjs` WRITES it —
// `pnpm seed` serialises what buildManifest() returns. Two directions, two
// files: nothing here should ever grow knowledge of the manifest's shape beyond
// what a consumer must be able to rely on.
//
// The one field asserted is `password`: tests/smoke/helpers/auth.ts reads it
// and signs in through /login with it, so every spec in the suite fails without
// it. That makes it the cheapest possible proxy for "this worktree has been
// seeded" — the condition actually being tested.
//
// Deliberately NOT asserted: the two reserved smoke students. Their addresses
// are constants in tests/smoke/helpers/manifest.ts, and `accounts` carries them
// flagged `smoke: true` so /dev can list them do-not-click rather than as
// clickable logins. Known gap, accepted: round-trip.spec.ts calls
// `account(SMOKE_STUDENT_A)`, which does look them up here, so a manifest
// written by a seed predating scripts/seed-cast.mjs's SMOKE_STUDENTS would pass
// this guard and still fail that spec. Widening the guard to cover it would
// pin the accounts shape in a second place; the smoke helper's own error names
// the fix, and re-seeding is the fix for both.
export const SEED_MANIFEST_FILE = '.seed-manifest.json'

const HINT = 'Run `pnpm seed`, then re-run `pnpm ship`.'

/**
 * Is the seeded world present and usable?
 *
 * `raw` is the file's contents, or null/undefined when it does not exist —
 * the caller owns the filesystem so this stays pure.
 *
 * Returns `{ ok: true }`, or `{ ok: false, title, lines }` ready to hand
 * straight to ship's `die()`. The prose lives here rather than at the call site
 * so the guidance a developer actually sees is what the tests assert.
 */
export function checkSeedManifest(raw) {
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      title: `No ${SEED_MANIFEST_FILE} — this worktree has never been seeded.`,
      lines: ['The smoke suite signs in with the accounts `pnpm seed` creates.', '', HINT],
    }
  }

  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (err) {
    return {
      ok: false,
      title: `${SEED_MANIFEST_FILE} is not valid JSON (${err.message}).`,
      lines: ['Delete it and re-seed — a half-written file is not repairable.', '', HINT],
    }
  }

  if (typeof manifest?.password !== 'string' || manifest.password.length === 0) {
    return {
      ok: false,
      title: `${SEED_MANIFEST_FILE} has no password — it is incomplete or from an older seed.`,
      lines: ['The smoke suite cannot sign in without it.', '', HINT],
    }
  }

  return { ok: true }
}
