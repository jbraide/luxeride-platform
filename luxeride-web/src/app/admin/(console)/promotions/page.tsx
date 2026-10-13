import Link from "next/link";

import { prisma } from "@/lib/db";
import EmptyState from "@/components/admin/EmptyState";
import PageHeader from "@/components/admin/PageHeader";
import StatusChip from "@/components/admin/StatusChip";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  FIELD_ERROR,
  INPUT,
  LABEL,
  inputState,
} from "@/components/admin/ui";
import { createPromotion, deletePromotion, updatePromotion } from "../promo-actions";
import {
  describePromotion,
  DISCOUNT_KINDS,
  DISCOUNT_SCOPES,
  messageFor,
  readEcho,
  readFailures,
  toDateTimeInput,
} from "../promo-guard";
import SubmitButton from "@/components/admin/SubmitButton";

/**
 * `/admin/promotions` — time-boxed price reductions, created and managed here.
 *
 * WHAT A PROMOTION IS, IN ONE LINE: money off, for a window, on some set of things.
 * Everything on this screen is one of those four choices, and the rule that governs
 * all of them is on `src/lib/discounts.ts`.
 *
 * WHY THE SCOPE CHOICE IS THE ONE THAT MATTERS
 *
 * "Site", "one category" and "one product" are not three sizes of the same thing.
 * A sitewide 20% is a Black Friday; a category-wide one is a mats sale; a product one
 * is usually "this line is being cleared". Getting a scope wrong takes money off every
 * order in the shop rather than making a mistake you can see, which is why the two
 * narrow scopes REFUSE to save without a category or product chosen rather than
 * defaulting to sitewide — a promotion scoped to nothing looks exactly like one that
 * is not running.
 *
 * EVERY ROW SHOWS WHAT IT WILL DO, IN WORDS
 *
 * `describePromotion()` renders "20% off the whole shop" or "₦15,000 off double-layer
 * mats" from the row itself. A discount is invisible until you compare it with a
 * basket, so the summary line is the only place the arithmetic is legible — and it is
 * derived, never typed, so it cannot describe something other than what will happen.
 *
 * NO `'use client'`, like every screen in this console.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Promotions" };

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const failures = readFailures(query);
  const echo = readEcho(query);

  const [promotions, categories, products, now] = await Promise.all([
    prisma.promotion.findMany({
      include: {
        category: { select: { slug: true, name: true } },
        product: { select: { slug: true, name: true } },
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    prisma.category.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    Promise.resolve(new Date()),
  ]);

  /*
   * The per-field refusal stays a local helper — it needs THIS screen's `failures` map
   * and `messageFor` — but it renders the shared `FIELD_ERROR` class now.
   */
  const refusal = (field: string) => {
    const code = failures.get(field);
    if (!code) return null;
    return (
      <p className={FIELD_ERROR}>
        <span className="font-mono">{field}</span> — {messageFor(code)}
      </p>
    );
  };

  /** Is this promotion running right now? Drives the badge and the default sort. */
  const running = (startsAt: Date | null, endsAt: Date | null, active: boolean): boolean =>
    active && (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);

  return (
    <div>
      <PageHeader
        title="Promotions"
        meta="Money off, for a window, on some set of things. A discount is taken off the price confirmed for that car — never off the catalogue list price — and a promotion and a coupon never stack."
        actions={
          <a href="#add-promotion" className={BTN_SECONDARY}>
            Add a promotion
          </a>
        }
      />

      {/* ── Existing ──────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">
          Running{" "}
          <span className="font-mono text-xs text-accent-dim">{promotions.length}</span>
        </h3>

        {promotions.length === 0 ? (
          <EmptyState className="mt-4">
            No promotions yet. Everything is at its confirmed price, which is the honest default.
          </EmptyState>
        ) : (
          <ul className="mt-4 space-y-4">
            {promotions.map((promotion) => {
              const isRunning = running(promotion.startsAt, promotion.endsAt, promotion.active);
              return (
                <li key={promotion.id} className={`${CARD} px-4 py-4`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-sm text-fg/85">
                      {promotion.name}
                      {promotion.label && (
                        <span className="ml-2 font-mono text-[11px] text-accent-dim">
                          {promotion.label}
                        </span>
                      )}
                    </span>
                    <StatusChip tone={isRunning ? "accent" : "neutral"}>
                      {isRunning
                        ? "running"
                        : !promotion.active
                          ? "off"
                          : promotion.startsAt && promotion.startsAt > now
                            ? "scheduled"
                            : "ended"}
                    </StatusChip>
                  </div>

                  {/* Derived from the row, never typed — so it cannot describe
                      something other than what will actually happen. */}
                  <p className="mt-1 text-sm text-accent">
                    {describePromotion({
                      kind: promotion.kind,
                      value: promotion.value,
                      scope: promotion.scope,
                      categorySlug: promotion.category?.name,
                      productSlug: promotion.product?.name,
                    })}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-fg-muted">
                    {promotion.startsAt
                      ? `from ${promotion.startsAt.toISOString().slice(0, 16).replace("T", " ")}`
                      : "no start date"}{" "}
                    {promotion.endsAt
                      ? `· until ${promotion.endsAt.toISOString().slice(0, 16).replace("T", " ")}`
                      : "· never ends"}
                    {promotion.badge ? ` · badge "${promotion.badge}"` : ""}
                  </p>

                  <form method="post" action={updatePromotion} className="mt-4 grid gap-3 sm:grid-cols-6">
                    <input type="hidden" name="id" value={promotion.id} />
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Name</label>
                      <input
                        name={`name__${promotion.id}`}
                        defaultValue={echo(`name__${promotion.id}`) || promotion.name}
                        className={INPUT}
                      />
                      {refusal(`name__${promotion.id}`)}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>What it takes off</label>
                      <div className="flex gap-2">
                        <select
                          name={`kind__${promotion.id}`}
                          defaultValue={echo(`kind__${promotion.id}`) || promotion.kind}
                          className={`${INPUT} max-w-[9rem]`}
                        >
                          {DISCOUNT_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k === "percent" ? "% off" : "₦ off"}
                            </option>
                          ))}
                        </select>
                        <input
                          name={`value__${promotion.id}`}
                          defaultValue={echo(`value__${promotion.id}`) || String(promotion.value)}
                          inputMode="numeric"
                          className={`${INPUT} font-mono ${inputState(failures.has(`value__${promotion.id}`))}`}
                        />
                      </div>
                      {refusal(`value__${promotion.id}`)}
                      {refusal(`kind__${promotion.id}`)}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Label shown to customers</label>
                      <input
                        name={`label__${promotion.id}`}
                        defaultValue={echo(`label__${promotion.id}`) || promotion.label || ""}
                        placeholder="Black Friday"
                        className={INPUT}
                      />
                    </div>

                    <div>
                      <label className={LABEL}>Starts</label>
                      <input
                        type="datetime-local"
                        name={`startsAt__${promotion.id}`}
                        defaultValue={echo(`startsAt__${promotion.id}`) || toDateTimeInput(promotion.startsAt)}
                        className={INPUT}
                      />
                      {refusal(`startsAt__${promotion.id}`)}
                    </div>
                    <div>
                      <label className={LABEL}>Ends</label>
                      <input
                        type="datetime-local"
                        name={`endsAt__${promotion.id}`}
                        defaultValue={echo(`endsAt__${promotion.id}`) || toDateTimeInput(promotion.endsAt)}
                        className={INPUT}
                      />
                      {refusal(`endsAt__${promotion.id}`)}
                    </div>
                    <div className="flex items-end">
                      <SubmitButton className={BTN_SECONDARY}>
                        Save
                      </SubmitButton>
                    </div>
                    <div className="flex items-end gap-3 sm:col-span-3">
                      <label className="flex items-center gap-2 text-sm text-fg/80">
                        <input
                          type="checkbox"
                          name={`active__${promotion.id}`}
                          defaultChecked={promotion.active}
                          className="accent-accent"
                        />
                        Switched on
                      </label>
                      <SubmitButton
                        formAction={deletePromotion}
                        className="text-xs text-fg-muted underline-offset-4 hover:text-danger"
                      >
                        Delete
                      </SubmitButton>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/*
        CREATE, IN A COLLAPSED PANEL RATHER THAN A THIRD FORM ON THE PAGE.

        The owner's report was "promoting management is mangled, create and edit are on
        the same page". That is what it was: every existing promotion had a full inline
        form, and then the create form sat below them — nine edit forms and a create
        form, one scroll, and no way to tell at a glance which one you were filling in.

        A `<details>` rather than a hand-rolled modal dialog because the console has no
        JavaScript: a modal built from `<dialog>` needs `showModal()` to trap focus and
        handle Escape, and without it the "modal" is a box that does not behave like
        one. This opens and closes with no script, keeps the same server-rendered form
        and the same refusals, and reads as a single control — a button that says
        "Add a promotion" and reveals one form.
      */}
      <details id="add-promotion" className="mt-10 rounded-xl border border-border bg-surface/60" open={failures.size > 0}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-accent marker:content-none">
          + Add a promotion
        </summary>

        <div className="border-t border-border px-4 py-5">
          <p className="max-w-prose text-xs leading-relaxed text-fg-muted">
            A promotion with no end date runs until you delete it, which is almost never what you
            want. Give it a window. Leave the slug blank and it is built from the name.
          </p>

          <form method="post" action={createPromotion} className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL}>Name — required</label>
              <input
                name="name"
                required
                defaultValue={echo("name")}
                placeholder="Black Friday"
                className={`${INPUT} ${inputState(failures.has("name"))}`}
              />
              {refusal("name")}
            </div>
            <div>
              <label className={LABEL}>Slug — optional, made from the name</label>
              <input
                name="slug"
                defaultValue={echo("slug")}
                placeholder="black-friday-2026"
                className={`${INPUT} font-mono ${inputState(failures.has("slug"))}`}
              />
              {refusal("slug")}
            </div>
            <div>
              <label className={LABEL}>Badge on product cards</label>
              <input name="badge" defaultValue={echo("badge")} placeholder="20% OFF" className={INPUT} />
              <label className={LABEL}>Banner image — optional</label>
              <input name="image" defaultValue={echo("image")} placeholder="/banners/christmas.jpg or full URL" className={`${INPUT} text-xs`} />
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL}>What it takes off</label>
              <div className="flex gap-2">
                <select name="kind" defaultValue={echo("kind") || "percent"} className={`${INPUT} max-w-[10rem]`}>
                  {DISCOUNT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k === "percent" ? "% off" : "\u20a6 off"}
                    </option>
                  ))}
                </select>
                <input
                  name="value"
                  required
                  inputMode="numeric"
                  defaultValue={echo("value") || "20"}
                  className={`${INPUT} font-mono ${inputState(failures.has("value"))}`}
                />
              </div>
              {refusal("kind")}
              {refusal("value")}
            </div>

            <div>
              <label className={LABEL}>Where it applies</label>
              <select name="scope" defaultValue={echo("scope") || "site"} className={`${INPUT} ${inputState(failures.has("scope"))}`}>
                {DISCOUNT_SCOPES.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc === "site" ? "The whole shop" : sc === "category" ? "One category" : "One product"}
                  </option>
                ))}
              </select>
              {refusal("scope")}
            </div>

            <div>
              <label className={LABEL}>Category — only if scoped to one</label>
              <select name="categorySlug" defaultValue={echo("categorySlug")} className={INPUT}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              {refusal("categorySlug")}
            </div>
            <div>
              <label className={LABEL}>Product — only if scoped to one</label>
              <select name="productSlug" defaultValue={echo("productSlug")} className={INPUT}>
                <option value="">—</option>
                {products.map((pr) => (
                  <option key={pr.slug} value={pr.slug}>
                    {pr.name}
                  </option>
                ))}
              </select>
              {refusal("productSlug")}
            </div>
            <div>
              <label className={LABEL}>Label shown to customers</label>
              <input name="label" defaultValue={echo("label")} placeholder="Black Friday" className={INPUT} />
            </div>

            <div>
              <label className={LABEL}>Starts — blank means now</label>
              <input type="datetime-local" name="startsAt" defaultValue={echo("startsAt")} className={INPUT} />
              {refusal("startsAt")}
            </div>
            <div>
              <label className={LABEL}>Ends — blank means never</label>
              <input type="datetime-local" name="endsAt" defaultValue={echo("endsAt")} className={INPUT} />
              {refusal("endsAt")}
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm text-fg/80">
                <input type="checkbox" name="active" defaultChecked className="accent-accent" />
                Switched on
              </label>
            </div>

            <div className="sm:col-span-3">
              <label className={LABEL}>Headline — optional, and what the hero says</label>
              <input
                name="headline"
                defaultValue={echo("headline")}
                placeholder="Christmas: 10% off everything, made to order for your car"
                className={INPUT}
              />
            </div>
            <div className="sm:col-span-3">
              <label className={LABEL}>Description — optional, and what the hero says under it</label>
              <input name="description" defaultValue={echo("description")} className={INPUT} />
            </div>

            <div className="sm:col-span-3">
              <SubmitButton className={BTN_PRIMARY}>
                Create promotion
              </SubmitButton>{" "}
              <Link href="/admin/coupons" className="ml-3 text-sm text-fg-muted underline-offset-4 hover:text-accent hover:underline">
                Coupons \u2192
              </Link>
            </div>
          </form>
        </div>
      </details>

    </div>
  );
}