import { describe, it, expect } from 'vitest'
import { validateUploadFile, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME_TYPES } from '../uploads'

describe('validateUploadFile', () => {
  it('accepts every allowed type under the size limit', () => {
    for (const type of ALLOWED_UPLOAD_MIME_TYPES) {
      expect(validateUploadFile({ type, size: 1024 })).toBeNull()
    }
  })

  it('rejects disallowed types (incl. script-bearing svg/html)', () => {
    expect(validateUploadFile({ type: 'image/svg+xml', size: 1024 })).toMatch(/Unsupported file type/)
    expect(validateUploadFile({ type: 'text/html', size: 1024 })).toMatch(/Unsupported file type/)
    expect(validateUploadFile({ type: '', size: 1024 })).toMatch(/Unsupported file type/)
  })

  it('rejects files over the size limit', () => {
    expect(validateUploadFile({ type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/too large/)
  })

  it('accepts a file exactly at the size limit', () => {
    expect(validateUploadFile({ type: 'application/pdf', size: MAX_UPLOAD_BYTES })).toBeNull()
  })
})
