import { describe, it, expect } from 'vitest'
import { parseInviteEmails } from '../invite-emails'

describe('parseInviteEmails', () => {
  it('splits on newlines, commas, semicolons and spaces', () => {
    expect(parseInviteEmails('a@x.co\nb@x.co, c@x.co;d@x.co e@x.co').valid)
      .toEqual(['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co', 'e@x.co'])
  })
  it('normalizes and de-dupes, first occurrence wins', () => {
    expect(parseInviteEmails('A@X.co\n a@x.co ').valid).toEqual(['a@x.co'])
  })
  it('partitions invalid addresses', () => {
    // 'also bad@' splits on the space into two tokens, both invalid.
    const r = parseInviteEmails('good@x.co\nnope\nalso bad@')
    expect(r.valid).toEqual(['good@x.co'])
    expect(r.invalid).toEqual(['nope', 'also', 'bad@'])
  })
  it('ignores empty input', () => {
    expect(parseInviteEmails('   \n , ; ')).toEqual({ valid: [], invalid: [] })
  })
})
