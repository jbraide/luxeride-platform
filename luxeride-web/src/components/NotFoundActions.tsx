"use client";

import { usePathname } from "next/navigation";
import { brokenLinkMessage, siteErrorMessage, whatsappLink } from "@/lib/whatsapp";

/**
 * The client half of the error pages.
 *
 * `src/app/not-found.tsx` cannot receive props, so the path the visitor tried
 * has to be read on the client. Rendering the link as a plain `<a>` means it
 * works before hydration — the one action on a 404 that must never fail is the
 * escape to a human.
 */
export default function NotFoundActions({ kind = "missing" }: { kind?: "missing" | "error" }) {
  const pathname = usePathname();
  const message = kind === "error" ? siteErrorMessage(pathname) : brokenLinkMessage(pathname);

  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noreferrer"
      className="block w-full rounded-xl border border-border bg-surface px-5 py-3 text-center text-sm font-semibold text-accent hover:border-accent"
    >
      Ask us on WhatsApp
    </a>
  );
}
