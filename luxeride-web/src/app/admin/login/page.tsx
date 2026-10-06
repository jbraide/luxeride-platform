import type { Metadata } from "next";

import { AUTH_FAILED } from "@/lib/admin-auth";
import { adminLoginConfigured, SESSION_TTL_SECONDS } from "@/lib/admin-session";

/**
 * `/admin/login` — the credential prompt, as a page.
 *
 * WHY A PAGE AND NOT A BROWSER DIALOG
 *
 * M9.2 shipped HTTP Basic Auth, which means the browser owns the prompt and the
 * server never sees a page. That works, and it is sixty lines instead of five
 * files — but it fails in a way no correct server code can fix: a dismissed or
 * wrong-credential prompt renders the same plain-text `401` as a working gate, so
 * "the console has no UI" and "you declined the dialog" look identical to the
 * person in front of the browser. That is not a small annoyance; it is a gate
 * that cannot explain itself. This page is the gate explaining itself.
 *
 * STILL ONE OPERATOR (locked decision 1)
 *
 * One user field, one password field, no role, no invite, no second seat. The
 * page says so, because a login screen is exactly where somebody would expect a
 * user list and the absence should read as deliberate rather than unfinished.
 *
 * NO `'use client'`, AND NO JAVASCRIPT AT ALL
 *
 * A plain `<form method="post">` posting to `/admin/session`. The console's rule
 * is that the server is the only implementation of the evidence gate, with no
 * second code path that runs when JavaScript does; a login form written in React
 * would be the one interactive thing on a site whose admin half has no client
 * component anywhere. The failure state is a `?error=1` query parameter rather
 * than `useActionState` for the same reason.
 *
 * The form cannot post here: Next refuses a `page.tsx` and a `route.ts` at the
 * same path, so `/admin/login` is this page and `/admin/session` is the handler.
 *
 * `noindex` and a `no-store` header, both stated here: the page is behind no
 * index by construction and must never be cached by a shared proxy. §7.7 requires
 * the console to disclose nothing, and a cached login page in a corporate proxy
 * is disclosure.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** Force per-request rendering so a cache can never serve a stale credential form. */
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const failed = params.error === "1";

  // A missing secret or an unparseable hash is a misconfiguration, not a wrong
  // password, and the two need different fixes. Saying which one it is on the
  // page is the whole reason this page exists.
  const configured = adminLoginConfigured();
  const secretMissing = configured ? false : !(process.env.ADMIN_SESSION_SECRET ?? "").trim();

  return (
    <div className="mx-auto w-full max-w-sm px-5 py-24">
      <h1 className="font-display text-xl font-semibold">
        LuxeRide <span className="text-accent">admin</span>
      </h1>
      <p className="mt-1 text-xs text-fg-muted">One operator. No roles, no second seat.</p>

      {!configured ? (
        <section className="mt-8 rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="font-display text-base font-semibold text-accent">
            This console is not configured yet
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg/80">
            {secretMissing ? (
              <>
                <code className="font-mono text-accent-dim">ADMIN_SESSION_SECRET</code> is not set, so
                there is nothing to sign a session with. Generate one and restart the server:
              </>
            ) : (
              <>
                <code className="font-mono text-accent-dim">ADMIN_USER</code> or{" "}
                <code className="font-mono text-accent-dim">ADMIN_PASSWORD_HASH</code> is missing or
                malformed. Produce the hash with:
              </>
            )}
          </p>
          <p className="mt-3 rounded-lg bg-bg/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-accent">
            {secretMissing ? (
              <>node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;</>
            ) : (
              <>node scripts/hash-admin-password.mjs</>
            )}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            Both live in <code className="font-mono text-accent-dim">luxeride-web/.env.local</code>,
            which is never committed. This message names a missing variable and nothing else — no
            value, no hash, no path.
          </p>
        </section>
      ) : (
        <>
          {failed && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm text-fg/80"
            >
              {AUTH_FAILED}
            </p>
          )}

          <form method="post" action="/admin/session" className="mt-6 space-y-4">
            <div>
              <label htmlFor="user" className="block text-xs uppercase tracking-widest text-accent-dim">
                Username
              </label>
              <input
                id="user"
                name="user"
                type="text"
                autoComplete="username"
                required
                autoFocus
                className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs uppercase tracking-widest text-accent-dim"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2.5 text-sm"
              />
            </div>

            {/* Carries where the operator was headed, so a deep link survives the
                detour through this page. Validated against a known route on the
                server rather than trusted: an open redirect here would be a way
                to bounce a freshly-authenticated operator off-site. */}
            {params.next && <input type="hidden" name="next" value={params.next} />}

            <button
              type="submit"
              className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-on-accent transition hover:brightness-110"
            >
              Sign in
            </button>
          </form>
        </>
      )}

      <p className="mt-8 text-[11px] leading-relaxed text-fg-muted">
        The session lasts {SESSION_TTL_SECONDS / 3600} hours in an httpOnly cookie scoped to{" "}
        <code className="font-mono text-accent-dim">/admin</code>, and changing the password ends every
        outstanding session immediately. Nothing here is indexed, and the page is never cached.
      </p>
    </div>
  );
}