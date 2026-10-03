"use client";

import Script from "next/script";
import { analyticsProviders, recordProviderFailure } from "@/lib/analytics";

/**
 * Mounts the provider scripts from the root layout (`ad-landing-and-tracking`
 * §4.2, §5.1).
 *
 * It renders NOTHING when a provider's env var is absent, so the app runs with
 * no IDs and no console noise (§4.5). A provider that fails to load is recorded
 * once and never blocks the funnel (§4.9). `strategy="afterInteractive"` is
 * Next's documented default for analytics/tag-manager scripts.
 */
export default function Analytics() {
  return (
    <>
      {analyticsProviders.flatMap((provider) =>
        provider.isConfigured()
          ? provider.scripts().map((descriptor) => (
              <Script
                key={descriptor.id}
                id={descriptor.id}
                strategy="afterInteractive"
                src={descriptor.src}
                onLoad={() => provider.onLoad?.()}
                onError={() => recordProviderFailure(provider.id)}
                {...(descriptor.html
                  ? { dangerouslySetInnerHTML: { __html: descriptor.html } }
                  : {})}
              />
            ))
          : [],
      )}
    </>
  );
}
