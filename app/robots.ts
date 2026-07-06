import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Everything below is either authenticated, token-gated, or an API
      // route — none of it should be crawled or indexed.
      disallow: [
        '/api/',
        '/auth/',
        '/apply/',
        '/invite/',
        '/join/',
        '/accept-invite',
        '/onboarding',
        '/billing',
        '/dashboard',
        '/exchanges',
        '/documents',
        '/forms',
        '/students',
        '/applications',
        '/settings',
        '/my-forms',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
