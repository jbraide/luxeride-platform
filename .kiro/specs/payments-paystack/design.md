# Design Document — `payments-paystack`

## Overview

Replace the browser-computed, human-negotiated "prepay" with a Paystack integration whose amount is
computed by LuxeRide and whose outcome is proven by Paystack, not by the buyer's browser.

Three decisions drive everything below.

**Decision 1 — Redirect to Paystack's hosted checkout, not Paystack Inline.**
Paystack exposes two integration shapes. This spec picks the hosted redirect (server initializes,
customer goes to Paystack, Paystack returns the customer to LuxeRide). Reasoning, tied to this
specific buyer: LuxeRide sells ₦15,000–₦135,000 car accessories (`src/data/products.ts`), the site's
own nav is `hidden sm:flex` (`_CONTEXT.md` §4) so phone is the primary surface, and Paystack's
transaction API supports `card`, `bank`, `ussd`, `qr`, `eft`, `mobile_money` and `bank_transfer`
([initialize request schema](https://github.com/api-evangelist/paystack/blob/main/openapi/paystack-transaction-api-openapi.yml)).
USSD and bank transfer are not modal-friendly: the customer is handed a dial code or account
number and has to leave the screen to act on it. A hosted page can hold that state, survive the
customer backgrounding their phone, and be returned to. The redirect flow also needs **no public key
in the browser at all**, because the secret key alone can initialize a transaction. Trade-off
accepted: the customer leaves our domain, so the conversion event must be recorded server-side on the
return page (`ad-landing-and-tracking` owns the event taxonomy; this spec guarantees the server-side
hook exists). Paystack Inline remains a P2 option for card-only, and even then the amount must be
server-bound, not client-supplied.

**Decision 2 — Verify is authoritative; the webhook is a trigger.**
The Paystack webhook surface carries `charge.success`, `charge.dispute.create/remind/resolve`,
`refund.pending/processing/processed/failed`, `transfer.*`, `customeridentification.*`,
`dedicatedaccount.*`, `invoice.*`, `paymentrequest.*` and `subscription.*`. **There is no
`charge.failed` event**, and Paystack says so itself: *"Webhooks are the preferred option for
confirming a transaction status, but we currently send webhook events for just successful
transactions."* So a webhook cannot be the mechanism that learns about failures or abandonments.
Every webhook that says `charge.success` therefore triggers `GET /transaction/verify/:reference`
before any state changes, and the customer's return from Paystack does the same. Two independent
paths reach the same verifier.

Paystack also states the amount check in the same words this spec uses: *"If the amount doesn't match,
do not deliver value to the customer."* And on running both paths together — *"always confirm that
you haven't already delivered value for that transaction to avoid double fulfillments, especially, if
you also use webhooks."* Both are the design, not a coincidence.
([Verify payments](https://paystack.com/docs/payments/verify-payments/), [Accept payments](https://paystack.com/docs/payments/accept-payments/))

**Decision 3 — Amounts in kobo, recomputed server-side, and compared before anything is marked paid.**
`amount` is an integer in the currency's lowest denomination
([transaction JSON schema](https://github.com/api-evangelist/paystack/blob/main/json-schema/paystack-transaction-schema.json)).
The subtotal, delivery fee and ₦2,000 discount are recomputed on the server from
`src/data/products.ts`, `src/data/cars.ts` and `src/data/locations.ts`, and the result is what is
initialized, what is stored, and what is compared against what Paystack returns.

---

## Current State (verified)

Read on this session, not inferred.

### Exists today

| What | Where | Verified detail |
|---|---|---|
| Two payment options | `luxeride-web/src/app/checkout/page.tsx:22`, `:143-163` | `"pod" \| "prepay"` local state; the prepay button reads *"Prepay by Transfer"*, *"Save ₦2,000"*, *"Free shipping — account details sent on WhatsApp"* |
| The discount and free-shipping rule | `luxeride-web/src/app/checkout/page.tsx:26-28` | `shippingFee = payment === "prepay" ? 0 : zone.fee` · `discount = payment === "prepay" ? 2000 : 0` · `total = Math.max(subtotal() + shippingFee - discount, 0)` |
| Delivery zones | `luxeride-web/src/data/locations.ts:7-12` | 4 zones, `fee` 9000/6000/12000/12000, `eta` strings |
| Naira formatting | `luxeride-web/src/lib/pricing.ts` | `fmtNaira` → `"₦" + Math.round(n).toLocaleString("en-NG")` |
| The one pricing helper | `luxeride-web/src/lib/pricing.ts` | `productBase(product, tier, rows)` adds `threeRowSurcharge` when `rowApplicable && rows === "3"` |
| Phone validation | `luxeride-web/src/lib/validation.ts` | 11-digit local `0`-prefixed 70/80/81/90/91, or 13-digit `234…` |
| A browser-generated order id | `luxeride-web/src/app/checkout/page.tsx:62` | `` `LR-${Date.now().toString(36).toUpperCase()}` `` |
| A local-only order record | `luxeride-web/src/store/order.ts` | Zustand + `persist` to `luxeride-last-order`; `PlacedOrder` has `id, name, phone, address, location, paymentMethod, items, subtotal, shippingFee, discount, total, whatsappMessage, placedAt` |
| A confirmation page | `luxeride-web/src/app/order/confirmation/page.tsx` | reads `lastOrder` from `localStorage`; shows *"Order sent — check WhatsApp"* (line 30) or *"No recent order found"* (line 12) |
| The WhatsApp handoff | `luxeride-web/src/app/checkout/page.tsx:78` | `window.open(whatsappLink(message), "_blank")` — the browser opens `wa.me`; LuxeRide never sends anything |
| An `Order` model | `luxeride-web/prisma/schema.prisma:64-78` | `status String @default("pending")`, `paymentMethod String`, `@@index([status])` |

### Does not exist — verified absent

| Absent | How it was established |
|---|---|
| Any Paystack dependency | `luxeride-web/package.json` dependencies are `next`, `react`, `react-dom`, `zustand`, `@prisma/client`, `prisma`. No HTTP client, no payment SDK. |
| Any Paystack key | `luxeride-web/.env` contains exactly one assignment: `DATABASE_URL`, whose value is `postgresql://user:pass@localhost:5432/luxeride`. |
| Any API route or server action | `_CONTEXT.md` §6 — "There are **no `route.ts` handlers and no server actions** anywhere in `src/`". Confirmed by inspection: `src/app` contains only `page.tsx` / `layout.tsx` files. |
| Any database | No `prisma/migrations/` directory. `DATABASE_URL` is a placeholder. No `src/` file imports `@prisma/client` (`_CONTEXT.md` §6). |
| A server-side order record | Nothing writes an order anywhere except `useOrderStore.setLastOrder` into `localStorage` (`src/app/checkout/page.tsx:77`). |
| Any reconciliation between a payment and an order | There is no payment to reconcile and no order to reconcile it to. |
| A tier on the cart line | `CartItem` in `luxeride-web/src/store/cart.ts:6-17` is `{ id, productSlug, productName, brand, model, year, rows, unitPrice, qty, image? }`. **`tier` is not stored**, so a server recompute must re-derive it from the brand. |
| A deployment target | No `vercel.json`, no CI, no deployment config (`_CONTEXT.md` §1). |

### Build state — a hard blocker for taking payments

`npm run build` **fails** with `prisma/seed.ts(2,34): error TS2307: Cannot find module
'./data/products'`, because Next runs `tsc` across tsconfig `include`. `.next/BUILD_ID` is absent, so
no successful production build has ever been produced (`_CONTEXT.md` §3). **You cannot take payments
from an app that does not build.** This is owned by `commerce-backend` and is task 0.0 here.

---

## Architecture

### Flow — server-initiated redirect with server-side verification

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser<br/>(checkout/page.tsx)
    participant A as Server Action<br/>(createOrder)
    participant P as Server pricing<br/>(pricing-server.ts)
    participant D as Order store<br/>(commerce-backend)
    participant K as Paystack API
    participant W as /api/payments/webhook
    participant V as /api/payments/verify

    Note over B: Customer picks "Pay online", presses Confirm

    B->>A: createOrder({name, phone, address, zone, items, paymentMethod:"prepay"})
    Note right of A: Server Action = POST with an<br/>Origin/Host CSRF check enforced by Next

    A->>P: recompute(items, zoneName, "prepay")
    Note right of P: unitPrice = productBase(getProductBySlug(slug),<br/>BRANDS[brand].tier, rows)<br/>shippingFee = 0 · discount = 2000<br/>total = Math.max(subtotal + shippingFee - discount, 0)
    P-->>A: {lines, totalNaira}
    Note left of P: Any client amount is discarded here

    alt product slug or brand not in server data
        P-->>A: REJECT_UNKNOWN_ITEM
        A-->>B: error code + message (no amounts echoed)
    else recompute ok
        A->>D: create Order(payment=unpaid, confirmation=unconfirmed) + PaymentAttempt
        D-->>A: orderRef (e.g. LR-7K3QD2M4)
        A->>K: POST /transaction/initialize<br/>{amount: total*100, currency:"NGN",<br/>reference, callback_url, email: placeholder@…,<br/>channels:[card,bank,ussd], metadata:{orderRef}}
        K-->>A: {authorization_url, access_code, reference}

        alt initialize rejected
            A-->>B: PAYMENT_UNAVAILABLE — "we couldn't start the payment"
        else ok
            A-->>B: {orderRef, authorizationUrl, amountNaira}
            B->>K: Customer pays on Paystack's page
            K-->>B: redirect to /checkout/callback?reference=…

            B->>V: GET /checkout/callback (server) → verify(reference)
            V->>K: GET /transaction/verify/:reference
            alt data.status === "success" AND amount === storedTotal
                V->>D: payment = paid (idempotent) + history row (actor: paystack.verify)
                V-->>B: Paid state + ref + amount + delivery ETA
                V->>A: enqueue one confirmation message (whatsapp-engine)
            else data.status is success BUT amount ≠ storedTotal
                V->>D: flag = AMOUNT_MISMATCH, stay unpaid
                V-->>B: "we're checking this with our payment provider"
            else failed / abandoned / other terminal
                V->>D: payment = failed(abandoned)
                V-->>B: "no money was taken" + retry creates a NEW attempt
            else pending / ongoing / unverified (timeout)
                V->>D: payment = pending (never "failed" on a network error)
                V-->>B: Pending state + "check again"
            end
        end
    end

    par Independent safety net — webhook may arrive before, during or after the return
        K->>W: POST charge.success<br/>x-paystack-signature: HMAC-SHA512(raw body)
        W->>W: raw = await request.text(); recompute HMAC; timing-safe compare
        alt signature invalid
            W-->>K: 401 — never parsed, never acted on
        else signature valid
            W->>D: insert WebhookDelivery(event, signature) — the dedup key
            alt reference already in a terminal state
                W->>D: mark delivery duplicate; no state change
                W-->>K: 200
            else reference unknown
                W->>D: dead-letter row for the owner
                W-->>K: 200 (Paystack drops unacked after its retry window)
            else fresh reference
                W->>W: ack only — do NOT trust the payload body
                W-->>K: 200
                W->>K: GET /transaction/verify/:reference
                K-->>W: {status, amount, currency, paid_at, channel}
                W->>D: payment = paid only if status==="success" AND amount matches
            end
        end
    end

    Note over B,D: If the customer closes the tab, the webhook still lands.<br/>If the webhook is lost, the status page still verifies.
```

### Pay on Delivery — deliberately a different branch

```mermaid
flowchart TD
    A[Checkout submit] --> B{paymentMethod}
    B -->|pod| C[Create Order<br/>payment=to_be_collected<br/>confirmation=unconfirmed]
    C --> D[Enqueue confirmation message<br/>whatsapp-engine]
    D --> E[Customer presses Confirm button]
    E --> F[confirmation = confirmed]
    F --> G{Rider dispatches}
    G --> H[Owner records collection<br/>manually — no processor, no webhook]
    B -->|prepay| I[Paystack branch above]

    style C fill:#1c1916,stroke:#d4af37
    style H fill:#141210,stroke:#8c7853,stroke-dasharray:4 3
```

`pod` never touches Paystack. No initialize, no verify, no webhook, no attempt row. The ₦2,000
discount is a prepayment incentive and therefore **never applies to `pod`** — that rule already lives
at `src/app/checkout/page.tsx:27`.

### Component map

| Component | File | Kind | Why this kind |
|---|---|---|---|
| Order creation + initialize | `src/app/checkout/actions.ts` | **Server Action** (`'use server'`) | It is a mutation driven by the checkout form. Next.js enforces a CSRF check comparing `Origin` to `Host` on Server Action requests — see the Security section of `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` — which is exactly the protection a money-initiating POST needs. |
| Server-side pricing | `src/lib/pricing-server.ts` | Plain TS module, `import "server-only"` | Must be callable from a Server Action and a Route Handler but never from a component. The `server-only` import is the guard Next's own guides use (e.g. `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`). Requires adding the `server-only` package. |
| Paystack HTTP client | `src/lib/paystack.ts` | Plain TS module, `import "server-only"` | One place that knows the base URL, the bearer secret, and the subunit conversion. |
| Payment status page | `src/app/checkout/callback/page.tsx` | **Server Component** | The normal arrival is a full page load after a redirect, so the first render can verify server-side and show the true state without a client flash. |
| Pending-state refresh | `src/components/PaymentStatusPoller.tsx` | **Client Component** | Bounded polling and the manual "check again" button are the only parts that need the browser. |
| Verify endpoint | `src/app/api/payments/verify/route.ts` | **Route Handler** `GET` | Called by the poller. Not a Server Action: a Server Action's endpoint is derived from the page that invokes it, and this must be callable from any origin-side surface. |
| Webhook | `src/app/api/payments/webhook/route.ts` | **Route Handler** `POST` | A webhook is an inbound server-to-server POST. Next.js documents exactly this shape — see the *Webhooks* section of `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, which uses `await request.text()` on the raw body. |
| Refund | `src/app/api/payments/refund/route.ts` | **Route Handler** `POST`, owner-only | Human-initiated, never from a webhook. |
| Abandonment sweep | `src/app/api/cron/expire-payments/route.ts` | **Route Handler** `GET`, bearer-guarded | Idempotent; safe to run at any cadence. |

`route.md` confirms: a `route.ts` file takes over all HTTP verbs for its route, cannot coexist with a
`page.tsx` at the same segment, is **not cached by default**, and reading `request.text()` /
`request.json()` is the documented way to get the body.

---

## Data Models

`commerce-backend` owns the migration. This spec owns the vocabulary. The existing
`prisma/schema.prisma:64-78` is the starting point and needs replacing.

```mermaid
erDiagram
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER ||--|{ PAYMENT_ATTEMPT : "is paid by"
    ORDER ||--|{ ORDER_STATUS_EVENT : "audited by"
    ORDER ||--|| WHATSAPP_MESSAGE : "confirmed via"
    PAYMENT_ATTEMPT ||--o{ WEBHOOK_DELIVERY : "referenced by"

    ORDER {
        string ref "LR-… server-generated, shown to the customer"
        string refCode "TC-… layout ref when the order came from a fit check"
        string paymentMethod "pod | prepay"
        int  totalNaira "server-computed, frozen at creation"
        string paymentStatus "unpaid|pending|paid|partial|failed|expired|refunded"
        string confirmationStatus "unconfirmed|confirmed|cancelled|expired"
        string fulfillmentStatus "not_ready|ready|dispatched|delivered|returned"
        string flag "null | AMOUNT_MISMATCH | SURPLUS | UNREACHABLE"
        datetime createdAt
    }
    PAYMENT_ATTEMPT {
        string reference "unique; Paystack-legal chars only"
        int  amountKobo "totalNaira * 100"
        string status "unpaid|pending|paid|partial|failed|expired|refunded"
        string channel "card|bank|ussd|qr|eft|mobile_money|bank_transfer|null"
        datetime paidAt
        string failureReason
        int  attemptNo
    }
    WEBHOOK_DELIVERY {
        string eventSignature "x-paystack-signature — UNIQUE, the dedup key"
        string eventName "charge.success | refund.processed | …"
        string orderReference
        string outcome "processed | duplicate | dead_letter | rejected_signature"
        datetime processedAt
    }
```

### Why three status columns and not the existing one

`prisma/schema.prisma:72` declares `status String @default("pending")`, and the architecture plan §3
lists `status` without a vocabulary. A single string cannot represent:

- prepaid, customer confirmed the WhatsApp button → `paid` **and** `confirmed`
- pay-on-delivery, confirmed, rider dispatched, cash not yet collected → `to_be_collected` **and**
  `dispatched`
- paid, then refunded → `refunded`, while the original `paid` remains in history

The audit in `00-RELEASE-READINESS-AUDIT.md` §9 assigns the model reconciliation to
`commerce-backend`. This spec supplies the vocabulary and the write permissions below, and asks
`commerce-backend` to carry it.

### Transition table — the only actor permitted to set each value

| From | To | Permitted writer | Never permitted |
|---|---|---|---|
| — | `paymentStatus = unpaid` | checkout Server Action at order creation | anything else |
| `unpaid` | `pending` | initialize success path | webhook |
| `pending` | `paid` | verifier, **only after** `status === "success"` **and** `amount === amountKobo` | a client, a browser value, a `metadata` field |
| `pending` | `partial` | verifier, when `amount < amountKobo` (bank transfer short) | automatic dispatch |
| `pending` | `failed` | verifier, when Paystack reports a terminal non-success status | a network timeout (that is `pending`) |
| `pending` | `expired` | the expiry sweep, after the attempt window | anything earlier |
| `unpaid` | `expired` | the expiry sweep | — |
| `paid` | `refunded` | **owner only**, via the refund route | any webhook |
| — | `confirmationStatus = unconfirmed` | order creation | — |
| `unconfirmed` | `confirmed` | WhatsApp webhook Confirm button, ref **and** sender number both matched | a payment webhook |
| `unconfirmed` | `cancelled` | WhatsApp webhook Cancel button, or the owner | — |
| `confirmed` | `cancelled` | owner only | the customer, after dispatch |
| `cancelled` | anything | **nothing** — terminal | everything |
| `paid` | anything unpaid | **nothing** — terminal in that direction | everything |
| any | `flag = AMOUNT_MISMATCH \| SURPLUS` | verifier | — |

Every accepted change writes an `OrderStatusEvent` row with `from`, `to`, `actor`, `reason`,
`at`. Refusals are logged too — a refused transition is the interesting one during a dispute.

### Reference format

Paystack documents `reference` as *"Unique transaction reference. Only `-`, `.`, `=` and alphanumeric
characters allowed."* The order ref is therefore built from the same alphabet:

```
order ref      LR-7K3QD2M4            (customer-visible; supersedes the browser's Date.now() form)
payment ref    LR-7K3QD2M4-1         (attempt 1; -2, -3 on retry)
```

The payment ref is deterministic in the order and the attempt number, so a retried request cannot
mint a second charge. It is still unique-constrained, because "deterministic" is a courtesy and a
constraint is a guarantee.

---

## Error Handling

| Failure | What the customer sees | What is recorded | Owner action |
|---|---|---|---|
| Unknown product slug or brand | "We couldn't price one of the items. Please start again." | rejection with the offending slug; **no amounts echoed** | none — a bug |
| Paystack initialize rejected | "We couldn't start the payment. Your order is saved — try again or pay on delivery." | attempt `unpaid`, reason stored | none if transient |
| Verify reports `failed` | "That payment didn't go through. You weren't charged. Try again." | attempt `failed`, `gateway_response` verbatim | none |
| Verify reports `abandoned` | Same as above, plus the order stays open | attempt `abandoned` → `failed` | expiry sweep clears it |
| Verify times out / Paystack unreachable | "We're still checking with our payment provider." | attempt `pending`, **never `failed`** | retry the verifier; never guess |
| `status === "success"` but amount is short | "We've received part of your payment. WhatsApp is on it." | `partial`, balance recorded, `flag = AMOUNT_MISMATCH` | collect the balance or cancel |
| `status === "success"` but amount is over | Paid, with a note | `paid`, `flag = SURPLUS` | decide refund vs keep |
| Webhook signature mismatch | HTTP 401, nothing processed | nothing | check the secret key; treat as an attack signal |
| Webhook for an unknown reference | HTTP 200 | dead-letter row | reconcile by hand |
| Duplicate webhook | HTTP 200 | marked `duplicate` | none |
| Paystack outage during verify | Pending | attempt `pending` | retry; the webhook path still exists |
| Owner forgets to configure the webhook URL | Pending page says "waiting for Paystack's confirmation" and "check again" | attempt `pending`, `flag = WEBHOOK_UNVERIFIED` at boot if the URL is unset | configure the URL |

The distinction that matters most: **`failed` means Paystack said no. `pending` means we could not
find out.** Collapsing them is how a customer who paid ends up in the cancellation bucket.

### Secrets and what must never reach the browser

| Value | Where it may live | Why |
|---|---|---|
| `PAYSTACK_SECRET_KEY` (`sk_live_`/`sk_test_`) | server only, `src/lib/paystack.ts` | Bearer credential. Next.js loads non-`NEXT_PUBLIC_` variables only in the Node environment and **inlines `NEXT_PUBLIC_` ones into the client bundle at build time** — `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, *Bundling Environment Variables for the Browser*. A secret key must therefore never carry that prefix, and the `server-only` guard makes a mistake a build failure. |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | optional, only if Inline is ever added (P2) | A public key is designed to be public; with the redirect flow it is not needed at all. |
| `access_code`, `authorization`, `data.customer` | server only | Returned by initialize/verify; usable to make further charges. |
| The raw webhook body | server only, stored as the dedup signature, never echoed | Contains the customer's Paystack email. |
| The reference and the amount | client-safe | The reference is needed in the browser to poll. It is a **bearer token**: `/checkout/callback` must not render another order's contents for a guessed reference (Requirement 4.8). |

The redirect decision pays for itself here: with no public key in the client bundle and no
`access_code` shipped to the browser, there is no payment secret of any kind in the JavaScript.

---

## Testing Strategy

No test framework exists — `package.json` has no test script, no runner, and `_CONTEXT.md` §1 records
no CI and no git repository. `commerce-backend` should stand one up; until then these are manual,
recorded rehearsals.

**Test-mode plan.** The architecture plan §8 asks the owner for "a Paystack test API key when we get
to Phase 3". Test mode is **one env switch**: set `PAYSTACK_SECRET_KEY=sk_test_…`. No code branches on
a flag, because the key itself carries the mode. `npm run build` must succeed with the keys absent
(Requirement 11.5) — the feature reports "not configured" and the transfer option shows the honest
copy.

**Test and live register separate webhook URLs**, so the same handler is pointed at twice. It must
never assume the key it verifies with is the one the Dashboard is showing.

**Test credentials** (staff-only, never rendered to a customer — [Test payments](https://paystack.com/docs/payments/test-payments/)):

| Purpose | Card |
|---|---|
| Succeeds | `4084 0840 8408 4081` (CVV 408) · `5078 5078 5078 5078 12` (CVV 081, PIN 1111) · `5060 6666 6666 6666 666` (CVV 123, PIN 1234, OTP 123456) |
| Fails | `4084 0800 0000 5408` (CVV 001) · `5078 5078 5078 5078 53` (CVV 082, PIN 0000) |
| Succeeds but the refund outcome differs | `4084 0800 0067 1803` (CVV 180) · `4084 0800 0067 1902` (CVV 190) |
| Returns an API error | `4084 0800 0067 0037` (CVV 787) |

Bank-transfer test credentials could not be extracted from the page — the section renders behind
linked elements. Get them from the Dashboard before rehearsing the bank channel.

**The rehearsal that proves the whole thing**, in order:

1. `npm run build` completes. Nothing else matters until it does.
2. Create an order in test mode. Confirm `amount` sent to Paystack equals `totalNaira * 100` — check
   the value in the initialize request, not in the UI.
3. **First webhook of any kind: prove signature verification works before trusting it.** Deliver one
   genuine test-mode delivery, compare the recomputed HMAC against the header, and if it does not
   match, log both candidates. This is Open Question 1 and it is the one step that cannot be skipped
   or deferred — a webhook handler that has never seen a real Paystack signature is not a webhook
   handler.
4. Tamper test: call the action directly with a client-supplied `total: 1`. The created order must
   still carry the server-computed total. This is the single most important business test.
5. Pay with Paystack's test card. The status page must reach `paid` and the order must show the
   amount actually taken.
6. Pay with a failing test card. Confirm the order reaches `failed`, that the customer is told no
   money was taken, and that `gateway_response_code` was recorded — `approved` is the only success
   value, so a recorded non-`approved` code is what makes a support conversation possible.
7. Start a payment and abandon it. Close the tab. The order must remain `pending`, recoverable by
   reference, and must not appear as failed.
8. Deliver a webhook twice with a valid signature. The second must be recorded as `duplicate` and
   must not change state. This is Paystack's own warning answered: *"make sure your integration can
   safely handle repeated events."*
9. Deliver a webhook with a corrupted signature. Expect 401 and no state change.
10. Deliver a `charge.success` webhook whose payload claims a different amount than the stored total.
    Expect no `paid`; expect `flag = AMOUNT_MISMATCH`. Paystack's own instruction is *"If the amount
    doesn't match, do not deliver value to the customer."*
11. Place a `pod` order. Confirm no Paystack request of any kind was made.
12. Issue a refund on the refund-behaviour card. Confirm the order is not marked refunded until the
    `refund.processed` event arrives, and that a `refund.failed` leaves the paid state visible.

---

## Open Questions

Each of these is a real unknown, not a rhetorical question.

1. **Is the signature computed over the raw body, or over a re-serialisation? — verify this first,
   before writing the handler.** Paystack describes `x-paystack-signature` as *"a HMAC SHA512 signature
   of the event payload signed using your secret key"*, but the Node sample shipped on that same page
   computes `crypto.createHmac('sha512', secret).update(JSON.stringify(req.body))` — a
   **re-serialisation of the already-parsed body**, not the raw bytes. Those differ whenever key order
   or whitespace differs, and the PHP/Java/C# tabs could not be read to arbitrate. This spec mandates
   `await request.text()` and signing those exact bytes, because that is what the ecosystem does and
   it is the only scheme that cannot break on a parser round-trip. But it is a **live ambiguity inside
   Paystack's own documentation**, so the very first real webhook must be checked: sign the raw body,
   compare, and if it does not match, log both candidates before changing anything. Do not ship a
   handler whose verification has never run against a genuine Paystack delivery.
2. **`charge.failed` does not exist — now confirmed by Paystack directly.** *"we currently send
   webhook events for just successful transactions."* The published event surface has no failure
   event; failures arrive only through `data.status` from verify. Design consequence is settled:
   never build a `charge.failed` handler, and never let the absence of a webhook explain an unpaid
   order.
3. **Exact retry schedule, now with live figures.** Live mode: every 3 minutes for 4 attempts, then
   hourly for up to 72 hours. **Test mode: hourly for 10 hours, with a 30-second timeout** — note this
   differs from live and is shorter than the 72-hour window. Anything other than `200 OK` is a failed
   delivery. Treat it as the reason to ack fast and dedupe hard.
4. **Are the IP addresses `52.31.139.75`, `52.49.173.169`, `52.214.14.220` still current and
   complete?** Offered as an *optional* allowlist — "You may additionally IP-allowlist" — which is a
   weaker guarantee than signature verification. Prefer the signature; do not build a hard IP filter.
5. **Test and live have separate webhook URLs.** Confirmed: *"Ensure your webhook URL is publicly
   available"* is configured per mode in the Dashboard. So there are two registered URLs pointing at
   **one handler** — the handler must behave identically for both and must never assume the key it is
   verifying with is the same one the dashboard shows. This is now a requirement, not a footnote.
6. **Is the base URL the same for test and live?** The OpenAPI contract gives a single server
   `https://api.paystack.co` and routes by key. This spec assumes one URL and two keys. Confirm in the
   dashboard; if it differs, the switch is one constant.
7. ~~**What is Paystack's Nigerian fee?**~~ **Resolved:** *"1.5% + NGN 100"* on all local channels,
   **capped at NGN 2,000**, with the NGN 100 waived below NGN 2,500. International via Mastercard /
   Visa / Verve is 3.9% + NGN 100. `data.fees` is returned on the transaction so the app can read the
   real figure rather than compute it. On a ₦82,000 order that is roughly ₦1,330 — material enough
   that the ₦2,000 prepay discount is nearly consumed by the fee, which is worth revisiting before
   the discount goes live. **This is a business question, not an engineering one** — flagged here
   because the number changes what the discount is worth.
8. **Which channels are actually available for NGN?** `card`, `bank` and `ussd` are Nigeria-supported
   and this spec requests exactly those. Two corrections worth knowing before anyone copies the full
   enum: **`mobile_money` is Ghana/Kenya only** and **`eft` is South Africa only**, so including them
   for NGN is meaningless. `bank_transfer` *"requires merchants to reach out to support@paystack.com
   to enable it"*, and `qr` is available in Nigeria via Visa. If `bank_transfer` is wanted — and it is
   the natural companion to the current manual transfer — it needs a support request first.
9. **What is the `channels` default?** *"If you use the Popup or Redirect method, the paying customer
   will be shown all the payment methods selected on your dashboard."* The per-request `channels`
   array overrides that. So the dashboard and the request must be kept in agreement or the customer
   sees something other than what the code asks for.
10. **Does the owner need Paystack business verification before a live key, and how long does it
    take?** An external, multi-day dependency that gates every P1 task. The Dashboard's Live Mode
    toggle is unavailable until the account is activated. Nothing in the repository answers it.
11. **Paystack Inline: still supported, and is it good for this buyer?** Both generations remain
    documented — V1 `PaystackPop.setup()` from `https://js.paystack.co/v1/inline.js`, and V2
    `new Paystack()` from `/v2/inline.js` or the `@paystack/inline-js` package, which can
    `resumeTransaction(accessCode)` to complete a server-initialized transaction without a redirect.
    **Neither is described as mobile-first**; InlineJS is documented as being for *"web
    applications"*, and Paystack's own mobile answer is the native SDKs or a dedicated Mobile WebView
    guide. Decision 1 stands and is now better sourced. The V1→V2 migration guide exists, so if
    Inline is ever adopted, start on V2 — and note `access_code` is documented primarily as the
    native-SDK hand-off, so it stays server-side.
12. **Is there still a "Test API" webhook simulator in the Dashboard?** No official page could be found
    describing one. The current guidance covers setting the webhook URL and a Developers → Webhooks
    page with delivery history and a **Retry** button. Budget on configuring a real test-mode webhook
    rather than assuming a simulator.
13. **`callback_url` behaviour when the customer closes the browser entirely.** If the return never
    happens, the webhook is the only path. That is why the webhook cannot be optional — but the
    owner's hosting choice determines whether a "never returns" customer is caught in minutes or hours.
14. **Refunds to bank-transfer (manual) prepay.** The spec treats manual transfer as "no processor at
    all", so a refund is a human bank transfer plus an order record. If the manual path is retired in
    favour of Paystack, an open manual order could end up with money moved outside the system. Note
    also that a Paystack refund is asynchronous: *"When a refund is marked as processed, it may still
    take up to 10 business days for customers to receive their funds"*, and a **failed** refund
    leaves the underlying transaction in `success` — the customer still has the money, which is exactly
    why Requirement 9.4 keeps the paid state visible.
15. **`/order/[id]` versus `/order/confirmation`.** The architecture plan §4 specifies `/order/[id]` and
    §4 also says that page "is also what triggers the WhatsApp send server-side", while the built app
    has `/order/confirmation` reading `localStorage`. Two routes cannot both own the post-checkout
    view. `commerce-backend` and `cart-checkout` should settle it; this spec assumes
    `/checkout/callback` for payment and leaves the rest alone.

### References

`paystack.com/docs` returns HTTP 403 to automated requests from this environment. Facts were
therefore verified from two routes: pages that render without it
([Verify payments](https://paystack.com/docs/payments/verify-payments/),
[Test payments](https://paystack.com/docs/payments/test-payments/),
[Accept payments](https://paystack.com/docs/payments/accept-payments/), and the
[support articles](https://support.paystack.com/en/articles/2130306)), and machine-readable
contracts — Paystack's own [OpenAPI repo](https://github.com/PaystackHQ/openapi) and the
[api-evangelist contract](https://github.com/api-evangelist/paystack/blob/main/apis.yml). Treat both
contract mirrors as secondary and re-check against the Dashboard before go-live.

- [Verify payments](https://paystack.com/docs/payments/verify-payments/) — all eight `data.status`
  values, the `status`-is-not-`data.status` warning, the returned `reference` and `metadata`, and the
  explicit statement that webhooks cover successful transactions only.
- [Accept payments](https://paystack.com/docs/payments/accept-payments/) — initialize/verify flow,
  *"Email and amount are required"*, the documented workaround *"if you only collect phone numbers
  from your customers, you can create email addresses like `080300000@mybusiness.com`"*, the
  channels array, and *"If the amount doesn't match, do not deliver value to the customer."*
- [Webhooks](https://paystack.com/docs/payments/webhooks/) — the event list, the
  `x-paystack-signature` description, retry schedules, and the optional IP allowlist.
- [Test payments](https://paystack.com/docs/payments/test-payments/) — the successful, failed,
  refund-behaviour and API-error test cards used in § Testing Strategy.
- [Transactions pricing](https://support.paystack.com/en/articles/2130306) — `1.5% + NGN 100` local,
  capped at NGN 2,000, the sub-NGN 2,500 waiver.
- [Payment channels](https://paystack.com/docs/payments/payment-channels/) — which channels are
  available in Nigeria, the USSD bank codes, and the dashboard-controls-the-default rule.
- [Refunds](https://paystack.com/docs/payments/refunds/) — `POST /refund`, the four `refund.*` events,
  the status mapping, and the 10-business-day customer-side delay.
- [Gateway responses](https://paystack.com/docs/payments/gateway-responses/) —
  `gateway_response_code`, where `approved` is the only success value.
- [Authentication](https://paystack.com/docs/api/authentication/) — bearer secret key.
- [InlineJS](https://paystack.com/docs/developer-tools/inlinejs/) and the
  [V1→V2 migration guide](https://paystack.com/docs/guides/migrating-from-inlinejs-v1-to-v2/).
- [PaystackHQ/openapi — transaction Initialize schema](https://github.com/PaystackHQ/openapi/blob/main/main/schemas/transaction/Initialize.yaml)
  — required `email`/`amount`, the kobo rule, the reference character restriction, the channels enum.
- [api-evangelist webhooks AsyncAPI](https://github.com/api-evangelist/paystack/blob/main/asyncapi/paystack-webhooks-asyncapi.yml)
  and [transaction JSON schema](https://github.com/api-evangelist/paystack/blob/main/json-schema/paystack-transaction-schema.json)
  — event inventory, signature header shape, and the `status`/`channel` enums.
- Next.js 16 guides read in this session:
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (route handlers are not
  cached by default; `route.ts` cannot sit beside `page.tsx`),
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (the *Webhooks*
  section — `await request.text()` on the raw body; request body helpers),
  `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (Security — the Origin/Host CSRF
  check; "treat every action as an untrusted entry point"),
  `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` (*Bundling Environment
  Variables for the Browser* — `NEXT_PUBLIC_` is inlined at build time),
  `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` (the
  `import 'server-only'` guard).