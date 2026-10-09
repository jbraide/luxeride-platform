# Implementation Plan

## Status
**NOT STARTED — 0 done, 24 remaining.** No task below is marked `- [x]`: nothing in this feature has been
written yet. The `_(verified: …)_` convention is used only for items checked by reading code, of which
there are none here yet.

- [ ] 1. Stop the static catalogue arrays being a runtime source
  - [ ] 1.1 Add `listNavCategories()` to `src/lib/catalogue.ts` and switch `src/components/Footer.tsx` to it _(P0)_
    - _Requirements: 1.1, 1.3_
  - [ ] 1.2 Fetch categories once in `src/app/layout.tsx` and pass them to `src/components/Header.tsx` and `src/components/MobileNav.tsx` _(P0)_
    - _Requirements: 1.1_
  - [ ] 1.3 Move campaign product and variation validation in `src/data/landing.ts` off the static `getProductBySlug` and onto `src/lib/catalogue.ts`, keeping the `ALLOWED_OFFER` guard _(P0)_
    - _Requirements: 9.1, 9.3, 9.4_
  - [ ] 1.4 Replace the hand-written `ProductSlug` union in `src/lib/product-slug.ts` with runtime validation against the catalogue, or delete the file if nothing still needs the narrow type _(P1)_
    - _Requirements: 9.1, 9.2_
  - [ ] 1.5 Remove any static-fallback path so an unreachable database renders `src/app/error.tsx` / `src/app/global-error.tsx` instead of the static arrays _(P0)_
    - _Requirements: 1.5_

- [ ] 2. Make the seed insert-only for owner-owned rows
  - [ ] 2.1 Add an `isTableEmpty` guard to `prisma/seed.mts` and skip each entity whose table is non-empty _(P0)_
    - _Requirements: 2.1, 2.3_
  - [ ] 2.2 Stop writing owner-editable columns (`name`, `note`, `regular`, `premium`, `rowApplicable`, `threeRowSurcharge`, `images`, `availability`) and the PDP prose on a non-empty table _(P0)_
    - _Requirements: 2.1, 2.4, 2.5_
  - [ ] 2.3 Confirm a category or product the owner deleted is not recreated on the next run _(P0)_
    - _Requirements: 2.2_

- [ ] 3. Archive: schema, reads and actions
  - [ ] 3.1 Add `archivedAt DateTime?` to `Product` and `ProductVariation` in `prisma/schema.prisma`, with a migration _(P0)_
    - _Requirements: 4.5, 6.3_
  - [ ] 3.2 Filter `archivedAt: null` in the storefront reads in `src/lib/catalogue.ts` and leave the admin reads unfiltered _(P0)_
    - _Requirements: 4.4, 6.4_
  - [ ] 3.3 Add `archiveProduct` / `unarchiveProduct` and `archiveVariation` / `unarchiveVariation` to `src/app/admin/(console)/catalogue-actions.ts`, each writing an `AuditEntry` _(P0)_
    - _Requirements: 4.5, 6.3, 10.1_

- [ ] 4. Category lifecycle
  - [ ] 4.1 Add `moveCategoryProducts` and `deleteCategoryAndProducts` to `src/app/admin/(console)/catalogue-actions.ts`, leaving the existing empty-category `deleteCategory` as-is _(P1)_
    - _Requirements: 3.3_
  - [ ] 4.2 Update `src/app/admin/(console)/categories/page.tsx` to present "move products" first and the "delete them too" action as the second, separately-confirmed choice _(P1)_
    - _Requirements: 3.3, 10.1_

- [ ] 5. Product and variation lifecycle
  - [ ] 5.1 Add a pre-removal references report (orders, `layoutVariants`) to `src/app/admin/(console)/catalogue-actions.ts` so a refusal names what holds the row _(P1)_
    - _Requirements: 8.3_
  - [ ] 5.2 Add an archive control beside the delete control in `src/app/admin/(console)/products/[id]/page.tsx`, mirroring the disabled-button pattern in `src/app/admin/(console)/categories/page.tsx` _(P1)_
    - _Requirements: 4.2, 6.3_

- [ ] 6. Bundles are removable
  - [ ] 6.1 Add an explicit `removeBundle` action to `src/app/admin/(console)/catalogue-actions.ts` that deletes the `Bundle` row and its `BundleItem`s while the `Product` survives, refusing when the product has order history _(P0)_
    - _Requirements: 5.2, 5.3_
  - [ ] 6.2 Add a "Remove this bundle" control to `BundleEditor` in `src/app/admin/(console)/products/[id]/page.tsx`, stating on screen what the product becomes _(P0)_
    - _Requirements: 5.2_
  - [ ] 6.3 State the price consequence when the last part is taken out, so a stale derived figure cannot be quoted _(P1)_
    - _Requirements: 5.5_

- [ ] 7. Pricing precedence is visible
  - [ ] 7.1 Render the catalogue price and any `LayoutVariant.priceFrom` together in `src/app/admin/(console)/products/[id]/page.tsx` and refuse a save that would silently overwrite a layout price _(P1)_
    - _Requirements: 7.1, 7.2, 7.5_

- [ ] 8. Tests
  - [ ] 8.1 Extend `scripts/catalogue-guard.test.mjs` with the archive and move-refusal rules in `src/app/admin/(console)/catalogue-guard.ts` _(P0)_
    - _Requirements: 10.1_
  - [ ] 8.2 Add a static-coupling guard test that fails when any `src/` runtime module imports `CATEGORIES` / `PRODUCTS` / `getProductBySlug` from `@/data/products` for data _(P0)_
    - _Requirements: 1.2_
  - [ ] 8.3 Add a seed-idempotency helper test (no database) asserting "skip when non-empty, insert when empty" _(P1)_
    - _Requirements: 2.1, 2.3_
  - [ ] 8.4 Add a rendered-path check: create a category, assert it appears in the footer HTML; delete a product, assert its PDP returns `not-found` and it is absent from `/shop` and `src/app/sitemap.ts` _(P1)_
    - _Requirements: 1.1, 4.4, 8.1_
