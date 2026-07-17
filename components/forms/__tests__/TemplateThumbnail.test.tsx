import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { putCachedThumbnail, clearThumbnailMemoryCache } from '@/lib/forms/thumbnail-cache'

const getUrl = vi.fn()
vi.mock('@/actions/forms', () => ({
  getTemplateFileUrl: (...a: unknown[]) => getUrl(...a),
}))

// pdfjs-dist is dynamically imported by the component; vi.mock intercepts it.
// workerPort pre-set → the component's Worker bootstrap branch is skipped
// (jsdom has no Worker).
const renderPage = vi.fn(() => ({ promise: Promise.resolve() }))
const page = { getViewport: vi.fn(() => ({ width: 210, height: 297 })), render: renderPage }
const doc = { getPage: vi.fn(async () => page), destroy: vi.fn() }
const getDocument = vi.fn((..._args: unknown[]) => ({ promise: Promise.resolve(doc) }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerPort: {}, workerSrc: 'stub' },
  getDocument: (...a: unknown[]) => getDocument(...a),
}))

import { TemplateThumbnail } from '@/components/forms/TemplateThumbnail'

// Immediately-intersecting stub: the card is "in view" as soon as observed.
class ImmediateIO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() {
    this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

beforeEach(() => {
  localStorage.clear()
  clearThumbnailMemoryCache()
  vi.clearAllMocks()
  globalThis.IntersectionObserver = ImmediateIO as unknown as typeof IntersectionObserver
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,RENDERED')
})

const props = { templateId: 't1', filePath: 's1/t1.pdf', alt: 'Autorisation', fallback: <div data-testid="generic-paper" /> }

describe('TemplateThumbnail', () => {
  it('renders the page-1 image after signed URL + pdf.js pipeline, and caches it', async () => {
    getUrl.mockResolvedValue('https://signed.example/t1.pdf')
    render(<TemplateThumbnail {...props} />)
    const img = await screen.findByRole('img', { name: 'Autorisation' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,RENDERED')
    expect(getDocument).toHaveBeenCalledWith({ url: 'https://signed.example/t1.pdf' })
    expect(localStorage.getItem('eazy.tplthumb.s1/t1.pdf')).toContain('RENDERED')
  })

  it('serves from cache without calling the signed-URL action', async () => {
    putCachedThumbnail('s1/t1.pdf', 'data:image/png;base64,CACHED')
    render(<TemplateThumbnail {...props} />)
    const img = await screen.findByRole('img', { name: 'Autorisation' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,CACHED')
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('falls back silently when the signed URL fails', async () => {
    getUrl.mockRejectedValue(new Error('boom'))
    render(<TemplateThumbnail {...props} />)
    await screen.findByTestId('generic-paper')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('falls back silently when pdf.js fails', async () => {
    getUrl.mockResolvedValue('https://signed.example/t1.pdf')
    getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('corrupt pdf')) })
    render(<TemplateThumbnail {...props} />)
    await screen.findByTestId('generic-paper')
  })

  it('shows the shimmer until intersection (noop observer ⇒ stays shimmering)', () => {
    globalThis.IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {} takeRecords() { return [] }
    } as unknown as typeof IntersectionObserver
    render(<TemplateThumbnail {...props} />)
    expect(screen.getByTestId('thumb-shimmer')).toBeInTheDocument()
    expect(getUrl).not.toHaveBeenCalled()
  })
})
