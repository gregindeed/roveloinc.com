/** @type {import('next').NextConfig} */
const nextConfig = {
  // Runs as a Node server (via OpenNext on Cloudflare Workers) — no static export.
}

export default nextConfig

// Enables Cloudflare bindings during local `next dev`. No-op for production builds.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
initOpenNextCloudflareForDev()
