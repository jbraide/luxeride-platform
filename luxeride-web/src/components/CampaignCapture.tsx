"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/analytics/attribution";

/**
 * Runs the write-once attribution capture in a mount effect
 * (`ad-landing-and-tracking` §5.7).
 *
 * It reads `window.location` rather than `useSearchParams`, so it is mounted
 * OUTSIDE the Suspense-gated tracking tree — capture is never delayed by a
 * boundary resolving late. No `window` is read during server rendering.
 */
export default function CampaignCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
