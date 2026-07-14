import { ImageResponse } from 'next/og'

export const alt = "EazyExchange — Gérez les dossiers d'échanges scolaires"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Same brand tile as app/apple-icon.tsx / app/icon.tsx, rendered larger.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#10203F"/><circle cx="25" cy="25" r="13" fill="#FFFFFF"/><circle cx="39" cy="39" r="13" fill="#3B6EF6"/></svg>`

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#10203F',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <img
          width={140}
          height={140}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(tile)}`}
          alt=""
        />
        <div style={{ marginTop: 48, fontSize: 68, fontWeight: 700, letterSpacing: -1 }}>
          EazyExchange
        </div>
        <div style={{ marginTop: 20, fontSize: 36, color: '#9DB2D9', maxWidth: 900 }}>
          Gérez les dossiers d&apos;échanges scolaires — complets, à temps, sans relances.
        </div>
      </div>
    ),
    { ...size },
  )
}
