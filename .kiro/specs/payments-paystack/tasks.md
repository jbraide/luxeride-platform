# Implementation Plan — `payments-paystack`

## Status

**PARTIAL — sections 2 and 3 done; the payment itself does not exist.** 10 done, 1 partial, 90 remaining (101 checkbox items).

**Section 2 is closed** — it was resolved to `commerce-backend` §1.1–1.5 (M0.2 in the master plan) and
the build now passes: `npm run build` exits 0 with `.next/BUILD_ID`, `npx tsc --noEmit` reports 0 errors.
Section 2.3, adding `server-only`, is **not** done and belongs with M7.1.

**Section 3 — honest prepay copy — is done, with one deliberate deviation.** The prepay option no longer
says anything implying an online or automatic payment, and the discount is stated as applying once the
transfer is *received*. But `_CONTEXT.md` and `cart-checkout` OQ 1 are right that there is no bank name
and no account number anywhere in `src/`, so **the option is hidden rather than relabelled**:
`src/lib/payment-options.ts` exports `PREPAY_AVAILABLE = false` and the checkout renders the button only
behind it. Offering a customer an unpayable option at the highest-intent screen is worse than not
offering one. Task 3.3's server-provided flag keyed on `PAYSTACK_SECRET_KEY` replaces that constant when
M7 lands, and at that point the option should reappear already saying the right thing.

Task 3.5 is partial: the confirmation screen now says the page is a browser-side copy and that WhatsApp
is the record that counts until a server stores the order, but it still leads with "Order sent — check
WhatsApp", because there is still no status for it to report.

Nothing else in this spec is started. **D-09** (Paystack account, test key, business-verification lead
time) is still unanswered, and it is a multi-day external lead time — see M5.11. **NOTE (verified 2026-10-05):** `.env.local` contains no `PAYSTACK_SECRET_KEY`; `CheckoutView.tsx` renders prepay behind `PREPAY_AVAILABLE = false` (`src/lib/payment-options.ts`); M5 deferred both Paystack clock and WhatsApp template submission (`whatsapp-templates/*.txt` MISSING — M2.9 deferred). The site trades with `wa.me` + POD only.

Blockers outside this spec: the production build fails
(`prisma/seed.ts` cannot resolve `./data/products`, `_CONTEXT.md` §3), and no Paystack account or key
exists. Task 0.1 is therefore first and is not optional.

---

- [x] 1. Verified current prepay behaviour
  - [x] 1.1 Confirm the ₦2,000 / free-shipping rule lives only in the browser at `src/app/checkout/page.tsx:26-28` _(P0)_
    - _(verified: luxeride-web/src/app/checkout/page.tsx)_ `shippingFee = payment === "prepay" ? 0 : zone.fee` · `discount = payment === "prepay" ? 2000 : 0` · `total = Math.max(subtotal() + shippingFee - discount, 0)`
    - _Requirements: 2.2, 2.5, 2.6_
  - [x] 1.2 Confirm the server-recomputable inputs already exist as server modules — `PRODUCTS` (7 products with `regular`/`premium`/`threeRowSurcharge`), `LOCATIONS` (4 zones with `fee`), `BRANDS` (33 brands each with a `tier`), and the single helper `productBase(product, tier, rows)` in `src/lib/pricing.ts` _(P0)_
    - _(verified: luxeride-web/src/data/products.ts, luxeride-web/src/data/locations.ts, luxeride-web/src/data/cars.ts, luxeride-web/src/lib/pricing.ts)_
    - _Requirements: 2.2, 2.4_
  - [x] 1.3 Confirm `CartItem` stores no `tier`, so a server recompute must re-derive the tier from the brand _(P0)_
    - _(verified: luxeride-web/src/store/cart.ts:6-17)_ `CartItem = { id, productSlug, productName, brand, model, year, rows, unitPrice, qty, image? }`
    - _Requirements: 2.2_
  - [x] 1.4 Confirm the order is written only to `localStorage` and the id is generated in the browser, never reaching Paystack or the WhatsApp message _(P0)_
    - _(verified: luxeride-web/src/store/order.ts, luxeride-web/src/app/checkout/page.tsx:62,77-78)_ `` id: `LR-${Date.now().toString(36).toUpperCase()}` `` then `setLastOrder(order)` and `window.open(whatsappLink(message), "_blank")`
    - _Requirements: 4.7, 6.10, 12.8_

- [ ] 2. Unblock the build *(must precede everything)*
  - [x] 2.1 Fix `prisma/seed.ts`'s unresolvable `./data/products` import so `npm run build` completes, otherwise no payment code can be deployed _(P0)_
    - _Requirements: 13.4_
  - [x] 2.2 Confirm `npx tsc --noEmit` is clean afterwards _(P0)_
    - _Requirements: 13.4_
  - [ ] 2.3 Add `server-only` to `package.json` dependencies so the server pricing and Paystack modules can be guarded _(P0)_
    - _Requirements: 10.2_

- [ ] 3. Honest prepay copy — the only shippable P0 here
  - [x] 3.1 Rewrite the prepay option — done, but **moved** so it says "pay by bank transfer, account details sent afterwards" and does not imply an online or automatic payment _(P0)_
    - _Requirements: 1.1, 1.2_
  - [x] 3.2 Move the discount and free-shipping explanation into `src/app/checkout/page.tsx` as conditional text — "applies once your transfer is received" _(P0)_
    - _Requirements: 1.2_
  - [ ] 3.3 Gate the online-payment option on a server-provided flag in `src/app/checkout/page.tsx` so it renders only when `PAYSTACK_SECRET_KEY` is set, and label it as a test payment when the key is a `sk_test_` key _(P0)_
    - _Requirements: 1.3, 1.4, 11.5_
  - [x] 3.4 Restate the POD line in `src/app/checkout/page.tsx:149-150` so it is clear the rider collects on arrival _(P0)_
    - _Requirements: 1.5_
  - [~] 3.5 Stop `src/app/order/confirmation/page.tsx:30` showing "Order sent — check WhatsApp" as a settled outcome while no server record exists; add the order ref and a provisional-status note _(P0)_
    - _Requirements: 1.6, 6.10, 12.8_

- [ ] 4. Server-side pricing *(the anti-tamper core)*
  - [ ] 4.1 Create `src/lib/pricing-server.ts` exporting `recomputeOrder({ items, zoneName, paymentMethod })`, guarded by `import "server-only"` _(P0)_
    - _Requirements: 2.1, 10.2_
  - [ ] 4.2 Implement unit price as `productBase(getProductBySlug(item.productSlug), BRANDS[item.brand].tier, item.rows)`, importing the existing helpers rather than re-deriving them _(P0)_
    - _Requirements: 2.2_
  - [ ] 4.3 Reject any item whose `productSlug` is not in `PRODUCTS`, and any item whose brand is not in `BRANDS`, returning a stable error code and never the client's name or price _(P0)_
    - _Requirements: 2.3, 2.4_
  - [ ] 4.4 Replicate the POD/prepay fee and discount rule exactly, including the `Math.max(…, 0)` clamp, and unit-test both branches against `src/app/checkout/page.tsx:26-28` _(P0)_
    - _Requirements: 2.5, 2.6_
  - [ ] 4.5 Return the recomputed `{ lines, shippingFee, discount, totalNaira }` and make `src/app/checkout/page.tsx` display that figure instead of its local total _(P0)_
    - _Requirements: 2.9_
  - [ ] 4.6 Add a test that posts a forged `total: 1` and asserts the created order still carries the recomputed total _(P0)_
    - _Requirements: 2.1, 13.3_

- [ ] 5. Paystack client module
  - [ ] 5.1 Create `src/lib/paystack.ts` with `import "server-only"`, base URL `https://api.paystack.co`, bearer auth from `PAYSTACK_SECRET_KEY`, and a `isTestMode()` derived from the key prefix — never a separate flag _(P1)_
    - _Requirements: 10.1, 11.2_
  - [ ] 5.2 Implement `initializeTransaction()` against `POST /transaction/initialize`, converting naira to kobo by ×100 and setting `currency: "NGN"` explicitly _(P1)_
    - _Requirements: 3.1, 3.2_
  - [ ] 5.3 Enforce Paystack's reference charset (`-`, `.`, `=`, alphanumeric only) when generating `LR-<ref>-<attemptNo>` _(P1)_
    - _Requirements: 3.3_
  - [ ] 5.4 Set `callback_url` to the order's own return page and attach only `{ orderRef }` as metadata — no name, phone or address _(P1)_
    - _Requirements: 3.4, 3.5_
  - [ ] 5.5 Supply a placeholder `email` built from the order reference when the customer has none, since the API requires the field _(P1)_
    - _Requirements: 3.6_
  - [ ] 5.6 Request `channels: ["card", "bank", "ussd"]` and record the returned reference, `access_code` handling and raw response server-side only _(P1)_
    - _Requirements: 3.8, 3.9, 10.3_
  - [ ] 5.7 Implement `verifyTransaction(reference)` against `GET /transaction/verify/:reference`, returning status, amount, currency, `paid_at`, `channel` and `gateway_response` _(P1)_
    - _Requirements: 4.2, 8.5_
  - [ ] 5.8 Never return the secret key, the access code, the authorization object or the raw Paystack response from any function this module exposes to a caller in a Client Component _(P1)_
    - _Requirements: 3.10, 10.3_
  - [ ] 5.9 Normalise upstream failures into `{ code, message }` with no upstream body, stack trace or env value attached _(P1)_
    - _Requirements: 10.4_

- [ ] 6. Order creation *(the shared base `commerce-backend` delivers)*
  - [ ] 6.1 Add the `Order`, `OrderItem`, `PaymentAttempt`, `OrderStatusEvent` and `WebhookDelivery` models to `prisma/schema.prisma`, replacing the bare `status String @default("pending")` at line 72 with `paymentStatus`, `confirmationStatus` and `fulfillmentStatus` enumerations _(P1)_
    - _Requirements: 6.1, 6.2_
  - [ ] 6.2 Add a server-generated, unique `Order.ref` in the `LR-` alphabet and a nullable `refCode` for the layout ref described in the `fitment-engine` spec _(P1)_
    - _Requirements: 4.3, 4.7_
  - [ ] 6.3 Add unique constraints on `PaymentAttempt.reference` and `WebhookDelivery.eventSignature` as the two idempotency keys _(P1)_
    - _Requirements: 3.8, 5.4, 5.8_
  - [ ] 6.4 Write every accepted status change to `OrderStatusEvent` with `from`, `to`, `actor`, `reason`, `at`, and write refused transitions too _(P1)_
    - _Requirements: 6.3, 6.9_
  - [ ] 6.5 Coordinate the migration with `commerce-backend` — it owns `prisma/migrations/`, the real `DATABASE_URL`, and the Prisma client singleton; none of those exist today _(P1)_
    - _Requirements: 6.1_

- [ ] 7. The checkout Server Action
  - [ ] 7.1 Create `src/app/checkout/actions.ts` with `'use server'` and an exported `createOrder(input)` Server Action invoked from `src/app/checkout/page.tsx` _(P1)_
    - _Requirements: 2.1_
  - [ ] 7.2 Validate name, address and phone on the server using `validateNGPhone` from `src/lib/validation.ts`, not the browser's result _(P1)_
    - _Requirements: 2.1, 12.1_
  - [ ] 7.3 Recompute the order through `src/lib/pricing-server.ts` and persist the server total before any payment call _(P1)_
    - _Requirements: 2.1, 2.7_
  - [ ] 7.4 Branch on `paymentMethod`: `pod` creates the order and stops — no processor call, no payment attempt — per `design.md` § Pay on Delivery _(P1)_
    - _Requirements: 7.1, 7.2_
  - [ ] 7.5 Branch on `prepay`: create one `PaymentAttempt`, initialize with Paystack, and return `{ orderRef, authorizationUrl, amountNaira }` _(P1)_
    - _Requirements: 3.1, 4.1_
  - [ ] 7.6 Make a repeat initialize for the same order and attempt number reuse the existing reference rather than minting a second charge _(P1)_
    - _Requirements: 3.8_
  - [ ] 7.7 On initialize failure, leave the order retryable and return `PAYMENT_UNAVAILABLE` with an offer to pay on delivery instead _(P1)_
    - _Requirements: 3.7_
  - [ ] 7.8 Hand off to `whatsapp-engine` for the single confirmation message; this spec must not send anything itself _(P1)_
    - _Requirements: 4.9, 7.3_

- [ ] 8. Webhook endpoint
  - [ ] 8.1 Create `src/app/api/payments/webhook/route.ts` as a Route Handler exporting `POST` _(P1)_
    - _Requirements: 5.1_
  - [ ] 8.2 Read the body with `await request.text()` and HMAC-SHA512 it with `PAYSTACK_SECRET_KEY`, comparing against `x-paystack-signature` in constant time — never `request.json()` then re-serialise _(P1)_
    - _Requirements: 5.1, 5.2_
  - [ ] 8.3 Return 401 without parsing when the header is absent, the length is wrong or the digest mismatches; refuse entirely if the secret is unconfigured _(P1)_
    - _Requirements: 5.1, 5.6, 5.9_
  - [ ] 8.3.1 Prove signature verification against the first genuine test-mode delivery before relying on it, logging both candidates if the raw-body HMAC does not match — Paystack's own Node sample signs `JSON.stringify(req.body)`, which contradicts raw-body signing _(P0)_
    - _Requirements: 5.2, 5.10_
  - [ ] 8.4 Parse only after verification, then insert the `WebhookDelivery` row keyed on the signature — that insert is the dedup step and must be in the same transaction as the state change _(P1)_
    - _Requirements: 5.4, 5.8_
  - [ ] 8.5 On a duplicate signature, mark the delivery `duplicate`, change nothing, return 200 _(P1)_
    - _Requirements: 5.4_
  - [ ] 8.6 On an unknown reference, write a dead-letter row for the owner and return 200 — an unacknowledged webhook is dropped after Paystack's retry window _(P1)_
    - _Requirements: 5.3_
  - [ ] 8.7 On `charge.success`, acknowledge first, then call `verifyTransaction` and apply the result — treat the payload body as a trigger, not as truth _(P1)_
    - _Requirements: 5.5, 5.7_
  - [ ] 8.8 Handle `refund.pending`, `refund.processing`, `refund.processed` and `refund.failed` by recording state only; never let them set the paid state _(P1)_
    - _Requirements: 6.6, 9.3, 9.4_
  - [ ] 8.9 Acknowledge any event already durably stored with 200 even when downstream work fails _(P1)_
    - _Requirements: 5.7_

- [ ] 9. Verification and the status page
  - [ ] 9.1 Create `src/app/api/payments/verify/route.ts` as a Route Handler exporting `GET`, reading `reference` from the query string _(P1)_
    - _Requirements: 4.2_
  - [ ] 9.2 Implement the amount gate: mark `paid` only when `status === "success"` **and** `amount === amountKobo`; otherwise set `partial` and raise `AMOUNT_MISMATCH` _(P1)_
    - _Requirements: 2.8, 8.3, 4.3_
  - [ ] 9.3 Map Paystack's statuses onto ours: `success`→paid, `failed`/`reversed`→failed, `abandoned`→failed-with-reason, `pending`/`ongoing`→pending, and a network timeout→pending _(P1)_
    - _Requirements: 8.5, 8.7_
  - [ ] 9.4 Raise `SURPLUS` when the amount exceeds the stored total, mark paid anyway, and leave the decision to the owner _(P1)_
    - _Requirements: 8.4_
  - [ ] 9.5 Refuse to render order details for a reference that does not belong to the caller's browser session, because the reference is a bearer token _(P1)_
    - _Requirements: 4.8_
  - [ ] 9.6 Create `src/app/checkout/callback/page.tsx` as a Server Component that verifies server-side before rendering, so the first paint is truthful _(P1)_
    - _Requirements: 4.1, 4.2, 12.2_
  - [ ] 9.7 Create `src/components/PaymentStatusPoller.tsx` as a Client Component for bounded re-checking plus a manual "check again" control _(P1)_
    - _Requirements: 4.6, 12.3_
  - [ ] 9.8 Render the pending state with ref, amount, the honest waiting message, a timeframe, the manual control and a WhatsApp contact — and never the word "confirmed" _(P1)_
    - _Requirements: 4.4, 12.3_
  - [ ] 9.9 Render the failure state saying no money was taken, with a retry that creates a **new** attempt rather than reusing the failed one _(P1)_
    - _Requirements: 4.5, 8.8, 12.5_
  - [ ] 9.10 Render the paid state with ref, amount paid, the zone's ETA, and the WhatsApp confirmation line shown only once `whatsapp-engine` has queued the message _(P1)_
    - _Requirements: 4.3, 12.4_
  - [ ] 9.11 Render an honest "we cannot find this payment" state for an unknown reference instead of an empty or optimistic screen _(P1)_
    - _Requirements: 4.7_

- [ ] 10. Abandonment and expiry
  - [ ] 10.1 Create `src/app/api/cron/expire-payments/route.ts` as an idempotent bearer-guarded Route Handler that expires attempts past their window _(P1)_
    - _Requirements: 8.1, 8.2_
  - [ ] 10.2 Leave the order open for a new attempt on expiry; never cancel the order _(P1)_
    - _Requirements: 8.2_
  - [ ] 10.3 Keep every superseded attempt and its outcome, and treat the order as paid when any single attempt reaches the expected amount _(P1)_
    - _Requirements: 8.8_
  - [ ] 10.4 Wire the sweep to whatever scheduler the chosen host provides; the handler must be safe at any cadence _(P2)_
    - _Requirements: 8.9_

- [ ] 11. Refunds
  - [ ] 11.1 Create `src/app/api/payments/refund/route.ts` as an owner-only Route Handler requiring an order ref and a written reason _(P1)_
    - _Requirements: 9.1_
  - [ ] 11.2 Record a refund as submitted, not completed, until the refund is reported complete _(P1)_
    - _Requirements: 9.2_
  - [ ] 11.3 Preserve the original payment record unchanged and add a refund record beside it _(P1)_
    - _Requirements: 9.3_
  - [ ] 11.4 Record a failed refund and leave the order's paid state visible _(P1)_
    - _Requirements: 9.4_
  - [ ] 11.5 Refuse a refund on any order that was never paid, including POD orders _(P1)_
    - _Requirements: 9.5, 7.4_
  - [ ] 11.6 Hand the customer notification to `whatsapp-engine` rather than sending anything here _(P2)_
    - _Requirements: 9.6_
  - [ ] 11.7 Tell the customer on refund that funds may take up to ten business days to reach their account, because Paystack documents that delay _(P2)_
    - _Requirements: 9.7_

- [ ] 12. Secrets and configuration
  - [ ] 12.1 Add `PAYSTACK_SECRET_KEY` to `luxeride-web/.env` and a documented `.env.example`; never give it the `NEXT_PUBLIC_` prefix _(P0)_
    - _Requirements: 10.1, 11.4_
  - [ ] 12.2 Add a README section listing every payment environment variable, its scope, and whether it is safe to expose _(P1)_
    - _Requirements: 10.6_
  - [ ] 12.3 Confirm the build still succeeds with no Paystack key present _(P1)_
    - _Requirements: 11.5_
  - [ ] 12.4 Keep full webhook bodies containing customer email out of any browser-visible error surface _(P1)_
    - _Requirements: 10.7_

- [ ] 13. Test mode
  - [ ] 13.1 Drive every path — initialize, verify, webhook, refund, transitions — from the keys alone, with no hard-coded test branch in business logic _(P1)_
    - _Requirements: 11.1, 11.2_
  - [ ] 13.2 Register the test-mode and live-mode webhook URLs separately in the Dashboard, both pointing at the same handler, and confirm the handler never assumes the Dashboard's currently-selected key _(P1)_
    - _Requirements: 5.9_
  - [ ] 13.3 Restrict the requested channels to `card`, `bank` and `ussd` — `mobile_money` is Ghana/Kenya only and `eft` is South Africa only — and request Paystack support enable `bank_transfer` if the manual-transfer channel is wanted _(P1)_
    - _Requirements: 3.9_
  - [ ] 13.4 Record `gateway_response_code` on every settled transaction, since `approved` is the only success value _(P1)_
    - _Requirements: 3.6.1, 8.5_
  - [ ] 13.2 Surface Paystack's test credentials on a staff-only surface, never to a customer _(P1)_
    - _Requirements: 11.3_
  - [ ] 13.3 Mark test-mode orders as test on staff surfaces so a rehearsal is never mistaken for revenue _(P1)_
    - _Requirements: 11.6_
  - [ ] 13.4 Run the full rehearsal from `design.md` § Testing Strategy, including the forged-total test and both webhook tamper tests _(P1)_
    - _Requirements: 2.1, 5.1, 5.6, 8.7_

- [ ] 14. Honest reporting
  - [ ] 14.1 State in `design.md` and in the README that prepay cannot be made automatic before `commerce-backend` lands, and what the interim behaviour is _(P0)_
    - _Requirements: 13.1_
  - [ ] 14.2 Warn in the README when no webhook URL is configured that payments rely on the customer returning to the status page _(P1)_
    - _Requirements: 13.2_
  - [ ] 14.3 Confirm with the owner whether business verification and a live key are in hand before scheduling any P1 task as launch-blocking _(P1)_
    - _Requirements: 13.2, 13.4_
  - [ ] 14.4 Put the real transaction cost in front of the owner before the ₦2,000 prepay discount goes live: local NGN fees are 1.5% + ₦100 capped at ₦2,000, so an ₦82,000 order costs roughly ₦1,330 to collect — the discount is nearly consumed by the fee _(P0)_
    - _Requirements: 2.5, 1.2_