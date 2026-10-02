# LuxeRide Overlap Analysis — HTML Prototype vs Architecture Doc vs Web App

## Sources compared
1. `luxeride-funnel (2).html` (1056 lines) — static prototype
2. `luxeride-architecture-plan.md` (75 lines) — design spec
3. `luxeride-web/src/` (24 .ts/.tsx files) — existing Next.js app

## Overlap matrix (entities)

| Entity | HTML Prototype | Architecture Doc | Web App (luxeride-web) | Overlap Status |
|---|---|---|---|---|
| Brands (BRANDS) | CONFIG.BRANDS (20+ brands, regular/premium tiers, available flags) | `Car` table (brand, model, tier, available) | `data/cars.ts` — 1:1 port of CONFIG.BRANDS with `nameOf()` / `isModelAvailable()` | FULL OVERLAP |
| Products (PRODUCTS) | CONFIG.PRODUCTS — 7 items with rowApplicable, regular/premium prices, threeRowSurcharge | `Product` table (name, slug, note, tier, rowApplicable, basePrice, threeRowSurcharge, images[]) | `data/products.ts` — 7 products, same names/prices/row behavior | FULL OVERLAP |
| Locations (LOCATIONS) | CONFIG.LOCATIONS — 4 zones with eta + fee | `Location` table (name, fee, etaText) | `data/locations.ts` — same 4 zones, same fees/etas | FULL OVERLAP |
| Categories | Not in HTML (products listed directly) | `Category` (name, slug) | `data/products.ts` — CATEGORIES array (5 categories with slugs/blurbs) | NEW IN DOC/WEB |
| Car search / flat index | FLAT_CARS derived from BRANDS | `Car` / `CarModelFlag` (for MDX-style exception) | `data/cars.ts` — FLAT_CARS exported directly | FULL OVERLAP |
| Popular cars list | POPULAR_CARS array (8 pairs) | Not specified separately | `data/cars.ts` — same 8 pairs | FULL OVERLAP |
| Fit-finder steps | landing → car → year → product → row → location → results → checkout | `/fit-finder` sitemap with configurator | `app/fit-finder/page.tsx` exists (not fully inspected but route exists) | ROUTE EXISTS |
| Checkout form | Static WhatsApp message builder with name/phone/address/payment | `Order` + `OrderItem` DB tables; Paystack + WhatsApp integration proposed | `app/checkout/page.tsx` + `store/cart.ts` (Zustand + localStorage) — client-side only, no DB write | PARTIAL (form exists, no DB/backend) |
| Cart | Single-item state (no multi-item) in HTML | Client-side Zustand + localStorage; writes to DB at checkout | `store/cart.ts` — Zustand + persist (`localStorage`), supports multi-item qty/subtotal | FULL OVERLAP ON IDEAS, MISSING DB PERSISTENCE |
| Storefront / shop pages | Not present (only fit-finder funnel) | `/shop`, `/shop/[category]`, `/products/[slug]`, `/cart` sitemap | `app/shop/page.tsx`, `app/cart/page.tsx`, `app/products/[slug]/page.tsx`, `components/ProductCard.tsx` | FULL OVERLAP ON PAGES |
| Database / ORM | None (JS object CONFIG) | PostgreSQL via Supabase + Prisma | Not present in web app | MISSING |
| Payment (Paystack) | WhatsApp `wa.me` link only; manual POD or prepay message | Paystack inline/redirect + POD kept | Not implemented | MISSING |
| WhatsApp verification engine | `CONFIG.WHATSAPP_NUMBER` hardcoded; `wa.me` open only | WhatsApp Cloud API + webhook `/api/whatsapp/webhook` + 12h cron follow-up | `lib/whatsapp.ts` (exists, content not fully read) | PARTIAL (file exists) |
| Media / product images | `assets/products/` SVG + JPG filenames hardcoded in CONFIG.PRODUCT_IMAGES | Supabase Storage / Vercel Blob for photos | `public/products/` same filenames; `data/products.ts` references same paths | FULL OVERLAP |
| Admin | Not present | Supabase table editor initially; real admin screen later | Not present | MISSING |

## Key gaps found (why this isn't a full ecommerce platform yet)

1. **No database layer** — All product/car/location data is static TypeScript (`data/*.ts`). The architecture doc requires PostgreSQL + Prisma schema (`Category`, `Product`, `Car`, `Location`, `Order`, `OrderItem`). Changing a price requires a redeploy.
2. **No server actions / API routes for checkout** — `store/cart.ts` writes to `localStorage`. `app/checkout/page.tsx` builds a WhatsApp message but does not create an `Order` or `OrderItem` row in any DB.
3. **No payments backend** — Paystack integration is planned (Phase 3) but not present.
4. **No WhatsApp webhook / verification engine** — Only a `lib/whatsapp.ts` file exists; no `/api/whatsapp/webhook` endpoint is implemented for Confirm/Cancel button clicks.
5. **No admin dashboard** — No `/admin` route or table-editor integration.
6. **No product image management** — Images are static in `public/`; no Supabase Storage integration to swap photos without redeploy.

## Conclusion for build
Extend `luxeride-web`. Keep the existing `data/*.ts` as seed data, add Prisma schema + Supabase, create `/api/checkout` server action, migrate cart from pure `localStorage` to DB at checkout time.
