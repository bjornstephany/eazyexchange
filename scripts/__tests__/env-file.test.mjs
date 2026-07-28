import { describe, it, expect } from 'vitest'
import { parseEnv, readEnvFile } from '../lib/env-file.mjs'

describe('parseEnv', () => {
  it('reads plain assignments', () => {
    expect(parseEnv('A=1\nB=two')).toEqual({ A: '1', B: 'two' })
  })

  it('skips blanks and comments', () => {
    expect(parseEnv('# note\n\nA=1\n   # indented\nB=2')).toEqual({ A: '1', B: '2' })
  })

  it('strips surrounding quotes', () => {
    expect(parseEnv(`A="quoted"\nB='single'`)).toEqual({ A: 'quoted', B: 'single' })
  })

  it('keeps = inside a value', () => {
    expect(parseEnv('JWT=abc.def=ghi')).toEqual({ JWT: 'abc.def=ghi' })
  })

  it('ignores lines with no =', () => {
    expect(parseEnv('JUNK\nA=1')).toEqual({ A: '1' })
  })

  it('takes the last assignment when a key repeats', () => {
    expect(parseEnv('A=1\nA=2')).toEqual({ A: '2' })
  })
})

describe('readEnvFile', () => {
  it('returns an empty object when the file is missing', () => {
    expect(readEnvFile('/nonexistent/.env.local')).toEqual({})
  })
})
