import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/db";

/**
 * The admin console shell (`fitment-engine` §8.1).
 *
 * WHY A ROUTE GROUP AND NOT `src/app/admin/layout.tsx`
 *
 * `(console)` contributes nothing to the URL: these pages are `/admin`,
 * `/admin/vehicles`, `/admin/layouts/[id]` and nothing more. The folder exists so
 * the console's shell is organisational — one place that owns the nav, the sign-out
 * note and the noindex policy, rather than five — and so the group can be moved or
 * renamed later without touching a single URL or breaking a link somebody wrote
 * down. The route-groups doc is explicit that the parentheses are not part of the
 * path, and that two groups must not resolve to the same URL: `(console)/page.tsx`
 * therefore REPLACES `src/app/admin/page.tsx` rather than sitting beside it.
 *
 * NO `'use client'` ANYWHERE IN THIS CONSOLE
 *
 * Not an accident and not laziness. There is no `useActionState`, no client-side
 * validation and no optimistic UI, so the server is the only implementation of the
 * evidence gate and there is no second code path that only runs when JavaScript
 * does. It also means every refusal renders as the same HTML whether the browser
 * has script or not, which is what makes the confirm form verifiable at all.
 *
 * THE COST, STATED PLAINLY: no active-link highlighting, because knowing the current
 * route in a Server Component means reading the pathname from the client. The nav
 * is short enough that not knowing which one is current costs very little.
 *
 * WHY THE SIGN-OUT IS A PARAGRAPH AND NOT A BUTTON
 *
 * There is no logout route, and inventing one would mean inventing a session to
 * end. Authentication is HTTP Basic Auth (`src/proxy.ts`): the browser caches the
 * credential until it closes. Saying so is the honest answer; a "Sign out" button
 * that did nothing would be a lie with a button on it.
 */
export const metadata: Metadata = {
  title: "Admin",
  // Stated on the layout rather than per page so a screen added tomorrow is
  // unindexed by default. §7.7: the console must disclose nothing to a crawler.
  robots: { index: false, follow: false },
};

/**
 * The nav. Six of §8's screens. Grouping (§8.4) is deliberately NOT here yet: the
 * screen cannot be built honestly until §9.3's conflict rule is settled, because
 * every one of the 212 seeded layouts is `inferred` and §9.3 as written treats
 * `inferred` as conflicting — which would refuse every possible selection. A link
 * to a screen that refuses everything is worse than no link. See
 * `fitment-engine/tasks.md` §9.3.
 */
const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/vehicles", label: "Vehicles" },
  { href: "/admin/layouts", label: "Layouts" },
  { href: "/admin/exclusions", label: "Exclusions" },
  { href: "/admin/demand", label: "Demand" },
  { href: "/admin/audit", label: "Audit" },
] as const;

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // One number in the nav, because it is the one that decides whether the console
  // is doing its job: a refused car nobody has checked yet is still a refusal.
  const confirmed = await prisma.layout.count({ where: { status: "confirmed" } });

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-6">
        <h1 className="font-display text-xl font-semibold">
          LuxeRide <span className="text-gold">admin</span>
        </h1>
        <span className="font-mono text-[11px] uppercase tracking-widest text-gold-dim">
          {confirmed} confirmed — one operator
        </span>
      </div>

      <nav className="flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted underline-offset-4 hover:text-gold hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <p className="mb-8 rounded-xl border border-line bg-panel/60 px-4 py-3 text-xs leading-relaxed text-muted">
        <strong className="text-white/80">Signing out.</strong> There is no logout route and there
        is no session to end: this console is behind HTTP Basic Auth, so the browser holds the
        credential until it closes. To sign out, close the browser (or the private window) entirely
        — closing the tab is not enough.
      </p>

      {children}
    </div>
  );
}