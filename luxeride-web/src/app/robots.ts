import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Transactional and post-purchase pages. They hold no content worth
        // indexing, and `/checkout` competing with `/shop` for a query is a
        // self-inflicted loss. These also carry `robots: { index: false }` as
        // metadata — this file is the crawler-facing half of the same rule.
        disallow: ["/cart", "/checkout", "/order/"],
        // `/fit-finder` IS allowed, deliberately. It is the primary conversion
        // route and carries the catalogue's real instructional content. It is
        // coupled to design.md → Open Questions item 5, which is still open: if
        // the Fit Finder is ever reduced to a bare widget with no prose, it
        // should be disallowed here at the same time as its metadata changes.
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
