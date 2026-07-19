import React from 'react'

export type Segment = { type: 'text'; value: string } | { type: 'url'; value: string }

// Match http(s) URLs. Stop before trailing punctuation that is almost never
// part of the link (., comma, ), etc.) so "…/c." keeps the period as text.
const URL_RE = /https?:\/\/[^\s]+[^\s.,;:!?)\]}'"]/g

export function segmentText(text: string): Segment[] {
  if (text.length === 0) return []
  const segments: Segment[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) })
    segments.push({ type: 'url', value: m[0] })
    last = start + m[0].length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}

export function Linkified({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="whitespace-pre-wrap break-words">
      {segmentText(text).map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline underline-offset-2 hover:text-brand-hover"
          >
            {seg.value}
          </a>
        ) : (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ),
      )}
    </span>
  )
}
