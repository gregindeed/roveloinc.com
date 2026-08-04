import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Minimal config. (Incremental/ISR cache via R2 can be added later if we
// introduce statically-revalidated pages; this app is request-rendered.)
export default defineCloudflareConfig()
