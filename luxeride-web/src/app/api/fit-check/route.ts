import { checkFit } from "@/data/fitment";
import {
  MAX_BODY_BYTES,
  type FitCheckRequest,
  type FitCheckResponse,
} from "@/lib/fitment-contract";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * `POST /api/fit-check` — the contract that must not change.
 *
 * A Route Handler, not a Server Action: the response is a machine-readable
 * three-state answer, and non-GET verbs are uncached by default so no `dynamic`
 * export is needed.
 *
 * THE ONE INVARIANT: every failure path resolves to UNKNOWN, never FITTED. A
 * missing field, an oversized body, malformed JSON, a thrown module assertion
 * or an unexpected exception all land in the same place. Getting this wrong
 * would put a fit guarantee on a car nobody measured, which is the exact defect
 * this milestone exists to remove.
 */

function respond(body: Omit<FitCheckResponse, "whatsappUrl" | "checkedAt">): Response {
  const car = `"${body.customerName ?? "your car"}"`;

  const message =
    body.state === "FITTED"
      ? `Hi! The fit finder says we make this for my car (ref ${body.internalCode}). What is the final price and delivery time?`
      : body.state === "NOT_STOCKED"
        ? `Hi! I checked the ${car} and it says we don't have a confirmed fit yet.\n${body.reason ?? ""}\nCould you let me know when it becomes available, or whether a custom order is possible?`
        : `Hi! I tried to check the fit for ${car} and got no clear answer.\n${body.reason ?? body.validationReason ?? ""}\nCould you check it for me?`;

  return Response.json(
    {
      ...body,
      whatsappUrl: whatsappLink(message),
      checkedAt: new Date().toISOString(),
    } satisfies FitCheckResponse,
    { status: 200 },
  );
}

/** The universal refusal. Used by every path that cannot prove a fit. */
function unknown(validationReason: string): Response {
  return respond({ state: "UNKNOWN", reason: validationReason, validationReason });
}

export async function POST(request: Request): Promise<Response> {
  // Reject an oversized body BEFORE reading it. Reading first would let a large
  // body consume memory in a process with no other bound on it.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return unknown("Request too large.");
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return unknown("Request too large.");
    raw = JSON.parse(text);
  } catch {
    return unknown("Could not read that request.");
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return unknown("Could not read that request.");
  }

  const body = raw as Partial<FitCheckRequest>;

  const make = typeof body.make === "string" ? body.make.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const year = typeof body.year === "number" ? body.year : Number.NaN;

  if (!make || !model) return unknown("Tell us your make and model.");
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return unknown("That does not look like a valid year.");
  }

  // The lookup itself is wrapped: a malformed internal state or a thrown
  // assertion must not become a 500 that a caller could read as "yes".
  try {
    const result = checkFit({ make, model, year });

    switch (result.state) {
      case "FITTED":
        return respond({
          state: "FITTED",
          internalCode: result.internalCode,
          customerName: result.customerName,
          leadTime: result.leadTime,
          // Every product the confirmed car can be quoted for
          // (`fit-finder` §2.7). The client uses this to tell a locked-product
          // MISS from a plain refusal — an advertised product that is not in
          // this list is a miss, and a miss must be stated rather than
          // silently substituted.
          variants: result.variants,
        });
      case "NOT_STOCKED":
        return respond({ state: "NOT_STOCKED", reason: result.reason });
      default:
        return respond({ state: "UNKNOWN", reason: result.reason });
    }
  } catch (error) {
    // Server-side cause, never sent to the client: a stack trace here would
    // describe the internal table to whoever triggered it.
    console.error("fit-check: lookup threw, resolving to UNKNOWN:", error);
    return unknown("We could not complete that check.");
  }
}