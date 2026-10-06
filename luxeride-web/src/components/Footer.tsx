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
