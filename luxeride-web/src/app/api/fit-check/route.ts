import { checkFitLive } from "@/lib/fitment-live";
import { logRefusal, type DemandOutcome } from "@/lib/demand-log";
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

function respond(
  body: Omit<FitCheckResponse, "whatsappUrl" | "checkedAt">,
  /**
   * The car the visitor actually typed, e.g. `"Toyota Camry"`.
   *
   * Needed because `customerName` only exists on `FITTED`, so every refusal used
   * to build its WhatsApp link from a fallback and read *I checked the fit for
   * "your car"* — which contradicts `fitment-engine` §3.4, that a refusal names
   * the car the visitor typed. Not serialised into the response; it exists only
   * for this message.
   */
  carLabel?: string,
): Response {
  const car = `"${carLabel ?? body.customerName ?? "your car"}"`;

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

/**
 * The validation refusal, and the one UNKNOWN that must stay out of the demand
 * log (§5.2, §5.5).
 *
 * Everything that reaches this helper failed BEFORE an identifiable car existed
 * — no make, no model, an unusable year, a body we will not read. That is not a
 * visitor asking about a car, so it is not demand, and a line here would put
 * noise into the only dataset this company sources its next cars from.
 */
function unknown(validationReason: string): Response {
  return respond({ state: "UNKNOWN", reason: validationReason, validationReason });
}

/**
 * A refusal about a car we could name, so it is demand (locked decision 2) and
 * it is logged HERE, in the handler, before the response goes out (§5.5).
 *
 * WHY NOT IN THE CLIENT: `/api/fit-check` is called from places that have no
 * browser behind them — and the browser is the part that closes the tab, goes
 * offline or runs an ad blocker. §5.5 forbids exactly the old arrangement:
 * "from `/api/fit-check`, not from the client, so a closed tab or an ad blocker
 * cannot lose the refusal". The line only now appears for an API-only refusal.
 *
 * `/api/demand` is therefore NOT called here: firing it as well would write the
 * same refusal twice, and this log is ranked by volume to decide what to source
 * next, so a duplicate is a false signal rather than a harmless extra row.
 * `/api/demand` remains the route for refusals this handler never sees — the
 * locked-product miss in `FitFinder.tsx`, where the car IS confirmed and the
 * miss is a fact only the client can see.
 *
 * `logRefusal` never throws (§5.4), so this cannot turn a refusal into a 500.
 *
 * Async since §6.10: `logRefusal` reads the confirmed-layout count from the
 * database before it appends, and every caller awaits it so the row is written
 * before the response goes out.
 */
async function refuse(
  outcome: DemandOutcome,
  car: { make: string; model: string; year: number },
  reason: string,
): Promise<Response> {
  const capture = await logRefusal({ ...car, outcome, reason });
  // `demandLogged` makes the capture observable from the response (§5.6), which
  // is the assertion that would have caught §5.5 going undone. The car is passed
  // through so the refusal names it (§3.4) rather than saying "your car".
  //
  // It reports what `logRefusal` actually did. It used to be hard-coded `true`
  // here, which meant the field asserted a capture nothing had checked — the one
  // thing a "did we save the sale?" signal must never do. A false here means the
  // row is missing and the server log says why.
  return respond({ state: outcome, reason, demandLogged: capture.logged }, `${car.make} ${car.model}`);
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

  // The lookup itself is wrapped: a malformed internal state, an unreachable
  // database or a thrown assertion must not become a 500 that a caller could read
  // as "yes". Since §6.10 the lookup reads Postgres, so this guard now covers a
  // database outage as well — and it resolves to a refusal, which is the direction
  // that cannot put a fit guarantee on a car nobody measured.
  try {
    const result = await checkFitLive({ make, model, year });

    switch (result.state) {
      case "FITTED":
        return respond({
          state: "FITTED",
          internalCode: result.internalCode,
          customerName: result.customerName,
          leadTime: result.leadTime,
          seatRows: result.seatRows,
          matTypes: result.matTypes,
          // Every product the confirmed car can be quoted for
          // (`fit-finder` §2.7). The client uses this to tell a locked-product
          // MISS from a plain refusal — an advertised product that is not in
          // this list is a miss, and a miss must be stated rather than
          // silently substituted.
          variants: result.variants,
        });
      case "NOT_STOCKED":
        return await refuse("NOT_STOCKED", { make, model, year }, result.reason);
      default:
        return await refuse("UNKNOWN", { make, model, year }, result.reason);
    }
  } catch (error) {
    // Server-side cause, never sent to the client: a stack trace here would
    // describe the internal table to whoever triggered it.
    console.error("fit-check: lookup threw, resolving to UNKNOWN:", error);
    // Logged, unlike the validation refusals above: the car WAS identified and
    // the year was valid — the engine failed, not the request. §5.5 covers
    // "every ... UNKNOWN outcome", and a line naming the car that made the
    // lookup throw is the defect report this engine's refusals exist to produce.
    return await refuse("UNKNOWN", { make, model, year }, "We could not complete that check.");
  }
}