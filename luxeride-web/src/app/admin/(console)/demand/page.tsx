import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { prisma } from "@/lib/db";

/**
 * `/admin/demand` — refusals ranked by volume (`fitment-engine` §8.7, analytics in
 * §13.1).
 *
 * RANKED BY WHAT A CUSTOMER ASKED FOR AND WAS REFUSED, WHICH IS A SOURCING SIGNAL
 *
 * Nothing in `DemandLog` asserts that a car is available — it records refusals
 * only, and a `FITTED` is an order, which belongs in `Order`. So the most-
 * requested unstocked model at the top of this table is the next floor pan worth
 * confirming, and nothing on this screen can ever be read back as a claim that a
 * fit was sold.
 *
 * WHY THE EMPTY STATE IS THE IMPORTANT PART OF THIS SCREEN
 *
 * `DemandLog` is EMPTY today, and it will stay empty until something writes to it.
 * The live writer is still `src/lib/demand-log.ts`, which appends NDJSON to a file
 * outside the repository — deliberately, because locked decision 2 says the refusal
 * path must work before a database exists. So a bare empty table here would be a
 * lie by omission: it would read as "nobody has been refused" when the truth is
 * "every refusal is in a file this page can point at".
 *
 * The path below is resolved the same way `src/lib/demand-log.ts` resolves it, and
 * the line count is read live. THAT RESOLUTION IS DUPLICATED, NOT SHARED, because
 * this workstream owns `src/app/admin/**` and `src/lib/demand-log.ts` is outside
 * it. The duplication is deliberately loud: if the two ever disagree, this page
 * says the file is missing or empty rather than quietly showing a wrong number.
 * Exporting `demandLogPath()` from `src/lib/demand-log.ts` would remove the copy and
 * is the right fix — recorded as a change needed in another workstream's file, not
 * made here.
 */

/**
 * NEVER PRERENDER THIS PAGE, AND HERE THE STALENESS WOULD BE DATA LOSS RATHER THAN
 * A NUMBER THAT LOOKS WRONG.
 *
 * This screen reads a file at render time with `readFileSync`. That is not a
 * dynamic API as far as Next is concerned, so without this export `next build`
 * reports `/admin/demand` as `○ (Static)` — and the whole screen becomes the file's
 * contents as of BUILD time. Every refusal captured after a deploy would be absent
 * from the ranked table, and it would keep looking plausible while it happened:
 * locked decision 2 makes refusals the only sourcing signal this business has, so a
 * frozen view of them is the most expensive kind of wrong number in the console.
 *
 * Measured, not assumed: found by running a production build and reading the route
 * table, and re-checked after this line was added.
 */
export const dynamic = "force-dynamic";

/** Mirrors `DEFAULT_LOG` in `src/lib/demand-log.ts`. Keep the two in step. */
function demandLogPath(): string {
  return (
    process.env.LUXERIDE_DEMAND_LOG ??
    join(homedir(), ".local", "state", "luxeride", "demand.ndjson")
  );
}

type FileState =
  | { readable: true; path: string; lines: number }
  | { readable: false; path: string; reason: string };

/**
 * Read the line count, never the contents.
 *
 * A refusal row can carry a phone number the visitor chose to leave, and this
 * screen has no reason to show one; the count is the only thing here that answers
 * "where is the data", and it is the only thing read.
 */
function inspectLog(): FileState {
  const path = demandLogPath();
  try {
    const contents = readFileSync(path, "utf8");
    const lines = contents.split("\n").filter((line) => line.trim() !== "").length;
    return { readable: true, path, lines };
  } catch (error) {
    return {
      readable: false,
      path,
      reason: error instanceof Error ? error.message : "the file could not be read",
    };
  }
}

/** Grouped by make + model + year, as §8.7 asks, newest first inside each group. */
interface Group {
  make: string;
  model: string;
  year: number;
  count: number;
  latest: Date;
  outcomes: { outcome: string; count: number }[];
  reason: string;
}

export default async function DemandPage() {
  const rows = await prisma.demandLog.findMany({
    select: {
      make: true,
      model: true,
      year: true,
      outcome: true,
      reason: true,
      phone: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.make}::${row.model}::${row.year}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        make: row.make,
        model: row.model,
        year: row.year,
        count: 1,
        latest: row.createdAt,
        outcomes: [{ outcome: row.outcome, count: 1 }],
        // The server's own refusal sentence, stored verbatim so the log cannot
        // drift from the copy the customer actually read.
        reason: row.reason,
      });
      continue;
    }
    existing.count += 1;
    if (row.createdAt > existing.latest) existing.latest = row.createdAt;
    const outcome = existing.outcomes.find((entry) => entry.outcome === row.outcome);
    if (outcome) outcome.count += 1;
    else existing.outcomes.push({ outcome: row.outcome, count: 1 });
  }

  const ranked = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.latest.getTime() - a.latest.getTime(),
  );

  const withPhone = rows.filter((row) => row.phone !== null).length;
  const log = inspectLog();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Demand</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
          {rows.length} refusals logged · {ranked.length} distinct
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Refusals only. Nothing here asserts that a car is available, so this table can never be read
        back as a claim that a fit was sold. Ranked by volume: the top row is the next floor pan
        worth checking.
      </p>

      {rows.length === 0 ? (
        <section className="mt-6 rounded-xl border border-line bg-panel/60 px-5 py-5">
          <h3 className="font-display text-base font-semibold text-gold">
            The table is empty, and that is not the same as &quot;nobody has been refused&quot;
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            Nothing has written a row to <code className="font-mono text-gold-dim">DemandLog</code> yet.
            The live refusal writer is still{" "}
            <code className="font-mono text-gold-dim">src/lib/demand-log.ts</code>, which appends one
            line of NDJSON to a file outside the repository — deliberately, because locked decision 2
            says the refusal path has to work before a database exists and a file needs no migration
            and no credentials.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            So the refusals are real and they are somewhere else:
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-gold">
            <li>
              <span className="text-muted">path&nbsp;&nbsp;</span>
              {log.path}
            </li>
            <li>
              <span className="text-muted">lines&nbsp;</span>
              {log.readable ? log.lines : <span className="text-muted">unreadable — {log.reason}</span>}
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The path comes from <code className="font-mono text-gold-dim">LUXERIDE_DEMAND_LOG</code> if
            that variable is set, and otherwise from the per-user state directory. To read it:{" "}
            <code className="font-mono text-gold-dim">tail -n 50 &quot;{log.path}&quot;</code>. This
            screen deliberately counts the lines and never shows them: a row can carry a phone number
            the visitor chose to leave.
            <br />
            <br />
            Moving the writer onto this table is a change to{" "}
            <code className="font-mono text-gold-dim">src/app/api/fit-check/route.ts</code>, which
            belongs to another workstream. Until it lands, the ranking above stays empty by design.
          </p>
        </section>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-widest text-gold-dim">
              <th className="py-2 pr-4 font-normal">#</th>
              <th className="py-2 pr-4 font-normal">Car</th>
              <th className="py-2 pr-4 font-normal">Refusals</th>
              <th className="py-2 pr-4 font-normal">Outcomes</th>
              <th className="py-2 font-normal">Latest</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((group, index) => (
              <tr key={`${group.make}-${group.model}-${group.year}`} className="border-t border-line align-top">
                <td className="py-2 pr-4 font-mono text-gold-dim">{index + 1}</td>
                <td className="py-2 pr-4">
                  {group.make} {group.model}
                  <span className="block font-mono text-[11px] text-gold-dim">{group.year}</span>
                </td>
                <td className="py-2 pr-4 font-mono text-gold">{group.count}</td>
                <td className="py-2 pr-4 font-mono text-[11px] uppercase text-muted">
                  {group.outcomes
                    .map((outcome) => `${outcome.outcome} x${outcome.count}`)
                    .join(", ")}
                </td>
                <td className="py-2 font-mono text-[11px] text-muted">
                  {group.latest.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <p className="mt-6 text-xs text-muted">
          {withPhone} of {rows.length} refusals carry a number the visitor chose to leave.{" "}
          <code className="font-mono text-gold-dim">/admin/demand</code> does not show them; the
          WhatsApp inbox is where those conversations happen.
        </p>
      )}
    </div>
  );
}