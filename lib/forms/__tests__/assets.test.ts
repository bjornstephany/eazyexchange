import { describe, it, expect } from 'vitest'
import { readBundledPdf, BUNDLED_PDF_PATHS } from '@/lib/forms/assets'

describe('readBundledPdf', () => {
  it('returns null for a key with no bundled file', async () => {
    expect(await readBundledPdf('passeport')).toBeNull()
    expect(await readBundledPdf('decharge')).toBeNull()
  })

  it('returns null for a prototype key rather than resolving a member', async () => {
    expect(await readBundledPdf('constructor')).toBeNull()
    expect(await readBundledPdf('__proto__')).toBeNull()
  })

  it('reads the AST CERFA as a real PDF', async () => {
    const buf = await readBundledPdf('ast')
    expect(buf).not.toBeNull()
    expect(buf!.byteLength).toBeGreaterThan(1000)
    expect(buf!.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('registers exactly the one national form', () => {
    expect(Object.keys(BUNDLED_PDF_PATHS)).toEqual(['ast'])
  })
})
