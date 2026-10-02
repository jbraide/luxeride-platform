# Requirements Document — Trust & Policies

## Introduction

The entire trust surface of LuxeRide today is two lines of text: one paragraph in
`src/components/Footer.tsx:5-6` and one badge repeated verbatim on the product page
(`src/app/products/[slug]/page.tsx:44`), the fit result (`src/components/FitFinder.tsx:280`) and the
cart's neighbour screens. That badge — *"🛡️ 100% Perfect Fit Guarantee — doesn't fit? We swap it
free."* — is the single most load-bearing sentence the business owns, and it is currently
**unbacked by any policy that defines it**. There is no privacy policy, no terms of sale, no delivery
policy, no returns or exchange policy, no warranty statement, no contact page, no FAQ, no about page,
no sitemap, no social link of any kind. `Footer.tsx` contains **zero** `<Link>` elements — a customer
who wants to know anything cannot get anywhere from the footer.

Meanwhile the checkout (`src/app/checkout/page.tsx:90-123`) collects a **full name, a phone number
and a home delivery address** and posts them into a WhatsApp conversation with no consent control and
no disclosure of what happens to them. `cart-checkout` Requirement 10 already requires that consent
control and its 10.4 forbids the checkbox linking to a page that does not exist — so the absence of
`/privacy` is not just a gap, it is actively blocking a sibling spec.

This is the spec that pays for paid traffic. Two facts make it urgent rather than nice:

1. **The buyer is a phone-first Nigerian customer who has already been scammed.** "Custom-fitted
   accessories that don't fit" is the exact scam shape. The site answers that objection today with one
   emoji sentence and no recourse.
2. **Delivery and guarantee trust has no home above the fold.** Delivery zone is chosen for the
   first time *at checkout* (`checkout/page.tsx:126-138`), after the cart has already told the
   customer "Delivery fee is calculated at checkout, based on your zone"
   (`src/app/cart/page.tsx:73`) — a promise without a number, on the screen where the doubt is
   highest.

It also carries an obligation that cuts the other way. LuxeRide's brand *is* the refusal: "if we
don't have your model, we say no" (fitment-engine Requirement 10). A brand whose entire integrity
claim is "we will not lie to you about fitment" cannot ship an invented testimonial, an invented
review count or an invented stock number. **Requirement 1 below makes that prohibition explicit and
testable**, because it is the one thing in this spec that, if got wrong, destroys more value than the
absence of any page at all.

Nothing here duplicates `fit-finder` (funnel states, demand capture), `fitment-engine` (the demand
log, the Confirmed gate) or `cart-checkout` (the consent control, the order handoff). This spec owns
the **prose, the pages, and the placement**.

---

## Requirements

### Requirement 1 — Nothing on the site claims what the business cannot evidence

**User Story:** As the owner, I want every trust claim on my site backed by something I can point at,
so that the refusal-based brand claim survives contact with paid traffic.

#### Acceptance Criteria

1.1 THE SYSTEM SHALL NOT render a testimonial, customer quote, review, star rating, review count,
"trusted by N customers", order count, sales count, or "X happy drivers" anywhere in the app, unless
that exact item exists as a record produced by a real customer interaction.

1.2 IF the owner supplies testimonials as content THEN THE SYSTEM SHALL display each one with its
provenance — who said it, on what channel, on what date — and SHALL NOT present unattributed or
unverified quotes as if they were site reviews.

1.3 THE SYSTEM SHALL NOT display a stock quantity, "in stock", "low stock", "only N left", a
countdown timer or a scarcity indicator that is not computed from real data. At P0 no stock system
exists, so none of these SHALL render.

1.4 IF a price-lock or urgency claim is displayed — including the prototype's
`PRICE LOCKED FOR 48 HOURS FROM CONFIRMATION` (`luxeride-funnel (2).html:503`) — THEN the claim SHALL
state what is locked, until when, and who honours it. Because `src/app/checkout/page.tsx:26-28`
recomputes `shippingFee`, `discount` and `total` from live data on every render and the final price is
quoted manually in WhatsApp, **no price lock is honourable today and none SHALL ship.**

1.5 IF a count of supported cars or layouts is displayed THEN it SHALL be read from confirmed
fitment data and SHALL be labelled with exactly what it counts (e.g. "car layouts we have physically
fitted"). Until `fitment-engine` supplies confirmed data, no such count SHALL render.

1.6 THE SYSTEM SHALL NOT present brand-owned advertising material as customer evidence. The two
Adobe Audition voiceover projects in `ad-voiceovers/` and the campaign clips in `footage/` are
marketing assets, not reviews, and SHALL NOT appear in any surface labelled as proof, testimonials or
customer photos.

1.7 WHILE `FitFinder.tsx` answers `FIT ✓` for vehicle/model/year combinations with no evidence behind
them THEN no trust surface may describe that answer as confirmed, verified or precision-molded. The
current line `"100% precision-molded {product} in stock for your {year} {brand} {model}"`
(`src/components/FitFinder.tsx:247`) is precisely such a claim and must not be propagated into any
new copy module. (Owned by `fit-finder` R1; named here so the copy register cannot encode it.)

### Requirement 2 — The policy set exists, is reachable, dated, and cannot ship half-written

**User Story:** As the owner, I want real policy pages under my own domain, so that when a customer
asks "what are your terms", I have something to send them instead of improvising in a chat.

#### Acceptance Criteria

2.1 THE SYSTEM SHALL provide these routes, each a **static Server Component** (no client
JavaScript, statically generated at build time, no database):

| Route | File |
|---|---|
| Privacy | `src/app/privacy/page.tsx` |
| Terms of sale | `src/app/terms/page.tsx` |
| Delivery | `src/app/delivery/page.tsx` |
| Returns, exchange & the Fit Guarantee | `src/app/returns/page.tsx` |
| Warranty | `src/app/warranty/page.tsx` |
| Contact | `src/app/contact/page.tsx` |
| FAQ | `src/app/faq/page.tsx` |
| About | `src/app/about/page.tsx` |

2.2 THE SYSTEM SHALL render each policy page through one shared Server Component
(`src/components/PolicyPage.tsx`) fed by structured content in `src/data/policies.ts`, so that the
page shell, heading levels, section navigation and last-updated line cannot drift between pages.

2.3 THE SYSTEM SHALL source the business identity — business name, any registration number, contact
number, email, service area and hours — from **one** module and SHALL NOT retype it on more than one
surface.

2.4 EACH policy page SHALL export its own `generateMetadata` with a unique `title` and `description`.
The site currently exports a single global metadata object in `src/app/layout.tsx:23-26` and no
per-page metadata at all.

2.5 WHILE any section of any policy carries an unresolved owner placeholder THEN a repository check
(`scripts/check-placeholders.mjs`, wired to an npm script) SHALL fail. The site SHALL NOT be deployed
with a placeholder visible in shipped HTML. Placeholders use the literal token
`[[OWNER INPUT REQUIRED: <field>]]` and are written into `src/data/policies.ts`, not into JSX.

2.6 THE SYSTEM SHALL NOT invent legal content. Policy content SHALL be authored by the owner (or a
lawyer) into `src/data/policies.ts`; this spec defines the section skeleton and the required
disclosure list only. Where a required disclosure is unknown it is a placeholder, never a plausible
guess.

2.7 EACH policy page SHALL link to the others it depends on (returns ↔ delivery, terms ↔ warranty)
so that no policy page is a dead end.

### Requirement 3 — Privacy policy that is honest about what this app actually does

**User Story:** As a customer handing over my name, phone number and home address, I want to know what
happens to them, so that giving them is an informed choice.

#### Acceptance Criteria

3.1 THE `/privacy` page SHALL name, as individual items, every category of personal data the site
handles: full name; phone number (used as a WhatsApp contact); delivery address; selected delivery
zone; vehicle make, model and year from the fit finder; and the contents of the browser's
`localStorage` under the keys `luxeride-cart` and `luxeride-last-order` (both are real:
`src/store/cart.ts`, `src/store/order.ts`).

3.2 THE `/privacy` page SHALL state the purpose of each item separately — order fulfilment, WhatsApp
dispatch verification, fit checking, and demand logging.

3.3 THE `/privacy` page SHALL disclose that the phone number is used to open a WhatsApp
conversation, that WhatsApp is operated by a Meta entity outside Nigeria, and that the conversation
is therefore processed on that third-party service. (The single `wa.me` call site in the whole app is
`src/lib/whatsapp.ts:39`; there is no Cloud API, no webhook and no send endpoint.)

3.4 THE `/privacy` page SHALL state the **current** state of tracking truthfully: no analytics, no
pixels, no cookie banner and no session tracking exist in the app today (verified: no
`gtag`/`fbq`/script-tag analytics anywhere under `src/`).

3.5 IF paid advertising on Meta or Google properties, or analytics pixels, are enabled THEN THE
SYSTEM SHALL have the `/privacy` page updated in the same change, and the page SHALL disclose the
advertising purpose, the platforms involved, the data shared (including the fact that a customer may
be shown ads based on having visited or messaged the business) and the routes to opt out. No consent
banner is specified here — a separate consent surface belongs with the analytics/ads spec — but the
privacy page must never describe tracking that does not exist, nor omit tracking that does.

3.6 THE `/privacy` page SHALL carry a data-subject route — how to request access, correction or
deletion, and to whom it is sent — that works **without a database**, i.e. WhatsApp and/or an email
address the owner reads.

3.7 THE `/privacy` page SHALL state how long data is kept and where order records live, which at P0
is: the customer's own `localStorage`, plus the WhatsApp thread. `src/store/order.ts` holds
`lastOrder` only — no order history and no server copy.

3.8 THE `/privacy` page SHALL state the governing law and any regulator, as owner placeholders.

3.9 The consent control required by `cart-checkout` 10.1 SHALL link to `/privacy`, and per
`cart-checkout` 10.4 that link SHALL NOT render until this route exists. This spec is therefore a
**blocking dependency** of `cart-checkout` R10, not a parallel nicety.

### Requirement 4 — Terms of sale, payment terms and the warranty statement

**User Story:** As the owner, I want the commercial rules written down — what was sold, at what price,
paid how, and what happens if it goes wrong — so that a dispute is settled by a page, not an argument.

#### Acceptance Criteria

4.1 THE `/terms` page SHALL state what an order **is** at each stage, matching the real mechanics: the
customer submits a request via WhatsApp (`src/app/checkout/page.tsx:78`), an order id
`LR-<base36>` is generated client-side and stored in `localStorage` only and **is not included in the
WhatsApp message** (`src/app/checkout/page.tsx:61-78`), and the business confirms manually in the
conversation. The terms SHALL NOT describe an automated order system, a payment gateway or a
transactional confirmation that does not exist.

4.2 THE `/terms` page SHALL state the price rule: the site shows the price for the configuration
displayed (product price for the car's tier, plus any row surcharge, per `src/lib/pricing.ts`), and
what governs if the confirmed quote differs. This must be reconciled against LOCKED DECISION 3
("price on the site") and the fitment-engine rule that "a site price that the quote overrides is worse
than no price" — see Open Question 1.

4.3 THE `/terms` page SHALL state both payment routes exactly as the app implements them, and name
them as two separate concessions rather than one: **prepay by transfer** = delivery fee waived
(`shippingFee = payment === "prepay" ? 0 : zone.fee`) **and** a ₦2,000 discount
(`discount = payment === "prepay" ? 2000 : 0`), with account details sent on WhatsApp; **pay on
delivery** = the zone fee is included in the total, payable by cash or transfer to the rider
(`src/app/checkout/page.tsx:143-163`).

4.4 THE `/terms` page SHALL state when a prepaid order is dispatched, and what happens to the money
if the order cannot be delivered — routed to `/returns`.

4.5 THE `/terms` page SHALL state a cancellation rule (owner placeholder) expressed as a fact about the
manual process, since no system records dispatch time.

4.6 THE `/warranty` page SHALL state: what is covered (material and manufacturing defects), what is not
(normal wear, deliberate damage, and — critically — **not** the wrong-fit case, which the Fit Guarantee
owns), how a claim is made (WhatsApp with photographs), and the duration (owner placeholder).

4.7 THE `/warranty` page SHALL NOT contradict, narrow or condition the Fit Guarantee on `/returns`.
Where the two documents could be read against each other, the guarantee wording wins and the warranty
page says so explicitly.

### Requirement 5 — The delivery policy carries the four real zones, from the real source

**User Story:** As a customer outside Lagos, I want to know what delivery costs and how long it takes
before I pay, so that I am not surprised by a rider at my door.

#### Acceptance Criteria

5.1 THE `/delivery` page SHALL import `LOCATIONS` from `src/data/locations.ts` and render all four
zones with their existing `name`, `fee` (via `fmtNaira`) and `eta`: Lagos Mainland & Island ₦9,000 /
24–48 hours; Abuja Central & Outskirts ₦6,000 / 3–5 days; PH, Owerri, Calabar, Warri & Benin ₦12,000
/ 3–5 days; Other State ₦12,000 / 5–7 days. **No zone, fee or ETA may be retyped in the page**, and no
zone may be invented.

5.2 IF a zone is added, removed or repriced in `src/data/locations.ts` THEN THE `/delivery` page, the
checkout selector and the announcement bar SHALL all update from the same array, with no second copy.

5.3 THE `/delivery` page SHALL state that the fee shown is the pay-on-delivery fee and that it is
waived on prepayment, and that the ₦2,000 prepay saving is a separate concession.

5.4 THE `/delivery` page SHALL state the delivery process truthfully: orders arrive via WhatsApp and
are confirmed manually; there is no automated tracking, no courier account and no delivery-status page.
The page SHALL NOT promise tracking the system cannot provide.

5.5 THE `/delivery` page SHALL state what happens if delivery is attempted and fails, or if the
customer is unavailable (owner placeholder, including any re-attempt fee).

5.6 THE `/delivery` page SHALL state the service area, derived from the same zone list — not as an
unbounded claim of "nationwide" unless the owner accepts that `Other State` at 5–7 days satisfies it.

5.7 The cart's current line "Delivery fee is calculated at checkout, based on your zone"
(`src/app/cart/page.tsx:73`) SHALL be replaced by a range computed from `LOCATIONS`
(`min(LOCATIONS[].fee)`–`max(LOCATIONS[].fee)`) plus a link to `/delivery`, because a promise with no
number is what the cart currently offers.

### Requirement 6 — Returns, exchange and the Fit Guarantee must match the badge exactly

**User Story:** As a customer whose product does not fit, I want to know precisely what happens next,
so that "we swap it free" is a process and not a slogan.

#### Acceptance Criteria

6.1 THE `/returns` page SHALL open with the guarantee badge wording **verbatim** — *"🛡️ 100% Perfect
Fit Guarantee — doesn't fit? We swap it free."* — rendered from the single shared constant, then define
what it means.

6.2 THE SYSTEM SHALL treat the following as **unresolved terms of the guarantee** which the owner must
answer before the page ships, because the badge currently asserts an absolute the business cannot yet
operate: what "swap" means (a free replacement of the same product, a different variant, or a partial
refund); the time limit for claiming; who pays the return shipping; whether it applies to every
product or only floor mats and liners; whether it is once per order; and what happens if the customer
simply prefers a different colour.

6.3 THE `/returns` page SHALL state that the Fit Guarantee applies where LuxeRide has confirmed the
fit, and that a fit is only confirmed when a layout is Confirmed under the evidence gate
(`luxeride-fitment-engine-admin-layout-grouping-spec.md`, Evidence rule; LOCKED DECISION 2). The page
SHALL NOT assert a coverage percentage, a car count or "100% of cars" anywhere.

6.4 WHILE `FitFinder` returns `FIT ✓` for combinations with no confirmed layout behind them THEN THE
`/returns` page SHALL render a visible owner-facing warning state rather than shipping a guarantee the
funnel cannot honour. This is an **owner decision**, recorded as Open Question 2 — it is not resolved
by this spec.

6.5 THE `/returns` page SHALL state the non-fit return and exchange routes separately (wrong item sent,
damaged in transit, change of mind), each with an owner-supplied window, condition requirement and
refund method.

6.6 THE `/returns` page SHALL state the refund method and timescale for prepaid orders, given that no
payment processor exists and every refund is a manual transfer.

6.7 THE `/returns` page SHALL link to `/delivery` and `/contact` and SHALL give a WhatsApp claim route
with prefilled text.

### Requirement 7 — Contact and legitimacy

**User Story:** As someone who clicked an ad on my phone, I want to reach a real business without
needing an app I may not have installed, so that I can decide whether this seller exists.

#### Acceptance Criteria

7.1 THE `/contact` page SHALL display the WhatsApp number from `WHATSAPP_NUMBER` in
`src/data/locations.ts` (`2347049621694`) in a human-readable Nigerian format, and SHALL offer a
prefilled WhatsApp action built by the existing `whatsappLink()` helper.

7.2 THE `/contact` page SHALL offer **at least one contact route that does not require WhatsApp** — a
`tel:` link and/or an email address. The current funnel terminates in `window.open(wa.me/…)`
(`src/app/checkout/page.tsx:78`) with no fallback, so a customer on a device without WhatsApp, or on a
browser that blocks the hand-off, has no path at all.

7.3 THE `/contact` page SHALL state the business name exactly as the business already states it —
"LuxeRide Nigeria" (`src/components/Footer.tsx:5`, `src/lib/whatsapp.ts:19`) — plus any company
registration number (owner placeholder; **no registration number shall be invented**), the service area
(from the zone list) and the hours of availability (owner placeholder).

7.4 THE `/contact` page SHALL state a response expectation the owner is willing to honour (owner
placeholder). It SHALL NOT publish an unachievable response time.

7.5 THE `/contact` page SHALL carry a contact form whose submission produces a prefilled WhatsApp
message or a `mailto:` hand-off, so that it works with no database and no server-side storage.

7.6 THE `/contact` page SHALL explain, in two sentences, how a fit is checked before it is sold — the
refusal doctrine — because "we say no when we don't have your car" is the strongest legitimacy claim
available and it is currently made nowhere on the site.

7.7 THE `/contact` page SHALL be reachable in one tap from the footer, from the fit result refusal
screens and from the checkout summary, without scrolling and without JavaScript.

### Requirement 8 — Refusal copy is a single first-class register, not three retyped sentences

**User Story:** As the owner, I want one place where the words for every fit outcome live, so that the
funnel, the FAQ, the contact page and the WhatsApp messages cannot drift apart.

#### Acceptance Criteria

8.1 THE SYSTEM SHALL hold all fit-outcome and trust copy in one typed module,
`src/lib/copy.ts`, imported by `src/components/FitFinder.tsx`, the WhatsApp message builders in
`src/lib/whatsapp.ts`, the `/faq` page, the `/contact` page and the footer.

8.2 THE register SHALL define entries for all three `/fit-check` outcomes with matching voice:
**FITTED** (prototype sub-line: *"Confirmed by our configurator, verified on WhatsApp before
dispatch"*, `luxeride-funnel (2).html:484`), **NOT STOCKED** (headline *"Not in stock — yet"*,
`luxeride-funnel (2).html:468`) and **UNKNOWN** (a distinct route to a human — never the same screen
with different words).

8.3 EACH refusal entry SHALL pair its promise with its capture in **one object**, so that a promise of
future stock cannot be rendered without the waitlist field that backs it. The mechanic is owned by
`fit-finder` 3.3/3.4; this spec owns the pairing and the copy.

8.4 EACH outcome entry SHALL include a WhatsApp action with prefilled text (LOCKED DECISION
consequence: "All three return a WhatsApp link").

8.5 THE register SHALL NOT contain the string `"100% precision-molded … in stock for your …"`
currently hardcoded at `src/components/FitFinder.tsx:247`; replacing it is `fit-finder`'s task, but
the register must not re-encode it (see 1.7).

8.6 THE demand-log write is owned by `fit-finder` (R4) and the demand-log model by `fitment-engine`
(R11). This spec SHALL NOT add a second capture path, a second log or a duplicate analytics event for a
refusal.

8.7 THE guarantee line, the announcement-bar strings, the prepay saving, the delivery range and the
refusal copy SHALL each exist **once** in `src/lib/copy.ts`. The guarantee line is currently hardcoded
three times — `src/components/Footer.tsx:6`, `src/components/FitFinder.tsx:280`,
`src/app/products/[slug]/page.tsx:44` — with identical text and no shared source.

### Requirement 9 — Social proof from real evidence only, and only where it can be captured

**User Story:** As a customer who has been scammed before, I want to see real fitment evidence, so
that I can judge the seller without taking their word for it.

#### Acceptance Criteria

9.1 THE SYSTEM SHALL publish proof only of these kinds: (a) LuxeRide's own product and installation
photography derived from `footage/`, correctly labelled as LuxeRide's own; (b) fit confirmations
recorded through the WhatsApp dispatch loop; (c) reviews captured from real customers after delivery;
(d) a count of Confirmed layouts once `fitment-engine` supplies it.

9.2 THE SYSTEM SHALL NOT publish: fabricated or placeholder testimonials, invented review counts, star
ratings with no underlying reviews, "customers served" counts, made-up stock levels, or any screenshot
or testimonial not traceable to a real person. This is a hard prohibition and the reason this
requirement exists.

9.3 THE three photographs in `footage/` (`20260801_114841.jpg`, `20260801_114925.jpg`,
`20260801_121405.jpg`, ~3.1–3.6 MB, 4000×3000) SHALL be auto-oriented (EXIF orientation is upper-right
— they currently render rotated unless corrected) and resized to web dimensions before being placed
under `public/media/`. They SHALL NOT be copied from `Luxeride/footage/` into `public/` at original
size.

9.4 THE eight video clips in `footage/` (1920×1080, 30fps, 34–97 seconds, 74–208 MB each, ~17 Mbps)
SHALL NOT be served raw. They SHALL be transcoded to a web preset with poster frames before
publication, SHALL NOT autoplay with sound, and SHALL preload nothing until the customer taps play.

9.5 A photo or clip SHALL be captioned as an **installed fit** only where the frame actually shows an
installed product. No frame may be attributed to a customer, a customer's car or a customer's
installation unless it is one.

9.6 A review or testimonial component SHALL be data-driven and SHALL render **nothing** when the
collection is empty. The site SHALL NOT ship an empty reviews section, a "0 reviews" counter or a
star-rating skeleton.

9.7 THE SYSTEM SHALL support a post-delivery review request as a plain WhatsApp message sent by the
owner in the dispatch loop, with a prefilled prompt asking for a photo or a sentence and permission to
publish. No in-app review form is required at P0.

9.8 IF a Confirmed-layout count is displayed THEN it SHALL be rendered only when the fitment engine
provides the data, SHALL be labelled with exactly what it counts, and SHALL disappear (rather than
show zero, a placeholder or an estimate) when the source is unavailable.

### Requirement 10 — Findability: footer, announcement bar, and the links this spec needs

**User Story:** As a customer holding my phone, I want to reach your policies, contact details and
social accounts in one tap from any page, so that I never have to guess.

#### Acceptance Criteria

10.1 `src/components/Footer.tsx` SHALL be rewritten from two text lines into a footer containing: a
link group (Privacy, Terms, Delivery, Returns & Guarantee, Warranty, Contact, FAQ, About); the
business identity line; the guarantee line rendered from `copy.guarantee` and linking to `/returns`;
the social profile links; and the WhatsApp contact action.

10.2 THE footer SHALL remain a **Server Component** — it has no `"use client"` today and SHALL gain
none — so every link is a plain `next/link` that works before hydration and with JavaScript disabled.

10.3 THE footer SHALL be reachable and complete on the smallest supported viewport without horizontal
scrolling, in a single column on mobile.

10.4 The header's mobile navigation is `hidden sm:flex` with **no hamburger** (`Header.tsx:28`); the
fix is owned by `storefront-catalog` and is **out of scope for this spec**. This spec SHALL NOT depend
on it: `/contact` and the full policy link set SHALL be reachable from the footer at every viewport.

10.5 THE SYSTEM SHALL add an announcement/utility bar rendered in `src/app/layout.tsx` above
`<Header />`, carrying — at most, and only claims the delivery page supports: nationwide delivery;
the delivery window from the fastest zone in `LOCATIONS`; the prepay rule (free delivery + save
₦2,000); and the fit guarantee line.

10.6 THE announcement bar SHALL source its strings from `src/lib/copy.ts` and `src/data/locations.ts`
and SHALL NOT contain a countdown, a stock number or any urgency claim. It SHALL be a Server Component
with no rotation, and SHALL NOT be sticky — the header is `sticky top-0 z-20`
(`Header.tsx:23`), and a second sticky layer would introduce an offset bug for no gain, so the bar
scrolls away.

10.7 THE announcement bar SHALL render `aria-hidden` duplicates as non-text where icons are used, and
SHALL NOT rely on colour alone to convey its content.

10.8 Social profile links SHALL be declared in one module, `src/data/social.ts`, each entry carrying a
platform, a handle and a URL. An entry whose URL is unknown SHALL be omitted from the render rather
than rendered as `#`, empty, or pointing at a platform search page. The app currently links to **no**
social account anywhere despite being an ad-driven business.

10.9 ALL external links SHALL use `target="_blank"` with `rel="noreferrer"`, matching the existing
pattern at `src/components/FitFinder.tsx:311`.

### Requirement 11 — Placement: what sits next to the buy action, and what waits for the footer

**User Story:** As a customer one tap from paying, I want the answer to "will this actually arrive,
and what if it doesn't" in front of me, not three scrolls down.

#### Acceptance Criteria

11.1 THE SYSTEM SHALL render a compact trust block immediately adjacent to the primary buy action on
the four high-intent surfaces — the fit result, the product page, the cart and the checkout — carrying
the guarantee line, the delivery fee range, the prepay saving and a link to the full policy. It SHALL
be one component, `src/components/TrustStrip.tsx`, reading from `copy` and `LOCATIONS`, so the four
surfaces cannot disagree.

11.2 THE justification for adjacency is specific and SHALL be recorded in the design, not assumed:
the buyer's objection is not abstract ("is this site legit") but transactional ("will a rider bring me
something that fits, and what happens if they don't"). That objection is only live at the moment of the
tap; after purchase it evaporates. Conversely the customer's ability to read a long policy at the tap
is zero on a phone. Therefore: **the summary goes next to the CTA, the full document is one tap away,
and both resolve to the same page so the summary can never contradict it.**

11.3 THE SYSTEM SHALL NOT place, adjacent to any buy action, anything the build cannot honour: no
countdown, no stock counter, no "N people viewing", no urgency that expires, no review count, no trust
badge the business has not earned. Every element of `TrustStrip` SHALL trace to `copy` or `LOCATIONS`.

11.4 THE checkout SHALL state what happens next at the submit button — that the order is a WhatsApp
message the owner confirms before dispatch — because that is the moment the customer is handing over a
phone number and an address.

11.5 THE checkout SHALL offer the non-WhatsApp contact fallback adjacent to the submit button, not
only in the footer (see 7.2).

11.6 THE footer SHALL carry reference material — policies, contact, FAQ, socials, business identity —
and SHALL NOT carry the only copy of anything that must be read before paying.

### Requirement 12 — The minimum honest set before any money is spent on traffic

**User Story:** As the owner who wants to advertise immediately, I want to know the exact floor of
trust work that must exist first, so that I do not pay for traffic into a site that cannot answer a
complaint.

#### Acceptance Criteria

12.1 THE SYSTEM SHALL NOT receive paid traffic until **all** of the following are true, because each
one is a specific, checkable way a buyer is failed today:

| # | Gate | Why it blocks traffic |
|---|---|---|
| 1 | `npm run build` exits zero (blocked today by `prisma/seed.ts(2,34)`, `_CONTEXT.md` §3) | The site cannot be deployed at all |
| 2 | `/privacy`, `/delivery`, `/returns`, `/contact` exist and pass the placeholder scan | Ad platforms and buyers expect a reachable policy + contact; no recourse is offered without them |
| 3 | The checkout consent control renders and links to `/privacy` (`cart-checkout` 10.1/10.4) | Personal data is collected today with neither consent nor disclosure |
| 4 | The announcement bar is live | Delivery and guarantee trust currently has no home above the fold |
| 5 | The footer link grid is live | The footer contains zero links today |
| 6 | At least one real, correctly-oriented, resized product photograph is published | 15 of 21 product image paths do not exist; 5 products render empty boxes (`_CONTEXT.md` §7) |
| 7 | The guarantee badge resolves to a link to `/returns` | The badge is the brand's core promise and currently points nowhere |

12.2 Items 2–7 are the trust floor and are all deliverable inside this spec without a database, without
a payment processor and without a backend.

12.3 `/faq`, `/terms`, `/warranty`, `/about`, the review-capture loop and the social links are P1: they
are required in the first two weeks of trading, not before the first click.
