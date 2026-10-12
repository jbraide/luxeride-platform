/**
 * A tiny per-isolate read cache. Added 2026-10-12 for Error 1102.
 *
 * ── THE PROBLEM THIS SOLVES, MEASURED ────────────────────────────────────────
 *
 * The Worker was returning Cloudflare **Error 1102 "Worker exceeded resource
 * limits"** to real visitors — 79 of 4,436 requests in one 24h window, and only
 * under ad traffic. Cloudflare's own docs name the two causes, and the analytics
 * ruled one out: CPU time P50 was **44 ms** and P99 **835 ms**, nowhere near the
 * 30 s limit. So it was the other one — the **128 MB memory limit**, which is
 * *per isolate and shared across the requests that isolate is handling at once*.
 *
 * The reason a burst tipped it over is `loadLiveFitment()`: every `/api/fit-check`
 * was re-reading and RE-BUILDING the whole fitment graph — 231 layouts, 693
 * variants, 1,281 range prices, 413 mappings, 423 vehicles — into fresh objects,
 * once per request. One request is fine. Four concurrent ones on the same isolate,
 * on top of the Next.js + React + Prisma baseline, and the isolate is over budget;
 * Cloudflare then cancels the requests that arrive next.
 *
 * So the fix is not "make the query faster" — it is **stop materialising the same
 * immutable data N times in one isolate**. These reads are identical for every
 * visitor and change only when the owner edits the admin, so one copy per isolate
 * with a short TTL is both correct and dramatically cheaper.
 *
 * ── WHY A MODULE-SCOPE MAP AND NOT `unstable_cache` ──────────────────────────
 *
 * Next's `unstable_cache` serialises values through the incremental cache, which on
 * Workers needs an R2/KV binding to persist across isolates — and it would cost CPU
 * encoding and memory holding the serialised form. This reads are already the right
 * shape in memory, so a plain `Map` that survives for the isolate's lifetime is
 * exactly the lifetime we want: the memory pressure IS the isolate, so that is the
 * scope that has to share.
 *
 * ── WHY A TTL AND NOT INVALIDATION ───────────────────────────────────────────
 *
 * The admin already calls `revalidatePath`, but an isolate is one of many and a
 * module-level map cannot be reached from another isolate, so an invalidation call
 * would only clear the copy on whichever isolate happened to serve the admin
 * request. The TTL is the honest mechanism, and it is short: a confirmed car or an
 * edited price is visible within `TTL_*` seconds. `invalidate()` exists for tests and
 * for a future single-isolate setup, and is documented as best-effort.
 *
 * ── NO STALE-ON-ERROR, DELIBERATELY ──────────────────────────────────────────
 *
 * A failed load drops the entry and throws, the same as before this file existed. A
 * database outage should surface, not be masked by serving yesterday's catalogue —
 * that is the same reason `catalogue.ts` refuses a compile-time fallback.
 */

/** How long a cached value stays fresh, in milliseconds. */
export const TTL_CATALOGUE_MS = 60_000;
export const TTL_CATEGORIES_MS = 300_000;
export const TTL_FITMENT_MS = 60_000;

/** One cached value, or one in-flight load of it. */
type Entry = {
  /** The last good value. `undefined` is itself a cacheable answer ("not found"). */
  value: unknown;
  /** When `value` stops being fresh. `0` while a load is in flight. */
  expiresAt: number;
  /** A load already running, shared by every caller that arrives before it settles. */
  inflight: Promise<unknown> | null;
};

const store = new Map<string, Entry>();

/**
 * Return the cached value for `key`, or load and cache it.
 *
 * CONCURRENT CALLERS SHARE ONE LOAD. This is the whole point: ten simultaneous
 * `/api/fit-check` requests on one isolate trigger exactly one `loadLiveFitment()`
 * and hold exactly one copy of its result, instead of ten. That single-flight
 * behaviour is what removes the memory spike, more than the TTL does.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit) {
    // A load is already running: join it rather than starting a second one.
    if (hit.inflight) return hit.inflight as Promise<T>;
    if (hit.expiresAt > now) return Promise.resolve(hit.value as T);
  }

  const inflight = load().then(
    (value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs, inflight: null });
      return value;
    },
    (error) => {
      // Never cache a failure: the next caller retries rather than inheriting it.
      store.delete(key);
      throw error;
    },
  );

  // Keep any previous value around while the refresh is in flight, so a reader that
  // arrives mid-refresh still has something if the load throws.
  store.set(key, { value: hit?.value, expiresAt: 0, inflight });
  return inflight;
}

/** Drop one key, or every key when called with no argument. Best-effort: see above. */
export function invalidate(key?: string): void {
  if (key === undefined) store.clear();
  else store.delete(key);
}
