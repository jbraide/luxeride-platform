import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { liveLayoutCountLive } from "@/lib/fitment-live";

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
  /**
   * Layouts confirmed at the time — lets you see coverage growing.
   *
   * `-1` when the count could not be read (database unreachable). A sentinel
   * rather than `0`, because `0` is a real and meaningful value here — it is what
   * "we have confirmed nothing yet" looks like — and a failed read must not be
   * silently recorded as that fact.
   */
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
 * Append one refusal.
 *
 * **Async since `fitment-engine` §6.10**, and every caller awaits it. It used to be
 * synchronous because the visitor is about to be shown a WhatsApp link and a
 * fire-and-forget write would be lost if the process exits first — that reasoning
 * still holds, so the callers were changed to await rather than the guarantee being
 * dropped. The write itself is still `appendFileSync`.
 *
 * Never throws. Losing a demand-log line must not turn a refusal into a 500 —
 * a customer who cannot order is the problem; a missing log line is not. That now
 * covers a database failure too: `liveLayoutCountLive()` is guarded separately
 * below so a count that cannot be read costs the count and not the refusal.
 *
 * Server-only: `node:fs` is imported at the top level, so this must never be
 * reached from a Client Component. It is called from `src/app/api/demand` and,
 * since fitment-engine §5.5, from `src/app/api/fit-check` — the fit-check
 * handler is the caller that matters, because it is the one no browser can
 * skip.
 */
export async function logRefusal(
  entry: Omit<DemandEntry, "at" | "liveLayoutsAtThisTime">,
): Promise<void> {
  try {
    const path = DEFAULT_LOG;
    mkdirSync(dirname(path), { recursive: true });

    // Read from the DATABASE, not from `liveLayoutCount()` in `src/data/fitment.ts`.
    //
    // That function counts the compile-time `LIVE_LAYOUTS` table, which is empty
    // and permanent — so until §6.10 every refusal ever logged recorded
    // `liveLayoutsAtThisTime: 0`, and would have gone on recording 0 forever, even
    // after the owner confirmed the first car. The column exists so a growing
    // confirmed count can be read against demand (`fitment-engine` §13); pinning it
    // to 0 made that comparison meaningless rather than merely stale.
    let liveLayoutsAtThisTime: number;
    try {
      liveLayoutsAtThisTime = await liveLayoutCountLive();
    } catch (error) {
      // The refusal is the data; the count is context. A database hiccup must
      // cost the context, never the refusal — and must not be written down as a
      // confident 0.
      console.error("demand-log: could not read the confirmed-layout count:", error);
      liveLayoutsAtThisTime = -1;
    }

    const full: DemandEntry = {
      ...entry,
      at: new Date().toISOString(),
      liveLayoutsAtThisTime,
    };

    appendFileSync(path, `${JSON.stringify(full)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    console.error("demand-log: could not write the refusal:", error);
  }
}