# Design Document

## Overview

This spec gives LuxeRide a real database and the server-side order write that every other
persistence-dependent spec assumes exists. It delivers six things: a build that exits zero, a
provisioned Postgres with a checked-in migration history, a seed derived from `src/data` rather than
duplicated from it, a Prisma client singleton that survives Next dev HMR, a server action that writes
an order and its lines atomically and idempotently, and a shared validation layer that both the
checkout client and that action import.

The hard part is not the plumbing. It is that **two already-written documents describe the same
business with incompatible data models**, and the storefront has to keep trading while one of them
wins. `luxeride-architecture-plan.md` §3 models a car as `Car { brand, model, tier, available }` and
prices a product by the car's **brand-level tier**. `luxeride-fitment-engine-admin-layout-grouping-spec.md`
models the sellable unit as a **Layout** (a real floor pan) with **Variants** carrying `priceFrom`,
where vehicles are only names mapped onto it. These cannot both be the schema. The reconciliation is
the substance of this design and it is set out in full under **Data Models**; `fitment-engine` remains
authoritative for the fitment model and this spec reconciles *toward* it.

**Guides read before specifying anything Next- or Prisma-shaped** (required by `_CONTEXT.md` §12
hard rule 1):

| Guide | File read | What it fixed |
| --- | --- | --- |
| Mutating data (Server Functions) | `luxeride-web/node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` | `'use server'` at file top; actions are invoked via `<form action>`; `useActionState` gives a `pending` boolean; `redirect()` throws so code after it never runs |
| Server Actions and Mutations | `.../02-guides/server-actions.md` | "the route is reachable to anyone who can send the same POST. Treat every action as an untrusted entry point"; framework gives a CSRF `Origin`/`Host` check, a 1 MB body cap and encrypted action IDs; **the client dispatches actions one at a time**, so a double-click is two real sequential POSTs; "shape return values to what the UI renders, not raw database records" |
| Route Handlers | `.../01-getting-started/15-route-handlers.md` | Read to decide *against* a route handler here; confirms `route.ts` cannot sit beside `page.tsx` |
| Environment Variables | `.../02-guides/environment-variables.md` | Non-`NEXT_PUBLIC_` vars are Node-only; `NEXT_PUBLIC_` ones are **inlined into the browser bundle at build time**; load order `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env` |
| Prisma CLI (`migrate`, `db seed`, `dev`) | `node_modules/prisma/build/index.js --help`, and the `Wy()` seed resolver in that bundle | `prisma db seed` reads the seed command from **`package.json#prisma.seed`** via `loadConfigFromPackageJson`; `prisma dev` exists but needs a network install |
| Prisma client | `node_modules/.prisma/client/index.js` | The client is the **un-generated stub** — `PrismaClient` throws until `prisma generate` runs |
| Node runtime probes | Node **v22.23.1**, live | Native TS type stripping works; explicit `.ts` specifiers are required; `import type` is elided; `tsc` needs `allowImportingTsExtensions` for the same specifiers |

**Two honest limits on this sourcing.** (1) The Prisma singleton guidance in **Components and
Interfaces** below is *not* vendored in this repo — the shipped `prisma/README.md` and
`@prisma/client/README.md` contain no singleton guidance, and the Next 16 guides contain no Prisma,
connection-pool or singleton content at all. It is Prisma's published Next.js pattern, cited from
knowledge, and labelled as such where used. (2) No `prisma/migrations/` directory exists, so every
statement about migration behaviour is CLI behaviour I read from the installed bundle, not from
applied history.

---

## Current State (verified)

### Exists

| Thing | Path | Note |
| --- | --- | --- |
| Eight-model schema, never applied | `luxeride-web/prisma/schema.prisma` | `Category`, `Product`, `Car`, `CarModelFlag`, `Location`, `Order`, `OrderItem` — plus `Product.basePrice Int` with no premium column, and `Product.tier String` which nothing reads |
| A seed that does not compile and cannot run | `luxeride-web/prisma/seed.ts` | Line 2 imports `"./data/products"`; line 2's own comment says it is "Not directly importable". Upserts 5 categories, 7 products, 4 locations; never touches `Car`/`CarModelFlag` despite importing `BRANDS` |
| An unusable seed script | `luxeride-web/package.json:10` | `npx ts-node … \|\| node --loader ts-node/esm`; `ts-node` is not a dependency |
| Placeholder credentials | `luxeride-web/.env` | `DATABASE_URL="postgresql://user:pass@localhost:5432/luxeride"` |
| `include` covering `prisma/**` | `luxeride-web/tsconfig.json:25-32` | `**/*.ts`, `**/*.tsx` and already `**/*.mts` — this is why one bad import in `prisma/` fails the production build |
| An un-generated Prisma client | `node_modules/.prisma/client/index.js` | Constructor throws "did not initialize yet" |
| Client-computed pricing | `luxeride-web/src/lib/pricing.ts:9-14` | `productBase(product, tier, rows)` — `tier` arrives from `BRANDS[brand].tier`, so tier is a **car** property |
| Phone validation worth reusing | `luxeride-web/src/lib/validation.ts` | `validateNGPhone` |
| An order that exists only in the browser | `luxeride-web/src/store/order.ts:7-21`, `luxeride-web/src/app/checkout/page.tsx` | `PlacedOrder` carries `subtotal`, `shippingFee`, `discount`, `total` — **none of which exist as columns in `schema.prisma`** |
| The confirmation page reading `localStorage` | `luxeride-web/src/app/order/confirmation/page.tsx` | Shows "No recent order found" when storage is empty |
| 212 recognised brand/model pairs, 33 brands | `luxeride-web/src/data/cars.ts` | 8 premium brands; `FLAT_CARS` excludes `"Other"`; one model-level exception (Acura `MDX`) |

### Does not exist

`prisma/migrations/` · `src/lib/db.ts` · any `route.ts` · any `"use server"` file · any import of
`@prisma/client` under `src/` · any server-side price, order or validation logic · any
`server-only` package (only `client-only` is present) · `.env.local` · `.env.example` · a git
repository · CI · a test runner.

---

## Architecture

```mermaid
flowchart TD
    subgraph Client["Browser — unchanged until cart-checkout switches it over"]
        CC["/checkout (Client Component)<br/>uses CartItem.unitPrice from the client"]
    end

    subgraph Server["Next.js server"]
        ACT["createOrder() — Server Action<br/>src/app/checkout/actions.ts ('use server')"]
        VAL["validateOrderSubmission()<br/>src/lib/order-validation.ts"]
        PRICE["priceLine()<br/>src/lib/order-pricing.ts"]
        DB["prisma singleton<br/>src/lib/db.ts (globalThis-cached)"]
    end

    DB --> PG[("Postgres<br/>migration 1: commerce + recognition")]
    PG -. "migration 2: nullable layout cols" .-> PG2[("fitment tables — fitment-engine")]

    CC -- "no network call today" -.->|"unchanged"| WA["wa.me deep link"]
    CC -- "after cart-checkout" -->|"POST (action)"| ACT
    ACT --> VAL
    VAL --> PRICE
    PRICE --> DB
    ACT -->|"returns authoritative ref + totals"| CC
```

**Why a Server Action and not a route handler.** The Next 16 Server Actions guide is explicit that an
action is POST-only, CSRF-checked (`Origin` against `Host`), capped at 1 MB, and carries an encrypted
action ID with unreferenced actions stripped from client bundles — so there is no public endpoint to
probe. The guide is equally explicit that none of that is a substitute for validating inside the
action, which this design does. A route handler would buy a URL, a content type and a response-shape
contract the checkout form does not need.

> **Correction to a sibling cross-reference.** `fitment-engine/design.md` (Open Question 6) cites
> "`commerce-backend`'s `/api/checkout`" as an existing convention. There is no such route and this
> spec creates none. Order creation is the Server Action `createOrder`. `payments-paystack` and
> `whatsapp-engine` will each need their own `route.ts` for their webhooks; those belong to those
> specs, not here.

**The P0 shape.** `Make`, `Vehicle`, `Product`, `Category`, `Location`, `Order`, `OrderItem` — seven
tables, no fitment tables. The storefront trades against exactly what it trades against today, except
that prices are re-derived on the server and orders persist. That is the whole of P0.

---

## Components and Interfaces

### `src/lib/db.ts` — the Prisma singleton

One `PrismaClient` per process, cached on `globalThis`, re-assigned only outside production:

```ts
import 'server-only';
import { PrismaClient } from '@prisma/client';
import { assertDatabaseConfigured } from '@/lib/env';

assertDatabaseConfigured(); // throws on a missing or placeholder DATABASE_URL

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

The reason for `globalThis` is Next dev HMR: the module is re-evaluated on every edit, and a plain
module-level `new PrismaClient()` opens a fresh connection pool each time until Postgres refuses new
connections. **Sourcing caveat, restated because it matters:** this pattern is Prisma's published
Next.js guidance. It is *not* in `node_modules/prisma/README.md` or
`node_modules/@prisma/client/README.md` (grep for `singleton|globalThis|next.js|dev mode|HMR` returns
nothing), and the Next 16 guides contain no Prisma or connection-pool content (grep across
`node_modules/next/dist/docs/01-app/02-guides/` returns nothing). What *is* verified locally is that
`PrismaClient` exists, that it is currently the un-generated stub, and that `server-only` is not
installed and must be added.

`import 'server-only'` is the build-time half of secret handling: importing this module from a Client
Component becomes a build error rather than a leaked connection string.

### `src/lib/order-validation.ts` — the shared validation layer

One module, imported by **both** `src/app/checkout/page.tsx` and `createOrder`. It narrows and bounds
everything: name length, `validateNGPhone` (reused unchanged from `src/lib/validation.ts`), address
length, delivery-zone membership, `paymentMethod ∈ {pod, prepay}`, `rows ∈ {"2","3",null}`, per-line
`qty ∈ [1,99]`, and a maximum line count. It **rejects and never clamps** — a silently corrected
quantity is how a wrong order becomes a real order. Server validation is unconditional; the UI's checks
are a courtesy, and the Server Actions guide is explicit that render-time gating "is not a security
boundary".

### `src/lib/order-pricing.ts` — server-side price revalidation

The client sends `CartItem.unitPrice`. This module **ignores it**. For each line it loads the
`Product` and the `Make`, and recomputes:

```
tier     = make.defaultTier            // "regular" | "premium"
unit     = tier === "premium" ? product.premium : product.regular
if (product.rowApplicable && rows === "3") unit += product.threeRowSurcharge ?? 0
```

This is deliberately the same rule as `productBase()` in `src/lib/pricing.ts:9-14`, moved to the
server — including its quirk that the surcharge applies **only** when `rowApplicable` is true, which
answers the "row selection supplied for a non-row product" case by ignoring it rather than charging.

The delivery fee comes from the `Location` row, never from the client. The authoritative `total` is
persisted and returned, so a customer who was shown a stale figure sees the server's number before
paying. Every `OrderItem` stores the computed `unitPrice` and `lineTotal`; nothing re-derives them
later.

### `src/app/checkout/actions.ts` — `createOrder`

```ts
'use server';

export async function createOrder(input: unknown): Promise<CreateOrderResult> { … }
```

One `prisma.$transaction(async (tx) => { … })` wraps the `Order` and every `OrderItem`. A nested
`order.create({ data: { items: { create: [...] } } })` would also be atomic, but the interactive
transaction is required because the idempotency check has to live inside the same unit of work as the
insert.

**Idempotency.** `Order.idempotencyKey String? @unique`. The client mints one `crypto.randomUUID()`
before the first submit and reuses it on every retry. A unique violation is caught and the existing
order is re-read and returned. The Server Actions guide states the client dispatches actions
**sequentially**, so a double-click is two genuine sequential POSTs and the second one reaches the
server. A disabled button is a UX affordance; the unique constraint is the guard.

**Return shape.** `{ ok: true, reference, total }` or `{ ok: false, fieldErrors }`. Shaped to what the
UI renders — the guide's rule — so no database record is serialized to the client.

**Failure policy.** If the write fails for any reason, the action logs server-side and returns a
result that still lets `/checkout` open the prebuilt WhatsApp message. The customer never loses the
order because the database is down: WhatsApp is the actual channel, and the order row is the record,
not the transaction of sale.

### `Order` columns `cart-checkout` needs

`cart-checkout` cannot render a confirmation page from nothing. Seven columns ship with the order so
the page has a database to read:

| Column | Type | Why |
| --- | --- | --- |
| `reference` | `String @unique` | `LR-` + 10 Crockford base32 chars from the order UUID; the customer-facing handle. Replaces the client-minted `LR-<base36>` |
| `subtotal` | `Int` | Sum of line totals |
| `shippingFee` | `Int` | Snapshot of `Location.fee` **as charged** |
| `locationName` | `String` | Snapshot of the zone name, so a later fee change cannot rewrite the record |
| `locationEta` | `String?` | Snapshot of `Location.etaText`; the prototype showed ETA next to the fee and the app dropped it |
| `discount` | `Int @default(0)` | The ₦2,000 prepay discount |
| `total` | `Int` | Authoritative server figure |

Plus seven attribution columns reserved now and populated opportunistically from whatever is already
on the request — `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `referrer`,
`landingPath` — so no order row ever needs backfilling. `ad-landing-and-tracking` owns the taxonomy and
the landing pages; this spec only reserves the columns. `whatsappMessage` is stored too, so the exact
text the customer sent is recoverable.

---

## Data Models

### The two models that collide

| | Architecture plan §3 | Fitment spec (source doc C) |
| --- | --- | --- |
| What a car is | `Car { brand, model, tier, available }`, no year | `Vehicle { make, model, yearFrom, yearTo, generation, aliases }` |
| What is sold | `Product` (7 rows) | `Variant` — single/double layer, boot liner, full set |
| What carries the photos and price | `Product.images[]`, `Product.basePrice` | `Layout` — *"Images, price, notes and stock status attach to the layout"* |
| Price | `product[brandTier]` via `productBase()` | `LayoutVariant.priceFrom` (locked decision 3) |
| Availability | `available: boolean` per brand, plus one model flag | `status: draft \| inferred \| confirmed \| retired` per layout, plus `Exclusion` rows |

Three incompatibilities, in increasing severity.

**(a) Identity.** `Car` has no year dimension whatsoever — `FLAT_CARS` is 212 brand/model pairs and
nothing more. `Vehicle` is year-ranged, and the fitment spec is emphatic that a span must never cross a
generation line. "Corolla 2009–2013" and "Corolla 2014–2019" are **one `Car` row today and two
different sellable products** in the target model. `Vehicle` cannot be derived from `Car` without a
year-splitting judgement that the data does not contain and this spec is not entitled to make.

**(b) Price locus — and this is where the money is.** Today the **product** carries two prices and
the **car** selects between them: `product[BRANDS[brand].tier]`. In the target model the price belongs
to the layout's variant and travels with it. These are inverted, not merely differently shaped.

The schema cannot currently express today's pricing at all. `Product` has `basePrice Int` and no
premium column, and `prisma/seed.ts:50` and `:59` both write `basePrice: p.regular`. So **the premium
price is discarded on every seed for all seven products.** Eight of the 33 brands in `src/data/cars.ts`
are `premium` — Lexus, Acura, Infiniti, Mercedes-Benz, BMW, Audi, Land Rover, Volvo. The arithmetic:

| Product | regular (what gets stored) | premium (what should be charged) | Undercharge |
| --- | --- | --- | --- |
| Double Layer Mats | ₦68,000 | ₦82,000 | ₦14,000 |
| Single Layer Mats | ₦45,000 | ₦58,000 | ₦13,000 |
| Full Bundle | ₦110,000 | ₦135,000 | ₦25,000 |
| Seat Covers | ₦52,000 | ₦65,000 | ₦13,000 |

This is defect **D2**, already named in `fitment-engine/design.md`. It is invisible today only because
nothing reads the database. **The first time server-side price revalidation is built on the current
schema, every premium-brand order is undercharged.** Fixing it is P0, and it is why `Product` grows
`regular` and `premium` columns in this spec rather than inheriting `basePrice`.

`Product.tier String // "regular" | "premium"` goes further and is simply a category error: tier is a
property of the car's **brand** — `productBase()` takes it from `BRANDS[brand].tier` — so the column is
never read by any code path. It is dropped.

**(c) Availability.** A per-brand boolean cannot express the fitment spec's four-state gate, its
mandatory `confirmationNote` + `confirmedOn`, or its `Exclusion` records. `available: true` is an
unearned "yes" that `/fit-finder` currently prints as `FIT ✓` for any year at all.

### What survives, what is superseded

| Today | Becomes | Rule |
| --- | --- | --- |
| `Category` (`schema.prisma:10-16`) | **survives**, gains `blurb` | `blurb` is in `src/data/products.ts:22` today but has no column and is never seeded |
| `Product` (18-34) | **survives**, `basePrice`→`regular`+`premium`, `tier` dropped, gains `updatedAt` | catalogue identity — what kind of thing is this |
| `Product.images String[]` | **survives** | catalogue axis — powers `/shop` and the PDP strip. `ImageSet` is the fit-level axis; both exist |
| `Location` (55-62) | **survives**, gains `slug` | delivery zone is orthogonal to fitment |
| `Car` (36-46) | **superseded** by `Make` + `Vehicle` | a car name is not a sellable row |
| `Car.tier` / `Brand.tier` | **demoted** to `Make.defaultTier` — a seed default, never the pricing authority | see below |
| `Car.available` | **superseded** by `Vehicle.status` + mapping existence | |
| `CarModelFlag` (48-53) | **superseded** by `Vehicle.status: "excluded"` | the Acura `MDX` case |
| `Order` (64-78) | **survives**, gains reference, money breakdown, idempotency key, UTM columns, `updatedAt` | |
| `OrderItem` (80-95) | **survives**, `carId`→`vehicleId`, gains nullable `layoutId`/`layoutVariantId`, four snapshots, `lineTotal` | |

**On `Make.defaultTier`.** The brand-level tier does not die; it changes job. It is the value the seed
writes into `LayoutVariant.priceFrom` the **first** time a layout is created, so the owner's existing
price discipline is preserved rather than retyped 25 times by hand. The moment a `LayoutVariant` row
exists, its own `priceFrom` is authoritative and `defaultTier` is not consulted at all. That is how
locked decision 3 is satisfied without discarding what the owner already decided.

**On `Car` / `CarModelFlag` and the "migrate, don't drop" rule.** There is no database and no
`prisma/migrations/`, so these tables were never created and there are **zero rows** to migrate. The
tables are simply never declared. Nothing is lost because nothing existed.

### The reconciled model

```mermaid
erDiagram
    MAKE ||--o{ VEHICLE : "has"
    MAKE ||--o{ LAYOUT : "one make per layout (decision 4)"
    CATEGORY ||--o{ PRODUCT : "has"
    PRODUCT ||--o{ LAYOUT_VARIANT : "keys variant to catalogue"
    LAYOUT ||--o{ LAYOUT_VARIANT : "stocks what is sold"
    LAYOUT ||--o{ IMAGE_SET : "is photographed by"
    LAYOUT ||--o{ MAPPING : "receives"
    VEHICLE ||--o{ MAPPING : "is mapped by"
    VEHICLE ||--o| EXCLUSION : "is excluded as"
    LAYOUT ||--o{ ORDER_ITEM : "is ordered as"
    LAYOUT_VARIANT ||--o{ ORDER_ITEM : "is ordered as"
    LOCATION ||--o{ ORDER : "is delivered to"
    ORDER ||--|{ ORDER_ITEM : "contains"
    PRODUCT ||--o{ ORDER_ITEM : "is sold as"
    VEHICLE ||--o{ ORDER_ITEM : "is bought for"

    MAKE {
        string id PK
        string name UK "Toyota, Mercedes-Benz"
        string defaultTier "regular|premium - SEED DEFAULT ONLY"
        string note "the Other catch-all"
        bool isSearchable "false for Other"
    }
    VEHICLE {
        string id PK
        string makeId FK
        string model
        string sourceKey UK "Toyota::Camry - seed upsert key"
        int yearFrom "null in P0 - no year dimension exists"
        int yearTo "null in P0"
        string generation
        string aliases "array"
        string bodyType
        bool facelift
        bool isPopular "8 POPULAR_CARS"
        string status "recognised|mapped|excluded"
    }
    CATEGORY {
        string id PK
        string slug UK
        string name
        string blurb "exists in src/data, no column today"
    }
    PRODUCT {
        string id PK
        string categoryId FK
        string slug UK
        string name
        string note
        bool rowApplicable
        int regular "D2 - was basePrice"
        int premium "D2 - column did not exist"
        int threeRowSurcharge
        string images "array - catalogue axis"
    }
    LOCATION {
        string id PK
        string slug UK
        string name UK
        int fee
        string etaText
    }
    ORDER {
        string id PK
        string reference UK "LR- + 10 Crockford base32"
        string idempotencyKey UK "double-submit guard"
        string customerName
        string phone "indexed - order lookup"
        string address
        string locationId FK
        string locationName "snapshot"
        string locationEta "snapshot"
        int shippingFee "snapshot"
        int subtotal
        int discount "prepay 2000"
        int total "authoritative"
        string paymentMethod "pod|prepay"
        string status "pending|... owned by siblings"
        string utmSource
        string utmMedium
        string utmCampaign
        string utmContent
        string utmTerm
        string referrer
        string landingPath
        string whatsappMessage
    }
    ORDER_ITEM {
        string id PK
        string orderId FK
        string productId FK
        string vehicleId FK "supersedes carId; nullable"
        string layoutId FK "NULL until fitment-engine lands"
        string layoutVariantId FK "NULL until fitment-engine lands"
        string brandSnapshot
        string modelSnapshot
        string yearSnapshot
        string rows "2 | 3 | null"
        int unitPrice "server-computed, frozen"
        int qty
        int lineTotal "frozen"
    }
    LAYOUT {
        string id PK
        string internalCode UK "TC-2009-2013"
        string customerName
        string makeId FK "REQUIRED, singular"
        string status "draft|inferred|confirmed|retired"
        string evidence
        string confirmationNote
        string confirmedOn
    }
    LAYOUT_VARIANT {
        string id PK
        string layoutId FK
        string productId FK "productSlug - Option B"
        string kind "single_layer|double_layer|boot_liner|full_set"
        int priceFrom "decision 3 - authoritative"
        int rowsSurcharge
        string stockState
    }
    MAPPING {
        string layoutId FK
        string vehicleId FK
        string confidence
        string evidenceNote
        string confirmedBy
        date confirmedOn
    }
    IMAGE_SET {
        string id PK
        string layoutId FK
        string angle
        string src
        string alt
    }
    EXCLUSION {
        string id PK
        string vehicleId FK
        string trim
        string reason
    }
```

Entities in grey (`LAYOUT`, `LAYOUT_VARIANT`, `MAPPING`, `IMAGE_SET`, `EXCLUSION`) are **not created by
this spec's migration 1**. They are shown because the reconciled model must be legible as a whole, and
because `OrderItem` carries nullable foreign keys into them from day one.

### Pricing: one rule, two eras

```
if (orderItem.layoutVariantId != null)
        unitPrice = layoutVariant.priceFrom + (rowsSurcharge when rows === "3")
else    unitPrice = make.defaultTier === "premium" ? product.premium : product.regular
                       + (product.threeRowSurcharge when rowApplicable && rows === "3")
```

Both branches are frozen onto `OrderItem.unitPrice` at write time and neither is ever re-derived.
That is what makes an order from March still correct after a layout is split or a price changes —
which is doc A §5's "a later price change never rewrites history on old orders", and it is why
`fitment-engine`'s split-and-retire flow can never corrupt an order.

### The `ProductSlug` union — coordinating with `fitment-engine`

`fitment-engine` took **Option B**: `LayoutVariant.productSlug` is an open reference into the
catalogue, with `kind` as a separate semantic axis. That choice hands this spec a hard
migration-ordering constraint, stated in `fitment-engine/design.md` as §19.7:

> it creates a foreign key from fitment to catalogue, so `Product` must exist in the database before
> `LayoutVariant` — a migration-ordering constraint handed to `commerce-backend`.

**Satisfied by shipping `Product` in migration 1 and no fitment tables at all.** By the time
`fitment-engine`'s migration runs, `Product.slug` exists and the foreign key is writable.

The second half of the coordination is the slug type. `fitment-engine` declares
`export type FitProductSlug = "single-layer-mats" | … ` as a hand-written union, and explains why:
`PRODUCTS` is typed `Product[]`, not a const tuple, so `typeof PRODUCTS[number]["slug"]` widens to
`string` and would catch nothing.

That reasoning transfers to this spec, and it has a consequence the fitment side cannot see. Once
`LayoutVariant` becomes a **table**, Prisma generates `productSlug: string` — the database will accept
any string that is not an existing slug, and a typo becomes a runtime foreign-key violation on an
admin save rather than a build error. So this spec publishes the union once, at
`src/lib/product-slug.ts`:

```ts
export type ProductSlug =
  | 'single-layer-mats' | 'double-layer-mats' | 'seat-covers'
  | 'full-bundle' | 'cargo-liner' | 'mud-flaps' | 'sun-shade';

export function assertProductSlugs(): void { /* throws if union ≠ PRODUCTS slugs */ }
```

**`fitment-engine` should import this instead of re-declaring `FitProductSlug`**, so there is exactly
one list, one drift check, and one place where the next product is added. Two hand-maintained unions
covering the same seven slugs is precisely the drift mechanism this spec is deleting from
`prisma/seed.ts`.

`kind` stays a separate axis exactly as `fitment-engine` decided — `full_set` may resolve to
`seat-covers` on one layout and `full-bundle` on another, because a floor pan physically fitted for
covers has not necessarily been fitted for a bundle.

### Staged migration — the storefront keeps trading throughout

| Stage | Ships | Contents | Storefront state |
| --- | --- | --- | --- |
| **1 — this spec, P0** | `init_commerce_model` | `Category`, `Product` (regular+premium), `Location`, `Make`, `Vehicle`, `Order`, `OrderItem`. **No fitment tables. No `Car`/`CarModelFlag`.** | Trading. Prices re-derived server-side, orders persisted. `/fit-finder` still resolves from `BRANDS` exactly as today |
| **2 — this spec, P1** | `add_layout_refs` | **Nullable columns only**: `OrderItem.layoutId`, `OrderItem.layoutVariantId`, `Order.updatedAt`, `Product.updatedAt`, remaining indexes | Unchanged. Nothing breaks while the fitment engine is still being built |
| **3 — `fitment-engine`, P1** | `add_fitment_tables` | `Layout`, `ImageSet`, `Mapping`, `LayoutVariant`, `Exclusion`, `DemandLog`, `AuditEntry`, then the FK from `OrderItem.layoutVariantId` | `/fit-check` reads confirmed layouts; order lines begin recording layout + variant |

The rule that makes staging work: **stage 2 adds no non-nullable reference and no foreign key into a
table that does not exist.** If `OrderItem.layoutId` were required, no order could be written until
stage 3, and the storefront would be dead for the whole duration of the fitment build.

**The interim P0 representation.** No synthetic layouts are created to stand in for missing fitment
data — fabricating `Layout` rows would manufacture exactly the unearned "yes" the fitment spec exists
to eliminate. Instead:

- `Vehicle` is seeded from `FLAT_CARS` with `yearFrom`/`yearTo` null and `status: "recognised"`. This
  212-row set is the **recognition vocabulary** — "we know this name, we may not stock it" — which is
  precisely what `NOT STOCKED` and the demand log need. It is not sellable inventory.
- `"Other"` is kept as a `Make` with `isSearchable: false`, preserving the "Enter model on WhatsApp"
  escape hatch that `FLAT_CARS` currently drops at `src/data/cars.ts:70`.
- An order placed before the engine records `vehicleId`, the four snapshots, and the indicative
  `unitPrice` computed by the brand-tier branch. `layoutId` and `layoutVariantId` are null.
- `Make.defaultTier` carries the price discipline into stage 3: creating a `LayoutVariant` for the
  first time seeds its `priceFrom` from `product[tier]`, so the owner never retypes a price.

---

## Error Handling

LuxeRide's failures are product features. Each row is a designed state.

| Condition | Response | Why |
| --- | --- | --- |
| `DATABASE_URL` missing or still the placeholder | throw at first import of `src/lib/db.ts` | a misconfigured deploy fails on a database call, not silently at build time |
| Unknown product slug or unknown brand in a submission | reject the **whole** order, per-field error | never default a price — a fallback price on a missing row is how a cart becomes an order nobody can price |
| Phone fails `validateNGPhone` | per-field error, nothing written | one rule, shared with the client |
| Delivery zone not found | per-field error | |
| Row selection supplied for a non-row-applicable product | **ignore the row selection**, charge no surcharge | matches `productBase()` exactly; a surcharge here would be invented |
| Recomputed total differs from what the customer was shown | persist and return the **server's** figure | the customer's view is not authoritative; the persisted order is |
| Repeated `idempotencyKey` | unique violation caught, existing order re-read and returned | a double-click is two real sequential POSTs — the Server Actions guide is explicit the client dispatches sequentially |
| Any line fails mid-transaction | whole transaction rolls back; zero `Order` and zero `OrderItem` rows | an order is never half-written |
| Reference matches but phone does not | identical "not found" response; nothing disclosed | do not confirm a reference exists |
| No reference matches | plain "Order not found" state, not an error | |
| **Database write fails entirely** | log server-side; still return a reference; `/checkout` still opens the prebuilt WhatsApp message | **WhatsApp is the real channel.** The order row is the record, not the transaction of sale |
| Migration fails partway | `prisma migrate deploy` refuses to continue until `prisma migrate resolve` states what happened | never half-apply silently |

### The rollback story, stated plainly

**There is no git repository.** `platform/` and `luxeride-web/` are untracked directories with no

> **CORRECTED 2026-10-03 — this project now HAS a git repository.** `git init -b main` at `platform/`
> happened in master plan M0.1, with a root `.gitignore` covering `node_modules`, `.next`, `.env.local`
> and the out-of-tree backup directory. Commits are on `main`. What follows was written before that and
> is preserved so the reasoning is not rewritten — but the specific claims that there is no `git revert`,
> no branch, no diff and no second recovery path are **no longer true for application code**.
>
> **What is still true, and is the reason the backup discipline stands:** there is **no remote**, so
> every commit is local to this machine. There is still no off-machine copy, no CI, and no history for
> the *data* — only for the code. A disk failure still loses everything.

`.git` anywhere, per `_CONTEXT.md` §1. This has three consequences that are easy to forget and
expensive to learn late:

1. **No application-code rollback.** There is no `git revert`, no branch, no stash, no diff. Every
   change to `src/` and `prisma/` is a single unrecoverable edit. `README.md`'s claim that
   `npx tsc --noEmit` and `npx eslint .` both run clean is already false (`_CONTEXT.md` §3), which is a
   small demonstration that documentation drifts here without anyone noticing.
2. **No schema rollback in production.** A migration is forward-only. The only responses to a bad
   migration are a forward-fix migration, or `prisma migrate reset` — which **destroys all data** and
   is a development-only operation. `prisma/migrations/` is the only record of schema history there
   is, and it must be treated as precious.
3. **`.gitignore` protects nothing.** It is a list of patterns with no repository enforcing them. The
   `.env.local` secret is protected only by the discipline of not committing it — which, today, is
   enforced by nothing at all.

Four further absences, each with its real consequence and its cheapest mitigation:

| Absent | Consequence | Cheapest mitigation |
| --- | --- | --- |
| **Automated or managed backup** | **Decision 1** provisions a local cluster, which ships no managed daily backups — and with no git either, one bad migration or a dropped table loses every order, permanently | a `pg_dump` on a schedule to a path outside the cluster, plus one restore drill (tasks 2.8–2.9), until a hosted provider replaces both with managed backups |
| **Rate limiting** on `createOrder` | unbounded order-row creation and unbounded `wa.me` opens from any caller. At launch volume this is tolerable; it is not at scale | per-IP and per-phone cap in front of the action |
| **Error monitoring** | a failed order is discovered when the customer complains, or never | `console.error` on every failed order plus a daily comparison of `Order` row count against WhatsApp message count |
| **CI** | `npm run build` is run by hand, by one person, under time pressure | at minimum a documented pre-deploy checklist |

---

## Testing Strategy

No test runner is installed — `package.json` has no `vitest` or `jest` — and adding one before the
storefront trades would be tooling ahead of need. Node **v22.23.1** ships `node:test` in core
(verified: `require('node:test')` resolves and `t.run` is a function), so the gate costs **zero new
dependencies**.

**Layer 1 — the build, which is the real gate.** `npm run build` exits 0 and `.next/BUILD_ID` exists.
That single check catches the entire class of defect that makes this repo's current state dangerous: a
type error in `prisma/` aborting a deployable app. It costs nothing and it runs every time.

**Layer 2 — the seed self-check, no runner needed.** The seed counts what it inserted (5 categories,
7 products, 4 locations, 33 makes, 212 vehicles) and exits non-zero if any count is short. The current
seed prints `"Seed complete."` at `prisma/seed.ts:83` regardless of outcome; that is the specific
dishonesty this replaces.

**Layer 3 — `node:test` over the database, P1.** `luxeride-web/tests/db.test.ts`, wired as
`"db:verify"`:

| Test | Asserts |
| --- | --- |
| `seed-idempotency` | two consecutive seed runs leave identical row counts |
| `premium-pricing` | a Lexus GX 470 double-layer order prices at `premium` (₦82,000), a Camry at `regular` (₦68,000) — **the D2 regression test** |
| `row-surcharge` | applied iff `rowApplicable` and `rows === "3"`; ignored otherwise |
| `atomicity` | a deliberately failing line leaves zero `Order` and zero `OrderItem` rows |
| `idempotency` | a repeated `idempotencyKey` yields exactly one order |
| `lookup-privacy` | correct reference + wrong phone returns the same response as an unknown reference |

There are no component and no end-to-end tests. The app has no `error.tsx`, `loading.tsx` or
`not-found.tsx` today and this spec does not introduce a testing stack to compensate for missing error
boundaries — the failure modes are enumerated in **Error Handling** and each has a designed state.

**The verification that is not a test.** After every migration, run `prisma migrate status` and read
it. With no CI and no version control, this is the only machine-checked statement about whether the
deployed database matches the schema.

---

## Decisions

Resolved by the owner. Each is a record, not a question, and each carries what it cost.

### Decision 1 — A local native Postgres, not a container and not a managed host

**Decided 2 October 2026, for development now; a hosted database comes later.** The development
database is PostgreSQL 16 installed from `apt` on the owner's own machine — Ubuntu 24.04 (`noble`),
x86_64 — running as the standard local cluster. This answers `luxeride-architecture-plan.md` §8, which
left "Supabase, Neon, or self-hosted" open.

**Why local native and not a container.** Nothing containerised is installed here — `docker.io` is
absent (apt candidate `29.1.3`) — so a containerised database means installing a runtime *and* writing
compose or podman configuration, to get one Postgres onto a single-developer workstation that gains
very little from the isolation. Native `pg_ctl` and `pg_dump` keep the whole operational story at two
commands, which matters more than usual here because that story is currently one line long. `brew` is
not an alternative either: this is Linux, not macOS.

**What this gives up.** Supabase and Neon both ship managed daily backups. A local cluster ships none.
That is the single thing traded away, and it is not a small thing given the next paragraph.

**What replaces it.** An explicit `pg_dump` discipline — a dump written on a schedule to a path
outside the cluster — and **one restore drill into a scratch database**, because a backup that has
never been restored is a hypothesis, not a backup. The weight on this is heavier than in a normal
project for one reason: **this project has no git repository.** There is no other recovery path for
anything, code or data, so a dropped table is not a bad afternoon, it is permanent.

**The setup, concretely.** Verified on this machine: PostgreSQL is **not installed** —
`apt-cache policy` candidates are `postgresql` → `16+257build1.1`, `postgresql-16` →
`16.15-0ubuntu0.24.04.1`, `postgresql-client` → `16+257build1.1` — and nothing is listening on 5432.
The install is the owner's step, not this spec's: `sudo` cannot run as root inside the agent sandbox
(the no-new-privileges flag is set), so the command is documented here rather than executed.

```bash
sudo apt-get update && sudo apt-get install -y postgresql postgresql-client
```

The Debian/Ubuntu packaging initialises the cluster during that install, so an explicit `initdb` is
needed only for a second, non-default cluster. Confirm it with `sudo pg_lsclusters`, start it with
`sudo systemctl start postgresql`, then create the role and database to match the shape already in
`luxeride-web/.env` — which today is a placeholder whose role, password and database do not exist:

```bash
sudo -u postgres psql -c "CREATE ROLE luxeride LOGIN PASSWORD '<one the owner chooses>';"
sudo -u postgres createdb -O luxeride luxeride
```

`luxeride-web/.env.local` then carries
`DATABASE_URL="postgresql://luxeride:<password>@localhost:5432/luxeride"` — the same shape as the
placeholder, with a real role behind it — and `prisma migrate dev` (tasks 2.5–2.6) creates the schema,
after which `prisma migrate status` is the only machine-checked statement of what the database
actually holds.

**Why this costs nothing later.** The schema is provider-agnostic —
`datasource db { provider = "postgresql" }` — so promoting to Neon, Supabase or any other host is a
single `DATABASE_URL` change in `.env.local` plus `prisma migrate deploy` against the hosted
database, never `migrate dev`. Managed daily backups arrive with that promotion. Until it happens the
`pg_dump` discipline above is the entire backup story, and the project is worse off than it would be
on a managed plan for exactly as long as the promotion is deferred.

---

## Open Questions

Each is an owner decision, not an engineering question. None blocks P0. The database host is no longer
one of them — that is Decision 1 above.

1. **Does `Make.defaultTier` survive into production data, or is it demoted to seed-time only once
   every sellable variant has a `priceFrom`?** The design treats it as a seed default that no
   production price path consults once a `LayoutVariant` exists. But `/shop` and the PDP still show
   `priceRange()` today, so something must keep rendering a price for products with no layout yet.
   The residual risk is two prices for one product — ₦45,000–₦97,000 on the PDP versus the layout's
   `priceFrom` on a fit result. `fitment-engine` raised this as its own Open Question 4 and assigned
   the PDP side to `storefront-catalog`. **This spec needs an answer only for the commerce path:** when
   a customer buys `mud-flaps` — which `fitment-engine` Open Question 5 says has no Layout and may
   never have one — which price is authoritative at checkout?
2. **Do `seat-covers`, `mud-flaps` and `sun-shade` ever get a Layout?** None has a floor pan, and the
   fitment Variant vocabulary has no slot for mud flaps or sun shades. `seat-covers` genuinely needs a
   per-car fit and may deserve a `kind: "cabin"` Layout. Until then, `OrderItem.layoutVariantId` stays
   null for those products and the brand-tier branch prices them — which is the correct interim but
   should be a decision rather than a drift.
3. **Where does the durable demand log live?** `fitment-engine` Phase 0 writes structured log lines and
   routes refusals to the owner's WhatsApp inbox, and it explicitly hands "where does the demand log
   physically land" back to this spec (its Open Question 8). Once `DemandLog` exists as a table this
   is solved; until `fitment-engine`'s migration 3, a serverless filesystem is ephemeral and the
   inbox is the only durable store. **Decision 1 gives that a concrete answer** — a local Postgres is
   the development store — but a table still has to be created before the log is durable, and a
   workstation's `localhost` is not a production host.
4. **What is the maximum order value and line count?** This spec picks 99 lines and 1–99 quantity as
   defensive bounds. For a business whose entire catalogue is seven products, a 99-line order is
   almost certainly abuse. Should the cap be 10?
5. **Should an order be cancellable by the customer without a session?** The reference-plus-phone
   scheme proves *viewing*; it does not prove *acting*. Today the answer is no — cancelling is a
   WhatsApp conversation — and that is probably correct. Flagged so it is chosen rather than assumed.
6. **Paystack test key timing.** `luxeride-architecture-plan.md` §8 asks for one and it is still
   outstanding. Not needed for this spec; needed the moment `payments-paystack` starts, and the owner
   should not discover the lead time under pressure.