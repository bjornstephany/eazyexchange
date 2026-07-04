import { describe, it, expect } from 'vitest'
import { inviteState } from '@/lib/team/invite-state'

const now = new Date('2026-07-04T12:00:00Z')
const base = { expires_at: '2026-07-18T12:00:00Z', accepted_at: null, revoked_at: null }

describe('inviteState', () => {
  it('missing row → invalid', () => expect(inviteState(null, now)).toBe('invalid'))
  it('revoked wins over everything', () =>
    expect(inviteState({ ...base, revoked_at: '2026-07-03T00:00:00Z', accepted_at: '2026-07-02T00:00:00Z' }, now)).toBe('revoked'))
  it('accepted → accepted', () =>
    expect(inviteState({ ...base, accepted_at: '2026-07-03T00:00:00Z' }, now)).toBe('accepted'))
  it('past expiry → expired', () =>
    expect(inviteState({ ...base, expires_at: '2026-07-04T11:59:59Z' }, now)).toBe('expired'))
  it('live → ok', () => expect(inviteState(base, now)).toBe('ok'))
})
