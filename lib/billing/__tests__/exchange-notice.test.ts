import { describe, it, expect } from 'vitest'
import { exchangeNoticeMessage } from '../exchange-notice'

describe('exchangeNoticeMessage', () => {
  it('returns a warning notice for trial users', () => {
    const notice = exchangeNoticeMessage({ isTrial: true, remaining: 1 })
    expect(notice?.tone).toBe('warning')
    expect(notice?.message).toContain('période d’essai')
    expect(notice?.message).toContain('un seul échange')
  })

  it('returns a plural info notice for a paid plan with several left', () => {
    const notice = exchangeNoticeMessage({ isTrial: false, remaining: 2 })
    expect(notice?.tone).toBe('info')
    expect(notice?.message).toContain('2 échanges')
    expect(notice?.message).toContain('consommera un')
  })

  it('returns a singular info notice when exactly one is left', () => {
    const notice = exchangeNoticeMessage({ isTrial: false, remaining: 1 })
    expect(notice?.tone).toBe('info')
    expect(notice?.message).toContain('1 échange à créer')
    expect(notice?.message).toContain('l’utilisera')
    expect(notice?.message).not.toContain('échanges')
  })

  it('returns null for an unlimited (Scale) plan', () => {
    expect(exchangeNoticeMessage({ isTrial: false, remaining: Infinity })).toBeNull()
  })
})
