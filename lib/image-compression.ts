// Client-side photo downscaling for the application funnel. The photo travels
// through a server action, so the encoded output must stay well under the
// 4 MB server-action body limit (next.config.mjs) — a ≤2000 px JPEG at 0.85
// is typically 300 KB–1 MB regardless of the input size.

export const MAX_EDGE_PX = 2000
export const JPEG_QUALITY = 0.85
// When the browser cannot decode/re-encode the file, the original may pass
// through as-is only below this — it still has to fit the request body.
export const FALLBACK_MAX_BYTES = 3 * 1024 * 1024

export function targetDimensions(
  width: number, height: number, maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  if (width <= maxEdge && height <= maxEdge) return { width, height }
  const scale = maxEdge / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export async function compressImage(file: File): Promise<File> {
  try {
    // imageOrientation: 'from-image' bakes EXIF rotation into the pixels.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = targetDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unsupported')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('encode failed')
    const base = file.name.replace(/\.[^.]*$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    if (file.size <= FALLBACK_MAX_BYTES) return file
    throw new Error('image-too-large')
  }
}
