import { describe, it, expect } from 'vitest'
import { checkSeedManifest, SEED_MANIFEST_FILE } from '../lib/seed-manifest.mjs'

// Unit-tested rather than asserted through spawn-ship.mjs (the pattern in
// ship-guard.test.mjs), because this guard is the THIRD one: reaching it means
// getting past the local-database check and the "is the stack up" probe, so a
// spawned ship would refuse at step 2 on any machine with Docker closed and in
// CI. The ordering half — that ship never reaches this guard when an earlier one
// fires — is asserted in ship-guard.test.mjs, which pays no such cost.

const valid = JSON.stringify({ version: 1, password: 'demo1234', accounts: [] })

describe('checkSeedManifest', () => {
  it('accepts a manifest carrying a password', () => {
    expect(checkSeedManifest(valid)).toEqual({ ok: true })
  })

  it('rejects an absent manifest', () => {
    const r = checkSeedManifest(null)
    expect(r.ok).toBe(false)
    expect(r.title).toContain('never been seeded')
  })

  it('treats undefined the same as absent — the caller may pass either', () => {
    expect(checkSeedManifest(undefined).title).toBe(checkSeedManifest(null).title)
  })

  it.each([
    ['a half-written file', '{"password": "dem'],
    ['not JSON at all', 'pnpm seed failed\n'],
    ['an empty file', ''],
  ])('rejects %s', (_label, raw) => {
    const r = checkSeedManifest(raw)
    expect(r.ok).toBe(false)
    expect(r.title).toContain('not valid JSON')
  })

  it.each([
    ['no password key', '{"version":1,"accounts":[]}'],
    ['an empty password', '{"password":""}'],
    ['a non-string password', '{"password":1234}'],
    ['a null document', 'null'],
    ['a bare string document', '"seeded"'],
  ])('rejects a manifest with %s', (_label, raw) => {
    const r = checkSeedManifest(raw)
    expect(r.ok).toBe(false)
    expect(r.title).toContain('no password')
  })

  // The whole point of failing here rather than in the smoke suite is that the
  // developer is told what to run. A failure that omits it is a regression.
  it.each([
    ['absent', null],
    ['unparseable', '{'],
    ['passwordless', '{"version":1}'],
    ['a null document', 'null'],
  ])('names the fix when %s', (_label, raw) => {
    const r = checkSeedManifest(raw)
    expect(r.lines.join('\n')).toContain('pnpm seed')
  })

  it('names the file in every failure', () => {
    for (const raw of [null, '{', '{"version":1}']) {
      expect(checkSeedManifest(raw).title).toContain(SEED_MANIFEST_FILE)
    }
    expect(SEED_MANIFEST_FILE).toBe('.seed-manifest.json')
  })

  // Deliberate non-goal, pinned so nobody "fixes" it by accident: a manifest
  // with a password but no reserved smoke students is accepted here. See the
  // accepted gap in lib/seed-manifest.mjs.
  it('does not require the reserved smoke students', () => {
    const noSmoke = JSON.stringify({
      version: 1,
      password: 'demo1234',
      accounts: [{ email: 'orga@seed.example.com', role: 'organizer', smoke: false }],
    })
    expect(checkSeedManifest(noSmoke)).toEqual({ ok: true })
  })
})
