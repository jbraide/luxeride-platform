import { PrismaClient } from "@prisma/client";

/**
 * The one Prisma client in the app, and the guard that stops a misconfigured
 * deploy looking like a working one.
 *
 * **The guard is the point** (`commerce-backend` §2.4). A missing or still-
 * placeholder `DATABASE_URL` throws here, at first import, rather than surfacing
 * later as an empty product list or an order that silently did not save. A build
 * that cannot reach a database should fail at the door.
 *
 * **Why the client is cached on `globalThis`** (`commerce-backend` §4.1): Next's
 * dev server re-evaluates modules on every edit, and a fresh `PrismaClient` each
 * time opens a new connection pool until Postgres refuses connections. Caching on
 * `globalThis` survives the module reload. Sourcing note, carried from the spec:
 * the `prisma` and `@prisma/client` READMEs shipped in `node_modules` contain no
 * singleton guidance, and the Next 16 guides in `node_modules/next/dist/docs/`
 * contain nothing on Prisma or connection pooling — this is Prisma's published
 * Next.js pattern cited from knowledge, not from a file in this repository.
 *
 * **`import "server-only"` is deliberately absent.** It is not installed yet, so
 * the import would fail the build; `commerce-backend` §4.2 adds the dependency
 * and this line together, and milestone M7.1 checks that it happened.
 */

/** The literal left in `.env` before the database was provisioned. */
const PLACEHOLDER_URL = "postgresql://user:pass@localhost:5432/luxeride";

function assertConnectionString(): void {
  const url = process.env.DATABASE_URL;

  if (!url || url.trim() === "") {
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
}

// Unconditional, and deliberately before the `??` below. Written as an argument
// to the constructor it would be skipped on every evaluation after the first,
// because the cached global short-circuits the right-hand side — so the guard
// would silently stop guarding exactly when the dev server reloaded the module.
assertConnectionString();

const globalForPrisma = globalThis as unknown as { luxeridePrisma?: PrismaClient };

// No `datasources` override: `schema.prisma` already resolves `env("DATABASE_URL")`,
// and re-stating it here would be a second source of truth for the same value.
export const prisma = globalForPrisma.luxeridePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.luxeridePrisma = prisma;
