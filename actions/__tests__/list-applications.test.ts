import { describe, it, expect, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// The exchange row the mocked client returns — set per test.
let exchangeRow: { school_a_id: string; school_b_id: string | null } | null = null

function makeClient() {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: async () => ({ data: [{ id: 'app-1' }], error: null }),
        maybeSingle: async () =>
          table === 'exchanges' ? { data: exchangeRow, error: null } : { data: null, error: null },
      }
      return builder
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { listApplications } from '../applications'

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
