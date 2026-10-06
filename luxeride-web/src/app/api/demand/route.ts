import { logRefusal } from "@/lib/demand-log";

/**
 * `POST /api/demand` — records a refused fit check.
 *
 * A refusal is a sale, so this inserts a `DemandLog` row. It used to append a
 * line of NDJSON to a file outside the repository instead, on the grounds that
 * locked decision 2 requires the refusal path to work before any database
 * exists; the database exists now, and `/admin/demand` reads the table, so the
 * file only meant the refusal was invisible to the one reader it has. See
 * `src/lib/demand-log.ts` for the argument and for why nothing was lost.
 *
 * It never returns a 4xx the client would have to handle: a failed log write is
 * not the visitor's problem, and they are already being shown a WhatsApp link.
 * It always answers 202, and the client's only obligation is not to block on it.
 *
 * The `logged` field in that 202 says whether the row landed, rather than
 * asserting it. Nothing in the client reads it yet — it is here so a future
 * caller, or a human reading the network tab, sees the truth.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return Response.json({ logged: false }, { status: 202 });
    }

    const body = raw as Record<string, unknown>;
    const make = typeof body.make === "string" ? body.make.trim().slice(0, 80) : "";
    const model = typeof body.model === "string" ? body.model.trim().slice(0, 80) : "";
    const year = typeof body.year === "number" ? body.year : Number.NaN;
    const outcome = body.outcome === "UNKNOWN" ? "UNKNOWN" : "NOT_STOCKED";
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";
    const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 40) : undefined;

    // A malformed entry is dropped rather than written: a log full of blank
    // rows is harder to act on than a shorter log.
    if (!make || !model || !Number.isFinite(year)) {
      return Response.json({ logged: false }, { status: 202 });
    }

    // Awaited: `logRefusal` reads the confirmed-layout count from the database
    // (§6.10) and then inserts the row. Not awaiting it would put the write after
    // the response, which is the fire-and-forget loss the log's own header warns
    // about.
    const capture = await logRefusal({ make, model, year, outcome, reason, phone });

    return Response.json({ logged: capture.logged }, { status: 202 });
  } catch (error) {
    // A throw before the insert — a malformed body, or a database that is down.
    // Logged rather than swallowed, and still a 202: the visitor's next step is a
    // WhatsApp message, not an error they can do anything about.
    console.error("demand: could not record the refusal:", error);
    return Response.json({ logged: false }, { status: 202 });
  }
}