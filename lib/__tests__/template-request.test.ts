import { describe, it, expect } from 'vitest'
import {
  templateRequestFileIssue,
  TEMPLATE_REQUEST_MAX_BYTES,
} from '@/lib/template-request'

describe('templateRequestFileIssue', () => {
  it('accepts a PDF within the cap', () => {
    expect(templateRequestFileIssue({ type: 'application/pdf', size: 500_000 })).toBeNull()
  })

  it('accepts .doc and .docx', () => {
    expect(templateRequestFileIssue({ type: 'application/msword', size: 1000 })).toBeNull()
    expect(templateRequestFileIssue({
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1000,
    })).toBeNull()
  })

  it('reports a missing file, and an empty one as missing too', () => {
    expect(templateRequestFileIssue(null)).toBe('missing_file')
    expect(templateRequestFileIssue({ type: 'application/pdf', size: 0 })).toBe('missing_file')
  })

  it('refuses a type outside the allowlist', () => {
    expect(templateRequestFileIssue({ type: 'application/zip', size: 1000 })).toBe('unsupported_type')
    // SVG can carry script; it is not on the list here either.
    expect(templateRequestFileIssue({ type: 'image/svg+xml', size: 1000 })).toBe('unsupported_type')
  })

  it('refuses a file over the cap', () => {
    expect(templateRequestFileIssue({
      type: 'application/pdf', size: TEMPLATE_REQUEST_MAX_BYTES + 1,
    })).toBe('too_large')
  })

  // The cap has to stay under next.config.mjs's serverActions.bodySizeLimit
  // (4 MB) or an oversized request dies in the framework, before any code here
  // can answer with a structured outcome.
  it('leaves headroom under the server action body limit', () => {
    expect(TEMPLATE_REQUEST_MAX_BYTES).toBeLessThan(4 * 1024 * 1024)
  })
})
