# 🔧 LuxeRide — Fitment Engine & Admin (layout grouping spec)

## Why this exists



A car model does not have a floor pan. A **generation** does.



Toyota Corolla 2009–2013 is one floor pan. Corolla 2014–2019 is a different one. Inside a generation the driver's mat is usually the same part for every year, and often for every trim. So "Corolla 2010" and "Corolla 2012" are the *same product* — same fit, same photos, same price.



If the catalogue stores a row per model-year you end up with roughly 40 models × 6 years = **240 rows**, most of them duplicates, and every single one demanding its own photography. You cannot photograph 240 things. You can photograph maybe 25 and map 240 model-years onto them.



**The unit we stock, photograph and sell is the LAYOUT, not the car. Grouping is simply how many cars become one layout.**



## The rule that makes it work



Images, price, notes and stock status attach to the **layout**. Vehicle records are only names mapped onto it. Change one layout's photos and every car inside it updates at once. That is the entire value of grouping.



## Data model



| Entity | What it is | Key fields | Images attach here? |
| --- | --- | --- | --- |
| **Layout** | The published unit — one real floor pan | layoutId, internal code, customer name, body type, drive side, status (draft / live / retired), evidence source | **YES** |
| **Vehicle** | A name a customer would actually type | make, model, yearFrom, yearTo, generation, aliases, body type | no |
| **Mapping** | Joins Vehicle → Layout | layoutId, vehicleId, confidence, evidence note, confirmed by, date | no |
| **Variant** | What is actually sold for that layout | single layer, double layer, boot liner, full set — price + stock | no |
| **ImageSet** | The photos for that layout | driver, passenger, rear, boot, detail, comparison | **YES** (per layout, per angle) |
| **Exclusion** | Looks like it belongs, does not fit | vehicle or vehicle+trim, reason | no |



## Naming



Every layout carries two names. **Internal code** — `TC-2009-2013` — for admin, SKUs and refs. **Customer-facing name** — "Toyota Corolla 2009–2013" — for the site and WhatsApp. The customer never sees the code; the WhatsApp ref uses it.



## How grouping works in admin



1. **Vehicles list** — filter by unmapped / mapped / excluded. The unmapped count is the working queue.
2. **Search or add a vehicle** — type "Corolla" and get every Corolla row with its year range and current layout (or blank).
3. **Multi-select** every vehicle that shares a floor pan.
4. **Create layout from selection** — the system proposes a name from the widest span, and warns if the selection crosses a generation line, or if any selected row already belongs to a live layout.
5. **Assign images** — upload new, or pull from the library.
6. **Set price and variants.**
7. **Set confidence** — Confirmed / Inferred / Untested.
8. **Publish toggle** — a draft stays invisible to the front end.
9. **Audit log** records who grouped what, when, and what changed.



### Conflict guard



If two selected vehicles already sit on *different live layouts*, do not merge silently — raise it. This is precisely how a bad fit ships to a customer.



**Split layout is a first-class action**, not a workaround. The day you discover a 2013 does not match a 2009, you need to split the group cleanly without disturbing the rest.



## What the front end gets



`POST /fit-check` — payload: `{ make, model, year }`



Three possible states. **Every one of them returns a WhatsApp link.**



| State | When | Returns |
| --- | --- | --- |
| **FITTED** | Vehicle maps to a live layout | Layout name, variants + priceFrom, imageSet, lead time, WhatsApp link carrying the ref |
| **NOT STOCKED** | Model recognised, no layout exists | An honest "we don't have it yet", a demand-log entry, optional waitlist capture |
| **UNKNOWN** | Nothing matches | Route straight to WhatsApp so a human answers |



The prefilled WhatsApp message carries the reference — *"Hi, I drive a 2012 Toyota Corolla. Is the black TPE set available? (ref TC-2009-2013)"*. That ref is what makes both the conversation and the attribution cheap.



## The refusal path — why this exists at all



The system's real job is to make saying no **cheap and instant**.



The load-bearing claim of the whole brand is the refusal: *"if we don't have your model, we say no."* That claim only holds if (a) every published layout is genuinely correct, and (b) you can answer any enquiry in seconds without personally knowing that car. The admin is what makes the promise scalable — it is the difference between a refusal you have to think about and a refusal the system produces.



And the refusals become an asset. Every NOT STOCKED entry is a row in a ranked list of models people asked for that you do not carry. **That is a sourcing roadmap built out of honest answers** — demand evidence, not guesswork.



## Evidence rule — nothing goes live without it



A layout may be marked **Live** only when one of these is true: **(a)** a physically confirmed fitting, **(b)** written supplier confirmation, or **(c)** a verified OEM floor-pan match. Everything else stays **Inferred** and off the front end.



Same principle as the proof block: the refusal is only worth something if the yes is reliable. A wrong "yes" costs more than a hundred honest "no"s, because it is the scam shape these buyers already survived.



## Admin MVP screens



1. **Vehicles list** — unmapped / mapped / excluded, with counts
2. **Grouping view** — multi-select → create or split layout
3. **Layout detail** — images, variants, prices, mapped vehicles, confidence, publish toggle
4. **Exclusions** — the known non-fits, with reasons
5. **Demand log** — not-stocked requests, ranked by volume
6. **Audit log** — who changed what, when



## Edge cases to build for



| Case | Handling |
| --- | --- |
| Facelift inside a generation | Usually the same floor pan, sometimes not. Separate Vehicle row, same Layout, flagged. |
| Same name, different generation | "Corolla 2013" and "Corolla 2014" are different cars. **Never let a year span cross a generation line without a human check.** |
| Tokunbo / used imports | Often RHD or EU/US spec. The mat is usually the same; record the drive side anyway. |
| Trim differences | Hybrid battery, 3rd row, 7-seat vs 5-seat can all change the floor. Treat as an Exclusion where known. |
| Boot liners | Boot ≠ footwell. Needs its own layout mapping, not a variant of the same one. |
| Body variants | Wagon / hatch / sedan often differ. Separate layouts unless verified otherwise. |
| Same platform, different brand | Rare. Never assume it — verify before grouping across makes. |



## Phasing



| Phase | What | Why it sits here |
| --- | --- | --- |
| **P0** | Master sheet — one row per layout, columns of model-years | **Zero build.** In WhatsApp this is already enough to answer enquiries and hold the refusal. Start here today. |
| **P1** | Admin CRUD + grouping + publish | Internal only. Replaces the sheet. |
| **P2** | `/fit-check` wired to the lookup + WhatsApp ref | First customer-facing use. |
| **P3** | Image manager + versioning | Change one layout → every car in it updates. |
| **P4** | Demand-log analytics — ranked unstocked models | Turns refusals into a sourcing roadmap. |
| **P5** | Supplier catalogue import | Scale, once the model is proven. |



## How this connects to today's build



Today's website block builds `/fit-check` as a form. **Build it against the P0 sheet** — hardcode the mapping for now. The admin replaces the sheet later, and the front-end contract above does not change when it does. That is deliberate: it means today's work is not thrown away by tomorrow's build.



## Open decisions



- **Who can edit layouts** — you only, or a helper with limited rights?
- **Does the front end ever show an Inferred fit**, or Confirmed only? (Current rule: Confirmed only.)
- **Price on the site, or "DM for price" only?**
- **Does a layout ever span brands?** (Default: no.)



## 🔒 LOCKED DECISIONS — Fri 2 Oct 2026



Owner-confirmed. These four were open questions in the spec above; they are now settled and every section must be read in their light.



| # | Question | Decision |
| --- | --- | --- |
| 1 | Who can edit layouts? | **Owner only, for now.** Single-admin. Do not build roles, permissions or a second editor seat in P1 — it adds surface area with one user. Revisit only when a helper actually exists. |
| 2 | Does the front end ever show an *Inferred* fit? | **Confirmed only.** Inferred layouts may exist in admin but are invisible to /fit-check. The front end returns FITTED only for Confirmed. |
| 3 | Price on the site, or "DM for price"? | **Price on the site.** |
| 4 | Does a layout ever span brands? | **Default — no.** One layout = one make. Never assume cross-brand platform sharing. |



### Consequences that follow from these



**From (1) Owner only.** The admin can be built as a single-operator tool. No audit-of-editors, no permission matrix. But it does raise the stakes on one thing: with one person editing, a fat-fingered status change is the whole risk. So the Confirmed gate should require a short mandatory note (&ldquo;fitted 2012 Corolla on 14 Sep, own car&rdquo;) — not as process, but as the thing that makes a mistake obvious to you a week later.



**From (2) Confirmed only — and this is the one to think about.** This is the correct setting and it is also a launch constraint. At go-live the number of Confirmed layouts will be small, so **/fit-check will refuse more cars than it accepts.** That is the honest behaviour and it is on-brand — but it means:



- The **demand log must work from day one**, even in P0. Every refusal is the asset; if refusals aren't captured you lose the only sourcing signal the site generates.
- Refusal copy is now **first-class front-end copy**, written to the same standard as the headlines. "We don't have it yet" is a promise about future stock, so it needs a waitlist capture or it should not promise anything.
- **Ad targeting should favour cars you already have Confirmed.** Running a broad Lagos car-owner audience into a fit-check that mostly says no is a deliberate choice, not an accident — the broad run is a demand-mapping exercise, not an acquisition one. Decide which it is before spending.
- The **Confirmed count at launch becomes a launch metric.** Whatever it is, write it down on the day.



**From (3) Price on the site.** Price attaches to the **layout variant**, not the car — so Single and Double each carry a price on every layout, and changing a price changes it everywhere. Two things follow:



- The sheet needs a **priceFrom per variant** from P0, not later.
- **Counter to the &ldquo;price last&rdquo; asset hierarchy** used in the avatar doc and the 150 statics. That hierarchy governs *cold ad creative* (proof &rarr; risk removal &rarr; price last). It does **not** govern the site, where price is expected and its absence reads as evasion. The two are not in conflict — but do not let the site rule leak backwards into Stage 1&ndash;3 creative, where naming price early still costs the scroll.
- Show a price the engine can actually honour. If the exact figure varies by model, state the **range or "from"** rather than a single number the WhatsApp quote then contradicts. A site price that the quote overrides is worse than no price.



**From (4) One layout = one make.** Keeps grouping simple and keeps the Split Layout action meaningful. If a genuine cross-brand platform match is ever confirmed, it is **two layouts with two rows**, cross-referenced in the notes field — not one merged entity.



## Data model — field additions implied by the above



| Entity | Field | Why |
| --- | --- | --- |
| Layout | `status` — draft / inferred / confirmed / retired | Gate for the Confirmed-only front end |
| Layout | `confirmationNote` (short text) + `confirmedOn` (date) | Single-admin safety; makes a bad status obvious later |
| LayoutVariant | `priceFrom` (NGN) | Decision 3 — price shows on site |
| Layout | `makeId` — required, singular | Decision 4 — no cross-brand layouts |
| DemandLog | `make`, `model`, `year`, `askedAt`, `source` | Captures refusals from day one |



**Still open, not blocking:** exact-price vs range presentation on /mats and /fit-check; whether the refusal carries a waitlist; and the Confirmed layout count at launch.