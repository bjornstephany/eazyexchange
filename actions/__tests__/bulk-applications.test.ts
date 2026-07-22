import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  applications: Record<string, any>
  profile: any
}

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    select: () => b,
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    order: () => b,
    update: (row: any) => {
      // Return a thenable update object
      const updateObj = {
        eq: (col: string, val: any) => {
          b._filters[col] = val
          return updateObj
        },
        then: (onFulfilled: any, onRejected?: any) => {
          // Make this properly thenable for await
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected)
        },
      }
      return updateObj
    },
    async single() {
      if (table === 'users') return { data: scenario.profile, error: null }
      if (table === 'exchanges') return { data: scenario.exchange, error: null }
      const appId = b._filters.id
      const app = scenario.applications[appId]
      return { data: app, error: app ? null : { message: 'none' } }
    },
    async maybeSingle() {
      if (table === 'users') return { data: scenario.profile, error: null }
      if (table === 'exchanges') return { data: scenario.exchange, error: null }
      const appId = b._filters.id
      const app = scenario.applications[appId]
      return { data: app, error: null }
    },
  }
  return b
}

const supabaseClient = {
  from: (t: string) => builder(t),
  auth: {
    getUser: async () => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }),
  },
  rpc: async () => ({ data: true, error: null }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => supabaseClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabaseClient }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(async () => {}),
  sendApplicationConfirmationEmail: vi.fn(async () => {}),
  sendNewApplicationAlertEmail: vi.fn(async () => {}),
  sendInvitationEmail: vi.fn(async () => {}),
  sendApplicationRejectionEmail: vi.fn(async () => {}),
  sendGoodNewsEmail: vi.fn(async () => {}),
}))

import { revalidatePath } from 'next/cache'
import { sendGoodNewsEmail } from '@/lib/email'
import { acceptApplications, rejectApplications, acceptApplication } from '../applications-review'

beforeEach(() => {
  vi.clearAllMocks()
  scenario = {
    exchange: { id: 'ex-1', name: 'France-Canada', school_id: 's-1', good_news_subject: null, good_news_body: null },
    profile: { id: 'user-1', school_id: 's-1', role: 'organizer' },
    applications: {
      'app-ok': { id: 'app-ok', exchange_id: 'ex-1', school_id: 's-1', status: 'submitted', email: 'stu@b.co', language: 'fr', data: { first_name: 'A', last_name: 'B', father_email: 'dad@b.co', mother_email: 'mom@b.co' } },
      'app-noparent': { id: 'app-noparent', exchange_id: 'ex-1', school_id: 's-1', status: 'submitted', email: 'stu2@b.co', language: 'fr', data: { first_name: 'C', last_name: 'D' } },
    },
  }
})

describe('acceptApplications', () => {
  it('accepts each id and reports partial failure', async () => {
    const res = await acceptApplications(['app-ok', 'app-bad'])
    expect(res).toEqual({ succeeded: 1, failed: 1 })
    // Application status feeds the dashboard rollups — an accept must
    // invalidate the router cache for /dashboard too.
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('empty input is a no-op', async () => {
    expect(await acceptApplications([])).toEqual({ succeeded: 0, failed: 0 })
  })
})

describe('rejectApplications', () => {
  it('rejects each id with the shared note', async () => {
    const res = await rejectApplications(['app-ok'], 'note', false)
    expect(res).toEqual({ succeeded: 1, failed: 0 })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('empty input is a no-op', async () => {
    expect(await rejectApplications([], 'note', false)).toEqual({ succeeded: 0, failed: 0 })
  })
})

describe('acceptApplication good-news email', () => {
  it('emails the parents (father + mother) with the rendered template', async () => {
    await acceptApplication('app-ok')
    expect(sendGoodNewsEmail).toHaveBeenCalledTimes(1)
    const arg = (sendGoodNewsEmail as any).mock.calls[0][0]
    expect(arg.to).toEqual(['dad@b.co', 'mom@b.co'])
    expect(arg.language).toBe('fr')
    expect(arg.respondUrl).toContain('/invite/')
  })

  it('falls back to the student email when no parent email is present', async () => {
    await acceptApplication('app-noparent')
    const arg = (sendGoodNewsEmail as any).mock.calls[0][0]
    expect(arg.to).toEqual(['stu2@b.co'])
  })
})
