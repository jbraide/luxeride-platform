# Requirements Document

## Introduction

LuxeRide currently has a database the way a car has a spare wheel in a boot it cannot open: `prisma/schema.prisma` declares eight models, `@prisma/client` is a declared dependency, and nothing else. No migration has ever been applied, no database is provisioned, the `.env` `DATABASE_URL` is the literal string `postgresql://user:pass@localhost:5432/luxeride`, and no file under `src/` imports `@prisma/client`. There is no `src/lib/db.ts`, no `route.ts` handler and no server action anywhere in the app.

What this costs today, concretely:

- **The app cannot be deployed.** `npm run build` fails on `prisma/seed.ts(2,34): error TS2307: Cannot find module './data/products'`. Next type-checks `prisma/**` because `tsconfig.json` `include` is `["next-env.d.ts", "**/*.ts", ...]`. With that one file set aside the app builds cleanly and produces 16 pages, so this is a one-file defect sitting on top of a working app. `.next/BUILD_ID` is absent, so no successful production build has ever been produced. This is a P0 launch blocker, not a code-quality issue.
- **Every order is imaginary.** `/checkout` validates the phone, writes a `PlacedOrder` into a `localStorage`-persisted Zustand store, opens a `wa.me` link, clears the cart and pushes `/order/confirmation`. The order id is generated client-side as `LR-<base36>`, is not in the WhatsApp message, and `/order/confirmation` reads it back out of `localStorage`. If the customer clears storage, switches device, or simply closes the tab, the order does not exist anywhere. The business has no record of who ordered what, for which car, at which price, or where.
- **Price is client-asserted.** `CartItem.unitPrice` is computed by `productBase()` in `src/lib/pricing.ts` on the client and carried through checkout untouched. Nothing server-side confirms it. Doc A §5 requires each order line to keep "its own car/row/price snapshot so a later price change never rewrites history on old orders" — that snapshot has no storage.
- **The seed cannot run.** `"db:seed": "npx ts-node --project tsconfig.json prisma/seed.ts || node --loader ts-node/esm prisma/seed.ts"`. `ts-node` is not in `dependencies` or `devDependencies` (verified: `node_modules/ts-node` does not exist). The fallback `node --loader ts-node/esm` is the removed Node loader form. The script cannot succeed by either branch.
- **The Prisma client is not generated.** `node_modules/.prisma/client/index.js` is the stub whose `PrismaClient` constructor throws `"@prisma/client did not initialize yet. Please run \"prisma generate\" and try to import it again."` (verified by reading the file). So even a syntactically perfect seed would fail at runtime until `prisma generate` runs.
- **The seed has silently lost the premium price.** `prisma/seed.ts` line 50 and line 59 both write `basePrice: p.regular`. `schema.prisma` `Product` has `basePrice Int` and **no premium column**. Meanwhile `src/data/products.ts` prices on `regular` *and* `premium`, selected by the car's brand tier — and 8 of the 33 brands in `src/data/cars.ts` are `premium` (Lexus, Acura, Infiniti, Mercedes-Benz, BMW, Audi, Land Rover, Volvo). A Double Layer Mats order for a Lexus GX 470 is ₦82,000 in the client and ₦68,000 in the database. If server-side revalidation is built on today's schema, every premium-brand order is undercharged by roughly ₦13,000–₦22,000. This is a money bug that exists today only because nothing reads the database.
- **`Car` and `CarModelFlag` are never populated.** The schema has both models; the seed touches neither (it imports `BRANDS` and never uses it — one of the two eslint warnings). The fitment vocabulary that `/fit-finder` searches over does not exist in the database at all.

This spec delivers the persistence foundation: a build that passes, a provisioned database with a real migration history, a seed that runs and is derived from the static data rather than a hand-copied duplicate of it, a Prisma client that survives Next dev HMR, a server action that creates an order and its items atomically and idempotently, server-side price revalidation that never trusts the client, order lookup, and a shared server-side validation layer. Every other persistence-dependent spec — `cart-checkout`, `payments-paystack`, `whatsapp-engine`, `fitment-engine`, `ad-landing-and-tracking` — builds on what lands here.

**Design constraint stated up front:** the architecture plan's data model (`Car` with brand-level `tier` and a boolean `available`) and the fitment-engine model (`Vehicle` + `Layout` + `Mapping` + `LayoutVariant.priceFrom`) describe the same business incompatibly. This spec does not pick a winner and hope. It owns the reconciliation, sets out which entities survive and which are superseded, and stages the migration so the storefront keeps trading while the fitment engine is built underneath it. The reconciliation is in `design.md` § Data Models. `fitment-engine` remains authoritative for the fitment model; this spec reconciles *toward* it.

---

## Requirements

### Requirement 1 — Shippable build

**User Story:** As the owner, I want `npm run build` to exit zero, so that I can deploy the site and start taking money.

#### Acceptance Criteria

1. WHEN `npm run build` is run from `luxeride-web/` THEN THE SYSTEM SHALL exit with code 0 and emit a `.next/BUILD_ID`.
2. WHEN `npx tsc --noEmit` is run THEN THE SYSTEM SHALL report zero errors.
3. WHEN `npx eslint .` is run THEN THE SYSTEM SHALL report zero errors and zero warnings, including the two current unused-import warnings in `prisma/seed.ts`.
4. IF `prisma/seed.ts` contains an import of a module that does not exist THEN THE SYSTEM SHALL reject it at type-check time rather than shipping a broken production build.
5. WHEN the type-checker's `include` glob covers `prisma/**` THEN THE SYSTEM SHALL treat seed and migration tooling as first-class, type-checked project source rather than excluded scaffolding.

### Requirement 2 — A seed path that actually runs

**User Story:** As the owner, I want one documented command that populates a fresh database from the app's own data, so that I never have to hand-edit rows in a database admin panel.

#### Acceptance Criteria

1. WHEN `npm run db:seed` is invoked on a database with no rows THEN THE SYSTEM SHALL insert every category, product, location and recognised vehicle without error.
2. WHEN `npm run db:seed` is invoked twice in a row THEN THE SYSTEM SHALL leave the database in the same state (idempotent), creating no duplicate rows.
3. THE SYSTEM SHALL execute the seed using Node's built-in TypeScript type stripping, without adding `ts-node` or `tsx` to the dependency tree.
4. IF the seed process fails THEN THE SYSTEM SHALL exit non-zero with a non-empty message on stderr.
5. WHEN the seed process completes THEN THE SYSTEM SHALL disconnect the Prisma client before exiting.
6. THE SYSTEM SHALL NOT resolve any import through the tsconfig `@/*` path alias, because the seed's TypeScript runtime does not implement that resolution.

### Requirement 3 — Provisioned database and a migration workflow

**User Story:** As the owner, I want a real Postgres instance with a checked-in migration history, so that schema changes are reviewable, repeatable and reversible rather than an undocumented mutation of a live table.

#### Acceptance Criteria

1. WHEN `.env` is read by Prisma THEN THE SYSTEM SHALL fail with a clear error rather than silently connect to the placeholder `postgresql://user:pass@localhost:5432/luxeride`.
2. WHEN a schema change is made THEN THE SYSTEM SHALL produce a numbered migration under `prisma/migrations/` with an accompanying `migration.sql`.
3. WHEN `prisma migrate deploy` is run against a deployed environment THEN THE SYSTEM SHALL apply pending migrations in order and report the resulting status.
4. WHEN `prisma migrate status` is run THEN THE SYSTEM SHALL report whether the database is up to date with the checked-in schema.
5. IF a migration fails partway THEN THE SYSTEM SHALL refuse to continue applying further migrations until the state is resolved explicitly.
6. THE SYSTEM SHALL support running a local development database on the owner's machine with no paid hosted service.
7. THE SYSTEM SHALL provide a repeatable `pg_dump` export of that local database together with a documented, tested restore into a scratch database, because a database run on the owner's own machine has no managed backups behind it and this project has no version control to recover from either.
8. THE SYSTEM SHALL require no more than a change to `DATABASE_URL` and a run of `prisma migrate deploy` to move the database to a hosted provider, so the local store can be promoted without redesigning the schema.

### Requirement 4 — Seed fidelity: the database mirrors `src/data`, it does not duplicate it

**User Story:** As the owner, I want the database seeded by importing the app's data files, so that changing a price in one place changes it in one place and a silent copy-paste drift cannot recur.

#### Acceptance Criteria

1. WHEN the seed runs THEN THE SYSTEM SHALL derive category, product and location rows by importing `src/data/categories`, `src/data/products` and `src/data/locations` rather than declaring its own literals.
2. WHEN a product's `premium` price changes in `src/data/products.ts` and the seed is re-run THEN THE SYSTEM SHALL persist the new premium price.
3. THE SYSTEM SHALL persist a separate column for the premium price, so that a premium-brand order is never priced from the regular figure.
4. WHEN a product is row-applicable THEN THE SYSTEM SHALL persist its three-row surcharge; WHEN it is not THEN THE SYSTEM SHALL persist null.
5. WHEN the seed runs THEN THE SYSTEM SHALL populate the recognised-vehicle inventory from `src/data/cars.ts`, including the brand availability flag and the individual model-level unavailability exceptions.
6. WHEN `src/data/cars.ts` adds a brand or model THEN THE SYSTEM SHALL add it to the inventory on the next seed run without a schema change.
7. WHEN a seeded row is re-run THEN THE SYSTEM SHALL update mutable fields (name, price, surcharge, images, availability) rather than leaving stale values behind.
8. THE SYSTEM SHALL preserve any column a human has edited in the admin UI that the seed does not own, or SHALL document precisely which columns the seed overwrites.

### Requirement 5 — Server-side order creation

**User Story:** As the owner, I want every checkout to write a real order row to my database, so that I know who ordered what, for which car, and can act on it from a phone number I recognise.

#### Acceptance Criteria

1. WHEN a customer submits checkout with a valid payload THEN THE SYSTEM SHALL create one `Order` row and one `OrderItem` row per cart line, within a single database transaction.
2. IF any line fails validation or any write fails THEN THE SYSTEM SHALL roll back the entire transaction and persist no `Order` and no `OrderItem`.
3. THE ORDER SHALL be assigned its identifier by the database, not by the client.
4. WHEN an order is created THEN THE SYSTEM SHALL record the customer's name, phone, address, delivery zone, payment method, and the full money breakdown (subtotal, delivery fee, prepay discount, total) as persisted columns.
5. WHEN an order is created THEN THE SYSTEM SHALL store the delivery fee actually charged and the delivery zone name as a snapshot, so that a later fee change cannot rewrite the record of what the customer owed.
6. THE SYSTEM SHALL reject a submission whose phone fails `validateNGPhone`, using the same rule the client already applies.
7. THE SYSTEM SHALL reject a submission whose delivery zone does not exist.
8. THE SYSTEM SHALL reject a submission with zero items.
9. IF the same submission is received twice with the same idempotency key THEN THE SYSTEM SHALL return the original order and create no second order.
10. WHEN an order is created THEN THE SYSTEM SHALL record the status as `pending`.
11. THE SYSTEM SHALL expose order creation to the client as a Next.js server action, not as a client-callable route handler.

### Requirement 6 — Server-side price revalidation

**User Story:** As the owner, I want the server to compute what an order actually costs from my own price data, so that a customer cannot set their own price by editing a request.

#### Acceptance Criteria

1. WHEN an order is submitted THEN THE SYSTEM SHALL ignore every price figure supplied by the client and recompute each line price from persisted source data.
2. THE SYSTEM SHALL compute the line price with the same rule the storefront uses today: the product's price for the recognised vehicle's brand tier, plus the three-row surcharge when the product is row-applicable and the row selection is `3`.
3. WHEN the vehicle's brand is a premium brand THEN THE SYSTEM SHALL price from the premium figure, not the regular figure.
4. WHEN the recomputed order total differs from the total the client displayed THEN THE SYSTEM SHALL persist the server figure and return it to the client so the customer sees the authoritative number.
5. IF a line references a product slug that does not exist THEN THE SYSTEM SHALL reject the whole submission rather than defaulting to a price.
6. IF a line references a brand that does not exist in the vehicle inventory THEN THE SYSTEM SHALL reject the whole submission.
7. WHEN a line references a product that is not row-applicable and a row selection was supplied THEN THE SYSTEM SHALL ignore the row selection rather than charging a surcharge.
8. THE SYSTEM SHALL store the recomputed unit price on each order line so that a later price change never rewrites an existing order's history.

### Requirement 7 — Order lookup

**User Story:** As a customer, I want to see my order on a phone I did not fill the form on, so that I can check my order without keeping a browser tab open.

#### Acceptance Criteria

1. WHEN a customer submits their order reference and a phone number that match a stored order THEN THE SYSTEM SHALL display that order's items, delivery line, discount and total.
2. IF the reference matches an order but the phone does not THEN THE SYSTEM SHALL refuse and disclose nothing about the order.
3. IF no order matches THEN THE SYSTEM SHALL show a plain "order not found" state, not an error.
4. WHEN an order is displayed THEN THE SYSTEM SHALL read it from the database, never from `localStorage`.
5. THE SYSTEM SHALL support a direct link to an order so the confirmation page works after a refresh or on another device.
6. THE SYSTEM SHALL treat an order reference as a secret and SHALL NOT expose order references in page source, logs or URLs that get shared.

### Requirement 8 — Shared server-side validation layer

**User Story:** As the owner, I want one place that decides what a valid order submission is, so that the client and the server cannot disagree about what is acceptable.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide a single module that both the checkout client component and the order server action import.
2. THE SYSTEM SHALL reuse `validateNGPhone` from `src/lib/validation.ts` unchanged rather than reimplementing the rule.
3. WHEN the server validates a submission THEN THE SYSTEM SHALL coerce and bound every field — name length, phone format, address length, delivery zone membership, payment method membership, quantity range, row selection membership.
4. IF any field fails validation THEN THE SYSTEM SHALL return a per-field error to the client and SHALL NOT write anything.
5. THE SYSTEM SHALL reject a quantity outside 1–99 rather than clamping it silently.
6. THE SYSTEM SHALL reject a payment method other than `pod` or `prepay`.
7. THE SYSTEM SHALL enforce a maximum number of cart lines per order.
8. THE SYSTEM SHALL NOT treat client-side validation as a security boundary; server validation runs on every submission regardless of what the UI did.

### Requirement 9 — Reconciled entity model staged for the fitment engine

**User Story:** As the owner, I want the database designed so the fitment engine can be built underneath the working storefront, so that adopting the layout model does not require rewriting the shop or losing order history.

#### Acceptance Criteria

1. THE SYSTEM SHALL retain `Category`, `Product` and `Location` as catalogue entities, and `Order` and `OrderItem` as commerce entities.
2. THE SYSTEM SHALL supersede `Car` and `CarModelFlag` with `Make`, `Vehicle` and `Exclusion`, and SHALL migrate existing rows rather than drop them.
3. THE SYSTEM SHALL retain the brand-level tier as a **default price seed**, not as the pricing authority, so that a layout variant's own price overrides it once one exists.
4. THE SYSTEM SHALL express a sellable variant's price as a single per-variant figure once a layout exists, replacing the brand-tier × product matrix.
5. THE SYSTEM SHALL keep the order line able to record a layout and a variant, both nullable, so that orders placed before the fitment engine exists remain writable and readable.
6. WHEN an order is placed before a layout is known THEN THE SYSTEM SHALL record the recognised vehicle and the indicative price, and leave the layout reference null.
7. WHEN an order is placed after a layout is confirmed THEN THE SYSTEM SHALL record the layout and variant alongside the vehicle.
8. THE SYSTEM SHALL preserve the order line's stored unit price in both cases, so historical orders are never re-priced by a later engine change.
9. THE SYSTEM SHALL NOT create synthetic layout rows to stand in for missing fitment data.
10. IF the fitment-engine tables are absent THEN THE SYSTEM SHALL still be able to create and read orders — the storefront must trade before the fitment engine lands.

### Requirement 10 — Environment and secret handling

**User Story:** As the owner, I want my database credentials kept off the customer's browser, so that a connection string cannot be read out of the page source.

#### Acceptance Criteria

1. THE SYSTEM SHALL read the database connection string only from a server-side environment variable.
2. THE SYSTEM SHALL never prefix the database connection variable with `NEXT_PUBLIC_`, which would inline it into the client bundle at build time.
3. THE SYSTEM SHALL place the real connection string in a local, uncommitted environment file and SHALL leave the committed example file holding only a placeholder.
4. WHEN a server module that holds database credentials is imported from a client component THEN THE BUILD SHALL fail rather than silently leaking.
5. THE SYSTEM SHALL keep the WhatsApp business number and any future Paystack secret in server-only variables.
6. WHEN the application starts with no database connection configured THEN THE SYSTEM SHALL fail loudly at the first database call rather than at build time, so a missing secret is a deployment error and not a silent success.

### Requirement 11 — Operational safety and honest gaps

**User Story:** As the owner, I want to know exactly what can go wrong with my data and what happens when it does, so that I am not surprised.

#### Acceptance Criteria

1. THE SYSTEM SHALL document a rollback procedure for a bad migration, given that a development database can be reset but a production database cannot be assumed to be resettable.
2. THE DESIGN SHALL state plainly that the project has no version control, and therefore no rollback for application code and no migration rollback for database schema.
3. THE DESIGN SHALL state plainly that a database run on the owner's own machine has no managed or continuous backup behind it, and SHALL state what `pg_dump` discipline replaces it.
4. THE DESIGN SHALL state plainly that there is no rate limiting on the order submission path, and describe the minimum exposure that creates.
5. THE DESIGN SHALL state plainly that there is no error monitoring, and describe how a failed order will be discovered.
6. THE DESIGN SHALL state plainly that there are no automated tests, and specify what verification exists instead.
7. WHEN the application fails to write an order THEN THE SYSTEM SHALL leave the customer with a working WhatsApp path, because WhatsApp is the business's real fallback channel.

---

## Out of scope for this spec

Deliberately excluded, owned elsewhere. This spec builds the substrate; it does not build the features on top of it.

| Concern | Owning spec |
|---|---|
| Admin CRUD, grouping, publish, conflict guard, demand-log UI | `fitment-engine` |
| The `/fit-check` endpoint and the FITTED / NOT STOCKED / UNKNOWN states | `fitment-engine` |
| Changing `/checkout` to call the server action instead of writing `localStorage` | `cart-checkout` |
| Paystack payment initialisation and webhook-driven status transitions | `payments-paystack` |
| WhatsApp Cloud API send, Confirm/Cancel webhook, status transitions | `whatsapp-engine` |
| UTM capture and the `ad-landing-and-tracking` landing pages | `ad-landing-and-tracking` — this spec only reserves the columns |
| Backup automation, error monitoring, rate limiting infrastructure | Not owned by any current spec; the backup half is scoped by `design.md` § Decisions, Decision 1 and tasked at 2.8–2.9 |

The `CartItem` shape, the WhatsApp message builder and the confirmation page's rendering are not changed here except where `cart-checkout` explicitly calls into this spec's server action.