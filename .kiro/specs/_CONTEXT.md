# LuxeRide — Shared Context for Spec Authors

> **Read this file completely before writing any spec.** It is the single factual base for every
> LuxeRide spec set. Every statement below was verified by reading the actual files on
> 2026-10-02. Do not contradict it, and do not repeat its claims as guesses — they are facts.
> If you need a detail that is not here, **open the file and read it**.

---

## 1. Repository layout

```
/home/joseph/Documents/Josephs workspace/Luxeride/
├── platform/                                   <- project root; specs go here
│   ├── luxeride-architecture-plan.md           <- source doc A (75 lines)
│   ├── overlap-comparison.md                   <- prior audit (38 lines)
│   ├── luxeride-funnel (2).html                <- source doc B: validated prototype (1056 lines)
│   ├── .kiro/specs/                            <- THIS IS WHERE YOU WRITE
│   └── luxeride-web/                           <- the real app (Next.js)
│       ├── luxeride-fitment-engine-admin-layout-grouping-spec.md   <- source doc C
│       ├── prisma/schema.prisma, prisma/seed.ts
│       ├── src/app/**, src/components/**, src/data/**, src/lib/**, src/store/**
│       ├── public/products/                    <- only 6 SVG placeholders
│       ├── .env                                <- DATABASE_URL is a placeholder
│       └── package.json, next.config.ts, tsconfig.json, eslint.config.mjs
└── footage/                                    <- RAW ad/product media (NOT in the app)
    ├── 3 × .jpg   4000×3000 raw, EXIF orientation tag = 6 (must be rotated 90° CW on decode)
    └── 8 × .mp4   1920×1080 @30fps, 34s–97s, 74MB–208MB each (~7.6 min total, ~17 Mbps)
    └── ../ad-voiceovers/  2 × Adobe Audition projects (chair-cover VO, single-layer VO)
```

**There is no git repository.** `platform/` and `luxeride-web/` are untracked directories. No
`.git` anywhere. No CI, no tests, no deployment config (no `vercel.json`).

---

## 2. Stack (verified from `luxeride-web/package.json`)

| Concern | What is actually installed |
|---|---|
| Framework | `next@16.3.5` — App Router, Turbopack. **Read `node_modules/next/dist/docs/` before asserting any Next API behaviour** (see `AGENTS.md`). |
| UI | `react@19.2.8`, `react-dom@19.2.8`, `tailwindcss@4` + `@tailwindcss/postcss` |
| Language | `typescript@5`, `strict: true`, path alias `@/* -> ./src/*` |
| State | `zustand@^5.0.15` with `persist` middleware → `localStorage` |
| DB | `prisma@^6`, `@prisma/client@^6` (provider `postgresql`) — **declared but entirely unused by the app** |
| Lint | `eslint@9` + `eslint-config-next@16.3.5` |
| Scripts | `dev`, `build`, `start`, `lint`, `db:seed` |

`db:seed` is `npx ts-node --project tsconfig.json prisma/seed.ts || node --loader ts-node/esm prisma/seed.ts`
— **`ts-node` is not a dependency**, so this script cannot run.

---

## 3. Verified build state (measured, not assumed)

| Check | Result |
|---|---|
| `npm run build` | ❌ **FAILS.** `prisma/seed.ts(2,34): error TS2307: Cannot find module './data/products'`. Next runs `tsc` over `**/*.ts` (tsconfig `include`), so this one bad import aborts the production build. |
| Build with `prisma/seed.ts` set aside | ✅ **Clean.** 16 pages generated. Routes: `/` (static), `/_not-found`, `/cart`, `/checkout`, `/fit-finder` (dynamic), `/order/confirmation`, `/products/[slug]` (SSG, 7 paths), `/shop` (dynamic). |
| `.next/BUILD_ID` | **Absent** → no successful production build has *ever* been produced. |
| `npx tsc --noEmit` | ❌ exactly 1 error (the `seed.ts` import above). No other type errors. |
| `npx eslint .` | ✅ 0 errors, 2 warnings (unused `BRANDS`, `PRODUCTS` imports in `seed.ts`). |

> **Launch blocker:** the app cannot currently be deployed. `README.md` claims "`npx tsc --noEmit` and
> `npx eslint .` both run clean" — that claim is **false** as of today. Any spec that mentions build
> readiness must say so.

---

## 4. What is implemented today (route by route)

### `/` — `src/app/page.tsx` (server component)
Hero with a **generic** headline ("Custom-Fit Car Accessories for Your Exact Car") + sub, 3 static
badges (`LASER-MEASURED`, `100% WATERPROOF`, `PAY ON DELIVERY`), two CTAs
(`Find My Perfect Fit` → `/fit-finder`, `Browse All Products` → `/shop`), 5 `CategoryTile`s, and
"Popular Right Now" = `PRODUCTS.slice(0, 4)`.

### `/shop` — `src/app/shop/page.tsx` (dynamic server component)
Filters by `?category=<slug>` (validated against `CATEGORIES`). Renders "All" + 5 category chips and a
`ProductCard` grid. **No search, no sort, no pagination, no per-page metadata.**

### `/products/[slug]` — `src/app/products/[slug]/page.tsx` (SSG via `generateStaticParams`)
Horizontal 3-image strip (`SafeImage`), product name, `note`, price range from `priceRange()`,
a "Final price depends on your car's tier (and row configuration)" line, the Fit Guarantee badge, and
one CTA: `Select My Car & Add to Cart` → `/fit-finder?product=<slug>`.
**No metadata, no JSON-LD, no breadcrumbs, no reviews, no specs, no cross-sell, no related items.**

### `/fit-finder` — `src/app/fit-finder/page.tsx` → `src/components/FitFinder.tsx` (client, 396 lines)
Steps: `car → year → (product) → (row) → results`, plus a `comingsoon` state.
- `?product=<slug>` locks the product (matches `PRODUCTS[].slug`, e.g. `double-layer-mats`).
- Car search over `FLAT_CARS`, substring match, max 8 results, 8 `POPULAR_CARS` when the query is empty.
- Unavailable brand *or* model → `comingsoon` step: optional phone field + `Notify Me on WhatsApp`.
- Progress bar (`Step n / m`), back buttons, `Start over`.
- Results = image strip, fit card (`{brand} {model}`, `{year} · {product.name}`, `FIT ✓` badge, big price,
  rows line), guarantee badge, `Add to Cart — ₦x`, then `Go to Cart` / `Keep Shopping`,
  `Request Live Photos First` (WhatsApp), `Want to negotiate instead?` (offer → WhatsApp), `Start over`.

### `/cart` — `src/app/cart/page.tsx` (client)
Item rows with thumbnail, qty ±, remove, line total, subtotal, "Delivery fee is calculated at
checkout", `Proceed to Checkout` + `Keep Shopping`, and an empty-cart state.

### `/checkout` — `src/app/checkout/page.tsx` (client)
Name / phone / address / delivery-zone `<select>` / payment method (`pod` | `prepay`) — prepay = free
shipping **and** −₦2,000 — live total, live pre-filled WhatsApp message preview inside a `<pre>`.
Submit: validates phone only, builds the message, writes `lastOrder` into the persisted order store,
`window.open(wa.me…)`, `clear()` the cart, `router.push('/order/confirmation')`.
**No network call of any kind. The generated order id (`LR-<base36>`) is *not* in the WhatsApp message.**

### `/order/confirmation` — `src/app/order/confirmation/page.tsx` (client)
Reads `lastOrder` from `localStorage`; shows itemised lines, delivery line, prepay discount, total,
"Order sent — check WhatsApp". If storage is empty it shows "No recent order found".

### Components
`Header` (sticky; nav `Shop` / `Fit Finder` is `hidden sm:flex` → **no mobile menu, no hamburger**;
cart badge via a `useSyncExternalStore` mount flag), `Footer` (**two lines of text, zero links**),
`Button` / `LinkButton` (`primary` | `outline` | `ghost`), `Chip`, `CategoryTile`, `ProductCard`,
`SafeImage` (client; renders `null` after an `onError`). It has four call sites: `products/[slug]/page.tsx:24` and `ProductCard.tsx:16` pass the correct `alt={product.name}`; `components/FitFinder.tsx:253` (fit-result gallery strip) and `cart/page.tsx:34` (cart thumbnail) pass `alt=""`.

### Styling — `src/app/globals.css`
Tailwind v4 `@theme inline`. Tokens: `--ink #0a0a0a`, `--panel #141210`, `--panel-2 #1c1916`,
`--gold #d4af37`, `--gold-dim #8c7853`, `--line rgba(212,175,55,.22)`, `--muted rgba(255,255,255,.55)`.
Fonts: Oswald / Inter / JetBrains Mono via `next/font/google` (needs network at build time).
Dark-only theme. Utility classes used across pages: `font-display`, `font-mono`, `text-gold`,
`text-gold-dim`, `text-muted`, `border-line`, `bg-panel`, `bg-panel-2`.

---

## 5. Data and libraries (all static TypeScript — no database)

| File | Contents |
|---|---|
| `src/data/cars.ts` | `BRANDS` — **33 brand entries** (32 makes + `"Other"`): 23 `available: true`, 10 `available: false` (GAC, Changan, Chery, Geely, MG, Haval, JAC, Jetour, BYD, Foton). 8 brands are `tier: "premium"` (Lexus, Acura, Infiniti, Mercedes-Benz, BMW, Audi, Land Rover, Volvo). One model-level flag: Acura `MDX` is `available: false`. **213 selectable models** excluding `"Other"`. `FLAT_CARS` is derived and **excludes `"Other"`** (so the "Enter model on WhatsApp" row is unreachable in search). `POPULAR_CARS` = 8 `[brand, model]` pairs. Helpers `nameOf`, `isModelAvailable`. **Net effect: 173 models × 27 model years (2000–2026) = 4,671 combinations for which the app currently answers "FIT ✓" with no fitment data behind any of them.** |
| `src/data/products.ts` | `CATEGORIES` (5: floor-mats, seat-covers, bundles, cargo-liners, exterior). `PRODUCTS` (7) each with `slug, name, categorySlug, rowApplicable, regular, premium, threeRowSurcharge?, note, images[]`. Helpers `getProductBySlug`, `getCategoryBySlug`, `priceRange` (`[regular, premium + threeRowSurcharge]`). |
| `src/data/locations.ts` | 4 zones with `eta` + `fee`: Lagos Mainland & Island ₦9,000/24–48h; Abuja ₦6,000/3–5d; PH–Owerri–Calabar–Warri–Benin ₦12,000/3–5d; Other State ₦12,000/5–7d. `WHATSAPP_NUMBER = "2347049621694"`. |
| `src/lib/pricing.ts` | `fmtNaira(n)` → `₦` + `en-NG` grouped. `productBase(product, tier, rows)` adds `threeRowSurcharge` when `rows === "3"`. |
| `src/lib/validation.ts` | `validateNGPhone(raw)` — 11-digit local starting `0` (prefixes 70/80/81/90/91) or 13-digit `234…`. |
| `src/lib/whatsapp.ts` | `buildOrderMessage(input, preview)` (itemised, emoji, payment line), `whatsappLink(msg)`, `comingSoonMessage(what, phone?)`, `notFoundMessage(query)`. **Deep links only — no Cloud API, no send, no webhook.** |
| `src/store/cart.ts` | Zustand + `persist`, key `luxeride-cart`. `CartItem { id, productSlug, productName, brand, model, year, rows, unitPrice, qty, image? }`. `addItem` always pushes a new row (**no dedupe/merge**), `removeItem`, `setQty` (min 1), `clear`, `subtotal()`, `count()`. |
| `src/store/order.ts` | Zustand + `persist`, key `luxeride-last-order`. Holds `lastOrder: PlacedOrder \| null` **only** — no order history, no server copy. |

---

## 6. Database layer — declared, never wired

`prisma/schema.prisma` defines `Category`, `Product`, `Car`, `CarModelFlag`, `Location`, `Order`,
`OrderItem` (Postgres, `uuid()` ids, `String[] images`, `OrderItem.rows String?`).

- **No `prisma/migrations/` directory** — the schema has never been applied.
- `.env` `DATABASE_URL` is a literal placeholder (`postgresql://user:pass@l…`).
- **No Postgres is installed on this machine.** The environment decision is a local native cluster for
  development only — a hosted provider is still owed later — recorded in `commerce-backend/design.md`
  § Decisions, Decision 1 (2 October 2026). Nothing else in this section changes because of it: no
  file under `src/` reads this database yet.
- **Nothing under `src/` imports `@prisma/client`.** No Prisma client singleton.
- `prisma/seed.ts` upserts 5 categories, 7 products, 4 locations — but it does not compile, and its
  `db:seed` script cannot run (no `ts-node`).
- There are **no `route.ts` handlers and no server actions** anywhere in `src/`.

---

## 7. Assets — what exists vs what the app points at

`src/data/products.ts` references 21 image paths under `/products/`. `public/products/` contains
**only 6 files**: `single-layer.svg`, `single-layer-texture.svg`, `single-layer-fit.svg`,
`double-layer.svg`, `double-layer-texture.svg`, `double-layer-fit.svg` — all watermarked placeholders.

**The other 15 paths do not exist** (Seat Covers, Full Bundle, Cargo Liner, Mud Flaps, Sun Shade).
Because `SafeImage` renders `null` on error, those 5 products render **an empty grey box on their
card and an empty strip on their PDP** — a broken-looking storefront for paid traffic.

`next.config.ts` sets `images.dangerouslyAllowSVG: true` (needed only for the placeholders).

Raw media that exists **outside** the app (see §1): 3 large photos and 8 long landscape clips,
plus 2 voiceover projects. None of it is processed, cropped, compressed or served yet.

---

## 8. The prototype (`luxeride-funnel (2).html`) — the validated funnel

Single-file funnel: `landing → car → year → product → row → location → results → checkout`
(+ `comingsoon`). Confirmed behaviours the app **already reproduces**: `CONFIG.BRANDS` /
`CONFIG.PRODUCTS` / `CONFIG.LOCATIONS` shape, car search + popular chips, row surcharge, tier pricing,
phone validation, POD vs prepay maths (₦2,000 + free shipping), WhatsApp message builder, negotiate
offer, live-photos request, coming-soon notify, `onerror` image hiding.

**Behaviours the app does NOT reproduce (verified by side-by-side reading):**

| # | Prototype behaviour | App status |
|---|---|---|
| 1 | Step 5 `view-location` — "Where should we deliver?" with zone fee + ETA in the funnel, **before** results | ❌ gone; zone is chosen at checkout instead |
| 2 | Results price = `productBase + location.fee` (delivery included in the number shown) | ❌ results price is product-only |
| 3 | Results card shows `Delivery zone` + `Estimated arrival` rows | ❌ absent |
| 4 | `PRICE LOCKED FOR 48 HOURS FROM CONFIRMATION` urgency line | ❌ absent |
| 5 | Spill badges `💧 Waterproof` `🚫 Mud-Resistant` `☕ Wipes Clean in Seconds` | ❌ absent |
| 6 | Sticky bottom CTA `Continue to Checkout →` on results | ❌ absent (app has inline Add to Cart only) |
| 7 | Results sub-copy "Confirmed by our configurator, verified on WhatsApp before dispatch" | ⚠️ app says "100% precision-molded … in stock for your …" |
| 8 | Checkout `Copy message` button (`navigator.clipboard`) | ❌ absent |
| 9 | Checkout `← Back to your fit` | ❌ absent |
| 10 | `CONFIG.PRODUCT_LANDING` campaign slugs (`mats`, `single-layer`, `seat-covers`, `bundle`) that **locked the product *and* rewrote the landing headline + sub** | ⚠️ partially lost: the app accepts product *slugs* (`double-layer-mats`), has **no landing hero on `/fit-finder` at all**, and old ad URLs like `?product=mats` would silently do nothing |
| 11 | Negotiate/offer message included the delivery zone | ⚠️ app omits zone from the offer message |

---

## 9. Source doc C — `luxeride-fitment-engine-admin-layout-grouping-spec.md`

The governing document for fitment truth. Key content, in brief (read the file itself for the full text):

- **The unit of stock/photography/sale is the LAYOUT (a real floor pan), not the car.** Images, price,
  notes and stock attach to the **layout**; vehicle records are names mapped onto it.
- Entities: **Layout** (internal code, customer name, body type, drive side, status, evidence source),
  **Vehicle** (make/model/yearFrom/yearTo/generation/aliases/body type), **Mapping** (layoutId+vehicleId,
  confidence, evidence note, confirmed by, date), **Variant** (single/double layer, boot liner, full set
  — price + stock), **ImageSet** (per layout, per angle: driver/passenger/rear/boot/detail/comparison),
  **Exclusion** (known non-fits with reason).
- **Naming:** internal code `TC-2009-2013` for admin/SKUs/refs; customer name "Toyota Corolla 2009–2013".
- **Front-end contract:** `POST /fit-check` with `{ make, model, year }` → exactly three states —
  **FITTED** (layout name, variants + `priceFrom`, imageSet, lead time, WhatsApp link carrying the ref),
  **NOT STOCKED** (honest no + demand-log entry + optional waitlist), **UNKNOWN** (route to WhatsApp).
  **All three return a WhatsApp link.**
- **Evidence rule:** a layout may be Live only with (a) a physical confirmed fitting, (b) written
  supplier confirmation, or (c) a verified OEM floor-pan match. Everything else stays **Inferred** and
  off the front end.
- **Admin MVP screens:** vehicles list (unmapped/mapped/excluded + counts), grouping view
  (multi-select → create/split layout), layout detail (images, variants, prices, mapped vehicles,
  confidence, publish toggle), exclusions, demand log, audit log.
- **Conflict guard:** refuse to merge vehicles already on different live layouts. **Split layout is a
  first-class action.**
- **Edge cases** (facelifts, same name/different generation, tokunbo imports, trim differences,
  boot liners needing their own mapping, body variants, cross-brand platform sharing): read the table.
- **Phasing:** P0 master sheet (zero build) → P1 admin CRUD+grouping+publish → P2 `/fit-check` →
  P3 image manager → P4 demand-log analytics → P5 supplier import.
- **🔒 LOCKED DECISIONS, Fri 2 Oct 2026:** (1) owner-only editing, single admin — *no* roles/permissions;
  (2) front end shows **Confirmed only** — Inferred is invisible to `/fit-check`; (3) **price on the
  site**, attached to the layout variant as `priceFrom`; (4) **one layout = one make** (required
  singular `makeId`; cross-brand matches become two cross-referenced layouts).
- Consequences the doc draws from those decisions — all of these are requirements, not commentary:
  a mandatory short `confirmationNote` + `confirmedOn` on the Confirmed gate; **the demand log must work
  from day one even in P0**; refusal copy is first-class front-end copy and must carry a waitlist if it
  promises future stock; ad targeting should favour cars already Confirmed (broad targeting into a
  mostly-refusing fit-check is a demand-mapping exercise, decide which before spending); the Confirmed
  layout count at launch is a launch metric; price must be a figure the engine can honour (state range
  or "from" rather than a number the WhatsApp quote contradicts).
- Still open: exact-price vs range presentation; whether the refusal carries a waitlist; the Confirmed
  layout count at launch.

---

## 10. Source doc A — `luxeride-architecture-plan.md`

Ports the prototype's `CONFIG` objects into `Category` / `Product` / `Car` / `CarModelFlag` /
`Location` / `Order` / `OrderItem` rows, defines the site map (`/`, `/shop`, `/shop/[category]`,
`/products/[slug]`, `/fit-finder`, `/cart`, `/checkout`, `/order/[id]`) and the phasing: scaffold →
storefront → checkout+Paystack → WhatsApp engine → admin. Open items it asks the owner to confirm:
Supabase vs self-hosted Postgres/Neon (**decided 2 October 2026 — a local native Postgres for
development; the hosted promotion is still owed. See `commerce-backend/design.md` § Decisions,
Decision 1**), and a Paystack **test** key (not needed until Phase 3).

---

## 11. Cross-cutting gaps (verified absent from the whole app)

Analytics/pixels/GTM of any kind · UTM or campaign capture · consent banner · `sitemap.ts` / `robots.ts`
· `not-found.tsx` / `error.tsx` / `loading.tsx` · per-page `metadata` or `generateMetadata` (only
`src/app/layout.tsx` exports a single global title/description) · `openGraph` / `twitter` tags /
`og:image` · JSON-LD structured data · breadcrumbs · policies (privacy, terms, delivery, returns) ·
contact page · about page · FAQ · reviews or any social proof · site search · mobile navigation ·
wishlist · order history or order lookup · server-side order record · payments · WhatsApp Cloud API ·
admin console · fitment data of any kind · demand logging · tests · CI · git · a manifest or
`themeColor` · any social link · any persistent WhatsApp/call affordance (the **only** `wa.me` call
site in the whole app is inside `src/lib/whatsapp.ts:39`) · any announcement/utility bar carrying
delivery or guarantee information above the fold · a branded favicon or logo file (the only
`favicon.ico` dates from the initial scaffold).

---

## 11b. Known defects in existing code (verified — do not design around these, fix them)

| # | Defect | Evidence |
|---|---|---|
| **D1** | **Hydration mismatch on `/cart`, `/checkout`, `/order/confirmation`.** `zustand/persist` hydrates **synchronously** on the client (`node_modules/zustand/esm/middleware.mjs`: `createJSONStorage(() => window.localStorage)`, synchronous `toThenable` chain, `hydrate()` invoked at store creation), while on the server `window` is undefined so storage is undefined and the store stays empty. Server HTML says "Your cart is empty"; the client's first render already has items. `Header.tsx` guards against exactly this with `useHasMounted()`, but the guard was never applied to the pages that render the cart itself. | `src/store/cart.ts`, `src/store/order.ts`, `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/app/order/confirmation/page.tsx`, `src/components/Header.tsx:7-16` |
| **D2** | **The Prisma schema cannot represent the current pricing model.** `Product` stores one `basePrice` and a `tier`; the app prices from `product[brandTier]`, needing **two** prices per product (`regular`, `premium`) plus the **car's** tier. `seed.ts` writes `basePrice: p.regular` and `tier: "regular"` for all 7 products, so the premium price is lost outright. | `prisma/schema.prisma:18-34`, `prisma/seed.ts:43-65`, `src/lib/pricing.ts`, `src/data/cars.ts` |
| **D3** | `npm run db:seed` cannot execute (no `ts-node` dependency; the `--loader` fallback is rejected by modern Node), and the seed never populates `Car`/`CarModelFlag`. | `package.json`, `prisma/seed.ts` |
| **D4** | `README.md` states that `npx tsc --noEmit` and `npx eslint .` "both run clean" — false today (one `tsc` error) — and documents `npm run build && npm start` as working, which it is not. | `luxeride-web/README.md` |
| **D5** | Not a code defect: `platform/overlap-comparison.md` is stale and was incomplete — it never inspected `fit-finder/page.tsx` or `lib/whatsapp.ts` ("content not fully read") and it missed both the fabricated fit result and the broken build. Superseded by `00-RELEASE-READINESS-AUDIT.md` and by this file. | `platform/overlap-comparison.md` |
| **D6** | Empty `alt` on two of the four `SafeImage` call sites — `components/FitFinder.tsx:253` (fit-result gallery) and `cart/page.tsx:34` (cart thumbnail) pass `alt=""`, while `products/[slug]/page.tsx:24` and `ProductCard.tsx:16` pass `alt={product.name}` correctly. Interactive controls (qty ±, remove, back arrows, negotiate toggle) are also unlabelled buttons. | `src/components/FitFinder.tsx:253`, `src/app/cart/page.tsx:34` |
| **D7** | `images.dangerouslyAllowSVG: true` in `next.config.ts` exists only for the placeholder SVGs; remove it once real raster photography lands. | `next.config.ts:4-8` |

---

## 12. Spec-writing rules (strict — every author follows these)

**Files.** Write three files into `platform/.kiro/specs/<feature>/`:
`requirements.md`, `design.md`, `tasks.md`. Create no other files. **Do not modify anything outside
your own spec directory** — the app source is read-only for you.

**`requirements.md`**
```
# Requirements Document

## Introduction
<what this feature is, why it exists, what breaks without it>

## Requirements

### Requirement 1
**User Story:** As a <role>, I want <capability>, so that <benefit>.

#### Acceptance Criteria
1. WHEN <trigger> THEN THE SYSTEM SHALL <response>.
2. IF <precondition> THEN THE SYSTEM SHALL <response>.
```
Number criteria so tasks can cite them (`Requirement 3`, criteria `3.1`, `3.2`, …). Use EARS forms
(WHEN / IF / WHILE / WHERE / THE SYSTEM SHALL). Cover edge cases, empty states and failure paths
explicitly — LuxeRide's refusals and failures are product features, not exceptions.

**`design.md`**
```
# Design Document

## Overview
## Current State (verified)
## Architecture
## Components and Interfaces
## Data Models
## Error Handling
## Testing Strategy
## Open Questions
```
`## Current State (verified)` is mandatory and must list, with **real file paths**, exactly what
already exists and exactly what does not, for *this* feature. Use Mermaid diagrams where a flow or
entity graph genuinely helps. Surface real trade-offs and name the decision taken.

**`tasks.md`**
```
# Implementation Plan

## Status
<one line: DONE / PARTIAL / NOT STARTED, plus "n done, m remaining">

- [x] 1. <major component>
  - [x] 1.1 <sub-task naming the file it touches> _(P0)_
  - [ ] 1.2 <sub-task> _(P1)_
    - _Requirements: 2.1, 3.4_
```
Numbered checkbox hierarchy, **maximum two levels**. Every task names the file(s) it touches and ends
with a `_Requirements: N.N_` reference. Mark `- [x]` **only** for work you personally verified by
reading the code in this session — and append `_(verified: path/to/file.tsx)_` to those items so the
owner can check. Everything else is `- [ ]`. Tag each task `_(P0)_`, `_(P1)_` or `_(P2)_`.

**Priority meaning — use these definitions consistently.**

| Tag | Meaning |
|---|---|
| **P0** | Blocks going live or blocks running paid traffic this week. The storefront is broken, dishonest, unmeasurable, or undeployable without it. |
| **P1** | Required in the first two weeks of trading (real orders, real money, real customers). |
| **P2** | Valuable once there is volume; do not build before P1 is done. |

**Hard rules for every author.**
1. **Never invent a fact about the codebase.** Every file path, function name, config key, route or
   library behaviour you assert must come from a file you opened in this session. If you need to know
   how a Next.js 16 API behaves, read `node_modules/next/dist/docs/` and say which guide you used.
2. **The docs win over your instincts.** Where doc A, B or C conflicts with what a normal e-commerce
   build would do, follow the docs and flag the conflict.
3. **No placeholder prose.** No "leverage synergies", no generic best-practice lists. Every paragraph
   should be checkable against this repo.
4. **Coding tasks only.** No marketing, hiring, sourcing, photography or pricing-policy tasks in
   `tasks.md`. Where a human decision is genuinely required, put it in `## Open Questions` in
   `design.md` instead.
5. **Respect the locked decisions** in §9 (owner-only admin; Confirmed-only front end; price on site
   as `priceFrom`; one layout = one make) in every design you touch.
6. Whenever you specify a new route, name the file that will implement it (`src/app/.../page.tsx`,
   `src/app/api/.../route.ts`) and state whether it is a Server Component, Client Component, server
   action or route handler — and why.
7. **Do not design as if the DB exists.** It does not. If your feature needs persistence, say which
   spec delivers it (`commerce-backend`) and what the interim P0 behaviour is without it.
8. Assume the owner wants to **run ads today**: an honest, measurable, fast, trust-building storefront
   outranks architectural elegance. Say what the minimum viable honest version of your feature is.
