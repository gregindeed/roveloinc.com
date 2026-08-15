import type { MetadataRoute } from 'next'

// Only the public marketing homepage belongs in the sitemap — the rest of the
// app is authenticated and intentionally not indexed.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://roveloinc.com/',
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
