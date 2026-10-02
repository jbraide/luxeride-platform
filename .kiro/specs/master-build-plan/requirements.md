# Requirements Document

## Introduction

LuxeRide has nine feature specs, a release-readiness audit and a shared factual brief. Every one of
them is internally coherent and individually correct. None of them tells the owner what to build on
Monday. `00-RELEASE-READINESS-AUDIT.md` §9 lists 86 done and 838 remaining items across nine plans
that overlap, restate and occasionally contradict one another, and §10 gives a nine-step
recommendation that is prose rather than a gate anyone can check.

The practical result is that the owner currently has three competing ladders — the architecture
plan's Phases 1–5, the fitment spec's Phases P0–P5, and the `_(P0)_` / `_(P1)_` / `_(P2)_` urgency
tags on individual tasks — with no stated relationship between them, and no statement of which
milestone unlocks which. This is the specification that resolves that.

**What breaks without this spec.** The build blocker (B1, a single bad import in
`luxeride-web/prisma/seed.ts`) and the missing repository (B4) are ten-minute fixes that appear as
task 1.1 of `storefront-catalog`, task 1.1 of `commerce-backend`, task 2.1 of `payments-paystack`,
Gate 1 of `trust-and-policies` and item 12.1 of `ad-landing-and-tracking` — five homes, no ordering
between them. The fabricated fit claim (B2) is P0 in `fit-finder §2` and source-doc Phase 0/2 in
`fitment-engine §2–§4`. `commerce-backend` once asked the owner to choose between Supabase, Neon and
self-hosted, and the owner has since decided **Postgres, local for now** — but the answer is recorded
in one spec's `## Decisions` section rather than anywhere a reader of the other nine would find it, so
a dependency that is already satisfied still reads as an open blocker. And nothing anywhere states the
one fact that determines the first two weeks: **the first ad run needs no database at all**, while
`payments-paystack` and `whatsapp-engine` both sit behind `commerce-backend` because they require an
order record.

**What this spec is.** The entry point and the source of truth for *sequencing*. It owns the order
of work, the definition of done for each milestone, and the reconciliation of the three ladders. It
owns no implementation detail; each of those already belongs to a module spec, and this plan
delegates to them by task number rather than restating them.

**Audience.** A solo owner working alone, with no CI, no tests, no version control today, and a
stated intent to run paid ads as soon as possible.

---

## Requirements

### Requirement 1 — One ordered path across the whole system

**User Story:** As the solo owner, I want a single ordered sequence covering all nine modules, so
that I always know what to build next and never have to reconcile nine plans myself.

#### Acceptance Criteria

1. WHEN the owner asks "what do I build next" THEN THE PLAN SHALL return exactly one next
   milestone, `tasks.md` §M, and the first unchecked sub-task inside it.
2. IF a milestone is in progress THEN THE PLAN SHALL list every remaining sub-task in that milestone
   in a fixed order, and each sub-task SHALL name either a file it touches or the module spec task
   it delegates to.
3. THE PLAN SHALL order every milestone so that no milestone in position *N* requires work belonging
   to a milestone in position *N+1* or later, except where a sub-task is explicitly tagged as
   belonging to a later milestone's *scope* but not its *blocking* work.
4. IF work belongs to no module spec THEN THE PLAN SHALL state it as a first-class sub-task owned by
   this spec, and SHALL NOT restate a task that a module spec already owns.
5. THE PLAN SHALL NOT mark a sub-task `- [x]` unless it was verified complete in code during the
   session that wrote this spec, and every `- [x]` item SHALL carry a `_(verified: path)_` annotation.

### Requirement 2 — Every module spec is reachable from the plan

**User Story:** As the owner, I want all nine module specs mapped into the sequence, so that no
spec's work falls between milestones or is silently dropped.

#### Acceptance Criteria

1. THE PLAN SHALL contain a reachability table mapping each of the nine module spec directories —
   `storefront-catalog`, `fit-finder`, `ad-landing-and-tracking`, `cart-checkout`,
   `commerce-backend`, `payments-paystack`, `whatsapp-engine`, `fitment-engine`,
   `trust-and-policies` — to at least one milestone, and to a done/remaining count read from that
   spec's own `## Status` block.
2. IF a module spec's `## Status` count disagrees with this plan's recorded count THEN THE PLAN SHALL
   defer to the module spec and flag the disagreement rather than restate a stale number.
3. WHILE a module spec remains unreferenced by any milestone THEN THE PLAN SHALL be incomplete and
   SHALL say so in `## Status`.

### Requirement 3 — Each milestone is independently shippable and reviewable

**User Story:** As the owner, I want each milestone to stand on its own, so that I can stop after
any milestone and still have something I can deploy, show, or review without a half-built
dependency.

#### Acceptance Criteria

1. THE PLAN SHALL express each milestone's exit gate as a condition observable from outside the
   codebase — a command's exit code, a file's existence, a rendered page, a recorded number — and
   never as an opinion.
2. IF milestone *N* ships THEN THE APPLICATION SHALL still start, still build, and still sell the
   same thing it sold before milestone *N* began, with any new capability added alongside and no
   existing capability removed.
3. THE PLAN SHALL forbid a milestone from importing a module, function, table or env var that a
   later milestone is responsible for creating.
4. WHILE a milestone is marked complete THEN ITS DELIVERING MODULE SPECS SHALL REMAIN THE PLACE
   THE DETAILED TASK LIST LIVES; this plan SHALL only record the delegation and the gate.

### Requirement 4 — Every gate is explicit and checkable

**User Story:** As the owner, I want each gate to be a test I can run, so that "done" is never a
judgement call I make about my own work.

#### Acceptance Criteria

1. EACH milestone exit gate SHALL name at least one command, with its arguments, and the exit code
   or literal output that constitutes a pass.
2. IF a gate can only be checked by reading a page or a file THEN THE GATE SHALL name the exact path
   and the exact string, value or route that must be present.
3. THE PLAN SHALL adopt the two pre-spend gate lists that already exist rather than inventing a
   third — `ad-landing-and-tracking/tasks.md` §12 (15 gates) and `trust-and-policies/tasks.md`
   "Before any ad spend" (7 gates) — and SHALL place both in one milestone, `tasks.md` §M5.
4. IF a required external account, key, approval or decision does not exist THEN THE GATE SHALL be
   listed as BLOCKED with the thing that is missing named, rather than being dropped from the gate.
5. THE PLAN SHALL NOT write a gate in the form "the site is honest" or "the flow works"; where a
   property is not mechanically checkable it SHALL be re-expressed as the specific observable that
   stands for it.

### Requirement 5 — The three competing ladders are reconciled

**User Story:** As the owner, I want the architecture plan's Phases 1–5, the fitment spec's Phases
P0–P5 and the P0/P1/P2 urgency tags to be reconciled in one place, so that a P0 in one spec and a
Phase 3 in another do not read as contradictory instructions.

#### Acceptance Criteria

1. `design.md` SHALL contain a mapping table from every architecture-plan Phase (1–5) and every
   fitment-spec Phase (P0–P5) to the milestone in this plan that delivers it, and SHALL state
   explicitly where a source-doc phase is deliberately inverted against urgency — naming the case
   where fitment P2 (`/fit-check`) is built at Milestone M2 because it is the P0 urgency item that
   resolves the fabricated fit claim, and where fitment P1 (admin) is deferred to M9.
2. THE PLAN SHALL state which ladder is authoritative for which question: the urgency tags decide
   *when*; the source-doc phases decide *what the deliverable contains*; this plan decides *order*.
3. WHERE two specs tag the same work differently THE PLAN SHALL record both tags and the milestone,
   rather than silently choosing one.
4. THE PLAN SHALL carry forward the fitment spec's convention that a task whose source-doc phase
   differs from its urgency tag is written `_(P0 — source-doc Phase 2)_`, so the inversion is
   visible in the module specs too.

### Requirement 6 — One decision queue for the owner

**User Story:** As the owner, I want every unresolved business decision from all nine specs
collected in one deduplicated list with what it blocks, so that I can answer them in one sitting
instead of discovering them mid-build.

#### Acceptance Criteria

1. `design.md` § Open Questions SHALL contain every unresolved item from all nine `## Open Questions`
   sections, deduplicated, and each entry SHALL name the milestone(s) it blocks and the date or event
   by which it must be answered.
2. THE PLAN SHALL NOT introduce a decision that no module spec raised, except where this plan itself
   creates one — the local-database-versus-public-traffic contradiction in Requirement 8.
3. IF two specs ask the same business question in different words THEN THE QUEUE SHALL carry one row
   naming both sources, not two rows the owner has to notice are the same.
4. THE PLAN SHALL distinguish decisions that block code from decisions that block spend, because
   `ad-landing-and-tracking` § Open Questions 1 records that NDPC registration "blocks nothing in the
   build; may block the first spend".

### Requirement 7 — The launch metrics the fitment spec mandates are recorded

**User Story:** As the owner, I want the metrics the fitment spec requires to be written down on the
day, so that later I can tell whether the fit claim I made was true.

#### Acceptance Criteria

1. THE PLAN SHALL require a Confirmed-layout count to be recorded on launch day, because
   `luxeride-web/luxeride-fitment-engine-admin-layout-grouping-spec.md` line 229 makes it a
   consequence of locked decision 2 and `ad-landing-and-tracking/tasks.md` 12.11 repeats it.
2. THE PLAN SHALL name the file the record is written to, and the milestones whose gate checks it.
3. THE PLAN SHALL also record the baseline numbers `ad-landing-and-tracking/tasks.md` 12.15 names —
   sessions, `car_search_no_match` rate, `fit_refused` rate,
   `fit_result_rendered state=FITTED` count, `Lead` count — so week one has something to be
   measured against.
4. THE PLAN SHALL record whether the first ad run is acquisition targeting or demand mapping, as a
   dated decision rather than an inference drawn later from the data.

### Requirement 8 — The environment strategy, and the contradiction inside it

**User Story:** As the owner, I have decided "Postgres, run locally for now", and I need the
environment set up, the backup discipline written down, and the conflict between a local database
and public paid traffic named honestly, so that I know which parts of this plan are real today.

#### Acceptance Criteria

1. THE PLAN SHALL record the verified environment facts — no `postgresql`, no `docker.io`, no
   `brew`, nothing listening on 5432, the `.env` `DATABASE_URL` placeholder shape, and the fact
   that `sudo` cannot be run from the agent sandbox — and SHALL state that the install command is
   therefore the owner's to run.
2. THE PLAN SHALL specify the local setup as native apt Postgres rather than a container, and SHALL
   name the reason: no container runtime is installed, so a container choice is strictly more
   moving parts than a package that has a candidate version already resolved in apt.
3. THE PLAN SHALL specify the `pg_dump` backup discipline that replaces the managed backups
   `commerce-backend` design **§ Decisions, Decision 1** weighed and gave up by choosing local, and
   SHALL state that a backup never restored is not a backup.
4. THE PLAN SHALL state the contradiction explicitly: **a local database and public paid traffic
   cannot both be true at once**, and SHALL present the three real options — deploy the app and make
   the database reachable; run the app locally behind a tunnel; or keep the first ad run free of any
   database dependency — with a recommendation, because the answer changes the sequence.
5. THE PLAN SHALL record that the first ad run genuinely needs no database, naming the three
   mechanisms that work without one: the static Confirmed-only fitment table, the `wa.me` WhatsApp
   handoff, and the pixel.
6. THE PLAN SHALL include the promotion task from local Postgres to a hosted instance as its own
   milestone task, because `commerce-backend/tasks.md` 2.3 moves the real connection string into
   `.env.local` and the local-to-hosted change is a URL change plus a `pg_dump`/restore.

### Requirement 9 — No work may depend on a database that does not exist

**User Story:** As the owner, I want the plan to be executable today with the tools I have, so that
a missing database never becomes a silent blocker three milestones in.

#### Acceptance Criteria

1. EVERY milestone that is not gated on a provisioned database SHALL be marked as requiring no
   database, and its gate SHALL be achievable with `npm run build` alone.
2. THE FIRST milestone that requires a live database SHALL sit after the database-install task
   completes, and the plan SHALL state that the install may run in parallel with earlier milestones
   but that nothing earlier may depend on its result.
3. IF a module spec's task list contains a task that imports `@prisma/client` or a `src/lib/db.ts`
   THEN THE PLAN SHALL place it at or after that milestone, and SHALL name the task number so the
   owner can find the ones that moved.
4. THE PLAN SHALL state that `fitment-engine`'s Phase 0 static table is explicitly NOT in this
   category — it is a compile-time TypeScript array with no database — so the single fix for the
   fabricated fit claim is unblocked today.
