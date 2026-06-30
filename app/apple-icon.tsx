import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="11" fill="#3FA277"/><circle cx="24" cy="24" r="12.5" stroke="#fff" stroke-width="2.6"/><ellipse cx="24" cy="24" rx="5.5" ry="12.5" stroke="#fff" stroke-width="2.2"/><path d="M12 24h24M14.5 18.5h19M14.5 29.5h19" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`

export default function AppleIcon() {
  return new ImageResponse(
    (
      <img
        width={180}
        height={180}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(tile)}`}
        alt=""
      />
    ),
    { ...size },
  )
}
