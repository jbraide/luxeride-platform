import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { liveLayoutCount } from "@/data/fitment";

/**
 * The demand log.
 *
 * Locked decision 2 says a refusal is a sale, and its consequence is that this
 * has to work from day one — BEFORE any database exists. So it writes to a
 * newline-delimited JSON file outside the repository, which needs no service,
 * no migration and no credentials, and is readable with `cat`.
 *
 * WHY A FILE AND NOT THE DATABASE: M2 must not depend on E-track's Postgres,
 * and the plan is explicit that the database is not on the critical path to the
 * first ad. A file that a deploy wipes is worse than a table, which is why the
 * path is OUTSIDE the app directory and is called out as needing real durable
 * storage before real traffic arrives.
 *
 * It records REFUSALS ONLY. Nothing here asserts that a car is available, so
 * the log can never be read back as a claim that a fit was sold.
 */

export type DemandOutcome = "NOT_STOCKED" | "UNKNOWN";

export interface DemandEntry {
  at: string;
  make: string;
  model: string;
  year: number;
  outcome: DemandOutcome;
  reason: string;
  /** Present only when the visitor chose to leave a number. */
  phone?: string;
  /** Layouts confirmed at the time — lets you see coverage growing. */
  liveLayoutsAtThisTime: number;
}

const DEFAULT_LOG =
  process.env.LUXERIDE_DEMAND_LOG ?? "/tmp/luxeride-demand.ndjson";

/**
 * Append one refusal. Synchronous on purpose: the visitor is about to be shown
 * a WhatsApp link, and a fire-and-forget write would be lost if the process
 * exits first.
 *
 * Never throws. Losing a demand-log line must not turn a refusal into a 500 —
 * a customer who cannot order is the problem; a missing log line is not.
 *
 * Server-only: `node:fs` is imported at the top level, so this must never be
 * reached from a Client Component. It is called from `src/app/api/demand`.
 */
export function logRefusal(entry: Omit<DemandEntry, "at" | "liveLayoutsAtThisTime">): void {
  try {
    const path = DEFAULT_LOG;
    mkdirSync(dirname(path), { recursive: true });

    const full: DemandEntry = {
      ...entry,
      at: new Date().toISOString(),
      liveLayoutsAtThisTime: liveLayoutCount(),
    };

    appendFileSync(path, `${JSON.stringify(full)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    console.error("demand-log: could not write the refusal:", error);
  }
}