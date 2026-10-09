"use client";

import { useEffect, useState } from "react";
import { deriveBundlePrices, isBundleDiscountKind, MIN_BUNDLE_PRICE } from "@/lib/bundle-price";

/**
 * THE BUNDLE PRICE, LIVE.
 *
 * The server already derives the price and the save already writes it — this makes the
 * figure move as the operator types, so the number on the screen is the number the save
 * will write rather than one that only appears after a round trip.
 *
 * HOW IT READS THE FORM. The bundle is one `<form>`; this component finds it by id and
 * listens for `input`/`change` on it, reading `discountKind`, `discountValue`,
 * `derivePricing` and each `qty__<itemId>` by name. That is why it is a client component
 * while the rest of the console is not: it needs the live values, and the rest does not.
 *
 * The arithmetic is `deriveBundlePrices` — the same function the seed and the server
 * action call, imported here rather than reimplemented, so the preview can never disagree
 * with what gets saved.
 */

const naira = (value: number) => `₦${value.toLocaleString("en-NG")}`;

export interface PreviewPart {
  id: string;
  qty: number;
  regular: number;
  premium: number;
}

export default function BundlePricePreview({
  formId,
  parts,
  current,
}: {
  formId: string;
  parts: PreviewPart[];
  current: { regular: number; premium: number };
}) {
  const [fields, setFields] = useState<{
    kind: string;
    value: number;
    derive: boolean;
    qty: Record<string, number>;
  }>(() => ({ kind: "percent", value: 0, derive: true, qty: {} }));

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const read = () => {
      const kind = form.elements.namedItem("discountKind");
      const value = form.elements.namedItem("discountValue");
      const derive = form.elements.namedItem("derivePricing");
      const qty: Record<string, number> = {};
      for (const part of parts) {
        const input = form.elements.namedItem(`qty__${part.id}`);
        const n = input instanceof HTMLInputElement ? Number(input.value) : part.qty;
        qty[part.id] = Number.isInteger(n) && n >= 1 ? n : part.qty;
      }
      setFields({
        kind: kind instanceof HTMLSelectElement ? kind.value : "percent",
        value:
          value instanceof HTMLInputElement && value.value.trim() !== "" ? Number(value.value) : 0,
        derive: derive instanceof HTMLInputElement ? derive.checked : true,
        qty,
      });
    };

    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
    };
  }, [formId, parts]);

  const kind = isBundleDiscountKind(fields.kind) ? fields.kind : "percent";
  const derived = deriveBundlePrices(
    parts.map((part) => ({
      qty: fields.qty[part.id] ?? part.qty,
      regular: part.regular,
      premium: part.premium,
    })),
    kind,
    fields.value,
  );

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface/60 px-4 py-3 text-xs leading-relaxed text-fg-muted">
      {parts.length === 0 ? (
        <p>
          No parts yet, so there is nothing to price this from.{" "}
          {fields.derive
            ? `While the price is worked out from the parts, this sells at the floor — ${naira(MIN_BUNDLE_PRICE)} — until a part is added, and that is the figure the shop would quote.`
            : "The two prices at the top of this page are what it sells at."}{" "}
          Add a product above and the prices are worked out from it.
        </p>
      ) : (
        <>
          <p>
            The {parts.length} part{parts.length === 1 ? "" : "s"} come to{" "}
            <span className="font-mono text-fg/85">{naira(derived.listRegular)} regular</span> and{" "}
            <span className="font-mono text-fg/85">{naira(derived.listPremium)} premium</span>, which
            is what a customer would pay buying them on their own.
          </p>
          <p className="mt-1.5">
            With the discount that is{" "}
            <span className="font-mono text-accent">{naira(derived.regular)}</span> and{" "}
            <span className="font-mono text-accent">{naira(derived.premium)}</span> — saving{" "}
            <span className="font-mono text-accent">
              {naira(derived.savedRegular)} / {naira(derived.savedPremium)}
            </span>
            .
          </p>
          <p className="mt-1.5">
            {fields.derive
              ? "Saving writes this figure onto the product and its options."
              : "This figure is not written — the box above is unticked."}{" "}
            It currently sells at{" "}
            <span className="font-mono text-fg/85">
              {naira(current.regular)} regular / {naira(current.premium)} premium
            </span>
            {fields.derive &&
            (current.regular !== derived.regular || current.premium !== derived.premium)
              ? " — saving will bring it in line with the parts."
              : "."}
          </p>
        </>
      )}
    </div>
  );
}
