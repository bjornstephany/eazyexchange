import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  isValidEmail,
  normalizePhone,
  isValidPhone,
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
  it('accepts the shapes real families use', () => {
    for (const good of [
      'jean.dupont@gmail.com',
      'marie+ex@lycee-victor-hugo.fr',
      'a@b.co',
      'contact@sub.domain.example.org',
    ]) {
      expect(isValidEmail(good)).toBe(true)
    }
  })
  it('keeps accented local parts, which are legal and occur in France', () => {
    expect(isValidEmail('josé@gmail.com')).toBe(true)
  })
  it('rejects the typos the old lax regex let through', () => {
    for (const bad of [
      'jean@gmail.',        // trailing dot
      'jean@gmail.c',       // one-letter TLD
      'jean..dup@gmail.com', // doubled dot
      '.jean@gmail.com',    // leading dot
      'jean@.gmail.com',    // empty first label
      'jean@-gmail.com',    // hyphen-edged label
      'jean@gmail-.com',
      'jean@gmail.c0m',     // non-alpha TLD
    ]) {
      expect(isValidEmail(bad)).toBe(false)
    }
  })
})

describe('normalizePhone', () => {
  it('strips only separators, leaving digits and the leading +', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678')
    expect(normalizePhone('06.12.34.56.78')).toBe('0612345678')
    expect(normalizePhone('+1 (612) 555-0143')).toBe('+16125550143')
  })
  it('strips the non-breaking space some keyboards insert', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('0612345678')
  })
  it('leaves letters in place so they can be rejected', () => {
    expect(normalizePhone('06AB123456')).toBe('06AB123456')
  })
})

describe('isValidPhone', () => {
  it('accepts every format a French parent types', () => {
    for (const good of [
      '06 12 34 56 78',
      '06.12.34.56.78',
      '0612345678',
      '06-12-34-56-78',
      '+33 6 12 34 56 78',
      '+33612345678',
      '0033 6 12 34 56 78',
    ]) {
      expect(isValidPhone(good)).toBe(true)
    }
  })
  it('accepts international numbers — applicants are by definition abroad', () => {
    for (const good of ['+49 151 23456789', '+1 (612) 555-0143', '+39 02 1234 5678']) {
      expect(isValidPhone(good)).toBe(true)
    }
  })
  it('rejects junk and wrong-length numbers', () => {
    for (const bad of [
      '',
      'io',                    // what the one real applicant actually typed
      'n/a',
      '0612',                  // 4 digits
      '0612345',               // 7 digits, one short
      '0612345678901234',      // 16 digits, one over
      '06AB123456',
      'call me on 0612345678', // letters survive normalization
      '++33612345678',
      '33-6-12-34-56-78-+',    // + not leading
    ]) {
      expect(isValidPhone(bad)).toBe(false)
    }
  })
  it('accepts the exact boundaries', () => {
    expect(isValidPhone('12345678')).toBe(true)          // 8 digits
    expect(isValidPhone('+123456789012345')).toBe(true)  // 15 digits
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
    // f2 is a plain field, so the string 'false' counts as a real answer.
    expect(hasMissingRequired([{ id: 'f1' }, { id: 'f2' }], { f1: 'a', f2: 'false' })).toBe(false)
  })
  it('is true when a required field is missing or blank', () => {
    expect(hasMissingRequired([{ id: 'f1' }, { id: 'f2' }], { f1: 'a' })).toBe(true)
    expect(hasMissingRequired([{ id: 'f1' }], { f1: '   ' })).toBe(true)
  })
  it('requires a required checkbox to be checked (true), not merely present', () => {
    const fields = [{ id: 'c', field_type: 'checkbox' }]
    expect(hasMissingRequired(fields, { c: 'false' })).toBe(true)
    expect(hasMissingRequired(fields, {})).toBe(true)
    expect(hasMissingRequired(fields, { c: 'true' })).toBe(false)
  })
})
