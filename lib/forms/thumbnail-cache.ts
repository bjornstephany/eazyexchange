// Client-side cache for rendered PDF page-1 thumbnails. Keyed by
// template_file_path — replacing a file changes the path, so invalidation is
// automatic. Two layers: an in-memory Map for the session and localStorage
// PNG data-URLs capped at MAX_ENTRIES (oldest evicted). Every storage error
// (quota, disabled storage, corrupt JSON) degrades to a cache miss — a cache
// problem must never surface to the card.
const PREFIX = 'eazy.tplthumb.'
const MAX_ENTRIES = 20

type Entry = { d: string; at: number }

const memory = new Map<string, string>()

export function getCachedThumbnail(path: string): string | null {
  const hit = memory.get(path)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(PREFIX + path)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry
    if (typeof entry?.d !== 'string') return null
    memory.set(path, entry.d)
    return entry.d
  } catch {
    return null
  }
}

export function putCachedThumbnail(path: string, dataUrl: string): void {
  memory.set(path, dataUrl)
  const value = JSON.stringify({ d: dataUrl, at: Date.now() } satisfies Entry)
  try {
    localStorage.setItem(PREFIX + path, value)
    evictDownTo(MAX_ENTRIES)
  } catch {
    // Quota: make room once and retry; after that the memory layer suffices.
    try {
      evictDownTo(Math.floor(MAX_ENTRIES / 2))
      localStorage.setItem(PREFIX + path, value)
    } catch { /* memory layer still has it */ }
  }
}

function evictDownTo(keep: number): void {
  const entries: { key: string; at: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    let at = 0
    try { at = (JSON.parse(localStorage.getItem(key) ?? '') as Entry).at ?? 0 } catch { /* oldest */ }
    entries.push({ key, at })
  }
  if (entries.length <= keep) return
  entries.sort((x, y) => x.at - y.at)
  for (const e of entries.slice(0, entries.length - keep)) localStorage.removeItem(e.key)
}

// Test helper — the module-level Map otherwise leaks state between tests.
export function clearThumbnailMemoryCache(): void {
  memory.clear()
}
