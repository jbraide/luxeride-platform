# Implementation Plan

## Status

**PARTIAL** — §2 (campaign registry) and §4–§9 (analytics core, script injection, funnel and commerce
instrumentation, attribution capture, the order reference, and thank-you durability) are built and
verified by `npm run verify` exiting 0 on 2026-10-03. The nine baseline-audit items were verified on
2026-10-02.

> **Leaf checkboxes are ticked per task.** The authoritative record is
> `../master-build-plan/tasks.md` M3.5 and M3.7–M3.11, which name the files and the verification.

**Still open:** §3 (campaign copy rendered on `/` and `/fit-finder` — the resolver exists, the
rendering does not), §10.1–10.2 (`/privacy` and `/contact` — the privacy disclosure is now served by
`/policies/privacy` via `storefront-catalog` §5.5), §10.4, §10.6, §11 (Conversions API, needs a
server) and §12 (the pre-spend gate).

---

- [x] 1. Verified baseline audit — what exists and what does not
  - [x] 1.1 Confirm the app contains no analytics, no pixel, no tag manager, no consent handling and no UTM capture: regex sweep of `luxeride-web/src/` for `gtag|googletagmanager|fbq|facebook|analytics|pixel|consent|cookie|utm_|fbclid|gclid|next/script|Script` returns **no matches** _(P0)_ _(verified: luxeride-web/src/, grep, no matches)_
    - _Requirements: 3.1, 4.1_
  - [x] 1.2 Confirm `src/app/page.tsx` reads no search parameters at all and renders one fixed hero, so `?product=` is ignored on `/` _(P0)_ _(verified: luxeride-web/src/app/page.tsx:1-63)_
    - _Requirements: 1.1_
  - [x] 1.3 Confirm `/fit-finder` accepts `?product=` and passes it as `lockedProductSlug`, and that an unknown slug yields `lockedProduct === undefined` with no user-visible message and no event _(P0)_ _(verified: luxeride-web/src/app/fit-finder/page.tsx:6-12, luxeride-web/src/components/FitFinder.tsx:22)_
    - _Requirements: 2.1, 2.2_
  - [x] 1.4 Confirm the prototype's `CONFIG.PRODUCT_LANDINGS` aliases (`mats`, `single-layer`, `seat-covers`, `bundle`) and the `applyProductLanding()` product-lock + headline-rewrite behaviour, including the `innerHTML` headline write _(P0)_ _(verified: platform/luxeride-funnel (2).html:665-691, 722-731)_
    - _Requirements: 1.3, 1.4_
  - [x] 1.5 Confirm the order id is minted client-side from the wall clock and is **absent** from `buildOrderMessage`, so no WhatsApp thread carries an order identifier _(P0)_ _(verified: luxeride-web/src/app/checkout/page.tsx:62, luxeride-web/src/lib/whatsapp.ts:18-36)_
    - _Requirements: 6.1, 6.4_
  - [x] 1.6 Confirm the confirmation route reads `lastOrder` from the `localStorage`-persisted store and renders "No recent order found" on a miss, with a success tick that would be a lie in that state _(P0)_ _(verified: luxeride-web/src/app/order/confirmation/page.tsx:9-30, luxeride-web/src/store/order.ts:28-36)_
    - _Requirements: 7.3, 7.4_
  - [x] 1.7 Confirm the footer is two paragraphs with zero links, and that no privacy, terms or contact page exists _(P0)_ _(verified: luxeride-web/src/components/Footer.tsx:1-10)_
    - _Requirements: 8.1_
  - [x] 1.8 Confirm `npm run build` currently fails on `prisma/seed.ts(2,34)` and no `.next/BUILD_ID` exists, so there has never been a deployable production build _(P0)_ _(verified: _CONTEXT.md §3)_
    - _Requirements: 9.2_

- [x] 2. Campaign registry and the single resolver **(done — master-build-plan M3.5)**
  - [x] 2.1 Create `luxeride-web/src/data/landing.ts` exporting `CampaignLanding`, `CAMPAIGN_LANDINGS` and `ResolvedLanding`, following the existing static-TS data-module pattern of `src/data/products.ts` — no DB, no CMS, no fetch _(P0)_
    - _Requirements: 1.1, 1.5_
  - [x] 2.2 Seed the four prototype aliases `mats`, `single-layer`, `seat-covers`, `bundle` → `double-layer-mats`, `single-layer-mats`, `seat-covers`, `full-bundle`, with the prototype's headline and sub verbatim _(P0)_
    - _Requirements: 1.4_
  - [x] 2.3 Implement `resolveCampaign(raw)` with strict alias-before-product-slug order, so `seat-covers` resolves to the campaign copy and the product lock `src/data/products.ts:38` _(P0)_
    - _Requirements: 1.3_
  - [x] 2.4 Return `match: "unknown"` and `null` for unresolvable input; do not throw and do not return a partial campaign _(P0)_
    - _Requirements: 1.8, 2.1, 2.3_
  - [x] 2.5 Constrain the `offer` field to offers the checkout already honours (prepay −₦2,000 + free delivery, `src/app/checkout/page.tsx:26-28`); reject a campaign that declares any other figure _(P0)_
    - _Requirements: 1.6_
  - [x] 2.6 Add a unit-testable assertion helper that every `CAMPAIGN_LANDINGS[].productSlug` resolves through `getProductBySlug`, so a renamed product breaks at build time not at ad-review time _(P1)_
    - _Requirements: 1.5, 2.3_

- [x] 3. Campaign landing rendering on `/` and `/fit-finder` **(done — master-build-plan M3.6)**
  - [x] 3.1 Convert `luxeride-web/src/app/page.tsx` to accept `searchParams` and resolve `product`, keeping it a Server Component _(P0)_
    - _Requirements: 1.1_
  - [x] 3.2 Extract the hero in `src/app/page.tsx` into a `HomeHero` component that takes resolved headline, sub, offer badge and CTA href; render today's copy verbatim when nothing resolves, with no layout shift _(P0)_
    - _Requirements: 1.1, 1.9_
  - [x] 3.3 Point the home hero's primary CTA at `/fit-finder?product=<value>` when a variant resolves, so the funnel's product step is skipped as `applyProductLanding()` did _(P0)_
    - _Requirements: 1.2_
  - [x] 3.4 Render the `{em}` marker in a campaign headline as a `<span className="text-gold">` on the server; never use `innerHTML` as the prototype did at line 729 _(P0)_
    - _Requirements: 1.1_
  - [x] 3.5 Extend **(deviation: attribution is captured client-side by `CampaignCapture` reading the URL, not threaded through `<FitFinder>` props — same outcome)** `luxeride-web/src/app/fit-finder/page.tsx` to read `product` plus `utm_source/medium/campaign/content/term`, `fbclid` and `gclid`, and pass the resolved variant and attribution to `<FitFinder>` _(P0)_
    - _Requirements: 1.8, 5.1_
  - [x] 3.6 On an unresolved `?product=`, render the default landing hero and the unlocked funnel — no 404, no redirect, no stuck lock _(P0)_
    - _Requirements: 2.1, 2.6_
  - [x] 3.7 Leave the address bar untouched when a variant resolves; never canonicalise the query away _(P1)_
    - _Requirements: 1.7_
  - [x] 3.8 Keep the `/fit-finder` progress step list (`src/components/FitFinder.tsx:113-121`) consistent with whether a product is locked and whether a row step is needed _(P1)_
    - _Requirements: 2.6_

- [x] 4. Analytics core — taxonomy, providers, single entry point **(done — master-build-plan M3.7)**
  - [x] 4.1 Create `luxeride-web/src/lib/analytics/events.ts` with `LuxeEventName`, `FitState` (`FITTED`/`NOT STOCKED`/`UNKNOWN`), `WhatsAppCtaType`, `BaseEvent` and a typed `EventMap`; one registry entry per event carrying its Meta name and its GA4 name _(P0)_
    - _Requirements: 3.1, 3.9, 3.10_
  - [x] 4.2 Create `luxeride-web/src/lib/analytics/providers/types.ts` with `AnalyticsProvider { id, isConfigured, loadScript, pageView, track, flushBeacon }` _(P0)_
    - _Requirements: 4.6_
  - [x] 4.3 Create `luxeride-web/src/lib/analytics/providers/ga4.ts` pushing to `window.gtag`, mapping to GA4 recommended event names and sending `send_page_view: false` so page views are never double-counted _(P0)_
    - _Requirements: 3.2, 4.4_
  - [x] 4.4 Create `luxeride-web/src/lib/analytics/providers/meta.ts` pushing to `window.fbq`, with `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Lead` and `CustomEvent` (LuxeRide names), each carrying `eventID` _(P0)_
    - _Requirements: 3.6, 3.13_
  - [x] 4.5 Create `luxeride-web/src/lib/analytics/providers/tiktok.ts` implementing the same interface but inert — `isConfigured()` false until `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set _(P2)_
    - _Requirements: 4.7_
  - [x] 4.6 Create `luxeride-web/src/lib/analytics/config.ts` reading `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`, each typed, each optional _(P0)_
    - _Requirements: 4.5_
  - [x] 4.7 Create `luxeride-web/src/lib/analytics/index.ts` with a synchronous `track()` that appends to an in-memory queue first, then fans out per provider inside `try/catch`; it must never return a promise _(P0)_
    - _Requirements: 3.14, 4.6_
  - [x] 4.8 Generate one `event_id` per `track()` call from `crypto.randomUUID()` and pass the identical value to every provider; fall back to `Date.now().toString(36)` + `Math.random()` as `src/store/cart.ts:34-37` already does _(P0)_
    - _Requirements: 3.13_
  - [x] 4.9 Attach `currency: "NGN"` and numeric `value` to every monetary event, derived from `src/lib/pricing.ts` — never from the formatted `₦` string returned by `fmtNaira` _(P0)_
    - _Requirements: 3.11_
  - [x] 4.10 Add a payload linter that throws in development if any event payload contains a `name`, `phone`, `address` or free-text query key _(P0)_
    - _Requirements: 3.12, 8.3_
  - [x] 4.11 Implement `setDebug()` driven by `?debug=1`, logging every event and every provider payload to the console without changing production behaviour _(P0)_
    - _Requirements: 4.8_
  - [x] 4.12 Record a provider script-load failure once and retry at most once; never let a failed provider block or delay the funnel _(P1)_
    - _Requirements: 4.9_

- [~] 5. Script injection and page views **(5.1–5.5 done — master-build-plan M3.7; 5.6 is a console check not run here)**
  - [x] 5.1 Create `luxeride-web/src/components/Analytics.tsx` as a Client Component that renders the GA4 `<Script src>` and the inline Meta Pixel `<Script id="meta-pixel-base" dangerouslySetInnerHTML>` with `strategy="afterInteractive"`, and **renders nothing** when the ID env var is absent _(P0)_
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 5.2 Mount `<Analytics />` from `luxeride-web/src/app/layout.tsx`, the root layout, so every route gets it _(P0)_
    - _Requirements: 4.2_
  - [x] 5.3 Wrap the tracking tree in `<Suspense>` in `src/app/layout.tsx`, because `/` is statically prerendered and `useSearchParams` without a boundary fails the production build _(P0)_
    - _Requirements: 4.3_
  - [x] 5.4 Create `luxeride-web/src/components/PageView.tsx` firing `page_view` once on first render and on every client-side route change, using `usePathname()` + `useSearchParams()` _(P0)_
    - _Requirements: 3.2_
  - [x] 5.5 Emit `campaign_landing_viewed` once per resolved variant and `campaign_landing_fallback` once per unresolved `?product=`, carrying the offending value, the parameter name and the path _(P0)_
    - _Requirements: 1.8, 2.2_
  - [ ] 5.6 Verify in the console that a hard load of `/` and then three `<Link>` navigations produce **exactly four** `page_view` events — the check that catches both double-counting and missing-navigation bugs _(P0)_
    - _Requirements: 3.2, 4.4_

- [x] 6. Funnel and commerce instrumentation **(done — master-build-plan M3.8)**
  - [x] 6.1 Fire `AddToCart` in `luxeride-web/src/components/FitFinder.tsx` inside `handleAddToCart` (line 84) carrying product, brand, model, year, rows, unit price and quantity _(P0)_
    - _Requirements: 3.4_
  - [x] 6.2 Fire `fit_result_rendered` with `state: "FITTED"` when the `results` step renders, from `pickRow`/`confirmYear` — today it can only ever be `FITTED` because `pickCar` routes unavailable cars to `comingsoon` first _(P0)_
    - _Requirements: 3.8, 3.9_
  - [x] 6.3 Fire `fit_refused` when the `comingsoon` step renders, carrying brand, model and `state: "NOT STOCKED"` _(P0)_
    - _Requirements: 3.8_
  - [x] 6.4 Fire debounced `car_search` on the search input and `car_search_no_match` when a non-empty query yields zero cars from the `FLAT_CARS` memo; send result count and query length, never the query text _(P0)_
    - _Requirements: 3.8, 3.12_
  - [x] 6.5 Fire `live_photo_requested` on the anchor at `src/components/FitFinder.tsx:306` and `offer_sent` on the anchor at line 332, converting each `<a>` into an explicit `onClick` handler before navigation _(P0)_
    - _Requirements: 3.8_
  - [x] 6.6 Fire `waitlist_phone_submitted` when the coming-soon phone field is non-empty at CTA; transmit **neither** the number nor a hash of it _(P0)_
    - _Requirements: 3.8, 3.12_
  - [x] 6.7 Add a single `onClick` capture on every `wa.me` anchor in `src/components/FitFinder.tsx` and `src/app/checkout/page.tsx` that fires `whatsapp_cta_clicked` with the right `cta_type` — `live_photos`, `offer`, `coming_soon`, `car_not_found`, `checkout_order` _(P0)_
    - _Requirements: 3.8, 3.10_
  - [x] 6.8 Fire `ViewContent`/`view_item` from a new client child mounted by `luxeride-web/src/app/products/[slug]/page.tsx`, carrying the product slug, name and the `priceRange(product)` range as two numbers _(P0)_
    - _Requirements: 3.3_
  - [x] 6.9 Fire `InitiateCheckout`/`begin_checkout` from the "Proceed to Checkout" `LinkButton` in `luxeride-web/src/app/cart/page.tsx`, carrying item count and subtotal _(P0)_
    - _Requirements: 3.5_
  - [x] 6.10 Fire `Lead`/`generate_lead` in `luxeride-web/src/app/checkout/page.tsx` **after** `validateNGPhone` passes and **before** `window.open`, with `value` = total and `currency: "NGN"` and **no** name, phone or address in the payload _(P0)_
    - _Requirements: 3.6, 3.12_
  - [x] 6.11 Assert in code review that nothing `await`s between the `Lead` call and `window.open`, because the popup must stay inside the user-gesture call stack or the browser blocks it _(P0)_
    - _Requirements: 6.8_

- [x] 7. Attribution capture and persistence **(done — master-build-plan M3.9)**
  - [x] 7.1 Create `luxeride-web/src/lib/analytics/attribution.ts` with `Attribution`, `ATTRIBUTION_STORAGE_KEY = "luxeride-attribution"`, `readAttribution()` and a write-once `captureAttribution()` _(P0)_
    - _Requirements: 5.1, 5.4_
  - [x] 7.2 Read `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `gclid`, the resolved campaign key, the landing path, the referrer and the timestamp, all as strings with `"(not set)"` written explicitly rather than left blank _(P0)_
    - _Requirements: 5.1, 5.8_
  - [x] 7.3 Never overwrite an existing record — first-touch wins for the life of the record _(P0)_
    - _Requirements: 5.2_
  - [x] 7.4 Never forward `fbclid` to GA4 or TikTok, and never forward `gclid` to Meta _(P0)_
    - _Requirements: 5.3_
  - [x] 7.5 Store no personal data in the attribution record and bound it to the named fields only _(P0)_
    - _Requirements: 5.4_
  - [x] 7.6 Wrap every `window`/`localStorage` access in `try/catch` so private mode, disabled cookies and quota errors degrade to no attribution and a working page _(P0)_
    - _Requirements: 5.5_
  - [x] 7.7 Create `luxeride-web/src/components/CampaignCapture.tsx` as a Client Component running capture in a mount effect, mounted from `src/app/layout.tsx` outside the `Suspense`-gated tracking tree _(P0)_
    - _Requirements: 5.7_

- [x] 8. Order reference and WhatsApp reconciliation **(done — master-build-plan M3.10)**
  - [x] 8.1 Create `luxeride-web/src/lib/orderRef.ts` exporting `createOrderRef()` returning `LR-` + 8 uppercase hex characters from `crypto.randomUUID()`, never derived from the wall clock and never sequential, per `cart-checkout` 2.1 _(P0)_
    - _Requirements: 6.1, 6.2_
  - [x] 8.2 Re-roll on collision against the retained order history, up to three times, then fall back to a counter suffix rather than reusing a ref _(P0)_
    - _Requirements: 6.3_
  - [x] 8.3 Extend `OrderMessageInput` in `luxeride-web/src/lib/whatsapp.ts` with `ref`, `fitRef?: string | null` and `campaign?: string`, and render the single line `🔖 Ref LR-A3F91C09 · via mats` (adding `· fit TC-2009-2013` when a fit ref exists) after the payment line _(P0)_
    - _Requirements: 6.4, 6.6, 6.7_
  - [x] 8.4 Render no dangling separator when `fitRef` is null, which is every render until `fitment-engine` lands _(P0)_
    - _Requirements: 6.7_
  - [x] 8.5 Cap the campaign marker at the short registry key — never a raw `fbclid`, never a full `utm_*` query string _(P0)_
    - _Requirements: 6.5_
  - [x] 8.6 Add `recoveryMessage(ref, campaign)` in `src/lib/whatsapp.ts` for the degraded confirmation path, quoting the ref so the thread stays reconcilable when `localStorage` is gone _(P0)_
    - _Requirements: 7.6_
  - [x] 8.7 Change `src/app/checkout/page.tsx:62` to mint via `createOrderRef()`, store `ref` and `fitRef: null` on the order, rebuild the message with the ref, then fire `Lead`, then `window.open`, then clear the cart — in that order, none of it awaited _(P0)_
    - _Requirements: 6.4, 6.8_
  - [x] 8.8 Render the ref in a selectable, copyable element on the confirmation page and fire `ref_code_copied` on copy, per `cart-checkout` 2.3 _(P1)_
    - _Requirements: 3.8_

- [~] 9. Attribution on the order, and thank-you durability **(9.1–9.7, 9.9 done — master-build-plan M3.11; 9.8 `/order/lookup` is not built)**
  - [x] 9.1 Change `src/store/order.ts` from a single `lastOrder: PlacedOrder | null` to a bounded list of the last 10 orders keyed by `ref`, satisfying `cart-checkout` 13.2 _(P0)_
    - _Requirements: 5.6, 7.3_
  - [x] 9.2 Add `fitRef: string | null` and `attribution: Attribution` to `PlacedOrder` in `src/store/order.ts`, copying attribution from `luxeride-attribution` at submit so the order carries its own campaign _(P0)_
    - _Requirements: 5.6, 6.6_
  - [x] 9.3 Update `luxeride-web/src/app/order/confirmation/page.tsx` to accept `?ref=` and look the order up by reference rather than reading a single `lastOrder` _(P0)_
    - _Requirements: 7.1, 7.3_
  - [x] 9.4 Replace the "No recent order found" dead end and the success tick with the recovery screen: the order is held in WhatsApp, here is the ref, here is a WhatsApp action quoting it — per `cart-checkout` 6.2/6.4/6.5 _(P0)_
    - _Requirements: 7.4_
  - [x] 9.5 Render the three-action state (new order / contact / look up a ref) when there is neither a record nor a ref, and never imply an order was lost — per `cart-checkout` 6.3 _(P0)_
    - _Requirements: 7.5_
  - [x] 9.6 Fire `Lead` at most once per `ref` using a fired-guard persisted alongside the order, so a refresh cannot inflate the owner's conversion count against his ad spend _(P0)_
    - _Requirements: 7.7_
  - [x] 9.7 Add an explicit assertion that no `name`, `phone` or `address` value is ever placed in a query string on any route, because GA4 collects the full `page_location` _(P0)_
    - _Requirements: 7.1, 7.2_
  - [ ] 9.8 Add an order-lookup route `luxeride-web/src/app/order/lookup/page.tsx` (Server Component) accepting `?ref=` or a phone number and routing to a prefilled WhatsApp message, since there is no server to query _(P1)_
    - _Requirements: 7.5_
  - [x] 9.9 Change the order store key from `luxeride-last-order` and write a one-time migration that moves an existing stored order into the new list so no in-flight order is lost on deploy _(P1)_
    - _Requirements: 7.3_

- [ ] 10. Ads compliance surface
  - [ ] 10.1 Add a `/privacy` route — `luxeride-web/src/app/privacy/page.tsx`, Server Component — that names the controller, the data collected (name, WhatsApp number, delivery address, selected car, campaign parameters), the purposes, the retention window, the rights and the contact, per `trust-and-policies` 3.x _(P0)_
    - _Requirements: 8.1, 8.2_
  - [ ] 10.2 Add a `/contact` route — `luxeride-web/src/app/contact/page.tsx`, Server Component — using `WHATSAPP_NUMBER` from `src/data/locations.ts` plus a `tel:` route, per `trust-and-policies` 7.1/7.2 _(P0)_
    - _Requirements: 8.1_
  - [x] 10.3 Add the footer link grid **(done via storefront-catalog §5.4 / master-build-plan M4.7)** in `luxeride-web/src/components/Footer.tsx` linking `/privacy`, `/contact` and the routes `trust-and-policies` 12.1 defines, replacing the current zero-link footer _(P0)_
    - _Requirements: 8.1_
  - [ ] 10.4 Render a single-line dismissible disclosure linking to `/privacy` on ad landing pages, stating that Meta and Google tags are used; do not gate the tags behind a modal at P0 _(P0)_
    - _Requirements: 8.2, 8.6_
  - [x] 10.5 State in `/privacy` **(the disclosure lives at `/policies/privacy`, served by storefront-catalog §5.5)** that the customer's name, phone and address are **not** transmitted to Meta or Google, matching what the payload linter in 4.10 actually enforces _(P0)_
    - _Requirements: 8.3_
  - [ ] 10.6 Verify by network inspection that no checkout payload containing name, phone or address reaches Meta, Google or TikTok _(P0)_
    - _Requirements: 8.3_
  - [x] 10.7 Add a `sitemap.ts` and `robots.ts` **(already present — master-build-plan M3.14)** at `luxeride-web/src/app/` so the advertised domain is crawlable and verifiable at ad review _(P1)_
    - _Requirements: 8.1_
  - [ ] 10.8 Add a consent-management platform with real opt-out control, replacing the P0 disclosure _(P2)_
    - _Requirements: 8.7_
  - [ ] 10.9 Add SHA-256 hashing of the coming-soon phone number for Meta match, only once `commerce-backend` provides the matching secret _(P2)_
    - _Requirements: 3.12_

- [ ] 11. Conversions API and real purchase measurement (P1 — needs a server)
  - [ ] 11.1 Add `luxeride-web/src/app/api/track/route.ts` as a route handler that accepts a browser event and relays it to the Conversions API, de-duplicating on the same `event_id` _(P1)_
    - _Requirements: 3.13_
  - [ ] 11.2 Add `flushBeacon()` on `pagehide` in `src/lib/analytics/index.ts` so the last event of a session is not lost when the tab closes _(P1)_
    - _Requirements: 4.6_
  - [ ] 11.3 Emit `Purchase`/`purchase` from the WhatsApp confirmation webhook in `whatsapp-engine`, with `transaction_id` set to the order ref, per GA4's requirement that `transaction_id` be unique per purchase _(P1)_
    - _Requirements: 3.7_
  - [ ] 11.4 Read the Conversions API Dataset Quality API match-quality score weekly once 11.1 is live _(P2)_
    - _Requirements: 3.13_

- [ ] 12. Pre-spend verification gate
  - [ ] 12.1 Confirm `npm run build` exits zero. **This is `commerce-backend` R1, not a task of this spec** — no ad spend can happen until it does, because nothing is deployable _(P0)_
    - _Requirements: 9.2_
  - [ ] 12.2 Paste the pixel base code from Events Manager into `NEXT_PUBLIC_META_PIXEL_ID` and the Google tag into `NEXT_PUBLIC_GA_MEASUREMENT_ID`, then confirm both script tags appear in the page source _(P0)_
    - _Requirements: 4.5_
  - [ ] 12.3 In **Events Manager → Test Events**, walk `/` → `/?product=mats` → fit-finder → cart → checkout and confirm `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Lead` and the LuxeRide `CustomEvent`s arrive with their parameters _(P0)_
    - _Requirements: 9.5_
  - [ ] 12.4 Repeat with `?product=bogus` and confirm exactly one `campaign_landing_fallback` and a normally rendered page _(P0)_
    - _Requirements: 2.2, 9.5_
  - [ ] 12.5 In **GA4 DebugView** with the Google Analytics Debugger extension active, confirm `page_view`, `view_item`, `add_to_cart`, `begin_checkout` and `generate_lead` with `currency: "NGN"` and a numeric `value` _(P0)_
    - _Requirements: 9.5_
  - [ ] 12.6 Confirm GA4 **Traffic acquisition → Session source/medium** shows the UTM values or `(not set)` for a visit carrying UTMs _(P0)_
    - _Requirements: 5.1, 5.8_
  - [ ] 12.7 Submit a test order, clear `localStorage`, reload `/order/confirmation?ref=…` and confirm the recovery screen with a ref-quoting WhatsApp button — not "No recent order found" _(P0)_
    - _Requirements: 7.4, 9.5_
  - [ ] 12.8 Confirm the received WhatsApp message contains `🔖 Ref LR-XXXXXXXX · via <campaign>` and that the ad URL, the campaign key and the order ref are three independently greppable strings _(P0)_
    - _Requirements: 6.4, 6.5_
  - [ ] 12.9 Confirm `/privacy` and `/contact` are reachable in one tap from the footer on a phone viewport, and that `/privacy` states that name, phone and address are not sent to Meta or Google _(P0)_
    - _Requirements: 8.1, 8.3_
  - [ ] 12.10 Confirm every one of the seven `trust-and-policies` 12.1 gates is green before the first click _(P0)_
    - _Requirements: 9.1_
  - [ ] 12.11 **Write down the Confirmed layout count on the day you go live** and record it alongside the campaign — the launch metric `fitment-engine` locked decision 2 mandates _(P0)_
    - _Requirements: 9.3_
  - [ ] 12.12 Decide explicitly, before spending, whether the first run is acquisition targeting (Confirmed cars) or demand mapping (broad, mostly refused) — `fitment-engine` demands this choice be made first, and it changes which conversion rate the campaign is judged against _(P0)_
    - _Requirements: 9.4_
  - [ ] 12.13 Confirm ad copy contains no personal attributes (for example "moving soon", "just bought a car"), which Meta's advertising standards forbid _(P0)_
    - _Requirements: 8.4_
  - [ ] 12.14 Confirm the landing page a given ad points at says the same thing the ad says — a mismatch is an ad-review rejection, not merely a conversion loss _(P0)_
    - _Requirements: 8.5_
  - [ ] 12.15 Record the baseline numbers before launch: sessions, `car_search_no_match` rate, `fit_refused` rate, `fit_result_rendered state=FITTED` count, `Lead` count — so week one has something to be measured against _(P0)_
    - _Requirements: 9.6_