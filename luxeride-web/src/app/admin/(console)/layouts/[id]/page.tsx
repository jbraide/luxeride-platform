import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  addRange,
  addRangeImage,
  confirmLayout,
  removeRange,
  removeRangeImage,
  setLayoutActive,
  setSeatRows,
  setVehicleActive,
} from "../../actions";
import {
  deriveInternalCode,
  EVIDENCE_VALUES,
  IMAGE_ANGLES,
  MAX_LEAD_TIME_LENGTH,
  MAX_NOTE_LENGTH,
  messageFor,
  rangePriceKey,
  readEcho,
  readFailures,
} from "../../confirm-guard";
import { DEFAULT_LEAD_TIME } from "@/lib/copy";
import { FLOOR_MAT_GENERATIONS } from "@/data/floor-mats-generations";
import PageHeader from "@/components/admin/PageHeader";
import FieldErrors from "@/components/admin/FieldErrors";
import EmptyState from "@/components/admin/EmptyState";
import StatusChip, { type StatusTone } from "@/components/admin/StatusChip";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_ROW,
  BTN_SECONDARY,
  CARD,
  EYEBROW,
  FIELD_ERROR,
  INPUT,
  INSET,
  LABEL,
  NUM,
  SECTION_HINT,
  SECTION_TITLE,
  inputState,
} from "@/components/admin/ui";


/**
 * `/admin/layouts/[id]` — one CAR, with its year ranges (`fitment-engine` §8.5).
 *
 * THE PAGE IS A CAR, NOT A RANGE.
 *
 * It used to be one floor pan for one vehicle, so a Corolla and a Corolla were
 * two pages at two URLs and there was no single place that said "this is the
 * Corolla". It is now the car: the layout record at the top, then a RANGE per
 * `Vehicle` mapped onto it — `2009–2013`, `2014–2020` — each with its own
 * photographs. Adding a range is the "add a stop" step: two years in, and a
 * `Vehicle` for the same make and model is mapped onto this layout.
 *
 * WHAT THE CONFIRMATION FORM REFUSES, AND WHY EACH ONE IS A REFUSAL
 *
 *   evidence          one of exactly three values, as radio buttons so there is no
 *                     blank state to submit and nothing outside the union to send.
 *   confirmationNote  required, in the owner's own words.
 *   confirmedOn       an ISO date, and not a future one.
 *   leadTime          required; "To be confirmed" is refused.
 *   year span         per range, `Vehicle.yearFrom`/`yearTo`. `checkFitLive` refuses
 *                     a year outside the recorded span, so the span written here is
 *                     exactly what the customer will be told. 2000-2026, the
 *                     placeholder every unverified row carries, is refused.
 *   priceFrom         a positive whole number for EVERY offered variant.
 *   internalCode      ^[A-Z0-9]{2,3}-\d{4}-\d{4}$, unique among confirmed layouts,
 *                     and its year digits must be the years verified below.
 *
 * THE FIELDS START EMPTY ON PURPOSE. That is the sentence this screen has to say
 * out loud, because an empty form next to a record reads as "make a new one". It
 * is not: the record at the top is what exists, and the form below is what is still
 * missing to turn THIS car from a refusal into a yes. Nothing is prefilled with a
 * value nobody checked — the year boxes show what was verified if anything was,
 * and stay empty if not.
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
      variants: {
        include: {
          product: { select: { slug: true, name: true } },
          // WHICH OPTION of the product this offer is. Both mat layers are the same
          // product, so the product name alone labels two price boxes identically —
          // and the photo form below has to offer a choice between them.
          variation: { select: { id: true, slug: true, name: true } },
          // The per-year prices. The price grid pre-fills from these, nearest
          // first: a cell that already has a price opens showing that price, and
          // only a cell with none falls back to the offer's default.
          rangePrices: true,
        },
      },
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

  const isConfirmed = layout.status === "confirmed";
  const retired = layout.status === "retired";

  /**
   * The layout's own status as a chip tone, matching `/admin/layouts`: a confirmed car
   * reads affirmative, the unverified `inferred` state reads as a to-do, and `draft` /
   * `retired` / anything unknown read quiet.
   */
  const statusTone: StatusTone =
    layout.status === "confirmed" ? "good" : layout.status === "inferred" ? "warn" : "neutral";

  /** One refusal line, placed under the field it names and repeated in the banner. */
  const refusal = (field: string) => {
    const code = failures.get(field);
    if (!code) return null;
    return (
      <p className={FIELD_ERROR}>
        <span className="font-mono">{field}</span> — {messageFor(code)}
      </p>
    );
  };

  // Ranges, newest first is meaningless here; earliest covered year first so the
  // page reads like a timeline. A span-less range (never expected on a new range)
  // sorts last rather than throwing.
  /**
   * The code this car will get if nobody overrides it — shown so the operator can see
   * what they are NOT being asked to type, and so a collision is visible before it is
   * submitted rather than as a refusal.
   */
  const derivedCode = deriveInternalCode({
    make: layout.make.name,
    model: layout.mappings[0]?.vehicle.model ?? layout.customerName.trim(),
    years: layout.mappings
      .map((mapping) => mapping.vehicle)
      .filter((vehicle) => vehicle.yearFrom !== null && vehicle.yearTo !== null)
      .map((vehicle) => ({ yearFrom: vehicle.yearFrom as number, yearTo: vehicle.yearTo as number })),
  });

  const ranges = [...layout.mappings]
    .map((mapping) => ({
      mapping,
      vehicle: mapping.vehicle,
      // Grouped BY OPTION, because that is the axis the photographs are keyed on.
      // A flat list of (range, photo) rows cannot say which layer a shot shows, and
      // two layers of the same car look different — so the grid is per option.
      images: layout.images.filter((image) => image.vehicleId === mapping.vehicle.id),
    }))
    .sort((a, b) => (a.vehicle.yearFrom ?? 9999) - (b.vehicle.yearFrom ?? 9999));

  /**
   * WHAT ONE OFFER IS CALLED ON THIS PAGE: the product, then the layer.
   *
   * Since 2026-10-05 a single-layer set and a double-layer set are both "Floor Mats",
   * so a price grid labelled with the product name alone renders two identical rows
   * at different prices with nothing to tell them apart — and the operator editing
   * them has no way to know which is which. The option name is what distinguishes
   * them, and the `kind` stays as a quiet second signal for the boot liner and the
   * bundle, which are products of their own with one option each.
   */
  const offerLabel = (variant: (typeof layout.variants)[number]): string =>
    variant.variation ? `${variant.product.name} — ${variant.variation.name}` : variant.product.name;

  /**
   * THE OPTIONS A PHOTOGRAPH MAY BE ATTACHED TO ON THIS CAR.
   *
   * Only offers that NAME one. `ImageSet.variationId` is required, and `addRangeImage`
   * refuses an option this floor pan does not offer — so an offer with no `variationId`
   * has no photograph slot at all, and rendering a form for it would offer the operator a
   * submission the server is contractually obliged to refuse.
   *
   * For a car cut for both layers this is two entries with the SAME product name, so
   * `offerLabel` above is what tells them apart on screen. That is deliberate: the
   * operator is choosing which layer the photograph shows, and two rows both reading
   * "Floor Mats" would make that impossible.
   */
  type PhotoOption = (typeof layout.variants)[number] & { variationId: string };
  const photoOptions = layout.variants.filter(
    (variant): variant is PhotoOption => variant.variationId !== null && variant.variation !== null,
  );

  /**
   * THE OPTION'S OWN ID — `ProductVariation.id`, NOT `LayoutVariant.id`.
   *
   * The two are different rows with different ids, and mixing them up is silent:
   * `addRangeImage` checks the submitted value against `LayoutVariant.variationId`, so
   * a form posting this layout's `LayoutVariant.id` is refused with
   * `variationNotOffered` on every single submission and the page still renders
   * normally. It was caught by reading the rendered HTML rather than the source, and
   * it is named here because the names are one word apart.
   */
  const optionId = (option: PhotoOption): string => option.variationId;

  return (
    <div>
      <PageHeader
        title={layout.customerName}
        meta={
          <>
            One car.{" "}
            {ranges.length === 0
              ? "No year range is mapped yet, so nobody can be answered for it."
              : `${ranges.length} range${ranges.length === 1 ? "" : "s"} — the years this floor pan covers.`}
          </>
        }
        actions={
          <>
            <StatusChip tone={layout.active ? "good" : "neutral"}>
              {layout.active ? "live" : "withdrawn"}
            </StatusChip>

            {/*
              THE CAR SWITCH — the single control that decides whether this car is offered.

              It is at the TOP of the page, above the years and the prices, because it is the
              question that matters first: "do we supply this car at all?" Everything below
              it is detail about a car that is on.

              `formNoValidate` on the OFF button, because that button lives INSIDE the
              confirmation form and a browser would otherwise validate every field in it —
              blank prices included — and refuse to submit a one-click withdrawal. That is the
              same trap as the nested form: a control that silently stops working because of
              where it sits in the DOM.
            */}
            <form method="post" action={setLayoutActive} className="contents">
              <input type="hidden" name="layoutId" value={layout.id} />
              <input type="hidden" name="active" value={layout.active ? "off" : "on"} />
              <button
                type="submit"
                formNoValidate
                className={`rounded-lg border px-4 py-1.5 text-sm transition-colors ${
                  layout.active
                    ? "border-border text-fg-muted hover:border-danger hover:text-danger"
                    : "border-accent bg-accent text-on-accent"
                }`}
              >
                {layout.active ? "Withdraw this car" : "Put it live"}
              </button>
            </form>
          </>
        }
      />
      <p className="mt-2 font-mono text-xs text-accent-dim">
        {layout.internalCode} · {layout.id}
      </p>


      <FieldErrors failures={failures} message={messageFor} />

      {/* ── Ranges ────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <p className={EYEBROW}>01</p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className={SECTION_TITLE}>Ranges</h3>
          <span className={EYEBROW}>
            {ranges.length} range{ranges.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className={SECTION_HINT}>
          One car, several year ranges. A Corolla 2009–2013 is not a Corolla 2014–2020, so each is
          its own range with its own photographs. Confirm the car once, below — every range is
          written together, and every range&apos;s mapping is raised to confirmed at the same time.
        </p>

        {ranges.length === 0 ? (
          <EmptyState className="mt-4">
            This car covers no years, so no customer can be answered for it. Add a range below.
          </EmptyState>
        ) : (
          <ul className="mt-4 space-y-3">
            {ranges.map(({ mapping, vehicle, images }) => (
              <li key={mapping.id} className={`${CARD} px-4 py-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-sm text-fg/80">
                    {vehicle.make.name} {vehicle.model}
                    <span className="ml-2 font-mono text-[11px] text-accent">
                      {vehicle.yearFrom ?? "?"}–{vehicle.yearTo ?? "?"}
                    </span>
                    {(() => {
                      const gen = (FLOOR_MAT_GENERATIONS as unknown as Record<string, Record<string, [number, number]>>)[vehicle.make.name]?.[vehicle.model];
                      return gen ? (
                        <span className="ml-2 rounded border border-accent/30 bg-accent/5 px-1.5 py-0.5 font-mono text-[10px] text-accent-dim">
                          Gen {gen[0]}–{gen[1]}
                        </span>
                      ) : null;
                    })()}
                    {!vehicle.active && (
                      <span className="ml-2">
                        <StatusChip tone="neutral">withdrawn</StatusChip>
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {/*
                      THE PER-YEAR SWITCH, next to the range it governs.

                      Same shape as the car switch and the same reason it carries
                      `formNoValidate`: it sits inside the confirmation form, so without
                      it a browser would validate the whole price grid and refuse a
                      one-click withdrawal of one generation.
                    */}
                    <form method="post" action={setVehicleActive} className="contents">
                      <input type="hidden" name="layoutId" value={layout.id} />
                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                      <input type="hidden" name="active" value={vehicle.active ? "off" : "on"} />
                      <button
                        type="submit"
                        formNoValidate
                        title={
                          vehicle.active
                            ? "Stop offering these years. The prices and photographs are kept."
                            : "Offer these years again"
                        }
                        className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                          vehicle.active
                            ? "border-border text-fg-muted hover:border-danger hover:text-danger"
                            : "border-accent bg-accent text-on-accent"
                        }`}
                      >
                        {vehicle.active ? "Withdraw" : "Put live"}
                      </button>
                    </form>
                    <form method="post" action={removeRange}>
                      <input type="hidden" name="layoutId" value={layout.id} />
                      <input type="hidden" name="vehicleId" value={vehicle.id} />
                      <button type="submit" className={BTN_ROW}>
                        Remove range
                      </button>
                    </form>
                  </div>
                </div>

                {images.length > 0 ? (
                  /* ONE BLOCK PER OPTION. A single-layer set and a double-layer set cut
                     for the same car are different objects that look different, so the
                     photographs have to say which one they show — a gallery that showed
                     the single-layer shot to somebody buying the double layer would be
                     showing them evidence of something they did not receive, on the one
                     screen whose job is to prove the claim. */
                  <ul className="mt-3 space-y-3">
                    {photoOptions.map((option) => {
                      const forOption = images.filter((image) => image.variationId === optionId(option));
                      return (
                        <li key={option.id}>
                          <p className="font-mono text-[11px] uppercase tracking-wide text-accent-dim">
                            {offerLabel(option)}
                          </p>
                          {forOption.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                              {forOption.map((image) => (
                                <li
                                  key={image.id}
                                  className="flex items-baseline justify-between gap-3 border-t border-border py-2 text-sm"
                                >
                                  <span className="min-w-0">
                                    <span className="font-mono text-[11px] uppercase text-accent-dim">
                                      {image.angle}
                                    </span>{" "}
                                    <span className="text-fg-muted">{image.src}</span>
                                    <span className="block text-[11px] text-accent-dim">
                                      {image.alt}
                                    </span>
                                  </span>
                                  <form method="post" action={removeRangeImage}>
                                    <input type="hidden" name="layoutId" value={layout.id} />
                                    <input type="hidden" name="imageId" value={image.id} />
                                    <button type="submit" className={BTN_GHOST}>
                                      Remove
                                    </button>
                                  </form>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-xs text-fg-muted">
                              Nothing photographed for this option yet.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-fg-muted">
                    No photographs for this range yet. Each option gets its own set.
                  </p>
                )}

                {photoOptions.map((option) => (
                  <form
                    key={option.id}
                    method="post"
                    action={addRangeImage}
                    className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border px-3 py-3"
                  >
                    <input type="hidden" name="layoutId" value={layout.id} />
                    <input type="hidden" name="vehicleId" value={vehicle.id} />
                    <input type="hidden" name="variationId" value={optionId(option)} />
                    <div>
                      <label htmlFor={`angle__${vehicle.id}__${option.id}`} className="text-xs text-fg-muted">
                        Angle — {option.variation?.name ?? option.product.name}
                      </label>
                      <select
                        id={`angle__${vehicle.id}__${option.id}`}
                        name="angle"
                        defaultValue="driver"
                        className={INPUT}
                      >
                        {IMAGE_ANGLES.map((angle) => (
                          <option key={angle} value={angle}>
                            {angle}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[12rem] flex-1">
                      <label htmlFor={`src__${vehicle.id}__${option.id}`} className="text-xs text-fg-muted">
                        Path or URL
                      </label>
                      <input
                        id={`src__${vehicle.id}__${option.id}`}
                        name="src"
                        placeholder="/fitment/corolla-2009-driver.jpg"
                        className={INPUT}
                      />
                    </div>
                    <div className="min-w-[12rem] flex-1">
                      <label htmlFor={`alt__${vehicle.id}__${option.id}`} className="text-xs text-fg-muted">
                        Alt text
                      </label>
                      <input
                        id={`alt__${vehicle.id}__${option.id}`}
                        name="alt"
                        placeholder="Driver footwell, 2009 Corolla"
                        className={INPUT}
                      />
                    </div>
                    <button type="submit" className={BTN_SECONDARY}>
                      Add photo
                    </button>
                  </form>
                ))}
              </li>
            ))}
          </ul>
        )}

        {/* The "add a stop" step: two years in, a range out. */}
        <form
          method="post"
          action={addRange}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border px-4 py-4"
        >
          <input type="hidden" name="layoutId" value={layout.id} />
          <div>
            <label htmlFor="yearFrom" className={LABEL}>
              From year
            </label>
            <input
              id="yearFrom"
              name="yearFrom"
              type="number"
              inputMode="numeric"
              required
              defaultValue={echo("yearFrom")}
              className={`${INPUT} ${inputState(failures.has("yearFrom"))}`}
            />
            {refusal("yearFrom")}
          </div>
          <div>
            <label htmlFor="yearTo" className={LABEL}>
              To year
            </label>
            <input
              id="yearTo"
              name="yearTo"
              type="number"
              inputMode="numeric"
              required
              defaultValue={echo("yearTo")}
              className={`${INPUT} ${inputState(failures.has("yearTo"))}`}
            />
            {refusal("yearTo")}
          </div>
          <button type="submit" className={BTN_PRIMARY}>
            Add range
          </button>
          <p className="w-full text-xs leading-relaxed text-fg-muted">
            Adds a year range of this same {layout.make.name} model onto this car. Two ranges for one
            car may not overlap — a year has to resolve to one floor pan.
          </p>
        </form>
      </section>

      {/* ── The car as it stands ──────────────────────────────────────────── */}
      <section className="mt-8">
        <p className={EYEBROW}>02</p>
        <h3 className={`mt-2 ${SECTION_TITLE}`}>The car</h3>
        <dl className="mt-3 rounded-xl border border-border bg-surface/60 px-5 py-2">
          {[
            ["Customer name", layout.customerName],
            ["Internal code", layout.internalCode],
            ["Status", layout.status],
            ["Make", layout.make.name],
            ["Evidence", layout.evidence ?? "none recorded"],
            ["Evidence note", layout.evidenceNote ?? "—"],
            ["Confirmation note", layout.confirmationNote ?? "—"],
            ["Confirmed on", layout.confirmedOn ? layout.confirmedOn.toISOString().slice(0, 10) : "—"],
            ["Lead time", layout.leadTime ?? "—"],
            ["Body type", layout.bodyType ?? "—"],
            ["Drive side", layout.driveSide ?? "—"],
            ["Kind", layout.kind],
            ["Notes", layout.notes ?? "—"],
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-4 border-t border-border py-2">
              <dt className="text-sm text-fg-muted">{term}</dt>
              <dd className="text-right text-sm text-fg/80">
                {term === "Status" ? <StatusChip tone={statusTone}>{value}</StatusChip> : value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <p className={EYEBROW}>03</p>
        <h3 className={`mt-2 ${SECTION_TITLE}`}>What we offer for this car</h3>
        <p className={SECTION_HINT}>
          {layout.variants.length} products cut for this floor pan. The naira figure here is the{" "}
          <span className="text-fg/80">default for a newly added year range</span> — what a
          customer is actually quoted is the per-range price in the grid below, and a range with no
          price there cannot be quoted at all.
        </p>
        <ul className="mt-3 space-y-1">
          {layout.variants.map((variant) => (
            <li key={variant.id} className="flex items-baseline justify-between border-t border-border py-2 text-sm">
              <span>
                {offerLabel(variant)}
                <span className="ml-2 font-mono text-[11px] text-accent-dim">{variant.kind}</span>
              </span>
              <span className={`font-mono text-accent ${NUM}`}>₦{variant.priceFrom.toLocaleString("en-NG")}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The confirmation ────────────────────────────────────────────────
          *
          * WHAT IS ON THIS FORM, AND WHY IT IS NOT MORE
          *
          * The owner, using this form: *"the admin fields for the layout are still
          * obstructing, there are fields that just don't need to block edits — lead
          * times, all that shit. I need that form to be simple."*
          *
          * So the screen is now split in two, and the split is the whole design:
          *
          *   ABOVE THE FOLD — the years and the prices. These are the only two facts
          *   that genuinely vary per car, and the only two anything downstream depends
          *   on. `/api/fit-check` reads `RangePrice` and the recorded span, so a car
          *   cannot be quoted without them and nothing else can make a car quotable.
          *   Everything about this form exists to let you type those and press the
          *   button.
          *
          *   COLLAPSED BELOW — the recording details. Evidence, your own note, the
          *   date, the lead time and the reference code. All optional, all defaulted,
          *   none of them able to stop a save. They are kept because they are worth
          *   having in the audit log when you DO want them — and because deleting a
          *   field someone might rely on is worse than not asking for it.
          *
          * The lead time went furthest: it became `DEFAULT_LEAD_TIME` in the copy
          * register, because a lead time is how long WE take and is the same for all
          * 212 cars. The internal code is DERIVED from the make and the years above it,
          * so there is nothing to type.
          */}
      <section className="mt-10">
        <p className={EYEBROW}>04</p>
        <h3 className={`mt-2 ${SECTION_TITLE}`}>
          {isConfirmed ? "Update this car" : "Confirm this car"}
        </h3>
        <p className={SECTION_HINT}>
          Type the years this car is covered for, and what each one costs. That is the whole form.
          Everything else is optional and is tucked away underneath.
        </p>

        {retired && (
          <p className={`mt-4 text-sm text-fg-muted ${INSET}`}>
            This car is retired. It is kept so an old WhatsApp reference still resolves to something
            useful, and it cannot be confirmed again.
          </p>
        )}

        {ranges.length === 0 && (
          <p className={`mt-4 text-sm text-fg-muted ${INSET}`}>
            Add at least one range above before confirming — a car with no years cannot be quoted.
          </p>
        )}

        {/* ── ROWS OF SEATS ──────────────────────────────────────────────────────
          *
          * A SIBLING OF THE CONFIRM FORM, NOT A CHILD OF IT. This is the second
          * version of this control; the first nested `<form action={setSeatRows}>`
          * inside `<form action={confirmLayout}>`, and it did not work at all.
          *
          * HTML forbids nested forms, and browsers resolve that by DROPPING the inner
          * `<form>` start tag rather than by reporting an error — so `action={setSeatRows}`
          * was discarded at parse time and every button here submitted `confirmLayout`
          * with the entire price grid attached. The symptom the owner reported was "the
          * button does nothing".
          *
          * The lesson generalises past this file: a React Server Action on a `<form>` is
          * a real form element, and nesting one inside another is silently discarded.
          * Every other action on this page already sat in its own top-level form for
          * this reason; this one did not, and it cost a round trip to find out.
          *
          * A THREE-STATE choice, and the middle one is the point. The Fit Finder has
          * always asked "2 rows or 3 rows?" and charged the surcharge on the answer.
          * That is right for a car sold as both — a Highlander really is both — and
          * wrong for one that is only ever three rows, where we are asking the customer
          * something we already know and they can get it wrong.
          *
          * "Ask them" rather than a checkbox, because the interesting state is the one
          * that says "we do not know yet" and a two-state control cannot express it.
          */}
        <fieldset>
          <legend className={LABEL}>How many rows of seats does this car have?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                { value: "2", label: "2 rows" },
                { value: "3", label: "3 rows" },
                { value: "mixed", label: "Ask them" },
              ] as const
            ).map((option) => (
              <form key={option.value} method="post" action={setSeatRows}>
                <input type="hidden" name="layoutId" value={layout.id} />
                <input type="hidden" name="seatRows" value={option.value} />
                <button
                  type="submit"
                  aria-pressed={layout.seatRows === option.value}
                  className={layout.seatRows === option.value ? BTN_PRIMARY : BTN_SECONDARY}
                >
                  {option.label}
                </button>
              </form>
            ))}
          </div>
          {refusal("seatRows")}
          <p className="mt-1 text-xs text-fg-muted">
            {layout.seatRows === "mixed"
              ? "The Fit Finder will ask the customer. That is right for a car sold as both a 2-row and a 3-row."
              : `The Fit Finder will not ask, and will assume ${layout.seatRows} rows — and will add the 3-row surcharge itself where the product has one.`}
          </p>
        </fieldset>

        <form method="post" action={confirmLayout} className="mt-6 space-y-6">
          <input type="hidden" name="layoutId" value={layout.id} />

          {/* ── 1. THE YEARS ──────────────────────────────────────────────── */}
          <fieldset>
            <legend className={LABEL}>Which years this car is covered for</legend>
            <p className="mt-1 text-xs text-fg-muted">
              We refuse any year outside these, so what you type is what the customer is told.
            </p>
            <div className="mt-3 space-y-3">
              {ranges.map(({ vehicle }) => {
                const fromField = `yearFrom__${vehicle.id}`;
                const toField = `yearTo__${vehicle.id}`;
                return (
                  <div key={vehicle.id} className="rounded-xl border border-border bg-surface/60 px-4 py-3">
                    <label htmlFor={fromField} className="text-sm text-fg/80">
                      {vehicle.make.name} {vehicle.model}
                    </label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        id={fromField}
                        name={fromField}
                        type="number"
                        inputMode="numeric"
                        required
                        aria-label={`${vehicle.make.name} ${vehicle.model} — first year`}
                        defaultValue={
                          echo(fromField) ||
                          (vehicle.yearFrom === null ? "" : String(vehicle.yearFrom))
                        }
                        className={`${INPUT} ${inputState(failures.has(fromField))} max-w-[8rem] font-mono ${NUM}`}
                      />
                      <span className="text-fg-muted">to</span>
                      <input
                        id={toField}
                        name={toField}
                        type="number"
                        inputMode="numeric"
                        required
                        aria-label={`${vehicle.make.name} ${vehicle.model} — last year`}
                        defaultValue={
                          echo(toField) || (vehicle.yearTo === null ? "" : String(vehicle.yearTo))
                        }
                        className={`${INPUT} ${inputState(failures.has(toField))} max-w-[8rem] font-mono ${NUM}`}
                      />
                    </div>
                    {refusal(fromField)}
                    {refusal(toField)}
                  </div>
                );
              })}
            </div>
            {refusal("vehicles")}
          </fieldset>

          {/* ── 3. THE PRICES ─────────────────────────────────────────────── */}
          <fieldset>
            <legend className={LABEL}>What each year costs</legend>
            <p className="mt-1 text-xs text-fg-muted">
              This is the number a customer is quoted, and it is why every box is filled. Boxes open
              showing what is already on that year, or the default where there is none.
            </p>

            {ranges.map(({ vehicle }) => (
              <div key={vehicle.id} className={`mt-3 ${CARD} px-4 py-4`}>
                <p className="flex flex-wrap items-baseline gap-2 text-sm text-fg/80">
                  <span className="font-mono text-accent">
                    {vehicle.yearFrom ?? "?"}–{vehicle.yearTo ?? "?"}
                  </span>
                  {vehicle.make.name} {vehicle.model}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {layout.variants.map((variant) => {
                    const key = rangePriceKey(vehicle.id, variant.id);
                    const field = `rangePrice__${key}`;
                    const existing = variant.rangePrices.find((price) => price.vehicleId === vehicle.id);
                    return (
                      <div key={variant.id}>
                        <label htmlFor={field} className="text-xs text-fg-muted">
                          {offerLabel(variant)}{" "}
                          <span className="font-mono text-accent-dim">{variant.kind}</span>
                        </label>
                        <input
                          id={field}
                          name={field}
                          type="number"
                          inputMode="numeric"
                          required
                          defaultValue={
                            echo(field) ||
                            (existing ? String(existing.priceFrom) : String(variant.priceFrom))
                          }
                          className={`${INPUT} ${inputState(failures.has(field))} font-mono ${NUM}`}
                        />
                        {refusal(field)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {refusal("variants")}
          </fieldset>

          {/* ── 4. OPTIONAL, COLLAPSED ───────────────────────────────────── */}
          {/*
            A plain `<details>`, NOT a client component and NOT a useState toggle. It
            opens and closes with no JavaScript, it holds no state to get out of sync,
            and it renders identically on the server — which is the rule the whole
            console has followed since it was built. The admin has no `'use client'`
            anywhere and this does not introduce one.

            It is OPEN when the submission was refused, because a refusal names a field
            and a collapsed field the operator cannot see is a field they cannot fix.
          */}
          <details
            open={failures.size > 0}
            className="rounded-xl border border-border bg-surface/60"
          >
            <summary className="cursor-pointer list-none px-4 py-3 text-sm text-fg/80 marker:content-none">
              <span className="font-mono text-[11px] uppercase tracking-widest text-accent-dim">
                Optional
              </span>{" "}
              <span className="ml-2">Recording details</span>
              <span className="ml-2 text-xs text-fg-muted">
                evidence, your note, the date, the lead time, the reference code
              </span>
            </summary>

            <div className="space-y-5 border-t border-border px-4 py-4">
              <p className="text-xs leading-relaxed text-fg-muted">
                None of this stops a save. Leave the whole section alone and the car is confirmed
                with the years and prices above.
              </p>

              {/* The DERIVED code, shown read-only with the value it will get, and a
                  text input behind a checkbox for the one case derivation cannot fix:
                  two cars whose ticker collides. `CLA-2000-2026` is both a Corolla and
                  a Mercedes CLA, so this genuinely happens. */}
              <div>
                <label className={LABEL}>Reference code</label>
                <p className="mt-1 rounded-lg border border-border bg-surface/2 px-3 py-2 font-mono text-sm text-accent-dim">
                  {derivedCode ?? "— set a year range above —"}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Worked out from the make and the years above. You never have to type it.
                </p>
                {refusal("internalCode")}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-fg-muted underline-offset-4 hover:text-accent">
                    Set it by hand
                  </summary>
                  <div className="mt-2">
                    <input
                      id="internalCode"
                      name="internalCode"
                      type="text"
                      defaultValue={echo("internalCode")}
                      placeholder={derivedCode ?? "CRY-2009-2013"}
                      className={`${INPUT} ${inputState(failures.has("internalCode"))} font-mono`}
                    />
                    <p className="mt-1 text-xs text-fg-muted">
                      Only if two cars would get the same code. This car currently carries{" "}
                      <span className="font-mono text-accent-dim">{layout.internalCode}</span>.
                    </p>
                  </div>
                </details>
              </div>

              <div>
                <label htmlFor="leadTime" className={LABEL}>
                  Lead time for this car — leave blank unless it differs
                </label>
                <input
                  id="leadTime"
                  name="leadTime"
                  type="text"
                  maxLength={MAX_LEAD_TIME_LENGTH}
                  defaultValue={echo("leadTime") || (isConfirmed ? layout.leadTime ?? "" : "")}
                  placeholder={`Leave blank — we quote ${DEFAULT_LEAD_TIME}`}
                  className={`${INPUT} ${inputState(failures.has("leadTime"))}`}
                />
                {refusal("leadTime")}
                <p className="mt-1 text-xs text-fg-muted">
                  The same for every car unless one is genuinely slower. Change the standard in{" "}
                  <code className="font-mono text-accent-dim">src/lib/copy.ts</code>.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="confirmedOn" className={LABEL}>
                    Date checked — defaults to today
                  </label>
                  <input
                    id="confirmedOn"
                    name="confirmedOn"
                    type="date"
                    defaultValue={echo("confirmedOn")}
                    className={`${INPUT} ${inputState(failures.has("confirmedOn"))}`}
                  />
                  {refusal("confirmedOn")}
                </div>
                <div>
                  <label htmlFor="evidence" className={LABEL}>
                    How you checked it
                  </label>
                  <select
                    id="evidence"
                    name="evidence"
                    defaultValue={echo("evidence") || layout.evidence || ""}
                    className={`${INPUT} ${inputState(failures.has("evidence"))}`}
                  >
                    <option value="">Not recorded</option>
                    {EVIDENCE_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  {refusal("evidence")}
                </div>
              </div>

              <div>
                <label htmlFor="confirmationNote" className={LABEL}>
                  Your own note — optional
                </label>
                <textarea
                  id="confirmationNote"
                  name="confirmationNote"
                  rows={2}
                  maxLength={MAX_NOTE_LENGTH}
                  defaultValue={echo("confirmationNote") || (isConfirmed ? layout.confirmationNote ?? "" : "")}
                  placeholder="What you actually did, on what car, and when."
                  className={`${INPUT} ${inputState(failures.has("confirmationNote"))}`}
                />
                {refusal("confirmationNote")}
              </div>

              {/* The per-offer DEFAULT — what a year range added TOMORROW starts
                  from. Optional, and tucked in here rather than in the main grid
                  because it is not about this car's current prices at all. */}
              <fieldset className="border-t border-border pt-4">
                <legend className={LABEL}>Starting price for a newly added year — optional</legend>
                <p className="mt-1 text-xs text-fg-muted">
                  Only used when you add a year range later. It changes nothing that already has a
                  price.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {layout.variants.map((variant) => {
                    const field = `price__${variant.id}`;
                    return (
                      <div key={variant.id}>
                        <label htmlFor={field} className="text-xs text-fg-muted">
                          {offerLabel(variant)}{" "}
                          <span className="font-mono text-accent-dim">{variant.kind}</span>
                        </label>
                        <input
                          id={field}
                          name={field}
                          type="number"
                          inputMode="numeric"
                          defaultValue={echo(field) || String(variant.priceFrom)}
                          className={`${INPUT} ${inputState(failures.has(field))} font-mono ${NUM}`}
                        />
                        {refusal(field)}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={retired || ranges.length === 0} className={BTN_PRIMARY}>
              {isConfirmed ? "Save again" : "Confirm this car"}
            </button>
            <Link href="/admin/layouts" className={BTN_GHOST}>
              Back to layouts
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
