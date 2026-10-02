# LuxeRide — Next.js Storefront (UI Phase)

This is the real e-commerce rebuild from the architecture plan — Next.js 16 (App Router), TypeScript, Tailwind v4. This phase is **UI + client-side state only**: no database, no Paystack, no WhatsApp Cloud API webhook yet. Everything currently lives in `src/data/*.ts` as typed constants (a direct port of the old prototype's config), and the cart/order are Zustand stores persisted to `localStorage`.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Production build: `npm run build && npm start`.

## What's here

- `/` — homepage with category tiles and featured products
- `/shop` and `/shop?category=<slug>` — full catalog, filterable
- `/products/[slug]` — product detail page → links into the Fit Finder with that product pre-selected
- `/fit-finder` (also `/fit-finder?product=<slug>` for a locked entry point) — the car search → year → product → row-configuration wizard, ending in **Add to Cart** instead of going straight to checkout
- `/cart` — multi-item cart, quantity controls
- `/checkout` — name/phone (validated)/address/delivery zone/payment method, live WhatsApp message preview
- `/order/confirmation` — reads the last placed order from the order store

## What's real vs. placeholder

- **Real**: all routing, cart logic, pricing math (row surcharge, tier-based pricing, POD vs. prepay discount), phone validation, coming-soon routing for unavailable brands/models, the full 31-brand car catalog.
- **Placeholder**: product photos for Single/Double Layer Mats are on-brand SVG placeholders (clearly watermarked) in `/public/products/`; Seat Covers, Full Bundle, Cargo Liner, Mud Flaps, and Sun Shade reference image paths that don't exist yet — those slots just quietly stay empty (see `SafeImage.tsx`) until real photos are dropped in at the same filenames.
- **Prices**: Cargo Liner / Mud Flaps / Sun Shade prices are placeholders — swap them in `src/data/products.ts`.

## Next phases (not built yet, per the architecture plan)

1. Move `src/data/*.ts` into a real Postgres DB (Supabase + Prisma).
2. Paystack integration for the "Prepay by Transfer" option.
3. WhatsApp Business Cloud API — actual server-side send + webhook for the Confirm/Cancel buttons (today, checkout opens a `wa.me` link client-side, same as the prototype).
4. Admin screen (or start with Supabase's table editor).

## Notes on this build

- Fonts (Oswald / Inter / JetBrains Mono) are loaded via `next/font/google` — this needs normal internet access at build time; it was verified working with fonts stubbed out in the sandbox (no external network there), so don't be alarmed if you see a fetch error in a network-restricted environment. On your machine this will just work.
- `npx tsc --noEmit` and `npx eslint .` both run clean.
