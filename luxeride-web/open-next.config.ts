import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext Cloudflare configuration.
//
// Left on defaults deliberately: the storefront is database-backed and rendered
// per request, so it does not yet need an incremental cache. When ISR caching is
// wanted, add an R2 bucket in `wrangler.jsonc` and wire
// `incrementalCache: r2IncrementalCache` here (see the OpenNext Cloudflare
// caching docs).
export default defineCloudflareConfig();
