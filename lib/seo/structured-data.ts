// schema.org Organization block for the public landing page. Injected as an
// inline <script type="application/ld+json"> so Google can attribute a name and
// logo to the domain (search-result logo + future knowledge panel). Pure and
// synchronous — no data fetch — so the landing page stays prerenderable.
export function organizationJsonLd(baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'EazyExchange',
    alternateName: 'Eazyexchange',
    url: baseUrl,
    // Raster PNG favicon route (app/icon.tsx) — a real image Google can fetch.
    logo: `${baseUrl}/icon`,
    description:
      'Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.',
  }
}
