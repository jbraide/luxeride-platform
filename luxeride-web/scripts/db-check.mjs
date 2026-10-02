#!/usr/bin/env node
/**
 * E4's exit gate, as one command.
 *
 *   npm run db:check
 *
 * Reads `DATABASE_URL` from `luxeride-web/.env.local`, refuses the placeholder,
 * and runs exactly the check the E-track specifies:
 *
 *   psql "postgresql://luxeride:…@localhost:5432/luxeride" -c "select 1"  ->  1
 *
 * It then reports the server version and the tables it can see, so "the database
 * is provisioned" is a fact rather than an inference from a green build.
 *
 * It also exists for the day you rotate the password: rotate it in `.env.local`
 * and in Postgres in the same sitting, or this is the command that tells you
 * which of the two you forgot. The connection string is never printed — it is a
 * credential.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(PROJECT_ROOT, ".env.local");
const PLACEHOLDER = "postgresql://user:pass@localhost:5432/luxeride";

function fail(title, detail) {
  console.error(`\ndb:check FAILED — ${title}\n`);
  if (detail) console.error(`${detail}\n`);
  process.exit(1);
}

if (!fs.existsSync(ENV_FILE)) {
  fail(
    "no .env.local",
    "Copy .env.example to .env.local and fill in DATABASE_URL. The E-track step E4\n" +
      "creates the role and database it points at."
  );
}

const line = fs
  .readFileSync(ENV_FILE, "utf8")
  .split("\n")
  .filter((l) => /^\s*DATABASE_URL\s*=/.test(l))
  .pop();

if (!line) fail("DATABASE_URL is not set in .env.local", "Add it, or copy .env.example to .env.local.");

const url = line
  .replace(/^\s*DATABASE_URL\s*=\s*/, "")
  .split("#")[0]
  .trim()
  .replace(/^"(.*)"$/, "$1")
  .replace(/^'(.*)'$/, "$1");

if (!url) fail("DATABASE_URL is empty in .env.local");
if (url === PLACEHOLDER) {
  fail(
    "DATABASE_URL is still the placeholder",
    "The literal `postgresql://user:pass@localhost:5432/luxeride` is the shape in the\n" +
      "committed .env, not a working connection. Put the real one in .env.local."
  );
}

/**
 * One psql invocation via argv.
 *
 * The connection string has to reach psql somewhere, and argv is the only place
 * it can go. That is a deliberate, bounded trade-off: this process lives for
 * milliseconds, it is a local check rather than a server, and `/proc/<pid>/cmdline`
 * on a Linux desktop is readable only by the same user and root. The alternative —
 * interpolating the URL into a shell string — would be worse, because it would put
 * a credential through shell parsing. Nothing here is logged, and the URL is never
 * printed on any path, including the failure paths.
 */
function query(sql) {
  try {
    return {
      ok: true,
      out: execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-d", url, "-tAc", sql], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
      }).trim(),
    };
  } catch (error) {
    return { ok: false, err: (error.stderr || error.message || "").toString().trim() };
  }
}

const probe = query("select 1");
if (!probe.ok) {
  const text = probe.err;
  let hint = "";
  if (/password authentication failed/i.test(text)) {
    hint =
      "The password in .env.local is not the password Postgres has for this role.\n" +
      "Either the role was created with a different one, or it does not exist yet.\n\n" +
      "  sudo -u postgres psql -c \"CREATE ROLE luxeride LOGIN PASSWORD '<yours>';\"\n" +
      "  sudo -u postgres createdb -O luxeride luxeride\n" +
      "  sudo -u postgres psql -c \"ALTER ROLE luxeride WITH PASSWORD '<yours>';\"\n\n" +
      "The ALTER is what you re-run after rotating the password here.";
  } else if (/database .* does not exist/i.test(text)) {
    hint = "The role works but the database does not:\n\n  sudo -u postgres createdb -O luxeride luxeride";
  } else if (/could not connect|Connection refused|No such file/i.test(text)) {
    hint = "Nothing is listening. Check with:\n\n  pg_isready -h localhost -p 5432\n  pg_lsclusters";
  }
  fail("could not connect", `${text}\n${hint ? "\n" + hint : ""}`);
}

if (probe.out !== "1") fail("`select 1` did not return 1", `got: ${JSON.stringify(probe.out)}`);

const version = query("show server_version");
const tables = query(
  "select count(*) from information_schema.tables where table_schema = 'public'"
);
const dbName = query("select current_database()");
const role = query("select current_user");

console.log("db:check OK");
console.log(`  connected as   ${role.out} to ${dbName.out}`);
console.log(`  server version ${version.out}`);
console.log(`  public tables  ${tables.out}${tables.out === "0" ? "  (nothing migrated yet — that is task 2.6)" : ""}`);
console.log("\nThe password in .env.local matches the one Postgres holds for this role.");
