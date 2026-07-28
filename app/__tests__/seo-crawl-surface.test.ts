import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { LEGAL_SLUGS } from '@/lib/legal'

// The crawl surface drifted once already: /admin, /pending, /infos and
// /communication shipped without a robots.txt entry, so Googlebot crawled all
// four, got the middleware's 302 to /login, and filed them under "Page with
// redirect" in Search Console. These tests derive the route list from the
// filesystem so a new segment fails here instead of in a coverage report weeks
// later.

/** Top-level URL segment of every app-router page, route groups stripped. */
function routeSegments(): string[] {
  const appDir = path.resolve(__dirname, '..')
  const segments = new Set<string>()

  function walk(dir: string, urlParts: string[]) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name === '__tests__' || entry.name.startsWith('_')) continue
      const child = path.join(dir, entry.name)
      // (auth), (organizer), … are organisational only — they add no URL segment.
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      const nextParts = isGroup ? urlParts : [...urlParts, entry.name]
      if (fs.existsSync(path.join(child, 'page.tsx')) && nextParts.length > 0) {
        segments.add(nextParts[0])
      }
      walk(child, nextParts)
    }
  }

  walk(appDir, [])
  return [...segments]
}

// Deliberately crawlable. Everything else must be disallowed.
const PUBLIC_SEGMENTS = new Set([
  'legal', // marketing/legal, in the sitemap
  'signup', // in the sitemap
  'login', // crawlable on purpose so its noindex is read (see login/layout.tsx)
])

describe('robots.txt covers the whole non-public route surface', () => {
  const { rules } = robots()
  const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow as string[]

  it('finds the app router segments', () => {
    // Guard against the walker silently returning nothing and vacuously passing.
    expect(routeSegments().length).toBeGreaterThan(5)
  })

  it.each(routeSegments().filter((s) => !PUBLIC_SEGMENTS.has(s) && !s.startsWith('[')))(
    '/%s is disallowed',
    (segment) => {
      expect(disallow.some((d) => d.replace(/\/$/, '') === `/${segment}`)).toBe(true)
    }
  )

  it('does not disallow the pages the sitemap advertises', () => {
    for (const entry of sitemap()) {
      const pathname = new URL(entry.url).pathname
      expect(disallow.some((d) => pathname.startsWith(d))).toBe(false)
    }
  })
})

describe('sitemap.xml', () => {
  const urls = sitemap().map((e) => new URL(e.url).pathname)

  it('lists the landing page and signup', () => {
    expect(urls).toContain('/')
    expect(urls).toContain('/signup')
  })

  it('lists every legal document', () => {
    for (const slug of LEGAL_SLUGS) expect(urls).toContain(`/legal/${slug}`)
  })

  it('omits /login, which is noindex', () => {
    expect(urls).not.toContain('/login')
  })
})
