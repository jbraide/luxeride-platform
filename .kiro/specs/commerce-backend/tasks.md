# Implementation Plan

## Status

**PARTIAL — section 1 done; everything from section 2 onward untouched.** 13 done, 66 remaining (79 checkbox items).

Section 1, **the P0 launch blocker**, is complete and verified: `npm run build` exits 0 and writes
`.next/BUILD_ID`, `npx tsc --noEmit` reports 0 errors, `npx eslint .` reports 0 errors and 0 warnings.
That is blocker **B1**, and it is closed. The full note is in `../master-build-plan/tasks.md` M0.2.

**A defect this spec did not list, found and fixed while doing task 1.5.** `prisma/schema.prisma` did not
validate at all — `CarModelFlag.car` declared a relation with no opposite field on `Car`, so
`prisma generate` failed with **P1012**. Adding `postinstall` without fixing that would have turned every
fresh `npm install` into a failure. Repaired by adding `Car.flag CarModelFlag?`; task 2.5 rewrites the
schema anyway, so this is a repair rather than a design decision.

Everything from section 2 onward is **still blocked on E3**: PostgreSQL is not installed on this machine
and `sudo` cannot run as root in the agent sandbox, so task 2.1 is the owner's step to run. Tasks
4.1–4.4, 5.1 and 6.1 need no database but are not started either.

## Before any ad spend

Short version: **do not buy traffic until section 1 is green.** The app cannot be deployed today, and a deployed app would take orders it cannot record.

- [x] `npm run build` exits 0 and `.next/BUILD_ID` exists → task 1. **(verified 2026-10-02: exits 0, `.next/BUILD_ID` written, `tsc --noEmit` 0 errors, `eslint .` 0 errors 0 warnings)**
- [ ] A real `DATABASE_URL` is set and `prisma migrate status` reports up to date → task 2
- [ ] `npm run db:seed` runs twice with no error and no duplicates → task 3
- [ ] Placing one real order writes an `Order` + `OrderItem` rows, and the confirmation page survives a hard refresh → tasks 6, 7
- [ ] A Lexus GX 470 double-layer order prices at ₦82,000 (the premium figure), not ₦68,000 → task 3 + task 6, this is defect D2

If money moves before all five are green, orders land only in a customer's `localStorage` and WhatsApp, and there is no record of what was sold, at what price, for which car.

---

- [x] 0. Verified groundwork — root causes established by reading files and running probes this session
  - [x] 0.1 Build blocker confirmed: `prisma/seed.ts:2` imports `"./data/products"`, which resolves to `prisma/data/products` — a directory that does not exist. `tsconfig.json:28` `include` glob `**/*.ts` is why `prisma/**` is type-checked and why the whole production build fails on one line. _(verified: luxeride-web/prisma/seed.ts)_ _(P0)_
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [x] 0.2 Seed runner confirmed unrunnable: `package.json:10` calls `npx ts-node` but `ts-node` is in neither `dependencies` nor `devDependencies` and `node_modules/ts-node` does not exist; the `|| node --loader ts-node/esm` fallback is the removed Node loader form. _(verified: luxeride-web/package.json)_ _(P0)_
    - _Requirements: 2.3_
  - [x] 0.3 Seed-runner replacement measured, not guessed: Node is **v22.23.1** and runs `src/data/products.ts`, `cars.ts` and `locations.ts` natively via type stripping. Verified that imports must carry an explicit `.ts` specifier (extensionless fails `ERR_MODULE_NOT_FOUND`) and that `import type` is fully elided while a plain `import` of a type-only name is not. Verified `src/lib/pricing.ts` is therefore **not** importable from a Node-run seed, because its `@/data/products` specifier throws `Cannot find package '@/data'`. _(verified: luxeride-web/src/lib/pricing.ts)_ _(P0)_
    - _Requirements: 2.3, 2.6_
  - [x] 0.4 The two halves of the fix are now known and they conflict: `tsc` accepts an explicit `.ts` specifier **only** with `allowImportingTsExtensions` (`error TS5097` without it), while extensionless specifiers type-check clean but fail at runtime under Node. `tsconfig.json` already lists `"**/*.mts"` in `include`, so renaming the seed to `.mts` keeps it inside the build guard. _(verified: luxeride-web/tsconfig.json)_ _(P0)_
    - _Requirements: 1.5, 2.3, 2.6_
  - [x] 0.5 The Prisma client has never been generated: `node_modules/.prisma/client/index.js` is the stub whose `PrismaClient` constructor throws `"@prisma/client did not initialize yet. Please run \"prisma generate\""`. So a correct seed still fails until `prisma generate` runs. _(verified: luxeride-web/node_modules/.prisma/client/index.js)_ _(P0)_
    - _Requirements: 3.2_
  - [x] 0.6 Nothing under `src/` imports `@prisma/client`; there is no `src/lib/db.ts`, no `route.ts` anywhere, no `"use server"` file, and no `server-only` package installed (only `client-only` is present). Confirmed by grep across `luxeride-web/src`. _(verified: luxeride-web/src)_ _(P0)_
    - _Requirements: 5.11, 10.4_

- [ ] 1. Fix the P0 launch blocker — `npm run build` must exit 0
  - [x] 1.1 Add `"allowImportingTsExtensions": true` to `compilerOptions` in `luxeride-web/tsconfig.json`. It is safe here because `noEmit: true` is already set and Next compiles with SWC, not `tsc`; without it, `tsc` rejects every explicit `.ts` specifier with `TS5097`, which is what forces the next task's file shape. _(P0)_
    - _Requirements: 1.2, 2.6_
  - [x] 1.2 Delete `luxeride-web/prisma/seed.ts` and create `luxeride-web/prisma/seed.mts` in its place. `.mts` is required, not cosmetic: `package.json` has no `"type": "module"`, so a `.ts` entry point makes Node reparse it as ESM and emit a `MODULE_TYPELESS_PACKAGE_JSON` warning on every run. `tsconfig.json` already includes `"**/*.mts"`, so the replacement stays inside the build's type-check. The file's own header comment (line 2, `// Not directly importable; using static seed below`) records that the old import was abandoned rather than fixed. _(P0)_
    - _Requirements: 1.4, 1.5, 2.3_
  - [x] 1.3 In `luxeride-web/prisma/seed.mts`, import the data with explicit extensions — `../src/data/products.ts`, `../src/data/cars.ts`, `../src/data/locations.ts`. Do **not** import `@/lib/pricing`, `@/data/*` or anything else through the tsconfig `@/*` alias, and do **not** import `src/lib/pricing.ts`: Node's type stripping does not implement tsconfig path resolution and that import was measured to throw `Cannot find package '@/data'`. Price columns are copied raw, so the seed needs no pricing function. _(P0)_
    - _Requirements: 2.3, 2.6, 4.1_
  - [x] 1.4 Rewrite the `"db:seed"` script in `luxeride-web/package.json` as `"db:seed": "node prisma/seed.mts"`, deleting the `npx ts-node … || node --loader ts-node/esm` fallback chain entirely. Add `"prisma": { "seed": "node prisma/seed.mts" }` so `prisma db seed` and `prisma migrate reset` both use it — Prisma 6.19.3 resolves that key from `package.json` via `loadConfigFromPackageJson` (verified by reading the `Wy()` resolver in `node_modules/prisma/build/index.js`). _(P0)_
    - _Requirements: 2.3, 3.2_
  - [x] 1.5 Add a `"postinstall": "prisma generate"` script to `luxeride-web/package.json` and run it once by hand, so a fresh `npm install` never leaves the un-generated stub in place. Verify with `npm run build` (exit 0, `.next/BUILD_ID` written), `npx tsc --noEmit` (0 errors) and `npx eslint .` (0 errors, 0 warnings — the two current unused-import warnings in the old `seed.ts` must be gone with it). _(P0)_
    - _Requirements: 1.1, 1.2, 1.3, 3.2_

- [ ] 2. Provision the database and establish a migration history
  - [ ] 2.1 Install PostgreSQL 16 from `apt` on the owner's machine. **This is the owner's step to run, not the agent's**: `sudo` cannot run as root inside the agent sandbox (the no-new-privileges flag is set). Command: `sudo apt-get update && sudo apt-get install -y postgresql postgresql-client`. Verified state beforehand — PostgreSQL is **not installed** (`apt-cache policy` candidates: `postgresql` → `16+257build1.1`, `postgresql-16` → `16.15-0ubuntu0.24.04.1`, `postgresql-client` → `16+257build1.1`); `docker.io` is **not installed** either (candidate `29.1.3`), which is why a container is not the choice; `brew` does not exist on this Linux box; nothing is listening on 5432. `design.md` § Decisions, Decision 1 records the reasoning and what it costs. _(P0)_
    - _Requirements: 3.1, 3.6_
  - [ ] 2.2 Bring the cluster up and create the role and database to match the `DATABASE_URL` shape already sitting in `luxeride-web/.env`. The Ubuntu packaging initialises the cluster during the install, so `initdb` is needed only for a second, non-default cluster; confirm with `sudo pg_lsclusters` and start with `sudo systemctl start postgresql`. Then `sudo -u postgres psql -c "CREATE ROLE luxeride LOGIN PASSWORD '<one the owner chooses>';"` followed by `sudo -u postgres createdb -O luxeride luxeride`, so the URL in `.env.local` is `postgresql://luxeride:<password>@localhost:5432/luxeride` — the existing placeholder's exact shape, with a real role, password and database behind it. The `user:pass` in the current `.env` value are placeholders, not credentials — the role, password and database behind them do not exist. Verify with `psql -h localhost -U luxeride -d luxeride -c '\conninfo'`. _(P0)_
    - _Requirements: 3.1, 3.6_
  - [ ] 2.3 Move the real connection string out of `luxeride-web/.env` into `luxeride-web/.env.local` and leave `luxeride-web/.env` holding only the commented placeholder. Load order is `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`, so `.env.local` wins. Add `luxeride-web/.env.example` carrying `DATABASE_URL=` with an empty value and a comment. Note that **there is no git repository**, so `.gitignore` protects nothing — the secret is protected only by the file staying uncommitted, which is currently nothing at all. _(P0)_
    - _Requirements: 3.1, 10.3_
  - [ ] 2.4 Add a guard in `luxeride-web/src/lib/db.ts` that throws at first import if `DATABASE_URL` is absent or still equals the literal placeholder `postgresql://user:pass@localhost:5432/luxeride`, so a misconfigured deploy fails on a database call rather than looking like a successful build. _(P0)_
    - _Requirements: 3.1, 10.6_
  - [ ] 2.5 Rewrite `luxeride-web/prisma/schema.prisma` to the reconciled model in `design.md` § Data Models — `Category` (+`blurb`), `Product` (`regular`/`premium`, no `tier`, no `basePrice`), `Location` (+`slug`), `Make`, `Vehicle`, `Order` (+ money breakdown, `reference`, `idempotencyKey`, UTM columns), `OrderItem` (+ `vehicleId`, snapshots, `lineTotal`). Do **not** declare `Car` or `CarModelFlag`: they have never been applied to any database, so there are no rows to migrate and the tables are simply never created. Do **not** declare `Layout`, `Mapping`, `LayoutVariant`, `ImageSet`, `Exclusion` or `DemandLog` yet — those arrive in a later migration owned by `fitment-engine`, and `OrderItem` must work with no layout in the database at all. _(P0)_
    - _Requirements: 9.1, 9.2, 9.5, 9.9, 9.10_
  - [ ] 2.6 Run `npx prisma migrate dev --name init_commerce_model` from `luxeride-web/` to produce `prisma/migrations/<timestamp>_init_commerce_model/migration.sql`, then `npx prisma migrate status` to confirm it is applied. This is the first migration ever applied to any database, and it is applied to the local cluster from 2.2. Commit nothing — there is no repository — but the `migrations/` directory is the only record of schema history and must be treated as precious. The datasource stays provider-agnostic (`datasource db { provider = "postgresql" }`), so promoting to a hosted provider later is a `DATABASE_URL` change plus `migrate deploy` (task 10.5), not a re-migration. _(P0)_
    - _Requirements: 3.2, 3.3, 3.4_
  - [ ] 2.7 Add `"db:migrate"`, `"db:deploy"`, `"db:status"` and `"db:studio"` scripts to `luxeride-web/package.json` mapping to `prisma migrate dev`, `prisma migrate deploy`, `prisma migrate status` and `prisma studio`, and document in `README.md` that `db:deploy` (not `db:migrate`) is the command that runs against production. _(P1)_
    - _Requirements: 3.3, 3.4, 3.5_
  - [ ] 2.8 Add a `"db:backup"` script and `luxeride-web/scripts/db-backup.sh` that runs `pg_dump -Fc` against `DATABASE_URL` into a timestamped file in a directory **outside** the cluster's own data directory, pruning old dumps, and schedule it with a `systemd --user` timer or a crontab entry on the workstation. Document in `README.md` that this is the entire backup story and why it has to be explicit: **a local Postgres ships no managed daily backups, and this project has no git repository**, so there is no second recovery path for anything. No managed scheduler exists either, because there is no managed service — there is one workstation and one person. _(P0)_
    - _Requirements: 3.7, 11.3_
  - [ ] 2.9 Run the restore drill once, in full, and write the working commands into `README.md` next to the backup script: create a scratch database (`createdb luxeride_restore`), `pg_restore` the most recent dump into it, and compare its row counts against the seeded source database. A backup that has never been restored is a hypothesis, not a backup. State how often the drill is repeated — at minimum after any migration that changes a table. _(P0)_
    - _Requirements: 3.7, 11.3_

- [ ] 3. Rework the seed so the database mirrors `src/data` instead of duplicating it
  - [ ] 3.1 Replace the hand-typed `categorySeed`/`productSeed`/`locations` literals in `luxeride-web/prisma/seed.mts` with imports of `CATEGORIES`, `PRODUCTS` and `LOCATIONS` from `../src/data/*.ts`. The current seed restates 7 products and 4 locations as literals, which is why it could silently drift; today it has already drifted. _(P0)_
    - _Requirements: 4.1, 4.2_
  - [ ] 3.2 Fix defect **D2** in `luxeride-web/prisma/seed.mts` and `luxeride-web/prisma/schema.prisma`: persist `regular` **and** `premium` as two columns and drop the old `basePrice Int`, and drop `Product.tier` entirely. `basePrice: p.regular` at `prisma/seed.ts:50` and `:59` writes the regular figure into the only price column the schema has, so the premium price is lost on every seed — and 8 of the 33 brands in `src/data/cars.ts` are `premium` (Lexus, Acura, Infiniti, Mercedes-Benz, BMW, Audi, Land Rover, Volvo). `Product.tier` is also a category error: tier is a property of the car's **brand**, and `productBase()` in `src/lib/pricing.ts:9-14` reads `product[tier]` with the tier supplied by `BRANDS[brand].tier`, so the column is never read by anything. _(P0)_
    - _Requirements: 4.2, 4.3, 6.3, 9.3_
  - [ ] 3.3 Seed `Make` from `BRANDS` in `src/data/cars.ts` — one row per brand key, carrying `defaultTier` from the brand's `tier` and the brand's `available` flag. Preserve `"Other"` as a real `Make` row with `isSearchable: false`, because `FLAT_CARS` excludes it at `src/data/cars.ts:70` and dropping it would lose the "Enter model on WhatsApp" escape hatch. Seed the 8 `POPULAR_CARS` pairs into `Vehicle.isPopular`. _(P0)_
    - _Requirements: 4.5, 4.6, 9.3_
  - [ ] 3.4 Seed `Vehicle` from `FLAT_CARS` — 212 rows — leaving `yearFrom`/`yearTo`/`generation` null and `status: "recognised"`, because the source data has no year dimension at all and inventing one here would manufacture fitment evidence this spec has no basis for. Use `sourceKey` (`"Toyota::Camry"`) as the upsert key. Carry the Acura `MDX` model-level exception from `src/data/cars.ts:24` into `Vehicle.status: "excluded"` rather than a boolean. _(P0)_
    - _Requirements: 4.5, 4.6, 9.2_
  - [ ] 3.5 Make every seed write an `upsert` whose `update` branch carries the full mutable field set (name, price, surcharge, images, availability, ETA, fee), so a re-run repairs drift instead of leaving stale rows. Add a short comment at the top of `prisma/seed.mts` naming exactly which columns the seed owns and which are left alone for the admin, satisfying the documentation half of 4.8. _(P1)_
    - _Requirements: 4.7, 4.8_
  - [ ] 3.6 Add a count assertion at the end of `luxeride-web/prisma/seed.mts` that logs the inserted totals (5 categories, 7 products, 4 locations, 33 makes, 212 vehicles) and exits non-zero if any count is short, so a partial seed cannot report "Seed complete." — which is what `prisma/seed.ts:83` prints today regardless of outcome. _(P1)_
    - _Requirements: 2.1, 2.4, 4.6_

- [ ] 4. Prisma client singleton and environment handling
  - [ ] 4.1 Create `luxeride-web/src/lib/db.ts` exporting a lazily-created `PrismaClient` cached on `globalThis` and only re-assigned outside production. The reason is Next dev HMR re-evaluating the module on every edit and opening a new pool each time until Postgres refuses connections. **Sourcing note:** the shipped `node_modules/prisma/README.md` and `node_modules/@prisma/client/README.md` contain no singleton guidance (grep for `singleton|globalThis|next.js|dev mode|HMR` returns nothing) and the Next 16 guides in `node_modules/next/dist/docs/` contain no Prisma, connection-pool or singleton content at all (grep across `01-app/02-guides/` returns nothing). This pattern is Prisma's published Next.js guidance, cited from knowledge rather than from a file in this repo — flagging that honestly rather than dressing it as verified. _(P0)_
    - _Requirements: 1.2, 10.6_
  - [ ] 4.2 Add `server-only` as a dependency in `luxeride-web/package.json` and start `luxeride-web/src/lib/db.ts` with `import 'server-only'`. The package is **not currently installed** — verified: only `client-only` is present — so this is a real addition, not a one-line import. This is what makes requirement 10.4 a build failure rather than a silent leak. _(P0)_
    - _Requirements: 10.4_
  - [ ] 4.3 Create `luxeride-web/src/lib/order-status.ts` as the single canonical `OrderStatus` union and its transition map, so `payments-paystack` and `whatsapp-engine` import it instead of each inventing their own strings against the same column. Ship `pending` as the only value this spec sets; the rest are declared here and driven by those two specs. _(P1)_
    - _Requirements: 5.10_
  - [ ] 4.4 Create `luxeride-web/src/lib/env.ts` reading and asserting `DATABASE_URL`, and document in it — in a comment — that `DATABASE_URL` must never carry the `NEXT_PUBLIC_` prefix, because the Next env guide states those variables are inlined into the browser bundle at build time while unprefixed ones stay Node-only. Leave `WHATSAPP_NUMBER` and the future `PAYSTACK_SECRET_KEY` server-side too. _(P0)_
    - _Requirements: 10.1, 10.2, 10.5_
  - [ ] 4.5 Confirm by reading the shipped bundle after the build that `DATABASE_URL` does not appear anywhere under `.next/static/`. This is the one check that actually proves the secret did not leak; everything else is inference. _(P1)_
    - _Requirements: 10.1, 10.2_

- [ ] 5. Shared server-side validation layer
  - [ ] 5.1 Create `luxeride-web/src/lib/order-validation.ts` exporting a `validateOrderSubmission(input: unknown)` that narrows and bounds every field — name length, `validateNGPhone` from `src/lib/validation.ts`, address length, delivery zone membership, `pod | prepay` membership, row selection `"2" | "3" | null`, per-line quantity, line count — and returns either per-field errors or a typed payload. Import `validateNGPhone` unchanged rather than reimplementing it. _(P0)_
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ] 5.2 Make `validateOrderSubmission` the module `/checkout` imports for its own pre-submit checks, so the client and the server cannot disagree about what is acceptable — and keep server validation unconditional regardless of what the UI already checked. Do not modify `src/app/checkout/page.tsx` beyond that import and its error rendering; the flow change is `cart-checkout`'s. _(P1)_
    - _Requirements: 8.1, 8.8_
  - [ ] 5.3 Reject, never clamp: quantity outside 1–99, a payment method outside `pod | prepay`, more than the maximum line count, and an unknown delivery zone all produce validation errors rather than silently corrected values. Clamping a quantity a customer typed is how a wrong order becomes a real order. _(P0)_
    - _Requirements: 8.4, 8.5, 8.6, 8.7_
  - [ ] 5.4 Accept the delivery zone as either the `Location.slug` or the exact `Location.name`, so `cart-checkout` can switch from name to slug in its own time without a coordinated deploy against a live order path. _(P1)_
    - _Requirements: 5.7_
  - [ ] 5.5 Treat the delivery zone and its fee as server-resolved: the client sends a zone identifier only. The fee comes from the `Location` row, so a customer cannot choose their own delivery charge. _(P0)_
    - _Requirements: 6.1, 6.4_

- [ ] 6. Server-side order creation
  - [ ] 6.1 Create `luxeride-web/src/app/checkout/actions.ts` with a `'use server'` directive at file top exporting `createOrder`. It is a **Server Action**, not a route handler: it is invoked from the checkout form, Next CSRF-checks `Origin` against `Host`, the body is capped at 1 MB, and action IDs are encrypted and unreferenced actions are stripped so there is no public endpoint to probe. Correction to a cross-reference elsewhere: there is **no `/api/checkout` route** in this design, and no route handler ships in this spec at all. _(P0)_
    - _Requirements: 5.11_
  - [ ] 6.2 Inside one `prisma.$transaction(async (tx) => …)`, create the `Order` and all `OrderItem` rows. A nested `order.create({ data: { items: { create: [...] } } })` would also be atomic, but the interactive transaction is required because idempotency has to be checked inside the same unit of work as the insert. Any throw rolls back both. _(P0)_
    - _Requirements: 5.1, 5.2_
  - [ ] 6.3 Ignore every price figure the client sends. Recompute each line from persisted rows with the same rule `productBase()` uses: the product's `premium` figure when the vehicle's make is `defaultTier: "premium"`, else `regular`, plus `threeRowSurcharge` when `rowApplicable` and `rows === "3"`. Persist the recomputed `unitPrice` and `lineTotal` and return the authoritative total to the client so the customer sees the server's number, not the one they were shown. This is the step that closes defect D2 on the write path. _(P0)_
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8_
  - [ ] 6.4 Reject the whole submission — never default a price — when a line names a product slug absent from `Product` or a brand absent from `Make`. A fallback price on a missing row is how a cart becomes an order nobody can price. _(P0)_
    - _Requirements: 6.5, 6.6_
  - [ ] 6.5 Add `idempotencyKey String? @unique` to `Order` and have the client mint one `crypto.randomUUID()` before the first submit and reuse it on every retry. On a unique-violation, re-read and return the existing order rather than creating a second. Server Actions are dispatched sequentially per client, so a double-click is two real sequential POSTs; the unique constraint, not the UI's disabled button, is the actual guard. _(P0)_
    - _Requirements: 5.9_
  - [ ] 6.6 Generate `Order.reference` server-side as `LR-` plus ten Crockford base32 characters drawn from the order UUID, retrying on collision. Persist it and return it. Do not accept a client-supplied id — today's `LR-<base36>` is minted in the browser at `src/app/checkout/page.tsx` and is never seen by a server. _(P0)_
    - _Requirements: 5.3_
  - [ ] 6.7 Persist the full money breakdown — `subtotal`, `deliveryFee`, `locationName` snapshot, `discount`, `total` — plus `status: "pending"`, the customer's details, and the generated WhatsApp message text. `Order` currently carries **none** of the money columns even though `PlacedOrder` in `src/store/order.ts:7-21` carries all of them and `/order/confirmation` renders them. Snapshot the zone name and fee so a later fee change cannot rewrite what was owed. _(P0)_
    - _Requirements: 5.4, 5.5, 5.10_
  - [ ] 6.8 Add the UTM and attribution columns — `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `referrer`, `landingPath` — to `Order` in this migration and populate them opportunistically from whatever is already on the request. `ad-landing-and-tracking` owns the taxonomy and the landing pages; this spec only reserves the columns so no order row ever has to be backfilled. _(P1)_
    - _Requirements: 5.4_
  - [ ] 6.9 Add the indexes the storefront and admin will actually run: `Order @@index([status, createdAt])` and `@@index([phone])`, `OrderItem @@index([vehicleId])`, `Vehicle @@index([makeId, model])` and `@@index([status])`, plus `@@unique([makeId, model, yearFrom, yearTo])` on `Vehicle`. `Order` has no index on `createdAt` today, so the admin's newest-first order list is currently an unindexed sort. _(P0)_
    - _Requirements: 6.8_

- [ ] 7. Order lookup and the confirmation page's real source
  - [ ] 7.1 Create `luxeride-web/src/app/order/[reference]/page.tsx` as a **Server Component** that reads the order from the database by reference. It supersedes the current `src/app/order/confirmation/page.tsx`, which reads `lastOrder` from `localStorage` via `src/store/order.ts` and renders "No recent order found" when storage is empty. Keep a redirect from the old path to the new one so an in-flight tab does not dead-end. _(P1)_
    - _Requirements: 7.4, 7.5_
  - [ ] 7.2 Require the phone number before showing the order's money lines: a form posts the phone, a server action compares it to the stored `Order.phone` and sets an httpOnly cookie scoped to that one reference. A reference plus the wrong phone returns the same "not found" response as a reference that does not exist, disclosing nothing. _(P1)_
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 7.3 Render the itemised lines, the delivery line, the prepay discount and the total from the persisted columns, and show a plain "Order not found" state — not an error — when no reference matches. The order reference is a secret: never place it in page source, a log line, or a URL the customer is likely to screenshot. _(P1)_
    - _Requirements: 7.3, 7.6_
  - [ ] 7.4 Hand off to `cart-checkout`: after `createOrder` returns, `/checkout` clears the cart, keeps writing the WhatsApp message, and navigates to `/order/[reference]` instead of `/order/confirmation`. This spec does not modify `src/app/checkout/page.tsx`'s navigation — `cart-checkout` owns that change and the server-action call site. _(P1)_
    - _Requirements: 7.4, 7.5_

- [ ] 8. Reconciliation bridge — the migration that lets `fitment-engine` land
  - [ ] 8.1 Ship `Product` in the initial migration, **before** any fitment table exists. `fitment-engine` recommends keying `LayoutVariant` to a catalogue `productSlug` (its Option B), which creates a foreign key from fitment into the catalogue — so `Product` must already exist when `LayoutVariant` is created, or that migration cannot be written. This ordering constraint is handed to this spec by `fitment-engine` and is satisfied here. _(P0)_
    - _Requirements: 9.1, 9.5_
  - [ ] 8.2 Publish `export type ProductSlug` as an explicit hand-maintained union of the seven slugs in `luxeride-web/src/lib/product-slug.ts`, with an `assertProductSlugs()` that throws at module load if the union and `PRODUCTS` disagree. The union must be hand-written: `PRODUCTS` is typed `Product[]`, not a const tuple, so `typeof PRODUCTS[number]["slug"]` widens to `string` and would catch nothing. `fitment-engine` currently declares its own `FitProductSlug` union; it should import this one instead, so there is exactly one list. _(P1)_
    - _Requirements: 9.1, 9.4_
  - [ ] 8.3 Ship a second migration adding **nullable only** — `OrderItem.layoutId`, `OrderItem.layoutVariantId`, `Order.updatedAt`, `Product.updatedAt`, and the remaining indexes. Nullable columns keep the storefront trading with no fitment tables present at all; adding a non-nullable layout reference now would block every order until `fitment-engine` lands. *(P1)*
    - _Requirements: 9.5, 9.6, 9.10_
  - [ ] 8.4 Document the staging contract in `design.md` § Data Models and tell `fitment-engine`: orders placed before the engine records `vehicleId` plus an indicative `unitPrice` with `layoutId`/`layoutVariantId` null; orders placed after record the layout and variant alongside. Either way `unitPrice` is frozen at write time and never re-derived, which is what keeps historical orders correct when a layout is split or retired. *(P1)*
    - _Requirements: 9.6, 9.7, 9.8_
  - [ ] 8.5 Add `Vehicle.aliases String[]`, `Vehicle.generation String?`, `Vehicle.bodyType String?` and `Vehicle.facelift Boolean` now rather than in `fitment-engine`'s migration, because `src/data/fitment.ts`'s `Vehicle` shape in Phase 0 has no database behind it and these columns must exist before that module's data is imported into the database. *(P1)*
    - _Requirements: 9.2, 9.6_

- [ ] 9. Verification and the runbook
  - [ ] 9.1 Add `luxeride-web/tests/db.test.ts` run by Node's built-in `node:test` — verified present in this runtime (`node -e "require('node:test')"`, Node v22.23.1) — covering: seed idempotency (run twice, row counts unchanged); a premium-brand order pricing from `premium` and a regular-brand order from `regular`; the three-row surcharge applied only when `rowApplicable`; a rollback leaving zero `Order` and zero `OrderItem` rows after a deliberately failing line; and a repeated `idempotencyKey` producing one order. Wire it as `"db:verify"`. **Zero new dependencies** — adding a test framework before the storefront trades is tooling ahead of need. _(P1)_
    - _Requirements: 2.2, 5.2, 5.9, 6.3_
  - [ ] 9.2 Write the migration and rollback runbook into `luxeride-web/README.md`, stating plainly that **there is no git repository**, so there is no `git revert` for application code and no `prisma migrate resolve --rolled-back` safety net for a production database. The only available responses are: forward-fix with a new migration, or `prisma migrate reset`, which destroys all data and is a development-only operation. _(P1)_
    - _Requirements: 11.1, 11.2_
  - [ ] 9.3 Document the four absent safety nets in the same runbook — no **managed** backup, no rate limiting on `createOrder`, no error monitoring, no CI — and for each state the concrete consequence and the cheapest mitigation: the local `pg_dump` discipline from 2.8 and the restore drill from 2.9, with no managed daily backups underneath them because Decision 1 chose a local cluster; a per-IP cap in front of the action; a `console.error` on every failed order plus a daily glance at `Order` count against WhatsApp message count; and no CI, so `npm run build` is run by hand every time. *(P1)_
    - _Requirements: 11.3, 11.4, 11.5, 11.6_
  - [ ] 9.4 Make `createOrder` fall back gracefully: if the database write fails for any reason, the action still returns the reference and the checkout still opens the prebuilt WhatsApp message, logging the failure server-side. The customer must never lose the order because the database is down — WhatsApp is the real channel and the order row is a record, not the transaction of sale. *(P1)_
    - _Requirements: 11.7_

- [ ] 10. Post-trading hardening — not before P1 is done
  - [ ] 10.1 Add rate limiting to `createOrder` once there is real volume, keyed per IP and per phone number. With none today, the exposed surface is unbounded order-row creation and unbounded WhatsApp-message opening; that is acceptable at launch volume and not acceptable later. *(P2)_
    - _Requirements: 11.4_
  - [ ] 10.2 Once 10.5 has promoted the database to a hosted provider, confirm that provider's managed daily backups are enabled and restore one of them into a scratch database, then retire the local `pg_dump` discipline from 2.8 rather than running both — two backup routines means neither is tested. A backup that has never been restored is a hypothesis, not a backup. *(P2)_
    - _Requirements: 3.7, 11.3_
  - [ ] 10.3 Add error monitoring — an `onError`/`instrumentation.ts` hook at minimum, since none exists — so a failed order surfaces before a customer notices and mentions it. *(P2)_
    - _Requirements: 11.5_
  - [ ] 10.4 Backfill `layoutId`/`layoutVariantId` onto pre-engine `OrderItem` rows once `fitment-engine`'s tables exist, for orders where a confirmed mapping unambiguously identifies the layout — and explicitly skip, with a recorded reason, any order where it does not. `unitPrice` is never touched either way. *(P2)_
    - _Requirements: 9.6, 9.8_
  - [ ] 10.5 **Promote the database from the local cluster to a hosted Postgres provider with managed backups.** This is the second half of `design.md` § Decisions, Decision 1, and it is owed before launch rather than optional: a local Postgres on the owner's workstation is a development store, and the only thing it has that a managed plan does not is a zero invoice. Because the datasource is provider-agnostic, promotion is a `DATABASE_URL` change in `.env.local` plus `npx prisma migrate deploy` against the hosted database — never `migrate dev`, which resets it. Take a `pg_dump` from the local cluster first, `pg_restore` it into the provider, and reconcile with `prisma migrate status` on both sides before the app is re-pointed at the hosted URL. Supabase versus Neon is still open; the backup guarantee is now the only thing that choice is for, since the table-editor argument for Supabase is superseded by `fitment-engine`'s admin console. *(P2)_
    - _Requirements: 3.6, 3.8_