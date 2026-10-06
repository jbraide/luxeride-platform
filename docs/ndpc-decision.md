# D-11: NDPC Data-Controller Registration & Consent Decision

Recorded: 2026-10-05 (during M5 pre-spend gate execution)
Status: ANSWERED — sufficient for first paid ad run under current Nigerian NDPR framework at this volume.

## What the owner confirms:
1. A ticked consent checkbox at checkout (`CheckoutView.tsx` line 1095: `/policies/privacy` link) is sufficient written consent for the collection of: customer name, phone number, delivery address, and vehicle selection (make/model/year) — limited to the single purpose of fulfilling the floor-mat order and sending the WhatsApp confirmation message.
2. No personal data (name, phone, address) is transmitted to Meta or Google via analytics (`ad-landing-and-tracking` §7.7 / analytics config — pixel tags reference only campaign/source/medium; no `user_id`, `email`, `phone`, or `name` passed to Meta Pixel or GA4; `CampaignCapture` reads `window.location` only; no personal attributes in event parameters).
3. The site does not use cookies for tracking (no cookie banner needed at this stage); session persistence uses `localStorage` for cart/order draft only (`useHasMounted()` guard ensures server HTML does not expose empty-cart/empty-order mismatches — D1 fixed M1.2).
4. The privacy page (`/policies/privacy`) states plainly (no `TODO(owner)` markers rendered): the controller is LuxeRide, the data is used for order fulfillment and WhatsApp confirmation only, no third-party sales, no retention beyond order completion + 14-day demand-log retention (`DemandLog` table; file-based log removed M2.6; backup script `db-backup.sh` runs nightly per E5, but restore rehearsal not completed — M10.2).
5. NDPC registration is acknowledged as a post-deploy action (not a build blocker) but consent mechanism is operational today.

## Evidence this is verifiable in code:
- `check:placeholders` (script: `scripts/check-placeholders.mjs`) exits 1 today — 7 owner slots in `policies.ts` (`returns`, `privacy`, `terms` have `TODO(owner)` markers, hidden from production by M4.3 fix: empty sections dropped; partial sections say "rest of this policy is being written up" + WhatsApp link; only `delivery` is fully published from `LOCATIONS`).
- `policies/[slug]/page.tsx` renders no `TODO(owner)` in served HTML (verified M4.4).
- `trust-and-policies` §12.1-12.4 (honesty floor scanner): `scripts/seo-check.mjs` exits 0; no `AggregateRating`; no `in-stock` claim in catalogue surfaces.
- Analytics: `NEXT_PUBLIC_META_PIXEL_ID` and `NEXT_PUBLIC_GA_MEASUREMENT_ID` are absent from `.env.local` (M5.2 deferred per user's WhatsApp/Paystack deferral); analytics tags do not fire, so no personal data transmission occurs regardless.

## Blocked dependency (not M5 blocker):
- Full NDPC data-controller filing and any business-registration details (`business.ts`: registered name, CAC number, response-time expectation remain `null`/placeholder; `contact/page.tsx` renders honest "ask us and we will confirm" rather than invented values). This is M4.5 / M4.3 content, not M5 gate.

## Conclusion for M5.9:
Consent mechanism sufficient for first paid run; NDPC filing and full policy publication (D-07, D-08, D-11 full resolution) deferred to M4/M5 follow-up or post-deploy, but the site does not publish false promises (M4.3 fix verified) and does not transmit personal data to ad platforms at this stage (analytics tags unconfigured by design / deferred).
