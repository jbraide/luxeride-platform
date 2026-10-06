# Implementation Plan

## Status

**PARTIAL — three build items done (10.1–10.3); the rest are untouched.** 14 done, 82 remaining (96 checkbox items).

**10.3 is closed**, and with it defect **D1**: the `useHasMounted()` guard moved out of `Header.tsx` into
`src/lib/use-has-mounted.ts` and is now applied to all three storage-backed screens. Those three were
re-split into Server Component pages wrapping `CartView.tsx`, `CheckoutView.tsx` and
`ConfirmationView.tsx` first — the split is `storefront-catalog` §3.6, and it is a precondition for
their `metadata` exports in §3.7.

The verification is the interesting part: the three routes' **server** HTML now contains
`Loading your saved cart…` rather than `Your cart is empty`, which is the mismatch itself, gone — the
server can no longer disagree with a client whose store hydrates synchronously. What is *not* verified
is the browser console, because this environment refuses Chrome a socket; `npm run check:hydration`
exists for that and exits 2 rather than passing when it cannot load a page.

**10.1 and 10.2 are also done**, out of order, via `storefront-catalog` §4.1–4.3 (M1.6): `src/app/error.tsx`
as a Client Component using the Next 16 `{ error, retry }` props, and `src/app/not-found.tsx`. The
remaining item worth naming is **10.5** — on a failed order call the cart and draft must survive — which
needs an order endpoint that does not exist yet.

Nothing else in this spec is started, and everything from group 2 onward is blocked on
`commerce-backend` (an order store there is still blocked on E3). **NOTE (verified 2026-10-05): D-02 RESOLVED — `luxeride-web/src/app/checkout/actions.ts` does NOT exist; `luxeride-web/src/app/api/orders/route.ts` (46 KB) is the chosen Route Handler (`master-build-plan` M6.1 / `cart-checkout` §4.1); `CheckoutView.tsx` submits `POST /api/orders` (lines 298, 493, 632). The three `actions.ts` items (M6.4-M6.7 in `commerce-backend` §6.1-6.9) should be read as superseded; the route handler's own CSRF (`sameOriginOrNoOrigin()`, `MAX_BODY_BYTES`, `idempotencyKey @unique`) is verified in `route.ts` lines 17-52. M6.8 (Prisma `create` + server LR- reference) remains partial; `CheckoutView.tsx` line 152 creates its own reference (`LR-` adapter over `crypto.randomUUID()`), not the server-minted one.

## Before any ad spend

Sequencing note for the owner. `_CONTEXT.md` §3 records that `npm run build` **fails** on
`prisma/seed.ts(2,34): Cannot find module './data/products'` and that `.next/BUILD_ID` is absent, so
**no successful production build has ever been produced**. Nothing below can run under paid traffic
until that one import is fixed. It is not in this spec's scope (it is a `commerce-backend` / build
concern) and it is listed here only so it is not forgotten behind this work.

Then, in order, the four groups of tasks that stop paid traffic losing orders: **4.1–4.3** (the server
re-prices the order), **3.1–3.3** (the reference reaches the WhatsApp message), **5.3–5.4** (do not
clear the cart before the handoff is confirmed), and **7.1 + 7.3** (three-branch confirmation screen,
"Order sent" removed). Everything else in this plan can follow.

---

- [x] 1. Audit the current cart, checkout and confirmation path — `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/app/order/confirmation/page.tsx`, `src/store/cart.ts`, `src/store/order.ts`, `src/lib/whatsapp.ts` _(P0)_
  - _Requirements: 1.1, 2.1, 2.4, 3.1, 5.1_
  - [x] 1.1 Confirm `submit()` in `src/app/checkout/page.tsx` performs no network call — it builds the message, calls `setLastOrder`, `window.open`, `clear()`, `router.push` and nothing else. _(verified: luxeride-web/src/app/checkout/page.tsx)_ _(P0)_ — _Requirements: 2.4_
  - [x] 1.2 Confirm the order id is `` `LR-${Date.now().toString(36).toUpperCase()}` `` — clock-derived and therefore sequential/enumerable. _(verified: luxeride-web/src/app/checkout/page.tsx)_ _(P0)_ — _Requirements: 2.1_
  - [x] 1.3 Confirm `buildOrderMessage` has no id field on `OrderMessageInput` and no reference in the rendered string, so the owner cannot reconcile a thread with an order. _(verified: luxeride-web/src/lib/whatsapp.ts)_ _(P0)_ — _Requirements: 2.2_
  - [x] 1.4 Confirm `clear()` runs on the line after `window.open(...)` and the returned `Window | null` handle is discarded, so the cart empties even when the popup was blocked. _(verified: luxeride-web/src/app/checkout/page.tsx)_ _(P0)_ — _Requirements: 1.2, 4.1, 4.2_
  - [x] 1.5 Confirm order storage is `lastOrder: PlacedOrder | null` under the persist key `luxeride-last-order`, with no history and no server copy. _(verified: luxeride-web/src/store/order.ts)_ _(P0)_ — _Requirements: 2.4_
  - [x] 1.6 Confirm `PlacedOrder.items` is typed `CartItem[]`, freezing the client's own unverified prices into the stored record. _(verified: luxeride-web/src/store/order.ts)_ _(P0)_ — _Requirements: 3.2, 3.5_
  - [x] 1.7 Confirm `unitPrice` is persisted on the cart line, `subtotal()` sums the stored value, and `removeItem`/`setQty` trust whatever is stored — nothing has ever recomputed a price. _(verified: luxeride-web/src/store/cart.ts, luxeride-web/src/lib/pricing.ts, luxeride-web/src/components/FitFinder.tsx)_ _(P0)_ — _Requirements: 3.1, 3.2_
  - [x] 1.8 Confirm `if (!name.trim() || !address.trim()) return;` exits silently with no message, no focus and no error state, and that the phone error has no `role="alert"`, `aria-invalid` or `aria-describedby`. _(verified: luxeride-web/src/app/checkout/page.tsx)_ _(P0)_ — _Requirements: 5.1, 5.2_
  - [x] 1.9 Confirm the delivery-zone `<select>` defaults to `LOCATIONS[0].name` (Lagos) for every visitor, so a non-Lagos customer can be quoted a 24–48h ETA against a real 5–7 days. _(verified: luxeride-web/src/app/checkout/page.tsx, luxeride-web/src/data/locations.ts)_ _(P0)_ — _Requirements: 5.6_
  - [x] 1.10 Confirm the confirmation screen renders a success tick and "Order sent — check WhatsApp" for any stored record, and "No recent order found" with only a "Go to Shop" link when there is none. _(verified: luxeride-web/src/app/order/confirmation/page.tsx)_ _(P0)_ — _Requirements: 1.1, 1.4, 6.3, 6.5_
  - [x] 1.11 Confirm the hydration mismatch in `_CONTEXT.md` §11b defect **D1** applies to `/cart`, `/checkout` and `/order/confirmation`, and that `src/components/Header.tsx` already contains the `useHasMounted()` guard those pages are missing. _(verified: luxeride-web/src/components/Header.tsx, platform/.kiro/specs/_CONTEXT.md §11b)_ _(P0)_ — _Requirements: 12.3_
  - [x] 1.12 Confirm the prototype's `Copy message` button (`navigator.clipboard`) and `← Back to your fit` link exist there and not in the app, and that the prototype's `submitCheckout()` claims nothing after `window.open` — so "Order sent" is an app-only regression. _(verified: platform/luxeride-funnel (2).html)_ _(P0)_ — _Requirements: 1.1_

- [ ] 2. Pricing and validation core — `src/lib/pricing.ts`, new `src/lib/order-pricing.ts`, new `src/lib/order-validation.ts`, new `src/lib/order-ref.ts`, new `scripts/pricing.test.mjs` _(P0)_
  - _Requirements: 2.1, 3.2, 3.6, 5.1, 7.1_
  - [ ] 2.1 Add `PREPAY_DISCOUNT = 2000` and `MAX_LINE_QTY` as named exports in `src/lib/pricing.ts`, replacing the inline literals, and export `ZERO_FEE_LABEL = "Free"`. _(P0)_ — _Requirements: 3.6, 3.7, 7.3_
  - [ ] 2.2 Create `src/lib/order-pricing.ts` with a pure `priceOrder(lines, zoneName, paymentMethod)` implementing 3.6 exactly, plus `lineKey(line)` and per-line resolution errors — no React, no storage, no `window`. _(P0)_ — _Requirements: 3.2, 3.6, 7.1_
  - [ ] 2.3 Create `src/lib/order-validation.ts` exporting `validateName`, `validateAddress`, `validateZone` and `validateConsent`, reusing `validateNGPhone` from `src/lib/validation.ts` unchanged. _(P0)_ — _Requirements: 5.1, 10.1_
  - [ ] 2.4 Create `src/lib/order-ref.ts` exporting `mintOrderRef()` built from `crypto.randomUUID()` — never `Date.now()`. _(P0)_ — _Requirements: 2.1_
  - [ ] 2.5 Add `scripts/pricing.test.mjs` run with `node --test` (Node v22.23.1, no runner installed) covering `priceOrder`, `lineKey`, `mintOrderRef` and the validators: POD pays the zone fee, prepay pays zero and takes ₦2,000 off, total never negative, one bad line rejects the whole order, a forged `unitPrice` in the input is ignored, and `rows: null` and `rows: "2"` are different lines. _(P0)_ — _Requirements: 3.2, 3.3, 3.6, 7.1_

- [ ] 3. Order reference in the WhatsApp message — `src/lib/whatsapp.ts`, `src/app/checkout/page.tsx` _(P0)_
  - _Requirements: 2.2, 3.7_
  - [ ] 3.1 Add an optional `ref?: string` to `OrderMessageInput` and print it in `buildOrderMessage` in `src/lib/whatsapp.ts`, leaving the existing call signature backwards-compatible. _(P0)_ — _Requirements: 2.2_
  - [ ] 3.2 Print "Free" instead of `₦0` on the POD delivery line in `src/lib/whatsapp.ts`, and add the zone's `eta` to the message. _(P0)_ — _Requirements: 3.7_
  - [ ] 3.3 Build the WhatsApp message in `src/app/checkout/page.tsx` from the **server response**, never from the cart, so the message and the record can never disagree. _(P0)_ — _Requirements: 2.2, 2.4, 3.4_
  - [ ] 3.4 Show the pre-discount subtotal and the ₦2,000 line explicitly in the prepay branch of `buildOrderMessage` in `src/lib/whatsapp.ts`, so the customer can see where the saving came from. _(P1)_ — _Requirements: 3.6, 8.3_

- [ ] 4. Server-side order endpoint — new `src/app/api/orders/route.ts` _(P0)_
  - _Requirements: 2.6, 3.1, 3.3, 3.4_
  - [ ] 4.1 Create `src/app/api/orders/route.ts` exporting `POST` — a Route Handler; `POST` is never cached, which is the semantics required. Ignore any `unitPrice` present in the body. _(P0)_ — _Requirements: 3.1_
  - [ ] 4.2 In `src/app/api/orders/route.ts`, resolve every line against `getProductBySlug`, `BRANDS[brand].tier` and `isModelAvailable`; return `422` naming the offending index and reason; never create a partial order. _(P0)_ — _Requirements: 3.3_
  - [ ] 4.3 In `src/app/api/orders/route.ts`, call `priceOrder()` from `src/lib/order-pricing.ts`, mint the ref, and return `{ ref, items, subtotal, shippingFee, discount, total, locationEta, whatsappMessage }`. _(P0)_ — _Requirements: 2.4, 3.2, 3.5_
  - [ ] 4.4 In `src/app/api/orders/route.ts`, add `persistOrder(order)` that appends one structured JSON line to the server log, with a comment marking it as the P0 stopgap that `commerce-backend` replaces with a Prisma `create`. _(P0)_ — _Requirements: 2.4, 2.6_
  - [ ] 4.5 Return the validated, shaped result — never a raw record — from `src/app/api/orders/route.ts`, so action/route return values cannot leak internals to the client. _(P0)_ — _Requirements: 3.4, 12.4_
  - [ ] 4.6 Add a per-IP request throttle to `src/app/api/orders/route.ts` with a comment noting an in-memory map is per-instance and therefore a speed bump, not a control. _(P1)_ — _Requirements: 12.4_

- [ ] 5. Checkout submission flow — `src/app/checkout/page.tsx` _(P0)_
  - _Requirements: 3.1, 3.4, 4.2, 4.3_
  - [ ] 5.1 Rework `submit()` in `src/app/checkout/page.tsx` to POST to `/api/orders` with identity-only lines, and stop before any navigation. _(P0)_ — _Requirements: 3.1, 4.1_
  - [ ] 5.2 Render the **server's** figures in place of the local ones in `src/app/checkout/page.tsx`; when they differ from the displayed total, show the corrected total and the reason before offering the handoff. _(P0)_ — _Requirements: 3.4_
  - [ ] 5.3 In `src/app/checkout/page.tsx`, keep the `window.open` return value; when it is `null`, state that the browser blocked the window and offer an **Open WhatsApp** anchor plus **Copy message`. Do not clear the cart. _(P0)_ — _Requirements: 1.2, 4.2_
  - [ ] 5.4 In `src/app/checkout/page.tsx`, replace the immediate `router.push` with an in-page prepared state holding the "I've sent it" button, the resend link and the copy button; only that tap clears the cart, clears the draft, persists the priced order and navigates. _(P0)_ — _Requirements: 4.2, 4.3, 1.1_
  - [ ] 5.5 Disable the submit control and label it with the work in progress while a submission is in flight, so a double tap cannot produce two orders. _(P0)_ — _Requirements: 4.5_
  - [ ] 5.6 Add `Copy message` to `src/app/checkout/page.tsx` using `navigator.clipboard.writeText` with the 1800 ms "Copied ✓" revert, ported from the prototype — this is the manual fallback, not a cosmetic control. _(P0)_ — _Requirements: 1.2, 12.4_
  - [ ] 5.7 Add `← Back to your fit` to `src/app/checkout/page.tsx`, safe because the draft is persisted by 6.1. _(P1)_ — _Requirements: 9.1_
  - [ ] 5.8 Add a sticky bottom bar to `src/app/checkout/page.tsx` on small screens showing the server-priced total and the primary CTA. _(P0)_ — _Requirements: 3.4, 8.4_
  - [ ] 5.9 Add a collapsible order summary to `src/app/checkout/page.tsx`. _(P1)_ — _Requirements: 8.4_

- [ ] 6. Checkout form correctness and trust — `src/store/order.ts`, `src/app/checkout/page.tsx`, `src/data/locations.ts` _(P0)_
  - _Requirements: 5.1, 8.3, 8.5, 9.1, 10.1_
  - [ ] 6.1 Add a `draft` slice to `src/store/order.ts` alongside `lastOrder`, persisted under the same key, and write every field change to it. _(P0)_ — _Requirements: 9.1, 9.3_
  - [ ] 6.2 Clear the `draft` slice in `src/store/order.ts` only after a successful handoff. _(P0)_ — _Requirements: 9.2_
  - [ ] 6.3 Restore the `draft` slice into the form fields in `src/app/checkout/page.tsx` on mount. _(P0)_ — _Requirements: 9.1_
  - [ ] 6.4 Convert `src/app/checkout/page.tsx` to a real `<form>` with named inputs and a submit handler, so native `required` and validation participate. _(P0)_ — _Requirements: 5.1, 5.5_
  - [ ] 6.5 Add per-field errors to `src/app/checkout/page.tsx` with `aria-invalid="true"` on the control, `aria-describedby` linking the error, and `role="alert"` on the error element. _(P0)_ — _Requirements: 5.2_
  - [ ] 6.6 Move focus to the first invalid control on a blocked submit in `src/app/checkout/page.tsx`, and clear a field's error as soon as the customer edits it. _(P0)_ — _Requirements: 5.3, 5.4_
  - [ ] 6.7 Remove the `LOCATIONS[0].name` default in `src/app/checkout/page.tsx`; add a disabled placeholder option and treat an empty zone as a validation failure, because the zone changes both the fee and the stated arrival time. _(P0)_ — _Requirements: 5.6_
  - [ ] 6.8 Display the selected zone's `eta` beneath the zone select in `src/app/checkout/page.tsx`, not only inside the `<option>` text. _(P0)_ — _Requirements: 8.4_
  - [ ] 6.9 Replace the static "Save ₦2,000" badge in `src/app/checkout/page.tsx` with the customer's real saving from prepaying, computed as zone fee + ₦2,000 from the selected zone, never more than the order is worth. _(P0)_ — _Requirements: 8.3, 8.7_
  - [ ] 6.10 Add a required consent control and the one-line data-use statement to `src/app/checkout/page.tsx`, and block submission without consent. _(P0)_ — _Requirements: 10.1, 10.2, 10.3_
  - [ ] 6.11 Render the privacy/terms link in `src/app/checkout/page.tsx` only when the target page exists; ship the checkbox and the page together or neither. _(P0)_ — _Requirements: 10.4_
  - [ ] 6.12 Add `PAYMENT_DETAILS` to `src/data/locations.ts` and render the account details in `src/app/checkout/page.tsx`; until the owner supplies real details, hide the prepay option entirely rather than promise an unpayable option. _(P0)_ — _Requirements: 8.5_
  - [ ] 6.13 When the cart is empty, offer the fit finder from `src/app/checkout/page.tsx` instead of the current text-only dead end. _(P0)_ — _Requirements: 9.5_

- [ ] 7. The order-record promise on the confirmation screen — `src/app/order/confirmation/page.tsx`, `src/app/checkout/page.tsx` _(P0)_
  - _Requirements: 1.1, 2.5, 6.1_
  - [ ] 7.1 Rework `src/app/order/confirmation/page.tsx` into the three branches from Design Decision 2: record present, `ref` in URL without a record, and neither. _(P0)_ — _Requirements: 6.1, 6.2, 6.3_
  - [ ] 7.2 Read the `ref` query parameter in `src/app/order/confirmation/page.tsx` and render it in a selectable, copyable element in every branch. _(P0)_ — _Requirements: 2.3, 6.2_
  - [ ] 7.3 Render the success tick in `src/app/order/confirmation/page.tsx` only when a matching record exists, and remove the string "Order sent". _(P0)_ — _Requirements: 1.1, 1.4, 6.4_
  - [ ] 7.4 Add the zone ETA and the re-send WhatsApp button to `src/app/order/confirmation/page.tsx`. _(P0)_ — _Requirements: 6.1_
  - [ ] 7.5 In the no-record branch of `src/app/order/confirmation/page.tsx`, state that the order is held in WhatsApp and open a message already quoting the reference; never say the order was lost. _(P0)_ — _Requirements: 2.5, 6.2, 6.3_
  - [ ] 7.6 Replace "No recent order found" in `src/app/order/confirmation/page.tsx` with copy describing what happened and offering start-again, WhatsApp contact and reference lookup. _(P0)_ — _Requirements: 6.3, 6.5_
  - [ ] 7.7 Add "Order again" to `src/app/order/confirmation/page.tsx`, repopulating the cart from the local record's priced lines — the same-device substitute for a server-backed re-order. _(P1)_ — _Requirements: 11.2, 11.4_
  - [ ] 7.8 Navigate to `/order/confirmation?ref=…` on handoff in `src/app/checkout/page.tsx` so the URL alone is enough for the recovery branch. _(P0)_ — _Requirements: 2.5, 4.3_

- [ ] 8. Cart integrity — `src/store/cart.ts`, `src/app/cart/page.tsx` _(P0)_
  - _Requirements: 7.1, 7.2, 7.4, 4.4_
  - [ ] 8.1 Add merge-by-`lineKey` to `addItem` in `src/store/cart.ts`, so the same product for the same car/year/rows increments one row instead of pushing a second. _(P0)_ — _Requirements: 7.1_
  - [ ] 8.2 Make `setQty(id, 0)` remove the line in `src/store/cart.ts`, and wire the "–" control in `src/app/cart/page.tsx` so it stops being a silent no-op at quantity one. _(P0)_ — _Requirements: 7.2, 7.5_
  - [ ] 8.3 Clamp `qty` to `MAX_LINE_QTY` in `src/store/cart.ts` and disable the "–"/"+" controls at the bounds in `src/app/cart/page.tsx`. _(P0)_ — _Requirements: 7.3_
  - [ ] 8.4 Add rehydrate validation and a persist `version`/`merge` to `src/store/cart.ts` that drops entries with a missing slug, a non-finite or negative `unitPrice`, a non-integer `qty`, or an unknown `rows`, so one bad entry cannot break the cart or checkout. _(P0)_ — _Requirements: 7.4_
  - [ ] 8.5 Add accessible labels to the qty and Remove controls in `src/app/cart/page.tsx`. _(P0)_ — _Requirements: 7.2, 7.5_
  - [ ] 8.6 Keep the cart intact and offer the last reference's confirmation link when the customer presses Back after a handoff, instead of an empty-cart screen. _(P0)_ — _Requirements: 4.4_
  - [ ] 8.7 Restate the delivery-fee-and-ETA line in `src/app/cart/page.tsx` using the customer's remembered zone, or keep the current neutral wording when there is none. _(P1)_ — _Requirements: 8.4_

- [ ] 9. Conversion mechanics on the cart — `src/app/cart/page.tsx` _(P0)_
  - _Requirements: 8.1, 8.6_
  - [ ] 9.1 Add the Single → Double layer in-place upgrade to `src/app/cart/page.tsx`: swap `productSlug`/`productName` on the existing line, preserve car, year and rows, show the exact additional cost from `src/data/products.ts`. _(P0)_ — _Requirements: 8.1_
  - [ ] 9.2 Add the Full Bundle offer to `src/app/cart/page.tsx` when the cart holds Double Layer Mats or Seat Covers and not the bundle, with the saving against buying the two separately computed from the catalogue — not a promo engine, which `luxeride-architecture-plan.md` §5 rules out of scope. _(P1)_ — _Requirements: 8.2_
  - [ ] 9.3 Add a "you may also need" row to `src/app/cart/page.tsx` for complementary products, excluding anything already in the cart. _(P1)_ — _Requirements: 8.2, 8.6_
  - [ ] 9.4 Render every cross-sell and upsell card text-only in `src/app/cart/page.tsx` — no `SafeImage` slot — because `full-bundle`, `seat-covers` and the other products point at image paths that do not exist and `SafeImage` returns `null` on error. _(P0)_ — _Requirements: 8.6_

- [ ] 10. Route boundaries — new `src/app/error.tsx`, new `src/app/not-found.tsx`, `src/components/Header.tsx`, `src/app/checkout/page.tsx` _(P0)_
  - _Requirements: 12.1, 12.3, 12.4_
  - [ ] 10.1 Create `src/app/error.tsx` as a Client Component using the Next 16 `{ error, retry }` props (not `reset`), offering retry, a route back to the fit finder, and a WhatsApp contact action. _(P0)_ — _Requirements: 12.1_
  - [ ] 10.2 Create `src/app/not-found.tsx` as a Server Component offering the cart and the fit finder instead of a bare 404. _(P0)_ — _Requirements: 12.2_
  - [x] 10.3 Extract the `useHasMounted()` guard from `src/components/Header.tsx` into a shared hook and apply it to `src/app/cart/page.tsx`, `src/app/checkout/page.tsx` and `src/app/order/confirmation/page.tsx`, fixing D1 across all three. _(P0)_ — _Requirements: 12.3_ **(verified: `src/lib/use-has-mounted.ts` now holds the hook and `src/components/Header.tsx` imports it. The three pages were first re-split into Server Component wrappers plus `CartView.tsx` / `CheckoutView.tsx` / `ConfirmationView.tsx`, and each view renders `src/components/StorageSkeleton.tsx` until mounted. `curl` of all three now returns `Loading your saved cart…` / `Loading your order…` in the **server** HTML where it previously returned `Your cart is empty` / `No recent order found` — that divergence was D1. The browser-console half is not verified; see `../storefront-catalog/tasks.md` §15 and `luxeride-web/scripts/hydration-check.mjs`.)**
  - [ ] 10.4 Add the `localStorage` try/catch guard and the explanatory fallback state around the cart and confirmation screens, covering private mode and storage-disabled browsers. _(P1)_ — _Requirements: 12.3_
  - [ ] 10.5 On a failed order endpoint call, keep the cart, keep the draft, and offer both **Try again** and the manual WhatsApp fallback with the locally built message in `src/app/checkout/page.tsx`. _(P0)_ — _Requirements: 4.6, 12.4_

- [ ] 11. Order lookup, blocked on `commerce-backend` — new `src/app/order/lookup/page.tsx`, new `src/app/order/[id]/page.tsx` _(P1)_
  - _Requirements: 11.1, 11.4_
  - [ ] 11.1 Create `src/app/order/lookup/page.tsx` as a Server Component taking `searchParams`, returning the order's status and priced lines or a plain not-found plus a WhatsApp route. **Do not start until `commerce-backend` has a durable order store.** _(P1)_ — _Requirements: 11.1, 11.3_
  - [ ] 11.2 Create `src/app/order/[id]/page.tsx` as a Server Component, the route named in `luxeride-architecture-plan.md` §4, calling `notFound()` for an unknown reference. **Must not be created before 11.1.** _(P2)_ — _Requirements: 11.1, 11.3_
  - [ ] 11.3 Never render a lookup form that cannot succeed: gate the link behind a flag until a server-side store exists. _(P1)_ — _Requirements: 11.4_

- [ ] 12. Attribution, sink owned by `ad-landing-and-tracking` — new `src/lib/analytics.ts`, `src/app/cart/page.tsx`, `src/app/checkout/page.tsx` _(P1)_
  - _Requirements: 13.1, 13.3_
  - [ ] 12.1 Create `src/lib/analytics.ts` exporting a queue-only `track(name, props)` that never throws and never awaits. _(P1)_ — _Requirements: 13.3_
  - [ ] 12.2 Emit `cart_view`, `checkout_start`, `checkout_validation_error`, `order_prepared`, `handoff_attempted` and `handoff_confirmed` from `src/app/cart/page.tsx`, `src/app/checkout/page.tsx` and `src/app/order/confirmation/page.tsx`, carrying the ref from `order_prepared` onward. _(P1)_ — _Requirements: 13.1_
  - [ ] 12.3 Carry the campaign attribution captured at landing through to the order payload in `src/app/checkout/page.tsx`, using whatever `ad-landing-and-tracking` captures; ignore it entirely if none exists yet. _(P1)_ — _Requirements: 13.2_

- [ ] 13. Cross-spec dependencies raised, not owned here — `src/app/api/orders/route.ts`, `src/app/checkout/page.tsx`, `src/app/order/confirmation/page.tsx` _(P1)_
  - _Requirements: 1.4, 2.6, 8.5_
  - [ ] 13.1 Replace the body of `persistOrder` in `src/app/api/orders/route.ts` with a Prisma `create` once `commerce-backend` lands; the handler's validation, pricing and response shape do not change. _(P1)_ — _Requirements: 2.4, 2.6, 11.1_
  - [ ] 13.2 Replace the "Order sent"/"prepared" copy in `src/app/checkout/page.tsx` and `src/app/order/confirmation/page.tsx` with the confirmed/cancelled statuses once `whatsapp-engine`'s webhook writes them — this is where a server-confirmed order first justifies a success tick. _(P1)_ — _Requirements: 1.1, 1.4_
  - [ ] 13.3 Extend the payment option list in `src/app/checkout/page.tsx` with card/USSD once `payments-paystack` ships; keep the POD and prepay branches untouched. _(P1)_ — _Requirements: 8.5_
  - [ ] 13.4 Add the re-send/retry affordances the Cloud API enables (a "resend my order" message template) to `src/app/checkout/page.tsx` and `src/app/order/confirmation/page.tsx`. _(P2)_ — _Requirements: 6.1_