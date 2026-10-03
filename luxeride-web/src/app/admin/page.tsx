import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { liveLayoutCount, confirmedCustomerNames } from "@/data/fitment";

/**
 * `/admin` — the console's landing page (`fitment-engine` §8, milestone M9.3).
 *
 * A Server Component. It is reached only through `src/proxy.ts`, which refuses the
 * whole `/admin` subtree without credentials, and every number it shows comes from
 * the database.
 *
 * **READ THIS BEFORE TRUSTING THE COUNTS.** There are currently two homes for the
 * same 212 rows, and they are deliberately not yet joined:
 *
 *   - `/fit-check` reads `src/data/fitment.ts` — a compile-time module.
 *   - this page reads the `Layout`/`Mapping` tables, seeded from the same catalogue.
 *
 * They agree today because the seed is derived from that module. They will diverge
 * the moment something writes to the database, which is what the admin console is
 * for. **M9.6 is the task that makes `checkFit()` read these tables**, and until it
 * lands, a change made here does not change what a customer is told. Both numbers
 * are shown side by side below so the gap is visible rather than inferred.
 */

export const metadata: Metadata = {
  title: "Admin",
  // The console is not discoverable and must never be indexed.
  robots: { index: false, follow: false },
};

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

  const popular = await prisma.vehicle.findMany({
    where: { isPopular: true },
    include: { make: { select: { name: true } } },
    orderBy: [{ make: { name: "asc" } }, { model: "asc" }],
  });

  // What the STOREFRONT currently uses. Different source on purpose, for now.
  const storefrontLive = liveLayoutCount();
  const storefrontNames = confirmedCustomerNames();

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold">LuxeRide admin</h1>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
          one operator
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        You are authenticated. There is no second seat, no role and no permission list — locked
        decision 1.
      </p>

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
        <h2 className="font-display text-lg font-semibold">What the storefront is using</h2>
        <div className="mt-3 rounded-xl border border-line bg-panel/60 px-5 py-2">
          <Row
            label="Live layouts (from src/data/fitment.ts)"
            value={storefrontLive}
            hint="this, not the number above, is what /fit-check reads"
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          The two rows above read different sources and are shown together on purpose.{" "}
          <strong className="text-white/80">M9.6</strong> is the task that makes{" "}
          <code className="font-mono text-gold-dim">checkFit()</code> read the database; until it
          lands, confirming a layout here would <em>not</em> change what a customer is told. Nothing
          writes to these tables yet.
        </p>
        {storefrontNames.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Currently confirmed for customers: {storefrontNames.join(", ")}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Popular cars</h2>
        <p className="mt-1 text-xs text-muted">
          The eight the Fit Finder offers before a search. All of them currently refuse, because
          nothing is confirmed.
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
          evidence attached: a physical fitting you did, written supplier confirmation, or a verified
          OEM floor-pan match. Every confirmed layout also needs a{" "}
          <code className="font-mono text-gold-dim">confirmationNote</code> in your own words, the
          date, a lead time, and a price for each variant.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          The build refuses an incomplete row and names it, so a half-filled claim cannot reach a
          customer. That is deliberate — it is the difference between this console and the
          spreadsheet it replaces.
        </p>
        <p className="mt-3 text-xs text-muted">
          The entry form is the next piece of M9.3. Today the equivalent is one entry in{" "}
          <code className="font-mono text-gold-dim">src/data/fitment-review.ts</code>, and{" "}
          <code className="font-mono text-gold-dim">npm run fitment:report --ids</code> lists every
          vehicle id.
        </p>
      </section>

      <p className="mt-8 text-[11px] text-gold-dim">
        Nothing links here from the public site. This page is not indexed and the whole subtree is
        behind HTTP Basic Auth.
      </p>
    </div>
  );
}
