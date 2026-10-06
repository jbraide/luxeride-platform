-- Single layer and double layer stop being two PRODUCTS and become two OPTIONS of one.
--
-- The owner's correction, restated: "single layer and double layers are types of floor
-- mats, should not be treated as a separate product, should be a multi choice that's open
-- in the product."
--
-- WHAT WAS WRONG WITH TWO PRODUCTS
--
-- Two products means two URLs, two product pages, two `/shop` cards, two entries in the
-- sitemap and two names for the same object. A customer who came for floor mats had to
-- work out which of two things was the thing they wanted, and the Fit Finder had to
-- pretend the choice was a product choice (`MAT_TYPE_SLUG` mapped a layer kind to a
-- product slug) so that picking "single layer" replaced the product it was selling.
--
-- The schema was already right for this: `ProductVariation` is an option of a product, it
-- carries its own price, and `LayoutVariant.variationId` says which option a floor pan is
-- cut for. Every one of those tables had exactly one option per product, which is the state
-- "one thing at one price" is expressed in. This migration is the data saying what the
-- model was built for.
--
-- NOTHING IS RE-TYPED. The 424 `LayoutVariant` rows (212 pans x 2 layers) and all 3,392
-- `RangePrice` rows hanging off them are REPOINTED, not recreated, so every per-year price
-- the owner has already entered survives the merge untouched. `RangePrice` keys on
-- `layoutVariantId`, so it follows the variant wherever it goes.
--
-- WHAT THIS COSTS, STATED PLAINLY
--
--   - `/products/single-layer-mats` and `/products/double-layer-mats` stop existing. They
--     are 307-redirected in `next.config.ts` to `/products/floor-mats?variation=...`,
--     which is the 307-not-308 rule the category redirect already follows: a permanent
--     redirect to a URL that may itself be renamed cannot be undone by anyone.
--   - A PRODUCT-SCOPED PROMOTION can no longer target "double layer" alone; it would
--     silently widen to the whole product. The migration REFUSES if one exists rather than
--     widening it, because that is a money decision and not this file's to make. (A
--     variation-scoped promotion is the fix, and it is not built here.)
--   - `Product.regular`/`premium` keep the SINGLE-LAYER figures, because they are the
--     fallback a quote reads when no option has been chosen. The customer-facing band on
--     the product page is now computed across the options in `priceRange()`, so the page
--     shows ₦45,000 – ₦68,000 rather than one of them.
--
-- The PDP copy is carried across from the single-layer row, whose text already describes
-- both ("laser-measured TPE floor mats cut to your exact car, single or double layer").
-- Per-option prose on a variation is not modelled yet and is not invented here.
--
-- Applied through the shadow-free path (db execute + migrate resolve).

-- ─── 0. Refuse rather than silently change what a promotion means ────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Promotion" pr
    JOIN "Product" p ON p.id = pr."productId"
    WHERE p.slug IN ('single-layer-mats', 'double-layer-mats')
  ) THEN
    RAISE EXCEPTION
      'A product-scoped promotion targets a mats product. Merging them would widen that promotion to both layers. Narrow or delete it, then re-run.';
  END IF;
END $$;

-- ─── 1. The merged product ───────────────────────────────────────────────────────
-- Readable ids, like `layout-toyota-corolla`: the house style here is an id that says
-- what the row is, and a fixed one makes this file safe to re-run.
INSERT INTO "Product" (
  id, "categoryId", slug, name, note, regular, premium, "rowApplicable",
  "threeRowSurcharge", images, availability, materials, "inBox", coverage,
  install, care, faq, "seoDescription", "isCarSpecific", "createdAt", "updatedAt"
)
SELECT
  'product-floor-mats', p."categoryId", 'floor-mats', 'Floor Mats', p.note,
  p.regular, p.premium, p."rowApplicable", p."threeRowSurcharge", p.images,
  p.availability, p.materials, p."inBox", p.coverage, p.install, p.care, p.faq,
  p."seoDescription", p."isCarSpecific", p."createdAt", p."updatedAt"
FROM "Product" p
WHERE p.slug = 'single-layer-mats'
  AND NOT EXISTS (SELECT 1 FROM "Product" WHERE slug = 'floor-mats');

-- ─── 2. Its two options, each carrying the price the old product carried ──────────
INSERT INTO "ProductVariation" (
  id, "productId", slug, name, regular, premium, "rowApplicable",
  "threeRowSurcharge", sku, "stockState", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  'var-floor-mats-' || CASE p.slug WHEN 'single-layer-mats' THEN 'single-layer'
                                   ELSE 'double-layer' END,
  'product-floor-mats',
  CASE p.slug WHEN 'single-layer-mats' THEN 'single-layer' ELSE 'double-layer' END,
  CASE p.slug WHEN 'single-layer-mats' THEN 'Single Layer' ELSE 'Double Layer' END,
  v.regular, v.premium, v."rowApplicable", v."threeRowSurcharge", v.sku,
  v."stockState",
  CASE p.slug WHEN 'single-layer-mats' THEN 1 ELSE 2 END,
  v."createdAt", v."updatedAt"
FROM "ProductVariation" v
JOIN "Product" p ON p.id = v."productId"
WHERE p.slug IN ('single-layer-mats', 'double-layer-mats')
  AND NOT EXISTS (SELECT 1 FROM "ProductVariation" WHERE id LIKE 'var-floor-mats-%');

-- A product with no option has nothing the shop can sell, so this is checked rather than
-- assumed: an option per old mats product is the invariant the merge depends on.
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(slug, ', ') INTO missing
  FROM "Product" p
  WHERE p.slug IN ('single-layer-mats', 'double-layer-mats')
    AND NOT EXISTS (SELECT 1 FROM "ProductVariation" v WHERE v."productId" = p.id);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'No variation found for: %', missing;
  END IF;
END $$;

-- ─── 3. Every floor pan now offers one product, in two layers ────────────────────
-- Keyed off the OLD product's slug rather than off `LayoutVariant.kind`: the slug says
-- which product the row belonged to, which is the fact being moved. `kind` is left alone
-- \u2014 it is the word "single_layer"/"double_layer" that `matTypes` reads on the storefront.
UPDATE "LayoutVariant" lv
SET "productId"   = 'product-floor-mats',
    "variationId" = CASE p.slug
                      WHEN 'single-layer-mats' THEN 'var-floor-mats-single-layer'
                      ELSE 'var-floor-mats-double-layer'
                    END
FROM "Product" p
WHERE p.id = lv."productId"
  AND p.slug IN ('single-layer-mats', 'double-layer-mats');

-- The unique key is (layoutId, productId, kind), so two rows could only collide if one
-- pan already offered the same product under the same kind twice. The database would
-- refuse this statement anyway; saying so here names the cause instead of an index name.
DO $$
DECLARE clash TEXT;
BEGIN
  SELECT string_agg(layout_id || '/' || kind, ', ') INTO clash
  FROM (
    SELECT "layoutId" AS layout_id, kind, COUNT(*) AS n
    FROM "LayoutVariant"
    WHERE "productId" = 'product-floor-mats'
    GROUP BY "layoutId", kind
    HAVING COUNT(*) > 1
  ) duplicates;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Two offers would land on the same (pan, product, kind): %', clash;
  END IF;
END $$;

-- ─── 4. The bundle still means what it meant ─────────────────────────────────────
-- `full-bundle` is "Double Layer Mats + Seat Covers". The mats part moves to the merged
-- product AND now NAMES the double-layer option, which is more precise than the row it
-- replaces: it used to say "the product called Double Layer Mats", and now it says "the
-- double layer option of Floor Mats". A bundle that named no option would silently become
-- "mats, whichever layer" \u2014 a cheaper bundle than the owner built.
UPDATE "BundleItem" bi
SET "productId"   = 'product-floor-mats',
    "variationId" = 'var-floor-mats-double-layer'
FROM "Product" p
WHERE p.id = bi."productId"
  AND p.slug = 'double-layer-mats';

-- ─── 4b. What somebody ALREADY BOUGHT ───────────────────────────────────────────
-- `OrderItem.productId` is `Restrict`, and it is right to be: a product somebody has been
-- sold must not vanish underneath the record of the sale. There is one such line here (a
-- 2007 Toyota Matrix, single layer, \u20a645,000), so the two old products cannot simply be
-- deleted.
--
-- The line is REPOINTED, not rewritten. Every frozen snapshot on it is left exactly as it
-- was \u2014 `unitPrice`, `lineTotal`, `brandSnapshot`, `modelSnapshot`, `yearSnapshot`, `rows`
-- \u2014 and those are the fields the order page, the refund conversation and the books all
-- read. The only things that move are the two references: the product, and the option.
--
-- SETTING THE OPTION IS A CORRECTION, NOT A REWRITE. The line was written before
-- `ProductVariation` existed and carries `variationId = null`, which means "the product,
-- option unspecified" \u2014 but the product it names was literally called "Single Layer Mats"
-- and was sold at the single-layer price, so the option was always knowable. Naming it
-- records what the line already said about itself. Leaving it null on a merged product
-- would say "mats, layer unknown" about the one order whose layer we know for certain.
--
-- Each line is audited, so the change is legible afterwards rather than being something
-- somebody has to take on trust.
INSERT INTO "AuditEntry" (id, entity, "entityId", action, field, before, after, note, "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text)::uuid::text,
  'OrderItem', oi.id::text, 'update', 'productId',
  json_build_object('productId', p.slug, 'variationId', NULL)::jsonb,
  json_build_object('productId', 'floor-mats', 'variationId',
    CASE p.slug WHEN 'single-layer-mats' THEN 'single-layer' ELSE 'double-layer' END)::jsonb,
  'single layer and double layer became options of one Floor Mats product; this line''s frozen price, car and row count are unchanged',
  now()
FROM "OrderItem" oi
JOIN "Product" p ON p.id = oi."productId"
WHERE p.slug IN ('single-layer-mats', 'double-layer-mats');

UPDATE "OrderItem" oi
SET "productId"   = 'product-floor-mats',
    "variationId" = CASE p.slug
                      WHEN 'single-layer-mats' THEN 'var-floor-mats-single-layer'
                      ELSE 'var-floor-mats-double-layer'
                    END
FROM "Product" p
WHERE p.id = oi."productId"
  AND p.slug IN ('single-layer-mats', 'double-layer-mats');

-- ─── 5. The two old products go ──────────────────────────────────────────────────
-- Last, and only because of the order above: `LayoutVariant.productId` and
-- `.variationId` are `Restrict`, as is `OrderItem.productId`, so deleting them while a row
-- still pointed at them would fail. Nothing has pointed at them since steps 3 and 4b. Each
-- product's own variation goes with it (`ProductVariation.productId` is `Cascade`), and by
-- then no row references them.
DELETE FROM "Product" WHERE slug IN ('single-layer-mats', 'double-layer-mats');