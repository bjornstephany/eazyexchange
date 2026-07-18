import { describe, it, expect, vi, beforeEach } from 'vitest'

// Records the order of side effects so we can assert storage-before-rows.
const calls: string[] = []

// Configurable per-table select results.
let selectResults: Record<string, any[]> = {}

function makeAdmin() {
  const storage = {
    from: (bucket: string) => ({
      remove: vi.fn(async (paths: string[]) => { calls.push(`storage.remove:${bucket}:${paths.length}`); return { data: paths, error: null } }),
    }),
  }
  const table = (name: string) => {
    const rows = selectResults[name] ?? []
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
      delete: () => ({
        eq: async () => { calls.push(`db.delete:${name}`); return { error: null } },
        in: async () => { calls.push(`db.delete:${name}`); return { error: null } },
      }),
    }
    return builder
  }
  return {
    storage,
    from: (name: string) => table(name),
    auth: { admin: { deleteUser: vi.fn(async (id: string) => { calls.push(`auth.deleteUser:${id}`); return { error: null } }) } },
  }
}

let admin: ReturnType<typeof makeAdmin>
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

beforeEach(() => {
  calls.length = 0
  selectResults = {}
  admin = makeAdmin()
})

describe('eraseApplication', () => {
  it('removes the photo BEFORE deleting the row and reports counts', async () => {
    selectResults.applications = [{ photo_path: 'app-1/photo.jpg' }]
    const { eraseApplication } = await import('@/lib/retention/erase')
    const res = await eraseApplication('app-1')
    expect(res).toEqual({ applicationId: 'app-1', photosDeleted: 1 })
    expect(calls).toEqual(['storage.remove:application-photos:1', 'db.delete:applications'])
  })

  it('skips storage when there is no photo', async () => {
    selectResults.applications = [{ photo_path: null }]
    const { eraseApplication } = await import('@/lib/retention/erase')
    const res = await eraseApplication('app-2')
    expect(res.photosDeleted).toBe(0)
    expect(calls).toEqual(['db.delete:applications'])
  })
})

describe('eraseStudent', () => {
  it('removes all storage before any DB delete, deletes app then auth user', async () => {
    selectResults.assignments = [{ id: 'a1' }]
    selectResults.submissions = [{ id: 's1' }]
    selectResults.document_uploads = [{ storage_path: 'a1/slot/doc.pdf' }]
    selectResults.applications = [{ id: 'app-9', photo_path: 'app-9/photo.jpg' }]
    const { eraseStudent } = await import('@/lib/retention/erase')
    const res = await eraseStudent('user-1')
    expect(res).toEqual({ userId: 'user-1', documentsDeleted: 1, photosDeleted: 1, applicationsDeleted: 1 })
    // Both storage removes precede both DB mutations.
    const firstDb = calls.findIndex(c => c.startsWith('db.') || c.startsWith('auth.'))
    const lastStorage = calls.map(c => c.startsWith('storage.')).lastIndexOf(true)
    expect(lastStorage).toBeLessThan(firstDb)
    expect(calls).toContain('storage.remove:documents:1')
    expect(calls).toContain('storage.remove:application-photos:1')
    expect(calls).toContain('db.delete:applications')
    expect(calls).toContain('auth.deleteUser:user-1')
  })
})

describe('purgeExchangeDocuments', () => {
  it('removes storage BEFORE deleting document_uploads rows and reports counts', async () => {
    selectResults.form_templates = [{ id: 't1' }]
    selectResults.assignments = [{ id: 'a1' }]
    selectResults.submissions = [{ id: 's1' }]
    selectResults.document_uploads = [{ id: 'd1', storage_path: 'a1/slot/doc.pdf' }]
    const { purgeExchangeDocuments } = await import('@/lib/retention/erase')
    const res = await purgeExchangeDocuments('ex-1')
    expect(res).toEqual({ exchangeId: 'ex-1', documentsDeleted: 1 })
    expect(calls).toEqual(['storage.remove:documents:1', 'db.delete:document_uploads'])
  })

  it('touches no storage and deletes nothing when the exchange has no documents', async () => {
    selectResults.form_templates = [{ id: 't1' }]
    selectResults.assignments = [{ id: 'a1' }]
    selectResults.submissions = [{ id: 's1' }]
    selectResults.document_uploads = []
    const { purgeExchangeDocuments } = await import('@/lib/retention/erase')
    const res = await purgeExchangeDocuments('ex-2')
    expect(res.documentsDeleted).toBe(0)
    expect(calls).toEqual([])
  })
})
