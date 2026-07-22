// lib/retention/__tests__/sweep.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const eraseApplication = vi.fn(async () => ({ applicationId: 'x', photosDeleted: 0 }))
const purgeExchangeDocuments = vi.fn(async () => ({ exchangeId: 'x', documentsDeleted: 3 }))
vi.mock('@/lib/retention/erase', () => ({ eraseApplication, purgeExchangeDocuments }))

// Minimal query-builder stub keyed by table. Each table yields fixed rows and a
// spy-able delete.
let tableRows: Record<string, any[]>
const deleteSpy = vi.fn()
function builderFor(name: string): any {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, lt: () => b, not: () => b, is: () => b,
    then: (resolve: any) => resolve({ data: tableRows[name] ?? [], error: null, count: (tableRows[name] ?? []).length }),
    // A delete returns a chainable, thenable filter builder (mirrors PostgREST:
    // .delete().eq().lt() etc). Awaiting it records the delete and yields count.
    delete: (_opts?: any) => {
      const d: any = {
        in: () => d, lt: () => d, eq: () => d, is: () => d,
        then: (resolve: any) => { deleteSpy(name); return resolve({ error: null, count: (tableRows[name] ?? []).length }) },
      }
      return d
    },
  }
  return b
}
const admin = { from: (name: string) => builderFor(name) }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const NOW = new Date('2026-07-18T03:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  tableRows = {}
})

describe('runRetentionSweep — log-only', () => {
  it('counts candidates but deletes nothing', async () => {
    tableRows.applications = [{ id: 'app-1', status: 'draft', updated_at: '2000-01-01', reviewed_at: null, responded_at: null }]
    const { runRetentionSweep } = await import('@/lib/retention/sweep')
    const summary = await runRetentionSweep(NOW, 'log-only')
    expect(summary.abandonedDraftApplication).toBeGreaterThanOrEqual(0)
    expect(eraseApplication).not.toHaveBeenCalled()
    expect(purgeExchangeDocuments).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })
})

describe('runRetentionSweep — enforce', () => {
  it('erases due draft applications via the primitive', async () => {
    tableRows.applications = [{ id: 'app-1', status: 'draft', updated_at: '2000-01-01', reviewed_at: null, responded_at: null }]
    const { runRetentionSweep } = await import('@/lib/retention/sweep')
    await runRetentionSweep(NOW, 'enforce')
    expect(eraseApplication).toHaveBeenCalledWith('app-1')
  })
})
