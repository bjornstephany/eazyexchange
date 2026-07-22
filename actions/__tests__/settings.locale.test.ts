import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn(() => ({ eq: () => ({ error: null }) }))
const from = vi.fn(() => ({ update }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))
// updateLocale is role-agnostic (requireUser). This mock plays a *student*
// session: requireUser resolves, requireOrganizer throws — so if the action ever
// regains an organizer gate, both cases below fail.
vi.mock('@/lib/auth/require', () => ({
  requireUser: async () => ({ id: 'u1' }),
  requireOrganizer: async () => { throw new Error('Unauthorized') },
}))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { updateLocale } from '@/actions/settings'

describe('updateLocale', () => {
  beforeEach(() => { from.mockClear(); update.mockClear(); revalidatePath.mockClear() })

  it('writes a valid locale to users and revalidates the layout (student session)', async () => {
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
