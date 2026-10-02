import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { CATEGORIES, PRODUCTS } from "@/data/products";
import { absoluteUrl } from "@/lib/site";

// The sitemap. Every URL is built from SITE_URL so it can never disagree with
// `metadataBase`, and there is no query string anywhere in the output — a
// sitemap is a list of canonical documents, not of filters.
//
// `lastModified` is the newest mtime of the file that actually determines the
// page's content, not `new Date()`. A sitemap that claims every page changed
// today is noise, and crawlers learn to ignore it.

/** Newest mtime among `files`, or undefined when none of them exist. */
function newestMtime(files: string[]): Date | undefined {
  let newest: number | undefined;

  for (const file of files) {
    try {
      const { mtimeMs } = fs.statSync(file);
      if (newest === undefined || mtimeMs > newest) newest = mtimeMs;
    } catch {
      // A file that does not exist simply does not contribute a timestamp.
    }
  }

  return newest === undefined ? undefined : new Date(newest);
}

const SRC = path.join(process.cwd(), "src");

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [];

  routes.push({
    url: absoluteUrl("/"),
    changeFrequency: "weekly",
    priority: 1,
    lastModified: newestMtime([
      path.join(SRC, "app", "page.tsx"),
      path.join(SRC, "data", "products.ts"),
    ]),
  });

  routes.push({
    url: absoluteUrl("/shop"),
    changeFrequency: "weekly",
    priority: 0.9,
    lastModified: newestMtime([path.join(SRC, "app", "shop", "page.tsx")]),
  });

  // Categories are real paths now (`/shop/[category]`), so they can be listed.
  // They could not be while they were `/shop?category=<slug>` — §13.1 forbids a
  // query string in a sitemap, because a crawler cannot canonicalise it and
  // every filter of the same document competes as one page.
  for (const category of CATEGORIES) {
    routes.push({
      url: absoluteUrl(`/shop/${category.slug}`),
      changeFrequency: "weekly",
      priority: 0.8,
      lastModified: newestMtime([
        path.join(SRC, "app", "shop", "[category]", "page.tsx"),
        path.join(SRC, "data", "products.ts"),
      ]),
    });
  }

  for (const product of PRODUCTS) {
    routes.push({
      url: absoluteUrl(`/products/${product.slug}`),
      changeFrequency: "weekly",
      priority: 0.7,
      lastModified: newestMtime([
        path.join(SRC, "data", "products.ts"),
        path.join(SRC, "app", "products", "[slug]", "page.tsx"),
      ]),
    });
  }

  return routes;
}
