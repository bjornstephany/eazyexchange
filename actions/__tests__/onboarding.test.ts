import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { user: { id: string } | null; role: string; school: string; name: string; updated: any }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b,
        update: (row: any) => { scenario.updated = row; return { eq: async () => ({ error: null }) } },
        single: async () => table === 'users'
          ? { data: { id: 'u1', role: scenario.role, school_id: scenario.school, full_name: 'x', email: 'a@b.com', org_role: 'owner', schools: { name: scenario.name } } }
          : { data: null },
      }
      return b
    },
  }
}

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { completeOnboarding } from '@/actions/onboarding'

function fd(name: string) { const f = new FormData(); f.set('name', name); return f }

beforeEach(() => {
  redirect.mockClear()
  scenario = { user: { id: 'u1' }, role: 'organizer', school: 's-1', name: '', updated: null }
})

describe('completeOnboarding', () => {
  it('persists the trimmed name without redirecting (client advances to step 2)', async () => {
    await completeOnboarding(fd('  Lincoln High  '))
    expect(scenario.updated).toEqual({ name: 'Lincoln High' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('rejects an empty/whitespace name without writing or redirecting', async () => {
    await expect(completeOnboarding(fd('   '))).rejects.toThrow('Veuillez renseigner le nom de votre établissement')
    expect(scenario.updated).toBeNull()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('rejects a non-organizer caller', async () => {
    scenario.role = 'student'
    await expect(completeOnboarding(fd('Lincoln High'))).rejects.toThrow('Unauthorized')
    expect(scenario.updated).toBeNull()
  })

  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    await expect(completeOnboarding(fd('Lincoln High'))).rejects.toThrow('Unauthenticated')
    expect(scenario.updated).toBeNull()
  })
})
