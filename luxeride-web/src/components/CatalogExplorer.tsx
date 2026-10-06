"use client";

import { useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { LinkButton } from "@/components/Button";
import { getCategoryBySlug, priceRange, type Product } from "@/data/products";
import { whatsappLink } from "@/lib/whatsapp";
import type { ProductMedia } from "@/lib/media";

/**
 * Search, sort and the empty state for the catalogue.
 *
 * A Client Component because the query and sort are interactive state. It
 * receives the whole array rather than fetching: the catalogue is seven items
 * in a compile-time constant, so a request per keystroke would be a round trip
 * to learn something already in the bundle.
 *
 * The result count is announced through `aria-live` AND shown as visible copy.
 * Silent filtering is disorienting — a visitor who types "mats" and sees four
 * cards has no way to know four is the answer rather than a bug.
 *
 * Sort compares the LOWER bound of `priceRange()`, so "price: low to high"
 * orders by the number the card actually shows first. Sorting by the upper bound
 * would interleave two products whose bands overlap, which looks random.
 */

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

const SORT_LABELS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
];

export default function CatalogExplorer({
  products,
  mediaBySlug,
}: {
  products: Product[];
  /**
   * Photography resolved by the server page. A Client Component cannot read the
   * manifest itself — `node:fs` cannot be chunked for a browser — so this is
   * handed down, exactly as `FitFinder` receives `mediaBySlug`.
   */
  mediaBySlug: Record<string, ProductMedia | null>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = needle
      ? products.filter((product) => {
          const category = getCategoryBySlug(product.categorySlug);
          return (
            product.name.toLowerCase().includes(needle) ||
            product.note.toLowerCase().includes(needle) ||
            // `materials` is optional from 2026-10-04 — a product created in the
            // admin has no PDP copy. Searching for "mats" still finds it by name and
            // note; searching for its material finds nothing, which is honest, and
            // calling `.toLowerCase()` on undefined would take the whole page down.
            (product.materials ?? "").toLowerCase().includes(needle) ||
            (category?.name.toLowerCase().includes(needle) ?? false)
          );
        })
      : products;

    const sorted = [...matched];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => priceRange(a)[0] - priceRange(b)[0]);
        break;
      case "price-desc":
        sorted.sort((a, b) => priceRange(b)[0] - priceRange(a)[0]);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      // "featured" is source order — the catalogue's own curation.
    }
    return sorted;
  }, [products, query, sort]);

  const total = products.length;
  const count = results.length;

  return (
    <div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="catalog-search"
            className="block font-mono text-[11px] uppercase tracking-widest text-accent-dim"
          >
            Search products
          </label>
          <input
            id="catalog-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="mats, seat covers, waterproof…"
            className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="catalog-sort"
            className="block font-mono text-[11px] uppercase tracking-widest text-accent-dim"
          >
            Sort
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none sm:w-auto"
          >
            {SORT_LABELS.map((option) => (
              <option key={option.value} value={option.value} className="bg-surface">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Both consumers of the count: visible copy, and the polite live region
          that announces a change to a screen reader. */}
      <p className="mt-5 text-xs text-fg-muted">
        Showing <span className="font-mono text-fg">{count}</span> of {total}{" "}
        {total === 1 ? "product" : "products"}
        {query.trim() ? ` for “${query.trim()}”` : ""}
      </p>
      <p aria-live="polite" className="sr-only">
        {count} {count === 1 ? "product" : "products"} found
        {query.trim() ? ` for ${query.trim()}` : ""}.
      </p>

      {count === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-surface/60 px-5 py-8 text-center">
          <p className="text-sm text-fg-muted">
            Nothing matches “{query.trim()}”. We may still be able to make it for your car — ask
            us and we will check.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => setQuery("")}
              className="rounded-xl bg-accent px-5 py-3.5 text-center text-sm font-semibold text-on-accent"
            >
              Clear the search
            </button>
            <a
              href={whatsappLink(
                `Hi! I couldn't find "${query.trim()}" on your site. Do you make something like that for my car?`,
              )}
              className="rounded-xl border border-border px-5 py-3.5 text-center text-sm font-semibold text-fg/80 hover:border-accent hover:text-accent"
            >
              Ask us on WhatsApp
            </a>
            <LinkButton href="/fit-finder" variant="outline">
              Find my perfect fit
            </LinkButton>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((product, index) => (
            // §14.4: the first row only. Two is the first row at `grid-cols-2`,
            // the narrowest layout, and the one above the fold on a phone.
            <ProductCard key={product.slug} product={product} media={mediaBySlug[product.slug] ?? null} preload={index < 2} />
          ))}
        </div>
      )}
    </div>
  );
}