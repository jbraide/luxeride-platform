# Implementation Plan

> Scope note: this plan is almost all *configuration and guardrails checked into the
> repository*, because the feature is a deployment topology. Every task produces a file a
> reviewer can read, not a dashboard click. Where a step does touch a provider's
> console (DNS, an alert, a secret), the task also produces the committed artefact that
> documents it.

- [ ] 1. Make the database client runtime-agnostic (the only application-code change)
  - [ ] 1.1 In `luxeride-web/src/lib/db.ts`, resolve the connection in order: `env.HYPERDRIVE.connectionString` when the binding exists (Cloudflare), otherwise `DATABASE_URL` (Node host). Keep the existing behaviour on Cloudflare byte-identical.
    - _Requirements: 4.1, 4.2_
  - [ ] 1.2 When the resolved string is a Supavisor/PgBouncer transaction pooler, ensure Prisma runs with `pgbouncer=true`, `connection_limit=1` and prepared statements disabled, so each serverless instance holds at most one pooled connection.
    - _Requirements: 4.2_
  - [ ] 1.3 Cache exactly one client per instance on the module (the existing Prisma singleton); add a unit test asserting repeated imports return the same client and never construct per request.
    - _Requirements: 4.2_
  - [ ] 1.4 Add a test that a missing `HYPERDRIVE` binding falls back to `DATABASE_URL` rather than throwing, and that a totally missing connection string produces a handled error, not a crash.
    - _Requirements: 4.4_

- [ ] 2. Payload budget guard (prevents any page re-reaching the ceiling)
  - [ ] 2.1 Write `luxeride-web/scripts/payload-budget.mjs`: for every route in the built `.next` route manifest, render/fetch it and record the gzipped body size.
    - _Requirements: 1.2_
  - [ ] 2.2 Fail the script when any route exceeds **4 MB** (the hard stop), and warn above **1 MB**.
    - _Requirements: 1.3_
  - [ ] 2.3 Wire the script into `npm run verify` so a regression cannot merge.
    - _Requirements: 1.2, 1.3_
  - [ ] 2.4 Add `luxeride-web/src/app/admin/**` route checks explicitly, since the admin was the offender.
    - _Requirements: 1.1, 3.3_

- [ ] 3. Admin host deploy configuration (Option A) or single-host config (Option B)
  - [ ] 3.1 Add the host config file (e.g. `luxeride-web/vercel.json`) pinning the function region next to Supabase (`fra1`) and an explicit memory size for admin routes.
    - _Requirements: 3.1, 7.1, 9.1_
  - [ ] 3.2 Set the build command to the existing `npm run build` and the output to the Next.js standard, so no OpenNext shim is involved on this host.
    - _Requirements: 9.2_
  - [ ] 3.3 Commit an environment matrix (`.env.example` additions are acceptable here) listing each variable, whether it is secret, and where it is set. No values.
    - _Requirements: 5.1, 5.2_

- [ ] 4. Route the admin to one runtime
  - [ ] 4.1 For Option A: commit the DNS/routing decision as documentation — `admin.luxerideautos.com.ng` (or a proxy rule if it must stay at `/admin`) — and verify a request to `/admin` lands on exactly one runtime.
    - _Requirements: 3.1, 9.1_
  - [ ] 4.2 Confirm the admin still returns `robots: noindex` from the new host and still requires the signed session cookie, unchanged.
    - _Requirements: 3.4, 5.1_

- [ ] 5. Alerting on resource-limit failures
  - [ ] 5.1 Configure a Cloudflare notification (or a scheduled query of `workersInvocationsAdaptive` filtered to `status: exceededResources`) that fires within 15 minutes.
    - _Requirements: 1.4, 8.1_
  - [ ] 5.2 Add admin 5xx logging that records the path and a request id, so a failure is attributable after the fact.
    - _Requirements: 8.2_

- [ ] 6. Connection and load smoke test
  - [ ] 6.1 Add a script that drives concurrent requests at the storefront and the admin and asserts no `exceededResources` and no connection-exhaustion errors.
    - _Requirements: 1.1, 3.1, 4.2_
  - [ ] 6.2 Run it against the chosen topology before cutover and record the result.
    - _Requirements: 1.1_

- [ ] 7. Measure and record storefront TTFB
  - [ ] 7.1 Capture TTFB for `/`, `/shop` and one product page from a Nigerian vantage before the change.
    - _Requirements: 2.1, 2.2_
  - [ ] 7.2 Capture the same after the change and write both into `design.md`; if Option B, treat a regression above the recorded tolerance as a failed requirement.
    - _Requirements: 2.1, 2.2_

- [ ] 8. Rollback
  - [ ] 8.1 Write `hosting-migration/rollback.md` with the exact steps to return to the Cloudflare-only topology, and confirm they need no database change.
    - _Requirements: 6.1_
  - [ ] 8.2 Keep the current Worker deployable for 7 days after cutover and note the date the retention ends.
    - _Requirements: 6.2_

- [ ] 9. Cost statement
  - [ ] 9.1 Fill in the chosen topology's expected monthly cost with its assumptions in `design.md`.
    - _Requirements: 7.1, 7.2_
