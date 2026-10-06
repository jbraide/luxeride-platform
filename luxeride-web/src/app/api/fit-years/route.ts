import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import type { SeatRows } from "@/lib/seat-rows";

/**
 * `GET /api/fit-years?make=&model=` — the years a car actually existed, as recorded.
 *
 * WHY THIS EXISTS
 *
 * The Fit Finder's year dropdown was a hardcoded `2000…2026` for every one of the
 * 212 models in `src/data/cars.ts`, which has no year dimension at all. So a Toyota
 * Matrix — a car that stopped being made in 2014 — was offered as a 2026 car, and a
 * 2003 one was not offered at all. The years are the second thing a customer types
 * and the first thing we then have to refuse them about, so getting the list right
 * removes a whole class of wrong-typed refusals.
 *
 * IT IS A SEPARATE ROUTE, NOT A BRANCH ON `/api/fit-check`
 *
 * `/api/fit-check` is a POST that answers "may we sell this car" and returns only
 * three states. A fourth, "tell me which years to offer", is a different question
 * with a different failure mode: it must answer for a car we have never confirmed,
 * because the dropdown has to be populated BEFORE anything is confirmed. Folding it
 * into the existing handler would mean every keystroke in a dropdown runs the whole
 * exclusion-and-mapping lookup and logs a demand line for a car nobody asked about.
 *
 * IT ALSO CARRIES THE SEATING, per range
 *
 * Each range is `{ yearFrom, yearTo, seatRows }`, read off the floor pan that range is
 * mapped onto. It is here, on the route the Fit Finder already calls once per car,
 * because of a defect this fixed (2026-10-05): the row question was being asked
 * BEFORE anything had looked the car up, so `/api/fit-check` — the only place
 * `seatRows` existed — had not answered yet. Every customer was therefore offered
 * "3 Rows" on a car the owner had explicitly set to two rows, and picking it was
 * accepted and priced with the 3-row surcharge.
 *
 * Moving that answer onto a GET is deliberate. `/api/fit-check` logs a demand line for
 * every refusal (`fitment-engine` §5.5), so calling it early purely to learn a car's
 * seating would write a refusal for a car the customer had not finished choosing a year
 * for. This route is a GET that logs nothing, so asking it early costs nothing.
 *
 * It is per RANGE rather than per car because a car carries several ranges, and the
 * seating belongs to the floor pan each range is mapped onto — so changing the year in
 * the dropdown re-derives the answer with no second request.
 *
 * WHAT IT RETURNS WHEN NOTHING IS ON RECORD
 *
 * `ranges: []`. NOT a fallback list of 2000–2026. The caller falls back to that list
 * itself, and it is better for the fallback to live in one place — the component —
 * than to be served from an endpoint that looks like an answer. An endpoint that
 * returned a made-up span would be a place where a guess is indistinguishable from a
 * measurement.
 */

/** The same window the Fit Finder has always offered, used only as a client fallback. */
const FALLBACK_YEARS = { from: 2000, to: 2026 };

/**
 * `Layout.seatRows` as the three values the storefront knows, and `null` for anything
 * else — including a `null` column and anything a `psql` session wrote.
 *
 * The column is a free string, and this route's whole job is to be believed before the
 * fit check. A value it cannot read must arrive as an ABSENCE, so the client asks the
 * customer; passing an unreadable string through would put a seating nobody recorded in
 * front of a customer as though the owner had. `fitment-live.ts` casts the same column
 * for the same reason and with the same rule in reserve — an unreadable value there
 * lands in the default branch, which is also "ask".
 */
function readSeatRows(value: string | null): SeatRows | null {
  return value === "2" || value === "3" || value === "mixed" ? value : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const make = url.searchParams.get("make")?.trim() ?? "";
  const model = url.searchParams.get("model")?.trim() ?? "";

  if (make === "" || model === "") {
    return NextResponse.json(
      { ranges: [], fallback: FALLBACK_YEARS, reason: "Give a make and a model." },
      { status: 400 },
    );
  }

  try {
    // Matched the way `checkFitLive` matches, so the years offered and the years a
    // fit check accepts can never be drawn from two different name sets. `norm` is
    // imported rather than reimplemented for that reason.
    const { norm } = await import("@/data/fitment");
    const key = `${norm(make)}::${norm(model)}`;

    const rows = await prisma.vehicle.findMany({
      where: {
        make: { name: { equals: make, mode: "insensitive" } },
        // Only ranges that are mapped onto an ACTIVE floor pan — not a retired car,
        // and not a range whose mapping was removed with `removeRange`. Before this,
        // removing a mapping left the `Vehicle` row visible in the dropdown, so a
        // customer could still pick 2002 for a Corolla whose 2002 range had been withdrawn.
        mappings: { some: { layout: { active: true, status: { not: "retired" } } } },
      },
      select: {
        id: true,
        model: true,
        aliases: true,
        yearFrom: true,
        yearTo: true,
        make: { select: { name: true } },
        // The seating, from the floor pan this range is mapped onto. Filtered to the
        // ACTIVE ones for the same reason the `where` above is: a range kept in the
        // list by a live layout must not report the seating of a retired one.
        mappings: {
          where: { layout: { active: true, status: { not: "retired" } } },
          select: { layout: { select: { seatRows: true } } },
        },
      },
    });

    // `null` until a layout says otherwise. It is NOT `"mixed"` written here as a
    // convenience: `null` is the absence of an answer and travels as one, so the
    // client asks the customer rather than reading a guess as a measurement.
    const ranges: { yearFrom: number; yearTo: number; seatRows: SeatRows | null }[] = [];
    for (const row of rows) {
      const rowKey = `${norm(row.make.name)}::${norm(row.model)}`;
      const isMatch = rowKey === key || row.aliases.some((alias) => `${norm(row.make.name)}::${norm(alias)}` === key);
      if (!isMatch) continue;
      // A row with no recorded span contributes nothing: merging a null into a range
      // would invent a span nobody measured.
      if (row.yearFrom === null || row.yearTo === null) continue;
      const seatRows = readSeatRows(row.mappings[0]?.layout.seatRows ?? null);
      const existing = ranges.find(
        (range) => range.yearFrom === row.yearFrom && range.yearTo === row.yearTo,
      );
      if (!existing) {
        ranges.push({ yearFrom: row.yearFrom, yearTo: row.yearTo, seatRows });
      } else if (existing.seatRows === null && seatRows !== null) {
        // Two rows describing one span: a recorded seating beats an absent one, and
        // otherwise first-wins stands, as it did before seating rode along.
        existing.seatRows = seatRows;
      }
    }

    ranges.sort((a, b) => a.yearFrom - b.yearFrom);

    return NextResponse.json(
      { ranges, fallback: FALLBACK_YEARS },
      // NOT CACHED, and that is a change from the `max-age=300` this used to carry.
      //
      // A five-minute window was chosen for a list of year spans that change twice a
      // decade. The response now also carries the owner's seating answer, and the
      // defect this fixed was exactly "I set it in the admin and the shop still
      // offers three rows" — which a stale copy reproduces on its own. It is one small
      // indexed query per car picked, paid by the visitor who is already mid-flow.
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // A failure here must not take the year step down with it — the caller has its
    // own fallback list, so the honest answer is "no ranges" rather than a 500 that
    // the visitor sees as a broken site.
    return NextResponse.json({ ranges: [], fallback: FALLBACK_YEARS, reason: "lookup failed" });
  }
}