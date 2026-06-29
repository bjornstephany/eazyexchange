import { describe, it, expect } from 'vitest'
import { randomToken, applySlug } from '../tokens'

describe('randomToken', () => {
  it('is URL-safe and unique', () => {
    const a = randomToken()
    const b = randomToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.length).toBeGreaterThan(20)
  })
})

describe('applySlug', () => {
  it('slugifies the name and appends a random suffix', () => {
    const slug = applySlug('France-Canada 2026!')
    expect(slug).toMatch(/^france-canada-2026-[0-9a-f]{8}$/)
  })
  it('falls back when name has no usable characters', () => {
    expect(applySlug('!!!')).toMatch(/^exchange-[0-9a-f]{8}$/)
  })
})
