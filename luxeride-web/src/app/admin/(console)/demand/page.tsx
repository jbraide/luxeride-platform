import { prisma } from "@/lib/db";
import PageHeader from "@/components/admin/PageHeader";
import EmptyState from "@/components/admin/EmptyState";
import { NUM, TABLE, TABLE_HEAD, TABLE_HEAD_CELL, TABLE_ROW } from "@/components/admin/ui";

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
 * ONE SOURCE NOW, AND IT IS THE AUTHORITATIVE ONE
 *
 * This screen used to read two: a `readFileSync` of the NDJSON file that
 * `src/lib/demand-log.ts` used to append to, plus `prisma.demandLog.findMany` —
 * which always came back empty, so the ranking was parsed out of a file while the
 * table beside it showed nothing. The writer now inserts a row
 * (`src/lib/demand-log.ts`), so the file, the duplicated path resolution below it
 * and the `LUXERIDE_DEMAND_LOG` override are all gone.
 *
 * That also removes the only warning the production build emits: a
 * `readFileSync` on a runtime-computed path forces Turbopack to trace the whole
 * project as server code, and the warning said so in as many words. The
 * `$HOME`-is-not-writable-in-a-container dependency went with it. Neither was
 * worth an `outputFileTracingExcludes` entry in a shared `next.config.ts`.
 */

/**
 * NEVER PRERENDER THIS PAGE.
 *
 * It read a file at render time when it was written, which is not a dynamic API
 * as far as Next is concerned, so `next build` reported `/admin/demand` as
 * `○ (Static)` and the screen became the file's contents as of BUILD time. It
 * reads Postgres now, which Next does treat as dynamic — but the staleness this
 * export prevents is data loss rather than a number that merely looks wrong:
 * locked decision 2 makes refusals the only sourcing signal this business has,
 * and a frozen ranking of them is the most expensive kind of wrong number in the
 * console. The export stays for that reason, not because the query needs it.
 *
 * Measured, not assumed: found by running a production build and reading the
 * route table, and re-checked after this line was added.
 */
export const dynamic = "force-dynamic";

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

  return (
    <div>
      <PageHeader
        title="Demand"
        meta={
          <>
            Refusals only. Nothing here asserts that a car is available, so this table can never be read
            back as a claim that a fit was sold. Ranked by volume: the top row is the next floor pan worth
            checking. {rows.length} refusals logged · {ranked.length} distinct.
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState className="mt-6">
          <span className="block font-display text-base font-semibold text-accent">
            No refusals logged yet
          </span>
          <span className="mt-2 block text-sm leading-relaxed text-fg/80">
            This table is now the writer&apos;s own.{" "}
            <code className="font-mono text-accent-dim">src/lib/demand-log.ts</code> inserts a{" "}
            <code className="font-mono text-accent-dim">DemandLog</code> row for every refusal from{" "}
            <code className="font-mono text-accent-dim">/api/fit-check</code> — the handler that runs
            whether or not a browser is behind it — and from{" "}
            <code className="font-mono text-accent-dim">/api/demand</code> for the locked-product miss
            the client alone can see. Nothing is written anywhere else.
          </span>
          <span className="mt-3 block text-sm leading-relaxed text-fg/80">
            To fill it: search any car on the Fit Finder that has no confirmed layout, then reload this
            page. Reloading matters — this screen reads the table on the server and never refetches on
            its own.
          </span>
          <span className="mt-3 block text-xs leading-relaxed text-fg-muted">
            It was an NDJSON file once, outside the repository, read by this page with{" "}
            <code className="font-mono text-accent-dim">readFileSync</code> while the table beside it
            stayed empty. The file is gone: it existed so refusals would survive before the database did,
            and since §6.10 the lookup itself needs Postgres — a refusal cannot be recorded without it.
            No refusals were lost in the move; there were none to lose.
          </span>
        </EmptyState>
      ) : (
        <table className={`mt-6 ${TABLE}`}>
          <thead>
            <tr className={TABLE_HEAD}>
              <th className={`${TABLE_HEAD_CELL} ${NUM}`}>#</th>
              <th className={TABLE_HEAD_CELL}>Car</th>
              <th className={`${TABLE_HEAD_CELL} ${NUM}`}>Refusals</th>
              <th className={TABLE_HEAD_CELL}>Outcomes</th>
              <th className={TABLE_HEAD_CELL}>Latest</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((group, index) => (
              <tr key={`${group.make}-${group.model}-${group.year}`} className={TABLE_ROW}>
                <td className={`py-2 pr-4 font-mono text-accent-dim ${NUM}`}>{index + 1}</td>
                <td className="py-2 pr-4">
                  {group.make} {group.model}
                  <span className="block font-mono text-[11px] text-accent-dim">{group.year}</span>
                </td>
                <td className={`py-2 pr-4 font-mono text-accent ${NUM}`}>{group.count}</td>
                <td className="py-2 pr-4 font-mono text-[11px] uppercase text-fg-muted">
                  {group.outcomes
                    .map((outcome) => `${outcome.outcome} x${outcome.count}`)
                    .join(", ")}
                </td>
                <td className="py-2 font-mono text-[11px] text-fg-muted">
                  {group.latest.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <p className="mt-6 text-xs text-fg-muted">
          {withPhone} of {rows.length} refusals carry a number the visitor chose to leave.{" "}
          <code className="font-mono text-accent-dim">/admin/demand</code> does not show them; the
          WhatsApp inbox is where those conversations happen.
        </p>
      )}
    </div>
  );
}