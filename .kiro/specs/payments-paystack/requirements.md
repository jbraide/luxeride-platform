# Requirements Document — `payments-paystack`

## Introduction

This spec replaces the current "Prepay by Transfer" option on `/checkout` with a real Paystack
integration, or — if that cannot be finished honestly — with copy that tells the customer the truth
about what "prepay" actually is today.

**The verified starting state, stated plainly:** nothing about payments exists.

- `luxeride-web/package.json` has no Paystack SDK and no HTTP client of any kind. Dependencies are
  `next`, `react`, `react-dom`, `zustand`, `@prisma/client`, `prisma`.
- `luxeride-web/.env` contains one key, `DATABASE_URL`, and its value is the literal placeholder
  `postgresql://user:pass@localhost:5432/luxeride`.
- There are **no `route.ts` files and no server actions anywhere in `src/`** (`_CONTEXT.md` §6).
- `src/app/checkout/page.tsx:26-28` is the entire prepay implementation:

  ```ts
  const shippingFee = payment === "prepay" ? 0 : zone.fee;
  const discount = payment === "prepay" ? 2000 : 0;
  const total = Math.max(subtotal() + shippingFee - discount, 0);
  ```

- The option is labelled *"Prepay by Transfer — Save ₦2,000 · Free shipping — account details sent on
  WhatsApp"* (`src/app/checkout/page.tsx:158-162`) and the button reads *"Confirm My Order on
  WhatsApp"* (`src/app/checkout/page.tsx:171`).
- `src/app/checkout/page.tsx:78` does `window.open(whatsappLink(message), "_blank")` and then
  immediately `clear()`s the cart and routes to `/order/confirmation`, which says *"Order sent —
  check WhatsApp"* (`src/app/order/confirmation/page.tsx:30`).

So "prepay" today means: a ₦2,000 discount and free shipping, in exchange for the customer starting a
manual bank transfer that a human negotiates in a WhatsApp chat. No money moves through any system.
No order record exists on any server. The order id (`LR-…`, generated in the browser at
`src/app/checkout/page.tsx:62`) never reaches Paystack, never reaches the WhatsApp message, and is
discarded when the browser storage is cleared.

**What breaks without this spec:**

1. **Prepay is uncollectable.** The discount is promised at checkout and the cash never arrives
   automatically. Under paid traffic the owner's only way to notice is to read chat.
2. **No reconciliation.** There is nothing to match a payment to an order, so a customer who says
   "I paid" cannot be answered from any record.
3. **The copy overpromises.** "Prepay" implies a payment step; what exists is a promise to send bank
   details. That gap is the specific dishonesty `_CONTEXT.md` §12 rule 8 and
   `00-RELEASE-READINESS-AUDIT.md` §5 are pointing at.
4. **The order total is computed in the browser.** Any amount a client sends must be treated as a
   claim, never as a fact. Nothing enforces that today because nothing is sent.

**What this spec is not.** It is not the database. Persistence of orders is
`commerce-backend`'s job (`prisma/schema.prisma` exists but has never been migrated — there is no
`prisma/migrations/` directory and `.env`'s `DATABASE_URL` is a placeholder). This spec defines the
payments contract and says exactly what it can and cannot do before that lands. Order creation itself
belongs to `cart-checkout` and `commerce-backend`; this spec consumes it. Cart and checkout
conversion work is `cart-checkout`. The WhatsApp confirmation after a successful payment is
`whatsapp-engine`. UTM capture and the conversion event are `ad-landing-and-tracking`.

**Priority context.** The owner wants to run ads today (`_CONTEXT.md` §12 rule 8). A Paystack account
with a verified business, a live secret key and a webhook URL that resolves to a deployed app is a
multi-day external dependency, and `commerce-backend` is not started. **The minimum viable honest
version of this feature is Requirement 1** — copy that does not lie — and it can ship today. Everything
else is blocked on real keys and a real database.

---

## Requirements

### Requirement 1 — Prepay wording must match what prepay actually does

**User Story:** As a customer about to pay, I want the payment options described accurately, so that I
am not promised a checkout experience LuxeRide does not have.

#### Acceptance Criteria

1.1 WHEN a customer selects the transfer/prepay option on `/checkout` THEN THE SYSTEM SHALL describe
it as paying by bank transfer where account details are sent to them afterwards, and SHALL NOT
describe it as an online, card, or automatic payment.

1.2 WHEN the ₦2,000 saving and free shipping are shown THEN THE SYSTEM SHALL state that they apply
only once the transfer is received and confirmed, and SHALL NOT imply the saving is unconditional.

1.3 IF Paystack is not configured on the server (`PAYSTACK_SECRET_KEY` absent) THEN THE SYSTEM SHALL
render the transfer option with the Requirement 1.1 copy and SHALL NOT render any Paystack, card, or
secure-checkout wording.

1.4 IF Paystack is configured but running against a test key THEN THE SYSTEM SHALL either hide the
Paystack option from customers or label it explicitly as a test payment, so that no customer is ever
charged or believes they have paid for real.

1.5 WHEN a customer completes a Pay on Delivery order THEN THE SYSTEM SHALL state plainly that they
pay the rider on arrival in cash or transfer, so that "Pay on Delivery" is not read as "already
paid".

1.6 WHILE no server-side order record exists THEN THE SYSTEM SHALL NOT display a green confirmation
that implies the order is recorded anywhere, because it is not.

> Requirement 1 is the only requirement in this spec that can be delivered before `commerce-backend`
> and before a Paystack account exists. It is P0. Everything else is P1 or later and is blocked on
> external dependencies named in `design.md` § Open Questions.

---

### Requirement 2 — The order total is computed on the server

**User Story:** As the owner, I want the amount charged to be calculated by LuxeRide rather than
supplied by the buyer's browser, so that no customer can choose what they pay.

#### Acceptance Criteria

2.1 WHEN a payment is initialized THEN THE SYSTEM SHALL recompute every line price, the delivery fee,
the discount and the total from server-owned data, and SHALL ignore any amount supplied by the client.

2.2 WHERE a line price is recomputed THEN THE SYSTEM SHALL derive the price from the product's
`regular`/`premium`/`threeRowSurcharge` fields and the car's tier, using the same helper the rest of
the site uses, so that the server and the storefront cannot drift apart.

2.3 WHEN a product slug sent by the client does not exist in the server catalogue THEN THE SYSTEM SHALL
reject the order and SHALL NOT fall back to a client-supplied name or price.

2.4 WHEN a brand sent by the client is not in the server car data THEN THE SYSTEM SHALL reject the order
rather than assume a tier.

2.5 WHEN the payment method is `prepay` THEN THE SYSTEM SHALL apply exactly the rule already in the
codebase — delivery fee becomes zero and a flat ₦2,000 discount applies — and SHALL produce the same
figure the storefront displays.

2.6 IF the recomputed total is less than the discount THEN THE SYSTEM SHALL clamp the chargeable total
to zero, matching the existing `Math.max(…, 0)` behaviour, so that a small cart never produces a
negative or NaN charge.

2.7 WHEN an order is created THEN THE SYSTEM SHALL store the recomputed total on the order and SHALL
use the stored value for every later comparison against what Paystack reports, so that a later
catalogue edit cannot change what an existing order owed.

2.8 IF the amount Paystack reports for a transaction differs from the stored order total THEN THE
SYSTEM SHALL treat the mismatch as an exception requiring human review and SHALL NOT mark the order
paid automatically. This is Paystack's own instruction: *"If the amount doesn't match, do not deliver
value to the customer."*

2.9 WHEN the checkout page displays a total THEN THE SYSTEM SHALL display the figure returned by the
server, and SHALL treat the client-side live total as an estimate only.

---

### Requirement 3 — Payment initialization

**User Story:** As a customer who chooses to pay upfront, I want to be taken to a payment page I
recognise and trust, so that I can complete the payment on my phone.

#### Acceptance Criteria

3.1 WHEN an order with payment method `prepay` is created THEN THE SYSTEM SHALL initialize exactly one
Paystack transaction for that order attempt and SHALL record the reference Paystack returns.

3.2 WHEN a transaction is initialized THEN THE SYSTEM SHALL send the amount in the currency's subunit
(the lowest denomination) and SHALL set the currency explicitly to NGN.

3.3 WHEN a transaction is initialized THEN THE SYSTEM SHALL supply a reference that is unique per
payment attempt and composed only of characters Paystack accepts, and SHALL record that reference
against the order attempt.

3.4 WHEN a transaction is initialized THEN THE SYSTEM SHALL supply a callback URL pointing at LuxeRide's
own return page for that order.

3.5 WHEN a transaction is initialized THEN THE SYSTEM SHALL attach non-personal metadata identifying
the LuxeRide order reference, and SHALL NOT attach the customer's name, phone number or street address.

3.6 IF the customer has no email address THEN THE SYSTEM SHALL still complete initialization, since
Paystack's API requires an `email` field and states that *"all transactions on Paystack require a
customer's email address"*, by generating a placeholder address in Paystack's own documented style
(`080300000@mybusiness.com`) rather than failing or inventing a plausible-looking personal address.

3.6.1 WHEN the order is paid THEN THE SYSTEM SHALL record `gateway_response_code`, because
`approved` is the only success value and it is the only thing that makes a later support conversation
possible.

3.7 IF Paystack declines to initialize THEN THE SYSTEM SHALL record the failure, SHALL leave the order
in a state that can be retried, and SHALL tell the customer in plain language that payment could not
be started, with a way to try again.

3.8 IF the same payment attempt is initialized twice THEN THE SYSTEM SHALL reuse the existing
reference rather than creating a second charge for one order.

3.9 WHEN the customer is sent to Paystack THEN THE SYSTEM SHALL support card, bank transfer and USSD
channels — the three Paystack documents as available to businesses in Nigeria — and SHALL NOT include
`mobile_money` (Ghana and Kenya only) or `eft` (South Africa only), which are meaningless for an NGN
order.

3.10 WHEN initialization succeeds THEN THE SYSTEM SHALL return the authorization URL to the client and
SHALL NOT return the Paystack secret key, the access code, or the full Paystack response.

---

### Requirement 4 — Returning from Paystack and verifying

**User Story:** As a customer who just paid, I want to see whether my payment went through without
having to ask, so that I know whether to wait or to try again.

#### Acceptance Criteria

4.1 WHEN Paystack returns the customer to the callback URL THEN THE SYSTEM SHALL render a dedicated
payment status page for that order rather than the generic order confirmation page.

4.2 WHEN the status page loads THEN THE SYSTEM SHALL verify the transaction with Paystack on the server
before rendering, so that the first thing the customer sees reflects a real check rather than an
assumption.

4.3 WHEN verification reports success THEN THE SYSTEM SHALL mark the payment paid and SHALL display the
order reference, the amount paid and the delivery estimate.

4.4 WHEN verification reports that the transaction has not completed THEN THE SYSTEM SHALL display a
pending state that states plainly that LuxeRide is waiting for Paystack to confirm, and SHALL NOT say
the order is complete.

4.5 WHEN verification reports failure or abandonment THEN THE SYSTEM SHALL display the failure in plain
language, SHALL state that no money has been taken, and SHALL offer a way to pay again.

4.6 WHILE a payment is pending THEN THE SYSTEM SHALL re-check automatically for a bounded period, and
SHALL provide a manual "check again" control for customers whose browser or network will not
auto-refresh.

4.7 IF the reference in the callback URL does not match any known payment attempt THEN THE SYSTEM SHALL
show an honest "we cannot find this payment" state and SHALL NOT show an empty or optimistic
confirmation.

4.8 IF the reference in the callback URL has been altered to point at another order's reference THEN
THE SYSTEM SHALL refuse to reveal that order's details, because the reference is a bearer token.

4.9 WHEN a payment succeeds THEN THE SYSTEM SHALL trigger exactly one customer confirmation message,
delegating its content and delivery to `whatsapp-engine`.

4.10 IF the confirmation message cannot be sent THEN THE SYSTEM SHALL still record the payment as paid
and SHALL NOT reverse a successful payment because a message failed.

---

### Requirement 5 — Webhook receipt, signature verification and idempotency

**User Story:** As the owner, I want payments to be recorded even when the customer closes the tab or
loses signal, so that money received is never lost.

#### Acceptance Criteria

5.1 WHEN Paystack delivers a webhook to LuxeRide's webhook endpoint THEN THE SYSTEM SHALL verify the
request signature against the **raw request body** before parsing or acting on the payload, and SHALL
reject the request with a 4xx status if the signature does not match.

5.2 WHEN reading the webhook body for signature verification THEN THE SYSTEM SHALL use the exact bytes
Paystack sent and SHALL NOT re-serialize a parsed object, because re-serialization changes the bytes
and breaks the digest.

5.3 IF a webhook arrives whose reference matches no known payment attempt THEN THE SYSTEM SHALL store it
in a dead-letter record visible to the owner and SHALL return a 200 response, because an unacknowledged
webhook is dropped after a bounded retry period and would otherwise be lost entirely.

5.4 WHEN a webhook for a reference that is already in a terminal state arrives again THEN THE SYSTEM
SHALL record it as a duplicate, SHALL NOT re-apply the state change, and SHALL return a 200 response.

5.5 WHEN a payment-success webhook is received THEN THE SYSTEM SHALL re-verify the transaction with
Paystack's verify endpoint before treating it as paid, and SHALL use the webhook only as a trigger.

5.6 WHEN the webhook endpoint receives a request with no signature header THEN THE SYSTEM SHALL reject
it.

5.7 WHEN the webhook handler cannot complete its work THEN THE SYSTEM SHALL still return a 200 response
once the event has been durably recorded, so that Paystack's retry mechanism is not spent on events
that have already been stored.

5.8 WHEN a duplicate delivery is detected THEN THE SYSTEM SHALL be able to prove which delivery was
processed first, using the stored delivery identifier and processing timestamp.

5.9 WHEN Paystack has registered separate webhook URLs for test mode and live mode THEN THE SYSTEM
SHALL serve both from the same handler and SHALL NOT assume that the key it verifies against is the
one currently displayed in the Dashboard.

5.10 WHEN the first genuine webhook is received in a new deployment THEN THE SYSTEM SHALL have its
signature verification proven against that real delivery before it is relied upon, because
Paystack's own documentation does not settle whether the HMAC covers the raw body or a re-serialised
parse of it.

---

### Requirement 6 — Order status vocabulary and transition authority

**User Story:** As the owner, I want order status to mean one thing and to be changed by exactly one
component, so that the status on an order is trustworthy.

#### Acceptance Criteria

6.1 THE SYSTEM SHALL model order state as at least three independent axes — payment state, customer
confirmation state, and fulfillment state — rather than a single status string, because "paid but not
confirmed" and "confirmed but not paid" are both real and neither should be representable as a
contradiction.

6.2 THE SYSTEM SHALL replace the bare `status String @default("pending")` currently declared in
`prisma/schema.prisma:72` with enumerated values, and THE SYSTEM SHALL reject any value outside those
enumerations.

6.3 WHEN a transition is attempted THEN THE SYSTEM SHALL check it against an explicit transition table
and SHALL refuse any transition that is not in that table, including backwards transitions.

6.4 WHEN a payment reaches a terminal paid state THEN no component SHALL move it back to an unpaid
state.

6.5 WHEN an order is cancelled THEN THE SYSTEM SHALL treat that order as terminal for automation, and
SHALL require a new order for a new purchase.

6.6 WHEN a refund is recorded THEN THE SYSTEM SHALL require an explicit human action to set the refunded
state; no webhook or automated path SHALL set it.

6.7 WHEN the WhatsApp Confirm button is pressed THEN THE SYSTEM SHALL allow confirmation state to change
from unconfirmed to confirmed, and SHALL NOT let that same press change payment state.

6.8 WHEN an order's payment and confirmation states would disagree with each other (for example a
confirmed order whose payment failed) THEN THE SYSTEM SHALL record both facts rather than collapsing
them into one value.

6.9 THE SYSTEM SHALL retain a history of every state change with the actor that caused it, so that a
disputed order can be explained after the fact.

6.10 IF the persistence layer described in `commerce-backend` has not landed THEN THE SYSTEM SHALL NOT
present a status on the customer-facing page that it cannot retrieve from a server, and SHALL label any
such status as provisional.

---

### Requirement 7 — Pay on Delivery is unchanged

**User Story:** As a customer who prefers to pay on delivery, I want the same simple, human-verified
flow I have today, so that adding a processor does not change how I buy.

#### Acceptance Criteria

7.1 WHEN an order with payment method `pod` is created THEN THE SYSTEM SHALL NOT initialize, verify, or
otherwise contact any payment processor, and SHALL create no payment attempt.

7.2 WHEN a Pay on Delivery order is created THEN THE SYSTEM SHALL treat its payment state as "to be
collected" and SHALL NOT show a paid state at any point in the automated flow.

7.3 WHEN a Pay on Delivery order is created THEN THE SYSTEM SHALL follow the same confirmation-message
and Cancel-button path as a prepaid order, because that flow is delivered by `whatsapp-engine` and is
independent of payment.

7.4 WHEN a Pay on Delivery order is cancelled THEN THE SYSTEM SHALL record the cancellation and SHALL
NOT create a refund, because no money was taken.

7.5 WHEN a Pay on Delivery order is dispatched THEN THE SYSTEM SHALL keep the money-collection step
visible to the rider as an owner-facing flag, not as an automated state change.

---

### Requirement 8 — Failure, abandonment and partial payment

**User Story:** As the owner, I want every payment that does not complete to be visible and honest,
so that I neither chase a customer who never paid nor dispatch on a short payment.

#### Acceptance Criteria

8.1 WHEN a customer begins a payment and does not complete it THEN THE SYSTEM SHALL leave the order in
a pending state with an expiry time, and SHALL NOT treat the order as abandoned until that time passes
without a completion check.

8.2 WHEN a payment attempt expires without completion THEN THE SYSTEM SHALL mark that attempt expired
and SHALL leave the order open for a new attempt rather than cancelling the order.

8.3 IF the amount Paystack reports is **less** than the stored order total THEN THE SYSTEM SHALL NOT
mark the order paid; it SHALL record the amount received, record the outstanding balance, and flag the
order for human handling.

8.4 IF the amount Paystack reports is **greater** than the stored order total THEN THE SYSTEM SHALL
mark the order paid and SHALL flag the surplus for human handling rather than silently absorbing it.

8.5 IF verification returns a status that is not success THEN THE SYSTEM SHALL record that status
verbatim, because Paystack distinguishes several failure and intermediate states.

8.6 WHEN a customer's payment fails on one channel after they selected it THEN THE SYSTEM SHALL record
which channel failed, so the owner can tell a dead card from an unreachable USSD code.

8.7 IF Paystack's verify endpoint is unreachable or times out THEN THE SYSTEM SHALL record the attempt as
unverified rather than failed, because "we could not check" and "they did not pay" are different facts
and only one of them is safe to act on.

8.8 WHEN an order has multiple payment attempts THEN THE SYSTEM SHALL keep all attempts and their
outcomes, and SHALL treat the order as paid when any one attempt reaches the expected amount.

8.9 IF the customer abandons the flow after the order exists THEN the order SHALL remain recoverable by
its reference, so that a follow-up message or a customer who returns later is not starting from zero.

---

### Requirement 9 — Refunds

**User Story:** As the owner, I want to be able to refund a customer and have the record show it, so
that resolving a complaint does not require a spreadsheet.

#### Acceptance Criteria

9.1 WHEN the owner initiates a refund THEN THE SYSTEM SHALL require an explicit human action naming the
order and a reason, and SHALL never trigger a refund automatically.

9.2 WHEN a refund is submitted to Paystack THEN THE SYSTEM SHALL record that it was submitted, and SHALL
NOT record it as completed until the refund is reported complete.

9.3 WHEN a refund completes THEN THE SYSTEM SHALL set the refund state and SHALL preserve the original
payment record unchanged.

9.4 WHEN a refund fails THEN THE SYSTEM SHALL record the failure and leave the order's original paid
state visible, because a failed refund means the money was returned to the merchant account and the
customer still has it.

9.5 IF a refund is attempted on an order that was never paid THEN THE SYSTEM SHALL refuse it.

9.6 WHEN a refund is recorded THEN THE SYSTEM SHALL notify the customer through the messaging path in
`whatsapp-engine`, because a silent refund is how a trust claim dies.

9.7 WHEN a refund is reported processed THEN THE SYSTEM SHALL tell the customer it may take up to ten
business days to reach their account, because Paystack documents that delay and an unannounced wait
reads as a failed refund.

---

### Requirement 10 — Secrets never reach the browser

**User Story:** As the owner, I want my Paystack keys to be impossible to read from the site, so that
a compromised front end cannot charge or read my account.

#### Acceptance Criteria

10.1 THE SYSTEM SHALL read the Paystack secret key only on the server, and SHALL NOT name any variable
holding it with the `NEXT_PUBLIC_` prefix, because Next.js inlines `NEXT_PUBLIC_` variables into the
client bundle at build time.

10.2 IF a module that reads the secret key is imported into a Client Component THEN the build SHALL fail
or the import SHALL be guarded by a server-only marker, so the mistake cannot ship quietly.

10.3 THE SYSTEM SHALL NOT return the secret key, the access code, the authorization object, the
customer email, or the raw Paystack response to any client component.

10.4 WHEN a server action or route handler returns an error to the client THEN THE SYSTEM SHALL return a
stable error code and human-readable message, and SHALL NOT echo upstream response bodies, stack
traces, or environment values.

10.5 THE SYSTEM SHALL keep webhook signature verification in the same server-only module as the secret
key, so the signing secret has exactly one read site.

10.6 THE SYSTEM SHALL document which environment variables exist, which are server-only, and which are
safe to expose, in the repository, so that adding a fourth variable does not start an argument.

10.7 THE SYSTEM SHALL NOT log full Paystack webhook bodies containing customer email addresses in a way
that reaches a browser-visible error surface.

---

### Requirement 11 — Test mode is one environment switch

**User Story:** As the owner, I want to rehearse the whole payment flow without risking real money or
real card numbers, so that I can test safely before launch.

#### Acceptance Criteria

11.1 WHEN the deployment is configured with test keys THEN every code path — initialize, verify,
webhook, refund, status transitions — SHALL behave identically to live mode except for which Paystack
account it talks to.

11.2 THE SYSTEM SHALL NOT branch on a hard-coded test flag in business logic; the mode SHALL be implied
solely by the keys present in the environment.

11.3 WHEN running against test keys THEN THE SYSTEM SHALL expose the test card and bank credentials
only on an explicitly staff-facing surface, and SHALL NOT show them to customers.

11.4 WHEN switching between test and live THEN THE SYSTEM SHALL require only a change of environment
values and a restart, with no code change and no migration.

11.5 IF no Paystack keys are configured THEN THE SYSTEM SHALL start and run, with the transfer option
showing the Requirement 1 copy, so that a fresh clone builds and runs without secrets.

11.6 WHEN a test-mode transaction is verified THEN THE SYSTEM SHALL record and display the test-mode
state on staff-facing surfaces, so that a test order is never mistaken for revenue.

---

### Requirement 12 — What the customer sees at every step

**User Story:** As a customer, I want to know what has happened to my order and my money at all times,
so that I am not left guessing.

#### Acceptance Criteria

12.1 WHEN the customer selects the online payment option THEN THE SYSTEM SHALL state the amount, the
reference, and what happens next before sending them to Paystack.

12.2 WHILE the payment is being made THEN THE SYSTEM SHALL NOT display a confirmation screen; a
confirmation may only appear once a server-side check says the money arrived.

12.3 WHEN a payment is pending THEN THE SYSTEM SHALL display: the order reference, the amount, a plain
statement that LuxeRide is waiting for Paystack's confirmation, an expected timeframe, a manual
"check again" control, and a WhatsApp contact.

12.4 WHEN a payment succeeds THEN THE SYSTEM SHALL display the reference, the amount paid, the delivery
zone's stated estimate, and the next step, and SHALL say that a confirmation is on its way over
WhatsApp only once that message has actually been queued.

12.5 WHEN a payment fails THEN THE SYSTEM SHALL say that no money was taken, SHALL not show a green
tick, and SHALL offer a retry that creates a new attempt rather than reusing a failed one.

12.6 IF the customer reaches the status page with no stored order AND no reference THEN THE SYSTEM SHALL
offer a way to look the order up by reference, because a cleared browser or a different device must not
erase a paid order.

12.7 WHILE an order exists on the server THEN THE SYSTEM SHALL be able to show its current state to the
customer from that reference alone, without relying on `localStorage`.

12.8 THE SYSTEM SHALL NOT tell the customer an order is confirmed, paid, or dispatched based on a
value held only in the browser.

---

### Requirement 13 — Honest reporting about what is live

**User Story:** As the owner, I want to know exactly which parts of the payment path are real, so that
I do not believe I am taking money through a system that is not connected.

#### Acceptance Criteria

13.1 IF the server-side order store is not available THEN THE SYSTEM SHALL state in this repository's
documentation that prepay cannot be made automatic, and SHALL NOT describe the payment path as
complete.

13.2 WHEN the payment feature is enabled without a webhook URL configured THEN THE SYSTEM SHALL state
that payments rely on the customer returning to the status page, and SHALL treat a missing webhook as a
known gap rather than an edge case.

13.3 THE SYSTEM SHALL refuse to report an order as paid on the strength of a client-provided value at
any point.

13.4 IF the application's production build cannot complete THEN THE SYSTEM SHALL treat that as a blocker
for taking payments, because a payment feature that cannot be deployed cannot take payments.