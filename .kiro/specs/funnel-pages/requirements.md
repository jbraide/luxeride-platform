# Requirements Document

## Introduction

**Feature:** `funnel-pages` — the content pages the ads point at, built from one on-brand section
library.

The owner has a written blueprint for a five-page ad funnel (awareness → problem → solution → product
→ offer). Four of those five are either built or already specified elsewhere:

- **Homepage** `/` exists (`src/app/page.tsx`) — hero, offer band, featured row, category tiles and a
  three-up "Why" strip, all database-backed and campaign-aware.
- **Solution / category** maps to `/shop/floor-mats` (`src/app/shop/[category]/page.tsx`), which exists.
- **Product** maps to `/products/floor-mats` (`src/app/products/[slug]/page.tsx`), which exists with a
  gallery, `BuyBox`, `StickyBuyBar`, `ProductFaq` and `RelatedProducts`.
- **Campaign copy** on `/` and `/fit-finder` is already owned by `ad-landing-and-tracking`
  Requirement 1 (`?product=` → headline/sub/offer, resolved by `resolveCampaign` in
  `src/data/landing.ts`).

**What is genuinely missing** is the **problem/education page** and an **offer page**, plus a small set
of reusable, brand-consistent sections to compose them from. Today there is no `/why-carpet-fails` and
no offer route (`src/app/` contains `/`, `/shop`, `/shop/[category]`, `/products/[slug]`,
`/fit-finder`, `/cart`, `/checkout`, `/order/*`, `/policies/[slug]`, `/contact` and `/api/*`).

**The blueprint cannot ship as written, and this spec is where that is resolved.** Three of its
sections contradict code that is already in the repository and specs that are already approved:

- Its **urgency/scarcity** section ("12 slots, 7 remaining", "expires Sunday 11:59 PM") is forbidden by
  `trust-and-policies` Requirement 1.3–1.4 and 11.3: *no stock number, countdown or scarcity indicator
  that is not computed from real data … no urgency that expires.* No stock system exists, so none of
  these SHALL render.
- Its **social proof** ("Trusted by 500+ Drivers", "127 Drivers Upgraded This Month") is an unearned
  claim, and 11.3 forbids *any review count or trust badge the business has not earned*. Only real,
  verified testimonials may appear.
- Its **prices and offers** (Single ₦55,000 / Double ₦75,000, "Save ₦10,000", "free dispatch") disagree
  with the catalogue (`src/data/products.ts`: single ₦45,000/₦58,000, double ₦68,000/₦82,000, tiered)
  and with `resolveDiscountForOrder`; and `src/data/landing.ts` only permits the one offer the
  checkout honours — `ALLOWED_OFFER = "Save ₦2,000 with bank transfer"`.

**What breaks without this spec.** The owner buys clicks and sends them to pages that do not exist, or
— if the blueprint is built literally — to pages that promise prices, savings and scarcity the
checkout and the business cannot honour. Both waste the spend; the second also breaks the trust rules
the business already agreed to.

**Boundary (no duplication).** Tracking, the event taxonomy, UTM capture and provider integration
belong to `ad-landing-and-tracking` Requirements 3–5; this spec adds **no** analytics events. The
footer, announcement bar and the placement of trust elements belong to `trust-and-policies`
Requirements 10–11. Catalogue data and PDP/category rendering belong to `storefront-catalog`, and the
catalogue's editability belongs to `catalogue-admin-control`. The locked decisions in `_CONTEXT.md` §9
stand: owner-only editing, Confirmed-only front end, price on the site as `priceFrom`, one layout =
one make.

---

## Requirements

### Requirement 1 — Dedicated funnel content pages, defined in code

**User Story:** As the owner, I want the education and offer pages the ads point at, so that a paid click lands somewhere that advances the sale instead of on the shop front.

#### Acceptance Criteria
1. WHEN a visitor requests `/why-carpet-fails` THEN THE SYSTEM SHALL render a Server Component
   (`src/app/why-carpet-fails/page.tsx`) that explains why carpet mats fail and routes the visitor
   toward the floor-mats category — with no client-side JavaScript required to read it.
2. WHEN a visitor requests the offer route THEN THE SYSTEM SHALL render a Server Component
   (`src/app/<offer-slug>/page.tsx`) whose slug is decided in `design.md` and which names a real,
   live `Promotion`.
3. WHEN either page is rendered THEN THE SYSTEM SHALL supply per-page `metadata` through the existing
   `pageMetadata` helper (`src/lib/seo.tsx`), including a canonical URL from `SITE_URL`
   (`src/lib/site.ts`).
4. WHEN either page is added THEN THE SYSTEM SHALL list it in `src/app/sitemap.ts` and allow it in
   `src/app/robots.ts`, so it is indexable without being a duplicate of `/shop/floor-mats` or
   `/products/floor-mats`.
5. WHEN a page is built THEN THE SYSTEM SHALL NOT add a second homepage, a second category page or a
   second PDP; the existing `/`, `/shop/[category]` and `/products/[slug]` routes SHALL be reused for
   the solution and product stages (see Requirement 8).

### Requirement 2 — One on-brand section library; no free-form content

**User Story:** As the owner, I want every funnel page to look like LuxeRide without a designer, so that new pages are quick and never off-brand.

#### Acceptance Criteria
1. WHEN a funnel page is composed THEN THE SYSTEM SHALL build it only from a closed set of
   section components, named in `design.md`, and SHALL NOT render author-supplied HTML, Markdown or a
   third-party embed.
2. WHERE an existing component already expresses a section — `HomeHero`, `TrustStrip`, `ProductFaq`,
   `StickyBuyBar`, `BuyBox`, `ProductGallery`, `RelatedProducts`, `CategoryTile`, `AnnouncementBar` —
   THE SYSTEM SHALL reuse it rather than create a parallel version.
3. WHEN a new section is needed (comparison table, cost cards, risk-reversal, step process) THEN THE
   SYSTEM SHALL add it as a Server Component using the existing Tailwind tokens in
   `src/app/globals.css`, and it SHALL render acceptably with JavaScript disabled.
4. WHEN any section is interactive (an accordion) THEN THE SYSTEM SHALL prefer `<details>`/`<summary>`
   as `ProductFaq` does, so it opens without JavaScript.
5. WHEN a page uses a section THEN THE SYSTEM SHALL define that page's copy in a typed data module
   beside the page (the pattern of `src/data/landing.ts`), so every string is in one reviewable place.

### Requirement 3 — Every claim is one the business can evidence

**User Story:** As the owner, I want nothing on a funnel page that I cannot back up, so that I do not ship the exact over-promise that gets an ad account reviewed or a customer refunded.

#### Acceptance Criteria
1. THE SYSTEM SHALL NOT render a stock count, "only N left", a countdown, a "N people viewing" figure
   or any scarcity indicator that is not computed from real data (`trust-and-policies` 1.3, 11.3).
2. THE SYSTEM SHALL NOT render a testimonial, a review count or a rating that is not a real, verified
   customer statement; a "social proof" section SHALL render nothing until at least one verified
   testimonial exists, rather than a placeholder.
3. THE SYSTEM SHALL NOT render a rider-count or driver-count claim ("500+ drivers", "127 this month")
   unless the figure is produced from the order table at render time.
4. WHEN a cost or comparison figure is shown (for example "resale value loss ₦300,000–₦500,000") THEN
   THE SYSTEM SHALL attribute it to a stated source or omit the figure.
5. WHEN an urgency or price-lock claim is rendered THEN THE SYSTEM SHALL satisfy
   `trust-and-policies` 1.4 — it states what is locked, until when, and who honours it — and IF no
   such claim can be honoured THEN none SHALL render.

### Requirement 4 — Prices and offers come from the catalogue and the engine

**User Story:** As the owner, I want a funnel page to never quote a price the checkout would not charge, so that the page and the cart can never disagree.

#### Acceptance Criteria
1. THE SYSTEM SHALL NOT contain a hard-coded price literal in any funnel page or section; every figure
   SHALL be read from the catalogue (`src/lib/catalogue.ts`) or computed by the pricing helpers
   (`src/lib/pricing.ts`, `priceRange` in `src/data/products.ts`).
2. WHEN a page shows a price THEN THE SYSTEM SHALL show the band the storefront shows (`priceRange`),
   not a single invented number, unless it is the specific variation's own price.
3. WHEN the offer page references a promotion THEN THE SYSTEM SHALL resolve it from a live `Promotion`
   row and SHALL only present an offer the checkout honours — today that is exactly
   `ALLOWED_OFFER` in `src/data/landing.ts` — following the assertion `assertCampaignLandings` already
   enforces at build time.
4. WHERE the blueprint states Single ₦55,000 / Double ₦75,000, "Save ₦10,000" or "free dispatch" THEN
   THE SYSTEM SHALL use the catalogue figures and the honourable offer instead, and this spec SHALL
   record the corrected figures in `design.md`.
5. IF an offer needs a discount the checkout does not compute THEN THE SYSTEM SHALL omit it rather
   than advertise it and depend on a WhatsApp conversation to correct it.

### Requirement 5 — The comparison and cost claims are true

**User Story:** As the owner, I want the comparison table to be accurate, so that it persuades honestly rather than inviting a complaint.

#### Acceptance Criteria
1. WHEN a comparison table contrasts carpet, universal rubber and LuxeRide TPE THEN THE SYSTEM SHALL
   state only claims that are true of the products actually sold, and SHALL describe competitor
   materials generically rather than naming or implying a specific brand.
2. WHEN a durability or lifespan claim is made ("5+ years", "frays in 6 months") THEN THE SYSTEM SHALL
   either attribute it to a source or phrase it as the material property it is, not as a measured
   outcome the business has not measured.
3. THE SYSTEM SHALL NOT guarantee a fit outcome on a funnel page that the fitment evidence gate
   (`fitment-engine`) would not confirm; the front end shows Confirmed only (locked decision 2).

### Requirement 6 — Funnel pages carry their campaign context

**User Story:** As the owner, I want to know which ad produced a visit to a funnel page, so that I can decide what to keep spending on.

#### Acceptance Criteria
1. WHEN a funnel page is reached with campaign parameters THEN THE SYSTEM SHALL make them available to
   the attribution layer owned by `ad-landing-and-tracking` Requirement 5, and SHALL NOT implement a
   separate capture mechanism.
2. THE SYSTEM SHALL NOT introduce any analytics event; every event fires through the existing registry
   and taxonomy in `src/lib/analytics/events.ts` and `ad-landing-and-tracking` Requirement 3.
3. WHERE the blueprint asks for `ScrollDepth` or a `Lead` on a click THEN THE SYSTEM SHALL reconcile
   that with `ad-landing-and-tracking`: `lead` is already fired on an order
   (`src/app/checkout/CheckoutView.tsx`), and this spec SHALL NOT re-use it for a click
   (see Requirement 10).

### Requirement 7 — Case for the funnel is grounded in the mechanism, not adjectives

**User Story:** As the owner, I want the education page to be genuinely informative, so that it earns the click and ranks, rather than reading as ad copy.

#### Acceptance Criteria
1. WHEN `/why-carpet-fails` is rendered THEN THE SYSTEM SHALL explain a mechanism (how carpet absorbs
   and traps moisture and what that does over time) in the business's own words, and SHALL NOT
   present invented statistics as evidence.
2. WHEN the page links onward THEN THE SYSTEM SHALL route to an existing, working destination
   (`/shop/floor-mats`, `/products/floor-mats` or `/fit-finder`) and SHALL NOT link to a route that
   does not exist.
3. WHERE the blueprint names `/shop/tpe-mats` THEN THE SYSTEM SHALL use `/shop/floor-mats`, the category
   that exists (`CATEGORIES`, `src/data/products.ts`).

### Requirement 8 — The existing storefront pages get sections, not replacements

**User Story:** As the owner, I want the pages that already work to get the useful parts of the blueprint, so that I am not rebuilding what is built.

#### Acceptance Criteria
1. WHEN the solution stage is enhanced THEN THE SYSTEM SHALL add the mechanism and comparison sections
   to `/shop/[category]` without changing that route's existing contract or its `CatalogExplorer`.
2. WHEN the product stage is enhanced THEN THE SYSTEM SHALL add the offer-mechanism and fit-guide
   content within the existing `/products/[slug]` page and its `BuyBox`/`ProductFaq`, using the
   product's own data (no second source of truth for price or fit).
3. WHEN the homepage gains a section THEN THE SYSTEM SHALL add it to `src/app/page.tsx` in the
   existing section order and SHALL NOT duplicate the offer band that already resolves from live
   promotions.
4. THE SYSTEM SHALL NOT add a second buy control; `BuyBox` and `StickyBuyBar` remain the only buy
   actions on a product page (`trust-and-policies` Requirement 11).

### Requirement 9 — Nothing ships without its dependency

**User Story:** As the owner, I want a section to be absent until it can actually work, so that no funnel page has a dead button.

#### Acceptance Criteria
1. IF a "join the list" email or phone capture is shown THEN THE SYSTEM SHALL require a real
   destination first; the database schema currently declares no subscriber/lead table
   (`prisma/schema.prisma` models: `Category`, `Product`, `Bundle`, `BundleItem`, `ProductVariation`,
   `Make`, `Vehicle`, `Location`, `Order`, `OrderItem`, `Layout`, `LayoutVariant`, `RangePrice`,
   `Mapping`, `ImageSet`, `Exclusion`, `DemandLog`, `AuditEntry`, `Promotion`, `Coupon`,
   `SiteSetting`), so the section SHALL NOT render until one exists or until this spec's design names
   the spec that delivers it.
2. IF a "Download Fit Guide (PDF)" link is shown THEN THE SYSTEM SHALL require the asset to exist in
   `public/` first; the section SHALL NOT render a link to a file that is not there.
3. WHEN a section's dependency is missing THEN THE SYSTEM SHALL omit the whole section rather than
   render it disabled or empty.
4. WHERE imagery is required for a section (water-on-carpet, macro texture) THEN THE SYSTEM SHALL fall
   back to `ProductPlaceholder`-style honest rendering until the asset exists, and SHALL NOT reference
   an image path that resolves to nothing.

### Requirement 10 — Leads and clicks are not confused with orders

**User Story:** As the owner, I want my ad optimisation to keep learning from real orders, so that a button click does not dilute the signal I am paying to train.

#### Acceptance Criteria
1. THE SYSTEM SHALL NOT fire the `lead` event for a click or a form view, because `lead` already fires
   on an order (`src/app/checkout/CheckoutView.tsx`, `src/app/order/confirmation/ConfirmationView.tsx`)
   and is the conversion the ads optimise on.
2. WHEN a call-to-action is tracked THEN THE SYSTEM SHALL use an event name agreed with
   `ad-landing-and-tracking` and registered in `src/lib/analytics/events.ts`, not an ad-hoc name.
3. WHERE the blueprint asks for a WhatsApp click event THEN THE SYSTEM SHALL reconcile it with the
   existing WhatsApp affordances and `ad-landing-and-tracking` rather than adding an untracked link.

### Requirement 11 — Boundary with the existing specs

**User Story:** As a spec reader, I want to know which document owns which part of the funnel, so that no rule is written twice and none is missed.

#### Acceptance Criteria
1. THIS SPEC SHALL NOT re-specify campaign variants on `/` and `/fit-finder`
   (`ad-landing-and-tracking` Requirement 1), the event taxonomy (`Requirement 3`), provider
   integration (`Requirement 4`) or UTM capture (`Requirement 5`).
2. THIS SPEC SHALL NOT re-specify the footer, the announcement bar or trust-element placement
   (`trust-and-policies` Requirements 10–11); it composes pages that respect them.
3. WHERE a funnel page shows catalogue data THEN THE SYSTEM SHALL read it through the same functions
   the rest of the storefront uses (`src/lib/catalogue.ts`), so `catalogue-admin-control` can change the
   data without touching these pages.
4. THIS SPEC SHALL NOT loosen a locked decision in `_CONTEXT.md` §9, and in particular SHALL NOT
   expose an Inferred layout or show a fit that `fitment-engine` has not Confirmed.
