import { NextResponse, type NextRequest } from "next/server";

import { verifyAdminCredentials, parseBasicAuth } from "@/lib/admin-auth";
import { sessionFromRequest, verifySession } from "@/lib/admin-session";

/**
 * The gate on the whole `/admin` subtree (`fitment-engine` §7.2).
 *
 * Next 16 renamed Middleware to Proxy — confirmed in
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, which also
 * states it "should not be your only line of defense". So this is the *optimistic*
 * check that keeps a stranger out of the subtree, and `requireAdmin()` in
 * `src/lib/admin-auth.ts` is the *secure* check every mutating Server Action calls
 * first. Both exist because the Server Actions guide is explicit that an action is
 * reachable to anyone who can send the same POST — a page that merely does not
 * render a button protects nothing.
 *
 * TWO WAYS IN NOW, AND THE ORDER MATTERS
 *
 * 1. A signed session cookie (`src/lib/admin-session.ts`) — what the browser gets
 *    after signing in at `/admin/login`.
 * 2. HTTP Basic Auth — still accepted, unchanged, and still how a script or a
 *    `curl` proves a route works. Removing it would buy nothing: it is the same
 *    `verifyAdminCredentials` call the login form makes, and keeping it means the
 *    console has a credential path with no cookie machinery in it at all.
 *
 * A NAVIGATION IS REDIRECTED TO THE LOGIN PAGE; ANYTHING ELSE GETS A 401.
 *
 * That split is the fix for the problem this file used to have. A browser asking
 * for a page is sent somewhere it can recover from — a form, a message, a way
 * back in. Anything that is not a page navigation (a Server Action POST, a fetch,
 * a probe) still gets the flat `401`, because a `303` into an HTML login page
 * would hand a machine a body it cannot use and would turn a POST into a GET,
 * losing whatever the action was carrying.
 *
 * THIS FUNCTION READS ONE HEADER AND ONE COOKIE AND MAKES ONE DECISION. It
 * fetches nothing, holds no layout, price, mapping or demand data, and imports no
 * database client — which keeps it inside the guide's warning that Proxy is "not
 * intended for slow data fetching".
 */

/**
 * The three routes that must work for someone who is not signed in.
 *
 * `/admin/login` is the page, `/admin/session` is the form target (Next refuses a
 * page and a handler at one path), and `/admin/logout` has to work precisely when
 * the session is already no good. Exempting them here rather than in the matcher
 * keeps the whole policy in one readable function.
 */
const LOGIN_PATH = "/admin/login";
const SESSION_PATH = "/admin/session";
const LOGOUT_PATH = "/admin/logout";

/**
 * A `401` that renders no application shell at all.
 *
 * `fitment-engine` §7.7 requires the unauthorised response to disclose nothing:
 * no layout, no price, no mapping, no demand figure, and no hint about what is
 * behind the door. A plain text body is the smallest possible surface.
 */
function unauthorised(): NextResponse {
  return new NextResponse("Authentication required.\n", {
    status: 401,
    headers: {
      // The realm is a fixed label, not a leak: it appears in the browser's own
      // dialog and is the same string for every visitor.
      "WWW-Authenticate": 'Basic realm="LuxeRide Admin", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      // Credentials must never be answered from a cache.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The redirect to the sign-in page, carrying where the operator was going.
 *
 * `next` is only the path and query, never the host: `request.nextUrl.pathname`
 * is already origin-relative, so there is nothing here for an attacker to aim
 * somewhere else with. The destination is re-validated on the way back in
 * (`safeNext` in the login route) because a redirect target that arrives in a
 * form field is attacker-controllable even when this one is not.
 */
function toLogin(request: NextRequest): NextResponse {
  const url = new URL(LOGIN_PATH, request.url);
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  // Only a real admin path is worth remembering; `/admin/login` itself must not
  // loop, and the check is belt-and-braces against a future matcher change.
  if (target !== LOGIN_PATH && target.startsWith("/admin/")) url.searchParams.set("next", target);

  const response = NextResponse.redirect(url, { status: 307 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Pass the request through, tagging it with its own path and query.
 *
 * WHY: a layout cannot receive `searchParams`, and Next 16 sends a layout no `x-invoke-path`
 * or `next-url` header — so the console shell had no way to know which screen it was on, or
 * what a refusal had left in the URL. The read fell back to `/admin` every time, which is why
 * the sidebar never highlighted the current screen and the corner alert could not see a
 * refusal. The proxy already has `request.nextUrl`, so it forwards it.
 *
 * The value is origin-relative (path + search, never a host), so there is nothing here for a
 * caller to aim somewhere else with.
 */
function forward(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-luxeride-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // The sign-in page and the sign-out route are outside the gate by necessity:
  // a gate that protected the login page would be a gate with no way through it.
  if (pathname === LOGIN_PATH || pathname === SESSION_PATH || pathname === LOGOUT_PATH) {
    return forward(request);
  }

  // 1. The session cookie.
  const user = verifySession(sessionFromRequest(request));
  if (user) return forward(request);

  // 2. HTTP Basic Auth, unchanged.
  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (credentials && verifyAdminCredentials(credentials.user, credentials.password)) {
    return forward(request);
  }

  // 3. Refused. A browser navigating to a page gets sent to sign in; everything
  //    else gets the flat 401.
  const isNavigation = request.method === "GET" || request.method === "HEAD";
  if (isNavigation) return toLogin(request);

  return unauthorised();
}

export const config = {
  // `:path*` covers `/admin` itself as well as every child, so the landing page is
  // not accidentally left open. Verified: `/admin` returns the login redirect
  // without a credential, and the two open routes are exempted inside the
  // function above rather than by a matcher exception — one place to reason about.
  matcher: ["/admin/:path*"],
};