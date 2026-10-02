# LuxeRide — From Prototype to Real E-Commerce Site

## 1. Verdict on what we've built so far

The HTML prototype did its job: it proved out the car-fit search, row configuration, pricing logic, and WhatsApp handoff as a UX concept. That logic is genuinely good and worth keeping. But a single static file can't do what you're now asking for — a browsable catalog, categories, a cart that holds more than one item, or checkout across multiple products. That's not a tweak, it's a different kind of application. Time to rebuild it properly and carry the good parts over.

## 2. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | You already run this for Command Center — same mental model, same deploy target (Vercel), and it does both the storefront pages and the backend (API routes/server actions) in one codebase. |
| Database | **PostgreSQL via Supabase** | Free tier is generous, and its built-in table editor doubles as a crude admin panel on day one — you can edit products/prices without building an admin UI first. |
| ORM | **Prisma** | Type-safe queries, painless migrations, pairs naturally with Next.js + TypeScript. |
| Cart | **Client-side (Zustand + localStorage)**, only written to the DB at checkout | You don't have real concurrent-cart-abandonment volume yet — a server-side session cart is real infrastructure you don't need on day one. Start simple, upgrade later if you actually need cart recovery emails/analytics. |
| Payments | **Paystack** (Inline or redirect checkout) + **Pay on Delivery** kept as a manual option | Best-documented Nigeria-first processor; card, bank transfer, and USSD all work through one integration. POD stays exactly as we built it — WhatsApp-verified, no processor needed. |
| WhatsApp | **WhatsApp Business Cloud API** (official Meta API) | This is what actually lets you send the templated "Message 1" confirmation and receive the Confirm/Cancel button click back — a webhook endpoint, not just a `wa.me` link. |
| Media | **Supabase Storage** (or Vercel Blob) for product photos | So you can swap product photos from a dashboard, not a redeploy. |
| Hosting | **Vercel** | Zero-config Next.js deploys, handles the WhatsApp/Paystack webhook functions as serverless routes. |

**Build vs. buy, briefly:** Shopify or WooCommerce would get you cart/checkout/categories faster out of the box. I'm not recommending them because the actual hard part of this business — car-make/model/year/row compatibility driving price — doesn't fit either platform's product model without fighting it (metaffield hacks in Shopify, custom plugin hell in WooCommerce). You'd spend more time working around the platform than you'd save. A plain Next.js + Postgres build keeps the configurator as first-class data instead of a bolted-on afterthought.

## 3. Data model

```
Category      id, name, slug
Product       id, categoryId, name, slug, note, tier ("regular"|"premium"),
              rowApplicable (bool), basePrice, threeRowSurcharge, images[]
Car           id, brand, model, tier, available (bool)
CarModelFlag  carId, available (bool)   -- for the Acura-MDX-style single-model exception
Location      id, name, fee, etaText
Order         id, customerName, phone, address, locationId,
              paymentMethod ("pod"|"prepay"), status, createdAt
OrderItem     orderId, productId, carId, rows ("2"|"3"|null),
              unitPrice, qty
```

This is a direct port of the `CONFIG.BRANDS` / `CONFIG.PRODUCTS` / `CONFIG.LOCATIONS` objects from the prototype — same shape, now rows in a real database instead of a JS object you have to redeploy to edit.

## 4. Site map

- `/` — homepage: hero, category tiles, "Find My Fit" CTA
- `/shop` — full catalog, filterable by category (this is the "normal products, categories" browsing you're asking for)
- `/shop/[category]` — e.g. `/shop/seat-covers`
- `/products/[slug]` — product detail page, with a "Not sure it fits your car? Use the Fit Finder" link
- `/fit-finder` — the configurator we already built: car search → row config (if applicable) → adds the exact-fit variant to cart
- `/cart` — multi-item cart, editable quantities
- `/checkout` — the form we built (name, phone, address, payment method) — now submits a real multi-item order
- `/order/[id]` — confirmation page; this is also what triggers the WhatsApp send server-side

## 5. Cart, bundles, checkout — how they actually work here

- **Cart**: adding a product (from `/shop` or from finishing the Fit Finder) pushes an item into Zustand state, persisted to `localStorage` so it survives a refresh. Nothing touches the database until checkout.
- **Bundles**: kept as they are now — a bundle is just a `Product` row like any other (`"Full Bundle"`), not a special cart mechanic. Simpler to reason about, and it's already how we priced it. A cart-level "buy X + Y, save Z" promo engine is a real feature you can add later once you have volume to justify it — not needed for launch.
- **Checkout**: one order can now hold several `OrderItem` rows (e.g., mats + a cargo liner in the same checkout), each keeping its own car/row/price snapshot so a later price change never rewrites history on old orders.

## 6. WhatsApp verification engine (Pillar 3 from your blueprint, now actually buildable)

This is the one piece that genuinely needed a backend, and now it has one:
1. Order placed → Next.js server action creates the `Order` row → calls the WhatsApp Cloud API to send the templated confirmation with Confirm/Cancel buttons.
2. Meta sends the button click to a webhook route (`/api/whatsapp/webhook`) → you update `Order.status` to `confirmed` or `cancelled`.
3. A cron job (Vercel Cron, or a simple scheduled function) checks orders still `pending` after 12 hours and fires the urgency follow-up template.

## 7. Phased build plan

1. **Scaffold**: Next.js + Prisma schema + seed the DB with your current car/product/location data (a straight port of the JS config).
2. **Storefront**: catalog pages, product pages, cart — no payments yet, just browsing.
3. **Checkout + Paystack**: wire the form we already built to create real orders; add Paystack for prepay.
4. **WhatsApp engine**: Cloud API integration + webhook + the 12-hour follow-up.
5. **Admin**: start with Supabase's table editor; build a real admin screen only once that becomes a bottleneck.

## 8. What I need from you to start Phase 1

- Confirm Supabase (or tell me if you'd rather self-host Postgres/use Neon — you know your infra preferences better than I do)
- A Paystack test API key when we get to Phase 3 (not needed yet)
- Whether you want me to scaffold the actual repo next, or review this plan first
