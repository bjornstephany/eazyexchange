/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Client router cache: dynamic pages stay reusable for 3 min after a
    // visit; the rail's prefetch={true} entries get the 5-min static window.
    // Own mutations stay fresh via revalidatePath in server actions.
    staleTimes: { dynamic: 180 },
  },
}

export default nextConfig
