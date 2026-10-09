# Implementation Plan

## Status
**NOT STARTED — 0 done, 20 remaining.**

- [ ] 1. Build the section library
  - [ ] 1.1 Create `src/components/funnel/SectionHeading.tsx` and `src/components/funnel/ProseSection.tsx` as Server Components using the tokens in `src/app/globals.css` _(P0)_
    - _Requirements: 2.3, 7.1_
  - [ ] 1.2 Create `src/components/funnel/MechanismGrid.tsx`, `ComparisonTable.tsx`, `CostCards.tsx` and `StepProcess.tsx` _(P0)_
    - _Requirements: 2.3, 5.1, 8.1_
  - [ ] 1.3 Create `src/components/funnel/RiskReversal.tsx` and `CtaBand.tsx` _(P0)_
    - _Requirements: 3.5, 1.1_
  - [ ] 1.4 Create `src/components/funnel/FaqBlock.tsx` rendering `<details>`/`<summary>` on the `ProductFaq` pattern, and re-export `faqJsonLd` from `src/lib/seo.tsx` where a page uses it _(P1)_
    - _Requirements: 2.4_
  - [ ] 1.5 Create `src/components/funnel/ProofStrip.tsx` that renders `null` when given no verified testimonials _(P1)_
    - _Requirements: 3.2_

- [ ] 2. Wire the section model
  - [ ] 2.1 Add the `Section` discriminated union and `FunnelPage` type in `src/data/funnel/sections.ts` _(P0)_
    - _Requirements: 2.1_
  - [ ] 2.2 Add `src/components/funnel/render-section.tsx` mapping each `Section` kind to its component, so a content module cannot reference an unknown section _(P0)_
    - _Requirements: 2.1_

- [ ] 3. The education page
  - [ ] 3.1 Write `src/data/funnel/why-carpet-fails.ts` with the mechanism copy, honest figures only, and links to existing routes _(P0)_
    - _Requirements: 7.1, 7.2, 3.1, 3.3_
  - [ ] 3.2 Create `src/app/why-carpet-fails/page.tsx` as a Server Component calling `pageMetadata` from `src/lib/seo.tsx` and rendering `renderSection` over the module _(P0)_
    - _Requirements: 1.1, 1.3_

- [ ] 4. The offer page
  - [ ] 4.1 Write `src/data/funnel/offer.ts` containing copy only — no prices, no offer figure _(P0)_
    - _Requirements: 4.1, 4.4_
  - [ ] 4.2 Create `src/app/offer/page.tsx`, reading `loadPromotions()` and `resolveDiscountForOrder()` from `src/lib/discounts-server.ts`, selecting the live promotion by its date window, and rendering the honest "no offer running" state when none is live _(P0)_
    - _Requirements: 1.2, 4.3, 9.3_

- [ ] 5. Discoverability
  - [ ] 5.1 Add `/why-carpet-fails` and `/offer` to `src/app/sitemap.ts` with a consistent `lastModified` policy _(P0)_
    - _Requirements: 1.4_
  - [ ] 5.2 Confirm `src/app/robots.ts` does not exclude the new routes and that each page's canonical is self-referencing _(P1)_
    - _Requirements: 1.3, 1.4_

- [ ] 6. Enhance the existing pages with sections, not replacements
  - [ ] 6.1 Add `MechanismGrid` and `ComparisonTable` to `src/app/shop/[category]/page.tsx` above the existing `CatalogExplorer`, leaving `CatalogExplorer` unchanged _(P1)_
    - _Requirements: 8.1_
  - [ ] 6.2 Add the fit-guide and mechanism content to `src/app/products/[slug]/page.tsx` using the product's own data, leaving `BuyBox` and `StickyBuyBar` as the only buy controls _(P1)_
    - _Requirements: 8.2, 8.4_
  - [ ] 6.3 Add one homepage section to `src/app/page.tsx` without duplicating the live-promotion offer band _(P2)_
    - _Requirements: 8.3_

- [ ] 7. WhatsApp and tracking, without new instruments
  - [ ] 7.1 Use `whatsappLink` from `src/lib/whatsapp.ts` for any WhatsApp call-to-action — no second link builder _(P1)_
    - _Requirements: 10.3, 2.2_
  - [ ] 7.2 Confirm no funnel module declares an analytics event and that `lead` is never fired by a click, deferring any new event name to `ad-landing-and-tracking` Requirement 3 _(P0)_
    - _Requirements: 6.2, 10.1, 10.2_

- [ ] 8. Tests
  - [ ] 8.1 Add `scripts/funnel-content.test.mjs` (`node --test`) asserting no naira figure, no forbidden scarcity token, no analytics event, and every `href` inside the declared route allow-list _(P0)_
    - _Requirements: 3.1, 4.1, 9.1, 9.2_
  - [ ] 8.2 Add render checks asserting `/why-carpet-fails` and `/offer` return 200, carry a canonical, and appear in `sitemap.xml` _(P1)_
    - _Requirements: 1.3, 1.4, 5.1_
  - [ ] 8.3 Assert the FAQ renders as `<details>`/`<summary>` in the served HTML _(P2)_
    - _Requirements: 2.4_
