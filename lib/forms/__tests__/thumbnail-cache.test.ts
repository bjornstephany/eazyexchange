import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getCachedThumbnail, putCachedThumbnail, clearThumbnailMemoryCache,
} from '@/lib/forms/thumbnail-cache'

beforeEach(() => {
  localStorage.clear()
  clearThumbnailMemoryCache()
  vi.restoreAllMocks()
})

describe('thumbnail cache', () => {
  it('round-trips through localStorage keyed by file path', () => {
    putCachedThumbnail('s1/t1.pdf', 'data:image/png;base64,AAA')
    clearThumbnailMemoryCache() // force the localStorage layer
    expect(getCachedThumbnail('s1/t1.pdf')).toBe('data:image/png;base64,AAA')
    expect(getCachedThumbnail('s1/other.pdf')).toBeNull()
  })

  it('a replaced file path is a different key (automatic invalidation)', () => {
    putCachedThumbnail('s1/t1.pdf', 'data:old')
    expect(getCachedThumbnail('s1/t1-v2.pdf')).toBeNull()
  })

  it('caps entries at 20, evicting the oldest', () => {
    for (let i = 0; i < 25; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + i)
      putCachedThumbnail(`s1/t${i}.pdf`, `data:${i}`)
    }
    clearThumbnailMemoryCache()
    expect(getCachedThumbnail('s1/t0.pdf')).toBeNull()   // evicted
    expect(getCachedThumbnail('s1/t4.pdf')).toBeNull()   // evicted
    expect(getCachedThumbnail('s1/t5.pdf')).toBe('data:5')
    expect(getCachedThumbnail('s1/t24.pdf')).toBe('data:24')
  })

  it('survives a quota error: memory layer still serves the value', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    putCachedThumbnail('s1/t1.pdf', 'data:big')
    expect(getCachedThumbnail('s1/t1.pdf')).toBe('data:big')
  })

  it('treats corrupt stored JSON as a miss', () => {
    localStorage.setItem('eazy.tplthumb.s1/t1.pdf', '{not json')
    expect(getCachedThumbnail('s1/t1.pdf')).toBeNull()
  })
})
