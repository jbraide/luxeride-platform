import Link from "next/link";
import { delivery, guarantee, prepay } from "@/lib/copy";
import type { DeliveryZone } from "@/lib/delivery";

/**
 * The trust block next to the buy action (`trust-and-policies` §9.1).
 *
 * ONE component with a `variant` prop, deliberately: four surfaces quote the
 * guarantee, the delivery fee band and the prepay saving, and four separate
 * blocks are four chances to disagree. Everything it states comes from
 * `src/lib/copy.ts`, and the fee band is the min/max of the zones it is HANDED —
 * the `Location` rows the checkout charges from — so the figure here is the same
 * figure the checkout charges, and an admin fee change reaches it.
 *
 * `zones` is a prop rather than a lookup because this renders inside Client
 * Components too (the cart and the checkout), which cannot read Postgres.
 *
 * `variant="cta"` sits beside a buy action and carries the links out to
 * `/returns` and `/delivery`. `variant="summary"` sits above the checkout
 * submit button: quieter, and it states what happens next rather than repeating
 * the whole promise. It is a plain component with no client hooks, so the PDP
 * (a Server Component) can render it without pulling anything into the client
 * bundle.
 */
export function TrustStrip({
  variant = "cta",
  zones,
}: {
  variant?: "cta" | "summary";
  zones: readonly DeliveryZone[];
}) {
  if (variant === "summary") {
    return (
      <div className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-xs text-fg-muted">
        <p>
          <span aria-hidden className="mr-1 text-accent">
            🛡️
          </span>
          {guarantee}{" "}
          <Link href="/policies/returns" className="text-accent hover:underline">
            How it works
          </Link>
        </p>
        <p className="mt-1.5">
          Delivery is {delivery.range(zones)} depending on your zone. We confirm every order on WhatsApp
          before dispatch — nothing is charged now.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/60 px-4 py-3">
      <ul className="space-y-1.5 text-xs text-fg-muted">
        <li className="flex gap-2">
          <span aria-hidden className="text-accent">
            🛡️
          </span>
          <span>
            <Link href="/policies/returns" className="text-accent hover:underline">
              {guarantee}
            </Link>
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-accent">
            🚚
          </span>
          <span>
            {delivery.range(zones)} delivery depending on your zone.{" "}
            <Link href="/policies/delivery" className="text-accent hover:underline">
              See the zones
            </Link>
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="text-accent">
            💳
          </span>
          <span>{prepay.label} when you prepay by bank transfer — or pay the rider on delivery.</span>
        </li>
      </ul>
    </div>
  );
}