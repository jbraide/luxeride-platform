"use server";

import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { isOrderRef } from "@/lib/order-ref";
import { ACCESS_COOKIE_TTL_SECONDS, accessCookieName, digestsMatch, phoneDigest } from "./access";

/**
 * The phone gate for `/order/<reference>` (`commerce-backend` §7.2).
 *
 * WHY A SERVER ACTION HERE AND A ROUTE HANDLER FOR `/api/orders`
 *
 * The two surfaces were chosen for opposite reasons and both choices are
 * deliberate. `/api/orders` is a Route Handler because D-02 decided it has to be
 * `curl`-able — this environment has no headless browser, so a surface that
 * cannot be driven by `curl` cannot be demonstrated. This one is the opposite:
 * its entire job is to compare a GUESSED phone number against a stored one, so
 * it wants every property a Server Action gives free — POST-only, Next's
 * `Origin`-against-`Host` CSRF check, encrypted action ids, and unreferenced
 * actions stripped from the client bundle so there is no public endpoint to
 * probe at all. Nothing here has to be tested from outside, because it is a page
 * interaction and the page it protects renders its own result.
 *
 * WHY A `"use server"` FILE HOLDS ONLY THIS
 *
 * Next allows only async functions to be exported from one, so the cookie name,
 * the TTL and the digest comparison live in `./access.ts`, which both this file
 * and the page import. The split is forced by the framework, not chosen for
 * tidiness, and the boundary is a clean one: this file is the only thing that
 * writes the cookie.
 *
 * WHAT IT RETURNS ON A MISMATCH, AND WHY THAT DISCLOSES NOTHING
 *
 * `{ verified: false }`, with no distinction between "no such reference" and
 * "wrong number". `/order/[reference]/page.tsx` renders its UNVERIFIED state in
 * both cases, and that state is identical to what an unknown reference gets —
 * same heading, same copy, same WhatsApp route, no phone form. A caller who
 * guesses references therefore learns nothing from a wrong guess that they would
 * not also learn from a reference that was never issued. That equivalence is
 * `commerce-backend` § Error Handling's "identical 'not found' response; nothing
 * disclosed", and it is a property of the PAGE, not of this function: the page
 * cannot know the difference from the outside, so it does not try to.
 *
 * It is also why there is no rate limit here: every guess yields the same
 * response, so a guesser gets no signal to optimise against. That is a real
 * limit of the design and it is recorded in `commerce-backend` §9.3 — there is
 * no rate limiting on order access yet.
 */
export interface AccessResult {
  verified: boolean;
  /**
   * `true` when a number WAS submitted and did not match. Present so the form can
   * say so — and it says the same thing whether the reference exists or not, so
   * it discloses nothing. Absent when nothing was submitted, because "you typed
   * nothing wrong" is not a failure to report.
   */
  error?: boolean;
}

export async function verifyOrderAccess(
  reference: string,
  formData: FormData,
): Promise<AccessResult> {
  const submitted = formData.get("phone");
  const phone = typeof submitted === "string" ? submitted.trim() : "";

  // Rejected before any lookup: a string that cannot be a reference and one that
  // cannot be a phone never reach the database at all.
  if (!isOrderRef(reference) || phone === "") return { verified: false };

  const order = await prisma.order.findUnique({ where: { reference }, select: { phone: true } });
  // One answer for both "no such reference" and "wrong number". Identical text,
  // identical status, identical absence of data — which is the property §
  // Error Handling is asking for.
  if (!order) return { verified: false, error: true };
  if (!digestsMatch(phoneDigest(phone), phoneDigest(order.phone))) {
    return { verified: false, error: true };
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: accessCookieName(reference),
    value: phoneDigest(order.phone),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // The scope is the whole point: this proof opens ONE order's page and no
    // other, from this browser.
    path: `/order/${reference}`,
    maxAge: ACCESS_COOKIE_TTL_SECONDS,
  });

  return { verified: true };
}