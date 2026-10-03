#!/usr/bin/env node
/**
 * The Prisma CLI, with `.env.local` loaded.
 *
 * WHY THIS EXISTS
 *
 * The Prisma CLI reads `.env` and **not** `.env.local` — that layering is a
 * Next.js convention, not a Prisma one. `.env` in this repository deliberately
 * holds only the commented placeholder (it is the committed record of which
 * variables exist), so `npx prisma migrate dev` fails with:
 *
 *   Error code: P1012
 *   error: Environment variable not found: DATABASE_URL.
 *
 * which reads like a broken schema when the real problem is that the CLI cannot
 * see the connection string.
 *
 * The fix uses Node's own `--env-file` rather than a dependency: the npm scripts
 * invoke this file as
 *
 *   node --env-file=.env.local scripts/prisma.mjs <prisma args>
 *
 * so the parent process carries the variables and the child CLI inherits them.
 * No `dotenv`, declared or transitive — relying on a package that only happens to
 * be present would break the day it stops being a transitive dependency.
 *
 * Everything after this file's name is passed straight through, so
 * `npm run db:migrate -- --name foo` behaves exactly like the real CLI.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (!process.env.DATABASE_URL) {
  console.error(
    "prisma: DATABASE_URL is not set. This wrapper expects to be run as\n" +
      "  node --env-file=.env.local scripts/prisma.mjs <args>\n" +
      "which is what the db:* scripts in package.json do.",
  );
  process.exit(1);
}

/** The CLI entry, resolved rather than hardcoded so a Prisma upgrade cannot break the path. */
const cli = require.resolve("prisma/build/index.js");

try {
  execFileSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
} catch (error) {
  // execFileSync throws on a non-zero exit. The child already printed its own
  // message, so propagate the status instead of adding noise.
  process.exit(typeof error.status === "number" ? error.status : 1);
}
