import { describe, it, expect } from 'vitest'
import { STANDARD_TEMPLATES } from '@/lib/forms/standard-library'

describe('STANDARD_TEMPLATES', () => {
  it('defines the 8 real-program items with unique keys', () => {
    expect(STANDARD_TEMPLATES).toHaveLength(8)
    const keys = STANDARD_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(8)
    expect(keys).toEqual([
      'medical', 'decharge', 'absence', 'famille', 'ast',
      'passeport', 'passeport-parent', 'esta',
    ])
  })
  it('has 4 fillable forms, 1 pdf form and 3 docs, all mandatory, none online', () => {
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'fillable').map(t => t.key))
      .toEqual(['medical', 'decharge', 'absence', 'famille'])
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'pdf').map(t => t.key))
      .toEqual(['ast'])
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'doc').map(t => t.key))
      .toEqual(['passeport', 'passeport-parent', 'esta'])
    expect(STANDARD_TEMPLATES.every(t => t.audience === 'all' && t.condition_label === null)).toBe(true)
  })
  it('only esta carries an external_url', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'esta')?.external_url).toBe('https://esta.cbp.dhs.gov')
    expect(STANDARD_TEMPLATES.filter(t => t.external_url !== null)).toHaveLength(1)
  })
  it('carries no form_fields — fillable structure lives in code, others are signature/upload-only', () => {
    for (const t of STANDARD_TEMPLATES) {
      expect(t.fields).toHaveLength(0)
    }
  })
  it('the parent-passport description stresses the SAME parent as the AST signatory', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'passeport-parent')?.description).toMatch(/même parent/i)
  })
})
