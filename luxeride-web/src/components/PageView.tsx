"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageView, setDebug, track } from "@/lib/analytics";
import { resolveCampaign } from "@/data/landing";

/**
 * The page view, fired explicitly (`ad-landing-and-tracking` §5.4).
 *
 * It must be wrapped in `<Suspense>` in the root layout, because `/` is a
 * statically prerendered route and a Client Component calling
 * `useSearchParams` fails the production build without a boundary (§4.3).
 *
 * `PageView`/`page_view` fires once on first render and once on every
 * client-side route change, keyed by path + search so a re-render cannot
 * double-count. It also emits `campaign_landing_viewed` for a resolved variant
 * and `campaign_landing_fallback` for an unresolvable `?product=` (§5.5).
 */
export default function PageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fired = useRef<Set<string>>(new Set());

  // `?debug=1` turns on console logging before the first event fires (§4.8).
  useEffect(() => {
    if (searchParams.has("debug")) setDebug(true);
  }, [searchParams]);

  useEffect(() => {
    const key = `${pathname}?${searchParams.toString()}`;
    if (fired.current.has(key)) return;
    fired.current.add(key);

    pageView();

    const product = searchParams.get("product");
    if (product === null || product.trim() === "") return;

    const resolved = resolveCampaign(product);
    if (resolved) {
      track("campaign_landing_viewed", {
        campaign: resolved.campaignSlug ?? resolved.productSlug,
        productSlug: resolved.productSlug,
        headline: resolved.headline.replace(/\{em\}/g, ""),
        path: pathname,
      });
    } else {
      track("campaign_landing_fallback", { value: product, param: "product", path: pathname });
    }
  }, [pathname, searchParams]);

  return null;
}
