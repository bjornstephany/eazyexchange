import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  exchange: any | null
  applications: Record<string, any>
  profile: any
}

/** Every row written by an update, keyed by application id — lets a test
 *  assert that each accepted application got its own invite token. */
let updates: { id: string; row: any }[] = []

function builder(table: string) {
  const b: any = {
    _filters: {} as Record<string, any>,
    _in: null as null | { col: string; vals: any[] },
    select: () => b,
    eq: (col: string, val: any) => { b._filters[col] = val; return b },
    // `.in()` resolves to a row LIST, so the builder itself is thenable.
    in: (col: string, vals: any[]) => { b._in = { col, vals }; return b },
    then: (onFulfilled: any, onRejected?: any) => {
      const ids: string[] = b._in?.vals ?? []
      const data =
        table === 'applications'
          ? ids.map(id => scenario.applications[id]).filter(Boolean)
          : ids.includes(scenario.exchange?.id) ? [scenario.exchange] : []
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
    },
    order: () => b,
    update: (row: any) => {
      // Return a thenable update object
      const updateObj = {
        eq: (col: string, val: any) => {
          b._filters[col] = val
          if (table === 'applications' && col === 'id') updates.push({ id: val, row })
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
  updates = []
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

  // The batch fetches every application in one read and writes them
  // concurrently — the guards below have to survive that, per id.
  it('mints a distinct invite token per accepted application', async () => {
    await acceptApplications(['app-ok', 'app-noparent'])
    const tokens = updates.map(u => u.row.invite_token)
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toBeTruthy()
    expect(new Set(tokens).size).toBe(2)
  })

  it('skips applications belonging to another school', async () => {
    scenario.applications['app-foreign'] = {
      ...scenario.applications['app-ok'], id: 'app-foreign', school_id: 's-2',
    }
    const res = await acceptApplications(['app-ok', 'app-foreign'])
    expect(res).toEqual({ succeeded: 1, failed: 1 })
    expect(updates.map(u => u.id)).toEqual(['app-ok'])
  })

  it('keeps the status guard per id in a mixed selection', async () => {
    // 'invited' was never submitted; 'accepted' is already accepted.
    scenario.applications['app-invited'] = { ...scenario.applications['app-ok'], id: 'app-invited', status: 'invited' }
    scenario.applications['app-done'] = { ...scenario.applications['app-ok'], id: 'app-done', status: 'accepted' }
    const res = await acceptApplications(['app-ok', 'app-invited', 'app-done'])
    expect(res).toEqual({ succeeded: 1, failed: 2 })
    expect(updates.map(u => u.id)).toEqual(['app-ok'])
  })

  it('refuses the whole batch when the exchange is archived', async () => {
    scenario.exchange = { ...scenario.exchange, archived_at: '2026-01-01T00:00:00Z' }
    const res = await acceptApplications(['app-ok', 'app-noparent'])
    expect(res).toEqual({ succeeded: 0, failed: 2 })
    expect(updates).toEqual([])
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
