import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  isValidEmail,
  hasOverlongAnswer,
  hasMissingRequired,
  MAX_ANSWER_LENGTH,
} from '../validation'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })
})

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('a@b.com')).toBe(true)
    expect(isValidEmail('first.last@school.edu')).toBe(true)
  })
  it('rejects malformed addresses', () => {
    for (const bad of ['', 'no-at', 'a@b', 'a@@b.com', 'a b@c.com', 'a@b .com']) {
      expect(isValidEmail(bad)).toBe(false)
    }
  })
})

describe('hasOverlongAnswer', () => {
  it('is false when all answers are within the cap', () => {
    expect(hasOverlongAnswer({ a: 'x'.repeat(MAX_ANSWER_LENGTH), b: '' })).toBe(false)
  })
  it('is true when any answer exceeds the cap', () => {
    expect(hasOverlongAnswer({ a: 'ok', b: 'x'.repeat(MAX_ANSWER_LENGTH + 1) })).toBe(true)
  })
})

describe('hasMissingRequired', () => {
  it('is false when every required field has a non-empty answer', () => {
    expect(hasMissingRequired(['f1', 'f2'], { f1: 'a', f2: 'false' })).toBe(false)
  })
  it('is true when a required field is missing or blank', () => {
    expect(hasMissingRequired(['f1', 'f2'], { f1: 'a' })).toBe(true)
    expect(hasMissingRequired(['f1'], { f1: '   ' })).toBe(true)
  })
})
