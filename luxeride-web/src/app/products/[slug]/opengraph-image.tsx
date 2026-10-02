import { ImageResponse } from "next/og";
import { PRODUCTS, getCategoryBySlug, getProductBySlug, priceRange } from "@/data/products";
import { fmtNairaAscii } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site";

// The per-product Open Graph card, 1200x630.
//
// One image per product so a link pasted to WhatsApp or Facebook shows the
// product rather than the site-wide fallback. Prices are rendered as the BAND
// the PDP shows, never a single figure — a card that quotes one number is a
// claim the WhatsApp quote can contradict, and the same rule §7.3 applies to
// the page itself.
//
// The default bundled font is used deliberately: reading a font over the
// network at build time makes the build fail on a flaky connection.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export const alt = "LuxeRide product";

export default async function ProductOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  const category = product ? getCategoryBySlug(product.categorySlug) : undefined;
  const name = product?.name ?? "LuxeRide";
  // "NGN" rather than "₦": see fmtNairaAscii — the bundled ImageResponse font
  // has no naira glyph, so the symbol renders as an empty box on the card.
  const price = product ? `From ${fmtNairaAscii(priceRange(product)[0])}` : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0a",
          borderTop: "12px solid #d4af37",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 5,
            color: "#d4af37",
            textTransform: "uppercase",
          }}
        >
          {category?.name ?? "Custom-fit accessories"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 84,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.1,
          }}
        >
          {name}
        </div>
        {product ? (
          <>
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 40,
                color: "#d4af37",
              }}
            >
              {price}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 16,
                fontSize: 30,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {product.availability}
            </div>
          </>
        ) : null}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 30,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          LuxeRide · {absoluteUrl("/").replace(/^https?:\/\//, "")}
        </div>
      </div>
    ),
    size,
  );
}
