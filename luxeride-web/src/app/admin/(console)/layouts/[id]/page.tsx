import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { confirmLayout } from "../../actions";
import {
  EVIDENCE_VALUES,
  MAX_LEAD_TIME_LENGTH,
  MAX_NOTE_LENGTH,
  messageFor,
  readEcho,
  readFailures,
} from "../../confirm-guard";

/**
 * `/admin/layouts/[id]` — the layout detail screen (`fitment-engine` §8.5).
 *
 * This is the screen that matters. Everything else in the console is a list; this
 * is the one place in the whole system where a car goes from "we have never
 * checked" to "we tell a customer yes", so it is built so that an incomplete
 * confirmation is impossible to save and the reason is always named.
 *
 * WHAT THE FORM REFUSES, AND WHY EACH ONE IS A REFUSAL RATHER THAN A DEFAULT
 *
 *   evidence          one of exactly three values, as radio buttons so there is no
 *                     blank state to submit and nothing outside the union to send.
 *   confirmationNote  required, in the owner's own words. It is the one thing that
 *                     cannot be inferred and a week later it is the only record of
 *                     what was actually checked.
 *   confirmedOn       an ISO date, and not a future one: nobody has checked a
 *                     floor pan on a day that has not happened.
 *   leadTime          required, and "To be confirmed" — the value every preloaded
 *                     row carries — is refused, because that string means nobody has
 *                     measured anything.
 *   year span         per mapped vehicle, `Vehicle.yearFrom`/`yearTo`. This is the
 *                     one with teeth: `checkFitLive` refuses a year outside the
 *                     recorded span, so the span written here is exactly what the
 *                     customer will be told. 2000-2026, the placeholder every
 *                     unverified row carries, is refused.
 *   priceFrom         a positive whole number for EVERY offered variant, because
 *                     `validateLiveLayout` drops a confirmed layout with no
 *                     priceable variant and the customer then gets a refusal for a
 *                     car we have physically checked.
 *   internalCode      ^[A-Z0-9]{2,3}-\d{4}-\d{4}$, unique among confirmed layouts,
 *                     and its year digits must be the years verified below.
 *
 * THE REFUSAL IS SERVER-SIDE AND ALWAYS
 *
 * The inputs carry HTML `required` so a browser stops the obvious mistake, and the
 * Server Action re-checks everything anyway, because a POST can be sent without the
 * form. `confirm-guard.ts` holds the rules; this file only renders them.
 */

/** `ctx.params` is a Promise in Next 16 — `page.md` in the Next docs is explicit. */
export default async function LayoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const layout = await prisma.layout.findUnique({
    where: { id },
    include: {
      make: { select: { name: true } },
      variants: { include: { product: { select: { slug: true, name: true } } } },
      mappings: {
        include: {
          vehicle: { include: { make: { select: { name: true } } } },
        },
      },
      images: { orderBy: { angle: "asc" } },
    },
  });

  if (!layout) notFound();

  const failures = readFailures(query);
  const echo = readEcho(query);
  const saved = typeof query.saved === "string" ? query.saved : "";

  const isConfirmed = layout.status === "confirmed";
  const retired = layout.status === "retired";

  /** One refusal line, placed under the field it names and repeated in the banner. */
  const refusal = (field: string) => {
    const code = failures.get(field);
    if (!code) return null;
    return (
      <p className="mt-1 text-xs leading-relaxed text-[#FF6B35]">
        <span className="font-mono">{field}</span> — {messageFor(code)}
      </p>
    );
  };

  const label = "block text-xs uppercase tracking-widest text-gold-dim";
  const input =
    "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white placeholder:text-muted focus:border-gold focus:outline-none";
  const inputFailed = "border-[#FF6B35]";

  const fieldFailed = (field: string) => (failures.has(field) ? inputFailed : "");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{layout.customerName}</h2>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
          {layout.make.name} · {layout.status}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-gold-dim">
        {layout.internalCode} · {layout.id}
      </p>

      {saved !== "" && (
        <p className="mt-4 rounded-xl border border-line bg-panel/60 px-4 py-3 text-sm text-muted">
          {saved === "confirmed" && "Confirmed. The layout, its prices, its year spans and its mappings were saved as one transaction."}
          {saved === "unchanged" &&
            "Already saved exactly like this. Nothing was written and no audit entry was added — submitting the same confirmation twice is not a change."}
        </p>
      )}

      {failures.size > 0 && (
        <div className="mt-4 rounded-xl border border-[#FF6B35] px-4 py-3 text-sm">
          <p className="text-[#FF6B35]">
            Not saved. {failures.size} field{failures.size === 1 ? "" : "s"} refused:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {[...failures].map(([field, code]) => (
              <li key={field}>
                <span className="font-mono text-white/80">{field}</span> — {messageFor(code)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── The layout as it stands ───────────────────────────────────────── */}
      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">The floor pan</h3>
        <dl className="mt-3 rounded-xl border border-line bg-panel/60 px-5 py-2">
          {[
            ["Customer name", layout.customerName],
            ["Internal code", layout.internalCode],
            ["Status", layout.status],
            ["Make", layout.make.name],
            ["Evidence", layout.evidence ?? "none recorded"],
            ["Evidence note", layout.evidenceNote ?? "—"],
            ["Confirmation note", layout.confirmationNote ?? "—"],
            [
              "Confirmed on",
              layout.confirmedOn ? layout.confirmedOn.toISOString().slice(0, 10) : "—",
            ],
            ["Lead time", layout.leadTime ?? "—"],
            ["Body type", layout.bodyType ?? "—"],
            ["Drive side", layout.driveSide ?? "—"],
            ["Kind", layout.kind],
            ["Notes", layout.notes ?? "—"],
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-4 border-t border-line py-2">
              <dt className="text-sm text-muted">{term}</dt>
              <dd className="text-right text-sm text-white/80">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">Variants</h3>
        <p className="mt-1 text-xs text-muted">
          Four floor-pan products per pan, priced from this brand&apos;s tier when the rows were seeded.
        </p>
        <ul className="mt-3 space-y-1">
          {layout.variants.map((variant) => (
            <li key={variant.id} className="flex items-baseline justify-between border-t border-line py-2 text-sm">
              <span>
                {variant.product.name}
                <span className="ml-2 font-mono text-[11px] text-gold-dim">{variant.kind}</span>
              </span>
              <span className="font-mono text-gold">
                ₦{variant.priceFrom.toLocaleString("en-NG")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h3 className="font-display text-base font-semibold">Mapped vehicles</h3>
        <ul className="mt-3 space-y-1">
          {layout.mappings.map((mapping) => (
            <li key={mapping.id} className="flex items-baseline justify-between border-t border-line py-2 text-sm">
              <span>
                {mapping.vehicle.make.name} {mapping.vehicle.model}
                <span className="ml-2 font-mono text-[11px] text-gold-dim">{mapping.vehicle.sourceKey}</span>
              </span>
              <span className="font-mono text-[11px] uppercase text-muted">{mapping.confidence}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Confirming this layout also raises each of these mappings to{" "}
          <span className="font-mono text-gold-dim">confirmed</span>, because{" "}
          <code className="font-mono text-gold-dim">checkFitLive()</code> reads{" "}
          <code className="font-mono text-gold-dim">Mapping.confidence = &quot;confirmed&quot;</code> and
          would otherwise refuse a floor pan you have physically checked.
        </p>
      </section>

      {layout.images.length > 0 && (
        <section className="mt-8">
          <h3 className="font-display text-base font-semibold">Photographs</h3>
          <ul className="mt-3 space-y-1">
            {layout.images.map((image) => (
              <li key={image.id} className="border-t border-line py-2 text-sm text-muted">
                <span className="font-mono text-[11px] uppercase text-gold-dim">{image.angle}</span>{" "}
                {image.src}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The confirmation ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <h3 className="font-display text-base font-semibold">
          {isConfirmed ? "Re-confirm" : "Confirm this layout"}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          A layout may only say <span className="font-mono text-gold-dim">confirmed</span> on evidence:
          a fitting you did, a written supplier confirmation, or a verified OEM floor pan. Every field
          below is required, and the action refuses the whole submission naming anything missing — it
          never fills a blank in for you.
        </p>

        {retired && (
          <p className="mt-4 rounded-xl border border-line bg-panel/60 px-4 py-3 text-sm text-muted">
            This layout is retired. It is kept so an old WhatsApp reference still resolves to
            something useful, and it cannot be confirmed again.
          </p>
        )}

        <form method="post" action={confirmLayout} className="mt-6 space-y-6">
          <input type="hidden" name="layoutId" value={layout.id} />

          {/* evidence — radios, so there is no blank state and nothing outside the
              union can be submitted even by a hand-written POST. */}
          <fieldset>
            <legend className={label}>Evidence — required</legend>
            <div className="mt-2 space-y-2">
              {EVIDENCE_VALUES.map((value) => (
                <label key={value} className="flex items-center gap-3 text-sm text-white/80">
                  <input
                    type="radio"
                    name="evidence"
                    value={value}
                    required
                    defaultChecked={echo("evidence") === value}
                    className="accent-gold"
                  />
                  <span className="font-mono text-xs">{value}</span>
                </label>
              ))}
            </div>
            {refusal("evidence")}
          </fieldset>

          <div>
            <label htmlFor="confirmationNote" className={label}>
              Confirmation note — required, in your own words
            </label>
            <textarea
              id="confirmationNote"
              name="confirmationNote"
              rows={3}
              required
              maxLength={MAX_NOTE_LENGTH}
              defaultValue={echo("confirmationNote")}
              placeholder="What you actually did, on what car, and when."
              className={`${input} ${fieldFailed("confirmationNote")}`}
            />
            {refusal("confirmationNote")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="confirmedOn" className={label}>
                Confirmed on — required
              </label>
              <input
                id="confirmedOn"
                name="confirmedOn"
                type="date"
                required
                defaultValue={echo("confirmedOn")}
                className={`${input} ${fieldFailed("confirmedOn")}`}
              />
              {refusal("confirmedOn")}
            </div>
            <div>
              <label htmlFor="leadTime" className={label}>
                Lead time — required
              </label>
              <input
                id="leadTime"
                name="leadTime"
                type="text"
                required
                maxLength={MAX_LEAD_TIME_LENGTH}
                defaultValue={echo("leadTime")}
                placeholder="2-3 days"
                className={`${input} ${fieldFailed("leadTime")}`}
              />
              {refusal("leadTime")}
            </div>
          </div>

          <div>
            <label htmlFor="internalCode" className={label}>
              Internal code — required, unique among confirmed layouts
            </label>
            <input
              id="internalCode"
              name="internalCode"
              type="text"
              required
              defaultValue={echo("internalCode") || (isConfirmed ? layout.internalCode : "")}
              placeholder="CRY-2009-2013"
              className={`${input} ${fieldFailed("internalCode")} font-mono`}
            />
            {refusal("internalCode")}
            <p className="mt-1 text-xs text-muted">
              Two or three capitals or digits, then the first and last year you verified below. It is
              the reference a customer quotes in WhatsApp, so it must not name years nobody checked —
              and the preloaded code on every inferred row is{" "}
              <span className="font-mono text-gold-dim">2000-2026</span>, which is exactly that.
            </p>
          </div>

          <fieldset>
            <legend className={label}>The years this floor pan was checked over — required</legend>
            <p className="mt-1 text-xs text-muted">
              Written to{" "}
              <code className="font-mono text-gold-dim">Vehicle.yearFrom</code>/
              <code className="font-mono text-gold-dim">yearTo</code>.{" "}
              <code className="font-mono text-gold-dim">checkFitLive</code> refuses any year outside the
              span recorded here, so what you type is what the customer is told.
            </p>
            <div className="mt-3 space-y-3">
              {layout.mappings.map((mapping) => {
                const fromField = `yearFrom__${mapping.vehicle.id}`;
                const toField = `yearTo__${mapping.vehicle.id}`;
                return (
                  <div key={mapping.vehicle.id} className="rounded-xl border border-line bg-panel/60 px-4 py-3">
                    <p className="text-sm text-white/80">
                      {mapping.vehicle.make.name} {mapping.vehicle.model}
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={fromField} className="text-xs text-muted">
                          From
                        </label>
                        <input
                          id={fromField}
                          name={fromField}
                          type="number"
                          inputMode="numeric"
                          required
                          // What the owner typed in the refused submission wins over
                          // what is stored, so a refusal never costs a retype. A
                          // null stored span contributes nothing — the input opens
                          // EMPTY, which is the whole point: there is no 2000-2026
                          // sitting there waiting to be submitted by accident.
                          defaultValue={
                            echo(fromField) ||
                            (mapping.vehicle.yearFrom === null ? "" : String(mapping.vehicle.yearFrom))
                          }
                          className={`${input} ${fieldFailed(fromField)}`}
                        />
                        {refusal(fromField)}
                      </div>
                      <div>
                        <label htmlFor={toField} className="text-xs text-muted">
                          To
                        </label>
                        <input
                          id={toField}
                          name={toField}
                          type="number"
                          inputMode="numeric"
                          required
                          defaultValue={echo(toField)}
                          className={`${input} ${fieldFailed(toField)}`}
                        />
                        {refusal(toField)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {refusal("vehicles")}
          </fieldset>

          <fieldset>
            <legend className={label}>Prices — one whole number per variant, all required</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {layout.variants.map((variant) => {
                const field = `price__${variant.id}`;
                return (
                  <div key={variant.id}>
                    <label htmlFor={field} className="text-xs text-muted">
                      {variant.product.name}{" "}
                      <span className="font-mono text-gold-dim">{variant.kind}</span>
                    </label>
                    <input
                      id={field}
                      name={field}
                      type="number"
                      inputMode="numeric"
                      required
                      defaultValue={echo(field) || String(variant.priceFrom)}
                      className={`${input} ${fieldFailed(field)} font-mono`}
                    />
                    {refusal(field)}
                  </div>
                );
              })}
            </div>
            {refusal("variants")}
          </fieldset>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={retired}
              className="rounded-lg border border-gold bg-gold px-5 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isConfirmed ? "Save again" : "Confirm this layout"}
            </button>
            <Link href="/admin/layouts" className="text-sm text-muted underline-offset-4 hover:text-gold hover:underline">
              Back to layouts
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}