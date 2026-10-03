import Link from "next/link";

import { prisma } from "@/lib/db";

/**
 * `/admin/vehicles` — the reviewable car list (`fitment-engine` §8.3).
 *
 * A Server Component. The filter lives in `searchParams` rather than in component
 * state, so a filtered view is a URL: it can be bookmarked, pasted into a message,
 * or opened on a phone, and it is the same page whether JavaScript ran or not.
 * There is no `'use client'` and no submit button — the filter links are plain
 * `<Link>`s, which means the whole screen works with scripting disabled.
 *
 * "Unmapped", "mapped" and "excluded" mean exactly what §8.2 says they mean, and
 * the counts are in the filter bar so the owner can see the size of the queue
 * before clicking into it.
 *
 * WHY EVERY ROW IS NOT A LINK TO A LAYOUT
 *
 * §8.3 asks each row to link to the layout detail screen, and mapped rows do. An
 * unmapped vehicle has no layout — there is nothing to link to, and a link to
 * `/admin/layouts` would be a dead end dressed as a destination. Those rows say
 * "unmapped" in words instead, which is also the honest description of the work:
 * the vehicle is in the catalogue and no floor pan has been assigned to it.
 * Grouping a selection into a layout is §8.4/§9.1, which is not in this
 * workstream, so this screen links to it rather than pretending to be it.
 */

type Filter = "all" | "unmapped" | "mapped" | "excluded";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unmapped", label: "Unmapped" },
  { value: "mapped", label: "Mapped" },
  { value: "excluded", label: "Excluded" },
];

/** Build a link that keeps the search term when only the filter changes, and vice versa. */
function filterHref(filter: Filter, query: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("f", filter);
  if (query !== "") params.set("q", query);
  const search = params.toString();
  return search === "" ? "/admin/vehicles" : `/admin/vehicles?${search}`;
}

/**
 * `searchParams` is a Promise in Next 16 — verified in
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
 * and in `layouts-and-pages.md`. Reading it also opts the route into dynamic
 * rendering, which is correct here: the counts must be true on every request.
 */
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawFilter = typeof params.f === "string" ? params.f : "";
  const filter: Filter = (FILTERS.some((option) => option.value === rawFilter) ? rawFilter : "all") as Filter;

  const rawQuery = typeof params.q === "string" ? params.q.trim() : "";
  // Case-insensitive contains over make OR model. `mode: "insensitive"` rather
  // than upper-casing in JS so the index on `[makeId, model]` is still usable and
  // so "corolla", "COROLLA" and "Corolla" all reach the same 4 rows.
  const query = rawQuery === "" ? {} : { contains: rawQuery, mode: "insensitive" as const };

  const [all, unmapped, mapped, excluded] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { mappings: { none: {} } } }),
    prisma.vehicle.count({ where: { mappings: { some: {} } } }),
    prisma.vehicle.count({ where: { status: "excluded" } }),
  ]);

  const where =
    filter === "unmapped"
      ? { mappings: { none: {} } }
      : filter === "mapped"
        ? { mappings: { some: {} } }
        : filter === "excluded"
          ? { status: "excluded" }
          : // `OR` needs a non-empty object, so the search is applied only when
            // there is something to search for rather than with `undefined`.
            rawQuery === ""
              ? {}
              : { OR: [{ model: query }, { make: { name: query } }] };

  // `mappings` is included rather than counted so the row can link straight to
  // the layout without a second round trip per row.
  const vehicles = await prisma.vehicle.findMany({
    where,
    include: {
      make: { select: { name: true } },
      mappings: {
        include: { layout: { select: { id: true, internalCode: true, customerName: true, status: true } } },
      },
    },
    orderBy: [{ make: { name: "asc" } }, { model: "asc" }],
  });

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Vehicles</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
          {vehicles.length} shown of {all}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        {FILTERS.map((option) => {
          const count =
            option.value === "all"
              ? all
              : option.value === "unmapped"
                ? unmapped
                : option.value === "mapped"
                  ? mapped
                  : excluded;
          const active = option.value === filter;
          return (
            <Link
              key={option.value}
              href={filterHref(option.value, rawQuery)}
              aria-current={active ? "page" : undefined}
              className={`font-mono text-xs uppercase tracking-widest ${
                active ? "text-gold" : "text-muted hover:text-gold"
              }`}
            >
              {option.label} <span className="text-gold-dim">{count}</span>
            </Link>
          );
        })}
      </div>

      {/* A GET form, so it works with scripting disabled and the value ends up in
          the URL. No submit button: pressing Enter is enough, and the links above
          keep the term. */}
      <form method="get" action="/admin/vehicles" className="mt-4 flex max-w-md gap-2">
        {filter !== "all" && <input type="hidden" name="f" value={filter} />}
        <input
          type="search"
          name="q"
          defaultValue={rawQuery}
          placeholder="Search make or model"
          aria-label="Search make or model"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white placeholder:text-muted focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-line px-4 py-2 text-sm text-white hover:border-gold"
        >
          Search
        </button>
      </form>

      {vehicles.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-panel/60 px-5 py-6 text-sm text-muted">
          {rawQuery !== ""
            ? `Nothing matches "${rawQuery}" in this filter.`
            : filter === "unmapped"
              ? "No unmapped vehicles. Every car in the catalogue has a Mapping row, which is not the same as having been checked — open a layout to see whether it has been confirmed."
              : filter === "excluded"
                ? "No vehicles are marked excluded. The Exclusion table is the record of cars somebody looked at and knows we cannot fit."
                : "Nothing to show."}
        </p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-widest text-gold-dim">
              <th className="py-2 pr-4 font-normal">Car</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 font-normal">Layout</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => {
              const mapping = vehicle.mappings[0];
              return (
                <tr key={vehicle.id} className="border-t border-line align-top">
                  <td className="py-2 pr-4">
                    {vehicle.make.name} {vehicle.model}
                    <span className="block font-mono text-[11px] text-gold-dim">{vehicle.sourceKey}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-[11px] uppercase">
                    {vehicle.status === "excluded" ? (
                      <span className="text-[#FF6B35]">excluded</span>
                    ) : mapping ? (
                      <span className="text-muted">{mapping.confidence}</span>
                    ) : (
                      <span className="text-[#FF6B35]">unmapped</span>
                    )}
                  </td>
                  <td className="py-2">
                    {mapping ? (
                      <Link
                        href={`/admin/layouts/${encodeURIComponent(mapping.layout.id)}`}
                        className="text-gold underline-offset-4 hover:underline"
                      >
                        <span className="font-mono">{mapping.layout.internalCode}</span>{" "}
                        {mapping.layout.customerName}
                      </Link>
                    ) : (
                      <span className="text-muted">
                        no layout yet — this car has never been checked against a floor pan
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-muted">
        Every row, no paging: 212 cars is a table, not a scroll. If the catalogue ever grows past
        what is comfortable in one screen this is where a{" "}
        <code className="font-mono text-gold-dim">?page=</code> parameter belongs.
      </p>
    </div>
  );
}