import type { Metadata } from "next";
import { absoluteUrl, OG_FALLBACK, SITE_LOCALE, SITE_NAME, SITE_URL } from "@/lib/site";

// Page-level metadata, and the JSON-LD builders.
//
// The rule this file exists to enforce: EVERY page gets its own title, its own
// description and a SELF-REFERENCING canonical. A page that does not call
// pageMetadata() inherits the root title, which is how seven products ended up
// competing for one query as one page.

interface PageMetadataInput {
  /** Page title WITHOUT the site-name suffix — the template adds "| LuxeRide". */
  title: string;
  /**
   * Optional from 2026-10-04.
   *
   * A product or category created in `/admin/products` has no authored
   * `seoDescription`, because nothing in the admin writes one yet. Rather than
   * force every caller to invent a fallback — which is how a page ends up
   * describing something it is not — this falls back to the site's own
   * description. Every PDP has one, so this has no empty-slot path.
   */
  description?: string;
  /** Site-relative path with a leading slash, no query string. e.g. "/shop". */
  path: string;
  /** Site-relative Open Graph image path, e.g. "/products/mats/opengraph-image". */
  image?: string;
  /**
   * Defaults to "website". Note there is deliberately no "product" here:
   * `og:type` has no product value (that is `product` in schema.org, which
   * productJsonLd covers), and Next's own type union rejects one.
   */
  type?: "website" | "article";
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const ogImage = image ?? OG_FALLBACK;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      url,
      title,
      description,
      images: [{ url: absoluteUrl(ogImage), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(ogImage)],
    },
  };
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────
// Deliberately hand-typed rather than pulled from a dependency: there is no
// AggregateRating or review field anywhere in this file or in the Product
// interface, because there is no review store in the app and a fabricated
// rating is a structured-data policy violation. scripts/seo-check.mjs asserts
// the absence mechanically.

type Json = Record<string, unknown>;

export function organizationJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Laser-measured custom-fit car accessories in Nigeria — floor mats, seat covers, cargo liners and more, fitted to your exact car.",
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        areaServed: "NG",
        availableLanguage: ["en"],
        url: "https://wa.me/2347049621694",
      },
    ],
  };
}

interface ProductJsonLdInput {
  name: string;
  description: string;
  /** Site-relative image path, or an absolute URL. */
  image: string;
  slug: string;
  category: string;
  /** Absolute or site-relative product URL. */
  url: string;
}

export function productJsonLd({
  name,
  description,
  image,
  slug,
  category,
  url,
}: ProductJsonLdInput): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: absoluteUrl(image),
    sku: slug,
    category,
    brand: { "@type": "Brand", name: SITE_NAME },
    url: absoluteUrl(url),
  };
}

/** Trail must be ordered oldest-first, matching the visible Breadcrumbs trail. */
export function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqJsonLd(faq: { q: string; a: string }[]): Json | null {
  // An empty FAQ is the honest default, and an empty FAQ schema block is worse
  // than none — it advertises content that does not exist.
  if (faq.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
}
