import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The admin session: one signed cookie, no session table, no new dependency.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHAT IT REVERSES
 *
 * M9.2 chose HTTP Basic Auth and recorded why: `jose`, `iron-session` and
 * `server-only` were all verified not installed, the project has a standing
 * zero-new-dependency rule, and "a signed-cookie session would mean a login
 * page, a session module, a data-access layer, a logout route and a secret —
 * roughly five times the surface — for one user." Basic Auth costs about sixty
 * lines and `node:crypto` is built in.
 *
 * That reasoning was sound and the cost was named honestly. What it did not
 * weigh was the one thing a browser does with Basic Auth that no amount of
 * correct server code can fix: it is a *dialog the browser owns*, and there is
 * no page behind it. On this machine it never appeared — a dismissed or
 * wrong-credential prompt renders the same plain-text `401` as a working gate,
 * so "Authentication required." was indistinguishable from an unbuilt console.
 * A login page makes the gate visible and recoverable, which is worth more here
 * than the surface it costs.
 *
 * LOCKED DECISION 1 IS UNCHANGED: still exactly one operator, still no roles,
 * no permission matrix and no second seat. Only the *mechanism* changed. The
 * session records WHO was authenticated, not WHAT they may do.
 *
 * WHY A SIGNED COOKIE AND NOT A SESSION ROW
 *
 * A row would mean a table, a create-on-login, a delete-on-logout, an expiry
 * sweep and a cleanup path for a session that outlives its user. A stateless
 * HMAC means the cookie *is* the proof: nothing to store, nothing to expire
 * server-side, nothing to garbage-collect, and no query on any admin request.
 * The trade is explicit — **a token cannot be revoked before it expires**. That
 * is acceptable here and only because of two facts: the session is short (12
 * hours), and rotating the password invalidates every outstanding cookie
 * immediately (see `signingKey` below). One operator, one device, one console.
 */

/** The cookie name. Prefixed so it cannot collide with anything the shop sets. */
export const SESSION_COOKIE = "luxeride_admin_session";

/**
 * TWELVE HOURS, and why not longer.
 *
 * The console is used in bursts — an afternoon of confirming floor pans — and a
 * long session on a shared machine is a real risk with a single credential. A
 * working day plus an overnight is enough, and the cost of being too short is
 * one extra sign-in. The browser also keeps the cookie past a restart, so this
 * is the only thing bounding an unattended console.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

/** Bumped if the token format ever changes, so old cookies die instead of misparsing. */
const TOKEN_VERSION = "v1";

/**
 * The HMAC key: the secret **and** the password hash, hashed together.
 *
 * Keying on the password hash as well as the secret is what makes a credential
 * rotation actually revoke sessions. With the secret alone, changing the admin
 * password would leave every issued cookie valid until it expired — which is
 * precisely the case where you most need them all dead, because you changed the
 * password because you think it was exposed.
 *
 * The secret is required. There is no fallback and no generated-at-boot value:
 * a per-process key would invalidate every cookie on every deploy and on every
 * dev-server reload, and a hard-coded default would be a secret in the
 * repository, which is the one thing §7.4 forbids.
 */
function signingKey(): Buffer | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.trim() === "") return null;

  // Binding the hash in as *material* rather than concatenating secrets by hand
  // means the two values cannot be confused with each other or with a value
  // that happens to end where the other begins.
  return createHmac("sha256", secret).update(process.env.ADMIN_PASSWORD_HASH ?? "").digest();
}

/**
 * The signed token: `v1.<user>.<expiry>.<hmac>`, base64url throughout.
 *
 * The user is inside the signed payload rather than looked up from the
 * environment, so a cookie cannot be re-pointed at a different account by
 * editing it — the HMAC covers it.
 */
export function signSession(user: string, now: number = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;

  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${Buffer.from(user, "utf8").toString("base64url")}.${expires}`;
  const signature = createHmac("sha256", key).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

/**
 * Verify a cookie and return the authenticated user, or `null`.
 *
 * Every failure is `null`: no secret, malformed token, bad signature, expired,
 * or a user that no longer matches `ADMIN_USER`. It never throws, because this
 * runs inside the Proxy on every request to the subtree and a throw there is a
 * 500 on a page the operator is trying to reach.
 *
 * The signature comparison is `timingSafeEqual`, and the length is checked
 * first: that function throws on a length mismatch, which would itself leak how
 * much of a forged signature was correct.
 */
export function verifySession(token: string | undefined | null, now: number = Date.now()): string | null {
  if (!token) return null;

  const key = signingKey();
  if (!key) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [version, encodedUser, expiresRaw, signature] = parts;
  if (version !== TOKEN_VERSION) return null;

  const expiry = Number(expiresRaw);
  if (!Number.isInteger(expiry)) return null;
  // Expired tokens are rejected before the signature is even checked, which is
  // both cheaper and correct: the expiry is inside the signed payload, so an
  // attacker cannot extend it, and there is nothing to learn from recomputing an
  // HMAC for a cookie that is already void.
  if (expiry * 1000 <= now) return null;

  const payload = `${version}.${encodedUser}.${expiresRaw}`;
  const expected = createHmac("sha256", key).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  // The signature is valid, so the user came from a cookie this server minted —
  // but the environment may have changed since. Re-checking keeps a renamed
  // operator from inheriting a session issued to the old name.
  let user: string;
  try {
    user = Buffer.from(encodedUser, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expectedUser = process.env.ADMIN_USER;
  if (!expectedUser || user !== expectedUser) return null;

  return user;
}

/** Read the cookie out of a `Request`'s `Cookie` header. */
export function sessionFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

/**
 * The cookie attributes, in one place so the login and the logout cannot drift.
 *
 * - `httpOnly` — JavaScript cannot read it, so an XSS bug cannot exfiltrate the
 *   session. The login page needs no script at all.
 * - `sameSite: "strict"` — the cookie is not sent on any cross-site request,
 *   which is what makes a CSRF POST to a Server Action useless.
 * - `path: "/admin"` — the storefront never receives it, so a public page cannot
 *   cause it to be sent even by accident.
 * - `secure` in production only, because `next dev` runs on plain HTTP and a
 *   `Secure` cookie there is silently dropped, which looks exactly like a
 *   broken login.
 */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "strict";
  path: string;
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/**
 * True when a login could possibly succeed, checked WITHOUT the password.
 *
 * This is a configuration check, not an authorisation check: it answers "is the
 * console set up", never "is this person allowed in". The login page uses it to
 * say something useful when something is missing, because the alternative is a
 * form that silently never works — which is exactly how this console looked
 * like it had no UI.
 *
 * Three things are checked: the user, the session secret, and that the password
 * hash PARSES. It deliberately does not verify a password — it cannot, and a
 * probe password would tell us nothing a real sign-in does not.
 *
 * The hash is normalised the same way `verifyAdminCredentials` normalises it, so
 * this check and a real login can never disagree about whether the credential is
 * usable. That disagreement is the bug class §7.4 was written about.
 */
export function adminLoginConfigured(): boolean {
  if (!process.env.ADMIN_USER || process.env.ADMIN_USER.trim() === "") return false;
  if (!signingKey()) return false;

  const hash = (process.env.ADMIN_PASSWORD_HASH ?? "").replace(/\\\$/g, "$");
  return /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/i.test(hash);
}