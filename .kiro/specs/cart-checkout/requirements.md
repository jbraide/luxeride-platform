# Requirements Document

## Introduction

`/cart → /checkout → /order/confirmation` is the only path in LuxeRide that can take money. It is also
the only part of the app that is currently dishonest about what it has done.

Verified today: `src/app/checkout/page.tsx` mints an id with `LR-${Date.now().toString(36)}` in the
browser, writes the object to `localStorage` via the persisted store in `src/store/order.ts`, calls
`window.open(whatsappLink(message), "_blank")`, discards the returned handle, calls `clear()` on the
cart and navigates to `/order/confirmation`, which greets the customer with **"Order sent — check
WhatsApp"**. **There is no network call anywhere in this sequence.**

The consequences are concrete, not theoretical:

- If the popup is blocked, WhatsApp is not installed, or the customer closes the tab without sending,
  **no order exists anywhere the owner can reach**. The cart has already been emptied.
- `buildOrderMessage` in `src/lib/whatsapp.ts` never includes the id, so a WhatsApp thread cannot be
  reconciled against anything.
- `unitPrice` is stored on the cart line in `localStorage` and the total is summed in the browser.
  `removeItem` and `setQty` trust whatever is stored. Nothing has ever recomputed a price.
- Only the phone is validated. `if (!name.trim() || !address.trim()) return;` exits silently — no
  message, no focus, no error state (`src/app/checkout/page.tsx:54`).
- The delivery-zone `<select>` defaults to `LOCATIONS[0].name` = "Lagos Mainland & Island". A customer
  in Abuja or Calabar who never touches the select is quoted a Lagos fee and a Lagos ETA of 24–48h
  against a real 3–5 or 5–7 days.

Without this feature, paid traffic produces silently discarded orders that the owner cannot
recover, at exactly the point where the customer has already decided to buy. The prototype did not
have this problem: `submitCheckout()` in `luxeride-funnel (2).html:1001` only calls `window.open` and
claims nothing afterwards. **The "Order sent" confirmation is an app-only regression**, not a
prototype behaviour, and it is the first thing this spec removes.

Scope: this spec covers the cart, checkout, the WhatsApp handoff and the confirmation screen,
including the honesty and resilience of each step. It does **not** own persistence
(`commerce-backend`), the payment option (`payments-paystack`), the Cloud API and webhook
(`whatsapp-engine`), pixels (`ad-landing-and-tracking`) or policy copy (`trust-and-policies`) — see
Design → Ownership and cross-references.

---

## Requirements

### Requirement 1 — The site must never claim more than it knows

**User Story:** As the owner, I want the site to say only what is true, so that a customer's trust in
"Order sent" is never spent on an order that does not exist.

#### Acceptance Criteria

1.1 WHEN a checkout submission completes THEN THE SYSTEM SHALL describe the result as an order that
is **prepared and handed off to WhatsApp**, and SHALL NOT state that the order has been received,
confirmed, accepted or dispatched.

1.2 IF the WhatsApp window could not be opened THEN THE SYSTEM SHALL tell the customer that their
browser blocked it, SHALL offer an explicit alternative way to open it, and SHALL NOT display a sent
or confirmed state.

1.3 WHEN the customer reports that they have sent the message THEN THE SYSTEM SHALL state plainly
that the website cannot observe WhatsApp and that a human will reply.

1.4 WHILE no server-confirmed order record exists THEN THE SYSTEM SHALL NOT render a success
checkmark, a tick, or the string "Order sent".

1.5 WHEN the confirmation screen is reached THEN THE SYSTEM SHALL render the order reference, the
priced lines and a "what happens next" statement before any celebratory styling.

### Requirement 2 — Every order carries a reference that can be reconciled

**User Story:** As the owner, I want the WhatsApp conversation and the site's record tied together by
a reference, so that reconciling an order costs a search rather than an archaeology.

The reference mechanism is the one source doc C establishes: the WhatsApp ref is what makes both the
conversation and the attribution cheap (`luxeride-fitment-engine-admin-layout-grouping-spec.md:102`).
Today `buildOrderMessage` emits no id at all.

#### Acceptance Criteria

2.1 WHEN an order is priced THEN THE SYSTEM SHALL mint a reference that is **not derived from the wall
clock**, so that consecutive orders cannot be enumerated by incrementing a counter.

2.2 WHEN the WhatsApp order message is built THEN THE SYSTEM SHALL include that reference.

2.3 WHEN the confirmation screen is rendered THEN THE SYSTEM SHALL display the reference inside a
selectable, copyable element.

2.4 IF an order is accepted THEN THE SYSTEM SHALL produce exactly one record containing the reference,
customer name, phone, address, delivery zone, payment method, every priced line with its unit price
and quantity, the total, and the full text of the WhatsApp message that was handed off.

2.5 IF a customer arrives at a confirmation URL whose reference is not in local storage THEN THE
SYSTEM SHALL render a recovery screen addressed to that reference, not a "no order found" screen.

2.6 WHEN a record exists THEN THE SYSTEM SHALL be able to produce it without a database, and SHALL
state in the design that the durable store is a stopgap until `commerce-backend` lands.

### Requirement 3 — Prices are recomputed by the server, not trusted from the browser

**User Story:** As the owner, I want the total the customer agrees to to be one I can honour, so that
no edited `localStorage`, stale cart or catalogue edit produces a number I have to apologise for.

#### Acceptance Criteria

3.1 WHEN the client submits an order THEN THE SYSTEM SHALL send product **identity** — product slug,
brand, model, year, row configuration and quantity — and SHALL NOT send any price field.

3.2 WHEN the server prices an order THEN THE SYSTEM SHALL recompute every unit price from
`src/data/products.ts` and the brand tier in `src/data/cars.ts`, ignoring any client-supplied value.

3.3 IF any line references an unknown product slug, an unavailable brand or model, a row
configuration the product does not accept, or a quantity outside the allowed range THEN THE SYSTEM
SHALL reject the **whole** order with a reason naming the offending line, and SHALL NOT create a
partial order.

3.4 WHEN the server returns a priced order THEN THE CLIENT SHALL render the server's figures in place
of its own, and IF they differ from the total the customer was shown THEN THE SYSTEM SHALL display the
corrected total and the reason before the handoff is offered.

3.5 WHEN an order is recorded THEN THE SYSTEM SHALL snapshot each line's unit price onto the order so
that a later catalogue price change never rewrites the stored order — the rule `luxeride-architecture-plan.md`
§5 already states for `OrderItem`.

3.6 WHEN totals are computed THEN THE SYSTEM SHALL use exactly these rules and no others:
`subtotal = Σ(unitPrice × qty)`; `shippingFee = 0 when payment is prepay else the selected zone's fee`;
`discount = 2000 when payment is prepay else 0`; `total = max(subtotal + shippingFee − discount, 0)`.

3.7 WHEN the delivery line is rendered THEN THE SYSTEM SHALL print the zone's ETA and SHALL print
"Free" rather than a zero naira figure when the fee is zero.

### Requirement 4 — The cart survives until the handoff is confirmed

**User Story:** As the owner, I want an unsent WhatsApp message to leave the customer's cart intact, so
that a blocked popup or a distracted buyer is one tap from an order rather than a lost one.

#### Acceptance Criteria

4.1 WHEN a checkout submission begins THEN THE SYSTEM SHALL NOT clear the cart.

4.2 WHEN the handoff has been attempted THEN THE SYSTEM SHALL keep the cart intact until the customer
explicitly confirms the handoff.

4.3 WHEN the customer confirms the handoff THEN THE SYSTEM SHALL clear the cart, persist the priced
order, and navigate to the confirmation screen carrying the reference.

4.4 IF the customer confirms the handoff and then presses the browser Back button THEN THE SYSTEM
SHALL NOT present an empty-cart screen implying the order vanished; it SHALL offer a route to the
confirmation screen for the last reference.

4.5 WHILE a submission is in flight THEN THE SYSTEM SHALL disable the submit control and SHALL label it
with the work in progress, so that a double tap cannot produce two orders.

4.6 IF the server prices the order but the WhatsApp handoff then fails for any reason THEN THE SYSTEM
SHALL keep the cart, keep the customer's typed details, and keep the reference retrievable.

### Requirement 5 — Validation is complete, visible and accessible

**User Story:** As a customer on a phone, I want to be told exactly which field is wrong, so that I fix
it instead of tapping a button that does nothing.

#### Acceptance Criteria

5.1 WHEN the customer submits THEN THE SYSTEM SHALL validate full name, phone number, delivery address
and delivery zone, and SHALL block submission if any fails.

5.2 IF a field fails validation THEN THE SYSTEM SHALL render the error adjacent to that field, set
`aria-invalid="true"` on the control, associate the error with `aria-describedby`, and expose it in a
region with `role="alert"`.

5.3 WHEN submission is blocked by validation THEN THE SYSTEM SHALL move focus to the first invalid
control.

5.4 IF the customer edits a field that was in error THEN THE SYSTEM SHALL clear that field's error.

5.5 WHILE any field is invalid THEN THE SYSTEM SHALL NOT have sent anything to WhatsApp, SHALL NOT have
created an order, and SHALL NOT have cleared the cart.

5.6 WHEN a delivery zone has not been chosen THEN THE SYSTEM SHALL NOT apply a default zone, because
the zone changes both the fee and the stated arrival time.

### Requirement 6 — The confirmation screen is truthful in every state

**User Story:** As a customer who reaches the confirmation URL, I want to be told what is actually known
about my order, so that I am not told my order was lost when it may be sitting in my WhatsApp.

The screen has three distinct inputs and must handle all of them: a local record, a reference in the
URL with no local record, and neither.

#### Acceptance Criteria

6.1 WHEN a matching local order record exists THEN THE SYSTEM SHALL show the reference, the itemised
lines, the delivery fee or "Free", the prepay discount, the total, the delivery ETA, and a button that
re-opens the WhatsApp conversation with the same message.

6.2 IF there is no local record but the URL carries a reference THEN THE SYSTEM SHALL state that the
order is held in WhatsApp, SHALL display the reference, and SHALL provide a WhatsApp contact action
that opens a message already quoting that reference.

6.3 IF there is neither a record nor a reference THEN THE SYSTEM SHALL offer three actions — start a
new order, contact the business on WhatsApp, and look up an order reference — and SHALL NOT imply that
an order was lost or that the customer did something wrong.

6.4 WHEN no record is present THEN THE SYSTEM SHALL NOT render the success tick currently shown at
`src/app/order/confirmation/page.tsx:27`.

6.5 WHEN the screen renders THEN THE SYSTEM SHALL replace the current single string "No recent order
found" with copy that describes what happened and what to do next.

### Requirement 7 — The cart is a data structure, not a suggestion

**User Story:** As the owner, I want the cart to hold one row per product per car, so that the order I
receive matches what the customer believes they ordered.

`addItem` in `src/store/cart.ts:33-39` always pushes a new row, so adding the same product for the
same car twice creates two rows, and `setQty` floors at 1 so the "–" control at
`src/app/cart/page.tsx:47` silently does nothing at quantity one.

#### Acceptance Criteria

7.1 WHEN the same product slug, brand, model, year and row configuration is added again THEN THE
SYSTEM SHALL merge it into the existing line and increase that line's quantity.

7.2 WHEN the quantity is decreased while the quantity is one THEN THE SYSTEM SHALL remove the line.

7.3 WHILE a line exists THEN THE SYSTEM SHALL refuse a quantity above a defined per-line maximum and
SHALL disable the increment control at that bound.

7.4 WHEN the cart is rehydrated from storage THEN THE SYSTEM SHALL discard entries that are
structurally invalid — missing slug, non-numeric or negative `unitPrice`, non-numeric `qty`, unknown
`rows` — and SHALL NOT let one bad entry break the cart or checkout screen.

7.5 WHEN the customer removes a line THEN THE SYSTEM SHALL leave the remaining lines untouched.

7.6 WHEN a line is removed or its quantity changes THEN THE SYSTEM SHALL recompute the displayed line
total and subtotal from that line's own stored `unitPrice`, and the server SHALL still be the
authority once the order is submitted (Requirement 3).

### Requirement 8 — Conversion mechanics at the two highest-intent screens

**User Story:** As the owner, I want the cart and checkout to do the selling that a sales person would
do, because these are the only two screens a paying customer actually sees.

#### Acceptance Criteria

8.1 WHEN the cart contains a Single Layer Mats line THEN THE SYSTEM SHALL offer an in-place upgrade to
Double Layer Mats for the same car, year and row configuration, showing the exact additional cost.

8.2 WHEN the cart contains Double Layer Mats or Seat Covers and not the Full Bundle THEN THE SYSTEM
SHALL offer the Full Bundle priced for the same car and row configuration, stating the saving against
buying the two items separately.

8.3 WHILE a prepay option exists THEN THE SYSTEM SHALL state the customer's total saving from
prepaying as a figure derived from the selected delivery zone (zone fee + ₦2,000), not as a static
badge.

8.4 WHEN a delivery zone is selected THEN THE SYSTEM SHALL display that zone's ETA on the checkout
screen and on the confirmation screen. Today `zone.eta` appears only inside the `<option>` text at
`src/app/checkout/page.tsx:134` and nowhere else.

8.5 WHILE a prepay option exists THEN THE SYSTEM SHALL display the bank account details required to
pay, and SHALL NOT offer an option whose stated fulfilment — "account details sent on WhatsApp" at
`src/app/checkout/page.tsx:161` — has no mechanism and no data behind it.

8.6 WHEN cross-sell or upsell items are shown THEN THE SYSTEM SHALL exclude anything already in the
cart, and SHALL NOT render an image slot for a product that has no image file, because `SafeImage`
returns `null` on error and would leave an empty grey box.

8.7 WHEN the cart subtotal is below the prepay saving THEN THE SYSTEM SHALL not display a saving larger
than the order is worth.

### Requirement 9 — Abandoned carts stay recoverable on the customer's own device

**User Story:** As a phone-first customer, I want my half-typed details to survive a call, a low
battery or a back-swipe, so that I do not have to start again on a small screen.

There is no mail provider in this repo and no database, so P0 recovery is same-device only. This
requirement is written so it never promises more than that.

#### Acceptance Criteria

9.1 WHILE the checkout form is being filled THEN THE SYSTEM SHALL persist the in-progress draft so a
refresh, a crash or a back-navigation does not discard the customer's typed details.

9.2 WHEN the order is successfully handed off THEN THE SYSTEM SHALL clear the draft.

9.3 IF the customer leaves checkout without submitting THEN THE SYSTEM SHALL leave both the cart and the
draft intact so that returning to the device resumes where they left off.

9.4 WHILE no server-side cart or lead persistence exists THEN THE SYSTEM SHALL NOT claim that an
abandoned cart can be recovered, and any recovery copy SHALL be scoped to "on this device".

9.5 WHEN the customer reaches checkout with an empty cart THEN THE SYSTEM SHALL offer the fit finder
rather than a dead end, and SHALL NOT silently return to the shop.

### Requirement 10 — Consent and a plain statement of what is collected

**User Story:** As a customer, I want to know what happens to my phone number and address, so that
handing over a home address is an informed choice.

#### Acceptance Criteria

10.1 WHEN the checkout form is rendered THEN THE SYSTEM SHALL present a consent control the customer
must activate before the order can be submitted.

10.2 IF the customer does not activate consent THEN THE SYSTEM SHALL block submission, SHALL NOT open
WhatsApp, and SHALL NOT create an order.

10.3 WHEN personal details are collected THEN THE SYSTEM SHALL display a one-line statement of what the
phone number and address are used for.

10.4 WHILE the linked privacy or terms page does not exist THEN THE SYSTEM SHALL NOT render a link to
it. A consent checkbox pointing at a 404 is worse than no checkbox.

### Requirement 11 — Looking an order up, and ordering again

**User Story:** As the owner, I want a customer who clears their phone data to be able to find their
order, so that the reference I asked them to quote is actually usable.

#### Acceptance Criteria

11.1 WHEN an order record exists server-side THEN THE SYSTEM SHALL provide a page that accepts a
reference and returns that order's status and priced lines.

11.2 WHEN a completed order is shown THEN THE SYSTEM SHALL offer a re-order action that repopulates
the cart from that order's priced lines.

11.3 IF a reference is not found THEN THE SYSTEM SHALL say so plainly and route the customer to
WhatsApp, and SHALL NOT display any other order's data.

11.4 WHILE no server-side order store exists THEN THE SYSTEM SHALL NOT render a lookup form that
cannot succeed; the same-device re-order from the local record SHALL be the P1 substitute.

### Requirement 12 — Every route in this path has a failure state

**User Story:** As the owner, I want no page on the money path to be able to render a blank screen or a
raw error, so that a crash never reads as "your order was lost".

#### Acceptance Criteria

12.1 WHEN any route segment throws unexpectedly THEN THE SYSTEM SHALL render an error boundary offering
a retry and a route back into the funnel.

12.2 WHEN an unmatched route is requested THEN THE SYSTEM SHALL render a not-found page offering the
cart and the fit finder rather than a bare 404.

12.3 IF `localStorage` is unavailable or throws THEN THE SYSTEM SHALL render an explanatory state with
a WhatsApp contact action instead of crashing the cart or confirmation screen.

12.4 WHEN the order endpoint is unreachable or returns a server error THEN THE SYSTEM SHALL keep the
cart, keep the typed details, and offer both a retry and a manual WhatsApp fallback.

### Requirement 13 — The funnel is measurable

**User Story:** As the owner paying for ads, I want to know how many carts reach a sent WhatsApp
message, so that I can tell a traffic problem from a checkout problem.

#### Acceptance Criteria

13.1 WHEN the cart is viewed, checkout is entered, a field fails validation, an order is priced, the
handoff is attempted and the handoff is confirmed THEN THE SYSTEM SHALL emit a distinct event, and
every event after pricing SHALL carry the order reference.

13.2 WHILE a campaign attribution was captured at landing THEN THE SYSTEM SHALL carry it through to
the order payload so a reference can be tied to a campaign.

13.3 WHILE no analytics provider is installed THEN THE SYSTEM SHALL queue events without blocking or
delaying the order flow.

---

**Out of scope, by design:** Paystack card/transfer checkout (`payments-paystack`); the WhatsApp Cloud
API, the button webhook and the status transitions from `pending` to `confirmed`/`cancelled`
(`whatsapp-engine`); the database tables, migrations and the durable order row (`commerce-backend`);
pixels, GTM and UTM capture (`ad-landing-and-tracking`); the privacy, terms, delivery and returns
copy (`trust-and-policies`). Each is referenced here at the point where this feature touches it.