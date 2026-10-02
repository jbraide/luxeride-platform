# LuxeRide — Next.js Storefront

This is the real e-commerce rebuild from the architecture plan — Next.js 16 (App Router), TypeScript,
Tailwind v4. This phase is **UI + client-side state only**: no database, no Paystack, no WhatsApp Cloud
API webhook yet. Everything currently lives in `src/data/*.ts` as typed constants (a direct port of the
old prototype's config), and the cart/order are Zustand stores persisted to `localStorage`.

The authoritative plan for what is built and in what order is
`../.kiro/specs/master-build-plan/tasks.md`. Check it before starting anything here.

## Run it

```bash
npm install          # runs `prisma generate` via postinstall
npm run dev
```

Then open http://localhost:3000.

The full pre-deploy gate — everything a human would otherwise have to remember to run:

```bash
npm run verify
```

It chains `tsc --noEmit`, `eslint .`, `media:check` and `next build`, and exits non-zero on the first
failure. `npm run build` on its own also runs `media:check` first, so a missing product image fails the
production build rather than shipping an empty slot to paid traffic.

> **No database is required to run or build the app.** Nothing under `src/` imports `@prisma/client`
> yet, and `npm run build` never touches Postgres. `prisma/schema.prisma` exists but has never been
> migrated — see `../.kiro/specs/commerce-backend/tasks.md` §2.

## What's here

- `/` — homepage with category tiles and featured products
- `/shop` and `/shop?category=<slug>` — full catalog, filterable
- `/products/[slug]` — product detail page → links into the Fit Finder with that product pre-selected
- `/fit-finder` (also `/fit-finder?product=<slug>` for a locked entry point) — the car search → year →
  product → row-configuration wizard, ending in **Add to Cart** instead of going straight to checkout
- `/cart` — multi-item cart, quantity controls
- `/checkout` — name/phone (validated)/address/delivery zone/payment method, live WhatsApp message preview
- `/order/confirmation` — reads the last placed order from the order store
- 404 and error boundaries (`src/app/not-found.tsx`, `src/app/error.tsx`), each with a WhatsApp escape

## What's real vs. placeholder

- **Real**: all routing, cart logic, pricing math (row surcharge, tier-based pricing), phone validation,
  coming-soon routing for unavailable brands/models, the 33-brand car catalog, the mobile menu, the
  media gate.
- **Placeholder**: product photography. No real photo has been processed yet, so every product renders
  `ProductPlaceholder` — a branded panel that occupies exactly the box the photograph will occupy. The
  six watermarked SVGs in `public/products/` are still listed in `src/data/products.ts` but are no longer
  rendered. Real photography arrives through `public/products/manifest.json`, written by
  `scripts/media.mjs` — which is **not built yet** (`storefront-catalog` §9, blocked on D-12).
- **Honest by construction**: no surface claims stock for a specific car. Every product says it is made
  to order, and price is always a band, never one number — see `src/lib/availability.ts`.
- **Not honest yet, and owned by M2**: the Fit Finder result card still renders `FIT ✓` and "in stock for
  your …" for any of the 4,671 car/year combinations in `src/data/cars.ts`, with no fitment data behind
  any of them. This is blocker **B2**; `fitment-engine` and `fit-finder` fix it in milestone M2. Do not
  read this file as a claim that the fit story is truthful today.
- **Prices**: Cargo Liner / Mud Flaps / Sun Shade prices are placeholders — swap them in
  `src/data/products.ts`.

## Media

`node scripts/media.mjs --check` walks `PRODUCTS[].images[]` and `public/products/manifest.json` and
fails if any declared path has no file in `public/`. It is wired into `npm run build` and `npm run verify`.

## Next phases (not built yet, per the architecture plan)

1. Move `src/data/*.ts` into a real Postgres DB (Supabase + Prisma).
2. Paystack integration for the "Prepay by Transfer" option. Prepay is currently **hidden** in the
   checkout, not merely relabelled — nothing in the app contains a bank account to pay into, and an
   option that cannot be honoured is worse than no option (`src/lib/payment-options.ts`).
3. WhatsApp Business Cloud API — actual server-side send + webhook for the Confirm/Cancel buttons
   (today, checkout opens a `wa.me` link client-side, same as the prototype).
4. Admin screen (or start with Supabase's table editor).

## Notes on this build

- Fonts (Oswald / Inter / JetBrains Mono) are loaded via `next/font/google` — this needs normal internet
  access at build time.
- `npx tsc --noEmit` and `npx eslint .` both run clean **as of M0/M1** (0 errors, 0 warnings). They did
  not before M0: `prisma/seed.ts` imported a path that did not exist, which aborted `npm run build`
  entirely and left `npx tsc --noEmit` reporting one error. That claim was false when it was first
  written; it is true now, and `npm run verify` is what keeps it honest.
- `npm run build` must exit 0 and write `.next/BUILD_ID`. If `.next/BUILD_ID` is absent, the build never
  succeeded — a green-looking `next build` that produced no `BUILD_ID` is not a build.
