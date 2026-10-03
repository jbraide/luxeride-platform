# Implementation Plan — Fit Finder

## Status

**PARTIAL — the honesty seam is done; everything that depends on a confirmed layout is not.** Last
updated 2026-10-03, after the M2 run.

**The product's central lie is gone.** `FitFinder.tsx` no longer contains `FIT ✓` or *"100%
precision-molded … in stock for your …"* — verified by grep, and by the results step being gated on
`fit?.state === "FITTED"` from a server round trip. The year is now actually checked, which it never
was. Refusals render distinct copy per outcome with a WhatsApp route out and the waitlist capture
retained. That closes blocker **B2** structurally.

**Section 2 is superseded rather than done, and section 3 is deliberately smaller than written.** The
types this spec wanted in `src/lib/fitment.ts` shipped in `src/data/fitment.ts` and
`src/lib/fitment-contract.ts` instead, which satisfies the master plan's file-collision rule's *intent*
— one declaration of each type — while drawing the boundary elsewhere. The result-card tasks
(`FitResultCard.tsx`, price lock, spill badges, payment row) are unbuildable while the fitment table is
empty: there is no confirmed layout, so there is no FITTED card to render. They are owed with
`fitment-engine` 2.11, not before it.

**Not done, and worth naming:** `validateFitmentTable()` (2.3) and the remote-provider branch on
`NEXT_PUBLIC_FIT_CHECK_URL` (2.4) are both absent. Neither is urgent while the table is a compile-time
constant and no remote engine exists, but 2.4 is the seam that lets `fitment-engine` move behind a
service without touching the client.


`- [x]` items are ones verified by reading the file named in the note during this session. Everything
else is `- [ ]`.

---

- [x] 1. Existing funnel foundation — verified, and the base this spec builds on
  - [x] 1.1 Step machine `car → year → product → row → results` exists in `src/components/FitFinder.tsx:15` _(verified: luxeride-web/src/components/FitFinder.tsx)_ — _Requirements: 8.8_
  - [x] 1.2 Progress bar with a configuration-dependent step order; hidden on `results` because that step is not in the list _(verified: luxeride-web/src/components/FitFinder.tsx:113-139)_ — _Requirements: 8.8_
  - [x] 1.3 Car search over `FLAT_CARS`, substring match, max 8, `POPULAR_CARS` when the query is empty _(verified: luxeride-web/src/components/FitFinder.tsx:39-49,141-175)_ — _Requirements: 10.7_
  - [x] 1.4 Year step with `<select>` over a descending range _(verified: luxeride-web/src/components/FitFinder.tsx:177-202)_ — _Requirements: 10.5_
  - [x] 1.5 Product step showing `note · ₦X (2-row) / ₦Y (3-row)` at the brand's tier _(verified: luxeride-web/src/components/FitFinder.tsx:204-224)_ — _Requirements: 5.8_
  - [x] 1.6 Row step with 2-row / 3-row selection _(verified: luxeride-web/src/components/FitFinder.tsx:226-241)_ — _Requirements: 5.4_
  - [x] 1.7 Tier lookup `BRANDS[brand].tier` and unit price via `productBase(product, tier, rows)` _(verified: luxeride-web/src/components/FitFinder.tsx:81-82, luxeride-web/src/lib/pricing.ts:9-14)_ — _Requirements: 5.8_
  - [x] 1.8 Add to cart → "Added ✓" → Go to Cart / Keep Shopping routes _(verified: luxeride-web/src/components/FitFinder.tsx:283-304)_ — _Requirements: 7.6_
  - [x] 1.9 "100% Perfect Fit Guarantee" badge on the result _(verified: luxeride-web/src/components/FitFinder.tsx:279-281)_ — _Requirements: 6.6_
  - [x] 1.10 `Request Live Photos First` WhatsApp deep link _(verified: luxeride-web/src/components/FitFinder.tsx:306-315)_ — _Requirements: 7.5_
  - [x] 1.11 Negotiate-offer panel and its WhatsApp deep link _(verified: luxeride-web/src/components/FitFinder.tsx:317-343)_ — _Requirements: 7.4_
  - [x] 1.12 `?product=<slug>` read by the page and passed to the component _(verified: luxeride-web/src/app/fit-finder/page.tsx:1-14, luxeride-web/src/components/FitFinder.tsx:21-22)_ — _Requirements: 8.2_
  - [x] 1.13 Car catalogue: 33 brands, per-brand `tier` and `available`, per-model override, `FLAT_CARS`, `POPULAR_CARS` _(verified: luxeride-web/src/data/cars.ts:20-81)_ — _Requirements: 10.2_
  - [x] 1.14 Product catalogue with slugs, row applicability, tier prices, 3-row surcharge and image paths _(verified: luxeride-web/src/data/products.ts:32-119)_ — _Requirements: 6.3_
  - [x] 1.15 Persisted cart store (`luxeride-cart`) with `subtotal()` and `count()` _(verified: luxeride-web/src/store/cart.ts:29-51)_ — _Requirements: 7.3_
  - [x] 1.16 `whatsappLink`, `comingSoonMessage`, `notFoundMessage` deep-link builders _(verified: luxeride-web/src/lib/whatsapp.ts:38-51)_ — _Requirements: 7.4_
  - [x] 1.17 `validateNGPhone` for 070/080/081/090/091 and +234 forms _(verified: luxeride-web/src/lib/validation.ts:2-13)_ — _Requirements: 3.3_
  - [x] 1.18 Four delivery zones with fee and ETA available to the funnel _(verified: luxeride-web/src/data/locations.ts:7-13)_ — _Requirements: 5.2_

- [ ] 2. The honesty seam — where "does it fit?" is actually answered _(P0)
  - [ ] 2.1 Create `src/lib/fitment.ts`: `FitRequest`, `FitVariant`, `FitFitted`, `FitNotStocked`, `FitUnknown`, `FitResult`, and `fitCheck()` with the P0 local provider _(P0) — _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3_ **SUPERSEDED, and the deviation is deliberate.** This task puts `FitRequest`/`FitResult`/`fitCheck()` in `src/lib/fitment.ts`. The master plan's M2.4 file-collision rule assigned the entity types to `fitment-engine` and the `FitResult` union here; what shipped is the union as well as the entities in **`src/data/fitment.ts`**, plus `src/lib/fitment-contract.ts` for the request/response types shared with the handler. The intent that rule was protecting — exactly one declaration of each type — is satisfied; the ownership boundary is not where this task drew it.
  - [ ] 2.2 Create `src/data/fitment-table.ts` with `LayoutRecord` / `LayoutVariantRecord` / `LayoutImage` and a `LAYOUTS` array seeded from the owner's master sheet; `priceFrom` seeded from `product[BRANDS[make].tier]` so no visible price moves _(P0) — _Requirements: 2.1, 2.2, 2.8_ **SUPERSEDED.** No `src/data/fitment-table.ts`; `LAYOUTS`, `VEHICLES`, `MAPPINGS` and `EXCLUSIONS` live in `src/data/fitment.ts` as empty arrays. One module instead of two, which is simpler, and `assertLiveLayouts` is what validates them.
  - [ ] 2.3 Implement `validateFitmentTable()` in `src/lib/fitment.ts`: drop (never throw) entries that are not `confirmed`, lack `code`/`name`/`make`/year range/`confirmationNote`/`confirmedOn`, carry a disallowed `evidenceSource`, name an unknown make, or reference an unknown product slug _(P0) — _Requirements: 1.5, 2.6, 2.7, 2.8_
  - [ ] 2.4 Add the remote provider branch: when `NEXT_PUBLIC_FIT_CHECK_URL` is set, `POST` the request and run a shape guard; any throw, non-200 or unrecognised body resolves to `UNKNOWN` _(P0) — _Requirements: 1.6, 2.4, 2.5_
  - [x] 2.5 Refactor `src/components/FitFinder.tsx`: call `fitCheck({make, model, year})` once immediately after the year step and delete the `pickCar()` short-circuit into `comingsoon` at `:51-60`, so a refusal always carries the year _(P0) — _Requirements: 1.1, 3.8, 10.2_ **(verified: `FitFinder.tsx` posts to `/api/fit-check` after the year step with `year: Number(year)`, and `results` is unreachable except on a server-confirmed `FITTED`. `confirmYear()` now inspects the year, which it never did before.)**
  - [ ] 2.6 Rewrite the product step to render every product from the fit result's `variants`, disabling any product with no in-stock variant and showing the reason _(P0) — _Requirements: 3.5_
  - [x] 2.7 Detect the locked-product miss at resolve time: state plainly that the advertised product is not cut for this car, offer the confirmed alternatives, never substitute silently _(P0) — _Requirements: 3.6_ **PARTIALLY.** The refusal path is now honest and names what it could not check, and the client sends `productSlug` with the request. But the *locked-product miss* — the advertised product is not cut for this car — is not distinguished from a plain refusal, because there are no confirmed layouts for it to be a miss against. Owed with `fitment-engine` 2.11.
  - [ ] 2.8 Add a `resolving` step state so no previous or stale result is shown while a check is in flight _(P1) — _Requirements: 1.9_

- [ ] 3. The result card stops making claims it cannot support _(P0)
  - [x] 3.1 Replace the hardcoded `FIT ✓` at `src/components/FitFinder.tsx:268` with an outcome-driven badge, rendered only for `FITTED` _(P0) — _Requirements: 1.10, 6.7_ **(verified: `grep -c 'FIT ✓' src/components/FitFinder.tsx` returns 0, and the results branch is gated on `fit?.state === "FITTED"`.)**
  - [x] 3.2 Replace the sub-copy at `src/components/FitFinder.tsx:247` with "Confirmed by our configurator, verified on WhatsApp before dispatch"; delete the "100% precision-molded … in stock for your …" string from the codebase _(P0) — _Requirements: 6.1_ **(verified: `grep -c '100% precision-molded'` returns 0, and so does the replacement copy — the refusal text is now the server's own `reason`, so there is nothing left in the client to restate. The `FIT ✓` and the fabricated stock sentence are both gone, which was blocker B2.)**
  - [ ] 3.3 Show the layout's customer-facing name, its lead time and its evidence source line in the new `src/components/fit/FitResultCard.tsx`; keep the internal code out of the headline copy _(P0) — _Requirements: 1.8, 6.1_
  - [ ] 3.4 Render the layout's `images[]`; when a layout has none, fall back to product photography explicitly labelled as product photography, not as the customer's car _(P1) — _Requirements: 6.4, 11.5_
  - [ ] 3.5 Restore `PRICE LOCKED FOR 48 HOURS FROM CONFIRMATION` on the result card _(P0) — _Requirements: 6.2_
  - [ ] 3.6 Add `spillBadges: string[]` to `Product` in `src/data/products.ts` (Waterproof / Mud-Resistant / Wipes Clean in Seconds for mats and bundles) and render them per product rather than unconditionally _(P0) — _Requirements: 6.3_
  - [ ] 3.7 Add the `Payment — choose at checkout` row and the configuration row back into the card _(P0) — _Requirements: 5.3, 6.5_
  - [x] 3.8 Guard the whole results branch so no success claim can render for a non-`FITTED` outcome _(P0) — _Requirements: 1.10_ **(verified: `{step === "results" && product && brand && model && fit?.state === "FITTED" && (` — the success branch is guarded on the confirmed state, so no non-FITTED outcome can render as a success.)**

- [ ] 4. Refusals get copy, a capture and a way out _(P0)
  - [ ] 4.1 Create `src/components/fit/RefusalScreen.tsx` with an outcome-keyed copy map in `src/lib/fitment.ts`, rendered for both `NOT STOCKED` and `UNKNOWN` _(P0) — _Requirements: 3.1, 3.2_
  - [x] 4.2 Write `NOT STOCKED` copy that names the exact make, model and year asked for and does not imply stock we cannot promise _(P0) — _Requirements: 3.1, 3.3_ **(verified: `"No confirmed fit yet"` names the make and model asked for and prints the server's reason. It does not imply stock.)**
  - [x] 4.3 Write distinct `UNKNOWN` copy whose primary action opens a prefilled WhatsApp message to a human _(P0) — _Requirements: 1.4, 3.2_ **(verified: two distinct refusals — `fitError` renders "We could not check that" with the error text, everything else renders "No confirmed fit yet" — and the WhatsApp route out is present on both.)**
  - [ ] 4.4 Add the waitlist phone capture to `RefusalScreen.tsx` using `validateNGPhone`, with an inline error and no silent discard _(P0) — _Requirements: 3.3, 3.4_
  - [ ] 4.5 Delete the legacy `comingsoon` step from `src/components/FitFinder.tsx:15,351-393` once `RefusalScreen.tsx` covers both outcomes _(P0) — _Requirements: 3.8_
  - [ ] 4.6 Show a "we've noted this" confirmation only when the demand write actually succeeded (see 5.4) _(P1) — _Requirements: 4.5_
  - [ ] 4.7 Keep "browse other cars" and "start over" on every refusal without reloading the page or clearing the resolved selection _(P1) — _Requirements: 3.7, 11.6_

- [ ] 5. Demand logging — the only sourcing signal this product generates _(P0)
  - [ ] 5.1 Create `src/app/api/demand/route.ts` — a Route Handler (Node runtime) that validates a `DemandEntry` body and appends one NDJSON line to `DEMAND_LOG_PATH`; no database _(P0) — _Requirements: 4.2, 4.3, 4.6_
  - [ ] 5.2 Create `src/lib/demand.ts` with `DemandEntry`, `recordDemand()` and the `{logged}` acknowledgement type _(P0) — _Requirements: 4.2, 4.5_
  - [ ] 5.3 Call `recordDemand()` from every refusal exit in `src/components/fit/RefusalScreen.tsx` — `NOT STOCKED`, `UNKNOWN`, the waitlist capture and the locked-product miss in `FitFinder.tsx` _(P0) — _Requirements: 4.1, 4.7_
  - [ ] 5.4 Call `recordDemand()` from the two escape paths in `src/components/FitFinder.tsx`: the always-present "Other" row and the no-search-match WhatsApp link at `:164-173` _(P0) — _Requirements: 4.1_
  - [ ] 5.5 On `{logged:false}`, upgrade the WhatsApp control's label to say the request is being registered by the message rather than showing a confirmation _(P0) — _Requirements: 4.4_
  - [ ] 5.6 Add a per-instance in-memory limiter and a body-size cap to `src/app/api/demand/route.ts`, returning `400` on malformed input (noted in design as per-instance, not a real defence) _(P1) — _Requirements: 4.6_
  - [ ] 5.7 Queue failed entries in a persisted zustand store and flush on the next visit when the network was unavailable _(P1) — _Requirements: 4.4_

- [ ] 6. Delivery zone returns to the funnel and the price agrees with checkout _(P0)
  - [ ] 6.1 Create `src/data/years.ts` with `YEAR_FROM`, `YEAR_TO` derived from the current calendar year, `YEARS` and `clampYear()`; delete `YEAR_FROM` / `YEAR_TO` / `YEARS` from `src/components/FitFinder.tsx:17-19` _(P0) — _Requirements: 10.5, 10.6_
  - [ ] 6.2 Create `src/components/fit/LocationStep.tsx` rendering the four zones with name, ETA and delivery fee, plus the "Free delivery" branch for any future zero-fee zone _(P0) — _Requirements: 5.1, 5.2_
  - [ ] 6.3 Insert `location` back into the `Step` union and the step-order array in `src/components/FitFinder.tsx`, after product/row and before results, on both the locked and unlocked paths _(P0) — _Requirements: 5.1, 8.8_
  - [ ] 6.4 Add `resolvePrice()` to `src/lib/pricing.ts` returning `{ exact, from, to?, lines }`; exact only when variant, tier, rows and zone are all pinned _(P0) — _Requirements: 5.7_
  - [ ] 6.5 Render the all-in result price as two lines (item + delivery) from `resolvePrice()`; keep the unit price alone on the cart item so delivery is charged once _(P0) — _Requirements: 5.3, 5.4, 5.5_
  - [ ] 6.6 Price a `FITTED` sale from `variant.priceFrom + threeRowSurcharge`; keep `BRANDS[make].tier` for the pre-layout product-step preview only _(P0) — _Requirements: 5.8_
  - [ ] 6.7 Render a "from ₦X" range instead of a single figure when `priceTo` is present or no zone is selected _(P1) — _Requirements: 5.7_
  - [ ] 6.8 Carry the funnel's zone into `src/app/checkout/page.tsx` as the pre-selected value and recompute the total from the same `LOCATIONS` array _(P1) — _Requirements: 5.6_

- [ ] 7. Routes out of the result, without double-charging _(P0)
  - [ ] 7.1 Create `src/components/fit/StickyCheckoutCta.tsx` with the sticky `Continue to Checkout →` action _(P0) — _Requirements: 7.1_
  - [ ] 7.2 Make the sticky CTA add the configured item and navigate to `/checkout`; reflect "already in cart" rather than offering a duplicate add _(P0) — _Requirements: 7.1, 7.3_
  - [ ] 7.3 Add `disabled?: boolean` and `tone?: "default" | "muted"` to `src/components/Chip.tsx` so the product step can show unavailable products (shared primitive — coordinate with `storefront-catalog`) _(P0) — _Requirements: 3.5_
  - [ ] 7.4 Rewrite `addItem` in `src/store/cart.ts` to merge on `productSlug + brand + model + year + rows` instead of appending a new row with a fresh id _(P0) — _Requirements: 7.3_
  - [ ] 7.5 Add optional `fitRef?: string` to `CartItem` and populate it from the fit result on every add _(P0) — _Requirements: 7.7_
  - [ ] 7.6 Add `refusalMessage()`, `photosRequestMessage()` and `offerMessage()` to `src/lib/whatsapp.ts`, each carrying the layout code; include the delivery zone in the offer message _(P0) — _Requirements: 7.4, 7.5_
  - [ ] 7.7 Restrict every add-to-cart call site to the `FITTED` outcome and assert it in `src/components/fit/FitResultCard.tsx` _(P0) — _Requirements: 1.10, 7.2_

- [ ] 8. `/fit-finder` as a campaign landing surface _(P0)
  - [ ] 8.1 Create `src/data/campaigns.ts` with `CAMPAIGN_LANDINGS` carrying the prototype's four aliases (`mats`, `single-layer`, `seat-covers`, `bundle`) with their product slug, headline and sub — the pairing of creative to variant is owned by `ad-landing-and-tracking` _(P0) — _Requirements: 8.3, 8.7_
  - [ ] 8.2 Add `resolveCampaign(value)` accepting both a campaign alias and a literal product slug, returning `{ key, productSlug, headline, sub }` or `undefined` _(P0) — _Requirements: 8.2, 8.4_
  - [ ] 8.3 Create `src/components/fit/LandingHero.tsx` (headline, sub, three trust badges, "Find My Perfect Fit") and render it from the Server Component `src/app/fit-finder/page.tsx` above the funnel _(P0) — _Requirements: 8.1_
  - [ ] 8.4 Have `src/app/fit-finder/page.tsx` read `product` via the awaited `searchParams` promise, resolve the campaign and pass the resolved lock plus copy overrides to `FitFinder` as props _(P0) — _Requirements: 8.2, 8.3_
  - [ ] 8.5 Fall back to the default hero and an unlocked funnel when the `product` value is unrecognised — no error surface, no stuck lock _(P0) — _Requirements: 8.4_
  - [ ] 8.6 Export the resolved campaign key, product slug, headline and sub as data attributes on the hero so the `ad-landing-and-tracking` pixel can report which variant was served (P1) — _Requirements: 8.6_

- [ ] 9. A fit the customer can come back to _(P0)
  - [ ] 9.1 Create `src/lib/fitUrl.ts` with `FIT_PARAM_KEYS`, `readFitParams()` and `writeFitParams()`, using plain readable keys (`brand`, `model`, `year`, `product`, `rows`, `zone`, `layout`) _(P0) — _Requirements: 9.1, 9.4_
  - [ ] 9.2 Write the fit params into the URL on reaching a confirmed result, building the query from the existing `URLSearchParams` so foreign parameters survive (P0) — _Requirements: 8.5, 9.1_
  - [ ] 9.3 Restore the selection on load, recompute the outcome through `fitCheck()`, and land on the matching screen; never trust the `layout` value (P0) — _Requirements: 1.7, 9.2, 9.3_
  - [ ] 9.4 Clamp an out-of-range year with `clampYear()` and ignore a malformed or unknown parameter rather than discarding the whole link (P0) — _Requirements: 10.6, 11.3_
  - [ ] 9.5 Use `window.history.replaceState` rather than `pushState` so Back leaves the funnel instead of stepping through internal states (P0) — _Requirements: 9.5_
  - [ ] 9.6 Add the "← Back to your fit" control to `src/app/checkout/page.tsx`, restoring the fit through the same URL (P1) — _Requirements: 9.6_

- [ ] 10. Car catalogue integrity _(P0)
  - [ ] 10.1 Always render the "Other — enter your model on WhatsApp" row on the car step, even though `src/data/cars.ts:70` excludes that brand from `FLAT_CARS` _(P0) — _Requirements: 10.1_
  - [ ] 10.2 Stop deriving fit availability from the `available` booleans; a `false` flag with no Confirmed layout now falls through to `NOT STOCKED`, and a `false` flag with a Confirmed layout honours the layout (P0) — _Requirements: 10.2, 10.3, 10.4_
  - [ ] 10.3 Extend the `Chip` "Coming soon" tag in the car list to reflect the fitment source rather than the static boolean (P1) — _Requirements: 10.3_
  - [ ] 10.4 Order search results so cars with at least one Confirmed layout appear first, still capped at eight (P1) — _Requirements: 10.7_

- [ ] 11. Checkout parity the fit finder depends on (owned with `cart-checkout`) _(P1)
  - [ ] 11.1 Add the `Copy message` control to `src/app/checkout/page.tsx` over the existing `<pre>` preview, with a `navigator.clipboard`-absent branch and a rejection fallback that selects the text (final form owned by `cart-checkout`) _(P1) — _Requirements: 11.1, 11.2_
  - [ ] 11.2 Add the order message's fit-ref line once `CartItem.fitRef` is populated — the message builder itself is `cart-checkout`'s to change (P1) — _Requirements: 7.7_

- [ ] 12. Structure and verification _(P1)
  - [ ] 12.1 Split `src/components/FitFinder.tsx` into the `src/components/fit/*` step components, leaving the step machine and orchestration in `FitFinder.tsx` (P1) — _Requirements: 1.1, 8.8_
  - [ ] 12.2 Create `scripts/check-fitment.ts` asserting every table entry resolves a real make, real product slugs, a permitted evidence source, an ordered year range and a `priceFrom` on every in-stock variant; add an npm script for it (P1) — _Requirements: 2.6, 2.8_
  - [ ] 12.3 Keep `fitCheck`, `resolveFromTable`, `resolvePrice`, `resolveCampaign`, `clampYear` and `writeFitParams` free of React and browser access so they can be lifted into unit tests once a runner is chosen (P1) — _Requirements: 1.6, 2.5_
  - [ ] 12.4 Record the manual verification checklist (see design, Testing Strategy) in `luxeride-web/README.md` alongside the existing claims about `tsc` and `eslint` (P1) — _Requirements: 1.6, 3.8, 8.4, 9.3_
  - [ ] 12.5 Delete the now-unused literals and the fabricated results string, then confirm `npx tsc --noEmit` and `npx eslint .` report no new errors (P0) — _Requirements: 6.1, 10.5_