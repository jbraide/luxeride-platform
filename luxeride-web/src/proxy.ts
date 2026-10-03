import { NextResponse, type NextRequest } from "next/server";

import { verifyAdminCredentials, parseBasicAuth } from "@/lib/admin-auth";

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
 * WHY `401` AND NOT A REDIRECT TO A LOGIN PAGE: there is no login page. Locked
 * decision 1 says one operator, so a password page, a session module, a logout
 * route and a signing secret would be roughly five times the surface for one user
 * (see the design's option table). Basic Auth is the browser's own dialog.
 *
 * THIS FUNCTION READS ONE HEADER AND MAKES ONE DECISION. It fetches nothing, holds
 * no layout, price, mapping or demand data, and imports no database client — which
 * keeps it inside the guide's warning that Proxy is "not intended for slow data
 * fetching".
 */

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

export function proxy(request: NextRequest): NextResponse {
  const credentials = parseBasicAuth(request.headers.get("authorization"));

  if (!credentials || !verifyAdminCredentials(credentials.user, credentials.password)) {
    return unauthorised();
  }

  // Authenticated. There is no authorisation step to add: locked decision 1 gives
  // exactly one operator, so there is no second role to authorise against. Adding
  // one here would be the permission model Requirement 14.1 forbids.
  return NextResponse.next();
}

export const config = {
  // `:path*` covers `/admin` itself as well as every child, so the landing page is
  // not accidentally left open. Verified: `/admin` returns 401 without credentials.
  matcher: ["/admin/:path*"],
};
