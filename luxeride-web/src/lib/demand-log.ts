import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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
 * first ad. A file that a deploy wipes is worse than a table, so the path is
 * OUTSIDE the repository — and durable, which `/tmp` was not. This is still
 * weaker than a table and needs one before real traffic: nothing prunes it, and
 * nothing rotates it.
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
  process.env.LUXERIDE_DEMAND_LOG ??
  // NOT /tmp. This default was `/tmp/luxeride-demand.ndjson`, and on this machine
  // `findmnt /tmp` reports **tmpfs** — so every refusal captured would have been
  // destroyed by the next reboot. That is the data locked decision 2 turns into a
  // sourcing decision, and the M2 launch metric, so the default is now the same
  // durable per-user state directory the E5 backup log uses.
  //
  // `LUXERIDE_DEMAND_LOG` still overrides it, which is what a hosted deploy needs:
  // $HOME is not guaranteed writable in a container, and this file must never be
  // the reason a deploy fails.
  join(homedir(), ".local", "state", "luxeride", "demand.ndjson");

/**
 * Append one refusal. Synchronous on purpose: the visitor is about to be shown
 * a WhatsApp link, and a fire-and-forget write would be lost if the process
 * exits first.
 *
 * Never throws. Losing a demand-log line must not turn a refusal into a 500 —
 * a customer who cannot order is the problem; a missing log line is not.
 *
 * Server-only: `node:fs` is imported at the top level, so this must never be
 * reached from a Client Component. It is called from `src/app/api/demand` and,
 * since fitment-engine §5.5, from `src/app/api/fit-check` — the fit-check
 * handler is the caller that matters, because it is the one no browser can
 * skip.
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