import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const reportMock = vi.fn(async (_err: unknown, _ctx: unknown) => {})
vi.mock('@/lib/error-reporting', () => ({ reportServerError: reportMock }))

import { onRequestError } from '@/instrumentation'

type Req = Parameters<typeof onRequestError>[1]
type Ctx = Parameters<typeof onRequestError>[2]

const request = { path: '/exchanges/123/edit', method: 'POST', headers: {} } as Req
const context = { routerKind: 'App Router', routePath: '/exchanges/[id]/edit', routeType: 'action' } as Ctx

describe('onRequestError', () => {
  beforeEach(() => {
    reportMock.mockClear()
    reportMock.mockResolvedValue(undefined)
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('delegates to reportServerError with the parameterized route path and method', async () => {
    const err = new Error('boom')
    await onRequestError(err, request, context)
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledWith(err, { routePath: '/exchanges/[id]/edit', method: 'POST' })
  })

  it('falls back to the request path when the context has no route path', async () => {
    await onRequestError(new Error('boom'), request, { ...context, routePath: '' } as Ctx)
    expect(reportMock).toHaveBeenCalledWith(expect.anything(), { routePath: '/exchanges/123/edit', method: 'POST' })
  })

  it('does nothing outside the Node runtime (edge middleware errors)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await onRequestError(new Error('boom'), request, context)
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('never throws, even when the reporter rejects', async () => {
    reportMock.mockRejectedValueOnce(new Error('db down'))
    await expect(onRequestError(new Error('boom'), request, context)).resolves.toBeUndefined()
  })
})
