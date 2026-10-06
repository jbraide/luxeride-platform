import { revalidatePath } from "next/cache";
import { type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { importCarsListGenerations } from "@/lib/cars-list-import";

/**
 * `POST /admin/api/fitment/import-generations` — reconcile `cars-list.md` into the
 * fitment tables (`fitment-engine` §8). Added so the job has one curl-able entry
 * point instead of being a script plus a copy of itself in the console.
 *
 *   POST /admin/api/fitment/import-generations              → apply
 *   POST /admin/api/fitment/import-generations?dryRun=1     → plan only, no writes
 *   GET  /admin/api/fitment/import-generations              → plan only, no writes
 *
 * WHY GET IS THE DRY RUN AND NOT A READ
 *
 * The useful "just look" verb here is the plan, not the current rows: the question
 * is "what would this change", and the file has already been read by the time you
 * could answer anything else. GET writes nothing, so it stays safe to repeat and
 * safe to leave in a shell history.
 *
 * WHY IT IS A ROUTE AND NOT A SERVER ACTION
 *
 * The console's mutations are Server Actions, and a Server Action is not callable
 * from curl without reproducing Next's `Next-Action` id and RSC wire format —
 * both of which change on every build. A JSON route is the one admin surface a
 * script can hold on to. It is NOT a second gateway: `requireAdmin()` is still the
 * first statement, exactly as it is in `actions.ts`, because this is reachable by
 * anyone who can send the same POST.
 *
 * `runtime = "nodejs"` is load-bearing. The handler reads `cars-list.md` off disk
 * and needs `node:fs`; on the edge runtime the import would fail at the read, and
 * it would fail as a 500 with no indication that the runtime was the reason.
 *
 * `dynamic = "force-dynamic"` for the same family of reason: a cached 200 from
 * this endpoint would be a report about a run that did not happen.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A refusal that names nothing about what is behind the door (§7.7). */
function forbidden(): Response {
  return Response.json(
    { error: "Forbidden: admin credentials required." },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

async function handle(request: NextRequest, apply: boolean): Promise<Response> {
  try {
    requireAdmin(request);
  } catch {
    return forbidden();
  }

  const dryRun = !apply || request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const report = await importCarsListGenerations({ dryRun });
    if (!dryRun) {
      // The console reads these tables directly, so a fresh import has to say so
      // or the operator's next page load shows the rows they just replaced.
      revalidatePath("/admin");
      revalidatePath("/admin/layouts");
      revalidatePath("/admin/vehicles");
    }
    return Response.json(report, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The import failed." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

/** Plan only. Nothing is written, so this is safe to repeat. */
export async function GET(request: NextRequest): Promise<Response> {
  return handle(request, false);
}

/** Apply, unless `?dryRun=1`. */
export async function POST(request: NextRequest): Promise<Response> {
  return handle(request, true);
}
