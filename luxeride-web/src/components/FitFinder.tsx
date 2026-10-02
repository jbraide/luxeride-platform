"use client";

import { useMemo, useState } from "react";
import SafeImage from "@/components/SafeImage";
import Link from "next/link";
import { BRANDS, FLAT_CARS, POPULAR_CARS, Tier } from "@/data/cars";
import { PRODUCTS, getProductBySlug, Product } from "@/data/products";
import { productBase } from "@/lib/pricing";
import { fmtNaira } from "@/lib/pricing";
import { Chip } from "@/components/Chip";
import { Button } from "@/components/Button";
import { useCartStore } from "@/store/cart";
import { whatsappLink, comingSoonMessage, notFoundMessage } from "@/lib/whatsapp";

type Step = "car" | "year" | "product" | "row" | "results" | "comingsoon";

const YEAR_FROM = 2000;
const YEAR_TO = 2026;
const YEARS = Array.from({ length: YEAR_TO - YEAR_FROM + 1 }, (_, i) => YEAR_TO - i);

export default function FitFinder({ lockedProductSlug }: { lockedProductSlug?: string }) {
  const lockedProduct = lockedProductSlug ? getProductBySlug(lockedProductSlug) : undefined;

  const [step, setStep] = useState<Step>("car");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(YEAR_TO));
  const [product, setProduct] = useState<Product | null>(lockedProduct ?? null);
  const [rows, setRows] = useState<"2" | "3" | null>(null);
  const [comingSoon, setComingSoon] = useState<{ brand: string; model: string | null } | null>(null);
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
      setStep(lockedProduct.rowApplicable ? "row" : "results");
    } else {
      setStep("product");
    }
  }

  function pickProduct(p: Product) {
    setProduct(p);
    setStep(p.rowApplicable ? "row" : "results");
  }

  function pickRow(v: "2" | "3") {
    setRows(v);
    setStep("results");
  }

  const tier: Tier = brand ? BRANDS[brand].tier : "regular";
  const unitPrice = product ? productBase(product, tier, rows) : 0;

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
    <div>
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

      {step === "results" && product && brand && model && (
        <div>
          <h2 className="font-display text-2xl font-semibold">We Found Your Fit!</h2>
          <p className="mt-1 text-sm text-muted">
            100% precision-molded {product.name} in stock for your {year} {brand} {model}
          </p>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {product.images.map((src) => (
              <div key={src} className="relative h-24 w-32 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-panel-2">
                <SafeImage src={src} alt="" fill className="object-cover" />
              </div>
            ))}
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
              <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-gold">FIT ✓</span>
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
            🛡️ 100% Perfect Fit Guarantee — doesn&apos;t fit? We swap it free.
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
              `Hi! Before I order the ${product.name}, could you send live photos of the fit for my ${year} ${brand} ${model} first? Thanks!`
            )}
            target="_blank"
            rel="noreferrer"
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
                  `Hi! I'm interested in:\n${brand} ${model} ${year} | ${product.name}\nListed price: ${fmtNaira(unitPrice)}\nMy offer: ${fmtNaira(Number(offer) || 0)}\nCan we work something out? Thanks!`
                )}
                target="_blank"
                rel="noreferrer"
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
          <h2 className="font-display text-2xl font-semibold">Not in stock — yet</h2>
          <p className="mt-1 text-sm text-muted">
            We don&apos;t have a laser-scanned fit for{" "}
            <strong>{comingSoon.model ? `${comingSoon.brand} ${comingSoon.model}` : comingSoon.brand}</strong> in
            stock right now, but we&apos;re adding new fits regularly.
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
