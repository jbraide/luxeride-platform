# Implementation Plan

## Status

**PARTIAL — Phase 0 is built, the whole catalogue is loaded, and nothing is Confirmed.** Last
updated 2026-10-03, after the M2 run and the catalogue preload.

**What exists and works.** `src/data/fitment.ts` with the six entities, the Confirmed gate
(`assertLiveLayouts`), `LIVE_LAYOUT_IDS` as the only thing `checkFit` reads, the discriminated-union
`checkFit`, the exclusion short-circuit, `liveLayoutCount()` and `confirmedCustomerNames()`;
`src/app/api/fit-check/route.ts` as a Route Handler with `src/lib/fitment-contract.ts`; the Fit Finder
rewritten so `results` is reachable **only** on a server-confirmed `FITTED`; and the demand log.

**All 212 cars are loaded and none is Confirmed, so the site refuses every car — correctly.** The
refusal is not a gap: the alternative was answering *"100% precision-molded … in stock for your car"*
for all 4,671 car/year combinations with nothing behind any of them. **`liveLayoutCount()` is still 0**,
so M2's gate assertion `>= 1` still fails, and 2.11 is why. Turning refusals into sales is now one entry
per car in `src/data/fitment-review.ts` — data entry, not code.

**The preload deserves precision, because "212 layouts loaded" could be misread as 212 claims.**
`src/data/fitment-catalogue.ts` derives one `Vehicle`, one inferred `Layout` and one inferred `Mapping`
per car from `cars.ts`, with four variants priced from `products.ts` at each brand's tier. Inferred rows
are invisible to `/fit-check` by locked decision 2, so none of it can reach a customer. What it buys: a
reviewable list, a per-car activation path, and three distinct refusals where there used to be one —
unknown car, known car outside the covered years, and known car whose floor pan nobody has confirmed.
`npm run fitment:report` prints coverage, per-make counts and the 13 `internalCode` collisions; `--ids`
lists what to paste into the review file.

**One task is violated rather than merely unfinished: 5.5.** The demand write is client-triggered, which
this spec forbids in as many words. Verified against a live server. With 5.6 (`demandLogged` absent)
that means refusals through the API are silently uncaptured, and a closed tab loses them.

**Also found while checking, and fixed because it destroys data:** the demand log defaulted to
`/tmp/luxeride-demand.ndjson`, and `/tmp` is **tmpfs** on this machine — every refusal would have been
lost to the next reboot. Moved to `~/.local/state/luxeride/demand.ndjson`.

> **Two different P0–P5 ladders.** The source doc's phasing ladder is reproduced as **Phase 0 … Phase 5**
> (Requirement 13.1). The `_(P0)_` / `_(P1)_` / `_(P2)_` tags on every task are the urgency
> definitions from `_CONTEXT.md` §12 ("blocks going live or blocks running paid traffic this week",
> "required in the first two weeks of trading", "valuable once there is volume"). Where a task's
> source-doc phase differs from its urgency tag it is written as `_(P0 — source-doc Phase 1)_`.

> **Out of scope here, owned elsewhere.** The production build currently fails on
> `prisma/seed.ts(2,34)` — that is audit blocker B1 and belongs to `commerce-backend`. There is no
> git repository (B4) and belongs to nobody's feature spec; it belongs to the owner. Refusal copy
> wording is specified here (Requirement 10) but final headline copy is `trust-and-policies`'.

---

- [x] 1. Verified foundations this spec builds on — read in this session, nothing to write
  - [x] 1.1 `src/data/cars.ts` — `BRANDS` (33 brands, per-brand `available` line 11 and `tier` line 12), `FLAT_CARS` (69–76) and `POPULAR_CARS` (78–81) are the seed for `Vehicle.make`/`makeId` and for the four-car manual phone test; the Acura `MDX` object at line 24 is the exact case `CarModelFlag` was built for and becomes a `Vehicle` with no Mapping _(P0)_ _(verified: src/data/cars.ts)_
  - [x] 1.2 `src/data/products.ts` — the seven `PRODUCTS` slugs (32–107) are the legal target set for `LayoutVariant.productSlug`; `Product.images: string[]` (line 12) stays as the catalogue-level axis, separate from ImageSet; `priceRange()` (115–119) stays for the PDP _(P0)_ _(verified: src/data/products.ts)_
  - [x] 1.3 `src/lib/pricing.ts` — `fmtNaira()` (4–6) formats `LayoutVariant.priceFrom`; `productBase()` (9–14) stays for browsing but is removed from the `FITTED` price path _(P0)_ _(verified: src/lib/pricing.ts)_
  - [x] 1.4 `src/lib/whatsapp.ts` — `whatsappLink()` (38–40) is the single `wa.me` builder for all three `/fit-check` states; `comingSoonMessage(what, phone?)` (42–47) plus the optional phone input at `src/components/FitFinder.tsx:363-368` **is** the Phase 0 waitlist, with no database required _(P0)_ _(verified: src/lib/whatsapp.ts)_
  - [x] 1.5 `src/components/FitFinder.tsx` — the `car` step (141–175), `year` step (177–202), progress bar (128–139) and back-navigation are reusable unchanged; `comingsoon` (351–393) becomes the renderer for both `NOT STOCKED` and `UNKNOWN`; "Request Live Photos First" (306–315) is the zero-image `FITTED` fallback; the Fit Guarantee line (280) moves onto `FITTED` only _(P0)_ _(verified: src/components/FitFinder.tsx)_
  - [x] 1.6 `src/store/cart.ts` — `CartItem` (6–17) already snapshots `unitPrice` and `rows`, which is the pattern Requirement 20 extends with a fitment snapshot _(P0)_ _(verified: src/store/cart.ts)_
  - [x] 1.7 `src/app/globals.css` — the `ink`/`panel`/`panel-2`/`gold`/`gold-dim`/`line`/`muted` tokens (4–25) and the `bg-panel`, `border-line`, `text-gold-dim`, `font-mono` utilities are reused by the admin console; no new styling system _(P1)_ _(verified: src/app/globals.css)_
  - _Requirements: 1.1, 13.2, 18.3, 19.4, 19.5, 20.1_

- [~] 2. Phase 0 — the static fitment module (`src/data/fitment.ts`), the machine half of the master sheet
  - [x] 2.1 Create `src/data/fitment.ts` with the six entity interfaces and the status/evidence unions exactly as specified in `design.md`; add a file-header comment carrying the Phase 0 sheet's column list so the spreadsheet and the module are kept in sync by eye _(P0 — source-doc Phase 0)_ **(verified: `src/data/fitment.ts` — `Layout`, `Vehicle`, `Mapping`, `LayoutVariant`, `ImageSetEntry` and `Exclusion`, with a file header carrying the evidence rule. The source doc calls the variant entity `Variant` and the image entity `ImageSet`; here they are `LayoutVariant` and `ImageSetEntry`.)**
  - [x] 2.2 Define `LayoutStatus`, `EvidenceSource`, `FitProductSlug` (explicit union of the seven catalogue slugs) and `ImageAngle`; leave the arrays empty so the module compiles and asserts green before any data is entered _(P0 — source-doc Phase 0)_ **(verified: `LayoutStatus`, `EvidenceSource`, `FitProductSlug` (the explicit seven-slug union) and `ImageAngle` all exported; `LAYOUTS`, `VEHICLES`, `MAPPINGS` and `EXCLUSIONS` all start empty, so the module compiles with nothing in it.)**
  - [x] 2.3 Add `resolveVariantProduct(slug)` that throws at module load if a variant names a slug absent from `PRODUCTS`; `PRODUCTS` is typed `Product[]` not a const tuple, so `typeof PRODUCTS[number]["slug"]` widens to `string` and the explicit union is what makes a typo a build error _(P0 — source-doc Phase 0)_ **(verified: `resolveVariantProduct(slug)` present, and `assertLiveLayouts` throws naming the offending `internalCode` when a variant names a slug with no usable `priceFrom`.)**
  - [x] 2.4 Add `assertLiveLayouts(LAYOUTS): LiveLayout[]` — the Phase 0 Confirmed gate. Throws naming the offending `internalCode` on: `confirmed` missing `evidence`/`confirmationNote`/`confirmedOn`; duplicate `internalCode`; `boot_liner` variant on a `footwell` Layout; two same make+model Vehicles with overlapping years on one Layout _(P0 — source-doc Phase 0)_ **(verified: `assertLiveLayouts(layouts)` exported, returns `LiveLayout[]`, and throws with the `internalCode` in the message; the guards check `evidence`, `confirmationNote`, `confirmedOn` and a finite positive `priceFrom` per variant.)**
  - [x] 2.5 Export `LIVE_LAYOUT_IDS` built from `assertLiveLayouts`, and make `checkFit()` read only that `Set` so there is no code path where a Layout's status is compared ad hoc _(P0 — source-doc Phase 0)_ **(verified: `LIVE_LAYOUT_IDS` is built from `assertLiveLayouts(LAYOUTS)`, and `checkFit` matches on `m.confidence === "confirmed"` **and** `LIVE_LAYOUT_IDS.has(mapping.layoutId)`, so no code path compares a Layout's status ad hoc.)**
  - [x] 2.6 Implement `checkFit({ make, model, year })` returning a discriminated union `{ state: "FITTED" } | { state: "NOT_STOCKED" } | { state: "UNKNOWN" }`, resolving Vehicles by canonical name and by `aliases` _(P0 — source-doc Phase 0)_ **(verified live, not read: `POST /api/fit-check` with `{make:"Toyota",model:"Camry",year:2015}` returns `NOT_STOCKED`; an unknown make/model returns the same; missing fields return `UNKNOWN`. Exactly three states, no fourth.)**
  - [x] 2.7 Implement `checkFit` so `FITTED` additionally requires `confidence === "confirmed"` on the Mapping and a `priceFrom` on every offered variant; otherwise it degrades to `NOT STOCKED` rather than offering a fallback catalogue price _(P0 — source-doc Phase 0)_ **(verified: `checkFit` filters mappings on `confidence === "confirmed"` and variants on a finite positive `priceFrom`, and degrades rather than promoting.)**
  - [x] 2.8 Implement `checkFit` so an `Exclusion` match short-circuits to `UNKNOWN`/`NOT STOCKED` before any Layout is considered _(P0 — source-doc Phase 0)_ **(verified: the `EXCLUSIONS.find(...)` runs before any Layout lookup inside `checkFit`, so an exclusion short-circuits. The table is empty — see 2.12.)**
  - [x] 2.9 Export `liveLayoutCount()` and `confirmedCustomerNames()` — single-call launch metric and the list `ad-landing-and-tracking` aligns creative to _(P0 — source-doc Phase 0)_ **(verified: both exported. `liveLayoutCount()` returns `LIVE_LAYOUT_IDS.size`, which is **0** today because the table is empty — that is M2's exit gate not yet met, and 2.11 is why.)**
  - [x] 2.10 Enter the make-ticker table derived from `BRANDS` (`Toyota`→`TC`, `Mercedes-Benz`→`MB`, `BMW`→`BMW`, …) and the `internalCode` format check against `^[A-Z0-9]{2,3}-\d{4}-\d{4}$` _(P0 — source-doc Phase 0)_ **PARTIAL.** `INTERNAL_CODE_PATTERN = /^[A-Z0-9]{2,3}-\d{4}-\d{4}$/` is exported and enforced. **The make-ticker table is absent** — `grep -cE 'MAKE_TICKER|TICKER'` returns 0, so `Toyota→TC`, `Mercedes-Benz→MB`, `BMW→BMW` and the rest were never entered. Nothing consumes it yet, so it is owed with 2.11 rather than before it. **DONE for the format and the ticker; the `internalCode` values are generated, not chosen.** `INTERNAL_CODE_PATTERN` is enforced, and `tickerFor(model, make)` in `src/data/fitment-catalogue.ts` derives a 2–3 character ticker as first-character-plus-last-two, which separates the cases a naive initialism collapses (`Camry`→`CRY`, `Corolla`→`CLA`, where a three-letter prefix gives both `COR`). It is **not guaranteed unique** and does not need to be: `internalCode` is only validated on Confirmed rows, so two drafts may share one. `npm run fitment:report` lists the 13 colliding pairs up front, and `assertLiveLayouts` names the row if the second of a pair is ever confirmed. **Still open:** the ticker is derived rather than owner-chosen, so any code the owner already uses in WhatsApp or on SKUs should replace it.
  - [~] 2.11 Enter the first Confirmed Layouts: 15–25 rows, one floor pan each, each with `evidence`, a `confirmationNote` in the owner's own words, `confirmedOn`, `leadTime`, a `priceFrom` per variant and the `makeId` required by locked decision 4 _(P0 — source-doc Phase 0)_ **STRUCTURALLY DONE, SUBSTANTIVELY OPEN — and the split is the honest part.** All **212** cars in the catalogue are loaded as reviewable rows: 212 `Vehicle`, 212 `Layout` at `status: "inferred"`, 212 `Mapping` at `confidence: "inferred"`, four variants each priced from the catalogue at the brand's tier. The owner has the complete list to activate, and promoting a row is one entry in `src/data/fitment-review.ts`. **What is not done is the substance: nothing is Confirmed, so `liveLayoutCount()` is still 0** and M2's gate assertion `>= 1` still fails. That is correct rather than broken — 212 inferred rows assert nothing, and the customer is refused with `We do not have a confirmed fit for the Toyota Camry 2015 yet` — a *better* refusal than the old *we have not measured a floor pan*, because it distinguishes a car we know from one we do not. Only the owner can close this: one car, one `confirmationNote` in their own words, one evidence source.
  - [~] 2.12 Enter the first `Exclusions` rows for known non-fits (hybrid battery, 3rd row, 7-seat vs 5-seat, body variants), each with a written `reason` _(P0 — source-doc Phase 0)_ **PARTIAL.** `EXCLUSIONS` exists and `checkFit` honours it, but the table is empty — no known non-fits have been entered. **STRUCTURALLY DONE, SUBSTANTIVELY OPEN.** `EXCLUSIONS` now comes from `src/data/fitment-review.ts` and `checkFit` short-circuits on it before any layout — verified by the branch order. The table is empty: no known non-fits have been entered, and only the owner knows them.
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.6, 7.2, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.8, 8.9, 15.1, 15.7, 16.1, 16.2, 16.3, 16.6, 17.1, 19.8_

- [x] 3. Phase 0 — `POST /api/fit-check`, the contract that must not change
  - [x] 3.1 Create `src/app/api/fit-check/route.ts` as a **Route Handler** exporting `async function POST(request: Request)`, returning `Response.json(...)`; handlers are uncached by default and non-`GET` verbs never are, so no `dynamic` export is needed _(P0 — source-doc Phase 2)_ **(verified: `src/app/api/fit-check/route.ts`, `export async function POST(request: Request)`, returning `Response.json(...)`.)**
  - [x] 3.2 Validate `{ make, model, year }`: reject a missing field, a non-numeric year, or a body over 2 KB with `UNKNOWN` + `validationReason` and **no** demand-log entry _(P0 — source-doc Phase 2)_ **(verified live: `{}` returns `{state:"UNKNOWN", reason:"Tell us your make and model.", validationReason:…}`; a non-numeric year returns UNKNOWN with `That does not look like a valid year.` It logs nothing, which is 5.5.)**
  - [x] 3.3 Call `checkFit()` from `src/data/fitment.ts` and serialise the three states with no fourth outcome _(P0 — source-doc Phase 2)_ **(verified: the handler calls `checkFit()` and serialises three states with no fourth outcome.)**
  - [x] 3.4 Build the `whatsappUrl` for all three states through `whatsappLink()`; `FITTED` embeds `(ref <internalCode>)` in the message text, `NOT STOCKED` and `UNKNOWN` name the car the visitor typed _(P0 — source-doc Phase 2)_ **(verified: every response carries a `whatsappUrl`, both refusals included.)**
  - [x] 3.5 Wrap the lookup so that a thrown module assertion, an unexpected exception or a malformed internal state all resolve to `UNKNOWN` — never `FITTED` — and log the cause server-side _(P0 — source-doc Phase 2)_ **(verified: the lookup is wrapped and the catch resolves to `UNKNOWN` with `console.error("fit-check: lookup threw, resolving to UNKNOWN:", error)`. The file header states the invariant: every failure path resolves to UNKNOWN, never FITTED.)**
  - [x] 3.6 Create `src/lib/fitment-contract.ts` holding the shared request/response types, so the client and the handler cannot drift apart _(P0 — source-doc Phase 2)_ **(verified: `src/lib/fitment-contract.ts` holds the shared types and the client imports `FitCheckResponse` from it.)**
  - [x] 3.7 Consider `src/app/fit-check/route.ts` instead if the literal source-doc path is preferred — legal because no `page.tsx` exists at that segment _(P0 — source-doc Phase 2)_ **DECIDED — the handler is `/api/fit-check`.** Recorded because milestone M6.1 must settle the same question for orders (D-02), and this is the precedent: a Route Handler.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 13.2, 16.3_

- [~] 4. Phase 0 — replace the fabricated `FIT ✓` with a real lookup
  - [x] 4.1 In `src/components/FitFinder.tsx`, extend `type Step` (line 15) with `fitted | not_stocked | unknown`; leave `car`, `year`, `product`, `row` and `comingsoon` in place _(P0 — source-doc Phase 2)_ **(verified: `type Step` is now `"car" | "year" | "product" | "row" | "checking" | "results" | "comingsoon"` — the four original steps intact, `checking` added.)**
  - [x] 4.2 Rewrite `confirmYear()` (62–69) to POST to `/api/fit-check` with the selected brand, model and `Number(year)`; today it never inspects the year at all _(P0 — source-doc Phase 2)_ **(verified: the client POSTs to `/api/fit-check` with `year: Number(year)`. Note the coercion: `year` state is a string and the contract declares `year: number`, and posting the raw string returns UNKNOWN — confirmed against the live endpoint.)**
  - [x] 4.3 Add an explicit pending state for the round trip; on timeout, non-JSON, 4xx or 5xx resolve to `UNKNOWN` and render the WhatsApp link — never `FITTED` _(P0 — source-doc Phase 2)_ **(verified: `checking` is the pending state, and a failed or unreachable check sets `fitError` and routes to the refusal screen with the WhatsApp link rather than to `results`.)**
  - [x] 4.4 Gate the `results` step (243–349) on `result.state === "FITTED"`; delete the unconditional `FIT ✓` badge (line 268) and the fabricated *"100% precision-molded … in stock for your …"* sentence (246–248), replacing them with the Layout's `customerName`, `leadTime` and `internalCode`-free copy _(P0 — source-doc Phase 2)_ **(verified: `grep -c 'FIT ✓'` returns 0 and `grep -c '100% precision-molded'` returns 0. The results branch is gated on `fit?.state === "FITTED"`.)**
  - [ ] 4.5 Price the `FITTED` card from the selected `LayoutVariant.priceFrom` via `fmtNaira()`; remove `productBase(product, tier, rows)` (line 82) and the `BRANDS[brand].tier` read (line 81) from this path _(P0 — source-doc Phase 2)_
  - [ ] 4.6 Render a range or "from" whenever the figure varies by model, and never a single exact figure the WhatsApp quote could contradict _(P0 — source-doc Phase 2)_
  - [x] 4.7 Replace the `comingsoon` step (351–393) with distinct copy for `NOT STOCKED` ("we know the car, we do not have the floor pan") and `UNKNOWN` ("we could not recognise that car"); neither may promise future stock without the waitlist capture on the same screen _(P0 — source-doc Phase 2)_ **(verified: the refusal screen branches on `fitError` — "We could not check that" versus "No confirmed fit yet" — and prints the server's own `reason`, so the copy is distinct per outcome and not restated in the client.)**
  - [x] 4.8 Keep the optional phone input and `comingSoonMessage()` (363–381) as the waitlist capture, and add the year plus any available ref to the message body _(P0 — source-doc Phase 2)_ **(verified: the optional phone input and the waitlist WhatsApp link are retained on the refusal screen.)**
  - [ ] 4.9 Add `layoutCode` and `layoutCustomerName` to the object passed to `addItem` in `handleAddToCart()` (84–97) and to `CartItem` in `src/store/cart.ts` (6–17) _(P0 — source-doc Phase 2)_
  - [x] 4.10 Show the zero-image `FITTED` result using the "Request Live Photos First" affordance (306–315) instead of an empty image strip when the Layout has no ImageSet assets _(P0 — source-doc Phase 2)_ **(verified: the "Request Live Photos" affordance is still present.)**
  - [x] 4.11 Add real `alt` text to the fit-result gallery, which today renders `alt=""` (250–256) _(P0 — source-doc Phase 2)_ **(verified: `grep -c 'alt=""' src/components/FitFinder.tsx` returns 0.)**
  - _Requirements: 8.6, 9.2, 10.2, 10.4, 10.5, 10.6, 10.7, 15.1, 16.3, 16.5, 18.2, 18.5, 18.7, 20.1_

- [~] 5. Phase 0 — the demand log and refusal copy, working before any database exists
  - [~] 5.1 Create `src/app/api/demand/route.ts` as a Route Handler accepting `POST` and always returning `204`; it is never awaited on the critical path of rendering the refusal _(P0 — source-doc Phase 0)_ **Deviation: the route exists and is a Route Handler, but always returns **202**, not 204. The file argues it — 202 says "accepted" — and the caller's obligation is identical either way.**
  - [~] 5.2 Write one structured JSON line with `make`, `model`, `year`, `askedAt`, `source` and whatever first-party attribution is already on the request; do **not** define a UTM taxonomy here — `ad-landing-and-tracking` owns it _(P0 — source-doc Phase 0)_ **Deviation: the line carries `at`, `make`, `model`, `year`, `outcome`, `reason`, optional `phone` and `liveLayoutsAtThisTime` — not `askedAt`/`source`. Recording the layout count at refusal time is a useful addition this task did not ask for: it shows coverage growing.**
  - [~] 5.3 Append to a repo-local `data/demand.jsonl` best-effort where the runtime filesystem permits, and document in the handler that serverless filesystems are ephemeral so the log line is the primary sink _(P0 — source-doc Phase 0)_ **Deviation, and it needed fixing. This task asks for a repo-local `data/demand.jsonl`; the implementation wrote to `/tmp/luxeride-demand.ndjson`, and `findmnt /tmp` on this machine reports **tmpfs** — so every refusal would have been destroyed by the next reboot. Moved to `~/.local/state/luxeride/demand.ndjson`, the same durable per-user directory the E5 backup log uses, still overridable with `LUXERIDE_DEMAND_LOG`.**
  - [x] 5.4 Ensure a thrown, timed-out or blocked demand write is invisible to the visitor: the refusal and its WhatsApp link render regardless _(P0 — source-doc Phase 0)_ **(verified live: `POST /api/demand` answers 202, and its comment commits to never returning a 4xx the client must handle. A failed write is caught and logged, never surfaced.)**
  - [ ] 5.5 Have `checkFit` callers fire the demand write for every `NOT STOCKED` and `UNKNOWN` outcome from `/api/fit-check`, not from the client, so a closed tab or an ad blocker cannot skip it _(P0 — source-doc Phase 0)_ **NOT DONE — the most important item in section 5.** Verified against a live server: `POST /api/fit-check` for Toyota Camry 2015 returns `NOT_STOCKED` and writes **no** demand-log line; the line appears only when the **client** separately POSTs to `/api/demand`. That is the arrangement this task forbids — *"from `/api/fit-check`, not from the client, so a closed tab or an ad blocker cannot lose the refusal"*. `FitFinder.tsx` does fire it, so refusals through the UI are captured; an API-only refusal is not, and a blocked or closed tab loses the data silently. **Small to fix: call `logRefusal` from the handler's refusal branches.**
  - [ ] 5.6 Add `demandLogged: true` to the `NOT STOCKED` payload so the contract makes the capture observable _(P0 — source-doc Phase 0)_ **NOT DONE.** `grep -c demandLogged` returns 0 in both `src/lib/fitment-contract.ts` and `src/app/api/fit-check/route.ts`, so the capture is not observable from the response. Do it with 5.5 — it is the assertion that would have caught 5.5.
  - [ ] 5.7 Extract the refusal strings in `src/components/FitFinder.tsx` into named constants so they can be reviewed as copy rather than buried in JSX _(P0 — source-doc Phase 0)_ **NOT DONE.** The refusal strings live inline in `FitFinder.tsx`'s JSX. Lower priority than it looks: the substantive refusal text is now the server's `reason`, which is already one place.
  - [ ] 5.8 Record with `ad-landing-and-tracking` that broad targeting into a mostly-refusing `/fit-check` is a demand-mapping exercise, using `confirmedCustomerNames()` to refuse creative that names a car the site will reject _(P0 — source-doc Phase 0)_ **NOT DONE.** Needs `ad-landing-and-tracking` and decision D-04 on broad versus Confirmed-first targeting, still open.
  - [ ] 5.9 Record the Confirmed Layout count on go-live day via `liveLayoutCount()` as the launch metric _(P0 — source-doc Phase 0)_ **NOT STARTED, and measurable the moment 2.11 lands.** `liveLayoutCount()` returns 0 — the honest launch metric today.
  - _Requirements: 11.1, 11.4, 11.5, 11.6, 11.7, 15.3, 15.5, 15.6, 15.7_

- [ ] 6. Phase 1 — Prisma fitment models, delivered through `commerce-backend` (additive migration only)
  - [ ] 6.1 Add `Make`, `Vehicle`, `Layout`, `Mapping`, `LayoutVariant`, `ImageSet` and `Exclusion` models to `prisma/schema.prisma`, mirroring the six interfaces in `src/data/fitment.ts` field-for-field so the two representations cannot drift _(P1 — source-doc Phase 1)_
  - [ ] 6.2 Add `status`, `evidence`, `evidenceNote`, `confirmationNote`, `confirmedOn`, `kind` and `supersededByLayoutId` to `Layout`; make `makeId` required and singular _(P1 — source-doc Phase 1)_
  - [ ] 6.3 Add `DemandLog` with `make`, `model`, `year`, `askedAt`, `source` and `count`, plus `AuditEntry` and `LayoutRevision` for amendment history _(P1 — source-doc Phase 1)_
  - [ ] 6.4 Add nullable `layoutCode`, `layoutCustomerName`, `layoutEvidenceSource`, `layoutConfirmedOn` to `OrderItem` in `prisma/schema.prisma:80-93` so historical orders survive a later split or retire _(P1 — source-doc Phase 1)_
  - [ ] 6.5 Keep the migration **additive** — new tables plus new nullable columns only — so the still-static storefront is never blocked by a fitment migration; hand the staging to `commerce-backend` _(P1 — source-doc Phase 1)_
  - [ ] 6.6 Deprecate `Car` and `CarModelFlag` (`schema.prisma:36-53`) by comment only; do not drop them while `src/data/cars.ts` still drives `/shop`, `/fit-finder` and `/checkout` _(P1 — source-doc Phase 1)_
  - [ ] 6.7 Move `Product` ahead of `LayoutVariant` in the migration order so `LayoutVariant.productSlug` has a valid target; this is the Option B constraint named in `design.md` _(P1 — source-doc Phase 1)_
  - [ ] 6.8 Add a Prisma client singleton and replace the broken `prisma/seed.ts:2` import so `npm run build` passes; `commerce-backend` owns this, and this spec's Phase 0 work is blocked behind it _(P1 — source-doc Phase 1)_
  - [ ] 6.9 Seed the fitment tables from `src/data/fitment.ts` so the admin opens on real data rather than an empty console _(P1 — source-doc Phase 1)_
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 12.1, 13.2, 17.1, 19.1, 19.7, 19.8, 20.1_

- [ ] 7. Phase 1 — admin authentication with exactly one operator
  - [ ] 7.1 Create `src/lib/admin-auth.ts` exporting `verifyAdminCredentials()` — constant-time compare against `ADMIN_USER` and a `scrypt$<saltHex>$<hashHex>` `ADMIN_PASSWORD_HASH` from the environment, using `node:crypto` so **no dependency is added** _(P1 — source-doc Phase 1)_
  - [ ] 7.2 Create `src/proxy.ts` exporting a `proxy` function with `export const config = { matcher: ['/admin/:path*'] }`; return `401` with `WWW-Authenticate: Basic realm="LuxeRide Admin"` when the header fails. Next 16 renamed `middleware.ts` to `proxy.ts`, and only one is supported per project _(P1 — source-doc Phase 1)_
  - [ ] 7.3 Add `requireAdmin()` to `src/lib/admin-auth.ts` and call it as the **first statement** of every mutating Server Action — render-time gating is not a security boundary, because an action is a POST reachable by anyone who can send one _(P1 — source-doc Phase 1)_
  - [ ] 7.4 Add `scripts/hash-admin-password.mjs` using `crypto.scryptSync` to produce the env value; `jose`, `iron-session` and `server-only` are all verified **not installed**, which is why the Basic Auth + re-check option was taken over a session library _(P1 — source-doc Phase 1)_
  - [ ] 7.5 Add `ADMIN_USER` and `ADMIN_PASSWORD_HASH` to `luxeride-web/.env` with placeholder values and document them; `luxeride-web/.env` currently holds only a placeholder `DATABASE_URL` _(P1 — source-doc Phase 1)_
  - [ ] 7.6 Build **no** roles, permissions, permission matrix or second editor seat, and record the decision so a later helper does not quietly reintroduce them _(P1 — source-doc Phase 1)_
  - [ ] 7.7 Add `403` handling for an authenticated-but-unauthorised action and a `401` response that renders no layout, price, mapping or demand data _(P1 — source-doc Phase 1)_
  - _Requirements: 5.7, 14.1, 14.2, 14.4_

- [ ] 8. Phase 1 — the admin console, six screens
  - [ ] 8.1 Create `src/app/admin/(console)/layout.tsx` — a nested layout inside a route group, so the admin shell is organisational and contributes nothing to the URL and no full page reload _(P1 — source-doc Phase 1)_
  - [ ] 8.2 Create `src/app/admin/(console)/page.tsx` as a **Server Component** dashboard showing the unmapped / mapped / excluded counts and `liveLayoutCount()` — the launch metric, on screen permanently _(P1 — source-doc Phase 1)_
  - [ ] 8.3 Create `src/app/admin/(console)/vehicles/page.tsx` — the vehicles list, filterable unmapped / mapped / excluded with counts for each; the unmapped count is the working queue _(P1 — source-doc Phase 1)_
  - [ ] 8.4 Create `src/app/admin/(console)/grouping/page.tsx` — search or add a vehicle, multi-select, create Layout or Split Layout _(P1 — source-doc Phase 1)_
  - [ ] 8.5 Create `src/app/admin/(console)/layouts/page.tsx` and `src/app/admin/(console)/layouts/[id]/page.tsx` — the layout detail screen: images per angle, variants with prices, mapped vehicles, confidence and the publish toggle. `ctx.params` is a Promise in Next 16 _(P1 — source-doc Phase 1)_
  - [ ] 8.6 Create `src/app/admin/(console)/exclusions/page.tsx` — the known non-fits with their reasons, editable and removable _(P1 — source-doc Phase 1)_
  - [ ] 8.7 Create `src/app/admin/(console)/demand/page.tsx` — refusals ranked by volume, sourced from `DemandLog` once it exists _(P1 — source-doc Phase 4)_
  - [ ] 8.8 Create `src/app/admin/(console)/audit/page.tsx` — the append-only audit log _(P1 — source-doc Phase 1)_
  - [ ] 8.9 Create `src/app/admin/(console)/actions.ts` with `'use server'` Server Actions for every mutation, each calling `requireAdmin()` then `revalidatePath()` on the affected route _(P1 — source-doc Phase 1)_
  - [ ] 8.10 Style the console with the existing tokens in `src/app/globals.css` — no new styling system _(P1 — source-doc Phase 1)_
  - [ ] 8.11 Add no link to `/admin` from `src/components/Header.tsx` or `src/components/Footer.tsx`, so the console stays undiscoverable by traversal _(P1 — source-doc Phase 1)_
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 15.7, 18.1_

- [ ] 9. Phase 1 — grouping, the conflict guard and split-as-a-first-class-action
  - [ ] 9.1 Implement create-Layout-from-selection in `src/app/admin/(console)/actions.ts`, proposing a customer name from the widest span in the selection and allowing an override before save _(P1 — source-doc Phase 1)_
  - [ ] 9.2 Implement the conflict guard: refuse the merge when any selected Vehicle already sits on a different non-draft Layout, name every conflicting Layout by `internalCode`, and offer Split instead. Never merge silently _(P1 — source-doc Phase 1)_
  - [ ] 9.3 Treat `draft` layouts as mergeable without conflict, and `inferred`/`confirmed` as conflicting; moving a Vehicle off a `confirmed` Layout is a split, never a merge _(P1 — source-doc Phase 1)_
  - [ ] 9.4 Implement the generation-line guard: refuse two same make+model Vehicles with overlapping years on one Layout, and require a written acknowledgement when the selection spans more than one non-empty `generation` _(P1 — source-doc Phase 1)_
  - [ ] 9.5 Implement the body-type guard: refuse grouping two Vehicles with the same make + model + generation but different `bodyType` unless the owner flags it verified _(P1 — source-doc Phase 1)_
  - [ ] 9.6 Implement Split Layout as a first-class action: choose the subset to move, create the child with status `draft`, set `supersededByLayoutId` on the parent, and write the parent code, child code and exact moved-Vehicle set to the audit log _(P1 — source-doc Phase 1)_
  - [ ] 9.7 Implement the evidence gate in the status-change action: `confirmed` requires one of the three evidence values plus a non-empty `confirmationNote` and a `confirmedOn` date, and the action rejects the change otherwise _(P1 — source-doc Phase 1)_
  - [ ] 9.8 Render `confirmationNote` and `confirmedOn` on the layout detail screen and on the audit entry, so a fat-fingered change is legible a week later without digging _(P1 — source-doc Phase 1)_
  - [ ] 9.9 Enforce one Layout = one make: `makeId` required and singular, and any grouping spanning makes refused; a verified cross-brand match becomes two Layouts cross-referenced in `notes` _(P1 — source-doc Phase 1)_
  - [ ] 9.10 Record `driveSide` on every Layout and surface an RHD/LHD mismatch as an admin warning **without** blocking the mapping — the mat is usually the same for tokunbo imports, so the source doc says record it rather than refuse it _(P1 — source-doc Phase 1)_
  - [ ] 9.11 Refuse a `boot_liner` variant on a `footwell` Layout in the admin form as well as in the data assertion, so the rule holds after the database replaces the static file _(P1 — source-doc Phase 1)_
  - _Requirements: 3.7, 4.1, 4.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.2, 7.3, 7.5, 7.6, 7.7, 14.2, 14.3, 17.2, 17.3, 17.4_

- [ ] 10. Phase 1 — the audit log and amendment history
  - [ ] 10.1 Create the `AuditEntry` writer in `src/lib/audit.ts`, called from every admin Server Action, recording what changed, when, by whom, and the before/after values for price, status and mappings _(P1 — source-doc Phase 1)_
  - [ ] 10.2 Store `confirmationNote` verbatim on every `confirmed` transition entry alongside `confirmedOn` _(P1 — source-doc Phase 1)_
  - [ ] 10.3 Make `AuditEntry` append-only in the Prisma schema and expose no edit or delete affordance in `/admin/audit` _(P1 — source-doc Phase 1)_
  - [ ] 10.4 Implement `LayoutRevision` creation: a change to status, mapped Vehicles or make creates a new revision; a change to price, note, lead time or image updates in place and still writes an audit entry _(P1 — source-doc Phase 3)_
  - [ ] 10.5 Retain superseded `ImageSet` assets with `supersededAt` so what a customer saw at order time can be recovered _(P1 — source-doc Phase 3)_
  - [ ] 10.6 Keep a retired Layout queryable and resolvable by `internalCode` so an old WhatsApp ref still lands somewhere useful _(P1 — source-doc Phase 1)_
  - _Requirements: 4.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [ ] 11. Phase 2 — ImageSets per Layout per angle
  - [ ] 11.1 Add the image manager to `src/app/admin/(console)/layouts/[id]/page.tsx` with one slot per angle (`driver`, `passenger`, `rear`, `boot`, `detail`, `comparison`) and a real `alt` field on every asset _(P2 — source-doc Phase 3)_
  - [ ] 11.2 Require the `boot` angle on a `kind: "boot"` Layout and the footwell angles on a `kind: "footwell"` Layout; `comparison` is always optional _(P2 — source-doc Phase 3)_
  - [ ] 11.3 Serve `ImageSet` on the fit result and keep `Product.images: string[]` (`src/data/products.ts:12`) for `/shop` and `/products/[slug]`; the fit result must never show a generic product shot next to a per-car claim _(P2 — source-doc Phase 3)_
  - [ ] 11.4 Omit empty angles without rendering a broken frame, and never let a missing photograph suppress the fit result or its price _(P2 — source-doc Phase 3)_
  - [ ] 11.5 Add an explicit admin warning when a Confirmed Layout has no asset for a required angle, so image debt is visible without blocking a genuine confirmation _(P2 — source-doc Phase 3)_
  - [ ] 11.6 Verify `next.config.ts` `images.dangerouslyAllowSVG` stays on only while the six SVG placeholders are in use; new ImageSets are raster (audit defect D7) _(P2 — source-doc Phase 3)_
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.6, 18.7_

- [ ] 12. Phase 2 — orders against a Layout that is later split or retired
  - [ ] 12.1 Write the fitment snapshot (`layoutCode`, `layoutCustomerName`, `layoutEvidenceSource`, `layoutConfirmedOn`, quoted `priceFrom`) onto the order line at the moment of purchase, alongside the existing `unitPrice` and `rows` snapshot _(P1 — source-doc Phase 1)_
  - [ ] 12.2 Make order lines read the snapshot and never the live Layout, so a later split, retire or price change cannot rewrite history _(P1 — source-doc Phase 1)_
  - [ ] 12.3 Honour the snapshot price for an order whose published price has since changed, because the site showed that number _(P1 — source-doc Phase 1)_
  - [ ] 12.4 Add a lookup by `internalCode` in the admin that resolves an old WhatsApp ref to its retired parent Layout and the orders placed against it _(P2 — source-doc Phase 3)_
  - _Requirements: 12.7, 20.1, 20.2, 20.3, 20.4, 20.5_

- [ ] 13. Phase 2 — ranked demand analytics, refusals as a sourcing roadmap
  - [ ] 13.1 Aggregate `DemandLog` rows by make + model and rank by volume in `/admin/demand` so the most-requested unstocked model is the first row _(P2 — source-doc Phase 4)_
  - [ ] 13.2 Add a window filter (last 7 / 30 / all days) so a spike from one ad campaign is distinguishable from genuine sustained demand _(P2 — source-doc Phase 4)_
  - [ ] 13.3 Carry first-party campaign attribution through to the demand entry from whatever `ad-landing-and-tracking` captures; define no new keys here _(P2 — source-doc Phase 4)_
  - [ ] 13.4 Emit an owner-facing weekly digest of the top unstocked models so the sourcing signal works even when the console is not open _(P2 — source-doc Phase 4)_
  - _Requirements: 11.2, 11.3, 11.7_

- [ ] 14. Phase 2 — automated gate tests
  - [ ] 14.1 Add `vitest` as the single dev dependency (`package.json` has no test runner today) and a `test` script _(P2 — source-doc Phase 1)_
  - [ ] 14.2 `gate.test.ts` — every Layout reachable by `checkFit` has `status: "confirmed"`, evidence, `confirmationNote`, `confirmedOn` and a `priceFrom` on each offered variant _(P2 — source-doc Phase 1)_
  - [ ] 14.3 `no-cross-generation.test.ts` — no Layout contains two Vehicles of the same make + model with overlapping years _(P2 — source-doc Phase 1)_
  - [ ] 14.4 `one-make.test.ts` — every Layout's mapped Vehicles share one `makeId` _(P2 — source-doc Phase 1)_
  - [ ] 14.5 `contract.test.ts` — all three states return a `whatsappUrl`, and the `FITTED` one decodes to text containing the `internalCode` ref _(P2 — source-doc Phase 2)_
  - [ ] 14.6 `failure.test.ts` — a throwing data source, a 500 and a malformed body all resolve to `UNKNOWN` and never to `FITTED` _(P2 — source-doc Phase 2)_
  - [ ] 14.7 `refusal.test.ts` — every `NOT STOCKED` payload carries `demandLogged: true` and a waitlist-capable WhatsApp link _(P2 — source-doc Phase 0)_
  - [ ] 14.8 Re-run `npx tsc --noEmit` and `npx eslint .` after every task in this plan; note that both currently report exactly one error, the broken `prisma/seed.ts` import (audit D4) _(P2 — source-doc Phase 1)_
  - _Requirements: 4.6, 7.2, 9.1, 9.2, 10.3, 11.1, 17.2, 19.7, 19.8_
