import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above every const in this file, so anything its factories
// close over has to be created inside vi.hoisted.
const h = vi.hoisted(() => {
  const manifest = {
    version: 1,
    password: 'demo1234',
    school: 'Lycée Démo (seed)',
    exchange: 'Échange Démo 2026',
    accounts: [
      {
        email: 'orga@seed.example.com',
        name: 'Claire Organisatrice',
        role: 'organizer' as const,
        note: 'owner',
        highlight: true,
      },
      {
        email: 'eleve-01@seed.example.com',
        name: 'Camille Bernard',
        role: 'student' as const,
        note: 'rien commencé',
        highlight: true,
      },
    ],
  }
  return {
    manifest,
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
    isEnabled: vi.fn(() => true),
    readManifest: vi.fn<() => typeof manifest | null>(() => manifest),
  }
})

vi.mock('next/navigation', () => ({ notFound: h.notFound, redirect: vi.fn() }))
vi.mock('../actions', () => ({ devSignIn: vi.fn() }))

// The env truth table for the guard itself lives in
// lib/dev/__tests__/local-only.test.ts. What matters here is only that the page
// honours whatever the guard returns — stubbing NODE_ENV instead would change
// which JSX runtime vite transforms this file against, and the page would fail
// to render for reasons that have nothing to do with the guard.
vi.mock('@/lib/dev/local-only', () => ({
  isDevQuickAccessEnabled: h.isEnabled,
  readSeedManifest: h.readManifest,
}))

import DevPage from '../page'

beforeEach(() => {
  h.notFound.mockClear()
  h.isEnabled.mockReturnValue(true)
  h.readManifest.mockReturnValue(h.manifest)
})

const render = () => DevPage({ searchParams: Promise.resolve({}) })

describe('/dev', () => {
  it('404s when quick access is not enabled', async () => {
    h.isEnabled.mockReturnValue(false)
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.notFound).toHaveBeenCalled()
  })

  it('renders when quick access is enabled', async () => {
    await expect(render()).resolves.toBeTruthy()
    expect(h.notFound).not.toHaveBeenCalled()
  })

  it('tells you to seed when there is no manifest', async () => {
    h.readManifest.mockReturnValue(null)
    await expect(render()).resolves.toBeTruthy()
    expect(h.notFound).not.toHaveBeenCalled()
  })
})
