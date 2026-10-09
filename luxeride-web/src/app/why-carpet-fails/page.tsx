import { Fragment } from "react";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import renderSection from "@/components/funnel/render-section";
import { whyCarpetFails } from "@/data/funnel/why-carpet-fails";
import { faqJsonLd, pageMetadata } from "@/lib/seo";

/**
 * `/why-carpet-fails` — the problem/education page the ads point at.
 *
 * A Server Component with no client JavaScript of its own (Requirement 1.1): the
 * copy is a typed data module and every section renders as static HTML, so the page
 * is fully readable before hydration and with JavaScript off.
 *
 * There is no `searchParams` here: this page is reached by a plain ad URL and by a
 * link, and it routes onward to `/shop/floor-mats` — the category that exists
 * (Requirement 7.3) rather than the `/shop/tpe-mats` the blueprint named.
 */
export const metadata: Metadata = pageMetadata({
  title: whyCarpetFails.metadata.title,
  description: whyCarpetFails.metadata.description,
  path: whyCarpetFails.metadata.path,
});

export default function WhyCarpetFailsPage() {
  // The FAQ markup and the FAQPage structured data are built from the SAME list, so
  // the schema cannot advertise a question the page does not show. `faqJsonLd`
  // returns null for an empty list, which is why this is guarded rather than passed
  // through directly.
  const faq: { q: string; a: string }[] = [];
  for (const section of whyCarpetFails.sections) {
    if (section.kind === "faq") faq.push(...section.items);
  }

  return (
    <div>
      {faq.length > 0 ? <JsonLd data={faqJsonLd(faq)!} /> : null}
      {whyCarpetFails.sections.map((section, index) => (
        <Fragment key={index}>{renderSection(section)}</Fragment>
      ))}
    </div>
  );
}
