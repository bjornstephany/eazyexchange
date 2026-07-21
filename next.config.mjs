import createNextIntlPlugin from 'next-intl/plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The AST CERFA is read with fs at add time (lib/forms/assets.ts); nothing
  // imports it, so the build tracer needs to be told to ship it.
  outputFileTracingIncludes: {
    '/**': ['./lib/forms/assets/**'],
  },
  experimental: {
    // Client router cache: dynamic pages stay reusable for 3 min after a
    // visit; the rail's prefetch={true} entries get the 5-min static window.
    // Own mutations stay fresh via revalidatePath in server actions.
    staleTimes: { dynamic: 180 },
  },
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
export default withNextIntl(nextConfig)
