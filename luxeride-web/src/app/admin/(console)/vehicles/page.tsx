import Link from "next/link";

import { prisma } from "@/lib/db";
import { deleteVehicle, deleteVehicles, setVehicleActive, setVehiclesActive, withdrawCar } from "../actions";

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
 * ── TWO LEVELS OF COLLAPSE, AND WHY ────────────────────────────────────────────
 *
 * The catalogue is four hundred-odd year ranges. Flat, that is a wall; grouped only
 * by make, it is still a wall once a make is opened (Toyota is dozens of rows). So
 * the screen collapses TWICE: a `<details>` per make, and inside it a `<details>`
 * per CAR — one model, its year ranges listed underneath. A car is the thing the
 * owner actually works on ("do we cover the 2016 Corolla?"), so a car is the unit
 * that gets its own header, its own count, and its own batch controls.
 *
 * ── THE TWO CONTROLS ON A RANGE, AND WHY BOTH EXIST ────────────────────────────
 *
 * The owner asked for both, in those words: "lets have the withdraw button and a
 * delete button on the vehicle, so I can remove what I don't need".
 *
 *   - WITHDRAW (`setVehicleActive`) is reversible and loses nothing. It is the
 *     default answer to "we are out of these years": the range keeps its prices and
 *     its photographs and comes straight back when stock does.
 *   - DELETE (`deleteVehicle`) is the destructive one, for a range that is not a car
 *     we will ever sell — a duplicate an import left behind, a name spelled wrong.
 *     It cascades the range's own mappings and photographs away and leaves the audit
 *     log as the record that it existed.
 *
 * A range that is only out of stock wants the first; a range that should never have
 * been in the list wants the second. Making the second the only option would be a
 * trap, and making the first the only option would leave a queue that never empties.
 *
 * ── HOW THE BATCH CONTROLS WORK WITH NO JAVASCRIPT ─────────────────────────────
 *
 * Each car's `<details>` renders ONE `<form>` holding the three batch buttons, and the
 * table rows underneath carry the checkboxes. The checkboxes are associated with that
 * form by its `id` (`form="…"`), so they submit with it even though they are not its
 * descendants — which is what lets the table ALSO hold the per-range single-action
 * forms without nesting one form inside another (illegal, and the classic reason a
 * "one-click" button silently stops working).
 *
 * The three batch buttons distinguish themselves with plain HTML: the two toggles are
 * `name="active" value="off|on"`, so only the clicked one is submitted, and Delete
 * overrides the form's action with `formAction`. No client state is involved and the
 * screen behaves identically with scripting off.
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
      make: { select: { name: true, id: true } },
      mappings: {
        include: { layout: { select: { id: true, internalCode: true, customerName: true, status: true } } },
      },
    },
    orderBy: [{ make: { name: "asc" } }, { model: "asc" }, { yearFrom: "asc" }],
  });

  /**
   * The URL to come back to after an action, so a bulk edit on a filtered view does
   * not dump the operator back on the unfiltered list.
   */
  const back = filterHref(filter, rawQuery);

  /*
   * GROUPED BY MAKE, THEN BY CAR, in the order the query already returned them.
   *
   * A `Map` rather than an object so two makes (or two models) can never collide on a
   * key, and so the insertion order is the query's order — which is `make.name asc,
   * model asc, yearFrom asc`, so the makes appear alphabetically, the cars under each
   * one alphabetically, and each car's ranges oldest-first. No re-sorting, which means
   * no chance of the two disagreeing.
   */
  type Vehicle = (typeof vehicles)[number];
  const byMake = new Map<
    string,
    {
      make: { name: string; id: string };
      unmapped: number;
      excluded: number;
      cars: Map<string, { model: string; vehicles: Vehicle[]; unmapped: number; excluded: number }>;
    }
  >();
  for (const vehicle of vehicles) {
    const key = vehicle.make.id;
    let group = byMake.get(key);
    if (!group) {
      group = { make: vehicle.make, unmapped: 0, excluded: 0, cars: new Map() };
      byMake.set(key, group);
    }
    let car = group.cars.get(vehicle.model);
    if (!car) {
      car = { model: vehicle.model, vehicles: [], unmapped: 0, excluded: 0 };
      group.cars.set(vehicle.model, car);
    }
    car.vehicles.push(vehicle);
    const mapping = vehicle.mappings[0];
    if (vehicle.status === "excluded") {
      group.excluded += 1;
      car.excluded += 1;
    } else if (!mapping) {
      group.unmapped += 1;
      car.unmapped += 1;
    }
  }
  const groups = [...byMake.values()].map((group) => ({
    make: group.make,
    unmapped: group.unmapped,
    excluded: group.excluded,
    cars: [...group.cars.values()],
  }));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Vehicles</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
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
                active ? "text-accent" : "text-fg-muted hover:text-accent"
              }`}
            >
              {option.label} <span className="text-accent-dim">{count}</span>
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
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
        >
          Search
        </button>
      </form>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-fg-muted">
        Open a make, then a car. Each row is one YEAR RANGE — the unit a floor pan
        covers. <span className="text-fg/80">Withdraw</span> stops offering those years
        and keeps their prices and photographs; <span className="text-fg/80">Delete</span>{" "}
        removes the range for good. Tick several ranges and use the buttons at the top of
        the car to do it in one go.
      </p>

      {vehicles.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-surface/60 px-5 py-6 text-sm text-fg-muted">
          {rawQuery !== ""
            ? `Nothing matches "${rawQuery}" in this filter.`
            : filter === "unmapped"
              ? "No unmapped vehicles. Every car in the catalogue has a Mapping row, which is not the same as having been checked — open a layout to see whether it has been confirmed."
              : filter === "excluded"
                ? "No vehicles are marked excluded. The Exclusion table is the record of cars somebody looked at and knows we cannot fit."
                : "Nothing to show."}
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {groups.map((group) => (
            /*
             * A COLLAPSIBLE GROUP PER MAKE. The owner's note was "cars should be grouped
             * not all listed per type" — and then "the cars are collapsed", which is the
             * second level below: inside the make, a `<details>` per car.
             *
             * A `<details>` again rather than a client toggle, for the same reason as
             * everywhere else in this console: it works with scripting disabled, it holds
             * no state, and it renders the same on the server.
             *
             * The OPEN state is chosen so the common case stays cheap:
             *   - a search is open, because a filtered list is short and hiding it behind
             *     a closed header would be an extra click for nothing;
             *   - a make with unmapped cars in it is open, because that is the working
             *     queue and it should not need a click to see;
             *   - otherwise it is closed, so "All" is a list of makes, not four hundred rows.
             */
            <details
              key={group.make.id}
              open={rawQuery !== "" || group.unmapped > 0}
              className="rounded-xl border border-border bg-surface/60"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 marker:content-none">
                <span className="font-display text-base font-semibold text-fg/90">{group.make.name}</span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                  {group.cars.length} car{group.cars.length === 1 ? "" : "s"}
                </span>
                {group.unmapped > 0 && (
                  <span className="rounded-md border border-[#FF6B35]/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#FF6B35]">
                    {group.unmapped} unmapped
                  </span>
                )}
                {group.excluded > 0 && (
                  <span className="font-mono text-[10px] uppercase text-fg-muted">{group.excluded} excluded</span>
                )}
              </summary>

              <div className="space-y-2 border-t border-border p-3">
                {group.cars.map((car) => {
                  /* One id per car, used by that car's checkboxes to find their form. */
                  const batchFormId = `batch-${car.vehicles[0].id}`;
                  const withdrawn = car.vehicles.filter((vehicle) => !vehicle.active).length;
                  return (
                    <details
                      key={car.model}
                      open={rawQuery !== ""}
                      className="rounded-lg border border-border bg-surface/40"
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 marker:content-none">
                        <span className="font-display text-sm font-semibold text-fg/90">{car.model}</span>
                        {car.vehicles.some((vehicle) => vehicle.isPopular) && (
                          <span className="font-mono text-[10px] uppercase text-accent-dim">popular</span>
                        )}
                        <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                          {car.vehicles.length} range{car.vehicles.length === 1 ? "" : "s"}
                        </span>
                        {withdrawn > 0 && (
                          <span className="font-mono text-[10px] uppercase text-fg-muted">{withdrawn} withdrawn</span>
                        )}
                        {car.unmapped > 0 && (
                          <span className="rounded-md border border-[#FF6B35]/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#FF6B35]">
                            {car.unmapped} unmapped
                          </span>
                        )}
                      </summary>

                      {/*
                        {/*
                        THE CAR'S BATCH ROW.

                        The first form is EMPTY of data — it holds the three ticked-range
                        buttons and nothing else; the checkboxes live in the table below and
                        point at it by id, which is what keeps the per-range forms from being
                        nested inside it.

                        The second form takes the WHOLE CAR with nothing ticked. It is a
                        separate form rather than a fourth button in the first, because
                        buttons in one form submit one `vehicleIds` set: sharing it would make
                        "Withdraw selected" also carry every range, and the two could never
                        disagree about what was meant. It posts only the make and the model —
                        `withdrawCar` reads the car's ranges from the database — so it means
                        the same thing in a filtered view as it does in "All", which the
                        on-screen ids could not promise.
                      */}
                      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                        <form
                          id={batchFormId}
                          method="post"
                          action={setVehiclesActive}
                          className="contents"
                        >
                          <input type="hidden" name="back" value={back} />
                          <button
                            type="submit"
                            name="active"
                            value="off"
                            formNoValidate
                            className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-[#FF6B35] hover:text-[#FF6B35]"
                          >
                            Withdraw selected
                          </button>
                          <button
                            type="submit"
                            name="active"
                            value="on"
                            formNoValidate
                            className="rounded-lg border border-accent px-3 py-1 text-xs text-accent transition-colors hover:bg-accent hover:text-on-accent"
                          >
                            Put live selected
                          </button>
                          <button
                            type="submit"
                            formAction={deleteVehicles}
                            formNoValidate
                            className="rounded-lg border border-[#FF6B35]/60 px-3 py-1 text-xs text-[#FF6B35] transition-colors hover:bg-[#FF6B35] hover:text-on-accent"
                          >
                            Delete selected
                          </button>
                        </form>

                        <span className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                          tick the ranges you mean
                        </span>

                        <form method="post" action={withdrawCar} className="contents">
                          <input type="hidden" name="back" value={back} />
                          <input type="hidden" name="makeId" value={group.make.id} />
                          <input type="hidden" name="model" value={car.model} />
                          <button
                            type="submit"
                            formNoValidate
                            title={`Stop offering every year range of the ${car.model}. Prices and photographs are kept, and each range comes back with Put live.`}
                            className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-[#FF6B35] hover:text-[#FF6B35]"
                          >
                            Withdraw every range
                          </button>
                        </form>
                      </div>

                      <table className="w-full border-t border-border text-left text-sm">
                        <thead>
                          <tr className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
                            <th scope="col" className="w-px py-2 pl-3 pr-2 font-normal">
                              <span className="sr-only">Select</span>
                            </th>
                            <th scope="col" className="py-2 pr-4 font-normal">Years</th>
                            <th scope="col" className="py-2 pr-4 font-normal">Status</th>
                            <th scope="col" className="py-2 pr-4 font-normal">Layout</th>
                            <th scope="col" className="py-2 pr-3 font-normal">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {car.vehicles.map((vehicle) => {
                            const mapping = vehicle.mappings[0];
                            const span =
                              vehicle.yearFrom !== null && vehicle.yearTo !== null
                                ? `${vehicle.yearFrom}–${vehicle.yearTo}`
                                : "not set";
                            return (
                              <tr key={vehicle.id} className="border-t border-border align-top">
                                <td className="py-2 pl-3 pr-2">
                                  <input
                                    type="checkbox"
                                    name="vehicleIds"
                                    value={vehicle.id}
                                    form={batchFormId}
                                    aria-label={`Select ${vehicle.model} ${span}`}
                                    className="h-3.5 w-3.5 accent-accent"
                                  />
                                </td>
                                <td className="py-2 pr-4 font-mono text-[11px] text-fg-muted">
                                  {span}
                                  {!vehicle.active && (
                                    <span className="ml-2 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-fg-muted">
                                      withdrawn
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 font-mono text-[11px] uppercase">
                                  {vehicle.status === "excluded" ? (
                                    <span className="text-[#FF6B35]">excluded</span>
                                  ) : mapping ? (
                                    <span className="text-fg-muted">{mapping.confidence}</span>
                                  ) : (
                                    <span className="text-[#FF6B35]">unmapped</span>
                                  )}
                                </td>
                                <td className="py-2 pr-4">
                                  {mapping ? (
                                    <Link
                                      href={`/admin/layouts/${encodeURIComponent(mapping.layout.id)}`}
                                      className="text-accent underline-offset-4 hover:underline"
                                    >
                                      <span className="font-mono">{mapping.layout.internalCode}</span>{" "}
                                      {mapping.layout.customerName}
                                    </Link>
                                  ) : (
                                    <span className="text-fg-muted">no layout yet — never checked against a floor pan</span>
                                  )}
                                </td>
                                <td className="py-2 pr-3">
                                  <div className="flex flex-wrap gap-2">
                                    {/* The per-range switch. `back` keeps the operator on this
                                        filtered view instead of bouncing to the layout page. */}
                                    <form method="post" action={setVehicleActive} className="contents">
                                      <input type="hidden" name="back" value={back} />
                                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                                      <input
                                        type="hidden"
                                        name="active"
                                        value={vehicle.active ? "off" : "on"}
                                      />
                                      <button
                                        type="submit"
                                        formNoValidate
                                        title={
                                          vehicle.active
                                            ? "Stop offering these years. The prices and photographs are kept."
                                            : "Offer these years again"
                                        }
                                        className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                                          vehicle.active
                                            ? "border-border text-fg-muted hover:border-[#FF6B35] hover:text-[#FF6B35]"
                                            : "border-accent bg-accent text-on-accent"
                                        }`}
                                      >
                                        {vehicle.active ? "Withdraw" : "Put live"}
                                      </button>
                                    </form>
                                    {/* The destructive one. It is a separate form so the button
                                        submits nothing but this range's id. */}
                                    <form method="post" action={deleteVehicle} className="contents">
                                      <input type="hidden" name="back" value={back} />
                                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                                      <button
                                        type="submit"
                                        formNoValidate
                                        title="Remove this year range for good. Its prices and photographs go with it."
                                        className="rounded-lg border border-[#FF6B35]/60 px-3 py-1 text-xs text-[#FF6B35] transition-colors hover:bg-[#FF6B35] hover:text-on-accent"
                                      >
                                        Delete
                                      </button>
                                    </form>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </details>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-fg-muted">
        Every row, no paging: the catalogue is a table, not a scroll. If it ever grows past
        what is comfortable in one screen this is where a{" "}
        <code className="font-mono text-accent-dim">?page=</code> parameter belongs.
      </p>
    </div>
  );
}
