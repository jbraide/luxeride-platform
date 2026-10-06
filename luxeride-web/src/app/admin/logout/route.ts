import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/admin-session";

/**
 * `POST /admin/logout` — end the session.
 *
 * This route could not exist while the console was behind Basic Auth: there was
 * no session to end, only a credential the browser held until it closed. That is
 * why the shell used to explain, in a paragraph, that signing out meant closing
 * the browser. With a cookie there is a session, so there can be a button.
 *
 * POST ONLY, AND NOT THROUGH THE PROXY GATE ON PURPOSE
 *
 * If this route sat behind the admin gate, a session that had already expired
 * would leave the operator stuck: the gate would redirect to the login page and
 * the cookie would never be cleared. Signing out has to work precisely when the
 * session is no good, so this route requires no credential and does nothing but
 * delete the cookie. Clearing a cookie is not a capability — it destroys the
 * caller's own access and grants none.
 *
 * `sameSite: "strict"` on the cookie means a cross-site POST cannot reach this
 * route with the cookie attached either, so "not through the gate" does not
 * become "an attacker's page can log you out".
 */
export async function POST(request: Request): Promise<Response> {
  const response = NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    // The attributes must MATCH the ones the cookie was set with, or the browser
    // keeps the original — a logout that leaves the cookie in place is the most
    // plausible way this route could fail silently.
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
    secure: process.env.NODE_ENV === "production",
    // Expire immediately rather than setting a negative maxAge: the deletion is
    // then a fact about the stored cookie rather than a duration left to the
    // browser's clock.
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}