import { describe, it, expect, vi } from 'vitest'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))

import DocumentsPage from '@/app/(organizer)/documents/page'
import EditDocumentPage from '@/app/(organizer)/documents/[templateId]/page'

async function getRedirect(run: () => unknown): Promise<string> {
  try { await run() } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

describe('legacy /documents routes', () => {
  it('/documents redirects to /forms', async () => {
    expect(await getRedirect(() => DocumentsPage())).toBe('/forms')
  })

  it('/documents/[templateId] redirects to /forms/[templateId]', async () => {
    expect(await getRedirect(() =>
      EditDocumentPage({ params: Promise.resolve({ templateId: 't42' }) })
    )).toBe('/forms/t42')
  })
})
