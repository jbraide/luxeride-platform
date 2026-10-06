import Link from "next/link";

import { prisma } from "@/lib/db";
import { liveLayoutCount, confirmedCustomerNames } from "@/data/fitment";
import { liveLayoutCountLive, confirmedCustomerNamesLive } from "@/lib/fitment-live";
import { getHeroLayout, type HeroLayout } from "@/lib/settings";
import { setHeroLayout } from "./actions";
import { messageFor, readFailures } from "./catalogue-guard";

/**
 * `/admin` — the console dashboard (`fitment-engine` §8.2, milestone M9.3).
 *
 * A Server Component, reached only through `src/proxy.ts`, which refuses the whole
 * `/admin` subtree without credentials. Every number below comes from the database.
 *
 * THE THREE VEHICLE NUMBERS, DEFINED EXACTLY AS §8.2 DEFINES THEM
 *
 *   - unmapped  — a `Vehicle` with no `Mapping` row at all.
 *   - mapped    — a `Vehicle` with at least one. It says nothing about whether the
 *                 mapping was ever checked; `Mapping.confidence` is that fact and it
 *                 starts at "inferred" for every preloaded row.
 *   - excluded  — `Vehicle.status = "excluded"`. This is NOT the `Exclusion` table,
 *                 which is the owner's written record of a car somebody looked at and
 *                 knows we cannot fit. Both are counted here, separately, because they
 *                 answer different questions and adding them together would be a
 *                 number about nothing.
 *
 * MOVED, NOT REWRITTEN
 *
 * This file was `src/app/admin/page.tsx` until the console moved into the
 * `(console)` route group (§8.1). The sections below came with it.
 */

/**
 * NEVER PRERENDER THIS PAGE. IT IS A LIVE READING, NOT A BUILD ARTEFACT.
 *
 * Measured, not assumed: without this export `next build` reports `/admin` as
 * `○ (Static)`, because nothing on the page touches `headers()`, `cookies()` or
 * `searchParams` — it only reads Postgres, which Next cannot tell apart from any
 * other function call. A static `/admin` is served as the snapshot taken at BUILD
 * time, so the launch metric §8.2 puts on screen permanently would read whatever
 * it read on deploy day and never move. In `next dev` every request re-renders,
 * which is exactly why this is invisible until a production build is run — and it
 * was found by running one.
 *
 * `revalidatePath("/admin")` in `actions.ts` would eventually refresh it, and that
 * is not good enough to rely on: it would make the headline number a side effect of
 * somebody else's write, and it makes the page's correctness depend on every future
 * action remembering to revalidate it. The other five console screens have the same
 * reasoning available to them for free — `searchParams` opts a route into dynamic
 * rendering — which is why `/admin` is the only one that needed saying out loud.
 */
export const dynamic = "force-dynamic";

/**
 * ONE FIGURE, in a card.
 *
 * `StatCard`, not `Row`. A `Row` is a pair of labels separated by a rule, which is
 * right for a list of six facts of the same importance. This dashboard has ONE number
 * that matters and a ring of supporting ones, and rendering them all at the same
 * weight is why the previous version of this page read like a database inspector
 * rather than something you can act on in the first two seconds.
 */
function StatCard({
  label,
  value,
  hint,
  tone = "plain",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** "good" is for the number you want to grow, "warn" for the one you want to shrink. */
  tone?: "plain" | "good" | "warn";
  href?: string;
}) {
  const valueClass =
    tone === "warn" ? "text-[#FF6B35]" : tone === "good" ? "text-accent" : "text-fg/85";

  const body = (
    <>
      <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">{label}</p>
      <p className={`mt-1 font-mono text-3xl font-bold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">{hint}</p>}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface/60 px-4 py-3 transition-colors hover:border-accent/60"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">{body}</div>
  );
}

function Row({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-3">
      <span className="text-sm text-fg-muted">
        {label}
        {hint && <span className="mt-0.5 block text-[11px] text-accent-dim">{hint}</span>}
      </span>
      <span className="font-mono text-lg text-accent">{value}</span>
    </div>
  );
}

/**
 * THE THREE HERO LAYOUTS, AS CHOICES.
 *
 * The labels are deliberately the three names that mean something to somebody who is
 * not looking at the stylesheet — "split", "side", "full width" — and each carries a
 * diagram drawn in the same proportions the real one uses.
 *
 * THE DIAGRAM IS NOT DECORATION. This is a control that was invisible for a month
 * because it did not exist, and the reason it did not exist is that "which layout is
 * that?" was answerable only by opening `globals.css`. A radio whose effect cannot be
 * pictured is how a switch gets set once and then ignored.
 */
const HERO_LAYOUT_OPTIONS: ReadonlyArray<{
  value: HeroLayout;
  label: string;
  summary: string;
  detail: string;
  /** Flex basis of the copy block, and of the art block. Sums to 1. */
  split: [string, string];
}> = [
  {
    value: "split",
    label: "Split",
    summary: "Two equal columns",
    detail: "The words beside the photograph, level with each other. One column on a phone, words first.",
    split: ["1fr", "1fr"],
  },
  {
    value: "side",
    label: "Side",
    summary: "A wider photograph",
    detail: "The same two columns with the image taking more of the width, for a product you want looked at.",
    split: ["0.85fr", "1.15fr"],
  },
  {
    value: "full",
    label: "Full width",
    summary: "Edge to edge, words over it",
    detail: "The photograph runs the full width of the screen and the words sit on top of it, on a scrim.",
    split: ["0.4fr", "0.6fr"],
  },
];

function HeroLayoutDiagram({ option }: { option: (typeof HERO_LAYOUT_OPTIONS)[number] }) {
  const [copy, art] = option.split;
  const full = option.value === "full";
  return (
    <span
      aria-hidden
      className="flex h-9 w-full shrink-0 overflow-hidden rounded border border-border bg-surface-2"
    >
      <span
        className={`h-full ${full ? "bg-accent/25" : "bg-accent/45"}`}
        style={{ flexBasis: copy }}
      />
      <span
        className={`h-full ${full ? "bg-fg-muted/20" : "bg-fg-muted/35"}`}
        style={{ flexBasis: art }}
      />
    </span>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const heroFailures = readFailures(query);

  const [vehicles, layouts, variants, mappings, confirmedLayouts, inferredLayouts, makes, categories, products, variationCount, heroLayout] =
    await Promise.all([
      prisma.vehicle.count(),
      prisma.layout.count(),
      prisma.layoutVariant.count(),
      prisma.mapping.count(),
      prisma.layout.count({ where: { status: "confirmed" } }),
      prisma.layout.count({ where: { status: "inferred" } }),
      prisma.make.count(),
      // The shop, since the dashboard now has a section for it. `productVariation`
      // because a product with no variation has nothing the shop can sell.
      prisma.category.count(),
      prisma.product.count(),
      prisma.productVariation.count(),
      getHeroLayout(),
    ]);

  // §8.2's three counts. `mappings: { none: {} }` / `{ some: {} }` is the only
  // honest definition of the two: counting rows in `Mapping` and comparing it to
  // `Vehicle` would report a vehicle as mapped because a DIFFERENT car was mapped,
  // and would report two as one.
  const [unmapped, mapped, excludedVehicles, recordedExclusions] = await Promise.all([
    prisma.vehicle.count({ where: { mappings: { none: {} } } }),
    prisma.vehicle.count({ where: { mappings: { some: {} } } }),
    prisma.vehicle.count({ where: { status: "excluded" } }),
    prisma.exclusion.count(),
  ]);

  // The order book. Its own three numbers, because "how many orders" and "how many
  // are still waiting on me" are different questions and only the second is a to-do.
  const [orderCount, pendingOrders, fulfilledOrders] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "pending" } }),
    prisma.order.count({ where: { status: "fulfilled" } }),
  ]);

  const popular = await prisma.vehicle.findMany({
    where: { isPopular: true },
    include: { make: { select: { name: true } } },
    orderBy: [{ make: { name: "asc" } }, { model: "asc" }],
  });

  /*
   * THE SOURCING QUEUE, on the dashboard.
   *
   * Ranked by how many people have asked for a car we cannot fit. Every one of these
   * rows is a refusal the site gave honestly, and every one of them is a car someone
   * was willing to buy.
   *
   * It lives here and not only on `/admin/demand` because of what a dashboard is FOR:
   * the answer to "what should I do next" should not require a second navigation. The
   * demand screen has the full picture; this is the top of it.
   *
   * Grouped in the database rather than in JavaScript, so the ranking is done by the
   * index and 200 demand rows do not become 200 round trips.
   */
  const topDemand = await prisma.demandLog.groupBy({
    by: ["make", "model"],
    _count: { _all: true },
    orderBy: { _count: { make: "desc" } },
    take: 6,
  });
  const refusalTotal = await prisma.demandLog.count();

  // Both launch metrics, side by side. See the section below for why there are two.
  const storefrontLive = liveLayoutCount();
  const storefrontNames = confirmedCustomerNames();
  const databaseLive = await liveLayoutCountLive();
  const databaseNames = await confirmedCustomerNamesLive();

  return (
    <div>
      {/* ── THE HEADLINE ────────────────────────────────────────────────────
          *
          * ONE number, at the top, at a size nothing else on the page competes with.
          *
          * "How many cars can you honestly say yes to" is the only figure here that
          * changes what the business can do — it is the launch metric, it is what the
          * Fit Finder answers from, and it is 0 today. Everything else on this page is
          * either a subset of it or a count of something inert.
          *
          * It is placed FIRST and given the largest type on purpose. The previous
          * version opened with "You are authenticated" and then a flat list of twelve
          * equal-weight rows, which is a fair description of the console and useless
          * as a dashboard.
          */}
      <section className="rounded-xl border border-accent/30 bg-gradient-to-b from-surface to-surface-2 px-5 py-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
          Cars you can honestly say yes to
        </p>
        <p className="mt-1 font-mono text-5xl font-bold text-accent">
          {databaseLive}
          <span className="ml-2 text-lg font-normal text-fg-muted">
            of {vehicles} in the catalogue
          </span>
        </p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">
          {databaseLive === 0
            ? "Nothing is confirmed yet, so the Fit Finder refuses every car and every refusal goes into the demand log below. That is the honest starting state, not a fault — a yes is only worth something because the no's are reliable."
            : `Confirmed for: ${databaseNames.join(", ")}. Everything else refuses.`}
        </p>
      </section>

      {/* ── THE RING ───────────────────────────────────────────────────────
          *
          * What to do next, as four figures a person can act on. Each one links to the
          * screen that does the thing, so a number is never a dead end.
          */}
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cars still to do"
          value={unmapped}
          tone={unmapped > 0 ? "warn" : "good"}
          hint="in the catalogue with no floor pan assigned"
          href="/admin/vehicles?f=unmapped"
        />
        <StatCard
          label="Year ranges to price"
          value={layouts - inferredLayouts - confirmedLayouts}
          hint="neither inferred nor confirmed"
          href="/admin/layouts"
        />
        <StatCard
          label="Prices set"
          value={mapped}
          tone="good"
          hint="cars mapped onto a floor pan"
          href="/admin/vehicles?f=mapped"
        />
        <StatCard
          label="Refusals logged"
          value={refusalTotal}
          hint="every one is a car someone wanted"
          href="/admin/demand"
        />
      </section>

      {/* ── THE SOURCING QUEUE ──────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Most wanted</h2>
          <Link
            href="/admin/demand"
            className="text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
          >
            The full demand log →
          </Link>
        </div>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
          The cars people asked for that we cannot yet fit. This is the sourcing roadmap: the
          second one is the cheapest thing to confirm next.
        </p>

        {topDemand.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-surface/60 px-5 py-4 text-sm text-fg-muted">
            No refusals logged yet, so there is no signal about what to source.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-border bg-surface/60">
            {topDemand.map((row) => (
              <li key={`${row.make}::${row.model}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <span className="text-sm text-fg/85">
                  {row.make} {row.model}
                </span>
                <span className="font-mono text-sm text-accent">
                  {row._count._all}
                  <span className="ml-1 text-[11px] uppercase text-fg-muted">
                    ask{row._count._all === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── THE SHOP ────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">The shop</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Categories"
            value={categories}
            href="/admin/categories"
            hint="each one is a real /shop page"
          />
          <StatCard
            label="Products"
            value={products}
            href="/admin/products"
            hint="items the shop sells"
          />
          <StatCard
            label="Variations"
            value={variationCount}
            hint="the options on those products"
          />
        </div>
      </section>      {/* ── ORDERS ────────────────────────────────────────────────────────
          *
          * The number the owner could not see before `/admin/orders` existed. "Pending"
          * is the one that is a to-do: every one of those is a person who has paid or
          * promised to, and has not been spoken to yet.
          */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Orders</h2>
          <Link
            href="/admin/orders"
            className="text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
          >
            The full order book →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Orders placed"
            value={orderCount}
            href="/admin/orders"
            hint="every order through checkout"
          />
          <StatCard
            label="Pending"
            value={pendingOrders}
            tone={pendingOrders > 0 ? "warn" : "good"}
            href="/admin/orders?s=pending"
            hint="nobody has spoken to the customer yet"
          />
          <StatCard
            label="Fulfilled"
            value={fulfilledOrders}
            tone="good"
            href="/admin/orders?s=fulfilled"
            hint="delivered and complete"
          />
        </div>
      </section>

      {/* ── STOREFRONT APPEARANCE ───────────────────────────────────────── ──
          *
          * The hero layout switch, and the reason this screen reads `searchParams`.
          *
          * THE OWNER ASKED FOR THIS CONTROL AND COULD NOT FIND IT, so it is here on
          * the first screen of the console rather than buried one level down — a
          * control nobody can find is not a control.
          *
          * IT WAS NEVER WIRED, and the reason is worth recording. `SiteSetting` and
          * `getSetting`/`setSetting` all existed and read correctly; `setSetting` was
          * called from NOWHERE, so the table stayed empty and `getHeroLayout()` returned
          * its `split` default for every request. The reader was right the whole time.
          * A setting with no writer is a default with extra steps.
          *
          * SERVER-SIDE, so it is true for every visitor. This was a cookie once, and a
          * cookie describes one person — setting it here would have changed the layout
          * on the operator's own screen and on nobody else's.
          */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Storefront appearance</h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
          How the photograph and the words sit together at the top of the homepage. This
          changes the layout for everyone who visits, not just for you.
        </p>

        {heroFailures.has("heroLayout") && (
          <p className="mt-3 rounded-xl border border-[#FF6B35] px-4 py-3 text-sm text-[#FF6B35]">
            <span className="font-mono">heroLayout</span> —{" "}
            {messageFor(heroFailures.get("heroLayout") as string)}
          </p>
        )}

        <form method="post" action={setHeroLayout} className="mt-4">
          <fieldset>
            <legend className="sr-only">Homepage hero layout</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {HERO_LAYOUT_OPTIONS.map((option) => {
                const checked = heroLayout === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer flex-col gap-2 rounded-xl border px-4 py-4 transition-colors ${
                      checked
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface/60 hover:border-accent/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="heroLayout"
                        value={option.value}
                        defaultChecked={checked}
                        className="accent-gold"
                      />
                      <span className="font-display text-sm font-semibold">{option.label}</span>
                    </span>
                    <HeroLayoutDiagram option={option} />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-accent-dim">
                      {option.summary}
                    </span>
                    <span className="text-xs leading-relaxed text-fg-muted">{option.detail}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
            >
              Save layout
            </button>
            <span className="text-xs text-fg-muted">
              Live now:{" "}
              <span className="font-mono text-accent">
                {HERO_LAYOUT_OPTIONS.find((o) => o.value === heroLayout)?.label ?? heroLayout}
              </span>
              <span className="ml-2">
                <Link href="/" target="_blank" className="underline underline-offset-4 hover:text-accent">
                  see the homepage ↗
                </Link>
              </span>
            </span>
          </div>
        </form>
      </section>

      {/* ── EVERYTHING ELSE, FOLDED ───────────────────────────────────────
          *
          * The counts below are real and worth keeping, but they are diagnostics, not
          * decisions. Folding them means the dashboard opens on what to do rather than
          * on twelve numbers that are all currently correct and none of which you can
          * act on. `force-dynamic` below is why they are true the moment you open it.
          */}
      <details className="mt-8 rounded-xl border border-border bg-surface/60">
        <summary className="cursor-pointer px-4 py-3 text-sm text-fg/85 marker:content-none">
          Everything else
          <span className="ml-2 text-xs text-fg-muted">
            catalogue counts, exclusions, popular cars, and what the site reads
          </span>
        </summary>

        <div className="space-y-6 border-t border-border px-4 py-4">
          <div className="rounded-xl border border-border bg-surface/60 px-5 py-2">
            <Row label="Makes" value={makes} />
            <Row label="Vehicles" value={vehicles} hint="every car in the catalogue" />
            <Row label="Layouts" value={layouts} hint={`${inferredLayouts} inferred, ${confirmedLayouts} confirmed`} />
            <Row label="Variants" value={variants} hint="a layout offers four floor-pan products" />
            <Row label="Mappings" value={mappings} />
            <Row
              label="Confirmed layouts"
              value={confirmedLayouts}
              hint="the launch metric — how many cars you can honestly say yes to"
            />
          </div>

          <div className="rounded-xl border border-border bg-surface/60 px-5 py-2">
            <Row label="Unmapped" value={unmapped} hint="no Mapping row — this is the working queue" />
            <Row label="Mapped" value={mapped} hint="at least one Mapping row, inferred or confirmed" />
            <Row label="Excluded" value={excludedVehicles} hint='Vehicle.status = "excluded"' />
            <Row
              label="Written exclusions"
              value={recordedExclusions}
              hint="the Exclusion table — cars somebody looked at and knows we cannot fit"
            />
          </div>

          <div className="rounded-xl border border-border bg-surface/60 px-5 py-2">
            <Row
              label="Live layouts (the database)"
              value={databaseLive}
              hint="liveLayoutCountLive() — this is what /api/fit-check answers from"
            />
            <Row
              label="Live layouts (src/data/fitment.ts)"
              value={storefrontLive}
              hint="liveLayoutCount() — a compile-time table, permanently 0"
            />
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">
            Both numbers are shown on purpose, and the gap between them is the thing to watch.{" "}
            <code className="font-mono text-accent-dim">/api/fit-check</code> calls{" "}
            <code className="font-mono text-accent-dim">checkFitLive()</code>, which reads these
            tables — so a confirmation saved here DOES change what a customer is told, and the top
            row is the real launch metric. What still does not is{" "}
            <code className="font-mono text-accent-dim">liveLayoutCount()</code> in{" "}
            <code className="font-mono text-accent-dim">src/data/fitment.ts</code>, which counts a
            compile-time table. It is permanently 0 by construction and is kept here so the number
            cannot quietly become load-bearing somewhere nobody looks.
          </p>
          {/* Both name lists, for the same reason. `storefrontNames` is the compile-time
              table's answer and is empty by construction; it is shown so that a future
              change which starts writing there is visible rather than silent. */}
          {databaseNames.length > 0 && (
            <p className="text-xs text-fg-muted">
              Currently confirmed for customers: {databaseNames.join(", ")}
            </p>
          )}
          {storefrontNames.length > 0 && (
            <p className="text-xs text-fg-muted">
              Named by the compile-time table, which nothing reads any more:{" "}
              {storefrontNames.join(", ")}
            </p>
          )}

          <div>
            <h3 className="font-display text-base font-semibold">Popular cars</h3>
            <p className="mt-1 text-xs text-fg-muted">
              The eight the Fit Finder offers before a search.
            </p>
            <ul className="mt-2 space-y-1">
              {popular.map((vehicle) => (
                <li
                  key={vehicle.id}
                  className="flex items-center justify-between border-t border-border py-2 text-sm"
                >
                  <span>
                    {vehicle.make.name} {vehicle.model}
                  </span>
                  <span
                    className={`font-mono text-[11px] uppercase ${
                      vehicle.status === "excluded" ? "text-[#FF6B35]" : "text-accent-dim"
                    }`}
                  >
                    {vehicle.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The rules, with the CORRECTED version. */}
          <div>
            <h3 className="font-display text-base font-semibold">How a car becomes a yes</h3>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg/80">
              Two things: the years this car is covered for, and what each of those years costs.
              That is the whole form. Everything else on it — the evidence, your own note, the date,
              the lead time, the reference code — is optional and tucked away, because a car that is
              recorded cannot be quoted and a car that can be quoted has already been recorded.
            </p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg/80">
              A missing price is the only thing that will stop a save, because{" "}
              <code className="font-mono text-accent-dim">/api/fit-check</code> reads the per-year
              prices and nothing else: a year with no price is a car we hold that we cannot quote.
              The reference code is worked out for you from the make and the years, and the lead time
              falls back to the standard in{" "}
              <code className="font-mono text-accent-dim">src/lib/copy.ts</code>.
            </p>
          </div>
        </div>
      </details>

      <p className="mt-8 text-[11px] text-accent-dim">
        Nothing links here from the public site, and this page is not indexed. The whole subtree is
        behind HTTP Basic Auth.
      </p>
    </div>
  );
}