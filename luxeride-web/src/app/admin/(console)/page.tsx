import Link from "next/link";

import { prisma } from "@/lib/db";
import { liveLayoutCount, confirmedCustomerNames } from "@/data/fitment";
import { liveLayoutCountLive, confirmedCustomerNamesLive } from "@/lib/fitment-live";

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

function Row({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-3">
      <span className="text-sm text-muted">
        {label}
        {hint && <span className="mt-0.5 block text-[11px] text-gold-dim">{hint}</span>}
      </span>
      <span className="font-mono text-lg text-gold">{value}</span>
    </div>
  );
}

export default async function AdminPage() {
  const [vehicles, layouts, variants, mappings, confirmedLayouts, inferredLayouts, makes] =
    await Promise.all([
      prisma.vehicle.count(),
      prisma.layout.count(),
      prisma.layoutVariant.count(),
      prisma.mapping.count(),
      prisma.layout.count({ where: { status: "confirmed" } }),
      prisma.layout.count({ where: { status: "inferred" } }),
      prisma.make.count(),
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

  const popular = await prisma.vehicle.findMany({
    where: { isPopular: true },
    include: { make: { select: { name: true } } },
    orderBy: [{ make: { name: "asc" } }, { model: "asc" }],
  });

  // Both launch metrics, side by side. See the section below for why there are two.
  const storefrontLive = liveLayoutCount();
  const storefrontNames = confirmedCustomerNames();
  const databaseLive = await liveLayoutCountLive();
  const databaseNames = await confirmedCustomerNamesLive();

  return (
    <div>
      <p className="text-sm text-muted">
        You are authenticated. There is no second seat, no role and no permission list — locked
        decision 1.
      </p>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">Vehicles</h2>
        <div className="mt-3 rounded-xl border border-line bg-panel/60 px-5 py-2">
          <Row label="Unmapped" value={unmapped} hint="no Mapping row — this is the working queue" />
          <Row label="Mapped" value={mapped} hint="at least one Mapping row, inferred or confirmed" />
          <Row label="Excluded" value={excludedVehicles} hint='Vehicle.status = "excluded"' />
          <Row
            label="Written exclusions"
            value={recordedExclusions}
            hint="the Exclusion table — cars somebody looked at and knows we cannot fit"
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          <Link href="/admin/vehicles" className="text-gold underline-offset-4 hover:underline">
            Open the vehicles list
          </Link>{" "}
          to work through the queue, or{" "}
          <Link href="/admin/layouts" className="text-gold underline-offset-4 hover:underline">
            the layouts
          </Link>{" "}
          to confirm a floor pan.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">The database</h2>
        <div className="mt-3 rounded-xl border border-line bg-panel/60 px-5 py-2">
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
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Where /fit-check reads from</h2>
        <div className="mt-3 rounded-xl border border-line bg-panel/60 px-5 py-2">
          <Row
            label="Live layouts (the database)"
            value={databaseLive}
            hint="liveLayoutCountLive() — this is what /fit-check answers from"
          />
          <Row
            label="Live layouts (src/data/fitment.ts)"
            value={storefrontLive}
            hint="liveLayoutCount() — a compile-time table, permanently 0"
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Both numbers are shown on purpose, and the gap between them is the thing to watch.{" "}
          <code className="font-mono text-gold-dim">/api/fit-check</code> now calls{" "}
          <code className="font-mono text-gold-dim">checkFitLive()</code> in{" "}
          <code className="font-mono text-gold-dim">src/lib/fitment-live.ts</code> (§6.10), which reads
          these tables — so a confirmation saved here DOES change what a customer is told, and the
          top row is the real launch metric.
          <br />
          <br />
          What still does not is{" "}
          <code className="font-mono text-gold-dim">liveLayoutCount()</code> in{" "}
          <code className="font-mono text-gold-dim">src/data/fitment.ts</code>, which counts the
          compile-time table rather than the database. It is permanently 0 by construction and is
          kept on this page so the number cannot quietly become load-bearing somewhere nobody looks.
          This page used to warn that the two read different sources; that was true when{" "}
          <code className="font-mono text-gold-dim">fitment-live.ts</code> did not exist and is now
          out of date. The deliberate part — showing both side by side rather than inferring the gap
          — has not changed.
        </p>
        {databaseNames.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Currently confirmed for customers: {databaseNames.join(", ")}
          </p>
        )}
        {storefrontNames.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Named by the compile-time table, which nothing reads any more: {storefrontNames.join(", ")}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Popular cars</h2>
        <p className="mt-1 text-xs text-muted">
          The eight the Fit Finder offers before a search. They all refuse today, because nothing is
          confirmed — and a refusal is the correct answer until it is not.
        </p>
        <ul className="mt-3 space-y-1">
          {popular.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex items-center justify-between border-t border-line py-2 text-sm"
            >
              <span>
                {vehicle.make.name} {vehicle.model}
              </span>
              <span
                className={`font-mono text-[11px] uppercase ${
                  vehicle.status === "excluded" ? "text-[#FF6B35]" : "text-gold-dim"
                }`}
              >
                {vehicle.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-line bg-panel/60 p-5">
        <h2 className="font-display text-lg font-semibold">How a car becomes a yes</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          A layout may only be marked <code className="font-mono text-gold-dim">confirmed</code> with
          evidence attached: a physical fitting you did, a written supplier confirmation, or a
          verified OEM floor-pan match. Every confirmed layout also needs a{" "}
          <code className="font-mono text-gold-dim">confirmationNote</code> in your own words, the
          date, a lead time, the years it was checked over, and a price for each variant.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          The form refuses an incomplete row and names every missing field, so a half-filled claim
          cannot reach a customer. That is deliberate — it is the difference between this console and
          the spreadsheet it replaces.
        </p>
        <p className="mt-3 text-xs text-muted">
          Start at <Link href="/admin/layouts" className="text-gold underline-offset-4 hover:underline">the layouts</Link>.
          <code className="font-mono text-gold-dim">src/data/fitment-review.ts</code> is still the
          equivalent for the compile-time table, and{" "}
          <code className="font-mono text-gold-dim">npm run fitment:report --ids</code> lists every
          vehicle id.
        </p>
      </section>

      <p className="mt-8 text-[11px] text-gold-dim">
        Nothing links here from the public site, and this page is not indexed. The whole subtree is
        behind HTTP Basic Auth.
      </p>
    </div>
  );
}