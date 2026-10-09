import Link from "next/link";
import { listCategories } from "@/lib/catalogue";
import { contact, guarantee } from "@/lib/copy";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * The footer link grid (`storefront-catalog` §5.4).
 *
 * A Server Component with no `"use client"`, so every link works before
 * hydration. Every figure it quotes comes from the copy register, and the
 * policy links point at the routes that exist (`/policies/[slug]`). Single
 * column on the narrowest viewport, ≥44px tap targets.
 *
 * The category links come from the DATABASE, through `listCategories()`, and not
 * from the `CATEGORIES` array in `src/data/products.ts`. That array is the seed
 * fixture; reading it here meant a category the owner added in
 * `/admin/categories` never reached the footer and one they removed kept its
 * link (Requirement 1.1, 1.3). Awaiting is what makes the component async — it is
 * rendered on the server inside `PublicChrome`, which deliberately passes it as
 * `children` so the read stays out of the browser.
 */
export default async function Footer() {
  const categories = await listCategories();
  const shopLinks = [{ href: "/shop", label: "All Products" }, ...categories.map((c) => ({
    href: `/shop/${c.slug}`,
    label: c.name,
  }))];

  const helpLinks = [
    // `/contact` first: a visitor in the Help column most often wants a person,
    // not a policy. The same five routes are in the mobile menu, and the M5 spend
    // gate asserts they are one tap away on a phone.
    { href: "/contact", label: "Contact us" },
    { href: "/policies/delivery", label: "Delivery" },
    { href: "/policies/returns", label: "Returns & Guarantee" },
    { href: "/policies/privacy", label: "Privacy" },
    { href: "/policies/terms", label: "Terms" },
  ];

  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-fg">Shop</h2>
            <ul className="mt-3 space-y-1">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-block py-1.5 text-sm text-fg-muted hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-semibold text-fg">Help</h2>
            <ul className="mt-3 space-y-1">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-block py-1.5 text-sm text-fg-muted hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-semibold text-fg">Contact</h2>
            <ul className="mt-3 space-y-1">
              <li>
                <a
                  href={whatsappLink("Hi! I have a question about an order.")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block py-1.5 text-sm text-fg-muted hover:text-accent"
                >
                  WhatsApp us
                </a>
              </li>
              <li>
                <a href={contact.tel} className="inline-block py-1.5 text-sm text-fg-muted hover:text-accent">
                  Call {contact.whatsappNumber}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs text-fg-muted">
          <p>{contact.businessName} — laser-measured car accessories, nationwide delivery.</p>
          <p className="mt-1">
            🛡️{" "}
            <Link href="/policies/returns" className="text-accent hover:underline">
              {guarantee}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
