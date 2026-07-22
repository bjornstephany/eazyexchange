import { describe, it, expect } from 'vitest'
import { validateInfoCard, INFO_TITLE_MAX, INFO_BODY_MAX } from '../info-card'

describe('validateInfoCard', () => {
  it('accepts a title with optional body and trims both', () => {
    const r = validateInfoCard({ title: '  Point de RDV  ', body: '  Gare  ' })
    expect(r).toEqual({ ok: true, value: { title: 'Point de RDV', body: 'Gare' } })
  })

  it('accepts an empty body', () => {
    const r = validateInfoCard({ title: 'Titre', body: '' })
    expect(r.ok).toBe(true)
  })

  it('rejects a blank title', () => {
    expect(validateInfoCard({ title: '   ', body: 'x' })).toEqual({ ok: false, error: 'titleRequired' })
  })

  it('rejects an over-long title', () => {
    expect(validateInfoCard({ title: 'a'.repeat(INFO_TITLE_MAX + 1), body: '' }))
      .toEqual({ ok: false, error: 'titleTooLong' })
  })

  it('rejects an over-long body', () => {
    expect(validateInfoCard({ title: 'Titre', body: 'b'.repeat(INFO_BODY_MAX + 1) }))
      .toEqual({ ok: false, error: 'bodyTooLong' })
  })
})
