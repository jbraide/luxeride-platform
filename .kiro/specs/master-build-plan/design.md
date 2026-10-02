# Design Document

## Overview

This document is the sequencing authority for LuxeRide. It resolves three things the nine module
specs deliberately leave open between them: **which document wins when two of them disagree**, **what
order the work happens in**, and **which of the owner's outstanding decisions sit on the critical
path**.

It specifies no feature. Every implementation detail already has a home, and this document points at
it. Where this plan states a fact about the codebase it names the file; where it states an
environment fact it was verified in the session that wrote this file.

### The authority hierarchy

Stated plainly, because nine specs plus two owner documents plus a prototype plus a codebase is
eight sources of truth unless one is declared the winner.

| Rank | Source | What it owns | What it overrides |
|---|---|---|---|
| 1 | **Owner intent** — `platform/luxeride-architecture-plan.md`, the validated prototype `platform/luxeride-funnel (2).html`, and the **🔒 LOCKED DECISIONS (Fri 2 Oct 2026)** in `platform/luxeride-web/luxeride-fitment-engine-admin-layout-grouping-spec.md` lines 197–210 | What the product is, what it refuses to claim, what it promises, and the four settled fitment questions | **Everything.** These are the owner's own decisions, recorded and dated. |
| 2 | **This master plan** | Sequencing: milestone order, gates, the reconciliation of the three ladders, the decision queue | Module specs' *ordering*; where two module specs order the same work differently |
| 3 | **Module specs** (`_CONTEXT.md` and the nine `*/design.md` + `*/tasks.md`) | How each part works: data shapes, file paths, acceptance criteria, task lists | This plan's *implementation* choices; where a module spec's file path contradicts the order set here, the module spec's path wins |
| 4 | **`_CONTEXT.md` + `00-RELEASE-READINESS-AUDIT.md`** | The verified fact base: what exists, what does not, defects D1–D7, blockers B1–B4 | Nothing — it is a *description*, and it wins any argument about what the code currently does |
| 5 | **Code** | What it actually does | Nothing. Code that contradicts rank 1–3 is a bug, not a decision. |

**Four resolutions this plan actually makes**, because the sources genuinely conflict:

1. **The database host was an open question across several specs; the owner has since answered it:
   Postgres, local first.** This is settled owner intent, recorded in `commerce-backend` — its
   `design.md` **§ Decisions, Decision 1**, with the concrete install, cluster and role/database steps
   at `commerce-backend/tasks.md` 2.1–2.2. The schema stays `provider = "postgresql"` and is therefore
   agnostic, so moving to a hosted instance later is one URL plus a promotion step (M10.x / `E5`
   below). What that decision *cost* is the managed daily backup the earlier specs were relying on:
   choosing local does not settle backups, so that half is carried separately in the decision queue
   (D-01) together with the hand-rolled `pg_dump` discipline that replaces it.
2. **The two milestone gates that both begin "the build must pass".** Five specs own a piece of
   B1. `commerce-backend §1.1–1.5` is the real fix (delete `seed.ts`, create `seed.mts`, add
   `allowImportingTsExtensions`, rewrite the `db:seed` script, add `postinstall: prisma generate`);
   `storefront-catalog §2.1–2.2` proposes a competing fix (add `"exclude": ["prisma"]` to
   `tsconfig.json`). **`commerce-backend` wins**, because excluding `prisma/` from the type-check
   leaves a broken seed outside the build's eyes rather than fixing it, and because `commerce-backend`
   owns the seed by name. `storefront-catalog §2.3–2.4` (README truth, a `verify` script) is
   complementary and is also scheduled.
3. **Route versus Server Action for order creation.** `cart-checkout/tasks.md` §4 mandates
   `src/app/api/orders/route.ts`; `commerce-backend/tasks.md` 6.1 mandates a Server Action at
   `src/app/checkout/actions.ts` and states explicitly that "no route handler ships in this spec at
   all". `payments-paystack` design § Open Questions 15 records that `/order/[id]` and
   `/order/confirmation` cannot both own the post-checkout view. This plan does **not** decide it —
   it is a module-spec conflict, carried as decision **D-02**, and it is on the M6 critical path
   because M6 cannot be built without picking one. It is the dependency this plan is least sure
   about; see § Open Questions.
4. **`/order/confirmation` versus `/order/[reference]`.** `commerce-backend` 7.1 creates
   `src/app/order/[reference]/page.tsx` with a redirect from the old path; `cart-checkout §7`
   rewrites the existing client page. **Both survive**: `cart-checkout` ships the three-branch
   confirmation screen first (it works with no database), and `commerce-backend` supersedes it later
   with the server-read page. `ad-landing-and-tracking/tasks.md` 12.7 checks the durability behaviour
   against whichever route is live at the time.

**What this plan will not do.** It will not restate a module spec's tasks, rank two module specs'
implementations against each other (that is rank 3's business, not rank 2's), or decide a business
question. The fitment spec's 🔒 LOCKED DECISIONS date-stamp **Fri 2 Oct 2026** and are binding on
every milestone below: owner-only editing with no roles; front end shows **Confirmed only**, so
Inferred is invisible to `/fit-check`; **price on the site** attached to the layout variant as
`priceFrom`; and **one layout = one make**. Each of the four is load-bearing somewhere in M2, M3,
M6 or M9, and where a module spec's P0 task would violate one, the locked decision wins.

---

## Current State (verified)

Verified by reading the files named, on 2026-10-02, in the session that wrote this document.

### What exists that this plan depends on

| Path | What it is | Why it matters here |
|---|---|---|
| `platform/.kiro/specs/_CONTEXT.md` | The shared factual brief | Sole fact base. §12 supplies the document formats this spec follows. |
| `platform/.kiro/specs/00-RELEASE-READINESS-AUDIT.md` | Point-in-time audit | Source of B1–B4, D1–D7, the money-path diagram, §10 recommended order, §11 owner decisions. **Note its §9 count table is a stale snapshot** — see the reachability table below. |
| `platform/luxeride-architecture-plan.md` | Owner doc A, 75 lines | §7 is the five-phase ladder this plan reconciles. |
| `platform/luxeride-web/luxeride-fitment-engine-admin-layout-grouping-spec.md` | Owner doc C, 261 lines | Lines 163–174 are the P0–P5 ladder; lines 197–210 are the 🔒 LOCKED DECISIONS. |
| `platform/luxeride-web/` | The Next.js app | `next@16.3.5`, `react@19.2.8`, `prisma@6.19.3` — all read from `node_modules/*/package.json` this session. |
| `platform/luxeride-web/src/` | 25 files | The nine module specs describe it; this plan orders the changes to it. |
| `platform/.kiro/specs/{nine}/tasks.md` | Nine plans | `## Status` blocks read; sub-task numbers enumerated by grep for delegation targets. |

**Note on paths.** `_CONTEXT.md` §1 draws `luxeride-web/` as a sibling of `platform/`. On disk it
is `platform/luxeride-web/` (verified by `ls` this session). Every `luxeride-web/…` path in the
module specs and in this plan resolves correctly as written, because those references are relative
to `platform/`, which is this spec's own directory. No path needs rewriting.

### What does not exist, and this plan assumes it will not until a gate says otherwise

| Absent | Verified how | Consequence for sequencing |
|---|---|---|
| A git repository | `_CONTEXT.md` §1; `00-RELEASE-READINESS-AUDIT.md` B4 | M0 owns it. Nothing else in the plan can be reviewed or rolled back until it exists. |
| A successful production build | `_CONTEXT.md` §3 — `.next/BUILD_ID` absent | M0 owns the fix. |
| `postgresql`, `psql`, `pg_dump`, `postgres`, `initdb`, `pg_ctl` | `command -v` — all "NOT INSTALLED" | Nothing in M0–M5 may touch a database. |
| `docker`, `docker.io` | `command -v` — "NOT INSTALLED"; apt candidate `29.1.3-0ubuntu3~24.04.2` | No container option today. |
| `brew` | `command -v` — "NOT INSTALLED" | macOS package path unavailable on this host. |
| A listener on 5432 | `ss -ltn` — listeners on 53, 3080, 631, 3000, 5522 only | Port is free; nothing is running. |
| Any real `DATABASE_URL` | `platform/luxeride-web/.env` reads, in full, four lines, ending `DATABASE_URL="postgresql://user:pass@localhost:5432/luxeride"` | Correct **shape** for a local cluster; the role, password and database do not exist. |
| Root/sudo in this sandbox | `sudo -n true` → `"/etc/sudo.conf is owned by uid 65534"`, `"The 'no new privileges' flag is set"` | The Postgres install is the **owner's** to run. This plan specifies the command; it cannot run it. |
| Any route handler, server action or `@prisma/client` import under `src/` | `commerce-backend/tasks.md` 0.6 | The backend is genuinely unstarted, not partially started. |

**One environment fact needs care.** `/etc/os-release` reports `PRETTY_NAME="elementary OS 8"`,
`VERSION_ID="8.1"`. The apt sources resolve against `archive.ubuntu.com/ubuntu noble-updates` and
`security.ubuntu.com/ubuntu noble-security`, and the Postgres candidates are `16+257build1.1` and
`postgresql-16 16.15-0ubuntu0.24.04.1` — Ubuntu 24.04 **noble** build identifiers. The host is an
elementary OS 8 skin on a noble base, `uname -m` = `x86_64`, Node `v22.23.1`, npm `10.9.8`. Stated
this way because the apt behaviour that matters is determined by the archive, and the archive says
noble.

---

## Architecture

### The dependency graph across all nine modules

Rigor, not vibes. Two facts drive the shape: **`fitment-engine`'s Phase 0 is a compile-time
TypeScript array with no database behind it**, so the single fix for the fabricated fit claim is
unblocked today; and **`payments-paystack` and `whatsapp-engine` both require an order record to
attach state to**, so they both sit behind `commerce-backend` and neither can be pulled forward.

```mermaid
flowchart TD
  subgraph UNBLOCKED["Unblocked today — no database, no external account"]
    SB["storefront-catalog<br/>§2 build, §4 boundaries, §5 nav/footer,<br/>§7 honest data, §8 imagery, §3 SEO, §13 sitemap"]
    FF0["fit-finder<br/>§2 honesty seam, §3 result claims,<br/>§4 refusals, §5 demand log"]
    FE0["fitment-engine Phase 0<br/>§2 static table, §3 /api/fit-check,<br/>§4 replace FIT ✓, §5 demand log"]
    TP0["trust-and-policies<br/>§2 copy register, §4–§9 policies,<br/>contact, announcement bar, footer"]
    AD0["ad-landing-and-tracking<br/>§2–§9 campaign registry, pixels,<br/>UTM capture, attribution"]
    PP0["payments-paystack §3<br/>honest prepay copy only"]
  end

  subgraph NEEDSDB["Requires a provisioned database"]
    ENV["E2–E5 owner-run local Postgres<br/>(apt install postgresql-16)"]
    CB["commerce-backend<br/>§2–§8 migrate, seed, db.ts,<br/>validation, createOrder, order lookup"]
  end

  subgraph AFTERORDER["Requires an order record to attach state to"]
    PP["payments-paystack<br/>§4–§9 pricing, client, action,<br/>webhook, verify, status"]
    WE["whatsapp-engine<br/>§2–§8 templates, client, webhook,<br/>buttons, receipts, 12h follow-up"]
    FE1["fitment-engine Phase 1<br/>§6–§10 Prisma models, auth,<br/>admin console, grouping, audit"]
  end

  subgraph LATE["Volume-gated"]
    H["commerce-backend §10 · fitment-engine §11–§14<br/>payments §10–§14 · whatsapp §9–§14"]
  end

  SB --> FF0
  FF0 --> FE0
  SB --> AD0
  FF0 --> AD0
  FE0 --> TP0
  SB --> TP0
  SB --> PP0
  AD0 -.->|"FE0 2.9 confirmedCustomerNames()<br/>aligns creative to real cars"| FE0
  TP0 -.->|"FE0 §2.11 layouts →<br/>FE §4 FITTED copy"| FE0

  ENV --> CB
  CB --> PP
  CB --> WE
  CB --> FE1
  CB -.->|"cart-checkout §13.1<br/>replaces the log-line stopgap"| CC["cart-checkout<br/>§2–§7 pricing, ref, server pricing,<br/>submit flow, confirmation"]
  PP --> CC
  WE --> CC
  FE1 --> H
  PP --> H
  WE --> H
  CB --> H
```

**Edges that are real and worth naming:**

- `SB → FF0` — `fit-finder §6.2` restores the delivery step whose zone data lives in
  `src/data/locations.ts`, and `fit-finder §9` (a fit the customer can return to) needs a stable
  campaign path. Both read static data, no DB.
- `FF0 → FE0` — `fit-finder §2.1` creates `src/lib/fitment.ts` and `fitment-engine §2` creates
  `src/data/fitment.ts` and `src/lib/fitment.ts`'s data twin. **These two files collide.** Rule
  applied: `fitment-engine` owns `src/data/fitment.ts` and the `Layout`/`Vehicle`/`Mapping` types;
  `fit-finder` owns the `FitResult` union and the funnel's rendering of it. Land `fitment-engine §2`
  first, then `fit-finder §2` imports from it rather than re-declaring. Recorded as D-05.
- `FE0 → AD0` and `AD0 → FE0` — genuinely circular, resolved by data not by order:
  `fitment-engine §2.9` exports `confirmedCustomerNames()` for `ad-landing-and-tracking` to align
  creative to, and `ad-landing-and-tracking` supplies the `fit_refused` /
  `fit_result_rendered state=FITTED` events that tell the owner whether broad targeting is worth
  continuing. Neither direction is a build blocker; both are in M2 and M3 respectively.
- `TP0 → FE0` — `trust-and-policies` owns the final refusal headline wording; `fitment-engine §5`
  owns the behaviour. Ship the behaviour in M2, the headline in M4, and keep the headline out of
  `fit-finder`'s code.
- `CB → PP` and `CB → WE` — **the two edges the prompt flagged.** `payments-paystack §6.1` needs
  `createOrder` and `Order.status`; `whatsapp-engine §3` needs a reference to put in a message and
  §6 needs a status to write. Neither spec can ship a single task past its own section 2 without an
  order row existing. This is why neither can be pulled into the pre-spend path.
- `CB → FE1` — `commerce-backend/tasks.md` 8.3 reserves **nullable only** `OrderItem.layoutId` and
  `OrderItem.layoutVariantId` in a second migration precisely so the storefront keeps trading with no
  fitment tables present. That reservation is what makes `FE1` a *later* milestone rather than a
  *blocking* one.
- `CB ⇢ cart-checkout` — `cart-checkout §13.1` explicitly says "replace the body of `persistOrder`
  … once `commerce-backend` lands; the handler's validation, pricing and response shape do not
  change." So `cart-checkout §2–§7` is buildable in M6 **either way**, and only §13.1 waits.

**The one edge deliberately drawn dotted:** `SB → PP0` (`payments-paystack §3.1–3.4`, honest prepay
copy). That section needs nothing but `src/app/checkout/page.tsx` text and is the only payment work
that is honestly shippable before a database exists. Dotted because it is a courtesy ordering, not a
dependency — it can land in M1 without breaking anything.

### Reconciling the three ladders

`luxeride-architecture-plan.md` §7 gives Phases 1–5. The fitment spec gives P0–P5. The module specs
tag every task `_(P0)_`, `_(P1)_` or `_(P2)_` with `_CONTEXT.md` §12's definitions. They disagree.

| Ladder | Question it answers | Authoritative for | Where it does *not* decide |
|---|---|---|---|
| **Architecture plan Phases 1–5** | *What is the shape of the finished system?* | The site map (§4), the data model (§3), the target stack (§2) | Order. It was written before any of the nine specs existed and assumes Supabase + Vercel, both now superseded. |
| **Fitment spec Phases P0–P5** | *What does a fitment deliverable contain?* | The contents and completeness bar of each fitment artefact | Order relative to the other eight modules. |
| **P0 / P1 / P2 tags** | *How soon?* | Placement in this plan's milestones | Content. A P0 tag says "this week", not "this is a complete feature". |
| **This plan's milestones M0–M10** | *In what order, and how do I know it is done?* | Order, gates, the decision queue | Content, and any implementation path. |

| Source-doc phase | Delivered at | Note |
|---|---|---|
| Arch. **Phase 1** — scaffold (Next + Prisma schema + seed) | **M0** (build half) + **M6** (schema, migrate, seed half) | Split deliberately. The build half is a ten-minute P0 fix; the schema-and-seed half needs a database and is P1. Doing Phase 1 "as written" in one block would put the two launch blockers behind a database install. |
| Arch. **Phase 2** — storefront | **M0–M1** (deployable) + **M3** (browsable) | The P0 slice is much smaller than Phase 2 as written. |
| Arch. **Phase 3** — checkout + Paystack | **M6** (orders) + **M7** (Paystack) | Orders must precede payments; a payment with no order record is untrackable. |
| Arch. **Phase 4** — WhatsApp engine | **M8** | Template submission is pulled forward — see the long pole below. |
| Arch. **Phase 5** — admin | **M9** | The plan's "start with Supabase's table editor" is void: the owner chose local Postgres, and the fitment admin supersedes the table editor anyway (`commerce-backend` design § Decisions, Decision 1). |
| Fitment **P0** — master sheet | **M2** | Zero build, as the source says. It is a data-entry task feeding `fitment-engine §2.11–2.12`. |
| Fitment **P1** — admin CRUD + grouping + publish | **M9** | **Deferred a long way.** P1 is urgent only to the person maintaining the sheet; the sheet works. Locked decision 1 (owner only) means "urgent" is a solo-owner convenience, not a revenue risk. |
| Fitment **P2** — `/fit-check` + WhatsApp ref | **M2** | **Inverted, deliberately.** P2 is the P0 urgency item: it is the fix for blocker B2 and the fabricated FIT ✓. The urgency tag wins on order; the source phase still governs what the deliverable contains. Written in `fitment-engine/tasks.md` as `_(P0 — source-doc Phase 2)_`, and this plan keeps that convention. |
| Fitment **P3** — image manager | **M9** tail | |
| Fitment **P4** — demand-log analytics | **M10** | The demand log itself ships in M2; only the ranked analytics are deferred. |
| Fitment **P5** — supplier import | **M10**, and only if volume justifies | |

**Two places the tags and the phases point opposite ways, stated so nobody reads them as a bug:**

- `fitment-engine §6–§10` are tagged `_(P0)_` because the module is a P0 feature. They are scheduled
  at **M9**, weeks after the P0s. The tag means "this module is a launch blocker"; the milestone
  means "the launch blocker it fixes is a *sheet*, and a sheet is a spreadsheet."
- `payments-paystack §3` (honest prepay copy) is P0 and ships in **M1**. `payments-paystack §5–§9`
  (client, action, webhook, verify) is P0-by-tag and ships in **M7**, because the data it moves
  money against does not exist until M6.

### The critical path to first ad spend

**This is deliberately not the critical path to the full system.** The full-system path runs M0 →
M6 → M7/M8/M9 and is bounded by an apt install and a Meta template review. The first-ad path does
not touch M6, M7, M8 or M9 at all, and the fact that it does not is the single most useful thing in
this plan.

```mermaid
flowchart LR
  A0["M0<br/>git + build"] --> A1["M1<br/>imagery, nav,<br/>boundaries, D1"]
  A1 --> A2["M2<br/>honest fit<br/>(no DB)"]
  A2 --> A3["M3<br/>pixels + UTMs<br/>+ campaign landings"]
  A3 --> A4["M4<br/>policies +<br/>contact + consent"]
  A4 --> A5["M5<br/>the pre-spend gate<br/>+ launch metric"]
  A5 --> SPEND["first paid ad"]
  A5 -.->|"not required for the ad"| A6["M6 orders · M7 payments<br/>M8 WhatsApp · M9 admin"]
```

**Critical path to the first ad spend: M0 → M1 → M2 → M3 → M4 → M5.** Six milestones, none of which
requires a database, a payment processor, a Meta business account, a WhatsApp Business Account, or
a deployed admin. The longest pole on it is M0, which is a ten-minute fix, plus the owner's own
time to decide D-04 (which cars are Confirmed) and D-05/D-06 (acquisition or demand mapping).

**Critical path to the full system: M0 → M1 → M2 → M3 → M4 → M5 → M6 → (M7 ∥ M8 ∥ M9) → M10.** It
is longer and it forks. M7, M8 and M9 are mutually independent once M6 lands, and M8 has an
independent, non-code pole that must start now.

**The long pole, stated because it is not on either path as drawn:** `whatsapp-engine §2` submits
four Meta message templates, and Meta documents approval as "up to 24 hours" with no SLA
(`whatsapp-engine` design § Open Questions 2). M8 cannot be shortened by working harder on it.
**Submitting the templates is therefore scheduled in M2** — the first milestone with slack — so the
review clock runs while the owner does M3, M4 and M5. The templates are text files
(`src/lib/whatsapp-templates/*.txt`, `whatsapp-engine §2.1`); submitting them early costs nothing
and blocks nothing, because `wa.me` stays the production path throughout
(`whatsapp-engine §3.4` keeps it working).

---

## Components and Interfaces

### The plan's own artefacts

| Artefact | Path | Consumed by |
|---|---|---|
| This requirements document | `.kiro/specs/master-build-plan/requirements.md` | The owner; `tasks.md` cites its criteria |
| This design document | `.kiro/specs/master-build-plan/design.md` | The owner; the source for D-01…D-12 |
| The sequence | `.kiro/specs/master-build-plan/tasks.md` | The owner, in order. The only file that needs to be open while working. |
| The launch-metric record | `luxeride-web/docs/launch-metrics.md` — **created by the owner at M5** | Nobody but the owner. It exists so week one has a denominator. |

### The reachability table — all nine module specs, one owner each

Counts are read from each spec's own `## Status` block. Where the audit's §9 table and the spec
disagree, the spec wins (Requirement 2.2) — three do, and the difference is noted.

| # | Spec | Done / remaining (per its own `## Status`) | Primary milestones | Note |
|---|---|---|---|---|
| 1 | `storefront-catalog` | 12 / 104 | **M0** §2, **M1** §4–§8, §11–§15, **M3** §3–§3.8, **M4** §5.1–§5.7 | The largest spec and the one that owns M0, M1 and most of M3. |
| 2 | `fit-finder` | 18 / 68 (its own header; the audit says 19 / 79) | **M2** §2–§5, §10; **M3** §8; **M4** §11 | Header says "PARTIAL — 18 done, 68 remaining"; audit §9 says 19 / 79. Spec wins. |
| 3 | `ad-landing-and-tracking` | 9 / 106 | **M3** §2–§9; **M5** §12 | The most urgent spec per the audit, and entirely unblocked. |
| 4 | `cart-checkout` | 12 / 71 (its own header; the audit says 13 / 83) | **M1** §10.3, **M4** §10.1/10.4, **M6** §2–§7 | Header says "NOT STARTED — 12 done, 71 remaining"; audit §9 says 13 / 83. Spec wins. |
| 5 | `commerce-backend` | 6 / 53 (its own header; the audit says 7 / 68) | **M0** §1; **M6** §2–§9; **M10** §10 | Header says "6 done, 53 remaining"; audit §9 says 7 / 68. Spec wins. Its §1 is the authoritative fix for B1. |
| 6 | `payments-paystack` | 5 / 96 | **M1** §3 (copy), **M7** §4–§9, §13 | §3 is the only part that ships before a database. |
| 7 | `whatsapp-engine` | 6 / 104 | **M2** §2 (submit), **M8** §3–§8 | Template submission moved to M2 on purpose. |
| 8 | `fitment-engine` | 7 / 105 (its own header; the audit says 8 / 118) | **M2** §2–§5, **M9** §6–§10, **M10** §11–§14 | Header says "7 done, 105 remaining"; audit §9 says 8 / 118. Spec wins. Owns B2. |
| 9 | `trust-and-policies` | 7 / 80 | **M4** §2–§9, §12; **M5** gates; **M10** §11 | Its 7 "Before any ad spend" gates are half of M5. |
| | **This plan** | **own** | **M0–M10** | Owns E1–E6 only: git, environment, the decision queue, the launch-metric record, the promotion. |

### Environment strategy

**The owner's decision: Postgres, run locally for now.** Resolved, and it supersedes what was
`commerce-backend` Open Question 1 — now its `design.md` **§ Decisions, Decision 1**, with the setup
steps at `commerce-backend/tasks.md` 2.1–2.2. What follows is the execution.

**Why native apt Postgres and not a container.** Three reasons, all verified this session: a
container runtime is not installed and would itself need installing (`docker.io`, candidate
`29.1.3-0ubuntu3~24.04.2`) *before* it could run a container; apt already has Postgres resolved
(`postgresql` candidate `16+257build1.1`, `postgresql-16` candidate `16.15-0ubuntu0.24.04.1`) so the
container path buys a second install to reach a first one; and `psql`/`pg_dump` on the host is what
the backup discipline below actually needs — inside a container, backups become `docker exec`. The
cost of the native choice is that Postgres runs as a service the owner must keep running, which on
this host is `sudo systemctl enable --now postgresql`. That is a real cost and it is smaller.

**The install, which is the owner's to run.** `sudo` cannot be executed from the agent sandbox —
`sudo -n true` returns `"The 'no new privileges' flag is set, which prevents sudo from running as
root"` and `/etc/sudo.conf` is owned by uid 65534. This plan therefore specifies the command and
does not claim it was run. Nothing on 5432 is listening today, so nothing conflicts.

```bash
# Owner-run, in platform/luxeride-web/
sudo apt-get update
sudo apt-get install -y postgresql-16          # or: postgresql, candidate 16+257build1.1
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE ROLE luxeride LOGIN PASSWORD '…';"
sudo -u postgres psql -c "CREATE DATABASE luxeride OWNER luxeride;"
```

Then move the real string into `.env.local` (load order `.env.$(NODE_ENV).local` → `.env.local` →
`.env.$(NODE_ENV)` → `.env`, so `.env.local` wins) per `commerce-backend/tasks.md` 2.3, and leave
`.env` holding only the commented placeholder. Add `luxeride-web/.env.example` with
`DATABASE_URL=` empty. **Note that `.gitignore` protects nothing until M0 runs** — there is no
repository today, so "uncommitted" currently means "not under version control at all", which is the
same as "unprotected".

**The backup discipline that replaces managed backups.** `commerce-backend` design
**§ Decisions, Decision 1** (formerly its Open Question 1) weighed Neon and Supabase *purely* for the
backup guarantee, and this plan has taken that recommendation away by choosing local. So the
guarantee has to be rebuilt by hand:

```bash
pg_dump -Fc -U luxeride -d luxeride -f ~/luxeride-backups/luxeride-$(date +%F).dump
pg_restore --list ~/luxeride-backups/luxeride-$(date +%F).dump | head   # the restore rehearsal
```

A daily `pg_dump -Fc` to a directory off the working disk, retained 14 days, plus **one restore into
a scratch database every week** — because `commerce-backend/tasks.md` 10.2 says it plainly: "a
backup that has never been restored is a hypothesis, not a backup." The file count is a number
someone has to look at, so it is M10's gate, not a task that is quietly skipped.

### The contradiction: "local database" and "public paid traffic" cannot both be true

This is the decision that changes the whole sequence, so it is stated as a contradiction rather than
smoothed over.

A database bound to `localhost:5432` is reachable from exactly one machine — the one it is running
on. Paid traffic is the public internet arriving at a URL strangers type. The moment an ad is live
and a stranger's browser loads `/checkout`, the code on the other end of that connection is running
somewhere else, and it cannot reach a `localhost` database. There is no configuration that makes
both true. Three honest options:

| Option | What it is | What it costs | What it makes possible |
|---|---|---|---|
| **A — Deploy the app, and make the database reachable too** | Deploy Next.js to a host, and move Postgres to a managed instance (Neon/Supabase) or a VPS with a public port and TLS. This is what `luxeride-architecture-plan.md` §2 and §7 assumed. | The owner's original plan cost; a second Postgres, backups, a network path. | Everything, including M6–M10. The local cluster becomes development only. |
| **B — Run the app locally, expose it with a tunnel** | `next start` on this machine behind a tunnel (Cloudflare Tunnel, ngrok, Tailscale Funnel). | Public traffic shares the owner's machine, its bandwidth and its uptime. Webhooks from Paystack and Meta need a stable public URL and will break whenever the machine sleeps. Works for a first test; does not work for trading. | Everything, on one machine, for as long as it is switched on. |
| **C — Keep the first ad run free of any database dependency** | Do not build M6 before the first ad. The storefront, funnel, checkout handoff, pixels and UTMs all work with none. | Orders land only in `localStorage` and WhatsApp, which is exactly the money-path defect in `00-RELEASE-READINESS-AUDIT.md` §6 — six dotted-line failure paths, and no way to know which ad produced which order. | M0–M5 only, but M0–M5 is the entire first ad run. |

**Recommendation: C now, A immediately after.** The decisive fact is that **the first ad run
genuinely needs no database**, and this is checkable rather than hopeful. Three mechanisms on the M5
path have no database behind them today:

- **The static Confirmed-only fitment table** — `fitment-engine §2` is a compile-time TypeScript
  array, and `fit-finder §2.1`'s provider default is local. `checkFit()` is a function over an array.
- **The WhatsApp handoff** — `src/lib/whatsapp.ts` is 51 lines of string builders and one `wa.me`
  link. Nothing is sent, nothing is received, nothing is stored.
- **The pixels** — Meta Pixel and GA4 are client-side script tags fired from the browser.

So C costs nothing that the first ad needed. What it does cost is order integrity, and that cost is
real and is paid deliberately: the owner's mitigation is the `cart-checkout §5.3–5.4` flow — keep the
`window.open` return value, offer **Open WhatsApp** and **Copy message** when it is `null`, and do
**not** clear the cart until the customer confirms the handoff. That turns the audit's most likely
loss path into a recoverable one, and it is a P0 in `cart-checkout` that this plan schedules in M6.
A first ad run should therefore be a **small, demand-mapping, manually-reconciled test** — not a
volume launch. The instrumented `fit_refused` / `fit_result_rendered state=FITTED` split from
`ad-landing-and-tracking §6` is what makes the next decision measurable rather than a guess.

Then A, early and on purpose: promoting from local to a hosted instance is one URL change in
`.env.local` plus `pg_dump`/`pg_restore` (Requirement 8.6, task E5 in `tasks.md`). Doing it before
M6 rather than during it means `commerce-backend §2.4`'s first migration is written against the
production URL and the promotion is not a live-traffic event.

### The decision queue

Deduplicated across all nine `## Open Questions` sections, plus the two this plan creates. Sorted by
what they block. Every one is a business or an account decision — none is an engineering question,
and `_CONTEXT.md` §12 rule 4 is why none of them is a checkbox in `tasks.md`.

| # | Decision | Raised by | Blocks | By when |
|---|---|---|---|---|
| **D-01** | Where does the **durable** order record live, given the local cluster has no managed backups? Re-approve Neon/Supabase, or accept a hand-rolled `pg_dump` plus a weekly restore rehearsal? | `commerce-backend` design § Decisions, Decision 1 (it records the local choice and reopens backups as a separate question); this plan's Req 8.3 | M6 (irreversibly, after the first migration), M10.10 | Before M6 starts. **The backups half cannot be deferred; the provider half can.** |
| **D-02** | **Route handler or Server Action for order creation?** `cart-checkout §4` says `src/app/api/orders/route.ts`; `commerce-backend` 6.1 says `src/app/checkout/actions.ts` and "no route handler ships in this spec at all". | `commerce-backend` vs `cart-checkout` (conflict), `payments-paystack` OQ 15 | **M6 §4, §6, §7** — the whole order-creation surface. | Before M6 starts. This plan does not decide it; it is a module-spec conflict. |
| **D-03** | **Which cars are genuinely Confirmed today, and how many?** | `fitment-engine` OQ 3; `fit-finder` OQ 3; `ad-landing-and-tracking` OQ 3; audit §11.4 | **M2 §2.11** (the table cannot be entered without it), M3 creative, M5.12 | Before M2 §2.11. This is the single longest human task on the critical path. |
| **D-04** | **Is the first ad run acquisition targeting (Confirmed cars) or demand mapping (broad, mostly refused)?** | `fitment-engine` locked decision 2 consequence; `ad-landing-and-tracking` OQ 2 and §12.12; audit §11.2 | M3 creative, M5.12, and which conversion rate the campaign is judged against | Before any spend. The fitment spec's own words: "decide which it is before you spend". |
| **D-05** | **Production domain and hosting target.** `metadataBase` must be absolute or a relative `openGraph.images` path is a build error; ad review needs a verifiable domain; Meta's destination URL must be the final one after redirects. | `storefront-catalog` OQ 1; `ad-landing-and-tracking` OQ 8 | M0 (deploy), M3 §3.1, M4 policy pages | Before the first deploy. |
| **D-06** | **Does the refusal carry a waitlist?** Both specs already ship one (the optional phone field plus `comingSoonMessage()`); the open question is whether the *copy* promises future stock, which obliges the capture. | `fitment-engine` OQ 2; `fit-finder` OQ 2; `ad-landing-and-tracking` OQ 4 | M2 §4/§5 wording, M4 headline | Before M2 §4. |
| **D-07** | **What does "swap it free" actually mean** — deadline, return-shipping payer, one swap per order, what "swap" means. Until answered `/returns` cannot ship, and `trust-and-policies` 6.4 says the page must then show an owner-facing warning rather than a promise. | `trust-and-policies` OQ 2; audit §11.5 | **M4 §8**, M5 Gate 7 | Before M4. |
| **D-08** | **Which number wins — the site price or the WhatsApp quote?** Locked decision 3 says price on the site; the fitment spec says "a site price that the quote overrides is worse than no price". Only compatible if the site price is authoritative for the configuration shown. | `trust-and-policies` OQ 1; `fitment-engine` OQ 1 (exact vs "from"); `fit-finder` OQ 4; `commerce-backend` § Open Questions (tier survival and price authority) | M3 §10.4, M4 `/terms`, M6 §6.3, M7 §4 | Before M6. Locked decision 3 is binding; only the *display style* is open. |
| **D-09** | **Paystack account, test key and business-verification lead time.** Meta documents template approval as "up to 24 hours" and the same shape of question applies here. | `payments-paystack` OQ 10, OQ 8 (bank_transfer needs a support request), OQ 12 (no simulator); `commerce-backend` § Open Questions (Paystack key timing); `luxeride-architecture-plan.md` §8 | **M7**, entirely. Nothing before it. | Start the clock at M5; the lead time is unknown and "not needed until Phase 3" was true when the plan was written. |
| **D-10** | **Meta WhatsApp Business Account, display-name review, and template submission.** Both gates must open before the first server-side order message can go out. | `whatsapp-engine` OQ 5, OQ 2; `whatsapp-engine §2.2–2.6` | **M8**. | **Submit in M2** — the review clock is the longest pole in the plan and it starts when the templates are submitted, not when M8 begins. |
| **D-11** | **NDPC registration and NDPR consent sufficiency** at this volume. | `trust-and-policies` OQ 4; `ad-landing-and-tracking` OQ 1 | Nothing in the build. **May block the first spend.** | Before the first ad. Cheap to get wrong late. |
| **D-12** | **Which of the 11 raw files in `footage/` shows which product, and whether each shows an installed fit.** The audit verified their *technical* properties and not their content; `trust-and-policies` 9.5 forbids captioning a frame as an installed fit unless it shows one. | `storefront-catalog` OQ 2, OQ 3, OQ 4; `trust-and-policies` OQ 14 | **M1 §8** — the placeholder path ships regardless, so this is a quality upgrade, not a blocker. | Before M1 §9 runs. |

**Answered and closed, recorded so nobody re-opens them:**

| # | Decision | Status |
|---|---|---|
| ~~Supabase vs Neon vs self-hosted~~ | **Postgres, local for now.** Owner decision, dated 2 Oct 2026, recorded in `commerce-backend` design § Decisions, Decision 1; the setup is `commerce-backend/tasks.md` 2.1–2.2. Backups reopened separately as D-01. | Closed. |
| ~~Exact price or "from" price~~ | **Price on the site** — locked decision 3, Fri 2 Oct 2026. Binding. Only the display style remains (D-08). | Closed by owner. |
| ~~Owner only, or a helper?~~ | **Owner only.** Locked decision 1. No roles, no permission matrix, anywhere. | Closed by owner. |
| ~~Does the front end show Inferred?~~ | **Confirmed only.** Locked decision 2. Binding, and it is why M2's gate is a refusal count and not an acceptance count. | Closed by owner. |
| ~~Does a layout span brands?~~ | **No.** Locked decision 4. One layout = one make, singular `makeId`, cross-brand matches become two cross-referenced layouts. | Closed by owner. |
| ~~Should prepay be hidden until bank details exist?~~ | Yes — `cart-checkout` OQ 1, and `payments-paystack §3.1–3.2` reaches the same P0 conclusion by a different route. Both are scheduled in M1. | Closed in-code, pending D-08. |
| ~~Test runner: `node:test` or Vitest?~~ | `node:test`. Zero dependencies; Node v22.23.1 ships it. `commerce-backend` 9.1 and `cart-checkout` 2.5 both assume it, so it is decided by convergence rather than by a ruling. | Closed by convergence. |

---

## Data Models

This plan introduces no data model. It adds one record, and it is deliberately not application data.

| Record | Where | Shape | Why |
|---|---|---|---|
| **Launch metrics** | `luxeride-web/docs/launch-metrics.md` | Dated block: Confirmed-layout count, whether the run is acquisition or demand mapping, the domain, the date, and the five baseline numbers (`ad-landing-and-tracking §12.15`) | Locked decision 2 makes the Confirmed count a launch metric and `ad-landing-and-tracking` 12.11 makes writing it down a pre-spend gate. It is a document, not a table, because the plan must not depend on the database it is measuring the absence of. |
| **Decision queue** | This file, § Components and Interfaces | D-01…D-12, each with source, blocker and deadline | Owner intent, not application state. Persisting it in the app would be an abuse of the database. |
| **Backup directory** | `~/luxeride-backups/` outside the repo | `luxeride-YYYY-MM-DD.dump`, `-Fc` format, 14-day retention | Outside `platform/` on purpose: a dump inside the repository would be committed, and `.gitignore` protects nothing until M0 runs. |

The milestone gates reference data that already exists and is not created by this plan:
`PRODUCTS` (7 rows with `regular`/`premium`), `BRANDS` (33 entries, 8 premium), `LOCATIONS` (4
zones with `fee` and `eta`), and — from M2 — `LAYOUTS` in `src/data/fitment.ts`.

---

## Error Handling

The plan's failure modes are not code paths, so this section is about what happens when a milestone
gate does not pass, and about the failure modes of the sequencing itself.

| Failure | How it is detected | The rule |
|---|---|---|
| The build breaks again after M0 | `npm run build` exits non-zero | Stop. M0 is the only milestone whose gate is a *single command*, and it is the first one. Nothing downstream is trustworthy until it is green. |
| A milestone's gate needs a database before E2 is done | The gate's own command fails to connect | Do not start the milestone. Requirement 9.2: the install may run in parallel, but nothing may *depend* on it. |
| A module spec is edited mid-build and its task numbers move | A `→ spec §N.N` reference in `tasks.md` no longer resolves | `tasks.md` delegates by number and number is the cheapest stable key this codebase has. If a reference breaks, re-read that spec's `## Status` and re-point; do not re-derive the whole sequence. |
| A module spec and this plan disagree about order | Two specs schedule the same work differently | Rank 2 wins on order, rank 3 wins on content. Record the resolution in this design's authority table rather than editing the module spec. |
| The owner starts an ad before M5's gate is green | — | `trust-and-policies` Gate 1 and `ad-landing-and-tracking` 12.1 are the same gate for a reason. An ad before that spends money on a site that cannot be deployed, whose fit claim is false, or whose orders vanish. This is the one failure this plan exists to prevent. |
| Postgres is installed and then the machine sleeps, mid-campaign | Local cluster stops | The consequence of choosing C over A for the first run, stated in full in § Architecture. M6's promotion task (E5) is the exit from this state. |
| A `pg_dump` has never been restored | No restore rehearsal on record | M10's gate. Until a restore is rehearsed, `commerce-backend` 10.2's line stands: a backup that has never been restored is a hypothesis. |
| The Confirmed-layout count is never written down | M5.12 unchecked | The whole point of locked decision 2's launch metric. It cannot be reconstructed later, because by then the sheet has changed. |

---

## Testing Strategy

The plan has no test suite of its own and does not propose one. It is verified by **running gates**,
in order, and by the fact that each gate names a command with an exit code. Three things follow
from that:

1. **The gate order is the test order.** M0's gate is the first real test the project has ever had:
   `npm run build` exiting 0 with `.next/BUILD_ID` written. Every later gate is an extension of it.
2. **The test framework is settled by convergence, not by this plan.** `commerce-backend` 9.1 and
   `cart-checkout` 2.5 both specify `node:test` (`node --test`), which Node v22.23.1 ships with no
   dependency. `fit-finder` OQ 6 raised the choice; the two specs that have to live with it already
   chose. Recorded as closed in the decision table above.
3. **Manual gates are written as manual gates.** M2's gate — "a 2010 Corolla not in the table
   returns NOT STOCKED" — is a request against a running server plus an assertion about the response
   body. That is what it is, and it is stated that way rather than dressed up as automation. M3's
   gate is a walk through Meta's Events Manager test-events panel. M4's gate is a scan for
   `TODO(owner)` strings. Honesty about the kind of check is part of the check.

**What "verified" means in `tasks.md`.** Per `_CONTEXT.md` §12, `- [x]` is used only for work
verified by reading the code in this session, with the file annotated. This plan verifies
*environment facts*, and two of its six own tasks (E1's environment survey, E2's apt/port/Docker
check) are marked done on that basis. Every milestone task is `- [ ]`, because no milestone task
has been implemented — the application has never built.

---

## Open Questions

Everything the owner must decide is in the **decision queue** above, D-01…D-12, each with its
blocker and its deadline. Three further notes belong here rather than in the queue, because they are
notes about this plan rather than decisions for the owner.

1. **The one dependency this plan is least sure about is D-02**, the order-creation mechanism.
   `cart-checkout/tasks.md` §4.1 mandates `src/app/api/orders/route.ts` as a Route Handler, with
   `persistOrder()` appending a structured JSON line to the server log as a declared P0 stopgap.
   `commerce-backend/tasks.md` 6.1 mandates a **Server Action** at
   `src/app/checkout/actions.ts`, and states in terms: "Correction to a cross-reference elsewhere:
   there is **no** `/api/checkout` route** in this design, and no route handler ships in this spec at
   all." `payments-paystack` design § Open Questions 15 raises the related collision on
   `/order/[id]` versus `/order/confirmation`. Three specs, two incompatible designs for the same
   milestone step. **The consequences are real and asymmetric:** a Server Action gets Next's
   `Origin`-vs-`Host` CSRF check, a 1 MB body cap and encrypted action IDs with no public endpoint
   to probe, which `commerce-backend` 6.1 states explicitly; a Route Handler gets none of that for
   free and needs its own origin check. Choosing wrong means rewriting M6's §4, §6 and §7 — the
   largest single block in the plan — and it also decides whether `payments-paystack §7` and
   `whatsapp-engine §5` have a public URL to verify a signature against. This plan does not decide
   it, because a sequencing document deciding an implementation question is exactly the authority
   inversion § Overview exists to prevent. **It is the first thing to settle after D-05 and D-09.**
2. **Second-least-sure: whether the first ad run should be C at all.** This plan recommends C
   (no database before the first ad) on the strength of a checkable claim — the static table, the
   `wa.me` handoff and the pixels all work with no database. The residual risk is that the owner's
   first ad performs well, volume arrives, and order loss becomes expensive before M6 lands. The
   mitigation is not "build M6 faster"; it is `cart-checkout §5.3–5.4`'s do-not-clear-the-cart
   flow, which this plan schedules in M6 and which the owner can pull forward into M1 at the cost of
   one section. Flagged so it is a choice with a known price, not an accident.
3. **Third: the reachability table's four count discrepancies.** `fit-finder`, `cart-checkout`,
   `commerce-backend` and `fitment-engine` each have a `## Status` count that differs from
   `00-RELEASE-READINESS-AUDIT.md` §9. Requirement 2.2 says the spec wins, and this plan records
   the spec's number. That the four disagreeing specs are the four with the most cross-spec
   dependencies suggests the audit's table was written from an earlier draft of each `tasks.md` and
   never refreshed. Worth a single pass by whoever owns the audit — not worth blocking on, and not
   this spec's job to fix, because `_CONTEXT.md` §12 forbids editing outside this directory.
