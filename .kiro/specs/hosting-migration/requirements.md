# Requirements Document

## Introduction

LuxeRide's storefront and admin console run today as **one Cloudflare Worker**
(`luxeride-web`), built by `@opennextjs/cloudflare` from a Next.js 16 app in
`luxeride-web/` (`luxeride-web/wrangler.jsonc`). The Worker reaches Postgres through a
Hyperdrive binding (`HYPERDRIVE`, id `a36429d51364428c8bf8c1f39c7abbda`) pointing at a
Supabase instance, and reads `env.HYPERDRIVE.connectionString` before falling back to
`DATABASE_URL` (`luxeride-web/src/lib/db.ts`).

A Cloudflare Worker isolate is capped at **128 MB of memory**, and that cap cannot be
raised on any Cloudflare plan. On 2026-10-12 the admin's `/admin/vehicles` rendered a
**4.6 MB** HTML document (2.8 MB of it the RSC flight payload) on every request, because
a collapsed `<details>` still renders its children on the server. Rendering that was
enough to exceed the isolate ceiling; the platform answered with Cloudflare Error 1102
("Worker exceeded resource limits"), including during an admin write.

The payload defect is being fixed in the application (the make level is now URL-driven;
the default view fell from 4.6 MB to ~122 KB). This spec addresses the **structural**
problem underneath it: any future page, feature, or traffic spike can re-approach a cap
we cannot raise, and the incident cost real trust during a paid ad campaign.

The decision this spec resolves is **deployment topology**, not application behaviour.
Two shapes are on the table, and the operator chooses:

- **Split** — the public storefront stays on Cloudflare's edge (Cloudflare has points of
  presence in Lagos and Port Harcourt, which is where the ad traffic is); the admin
  console moves to a runtime without a per-isolate cap.
- **Single host** — the whole app moves to a Node runtime (Vercel first among them,
  because a `jbraide/luxeride-platform` remote already exists for that purpose).

## Glossary

- **Storefront** — the public, customer-facing routes: `/`, `/shop`, `/products/*`,
  `/fit-finder`, `/order/*`, `/api/*`, and the generated `sitemap.xml`/`robots.txt`.
- **Admin** — the `/admin` subtree (the console), reached only through `src/proxy.ts`
  and a signed session cookie.
- **Edge runtime** — Cloudflare Workers, whose isolates are capped at 128 MB.
- **Node runtime** — a long-lived Node.js server (Next.js `next start`) or a managed
  Node function (Vercel, AWS Lambda), where memory is a configured size, not a fixed cap.
- **Pooler** — a connection pooler in front of Postgres (Supabase Supavisor, or
  PgBouncer). Required by any host that opens many short-lived connections.
- **TTFB** — time to first byte, measured from Lagos against the deployed origin.

## Requirements

### Requirement 1 — No request fails on a fixed per-isolate memory ceiling

**User Story:** As the operator, I want no visitor or admin action to die because the
host ran out of a memory budget I cannot raise, so that the site stays up while I am
paying for ads.

#### Acceptance Criteria

1. WHEN the admin renders any screen under concurrent load THEN the host SHALL NOT
   terminate the request for exceeding a fixed per-isolate memory limit.
2. WHEN any route produces a server-rendered HTML response THEN that response SHALL be
   under 1 MB at the 95th percentile, measured on a production build.
3. IF a route's response body exceeds 4 MB in a smoke test THEN the deployment SHALL be
   treated as failed.
4. WHEN the host terminates a request for a resource limit THEN an alert SHALL fire
   within 15 minutes (see Requirement 8).

### Requirement 2 — The storefront stays fast for Nigerian users

**User Story:** As a customer in Lagos or Port Harcourt who clicked an ad, I want the
product pages to load quickly so that I buy instead of leaving.

#### Acceptance Criteria

1. WHILE the storefront is served from Cloudflare's edge, TTFB from Nigeria SHALL remain
   no worse than the current deployment's TTFB.
2. IF the whole app is moved to a single Node host, THEN the storefront's TTFB from
   Nigeria SHALL be measured before and after, and the measured regression SHALL be
   recorded in this spec before the move is accepted.
3. WHEN a static asset is requested THEN it SHALL be served from cache without invoking
   the application runtime.

### Requirement 3 — The admin is a first-class, reliable surface

**User Story:** As the operator, I want the console to respond immediately and never
500 mid-write, so that I can run the catalogue without fear.

#### Acceptance Criteria

1. WHEN the operator opens any `/admin` screen THEN it SHALL render without a resource
   limit error under the chosen topology.
2. WHEN the operator submits any admin write (Server Action) THEN the action SHALL
   complete and re-render its target screen without exceeding the runtime's limits.
3. WHEN an admin screen is heavier than 1 MB after gzip THEN it SHALL be reworked to
   render less, regardless of host.
4. WHEN the admin runs on a Node host THEN it SHALL authenticate with the same signed
   session cookie mechanism, unchanged.

### Requirement 4 — One database, no application-data migration

**User Story:** As the operator, I want the move to change only how the app reaches the
database, so that no order or catalogue row is put at risk.

#### Acceptance Criteria

1. WHEN the move is complete THEN all hosts SHALL read and write the same Supabase
   Postgres instance that is live today.
2. WHEN a host opens connections THEN it SHALL use a pooled connection string, and each
   serverless instance SHALL hold at most one database connection.
3. WHEN the migration is performed THEN no `prisma migrate`/`db push` SHALL run against
   the live database.
4. IF a host cannot reach the database directly THEN the failure SHALL be surfaced as a
   handled error page, not a platform error.

### Requirement 5 — Secrets never live in the repository

**User Story:** As the operator, I want credentials handled the same careful way they
are today so that a repo leak does not leak the database.

#### Acceptance Criteria

1. WHEN a host is configured THEN every secret (`DATABASE_URL`, `ADMIN_SESSION_SECRET`,
   `ADMIN_USER`, `ADMIN_PASSWORD_HASH`) SHALL be set as a host secret, never committed.
2. WHEN the build runs THEN a non-secret build-time connection string SHALL be available
   for prerendering, and it SHALL NOT be a superuser credential.
3. IF a required secret is missing THEN the deploy SHALL fail rather than go live and 500.

### Requirement 6 — Reversible in minutes

**User Story:** As the operator, I want to undo the move quickly if it goes wrong, so
that one bad deploy does not end the evening.

#### Acceptance Criteria

1. WHEN a rollback is required THEN restoring the previous topology SHALL take under 15
   minutes and SHALL NOT require a database change.
2. WHEN the previous Cloudflare deployment is retained THEN it SHALL remain deployable
   until the new topology has run for 7 days without a Requirement 1 failure.

### Requirement 7 — Cost stays bounded and legible

**User Story:** As the operator, I want to know what this costs monthly before I commit
so that a platform choice does not surprise me.

#### Acceptance Criteria

1. WHEN a topology is chosen THEN its expected monthly cost SHALL be stated in this
   spec, with the assumptions that produce it.
2. WHEN usage grows 10× THEN the topology's cost SHALL grow sub-linearly or be capped.

### Requirement 8 — Resource-limit failures are visible, not silent

**User Story:** As the operator, I want to be told when a request fails on a resource
limit, so that I learn it from an alert and not from a customer.

#### Acceptance Criteria

1. WHEN the Worker returns `exceededResources` THEN a notification SHALL be delivered
   within 15 minutes.
2. WHEN the admin returns a 5xx THEN the failure SHALL be recorded with the path and a
   request id.

### Requirement 9 — The deployment is reproducible from the repository

**User Story:** As a developer, I want the deploy to be a committed command so that a
move is not a one-off hand-edit in a dashboard nobody can review.

#### Acceptance Criteria

1. WHEN the topology is set up THEN every non-secret setting SHALL live in a committed
   config file.
2. WHEN a deploy is triggered by a push to `main` THEN it SHALL build and deploy without
   manual steps beyond secrets already stored in the host.
