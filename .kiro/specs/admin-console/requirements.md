# Requirements Document

## Introduction

**Feature:** `admin-console` — the owner-facing back office. The shell, the single-operator safety
model, the dashboard, orders, the WhatsApp queue, the ranked demand roadmap, catalogue and pricing
administration, the media view, and the audit log viewer.

**What breaks without it.** LuxeRide sells through WhatsApp and the console is the only place the
money path is visible. Today, `src/app/checkout/page.tsx:62` mints an order id
(`LR-${Date.now().toString(36).toUpperCase()}`) **in the browser**, writes it to `localStorage`
(`src/store/order.ts`, key `luxeride-last-order`), opens `wa.me`, clears the cart and routes to
`/order/confirmation`. The id is **not in the WhatsApp message** (`src/lib/whatsapp.ts:35` — the body
is name, item lines, address, phone, payment line, "Please confirm my order"). So the message that
reaches the owner's phone contains no identifier at all, and the order exists in exactly one place:
the customer's browser. The audit's money-path diagram
(`00-RELEASE-READINESS-AUDIT.md` §6) ends four separate arrows in "the owner never learns about this".
`_CONTEXT.md` §11 lists the whole absence in one line: *no server-side order record · no order
history or order lookup · no admin console*.

**The operator, as specified by the constraints.** One person. On a phone. Usually inside WhatsApp.
`fitment-engine` 🔒 LOCKED DECISION 1 (Requirement 14.1) forbids roles, permissions, a permission
matrix and a second editor seat. The same requirement already names the consequence — *"with one
editor, a fat-fingered status change is the whole risk"* (14.2). This spec carries that principle
across the whole console: **every destructive or state-changing action requires a confirmation step
and a written reason, and every one of them is written to an append-only audit log that makes the
change obvious a week later.** That is the single most important design constraint here, and it is
inherited, not invented.

**What this spec does NOT own.** The six fitment admin screens. `fitment-engine` Requirement 5
already defines them: vehicles list (5.1), grouping view (5.2), layout detail (5.3), exclusions
(5.4), demand log (5.5) and audit log (5.6). This spec **does not rebuild them, does not restate
their acceptance criteria, and does not add a second navigation entry for them.** It provides the
shell they render inside, the guard they sit behind, and — for exactly two of the six, where the
question is a cross-domain operator question rather than a fitment question — the shared read views
described in Requirement 10.4 and 10.5. That boundary is restated in Requirement 10 and in
`design.md`.

**The database does not exist.** `prisma/schema.prisma` declares seven models and has never been
applied — there is no `prisma/migrations/` directory, nothing under `src/` imports `@prisma/client`,
and `.env`'s `DATABASE_URL` is a literal placeholder (`_CONTEXT.md` §6). The owner has decided to run
Postgres locally first; **nothing is installed on this Ubuntu 24.04 machine yet.** `commerce-backend`
delivers the database. This spec therefore has a hard P0 that works with **no database at all**
(Requirement 11) and a large P1/P2 that is explicitly blocked on it, and it says which is which for
every screen.

**Guides read before specifying any Next-shaped behaviour** (`_CONTEXT.md` §12 hard rule 1; `AGENTS.md`
warns this Next version differs from training data). The table is in `design.md`.

---

## Requirements

### Requirement 1 — The admin shell: routes, layout, navigation

**User Story:** As the owner, I want one address I can bookmark that leads to everything I do, so
that I never have to remember six URLs while standing in a car park holding a phone.

#### Acceptance Criteria

1.1 THE SYSTEM SHALL expose the entire admin console under the `/admin` path prefix, with no
admin screen reachable at any other path.

1.2 THE SYSTEM SHALL implement the shell in `src/app/admin/(console)/layout.tsx` as a **nested
layout inside a route group**, so the group contributes nothing to the URL and navigating between
admin screens does not reload the page. *(This is the exact file `fitment-engine` tasks.md 8.1
names. admin-console **owns** that file; `fitment-engine`'s screens nest inside it.)*

1.3 THE SYSTEM SHALL render the admin shell in its **own root layout**, separate from the
storefront's, so that the storefront `<Header />` (which is a `"use client"` component reading the
persisted cart) and the storefront `<Footer />` are never shipped to, or rendered on, an admin
screen.

1.4 THE SYSTEM SHALL give the admin root layout its own `metadata` export so the browser tab reads
`LuxeRide Admin`, and SHALL set the admin subtree to noindex via an `X-Robots-Tag: noindex, nofollow`
response header.

1.5 THE SYSTEM SHALL publish **no link to `/admin`** from `src/components/Header.tsx`,
`src/components/Footer.tsx`, any page, any metadata, `sitemap.ts` or `robots.ts`, so the console is
not discoverable by traversal or by a crawler.

1.6 WHEN the owner opens `/admin` on a screen narrower than `sm` THEN THE SYSTEM SHALL render
primary navigation as a **fixed bottom bar** with a minimum tap target of 44 × 44 CSS pixels per
item, within thumb reach, and SHALL render it as a left rail at `sm` and above.

1.7 THE SYSTEM SHALL render every admin screen with the **existing design tokens** in
`src/app/globals.css` — `ink`, `panel`, `panel-2`, `gold`, `gold-dim`, `line`, `muted`, and the
`font-display` / `font-mono` utilities — and SHALL NOT introduce a second colour, font or spacing
system, a CSS module, or a component library.

1.8 WHEN any admin route handler, page, or Server Action throws THEN THE SYSTEM SHALL render an
admin-scoped `error.tsx` that states what failed in plain language and offers a retry, and SHALL NOT
render a stack trace, a database message, or a raw identifier to the screen.

1.9 WHEN the owner navigates to an admin path that does not exist THEN THE SYSTEM SHALL render an
admin-scoped `not-found.tsx` that links back to the dashboard.

1.10 WHILE a slow admin data read is in flight THEN THE SYSTEM SHALL render an admin-scoped
`loading.tsx` skeleton that reserves the final layout height, so a slow phone does not appear to
have loaded an empty screen.

---

### Requirement 2 — Authentication and the single-operator safety model

**User Story:** As the owner, I want the console closed to the internet but openable on my phone
without logging in every time, so that nobody can change my prices and I am not fighting a login
form between customer messages.

#### Acceptance Criteria

2.1 **This spec adopts the approach `fitment-engine/design.md` already chose, unchanged in
mechanism.** HTTP Basic Auth enforced in Next 16's `src/proxy.ts` with
`export const config = { matcher: ['/admin/:path*'] }`, comparing against `ADMIN_USER` and a
`scrypt$<saltHex>$<hashHex>` value in `ADMIN_PASSWORD_HASH`, using `node:crypto` and
`crypto.timingSafeEqual`, with **zero new dependencies**. The rationale is `fitment-engine`'s:
`jose`, `iron-session` and `server-only` are all verified not installed, and locked decision 1
forbids the surface a session library brings.

2.2 THE SYSTEM SHALL verify the credential inside **every** mutating Server Action, as the first
statement, before any validation or data access — because a Server Action is a `POST` endpoint
"reachable to anyone who can send the same POST" and the framework states plainly that Proxy
"should not be your only line of defense". Render-time gating is **not** a security boundary.

2.3 THE SYSTEM SHALL place the credential verification in exactly one module,
`src/lib/admin-auth.ts`, and every admin screen and action — including the six screens owned by
`fitment-engine` — SHALL import it. THE SYSTEM SHALL NOT create a second credential store, a second
password, or a second hash format.

2.4 WHEN a request to `/admin/:path*` carries no credential, or a wrong credential THEN THE SYSTEM
SHALL return `401` with a `WWW-Authenticate: Basic realm="LuxeRide Admin"` header and SHALL render
no layout, price, order, demand, or message data of any kind.

2.5 WHEN a Server Action is invoked without valid credentials THEN THE SYSTEM SHALL abort before
touching any record, SHALL return a typed `{ ok: false, error: "unauthorized" }` result to the
component, and SHALL render nothing but the error.

2.6 THE SYSTEM SHALL throttle **failed** credential attempts per client address with an
exponential backoff and a `Retry-After` response header, using an in-process counter with no new
dependency — because the app has **no rate limiting anywhere** and this console is the highest-value
target on the site (it holds pricing, publish controls and customer contact details).

2.7 THE SYSTEM SHALL emit one structured `console.warn` line per failed credential attempt carrying
the address, the timestamp and the user agent, so a brute-force attempt is visible in the platform
log even though it is blocked.

2.8 THE SYSTEM SHALL NOT build roles, permissions, a permission matrix, an editor list, a
per-user audit attribution beyond the single operator identity, or a second editor seat. Every audit
entry records one actor, `owner`.

2.9 THE SYSTEM SHALL NOT require a re-login between screens, and SHALL NOT implement a logout that
the owner would need on a shared device — a phone is a single-operator device here, and a logout is
a ceremony that gets skipped.

2.10 THE SYSTEM SHALL allow the owner to read every console in a **read-only degraded mode** when
its data source is unavailable, showing the last known state with an explicit staleness banner,
rather than a hard error — because a console that shows nothing when Postgres hiccups is worse than
one that shows yesterday.

---

### Requirement 3 — The dashboard, including the Confirmed-layout launch metric

**User Story:** As the owner, I want to open one screen and know in five seconds whether anything
needs me today, so that the console is something I look at and not something I avoid.

#### Acceptance Criteria

3.1 THE SYSTEM SHALL render the dashboard at `/admin` as a **Server Component**, so order,
customer and message data never ship wholesale to the browser.

3.2 THE SYSTEM SHALL show, permanently and without a menu click, the **Confirmed Layout count** as
the launch metric required by `fitment-engine` Requirement 15.7 and by
`fitment-engine/tasks.md` 2.9 / 8.2, read through a single call to `liveLayoutCount()`.

3.3 THE SYSTEM SHALL show the launch metric alongside the total, inferred, draft and retired
Layout counts, so the number is never read without its denominator, and SHALL show the count of
`demandLogged` refusals in the same period.

3.4 THE SYSTEM SHALL show a **Today** strip: orders received today, orders awaiting the owner's
confirmation, orders confirmed and not yet dispatched, and orders delivered today.

3.5 THE SYSTEM SHALL show a **Needs you** list, ranked, containing at minimum: WhatsApp
confirmations still unanswered, orders whose 12-hour follow-up window has elapsed
(`whatsapp-engine`), any payment in `pending` beyond its attempt window (`payments-paystack`), and
the top five demand-log entries from the last 24 hours.

3.6 THE SYSTEM SHALL show **What changed today** — every audit entry written today, newest first,
each rendered with its `reason` verbatim, so the fat-finger check is the first thing on the screen
rather than something the owner has to go looking for.

3.7 THE SYSTEM SHALL show the last-known revenue figure (sum of `total` on non-cancelled orders
placed today and in the last 7 days) and SHALL label it as gross of refunds, because
`payments-paystack` models `refunded` as a state that does not erase the original `paid`.

3.8 WHEN the database is not yet available THEN THE SYSTEM SHALL render the dashboard with the
launch metric, the Layout status counts, the demand figures and a read-only **Live now** strip
(Confirmed customer names from `confirmedCustomerNames()`), and SHALL render an explicit
`Orders: not available until the database is live` panel in place of the order figures. It SHALL
NOT render zeroes for orders — a zero reads as "no orders" and the truth is "no record".

3.9 THE SYSTEM SHALL render a **ref-code lookup** input at the top of the dashboard, accepting
either an order ref (`LR-…`) or a layout internal code (`TC-2009-2013`), because the owner's first
question every day is "which order is this?".

3.10 WHEN a metric has no data yet THEN THE SYSTEM SHALL render the empty state with the word that
says what is missing ("No orders recorded yet — the database is not live") and SHALL NOT render a
bare `0` next to a label that implies a measurement was taken.

---

### Requirement 4 — Orders: list, detail, status transitions, ref-code lookup

**User Story:** As the owner, I want to see every order the business has taken and move it through
its real life in three taps, so that an order never lives only in a customer's phone.

#### Acceptance Criteria

4.1 THE SYSTEM SHALL render the order list at `/admin/orders` as a Server Component, one row per
order, newest first, showing the order ref, the customer's name, the phone number as a `tel:` link,
the zone, the total via `fmtNaira()`, the confirmation state, the payment state and the age.

4.2 THE SYSTEM SHALL provide filters on the order list: confirmation state
(`unconfirmed | confirmed | cancelled`), payment state, zone, a search over ref / name / phone, and a
last-N-days window. Filters are query parameters so a filtered list is a shareable, reloadable URL.

4.3 THE SYSTEM SHALL render the order detail at `/admin/orders/[ref]` as a Server Component reading
`await params`, showing: the customer block (name, phone as `tel:`, address, zone + ETA), the item
lines with the fitment snapshot (`layoutCode`, `layoutCustomerName`, `layoutEvidenceSource`,
`layoutConfirmedOn`, quoted `priceFrom`) read from the order snapshot and **never** from the live
Layout, the money breakdown (subtotal, shipping, discount, total), the attribution row from
`ad-landing-and-tracking` (`utmSource`, `utmMedium`, `utmCampaign`, `campaign`, `fbclid`, landing
path, first-touch timestamp), the payment state, the WhatsApp message history, and the full
`OrderStatusEvent` history.

4.4 THE SYSTEM SHALL allow only the status transitions that `payments-paystack` declares legal, and
SHALL refuse every other transition at the action, not merely hide the control. In particular
`cancelled` is terminal, `paid` never returns to unpaid, and `unconfirmed → confirmed` is written by
the WhatsApp Confirm press or by the owner — never by a payment webhook.

4.5 WHEN a state-changing action is invoked THEN THE SYSTEM SHALL require a non-empty `reason` of at
least 10 characters, SHALL record it verbatim on the `OrderStatusEvent`, and SHALL refuse the change
without it.

4.6 WHEN a state-changing action is invoked THEN THE SYSTEM SHALL write an `OrderStatusEvent` and an
`AuditEntry` in the same operation, and SHALL revalidate the affected routes with `revalidatePath`
after both succeed.

4.7 WHEN an order is cancelled or marked refunded THEN THE SYSTEM SHALL additionally require a
`reason` drawn from a closed set plus free text, render the customer's name, phone and total inside
the confirmation step, and require a second explicit press. These are the only two actions in the
whole console that are treated as high-stakes.

4.8 THE SYSTEM SHALL resolve the ref-code lookup in Requirement 3.9 by matching against the order
ref first, and a layout internal code second; on a layout code it SHALL link into the
`fitment-engine` layout screen rather than duplicating it.

4.9 THE SYSTEM SHALL surface a **Resend on WhatsApp** action that builds a prefilled message through
`whatsappLink()` — the single `wa.me` builder in `src/lib/whatsapp.ts:38-40` — carrying the order
ref, the item lines, the total and the delivery zone ETA, so the owner is never retyping a quote.

4.10 WHEN an order was placed against a Layout that has since been split or retired THEN THE SYSTEM
SHALL still display the order's snapshotted fitment fields, and SHALL display the current Layout
status alongside as an informational note, never as a replacement for the snapshot.

4.11 WHEN the database is not yet available THEN THE SYSTEM SHALL render an explicit
unavailable state at `/admin/orders` and `/admin/orders/[ref]` explaining that no server-side order
record exists, and SHALL NOT attempt to read `localStorage` from a server component.

---

### Requirement 5 — The WhatsApp queue view

**User Story:** As the owner, I want one screen that tells me what WhatsApp is waiting on me for, so
that a customer who pressed Confirm and got no reaction is found in seconds.

#### Acceptance Criteria

5.1 THE SYSTEM SHALL render the queue at `/admin/inbox` as a **read-only** Server Component. It
SHALL NOT send, resend, template, or mutate a message. `whatsapp-engine` owns every outbound path;
this view reads its state.

5.2 THE SYSTEM SHALL list, newest first: outbound confirmations awaiting a press; inbound Confirm
presses received; inbound Cancel presses received; **unmatched presses** and **sender mismatches**,
which `whatsapp-engine`'s error-handling table names as the two queue entries an operator must see;
and template-health events (`message_template_status_update`, `template_category_update`).

5.3 EACH queue row SHALL show the order ref, the customer's phone, the last template name, the
delivery status (`sent` / `delivered` / `read` / `failed` / `played`), the age, and — for an
unanswered order — whether the 12-hour follow-up has already been sent.

5.4 WHEN a press is unmatched or mismatched THEN THE SYSTEM SHALL show what was received, what was
expected, and SHALL NOT offer any action that would change an order, because `whatsapp-engine` is
explicit that a mismatched sender "changes nothing".

5.5 WHEN a template has been recategorised to `MARKETING` THEN THE SYSTEM SHALL show it as a
pricing alert at the top of the queue, because a `MARKETING` classification is billable everywhere
and is silent otherwise.

5.6 THE SYSTEM SHALL render a clearly-worded empty state when there is no Cloud API traffic — which
is today's real state, because `src/lib/whatsapp.ts` builds deep links only and there is no send, no
template and no webhook anywhere in the app.

5.7 THE SYSTEM SHALL NOT attempt to define a template body, a button label, or a follow-up
schedule. `whatsapp-engine` owns all four templates and the sweep.

---

### Requirement 6 — The demand log view: ranked refusals as the sourcing roadmap

**User Story:** As the owner, I want to see the cars people asked for that I do not carry, ranked,
so that my next sourcing decision is made from the website's own data instead of from a hunch.

#### Acceptance Criteria

6.1 THE SYSTEM SHALL render the ranked demand log at `/admin/demand` as a Server Component, ranked
by volume descending, aggregated by make + model, so that the most-requested unstocked model is the
first row.

6.2 THE SYSTEM SHALL show, per row: make, model, the year range asked for, the request count, the
first and most recent `askedAt`, the source (`fit_check` | `coming_soon` | `whatsapp` |
`order_item_no_layout`), and the campaign attribution already captured by `ad-landing-and-tracking`.

6.3 THE SYSTEM SHALL provide a window filter (last 7 / 30 / all days) so a spike from one ad
campaign is distinguishable from genuine sustained demand — the distinction that decides whether to
spend on a supplier or to stop an ad.

6.4 WHEN a demand row has no corresponding Layout THEN THE SYSTEM SHALL offer a single action, "Plan
this layout", that deep-links into `fitment-engine`'s grouping screen with the make and model
pre-filled. THE SYSTEM SHALL NOT create a Vehicle, a Layout or a Mapping itself.

6.5 WHEN a demand row has become a Confirmed Layout THEN THE SYSTEM SHALL show the layout's internal
code and a link to it, and SHALL keep the historical count — a request that became a sale is the
proof that the roadmap works, and deleting it destroys the evidence.

6.6 THE SYSTEM SHALL define no UTM key of its own. It reads whatever first-party attribution
`ad-landing-and-tracking` already captured and adds nothing.

6.7 THE SYSTEM SHALL work with **no database**, reading the Phase 0 sink: the structured JSON lines
`fitment-engine` writes from `POST /api/demand`, and the best-effort `data/demand.jsonl` where the
filesystem permits. When neither is readable the view SHALL say so and name where the data is
actually going, rather than rendering an empty ranked table that looks like "nobody has asked for
anything".

6.8 THE SYSTEM SHALL refuse to show a demand count it cannot read rather than showing `0`, because
the fitment spec is explicit that the demand log is the only sourcing signal the site generates
(Requirement 11.3, 15.3).

---

### Requirement 7 — Catalogue and pricing administration

**User Story:** As the owner, I want to see every product, its two prices and its stock state in one
list, so that a price I quoted in WhatsApp is a price I can find in thirty seconds.

#### Acceptance Criteria

7.1 THE SYSTEM SHALL render the catalogue at `/admin/catalogue` as a Server Component listing all
seven `PRODUCTS` with `slug`, name, category, `regular`, `premium`, `threeRowSurcharge`, the derived
`priceRange()` via `fmtNaira()`, `rowApplicable`, the image count against the number of paths that
actually resolve, and the count of `LayoutVariant.priceFrom` rows now overriding the catalogue price.

7.2 THE SYSTEM SHALL flag, per product, the state that is currently true and expensive: **no
photographs that resolve** (15 of 21 referenced paths are missing from `public/products/`),
**no Layout** and therefore no `priceFrom` (so it cannot be sold through `/fit-check`), and **two
prices for one product** where the PDP `priceRange()` and a layout's `priceFrom` disagree.

7.3 THE SYSTEM SHALL show a per-zone delivery table read from `src/data/locations.ts` — the four
zones, their `fee` and their `eta` — beside the pricing table, because the two numbers are quoted
together and must be changed together.

7.4 WHEN a price is changed THEN THE SYSTEM SHALL require a confirmation step naming the product, the
old figure and the new figure in naira, SHALL require a `reason` of at least 10 characters, SHALL
write an `AuditEntry` carrying the before and after values, and SHALL `revalidatePath` the
storefront routes that render that price so `/shop`, `/products/[slug]` and `/fit-finder` are
consistent with it.

7.5 WHEN a `LayoutVariant.priceFrom` exists for a product THEN THE SYSTEM SHALL display the
catalogue price as **superseded** rather than authoritative, matching locked decision 3 and
`fitment-engine` Requirement 16.5, and SHALL NOT let an edit to the catalogue price silently
overwrite a layout price.

7.6 WHEN the database is not yet available THEN THE SYSTEM SHALL render the catalogue **read-only**
from `src/data/products.ts` and `src/data/locations.ts`, and SHALL hide every edit affordance
entirely rather than showing a control that cannot work.

---

### Requirement 8 — The media view

**User Story:** As the owner, I want to see which product actually has a photograph and which is
still a grey box, so that I stop sending paid traffic to pages that render empty.

#### Acceptance Criteria

8.1 THE SYSTEM SHALL render `/admin/media` as a grid, one cell per product, showing the photographs
that **resolve** in `public/products/`, the referenced paths that do not, and an explicit
`0 of 3` style count — because `SafeImage` renders `null` on error, so a missing file is invisible on
the storefront and must be loud here.

8.2 THE SYSTEM SHALL report the unresolved-path list verbatim, grouped by product, so the owner can
hand it to whoever processes `footage/`.

8.3 THE SYSTEM SHALL show the same grid for Layout ImageSets — one cell per Layout, per angle
(`driver`, `passenger`, `rear`, `boot`, `detail`, `comparison`) — with the required angle per
`kind` marked as missing, and SHALL link each cell to the `fitment-engine` layout screen rather than
editing it here.

8.4 THE SYSTEM SHALL NOT implement file upload, cropping, EXIF rotation, resizing or transcoding.
Those are `storefront-catalog` and `trust-and-policies` tasks against `Luxeride/footage/`, and the
three photographs there carry an EXIF orientation tag of 6 that must be applied on decode.

8.5 WHEN a required angle is missing on a Confirmed Layout THEN THE SYSTEM SHALL warn **without**
blocking anything, because a genuine physical confirmation is worth more than a photograph.

---

### Requirement 9 — The audit log viewer

**User Story:** As the sole person who will ever change this data, I want to be able to read back
exactly what I changed and why, so that a mistake is obvious to me a week later.

#### Acceptance Criteria

9.1 THE SYSTEM SHALL render `/admin/audit` as a Server Component reading an **append-only** log, and
SHALL expose no edit control, no delete control and no bulk-delete affordance anywhere in the
console.

9.2 THE SYSTEM SHALL default the view to **the last 7 days**, because the question the owner opens
this screen with is "what did I do this week".

9.3 EACH entry SHALL render: timestamp, actor (`owner`), the entity type, the entity's human
identifier, the action, the before → after value for every changed field, and the operator's `reason`
**verbatim and untruncated**.

9.4 THE SYSTEM SHALL make money and status fields visually distinct from text fields, so that a
price change or an order cancellation is the first thing the eye lands on.

9.5 THE SYSTEM SHALL support a filter by entity type, by action, and by a free-text search over the
identifier and the reason, as query parameters.

9.6 WHEN a state-changing action is refused — the transition was illegal, the reason was too short,
the evidence gate was unmet — THEN THE SYSTEM SHALL write the **refusal** to the audit log as well
as the acceptance, because a refused transition is the interesting one during a dispute.

9.7 WHEN the database is not yet available THEN THE SYSTEM SHALL render the audit viewer with an
explicit statement that there is no durable store yet, and SHALL NOT render an empty table that reads
as "nothing has ever changed". The console is read-only in that era, so the honest statement is
also the true one.

---

### Requirement 10 — The boundary with `fitment-engine`

**User Story:** As the owner, I want one console with one set of rules, not two consoles arguing
about the same car, so that I never wonder which screen is authoritative.

#### Acceptance Criteria

10.1 **THE SYSTEM SHALL NOT implement the six fitment admin screens.**
`fitment-engine` Requirement 5 owns them and its acceptance criteria stand: vehicles list (5.1),
grouping view (5.2), layout detail (5.3), exclusions (5.4), demand log (5.5), audit log (5.6).
This spec does not restate, re-implement, re-test or extend any of them, and does not add a second
navigation entry for any of them.

10.2 THE SYSTEM SHALL provide the following to `fitment-engine`, and nothing else: the shell at
`src/app/admin/(console)/layout.tsx` (Requirement 1.2), the guard at `src/proxy.ts` and
`src/lib/admin-auth.ts` (Requirements 2.1–2.3), the `requireAdmin()` first-statement rule for every
action (2.2), the shared `revalidatePath` discipline, and the existing design tokens (1.7).

10.3 THE SYSTEM SHALL nest `fitment-engine`'s six screens inside this shell at the `/admin/fitment/*`
prefix, so they inherit the guard, the navigation and the phone layout without modification.

10.4 **Demand log — the one overlap, resolved explicitly.** `fitment-engine` Requirement 5.5 asks for
a demand log screen; this spec owns `/admin/demand` (Requirement 6) as the **cross-source ranked
roadmap**. Resolution: `fitment-engine` keeps ownership of the *capture* (`POST /api/demand`, its
Requirement 11) and of the `DemandLog` table; **admin-console implements the single screen**, and
that screen satisfies `fitment-engine` Requirement 5.5 (ranked by volume) as a superset, because it
ranks every refusal source, not only `/fit-check` refusals. **If `fitment-engine` builds a separate
demand screen first, this route is deleted and replaced by a navigation link — one screen, not two.**
Cross-referenced in `fitment-engine/tasks.md` 8.7.

10.5 **Audit log — the second overlap, resolved explicitly.** `fitment-engine` Requirement 12 owns
the fitment *audit semantics* (what a Layout change means, `confirmationNote` stored verbatim,
append-only, revision on meaning-change) and its tasks.md 10.1 owns the writer
`src/lib/audit.ts`. **admin-console owns the single viewer** at `/admin/audit` (Requirement 9) over
the same append-only table, with the fitment entities (`layout`, `mapping`, `layoutVariant`,
`imageSet`, `exclusion`) rendered as `fitment-engine` specifies and the operational entities
(`order`, `orderStatus`, `product`, `layoutVariant.priceFrom`, `publish`, `media`) added by this
spec. One table, one viewer, one filter. **If `fitment-engine` builds a separate audit screen first,
this route is deleted and replaced by a navigation link.**

10.6 THE SYSTEM SHALL render fitment data in the console using `fitment-engine`'s vocabulary
exactly — `internalCode` such as `TC-2009-2013`, `customerName`, the four `LayoutStatus` values
(`draft` / `inferred` / `confirmed` / `retired`), and the three evidence values
(`physical-fitting` / `supplier-confirmation` / `oem-floor-pan`) — and SHALL NOT invent a parallel
status, a second evidence vocabulary, or a second code format.

10.7 THE SYSTEM SHALL respect all four locked decisions in every screen it renders: owner-only
editing, Confirmed-only on the front end, price on the site as `priceFrom`, and one layout = one
make. In particular the console SHALL NOT offer any control that would loosen the evidence gate,
and SHALL NOT display a Layout to the owner without its `status` and `confirmationNote` beside it.

10.8 THE SYSTEM SHALL honour `fitment-engine` Requirement 5.7 — opening any of its six screens
without an authenticated session SHALL deny the request and render no layout, price, mapping or
demand data. The proxy matcher `['/admin/:path*']` covers `/admin/fitment/*` automatically.

---

### Requirement 11 — What is possible before the database, and what is not

**User Story:** As the owner, I want to know on day one which parts of the console I can actually
use, so that I do not spend a week building screens that have nothing to read.

#### Acceptance Criteria

11.1 THE SYSTEM SHALL have a working P0 that requires **no database, no migration, no
`@prisma/client` import and no `prisma/migrations/` directory**: the guard, the shell, the
dashboard's launch metric and refusal counts, the ranked demand view, the read-only catalogue, the
media grid, and the ref-code lookup resolving **layout** refs.

11.2 THE SYSTEM SHALL render an explicit, named unavailable state — never a zero, never a blank
table — for every screen that cannot be served: `/admin/orders`, `/admin/orders/[ref]`,
`/admin/inbox`, and every mutation.

11.3 THE SYSTEM SHALL be **read-only in its entirety** until a durable audit store exists. THE
SYSTEM SHALL NOT offer a single state-changing control before the database is live, because
`fitment-engine` Requirement 12 makes the audit log binding and an unlogged mutation is the one thing
this console must never produce.

11.4 THE SYSTEM SHALL treat the Confirmed-layout count and the ranked refusal list as the P0
launch instrument, because `fitment-engine` Requirement 15.7 makes the count a launch metric that
must be written down on go-live day, and Requirement 15.3 makes the demand log binding from day one
including in its Phase 0 with no database.

11.5 THE SYSTEM SHALL depend on `commerce-backend` for: the Postgres instance and migrations, the
`Order` / `OrderItem` / `OrderStatusEvent` / `AuditEntry` / `DemandLog` tables, the Prisma client
singleton, and the fix to the broken `prisma/seed.ts` import that currently makes `npm run build`
fail. It SHALL depend on `whatsapp-engine` for the message log, the `Order` extension columns and
the follow-up timestamp, on `payments-paystack` for the payment-state vocabulary and the
`OrderStatusEvent` writer, and on `ad-landing-and-tracking` for the attribution fields it displays.

11.6 THE SYSTEM SHALL read order and message data **only** through the interfaces those specs
define, and SHALL NOT re-derive an order, a message status, a payment state or a UTM taxonomy of its
own.

11.7 THE SYSTEM SHALL keep its own data-free: no console-owned table, no console-owned migration, and
no column added to an existing table that no other spec reads.

---

### Requirement 12 — Destructive and state-changing actions

**User Story:** As the only person who will ever press these buttons, I want the console to make me
stop and think before it changes something I cannot undo, so that one fat-fingered tap is not the
whole risk.

#### Acceptance Criteria

12.1 THE SYSTEM SHALL classify every console action into exactly one of three tiers — **read**,
**state-changing**, **destructive** — and SHALL apply the confirmation rules per tier. A control
that is not classified SHALL NOT render.

12.2 **Read** actions SHALL require no confirmation. **State-changing** actions (an order status
transition, a price change, a catalogue edit, a media retag) SHALL require a confirm step that names
the target, and SHALL require a `reason` of at least 10 characters. **Destructive** actions (cancel
an order, mark refunded, retire a Layout, unpublish, delete a record) SHALL require, in addition, a
second explicit press and SHALL require the reason to be typed rather than selected.

12.3 THE SYSTEM SHALL render the irreversible consequence in the confirmation step in the words the
owner would use — "this cancels the order and tells the customer nothing" — and SHALL NOT rely on the
word "Confirm" alone.

12.4 THE SYSTEM SHALL place the primary destructive control **away from** the primary read control,
and SHALL NOT place a destructive control within one tap-target height of a read control on a phone.

12.5 THE SYSTEM SHALL make the confirm step a deliberate interaction — a sheet or a dedicated route,
not a native `confirm()` dialog, and never a toggle that is already in the "on" position.

12.6 WHEN a state-changing action is submitted THEN THE SYSTEM SHALL write the audit entry **before**
returning success to the client, and SHALL NOT report success on a partial write.

12.7 THE SYSTEM SHALL offer **undo by reason, not by delete**: a mistaken transition to a reversible
state SHALL be corrected by a second, separately-audited transition carrying the original ref, so
the log reads as a narrative rather than as an erasure.

12.8 THE SYSTEM SHALL NOT implement a bulk-action affordance for any destructive operation. One
order, one confirmation.

---

### Requirement 13 — Mobile-first operator ergonomics

**User Story:** As the owner, I want the four things I do every day to work on the phone I am
already holding, so that trading never stops because I sat down at a desk.

#### Acceptance Criteria

13.1 THE SYSTEM SHALL be built phone-first: the primary viewport is a phone, and the desktop layout
is the enhancement.

13.2 THE SYSTEM SHALL keep the following fully usable one-handed on a phone screen: the dashboard,
the order list, a single order's detail, the status transition, the ref-code lookup, the ranked
demand list, and copying a WhatsApp reply.

13.3 THE SYSTEM MAY assume a desktop for the following, and SHALL still make them reachable and
correct on a phone without promising a good experience: layout grouping multi-select, the layout
image manager, catalogue price editing across many products, media grid management, and audit
browsing with wide filters.

13.4 THE SYSTEM SHALL keep every interactive control at a minimum of 44 × 44 CSS pixels on a phone,
and SHALL never place a destructive control within 24 CSS pixels of a different control's tap target.

13.5 THE SYSTEM SHALL make the order detail's single most likely next action — confirm or cancel —
reachable without scrolling on a 360 × 640 viewport, because that screen is opened from a WhatsApp
notification.

13.6 THE SYSTEM SHALL NOT require hover, drag, double-click, right-click, a keyboard shortcut, or a
horizontal scroll to complete any read or any state-changing action.

13.7 THE SYSTEM SHALL use `font-mono` for every ref code, every phone number, every money figure and
every timestamp, so that a ref can be read aloud or copied correctly from a phone screen.

13.8 THE SYSTEM SHALL load the mobile payload without shipping the storefront's client bundle — the
`Header` cart badge and the `persist` hydration dance in `Header.tsx:7-16` are storefront concerns
and have no business in an admin request.

---

### Requirement 14 — Honest empty and failure states

**User Story:** As the owner, I want the console to tell me the truth when it has nothing, so that an
empty table is never mistaken for "no business" or "nothing wrong".

#### Acceptance Criteria

14.1 THE SYSTEM SHALL render a distinct, worded state for each of: nothing recorded yet; the data
source unavailable; the feature not built yet; and the filter matched nothing. These are four
different sentences and SHALL NOT be collapsed into one empty box.

14.2 THE SYSTEM SHALL render the **last known state with an explicit staleness banner** when a data
source fails, together with the time the state was last read, so a stale number is never
indistinguishable from a fresh one.

14.3 WHEN a data source throws THEN THE SYSTEM SHALL log the cause server-side with enough context to
act on, and SHALL render a plain-language failure to the owner that names the source and the next
thing to try — never a stack trace and never a raw database error string.

14.4 THE SYSTEM SHALL NOT swallow an error to make a screen look healthy. An empty ranking for
demand, a blank order list, or a zero Confirmed count SHALL each be either true or accompanied by
the sentence saying it is not true yet.

14.5 WHEN the `fitment-engine` module fails its load-time assertion THEN THE SYSTEM SHALL render the
dashboard with the launch metric replaced by an explicit failure panel naming the offending
`internalCode`, and SHALL NOT render a stale or zero count.

---

### Requirement 15 — Cross-spec data displayed, never re-derived

**User Story:** As the owner, I want the numbers the console shows to be the same numbers the rest of
the system uses, so that a report I read is a report I can act on.

#### Acceptance Criteria

15.1 THE SYSTEM SHALL display the campaign attribution captured by `ad-landing-and-tracking` on each
order — `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, the resolved `campaign` registry key,
`fbclid`, landing path and `firstTouchedAt` — and SHALL define no attribution key of its own.

15.2 THE SYSTEM SHALL display the payment state using `payments-paystack`'s vocabulary
(`unpaid`, `pending`, `paid`, `partial`, `failed`, `expired`, `refunded`) and SHALL NOT re-derive
whether an order is paid from a browser value, a `metadata` field or a client assertion.

15.3 THE SYSTEM SHALL display the WhatsApp confirmation state using `whatsapp-engine`'s vocabulary
(`unconfirmed`, `confirmed`, `cancelled`) and SHALL read the message log for the underlying evidence
rather than asserting a state.

15.4 THE SYSTEM SHALL display a **review-request** action on an order in the `delivered` state,
which opens a prefilled WhatsApp message built through `whatsappLink()`. The capture, the storage and
any publication of a review belong to `trust-and-policies`; the console only offers the
conversation.

15.5 THE SYSTEM SHALL display money through `fmtNaira()` from `src/lib/pricing.ts` and SHALL NOT
format a naira figure with any other formatter, so the console and the storefront cannot disagree
about a price by a rounding rule.

15.6 THE SYSTEM SHALL display fitment fields using `fitment-engine`'s names, formatting and
assertion rules, and SHALL NOT re-implement the evidence gate, the `priceFrom` authority, or the
internal-code format check.

---

### Requirement 16 — Reading the code before trusting the console

**User Story:** As the owner, I want the console to show me the state of the thing I am about to
change, so that I am not confirming a change to a value I have not seen.

#### Acceptance Criteria

16.1 WHEN a confirm step opens THEN THE SYSTEM SHALL show the current value of every field the
action will change, read at render time, so the confirmation cannot be made against a stale figure
the owner has not seen.

16.2 WHEN the owner has the console open on a phone and a WhatsApp message arrives for the order on
screen THEN THE SYSTEM SHALL NOT claim the screen is current. It SHALL show the last-read time, and
the owner SHALL be able to pull to refresh in one gesture.

16.3 THE SYSTEM SHALL show the record count behind every aggregate, so "17 unconfirmed" is
inspectable rather than a number to trust.

16.4 WHEN a figure on the dashboard is derived from another spec's data THEN THE SYSTEM SHALL name
the source spec on the card, so that when it is wrong the owner knows which spec to fix.
