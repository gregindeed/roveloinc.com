import type { MetadataRoute } from 'next'

// Public homepage is crawlable; everything behind auth (and the API) is not.
// The middleware already redirects crawlers off /admin and /portal, but naming
// them here is explicit and keeps the paths out of search results entirely.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/portal', '/api', '/login', '/auth', '/set-password', '/forgot-password'],
    },
    sitemap: 'https://roveloinc.com/sitemap.xml',
    host: 'https://roveloinc.com',
  }
}
