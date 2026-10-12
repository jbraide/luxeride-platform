import Link from "next/link";

import { prisma } from "@/lib/db";
import { deleteVehicle, deleteVehicles, setCarActive, setMakeActive, setVehicleActive, setVehiclesActive } from "../actions";
import PageHeader from "@/components/admin/PageHeader";
import EmptyState from "@/components/admin/EmptyState";
import StatusChip from "@/components/admin/StatusChip";
import { TABLE, TABLE_HEAD, TABLE_HEAD_CELL, TABLE_ROW, chip } from "@/components/admin/ui";

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
 * A URL for the make browser, preserving the active filter and search term. `makeId`
 * null (or omitted) closes whatever make is open. This is the page's state as a URL,
 * the same rule the filter chips follow — see the make map for why it is a URL now.
 */
function browseHref(filter: Filter, query: string, makeId: string | null): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("f", filter);
  if (query !== "") params.set("q", query);
  if (makeId) params.set("make", makeId);
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
   * WHICH MAKE IS OPEN, so the list renders one make instead of all of them. See the map
   * below for why this is URL state (`?make=`) and not a `<details>`: the collapsed markup
   * of the entire catalogue was what tipped the Worker's 128 MB memory limit.
   */
  const openMake = typeof params.make === "string" ? params.make : "";

  /**
   * The URL to come back to after an action, so a bulk edit on a filtered view does not
   * dump the operator back on the unfiltered list — and so a withdraw inside an open make
   * returns to that same open make rather than collapsing it under them.
   */
  const back = browseHref(filter, rawQuery, openMake === "" ? null : openMake);

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

  /*
   * A search is usually narrow, so its hits stay open without a click; a broad one (or a
   * filter with no search term) falls back to the closed make list, which is the cheap case.
   */
  const autoOpenSearch = rawQuery !== "" && groups.length <= 5;

  return (
    <div>
      <PageHeader
        title="Vehicles"
        meta={`${vehicles.length} shown of ${all} — every year range, grouped by make and then car`}
      />

      {/*
        THE FILTERS, AS CHIPS RATHER THAN UNDERLINED WORDS.

        They were a row of mono links, which read as three more pieces of text beside
        the search form rather than as the one control that changes what the page is
        showing. A bordered chip with its count carries the state (`aria-current`) and the
        size of the queue in the same glance, which is what §8.2 asks the counts to do.
      */}
      <nav aria-label="Filter vehicles" className="mt-4 flex flex-wrap items-center gap-2">
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
              className={chip(active)}
            >
              {option.label}
              <span className={active ? "text-accent" : "text-accent-dim"}>{count}</span>
            </Link>
          );
        })}
      </nav>

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
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
        >
          Search
        </button>
      </form>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-fg-muted">
        Open a make, then a car. Each row is one{" "}
        <span className="text-fg/80">year range</span> — the unit a floor pan covers.{" "}
        <span className="text-fg/80">Withdraw</span> stops offering it and keeps its prices and
        photographs; <span className="text-fg/80">Delete</span> removes it for good. Take a whole
        car with the <span className="text-fg/80">whole car</span> buttons, a whole make with{" "}
        <span className="text-fg/80">whole make</span>, or tick ranges to act on just those.
      </p>

      {vehicles.length === 0 ? (
        <EmptyState className="mt-6">
          {rawQuery !== "" ? (
            <>
              {`Nothing matches "${rawQuery}" in this filter.`}{" "}
              <Link href="/admin/vehicles" className="text-accent underline-offset-4 hover:underline">
                Clear filters
              </Link>
            </>
          ) : filter === "unmapped" ? (
            "No unmapped vehicles. Every car in the catalogue has a Mapping row, which is not the same as having been checked — open a layout to see whether it has been confirmed."
          ) : filter === "excluded" ? (
            "No vehicles are marked excluded. The Exclusion table is the record of cars somebody looked at and knows we cannot fit."
          ) : (
            "Nothing to show."
          )}
        </EmptyState>
      ) : (
        <div className="mt-6 space-y-3">
          {groups.map((group) => {
            /*
             * A HEADER PER MAKE, AND ONLY THE OPEN MAKE IS RENDERED.
             *
             * This was a `<details>` per make, and every make's contents were rendered
             * whether it was open or not — a collapsed `<details>` still renders its
             * children on the server. Measured: that made this page 4.6 MB of HTML, 2.8 MB
             * of it the RSC flight payload, on EVERY request, because the whole catalogue
             * was serialised to say almost nothing. Rendering it was enough to tip the
             * Worker's 128 MB isolate over — Cloudflare Error 1102.
             *
             * So the make level is URL-driven now (`?make=<id>`), the same rule the filter
             * chips already follow: the default screen is a list of makes, and opening one
             * renders that make's cars and nothing else. Opening a make is a navigation
             * rather than an instant toggle, which is the price of a page measured in
             * kilobytes instead of megabytes — and it still works with scripting disabled,
             * because the URL was always the state.
             *
             * The car level below stays a `<details>`: one make's cars are small enough to
             * render, and an instant toggle is worth keeping where it is cheap.
             */
            const isOpen = group.make.id === openMake || autoOpenSearch;
            return (
            <div
              key={group.make.id}
              className="rounded-xl border border-border bg-surface/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <Link
                  href={browseHref(filter, rawQuery, group.make.id)}
                  aria-current={isOpen ? "true" : undefined}
                  className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1"
                >
                  <span className="font-display text-base font-semibold text-fg/90">{group.make.name}</span>
                  <span className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
                    {group.cars.length} car{group.cars.length === 1 ? "" : "s"}
                  </span>
                  {group.unmapped > 0 && <StatusChip tone="warn">{group.unmapped} unmapped</StatusChip>}
                  {group.excluded > 0 && <StatusChip tone="neutral">{group.excluded} excluded</StatusChip>}
                </Link>
                <Link
                  href={isOpen ? browseHref(filter, rawQuery, null) : browseHref(filter, rawQuery, group.make.id)}
                  className="shrink-0 text-xs text-fg-muted underline-offset-4 hover:text-accent hover:underline"
                >
                  {isOpen ? "Close" : "Open"}
                </Link>
              </div>

              {isOpen && (
                <>

              {/*
                THE WHOLE MAKE, ON ITS OWN BAND ABOVE THE CARS.

                "for all the fords I'd want to just withdraw all at once" — one row, one
                decision, every model under it. Placed OUTSIDE the `<summary>`, not in it,
                because a `<button>` inside a `<summary>` also toggles the disclosure: every
                press would withdraw the make AND collapse the panel it was pressed in.

                A SEPARATE FORM PER DIRECTION, the same as the car toolbar below — buttons in
                one form share one `active` value, so a shared form would make one of the two
                act on the other's flag.
              */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-surface-2/40 px-4 py-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                  whole make
                </span>
                <form method="post" action={setMakeActive} className="contents">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="makeId" value={group.make.id} />
                  <input type="hidden" name="active" value="off" />
                  <button
                    type="submit"
                    formNoValidate
                    title={`Stop offering every ${group.make.name} in the catalogue — every model, every year range. Their prices and photographs are kept, and "Put all live" brings them back.`}
                    className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-danger hover:text-danger"
                  >
                    Withdraw all {group.make.name}
                  </button>
                </form>
                <form method="post" action={setMakeActive} className="contents">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="makeId" value={group.make.id} />
                  <input type="hidden" name="active" value="on" />
                  <button
                    type="submit"
                    formNoValidate
                    title={`Offer every ${group.make.name} again.`}
                    className="rounded-lg border border-accent/50 px-3 py-1 text-xs text-accent transition-colors hover:bg-accent hover:text-on-accent"
                  >
                    Put all live
                  </button>
                </form>
              </div>

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
                        {withdrawn > 0 && <StatusChip tone="neutral">{withdrawn} withdrawn</StatusChip>}
                        {car.unmapped > 0 && <StatusChip tone="warn">{car.unmapped} unmapped</StatusChip>}
                      </summary>

                      {/*
                        THE CAR'S TOOLBAR, in two labelled groups.

                        WHOLE CAR comes first, because it is the owner's one-click answer to
                        "stop offering this car". It is a SEPARATE FORM per direction rather
                        than more buttons in the ticked group: buttons in one form submit one
                        `active` value and one `vehicleIds` set, so sharing it would make
                        "Withdraw" depend on ranges nobody ticked.

                        TICKED is the original trio, whose checkboxes live in the table below
                        and point at this form by id — which is what keeps the per-range forms
                        from being nested inside it (illegal, and the classic reason a
                        one-click button silently stops working).
                      */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3 py-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                          whole car
                        </span>
                        <form method="post" action={setCarActive} className="contents">
                          <input type="hidden" name="back" value={back} />
                          <input type="hidden" name="makeId" value={group.make.id} />
                          <input type="hidden" name="model" value={car.model} />
                          <input type="hidden" name="active" value="off" />
                          <button
                            type="submit"
                            formNoValidate
                            title={`Stop offering every year range of the ${car.model}. Its prices and photographs are kept, and "Put all live" brings them back.`}
                            className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-danger hover:text-danger"
                          >
                            Withdraw all
                          </button>
                        </form>
                        <form method="post" action={setCarActive} className="contents">
                          <input type="hidden" name="back" value={back} />
                          <input type="hidden" name="makeId" value={group.make.id} />
                          <input type="hidden" name="model" value={car.model} />
                          <input type="hidden" name="active" value="on" />
                          <button
                            type="submit"
                            formNoValidate
                            title={`Offer every year range of the ${car.model} again.`}
                            className="rounded-lg border border-accent/50 px-3 py-1 text-xs text-accent transition-colors hover:bg-accent hover:text-on-accent"
                          >
                            Put all live
                          </button>
                        </form>

                        <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />

                        <span className="font-mono text-[10px] uppercase tracking-widest text-accent-dim">
                          ticked
                        </span>
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
                            className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-danger hover:text-danger"
                          >
                            Withdraw
                          </button>
                          <button
                            type="submit"
                            name="active"
                            value="on"
                            formNoValidate
                            className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
                          >
                            Put live
                          </button>
                          <button
                            type="submit"
                            formAction={deleteVehicles}
                            formNoValidate
                            className="rounded-lg border border-danger/60 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger hover:text-on-accent"
                          >
                            Delete
                          </button>
                        </form>
                      </div>

                      <table className={`border-t border-border ${TABLE}`}>
                        <thead>
                          <tr className={TABLE_HEAD}>
                            <th scope="col" className="w-px py-2 pl-3 pr-2 font-normal">
                              <span className="sr-only">Select</span>
                            </th>
                            <th scope="col" className={TABLE_HEAD_CELL}>Years</th>
                            <th scope="col" className={TABLE_HEAD_CELL}>Status</th>
                            <th scope="col" className={TABLE_HEAD_CELL}>Layout</th>
                            <th scope="col" className={TABLE_HEAD_CELL}>Actions</th>
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
                              <tr key={vehicle.id} className={TABLE_ROW}>
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
                                    <span className="ml-2">
                                      <StatusChip tone="neutral">withdrawn</StatusChip>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-4">
                                  {vehicle.status === "excluded" ? (
                                    <StatusChip tone="danger">excluded</StatusChip>
                                  ) : mapping ? (
                                    <StatusChip tone="neutral">{mapping.confidence}</StatusChip>
                                  ) : (
                                    <StatusChip tone="warn">unmapped</StatusChip>
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
                                            ? "border-border text-fg-muted hover:border-danger hover:text-danger"
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
                                        className="rounded-lg border border-danger/60 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger hover:text-on-accent"
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
                </>
              )}
            </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-fg-muted">
        One make is rendered at a time (<code className="font-mono text-accent-dim">?make=</code>)
        so the screen sends kilobytes rather than the whole catalogue — the collapsed markup was
        what used to tip the Worker&apos;s memory limit. Every range is still here, still no paging.
      </p>
    </div>
  );
}
