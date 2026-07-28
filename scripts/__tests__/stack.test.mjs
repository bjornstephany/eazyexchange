import { describe, it, expect } from 'vitest'
import { stackIsUp } from '../lib/stack.mjs'

describe('stackIsUp', () => {
  it('is up when the REST endpoint answers ok', async () => {
    const fetchImpl = async () => ({ ok: true })
    expect(await stackIsUp({ fetchImpl })).toBe(true)
  })

  it('is down when the REST endpoint answers not-ok', async () => {
    const fetchImpl = async () => ({ ok: false })
    expect(await stackIsUp({ fetchImpl })).toBe(false)
  })

  it('is down when the connection is refused', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNREFUSED')
    }
    expect(await stackIsUp({ fetchImpl })).toBe(false)
  })

  it('is down when the probe times out rather than hanging the caller', async () => {
    const fetchImpl = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    expect(await stackIsUp({ fetchImpl, timeoutMs: 20 })).toBe(false)
  })
})
