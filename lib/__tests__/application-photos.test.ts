import { describe, it, expect, vi, beforeEach } from 'vitest'

const createSignedUrls = vi.fn(async (paths: string[], _expiresIn: number) => ({
  data: paths.map(p => ({ path: p, signedUrl: `https://signed.example/${p}`, error: null })),
  error: null,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
}))

import { signApplicationPhotoUrls } from '@/lib/application-photos'

// Block body on purpose: mockClear() returns the mock, and a function
// returned from beforeEach is run by vitest as a cleanup hook.
beforeEach(() => {
  createSignedUrls.mockClear()
})

describe('signApplicationPhotoUrls', () => {
  it('returns an empty map without touching storage when there are no paths', async () => {
    const map = await signApplicationPhotoUrls([])
    expect(map.size).toBe(0)
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('signs all paths in ONE batched call (3600 s) and maps path → signed URL', async () => {
    const map = await signApplicationPhotoUrls(['app-1/photo.jpg', 'app-2/photo.jpg'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['app-1/photo.jpg', 'app-2/photo.jpg'], 3600)
    expect(map.get('app-1/photo.jpg')).toBe('https://signed.example/app-1/photo.jpg')
    expect(map.get('app-2/photo.jpg')).toBe('https://signed.example/app-2/photo.jpg')
  })

  it('omits entries whose signing failed instead of mapping null', async () => {
    createSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'app-1/photo.jpg', signedUrl: null, error: 'Object not found' }],
      error: null,
    } as any)
    const map = await signApplicationPhotoUrls(['app-1/photo.jpg'])
    expect(map.size).toBe(0)
  })
})
