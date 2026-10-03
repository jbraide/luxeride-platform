import Link from "next/link";
import { CATEGORIES } from "@/data/products";
import { contact, guarantee } from "@/lib/copy";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * The footer link grid (`storefront-catalog` §5.4).
 *
 * A Server Component with no `"use client"`, so every link works before
 * hydration. Every figure it quotes comes from the copy register, and the
 * policy links point at the routes that exist (`/policies/[slug]`). Single
 * column on the narrowest viewport, ≥44px tap targets.
 */
export default function Footer() {
  const shopLinks = [{ href: "/shop", label: "All Products" }, ...CATEGORIES.map((c) => ({
    href: `/shop/${c.slug}`,
    label: c.name,
  }))];

  const helpLinks = [
    { href: "/policies/delivery", label: "Delivery" },
    { href: "/policies/returns", label: "Returns & Guarantee" },
    { href: "/policies/privacy", label: "Privacy" },
    { href: "/policies/terms", label: "Terms" },
  ];

  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-white">Shop</h2>
            <ul className="mt-3 space-y-1">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-block py-1.5 text-sm text-muted hover:text-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-semibold text-white">Help</h2>
            <ul className="mt-3 space-y-1">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-block py-1.5 text-sm text-muted hover:text-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-semibold text-white">Contact</h2>
            <ul className="mt-3 space-y-1">
              <li>
                <a
                  href={whatsappLink("Hi! I have a question about an order.")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block py-1.5 text-sm text-muted hover:text-gold"
                >
                  WhatsApp us
                </a>
              </li>
              <li>
                <a href={contact.tel} className="inline-block py-1.5 text-sm text-muted hover:text-gold">
                  Call {contact.whatsappNumber}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-line pt-6 text-center text-xs text-muted">
          <p>{contact.businessName} — laser-measured car accessories, nationwide delivery.</p>
          <p className="mt-1">
            🛡️{" "}
            <Link href="/policies/returns" className="text-gold hover:underline">
              {guarantee}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
