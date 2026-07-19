// actions/__tests__/retention-export.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'

vi.mock('@/lib/auth/require', () => ({ requireOrganizer: vi.fn(async () => ({ user: { id: 'org-1' }, profile: { id: 'org-1', school_id: 'sch-1' } })) }))
vi.mock('@/lib/application-photos', () => ({ signApplicationPhotoUrls: vi.fn(async () => new Map()) }))

// RLS client stub: an application row with two field answers, no photo.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const data = table === 'applications'
        ? { id: 'app-1', email: 'a@x', status: 'submitted', data: { first_name: 'Alice' }, photo_path: null, exchange_id: 'ex-1' }
        : null
      const q: any = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: [] }),
        maybeSingle: async () => ({ data }),
      }
      return q
    },
  }),
}))

beforeEach(() => vi.clearAllMocks())

describe('exportSubject', () => {
  it('produces a zip containing data.json for an application', async () => {
    const { exportSubject } = await import('@/actions/retention')
    const res = await exportSubject({ kind: 'application', id: 'app-1' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const zip = await JSZip.loadAsync(Buffer.from(res.base64, 'base64'))
    const json = JSON.parse(await zip.file('data.json')!.async('string'))
    expect(json.email).toBe('a@x')
    expect(res.filename).toContain('.zip')
  })

  it('refuses a subject not visible under RLS', async () => {
    const { exportSubject } = await import('@/actions/retention')
    const res = await exportSubject({ kind: 'student', id: 'nope' })
    expect(res).toEqual({ ok: false, error: 'not_found' })
  })
})
