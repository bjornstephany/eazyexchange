import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  // Only the genuinely public marketing pages belong here. Everything else
  // is authenticated or token-gated (see app/robots.ts).
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
  ]
}
