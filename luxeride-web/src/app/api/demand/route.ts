import { logRefusal } from "@/lib/demand-log";

/**
 * `POST /api/demand` — records a refused fit check.
 *
 * A refusal is a sale, and capturing it must work before any database exists,
 * so this writes an NDJSON line to a file outside the repository rather than
 * inserting a row. Locked decision 2's consequence.
 *
 * It never returns a 4xx the client would have to handle: a failed log write is
 * not the visitor's problem, and they are already being shown a WhatsApp link.
 * It always answers 202, and the client's only obligation is not to block on it.
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

    logRefusal({ make, model, year, outcome, reason, phone });
  } catch (error) {
    console.error("demand: could not record the refusal:", error);
  }

  return Response.json({ logged: true }, { status: 202 });
}