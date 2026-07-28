import type { MetadataRoute } from 'next'
import { LEGAL_SLUGS } from '@/lib/legal'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  // Only the genuinely public marketing pages belong here. Everything else
  // is authenticated or token-gated (see app/robots.ts). /login is public but
  // deliberately absent — it is noindex.
  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Statically prerendered, linked from the landing footer and the signup
    // consent line, and crawlable — declaring them stops Google treating them
    // as stray discovered URLs.
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${baseUrl}/legal/${slug}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}
