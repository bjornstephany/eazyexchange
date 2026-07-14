import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

// Same brand tile as app/apple-icon.tsx.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#10203F"/><circle cx="25" cy="25" r="13" fill="#FFFFFF"/><circle cx="39" cy="39" r="13" fill="#3B6EF6"/></svg>`

export default function Icon() {
  return new ImageResponse(
    (
      <img
        width={192}
        height={192}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(tile)}`}
        alt=""
      />
    ),
    { ...size },
  )
}
