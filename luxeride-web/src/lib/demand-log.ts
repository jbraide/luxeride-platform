import { prisma } from "@/lib/db";
import { liveLayoutCountLive } from "@/lib/fitment-live";

/**
 * The demand log.
 *
 * Locked decision 2 says a refusal is a sale. Until `fitment-engine` §6.13 this
 * module appended one line of NDJSON to a file outside the repository, because
 * locked decision 2 also says the refusal path has to work **before a database
 * exists** — and the database did not. It now inserts a row into `DemandLog`.
 *
 * WHY THE FILE WENT, STATED RATHER THAN ASSUMED
 *
 * Two reasons, and the second is the one that matters:
 *
 * 1. The table is what `/admin/demand` reads. The screen was parsing a file for
 *    one half of itself and finding an empty `DemandLog` for the other, so the
 *    ranking this module exists to produce was invisible to the only reader it
 *    has. `fitment-engine` §8.7 recorded the same conclusion.
 * 2. **The file's reason for existing had expired.** "Must work before a
 *    database exists" bought independence from a *migration*. Since §6.10 the
 *    refusal path already needs Postgres: `checkFitLive()` reads `Layout` and
 *    `Mapping` before it can decide anything, and a database that is unreachable
 *    resolves to `UNKNOWN` — which is itself a refusal this module is asked to
 *    record. So the file no longer made the refusal path survive a database
 *    outage; it only made it survive a schema change. Against that it cost a
 *    runtime-computed filesystem path, which is the one thing in this console
 *    Turbopack warns about (`readFileSync` with a computed path forces whole-
 *    project file tracing), plus a `$HOME`-is-not-writable-in-a-container
 *    dependency on the deploy.
 *
 * WHAT WAS NOT LOST: the file was empty. `~/.local/state/luxeride/` held no
 * `demand.ndjson` when this changed, because nothing had been refused through a
 * real visitor yet, so there was no history to migrate. Had there been, the
 * honest move would have been to import it rather than delete the path.
 *
 * It records REFUSALS ONLY. Nothing here asserts that a car is available, so
 * the log can never be read back as a claim that a fit was sold.
 */

export type DemandOutcome = "NOT_STOCKED" | "UNKNOWN";

export interface DemandEntry {
  make: string;
  model: string;
  year: number;
  outcome: DemandOutcome;
  reason: string;
  /** Present only when the visitor chose to leave a number. */
  phone?: string;
}

/**
 * What the write actually did, so a caller can report it honestly.
 *
 * `demandLogged` in the `/api/fit-check` response used to be hard-coded `true`
 * at the call site, which meant it asserted a capture that nothing had checked.
 * It now reports this value, so a failed insert says so instead of claiming a
 * sale signal was saved.
 */
export interface DemandCapture {
  /** True when the row is in `DemandLog`. */
  logged: boolean;
  /** Why not, when `logged` is false. For the server log, never the response. */
  problem?: string;
}

/**
 * Record one refusal.
 *
 * Never throws. Losing a demand-log row must not turn a refusal into a 500 — a
 * customer who cannot order is the problem; a missing log row is not. Both
 * failure paths below `console.error` so a silent gap is at least a loud one in
 * the server log.
 *
 * Async, and every caller awaits it: the visitor is about to be shown a WhatsApp
 * link, and a fire-and-forget write would be lost if the process exits first.
 *
 * Server-only: this reaches Postgres, so it must never be imported from a Client
 * Component. It is called from `src/app/api/fit-check` (the caller that matters,
 * because it is the one no browser can skip) and from `src/app/api/demand`.
 */
export async function logRefusal(entry: DemandEntry): Promise<DemandCapture> {
  // The count is context; the refusal is the data. A failure here must cost the
  // context and never the refusal — and must not be written down as a confident
  // `0`, which is a real value here ("we have confirmed nothing yet").
  let liveLayoutsAtThisTime: number;
  try {
    liveLayoutsAtThisTime = await liveLayoutCountLive();
  } catch (error) {
    console.error("demand-log: could not read the confirmed-layout count:", error);
    liveLayoutsAtThisTime = -1;
  }

  try {
    await prisma.demandLog.create({
      data: {
        make: entry.make,
        model: entry.model,
        year: entry.year,
        outcome: entry.outcome,
        // The server's own refusal sentence, verbatim, so the log cannot drift
        // from the copy the customer actually read.
        reason: entry.reason,
        phone: entry.phone ?? null,
        liveLayoutsAtThisTime,
      },
      // `createdAt` is the column's own default, so the row's timestamp is the
      // database's clock rather than this process's — which is the clock the
      // 7/30-day window in §13.2 filters on.
    });
    return { logged: true };
  } catch (error) {
    const problem = error instanceof Error ? error.message : "the insert failed";
    console.error("demand-log: could not record the refusal:", error);
    return { logged: false, problem };
  }
}