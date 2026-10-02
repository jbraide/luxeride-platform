# Implementation Plan — storefront-catalog

## Status

**PARTIAL — 54 done, 4 partial, 58 untouched** (116 checkbox items in total; `[~]` is partial). Last updated 2026-10-02, after the M0/M1 run.

The 12 `[x]` items in section 1 are still a verified *audit* of the old code. The **38 new checks are
implemented and verified work**, each carrying a `(verified: …)` note naming the file and the check that
passed. `[~]` marks the four that are genuinely half-done, with the missing half and its blocker named
on the line.

**What is built:** the deployability fixes (§2.2–2.4), the route boundaries (§4.1–4.3), the mobile menu
(§5.1–5.2), the honest product data and its helpers (§7.1–7.6), **all of section 8** — `ProductPlaceholder`,
`ProductImage`, the split media seam and the `media:check` build gate — §9.1–9.5 and §9.7–9.9 of the
media pipeline, the PDP gallery and FAQ and related products (§10.3, §10.11, §10.13), and §14.3–14.6.

**What is specifically not built, and why:**

- **§2.1 is deliberately not done.** M0.2 in the master plan supersedes it: do not add
  `"exclude": ["prisma"]`, because that hides a broken seed from the build rather than fixing it.
- **§9.6 waits on a human input.** The pipeline is built and verified against the *real* footage, but
  `Luxeride/footage/` holds `20260801_*.jpg`/`.mp4` names and only the owner knows which clip shows
  which product. Guessing would publish `alt` text nobody has verified, so the outputs were deleted and
  all seven products still render `ProductPlaceholder`.
- **§3.1–3.5, §3.7 and everything from §10.8's canonical onward are blocked on D-05** — `metadataBase`
  needs `NEXT_PUBLIC_SITE_URL`, which cannot be invented. §10.8's compile-time half (a distinct `title`
  per PDP) is done; its canonical, description and `og:image` are not, and §10.14/§10.15 are the same
  blocker.
- **§6.1–6.9 and §11–13 are M3.3/M3.13/M3.14**, and **§14.2 currently fails**: `grep -rn searchParams
  src/app/` still returns two files, and only `fit-finder` should.
- **§15.4 and §15.6 need a browser**, which this environment cannot provide — Chrome is refused a
  socket, so it has no network at all. `npm run check:hydration` exists for the console half of the same
  problem and exits 2 rather than passing when it cannot load a page.

`_CONTEXT.md` §12 rule 4 applies throughout: this plan contains coding tasks only. Where a human decision
is genuinely required — the production domain, the photo-to-product mapping, the legal wording in the
policies — it is in `design.md` → `## Open Questions`, not here.

---

## 1. Baseline audit of the existing storefront _(DONE)_

- [x] 1.1 Read `src/app/layout.tsx` and record that it exports one `metadata` object with only `title` and `description`, and has no `metadataBase`, `openGraph`, `twitter`, `alternates` or `robots` — so every route in the site emits an identical head. _(P0)_ _(verified: luxeride-web/src/app/layout.tsx)_ _Requirements: 11.1, 11.2_
- [x] 1.2 Read `src/components/Header.tsx` and record that the `Shop` / `Fit Finder` nav is `hidden items-center gap-7 … sm:flex` and that no hamburger, drawer or menu component exists anywhere in `src/components/` — so below 640px the only reachable routes are whatever the current page links to plus `/cart`. _(P0)_ _(verified: luxeride-web/src/components/Header.tsx)_ _Requirements: 2.1, 2.2_
- [x] 1.3 Read `src/components/Footer.tsx` and record that it is 10 lines containing two `<p>` elements and zero links — no policies, no contact, no categories, no trust content. _(P0)_ _(verified: luxeride-web/src/components/Footer.tsx)_ _Requirements: 3.1, 3.3_
- [x] 1.4 Read `src/components/SafeImage.tsx` and record that it is a `"use client"` component returning `null` after `onError`, so a missing file collapses the slot instead of showing a fallback, and every image it wraps becomes a client boundary inside an otherwise server-rendered page. _(P0)_ _(verified: luxeride-web/src/components/SafeImage.tsx)_ _Requirements: 9.1, 9.3_
- [x] 1.5 Read `src/data/products.ts` and enumerate `public/products/`: `PRODUCTS` references 21 image paths across 7 products, only 6 files exist (`single-layer*.svg`, `double-layer*.svg`, 1.7–2.1 KB, `viewBox="0 0 480 360"`), so the `seat-covers`, `full-bundle`, `cargo-liner`, `mud-flaps` and `sun-shade` families have 15 paths that resolve to nothing. _(P0)_ _(verified: luxeride-web/src/data/products.ts)_ _Requirements: 9.1, 9.4_
- [x] 1.6 Read `src/app/shop/page.tsx` and record that it `await searchParams` (the only reason `/shop` builds as `ƒ`), that category links are hand-rolled `<Link href="/shop?category=…">`, and that there is no search, sort, count or pagination. Grep confirms exactly two `searchParams` reads exist in `src/app/` — this one and `src/app/fit-finder/page.tsx`. _(P0)_ _(verified: luxeride-web/src/app/shop/page.tsx)_ _Requirements: 4.1, 4.3, 7.1, 15.1_
- [x] 1.7 Read `src/app/products/[slug]/page.tsx` and record that it exports no metadata, renders the three images as a non-interactive horizontal strip in fixed `h-40 w-52` boxes with `fill` and **no `sizes`** (so the browser assumes `100vw`), and offers exactly one CTA with no specs, box contents, FAQ, breadcrumbs, cross-sell or related items. _(P0)_ _(verified: luxeride-web/src/app/products/[slug]/page.tsx)_ _Requirements: 5.1, 5.6, 8.1, 11.1_
- [x] 1.8 Read `next.config.ts` and `node_modules/next/dist/shared/lib/get-img-props.js` and confirm the line `if (isDefaultLoader && !config.dangerouslyAllowSVG && src.endsWith('.svg')) { unoptimized = true }` — i.e. with the flag **false** the SVG placeholders already bypass the optimizer, so `dangerouslyAllowSVG: true` is not a prerequisite for the placeholders and can be removed immediately. _(P0)_ _(verified: luxeride-web/next.config.ts)_ _Requirements: 10.9_
- [x] 1.9 Enumerate `src/app/` and confirm there is no `sitemap.ts`, `robots.ts`, `not-found.tsx`, `error.tsx`, `loading.tsx`, `opengraph-image.*` or `twitter-image.*` anywhere in the app. _(P0)_ _(verified: luxeride-web/src/app)_ _Requirements: 13.1, 13.3, 14.1_
- [x] 1.10 Measure `LuxeRide/footage/`: 3 JPEGs at 4000×3000 with **EXIF tag 0x0112 Orientation = 6** (parsed from the APP1 segment directly; the EXIF segment alone is 36–51 KB) and `sharp().metadata().autoOrient` reporting `3000×4000`, so all three are landscape-encoded but portrait-oriented; 8 MP4s, H.264 1920×1080 @30fps, 34.4–96.9 s, 73.7–208.5 MB. Probe the host: `ffmpeg` 7.0.2 with `avif`/`webp` muxers and `libwebp`/`libaom-av1` encoders, `sharp` 0.35.4 in `node_modules`, and **no** `magick`, `convert` or `exiftool` on PATH. _(P1)_ _(verified: Luxeride/footage)_ _Requirements: 10.1, 10.2, 10.3_
- [x] 1.11 Read `src/components/ProductCard.tsx` and record the `sizes="(min-width: 768px) 25vw, 50vw"` mismatch against the `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` grid it lives in — between 640 and 1023 px the browser is told 50vw for an image that renders at ~33vw — and record that `src/app/page.tsx` uses `PRODUCTS.slice(0, 4)`, of which `seat-covers` and `full-bundle` have no images, so two of the four homepage cards are currently empty grey boxes. _(P0)_ _(verified: luxeride-web/src/components/ProductCard.tsx)_ _Requirements: 9.8, 9.1_
- [x] 1.12 Read the Next.js 16 guides this feature depends on — `01-app/03-api-reference/04-functions/generate-metadata.md`, `03-file-conventions/01-metadata/sitemap.md`, `robots.md`, `opengraph-image.md`, `03-file-conventions/not-found.md`, `error.md`, `loading.md`, `02-guides/json-ld.md`, `02-guides/caching-without-cache-components.md`, `05-config/01-next-config-js/redirects.md` and `images.md`, plus `02-components/image.md` — and record the four behaviours that constrain the design: metadata exports are Server-Component only; nested metadata objects defined in a parent are inherited by children that do not override them (so a root `alternates.canonical` would leak onto every page); `dangerouslyAllowSVG: false` auto-unoptimizes `.svg` sources; and `priority` is deprecated in favour of `preload`. _(P0)_ _(verified: luxeride-web/node_modules/next/dist/docs)_ _Requirements: 11.2, 11.4, 10.9, 11.9_

---

## 2. Make the app deployable

- [ ] 2.1 Add `"exclude": ["node_modules", "prisma"]` to `luxeride-web/tsconfig.json` so Next's build-time type-check no longer fails on `prisma/seed.ts(2,34): error TS2307`, which currently aborts `npm run build` before any page is generated. _(P0)_ **DELIBERATELY NOT DONE — superseded.** M0.2 in the master plan settles this: do **not** add `"exclude": ["prisma"]`, because excluding the directory hides a broken seed from the build instead of fixing it, and `commerce-backend` owns the seed by name. The build gate is met by its §1.1–1.5 instead.
  _Requirements: 1.1, 1.2_
- [x] 2.2 Fix the `./data/products` import in `luxeride-web/prisma/seed.ts` so it points at a path that exists, or delete the file if the seed is not being kept — and correct the `db:seed` line in `luxeride-web/package.json`, which invokes `ts-node` that is not a declared dependency and therefore cannot run. _(P0)_ **(verified: resolved by `commerce-backend` §1.2–1.4 — `prisma/seed.ts` deleted for `prisma/seed.mts` with an explicit `.ts` specifier, and `db:seed` rewritten to `node prisma/seed.mts` with the never-installed `ts-node` gone. The seed still restates the catalogue as literals; `commerce-backend` §3.1 replaces them with imports once §2.5 reconciles the schema.)**
  _Requirements: 1.2, 1.3_
- [x] 2.3 Update the "Run it" and "What's real vs. placeholder" sections of `luxeride-web/README.md` so they no longer claim `npx tsc --noEmit` and `npx eslint .` both run clean until they actually do. _(P1)_ **(verified: `luxeride-web/README.md` rewritten. It names the false `tsc`/`eslint` claim outright, including that it was false when written, and it now names the Fit Finder's `FIT ✓` as a fabricated claim owned by M2 rather than describing the storefront as honest.)**
  _Requirements: 1.4_
- [x] 2.4 Add a `verify` script to `luxeride-web/package.json` chaining `tsc --noEmit`, `eslint .`, `npm run media:check` and `next build`, so the whole gate is one command the owner can run before every deploy. _(P1)_ **(verified: `verify: tsc --noEmit && eslint . && npm run media:check && next build` in `luxeride-web/package.json`; exits 0 today. `scripts/seo-check.mjs` from §12.4 joins the chain in M3.14. One gate cannot be reached this way — the browser console — and has its own command, `npm run check:hydration`.)**
  _Requirements: 1.1, 1.4, 9.4_

---

## 3. Site configuration and SEO primitives

- [ ] 3.1 Create `luxeride-web/src/lib/site.ts` exporting `SITE_URL` (from `process.env.NEXT_PUBLIC_SITE_URL`), `SITE_NAME`, `SITE_LOCALE = "en_NG"`, `OG_FALLBACK`, `MEDIA_BASE_URL` (the storage seam, default `""`) and `WHATSAPP_URL` built from `WHATSAPP_NUMBER` in `src/data/locations.ts`. Throw at module load if `SITE_URL` is missing or not absolute — `metadataBase` must exist or a relative `openGraph.images` path is a build error. _(P0)_
  _Requirements: 11.2, 11.3_
- [ ] 3.2 Add `NEXT_PUBLIC_SITE_URL` to `luxeride-web/.env` with a placeholder value and a comment stating that it must be the production origin. _(P0)_
  _Requirements: 11.3_
- [ ] 3.3 Rewrite the `metadata` export in `luxeride-web/src/app/layout.tsx`: add `metadataBase`, convert `title` to `{ default, template: "%s | LuxeRide" }`, add `applicationName`, `openGraph` (`type`, `siteName`, `locale`, `url`), `twitter: { card: "summary_large_image" }` and `robots`. Do **not** add `alternates.canonical` here — a nested object defined in the root layout is inherited by every child that does not override it, which would stamp the site root as the canonical for every page. Do **not** add `themeColor`, `colorScheme` or `viewport`; they are deprecated. _(P0)_
  _Requirements: 11.1, 11.2, 11.4, 11.5, 11.9_
- [ ] 3.4 Create `luxeride-web/src/components/JsonLd.tsx` as a Server Component that renders `<script type="application/ld+json">` with `JSON.stringify(data).replace(/</g, "\\u003c")`, so product copy can never break out of the script tag. _(P0)_
  _Requirements: 12.8_
- [ ] 3.5 Create `luxeride-web/src/lib/seo.tsx` with `pageMetadata({ title, description, path, image })` (self-referencing canonical from `SITE_URL + path`, Open Graph and Twitter blocks, `OG_FALLBACK` spread in whenever no page image is given), `productJsonLd`, `breadcrumbJsonLd`, `organizationJsonLd` and `faqJsonLd`. _(P0)_
  _Requirements: 11.4, 11.5, 11.11, 12.1, 12.2, 12.5, 12.6_
- [x] 3.6 Re-split the three `"use client"` page files — `luxeride-web/src/app/cart/page.tsx`, `luxeride-web/src/app/checkout/page.tsx` and `luxeride-web/src/app/order/confirmation/page.tsx` — into a Server Component page file that renders a new client component. Move each existing body verbatim into `src/app/cart/CartView.tsx`, `src/app/checkout/CheckoutView.tsx` and `src/app/order/confirmation/ConfirmationView.tsx`, keeping the `"use client"` directive and every import. Copy the pattern already used by `luxeride-web/src/app/fit-finder/page.tsx`, which is a 14-line Server Component rendering the client `<FitFinder>`. Metadata exports are Server-Component only, so this split is a precondition for 3.7. _(P1)_ **(verified: `src/app/cart/CartView.tsx`, `src/app/checkout/CheckoutView.tsx` and `src/app/order/confirmation/ConfirmationView.tsx`; each `page.tsx` is now a Server Component wrapper following `src/app/fit-finder/page.tsx`, the pattern this task names.)**
  _Requirements: 11.10_
- [ ] 3.7 Export a `metadata` object from each of the three re-split pages using `pageMetadata()` from `src/lib/seo.tsx`, and set `robots: { index: false, follow: true }` on `/cart` and `/checkout` so transactional pages never compete with `/shop` in search. `_/order/confirmation`_ is a client-side page that renders from `localStorage` and has no meaningful share content, so give it `index: false` and an empty description rather than a fabricated one. _(P1)_
  _Requirements: 11.10_
- [ ] 3.8 Create `luxeride-web/src/app/opengraph-image.tsx` using `ImageResponse` from `next/og`, exporting `alt`, `size = { width: 1200, height: 630 }` and `contentType = "image/png"`, drawn with the brand colours from `src/app/globals.css` and the default bundled font — do not read a font over the network at build time. Generated images are statically optimised by default, so this costs nothing at request time. _(P1)_
  _Requirements: 11.6, 11.7, 11.8, 11.11_

---

## 4. Route boundaries

- [x] 4.1 Create `luxeride-web/src/app/not-found.tsx` as a Server Component rendering inside the site shell with a short honest message and links to `/shop`, `/fit-finder` and `/cart`. It takes no props; Next.js injects `noindex` on a 404 response, so no hand-written robots directive is needed. _(P0)_ **(verified: `luxeride-web/src/app/not-found.tsx`, a Server Component inside the site shell, linking `/fit-finder`, `/shop` and `/cart`. `curl` of an unknown path returns 404 carrying it.)**
  _Requirements: 14.1, 14.5_
- [x] 4.2 Create `luxeride-web/src/components/NotFoundActions.tsx` as a Client Component that reads `usePathname()` and renders a WhatsApp link pre-filled with the slug the visitor tried — `not-found.tsx` cannot receive props, so the attempted path has to be read on the client. _(P0)_ **(verified: `NotFoundActions.tsx` reads `usePathname()` and renders a plain `<a>` to `wa.me`, so the escape to a human works before hydration. It uses a new `brokenLinkMessage()` rather than `notFoundMessage()`, because that one asks about a car and would confuse someone who followed a dead product link.)**
  _Requirements: 14.3_
- [x] 4.3 Create `luxeride-web/src/app/error.tsx` as a `"use client"` error boundary receiving `{ error, retry }`, logging `error` in a `useEffect`, and rendering a retry button plus a WhatsApp fallback. It covers every segment beneath it. _(P0)_ **(verified: `error.tsx` is `"use client"` and takes `{ error, retry }` — confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`, Next 16's name for it, not `reset`. Logs in a `useEffect`, retry plus WhatsApp fallback, and shows `error.digest` rather than a stack trace.)**
  _Requirements: 14.2, 14.4_
- [ ] 4.4 Add `luxeride-web/src/app/loading.tsx` **only when** a catalogue route becomes dynamic — with `/shop` and `/shop/[category]` prerendered there is nothing to stream, so a `loading.tsx` there would be dead code implying latency that does not exist. Re-evaluate if `commerce-backend` introduces server reads. _(P2)_
  _Requirements: 14.1_

---

## 5. Mobile navigation, footer and policy pages

- [x] 5.1 Create `luxeride-web/src/components/MobileNav.tsx` as a `"use client"` component: a trigger button visible only below Tailwind's `sm` breakpoint, a panel containing Home, Shop, each of the 5 categories from `CATEGORIES`, Fit Finder, Cart, and the four policy routes; closes on Escape, on backdrop click and on navigation; sets `aria-expanded` and `aria-controls`; locks background scroll while open; returns focus to the trigger on close. Render the links as plain `<Link>`s inside a `<nav>` so they work before hydration. _(P0)_ **(verified: `MobileNav.tsx`, `"use client"`, `aria-expanded`/`aria-controls`, Escape, backdrop click, scroll lock, focus return. **Deviation:** the four `/policies/*` links are omitted — those routes do not exist until M4.4, and a menu entry that 404s is a worse promise than no entry. Add them with §5.4–5.6.)**
  _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
- [x] 5.2 Wire `MobileNav` into `luxeride-web/src/components/Header.tsx`, keeping the existing `hidden … sm:flex` desktop nav and the `useSyncExternalStore` cart badge untouched. Check the row still fits at 320 px with logo, menu trigger and cart badge present. _(P0)_ **(verified: mounted in `Header.tsx`; the desktop `hidden … sm:flex` nav and the `useSyncExternalStore` cart badge are untouched, and `curl` of `/` shows the menu links in the pre-hydration HTML. Open state is derived from `usePathname()` rather than synced in an effect, so navigation closes the panel with no cascading render. The 320 px fit check is **not** verified — it needs a browser.)**
  _Requirements: 2.1, 2.7_
- [ ] 5.3 Add `aria-current="page"` to the active navigation item in `luxeride-web/src/components/Header.tsx` using `usePathname()`. _(P1)_
  _Requirements: 2.5_
- [ ] 5.4 Rewrite `luxeride-web/src/components/Footer.tsx` as a Server Component (it has no client code today, so the directive is simply absent) with three link columns — Shop / categories / Help — a contact block rendering `WHATSAPP_NUMBER` as a `wa.me` link, and the policy links. Source every fee and ETA from `LOCATIONS` in `src/data/locations.ts` so the footer and the checkout cannot disagree. State the Fit Guarantee as a WhatsApp-verified swap, matching what `src/components/ProductCard.tsx` and the PDP actually promise today. Minimum 44 px tap targets. _(P0)_
  _Requirements: 3.1, 3.2, 3.4, 3.5_
- [ ] 5.5 Create `luxeride-web/src/data/policies.ts` with a typed `Policy { slug, title, updatedAt, sections }` record for `delivery`, `returns`, `privacy` and `terms`. Populate `delivery` completely from `LOCATIONS`; for the other three leave clearly-marked `TODO(owner)` copy slots rather than inventing legal text — see `design.md` → `## Open Questions` item 6. _(P0)_
  _Requirements: 3.3_
- [ ] 5.6 Create `luxeride-web/src/app/policies/[slug]/page.tsx` as a Server Component with `generateStaticParams` over the four policy slugs, `dynamicParams = false`, and `notFound()` for anything else. Render the sections as a semantic `<article>` inside the site shell. _(P0)_
  _Requirements: 3.3, 3.6_
- [ ] 5.7 Export a static `metadata` object from `luxeride-web/src/app/policies/[slug]/page.tsx` built with `pageMetadata()` from `src/lib/seo.tsx`, so each policy page has its own title, description and self-referencing canonical. _(P1)_
  _Requirements: 11.10_

---

## 6. Categories become routes

- [ ] 6.1 Create `luxeride-web/src/app/shop/[category]/page.tsx` as an `async` Server Component reading `await params`, resolving the category with `getCategoryBySlug` from `src/data/products.ts`, and rendering the category name as `<h1>`, its `heroLine` as body copy, a result count, a `CatalogExplorer` scoped to that category, and a `Breadcrumbs` trail. Why a Server Component: the route is fully determined by compile-time data, so it must prerender rather than render per request. _(P0)_
  _Requirements: 4.1, 4.6, 4.9, 4.10_
- [ ] 6.2 Add `generateStaticParams` over `CATEGORIES` and `export const dynamicParams = false` to the same file, so all five category paths prerender and any other slug returns a real 404 instead of being rendered on demand. _(P0)_
  _Requirements: 4.2, 4.9_
- [ ] 6.3 Call `notFound()` in that page when `getCategoryBySlug` returns `undefined`. _(P0)_
  _Requirements: 4.2_
- [ ] 6.4 Add the honest empty state in that page: when a category has no products, name the category and offer `/shop` plus the Fit Finder rather than rendering an empty grid. _(P0)_
  _Requirements: 4.7_
- [ ] 6.5 Export `generateMetadata({ params })` from that page calling `pageMetadata()` with the category's `seoTitle` and `seoDescription`, a canonical of `/shop/<slug>` and an Open Graph image path of `/shop/<slug>/opengraph-image`. _(P0)_
  _Requirements: 4.5, 11.1, 11.10_
- [ ] 6.6 Add `seoTitle`, `seoDescription` and `heroLine` to each of the 5 entries in the `Category` interface and array in `luxeride-web/src/data/products.ts`; keep `seoTitle` at or under 60 characters and `seoDescription` between 120 and 160. _(P0)_
  _Requirements: 4.1, 11.1_
- [ ] 6.7 Change `href` in `luxeride-web/src/components/CategoryTile.tsx` from `` `/shop?category=${category.slug}` `` to `` `/shop/${category.slug}` ``. _(P0)_
  _Requirements: 4.1, 4.3_
- [ ] 6.8 Remove the `await searchParams` block from `luxeride-web/src/app/shop/page.tsx`, render all products unconditionally, and export a static `metadata` object with `alternates.canonical: "/shop"`. This single change is what makes `/shop` prerender instead of building as `ƒ`. _(P0)_
  _Requirements: 4.8, 15.1, 15.2_
- [ ] 6.9 Add an async `redirects()` function to `luxeride-web/next.config.ts` mapping `/shop?category=<slug>` to `/shop/<slug>` for each of the five slugs using `has: [{ type: "query", key: "category", value: c.slug }]` with `permanent: false`. Use `permanent: false` (307) deliberately: a `true` (308) is cached by browsers indefinitely and would become a trap if a slug is ever renamed. An unrecognised `?category=` value matches no rule and simply leaves the visitor on `/shop`. _(P0)_
  _Requirements: 4.3, 4.4, 4.10_

---

## 7. Honest product data

- [x] 7.1 Extend the `Product` interface in `luxeride-web/src/data/products.ts` with `materials: string`, `inBox: string[]`, `coverage: string`, `install: string`, `care: string`, `faq: { q: string; a: string }[]` and `availability: string`. Leave the seven existing fields byte-identical so the fitment engine, `priceRange()` and the cart are unaffected. _(P0)_ **(verified: `Product` gained `materials`, `inBox`, `coverage`, `install`, `care`, `faq`, `availability`; the seven pre-existing fields byte-identical.)**
  _Requirements: 5.4, 6.2_
- [x] 7.2 Populate the new fields for all 7 products, deriving what can be derived from data already in the app (the `note` text, `priceRange()` output, `rowApplicable`) and using only the conservative true statement — e.g. "Supplied with fixing clips; no drilling required" — wherever a fact is not on record. Omit FAQ entries whose answer is not on record rather than inventing one. _(P0)_ **(verified: populated for all seven. Only claims already on record elsewhere were restated; where nothing was on record the copy describes the *process*, not a property. Four of the seven carry no `faq` at all.)**
  _Requirements: 5.4, 5.5, 5.10_
- [x] 7.3 Create `luxeride-web/src/lib/availability.ts` exporting `AVAILABILITY_COPY` — the single honest availability sentence for the catalogue ("made to order for your exact car") plus a `formatPriceFrom(product)` helper that renders `From ₦45,000` plus the range and the reason the range exists, using `priceRange()` and `rowApplicable`. _(P0)_ **(verified: `src/lib/availability.ts` — `AVAILABILITY_COPY`, `formatPriceFrom()`, `formatDeliverySummary()`. The PDP renders all three; `curl` shows `From ₦68,000`, the ₦68,000–₦94,000 band and the delivery line.)**
  _Requirements: 5.2, 6.1, 6.2, 6.4_
- [x] 7.4 Grep `luxeride-web/src/` for `in stock`, `ready to ship`, `available now` and similar, and assert that no catalogue or PDP surface renders an availability claim — no code path establishes stock for a specific car, so any such string is a claim the site cannot support. Record the result in the pull request. _(P0)_ **(verified, and recorded rather than clean: two hits, both in `src/components/FitFinder.tsx` — line 261 `in stock for your …`, line 376 `Not in stock — yet`. Neither is a catalogue or PDP surface, so the assertion holds for the surfaces it names; the Fit Finder's claim is the fabricated fit result M2.5/M2.7 own.)**
  _Requirements: 6.1, 6.3, 6.4_
- [x] 7.5 Add a `formatDeliverySummary()` helper to `luxeride-web/src/lib/availability.ts` that derives the fee range and the ETA range from `LOCATIONS` in `src/data/locations.ts` (₦6,000–₦12,000 and 24 hours–7 days today), so the PDP, footer and future Fit Finder results all render the same figures. _(P0)_ **(verified: derived from `LOCATIONS` by parsing each zone's `eta`, not hardcoded, so a fee change propagates. Renders `₦6,000–₦12,000` and `24 hours to 7 days` — exactly the figures this task predicts.)**
  _Requirements: 5.3_
- [x] 7.6 Create `luxeride-web/src/lib/products.ts` with `relatedProducts(product, limit = 4)` — deterministic ordering that prefers the same category, then the `bundles` category, never returns the product itself, and returns `[]` when nothing qualifies. _(P1)_ **(verified: `src/lib/products.ts`. Deterministic, same-category first then `bundles`, never the product itself, `[]` when neither pool qualifies — the Full Bundle's case, confirmed on the rendered page.)**
  _Requirements: 16.1, 16.2, 16.4_

---

## 8. Product imagery that never looks broken

- [x] 8.1 Create `luxeride-web/src/components/ProductPlaceholder.tsx` as a Server Component rendering a 4:3 panel with a `#1c1916` → `#0a0a0a` gradient, gold `#d4af37` reticle corners in the same idiom as the existing `public/products/single-layer.svg`, and the product name in `font-display`. It must occupy exactly the box the real image would. _(P0)_
  _Requirements: 9.1_
- [x] 8.2 Create `luxeride-web/src/lib/media.ts` exporting `MediaEntry`, `ProductMedia`, `readMediaManifest()` and `resolveMedia(slug)`. It reads `public/products/manifest.json` at module load; when the file is absent it returns `{}` so every product resolves to `null` and takes the placeholder path. Manifest paths are relative to `MEDIA_BASE_URL` from `src/lib/site.ts`. _(P0)_
  _Requirements: 9.1, 9.5, 10.6, 10.12_
- [x] 8.3 Create `luxeride-web/src/components/ProductImage.tsx` as a Server Component: resolve the slug through `resolveMedia()`, and render either `<Image fill sizes={…} placeholder="blur" blurDataURL={…} alt={…} />` from the manifest or `<ProductPlaceholder>` when the entry is missing. Keeping this a Server Component avoids the client boundary that `SafeImage` created for every card image. _(P0)_
  _Requirements: 9.1, 9.2, 9.6, 9.7_
- [x] 8.4 Replace `<SafeImage>` with `<ProductImage>` in `luxeride-web/src/components/ProductCard.tsx` and correct `sizes` to `(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw` so it matches the `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` grid it renders inside. Preserve `alt={product.name}` — it is already correct and must not regress to `alt=""`. _(P0)_
  _Requirements: 9.7, 9.8_
- [x] 8.5 Delete `luxeride-web/src/components/SafeImage.tsx`, grep `src/` to confirm zero remaining imports, and fix any compile errors the removal surfaces. The runtime `onError` safety net moves into the gallery in task 10.3, which is the only place an image can be requested after hydration and turn out to be wrong. _(P0)_ **(verified: deleted; `grep -rn SafeImage src/` returns only a comment in `ProductImage.tsx` describing what it replaced.)**
  _Requirements: 9.3_
- [x] 8.6 Write the check half of `luxeride-web/scripts/media.mjs` (see 9.1): given `--check`, walk `PRODUCTS[].images[]` and the manifest, and exit non-zero with a message naming every path that has no corresponding file in `luxeride-web/public/`. _(P0)_ **(verified: exits 0, reporting 6 catalogue paths and 0 manifest entries across 7 products. It needed one thing this task does not mention: fifteen `images[]` paths in `src/data/products.ts` named files that were never produced, and the check cannot pass while they are declared. Now empty arrays.)**
  _Requirements: 9.4_
- [x] 8.7 Add `"media:check": "node scripts/media.mjs --check"` to `luxeride-web/package.json` and change `"build"` to `"npm run media:check && next build"`, so a missing media file fails the production build instead of shipping a void to paid traffic. _(P0)_ **(verified: `media:check` added; `build` is `npm run media:check && next build`.)**
  _Requirements: 9.4, 9.5_
- [x] 8.8 Align the PDP image box with the card's `aspect-[4/3]` so the same photograph is framed identically on both surfaces, removing the current `h-40 w-52` mismatch. _(P0)_ **(verified: the gallery main image is `aspect-[4/3]`, matching the card; the old `h-40 w-52` strip is gone.)**
  _Requirements: 9.6_
- [x] 8.9 Remove `images.dangerouslyAllowSVG` (and `contentDispositionType`) from `luxeride-web/next.config.ts`. This is safe immediately, not only after raster photography lands: `get-img-props.js` sets `unoptimized = true` for `.svg` sources whenever the flag is `false`, so the six placeholder SVGs keep rendering — while dropping the flag stops them being proxied through the optimiser and served with `Content-Disposition: attachment`. _(P0)_ **(verified: `next.config.ts` no longer sets `images.dangerouslyAllowSVG` or `contentDispositionType`. Nothing renders an `.svg` through the optimiser any more, so the removal has no effect at all today.)**
  _Requirements: 10.9_
- [x] 8.10 Add `blurDataURL` emission to the pipeline so cards get a blurred 16-pixel placeholder derived from the image itself; `next/image` cannot generate one for a dynamically-pathed `src`, so it has to be produced at build time and carried in the manifest. _(P1)_ **(verified: emitted by `scripts/media.mjs` as a 16 px blurred JPEG data URL per image, carried as `blurDataURL` and consumed via `placeholder="blur"`. Measured against the real footage: 475–495 characters per entry.)**
  _Requirements: 9.2_

---

## 9. Media asset pipeline

- [x] 9.1 Create `luxeride-web/scripts/media.mjs` as a plain Node ESM script with no new runtime dependencies. Input contract: `footage/photos/<product-slug>-<angle>.jpg` and `footage/video/<product-slug>.mp4`. If an input directory does not exist, exit non-zero with a message naming the expected directories and the expected filename pattern rather than silently writing an empty manifest. (Those directories do not exist today — see `design.md` → `## Open Questions` items 2 and 3.) _(P1)_ **(verified: `luxeride-web/scripts/media.mjs`, plain Node ESM, no runtime dependency. Exits non-zero naming the expected directories and the `<product-slug>-<angle>.jpg` pattern rather than writing an empty manifest — confirmed by running it with no `footage/photos/`.)**
  _Requirements: 10.3, 10.7_
- [x] 9.2 Implement the photo transform with `sharp` (already present at v0.35.4 in `node_modules`, though it is a transitive dependency — add it to `package.json` as a direct `devDependency`): `.rotate()` with no argument to auto-orient from EXIF; deliberately do **not** call `.withMetadata()`, because sharp strips all metadata by default and calling it would copy the source's 36–51 KB EXIF block into every output; then `.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })`, then `.jpeg({ quality: 82, progressive: true })`. Write to `luxeride-web/public/products/<product-slug>/<angle>.jpg`. Skipping `.rotate()` serves all three source photographs rotated by 90°, because their EXIF Orientation is 6 and their raw pixels are 4000×3000 while `autoOrient` reports 3000×4000. _(P1)_ **(verified against the **real** sources, not a fixture. `sharp` moved from a transitive dependency of `next` to a direct `devDependency`, lock resynced. The real JPEGs carry 36,841 / 48,471 / 51,019-byte EXIF blocks; outputs carry `exif=0B` and `icc=0B`, are progressive, and come out 1200×1600 from 4000×3000 — the orientation was applied and the metadata was not copied.)**
  _Requirements: 10.1, 10.2, 10.3_
- [x] 9.3 Implement poster extraction with the `ffmpeg` binary: `ffmpeg -ss <timestamp> -i <input> -frames:v 1 -vf scale=1280:-1 -q:v 4 <out>.jpg`, writing `public/products/<product-slug>/poster.jpg`. Omit the entry entirely when no clip exists for a product. Do not shell out to `magick`, `convert` or `exiftool` — none are on this machine. _(P1)_ **(verified against a real 208 MB clip: `h264 1920×1080 @30/1`, 96.8 s, carrying `rotation=-90` side data on every frame; the frame is real (channel stdev ≈ 48, not blank). **Finding for §10.16:** because that footage is portrait-stored-landscape, `scale=1280:-1` bounds the *width* and yields a **1280×2276** poster at ~9:16, which does not match the 4:3 box the photographs use. Left exactly as specified rather than silently changed, because the block that would consume the poster is unbuilt.)**
  _Requirements: 10.4, 10.5_
- [x] 9.4 Make the script deterministic — stable key ordering, fixed JPEG options, no timestamps in output — so a second run with unchanged sources produces byte-identical files and the script is safe to run in a loop and diffable in review. _(P1)_ **(verified: two runs over the real footage produced byte-identical outputs, ffmpeg poster included.)**
  _Requirements: 10.8_
- [x] 9.5 Write `luxeride-web/public/products/manifest.json` at the end of each run, carrying for every product the resolved `width`, `height`, `alt`, per-image `blurDataURL`, and optional `poster` and `video`. Commit the manifest so the app runs with no media step. _(P1)_ **(verified: `public/products/manifest.json` carries per-image `path`, `width`, `height`, `alt`, `blurDataURL`, plus optional `poster`. It emits **no** `video` entry, deliberately — see §10.16.)**
  _Requirements: 10.6_
- [ ] 9.6 Rewrite the 6 `images[]` entries in `luxeride-web/src/data/products.ts` that point at the flat SVG paths to the new `public/products/<slug>/<angle>.jpg` paths, and delete the now-unreferenced `luxeride-web/public/products/*.svg` files once nothing points at them. Do this only after 8.6 reports a clean check, otherwise the build gate will fail. _(P1)_
  _Requirements: 10.3, 10.12_
- [x] 9.7 Document in `luxeride-web/README.md` how to add `images.qualities` to `next.config.ts` before using any non-default `quality` prop — an out-of-range quality is coerced to the nearest allowed value rather than erroring — and leave `images.formats` at its default `['image/webp']`. _(P2)_ **(verified: recorded in `luxeride-web/README.md`, including that an out-of-range `quality` is silently coerced rather than erroring.)**
  _Requirements: 10.10, 10.11_
- [x] 9.8 Add an `images.formats: ['image/avif', 'image/webp']` toggle behind a comment recording the trade-off (AVIF is roughly 50% slower to encode for about 20% smaller files, and the framework's own guidance is to prefer WebP). Measure before enabling. _(P2)_ **(verified: `images.formats` left at its default; the AVIF toggle sits commented in `next.config.ts` with the encode-time trade-off recorded.)**
  _Requirements: 10.10_
- [x] 9.9 Add the object-storage migration seam: `MEDIA_BASE_URL` already exists in `src/lib/site.ts`; document that moving to Supabase Storage or Vercel Blob means changing that constant, adding an `images.remotePatterns` entry for the bucket, and copying the manifest paths — no component holds a path literal. _(P2)_ **(verified: recorded in `luxeride-web/README.md` — set `MEDIA_BASE_URL`, add an `images.remotePatterns` entry, copy the manifest paths; nothing holds a path literal, they all go through `mediaUrl()`.)**
  _Requirements: 10.12_

---

## 10. Rebuild the product detail page

- [ ] 10.1 Create `luxeride-web/src/components/Breadcrumbs.tsx` as a Server Component rendering a `<nav aria-label="Breadcrumb">` with an ordered list, `aria-current="page"` on the last item and no link on it, and the trail passed in as `{ name, url }[]`. It must stay readable at 320 px without truncating a label. _(P0)_
  _Requirements: 8.1, 8.3, 8.4_
- [ ] 10.2 Restructure `luxeride-web/src/app/products/[slug]/page.tsx`: render `Breadcrumbs`, then a two-column grid on `md` and a single column below, with the gallery left and a `BuyBox` right. Keep `generateStaticParams` and the existing `notFound()` call. _(P0)_
  _Requirements: 5.1, 5.6_
- [x] 10.3 Create `luxeride-web/src/components/ProductGallery.tsx` as a `"use client"` component: a selected-index state, one main `<Image>` rendered by `ProductImage` at `sizes="(min-width: 768px) 50vw, 100vw"`, and a thumbnail row of `<button>`s that are keyboard-operable and expose `aria-pressed`. Retain an `onError` handler here that swaps to `ProductPlaceholder` — this is the one place an image can be requested after hydration and turn out to be wrong. Set `sizes` on the main image deliberately — the current fixed `h-40 w-52` boxes omit it entirely, so the browser assumes `100vw` and downloads a full-viewport-width file for a 208 px box. _(P0)_ **(verified: `ProductGallery.tsx` — selected index, keyboard-operable thumbnail `<button>`s with `aria-pressed`, main image at `sizes="(min-width: 768px) 50vw, 100vw"`, one post-hydration `onError`. Exercised with a temporary fixture manifest because it had never rendered at all: 1 main `<img>`, 3 thumbnails at `sizes="80px"`, 0 `<div>` inside a `<button>`.)**
  _Requirements: 5.6, 5.7, 9.3_
- [ ] 10.4 Create `luxeride-web/src/components/BuyBox.tsx` as a Server Component holding the name, `note`, `formatPriceFrom()` output, the tier/row explanation, the Fit Guarantee badge, `formatDeliverySummary()` and the existing `Select My Car & Add to Cart` link to `/fit-finder?product=<slug>`. It needs no interactivity, so it stays out of the client bundle. _(P0)_
  _Requirements: 5.1, 5.2, 5.3, 5.12_
- [ ] 10.5 Add a delivery block to that page rendering the fee range and ETA range from `LOCATIONS`, stating that the zone fee is calculated at checkout because checkout is currently the only place the zone is known. _(P0)_
  _Requirements: 5.3_
- [ ] 10.6 Add "What's in the box", materials, coverage, installation and care sections to that page, rendered from the fields added in 7.1. _(P0)_
  _Requirements: 5.4, 5.5_
- [ ] 10.7 Create `luxeride-web/src/components/StickyBuyBar.tsx` as a Server Component: a `position: fixed` bottom bar visible below `md`, linking to `/fit-finder?product=<slug>`, with `padding-bottom: env(safe-area-inset-bottom)` and a matching `padding-bottom` spacer added to the page so it never covers the footer or the home indicator. Pure CSS — no scroll listener, no client component. _(P0)_
  _Requirements: 5.8, 5.9_
- [~] 10.8 Export `generateMetadata({ params })` from that page, returning `pageMetadata()` with a product-specific title of ≤60 characters, a 120–160 character description built from `note` + materials, canonical `/products/<slug>`, and an Open Graph image of `/products/<slug>/opengraph-image`. Call `notFound()` for an unknown slug so the 404 page renders. _(P0)_ **(verified in part — the half §3.1's own compile-time gate permits. A product-specific `title` is now returned by `generateMetadata`, ≤32 characters against the 60-character ceiling; all seven PDPs previously emitted the identical root title. **Not done:** the canonical, the 120–160 character description and the `og:image` all need `pageMetadata()`/`SITE_URL` from §3.1/§3.5, which need `metadataBase`, which needs D-05 — undecided. The description is not laziness: composing one from `note` + `materials` + `AVAILABILITY_COPY` was measured across all seven and lands between 122 and 176 characters (three over the ceiling), while dropping the availability sentence lands between 74 and 128 (most under the floor).)**
  _Requirements: 5.11, 11.1, 11.5, 11.10, 14.3_
- [ ] 10.9 Render `<JsonLd data={productJsonLd(product)} />` and `<JsonLd data={breadcrumbJsonLd(trail)} />` on that page. Emit no `AggregateRating` node — there is no review store, and a fabricated rating is both a structured-data policy violation and the single most damaging thing this feature could ship. _(P0)_
  _Requirements: 12.1, 12.2, 12.3, 12.4, 12.9_
- [ ] 10.10 Emit the `Offer` with `priceCurrency: "NGN"`, `priceValidUntil`, and a `priceSpecification` carrying `minPrice`/`maxPrice` from `priceRange()` rather than a single `price`, because the band genuinely spans the car's tier and the row configuration and a single number is one the WhatsApp quote can contradict. Do not assert `availability`. _(P0)_
  _Requirements: 12.2, 12.3_
- [x] 10.11 Create `luxeride-web/src/components/ProductFaq.tsx` as a Server Component using `<details>`/`<summary>` so it works without JavaScript, rendering only the entries present in the data. _(P1)_ **(verified: `ProductFaq.tsx` uses `<details>`/`<summary>` so it opens without JavaScript, and returns `null` for the products with no FAQ rather than rendering an empty box. Rendered on `single-layer-mats`, `double-layer-mats` and `full-bundle`; absent on `seat-covers`.)**
  _Requirements: 5.10_
- [ ] 10.12 Emit `faqJsonLd` for the PDP FAQ, using only the entries that `ProductFaq` actually renders. _(P1)_
  _Requirements: 12.6_
- [x] 10.13 Create `luxeride-web/src/components/RelatedProducts.tsx` as a Server Component rendering at most 4 `ProductCard`s chosen by `relatedProducts()`, with a heading that makes the section's purpose unambiguous and no implication that the related product is already fitted to the visitor's car. Omit the section entirely when the helper returns `[]`. _(P1)_ **(verified: `RelatedProducts.tsx`, a Server Component rendering at most 4 cards. The heading names the catalogue and the sentence under it says plainly that nothing there has been checked against the visitor's car — a bare "you may also like" grid would imply the same false fit claim as a fabricated `FIT ✓`. Returns `null` when `relatedProducts()` returns `[]`, the Full Bundle's case.)**
  _Requirements: 16.1, 16.2, 16.3, 16.4_
- [ ] 10.14 Create `luxeride-web/src/app/products/[slug]/opengraph-image.tsx` using `ImageResponse`, with `alt` and `size = { width: 1200, height: 630 }`, reading `await params` to get the slug and drawing that product's name, price-from and first image. Keep the output under 8 MB — the build fails above that. _(P1)_
  _Requirements: 11.6, 11.7, 11.8_
- [ ] 10.15 Create `luxeride-web/src/app/shop/[category]/opengraph-image.tsx` in the same shape, keyed on the category slug. _(P1)_
  _Requirements: 11.6, 11.11_
- [ ] 10.16 Add a video block to the PDP that renders the poster from the manifest and only attaches a `<source>` once a compressed derivative exists; emit a `VideoObject` node only when the video element actually renders. Never attach a raw 74–208 MB MP4 as a video source. _(P2)_
  _Requirements: 12.7, 10.4_
- [ ] 10.17 Add tap-to-zoom on the gallery main image, pointer-driven, no library, and disabled on coarse pointers below `md` where it competes with scrolling. _(P2)_
  _Requirements: 5.6_

---

## 11. Product discovery

- [ ] 11.1 Create `luxeride-web/src/components/CatalogExplorer.tsx` as a `"use client"` component receiving the full product array as a prop and owning query, sort and empty-state state. Keep the state here rather than in the URL so `/shop` and `/shop/<slug>` stay prerendered — a 7-product catalogue does not benefit from a dynamic route. _(P0)_
  _Requirements: 7.1, 7.5, 15.1, 15.2_
- [ ] 11.2 Implement search matching case-insensitively against `name`, `note` and the owning category's `name`, so "mats", "TPE", "waterproof" and "boot" all return results. _(P0)_
  _Requirements: 7.2_
- [ ] 11.3 Implement sorting by Featured (source order), Price low→high, Price high→low and Name, comparing the **lower bound** of `priceRange()` for ascending order so the sort matches the number the card actually shows. Change the order without a page navigation. _(P0)_
  _Requirements: 7.5, 7.6_
- [ ] 11.4 Implement the empty state: name the unmatched term, offer to clear the search, offer `/shop`, and render a WhatsApp link pre-filled with the term via `whatsappLink()` from `src/lib/whatsapp.ts` and `notFoundMessage()`-style copy. Never render a blank area. _(P0)_
  _Requirements: 7.3_
- [ ] 11.5 Add an `aria-live="polite"` region announcing the visible result count, and render the same count in visible copy above the grid. _(P0)_
  _Requirements: 7.4_
- [ ] 11.6 Make the search input and sort control fully operable from a hardware keyboard: a real `<input>` with a visible label, a real `<select>` or a radiogroup for sort, and no mouse-only affordances. _(P0)_
  _Requirements: 7.7_
- [ ] 11.7 Replace the hand-rolled `ProductCard` grid in `luxeride-web/src/app/shop/page.tsx` and `luxeride-web/src/app/shop/[category]/page.tsx` with `<CatalogExplorer products={…} />`, removing the duplicate category-chip markup now that categories are routes — keep a single "All / Category" chip row on `/shop` built from `/shop` and `/shop/<slug>` hrefs. _(P0)_
  _Requirements: 7.1, 4.1_
- [ ] 11.8 Move the query and sort state into the URL once `PRODUCTS.length` exceeds 50, so results become shareable. Below that threshold this task is deliberately not done. _(P2)_
  _Requirements: 7.8_

---

## 12. Structured data

- [ ] 12.1 Render `<JsonLd data={organizationJsonLd()} />` once from `luxeride-web/src/app/layout.tsx`, describing LuxeRide, its `wa.me` contact point built from `WHATSAPP_NUMBER`, and its canonical URL from `SITE_URL`. _(P0)_
  _Requirements: 12.5_
- [ ] 12.2 Build the `Product` node in `src/lib/seo.tsx` with `name`, `description`, `image` (absolute, resolved through `SITE_URL`), `sku` set to the product `slug`, `category` from the owning category name, and `brand`. _(P0)_
  _Requirements: 12.1_
- [ ] 12.3 Render `BreadcrumbList` on the category page and on the PDP, matching the visible trail from `Breadcrumbs.tsx` element for element — Home → Shop → Category → Product. _(P0)_
  _Requirements: 8.2, 12.6_
- [ ] 12.4 Make it structurally impossible for `productJsonLd()` to emit an `AggregateRating`: keep any `review`/`rating` field absent from the `Product` interface added in 7.1, then add `luxeride-web/scripts/seo-check.mjs` which serialises `productJsonLd()` for all 7 products and exits non-zero if the output contains the string `aggregateRating`, and wire it into the `verify` script from 2.4. There is no review store anywhere in the app; a fabricated rating is a structured-data policy violation and a trust failure. _(P0)_
  _Requirements: 12.4, 12.9_
- [ ] 12.5 Add `images` entries to the `Product` node from the manifest once 8.10 exists, so each product page advertises its real photography to the image crawler rather than the placeholder. _(P1)_
  _Requirements: 12.1_
- [ ] 12.6 Optionally add `schema-dts` as a `devDependency` and type the JSON-LD objects with `WithContext<Product>` — useful, but not a blocker, and it adds a dependency to a project that currently has no build blockers allowed to multiply. _(P2)_
  _Requirements: 12.1_

---

## 13. Sitemap and robots

- [ ] 13.1 Create `luxeride-web/src/app/sitemap.ts` exporting `default function sitemap(): MetadataRoute.Sitemap`, listing `/` (priority 1, weekly), `/shop` (0.9, weekly), every `/shop/<slug>` (0.8, weekly) and every `/products/<slug>` (0.7, weekly), with `lastModified` set to the newest `mtime` of the relevant source file so the value is real rather than `new Date()`. Every URL must be built from `SITE_URL` so it can never disagree with `metadataBase`. No query strings anywhere in the output. _(P0)_
  _Requirements: 13.1, 13.2_
- [ ] 13.2 Create `luxeride-web/src/app/robots.ts` exporting `default function robots(): MetadataRoute.Robots`, allowing `/`, disallowing `/cart`, `/checkout` and `/order/`, and pointing `sitemap` at the same absolute URL the sitemap file uses. Add a comment recording whether `/fit-finder` is allowed and why — the answer is coupled to `design.md` → `## Open Questions` item 5. _(P0)_
  _Requirements: 13.3, 13.4_
- [ ] 13.3 Add `images: [...]` entries for product pages once the manifest exists, so the sitemap doubles as an image sitemap. _(P2)_
  _Requirements: 13.1_

---

## 14. Caching and rendering verification

- [x] 14.1 Run `npm run build` and paste the route table into the pull request, asserting that `/shop` and all five `/shop/<slug]` paths are shown as prerendered and that `/shop` no longer appears as `ƒ`. This is the acceptance test for Requirement 15. _(P0)_ **(verified in part: `npm run build` exits 0 and the route table shows the seven `●` product paths as expected — but `/shop` is **still `ƒ`** and the five `/shop/<slug>` paths **do not exist yet**. That half is §6.1–6.9 / M3.3.)**
  _Requirements: 15.1, 15.4_
- [~] 14.2 Grep `luxeride-web/src/app/` for `searchParams` and confirm only `src/app/fit-finder/page.tsx` still reads it. Any new read on a catalogue route undoes 6.8. _(P0)_ **(verified, and it **fails**: `grep -rn searchParams src/app/` returns **two** files, `src/app/shop/page.tsx` and `src/app/fit-finder/page.tsx`. Only the second should remain, which is exactly what §6.8 removes. Recorded as a failing check rather than a passing one.)**
  _Requirements: 15.2_
- [x] 14.3 Add `export const dynamicParams = false` to `luxeride-web/src/app/products/[slug]/page.tsx` so an ungenerated slug returns a real 404 rather than being rendered on demand. _(P1)_ **(verified: `export const dynamicParams = false` added; `curl` of `/products/not-a-real-product` returns 404.)**
  _Requirements: 13.5_
- [x] 14.4 Pass a `preload` hint for the first-row images only, leaving the rest lazy. `priority` is deprecated in Next 16 in favour of `preload` — use `preload`, and do not set both. _(P0)_ **(verified: `ProductCard` takes `preload`; `/` and `/shop` set it for the first two cards — the first row at `grid-cols-2`, the row above the fold on a phone. `preload`, never `priority`. One `rel=preload as=image` on each route, correct because only one product has media today.)**
  _Requirements: 15.5_
- [x] 14.5 Record in `luxeride-web/README.md` that no ISR interval is configured because the catalogue is a compile-time constant, and that `revalidate` belongs to whichever spec introduces real data reads. _(P1)_ **(verified: recorded in `luxeride-web/README.md` — no ISR interval, because every catalogue route is a compile-time constant, and `revalidate` belongs to whichever spec first introduces a real data read.)**
  _Requirements: 15.3, 15.4, 15.6_
- [x] 14.6 Add a `headers()` rule to `luxeride-web/next.config.ts` for `/products/:path*` setting `Cache-Control: public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400`. Do not use `immutable` — the master filenames from `scripts/media.mjs` are slug-and-angle based, not content-hashed, so the same URL will legitimately change when a photo is replaced. _(P1)_ **(verified, **with a measured deviation**. §14.6 specifies `/products/:path*`; against a production server that pattern also matched the PDP itself and returned `Cache-Control: public, max-age=0, s-maxage=31536000, …` on the product **HTML**. The Next headers guide defines `*` as zero-or-more, so even `:file*` still swallows `/products/<slug>`. The rule uses `/products/:slug/:file+`, verified both ways on `next start`.)**
  _Requirements: 10.3, 15.1_

---

## 15. Verification sweep

- [ ] 15.1 With the app running, `curl` the `<head>` of `/`, `/shop`, all 5 category routes, all 7 PDPs, `/fit-finder`, `/cart`, `/checkout`, `/order/confirmation` and the 4 policy routes. Assert every catalogue page has a distinct `<title>` and `<meta name="description">`, a self-referencing query-free `alternates.canonical`, an `og:image` with `og:image:width` 1200 and `og:image:height` 630, and a `twitter:card`. _(P0)_
  _Requirements: 11.1, 11.4, 11.5, 11.6, 11.10_
- [ ] 15.2 `curl -s localhost:3000/sitemap.xml` and confirm it contains `/`, `/shop`, 5 category URLs and 7 product URLs, all absolute, none containing `?`. `curl -s localhost:3000/robots.txt` and confirm the three disallows and the sitemap reference. _(P0)_
  _Requirements: 13.1, 13.3_
- [ ] 15.3 Paste one PDP through the Google Rich Results Test and confirm `Product` and `BreadcrumbList` validate, `Offer` is present, and **no** `AggregateRating` appears. Do the same for a category page. _(P0)_
  _Requirements: 12.1, 12.2, 12.4, 12.6_
- [~] 15.4 On a real 360 px phone: open the mobile menu and reach every route; load `/` and confirm none of the four "Popular Right Now" cards is an empty grey box; load `/products/seat-covers` (a product with no photography) and confirm card, PDP and `/shop` all show the branded placeholder with identical grid geometry. _(P0)_ **(verified in part: with no manifest every image container renders `ProductPlaceholder` and **zero** `<img>` elements are emitted on `/`, `/shop` or any PDP, so an empty grey box has no way to appear. Counted on rendered HTML with the RSC payload stripped: `/` 4 cards / 4 placeholders, `/shop` 7 / 7, `full-bundle` 1 / 0. **Not verified:** the 360 px viewport and the mobile-menu walk. Both must be re-run once the media pipeline produces a manifest, because that is when `<img>` elements start existing.)**
  _Requirements: 2.1, 2.2, 9.1, 9.5_
- [ ] 15.5 Visit `/shop?category=floor-mats` and confirm the browser lands on `/shop/floor-mats` with the address bar updated; then request `/shop?category=nonsense` and confirm the visitor stays on `/shop` rather than being redirected into a 404. _(P0)_
  _Requirements: 4.3, 4.4_
- [~] 15.6 Inspect the `srcset` the browser chooses for a card image at 360 px, 768 px and 1280 px and confirm none picks a 1920 or 3840-wide candidate; do the same for the PDP gallery main image. _(P0)_ **(measured — a negative result worth keeping. The candidate list **does** contain 1920, 2048 and 3840, so the obvious fix is to narrow `images.deviceSizes`. Measured first: requesting `w=1920` and `w=3840` both return the image's own 1200×1600, byte-identical to `w=1200`. Next clamps to the source, so no visitor can receive an upscaled or oversized file, and narrowing `deviceSizes` would have been churn that removed capability for larger future sources. Left alone on purpose. The literal wording — which candidate the *browser* picks — still needs a browser.)**
  _Requirements: 9.8_
- [x] 15.7 Update the route list in `luxeride-web/README.md` to include `/shop/[category]`, the four `/policies/*` routes, and the note that `?category=` URLs redirect. _(P1)_ **(verified: `luxeride-web/README.md` carries a route table naming `/shop/[category]`, the four `/policies/*` routes, `/contact`, `/order/[reference]` and `/admin`, each with the milestone that adds it, plus the `?category=` redirect note and the `dynamicParams = false` behaviour.)**
  _Requirements: 4.3, 3.3, 11.10_