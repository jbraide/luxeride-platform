import { NextResponse } from "next/server";

import { FLASH_COOKIE } from "../../(console)/flash";

/**
 * `GET /admin/flash/clear` — dismiss the current notice, then go where you were going.
 *
 * ── WHY THIS IS A ROUTE AND NOT A BUTTON ─────────────────────────────────────
 *
 * Because the console has no `'use client'` anywhere and no JavaScript at all: every
 * action is a plain `<form method="post">` and every screen renders the same with and
 * without scripting. A dismiss button that runs JavaScript would be the first thing in
 * this console to stop working when a script fails to load, for the sake of hiding a
 * banner.
 *
 * So dismissal is a LINK to this route, which deletes the cookie and redirects. It is
 * a GET, which normally means "unsafe" — and it is safe here because it changes nothing
 * anyone can lose: it clears a cosmetic message and goes back to a page that was
 * already open. No form is submitted, no row is written, and the cookie it deletes
 * only ever held a sentence.
 *
 * The `next` parameter is validated against a fixed shape rather than followed
 * blindly, for the reason the admin session exists at all: an open redirect here would
 * be an open redirect from inside the authenticated console.
 */

const ALLOWED_PREFIX = "/admin";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/admin";

  // Same-path check, not `startsWith`: `/admin.evil.example` passes a prefix test.
  const safe =
    next.startsWith(`${ALLOWED_PREFIX}/`) || next === ALLOWED_PREFIX ? next : "/admin";

  const response = NextResponse.redirect(new URL(safe, url.origin));
  response.cookies.set(FLASH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
