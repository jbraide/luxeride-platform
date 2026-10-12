"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProductImage from "@/components/ProductImage";
import ProductPlaceholder from "@/components/ProductPlaceholder";
import Link from "next/link";
import { BRANDS, FLAT_CARS, POPULAR_CARS, Tier } from "@/data/cars";
import type { Product } from "@/data/products";
import type { ProductMedia } from "@/lib/media";
import { productBase } from "@/lib/pricing";
import { fmtNaira } from "@/lib/pricing";
import { Chip } from "@/components/Chip";
import { Button } from "@/components/Button";
import { useCartStore } from "@/store/cart";
import {
  whatsappLink,
  comingSoonMessage,
  notFoundMessage,
  photosRequestMessage,
  offerMessage,
} from "@/lib/whatsapp";
import type { FitCheckResponse, FitVariantOffer } from "@/lib/fitment-contract";
import { track } from "@/lib/analytics";
import { fittedCopy, guarantee, refusals } from "@/lib/copy";
import type { RefusalCopy } from "@/lib/copy";
import type { ResolvedLanding } from "@/data/landing";
import {
  MATS_PRODUCT_SLUG,
  MAT_TYPE_LABEL,
  MAT_TYPE_VARIATION,
  matTypeForVariation,
  type MatTypeKind,
} from "@/data/fitment-catalogue";
import {
  clampRowsToSeating,
  offeredRows as rowsThisCarMayBeSold,
  rowsToQuote,
  type RowCount,
  type SeatRows,
} from "@/lib/seat-rows";

/**
 * `results` is now reachable ONLY on a server-confirmed FITTED. Both refusal
 * states render through `comingsoon`, which is the renderer the spec names for
 * them. The fabricated card that used to appear for all 4,671 car/year
 * combinations in `src/data/cars.ts` is gone.
 */
type Step =
  | "car"
  | "year"
  | "product"
  | "row"
  | "checking"
  | "results"
  | "comingsoon"
  | "lockedmiss";

/**
 * The year window, and why it is not a constant any more.
 *
 * It WAS `2000…2026` for every model in `src/data/cars.ts`, which has no year
 * dimension at all — so a Toyota Matrix, a car that stopped being made in 2014, was
 * offered as a 2026 car and a 2003 one was never offered at all. That is a wrong list
 * on a screen whose entire job is to be right about cars.
 *
 * Now: once a make and model are chosen, `/api/fit-years` returns the spans actually
 * on record, and the dropdown is built from THOSE. `cars.ts` is unchanged, because
 * the spans are the owner's to enter in the admin — this component asks, it does not
 * assert. A car with nothing recorded falls back to the window below, which is
 * exactly what it has always been, and the fit check then refuses it honestly.
 */
const FALLBACK_YEAR_FROM = 2000;
const FALLBACK_YEAR_TO = 2026;

function yearsIn(from: number, to: number): number[] {
  const list: number[] = [];
  for (let year = to; year >= from; year -= 1) list.push(year);
  return list;
}

/** One year range, as recorded. `null` spans are not on record and contribute nothing. */
interface YearRange {
  yearFrom: number;
  yearTo: number;
  /**
   * The seating of the floor pan this range is mapped onto, or `null` when the layout
   * records none. It rides on the range rather than on the car because the ranges are
   * what the year dropdown is built from, so moving to a different generation moves the
   * answer with it — and no answer has to be invented for a car nobody has entered.
   */
  seatRows?: SeatRows | null;
}

export default function FitFinder({
  lockedProductSlug,
  lockedVariationSlug,
  mediaBySlug,
  products,
  resolvedLanding,
}: {
  lockedProductSlug?: string;
  /**
   * WHICH LAYER the ad promised, when it promised one.
   *
   * `?product=single-layer` used to lock a product called Single Layer Mats. That
   * product no longer exists — the layer is an option of `floor-mats` — so the lock has
   * to carry the option as well or the funnel would open on whichever layer it asked
   * about first, which is not what the person paid to see.
   */
  lockedVariationSlug?: string;
  /**
   * Resolved on the server by `src/app/fit-finder/page.tsx` and passed down,
   * because a Client Component cannot read the media manifest. `null` per
   * product means no photography yet, which renders `ProductPlaceholder`.
   */
  mediaBySlug: Record<string, ProductMedia | null>;
  /**
   * The catalogue, from the database (`src/lib/catalogue.ts`).
   *
   * Was a compile-time import until 2026-10-04. A Client Component cannot read
   * Postgres, and a product created in `/admin/products` has to be able to appear on
   * this step, so the server page loads it and passes it down — the same shape
   * `mediaBySlug` already used, for the same reason.
   */
  products: Product[];
  /**
   * The resolved `?product=` variant, passed from the server so the served
   * variant is exposed to the tracking layer as data attributes rather than
   * re-resolved in the client.
   */
  resolvedLanding?: ResolvedLanding | null;
}) {
  const lockedProduct = lockedProductSlug
    ? products.find((candidate) => candidate.slug === lockedProductSlug)
    : undefined;
  /** The layer the ad locked, resolved to a kind. Null when it locked none, or named one we do not sell. */
  const lockedMatType = matTypeForVariation(lockedVariationSlug);

  const [step, setStep] = useState<Step>("car");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(FALLBACK_YEAR_TO));
  /**
   * The spans `/api/fit-years` returned for the chosen car, or `null` while they are
   * still loading — or when the lookup failed, which is the same thing to this
   * component: fall back to the window and let the fit check refuse honestly.
   */
  const [yearRanges, setYearRanges] = useState<YearRange[] | null>(null);
  const [product, setProduct] = useState<Product | null>(lockedProduct ?? null);
  const [rows, setRows] = useState<RowCount | null>(null);
  /**
   * What `/api/fit-check` said about this car's seating, once a check has run.
   *
   * `"mixed"` is the normal case and means "ask the customer" — a Toyota Highlander is
   * genuinely sold as both a 2-row and a 3-row and nobody should guess. "2" or "3" means
   * we already know, and then the row question is SKIPPED and the surcharge is applied
   * without being asked for. `null` until the first FITTED result — and NOT the answer
   * to the question below, which is why `carSeatRows` exists.
   */
  const [seatRows, setSeatRows] = useState<SeatRows | null>(null);

  /**
   * THE MAT LAYER CHOSEN — an OPTION of one product, not a product of its own.
   *
   * Before 2026-10-05 this did not exist: the layer WAS the product, so picking
   * "Double layer" meant swapping `product` to a `double-layer-mats` row. Now both
   * layers are options of `floor-mats`, and the product never changes — so the layer
   * has to be held here, because nothing else in this component carries it. Keeping it
   * in state rather than deriving it from the product is the whole point of the change:
   * with one product there is no slug left to derive a layer from.
   *
   * Null means "not asked yet" — the customer arrived from an ad, or has not reached
   * the layer step — and it is NOT the same as "no layer": a line with no layer is
   * priced from the product's own floor, which is the single-layer figure.
   */
  const [matType, setMatType] = useState<MatTypeKind | null>(lockedMatType);

  /**
   * THIS CAR'S SEATING, FOR THE YEAR CURRENTLY CHOSEN.
   *
   * Read off `/api/fit-years`, per range, because THE ROW USED TO BE ASKED BEFORE ANY
   * LOOKUP HAD HAPPENED. The flow reaches the row step before `/api/fit-check` — the
   * only endpoint that answered `seatRows` — had ever run, so the answer was always
   * absent at the moment the question was put, `offeredRows` fell through to its default
   * and every customer was offered "3 Rows" on a car the owner had set to two. Picking
   * it was then accepted, and priced with the 3-row surcharge. Per RANGE, so moving the
   * year dropdown to another generation moves the answer with it.
   *
   * The check's own answer wins the tie, because it is the one that gated the quote; it
   * is only a fallback for the window before a check has run, and for a car whose range
   * carries none.
   */
  const carSeatRows: SeatRows | null = useMemo(() => {
    const chosen = Number(year);
    const range = yearRanges?.find((r) => chosen >= r.yearFrom && chosen <= r.yearTo);
    return range?.seatRows ?? null;
  }, [yearRanges, year]);
  const seating = carSeatRows ?? seatRows;

  /**
   * THE ROW COUNTS THIS CAR CAN BE SOLD, which is NOT the same as how many rows it has.
   *
   * The owner's rule, 2026-10-05: "once it's set for 2 rows, 3 rows shouldn't show. But
   * 3 rows can show 2 rows."
   *
   * Read that twice, because the asymmetry is the whole point and getting it backwards
   * is selling somebody a mat set for a seat they do not have:
   *
   *   - a car that is TWO rows → we can only ever offer a 2-row set. Offering 3 would
   *     be offering a third row of mats for a car with no third row.
   *   - a car that is THREE rows → we can offer EITHER. A 3-row car is frequently
   *     being bought mats for the middle row alone, which is a 2-row set on a 3-row
   *     car. Refusing to quote it would lose the sale; quoting it is correct.
   *
   * So `seating` describes the CAR, and this derives what may be SOLD against it. The
   * rule itself lives in `@/lib/seat-rows` with its own tests, because it is the kind of
   * asymmetry that is easy to "tidy" into the wrong shape without noticing.
   */
  const offeredRows = rowsThisCarMayBeSold(seating);

  /**
   * The row count we already know, or `undefined` if we do not.
   *
   * Narrowed ONCE here rather than at each of the four call sites, because
   * `seating === "mixed" ? undefined : seating` still lets a `null` through — and `null`
   * is not a row count.
   */
  const knownRows: RowCount | undefined =
    offeredRows.length === 1 ? offeredRows[0] : undefined;

  /**
   * THE COUNT WE ACTUALLY QUOTE: the customer's click, held to what this car allows.
   *
   * Every price, the cart line and the receipt read this rather than `rows`, so a "3
   * rows" that this car cannot be sold against is corrected in the money rather than
   * only hidden from the list. `offeredRows` is the guarantee about what is SHOWN;
   * this one is the guarantee about what is CHARGED.
   */
  const quotedRows = rowsToQuote(rows, offeredRows);
  const [comingSoon, setComingSoon] = useState<{ brand: string; model: string | null } | null>(null);
  /**
   * The advertised product is confirmed NOT cut for the car we just confirmed.
   * Kept as its own state rather than folded into `comingSoon`, because it is
   * not a refusal: the car IS confirmed and the alternatives are real
   * (`fit-finder` §3.6).
   */
  const [lockedMiss, setLockedMiss] = useState<FitVariantOffer[] | null>(null);
  const [fit, setFit] = useState<FitCheckResponse | null>(null);

  /**
   * THE MAT LAYER, and whether we have to ask.
   *
   * The Fit Finder is mats-only from 2026-10-05, and the layer is a TYPE of mat rather
   * than a separate product to choose: "Single layer" and "Double layer" are both mats,
   * they live in the same `floor-mats` category, and a customer who came to buy mats
   * for their car should be asked which LAYER after the car, not which PRODUCT first.
   *
   * `matTypes` comes from the server and is PER CAR: it is read off the offers the
   * floor pan actually has, so a car cut for single layer only is offered single layer
   * only. Asking somebody to pick between two things when only one exists is a question
   * with a wrong answer built into it.
   *
   * Empty means "we have not priced this car yet", which is the honest answer and falls
   * back to offering both.
   */
  const matTypes = fit?.matTypes ?? [];
  const offeredMatTypes: MatTypeKind[] =
    matTypes.length > 0
      ? matTypes
      : // Nothing priced yet: offer both rather than refuse to start.
        ["single_layer", "double_layer"];
  const asksMatType = offeredMatTypes.length > 1;

  /**
   * THE LAYER CHOSEN, AND THE OPTION SLUG IT IS SOLD UNDER.
   *
   * `variationSlug` is what the wire, the cart and the order all key on, and it is
   * null when no layer was chosen — which means "the product, option unspecified" and
   * is priced from the product's own figures.
   */
  const chosenMatType: MatTypeKind | null = product?.slug === MATS_PRODUCT_SLUG ? matType : null;
  const chosenVariationSlug: string | null =
    chosenMatType === null ? null : MAT_TYPE_VARIATION[chosenMatType];
  const [fitError, setFitError] = useState<string | null>(null);
  const [comingSoonPhone, setComingSoonPhone] = useState("");
  const [negotiateOpen, setNegotiateOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [added, setAdded] = useState(false);

  const addItem = useCartStore((s) => s.addItem);

  const carResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") {
      return POPULAR_CARS
        .map(([b, m]) => FLAT_CARS.find((c) => c.brand === b && c.model === m))
        .filter(Boolean) as typeof FLAT_CARS;
    }
    return FLAT_CARS.filter((c) => (c.brand + " " + c.model).toLowerCase().includes(q))
      .sort((a, b) => Number(b.available) - Number(a.available))
      .slice(0, 8);
  }, [query]);

  function pickCar(b: string, m: string, available: boolean) {
    // A previous check's outcome is dropped before anything else happens here.
    // The refusal screen keys its COPY off `fit`/`fitError`, so a leftover from
    // an earlier attempt would label this refusal with the last outcome — which
    // is how a "we could not check that" ends up sitting on top of an honest
    // "no confirmed fit yet" (and the reverse).
    setFit(null);
    setFitError(null);
    // Set on both paths: the refusal screen below reads the car from this state,
    // and a screen reached through the server must not render a blank car.
    setBrand(b);
    setModel(m);

    /*
     * EVERYTHING DERIVED FROM THE PREVIOUS CAR IS DROPPED HERE.
     *
     * This used to reset only `fit`/`fitError`, and leaving `rows` and `seatRows`
     * behind was not a cosmetic bug — it sold the wrong thing to the wrong customer,
     * in both directions:
     *
     *   - `seatRows` is the server's answer about a PARTICULAR car. A customer who
     *     checked a three-row SUV, went back and picked a two-row saloon kept
     *     `seatRows: "3"`, so `offeredRows` stayed `["2", "3"]` and the row step still
     *     offered a THREE-ROW set for a car with no third row. That is exactly what the
     *     owner's rule forbids — "once it's set for 2 rows, 3 rows shouldn't show" — and
     *     the check that enforces it was reading the previous car's answer.
     *
     *   - `rows` is the customer's CHOICE, and it is what prices the quote. A "3 rows"
     *     picked for the SUV survived into the saloon's result card, so the 3-row
     *     surcharge was added to a car that has no third row to cover.
     *
     * `product` goes for the same reason: the mat layer is answered per car by
     * `matTypes`, and a car cut for single layer only must not arrive here carrying the
     * previous car's double-layer choice. A LOCKED product is kept, because that is the
     * one the customer arrived wanting from an ad and it is not a choice at all.
     *
     * The YEAR is deliberately not reset — it is a filter the visitor is holding, not
     * an answer about the previous car, and re-fetching it on every pick would make the
     * dropdown jump under them.
     */
    setRows(null);
    setSeatRows(null);
    setProduct(lockedProduct ?? null);
    // The layer goes with the product it was chosen for. `pickCar` used to rely on
    // resetting the product to clear it, and now the layer is state of its own — so
    // without this line a car cut for single layer only would arrive carrying the
    // previous car's double-layer choice, and would be quoted for a layer nobody cut.
    // A layer the AD locked is kept: it is not a choice, it is the reason they arrived.
    setMatType(lockedMatType);
    setLockedMiss(null);

    // Ask which years this car actually had, rather than offering it the whole
    // 2000–2026 window. `setYearRanges(null)` first so a second car never shows the
    // first car's years while its own are in flight.
    setYearRanges(null);
    void fetch(`/api/fit-years?make=${encodeURIComponent(b)}&model=${encodeURIComponent(m)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { ranges?: YearRange[] } | null) => {
        // A car with nothing on record gets `[]`, which is not an error — it means
        // nobody has entered its years yet, and the fallback window is the honest
        // thing to offer until they do.
        if (!body?.ranges) return;
        const ranges = body.ranges;
        setYearRanges(ranges);

        /*
         * THE SELECTED YEAR HAS TO BE A YEAR THE DROPDOWN IS SHOWING.
         *
         * `year` starts at `FALLBACK_YEAR_TO` (2026), and a `<select>` whose value
         * matches none of its options renders as its FIRST option while the state keeps
         * saying 2026. The customer looked at 2014; the state said 2026. Every lookup
         * keyed off the year then missed every range, `carSeatRows` came back `null`,
         * and the row question was put on a car the owner had already set to two rows —
         * the Toyota Matrix, whose ranges end in 2014, asked about its rows with both
         * chips showing even though its floor pan records "2".
         *
         * So the state is snapped to the newest year actually on record whenever the
         * current one is not. This is not a silent edit of what the customer chose: the
         * dropdown is ALREADY showing that year, so the two finally agree, and a car that
         * stopped being built in 2014 was never going to be quoted as a 2026.
         */
        if (ranges.length === 0) return;
        setYear((current) => {
          const chosen = Number(current);
          const onRecord = ranges.some(
            (range) => chosen >= range.yearFrom && chosen <= range.yearTo,
          );
          return onRecord
            ? current
            : String(Math.max(...ranges.map((range) => range.yearTo)));
        });
      })
      .catch(() => {
        // Left as `null`. A failed lookup must not blank the dropdown; it falls back.
      });

    if (!available) {
      // Defect recorded in `fitment-engine` tasks §"Defects found while fixing
      // 5.5", item 2: this used to `return` straight into the refusal screen, so
      // a real refusal about a real car never reached `/api/fit-check` and was
      // invisible in the demand log — the one place it is most useful, because a
      // brand flagged `available: false` is a demand signal AND a sourcing hint.
      // `fitment-engine` §5.5 put the write in the handler for exactly this
      // reason: a refusal the browser never reports is a refusal nobody has.
      // So this case now goes through the server like every other check, and the
      // server decides the state, the wording and the log line.
      //
      // The year is the finder's current value, which at this point is the
      // default `FALLBACK_YEAR_TO` because the visitor has not been asked yet. That is
      // deliberate rather than convenient: asking for the year first would mean
      // asking a question whose answer we already have, and the year is not what
      // the owner ranks refusals by.
      void runFitCheck(null, { brand: b, model: m, year, notStocked: true });
      return;
    }
    setStep("year");
  }

  function confirmYear() {
    if (lockedProduct) {
      setProduct(lockedProduct);
      if (lockedProduct.rowApplicable && knownRows === undefined) setStep("row");
      else void runFitCheck(lockedProduct, undefined, knownRows);
    } else {
      setStep("product");
    }
  }

  /**
   * Pick a mat LAYER, then carry on exactly as picking a product used to.
   *
   * Both layers are options of ONE product now, so this sets the layer and leaves
   * `product` on `floor-mats` — the row step, the fit check, the result card and the
   * cart line keep working against the one thing they already understood, and the
   * layer rides alongside it.
   */
  function pickMatType(kind: MatTypeKind): void {
    const mats = products.find((p) => p.slug === MATS_PRODUCT_SLUG);
    if (!mats) return;
    setMatType(kind);
    pickProduct(mats);
  }

  /**
   * The OPTION behind a layer, read off the mats product.
   *
   * Returns null when the product is not loaded or names no such option, and both
   * callers treat that as "do not offer this layer" rather than falling back to the
   * product's price. A layer whose option the catalogue does not carry is not a
   * thing we can sell or quote, and rendering it at the product's floor would be
   * exactly the silent downgrade this change exists to stop.
   */
  function optionFor(kind: MatTypeKind) {
    const mats = products.find((p) => p.slug === MATS_PRODUCT_SLUG);
    return mats?.variations?.find((v) => v.slug === MAT_TYPE_VARIATION[kind]) ?? null;
  }

  function pickProduct(p: Product) {
    setProduct(p);
    if (p.rowApplicable && knownRows === undefined) setStep("row");
    else void runFitCheck(p, undefined, knownRows);
  }

  function pickRow(v: RowCount) {
    // A count this car cannot be sold against is not a choice, so it is ignored rather
    // than stored: `quotedRows` would correct the money, but the screen must not appear
    // to have accepted something it does not offer.
    if (!offeredRows.includes(v)) return;
    setRows(v);
    void runFitCheck(product);
  }

  /**
   * Pick one of the confirmed alternatives after a locked-product miss. The
   * product is re-resolved from the catalogue and the fit is checked again, so
   * the result is always the server's answer for THIS product — never a card
   * carried over from the product the ad promised (`fit-finder` §3.6).
   *
   * The option travels with it. Two offers can be the SAME product — a single-layer
   * and a double-layer floor pan are both `floor-mats` — so matching on the product
   * alone would leave the layer whichever the previous car set, and re-running the
   * check with the layer unstated prices it from the product's floor.
   */
  function selectVariant(variant: FitVariantOffer) {
    const chosen = products.find((candidate) => candidate.slug === variant.productSlug);
    if (!chosen) return;
    setLockedMiss(null);
    setProduct(chosen);
    setMatType(matTypeForVariation(variant.variationSlug));
    if (chosen.rowApplicable && knownRows === undefined) setStep("row");
    else void runFitCheck(chosen, undefined, knownRows);
  }

  /**
   * WHAT AN OFFER IS CALLED, WITH ITS LAYER SPELLED OUT.
   *
   * Two offers on this screen can carry the same `productName` — a single-layer and a
   * double-layer floor pan are both "Floor Mats" — so the bare name gives a customer
   * two identical rows at different prices and no way to tell which is which. The
   * layer is the thing they would be choosing between, so it is named.
   */
  function offerName(variant: FitVariantOffer): string {
    const layer = matTypeForVariation(variant.variationSlug);
    return layer === null ? variant.productName : `${variant.productName} — ${MAT_TYPE_LABEL[layer]}`;
  }

  /**
   * The real lookup. Everything below this point depends on what it returns —
   * there is no local shortcut to the old `results` card.
   *
   * A network failure, a non-2xx, or an unparseable body all land on the
   * refusal path. The asymmetry is deliberate: we would rather tell someone we
   * could not check than show them a fit we did not verify.
   *
   * WHY `car` IS A PARAMETER AND NOT ONLY STATE
   *
   * `pickCar()` can fire this before a re-render exists, and `setBrand`/`setModel`
   * do not change what this closure has already read. Without the override, the
   * unavailable-brand case would have posted the PREVIOUS car's make and model —
   * writing a demand line against a car nobody asked about, which is worse than
   * the hole it closes.
   */
  const runFitCheck = useCallback(
    async (
      forProduct: Product | null,
      car?: { brand: string; model: string; year: string; notStocked?: boolean },
      /**
       * The row count, when we already know it. Set by the owner in the admin; the
       * alternative is asking a customer something we are supposed to know about
       * their own car.
       */
      knownRows?: "2" | "3",
    ) => {
      const make = car?.brand ?? brand;
      const makeModel = car?.model ?? model;
      const makeYear = car?.year ?? year;
      if (!make || !makeModel) return;
      setFitError(null);
      setFit(null);
      setStep("checking");

      let payload: FitCheckResponse;
      try {
        const res = await fetch("/api/fit-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            make,
            model: makeModel,
            year: Number(makeYear),
            ...(forProduct ? { productSlug: forProduct.slug } : {}),
          }),
        });
        payload = (await res.json()) as FitCheckResponse;
      } catch {
        setFitError(
          "We could not reach the fit checker. Please try again, or ask us on WhatsApp.",
        );
        track("fit_refused", { brand: make, model: makeModel, state: "UNKNOWN" });
        setComingSoon({ brand: make, model: makeModel });
        setStep("comingsoon");
        return;
      }

    setFit(payload);

    if (payload.state === "FITTED") {
      track("fit_result_rendered", { brand: make, model: makeModel, year: makeYear, state: "FITTED" });

      // Adopt the server's answer, and fill in the row count we came in knowing. The
      // order matters: `setRows` first, so anything reading `rows` during this render
      // sees the known value rather than the previous one.
      if (payload.seatRows) setSeatRows(payload.seatRows);
      // AND LET THE SERVER OVERRULE WHAT WAS PICKED, which narrowing the offered list
      // alone cannot do. The two run at different times — the list is built before the
      // check, from the range's layout, and the check re-reads the layout it actually
      // priced — so this is the last word on the count that is about to be charged.
      // "2" wins outright; a three-row car keeps a "3" that was asked for and drops to
      // "2" otherwise; "mixed" never claimed to know and changes nothing.
      setRows((current) => clampRowsToSeating(knownRows ?? current, payload.seatRows));

      // The catalogue and the fitment table disagree, and the storefront has to
      // believe the catalogue: `available: false` in `src/data/cars.ts` is the
      // list the shop is not taking orders for, and it is what the buyer is
      // shown. Reachable only from the unavailable-brand path, where no product
      // has been chosen yet — and without this the FITTED answer would render
      // the results screen's `product &&` guard as nothing at all, a blank page
      // where a refusal belongs. Nothing is written to the demand log here
      // because the server believes this car fits and has no refusal to record;
      // the disagreement is a data fault for `fitment-review.ts` to settle.
      if (car?.notStocked) {
        track("fit_refused", { brand: make, model: makeModel, state: "NOT STOCKED" });
        setComingSoon({ brand: make, model: makeModel });
        setStep("comingsoon");
        return;
      }

      // The locked-product MISS (`fit-finder` §3.6). The car is Confirmed, but
      // the product the ad promised is not among the variants the server just
      // confirmed for it. Showing a different product than the ad promised,
      // silently, is the same failure as a wrong fit claim — so the miss is
      // stated, logged to the demand log, and the real alternatives offered.
      // The demand log is the record that the ad is promising something this
      // car cannot be quoted for.
      if (forProduct && payload.variants) {
        const advertised = payload.variants.some((v) => v.productSlug === forProduct.slug);
        if (!advertised) {
          track("fit_refused", { brand: make, model: makeModel, state: "NOT STOCKED" });
          void fetch("/api/demand", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              make,
              model: makeModel,
              year: Number(makeYear),
              outcome: "NOT_STOCKED",
              reason: `Locked product ${forProduct.slug} is not cut for this car; alternatives offered.`,
              phone: comingSoonPhone || undefined,
            }),
          }).catch(() => {
            // Never block the miss screen on the log write.
          });
          setLockedMiss(payload.variants);
          setStep("lockedmiss");
          return;
        }
      }

      setLockedMiss(null);
      setStep("results");
      return;
    }

    // The wire contract uses `NOT_STOCKED`; the event taxonomy uses
    // `NOT STOCKED` (§3.9). Map at the boundary rather than changing either.
    track("fit_refused", {
      brand: make,
      model: makeModel,
      state: payload.state === "NOT_STOCKED" ? "NOT STOCKED" : payload.state,
    });

    // A refusal is demand, and it was ALREADY written by `/api/fit-check`
    // before this response arrived (fitment-engine §5.5). This client used to
    // POST the same refusal to `/api/demand` as well, which doubled every line
    // in a log whose only job is to rank refusals by volume and decide what to
    // source next — so it is gone, and nothing replaces it. The one demand write
    // that stays in this file is the locked-product miss above: the server
    // answered FITTED there, so it has no refusal to log.
    setComingSoon({ brand: make, model: makeModel });
    setStep("comingsoon");
    },
    [brand, model, year, comingSoonPhone],
  );

  // Debounced car search measurement. The query TEXT never leaves the browser —
  // only its length and the result count do (§3.12).
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return;
    const timer = setTimeout(() => {
      const resultCount = FLAT_CARS.filter((c) =>
        (c.brand + " " + c.model).toLowerCase().includes(q),
      ).length;
      track("car_search", { queryLength: q.length, resultCount });
      if (resultCount === 0) track("car_search_no_match", { queryLength: q.length });
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const tier: Tier = brand ? BRANDS[brand].tier : "regular";

  /**
   * THE SERVER'S PRICE, NOT THE CATALOGUE'S.
   *
   * This used to be `productBase(product, tier, rows)` — the compile-time list price —
   * on the result card AND in the cart line. So `/api/fit-check` returned a `priceFrom`
   * that the floor pan's owner had set, and the page discarded it and showed the
   * catalogue figure instead. Every price set in `/admin` was invisible to a customer,
   * which is the rigidity this whole change was for.
   *
   * The server's figure now wins. The catalogue price is a FALLBACK, used only when
   * there is no server answer for this exact product — which is the locked-product
   * miss path, where the server confirmed a different set of products and the chosen
   * one is not among them. Falling back there is safe because that screen says the
   * product is not cut for the car rather than quoting it.
   *
   * The 3-row surcharge comes from the server too, for the same reason: quoting the
   * floor pan's 2-row price with the catalogue's 3-row surcharge would be two
   * different products priced as one.
   *
   * IT MATCHES ON THE OPTION AS WELL AS THE PRODUCT, which it did not have to before.
   * `find` on `productSlug` alone returns the FIRST floor-mats offer, and there are now
   * two of them per car — a single-layer pan and a double-layer pan, at different
   * prices. Matching on the product alone therefore quoted whichever the database
   * happened to return first, which is a double-layer customer being handed the
   * single-layer figure for no reason they can see or argue with.
   *
   * An offer naming NO option matches only when no layer was chosen: that is a product
   * with one unnamed option, and refusing to match it would leave a line with nowhere
   * to be priced from.
   */
  const serverOffer = fit?.variants?.find(
    (variant) =>
      variant.productSlug === product?.slug &&
      (chosenVariationSlug === null || variant.variationSlug === chosenVariationSlug),
  );
  const unitPrice = product
    ? serverOffer
      ? serverOffer.priceFrom +
        (quotedRows === "3" ? (serverOffer.rowsSurcharge ?? product.threeRowSurcharge ?? 0) : 0)
      : productBase(product, tier, quotedRows)
    : 0;

  /**
   * The years offered, and the sentence above them.
   *
   * `null` (still loading) and `[]` (nothing on record) both fall back to the full
   * window, and both say so — a customer offered 2026 for a car built until 2014 is
   * better served by being told we do not know yet than by a silently wrong list.
   */
  const yearOptions =
    yearRanges && yearRanges.length > 0
      ? Array.from(
          new Set(
            yearRanges.flatMap((range) => yearsIn(range.yearFrom, range.yearTo)),
          ),
        ).sort((a, b) => b - a)
      : yearsIn(FALLBACK_YEAR_FROM, FALLBACK_YEAR_TO);

  const yearLabel =
    yearRanges && yearRanges.length > 0
      ? "Fit varies by generation, so this locks it in precisely"
      : "Fit varies by generation \u2014 tell us what year you have and we will check it";
  const resultMedia = product ? (mediaBySlug[product.slug] ?? null) : null;

  /**
   * PHOTOGRAPHS OF THE ACTUAL THING, cut for this car and this year range.
   *
   * `resultMedia` above is the product's generic studio shot, which is the right thing
   * to show when we have nothing better. `serverOffer.images` is better: photographs of
   * THIS layer, in THIS car, for THIS year range — the evidence the fit claim rests on.
   *
   * They are PER OPTION (2026-10-05). A single-layer set and a double-layer set look
   * different — the second has a waterproof base layer visible from the side — so
   * showing the single-layer shot to somebody who bought the double layer would be
   * showing them a picture of something they did not receive, on the one screen whose
   * whole job is to prove the claim. That is why the offer carries them and not the
   * response: they belong to an offer, not to a car.
   *
   * Empty falls back to the product shot rather than rendering nothing, because "we
   * have not photographed this yet" is not the same as "there is nothing here".
   */
  const fittedImages = serverOffer?.images ?? [];

  /**
   * Which copy-register entry the refusal screen shows, keyed by the OUTCOME
   * rather than by whether the last call happened to throw.
   *
   * The register is the single source for refusal copy (`trust-and-policies`
   * §2.1), and its two keys are the two wire states, so it is read by state:
   * a server `UNKNOWN` gets the `UNKNOWN` sentence, and everything else — a
   * server `NOT_STOCKED` and the static `available: false` short-circuit, which
   * are the same shape of answer — gets `NOT STOCKED`. Collapsing `UNKNOWN` into
   * the stock copy is what requirement 3.2 calls a rebranded refusal, and it
   * was exactly what the hardcoded strings did.
   *
   * A network failure has no server state at all, so it takes the `UNKNOWN`
   * entry for its body and keeps its own headline — "we could not check that" is
   * more honest than "we could not recognise that car" when the car was matched
   * fine and only the request failed.
   */
  const refusal: RefusalCopy =
    fitError !== null || fit?.state === "UNKNOWN" ? refusals.UNKNOWN : refusals["NOT STOCKED"];

  function handleAddToCart() {
    if (!product || !brand || !model) return;
    addItem({
      productSlug: product.slug,
      // WHICH LAYER. Carried on the cart line because it is part of the line's
      // IDENTITY, not a display detail: `lineKey()` includes it, so a customer
      // adding a single-layer set and then a double-layer set for the same car gets
      // two lines rather than one line at double the quantity — and the server prices
      // each from its own option rather than from the product's single-layer floor.
      variationSlug: chosenVariationSlug,
      productName: product.name,
      brand,
      model,
      year,
      rows: product.rowApplicable ? quotedRows : null,
      unitPrice,
      image: product.images[0],
    });
    track("add_to_cart", {
      productSlug: product.slug,
      productName: product.name,
      brand,
      model,
      year,
      rows: product.rowApplicable ? quotedRows : null,
      unitPrice,
      qty: 1,
    });
    setAdded(true);
  }

  function restart() {
    setStep("car");
    setQuery("");
    setBrand(null);
    setModel(null);
    setYear(String(FALLBACK_YEAR_TO));
    setProduct(lockedProduct ?? null);
    setRows(null);
    setSeatRows(null);
    setYearRanges(null);
    setMatType(lockedMatType);
    setComingSoon(null);
    setFit(null);
    setFitError(null);
    setAdded(false);
    setNegotiateOpen(false);
    setOffer("");
  }

  /**
   * The steps this run will actually show, for the progress bar.
   *
   * `row` is dropped when we already know the row count, or when the chosen product
   * is not row-dependent. Counting a step that is skipped is how a progress bar ends
   * up reading "Step 3 / 4" above a screen that goes straight to the result.
   */
  const asksRows = knownRows === undefined && (product?.rowApplicable ?? lockedProduct?.rowApplicable ?? true);
  const order: Step[] = lockedProduct
    ? lockedProduct.rowApplicable && asksRows
      ? ["car", "year", "row"]
      : ["car", "year"]
    : product
      ? product.rowApplicable && asksRows
        ? ["car", "year", "product", "row"]
        : ["car", "year", "product"]
      : asksRows
        ? ["car", "year", "product", "row"]
        : ["car", "year", "product"];
  const pos = order.indexOf(step);
  const showProgress = pos !== -1;

  return (
    <div
      data-campaign={resolvedLanding?.campaignSlug ?? ""}
      data-landing-product={resolvedLanding?.productSlug ?? ""}
      data-landing-match={resolvedLanding?.match ?? "none"}
    >
      {showProgress && (
        <div className="mb-6">
          <div className="h-[3px] overflow-hidden rounded-full bg-fg/10">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${((pos + 1) / order.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-accent-dim">
            Step {pos + 1} / {order.length}
          </p>
        </div>
      )}

      {step === "car" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">What do you drive?</h2>
          <p className="mt-1 text-sm text-fg-muted">Search by brand or model — we&apos;ll do the rest</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Camry, or Lexus RX"
            className="mt-4 w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3.5 text-sm focus:border-accent focus:outline-none"
          />
          <p className="mt-4 mb-2 font-mono text-[11px] uppercase tracking-wide text-accent-dim">
            {query.trim() === "" ? "Popular Right Now" : carResults.length ? "Matches" : ""}
          </p>
          <div className="space-y-2">
            {carResults.map((c) => (
              <Chip
                key={c.brand + c.model}
                title={`${c.brand} ${c.model}`}
                tag={!c.available ? "Coming soon" : undefined}
                onClick={() => pickCar(c.brand, c.model, c.available)}
              />
            ))}
          </div>
          {query.trim() !== "" && carResults.length === 0 && (
            <a
              href={whatsappLink(notFoundMessage(query.trim()))}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                track("whatsapp_cta_clicked", { ctaType: "car_not_found", location: "fit_finder_car_step" })
              }
              className="mt-4 block text-center text-sm text-accent-dim hover:text-accent"
            >
              Can&apos;t find your car? Ask us on WhatsApp →
            </a>
          )}
        </div>
      )}

      {step === "year" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Model year?</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {yearLabel}
          </p>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-describedby="year-help"
            className="mt-4 w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3.5 text-sm focus:border-accent focus:outline-none"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {/*
            The list a car is offered, and where it came from.

            Saying so is not decoration: a visitor who is told "we cover 2003–2008 for
            this car" and then refused is not confused, whereas one offered a 2026
            Matrix and refused has been told two contradictory things in three
            seconds. When nothing is on record the honest sentence is that we have not
            measured it yet, and the full window is offered anyway so they can tell us
            what they drive.
          */}
          <p id="year-help" className="mt-2 text-xs leading-relaxed text-fg-muted">
            {yearRanges === null
              ? "We have not measured this car yet, so here is every year we list. Tell us yours and we will check it."
              : yearRanges.length === 0
                ? "We have not measured this car yet, so here is every year we list. Tell us yours and we will check it."
                : `We cover ${yearRanges
                    .map((r) => `${r.yearFrom}\u2013${r.yearTo}`)
                    .join(", ")} for this car${
                    yearRanges.length === 1 ? "." : "."
                  } If yours is not here, tell us on WhatsApp and we will check it.`}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep("car")}
              className="flex-shrink-0 rounded-xl border border-fg-muted/25 px-4 text-fg/70 hover:border-accent"
            >
              ←
            </button>
            <Button onClick={confirmYear}>Continue</Button>
          </div>
        </div>
      )}

      {/*
        THE LAYER STEP — what used to be "Choose your product", and deliberately not
        the same thing.

        It listed all four floor-pan products, so someone who came to buy MATS for
        their car was asked to pick a product before they were asked anything else. The
        owner's correction: "single and double layer are types of mats". They are, they
        share a category, and the question worth asking after the car is which LAYER.

        It offers what THIS CAR HAS. When the server has not priced the car yet the list
        falls back to both, because refusing to start is worse than asking a question
        whose answer we can check later.

        Cargo liners and the bundle are gone from this screen on purpose. They are still
        sold, on their own pages — they are just not what someone in this funnel came
        for, and the owner's instruction was "strictly floor mats for now".
      */}
      {step === "product" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Which layer?</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {asksMatType
              ? "Both are cut for your car. Single is one layer; double adds a waterproof base."
              : `We cut ${MAT_TYPE_LABEL[offeredMatTypes[0]].toLowerCase()} mats for your car.`}
          </p>
          <div className="mt-4 space-y-2">
            {offeredMatTypes.map((kind) => {
              const option = optionFor(kind);
              if (!option) return null;
              // THE OPTION'S OWN PRICE. It used to read the PRODUCT's `regular` /
              // `premium`, which was correct when a layer WAS a product and quotes the
              // single-layer figure for the double layer now. Read from the variation
              // where there is one, and off the product where there is not — so a
              // product whose options have not been entered still prices.
              const base = option[tier];
              const rowApplicable = option.rowApplicable ?? product?.rowApplicable ?? false;
              const surcharge = option.threeRowSurcharge ?? product?.threeRowSurcharge ?? 0;
              /*
               * THE PRICE NOTE FOLLOWS THE CAR, NOT THE PRODUCT.
               *
               * It read "(2-row) / (3-row)" for every row-dependent product, whatever
               * car was chosen — so a car the owner had set to TWO rows was still shown a
               * 3-row price as though it were on offer. That is exactly what the row rule
               * in `@/lib/seat-rows` exists to prevent, printed on a screen the rule did
               * not reach: the step above it had already stopped asking, and this step was
               * still advertising the count it had stopped asking about.
               *
               * `offeredRows` is what THIS car may be sold. A one-count car states that
               * one count and never mentions the other; a car sold as both (or one nobody
               * has told us about) keeps the pair.
               */
              const priceNote =
                !rowApplicable
                  ? fmtNaira(base)
                  : offeredRows.length === 1
                    ? `${fmtNaira(base)} (${offeredRows[0]}-row)`
                    : `${fmtNaira(base)} (2-row) / ${fmtNaira(base + surcharge)} (3-row)`;
              return (
                <Chip
                  key={kind}
                  title={MAT_TYPE_LABEL[kind]}
                  hint={priceNote}
                  onClick={() => pickMatType(kind)}
                />
              );
            })}
          </div>
          <button
            onClick={() => setStep("year")}
            className="mt-6 rounded-xl border border-fg-muted/25 px-4 py-3 text-fg/70 hover:border-accent"
          >
            ←
          </button>
        </div>
      )}

      {step === "row" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">
            {seating === "2"
              ? "2 rows"
              : seating === "3"
                ? "2 rows or 3 rows"
                : "How many seat rows?"}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {/*
              The options are DERIVED from the car, not shown as a fixed pair.

              A 2-row car is never offered a 3-row set — there is no third row for it to
              cover. A 3-row car IS offered both, because mats for the middle row alone
              is a 2-row set bought for a 3-row car, and that is a real order.

              Read off `seating`, which is known before this screen is reached: a car the
              owner set to two rows SKIPS this screen entirely (`knownRows` is set, so
              `pickProduct` goes straight to the check). The "2 rows" wording is kept for
              the path that could still arrive here against a two-row car, and states the
              answer rather than asking again.
            */}
            {seating === "2"
              ? "Your car has two rows of seats, so this is a 2-row set."
              : seating === "3"
                ? "Your car has three rows. Two rows covers the front and middle; three covers all of it."
                : "Based on your car\u2019s seating — this sets the exact price"}
          </p>
          <div className="mt-4 space-y-2">
            {offeredRows.map((count) => (
              <Chip
                key={count}
                title={`${count} Rows`}
                hint={
                  count === "2"
                    ? "Front seats, plus the middle row on a 3-row car"
                    : "Every seat, front to back"
                }
                onClick={() => pickRow(count)}
              />
            ))}
          </div>
          <button
            onClick={() => setStep(lockedProduct ? "year" : "product")}
            className="mt-6 rounded-xl border border-fg-muted/25 px-4 py-3 text-fg/70 hover:border-accent"
          >
            ←
          </button>
        </div>
      )}

      {step === "checking" && (
        <div className="py-10 text-center" aria-live="polite">
          <h2 className="font-display text-2xl font-semibold">Checking your fit…</h2>
          <p className="mt-2 text-sm text-fg-muted">
            We are checking whether we have a confirmed fit for the {year} {brand} {model}.
          </p>
        </div>
      )}

      {step === "results" && product && brand && model && fit?.state === "FITTED" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">{fittedCopy.headline}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            We have a confirmed fit for your {year} {brand} {model}. {fittedCopy.leadTimePrefix}{" "}
            {fit.leadTime}.
          </p>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {fittedImages.length > 0 ? (
              // The real thing: this layer, cut for this car, for these years.
              fittedImages.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${image.angle}:${image.src}`}
                  src={image.src}
                  alt={image.alt}
                  loading="lazy"
                  className="aspect-[4/3] w-32 flex-shrink-0 rounded-lg border border-border bg-surface-2 object-cover"
                />
              ))
            ) : resultMedia && resultMedia.images.length > 0 ? (
              resultMedia.images.map((entry, i) => (
                <div
                  key={entry.path}
                  className="relative aspect-[4/3] w-32 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2"
                >
                  <ProductImage media={resultMedia} name={product.name} index={i} sizes="128px" />
                </div>
              ))
            ) : (
              <div className="relative aspect-[4/3] w-32 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
                <ProductPlaceholder name={product.name} showLabel={false} />
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-border bg-gradient-to-b from-surface to-surface-2 p-5">
            <div className="flex items-start justify-between border-b border-dashed border-fg-muted/25 pb-3">
              <div>
                <p className="font-display text-lg font-semibold">
                  {brand} {model}
                </p>
                <p className="mt-1 font-mono text-[11px] text-accent-dim">
                  {year} · {product.name}
                  {/* The layer, spelled out on the receipt rather than left to the
                      step they clicked three screens ago. */}
                  {chosenMatType ? ` · ${MAT_TYPE_LABEL[chosenMatType]}` : ""}
                </p>
              </div>
              <span className="rounded-md border border-border px-2 py-1 font-mono text-[11px] text-accent">
                CONFIRMED FIT
              </span>
            </div>
            <p className="mt-3 font-mono text-3xl font-bold text-accent">{fmtNaira(unitPrice)}</p>
            {product.rowApplicable && (
              <div className="mt-2 flex justify-between text-xs text-fg-muted">
                <span>Configuration</span>
                <span className="font-mono text-fg">{quotedRows} Rows</span>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-accent/5 px-4 py-2.5 text-center text-xs text-accent">
            🛡️ {guarantee}
          </div>

          {!added ? (
            <Button className="mt-5" onClick={handleAddToCart}>
              Add to Cart — {fmtNaira(unitPrice)}
            </Button>
          ) : (
            <div className="mt-5 space-y-2">
              <p className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm text-accent">
                Added to cart ✓
              </p>
              <div className="flex gap-2">
                <Link href="/cart" className="flex-1 rounded-xl bg-accent px-4 py-3 text-center text-sm font-semibold text-on-accent">
                  Go to Cart
                </Link>
                <Link
                  href="/shop"
                  className="flex-1 rounded-xl border border-fg-muted/40 px-4 py-3 text-center text-sm hover:border-accent"
                >
                  Keep Shopping
                </Link>
              </div>
            </div>
          )}

          <a
            href={whatsappLink(
              photosRequestMessage({
                productName: product.name,
                car: `${year} ${brand} ${model}`,
                layoutCode: fit.internalCode,
              })
            )}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              track("live_photo_requested", { productSlug: product.slug });
              track("whatsapp_cta_clicked", { ctaType: "live_photos", location: "fit_result" });
            }}
            className="mt-3 block w-full rounded-xl border border-fg-muted/40 px-5 py-3.5 text-center text-sm font-semibold hover:border-accent hover:text-accent"
          >
            Request Live Photos First
          </a>

          <button
            onClick={() => setNegotiateOpen((v) => !v)}
            className="mt-4 w-full text-center text-sm text-accent-dim hover:text-accent"
          >
            {negotiateOpen ? "Hide offer field" : "Want to negotiate instead? →"}
          </button>
          {negotiateOpen && (
            <div className="mt-2 rounded-xl border border-border bg-accent/5 p-4">
              <label className="mb-2 block text-[11px] uppercase tracking-wide text-fg-muted">Your offer (₦)</label>
              <input
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="e.g. 55000"
                className="mb-3 w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
              />
              <a
                href={whatsappLink(
                  offerMessage({
                    productName: product.name,
                    car: `${brand} ${model} ${year}`,
                    listedPrice: unitPrice,
                    offerPrice: Number(offer) || 0,
                    layoutCode: fit.internalCode,
                  })
                )}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  track("offer_sent", { productSlug: product.slug });
                  track("whatsapp_cta_clicked", { ctaType: "offer", location: "fit_result" });
                }}
                className="block w-full rounded-xl bg-accent px-5 py-3.5 text-center text-sm font-semibold text-on-accent"
              >
                Send My Offer on WhatsApp
              </a>
            </div>
          )}

          <button onClick={restart} className="mt-4 block w-full text-center text-sm text-fg-muted hover:text-fg">
            Start over
          </button>
        </div>
      )}

      {/* ── The locked-product miss ──────────────────────────────────────────
          `fit-finder` §3.6, master plan M3.12. The car IS Confirmed and the
          product the campaign promised is NOT among the variants the server
          just returned for it. The screen exists because the alternative is
          worse than a refusal: quietly putting a different product in front of
          someone who paid for an advert is the same class of falsehood as a
          wrong fit claim, and it is the one the visitor cannot detect.

          Nothing on this screen may restate a fit. Every fact it prints — the
          car, the fit ref, the lead time, each variant and its price — comes
          from the FITTED payload the server just sent, so the screen cannot
          drift from the table. */}
      {step === "lockedmiss" && lockedMiss && product && brand && model && (
        <div>
          <h2 className="font-display text-2xl font-semibold">
            {product.name} is not cut for your {brand} {model}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {lockedProduct ? (
              <>
                You came here for the {product.name} from our advert, and we do not
                cut it for this car. Here is what we do cut for it.
              </>
            ) : (
              <>
                We do not cut the {product.name} for this car. Here is what we do cut
                for it.
              </>
            )}
          </p>

          {/* The confirmed car, shown deliberately BEFORE the alternatives: the
              miss is about one product, and a visitor who only sees a list of
              other products could reasonably read it as "nothing fits your car".
              It is not that — the floor pan is measured and on record. */}
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
            <p className="font-mono text-[11px] uppercase tracking-wide text-accent-dim">
              What we have confirmed
            </p>
            <p className="mt-1 font-display text-lg font-semibold">
              {fit?.customerName ?? `${brand} ${model}`}
            </p>
            <p className="mt-1 font-mono text-[11px] text-fg-muted">
              {year}
              {fit?.internalCode ? ` · fit ref ${fit.internalCode}` : ""}
              {fit?.leadTime ? ` · lead time ${fit.leadTime}` : ""}
            </p>
          </div>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-wide text-accent-dim">
            What we do cut for this car
          </p>
          <div className="mt-2 space-y-2">
            {lockedMiss.map((variant) =>
              variant.stockState === "out_of_stock" ? (
                // Cut for the car, but not orderable. Requirement 3.5 wants the
                // reason on the row rather than discovered after the click, and
                // `Chip` has no `disabled` state — that is `fit-finder` §7.3,
                // coordinated with `storefront-catalog` — so the row is built
                // here with Chip's own markup and genuinely disabled.
                <button
                  key={`${variant.productSlug}::${variant.variationSlug ?? "none"}`}
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-xl border border-fg-muted/25 bg-surface px-4 py-4 text-left text-sm opacity-60"
                >
                  <span className="block font-medium">{offerName(variant)}</span>
                  <span className="mt-1 block text-xs text-fg-muted">
                    Cut for this car, but not available to order right now
                  </span>
                </button>
              ) : (
                // "From" because `priceFrom` is the floor pan's entry price and a
                // 3-row configuration adds the product's surcharge on top; the
                // exact figure is not settled until the row count is.
                <Chip
                  key={`${variant.productSlug}::${variant.variationSlug ?? "none"}`}
                  title={offerName(variant)}
                  hint={`From ${variant.priceDisplay}${
                    variant.stockState === "made_to_order" ? " · made to order" : ""
                  }`}
                  onClick={() => selectVariant(variant)}
                />
              ),
            )}
          </div>

          <a
            href={whatsappLink(
              // Written here rather than with `refusalMessage()`, which opens
              // "there is no confirmed fit for it yet" — FALSE on this screen, the
              // car is confirmed and the product is what misses. `fit-finder`
              // §7.6 owes a product-scoped builder; until then this is the only
              // place a product-miss message is composed.
              `Hi! I came to your fit finder for the ${product.name} and it says you do not cut it for my ${year} ${brand} ${model}.` +
                (fit?.internalCode ? `\n🔖 Fit ${fit.internalCode}` : "") +
                `\nIs that something you could cut for my car? Thanks!`,
            )}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              // "coming_soon" is the closest existing CTA taxonomy entry; a
              // dedicated type belongs to `ad-landing-and-tracking` §6, not here.
              track("whatsapp_cta_clicked", {
                ctaType: "coming_soon",
                location: "fit_locked_miss",
              });
            }}
            className="mt-5 block w-full rounded-xl border border-fg-muted/40 px-5 py-3.5 text-center text-sm font-semibold hover:border-accent hover:text-accent"
          >
            Ask about the {product.name} on WhatsApp
          </a>

          <button
            onClick={() => setStep("car")}
            className="mt-4 block w-full rounded-xl border border-fg-muted/40 px-5 py-3.5 text-center text-sm font-semibold hover:border-accent"
          >
            Browse Other Cars
          </button>
          <button onClick={restart} className="mt-3 block w-full text-center text-sm text-fg-muted hover:text-fg">
            Start over
          </button>
        </div>
      )}

      {step === "comingsoon" && comingSoon && (
        <div>
          <h2 className="font-display text-2xl font-semibold">
            {fitError ? "We could not check that" : refusal.headline}
          </h2>
          {fitError ? (
            <p className="mt-1 text-sm text-fg-muted">{fitError}</p>
          ) : (
            <>
              {/* The car leads, on its own line. Requirement 3.1 wants the refusal
                  to name the make and model that was asked for, and the register's
                  body is written to follow a noun rather than sit inside a
                  sentence — so the two are stacked instead of spliced together. */}
              <p className="mt-1 text-sm font-medium text-fg">
                {comingSoon.model
                  ? `${comingSoon.brand} ${comingSoon.model}`
                  : comingSoon.brand}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{refusal.body}</p>
              {/* The server's own sentence, unedited. It carries the year the
                  register cannot, and paraphrasing it is how two screens end up
                  disagreeing about the same refusal. */}
              {fit?.reason && <p className="mt-2 text-sm text-fg-muted">{fit.reason}</p>}
            </>
          )}
          {refusal.promise && <p className="mt-2 text-sm text-fg-muted">{refusal.promise}</p>}
          <div className="mt-4 rounded-xl border border-border bg-accent/5 p-4">
            {refusal.capture ? (
              // The register pairs a promise of future availability with its
              // capture (`trust-and-policies` §2.2), so where the entry has one
              // the number is asked for before the promise is made visible. This
              // is still not the validated capture requirement 3.4 asks for —
              // `validateNGPhone` is unwired here (task 4.4).
              <>
                <label className="mb-2 block text-[11px] uppercase tracking-wide text-fg-muted">
                  {refusal.capture.label}
                </label>
                <input
                  value={comingSoonPhone}
                  onChange={(e) => setComingSoonPhone(e.target.value)}
                  placeholder={refusal.capture.placeholder}
                  className="mb-3 w-full rounded-xl border border-fg-muted/25 bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                />
              </>
            ) : (
              // `UNKNOWN` promises nothing, so it captures nothing — requirement
              // 3.3 ties the capture to the promise, not to the refusal. It still
              // owes a primary action (3.2), and a human on WhatsApp is it.
              <p className="mb-3 text-xs text-fg-muted">
                Tell us what you drive and we will check it for you by hand.
              </p>
            )}
            <a
              href={whatsappLink(
                comingSoonMessage(
                  comingSoon.model ? `${comingSoon.brand} ${comingSoon.model}` : comingSoon.brand,
                  comingSoonPhone || undefined
                )
              )}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                // The number itself is never transmitted to Meta or Google —
                // not even hashed (§3.12). Only the fact that one was left.
                if (comingSoonPhone.trim() !== "") {
                  track("waitlist_phone_submitted", {
                    car: comingSoon.model ? `${comingSoon.brand} ${comingSoon.model}` : comingSoon.brand,
                  });
                }
                track("whatsapp_cta_clicked", { ctaType: "coming_soon", location: "fit_refusal" });
              }}
              className="block w-full rounded-xl bg-accent px-5 py-3.5 text-center text-sm font-semibold text-on-accent"
            >
              {refusal.capture ? "Notify Me on WhatsApp" : "Ask us on WhatsApp"}
            </a>
          </div>
          <button
            onClick={() => setStep("car")}
            className="mt-4 block w-full rounded-xl border border-fg-muted/40 px-5 py-3.5 text-center text-sm font-semibold hover:border-accent"
          >
            Browse Other Cars
          </button>
          <button onClick={restart} className="mt-3 block w-full text-center text-sm text-fg-muted hover:text-fg">
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
