import { scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Admin authentication, with exactly one operator (`fitment-engine` §7).
 *
 * ONE OPERATOR, AND NOTHING ELSE
 *
 * Locked decision 1: the owner is the only person who edits fitment data, so there
 * are **no roles, no permissions, no permission matrix and no second editor seat**.
 * Requirement 14.1 asks for that to be recorded rather than implied, because the
 * usual way a one-user system grows a permission model is a later helper quietly
 * adding one. If roles are ever genuinely needed, that is a decision to take
 * deliberately, not a thing to discover in a diff.
 *
 * THE TWO CHECKS, AND WHY THERE ARE TWO
 *
 * - `src/proxy.ts` is the **optimistic** check. It runs before the whole `/admin`
 *   subtree and keeps a stranger out. The Next authentication guide is explicit
 *   that Proxy "should not be your only line of defense".
 * - `requireAdmin()` here is the **secure** check, and every mutating Server Action
 *   must call it as its first statement. The Server Actions guide states plainly
 *   that an action "is reachable to anyone who can send the same POST" — so a
 *   button that only renders for an admin is a UI convenience, not a boundary.
 *
 * WHY BASIC AUTH RATHER THAN A LOGIN PAGE
 *
 * `jose`, `iron-session` and `server-only` are all verified not installed, and this
 * project has a standing zero-new-dependency rule. A signed-cookie session would
 * mean a login page, a session module, a data-access layer, a logout route and a
 * secret — roughly five times the surface — for one user. Basic Auth costs about
 * sixty lines and `node:crypto` is built in. The cost is real and worth naming: the
 * browser caches the credentials until it closes, and the prompt is a browser
 * dialog rather than a page.
 *
 * NO PASSWORD IS STORED HERE, AND NONE IS STORED IN THE REPOSITORY. The environment
 * holds a `scrypt` hash; `scripts/hash-admin-password.mjs` produces one.
 */

/**
 * `scrypt$<saltHex>$<hashHex>`.
 *
 * The prefix is versioning, not decoration: it is what lets a future migration to
 * argon2 be a new prefix rather than a guess about what an old string was.
 */
const HASH_FORMAT = /^scrypt\$([0-9a-f]+)\$([0-9a-f]+)$/i;

/** scrypt's own defaults; stated so a change is deliberate rather than accidental. */
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

/** Every credential failure says exactly this, so nothing distinguishes a bad user from a bad password. */
export const AUTH_FAILED = "Invalid credentials.";

/**
 * Constant-time comparison of two strings of possibly different length.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself leak the
 * length — so both sides are hashed to a fixed width first. Comparing raw strings
 * with `===` leaks how many leading characters were right, which is enough to
 * recover a password one character at a time.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  const width = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(width);
  const paddedRight = Buffer.alloc(width);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  // Both comparisons always run; `&` rather than `&&` so neither short-circuits.
  const equal = timingSafeEqual(paddedLeft, paddedRight);
  return equal && left.length === right.length;
}

/**
 * Verify a `user`/`password` pair against the environment.
 *
 * Returns `false` for every failure — unset variables, a malformed hash, a wrong
 * user, a wrong password. It never throws and never explains, because an admin
 * endpoint that distinguishes "no such user" from "wrong password" tells an
 * attacker which half to work on.
 */
export function verifyAdminCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USER;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUser || !expectedHash) return false;

  // Tolerate a backslash that a loader left in place.
  //
  // `.env.local` must escape the dollars in this value as `\$`, because Next's env
  // loader does shell-style expansion and would otherwise read `scrypt$3055...` as
  // `scrypt` followed by an undefined variable — arriving here truncated to six
  // characters, with every login failing 401 and nothing saying why.
  //
  // Next unescapes `\$` back to `$`. Node's `--env-file` does **not** — it leaves
  // the backslash — so the same file yields two different strings depending on who
  // read it. Stripping a stray `\$` here means the value verifies under either
  // loader, which matters because the hashing script and this module must agree
  // about a credential nobody can afford to have silently mangled.
  const match = HASH_FORMAT.exec(expectedHash.replace(/\\\$/g, "$"));
  if (!match) return false;

  const [, saltHex, hashHex] = match;

  // User first only so a wrong user costs one comparison instead of a scrypt
  // derivation. It does not change what the caller learns, because the caller
  // learns nothing either way.
  if (!constantTimeEquals(user, expectedUser)) return false;

  let candidate: Buffer;
  try {
    candidate = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  } catch {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** Parse an `Authorization: Basic …` header into its pair, or `null` if it is not one. */
export function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }

  // Split on the FIRST colon only: a password may legitimately contain one.
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;

  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * The secure check. **Call this as the first statement of every mutating Server
 * Action and every admin route handler**, before reading the request body.
 *
 * It throws rather than returning a falsy value, so a caller cannot forget to
 * check the result — the mistake of writing `await requireAdmin()` and ignoring it
 * is impossible, and the mistake of not calling it at all is what the Proxy layer
 * is there to make harder.
 */
export function requireAdmin(request: Request): void {
  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (!credentials || !verifyAdminCredentials(credentials.user, credentials.password)) {
    throw new Error("Forbidden: admin credentials required.");
  }
}

/** True when both variables are present and the hash is well-formed — a config check, not an auth check. */
export function adminAuthConfigured(): boolean {
  // Normalised the same way `verifyAdminCredentials` normalises, so a config check
  // and an auth check can never disagree about whether the credential is usable.
  const hash = (process.env.ADMIN_PASSWORD_HASH ?? "").replace(/\\\$/g, "$");
  return Boolean(process.env.ADMIN_USER) && HASH_FORMAT.test(hash);
}
