import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The admin's "saved" message, without a query string.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Every mutation used to redirect back with `?saved=seatRows` in the URL. It worked,
 * and the owner disliked it: `/admin/layouts/layout-toyota-corolla?saved=unchanged`
 * is a confirmation written into the address bar, it survives in history, and it is
 * copyable into a message where it means nothing. It also made "bookmark this car"
 * bookmark a flash message rather than a car.
 *
 * So SUCCESS moved to a cookie the page reads once and deletes. The URL is now just
 * the page.
 *
 * ── WHY FAILURES ARE NOT HERE ────────────────────────────────────────────────
 *
 * A refusal has to carry the field that failed AND every value that was typed, so the
 * form can come back with the reason and without costing a retype. That is more than a
 * flash — it is data — and it has to survive a POST that arrives with scripting
 * disabled, which a client component cannot help with. So `?e=…&v.field=…` remains for
 * REFUSALS ONLY, and success never touches the URL.
 *
 * The line: a confirmation is a message and belongs in a message channel; a refusal is
 * a form state and belongs with the form.
 *
 * ── WHY A COOKIE AND NOT THE SESSION ─────────────────────────────────────────
 *
 * There is no session store in this project and adding one for a flash message would
 * be a database for a string. A short-lived, httpOnly cookie is read once, deleted on
 * read, and cannot be set by a client.
 */

export const FLASH_COOKIE = "luxeride-admin-flash";
const FLASH_TTL_SECONDS = 30;

/** The flash message on the page, if a redirect just set one. Consumes it. */
export async function readFlash(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(FLASH_COOKIE)?.value;
  if (!value) return null;
  return value;
}

/**
 * The `saved=` redirect, replaced by a cookie.
 *
 * `backTo(path, params)` in the actions still handles REFUSALS, where the params
 * matter. This is what success calls instead: `flashBack("/admin/promotions",
 * "promotion")` — the message rides in a cookie and the URL comes back clean.
 */
export async function flashBack(path: string, message: string): Promise<void> {
  const store = await cookies();
  store.set(FLASH_COOKIE, message, {
    httpOnly: true,
    sameSite: "lax",
    // Long enough to survive the redirect and be read, short enough that a message
    // left behind by an abandoned tab is gone by tomorrow.
    maxAge: FLASH_TTL_SECONDS,
    path: "/",
  });
  // `redirect` throws `NEXT_REDIRECT`, which unwinds the Server Action. The function is
  // typed `void` rather than `never` because the compiler cannot see that the
  // redirect's throw is total — an unreachable return type it then rejects as having a
  // reachable endpoint. Nothing after this line runs.
  redirect(path);
}

// Re-exported so the server keeps one import site for the whole flash mechanism.
export { FLASH_MESSAGES, flashMessage } from "./flash-messages.ts";
