import { cache } from "react";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * The one Prisma client in the app, and the guard that stops a misconfigured
 * deploy looking like a working one.
 *
 * ── THE APP RUNS IN TWO RUNTIMES, AND THEY NEED DIFFERENT CLIENTS ────────────
 *
 * The storefront deploys to **Cloudflare Workers** (see `wrangler.jsonc`), and it
 * is built and developed under **Node**. Prisma does not behave the same in both,
 * so this module branches at call time rather than assuming one:
 *
 *   - **Workers** — Prisma's query engine does not run on workerd, so the client
 *     must be built with the `PrismaPg` driver adapter. And because a Worker may
 *     not perform I/O on a connection opened for a *different* request, each
 *     request gets its own client with `maxUses: 1`.
 *   - **Node** — the engine is present, and one pooled client per process is both
 *     correct and far cheaper. This matters concretely: `next build` prerenders
 *     ~28 pages that all read the catalogue through the root layout, and a
 *     per-request `maxUses: 1` client there opens a connection per page in
 *     parallel and Aiven answers `P2037 Too many database connections`.
 *
 * `isCloudflareWorkers()` below is what tells the two apart.
 *
 * ── WHY `prisma` IS THE EXPORT, AND IS A PROXY ───────────────────────────────
 *
 * Every call site does `import { prisma } from "@/lib/db"` and then
 * `prisma.<model>.<op>()`, and several do `prisma.$transaction([...])`, whose
 * array form requires every promise to come from **one** client. So the export
 * must behave exactly like a `PrismaClient` while resolving to the right client
 * for the current runtime (and request, on Workers). A Proxy does that: the
 * property access happens naturally when the query runs, it looks up the client
 * then, and every access within one request returns the same object — which is
 * precisely what the array-form transactions need.
 *
 * ── THE GUARD ────────────────────────────────────────────────────────────────
 *
 * Unchanged in intent (`commerce-backend` §2.4): a missing or still-placeholder
 * connection string throws, rather than surfacing later as an empty product list
 * or an order that silently did not save. It moved from module load to client
 * construction, because on Workers the connection string is only reachable
 * *inside* a request — the bindings do not exist at cold-start. It is still loud
 * and still early: it fires on the first query, not on a page that renders an
 * empty catalogue as though it were real.
 */

/** The literal left in `.env` before the database was provisioned. */
const PLACEHOLDER_URL = "postgresql://user:pass@localhost:5432/luxeride";

/** The binding shape when Hyperdrive is configured in `wrangler.jsonc`. */
type HyperdriveBinding = { connectionString?: string };

function assertUsable(raw: string | undefined): string {
  // Env values are routinely pasted with the surrounding quotes — `"postgres://…"` —
  // and Prisma's only complaint is "the URL must start with the protocol
  // `postgresql://`", which never mentions the quotes. Strip one matching pair and
  // surrounding whitespace first: a real connection string cannot start with a quote.
  let url = (raw ?? "").trim();
  if (url.length >= 2 && (url[0] === '"' || url[0] === "'") && url[url.length - 1] === url[0]) {
    url = url.slice(1, -1).trim();
  }

  if (url === "") {
    throw new Error(
      "DATABASE_URL is not set. Copy luxeride-web/.env.example to " +
        "luxeride-web/.env.local and fill it in — the E-track creates the role and " +
        "database it points at."
    );
  }

  if (url === PLACEHOLDER_URL) {
    throw new Error(
      "DATABASE_URL is still the placeholder from .env. The real connection string " +
        "belongs in luxeride-web/.env.local, which is never committed."
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      "DATABASE_URL must start with postgres:// or postgresql:// — it starts with " +
        `${JSON.stringify(url.slice(0, 16))}. Check the value for stray characters or quotes.`
    );
  }

  return url;
}

/**
 * Where the Workers connection string comes from, in priority order:
 *
 *   1. **Hyperdrive** (`env.HYPERDRIVE.connectionString`) when the binding is
 *      configured — the recommended path on Workers, and per-request by
 *      construction. It is commented out in `wrangler.jsonc` until a Hyperdrive
 *      config exists, so today this falls through.
 *   2. **`DATABASE_URL`** otherwise: the hosted Aiven instance. Keep the
 *      `?sslmode=require&connect_timeout=30` parameters — the README explains
 *      why each is load-bearing.
 *
 * No default and no fallback: an app that cannot say where its data lives must
 * fail, not quietly connect to `localhost`.
 */
function connectionString(): string {
  try {
    const { env } = getCloudflareContext();
    const hyperdrive = (env as unknown as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
    if (hyperdrive?.connectionString) return logTargetOnce(hyperdrive.connectionString, "Hyperdrive");
  } catch {
    // Not inside a Cloudflare request. On Workers this should not happen; if it
    // does, `DATABASE_URL` below is still the correct answer.
  }

  return logTargetOnce(
    assertReachableFromWorkers(assertUsable(process.env.DATABASE_URL)),
    "DATABASE_URL"
  );
}

/**
 * Print the host the Worker is about to dial, once per isolate, never the
 * credentials. The Cloudflare log shows the Prisma stack but not the address, so
 * this is the only way to tell from production whether a bad deploy is pointing
 * at `localhost` or at the real host.
 */
let loggedTarget = false;
function logTargetOnce(url: string, source: string): string {
  if (!loggedTarget) {
    loggedTarget = true;
    try {
      const { hostname, port } = new URL(url);
      console.log(`[luxeride/db] connecting to ${hostname}:${port || "5432"} (from ${source})`);
    } catch {
      console.log(`[luxeride/db] connecting via ${source} (URL not parseable)`);
    }
  }
  return url;
}

/**
 * Loopback and private hosts. Cloudflare refuses outbound TCP to all of them.
 *
 * https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#troubleshooting
 * — "proxy request failed, cannot connect to the specified address" means the
 * socket target was disallowed, and the examples given are Cloudflare IPs,
 * `localhost` and private network IPs.
 */
const UNREACHABLE_FROM_WORKERS =
  /^(localhost|\.+localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/**
 * Catch the one misconfiguration that reads as a network outage on Workers.
 *
 * A Build variable is not present at runtime, so a Worker deployed with only a
 * build-time `DATABASE_URL` falls back to whatever the repo's `.env` holds — the
 * `localhost` placeholder — and Cloudflare answers every request with
 * `cannot connect to the specified address` rather than anything that names the
 * real problem. This turns that into a message that says what to fix.
 */
function assertReachableFromWorkers(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Not a URL we can read; let `pg` report it rather than guessing here.
    return url;
  }

  if (UNREACHABLE_FROM_WORKERS.test(host)) {
    throw new Error(
      `DATABASE_URL points at "${host}", which a Cloudflare Worker cannot reach — ` +
        "Cloudflare blocks outbound TCP to loopback and private addresses. Set the value as a " +
        "RUNTIME secret on the Worker (Settings -> Variables and Secrets) using the public " +
        "database host; a Build variable does not exist at request time."
    );
  }

  return url;
}

/**
 * Restore libpq's reading of `sslmode` for the `pg` driver.
 *
 * The Prisma engine read `sslmode=require` the way libpq does — encrypt the
 * connection, but do not verify the certificate chain. `pg`'s parser
 * (`pg-connection-string` v2.9+) instead treats `require` as an alias for
 * `verify-full`, so on Workers it would reject Aiven's chain with
 * `P1011 ... self-signed certificate in certificate chain`.
 *
 * `uselibpqcompat=true` restores the previous behaviour. It is the remedy the `pg`
 * deprecation warning names, and it is a `pg-connection-string` option, not a
 * Postgres one, so it is stripped before the string reaches the server. A URL
 * that already asks for `verify-ca` / `verify-full` keeps that stricter behaviour,
 * because the flag follows libpq's own table for each mode.
 */
function withLibpqCompat(url: string): string {
  if (!/[?&]sslmode=/.test(url)) return url;
  if (/[?&]uselibpqcompat=/.test(url)) return url;
  return withParam(url, "uselibpqcompat", "true");
}

/** Appends `key=value` to a connection URL unless the key is already present. */
function withParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}

/**
 * `true` only inside the Cloudflare Workers runtime, never under Node. Workerd
 * reports itself as `navigator.userAgent === "Cloudflare-Workers"`; Node reports
 * `"Node.js/…"`. Checked at call time so the same build is correct in both.
 */
function isCloudflareWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/** The Workers client: driver adapter, one per request. */
function createWorkersClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: withLibpqCompat(connectionString()), maxUses: 1 });
  return new PrismaClient({ adapter });
}

/**
 * React's `cache` is scoped to the request in every server context this app uses
 * — Server Components, Server Actions and route handlers — which is exactly the
 * lifetime a Worker connection may share.
 */
const workersClientForRequest = cache(createWorkersClient);

/**
 * The Node client: the query engine, one per process, pooled.
 *
 * ── WHY IT LIVES ON `globalThis`, AND WHY THE POOL IS CAPPED IN DEV TOO ───────
 *
 * Prisma's default pool is `2 x CPUs + 1`. On a sixteen-core machine that is
 * THIRTY-THREE connections from a single client — and `next dev` re-evaluates this
 * module on every hot reload. With a module-level `let`, each reload built a new client
 * with a new pool while the previous one kept its sockets until the process exited, so a
 * working session walked into Aiven's connection ceiling:
 *
 *   FATAL: sorry, too many clients already
 *
 * `globalThis` survives the reload, so there is ONE client and ONE pool for the life of
 * the dev server. The cap below used to apply only during `next build`; it applies to dev
 * as well now, because dev is where the leak was, and a storefront with one operator never
 * needs thirty-three sockets.
 *
 * The build case stays at 1 for the reason it always did: several worker processes
 * prerender in parallel and Prisma's default pool per worker is what produced
 * `P2037 Too many database connections` against Aiven's slot limit.
 */
const globalForPrisma = globalThis as unknown as { __luxeridePrisma?: PrismaClient };

/** One process, one small pool: enough to render a page's queries, far below the ceiling. */
const NODE_CONNECTION_LIMIT = process.env.NEXT_PHASE === "phase-production-build" ? "1" : "5";

function resolveClient(): PrismaClient {
  if (isCloudflareWorkers()) return workersClientForRequest();

  const url = assertUsable(process.env.DATABASE_URL);
  const datasourceUrl = withParam(url, "connection_limit", NODE_CONNECTION_LIMIT);

  return (globalForPrisma.__luxeridePrisma ??= new PrismaClient({ datasourceUrl }));
}

/**
 * The app's Prisma client. A Proxy, not a client: see the header for why. Every
 * property access resolves against the current runtime's client — and methods are
 * bound to it, so `prisma.$transaction` and friends keep working.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolveClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
