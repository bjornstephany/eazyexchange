import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eazyexchange.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Everything below is either authenticated, token-gated, or an API
      // route — none of it should be crawled or indexed.
      // Keep this list in sync with the app router segments: anything
      // reachable but not public 302s to /login for an anonymous crawler, and
      // Google files every one of those under "Page with redirect".
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
        '/infos',
        '/communication',
        '/admin',
        '/pending',
        // Local-only quick-access page. It 404s outside development, so a
        // crawler would never reach it — but the segment exists in the app
        // router, and this list is the record of every segment that is not
        // meant to be crawled.
        '/dev',
        // Not a route — but the middleware redirects every unmatched path to
        // /login rather than 404ing, so a stale or guessed URL is a redirect
        // too. /login itself is noindex (see app/(auth)/login/layout.tsx);
        // it stays crawlable so that signal is actually read.
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
