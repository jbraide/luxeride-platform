# Requirements Document

## Introduction

LuxeRide's owner wants to run paid ads now. The storefront cannot currently take that traffic
in a way that is honest, and cannot measure a single thing that happens on it.

**What exists today, verified by reading the code in this session:**

- There is **no analytics, no Meta Pixel, no GA4, no tag manager, no consent handling and no UTM
  capture of any kind.** A regular-expression sweep of the whole of `luxeride-web/src/` for
  `gtag|googletagmanager|fbq|facebook|analytics|pixel|consent|cookie|utm_|fbclid|gclid|next/script|Script`
  returned **no matches**.
- `src/app/page.tsx` is a Server Component that reads **no** search parameters at all. It renders a
  fixed hero — *"Custom-Fit Car Accessories for Your Exact Car"* — for every visitor.
- `src/app/fit-finder/page.tsx` reads `searchParams.product` and passes it to
  `<FitFinder lockedProductSlug={product} />`. `FitFinder` resolves it with `getProductBySlug`
  (`src/components/FitFinder.tsx:22`). If the slug is unknown, `lockedProduct` is `undefined` and the
  funnel simply runs **unlocked with no message to anyone**. `/fit-finder` renders **no landing hero
  at all**, so there is nowhere on it to put campaign copy.
- The prototype (`luxeride-funnel (2).html:670-691`, `724-731`) had `CONFIG.PRODUCT_LANDING` with
  aliases `mats`, `single-layer`, `seat-covers`, `bundle`, each carrying `{ product, headline, sub }`.
  `applyProductLanding()` locked the product **and** rewrote `#landingHeadline` and `#landingSub`.
  That capability is gone. An old ad URL `?product=mats` today silently renders the generic
  unlocked funnel — a paid click that buys nothing.
- `src/app/order/confirmation/page.tsx:9` reads `lastOrder` from the `localStorage`-persisted Zustand
  store (`src/store/order.ts`, key `luxeride-last-order`). Line 11 renders **"No recent order found"**
  when it is absent. A customer who clears site data, opens the site on another device, or returns to
  the confirmation URL later is told their order does not exist.
- `src/app/checkout/page.tsx:62` mints `LR-${Date.now().toString(36).toUpperCase()}` client-side, and
  `buildOrderMessage` in `src/lib/whatsapp.ts:35` **does not include it**. Nothing in the WhatsApp
  thread identifies the order.
- `src/components/Footer.tsx` is ten lines, two paragraphs, **zero links**. There is no privacy
  policy, no terms, no contact page and no consent notice anywhere in the app.

**Why this blocks spending.** An ad click must land on a page that says what the ad said, must be
measurable end to end, and must leave behind a reference the owner can tie to a naira. Today a click
lands on a generic hero, is invisible to every platform, and leaves a message thread with no order
identifier in it.

**What breaks without this spec.** The owner spends, gets clicks, and cannot answer the only three
questions that matter: did the ad work, which ad worked, and which sale came from which ad.

---

## Requirements

### Requirement 1 — Campaign landing variants

**User Story:** As the owner buying Instagram clicks for a specific product, I want the page a
customer lands on to say what the ad said and to pre-lock what the ad is selling, so that I am not
paying for clicks that land on a generic hero.

The validated prototype already solved this (`luxeride-funnel (2).html:670-691`). The
`fit-finder` spec owns it for `/fit-finder` (`fit-finder` 8.1–8.8). **This requirement adds the home
page, which today ignores `?product=` entirely**, and adds the offer badge.

#### Acceptance Criteria

1.1 WHEN a request reaches `/` with `?product=<value>` THEN THE SYSTEM SHALL resolve `<value>` through
the single campaign resolver and, if it resolves to a campaign or a product, SHALL replace the home
hero's headline, sub-headline and offer badge with that variant's copy.

1.2 WHEN a resolved variant defines a product THEN THE SYSTEM SHALL point the home page's primary CTA
at `/fit-finder?product=<value>` so that the funnel's product step is skipped, exactly as
`applyProductLanding()` did in the prototype.

1.3 THE resolver SHALL try the campaign registry **before** `getProductBySlug()`, so that where a
string is both a campaign alias and a product slug (`seat-covers` is both) the campaign copy wins and
the product lock is unchanged.

1.4 THE resolver SHALL accept the four aliases the prototype used — `mats`, `single-layer`,
`seat-covers`, `bundle` — mapped to `double-layer-mats`, `single-layer-mats`, `seat-covers` and
`full-bundle` respectively, so ad links built against the validated funnel keep working
(`fit-finder` 8.7).

1.5 WHEN a campaign is added or edited THEN THE SYSTEM SHALL require a TypeScript data module and
SHALL NOT require a database, a CMS, an admin screen, a route handler or a network call. The site's
entire data layer is static TypeScript today (`src/data/products.ts`, `src/data/cars.ts`,
`src/data/locations.ts`) and P0 must not change that.

1.6 IF a campaign declares an offer or a price THEN THE SYSTEM SHALL permit only an offer the
checkout already honours — prepay saves ₦2,000 and delivery is free (`src/app/checkout/page.tsx:26-28`)
— and SHALL NOT permit a campaign-declared figure the funnel or the WhatsApp quote would contradict.
Locked decision 3 of the fitment spec requires a site price the engine can honour.

1.7 WHILE a variant is resolved THEN THE SYSTEM SHALL leave the address bar untouched. The query
string is the campaign's lifetime; rewriting it would fight `fit-finder` 8.5.

1.8 WHEN a variant is resolved THEN THE SYSTEM SHALL pass the resolved campaign key, product slug,
headline and sub-copy to the tracking layer through the same resolver, so the pixel can report which
landing variant was served (`fit-finder` 8.6).

1.9 WHEN no variant is resolved THEN THE SYSTEM SHALL render exactly the copy that ships today, with
no layout shift and no empty campaign slot.

---

### Requirement 2 — Unknown and malformed campaign values

**User Story:** As the owner, I want a bad ad URL to tell me the ad URL is wrong, so that I find
and fix the broken link before I spend a week on it.

Today an unknown `?product=` value **silently does nothing** (`src/components/FitFinder.tsx:22`).
This requirement decides what happens instead.

#### Acceptance Criteria

2.1 IF `?product=` carries a value that resolves to neither a campaign alias nor a product slug THEN
THE SYSTEM SHALL **gracefully default**: on `/`, the default hero; on `/fit-finder`, the unlocked
funnel with its default landing hero. It SHALL NOT return a 404 and SHALL NOT redirect to `/shop`.

2.2 WHEN an unknown value is encountered THEN THE SYSTEM SHALL emit a `campaign_landing_fallback`
event carrying the offending value, the parameter name and the path, so the owner can see the broken
ad URL in Events Manager rather than discovering it as a wasted budget line.

2.3 IF a campaign entry names a product slug that no longer exists in `PRODUCTS` THEN THE SYSTEM
SHALL treat the whole entry as unresolved — default hero **and** fallback event — rather than
rendering a headline for a product the funnel cannot sell.

2.4 WHEN `?product=` holds a valid product slug on `/fit-finder` THEN THE SYSTEM SHALL preserve
today's behaviour exactly: `lockedProduct` is set, the product step is omitted, and the progress
step list is computed from it.

2.5 IF the query string is absent, empty or malformed THEN THE SYSTEM SHALL behave exactly as if
`?product=` had never been present.

2.6 WHILE no variant resolves THEN THE SYSTEM SHALL NOT render a locked product, a blank hero, an
error toast, or a funnel whose progress counter disagrees with its steps.

---

### Requirement 3 — Event taxonomy and firing points

**User Story:** As the owner, I want to know where paid traffic dies, so that a traffic problem and a
checkout problem do not look the same.

#### Acceptance Criteria

3.1 THE SYSTEM SHALL define one named event per funnel moment, in a single typed registry, with a
fixed Meta event name and a fixed GA4 event name per entry.

3.2 WHEN any route is first rendered or changed by client-side navigation THEN THE SYSTEM SHALL emit
`PageView` (Meta) and `page_view` (GA4) exactly once for that route.

3.3 WHEN `/products/[slug]` renders THEN THE SYSTEM SHALL emit `ViewContent` (Meta) and `view_item`
(GA4) carrying the product slug, name, and `priceRange(product)` as a range.

3.4 WHEN `handleAddToCart` in `src/components/FitFinder.tsx:84` completes THEN THE SYSTEM SHALL emit
`AddToCart` (Meta) and `add_to_cart` (GA4) carrying the product, brand, model, year, row
configuration, unit price and quantity.

3.5 WHEN the customer activates "Proceed to Checkout" in `src/app/cart/page.tsx` THEN THE SYSTEM
SHALL emit `InitiateCheckout` (Meta) and `begin_checkout` (GA4) with the cart's item count and
subtotal.

3.6 WHEN checkout submission succeeds past phone validation (`src/app/checkout/page.tsx:49`) THEN
THE SYSTEM SHALL emit **`Lead` (Meta) and `generate_lead` (GA4)** — not `Purchase`.

3.7 THE SITE SHALL NOT emit `Purchase` / `purchase` at P0. No money changes hands on this site; the
order completes on WhatsApp and on delivery. A `Purchase` fired at checkout would train Meta's
delivery system toward a signal that does not correspond to a sale.

3.8 THE SYSTEM SHALL emit the following custom events, each at the exact place named:

| Custom event | Fires when | Fires at |
|---|---|---|
| `campaign_landing_viewed` | a variant resolves | `/` and `/fit-finder` |
| `campaign_landing_fallback` | `?product=` does not resolve | `/` and `/fit-finder` |
| `car_search` | the car search query settles (debounced) | `FitFinder.tsx` search input |
| `car_search_no_match` | a non-empty query yields zero cars | `FitFinder.tsx` results memo |
| `fit_refused` | the `comingsoon` step renders | `FitFinder.tsx` `pickCar` / step render |
| `fit_result_rendered` | the `results` step renders | `FitFinder.tsx` `pickRow` / `confirmYear` |
| `live_photo_requested` | "Request Live Photos First" is clicked | `FitFinder.tsx:306` |
| `offer_sent` | "Send My Offer on WhatsApp" is clicked | `FitFinder.tsx:332` |
| `waitlist_phone_submitted` | the coming-soon phone field is non-empty at CTA | `FitFinder.tsx:369` |
| `whatsapp_cta_clicked` | **any** `wa.me` link is activated | every WhatsApp anchor |
| `ref_code_copied` | the order ref is copied on the thank-you page | thank-you page |

3.9 WHEN `fit_result_rendered` fires THEN THE SYSTEM SHALL carry a `state` parameter whose value is
one of `FITTED`, `NOT STOCKED`, `UNKNOWN` — the three states of the fitment spec's `/fit-check`
contract (`fitment-engine` 8). The value is `FITTED` on every render today, because
`FitFinder` routes every unavailable brand or model to `comingsoon` before it can reach `results`.
The enum exists so that the P2 `/fit-check` swap does not change the event name.

3.10 WHEN `whatsapp_cta_clicked` fires THEN THE SYSTEM SHALL carry a `cta_type` parameter with one of
`live_photos`, `offer`, `coming_soon`, `car_not_found`, `checkout_order`. One event with a typed
parameter, rather than five near-identical event names.

3.11 WHEN an event carries a monetary value THEN THE SYSTEM SHALL carry `currency: "NGN"` and `value`
in whole naira, derived from `src/lib/pricing.ts` — never from a formatted `₦` string.

3.12 THE SYSTEM SHALL NOT place a customer's name, phone number, delivery address or free-text car
search query in any event payload. The coming-soon phone field is the acute case: it SHALL NOT be
sent to Meta or Google at P0, and SHALL NOT be sent even hashed until `commerce-backend` exists to
provide a matching secret.

3.13 THE SYSTEM SHALL attach one `event_id` to every event and send **the same** `event_id` to every
provider, so that a later server-side send can be de-duplicated against it.

3.14 WHILE no analytics provider is loaded THEN THE SYSTEM SHALL still record every event to a local
in-memory queue, so nothing is lost when a provider's script fails to load
(`cart-checkout` 13.3).

---

### Requirement 4 — Provider integration, configuration and the extension point

**User Story:** As the owner, I want GA4 and Meta Pixel installed correctly the first time, so that I
can prove tracking works before I spend money rather than discovering it was broken afterwards.

#### Acceptance Criteria

4.1 THE SYSTEM SHALL load GA4 through `gtag.js` and the Meta Pixel through its base code, both
injected with `next/script` and both using `strategy="afterInteractive"`.

4.2 THE SYSTEM SHALL mount the script tags from the **root layout**, because every route needs them.

4.3 WHERE a Client Component that calls `useSearchParams` is mounted inside the root layout on a
statically prerendered route (`/` is static, `_CONTEXT.md` §3) THEN THE SYSTEM SHALL wrap it in a
`Suspense` boundary, because a production build fails otherwise.

4.4 THE SYSTEM SHALL omit `PageView` / automatic `page_view` from the base snippets and SHALL emit
them explicitly from the route-change component, because a base code that also fires on document
load would double-count the first page view of every session.

4.5 THE SYSTEM SHALL read every provider ID from a `NEXT_PUBLIC_*` environment variable and SHALL
render **no script tag at all** when the variable is absent, so the code merges and runs with no IDs.

4.6 THE SYSTEM SHALL route every event through one `track()` entry point and one provider registry,
so that adding a provider is one adapter file plus one registry line.

4.7 THE SYSTEM SHALL define a TikTok Pixel adapter as a registered-but-unconfigured provider: the
type, the registry entry and the event mapping SHALL exist and be inert until
`NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set.

4.8 THE SYSTEM SHALL support a debug mode that logs every event and every provider payload to the
browser console without changing production behaviour, so the owner can verify a fire locally before
opening Events Manager.

4.9 IF a provider script fails to load THEN THE SYSTEM SHALL record the failure once, keep the
session alive, and SHALL NOT retry more than once.

---

### Requirement 5 — Attribution capture and persistence

**User Story:** As the owner, I want to know which ad produced a sale, so that I can stop spending on
the ad that did not.

#### Acceptance Criteria

5.1 WHEN a document is first loaded THEN THE SYSTEM SHALL read, from the query string and the
referrer, the parameters `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`,
`fbclid`, `gclid`, the resolved campaign key and the landing path, and SHALL store them.

5.2 **THE SYSTEM SHALL APPLY FIRST-TOUCH.** A record, once written, SHALL NOT be overwritten by a
later visit. Justification: LuxeRide's funnel is a single short session with no email capture and no
nurture sequence, so first-touch and last-touch are nearly always the same visit — which is precisely
why first-touch is the safe default, because it cannot be rewritten by an internal navigation or a
stray `?utm_source=` link later in the session. It also answers the question the owner actually has:
*which ad brought this person in?*

5.3 WHEN `fbclid` is present THEN THE SYSTEM SHALL store it and SHALL NEVER forward it to GA4, TikTok
or any non-Meta provider. WHEN `gclid` is present THE SYSTEM SHALL apply the mirror rule.

5.4 WHEN the attribution record is written THEN THE SYSTEM SHALL store it under one named
`localStorage` key, SHALL NOT store any personal data in it, and SHALL bound its size to the named
fields only.

5.5 IF `localStorage` is unavailable or throws THEN THE SYSTEM SHALL continue without attribution
and SHALL NOT crash or block the page.

5.6 WHEN an order is placed THEN THE SYSTEM SHALL attach the stored attribution record to the order,
so that a reference can be tied to a campaign (`cart-checkout` 13.2).

5.7 THE SYSTEM SHALL NOT read `window` during server rendering; all capture happens in a Client
Component effect.

5.8 WHEN a visitor has no attribution parameters THEN THE SYSTEM SHALL record an explicit
`(not set)` campaign rather than leaving the field undefined, so that organic and direct traffic are
distinguishable from broken tracking.

---

### Requirement 6 — The order reference and WhatsApp reconciliation

**User Story:** As the owner, I want every order thread to carry a reference, so that reconciling an
order is a search rather than an archaeology.

`cart-checkout` 2.1–2.3 owns minting and display. **This requirement fixes the format**, because the
fitment spec's layout ref has to nest inside it and the campaign marker has to ride on the same line.

#### Acceptance Criteria

6.1 THE order reference format SHALL be `LR-` followed by **8 uppercase hexadecimal characters**
derived from `crypto.randomUUID()` — for example `LR-A3F91C09`. The primitive is already in use in
`src/store/cart.ts:34-37`.

6.2 THE reference SHALL NOT be derived from the wall clock and SHALL NOT be sequential, satisfying
`cart-checkout` 2.1. The order's date is already carried separately by
`PlacedOrder.placedAt` (`src/store/order.ts:20`).

6.3 WHEN a reference is minted THEN THE SYSTEM SHALL check it against the retained order history and
re-roll up to three times on a collision.

6.4 WHEN the WhatsApp order message is built THEN THE SYSTEM SHALL include the reference, the
resolved campaign key when one exists, and the fitment layout code when one exists — on **one line**,
in this shape:

```
🔖 Ref LR-A3F91C09 · via mats
🔖 Ref LR-A3F91C09 · fit TC-2009-2013 · via mats
```

6.5 THE campaign marker SHALL be the short campaign key from the registry, never a raw `fbclid` or a
full `utm_source=…&utm_medium=…` string. The owner is reading this on a phone in a delivery van; 22
characters is the budget.

6.6 THE fitment layout code SHALL be a **separate field** from the order reference, never concatenated
into it. `TC-2009-2013` is the layout's internal code (`fitment-engine` 2); `LR-A3F91C09` is the
order's. Collapsing them would make one unsearchable string.

6.7 THE fitment code SHALL be `null` today and SHALL be populated when `fitment-engine` lands. Its
absence SHALL NOT produce a dangling separator in the message.

6.8 WHEN checkout submits THEN THE SYSTEM SHALL mint the reference, build the message containing it,
write the order, and emit `Lead`, all **before** `window.open`, and none of it shall `await`, because
`window.open` must stay inside the user-gesture call stack or the browser blocks it.

---

### Requirement 7 — A thank-you page that survives storage loss

**User Story:** As a customer who just paid for an ad click and ordered, I want the page I land on
afterwards to work, so that I am not told my order does not exist.

#### Acceptance Criteria

7.1 WHEN checkout submits THEN THE SYSTEM SHALL navigate to a confirmation route whose URL carries the
**order reference only** — never the name, phone or address.

7.2 THE SYSTEM SHALL NOT place personal data in any query string on any route, because both GA4 and
the Meta Pixel read the full page URL including its query, and because URLs leak into browser
history and server logs.

7.3 THE SYSTEM SHALL retain more than one order, keyed by reference, so that a second order does not
erase the first.

7.4 IF the reference is present in the URL but no matching order is stored THEN THE SYSTEM SHALL
render a **recovery screen addressed to that reference** — the order is held in WhatsApp, here is the
reference, here is a WhatsApp action that quotes the reference — and SHALL NOT render the current
"No recent order found" string at `src/app/order/confirmation/page.tsx:14` or the success tick at
line 27. `cart-checkout` 6.2/6.4/6.5 own that screen; this requirement states the measurement
consequence of the same state.

7.5 IF no reference is present and no order is stored THEN THE SYSTEM SHALL offer start a new order,
contact on WhatsApp, and look up a reference, and SHALL NOT imply an order was lost
(`cart-checkout` 6.3).

7.6 THE WhatsApp message produced by the recovery screen SHALL include the reference **and** the
campaign key, because at that point `localStorage` is gone and the thread is the only remaining
durable copy.

7.7 WHEN the confirmation page renders THEN THE SYSTEM SHALL emit `Lead` **at most once per reference**,
so that a refresh does not inflate the owner's conversion count against his ad spend.

---

### Requirement 8 — Ads compliance and the trust floor

**User Story:** As the owner whose ad account is the business, I want the site to survive ad review
and to answer a buyer who wants to know who they are paying, so that a rejection or a complaint does
not cost me the spend.

`trust-and-policies` owns the policy copy, the footer grid and the trust floor. **This requirement
owns only what ad review and measurement add**, and adds no text `trust-and-policies` has not
already specified.

#### Acceptance Criteria

8.1 WHEN an ad is reviewed THEN `/privacy` and `/contact` SHALL be reachable from the landing page
in one tap without scrolling and without JavaScript, satisfying `trust-and-policies` 12.1 gates 2 and
5 and 7.7.

8.2 `/privacy` SHALL disclose, in plain language, that marketing and analytics tags (Meta Pixel and
Google Analytics) are used, what campaign parameters are read from the URL, and that a customer's name,
phone and delivery address are **not** transmitted to those platforms.

8.3 THE SYSTEM SHALL NOT transmit a customer's name, phone, address or free-text query to Meta or
Google. Meta's Conversions API documentation restricts the customer information parameters to
hashed values; at P0 the site sends none at all, which is the simplest way to be certain.

8.4 THE SYSTEM SHALL NOT copy personal attributes into ad copy or targeting (for example "moving
soon", "just bought a car"), which Meta's advertising standards forbid.

8.5 IF a visitor arrives from an ad THEN THE landing page copy SHALL be consistent with the ad that
sent them. A mismatch is an ad-review rejection, not merely a conversion loss.

8.6 THE SYSTEM SHALL load the analytics tags without a modal gate at P0 and SHALL display a
single-line, dismissible disclosure on ad landing pages that links to `/privacy`. This is a deliberate
trade-off, stated in the design, and is P0 because a blocking banner on a slow Nigerian mobile
connection costs more conversions than it protects.

8.7 THE SITE SHALL NOT present a cookie-consent mechanism that claims to be legally sufficient when
it is not one; a full consent-management platform is P2 and this requirement is P0.

8.8 BEFORE the first paid click THEN the owner SHALL have confirmed their position on data-controller
registration with the NDPC. Nigeria's data protection framework registers "Data Controllers of Major
Importance", a category that includes e-commerce, so an online retailer is in scope on sector grounds
rather than only on volume grounds. **This is an owner/legal question, not a build task** — see the
design's Open Questions.

---

### Requirement 9 — Pre-spend verification and launch metrics

**User Story:** As the owner about to spend money I do not have much of, I want a short ordered
checklist of what must be true first, so that I do not learn what was broken from my bank balance.

#### Acceptance Criteria

9.1 THE SPEC SHALL ship a checklist ordered so that each item is verifiable by the owner alone, with
no engineer, before the first naira is spent.

9.2 THE CHECKLIST SHALL open with the build gate, because `npm run build` **currently fails** on
`prisma/seed.ts(2,34)` and no successful production build has ever been produced
(`.next/BUILD_ID` is absent, `_CONTEXT.md` §3). A site that cannot be deployed cannot receive paid
traffic.

9.3 THE CHECKLIST SHALL require the owner to **write down the Confirmed layout count on the day they
go live**, as the launch metric mandated by the fitment spec's locked decision 2 consequence
(`fitment-engine` 15).

9.4 THE CHECKLIST SHALL require the owner to choose, explicitly and before spending, between
acquisition targeting (cars already Confirmed) and demand mapping (broad Lagos car owners, mostly
refused). This is the fitment spec's open demand-logging decision and it changes what a "good"
conversion rate looks like.

9.5 THE CHECKLIST SHALL require live proof of tracking — Meta Events Manager Test Events and GA4
DebugView — rather than the owner's assurance that the code is in place.

9.6 THE CHECKLIST SHALL separate P0 from nice-to-have explicitly, so that a P1 item is never mistaken
for a blocker and a P0 item is never skipped.