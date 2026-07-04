import { describe, it, expect } from 'vitest'
import { assertExchangeWritable, ARCHIVED_ERROR } from '@/lib/exchange-guard'
import type { SupabaseClient } from '@supabase/supabase-js'

const fake = (archived_at: string | null) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { archived_at } }) }),
    }),
  }),
}) as unknown as SupabaseClient

describe('assertExchangeWritable', () => {
  it('passes for a live exchange', async () => {
    await expect(assertExchangeWritable(fake(null), 'ex1')).resolves.toBeUndefined()
  })
  it('throws the French read-only error for an archived exchange', async () => {
    await expect(assertExchangeWritable(fake('2026-07-04T08:00:00Z'), 'ex1'))
      .rejects.toThrow(ARCHIVED_ERROR)
  })
})
