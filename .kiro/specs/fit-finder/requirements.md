# Requirements Document — Fit Finder

## Introduction

`/fit-finder` is the only path from an advert to a cart. Everything else on the site is browsing; this
is the funnel. It takes a customer from "What do you drive?" to a priced, cartable, dispatchable
answer about one specific car.

Two things are true of it today, and one of them is severe.

**The `FIT ✓` it shows is fabricated.** `src/components/FitFinder.tsx` decides what happens after a
car is chosen from a single boolean per brand/model in `src/data/cars.ts`. The model year the
customer selects is captured in state, printed on the result card, and then never compared to
anything — there is no fitment data anywhere in the repository. So the app states *"We Found Your
Fit! 100% precision-molded Double Layer Mats in stock for your 2009 Toyota Camry"* on the strength of
nothing, and states it identically for a 2009 and a 2026, a Camry and a Hilux, a floor mat and a
sun shade. The fitment spec this project is governed by
(`luxeride-web/luxeride-fitment-engine-admin-layout-grouping-spec.md`) makes the refusal the
load-bearing claim of the whole brand — *"if we don't have your model, we say no"* — and holds that a
wrong "yes" costs more than a hundred honest "no"s, because that is the scam shape these buyers have
already survived. Today every yes is unearned, which makes the refusal worthless and the brand claim
false. This is the single most serious defect in the product.

**It has also lost half of a validated funnel.** `luxeride-funnel (2).html` was signed off step by
step with real traffic. The Next.js port dropped the delivery-zone step (so the result shows neither
the zone nor the ETA and its price excludes delivery, while `/checkout` adds delivery — the two
numbers disagree), the 48-hour price-lock line, the spill badges, the sticky checkout CTA, the
honest results sub-copy, the campaign landing map (`CONFIG.PRODUCT_LANDING`), the checkout copy and
back-links. A campaign link built from the prototype lands a stranger on an unbranded search box
with no headline and no product lock.

This feature fixes both. It specifies an interim fitment source that works with **no admin, no
database and no network call** — a static Confirmed-only table, exactly as the fitment spec's own P0
phase advises — behind a single `fitCheck()` contract that the P2 `/fit-check` route handler will
implement later without the front end changing. It specifies the three honest outcomes, refusal copy
written to the standard of the headlines, demand logging for every refusal, and restores the funnel
steps that were carrying conversion. Without this spec the site cannot go live honestly and cannot
run paid traffic at all.

**Scope.** The quiz, the fit result, the routes out of it (cart, checkout, live photos, negotiate,
WhatsApp), the campaign-landing contract on `/fit-finder`, and the honesty of the claim. The fitment
admin, the database and the `/fit-check` route handler belong to `fitment-engine` and
`commerce-backend`; the ad/landing pairing and pixel events belong to `ad-landing-and-tracking`; the
checkout form and order integrity belong to `cart-checkout`. Where those specs own something, this
one names the boundary instead of duplicating it.

---

## Requirements

### Requirement 1 — The fit claim must be earned

**User Story:** As a customer who has already been burned by a seller who claimed a custom part
fitted when it did not, I want LuxeRide to say "this fits" only when someone has actually confirmed
it, so that the first time I trust this brand is not the first time it is wrong.

#### Acceptance Criteria

1.1 WHEN the customer has chosen a make, model and model year THE SYSTEM SHALL resolve the selection
through a single `fitCheck()` call before any success copy is rendered.

1.2 IF the vehicle resolves to a layout whose status is `confirmed` and which carries a variant for
the selected product THEN THE SYSTEM SHALL return the outcome `FITTED`.

1.3 IF the make and model are recognised but no confirmed layout covers the requested year, or none
of that layout's variants is the selected product THEN THE SYSTEM SHALL return the outcome
`NOT_STOCKED`.

1.4 IF nothing in the fitment source matches the make, model or year THEN THE SYSTEM SHALL return the
outcome `UNKNOWN` and offer a route to a human on WhatsApp.

1.5 THE SYSTEM SHALL never return `FITTED` for a layout whose status is anything other than
`confirmed` (fitment spec locked decision 2 — front end is Confirmed-only).

1.6 IF the fitment source throws, times out, returns a malformed body or is unreachable THEN THE
SYSTEM SHALL degrade to `UNKNOWN` and SHALL NOT render any success claim. A failure must never
resolve in the direction of a false yes.

1.7 IF a customer hand-edits or shares a URL naming a car, year or layout that is not confirmed THEN
THE SYSTEM SHALL recompute the outcome from the fitment source and SHALL NOT treat the URL as a
source of truth.

1.8 THE SYSTEM SHALL carry the internal layout code (for example `TC-2009-2013`) into every WhatsApp
message generated from the result, and SHALL NOT present that code as customer-facing copy.

1.9 WHILE a fit check is in flight THE SYSTEM SHALL render a resolving state and SHALL NOT show a
previous or stale result.

1.10 IF the outcome is anything other than `FITTED` THEN THE SYSTEM SHALL NOT expose an add-to-cart
or checkout control for that configuration.

---

### Requirement 2 — An interim fitment source that needs nothing

**User Story:** As the owner, I want the site to be honest on Monday without waiting for a database,
an admin console or a backend team, so that I can start taking money against a claim I can actually
stand behind.

#### Acceptance Criteria

2.1 THE SYSTEM SHALL resolve fit checks from a static TypeScript table requiring no database, no
admin UI, no migration and no network request.

2.2 IF the table contains zero entries THEN THE SYSTEM SHALL serve the entire site with every car
refused, every funnel path still navigable, and every refusal logged. An empty table is a valid,
honest, shippable state.

2.3 THE SYSTEM SHALL expose exactly one entry point, `fitCheck(request): Promise<FitResult>`, to all
user-interface code. No component may import the fitment table directly.

2.4 WHEN the P2 `/fit-check` route handler is delivered by `fitment-engine` THE SYSTEM SHALL be able
to change which implementation `fitCheck()` calls without editing `FitFinder.tsx`, the result
component, or any copy.

2.5 THE SYSTEM SHALL validate the shape of any remote fit-check response before use and SHALL treat
an unrecognised shape as `UNKNOWN`.

2.6 IF a table entry lacks a layout code, customer-facing name, make, year range, evidence source,
confirmation note or confirmation date THEN THE SYSTEM SHALL discard that entry and SHALL NOT serve
it.

2.7 IF a table entry's make does not match the make being asked about THEN THE SYSTEM SHALL treat it
as no match. One layout equals one make (fitment spec locked decision 4).

2.8 THE SYSTEM SHALL accept only entries whose `evidenceSource` is a physical confirmed fitting,
written supplier confirmation, or a verified OEM floor-pan match. Nothing else may be written into
the table.

2.9 IF a table entry spans a generation boundary that the owner has flagged as unresolved THEN THE
SYSTEM SHALL NOT serve it.

---

### Requirement 3 — Refusals are a feature, written to headline standard

**User Story:** As a customer whose car we do not carry, I want a clear, dignified answer with a
next step — not a dead end and not a vague promise — so that saying no costs me your respect instead
of your order.

#### Acceptance Criteria

3.1 WHEN the outcome is `NOT_STOCKED` THE SYSTEM SHALL show a refusal screen whose headline, body
copy and primary action name the specific make, model and year that was asked for.

3.2 WHEN the outcome is `UNKNOWN` THE SYSTEM SHALL show a distinct screen, with its own copy and a
primary action that opens a prefilled WhatsApp message to a human. `UNKNOWN` is not a rebranded
`NOT STOCKED`.

3.3 IF any refusal copy states or implies future availability THEN THE SYSTEM SHALL collect and
validate a waitlist phone number before making that promise, using the existing Nigerian phone
validator.

3.4 IF a submitted waitlist phone number is invalid THEN THE SYSTEM SHALL keep the customer on the
refusal screen, show an inline error, and SHALL NOT silently discard the capture.

3.5 WHEN a car is confirmed for one product but not for another THE SYSTEM SHALL keep the car
confirmed, mark the unavailable product as unavailable on the product step with a readable reason,
prevent its selection, and offer the variants that are available for that car.

3.6 IF the product locked by a campaign link is not a confirmed variant for the customer's car THEN
THE SYSTEM SHALL state plainly that the advertised product is not cut for that car, SHALL NOT
silently substitute a different product, SHALL log the miss to the demand log, and SHALL offer the
confirmed alternatives.

3.7 THE SYSTEM SHALL always offer a way out of a refusal screen — browse other cars, or start over —
without destroying the customer's session state.

3.8 THE SYSTEM SHALL remove the current behaviour where choosing a car flagged `available: false`
short-circuits to the refusal screen before a year is chosen, because a refusal that does not know
the year is not a refusal.

---

### Requirement 4 — Every refusal is logged, from day one

**User Story:** As the owner, I want the cars people ask for and the fits I refuse to become a ranked
sourcing list, so that my refusal path is the thing that tells me what to stock next.

#### Acceptance Criteria

4.1 WHEN a refusal occurs — `NOT STOCKED`, `UNKNOWN`, no search match, the "enter model on WhatsApp"
escape, or a locked-product miss — THE SYSTEM SHALL record exactly one demand-log entry.

4.2 A demand-log entry SHALL carry make, model, year, product slug, outcome, the layout code or
`"none"`, the delivery zone when known, the free-text query when the refusal came from a failed
search, and an ISO-8601 timestamp.

4.3 THE SYSTEM SHALL write entries through a route handler that requires no database.

4.4 IF the write fails, is rate-limited or the network is unavailable THEN THE SYSTEM SHALL keep the
customer on a usable path and SHALL present the prefilled WhatsApp message as the way their request
gets registered.

4.5 THE SYSTEM SHALL return an explicit success/failure acknowledgement so the interface can
distinguish a refusal that was recorded from one that was not.

4.6 IF a demand-entry body is malformed or exceeds the maximum accepted size THEN THE SYSTEM SHALL
reject it with a `400` and SHALL NOT write a partial record.

4.7 IF the same make/model/year is refused more than once THEN THE SYSTEM SHALL record each refusal
(each is a real request) while the storage format makes repeated makes easy to count.

---

### Requirement 5 — Delivery zone returns to the funnel, and the price tells the truth

**User Story:** As a customer, I want to know the delivered price and when it will arrive before I
commit, so that the number I act on at checkout is the number I was shown.

#### Acceptance Criteria

5.1 THE SYSTEM SHALL restore the delivery-zone step to the funnel, after product and row
configuration and before the result, on both the locked-product and free-product paths.

5.2 WHEN the zone step renders THE SYSTEM SHALL show each zone's name, estimated arrival and delivery
fee.

5.3 WHEN the result renders THE SYSTEM SHALL display the selected delivery zone, the delivery fee and
the estimated arrival as rows on the fit card.

5.4 WHEN the result renders THE SYSTEM SHALL display one all-in price — unit price plus the selected
zone's fee — itemised into its two component lines.

5.5 THE SYSTEM SHALL keep the delivery fee out of the unit price stored against the cart item, so the
cart and checkout compute delivery once and only once.

5.6 WHEN the customer changes the zone at checkout THE SYSTEM SHALL recompute the total from the same
delivery-zone table used in the funnel, and SHALL show the revised fee and arrival window, so the two
screens cannot contradict each other.

5.7 THE SYSTEM SHALL display an exact figure only when the product variant, the tier and the row
count are pinned **and** a delivery zone is selected. Otherwise it SHALL render a "from ₦X" figure
with the range. A single exact number must never be one the WhatsApp quote then contradicts (fitment
spec locked decision 3).

5.8 THE SYSTEM SHALL source the unit price from the fit result's `priceFrom` for the chosen variant
whenever the fit result supplies one, and SHALL fall back to the existing tier-and-row calculation
only when it does not.

5.9 IF the unit price source changes between the funnel and the cart (for example a price edit
between sessions) THEN THE SYSTEM SHALL show the current figure at the point of purchase.

---

### Requirement 6 — The result page is complete and credible

**User Story:** As a customer holding my phone at the result screen, I want every reason to believe
this order is real to be on that one screen, so that I do not have to hunt for reassurance.

#### Acceptance Criteria

6.1 WHEN a confirmed fit renders THE SYSTEM SHALL display the sub-copy "Confirmed by our
configurator, verified on WhatsApp before dispatch" and SHALL NOT display the current unverified
claim "100% precision-molded … in stock for your …".

6.2 THE SYSTEM SHALL display the urgency line "PRICE LOCKED FOR 48 HOURS FROM CONFIRMATION" on the
result.

6.3 THE SYSTEM SHALL display product spill badges (Waterproof, Mud-Resistant, Wipes Clean in
Seconds) sourced from the product's own badge list, and SHALL NOT display a spill badge on a product
for which no such claim is made.

6.4 THE SYSTEM SHALL display at least one image on the result. IF the layout has no fit photograph yet
THE SYSTEM SHALL fall back to product photography, explicitly labelled as product photography rather
than as a photograph of the customer's car.

6.5 THE SYSTEM SHALL display a "Payment — choose at checkout" row on the fit card.

6.6 THE SYSTEM SHALL retain the existing "100% Perfect Fit Guarantee — doesn't fit? We swap it free"
badge on the confirmed result.

6.7 THE SYSTEM SHALL NOT display a stock or fit badge on any screen for a car that is not confirmed.

---

### Requirement 7 — Routes out of the result

**User Story:** As a customer who has just been told my car fits, I want one obvious next step that
does not make me re-enter anything, so that momentum survives the click.

#### Acceptance Criteria

7.1 WHEN a confirmed result is displayed THE SYSTEM SHALL present a sticky bottom primary action
"Continue to Checkout →" that places the configured item in the cart and navigates to `/checkout`.

7.2 THE SYSTEM SHALL offer add-to-cart only from a `FITTED` outcome.

7.3 IF the identical line item — same product, brand, model, year and row configuration — is already
in the cart THEN THE SYSTEM SHALL NOT create a second row; it SHALL increase the existing row's
quantity, and the sticky action SHALL reflect that the item is already in the cart.

7.4 THE SYSTEM SHALL include the delivery zone in the negotiate/offer WhatsApp message.

7.5 THE SYSTEM SHALL include the layout code in the live-photos and the negotiate/offer WhatsApp
messages.

7.6 WHEN an item has been added THE SYSTEM SHALL offer the cart and keep-shopping routes it offers
today.

7.7 THE SYSTEM SHALL carry the layout code on the cart item so the order conversation can be
reconciled against a fit reference.

---

### Requirement 8 — `/fit-finder` as a campaign landing surface

**User Story:** As an owner paying for Instagram traffic, I want the page an ad points at to say the
same thing the ad said and to pre-lock what the ad is selling, so that I am not paying for clicks
that land on a generic search box.

#### Acceptance Criteria

8.1 `/fit-finder` SHALL render a landing hero — headline, sub-copy and the three trust badges —
before the funnel begins, for every visitor including those with no campaign parameters.

8.2 WHEN the request carries a product parameter that matches either a campaign alias or a product
slug THE SYSTEM SHALL lock that product and omit the product step from the funnel.

8.3 WHEN the parameter resolves to a campaign alias THE SYSTEM SHALL replace the landing headline and
sub-copy with that campaign's copy, exactly as the prototype's campaign landing map did.

8.4 IF a product parameter is present but unrecognised THEN THE SYSTEM SHALL render the default
landing hero and the unlocked funnel, and SHALL NOT render an error, a blank funnel, or a stuck
lock.

8.5 WHEN the funnel rewrites the URL — restoring a shared fit, for example — THE SYSTEM SHALL
preserve every query parameter it does not own, so that parameters owned by the
`ad-landing-and-tracking` spec survive a client-side navigation.

8.6 THE SYSTEM SHALL expose the resolved campaign key, product slug, headline and sub-copy to the
tracking layer through a single resolver, so the pixel can report which landing variant was served.

8.7 THE SYSTEM SHALL accept the campaign aliases the prototype already used — `mats`,
`single-layer`, `seat-covers`, `bundle` — so that ad links built against the validated prototype keep
working.

8.8 THE SYSTEM SHALL keep the funnel's progress indicator and step count consistent with the
configuration actually in play (locked product present or not, row step needed or not).

---

### Requirement 9 — A fit the customer can come back to

**User Story:** As a customer who has just seen the fit for my car, I want a link I can bookmark or
send to my brother, so that I do not have to answer the quiz again to reorder.

#### Acceptance Criteria

9.1 WHEN a confirmed result is reached THE SYSTEM SHALL write the selection — brand, model, year,
product, rows, delivery zone and layout code — into the URL query string.

9.2 WHEN `/fit-finder` is loaded with a fit query THE SYSTEM SHALL restore that selection, recompute
the outcome through `fitCheck()`, and land on the corresponding screen.

9.3 IF the restored selection no longer resolves to a confirmed fit (layout retired, table edited,
product removed) THEN THE SYSTEM SHALL show the recomputed outcome and SHALL NOT show the previously
saved success screen.

9.4 THE SYSTEM SHALL express the fit as readable query keys rather than an opaque encoded blob.

9.5 THE SYSTEM SHALL update the URL without adding a history entry for every internal step change.

9.6 `/checkout` SHALL expose a "Back to your fit" control that restores the customer's fit through
that same URL.

---

### Requirement 10 — Car catalogue integrity

**User Story:** As a customer who cannot find my car in the list, I want the brand's own promise that
you will always answer me, so that the search box is not a wall.

#### Acceptance Criteria

10.1 THE SYSTEM SHALL render the "enter your model on WhatsApp" escape on the car step
unconditionally, including when it matches nothing in the catalogue.

10.2 THE SYSTEM SHALL source fit availability from the fitment data and SHALL NOT decide
availability from the brand-level or model-level boolean currently in the car catalogue.

10.3 IF a car is flagged unavailable in the catalogue and has no confirmed layout THEN THE SYSTEM
SHALL refuse it through the normal `NOT_STOCKED` path, which carries the year and the product.

10.4 IF a car is flagged unavailable in the catalogue but is confirmed in the fitment data THEN THE
SYSTEM SHALL honour the fitment data, because the confirmed entry is the newer truth.

10.5 THE SYSTEM SHALL derive the offered model-year range from a single shared constant whose upper
bound is the current calendar year, instead of a literal that goes stale.

10.6 IF a deep-linked year falls outside the offered range THEN THE SYSTEM SHALL clamp it to the
nearest bound rather than discarding the link.

10.7 THE SYSTEM SHALL keep the existing search behaviour — substring match over make and model, at
most eight results, popular cars when the query is empty — and SHALL order confirmed cars ahead of
unconfirmed ones.

---

### Requirement 11 — Failure paths are designed, not discovered

**User Story:** As a customer on a cheap phone on a poor connection, I want the funnel to survive the
things that go wrong on a phone, so that a broken clipboard or a mangled link never costs me an
order.

#### Acceptance Criteria

11.1 IF the clipboard write used by the checkout "Copy message" control is rejected THEN THE
SYSTEM SHALL select the message text and show a manual-copy instruction instead of failing silently.

11.2 IF the clipboard API is unavailable THEN THE SYSTEM SHALL hide the copy control and leave the
message preview selectable.

11.3 IF a deep-link parameter contains unexpected characters, an unknown layout code or an
out-of-range year THEN THE SYSTEM SHALL ignore that parameter and continue the funnel.

11.4 IF the fitment source is empty or every entry is invalid THEN THE SYSTEM SHALL still render the
full funnel, the landing hero and the campaign locks, and SHALL refuse every car honestly.

11.5 IF a product image fails to load THE SYSTEM SHALL continue rendering the surrounding card
without an empty slot.

11.6 WHILE the customer is on a refusal screen THE SYSTEM SHALL keep the fit-check inputs available
so that "Start over" and "browse other cars" do not require a full page reload.