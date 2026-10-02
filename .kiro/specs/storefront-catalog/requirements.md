# Requirements Document — storefront-catalog

## Introduction

LuxeRide today is a validated fitment funnel wearing a catalogue as a hat. The parts that make money —
the car→year→product→row configurator, the tier/row pricing maths, the multi-item cart and the WhatsApp
handoff — work. Everything *around* them is a shell: on a phone you cannot reach the shop, the footer is
two lines of text with no links, categories are query parameters with no indexable URL, five of seven
products render an empty grey box because their image files do not exist, and the whole site shares one
global metadata object, so a shared link in a WhatsApp thread or a Google result looks like the same
generic page.

This feature turns the shell into a storefront. It covers catalogue browsing, the category structure, the
product detail page, site navigation, product discovery, product imagery and the technical SEO
foundation. It deliberately does **not** cover the fitment engine, checkout, payments, orders or
analytics — those belong to `fitment-engine`, `commerce-backend` and `analytics-tracking`.

Without this feature: paid Nigerian mobile traffic lands on a page it cannot navigate, sees empty image
slots on 5 of 7 products, cannot be retargeted on a stable category URL, produces generic link previews,
and cannot be indexed as a catalogue at all.

**Read-only note.** Every file under `luxeride-web/src/`, `luxeride-web/public/` and `luxeride-web/next.config.ts`
is read-only to this spec. The tasks below are instructions for whoever implements them.

**Minimum viable honest storefront (P0 only, buildable this week):** the site builds and deploys, a phone
user can reach every route from a hamburger menu, every product shows *something* on-brand instead of a
grey void, `/shop/<category>` is a real indexable page, the PDP states what the product is, what it costs,
what's in the box, when it arrives and how to get it, and every page emits its own title, description,
canonical, Open Graph and Twitter card. That is enough to run ads on honestly. Reviews, video, zoom,
cross-sell and object storage can wait.

---

## Requirements

### Requirement 1 — A storefront that can actually be deployed

**User Story:** As the owner, I want the production build to succeed, so that I can put this site in front of paid traffic today.

#### Acceptance Criteria

1.1 WHEN `npm run build` is executed in `luxeride-web/` THEN THE SYSTEM SHALL exit with code 0 and write `.next/BUILD_ID`.

1.2 WHERE the build fails today on `prisma/seed.ts(2,34): error TS2307: Cannot find module './data/products'` THEN THE SYSTEM SHALL exclude `prisma/**` from the TypeScript program that Next.js type-checks, so a file that is not part of the app runtime can no longer abort the app build.

1.3 IF `prisma/seed.ts` remains in the repository THEN THE SYSTEM SHALL still type-check cleanly when it is checked directly, and the `db:seed` script SHALL NOT be advertised in `README.md` as working while `ts-node` is absent from `package.json`.

1.4 WHEN `npx tsc --noEmit` and `npx eslint .` are run in `luxeride-web/` THEN THE SYSTEM SHALL report zero errors, so that `README.md`'s claim is true.

---

### Requirement 2 — Navigation a Nigerian phone can actually use

**User Story:** As a visitor on a phone who arrived from an ad, I want a menu button, so that I can reach the shop, the fit finder and my cart from any page.

#### Acceptance Criteria

2.1 WHEN the viewport is narrower than Tailwind's `sm` breakpoint (640px) THEN THE SYSTEM SHALL render a single always-visible navigation control in `Header` that opens the full navigation.

2.2 WHEN that control is activated THEN THE SYSTEM SHALL reveal every top-level destination in a panel that does not require JavaScript to be usable, and the panel SHALL trap nothing but SHALL close on Escape, on backdrop click, and on navigation.

2.3 IF JavaScript has not loaded THEN THE SYSTEM SHALL still expose the full navigation through markup that works without it.

2.4 WHILE the mobile navigation panel is open THEN THE SYSTEM SHALL prevent background scrolling and SHALL announce its state to assistive technology via `aria-expanded` and `aria-controls`.

2.5 WHEN a route is rendered THEN THE SYSTEM SHALL mark the navigation item for that route as the current page using `aria-current="page"`.

2.6 IF the visitor uses a hardware keyboard THEN THE SYSTEM SHALL allow Escape to close the panel and SHALL keep the trigger button focused after closing.

2.7 WHEN any viewport width is used THEN THE SYSTEM SHALL keep the cart control and its item-count badge reachable, including at 320px width.

---

### Requirement 3 — A footer that carries trust, policies and contact

**User Story:** As a first-time buyer who has been burned by online car-accessory sellers before, I want to see who you are, how you deliver, and what your guarantees are before I message you, so that I trust you enough to send a WhatsApp message.

#### Acceptance Criteria

3.1 WHEN any page is rendered THEN THE SYSTEM SHALL render a footer containing at least: links to every category, links to Shop / Fit Finder / Cart, a contact block using `WHATSAPP_NUMBER` from `src/data/locations.ts`, and links to the policy routes defined in 3.3.

3.2 IF a visitor is on a phone THEN THE SYSTEM SHALL render the footer link list without horizontal scrolling and SHALL keep tap targets at least 44px tall.

3.3 WHEN the footer policy links are followed THEN THE SYSTEM SHALL resolve to real pages at `/policies/delivery`, `/policies/returns`, `/policies/privacy` and `/policies/terms`, each of which SHALL state the specific commitment (delivery zones, fees and ETAs from `LOCATIONS`; the Fit Guarantee mechanics; what customer data is kept and where) rather than a placeholder sentence.

3.4 IF the footer states a delivery fee or an ETA THEN THE SYSTEM SHALL source that figure from `LOCATIONS` in `src/data/locations.ts` so the footer and the checkout cannot disagree.

3.5 WHEN the footer renders the Fit Guarantee THEN THE SYSTEM SHALL state the mechanic that actually exists today — a WhatsApp-verified swap — and SHALL NOT claim refunds, returns processing or a money-back guarantee that no code path implements.

3.6 IF a policy page is requested for a slug that does not exist THEN THE SYSTEM SHALL return the site's 404 page with a link back to `/shop`.

---

### Requirement 4 — Categories are real routes, not query parameters

**User Story:** As a customer arriving from a category-targeted ad or a Google search, I want a real, shareable, indexable category page, so that the link I was sent works, reads correctly in search, and can be advertised.

#### Acceptance Criteria

4.1 WHEN a visitor requests `/shop/floor-mats` THEN THE SYSTEM SHALL render a category page served by `src/app/shop/[category]/page.tsx` as a Server Component, with the category name as its `<h1>` and that category's `blurb` as body copy.

4.2 IF the requested slug does not exist in `CATEGORIES` THEN THE SYSTEM SHALL call `notFound()` and return the site's 404 page with a real HTTP 404 status.

4.3 WHEN `/shop?category=<slug>` is requested for a slug in `CATEGORIES` THEN THE SYSTEM SHALL redirect (HTTP 307) to `/shop/<slug>` so that the legacy ad URLs, the existing `CategoryTile` links and any bookmarked query URLs all converge on one canonical address.

4.4 IF `/shop?category=<unknown>` is requested THEN THE SYSTEM SHALL leave the visitor on `/shop` and SHALL NOT redirect into a non-existent page.

4.5 WHEN any category page is rendered THEN THE SYSTEM SHALL emit `alternates.canonical` pointing at the unparameterised `/shop/<slug>` address, never at a `?category=` address.

4.6 IF a category page is requested THEN THE SYSTEM SHALL list only products whose `categorySlug` equals the requested slug, and SHALL state the result count in visible copy.

4.7 IF a category currently has no products THEN THE SYSTEM SHALL render an honest empty state naming the category and offering `/shop` and the Fit Finder, and SHALL NOT render an empty grid.

4.8 WHEN `/shop` is rendered with no query parameters THEN THE SYSTEM SHALL show all products, SHALL emit `alternates.canonical: "/shop"`, and SHALL NOT read `searchParams` at request time.

4.9 WHEN the build runs THEN THE SYSTEM SHALL prerender `/shop` and all five `/shop/<slug>` pages at build time, marking them static or revalidated rather than dynamic.

4.10 IF the architecture plan's site map conflicts with a category URL THEN THE SYSTEM SHALL follow the architecture plan: `/shop/<category>` is the real route.

---

### Requirement 5 — The product detail page has to sell

**User Story:** As a buyer on a phone comparing three mat suppliers, I want to see what this product is made of, what I get, how it goes in, when it arrives and whether it fits my car, so that I can decide without messaging anyone.

#### Acceptance Criteria

5.1 WHEN a product page is rendered THEN THE SYSTEM SHALL show: the product name, its `note`, a price presented as a "from" figure plus the range and the reason the range exists, the category it belongs to as a breadcrumb, and the Fit Guarantee.

5.2 IF the range shown spans more than one figure THEN THE SYSTEM SHALL state explicitly that the final price depends on the car's tier and, where `rowApplicable` is true, the row configuration — using the same two facts the existing `priceRange()` helper computes.

5.3 WHEN the product page is rendered THEN THE SYSTEM SHALL display the shipping fee range and the ETA range taken from `LOCATIONS`, and SHALL state that the zone fee is calculated at checkout, because today the checkout is the only place the zone is known.

5.4 WHEN the product page is rendered THEN THE SYSTEM SHALL include a "What's in the box" list, a materials/construction block, a coverage statement, and an installation-and-care block for every product in `PRODUCTS`.

5.5 IF a product has no installation detail on record THEN THE SYSTEM SHALL state the conservative, true version ("Supplied with fixing clips; no drilling required") rather than inventing a procedure.

5.6 WHEN the product page is rendered THEN THE SYSTEM SHALL show every angle in `Product.images[]` as an interactive gallery with a selected main image and thumbnail controls, keyboard-operable, rather than the current horizontally scrolling strip with no selection.

5.7 IF a gallery image fails to load THEN THE SYSTEM SHALL replace it with the on-brand placeholder panel, never collapse the slot, and never leave an empty grey rectangle.

5.8 WHEN the visitor scrolls the product page on a phone THEN THE SYSTEM SHALL keep one primary call to action reachable, pinned to the bottom of the viewport, and that call to action SHALL link to `/fit-finder?product=<slug>` — the same locked entry point the page already uses.

5.9 IF the sticky call to action overlaps other content THEN THE SYSTEM SHALL keep it clear of the on-screen home indicator and SHALL NOT cover the footer.

5.10 WHEN the product page is rendered THEN THE SYSTEM SHALL include an FAQ section for every product, and any question whose answer is not on record SHALL be omitted rather than filled with invented copy.

5.11 IF a product slug does not exist THEN THE SYSTEM SHALL call `notFound()` and return the site's 404 page carrying `/shop`, the Fit Finder and a WhatsApp link.

5.12 WHEN a product page is rendered THEN THE SYSTEM SHALL show, for every applicable product, that the price shown is the price band for the customer's car tier and is confirmed on WhatsApp before dispatch.

---

### Requirement 6 — Availability is stated honestly

**User Story:** As a buyer, I want to know whether this will actually arrive, so that I don't part with money for something that cannot be made for my car.

#### Acceptance Criteria

6.1 WHILE no stock, supplier-lead-time or fitment-confirmation system exists THEN THE SYSTEM SHALL NOT display the words "in stock", "ready to ship", "available now" or any equivalent availability claim about a specific car, because no code path establishes it.

6.2 WHEN a product is shown THEN THE SYSTEM SHALL describe availability as "made to order for your exact car" and SHALL route the availability question to the Fit Finder, which is the only component that actually resolves car → fit.

6.3 IF the fitment engine later provides a Confirmed-only availability check THEN THE SYSTEM SHALL replace 6.2's copy with the Confirmed / NOT STOCKED / UNKNOWN three-state wording, and SHALL never surface the Inferred state.

6.4 WHEN any page is rendered THEN THE SYSTEM SHALL keep its availability wording consistent with the Fit Finder results screen so the catalogue and the configurator cannot contradict each other.

---

### Requirement 7 — Finding a product without knowing the exact name

**User Story:** As a buyer who half-remembers "the mat thing" or "boot liner", I want to search and sort what is on the shop page, so that I can reach the right product in seconds instead of scanning a grid.

#### Acceptance Criteria

7.1 WHEN the shop page or a category page is rendered THEN THE SYSTEM SHALL provide a search control that filters the visible product set.

7.2 IF a search term is entered THEN THE SYSTEM SHALL match case-insensitively against the product `name` and `note`, and SHALL also match the category `name`, so that "mats", "TPE", "waterproof" and "boot" all return results.

7.3 WHEN the search term matches nothing THEN THE SYSTEM SHALL show an honest empty state naming the term, offering to clear the search, offering `/shop`, and offering a WhatsApp message pre-filled with the term — never a blank area.

7.4 WHILE a search term is active THEN THE SYSTEM SHALL show the result count in visible copy and SHALL announce the new count to assistive technology via a polite live region.

7.5 WHEN the shop page is rendered THEN THE SYSTEM SHALL offer sorting by Featured, Price (low to high), Price (high to low) and Name, with Price sorting comparing the lower bound of `priceRange()` for ascending order.

7.6 IF the sort control is changed THEN THE SYSTEM SHALL update the visible order immediately without a full page navigation.

7.7 WHEN a search term is submitted THEN THE SYSTEM SHALL be operable from the keyboard alone, including from a hardware keyboard on the shop page.

7.8 IF the catalogue ever grows past 50 products THEN THE SYSTEM SHALL move search and sort state into the URL so results are shareable; below that size it SHALL keep them in client state so the route stays static.

---

### Requirement 8 — Breadcrumbs on every catalogue page

**User Story:** As a visitor who arrived from a deep link, I want to know where I am and how to get back up, so that I never feel trapped on a single product.

#### Acceptance Criteria

8.1 WHEN any category or product page is rendered THEN THE SYSTEM SHALL display a visible breadcrumb trail whose entries are real links, ordered Home → Shop → Category → Product, with the current page marked `aria-current="page"` and not linked.

8.2 WHEN a breadcrumb trail is rendered on a product page THEN THE SYSTEM SHALL emit matching `BreadcrumbList` JSON-LD so the trail in Google's result is the same trail a visitor sees.

8.3 IF the visitor navigates back up via a breadcrumb THEN THE SYSTEM SHALL land on the correct catalogue page rather than the site root.

8.4 WHEN a breadcrumb trail is rendered THEN THE SYSTEM SHALL remain readable at 320px width without truncating any label.

---

### Requirement 9 — Product imagery never looks broken

**User Story:** As a buyer, I want to see a real picture or a deliberate-looking panel — never an empty grey box — so that the site looks like a business and not a broken build.

#### Acceptance Criteria

9.1 WHEN a product has no usable image file THEN THE SYSTEM SHALL render an on-brand placeholder panel that uses the existing LuxeRide visual language (gold `#d4af37` reticle corners, `#1c1916`→`#0a0a0a` gradient, 4:3), carries the product name, and occupies the full aspect box at the same size as the real image would.

9.2 WHILE an image is loading THEN THE SYSTEM SHALL show a blurred, 16-pixel-wide placeholder derived from the image itself where one exists, or a neutral panel where one does not, so that layout does not shift when the image arrives.

9.3 IF an image request fails at runtime THEN THE SYSTEM SHALL swap in the same placeholder panel used in 9.1, not remove the slot.

9.4 WHEN the production build runs THEN THE SYSTEM SHALL fail with a non-zero exit code and a message naming every missing file if any path in `Product.images[]` does not resolve to a real file in `public/`, so the current class of bug cannot return.

9.5 WHILE a missing-image condition exists THEN THE SYSTEM SHALL keep the page layout, price, title and call to action unchanged, so a missing file degrades appearance only and never removes commercial content.

9.6 WHEN an image is rendered THEN THE SYSTEM SHALL declare an intrinsic aspect ratio (via the containing box or explicit `width`/`height`) so that cumulative layout shift stays at zero.

9.7 IF an image is decorative rather than informative THEN THE SYSTEM SHALL give it an empty `alt`; otherwise it SHALL describe the product and the angle.

9.8 WHEN a card image is rendered THEN THE SYSTEM SHALL declare a `sizes` value that matches the actual grid at every breakpoint, so no viewport is served an oversized file.

---

### Requirement 10 — Turning the raw media into served product media

**User Story:** As the owner, I want the photographs and footage that already exist on disk turned into correctly oriented, compressed, right-sized files the site can serve, so that I can ship real product media without hand-processing it each time.

#### Acceptance Criteria

10.1 WHEN the media pipeline runs over the source photographs THEN THE SYSTEM SHALL apply the EXIF orientation before any resize, so that no output is rotated relative to how the camera recorded it.

10.2 IF a source photograph reports a non-1 EXIF orientation THEN THE SYSTEM SHALL strip the EXIF block from the output, because the source EXIF header is tens of kilobytes of unneeded payload.

10.3 WHEN the pipeline writes a master image THEN THE SYSTEM SHALL cap its longest edge at 1600 pixels, re-encode as progressive JPEG at quality 82, and place it under `public/products/<product-slug>/<angle>.jpg`.

10.4 WHEN the pipeline processes source video THEN THE SYSTEM SHALL cut a poster frame at a fixed timestamp into `public/products/<product-slug>/poster.jpg` at 1280×720, because the clips are far too large to load eagerly on a mobile connection.

10.5 IF no source video exists for a product THEN THE SYSTEM SHALL omit the poster entry rather than write a placeholder file.

10.6 WHEN the pipeline completes THEN THE SYSTEM SHALL write `public/products/manifest.json` describing, for every product, its resolved width, height, per-image blur data URL, optional poster and optional video source, and it SHALL use that manifest as the single source of truth at render time.

10.7 IF the input directories do not exist THEN THE SYSTEM SHALL exit non-zero with a message that names the expected directories and the expected filename pattern, rather than silently writing an empty manifest.

10.8 WHEN the pipeline is run twice without new source changes THEN THE SYSTEM SHALL produce byte-identical outputs so it is safe to run in a loop and diffable in review.

10.9 WHEN the image config is next edited THEN THE SYSTEM SHALL NOT set `images.dangerouslyAllowSVG`, because SVG sources are already served unoptimized whenever the flag is false, so the flag buys nothing while widening the attack surface and forcing placeholder SVGs through the optimiser with `Content-Disposition: attachment`.

10.10 WHEN images are served THEN THE SYSTEM SHALL allow the WebP output format and SHALL NOT add AVIF as a required format, because the framework's own guidance is to prefer WebP and AVIF encoding is materially slower.

10.11 IF a non-default image quality is requested THEN THE SYSTEM SHALL add that quality to the configured allowlist, because out-of-range qualities are coerced to the nearest allowed value.

10.12 WHERE media storage is chosen THEN THE SYSTEM SHALL ship product media from `public/products/` for launch and SHALL keep the storage base path behind a single configuration value so that object storage is a configuration change, not a code change.

---

### Requirement 11 — Every page describes itself

**User Story:** As someone sharing a link in a WhatsApp group or as Google ranking the page, I want each page to carry its own title, description, preview image and canonical address, so that links are recognisable and pages are attributable to the right keyword.

#### Acceptance Criteria

11.1 WHEN any page is rendered THEN THE SYSTEM SHALL emit a unique `<title>` and `<meta name="description">`; no two catalogue pages may share either.

11.2 WHEN the site builds THEN THE SYSTEM SHALL set `metadataBase` in `src/app/layout.tsx` from a single configuration value, because a relative `openGraph.images` path without `metadataBase` is a build error.

11.3 IF the site is deployed at more than one origin (for example a preview domain and the production domain) THEN THE SYSTEM SHALL point `metadataBase` at the production origin so canonicals and preview images do not point at a throwaway host.

11.4 WHEN any page is rendered THEN THE SYSTEM SHALL emit a self-referencing `alternates.canonical` that is set per page and SHALL NOT be inherited from the root layout, because a nested metadata object defined in a parent segment is inherited by children that do not override it.

11.5 WHEN any page is rendered THEN THE SYSTEM SHALL emit Open Graph `title`, `description`, `url`, `siteName`, `locale` and `images`, and a Twitter card of at least `summary_large_image`.

11.6 WHEN a product or category page is rendered THEN THE SYSTEM SHALL emit an Open Graph image of 1200×630 that contains that page's own subject, not the generic site card.

11.7 IF an Open Graph image is emitted THEN THE SYSTEM SHALL keep it under 8 MB, because the build fails above that size.

11.8 WHEN an Open Graph image is generated THEN THE SYSTEM SHALL render it from code rather than downloading a font over the network at build time, so a flaky network cannot break the build.

11.9 WHEN any page is rendered THEN THE SYSTEM SHALL NOT declare `themeColor`, `colorScheme` or `viewport` inside `metadata`, because those fields are deprecated in favour of the separate viewport export.

11.10 WHEN the shop, category, product, fit-finder, cart, checkout and policy pages are rendered THEN THE SYSTEM SHALL each carry their own metadata, including the client-side-only routes whose pages are currently `"use client"`.

11.11 IF a page has no meaningful preview image of its own THEN THE SYSTEM SHALL fall back to the root brand card rather than emitting no image at all.

---

### Requirement 12 — Structured data the engines can read

**User Story:** As a shopper searching for "custom floor mats Toyota Corolla Nigeria", I want the search result to show a price and a rating-eligible card, so that I can judge the product without opening it.

#### Acceptance Criteria

12.1 WHEN a product page is rendered THEN THE SYSTEM SHALL emit a `Product` JSON-LD graph containing `name`, `description`, `image`, `sku`, `category` and `brand`.

12.2 WHEN a `Product` graph is emitted THEN THE SYSTEM SHALL include an `Offer` with `priceCurrency: "NGN"`, the lower bound of `priceRange()` as `price`, `priceValidUntil`, and an `availability` value that does not assert unverified stock.

12.3 IF a single-product offer cannot be stated honestly THEN THE SYSTEM SHALL emit the offer as a price range (`priceSpecification` with `minPrice`/`maxPrice`) instead of inventing a single price, because the real price depends on the car's tier and row configuration.

12.4 WHEN a product page is rendered THEN THE SYSTEM SHALL emit an `AggregateRating` node ONLY IF genuine collected reviews exist; otherwise it SHALL omit the node entirely, because a fabricated rating is a structured-data policy violation and a trust failure.

12.5 WHEN the site is rendered THEN THE SYSTEM SHALL emit one `Organization` node describing LuxeRide, its WhatsApp contact point and its canonical URL.

12.6 WHEN a product or category page is rendered THEN THE SYSTEM SHALL emit a `BreadcrumbList` node matching the visible trail.

12.7 WHEN a product page carries video THEN THE SYSTEM SHALL emit a `VideoObject` node describing it; when it does not, no `VideoObject` SHALL be emitted.

12.8 WHEN any JSON-LD is serialised THEN THE SYSTEM SHALL escape `<` as `\u003c` before injecting it into the script tag, so product copy cannot break out of the tag.

12.9 WHILE no backend exists to store reviews THEN THE SYSTEM SHALL ship no review markup of any kind, and SHALL state that review capture is delivered by `commerce-backend`.

---

### Requirement 13 — A sitemap and a robots file

**User Story:** As the site owner, I want a sitemap that lists exactly the pages that exist and a robots file that keeps checkout and cart out of the index, so that crawlers spend their budget on pages that can convert.

#### Acceptance Criteria

13.1 WHEN `/sitemap.xml` is requested THEN THE SYSTEM SHALL serve a sitemap generated by `src/app/sitemap.ts` listing `/`, `/shop`, every category route and every product route, each with a last-modified date, a change frequency and a priority.

13.2 IF the canonical site origin is unknown at build time THEN THE SYSTEM SHALL read it from the same configuration value that `metadataBase` uses, so sitemap URLs and canonical URLs can never disagree.

13.3 WHEN `/robots.txt` is requested THEN THE SYSTEM SHALL serve a file generated by `src/app/robots.ts` that allows `/`, disallows `/cart`, `/checkout` and `/order/`, and references the sitemap.

13.4 IF the Fit Finder is reachable by a crawler THEN THE SYSTEM SHALL make an explicit decision about it in `robots.ts` and state the reason in a comment.

13.5 WHEN a URL that is not in the sitemap is requested THEN THE SYSTEM SHALL still return a real 404 rather than a soft 404, so crawlers do not accumulate junk URLs.

---

### Requirement 14 — Every route has an honest boundary

**User Story:** As a visitor on a bad connection who hits a broken link, I want a styled page with a way forward, so that I leave with an order or a message rather than a blank screen.

#### Acceptance Criteria

14.1 WHEN a request matches no route THEN THE SYSTEM SHALL render `src/app/not-found.tsx` inside the site shell, with the header, footer, and links to `/shop`, `/fit-finder` and `/cart`.

14.2 IF a route component throws THEN THE SYSTEM SHALL render `src/app/error.tsx` as a Client Component error boundary that shows a retry action and a WhatsApp fallback.

14.3 WHEN a product or category slug is unknown THEN THE SYSTEM SHALL render the site's 404 content and SHALL include a WhatsApp link pre-filled with the slug the visitor tried, so an ad typo becomes a conversation instead of a dead end.

14.4 IF no `error.tsx` exists for a segment THEN THE SYSTEM SHALL not depend on one — the root `error.tsx` SHALL cover all segments beneath it.

14.5 WHEN a not-found or error page renders THEN THE SYSTEM SHALL NOT be indexed, whether by an explicit robots directive or by the framework's own handling.

---

### Requirement 15 — Catalogue routes are fast and cacheable

**User Story:** As a customer on a Nigerian mobile network, I want the shop and category pages to load instantly, so that I do not abandon before seeing a price.

#### Acceptance Criteria

15.1 WHEN `/shop` and every `/shop/<slug>` route is built THEN THE SYSTEM SHALL prerender them at build time and SHALL NOT mark them dynamic solely because of query-parameter handling.

15.2 WHILE all filtering and sorting state is held in client state THEN THE SYSTEM SHALL NOT read `searchParams` in any server component on those routes.

15.3 WHEN `/shop/<slug>` is built THEN THE SYSTEM SHALL prerender all five category paths via `generateStaticParams`, and any slug not produced by it SHALL 404 rather than being rendered on demand.

15.4 IF product data changes THEN THE SYSTEM SHALL apply the change on the next build, and until a database exists SHALL NOT add artificial revalidation intervals that imply a data source that is not there.

15.5 WHEN a catalogue page is served THEN THE SYSTEM SHALL load at most one image for the first row of the grid eagerly and SHALL defer the rest.

15.6 WHILE the catalogue contains no database and no per-request data THEN THE SYSTEM SHALL NOT add a caching library to the request path for its own sake.

---

### Requirement 16 — Selling the next thing

**User Story:** As a buyer who has just looked at floor mats, I want to see what goes with them, so that I buy a complete set in one message instead of coming back later.

#### Acceptance Criteria

16.1 WHEN a product page is rendered THEN THE SYSTEM SHALL show at most four related products drawn deterministically from the catalogue.

16.2 IF a related product is drawn THEN THE SYSTEM SHALL prefer a product from the same category, then a product from the `bundles` category, and SHALL exclude the product being viewed.

16.3 WHEN related products are shown THEN THE SYSTEM SHALL label the section so its purpose is unambiguous, and SHALL NOT imply the related product has been fitted to the visitor's car.

16.4 IF no related product can be drawn THEN THE SYSTEM SHALL omit the section rather than render an empty grid.

---

## Traceability summary

| Requirement | Delivered by |
|---|---|
| 1 | `build-pipeline` spec (this feature depends on it; P0 blocker tracked here) |
| 2, 3 | `Header.tsx`, `Footer.tsx`, new `src/app/policies/**` |
| 4 | new `src/app/shop/[category]/page.tsx`, `next.config.ts` redirects |
| 5 | `src/app/products/[slug]/page.tsx` + new gallery/buy-box components |
| 6 | copy in `ProductCard`, PDP and Fit Finder results |
| 7 | new `CatalogExplorer` client component |
| 8, 12 | new `Breadcrumbs.tsx`, `src/lib/seo.tsx` |
| 9, 10 | `SafeImage.tsx` replacement, new `scripts/media.mjs`, `next.config.ts` |
| 11 | `src/app/layout.tsx` + `opengraph-image.tsx` per segment |
| 13 | new `src/app/sitemap.ts`, `src/app/robots.ts` |
| 14 | new `src/app/not-found.tsx`, `src/app/error.tsx` |
| 15 | `generateStaticParams`, `dynamicParams`, removal of `searchParams` reads |
| 16 | `src/lib/products.ts` helper + PDP section |