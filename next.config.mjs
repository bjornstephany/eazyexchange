import createNextIntlPlugin from 'next-intl/plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Client router cache: dynamic pages stay reusable for 3 min after a
    // visit; the rail's prefetch={true} entries get the 5-min static window.
    // Own mutations stay fresh via revalidatePath in server actions.
    staleTimes: { dynamic: 180 },
    // Applicant photos travel through a server action; compressed output is
    // ≤ ~1 MB, this is headroom (Vercel caps request bodies at ~4.5 MB).
    serverActions: { bodySizeLimit: '4mb' },
  },
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
export default withNextIntl(nextConfig)
