# Requirements Document

## Introduction

**Feature:** `catalogue-admin-control` — the owner owns the catalogue.

The storefront now reads its catalogue from Postgres. `src/lib/catalogue.ts` reads
`Category`, `Product`, `ProductVariation`, `Bundle` and `BundleItem` and maps them onto the
`Product` / `Category` types declared in `src/data/products.ts`. `src/app/admin/(console)/catalogue-actions.ts`
already creates, edits and deletes categories, products and variations, and already edits bundles
(`saveBundle`, `addBundleItem`, `removeBundleItem`), and `src/app/admin/(console)/products/[id]/page.tsx`
renders a `BundleEditor`.

But the codebase still treats `src/data/products.ts` as authoritative in places that run at request
time or that re-run on every deploy, and that is what makes the admin feel rigid:

- `src/components/Footer.tsx` builds its category links from the `CATEGORIES` array in
  `src/data/products.ts`, **not** the database. A category the owner adds does not appear in the
  footer; a category they remove keeps its link.
- `src/data/landing.ts` validates every campaign's product against `getProductBySlug` from
  `src/data/products.ts`. A product created in `/admin/products` can never be an ad campaign target.
- `src/lib/product-slug.ts` imports `PRODUCTS` from `src/data/products.ts` and hand-writes the set of
  valid product slugs, so "which products exist" is a type-level fact in code that a database product
  cannot join.
- `prisma/seed.mts` `upsert`s every category and product from `src/data/products.ts` and writes
  `name`, `note`, `regular`, `premium`, `threeRowSurcharge`, `images` and `availability` on **every**
  run (`prisma/seed.mts:83-87` and `:105-130`). Its own header states the intent: the static arrays
  "make the database a copy of the catalogue rather than a second, drifting source". Re-running the
  seed therefore overwrites the owner's edits and **re-creates any row the owner deleted**.

The visible result: the owner edits the catalogue in the admin and hits walls that exist only in
code. A bundle cannot be removed — the seed and the static module hold it in place even after the row
is gone. A category the owner adds never reaches the footer. A product they add can never be
advertised.

This feature makes the database the single source of truth for the catalogue and gives the owner a
complete, safe lifecycle over categories, products, variations and bundles — including removing them —
with no code change and no deploy.

**Boundary.** `admin-console` Requirement 7 specifies the catalogue *screen* and its safety model, and
Requirement 12 specifies destructive-action confirmation; this spec re-specifies neither. It removes
the data-layer limits that stop those screens expressing what the owner wants. The locked decisions in
`_CONTEXT.md` §9 stand in full — owner-only editing (no roles/permissions), Confirmed-only front end,
price on the site as `priceFrom`, one layout = one make.

**Note on `_CONTEXT.md` freshness.** `_CONTEXT.md` §5 ("all static TypeScript — no database") and §6
("declared, never wired") predate the database being wired. This spec is written against the code as
measured in this session (`src/lib/catalogue.ts`, `catalogue-actions.ts`, `prisma/seed.mts`).

---

## Requirements

### Requirement 1 — The database is the single source of truth for the catalogue

**User Story:** As the owner, I want everything I change in the admin to be what the storefront shows, so that I stop discovering limits that only exist in code.

#### Acceptance Criteria
1. WHEN a category is created, renamed or removed in `/admin/categories` THEN THE SYSTEM SHALL show the change on the storefront's own category surfaces — the footer, the header and mobile nav, the homepage category tiles, `/shop` and `/shop/[category]` — with no code change, no re-seed and no redeploy.
2. THE SYSTEM SHALL NOT read catalogue values (category name/slug/blurb; product name/price/availability) from `src/data/products.ts` in any request-time code path; that file's arrays SHALL be a seed input only (see Requirement 2).
3. WHERE `src/components/Footer.tsx` builds its category links from `CATEGORIES` in `src/data/products.ts`, THE SYSTEM SHALL build them from the database.
4. WHEN a product is created in `/admin/products` THEN THE SYSTEM SHALL treat it as a first-class catalogue member everywhere — `/shop`, its `/products/[slug]` page, the sitemap, the related-products strip and the homepage featured row — with no code change.
5. IF the database is unreachable THEN THE SYSTEM SHALL fail on the app's honest error surface (`src/app/global-error.tsx` / `src/app/error.tsx`) and SHALL NOT silently render the static arrays as though they were current, because a silent fallback is what makes a saved admin edit look like it "did not save".

### Requirement 2 — The seed never overwrites or resurrects owner-owned rows

**User Story:** As the owner, I want my admin edits and deletions to survive a deploy, so that the catalogue I built is not undone by the next release.

#### Acceptance Criteria
1. WHEN `prisma/seed.mts` runs AND a category or product already exists (matched by slug) THEN THE SYSTEM SHALL NOT overwrite fields the owner can edit in the console — at minimum `name`, `note`, `regular`, `premium`, `rowApplicable`, `threeRowSurcharge`, `availability` and `isCarSpecific`.
2. WHEN the owner has deleted a category or product that the seed knows about THEN THE SYSTEM SHALL NOT recreate it on the next run.
3. THE SYSTEM SHALL distinguish seeding an empty database from running against a live one: the seed SHALL insert its initial rows only when the target table is empty, and SHALL otherwise leave existing rows untouched.
4. WHERE the seed currently writes authored PDP prose from `src/data/products.ts` (`materials`, `inBox`, `coverage`, `install`, `care`, `faq`, `seoDescription`; `prisma/seed.mts:124-130`) THEN THE SYSTEM SHALL either give those fields an admin home or stop treating the static file as their authority, and in either case SHALL NOT overwrite a value the owner edited.
5. IF the seed runs against the live database as part of a deploy THEN THE SYSTEM SHALL NOT change any customer-visible price, name or availability the owner set.
6. WHEN `prisma/seed-fitment.mts` runs THEN its behaviour SHALL be unchanged by this requirement, because it owns different tables (see Requirement 11).

### Requirement 3 — Categories: full lifecycle

**User Story:** As the owner, I want to create, rename and remove categories myself, so that the shop's structure is mine and not the developer's.

#### Acceptance Criteria
1. WHEN the owner creates a category THEN THE SYSTEM SHALL accept it without a code change and it SHALL satisfy Requirement 1.1.
2. WHEN the owner renames a category THEN THE SYSTEM SHALL update every storefront surface that names it (Requirement 1.1) and SHALL NOT leave the old name anywhere.
3. IF the owner removes a category that still holds products THEN THE SYSTEM SHALL refuse the delete, name the product count, and offer the two honest choices — move the products to another category, or delete the products as well — rather than a database cascade that silently takes live product pages with it.
4. WHEN the owner removes a category that holds no products THEN THE SYSTEM SHALL remove it, and SHALL record the removal per Requirement 10.
5. WHEN a category is removed THEN THE SYSTEM SHALL leave no footer, header/nav, homepage-tile or campaign reference resolving to it (Requirement 8).

### Requirement 4 — Products: full lifecycle

**User Story:** As the owner, I want to add and remove products freely, so that I can react to supply without waiting on a developer.

#### Acceptance Criteria
1. WHEN the owner creates a product THEN THE SYSTEM SHALL allow it to be added to a category, priced and published with no code change, and it SHALL satisfy Requirement 1.4.
2. IF the owner removes a product that is referenced by orders THEN THE SYSTEM SHALL refuse the hard delete, state what references it, and offer archive/deactivate (the reversible alternative in Requirement 10.3) instead.
3. WHEN the owner removes a product with no order history and no dependent rows THEN THE SYSTEM SHALL remove it and record the removal per Requirement 10.
4. WHEN a product is removed THEN its `/products/[slug]` SHALL return the app's honest not-found surface (`src/app/not-found.tsx`) and SHALL be absent from `/shop`, the sitemap (`src/app/sitemap.ts`) and any related-products strip.
5. WHEN the owner archives a product instead of deleting it THEN THE SYSTEM SHALL keep its order references and pricing history intact and SHALL remove it from the storefront the same way a delete does.

### Requirement 5 — Bundles are first-class and removable

**User Story:** As the owner, I want to create and remove bundles myself, so that a promotion I have finished is not stuck on the site because of code.

#### Acceptance Criteria
1. WHEN the owner builds a bundle THEN THE SYSTEM SHALL allow it from any two or more existing products with no code change, and no fixed list in `src/data/products.ts` (`BUNDLES`) SHALL be a precondition.
2. WHERE removing a bundle today is only the `isBundle` untick in `BundleEditor` (`src/app/admin/(console)/products/[id]/page.tsx`), THE SYSTEM SHALL provide an explicit, named "remove this bundle" action, and SHALL state plainly what the product becomes once the bundle relationship is gone.
3. IF a bundle is referenced by orders THEN THE SYSTEM SHALL refuse the hard delete and offer "convert to a normal product" (keeping its own typed price) instead.
4. WHEN a bundle's parts or discount change THEN THE SYSTEM SHALL recompute the derived price exactly as `saveBundle` does today, and SHALL write the audit entry it writes today.
5. WHEN a bundle's last part is removed THEN THE SYSTEM SHALL state honestly what the price becomes, rather than leaving a stale derived figure that the shop would quote.

### Requirement 6 — Variations: full lifecycle

**User Story:** As the owner, I want to add and remove a product's options myself, so that a colourway or a layer can be retired without a developer.

#### Acceptance Criteria
1. WHEN the owner creates a variation THEN THE SYSTEM SHALL accept it and it SHALL be sellable from its product page with no code change.
2. WHEN the owner removes a variation THEN THE SYSTEM SHALL remove it from the product page and the buy controls.
3. IF a variation is referenced by orders or by a `LayoutVariant` THEN THE SYSTEM SHALL refuse the hard delete, name the reference, and offer deactivate instead.
4. WHEN a variation is removed or deactivated THEN THE SYSTEM SHALL ensure nothing in the storefront still offers it — no cart line, no buy control, no campaign lock pointing at it.

### Requirement 7 — Pricing is owner-controlled and unambiguous

**User Story:** As the owner, I want to set every price I charge from the admin and know exactly which figure the site will show, so that a price I quoted in WhatsApp is the price the customer sees.

#### Acceptance Criteria
1. WHEN the owner sets a product's or variation's price THEN THE SYSTEM SHALL make that figure the one the storefront, the cart and the WhatsApp quote use, with no code change and no re-seed.
2. WHERE a product's price is superseded by a `LayoutVariant.priceFrom` (locked decision 3, `fitment-engine` 16.5) THEN THE SYSTEM SHALL show the owner which figure each surface will use, and SHALL NOT let a catalogue-price edit silently lose to, or silently overwrite, a layout price.
3. WHEN the owner changes a price THEN THE SYSTEM SHALL require the confirmation and `reason` of `admin-console` Requirement 12 and write an `AuditEntry` carrying the before and after figures.
4. WHEN the owner changes a price THEN THE SYSTEM SHALL revalidate the storefront routes that render it, so `/shop`, `/products/[slug]` and `/fit-finder` cannot disagree with the admin (the behaviour `admin-console` 7.4 already specifies).
5. WHILE a product is a bundle with `derivePricing` on, THE SYSTEM SHALL NOT accept a hand-typed price that contradicts its parts, and SHALL say so rather than storing two truths.

### Requirement 8 — Removing a catalogue row leaves no broken storefront surface

**User Story:** As the owner, I want to remove things without the site breaking around them, so that I do not have to ask a developer what else a deletion touched.

#### Acceptance Criteria
1. WHEN a category, product, variation or bundle is removed THEN THE SYSTEM SHALL leave every storefront surface that referenced it resolving correctly — the footer, the header/mobile nav, the homepage tiles, `/shop`, `/shop/[category]`, the sitemap, the related-products strip and any campaign.
2. WHEN a product that a campaign targets is removed THEN THE SYSTEM SHALL fail at build time with a named error (the mechanism `assertCampaignLandings` in `src/data/landing.ts` already uses) rather than ship an ad link that 404s.
3. WHEN the owner removes a row THEN THE SYSTEM SHALL report, before the removal is committed, every storefront surface and campaign that names it.

### Requirement 9 — Campaign targets come from the catalogue, not a hand-written union

**User Story:** As the owner, I want to advertise any product I have created, so that a new arrival can run ads without a deploy.

#### Acceptance Criteria
1. WHEN the owner creates a product THEN THE SYSTEM SHALL allow it to be named as a campaign target (the `?product=` value resolved by `resolveCampaign`) without editing `src/lib/product-slug.ts`.
2. THE SYSTEM SHALL NOT encode the set of products as a hand-written type union (`src/lib/product-slug.ts` imports `PRODUCTS` from `src/data/products.ts`) that a database product cannot join.
3. WHEN a campaign names a product that does not exist THEN THE SYSTEM SHALL fail the build (existing `assertCampaignLandings`) rather than resolve to a dead page.
4. WHERE a campaign locks a variation (`variationSlug`, `src/data/landing.ts`) THEN THE SYSTEM SHALL validate it against the product's real variations, as it does today.

### Requirement 10 — Destructive actions stay safe, owner-only and audited

**User Story:** As the owner, I want removing something to be deliberate and reversible where it matters, so that a mistake costs minutes rather than a customer's order.

#### Acceptance Criteria
1. WHEN the owner removes any catalogue row THEN THE SYSTEM SHALL require the confirmation of `admin-console` Requirement 12 — a second explicit press and a reason typed rather than selected — and SHALL write an `AuditEntry`.
2. THE SYSTEM SHALL remain owner-only: no roles, no permissions, no multi-user access (locked decision 1).
3. WHERE a removal would break an order or another live row THEN THE SYSTEM SHALL offer archive, deactivate or retire as a reversible alternative rather than presenting delete as the only path (Requirements 4.2, 4.5, 5.3, 6.3).
4. WHEN a removal is performed THEN THE SYSTEM SHALL be reversible by a second, separately-audited action wherever Section 10.3 applies, matching `admin-console` Requirement 12.7 (undo by reason, not by delete).

### Requirement 11 — Boundary with the existing specs

**User Story:** As a spec reader, I want to know which document owns what, so that the catalogue rules live in one place.

#### Acceptance Criteria
1. THIS SPEC SHALL NOT re-specify the catalogue screen (`admin-console` Requirement 7) or destructive-action confirmation (`admin-console` Requirement 12); it removes the data-layer limits those screens depend on.
2. WHERE this spec and `storefront-catalog` both touch catalogue rendering, `storefront-catalog` owns the display and this spec owns the data source.
3. THE SYSTEM's changes to `prisma/seed.mts` SHALL NOT alter `prisma/seed-fitment.mts`, the fitment tables, or any row `fitment-engine` owns.
4. THIS SPEC SHALL NOT loosen any locked decision in `_CONTEXT.md` §9, and in particular SHALL NOT expose an `Inferred` layout to the front end or merge two makes into one layout.
