import Link from "next/link";

import { prisma } from "@/lib/db";
import { createCoupon, deleteCoupon, updateCoupon } from "../promo-actions";
import {
  DISCOUNT_KINDS,
  messageFor,
  readEcho,
  readFailures,
  toDateTimeInput,
} from "../promo-guard";

/**
 * `/admin/coupons` — the codes a customer types.
 *
 * HOW A COUPON DIFFERS FROM A PROMOTION, IN THREE SENTENCES
 *
 * A promotion is ours and needs no code; a coupon is held by the customer and is
 * matched, case-insensitively, against what they typed. A promotion discounts a SCOPE
 * (the shop, a category, a product); a coupon discounts the BASKET, which is why it is
 * the only rule here with a minimum spend. And they never stack — whichever is worth
 * more wins, and the other is dropped, so a 30% sale cannot be doubled with a code.
 *
 * CODES ARE STORED UPPERCASED, AND THE SCREEN SAYS SO
 *
 * `WELCOME10` and `welcome10` are one code, because the customer types in whatever case
 * their keyboard had on. Normalising on the way in means the lookup and the validation
 * cannot disagree about what "the same code" is — two definitions of that is how a
 * coupon ends up saved under a code that never applies.
 *
 * A USED COUPON CANNOT BE DELETED
 *
 * An order paid with a code has to stay explainable. Switching it off does that and
 * keeps the history; deleting it does not, so the delete is refused once
 * `redemptions` is above zero.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupons" };

const FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none";

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const failures = readFailures(query);
  const echo = readEcho(query);

  const [coupons, now] = await Promise.all([
    prisma.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    Promise.resolve(new Date()),
  ]);

  const label = "block text-xs uppercase tracking-widest text-accent-dim";
  const fieldFailed = (field: string) => (failures.has(field) ? "border-[#FF6B35]" : "");

  const refusal = (field: string) => {
    const code = failures.get(field);
    if (!code) return null;
    return (
      <p className="mt-1 text-xs leading-relaxed text-[#FF6B35]">
        <span className="font-mono">{field}</span> — {messageFor(code)}
      </p>
    );
  };

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Coupons</h2>
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
        Codes a customer types at checkout. A coupon discounts the whole basket and can
        carry a minimum spend; a{" "}
        <Link href="/admin/promotions" className="text-accent underline-offset-4 hover:underline">
          promotion
        </Link>{" "}
        discounts a chosen part of the shop. They never stack — whichever saves more wins.
      </p>


      {failures.size > 0 && (
        <div className="mt-4 rounded-xl border border-[#FF6B35] px-4 py-3 text-sm">
          <p className="text-[#FF6B35]">
            Not saved. {failures.size} field{failures.size === 1 ? "" : "s"} refused:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-fg-muted">
            {[...failures].map(([field, code]) => (
              <li key={field}>
                <span className="font-mono text-fg/80">{field}</span> — {messageFor(code)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">
          Codes{" "}
          <span className="font-mono text-xs text-accent-dim">{coupons.length}</span>
        </h3>

        {coupons.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-surface px-5 py-5 text-sm text-fg-muted">
            No coupons yet. Everything is at its confirmed price.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {coupons.map((coupon) => {
              const started = coupon.startsAt === null || coupon.startsAt <= now;
              const notEnded = coupon.endsAt === null || coupon.endsAt >= now;
              const exhausted =
                coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions;
              const state = !coupon.active
                ? "off"
                : exhausted
                  ? "used up"
                  : !started
                    ? "scheduled"
                    : !notEnded
                      ? "ended"
                      : "running";

              return (
                <li key={coupon.id} className="rounded-xl border border-border bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="font-mono text-sm text-fg/85">{coupon.code}</span>
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase ${
                        state === "running"
                          ? "border-accent/50 text-accent"
                          : "border-border text-fg-muted"
                      }`}
                    >
                      {state}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-accent">
                    {coupon.kind === "percent" ? `${coupon.value}% off` : `₦${coupon.value.toLocaleString("en-NG")} off`}{" "}
                    the basket
                    {coupon.minSubtotal !== null &&
                      `, on orders of ₦${coupon.minSubtotal.toLocaleString("en-NG")} or more`}
                    {coupon.maxRedemptions !== null && ` · ${coupon.maxRedemptions} use(s) max`}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-fg-muted">
                    used {coupon.redemptions}×
                    {coupon.startsAt ? ` · from ${coupon.startsAt.toISOString().slice(0, 10)}` : ""}
                    {coupon.endsAt ? ` · until ${coupon.endsAt.toISOString().slice(0, 10)}` : " · never ends"}
                  </p>

                  <form method="post" action={updateCoupon} className="mt-4 grid gap-3 sm:grid-cols-6">
                    <input type="hidden" name="id" value={coupon.id} />
                    <div className="sm:col-span-2">
                      <label className={label}>Code</label>
                      <input
                        name={`code__${coupon.id}`}
                        defaultValue={echo(`code__${coupon.id}`) || coupon.code}
                        className={`${FIELD} font-mono ${fieldFailed(`code__${coupon.id}`)}`}
                      />
                      {refusal(`code__${coupon.id}`)}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label}>What it takes off</label>
                      <div className="flex gap-2">
                        <select
                          name={`kind__${coupon.id}`}
                          defaultValue={echo(`kind__${coupon.id}`) || coupon.kind}
                          className={`${FIELD} max-w-[9rem]`}
                        >
                          {DISCOUNT_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k === "percent" ? "% off" : "₦ off"}
                            </option>
                          ))}
                        </select>
                        <input
                          name={`value__${coupon.id}`}
                          defaultValue={echo(`value__${coupon.id}`) || String(coupon.value)}
                          inputMode="numeric"
                          className={`${FIELD} font-mono`}
                        />
                      </div>
                      {refusal(`value__${coupon.id}`)}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label}>Minimum order</label>
                      <input
                        name={`minSubtotal__${coupon.id}`}
                        inputMode="numeric"
                        placeholder="no minimum"
                        defaultValue={
                          echo(`minSubtotal__${coupon.id}`) ||
                          (coupon.minSubtotal === null ? "" : String(coupon.minSubtotal))
                        }
                        className={`${FIELD} font-mono`}
                      />
                      {refusal(`minSubtotal__${coupon.id}`)}
                    </div>

                    <div>
                      <label className={label}>Starts</label>
                      <input
                        type="datetime-local"
                        name={`startsAt__${coupon.id}`}
                        defaultValue={echo(`startsAt__${coupon.id}`) || toDateTimeInput(coupon.startsAt)}
                        className={FIELD}
                      />
                      {refusal(`startsAt__${coupon.id}`)}
                    </div>
                    <div>
                      <label className={label}>Ends</label>
                      <input
                        type="datetime-local"
                        name={`endsAt__${coupon.id}`}
                        defaultValue={echo(`endsAt__${coupon.id}`) || toDateTimeInput(coupon.endsAt)}
                        className={FIELD}
                      />
                      {refusal(`endsAt__${coupon.id}`)}
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:border-accent"
                      >
                        Save
                      </button>
                    </div>
                    <div className="flex items-end gap-3 sm:col-span-3">
                      <label className="flex items-center gap-2 text-sm text-fg/80">
                        <input
                          type="checkbox"
                          name={`active__${coupon.id}`}
                          defaultChecked={coupon.active}
                          className="accent-accent"
                        />
                        Switched on
                      </label>
                      <button
                        type="submit"
                        formAction={deleteCoupon}
                        disabled={coupon.redemptions > 0}
                        title={
                          coupon.redemptions > 0
                            ? "This code has been used. Switch it off instead."
                            : "Delete this code"
                        }
                        className="text-xs text-fg-muted underline-offset-4 hover:text-[#FF6B35] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The same collapse as promotions, for the same reason: nine edit forms plus a
          create form on one page is what "mangled" was. */}
      <details className="mt-10 rounded-xl border border-border bg-surface/60" open={failures.size > 0}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-accent marker:content-none">
          + Add a coupon
        </summary>
        <div className="border-t border-border px-4 py-5">
          <form method="post" action={createCoupon} className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Code — required</label>
              <input
                name="code"
                required
                defaultValue={echo("code")}
                placeholder="WELCOME10"
                className={`${FIELD} font-mono ${fieldFailed("code")}`}
              />
              <p className="mt-1 text-[11px] text-fg-muted">
                Shown to customers exactly as typed, and matched without case.
              </p>
              {refusal("code")}
            </div>
            <div>
              <label className={label}>What it takes off</label>
              <div className="flex gap-2">
                <select name="kind" defaultValue={echo("kind") || "fixed"} className={`${FIELD} max-w-[10rem]`}>
                  {DISCOUNT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k === "percent" ? "% off" : "₦ off"}
                    </option>
                  ))}
                </select>
                <input
                  name="value"
                  required
                  inputMode="numeric"
                  defaultValue={echo("value") || "5000"}
                  className={`${FIELD} font-mono ${fieldFailed("value")}`}
                />
              </div>
              {refusal("kind")}
              {refusal("value")}
            </div>
            <div>
              <label className={label}>Minimum order — blank for none</label>
              <input
                name="minSubtotal"
                inputMode="numeric"
                placeholder="none"
                defaultValue={echo("minSubtotal")}
                className={`${FIELD} font-mono ${fieldFailed("minSubtotal")}`}
              />
              {refusal("minSubtotal")}
            </div>
            <div>
              <label className={label}>Maximum uses — blank for unlimited</label>
              <input
                name="maxRedemptions"
                inputMode="numeric"
                placeholder="unlimited"
                defaultValue={echo("maxRedemptions")}
                className={`${FIELD} font-mono ${fieldFailed("maxRedemptions")}`}
              />
              {refusal("maxRedemptions")}
            </div>
            <div>
              <label className={label}>Starts — blank means now</label>
              <input type="datetime-local" name="startsAt" defaultValue={echo("startsAt")} className={FIELD} />
              {refusal("startsAt")}
            </div>
            <div>
              <label className={label}>Ends — blank means never</label>
              <input type="datetime-local" name="endsAt" defaultValue={echo("endsAt")} className={FIELD} />
              {refusal("endsAt")}
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm text-fg/80">
                <input type="checkbox" name="active" defaultChecked className="accent-accent" />
                Switched on
              </label>
            </div>
            <div className="sm:col-span-3">
              <label className={label}>Note shown next to the box — optional</label>
              <input
                name="note"
                defaultValue={echo("note")}
                placeholder="₦5,000 off a ₦100,000 order"
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
              >
                Create coupon
              </button>
            </div>
          </form>
        </div>
      </details>

    </div>
  );
}