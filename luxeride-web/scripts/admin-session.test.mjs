#!/usr/bin/env node
/**
 * Admin session — `fitment-engine` §7, the sign-in page and its cookie.
 *
 *   node --test scripts/admin-session.test.mjs      (or `npm test`, which globs it)
 *
 * WHY THESE TESTS EXIST
 *
 * The session is a signature, and a signature has exactly one interesting
 * property: everything else follows from it being unforgeable and correctly
 * scoped. A bug that made `/admin/login` reachable would be obvious in a browser
 * within a minute; a bug that made a *forged or expired* cookie acceptable would
 * sit there silently, because nothing about the happy path would ever look wrong.
 * So the tests below are mostly about what must NOT work.
 *
 * They import the module directly, with the environment set per-test rather than
 * from `.env.local` — the point is to control `ADMIN_USER`, `ADMIN_PASSWORD_HASH`
 * and `ADMIN_SESSION_SECRET` exactly, including rotating them mid-test, which is
 * the credential-rotation guarantee the module claims.
 *
 * `src/lib/admin-session.ts` is Node-loadable on purpose: its only non-relative
 * import is `node:crypto`, and it imports no `@/lib/*` module, so type stripping
 * needs no alias help. That is a constraint to preserve when editing it — adding
 * an import of `admin-auth` or `db` here would make this file unloadable.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_TTL_SECONDS,
  adminLoginConfigured,
  sessionCookieOptions,
  sessionFromRequest,
  signSession,
  verifySession,
} from "../src/lib/admin-session.ts";

// A syntactically valid hash is all `signingKey()` and `adminLoginConfigured()`
// read; the tests below never present this password to `verifyAdminCredentials`.
const HASH = "scrypt$00112233445566778899aabbccddeeff$" + "ab".repeat(64);
const SECRET = "test-secret-not-a-real-one";

/** Set the three variables the module reads, and return a restore function. */
function withEnv(overrides) {
  const before = {
    ADMIN_USER: process.env.ADMIN_USER,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

const configured = { ADMIN_USER: "luxeride", ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET };

test("a freshly signed token verifies and names the operator", () => {
  const restore = withEnv(configured);
  try {
    const token = signSession("luxeride");
    assert.equal(verifySession(token), "luxeride");
  } finally {
    restore();
  }
});

test("no secret means no token and no verification — never a throw", () => {
  const restore = withEnv({ ...configured, ADMIN_SESSION_SECRET: undefined });
  try {
    assert.equal(signSession("luxeride"), null);
    assert.equal(verifySession("v1.bHV4ZXJpZGU.MTIz.abc"), null);
  } finally {
    restore();
  }
});

test("a tampered signature is refused", () => {
  const restore = withEnv(configured);
  try {
    const token = signSession("luxeride");
    const parts = token.split(".");
    // Change a character near the START of the signature, never the last one.
    //
    // This used to flip the final character, which made the test fail about one run
    // in eight — measured at 5 failures in 40 runs. The cause is base64url padding:
    // the last character of a base64 group carries unused low bits, so "...A" and
    // "...B" can decode to byte-identical output. The "tampered" signature was then
    // the original bytes, verification correctly succeeded, and the test's
    // expectation was wrong. It was a broken assertion about a correct
    // implementation, never a security defect in the session module.
    //
    // A character at the front is always significant: every bit of it lands in a
    // real byte. A `!==` string comparison would reject this too, so a passing test
    // cannot tell the two implementations apart — what matters is that a genuinely
    // altered signature is rejected at all, and that the module does not throw on a
    // signature of a different length (checked separately below).
    const signature = parts[3];
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    assert.equal(verifySession(`${parts[0]}.${parts[1]}.${parts[2]}.${flipped}`), null);
  } finally {
    restore();
  }
});

test("an edited payload is refused even when the signature is copied over", () => {
  const restore = withEnv(configured);
  try {
    const token = signSession("luxeride");
    const [, , expiry, signature] = token.split(".");
    // Re-point the cookie at a different user without re-signing it. This is the
    // attack the user-inside-the-payload design exists to stop.
    const otherUser = Buffer.from("someone-else", "utf8").toString("base64url");
    assert.equal(verifySession(`v1.${otherUser}.${expiry}.${signature}`), null);
  } finally {
    restore();
  }
});

test("an extended expiry is refused", () => {
  const restore = withEnv(configured);
  try {
    const token = signSession("luxeride");
    const [version, user, , signature] = token.split(".");
    const forever = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    assert.equal(verifySession(`${version}.${user}.${forever}.${signature}`), null);
  } finally {
    restore();
  }
});

test("an expired token is refused", () => {
  const restore = withEnv(configured);
  try {
    // Signed in the past: the TTL is added to `now`, so a token minted far enough
    // back is already outside its window.
    const twelveHours = 60 * 60 * 12 * 1000;
    const token = signSession("luxeride", Date.now() - twelveHours - 60_000);
    assert.equal(verifySession(token), null);
  } finally {
    restore();
  }
});

test("a token that has not expired is still accepted at the boundary", () => {
  const restore = withEnv(configured);
  try {
    const now = Date.now();
    const token = signSession("luxeride", now);
    // One second before the TTL elapses: valid. This pins the comparison so a
    // future `<` / `<=` change cannot silently shorten or lengthen the session.
    assert.equal(verifySession(token, now + 60 * 60 * 12 * 1000 - 1000), "luxeride");
  } finally {
    restore();
  }
});

test("rotating the secret invalidates an outstanding session", () => {
  const restore = withEnv(configured);
  let token;
  try {
    token = signSession("luxeride");
  } finally {
    restore();
  }

  const rotate = withEnv({ ...configured, ADMIN_SESSION_SECRET: "a-different-secret" });
  try {
    assert.equal(verifySession(token), null);
  } finally {
    rotate();
  }
});

test("rotating the password hash invalidates an outstanding session", () => {
  const restore = withEnv(configured);
  let token;
  try {
    token = signSession("luxeride");
  } finally {
    restore();
  }

  const other = "scrypt$ffeeddccbbaa99887766554433221100$" + "cd".repeat(64);
  const rotate = withEnv({ ...configured, ADMIN_PASSWORD_HASH: other });
  try {
    assert.equal(verifySession(token), null);
  } finally {
    rotate();
  }
});

test("a cookie for a renamed operator is refused", () => {
  const restore = withEnv(configured);
  let token;
  try {
    token = signSession("luxeride");
  } finally {
    restore();
  }

  const renamed = withEnv({ ...configured, ADMIN_USER: "someone-else" });
  try {
    assert.equal(verifySession(token), null);
  } finally {
    renamed();
  }
});

test("malformed cookies are refused without throwing", () => {
  const restore = withEnv(configured);
  try {
    for (const bad of [
      "",
      "v1",
      "v1.only-two",
      "v1.bHV4ZXJpZGU.not-a-number.sig",
      "v2.bHV4ZXJpZGU.99999999999.sig",
      "v1.bHV4ZXJpZGU.99999999999",
      "v1..99999999999.sig",
    ]) {
      assert.equal(verifySession(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
    assert.equal(verifySession(undefined), null);
    assert.equal(verifySession(null), null);
  } finally {
    restore();
  }
});

test("sessionFromRequest finds the cookie among others and survives encoding", () => {
  const header = (token) =>
    new Request("http://localhost/admin", {
      headers: { cookie: `theme=dark; luxeride_admin_session=${encodeURIComponent(token)}; other=1` },
    });

  const restore = withEnv(configured);
  try {
    const token = signSession("luxeride");
    assert.equal(sessionFromRequest(header(token)), token);
    assert.equal(sessionFromRequest(new Request("http://localhost/admin")), null);
    assert.equal(
      sessionFromRequest(new Request("http://localhost/admin", { headers: { cookie: "nothing=here" } })),
      null,
    );
  } finally {
    restore();
  }
});

test("the cookie is httpOnly, same-site, scoped to /admin and time-limited", () => {
  const options = sessionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "strict");
  assert.equal(options.path, "/admin");
  assert.equal(options.maxAge, SESSION_TTL_SECONDS);
  // `secure` follows NODE_ENV so `next dev` over plain HTTP still receives the
  // cookie; asserted only in the direction that is safe in any environment.
  assert.equal(typeof options.secure, "boolean");
});

test("adminLoginConfigured names a missing or malformed setup", () => {
  const cases = [
    [configured, true],
    [{ ...configured, ADMIN_SESSION_SECRET: undefined }, false],
    [{ ...configured, ADMIN_SESSION_SECRET: "" }, false],
    [{ ...configured, ADMIN_USER: undefined }, false],
    [{ ...configured, ADMIN_USER: "" }, false],
    [{ ...configured, ADMIN_PASSWORD_HASH: undefined }, false],
    [{ ...configured, ADMIN_PASSWORD_HASH: "not-a-hash" }, false],
    // The escaped form is what `.env.local` actually holds, because Next expands
    // an unescaped `$`. A check that rejected it would lock the operator out of
    // their own console with a "not configured" message and no way to tell why.
    [{ ...configured, ADMIN_PASSWORD_HASH: HASH.replace(/\$/g, "\\$") }, true],
  ];

  for (const [env, expected] of cases) {
    const restore = withEnv(env);
    try {
      assert.equal(adminLoginConfigured(), expected, `expected ${expected} for ${JSON.stringify(env)}`);
    } finally {
      restore();
    }
  }
});
