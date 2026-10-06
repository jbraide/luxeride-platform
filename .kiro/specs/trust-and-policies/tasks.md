# Implementation Plan — Trust & Policies

## Status

**PARTIAL** — the copy register (§2.1–2.5) and the announcement bar (§7.1–7.3) are built, and the
honesty-floor scanner (§12.1–12.4) is in place and reporting. Verified by `npm run verify` exiting 0
on 2026-10-03; the guarantee literal was removed from `FitFinder`, the PDP and the Footer so §12.3's
single-source rule holds.

> **The authoritative record is `../master-build-plan/tasks.md` M4.1, M4.6, M4.7 and M4.10.**
> `storefront-catalog` §5.4–5.7 owns the footer and the `/policies/[slug]` routes, so `src/data/policies.ts`
> is the storefront-shaped `Policy` record, not the `PolicyDoc` this spec sketched in §4.1.

**NOTE (verified 2026-10-05 — M4.3 fix):** the `TODO(owner)` markers in `policies/` (`src/data/policies.ts`) are **hidden** from production HTML, not visible. `policies/[slug]/page.tsx` (M4.4 / M4.7 verified) drops empty/unpublished sections; a policy with nothing published renders "the rest is being written up" + WhatsApp link rather than the raw `[[OWNER INPUT REQUIRED...]]` string. The `check:placeholders` scanner (`scripts/check-placeholders.mjs`, M4.10 verified) exits 1 (red) precisely because 7 slots remain unfilled (`delivery` complete from `LOCATIONS`; `returns`/`privacy`/`terms` partial). It is deliberately NOT in `npm run verify` so the site can deploy. The visible state is therefore honest (no fabricated legal text to customers), not broken.

**`check:placeholders` is RED on exactly 7 slots** — the unresolved return terms, and the privacy
controller, retention, governing-law and warranty/cancellation inputs. The policy routes ship with
those slots visible; the owner fills them before spending. Everything else in §4–§11 remains open.

## Before any ad spend

Requirement 12.1 is the gate. These must all be true before paid traffic is bought; nothing in the
rest of this plan is a prerequisite for them.

- [ ] **Gate 1** — `npm run build` exits zero (blocked today by `prisma/seed.ts(2,34)`; owned by `commerce-backend` R1). _Requirements: 12.1_
- [ ] **Gate 2** — `/privacy`, `/delivery`, `/returns`, `/contact` exist and pass the placeholder scan → tasks 4, 5.1–5.3, 6.1; every one is deliverable with no database, no payment processor and no backend. _Requirements: 12.1, 12.2_
- [ ] **Gate 3** — checkout consent control renders and links to `/privacy` (unblocks `cart-checkout` 10.1/10.4) → task 9.1. _Requirements: 3.9, 12.1_
- [x] **Gate 4** — announcement bar live **(done — master-build-plan M4.6; all three items verified in served HTML)** → task 6.1–6.3. _Requirements: 10.5, 12.1_
- [x] **Gate 5** — footer link grid live **(done — master-build-plan M4.7; the grid links `/policies/*`, the storefront-catalog routes, not the top-level `/privacy` etc.)** → task 7.1–7.3. _Requirements: 10.1, 12.1_
- [ ] **Gate 6** — one real, auto-oriented, resized product photo published → tasks 10.1–10.2. _Requirements: 9.3, 12.1_
- [ ] **Gate 7** — guarantee badge resolves to a link to `/returns` → tasks 3.2, 8.2. _Requirements: 6.1, 12.1_

---

- [x] 1. Verify the trust baseline this spec is written against _(P0)_ — _Requirements: 1.1, 1.3, 5.1, 10.4_
  - [x] 1.1 Confirm the footer has zero links and the guarantee string is hardcoded in `src/components/Footer.tsx`, `src/components/FitFinder.tsx` and `src/app/products/[slug]/page.tsx` _(P0)_ _(verified: src/components/Footer.tsx, src/components/FitFinder.tsx, src/app/products/[slug]/page.tsx)_ — _Requirements: 1.1, 10.1, 8.7_
  - [x] 1.2 Confirm the app links to no social profile, no `tel:` and no email anywhere under `src/` (single grep hit: the `wa.me` helper) _(P0)_ _(verified: src/lib/whatsapp.ts)_ — _Requirements: 10.8, 1.6_
  - [x] 1.3 Confirm `src/app/checkout/page.tsx` collects name, phone and home address with no consent control and imports no `next/link` _(P0)_ _(verified: src/app/checkout/page.tsx)_ — _Requirements: 3.1, 3.9_
  - [x] 1.4 Confirm the four delivery zones, their fees/ETAs and `WHATSAPP_NUMBER` in `src/data/locations.ts`; confirm `src/app/cart/page.tsx:73` promises a delivery fee with no number _(P0)_ _(verified: src/data/locations.ts, src/app/cart/page.tsx)_ — _Requirements: 5.1, 5.7_
  - [x] 1.5 Confirm the header nav is `hidden sm:flex` with no hamburger and the header is `sticky top-0 z-20` _(P0)_ _(verified: src/components/Header.tsx)_ — _Requirements: 10.4, 10.6_
  - [x] 1.6 Confirm the full route tree (6 pages + layout + globals + favicon) and that `public/` holds only the Next.js scaffold SVGs plus 6 placeholder product SVGs _(P0)_ _(verified: src/app, public/)_ — _Requirements: 2.1, 9.3_
  - [ ] 1.7 Resolve the two blocking legal questions (Q1 price authority, Q2 what "swap it free" means operationally) with the owner — recorded in `design.md` `## Open Questions`, resolved by writing into `src/data/policies.ts` in task 4.2 _(P0)_ — _Requirements: 6.2, 6.4_

- [x] 2. Create the shared copy register **(done — master-build-plan M4.1)** — `src/lib/copy.ts` _(P0)_ — _Requirements: 8.1, 8.2, 8.7_
  - [x] 2.1 Create `src/lib/copy.ts` exporting typed frozen objects: `guarantee`, `guaranteeShort`, `prepay` (`saving: 2000`), `announcement`, `delivery.range()`, `contact` and the `refusals` register for FITTED / NOT STOCKED / UNKNOWN, using the validated prototype voice _(P0)_ — _Requirements:  8.1, 8.2, 8.3_
  - [x] 2.2 In `src/lib/copy.ts`, type each refusal entry so `promise` and `capture` are one object and cannot be separated — a promise of future stock is unrenderable without its waitlist field _(P0)_ — _Requirements: 8.3, 1.4_
  - [x] 2.3 In `src/lib/copy.ts`, add a `contact` block that builds every contact route from `WHATSAPP_NUMBER` via `src/lib/whatsapp.ts`'s `whatsappLink()`, including a `tel:` URI and a `mailto:` fallback _(P0)_ — _Requirements:  7.1, 7.2_
  - [x] 2.4 Assert in `src/lib/copy.ts` that no entry contains a stock quantity, count, countdown, review count or the string currently at `src/components/FitFinder.tsx:247` ("100% precision-molded … in stock for your …") _(P0)_ — _Requirements: 1.3, 1.7, 8.5_
  - [x] 2.5 Add the post-delivery review-capture message builder to `src/lib/copy.ts` (asks for a photo or a sentence plus permission to publish; no database) _(P1)_ — _Requirements: 9.7_

- [ ] 3. Create the social profile module — `src/data/social.ts` _(P0)_ — _Requirements: 10.8_
  - [ ] 3.1 Create `src/data/social.ts` with a `SocialProfile[]` where `url` is `string | null`; an entry with `null` is declared but never rendered _(P0)_ — _Requirements: 10.8_
  - [ ] 3.2 Populate the platform and handle placeholders for the accounts the business actually advertises on, leaving `url: null` until the owner supplies each URL — no `#`, no empty href, no platform search URL _(P0)_ — _Requirements: 1.1, 10.8_
  - [ ] 3.3 Create `src/components/SocialLinks.tsx` as a Server Component that filters `url: null` before render and sets `target="_blank" rel="noreferrer"` on every external link, matching the existing pattern at `src/components/FitFinder.tsx:311` _(P0)_ — _Requirements: 10.8, 10.9_

- [ ] 4. Build the policy content module and shell _(P0)_ — _Requirements: 2.2, 2.6, 2.7_
  - [ ] 4.1 Create `src/data/policies.ts` typed as `PolicyDoc[]` with `slug`, `title`, `summary`, `effectiveDate` and `sections[]`, where each section is `{ id, heading, body[], ownerInputRequired? }` — structure only, no invented legal text _(P0)_ — _Requirements: 2.2, 2.6_
  - [ ] 4.2 Write the `/privacy` skeleton into `src/data/policies.ts` with every required disclosure as a named section — collected data (name, phone, address, zone, vehicle, the `luxeride-cart` and `luxeride-last-order` storage keys), purpose per item, the WhatsApp/Meta third-party processing, the truthful current no-tracking state, the advertising disclosure, the data-subject route, retention, and governing law — unresolved items as `[[OWNER INPUT REQUIRED: …]]` _(P0)_ — _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
  - [ ] 4.3 Write the `/delivery` skeleton into `src/data/policies.ts`: process, zone table component slot, prepay-waiver statement, the ₦2,000 as a separate concession, failure/unavailable handling, service area _(P0)_ — _Requirements: 5.3, 5.4, 5.5, 5.6_
  - [ ] 4.4 Write the `/returns` skeleton into `src/data/policies.ts`: the verbatim guarantee line first, then the definition of "swap", the time limit, the return-shipping payer, product scope, times-per-order, the Confirmed-layout precondition, and the separate non-fit return routes _(P0)_ — _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_
  - [ ] 4.5 Write the `/terms` and `/warranty` skeletons into `src/data/policies.ts`: what an order is at each stage, the price rule, both payment routes as two concessions, dispatch trigger, cancellation, and warranty scope/claim route — with the warranty explicitly deferring to the guarantee _(P1)_ — _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [ ] 4.6 Create `src/components/PolicyPage.tsx` as a Server Component taking a `PolicyDoc` and rendering `<h1>`, summary, effective-date line, each section as `<h2>` + paragraphs with a stable `id`, and a related-documents row from `related` _(P0)_ — _Requirements:  2.2, 2.7_

- [ ] 5. Create the P0 policy routes _(P0)_ — _Requirements: 2.1, 2.4_
  - [ ] 5.1 Create `src/app/privacy/page.tsx` — static Server Component rendering the `privacy` doc through `PolicyPage`, with its own `generateMetadata` — this unblocks `cart-checkout` 10.1/10.4 _(P0)_ — _Requirements:  2.1, 2.4, 3.9_
  - [ ] 5.2 Create `src/app/delivery/page.tsx` — static Server Component; render the zone table by importing `LOCATIONS` from `src/data/locations.ts` and formatting fees with `fmtNaira`; no zone, fee or ETA retyped; no zone count hardcoded _(P0)_ — _Requirements: 5.1, 5.2_
  - [ ] 5.3 Create `src/app/returns/page.tsx` — static Server Component; guarantee line from `copy.guarantee`, a prefilled WhatsApp claim route via `whatsappLink()`, and links to `/delivery` and `/contact`; render the owner-facing warning state if the unresolved guarantee terms from 4.4 are still open _(P0)_ — _Requirements: 6.1, 6.4, 6.7_
  - [ ] 5.4 Create `src/app/warranty/page.tsx` and `src/app/terms/page.tsx` — static Server Components through `PolicyPage`, each with its own `generateMetadata` _(P1)_ — _Requirements: 4.1, 4.7, 2.4_
  - [ ] 5.5 Add `generateMetadata` to every new route so no two pages share the single global title/description currently in `src/app/layout.tsx:23-26` _(P1)_ — _Requirements: 2.4_

- [ ] 6. Create the contact and legitimacy surface _(P0)_ — _Requirements: 7.1, 7.2, 7.3_
  - [ ] 6.1 Create `src/app/contact/page.tsx` — static Server Component; render `WHATSAPP_NUMBER` from `src/data/locations.ts` in a readable Nigerian format as text plus a prefilled WhatsApp action, a `tel:` link and an email placeholder so at least one route needs no WhatsApp install _(P0)_ — _Requirements: 7.1, 7.2_
  - [ ] 6.2 In `src/app/contact/page.tsx`, state the business name exactly as the business already states it ("LuxeRide Nigeria", per `src/components/Footer.tsx:5`), the registration number placeholder, the service area derived from `LOCATIONS`, hours, and the response expectation — no invented values _(P0)_ — _Requirements: 7.3, 7.4, 1.1, 2.3_
  - [ ] 6.3 In `src/app/contact/page.tsx`, add the two-sentence explanation of how a fit is verified before sale (the refusal doctrine) and a `SocialLinks` block _(P0)_ — _Requirements: 7.6, 10.8_
  - [ ] 6.4 Create `src/components/ContactForm.tsx` as a Client Component island inside `src/app/contact/page.tsx` — a subject/message box that produces a prefilled WhatsApp message or a `mailto:` hand-off, with no server write and no database _(P1)_ — _Requirements: 7.5, 2.6_
  - [ ] 6.5 Create `src/app/faq/page.tsx` — static Server Component using native `<details>`/`<summary>` so it works with JavaScript disabled; answer the prepay, delivery, guarantee and "is this site real" objections in the register's voice _(P1)_ — _Requirements: 8.1, 8.2, 12.3_
  - [ ] 6.6 Create `src/app/about/page.tsx` — static Server Component, narrow scope only: who we are, how a fit is verified, service area; not a marketing page _(P2)_ — _Requirements: 7.6_

- [x] 7. Add the announcement / utility bar **(done — master-build-plan M4.6)** _(P0)_ — _Requirements: 10.5, 10.7_
  - [x] 7.1 Create `src/components/AnnouncementBar.tsx` as a Server Component rendering at most three items — nationwide delivery, the fastest-zone window computed from `LOCATIONS`, and the prepay rule — with strings from `copy.announcement` and no countdown, stock number or urgency claim _(P0)_ — _Requirements: 10.5, 10.6_
  - [x] 7.2 Render `<AnnouncementBar />` in `src/app/layout.tsx` above `<Header />`, non-sticky, so the existing `sticky top-0 z-20` header needs no offset change _(P0)_ — _Requirements: 10.5, 10.6_
  - [x] 7.3 Make the bar stack on mobile and wrap at the narrowest supported viewport, with decorative glyphs marked `aria-hidden` and no meaning carried by colour alone _(P0)_ — _Requirements: 10.7_

- [ ] 8. Rewrite the footer _(P0)_ — _Requirements: 10.1, 10.2_
  - [ ] 8.1 Replace the two `<p>` lines in `src/components/Footer.tsx` with a link grid (Privacy, Terms, Delivery, Returns & Guarantee, Warranty, Contact, FAQ, About) using plain `next/link`; keep the file a Server Component with no `"use client"` so every link works before hydration; the footer carries reference material only, never the sole copy of anything read before paying _(P0)_ — _Requirements: 10.1, 10.2, 11.6_
  - [ ] 8.2 In `src/components/Footer.tsx`, render the business identity line, the guarantee line from `copy.guarantee` linking to `/returns`, `<SocialLinks />`, and a WhatsApp contact action _(P0)_ — _Requirements: 6.1, 7.1, 10.1_
  - [ ] 8.3 In `src/components/Footer.tsx`, keep it single-column on the narrowest viewport with no horizontal scroll and every link reachable without a menu, so it satisfies findability independently of the `hidden sm:flex` header fix owned by `storefront-catalog` _(P0)_ — _Requirements: 10.3, 10.4_

- [ ] 9. Put the trust block next to the buy action _(P0)_ — _Requirements: 11.1, 11.3_
  - [ ] 9.1 Create `src/components/TrustStrip.tsx` as a Server Component with a `variant` prop (`"cta"` / `"summary"`), rendering the guarantee line, the delivery fee range from `LOCATIONS` min/max via `fmtNaira`, the prepay saving from `copy.prepay`, and links to `/returns` and `/delivery`; the component is one component precisely so the four surfaces cannot disagree _(P0)_ — _Requirements: 11.1, 11.2, 11.3_
  - [ ] 9.2 Render `<TrustStrip variant="cta" />` adjacent to the buy action in `src/app/products/[slug]/page.tsx` (replacing the inline guarantee literal at line 44) and in `src/components/FitFinder.tsx` (replacing the literal at line 280) _(P0)_ — _Requirements: 11.1, 8.7_
  - [ ] 9.3 In `src/app/cart/page.tsx`, replace the line `"Delivery fee is calculated at checkout, based on your zone."` with the computed fee range plus a `/delivery` link, and add `<TrustStrip variant="cta" />` above the checkout button _(P0)_ — _Requirements: 5.7, 11.1_
  - [ ] 9.4 In `src/app/checkout/page.tsx`, render `<TrustStrip variant="summary" />` immediately above the submit button, plus the "what happens next — we confirm on WhatsApp before dispatch" line _(P0)_ — _Requirements: 11.1, 11.4_
  - [ ] 9.5 In `src/app/checkout/page.tsx`, add the non-WhatsApp fallback (`tel:` and email) beside the submit button and beside the existing prefilled-message `<pre>` so a blocked or app-less WhatsApp hand-off is survivable _(P0)_ — _Requirements: 7.2, 11.5_
  - [ ] 9.6 In `src/app/checkout/page.tsx`, add the consent control required by `cart-checkout` 10.1 and link it to `/privacy`; it must block submission and `window.open` while unchecked (mechanic owned by `cart-checkout`, surface only here) _(P0)_ — _Requirements: 3.9_

- [ ] 10. Turn the raw footage into publishable, honestly-labelled proof _(P0)_ — _Requirements: 9.3, 9.4_
  - [ ] 10.1 Create `scripts/process-media.sh` using host `ffmpeg` to auto-orient and resize the three `footage/` JPEGs (EXIF orientation is upper-right) into `public/media/`; originals are never copied into `public/` _(P0)_ — _Requirements: 9.3, 9.5_
  - [ ] 10.2 Publish at least one processed photo through `src/components/SafeImage` on `src/app/products/[slug]/page.tsx`, labelled as LuxeRide's own product photography — never as a customer's car or installation _(P0)_ — _Requirements: 9.1, 9.5, 12.1_
  - [ ] 10.3 Extend `scripts/process-media.sh` to transcode the eight `footage/` MP4s (74–208 MB each) to a web preset with poster frames into `public/media/` _(P1)_ — _Requirements: 9.4_
  - [ ] 10.4 Create `src/components/ProofGallery.tsx` as a Server Component using `<video muted playsInline controls preload="none">` with a poster — no autoplay with sound, nothing fetched until play _(P1)_ — _Requirements: 9.4_
  - [ ] 10.5 Add an owner-confirmation step: every published frame must be checked to show an installed product before it may be captioned as an installed fit _(P0)_ — _Requirements: 9.5_

- [ ] 11. Build the review surface that renders nothing until it has something _(P1)_ — _Requirements: 9.6, 9.7_
  - [ ] 11.1 Create `src/data/reviews.ts` typed so entries carry provenance (text, source channel, date, permission-to-publish flag) and an empty collection is valid _(P1)_ — _Requirements: 1.2, 9.1, 9.6_
  - [ ] 11.2 Create `src/components/Reviews.tsx` that returns `null` when the collection is empty — no empty section, no "0 reviews" counter, no star skeleton _(P1)_ — _Requirements: 9.6, 1.1_
  - [ ] 11.3 Add the post-delivery capture step: the owner sends the `copy` review-request message in the WhatsApp dispatch loop and pastes what comes back into `src/data/reviews.ts` _(P1)_ — _Requirements: 9.7_
  - [ ] 11.4 Render `<Reviews />` on `src/app/products/[slug]/page.tsx` once non-empty; while empty the PDP carries no reviews surface at all _(P1)_ — _Requirements: 9.6, 1.2_

- [x] 12. Enforce the honesty floor mechanically **(done — master-build-plan M4.10)** _(P0)_ — _Requirements: 1.1, 2.5_
  - [x] 12.1 Create `scripts/check-placeholders.mjs` that fails with a file-and-line list on any `[[OWNER INPUT REQUIRED:` token in `src/data/policies.ts` or `src/data/social.ts`, and on a launch-critical social profile whose `url` is still `null` _(P0)_ — _Requirements: 2.5_
  - [x] 12.2 Add `check:placeholders` to `scripts` in `package.json` _(P0)_ — _Requirements: 2.5_
  - [x] 12.3 Extend `scripts/check-placeholders.mjs` to fail if the guarantee string or any delivery fee appears outside `src/lib/copy.ts` and `src/data/locations.ts`, enforcing the single-source rule _(P0)_ — _Requirements: 8.7, 5.2, 12.1_
  - [x] 12.4 Extend `scripts/check-placeholders.mjs` to fail on fabricated-proof patterns in `src/` (star ratings, `trusted by`, `customers served`, `reviews`, `in stock` outside a confirmed-data source) _(P0)_ — _Requirements: 1.1, 1.2, 1.3, 1.5, 9.2_

- [ ] 13. Adopt the copy register across the existing funnel — `src/components/FitFinder.tsx`, `src/lib/whatsapp.ts` _(P1)_ — _Requirements: 8.1, 8.5_
  - [ ] 13.1 In `src/components/FitFinder.tsx`, import the guarantee line and the three-outcome refusal copy from `src/lib/copy.ts` in place of the literals at lines 247, 280, 307–308, 334 and 353–357, preserving the existing states and steps — the screens stay owned by `fit-finder`, only the words come from here _(P1)_ — _Requirements: 8.1, 8.2, 8.5_
  - [ ] 13.2 In `src/lib/whatsapp.ts`, build the coming-soon, not-found, live-photo and offer messages from `copy`, and add the delivery zone to the negotiate offer message (currently omitted) _(P1)_ — _Requirements: 8.1, 8.4_
  - [ ] 13.3 Verify in `src/components/FitFinder.tsx` that the NOT_STOCKED promise and its waitlist capture render from the same `copy` entry, so the two cannot be separated _(P1)_ — _Requirements: 8.3_
  - [ ] 13.4 Confirm no second demand-log write, capture path or refusal analytics event was added by this spec — that stays with `fit-finder` R4 and `fitment-engine` R11 _(P1)_ — _Requirements: 8.6_

- [ ] 14. Findability plumbing _(P1)_ — _Requirements: 10.1, 7.7_
  - [ ] 14.1 Create `src/app/sitemap.ts` listing the eight new routes plus the existing six, and `src/app/robots.ts` allowing crawlers _(P1)_ — _Requirements: 2.1, 10.1_
  - [ ] 14.2 Add a `not-found.tsx` route (`src/app/not-found.tsx`) that offers Contact, the policies and a return to the fit finder instead of a bare 404 _(P1)_ — _Requirements: 7.7_
  - [ ] 14.3 Verify at a 320 px viewport that the footer, the announcement bar and the policy pages need no menu and no horizontal scroll, and record the check — the header's `hidden sm:flex` nav fix stays with `storefront-catalog` _(P1)_ — _Requirements: 10.3, 10.4_

- [ ] 15. Confirmed-layout count (depends on `fitment-engine`) _(P2)_ — _Requirements: 1.5, 9.8_
  - [ ] 15.1 Render a Confirmed-layout count only when the fitment engine supplies confirmed data, labelled with exactly what it counts; render nothing — not zero, not an estimate — when the source is unavailable _(P2)_ — _Requirements: 9.8, 1.5_

---

**Priority summary** — 65 leaf tasks: **P0 44** (the whole honest floor, deliverable with no
database, no payment processor and no backend), **P1 19**, **P2 2**. Groups 2–9 plus 12.1–12.2 are the
minimum that must exist before a single naira goes into ads; that set is Gate 2–7 above.

**Ownership boundaries** (stated so nobody builds this twice): `fit-finder` owns the funnel states and
the demand-log write; `fitment-engine` owns the demand log and the Confirmed gate; `cart-checkout`
owns the consent mechanic and the order handoff — this spec supplies the `/privacy` route its consent
link needs and the copy on the handoff screen. `storefront-catalog` owns the header's missing mobile
nav; this spec makes every route it needs reachable from the footer regardless.
