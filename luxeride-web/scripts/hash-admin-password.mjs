#!/usr/bin/env node
/**
 * Produce the `ADMIN_PASSWORD_HASH` value (`fitment-engine` §7.4).
 *
 *   node scripts/hash-admin-password.mjs
 *   node scripts/hash-admin-password.mjs 'the password'      (non-interactive)
 *
 * Output is `scrypt$<saltHex>$<hashHex>`, which is exactly what
 * `src/lib/admin-auth.ts` parses.
 *
 * WHY A SCRIPT AND NOT A STORED SECRET
 *
 * No password and no hash is written into this file or anywhere in the repository.
 * The hash belongs in `.env.local`, which `.gitignore` covers and which is never
 * committed — the repository carries only the *shape* of the variable, in
 * `.env.example`.
 *
 * WHY scrypt AND NOT A PLAIN HASH
 *
 * scrypt is deliberately slow and memory-hard, so a stolen hash is expensive to
 * attack rather than a lookup. `jose`, `iron-session` and `server-only` are all
 * verified not installed and this project has a zero-new-dependency rule;
 * `node:crypto` is built in, so this costs nothing.
 *
 * The parameters match `SCRYPT_OPTIONS` in `src/lib/admin-auth.ts`. If they are
 * changed there, they must be changed here too — a hash is only verifiable with the
 * parameters it was made with, which is why the format carries a `scrypt$` prefix
 * for a future migration to say so explicitly.
 */

import { randomBytes, scryptSync } from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const SALT_BYTES = 16;

function hash(password) {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * The value as `.env.local` needs it, with the dollars ESCAPED.
 *
 * WHY BOTH BRANCHES BELOW NOW ESCAPE, AND WHY THIS IS A BUG FIX RATHER THAN A
 * COSMETIC ONE: Next's env loader expands `$name`, so an unescaped
 * `scrypt$3055...` arrives at `src/lib/admin-auth.ts` as **`scrypt`** — six
 * characters — and every login fails 401 with nothing in the log to explain it.
 * The interactive branch always escaped; the non-interactive branch printed the
 * raw form, so the fast path produced a value that silently could not work when
 * pasted where it belongs. That is exactly what happened on 2026-10-03: the hash
 * in `.env.local` was replaced from the non-interactive output, and the admin
 * console 401'd while the password was correct.
 *
 * `src/lib/admin-auth.ts` normalises a stray backslash before parsing, so the
 * escaped form is directly usable as the variable's value and this cannot break a
 * raw consumer. The escaping is emitted with the reason attached rather than left
 * for the reader to know.
 */
function envValue(password) {
  return hash(password).replace(/\$/g, "\\$");
}

const provided = process.argv[2];

if (provided) {
  if (provided.length < 12) {
    console.error("hash-admin-password: use at least 12 characters. This is the only credential on the console.");
    process.exit(1);
  }
  console.log(`ADMIN_PASSWORD_HASH="${envValue(provided)}"`);
  console.log("\nPaste that line into luxeride-web/.env.local. The \\$ is required: Next expands unescaped dollars in .env files, which would leave the hash as the six characters \"scrypt\".");
} else {
  // An interactive prompt with the echo suppressed, so the password does not land
  // in the shell's history or in scrollback.
  process.stdout.write("Admin password (not echoed): ");
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  let password = "";
  await new Promise((resolve) => {
    stdin.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\r" || char === "\n") {
          process.stdout.write("\n");
          resolve();
          return;
        }
        if (char === "\u0003") {
          // Ctrl-C
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
          continue;
        }
        password += char;
      }
    });
  });

  if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
  stdin.pause();

  if (password.length < 12) {
    console.error("hash-admin-password: use at least 12 characters. This is the only credential on the console.");
    process.exit(1);
  }

  console.log("\nAdd both lines to luxeride-web/.env.local:\n");
  console.log(`ADMIN_USER="luxeride"`);
  // The dollars MUST be escaped, and this script escapes them rather than leaving a
  // trap. Next's env loader expands `$name`, so an unescaped `scrypt$3055...`
  // arrives as `scrypt` — six characters — and every login fails 401 with no
  // explanation. Measured on both loaders; see the header of src/lib/admin-auth.ts.
  console.log(`ADMIN_PASSWORD_HASH="${envValue(password)}"`);
  console.log("\n(The \\$ above is required: Next expands unescaped dollars in .env files.)");
}
