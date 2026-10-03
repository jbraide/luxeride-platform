"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProductImage from "@/components/ProductImage";
import ProductPlaceholder from "@/components/ProductPlaceholder";
import Link from "next/link";
import { BRANDS, FLAT_CARS, POPULAR_CARS, Tier } from "@/data/cars";
import { PRODUCTS, getProductBySlug, Product } from "@/data/products";
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
import type { ResolvedLanding } from "@/data/landing";

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

const YEAR_FROM = 2000;
const YEAR_TO = 2026;
const YEARS = Array.from({ length: YEAR_TO - YEAR_FROM + 1 }, (_, i) => YEAR_TO - i);

export default function FitFinder({
  lockedProductSlug,
  mediaBySlug,
  resolvedLanding,
}: {
  lockedProductSlug?: string;
  /**
   * Resolved on the server by `src/app/fit-finder/page.tsx` and passed down,
   * because a Client Component cannot read the media manifest. `null` per
   * product means no photography yet, which renders `ProductPlaceholder`.
   */
  mediaBySlug: Record<string, ProductMedia | null>;
  /**
   * The resolved `?product=` variant, passed from the server so the served
   * variant is exposed to the tracking layer as data attributes rather than
   * re-resolved in the client.
   */
  resolvedLanding?: ResolvedLanding | null;
}) {
  const lockedProduct = lockedProductSlug ? getProductBySlug(lockedProductSlug) : undefined;

  const [step, setStep] = useState<Step>("car");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(YEAR_TO));
  const [product, setProduct] = useState<Product | null>(lockedProduct ?? null);
  const [rows, setRows] = useState<"2" | "3" | null>(null);
  const [comingSoon, setComingSoon] = useState<{ brand: string; model: string | null } | null>(null);
  /**
   * The advertised product is confirmed NOT cut for the car we just confirmed.
   * Kept as its own state rather than folded into `comingSoon`, because it is
   * not a refusal: the car IS confirmed and the alternatives are real
   * (`fit-finder` §3.6).
   */
  const [lockedMiss, setLockedMiss] = useState<FitVariantOffer[] | null>(null);
  const [fit, setFit] = useState<FitCheckResponse | null>(null);
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
    if (!available) {
      // A car we cannot sell is a refusal, and refusals are this product's
      // only sourcing signal — so it is measured here, not inferred later.
      track("fit_refused", { brand: b, model: m, state: "NOT STOCKED" });
      setComingSoon({ brand: b, model: m });
      setStep("comingsoon");
      return;
    }
    setBrand(b);
    setModel(m);
    setStep("year");
  }

  function confirmYear() {
    if (lockedProduct) {
      setProduct(lockedProduct);
      if (lockedProduct.rowApplicable) setStep("row");
      else void runFitCheck(lockedProduct);
    } else {
      setStep("product");
    }
  }

  function pickProduct(p: Product) {
    setProduct(p);
    if (p.rowApplicable) setStep("row");
    else void runFitCheck(p);
  }

  function pickRow(v: "2" | "3") {
    setRows(v);
    void runFitCheck(product);
  }

  /**
   * Pick one of the confirmed alternatives after a locked-product miss. The
   * product is re-resolved from the catalogue and the fit is checked again, so
   * the result is always the server's answer for THIS product — never a card
   * carried over from the product the ad promised (`fit-finder` §3.6).
   */
  function selectVariant(variant: FitVariantOffer) {
    const chosen = getProductBySlug(variant.productSlug);
    if (!chosen) return;
    setLockedMiss(null);
    setProduct(chosen);
    if (chosen.rowApplicable) setStep("row");
    else void runFitCheck(chosen);
  }

  /**
   * The real lookup. Everything below this point depends on what it returns —
   * there is no local shortcut to the old `results` card.
   *
   * A network failure, a non-2xx, or an unparseable body all land on the
   * refusal path. The asymmetry is deliberate: we would rather tell someone we
   * could not check than show them a fit we did not verify.
   */
  const runFitCheck = useCallback(
    async (forProduct: Product | null) => {
      if (!brand || !model) return;
      setFitError(null);
      setFit(null);
      setStep("checking");

      let payload: FitCheckResponse;
      try {
        const res = await fetch("/api/fit-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            make: brand,
            model,
            year: Number(year),
            ...(forProduct ? { productSlug: forProduct.slug } : {}),
          }),
        });
        payload = (await res.json()) as FitCheckResponse;
      } catch {
        setFitError(
          "We could not reach the fit checker. Please try again, or ask us on WhatsApp.",
        );
        track("fit_refused", { brand, model, state: "UNKNOWN" });
        setComingSoon({ brand, model });
        setStep("comingsoon");
        return;
      }

    setFit(payload);

    if (payload.state === "FITTED") {
      track("fit_result_rendered", { brand, model, year, state: "FITTED" });

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
          track("fit_refused", { brand, model, state: "NOT STOCKED" });
          void fetch("/api/demand", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              make: brand,
              model,
              year: Number(year),
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
      brand,
      model,
      state: payload.state === "NOT_STOCKED" ? "NOT STOCKED" : payload.state,
    });

    // A refusal is demand. Locked decision 2 makes capturing it a launch
    // requirement, so it happens here rather than being left to a database
    // that does not exist yet.
    void fetch("/api/demand", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        make: brand,
        model,
        year: Number(year),
        outcome: payload.state,
        reason: payload.reason ?? "",
        phone: comingSoonPhone || undefined,
      }),
    }).catch(() => {
      // Never block the refusal on the log write; the visitor still gets their
      // WhatsApp link either way.
    });

    setComingSoon({ brand, model });
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
  const unitPrice = product ? productBase(product, tier, rows) : 0;
  const resultMedia = product ? (mediaBySlug[product.slug] ?? null) : null;

  function handleAddToCart() {
    if (!product || !brand || !model) return;
    addItem({
      productSlug: product.slug,
      productName: product.name,
      brand,
      model,
      year,
      rows: product.rowApplicable ? rows : null,
      unitPrice,
      image: product.images[0],
    });
    track("add_to_cart", {
      productSlug: product.slug,
      productName: product.name,
      brand,
      model,
      year,
      rows: product.rowApplicable ? rows : null,
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
    setYear(String(YEAR_TO));
    setProduct(lockedProduct ?? null);
    setRows(null);
    setComingSoon(null);
    setFit(null);
    setFitError(null);
    setAdded(false);
    setNegotiateOpen(false);
    setOffer("");
  }

  const order: Step[] = lockedProduct
    ? lockedProduct.rowApplicable
      ? ["car", "year", "row"]
      : ["car", "year"]
    : product
      ? product.rowApplicable
        ? ["car", "year", "product", "row"]
        : ["car", "year", "product"]
      : ["car", "year", "product", "row"];
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
          <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gold transition-all"
              style={{ width: `${((pos + 1) / order.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-gold-dim">
            Step {pos + 1} / {order.length}
          </p>
        </div>
      )}

      {step === "car" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">What do you drive?</h2>
          <p className="mt-1 text-sm text-muted">Search by brand or model — we&apos;ll do the rest</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Camry, or Lexus RX"
            className="mt-4 w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
          />
          <p className="mt-4 mb-2 font-mono text-[11px] uppercase tracking-wide text-gold-dim">
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
              className="mt-4 block text-center text-sm text-gold-dim hover:text-gold"
            >
              Can&apos;t find your car? Ask us on WhatsApp →
            </a>
          )}
        </div>
      )}

      {step === "year" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Model year?</h2>
          <p className="mt-1 text-sm text-muted">Fit varies by generation, so this locks it in precisely</p>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-4 w-full rounded-xl border border-white/15 bg-panel px-4 py-3.5 text-sm focus:border-gold focus:outline-none"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep("car")}
              className="flex-shrink-0 rounded-xl border border-white/15 px-4 text-white/70 hover:border-gold"
            >
              ←
            </button>
            <Button onClick={confirmYear}>Continue</Button>
          </div>
        </div>
      )}

      {step === "product" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Choose your product</h2>
          <p className="mt-1 text-sm text-muted">Every item is laser-measured to your exact car</p>
          <div className="mt-4 space-y-2">
            {PRODUCTS.map((p) => {
              const base = p[tier];
              const priceNote = p.rowApplicable
                ? `${p.note} · ${fmtNaira(base)} (2-row) / ${fmtNaira(base + (p.threeRowSurcharge ?? 0))} (3-row)`
                : `${p.note} · ${fmtNaira(base)}`;
              return <Chip key={p.slug} title={p.name} hint={priceNote} onClick={() => pickProduct(p)} />;
            })}
          </div>
          <button
            onClick={() => setStep("year")}
            className="mt-6 rounded-xl border border-white/15 px-4 py-3 text-white/70 hover:border-gold"
          >
            ←
          </button>
        </div>
      )}

      {step === "row" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">2 rows or 3 rows?</h2>
          <p className="mt-1 text-sm text-muted">Based on your car&apos;s seating — this sets the exact price</p>
          <div className="mt-4 space-y-2">
            <Chip title="2 Rows" hint="Sedans, coupes & compact SUVs — e.g. Camry, RX 350" onClick={() => pickRow("2")} />
            <Chip title="3 Rows" hint="Larger SUVs & vans — e.g. Highlander, GX 460, Santa Fe" onClick={() => pickRow("3")} />
          </div>
          <button
            onClick={() => setStep(lockedProduct ? "year" : "product")}
            className="mt-6 rounded-xl border border-white/15 px-4 py-3 text-white/70 hover:border-gold"
          >
            ←
          </button>
        </div>
      )}

      {step === "checking" && (
        <div className="py-10 text-center" aria-live="polite">
          <h2 className="font-display text-2xl font-semibold">Checking your fit…</h2>
          <p className="mt-2 text-sm text-muted">
            We are checking whether we have a confirmed fit for the {year} {brand} {model}.
          </p>
        </div>
      )}

      {step === "results" && product && brand && model && fit?.state === "FITTED" && (
        <div>
          <h2 className="font-display text-2xl font-semibold">{fittedCopy.headline}</h2>
          <p className="mt-1 text-sm text-muted">
            We have a confirmed fit for your {year} {brand} {model}. {fittedCopy.leadTimePrefix}{" "}
            {fit.leadTime}.
          </p>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {resultMedia && resultMedia.images.length > 0 ? (
              resultMedia.images.map((entry, i) => (
                <div
                  key={entry.path}
                  className="relative aspect-[4/3] w-32 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-panel-2"
                >
                  <ProductImage media={resultMedia} name={product.name} index={i} sizes="128px" />
                </div>
              ))
            ) : (
              <div className="relative aspect-[4/3] w-32 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-panel-2">
                <ProductPlaceholder name={product.name} showLabel={false} />
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-line bg-gradient-to-b from-panel to-panel-2 p-5">
            <div className="flex items-start justify-between border-b border-dashed border-white/15 pb-3">
              <div>
                <p className="font-display text-lg font-semibold">
                  {brand} {model}
                </p>
                <p className="mt-1 font-mono text-[11px] text-gold-dim">
                  {year} · {product.name}
                </p>
              </div>
              <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-gold">
                CONFIRMED FIT
              </span>
            </div>
            <p className="mt-3 font-mono text-3xl font-bold text-gold">{fmtNaira(unitPrice)}</p>
            {product.rowApplicable && (
              <div className="mt-2 flex justify-between text-xs text-muted">
                <span>Configuration</span>
                <span className="font-mono text-white">{rows} Rows</span>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-line bg-gold/5 px-4 py-2.5 text-center text-xs text-gold">
            🛡️ {guarantee}
          </div>

          {!added ? (
            <Button className="mt-5" onClick={handleAddToCart}>
              Add to Cart — {fmtNaira(unitPrice)}
            </Button>
          ) : (
            <div className="mt-5 space-y-2">
              <p className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-center text-sm text-gold">
                Added to cart ✓
              </p>
              <div className="flex gap-2">
                <Link href="/cart" className="flex-1 rounded-xl bg-gold px-4 py-3 text-center text-sm font-semibold text-ink">
                  Go to Cart
                </Link>
                <Link
                  href="/shop"
                  className="flex-1 rounded-xl border border-white/25 px-4 py-3 text-center text-sm hover:border-gold"
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
            className="mt-3 block w-full rounded-xl border border-white/25 px-5 py-3.5 text-center text-sm font-semibold hover:border-gold hover:text-gold"
          >
            Request Live Photos First
          </a>

          <button
            onClick={() => setNegotiateOpen((v) => !v)}
            className="mt-4 w-full text-center text-sm text-gold-dim hover:text-gold"
          >
            {negotiateOpen ? "Hide offer field" : "Want to negotiate instead? →"}
          </button>
          {negotiateOpen && (
            <div className="mt-2 rounded-xl border border-line bg-gold/5 p-4">
              <label className="mb-2 block text-[11px] uppercase tracking-wide text-muted">Your offer (₦)</label>
              <input
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="e.g. 55000"
                className="mb-3 w-full rounded-xl border border-white/15 bg-panel px-4 py-3 text-sm focus:border-gold focus:outline-none"
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
                className="block w-full rounded-xl bg-gold px-5 py-3.5 text-center text-sm font-semibold text-ink"
              >
                Send My Offer on WhatsApp
              </a>
            </div>
          )}

          <button onClick={restart} className="mt-4 block w-full text-center text-sm text-muted hover:text-white">
            Start over
          </button>
        </div>
      )}

      {step === "comingsoon" && comingSoon && (
        <div>
          <h2 className="font-display text-2xl font-semibold">
            {fitError ? "We could not check that" : "No confirmed fit yet"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {fitError ? (
              fitError
            ) : (
              <>
                We don&apos;t have a confirmed fit for{" "}
                <strong>
                  {comingSoon.model
                    ? `${comingSoon.brand} ${comingSoon.model}`
                    : comingSoon.brand}
                </strong>
                .{" "}
                {fit?.reason ?? "We are adding new fits as we measure them."}
              </>
            )}
          </p>
          <div className="mt-4 rounded-xl border border-line bg-gold/5 p-4">
            <label className="mb-2 block text-[11px] uppercase tracking-wide text-muted">
              Want a text the moment it&apos;s ready? (optional)
            </label>
            <input
              value={comingSoonPhone}
              onChange={(e) => setComingSoonPhone(e.target.value)}
              placeholder="e.g. 0704 962 1694"
              className="mb-3 w-full rounded-xl border border-white/15 bg-panel px-4 py-3 text-sm focus:border-gold focus:outline-none"
            />
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
              className="block w-full rounded-xl bg-gold px-5 py-3.5 text-center text-sm font-semibold text-ink"
            >
              Notify Me on WhatsApp
            </a>
          </div>
          <button
            onClick={() => setStep("car")}
            className="mt-4 block w-full rounded-xl border border-white/25 px-5 py-3.5 text-center text-sm font-semibold hover:border-gold"
          >
            Browse Other Cars
          </button>
          <button onClick={restart} className="mt-3 block w-full text-center text-sm text-muted hover:text-white">
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
