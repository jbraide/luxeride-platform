import { NextResponse } from "next/server";

import { verifyAdminCredentials } from "@/lib/admin-auth";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/admin-session";

/**
 * `POST /admin/session` — verify the credential, mint the cookie, go to the console.
 *
 * A Route Handler rather than a Server Action, and that is not an accident: the
 * console has no `'use client'` component anywhere, and a login form is the one
 * place a `useActionState` would drag one in. A plain form POST needs no
 * JavaScript at all, and the failure case is a redirect carrying `?error=1`.
 *
 * WHY IT IS NOT `/admin/login`
 *
 * Because Next refuses a `page.tsx` and a `route.ts` at the same path — the dev
 * server says so outright: *"Conflicting route and page at /admin/login"*. The
 * page has to own `/admin/login` so the address a person types is a page and not
 * a handler, so the form posts here instead. One extra path, and the alternative
 * was an HTML string built by hand inside a Route Handler.
 *
 * THE REDIRECT TARGET IS VALIDATED, NOT TRUSTED
 *
 * `next` rides along so a deep link survives the detour through the login page —
 * an operator who bookmarked `/admin/layouts/<id>` should land there, not on the
 * dashboard. But the value comes from a form field, so trusting it would make this
 * an open redirect: sign in successfully and get bounced to an attacker's site
 * with a valid session one click away. Only same-site absolute paths under
 * `/admin` are honoured; anything else — a protocol-relative `//evil.com`, a
 * scheme, a backslash — falls back to the dashboard.
 */
function safeNext(candidate: string | null | undefined): string {
  if (!candidate) return "/admin";
  // Must start with a single slash: `//host` and `/\host` are both parsed as
  // protocol-relative URLs by browsers, so a naive `startsWith("/")` check is
  // the classic open-redirect bug.
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/admin";
  if (candidate.includes("\\")) return "/admin";
  if (!candidate.startsWith("/admin")) return "/admin";
  // Reject a sibling path that merely starts with the same characters.
  if (candidate !== "/admin" && !candidate.startsWith("/admin/") && !candidate.startsWith("/admin?")) {
    return "/admin";
  }
  return candidate;
}

/** The failure redirect: back to the form, carrying the field that was wrong only as a flag. */
function rejected(request: Request): NextResponse {
  const url = new URL("/admin/login", request.url);
  url.searchParams.set("error", "1");
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return rejected(request);
  }

  const user = typeof form.get("user") === "string" ? String(form.get("user")).slice(0, 80) : "";
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  const next = safeNext(typeof form.get("next") === "string" ? String(form.get("next")) : null);

  // Every failure below returns the identical redirect. Distinguishing "no such
  // user" from "wrong password" — or "not configured" from "wrong password" —
  // tells an attacker which half of the credential to work on, so nothing does.
  if (!user || !password || !verifyAdminCredentials(user, password)) {
    // No artificial delay. `scryptSync` on the correct-password path already costs
    // ~100ms, but a wrong USER short-circuits before it — so a sleep here would
    // leak the same distinction by timing that the message refuses to leak.
    // §7.3's answer is one operator on a private console, not a rate limiter this
    // page could implement honestly.
    return rejected(request);
  }

  const token = signSession(user);
  // `null` means no secret. Treated as a failed login rather than a crash: a
  // half-configured console should refuse, not 500.
  if (!token) return rejected(request);

  const destination = new URL(next, request.url);
  const response = NextResponse.redirect(destination, { status: 303 });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    ...sessionCookieOptions(),
  });
  // The redirect itself must never be cached, or a shared proxy could replay a
  // `303` carrying a `Set-Cookie` to somebody else.
  response.headers.set("Cache-Control", "no-store");

  return response;
}