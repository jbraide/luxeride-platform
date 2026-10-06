import Link from "next/link";

import { prisma } from "@/lib/db";
import { createExclusion, deleteExclusion } from "../actions";
import { MAX_REASON_LENGTH, MAX_TRIM_LENGTH, messageFor, readEcho, readFailures } from "../confirm-guard";

/**
 * `/admin/exclusions` — the known non-fits (`fitment-engine` §8.6).
 *
 * An `Exclusion` is not "not measured yet". It says "we looked at this and it does
 * not work", and `checkFitLive` short-circuits on it before any layout is
 * considered so the customer reads that specific sentence instead of a generic
 * refusal. That is only worth anything if the sentence is true, which is why
 * `reason` is REQUIRED and is written by a person: a customer is entitled to
 * argue with a refusal, and a generated reason is an argument they win. There is
 * no fallback sentence anywhere on this screen or in the action.
 *
 * WHY AN EXCLUSION IS NOT A `Vehicle.status = "excluded"` ROW
 *
 * `Vehicle.status` is a catalogue flag — one car is flagged excluded in the seeded
 * data — while an `Exclusion` is a written, dated, removable refusal with a year
 * span and an optional trim. They answer different questions, so both are counted
 * on the dashboard and neither is derived from the other.
 */

export default async function ExclusionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  const failures = readFailures(query);
  const echo = readEcho(query);

  const [exclusions, layouts] = await Promise.all([
    prisma.exclusion.findMany({
      include: { layout: { select: { id: true, internalCode: true } } },
      orderBy: [{ make: "asc" }, { model: "asc" }, { yearFrom: "asc" }],
    }),
    prisma.layout.findMany({ select: { id: true, internalCode: true }, orderBy: { internalCode: "asc" } }),
  ]);

  const label = "block text-xs uppercase tracking-widest text-accent-dim";
  const input =
    "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none";
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
      <h2 className="font-display text-lg font-semibold">Exclusions</h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        Cars somebody specifically looked at and knows we cannot fit. Each one short-circuits{" "}
        <code className="font-mono text-accent-dim">checkFitLive</code> before any layout is considered.
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
          Recorded refusals <span className="font-mono text-xs text-accent-dim">{exclusions.length}</span>
        </h3>

        {exclusions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-surface/60 px-5 py-6 text-sm text-fg-muted">
            No exclusions recorded. That is not the same as everything fitting: it means nobody has
            written one down. A refusal that lives only in the owner&apos;s head is a car we will quote
            by accident.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {exclusions.map((exclusion) => (
              <li key={exclusion.id} className="rounded-xl border border-border bg-surface/60 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-sm text-fg/80">
                    {exclusion.make} {exclusion.model}{" "}
                    <span className="font-mono text-[11px] text-accent-dim">
                      {exclusion.yearFrom}-{exclusion.yearTo}
                    </span>
                    {exclusion.trim && (
                      <span className="ml-2 font-mono text-[11px] text-accent-dim">{exclusion.trim}</span>
                    )}
                  </span>
                  <form method="post" action={deleteExclusion}>
                    <input type="hidden" name="exclusionId" value={exclusion.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-1 text-xs text-fg-muted hover:border-accent hover:text-accent"
                    >
                      Remove
                    </button>
                  </form>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{exclusion.reason}</p>
                <p className="mt-1 font-mono text-[11px] text-accent-dim">
                  {exclusion.layout ? (
                    <Link
                      href={`/admin/layouts/${encodeURIComponent(exclusion.layout.id)}`}
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      written against {exclusion.layout.internalCode}
                    </Link>
                  ) : (
                    "written against no particular layout"
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h3 className="font-display text-base font-semibold">Record one</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          An exclusion is often about a car with no{" "}
          <code className="font-mono text-accent-dim">Vehicle</code> row at all — a hybrid variant, a
          3rd-row derivative, a 7-seat against a 5-seat floor pan — which is why this is named as make
          and model rather than as a vehicle id. Inventing a vehicle to hang a refusal on would be
          manufacturing a catalogue claim to record a refusal.
        </p>

        <form method="post" action={createExclusion} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="make" className={label}>
                Make — required
              </label>
              <input
                id="make"
                name="make"
                required
                defaultValue={echo("make")}
                className={`${input} ${fieldFailed("make")}`}
              />
              {refusal("make")}
            </div>
            <div>
              <label htmlFor="model" className={label}>
                Model — required
              </label>
              <input
                id="model"
                name="model"
                required
                defaultValue={echo("model")}
                className={`${input} ${fieldFailed("model")}`}
              />
              {refusal("model")}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="yearFrom" className={label}>
                From year — required
              </label>
              <input
                id="yearFrom"
                name="yearFrom"
                type="number"
                inputMode="numeric"
                required
                defaultValue={echo("yearFrom")}
                className={`${input} ${fieldFailed("yearFrom")}`}
              />
              {refusal("yearFrom")}
            </div>
            <div>
              <label htmlFor="yearTo" className={label}>
                To year — required
              </label>
              <input
                id="yearTo"
                name="yearTo"
                type="number"
                inputMode="numeric"
                required
                defaultValue={echo("yearTo")}
                className={`${input} ${fieldFailed("yearTo")}`}
              />
              {refusal("yearTo")}
            </div>
            <div>
              <label htmlFor="trim" className={label}>
                Trim — optional
              </label>
              <input
                id="trim"
                name="trim"
                maxLength={MAX_TRIM_LENGTH}
                defaultValue={echo("trim")}
                placeholder="hybrid, 3rd row, 7-seat"
                className={`${input} ${fieldFailed("trim")}`}
              />
              {refusal("trim")}
            </div>
          </div>

          <div>
            <label htmlFor="layoutId" className={label}>
              Layout it was mistaken for — optional
            </label>
            <select
              id="layoutId"
              name="layoutId"
              defaultValue={echo("layoutId")}
              className={`${input} ${fieldFailed("layoutId")}`}
            >
              <option value="">No particular layout</option>
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.internalCode}
                </option>
              ))}
            </select>
            {refusal("layoutId")}
          </div>

          <div>
            <label htmlFor="reason" className={label}>
              Reason — required, in your own words
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              maxLength={MAX_REASON_LENGTH}
              defaultValue={echo("reason")}
              placeholder="What you checked, and why it does not work."
              className={`${input} ${fieldFailed("reason")}`}
            />
            {refusal("reason")}
            <p className="mt-1 text-xs text-fg-muted">
              This sentence is what the customer reads instead of the generic refusal. Write it so you
              would be willing to defend it.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-lg border border-accent bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
          >
            Record the exclusion
          </button>
        </form>
      </section>
    </div>
  );
}