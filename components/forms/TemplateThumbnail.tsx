'use client'
import { useEffect, useRef, useState } from 'react'
import { getTemplateFileUrl } from '@/actions/forms'
import { getCachedThumbnail, putCachedThumbnail } from '@/lib/forms/thumbnail-cache'

// Page 1 of the template PDF as a lazy client-rendered image. Work is
// deferred until the card nears the viewport (IntersectionObserver), then:
// signed URL → dynamic import('pdfjs-dist') → canvas → data URL (cached by
// file path). pdfjs-dist must never enter the main bundle. On ANY failure
// (signed URL, corrupt PDF, pdf.js) render the `fallback` silently — a broken
// thumbnail must never break the card or raise a toast.
export function TemplateThumbnail({
  templateId, filePath, alt, fallback,
}: {
  templateId: string
  filePath: string
  alt: string
  fallback: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(() => getCachedThumbnail(filePath))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (src || failed) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let cancelled = false
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      void (async () => {
        try {
          const cached = getCachedThumbnail(filePath)
          const dataUrl = cached ?? await renderFirstPage(await getTemplateFileUrl(templateId))
          if (!cached) putCachedThumbnail(filePath, dataUrl)
          if (!cancelled) setSrc(dataUrl)
        } catch {
          if (!cancelled) setFailed(true)
        }
      })()
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => { cancelled = true; observer.disconnect() }
  }, [templateId, filePath, src, failed])

  if (failed) return <>{fallback}</>
  return (
    <div ref={ref} className="h-full w-full">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote asset
        <img src={src} alt={alt} className="h-full w-full object-cover object-top" />
      ) : (
        <div data-testid="thumb-shimmer" className="h-full w-full animate-pulse rounded-[2px] bg-background" />
      )}
    </div>
  )
}

// ~2× the card preview width so the thumbnail stays crisp on retina.
const TARGET_WIDTH = 460

async function renderFirstPage(url: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerPort && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    )
  }
  const doc = await pdfjs.getDocument({ url }).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) throw new Error('no 2d context')
    await page.render({ canvasContext, viewport, canvas }).promise
    return canvas.toDataURL('image/png')
  } finally {
    // In the installed pdfjs-dist major, `destroy()` lives on the loading
    // task, not the resolved PDFDocumentProxy — but the proxy DOES expose
    // `cleanup()`, which frees the document's main- and worker-thread
    // resources (safe here: rendering has completed). Do NOT destroy the
    // loading task instead — that would tear down the shared worker cached
    // in GlobalWorkerOptions.workerPort and break subsequent thumbnails.
    // Guarded so majors/mocks without cleanup() degrade to a no-op.
    const maybeCleanup = (doc as { cleanup?: () => unknown }).cleanup
    if (typeof maybeCleanup === 'function') void maybeCleanup.call(doc)
  }
}
