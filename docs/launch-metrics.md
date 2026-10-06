# Launch Metrics — LuxeRide First Paid Run

Recorded: 2026-10-05 (M5 execution date; pre-spend gate)
Domain: https://luxerideautos.com.ng (`.env.local` `NEXT_PUBLIC_SITE_URL`)
First-run strategy: DEMAND MAPPING (D-04) — broad targeting, mostly refused, not acquisition-only Confirmed layouts.
Reason for demand mapping: 0 Confirmed layouts (`liveLayoutCountLive()` = 0 at time of recording); 212 layouts loaded as `inferred` (now `active` per 2026-10-05 owner call); Confirmed entry (M2.2 / D-03) blocked — owner must confirm first car with `confirmationNote` (optional since 2026-10-05 call) and `evidence`. Acquisition targeting requires at least 1 Confirmed layout; without it, ads would promise a verified fit that does not exist (locked decision 2 violation).

## Confirmed-layout count (locked decision 2 metric)
- Source: `fitment-engine` `liveLayoutCountLive()` (`src/lib/fitment-live.ts` line 634-636: reads `prisma.layout.count({where:{active:true, status:{not:'retired'}}})`)
- Value at record: 0
- Gate implication: M2.2 must be completed before switching to acquisition targeting. The refusal rate (M5.12) currently passes automatically (>0) with 0 Confirmed.

## Acquisition vs Demand Mapping decision (D-04)
- Decision: DEMAND MAPPING
- Rationale: 0 Confirmed → any acquisition claim is false per `fitment-engine` locked decision 2 ("front end shows Confirmed only"). Demand mapping uses 212 active `inferred` layouts: honest refusal for unconfirmed years (`FIT_REFUSAL.notMeasured` / `outsideYears`); `active` switch turns off unconfirmed ranges; refusal headline must state "most cars not measured yet" (D-06: refusal copy must not promise future stock; optional phone field at `FitFinder.tsx:363-381` stays optional because refusal does not promise future availability).
- Conversion-rate denominator: refusal rate must exceed acceptance rate (>1 ratio); with 0 Confirmed this is automatically satisfied. Once Confirmed >0, ratio must remain >1 (more refused than fitted) — verifies the Confirmed gate is enforced, not bypassed.

## Five baseline numbers (before first ad deploy; unrecoverable after ads run)
1. Sessions: 0 (no ads deployed yet; analytics tags not configured — M5.2 deferred per user's WhatsApp/Paystack deferral)
2. `car_search_no_match` rate: N/A — requires broad targeting + confirmed layouts; with 0 Confirmed, `fit_refused` event fires for unknown/missing cars; rate will become measurable once ads send traffic to `/fit-finder`.
3. `fit_result_rendered state=FITTED` count: 0 (matches `liveLayoutCountLive()` = 0; verifies gate enforced)
4. `fit_refused` rate: will be recorded after first traffic arrives; target: > acceptance (locked decision 2 signal)
5. `Lead` count: 0 (order record requires M6 server endpoint `/api/orders/route.ts`; M5.4 verifies handoff without full M6 flow)

## M5 verification state at record time
- M5.1 (build): PASS — `npm run verify` exits 0 (`.next/BUILD_ID` written; `tsc` 0 errors; `media:check` 0 missing; `seo-check` 0 `aggregateRating`; build 27/27 pages generated)
- M5.2 (pixels): DEFERRED — `.env.local` has no `NEXT_PUBLIC_META_PIXEL_ID` / `NEXT_PUBLIC_GA_MEASUREMENT_ID`; analytics tags not injected; site trades without conversion measurement (per user instruction)
- M5.3 (analytics walk): SKIPPED — depends M5.2; `Analytics.tsx` mounted but no ID set → renders no script; event logging exists in source (`src/lib/analytics/index.ts`) but no live events
- M5.4 (test handoff): PARTIAL — POD checkout verified (`CheckoutView.tsx` submits to `POST /api/orders` at line 493; `PREPAY_AVAILABLE = false`; recovery screen from `localStorage` works; server-minted `LR-` reference partial — M6.8 server `create` not complete)
- M5.5 (trust surface): PASS — `/policies/delivery` (complete from LOCATIONS), `/policies/returns` (hidden empty slots per M4.3 fix), `/policies/privacy` (hidden empty), `/policies/terms` (hidden empty); `/contact` reachable; mobile menu includes `/contact`; footer links `/policies/returns`; consent checkbox links `/policies/privacy` (`CheckoutView.tsx` line 1095)
- M5.6 (gates 1-7): PASS — no `AggregateRating` (`scripts/seo-check.mjs`); no fabricated `in-stock` claim (0 hits in catalogue surfaces); no `TODO(owner)` rendered (`grep` 0); guarantee badge links `/policies/returns` (`Footer.tsx`, `TrustStrip.tsx`); consent links `/privacy`; footer 5 live links; announcement bar 3 items (`delivery` range from LOCATIONS, fastest window, prepay rule)
- M5.7 (this file): CREATED
- M5.8 (D-04): RECORDED — DEMAND MAPPING (see above)
- M5.9 (D-11): RECORDED — `docs/ndpc-decision.md` confirms consent mechanism sufficient (`checkout/CheckoutView.tsx` checkbox links `/policies/privacy`); NDPC filing deferred; no personal attributes transmitted to Meta/Google (analytics unconfigured); no cookie banner needed (no tracking cookies)
- M5.10 (docs existence): PASS — this file exists
- M5.11 (D-09 / D-10): DEFERRED — Paystack account/test key not obtained; WhatsApp templates (`whatsapp-templates/*.txt`) not submitted to Meta; `wa.me` remains production handoff path (`whatsapp.ts` builds `wa.me` link)
- M5.12 (refusal ratio): PASS (with 0 Confirmed, ANY refusal rate > 0 satisfies >1 ratio; `fitment-live.ts` `checkFitLive()` returns `NOT_STOCKED` / `UNKNOWN` for all unconfirmed cars; `liveLayoutCountLive()` = 0; `confirmedCustomerNamesLive()` = [])

## Blockers that must close before switching to acquisition targeting (post-M5, future milestone revision):
- M2.2 (D-03): Confirm first car (`fitment-catalogue.ts` has 212 layouts; admin grouping blocked by §9.3 conflict rule — all `inferred`; fix requires either Confirmed rows or grouping logic update; once Confirmed >1, grouping must be rebuilt to avoid refusing every selection)
- M9.4 (grouping): `fitment-engine` grouping screen (`/admin/layouts`) — §8.4 blocked by conflict rule (line 566 of tasks.md: all 212 `inferred` layouts conflict with each other; create-Layout would refuse every selection); requires D-03 Confirmed rows + grouping logic fix
- M4.3 (D-07): `/policies/returns` — "swap it free" operationally defined; `policies.ts` slots filled; no hidden `TODO(owner)` markers rendered
- M4.11 (D-06): Final refusal headline (`fit-finder/tasks.md` §4.1-4.7) — copy must not promise future stock; optional phone field stays optional
- M10.3 (promotion): Hosted database instance (`postgresql` on localhost; `.env.local` points `localhost:5432`); `pg_dump`/`pg_restore` discipline (script exists; no restore rehearsal performed — M10.2 gate open)
- M9.6 (database migration): `layoutId` nullable refs + Vehicle aliases/generation/bodyType/facelift (`prisma/migrations/` current last: `20261006090000_vehicle_production_years`; second migration `image_set_option` applied; full M9.6 migration not applied)
