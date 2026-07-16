import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn(() => ({ eq: () => ({ error: null }) }))
const from = vi.fn(() => ({ update }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: 'admin', email: 'a@b.c', full_name: 'A' },
  }),
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { updateLocale } from '@/actions/settings'

describe('updateLocale', () => {
  beforeEach(() => { from.mockClear(); update.mockClear(); revalidatePath.mockClear() })

  it('writes a valid locale to users and revalidates the layout', async () => {
    await updateLocale('de')
    expect(from).toHaveBeenCalledWith('users')
    expect(update).toHaveBeenCalledWith({ locale: 'de' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('rejects an unsupported locale', async () => {
    await expect(updateLocale('pt' as never)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
})
