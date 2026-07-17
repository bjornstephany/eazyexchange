import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// The exchange row / application rows the mocked client returns — set per test.
let exchangeRow: { school_a_id: string; school_b_id: string | null } | null = null
let appRows: any[] = []

const createSignedUrls = vi.fn(async (paths: string[], _expiresIn: number) => ({
  data: paths.map(p => ({ path: p, signedUrl: `https://signed.example/${p}`, error: null })),
  error: null,
}))

function makeClient() {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: async () => ({ data: appRows, error: null }),
        maybeSingle: async () =>
          table === 'exchanges' ? { data: exchangeRow, error: null } : { data: null, error: null },
      }
      return builder
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
}))

import { listApplications } from '../applications-review'

beforeEach(() => {
  appRows = [{ id: 'app-1' }]
  createSignedUrls.mockClear()
})

describe('listApplications scope check', () => {
  it("refuses an exchange belonging to another school (even if RLS would return rows)", async () => {
    exchangeRow = { school_a_id: 'school-OTHER', school_b_id: null }
    await expect(listApplications('ex-1')).rejects.toThrow('Unauthorized')
  })

  it('refuses an exchange the caller cannot even see', async () => {
    exchangeRow = null
    await expect(listApplications('ex-1')).rejects.toThrow('Unauthorized')
  })

  it("returns rows for the caller's own exchange", async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    await expect(listApplications('ex-1')).resolves.toEqual([{ id: 'app-1' }])
  })
})

describe('listApplications photos', () => {
  it('maps photo_path to a batch-signed URL and never returns the raw path', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    appRows = [
      { id: 'app-1', photo_path: 'app-1/photo.jpg' },
      { id: 'app-2', photo_path: null },
    ]
    const rows = await listApplications('ex-1', { withPhotos: true })
    expect(rows).toEqual([
      { id: 'app-1', photoUrl: 'https://signed.example/app-1/photo.jpg' },
      { id: 'app-2', photoUrl: null },
    ])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['app-1/photo.jpg'], 3600)
  })

  it('skips the storage call entirely when no listed row has a photo', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    appRows = [{ id: 'app-1', photo_path: null }]
    await listApplications('ex-1', { withPhotos: true })
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('the default call keeps its shape: no photoUrl key, no storage call', async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    const rows = await listApplications('ex-1')
    expect(rows).toEqual([{ id: 'app-1' }])
    expect(createSignedUrls).not.toHaveBeenCalled()
  })
})
